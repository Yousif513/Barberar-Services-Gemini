// PAY-WAVE2, red team RT-H2 fix 3: a customer disputes a membership or package charge; the provider is paid nothing more from the sale
// while the dispute is open, and the console resolves it with the refund approval rules.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

const customer = ROLES.user(SEED.customer);
const owner1 = ROLES.user(SEED.owner1);
const money = (n) => Math.round(Number(n) * 100) / 100;
let db;
let finance;
let finance2;
let operations;
let other;
let seq = 0;

before(async () => {
  db = await createMigratedDb();
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  finance2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  other = ROLES.user(await createUser(db));
});

const balance = async () => money((await sys(db, `select provider_available_balance($1) v`, [SEED.provider1]))[0].v);
const membership = async (price = 300) => {
  const p = (await as(db, owner1, `select provider_create_membership_plan($1, 'Silver', 'فضي', null, null, $2, 30, 3, true, '{}'::uuid[]) r`, [SEED.provider1, price]))[0].r;
  await as(db, owner1, `select provider_set_membership_plan_active($1, true)`, [p.plan_id]);
  const m = (await as(db, customer, `select purchase_membership($1, $2) r`, [p.plan_id, `pw2-dispute-${(seq += 1)}-${Date.now()}`]))[0].r;
  await as(db, ROLES.service, `select confirm_membership_payment($1, $2, $3)`, [m.membership_id, `chg_pw2_dispute_${seq}_${Date.now()}`, price]);
  return m.membership_id;
};
const pkg = async (price = 500) => {
  const id = (await as(db, owner1, `insert into packages (provider_id, name_en, name_ar, price, session_count, expires_in_days, is_active)
                                     values ($1, 'Five', 'خمس', $2, 5, 60, true) returning id`, [SEED.provider1, price]))[0].id;
  const up = (await as(db, customer, `select purchase_service_package($1) r`, [id]))[0].r;
  await as(db, ROLES.service, `select confirm_purchase_payment('package', $1, $2, $3)`, [up.purchase_id, `chg_pw2_dpkg_${(seq += 1)}_${Date.now()}`, price]);
  return up.purchase_id;
};
const open = (user, type, id, reason = "The salon refused to honour my visits", urls = []) =>
  as(db, user, `select open_purchase_dispute($1, $2, $3, $4::text[]) r`, [type, id, reason, urls]).then((r) => r[0].r);
const resolve = (user, id, resolution, notes = "Checked the salon records", amount = null) =>
  as(db, user, `select resolve_booking_dispute($1, $2, $3, $4) r`, [id, resolution, notes, amount]).then((r) => r[0].r);

describe("a customer disputes a membership or package", () => {
  it("only the buyer opens it, with a real reason and https evidence, once per purchase", async () => {
    const m = await membership();
    await expectError(open(other, "membership", m), /Purchase not found/);
    await expectError(open(owner1, "membership", m), /Purchase not found/);
    await expectError(as(db, ROLES.anon, `select open_purchase_dispute('membership', $1, 'xxxxxxxxxxxx')`, [m]), /permission denied/);
    await expectError(open(customer, "membership", m, "bad"), /10 to 2,000 characters/);
    await expectError(open(customer, "booking", m), /membership or a package/);
    await expectError(open(customer, "membership", m, undefined, ["http://evil.example/x"]), /https/);
    await expectError(open(customer, "membership", m, undefined, Array(6).fill("https://example.com/a")), /at most 5/);
    const d = await open(customer, "membership", m, undefined, ["https://example.com/receipt.png"]);
    assert.equal(d.status, "opened");
    assert.equal(money(d.disputed_amount_sar), 300);
    await expectError(open(customer, "membership", m), /already open/);
    const row = (await sys(db, `select booking_id, purchase_type, purchase_id, customer_id, provider_id, charge_id from payment_disputes where id = $1`, [d.dispute_id]))[0];
    assert.deepEqual([row.booking_id, row.purchase_type, row.purchase_id, row.customer_id, row.provider_id], [null, "membership", m, SEED.customer, SEED.provider1]);
    assert.ok(row.charge_id);
    assert.equal((await as(db, customer, `select id from payment_disputes where id = $1`, [d.dispute_id])).length, 1, "the customer sees it");
    assert.equal((await as(db, owner1, `select id from payment_disputes where id = $1`, [d.dispute_id])).length, 1, "the provider sees it");
    assert.equal((await as(db, other, `select id from payment_disputes where id = $1`, [d.dispute_id])).length, 0);
    await expectError(as(db, customer, `update payment_disputes set disputed_amount_sar = 9999 where id = $1`, [d.dispute_id]), /permission denied/);
    await expectError(sys(db, `update payment_disputes set purchase_id = null, booking_id = null where id = $1`, [d.dispute_id]), /cannot change/);
    const note = await sys(db, `select title_en from notifications where data->>'dispute_id' = $1`, [d.dispute_id]);
    assert.equal(note.length, 1, "the provider owner is told");
  });

  it("an unpaid purchase or one already fully being refunded cannot be disputed; the amount excludes refunds already on their way", async () => {
    const p = (await as(db, owner1, `select provider_create_membership_plan($1, 'Bronze', 'برونزي', null, null, 300, 30, 3, true, '{}'::uuid[]) r`, [SEED.provider1]))[0].r;
    await as(db, owner1, `select provider_set_membership_plan_active($1, true)`, [p.plan_id]);
    const unpaid = (await as(db, customer, `select purchase_membership($1, $2) r`, [p.plan_id, `pw2-unpaid-d-${Date.now()}`]))[0].r;
    await expectError(open(customer, "membership", unpaid.membership_id), /no payment/);
    const m = await membership(300);
    await as(db, customer, `select cancel_membership($1, 'stop it now')`, [m]);
    await expectError(open(customer, "membership", m), /already being refunded/);
  });

  it("while it is open the provider is paid nothing more from the sale", async () => {
    const up = await pkg(500);
    await as(db, owner1, `select redeem_package_session($1)`, [up]);
    const before = await balance();
    const d = await open(customer, "package", up, "Two sessions were never given to me");
    assert.equal(money(d.disputed_amount_sar), 500);
    assert.equal(await balance(), money(before - 100), "the earned session is held too");
    await resolve(finance, d.dispute_id, "resolved_rejected", "The sessions were given");
    assert.equal(await balance(), before);
  });
});

