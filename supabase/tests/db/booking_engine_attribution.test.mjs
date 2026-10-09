// FIX-BOOKING item 3 (D-02 / C-D8): bookings.source is derived on the server. A provider-sourced channel (0% platform fee) needs a live
// share token of that provider, or an imported client of that provider; everything the caller merely claims is marketplace.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, firstSlot, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let svc;
let date;
let admin;
let employee;
let other;
let importedCustomer;
const customer = ROLES.user(SEED.customer);
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);

const book = async (user, { source = "marketplace", token = null, offset = 0 } = {}) => {
  const rows = await as(db, user, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 offset $4 limit 1`,
    [SEED.employee1, date, svc.duration, offset]);
  return as(db, user,
    `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3,
       request_source => $4, request_source_token => $5)`,
    [SEED.employee1, svc.id, rows[0].slot_start, source, token]).then((r) => r[0]);
};
const cancel = (user, b) => as(db, user, `select cancel_booking($1, 'test cleanup')`, [b.id]);
const issue = (user, source = "qr", label = "test", provider = SEED.provider1, expires = null) =>
  as(db, user, `select create_provider_share_token($1, $2, $3, $4) t`, [provider, source, label, expires]).then((r) => r[0].t);

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  date = await nextWorkingDate(db, SEED.employee1);
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  other = ROLES.user(await createUser(db));
  employee = ROLES.user(await createUser(db, { role: "provider_employee" }));
  await sys(db, `update employees set profile_id = $1 where id = $2`, [employee.sub, SEED.employee1]);
  importedCustomer = ROLES.user(await createUser(db, { phone: "+966500000777", verified: true }));
});

describe("booking source attribution (D-02 / C-D8)", () => {
  it("reproduction: claiming a provider channel without a token no longer zeroes the platform fee", async () => {
    for (const claimed of ["link", "qr", "whatsapp", "instagram", "import", "walk_in", "LINK", "nonsense"]) {
      const b = await book(customer, { source: claimed });
      assert.equal(b.source, "marketplace", `claimed ${claimed}`);
      assert.ok(Number(b.platform_commission) > 0, `claimed ${claimed} must pay the marketplace fee`);
      assert.equal(b.source_token_id, null);
      await cancel(customer, b);
    }
  });

  it("grants the token's channel, ignores the claimed one, and records which token was used", async () => {
    const t = await issue(owner1, "qr", "front desk poster");
    assert.equal(t.success, true);
    assert.equal(t.source, "qr");
    assert.match(t.token, /^[0-9a-f]{64}$/);
    const b = await book(customer, { source: "whatsapp", token: t.token });
    assert.equal(b.source, "qr");
    assert.equal(Number(b.platform_commission), 0);
    assert.equal(b.source_token_id, t.id);
    await cancel(customer, b);
  });

  it("works the same through create_multi_service_booking", async () => {
    const t = await issue(owner1, "instagram");
    const svc2 = await serviceFor(db, SEED.employee1, 1);
    const slot = await firstSlot(db, customer, SEED.employee1, date, Number(svc.duration) + Number(svc2.duration));
    const call = (token) => as(db, customer,
      `select create_multi_service_booking(target_branch_id => $1, target_employee_id => $2, target_scheduled_at => $3,
         services_payload => $4::jsonb, request_source => 'link', request_source_token => $5) r`,
      [SEED.branch1, SEED.employee1, slot, JSON.stringify([{ service_id: svc.id }, { service_id: svc2.id }]), token]).then((r) => r[0].r);
    const free = await call(t.token);
    const row = (await sys(db, `select source, platform_commission from bookings where id = $1`, [free.booking_id]))[0];
    assert.equal(row.source, "instagram");
    assert.equal(Number(row.platform_commission), 0);
    await cancel(customer, { id: free.booking_id });
    const paid = await call("not-a-token");
    assert.equal((await sys(db, `select source from bookings where id = $1`, [paid.booking_id]))[0].source, "marketplace");
    await cancel(customer, { id: paid.booking_id });
  });

  it("another provider's token grants nothing", async () => {
    const foreign = await issue(owner2, "link", "theirs", SEED.provider2);
    const b = await book(customer, { token: foreign.token });
    assert.equal(b.source, "marketplace");
    assert.ok(Number(b.platform_commission) > 0);
    await cancel(customer, b);
  });

  it("a revoked token grants nothing and revoking is idempotent", async () => {
    const t = await issue(owner1, "link");
    await expectError(as(db, owner1, `select revoke_provider_share_token($1, 'x')`, [t.id]), /at least 3 characters/);
    const r1 = (await as(db, owner1, `select revoke_provider_share_token($1, 'poster was posted publicly') r`, [t.id]))[0].r;
    assert.equal(r1.already_revoked, false);
    const r2 = (await as(db, owner1, `select revoke_provider_share_token($1, 'again') r`, [t.id]))[0].r;
    assert.equal(r2.already_revoked, true);
    const b = await book(customer, { token: t.token });
    assert.equal(b.source, "marketplace");
    await cancel(customer, b);
    const audit = await sys(db, `select action from admin_audit_logs where target_id = $1 and action like 'provider.share_token_%' order by created_at`, [t.id]);
    assert.deepEqual(audit.map((a) => a.action), ["provider.share_token_created", "provider.share_token_revoked"]);
  });

  it("an expired token grants nothing", async () => {
    const t = await issue(owner1, "link", "short", SEED.provider1, new Date(Date.now() + 3600_000).toISOString());
    await sys(db, `update provider_share_tokens set expires_at = now() - interval '1 minute' where id = $1`, [t.id]);
    const b = await book(customer, { token: t.token });
    assert.equal(b.source, "marketplace");
    await cancel(customer, b);
  });

  it("'import' is accepted only for a client the provider imported", async () => {
    // not on the list yet: marketplace
    let b = await book(importedCustomer, { source: "import" });
    assert.equal(b.source, "marketplace");
    await cancel(importedCustomer, b);
    // on another provider's list: still marketplace
    await sys(db, `insert into provider_client_contacts (provider_id, full_name, phone, consent_confirmed_at) values ($1, 'Imported', '+966500000777', now())`, [SEED.provider2]);
    b = await book(importedCustomer, { source: "import" });
    assert.equal(b.source, "marketplace");
    await cancel(importedCustomer, b);
    // on this provider's list through the import command, but the import is not reviewed yet (FIX-MONEY M-10): marketplace
    const imp = (await as(db, owner1, `select import_provider_clients($1, '[{"name":"Imported","phone":"+966500000777"}]'::jsonb, true) r`, [SEED.provider1]))[0].r;
    b = await book(importedCustomer, { source: "import" });
    assert.equal(b.source, "marketplace");
    await cancel(importedCustomer, b);
    // reviewed by an administrator, matched by the verified phone number
    const reviewer = ROLES.user(await createUser(db, { role: "admin" }));
    await as(db, reviewer, `select admin_review_client_import($1, 'checked the consent evidence')`, [imp.import_id]);
    b = await book(importedCustomer, { source: "import" });
    assert.equal(b.source, "import");
    assert.equal(Number(b.platform_commission), 0);
    await cancel(importedCustomer, b);
    // an unverified phone does not match
    await sys(db, `update provider_client_contacts set matched_profile_id = null where provider_id = $1 and phone = '+966500000777'`, [SEED.provider1]); // match by phone only
    await sys(db, `update profiles set phone_verified = false where id = $1`, [importedCustomer.sub]);
    b = await book(importedCustomer, { source: "import" });
    assert.equal(b.source, "marketplace");
    await cancel(importedCustomer, b);
  });

  it("only the owning provider (or an administrator) issues and revokes tokens", async () => {
    const t = await issue(owner1, "link", "owned");
    for (const [who, user] of [["customer", customer], ["other customer", other], ["other provider's owner", owner2], ["employee", employee]]) {
      await expectError(as(db, user, `select create_provider_share_token($1, 'link', 'x')`, [SEED.provider1]), /not found/i);
      await expectError(as(db, user, `select revoke_provider_share_token($1, 'not mine')`, [t.id]), /not found/i);
      assert.ok(who);
    }
    await expectError(as(db, ROLES.anon, `select create_provider_share_token($1, 'link', 'x')`, [SEED.provider1]), /permission denied/);
    await expectError(as(db, ROLES.anon, `select revoke_provider_share_token($1, 'x')`, [t.id]), /permission denied/);
    const adminToken = await issue(admin, "whatsapp", "issued by support");
    assert.equal(adminToken.provider_id, SEED.provider1);
    await as(db, admin, `select revoke_provider_share_token($1, 'support request')`, [adminToken.id]);
    // the service role is not a user: the command needs an authenticated caller
    await expectError(as(db, ROLES.service, `select create_provider_share_token($1, 'link', 'x')`, [SEED.provider1]), /Authentication required|not found/);
  });

  it("validates input", async () => {
    await expectError(as(db, owner1, `select create_provider_share_token($1, 'marketplace', 'x')`, [SEED.provider1]), /channel must be/);
    await expectError(as(db, owner1, `select create_provider_share_token($1, 'import', 'x')`, [SEED.provider1]), /channel must be/);
    await expectError(as(db, owner1, `select create_provider_share_token($1, 'link', $2)`, [SEED.provider1, "x".repeat(81)]), /80 characters/);
    await expectError(as(db, owner1, `select create_provider_share_token($1, 'link', 'x', now() - interval '1 day')`, [SEED.provider1]), /in the future/);
  });

  it("caps live tokens per provider", async () => {
    const live = (await sys(db, `select count(*)::int n from provider_share_tokens where provider_id = $1 and revoked_at is null`, [SEED.provider1]))[0].n;
    for (let i = live; i < 50; i += 1) await issue(owner1, "link", `bulk ${i}`);
    await expectError(issue(owner1, "link", "one too many"), /At most 50/);
  });

  it("row-level security: only the owner and administrators read tokens, nobody writes directly", async () => {
    const mine = await as(db, owner1, `select count(*)::int n from provider_share_tokens`);
    assert.ok(mine[0].n > 0);
    assert.equal((await as(db, owner2, `select count(*)::int n from provider_share_tokens where provider_id = $1`, [SEED.provider1]))[0].n, 0);
    assert.equal((await as(db, customer, `select count(*)::int n from provider_share_tokens`))[0].n, 0);
    assert.equal((await as(db, employee, `select count(*)::int n from provider_share_tokens`))[0].n, 0);
    assert.ok((await as(db, admin, `select count(*)::int n from provider_share_tokens`))[0].n >= mine[0].n);
    await expectError(as(db, ROLES.anon, `select count(*) from provider_share_tokens`), /permission denied/);
    for (const user of [owner1, customer, admin]) {
      await expectError(as(db, user, `insert into provider_share_tokens (provider_id, source) values ($1, 'link')`, [SEED.provider1]), /permission denied|row-level security/);
      await expectError(as(db, user, `update provider_share_tokens set revoked_at = null`), /permission denied|row-level security/);
      await expectError(as(db, user, `delete from provider_share_tokens`), /permission denied|row-level security/);
    }
  });

  it("keeps one version of each function and the privileges of the old ones", async () => {
    const rows = await sys(db, `select proname, count(*)::int n,
        bool_and(has_function_privilege('authenticated', oid, 'EXECUTE')) auth, bool_or(has_function_privilege('anon', oid, 'EXECUTE')) anon
      from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('create_booking','create_multi_service_booking','booking_create_internal','resolve_booking_source',
                        'create_provider_share_token','revoke_provider_share_token') group by 1`);
    const by = Object.fromEntries(rows.map((r) => [r.proname, r]));
    for (const r of rows) assert.equal(r.n, 1, `${r.proname} overloads`);
    for (const name of ["create_booking", "create_multi_service_booking", "create_provider_share_token", "revoke_provider_share_token"]) {
      assert.equal(by[name].auth, true, name);
      assert.equal(by[name].anon, false, name);
    }
    for (const name of ["booking_create_internal", "resolve_booking_source"]) {
      assert.equal(by[name].auth, false, `${name} is internal`);
      assert.equal(by[name].anon, false, name);
    }
  });
});
