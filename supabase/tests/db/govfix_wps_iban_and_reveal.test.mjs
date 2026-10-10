import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";
import { approvedDestination } from "./gov1_fixtures.mjs";

// GOV-FIX M-5 (staff salary IBAN masked, audited reveal), L-2 (strong reveal references and a hard ceiling), L-3 (an unapproved
// account is never revealed in full).
let db;
let owner;
let owner2;
let finance;
let operations;
let analyst;
const providerOwner = ROLES.user(SEED.owner1);
const otherOwner = ROLES.user(SEED.owner2);
const WPS = "SA0380000000608010167519";
const PAYOUT_IBAN = "SA4420000001234567891234";
const now = () => Math.floor(Date.now() / 1000);
const staleLogin = (user) => ROLES.user(user.sub, { aal: "aal1", amr: [{ method: "password", timestamp: now() - 3600 }] });
const staleMfa = (user) => ROLES.user(user.sub, { amr: [{ method: "totp", timestamp: now() - 900 }] });

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  owner2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
  await approvedDestination(db, SEED.provider1, PAYOUT_IBAN);
});

describe("M-5: staff salary IBAN", () => {
  it("is entered by the provider owner as before, but read back by nobody in full", async () => {
    // The provider screen inserts a new rule and updates an existing one; neither reads the full number back.
    await as(db, providerOwner, `insert into employee_commission_rules (employee_id, provider_id, base_salary_sar, commission_rate, wps_iban)
      values ($1, $2, 4000, 10, 'SA4420000001234567891234')`, [SEED.employee1, SEED.provider1]);
    await as(db, providerOwner, `update employee_commission_rules set wps_iban = $2, base_salary_sar = 4100 where employee_id = $1`, [SEED.employee1, WPS]);
    // An upsert would have to read the column (ON CONFLICT DO UPDATE needs SELECT on what it sets), so it is refused.
    await expectError(as(db, providerOwner, `insert into employee_commission_rules (employee_id, provider_id, wps_iban) values ($1, $2, $3)
      on conflict (employee_id) do update set wps_iban = excluded.wps_iban`, [SEED.employee1, SEED.provider1, WPS]), /permission denied/);
    const [own] = await as(db, providerOwner, `select wps_iban_masked from employee_commission_rules where employee_id = $1`, [SEED.employee1]);
    assert.equal(own.wps_iban_masked, "SA** **** **** **** **** 7519");
    // Report reproduction: every console role and the provider read the column in full. Now nobody does.
    for (const user of [providerOwner, owner, finance, operations, analyst]) {
      await expectError(as(db, user, `select wps_iban from employee_commission_rules`), /permission denied/);
    }
  });

  it("calculate_staff_payroll returns only the masked number", async () => {
    for (const user of [providerOwner, owner]) {
      const [row] = await as(db, user, `select calculate_staff_payroll($1, current_date - 30, current_date) r`, [SEED.provider1]);
      const entry = row.r.payroll_entries.find((e) => e.employee_id === SEED.employee1);
      assert.equal(entry.wps_iban_masked, "SA** **** **** **** **** 7519");
      assert.equal(entry.wps_iban, undefined);
      assert.ok(!JSON.stringify(row.r).includes(WPS));
    }
  });

  it("is revealed in full only through the audited function: the owner after a fresh sign-in, finance or owner with step-up and a ticket", async () => {
    const reveal = (user, reason) => as(db, user, `select reveal_employee_wps_iban($1, $2) r`, [SEED.employee1, reason]).then((rows) => rows[0].r);
    assert.equal((await reveal(providerOwner, "Bank asked to confirm")).iban, WPS);
    await expectError(reveal(staleLogin(providerOwner), "Bank asked to confirm"), /re-authentication required/);
    await expectError(reveal(otherOwner, "Bank asked to confirm"), /Only the provider owner, finance or an owner/);
    await expectError(reveal(operations, "Salary dispute ticket TCK-1042"), /Only the provider owner, finance or an owner/);
    await expectError(reveal(analyst, "Salary dispute ticket TCK-1042"), /Only the provider owner, finance or an owner/);
    await expectError(reveal(finance, "Salary dispute, no reference"), /ticket reference/);
    await expectError(reveal(staleMfa(finance), "Salary dispute ticket TCK-1042"), /step-up required/);
    assert.equal((await reveal(finance, "Salary dispute ticket TCK-1042")).iban, WPS);
    const audits = await sys(db, `select actor_id, details from admin_audit_logs where action = 'employee_wps_iban.revealed' order by created_at`);
    assert.deepEqual(audits.map((a) => a.actor_id), [SEED.owner1, finance.sub]);
    assert.ok(!JSON.stringify(await sys(db, `select details from admin_audit_logs`)).includes(WPS), "no full number in the audit log");
  });
});