describe("resolving a purchase dispute", () => {
  it("needs money.refund; a refund goes through the queue and a full refund ends the membership", async () => {
    const m = await membership(300);
    const d = await open(customer, "membership", m);
    await expectError(resolve(operations, d.dispute_id, "resolved_refund"), /Only administrators can resolve disputes/);
    await expectError(resolve(customer, d.dispute_id, "resolved_refund"), /Only administrators|permission/);
    const r = await resolve(finance, d.dispute_id, "resolved_refund");
    assert.equal(r.status, "resolved_refund");
    const refund = (await sys(db, `select amount, source, purchase_type, purchase_id, booking_id from refund_requests where id = $1`, [r.refund_request_id]))[0];
    assert.deepEqual([money(refund.amount), refund.source, refund.purchase_type, refund.purchase_id, refund.booking_id], [300, "dispute", "membership", m, null]);
    assert.equal((await sys(db, `select status from memberships where id = $1`, [m]))[0].status, "cancelled");
    assert.equal((await as(db, customer, `select id from refund_requests where id = $1`, [r.refund_request_id])).length, 1);
  });

  it("a partial refund keeps the package; a refund of SAR 1,000 or more waits for a second person", async () => {
    const up = await pkg(500);
    const d = await open(customer, "package", up);
    const r = await resolve(finance, d.dispute_id, "resolved_refund", "One session was missed", 100);
    assert.equal(money((await sys(db, `select amount from refund_requests where id = $1`, [r.refund_request_id]))[0].amount), 100);
    assert.equal((await sys(db, `select status from user_packages where id = $1`, [up]))[0].status, "active");

    const big = await pkg(1500);
    const d2 = await open(customer, "package", big);
    const asked = await resolve(finance, d2.dispute_id, "resolved_refund");
    assert.equal(asked.status, "pending_approval");
    assert.equal((await sys(db, `select count(*)::int n from refund_requests where purchase_id = $1`, [big]))[0].n, 0, "nothing moves before approval");
    const done = (await as(db, finance2, `select admin_decide_approval($1, 'approve', 'Agree with the refund') r`, [asked.approval_id]))[0].r;
    assert.equal(done.status, "approved");
    assert.equal((await sys(db, `select status from user_packages where id = $1`, [big]))[0].status, "cancelled");
  });

  it("the console list names the purchase", async () => {
    const m = await membership(300);
    const d = await open(customer, "membership", m);
    const listed = (await as(db, finance, `select admin_list_disputes('opened', 200, 0, 'dispute_resolution') r`))[0].r.rows.find((x) => x.id === d.dispute_id);
    assert.equal(listed.booking, null);
    assert.deepEqual([listed.purchase.type, listed.purchase.id, listed.purchase.name_en], ["membership", m, "Silver"]);
  });
});
