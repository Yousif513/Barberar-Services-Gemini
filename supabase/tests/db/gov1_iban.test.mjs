import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";
import { approvedDestination, payableLedger } from "./gov1_fixtures.mjs";

// GOV-1 (Q3, D-Q5): IBANs masked for every client, reveal for finance/owner with step-up and a referenced reason, alert after
// more than 10 reveals in 24 hours, IBAN change by the provider after re-authentication, second-person approval, 48-hour hold.
let db;
let owner;
let finance;
let operations;
let analyst;
const providerOwner = ROLES.user(SEED.owner1);
const otherOwner = ROLES.user(SEED.owner2);
const IBAN_OLD = "SA0380000000608010167519";
const IBAN_NEW = "SA4420000001234567891234";
const now = () => Math.floor(Date.now() / 1000);
const staleLogin = (user) => ROLES.user(user.sub, { aal: "aal1", amr: [{ method: "password", timestamp: now() - 3600 }] });
const staleMfa = (user) => ROLES.user(user.sub, { amr: [{ method: "totp", timestamp: now() - 900 }] });
const denied = /permission denied|Only finance|Only the provider|access required|cannot|Not authorized/i;
const reason = "Verifying holder name for payout PAY-1042";

const reveal = (user, text = reason) => as(db, user, `select reveal_provider_iban($1, $2) r`, [SEED.provider1, text]).then((rows) => rows[0].r);
const decide = (user, id, decision = "approve") =>
  as(db, user, `select admin_decide_approval($1, $2, 'Name matches the commercial registration') r`, [id, decision]).then((rows) => rows[0].r);

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
  await approvedDestination(db, SEED.provider1, IBAN_OLD);
});

describe("masking", () => {
  it("never returns a full IBAN to a client: payout requests carry only the masked form", async () => {
    await payableLedger(db, SEED.provider1, 100);
    const made = (await as(db, providerOwner, `select * from request_provider_payout($1, 20, null, null)`, [SEED.provider1]))[0];
    assert.equal(made.iban, "SA** **** **** **** **** 7519", "the command answers with the masked IBAN");
    for (const user of [owner, finance, providerOwner]) {
      await expectError(as(db, user, `select iban from payout_requests limit 1`), /permission denied/);
    }
    const [own] = await as(db, providerOwner, `select iban_masked, destination_id from payout_requests where id = $1`, [made.id]);
    assert.equal(own.iban_masked, "SA** **** **** **** **** 7519");
    assert.ok(own.destination_id, "the request names the approved account");
    // GOV-2 (Q4): console sessions read payout requests through the audited list, which carries only the masked form.
    for (const user of [owner, finance]) {
      const list = (await as(db, user, `select admin_list_payout_requests(null, $1, 50, 0, null) r`, [SEED.provider1]))[0].r;
      const row = list.rows.find((item) => item.id === made.id);
      assert.equal(row.iban_masked, "SA** **** **** **** **** 7519");
      assert.ok(!JSON.stringify(list).includes(IBAN_OLD));
    }
    for (const user of [owner, finance, providerOwner, ROLES.user(SEED.customer)]) {
      await expectError(as(db, user, `select * from provider_payout_destinations`), /permission denied/);
    }
    const summary = (await as(db, providerOwner, `select provider_payout_destination_summary($1) r`, [SEED.provider1]))[0].r;
    assert.equal(summary.active.iban_masked, "SA** **** **** **** **** 7519");
    assert.ok(!JSON.stringify(summary).includes(IBAN_OLD));
    await expectError(as(db, otherOwner, `select provider_payout_destination_summary($1)`, [SEED.provider1]), denied);
  });
});

describe("reveal_provider_iban", () => {
  it("is for finance and owner only, with step-up and a referenced reason of 15 characters or more", async () => {
    await expectError(reveal(operations), denied);
    await expectError(reveal(analyst), denied);
    await expectError(reveal(providerOwner), denied);
    await expectError(reveal(finance, "PAY-1"), /at least 15/);
    await expectError(reveal(finance, "Checking the holder name now"), /reference/);
    await expectError(reveal(staleMfa(finance)), /step-up required/);
    const shown = await reveal(finance);
    assert.equal(shown.active.iban, IBAN_OLD);
    assert.ok(new Date(shown.expires_at).getTime() - Date.now() <= 61000);
    const [audit] = await sys(db, `select actor_id, details from admin_audit_logs where action = 'iban.revealed' order by created_at desc limit 1`);
    assert.equal(audit.actor_id, finance.sub);
    assert.equal(audit.details.reason, reason);
    const everything = JSON.stringify(await sys(db, `select details from admin_audit_logs`));
    assert.ok(!everything.includes(IBAN_OLD) && !everything.includes(IBAN_NEW), "no IBAN anywhere in the audit log");
  });

  it("raises one alert when one person reveals more than 10 times in 24 hours", async () => {
    for (let i = 0; i < 10; i += 1) await reveal(owner, `Payout reconciliation run #${1000 + i}`);
    assert.equal((await sys(db, `select count(*)::int n from security_alerts where kind = 'iban_reveal_volume' and user_id = $1`, [owner.sub]))[0].n, 0);
    await reveal(owner, "Payout reconciliation run #2000");
    await reveal(owner, "Payout reconciliation run #2001");
    assert.equal((await sys(db, `select count(*)::int n from security_alerts where kind = 'iban_reveal_volume' and user_id = $1`, [owner.sub]))[0].n, 1);
  });
});

