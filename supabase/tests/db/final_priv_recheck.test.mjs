import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// FINAL: the items docs/reviews/2026-10-11-security-priv-recheck.md left open (M3/N2, M5/N1, N3, N4, N5, N6, N7, N8 and the hold
// renewal note). Every rule has its refusal next to the permitted case.
let db;
let svc;
let owner;
let owner2;
let owner3;
let operations;
let seq = 0;

const nowS = () => Math.floor(Date.now() / 1000);
const otp = (id, age = 10) => ROLES.user(id, { aal: "aal1", amr: [{ method: "otp", timestamp: nowS() - age }] });
const stale = (id) => ROLES.user(id, { amr: [{ method: "totp", timestamp: nowS() - 900 }, { method: "password", timestamp: nowS() - 900 }] });
const call = (user, sql, params = []) => as(db, user, sql, params).then((r) => r[0]?.r);
const one = async (sql, params = []) => (await sys(db, sql, params))[0];
const count = async (table, where = "true", params = []) => (await one(`select count(*)::int n from ${table} where ${where}`, params)).n;

async function customer() {
  const id = await createUser(db);
  await sys(db, `update profiles set first_name = 'Sara', last_name = 'Ahmed', email = $2 where id = $1`, [id, `c${id.slice(-4)}@test.local`]);
  return id;
}
async function booking(customerId, status = "completed", daysAgo = 10) {
  seq += 1;
  return (await one(
    `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price,
       tax_amount, deposit_required, platform_commission, source, is_first_visit, home_address_text)
     values ($1, $2, $3, $4, $5::booking_status, now() - make_interval(days => $6::int, mins => $7::int), 30, 100, 100, 15, 0, 0, 'marketplace', false, 'Street 1')
     returning id`, [customerId, SEED.branch1, SEED.employee1, svc.id, status, daysAgo, seq * 40])).id;
}
const ledger = (b, charge) => sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share)
                                       values ($1, $2, 'booking_payment', $3, 115, 15, 100)`, [b, SEED.provider1, charge]);
const submit = (user, type, options = {}, details = "Please act on my data") =>
  call(user, `select privacy_submit_request($1, $2, $3::jsonb) r`, [type, details, JSON.stringify(options)]);
const propose = (user, id) => call(user, `select admin_privacy_propose_execution($1, 'Identity verified in app; scope checked') r`, [id]);
const decide = (user, approval, decision = "approve") => call(user, `select admin_decide_approval($1, $2, 'Second person checked it') r`, [approval, decision]);
// An approved deletion of the customer's account (operations proposes, owner2 approves).
async function erase(id) {
  const r = await submit(otp(id), "deletion", { review_choice: "delete_text" });
  const out = await decide(owner2, (await propose(operations, r.id)).approval_id);
  return { request: r, out };
}

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  await sys(db, `update providers set vat_number = '310123456700003' where id = $1`, [SEED.provider1]);
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  owner2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  owner3 = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
});

describe("M3 / N2: a booking with any money record is pseudonymised, never deleted", () => {
  it("keeps a tip, a coupon, a gift-card and a wallet-credit redemption on a cancelled booking with no ledger row", async () => {
    const id = await customer();
    const tipped = await booking(id, "cancelled", 3);
    const couponed = await booking(id, "cancelled", 4);
    const gifted = await booking(id, "cancelled", 5);
    const credited = await booking(id, "cancelled", 6);
    const plain = await booking(id, "cancelled", 7);
    await sys(db, `insert into booking_tips (booking_id, customer_id, employee_id, provider_id, amount) values ($1, $2, $3, $4, 20)`,
      [tipped, id, SEED.employee1, SEED.provider1]);
    const code = (await one(`insert into promotional_codes (code, discount_type, discount_value) values ($1, 'flat', 10) returning id`, [`FINAL${seq}`])).id;
    await sys(db, `insert into coupon_redemptions (coupon_id, customer_id, booking_id, discount_amount, funding_source) values ($1, $2, $3, 10, 'platform')`,
      [code, id, couponed]);
    const card = (await one(`insert into gift_cards (code, purchaser_id, recipient_name, recipient_phone, original_amount, remaining_balance)
                             values ($1, $2, 'Noura', '+966500009911', 100, 70) returning id`, [`GC-FINAL-${seq}`, id])).id;
    await sys(db, `insert into gift_card_redemptions (gift_card_id, customer_id, booking_id, amount) values ($1, $2, $3, 30)`, [card, id, gifted]);
    const credit = (await one(`insert into wallet_credits (customer_id, amount, reason, source) values ($1, 25, 'Goodwill', 'compensation') returning id`, [id])).id;
    await sys(db, `insert into wallet_credit_redemptions (wallet_credit_id, booking_id, customer_id, amount) values ($1, $2, $3, 25)`, [credit, credited, id]);

    const preview = await call(otp(id), `select privacy_deletion_preview() r`);
    assert.equal(Number(preview.bookings_to_pseudonymise), 4, "the four bookings with a money record are kept");
    assert.equal(Number(preview.bookings_to_delete), 1);
    const { out } = await erase(id);
    assert.equal(out.result.summary.deleted.bookings_deleted, 1, "the review's reproduction deleted the tipped booking");
    assert.equal(out.result.summary.deleted.bookings_pseudonymised, 4);
    for (const b of [tipped, couponed, gifted, credited]) {
      const row = await one(`select customer_id, pseudonym_token, retention_until from bookings where id = $1`, [b]);
      assert.ok(row, "the booking is kept");
      assert.equal(row.customer_id, null);
      assert.match(row.pseudonym_token, /^[0-9a-f]{32}$/);
      assert.ok(row.retention_until);
    }
    assert.equal(await count("bookings", "id = $1", [plain]), 0, "a booking with no record of any kind is still deleted");
    assert.equal(await count("booking_tips", "booking_id = $1 and customer_id is null and amount = 20", [tipped]), 1);
    assert.equal(await count("coupon_redemptions", "booking_id = $1 and customer_id is null", [couponed]), 1);
    assert.equal(await count("gift_card_redemptions", "booking_id = $1 and customer_id is null", [gifted]), 1);
    assert.equal(await count("wallet_credit_redemptions", "booking_id = $1 and customer_id is null", [credited]), 1);
  });

  it("refuses to delete a booking that carries a money record by any path, and never cascades the record away", async () => {
    const id = await customer();
    const b = await booking(id, "cancelled", 3);
    await sys(db, `insert into booking_tips (booking_id, customer_id, employee_id, provider_id, amount) values ($1, $2, $3, $4, 15)`,
      [b, id, SEED.employee1, SEED.provider1]);
    await expectError(sys(db, `delete from bookings where id = $1`, [b]), /violates foreign key constraint|booking_tips/);
    assert.equal(await count("booking_tips", "booking_id = $1", [b]), 1);
    const rules = await sys(db, `select c.conrelid::regclass::text t, c.confdeltype d from pg_constraint c
                                  where c.contype = 'f' and c.confrelid = 'public.bookings'::regclass
                                    and exists (select 1 from pg_trigger g where g.tgrelid = c.conrelid and g.tgname = 'trg_money_append_only')`);
    assert.ok(rules.length >= 9);
    assert.deepEqual(rules.filter((r) => r.d !== "r").map((r) => r.t), [], "every money table restricts the booking's deletion");
  });
});
