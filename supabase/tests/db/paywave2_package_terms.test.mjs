// PAY-WAVE2, red team RT-M3 (docs/reviews/2026-10-17-redteam-whole-stack.md): package terms are frozen at purchase, and only an
// active, verified provider sells packages or memberships.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let svcA;
let svcB;
let seq = 0;
const customer = ROLES.user(SEED.customer);
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const money = (n) => Math.round(Number(n) * 100) / 100;

before(async () => {
  db = await createMigratedDb();
  svcA = await serviceFor(db, SEED.employee1, 0);
  svcB = await serviceFor(db, SEED.employee1, 1);
});

const newPackage = async ({ provider = SEED.provider1, owner = owner1, sessions = 10, days = 30, price = 900, service = null } = {}) =>
  (await as(db, owner, `insert into packages (provider_id, name_en, name_ar, price, session_count, expires_in_days, service_id, is_active)
                        values ($1, 'Ten cuts', 'عشر قصات', $2, $3, $4, $5, true) returning id`, [provider, price, sessions, days, service]))[0].id;
const buy = (packageId, user = customer) => as(db, user, `select purchase_service_package($1) r`, [packageId]).then((r) => r[0].r);
const pay = (id, amount, intent = `chg_pw2_pkg_${(seq += 1)}_${Date.now()}`) =>
  as(db, ROLES.service, `select confirm_purchase_payment('package', $1, $2, $3) r`, [id, intent, amount]).then((r) => ({ ...r[0].r, intent }));
const userPackage = async (id) => (await sys(db, `select * from user_packages where id = $1`, [id]))[0];
// is_verified follows the status (sync_provider_status_verified): approved and active providers are verified.
const setProvider = (status, provider = SEED.provider2) =>
  sys(db, `update providers set status = $2::provider_status where id = $1`, [provider, status]);