describe("L-2 and L-3: provider IBAN reveal", () => {
  const reveal = (user, reason, provider = SEED.provider1) =>
    as(db, user, `select reveal_provider_iban($1, $2) r`, [provider, reason]).then((rows) => rows[0].r);

  it("refuses weak references (report reproduction) and accepts a real payout id of this provider", async () => {
    await expectError(reveal(finance, "checking deadbeef holder name"), /ticket reference/);
    await expectError(reveal(finance, "checking account AB12 holder name"), /ticket reference/);
    const [payout] = await sys(db, `insert into payout_requests (provider_id, requested_by, amount, bank_name, iban)
      values ($1, $2, 10, 'Test Bank', $3) returning id`, [SEED.provider1, SEED.owner1, PAYOUT_IBAN]);
    const shown = await reveal(finance, `Holder name check for payout ${payout.id.slice(0, 8)}`);
    assert.equal(shown.active.iban, PAYOUT_IBAN);
    await expectError(reveal(finance, `Holder name check for payout ${payout.id.slice(0, 8)}`, SEED.provider2), /ticket reference|no bank account/);
  });

  it("never shows an unapproved account in full", async () => {
    await as(db, providerOwner, `select provider_request_payout_destination($1, 'SNB', 'Elite Grooming Lounge LLC', 'SA5510000000123456789012')`, [SEED.provider1]);
    const shown = await reveal(finance, "Checking the pending change PAY-2001");
    assert.equal(shown.pending.approved, false);
    assert.equal(shown.pending.iban_masked, "SA** **** **** **** **** 9012");
    assert.equal(shown.pending.iban, undefined);
    assert.ok(!JSON.stringify(shown).includes("SA5510000000123456789012"));
    assert.equal(shown.active.approved, true);
  });

  it("stops at 20 reveals in 24 hours until a different owner allows 10 more", async () => {
    for (let i = 0; i < 20; i += 1) await reveal(owner, `Reconciliation batch #${3000 + i}`);
    const refused = await reveal(owner, "Reconciliation batch #3999");
    assert.deepEqual([refused.refused, refused.refusal, refused.active, refused.pending], [true, "reveal_limit_reached", undefined, undefined]);
    assert.match(refused.message, /most allowed/);
    const [alert] = await sys(db, `select id from security_alerts where kind = 'iban_reveal_limit_reached' and user_id = $1`, [owner.sub]);
    assert.ok(alert, "the ceiling raises an alert");
    await expectError(as(db, owner, `select admin_lift_iban_reveal_limit($1, 'I need more reveals today please')`, [owner.sub]), /Another owner/);
    await expectError(as(db, finance, `select admin_lift_iban_reveal_limit($1, 'Month-end reconciliation run')`, [owner.sub]), /Only an owner/);
    await expectError(as(db, staleMfa(owner2), `select admin_lift_iban_reveal_limit($1, 'Month-end reconciliation run')`, [owner.sub]), /step-up required/);
    const lifted = (await as(db, owner2, `select admin_lift_iban_reveal_limit($1, 'Month-end reconciliation run') r`, [owner.sub]))[0].r;
    assert.equal(lifted.ceiling, 30);
    assert.ok((await reveal(owner, "Reconciliation batch #3999")).active);
  });
});
