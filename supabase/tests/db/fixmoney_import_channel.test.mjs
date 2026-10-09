// FIX-MONEY: M-10 of docs/reviews/2026-10-08-security-money.md. The 'import' channel (0 percent commission) is not self-attested.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
let db;
let admin;

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
});

const freshCustomer = async (opts) => ROLES.user(await createUser(db, opts));
const firstSlotOf = async (user, employee, svc, date) =>
  (await as(db, user, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 limit 1`, [employee, date, svc.duration]))[0].slot_start;
const bookImport = async (user, daysAhead) => {
  const svc = await serviceFor(db, SEED.employee1);
  const date = await nextWorkingDate(db, SEED.employee1, daysAhead);
  return (await as(db, user, `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3, request_source => 'import')`,
    [SEED.employee1, svc.id, await firstSlotOf(user, SEED.employee1, svc, date)]))[0];
};

describe("M-10: the import channel", () => {
  it("a contact row the provider inserted itself is refused, and a claimed 'import' pays the normal commission", async () => {
    const phone = "+966500000555";
    const customer = await freshCustomer({ phone, verified: true });
    await assert.rejects(
      as(db, owner1, `insert into provider_client_contacts (provider_id, full_name, phone, consent_confirmed_at) values ($1, 'Lead', $2, now())`, [SEED.provider1, phone]),
      /permission denied|row-level security/i);
    // even a row that exists by some other route (here written as the system, outside the command) does not make the claim valid
    await sys(db, `insert into provider_client_contacts (provider_id, full_name, phone, consent_confirmed_at) values ($1, 'Lead', $2, now())`, [SEED.provider1, phone]);
    const b = await bookImport(customer, 4);
    assert.equal(b.source, "marketplace");
    assert.ok(Number(b.platform_commission) > 0, `commission ${b.platform_commission}`);
  });

  it("an import is trusted only after an administrator reviewed it, and the review records who, when and why", async () => {
    const phone = "+966500000556";
    const customer = await freshCustomer({ phone, verified: true });
    const imp = (await as(db, owner1, `select import_provider_clients($1, $2::jsonb, true) r`, [SEED.provider1, JSON.stringify([{ name: "Sara", phone }])]))[0].r;
    let b = await bookImport(customer, 5);
    assert.equal(b.source, "marketplace", "an unreviewed import does not make a fee-free client");
    await as(db, customer, `select cancel_booking($1, 'test')`, [b.id]);

    const reviewed = (await as(db, admin, `select admin_review_client_import($1, 'consent evidence checked') r`, [imp.import_id]))[0].r;
    assert.equal(reviewed.success, true);
    const row = (await sys(db, `select reviewed_by, reviewed_at, review_reason from provider_client_imports where id = $1`, [imp.import_id]))[0];
    assert.equal(row.reviewed_by, admin.sub);
    assert.ok(row.reviewed_at);
    assert.equal(row.review_reason, "consent evidence checked");
    assert.equal((await as(db, admin, `select admin_review_client_import($1, 'again') r`, [imp.import_id]))[0].r.already_reviewed, true);
    assert.equal((await sys(db, `select count(*)::int n from admin_audit_logs where action = 'provider.client_import_reviewed' and target_id = $1`, [imp.import_id]))[0].n, 1);

    b = await bookImport(customer, 5);
    assert.equal(b.source, "import");
    assert.equal(Number(b.platform_commission), 0);
  });

  it("a customer who already booked through the marketplace before the review is not turned into an imported client", async () => {
    const phone = "+966500000557";
    const customer = await freshCustomer({ phone, verified: true });
    const svc = await serviceFor(db, SEED.employee1);
    const date = await nextWorkingDate(db, SEED.employee1, 8);
    const early = (await as(db, customer, `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3)`,
      [SEED.employee1, svc.id, await firstSlotOf(customer, SEED.employee1, svc, date)]))[0];
    await sys(db, `update bookings set status = 'confirmed' where id = $1`, [early.id]);
    const imp = (await as(db, owner1, `select import_provider_clients($1, $2::jsonb, true) r`, [SEED.provider1, JSON.stringify([{ name: "Early", phone }])]))[0].r;
    await as(db, admin, `select admin_review_client_import($1, 'reviewed late')`, [imp.import_id]);
    const b = await bookImport(customer, 9);
    assert.equal(b.source, "marketplace");
  });

  it("only an administrator reviews; the provider keeps reading, annotating and deleting its contacts but cannot rewrite their identity", async () => {
    const imp = (await sys(db, `select id from provider_client_imports limit 1`))[0].id;
    for (const [who, user] of [["anonymous", ROLES.anon], ["customer", ROLES.user(SEED.customer)], ["owner", owner1], ["other owner", owner2]]) {
      await assert.rejects(as(db, user, `select admin_review_client_import($1, 'self approval')`, [imp]), /permission denied|Administrator access/, who);
    }
    await expectError(as(db, admin, `select admin_review_client_import($1, 'x')`, [imp]), /reason/);
    await expectError(as(db, admin, `select admin_review_client_import('00000000-0000-4000-8000-000000000009', 'unknown import')`), /not found/);
    const contact = (await as(db, owner1, `select id from provider_client_contacts limit 1`))[0];
    assert.ok(contact, "the owner still reads its contacts");
    await as(db, owner1, `update provider_client_contacts set notes = 'prefers mornings' where id = $1`, [contact.id]);
    for (const column of ["phone = '+966500009999'", "import_id = null", "consent_confirmed_at = now()", "matched_profile_id = null"]) {
      await assert.rejects(as(db, owner1, `update provider_client_contacts set ${column} where id = $1`, [contact.id]), /permission denied/, column);
    }
    assert.equal((await as(db, owner2, `select 1 from provider_client_contacts`)).length, 0, "another business reads none");
    await assert.rejects(as(db, owner1, `update provider_client_imports set reviewed_at = now() where id = $1`, [imp]), /permission denied|row-level security/i);
  });
});