describe("package terms are frozen at purchase", () => {
  it("the purchase records the provider, service, sessions, validity and names it was bought with", async () => {
    const pkg = await newPackage({ service: svcA.id });
    const p = await buy(pkg);
    assert.equal(p.status, "pending_payment");
    assert.equal(p.session_count, 10);
    assert.equal(p.expires_in_days, 30);
    const row = await userPackage(p.purchase_id);
    assert.deepEqual([row.provider_id, row.service_id, row.session_count, row.expires_in_days, row.package_name_en, row.package_name_ar, money(row.amount_paid)],
      [SEED.provider1, svcA.id, 10, 30, "Ten cuts", "عشر قصات", 900]);
  });

  it("once sold, the owner cannot change its sessions, validity, price or service, nor delete it; switching it off and renaming still work", async () => {
    const pkg = await newPackage();
    await buy(pkg);
    for (const change of ["session_count = 1", "expires_in_days = 1", "price = 1", `service_id = '${svcB.id}'`]) {
      await expectError(as(db, owner1, `update packages set ${change} where id = $1`, [pkg]), /has been sold/);
    }
    await expectError(as(db, owner1, `delete from packages where id = $1`, [pkg]), /has been sold/);
    await expectError(sys(db, `delete from packages where id = $1`, [pkg]), /has been sold/);
    await as(db, owner1, `update packages set is_active = false, name_en = 'Ten cuts (old)' where id = $1`, [pkg]);
    const live = (await sys(db, `select is_active, session_count, price from packages where id = $1`, [pkg]))[0];
    assert.deepEqual([live.is_active, live.session_count, money(live.price)], [false, 10, 900]);
    // An unsold package can still be edited or deleted by its owner.
    const fresh = await newPackage();
    await as(db, owner1, `update packages set session_count = 6 where id = $1`, [fresh]);
    await as(db, owner1, `delete from packages where id = $1`, [fresh]);
  });

  it("payment gives exactly the bought sessions and validity, even if the package row was changed behind the guard (bait and switch)", async () => {
    const pkg = await newPackage({ sessions: 10, days: 30 });
    const p = await buy(pkg);
    await sys(db, `alter table packages disable trigger trg_packages_freeze_sold_terms`);
    await sys(db, `update packages set session_count = 1, expires_in_days = 1 where id = $1`, [pkg]);
    await sys(db, `alter table packages enable trigger trg_packages_freeze_sold_terms`);
    const paid = await pay(p.purchase_id, 900);
    assert.equal(paid.status, "activated");
    const row = await userPackage(p.purchase_id);
    assert.equal(row.remaining_sessions, 10);
    const days = (new Date(row.expires_at).getTime() - new Date(row.paid_at).getTime()) / 86400000;
    assert.ok(Math.abs(days - 30) < 0.01, `validity ${days} days`);
    const ledger = (await sys(db, `select provider_id, entry_type from transactional_ledger where payment_intent_id = $1`, [paid.intent]))[0];
    assert.deepEqual([ledger.provider_id, ledger.entry_type], [SEED.provider1, "package_sale"]);
  });

  it("the bought terms never change afterwards, for any writer", async () => {
    const p = await buy(await newPackage());
    for (const change of ["session_count = 50", "expires_in_days = 999", "amount_paid = 1", `provider_id = '${SEED.provider2}'`, "package_name_en = 'x'"]) {
      await expectError(sys(db, `update user_packages set ${change} where id = $1`, [p.purchase_id]), /never change/);
    }
    await expectError(as(db, customer, `update user_packages set session_count = 50 where id = $1`, [p.purchase_id]), /permission denied/);
    await expectError(as(db, owner1, `update user_packages set session_count = 50 where id = $1`, [p.purchase_id]), /permission denied/);
  });

  it("a session is redeemed against the bought service, not the package's current one", async () => {
    const pkg = await newPackage({ service: svcA.id });
    const p = await buy(pkg);
    await pay(p.purchase_id, 900);
    await sys(db, `alter table packages disable trigger trg_packages_freeze_sold_terms`);
    await sys(db, `update packages set service_id = $2 where id = $1`, [pkg, svcB.id]);
    await sys(db, `alter table packages enable trigger trg_packages_freeze_sold_terms`);
    const row = await userPackage(p.purchase_id);
    assert.equal(row.service_id, svcA.id);
    const r = (await as(db, owner1, `select redeem_package_session($1) r`, [p.purchase_id]))[0].r;
    assert.equal(r.remaining_sessions, 9);
    await expectError(as(db, owner2, `select redeem_package_session($1)`, [p.purchase_id]), /Only the provider's staff/);
  });
});

describe("only an active, verified provider sells", () => {
  it("a suspended or unverified provider's packages are hidden and cannot be bought", async () => {
    const pkg = await newPackage({ provider: SEED.provider2, owner: owner2 });
    assert.equal((await as(db, ROLES.anon, `select id from packages where id = $1`, [pkg])).length, 1);
    for (const status of ["suspended", "pending", "approved", "rejected"]) {
      await setProvider(status);
      assert.equal((await as(db, ROLES.anon, `select id from packages where id = $1`, [pkg])).length, 0, `${status} hidden from visitors`);
      assert.equal((await as(db, customer, `select id from packages where id = $1`, [pkg])).length, 0, `${status} hidden from customers`);
      assert.equal((await as(db, owner2, `select id from packages where id = $1`, [pkg])).length, 1, "the owner still sees it");
      await expectError(buy(pkg), /Package not found or inactive/);
    }
    await setProvider("active");
    assert.equal((await as(db, customer, `select id from packages where id = $1`, [pkg])).length, 1);
  });

  it("a payment that arrives after the provider stopped selling is recorded, the purchase cancelled and the money queued for refund", async () => {
    await setProvider("active");
    const pkg = await newPackage({ provider: SEED.provider2, owner: owner2 });
    const p = await buy(pkg);
    await setProvider("suspended");
    const paid = await pay(p.purchase_id, 900);
    assert.equal(paid.status, "refund_required");
    assert.equal(paid.conflict, true);
    assert.equal((await userPackage(p.purchase_id)).status, "cancelled");
    const ledger = (await sys(db, `select payout_status, provider_share from transactional_ledger where payment_intent_id = $1`, [paid.intent]))[0];
    assert.equal(ledger.payout_status, "refund_pending");
    const refund = (await sys(db, `select amount, source, status from refund_requests where idempotency_key = $1`, [`late:${paid.intent}`]))[0];
    assert.deepEqual([money(refund.amount), refund.source, refund.status], [900, "late_payment_conflict", "pending"]);
    assert.equal(Number((await sys(db, `select provider_available_balance($1) v`, [SEED.provider2]))[0].v) >= 0, true);
    await setProvider("active");
  });

  it("memberships: a plan of a provider that is not active is not on sale, and a late payment after suspension is refunded", async () => {
    await setProvider("active");
    const plan = (await as(db, owner2, `select provider_create_membership_plan($1, 'Gold', 'ذهبي', null, null, 1200, 365, 12, true, '{}'::uuid[]) r`, [SEED.provider2]))[0].r.plan_id;
    await as(db, owner2, `select provider_set_membership_plan_active($1, true)`, [plan]);
    for (const status of ["approved", "suspended"]) {
      await setProvider(status);
      await expectError(as(db, customer, `select purchase_membership($1, $2)`, [plan, `pw2-mem-${status}-${Date.now()}`]), /not found or not on sale/);
    }
    await setProvider("active");
    const m = (await as(db, customer, `select purchase_membership($1, $2) r`, [plan, `pw2-mem-late-${Date.now()}`]))[0].r;
    await setProvider("suspended");
    const intent = `chg_pw2_mem_late_${Date.now()}`;
    const r = (await as(db, ROLES.service, `select confirm_membership_payment($1, $2, 1200) r`, [m.membership_id, intent]))[0].r;
    assert.equal(r.status, "refund_required");
    const row = (await sys(db, `select status, visits_remaining from memberships where id = $1`, [m.membership_id]))[0];
    assert.deepEqual([row.status, row.visits_remaining], ["cancelled", 0]);
    assert.equal((await sys(db, `select count(*)::int n from refund_requests where idempotency_key = $1`, [`late:${intent}`]))[0].n, 1);
    await setProvider("active");
  });
});