describe("IBAN change", () => {
  let approvalId;
  it("needs the provider's owner signed in within 10 minutes", async () => {
    const change = (user) => as(db, user, `select provider_request_payout_destination($1, 'Al Rajhi Bank', 'Elite Grooming Lounge LLC', $2) r`, [SEED.provider1, IBAN_NEW]);
    await expectError(change(otherOwner), denied);
    await expectError(change(owner), denied);
    const error = await expectError(change(staleLogin(providerOwner)), /Sign in again/);
    assert.equal(error.hint, "reauth_required");
    await expectError(as(db, providerOwner, `select provider_request_payout_destination($1, 'Bank', 'Holder Name', 'SA12')`, [SEED.provider1]), /Invalid Saudi IBAN/);
    await expectError(as(db, providerOwner, `select provider_request_payout_destination($1, 'Bank', 'Holder Name', $2)`, [SEED.provider1, IBAN_OLD]), /already the approved/);
    const summary = (await change(providerOwner))[0].r;
    assert.equal(summary.pending.iban_masked, "SA** **** **** **** **** 1234");
    approvalId = summary.pending.approval_request_id;
    assert.ok(approvalId);
    assert.ok((await sys(db, `select count(*)::int n from governance_notifications where recipient_user_id = $1 and template_key = 'payout_account_change_requested'`, [SEED.owner1]))[0].n >= 1);
    assert.equal((await sys(db, `select count(*)::int n from security_alerts where kind = 'iban_change_requested'`))[0].n, 1);
  });

  it("is approved by finance or owner only, never by break-glass, and holds payouts for 48 hours", async () => {
    await expectError(decide(operations, approvalId), denied);
    await expectError(decide(analyst, approvalId), denied);
    await expectError(as(db, owner, `select admin_break_glass_execute($1, 'Provider waiting on an urgent payout today')`, [approvalId]), /never available|own request|second administrator/);
    const done = await decide(finance, approvalId);
    assert.equal(done.status, "approved");
    const holdHours = (new Date(done.result.hold_until).getTime() - Date.now()) / 3600000;
    assert.ok(holdHours > 47.9 && holdHours <= 48, `hold of ${holdHours} hours`);
    const states = await sys(db, `select iban, status from provider_payout_destinations where provider_id = $1 order by requested_at`, [SEED.provider1]);
    assert.deepEqual(states.map((s) => s.status), ["superseded", "active"]);
    assert.ok((await sys(db, `select count(*)::int n from governance_notifications where template_key = 'payout_account_change_approved'`))[0].n >= 1);

    await payableLedger(db, SEED.provider1, 100);
    const made = (await as(db, providerOwner, `select * from request_provider_payout($1, 30, null, null)`, [SEED.provider1]))[0];
    assert.equal(made.iban, "SA** **** **** **** **** 1234", "new requests use the new account");
    await expectError(as(db, finance, `select admin_release_payout($1, 'hold-key', 'Weekly payout run', null)`, [made.id]), /on hold until/);
    await sys(db, `update provider_payout_destinations set hold_until = now() - interval '1 minute' where provider_id = $1 and status = 'active'`, [SEED.provider1]);
    const asked = (await as(db, finance, `select admin_release_payout($1, 'hold-key', 'Weekly payout run', null) r`, [made.id]))[0].r;
    assert.equal(asked.status, "pending_approval");
    assert.equal((await decide(owner, asked.approval_id)).result.status, "success");
  });

  it("refuses to release a payout to an account that was never approved, and a rejected change pays nothing", async () => {
    await expectError(as(db, finance, `select admin_release_payout($1, 'old-key', 'Weekly payout run', null)`,
      [(await sys(db, `select id from payout_requests where iban = $1 and status = 'requested' limit 1`, [IBAN_OLD]))[0].id]), /not approved/);
    const summary = (await as(db, providerOwner, `select provider_request_payout_destination($1, 'SNB', 'Elite Grooming Lounge LLC', 'SA5510000000123456789012') r`, [SEED.provider1]))[0].r;
    await decide(finance, summary.pending.approval_request_id, "reject");
    const after = (await as(db, providerOwner, `select provider_payout_destination_summary($1) r`, [SEED.provider1]))[0].r;
    assert.equal(after.pending, null);
    assert.ok(after.last_rejected_at);
    assert.equal(after.active.iban_masked, "SA** **** **** **** **** 1234");
  });

  it("turns a new IBAN typed into a payout request into an account request that waits for approval", async () => {
    await payableLedger(db, SEED.provider1, 100);
    const made = (await as(db, providerOwner, `select * from request_provider_payout($1, 10, 'Riyad Bank', 'SA6620000002345678909876')`, [SEED.provider1]))[0];
    assert.equal(made.iban, "SA** **** **** **** **** 9876");
    const summary = (await as(db, providerOwner, `select provider_payout_destination_summary($1) r`, [SEED.provider1]))[0].r;
    assert.equal(summary.pending.iban_masked, "SA** **** **** **** **** 9876");
    assert.equal(summary.active.iban_masked, "SA** **** **** **** **** 1234", "the approved account stays until the change is approved");
    await expectError(as(db, finance, `select admin_release_payout($1, 'new-key', 'Weekly payout run', null)`, [made.id]), /not approved/);
  });
});
