import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// R11 hidden reviews, R28 forged replies, C-D6 promo code enumeration, C-D10b waitlist rewriting, C-D3b integration secrets,
// C-D24 payment-method view.

let db;
let admin;
let stranger;
let strangerId;
let staff;
let manager;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);
const code = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);
const count = async (user, sql, params = []) => (await as(db, user, `select count(*)::int c from (${sql}) q`, params))[0].c;

let dayOffset = 0;
async function completedBooking(customerId = SEED.customer) {
  dayOffset += 1;
  const svc = await serviceFor(db, SEED.employee1);
  return (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
      subtotal_price, total_price, tax_amount, deposit_required, platform_commission)
    values ($1, $2, $3, $4, 'completed', now() - make_interval(days => $5), 30, 100, 100, 0, 0, 0) returning id`,
    [customerId, SEED.branch1, SEED.employee1, svc.id, 20 + dayOffset]))[0].id;
}

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  strangerId = await createUser(db, { role: "customer" });
  stranger = ROLES.user(strangerId);
  const member = async (role, permissions) => {
    const id = await createUser(db, { role: "customer" });
    await sys(db, `insert into provider_memberships (user_id, provider_id, branch_id, role, permissions) values ($1, $2, null, $3, $4::jsonb)`,
      [id, SEED.provider1, role, JSON.stringify(permissions)]);
    // A delegation belongs to registered staff: the person is an employee of the provider too (the command that grants it requires that).
    await sys(db, `insert into employees (branch_id, profile_id, name_en, name_ar) values ($1, $2, 'Delegate', 'مفوّض')`, [SEED.branch1, id]);
    return ROLES.user(id);
  };
  staff = await member("stylist", {});
  manager = await member("manager", { bookings: true });
});

describe("R11: hidden reviews are not public", () => {
  let publishedId;
  let hiddenId;
  before(async () => {
    const a = await completedBooking();
    const b = await completedBooking();
    publishedId = (await sys(db, `insert into reviews (booking_id, customer_id, provider_id, rating, comment, moderation_status) values ($1, $2, $3, 5, 'Lovely visit', 'published') returning id`, [a, SEED.customer, SEED.provider1]))[0].id;
    hiddenId = (await sys(db, `insert into reviews (booking_id, customer_id, provider_id, rating, comment, moderation_status) values ($1, $2, $3, 1, 'Abusive text', 'hidden') returning id`, [b, SEED.customer, SEED.provider1]))[0].id;
  });
  const visible = async (user, id) => (await as(db, user, `select count(*)::int c from reviews where id = $1`, [id]))[0].c;
  it("shows an anonymous visitor and a stranger only the published review", async () => {
    for (const user of [ROLES.anon, stranger, owner2]) {
      assert.equal(await visible(user, publishedId), 1);
      assert.equal(await visible(user, hiddenId), 0);
    }
  });
  it("still shows the hidden review to its author, the business's staff and administrators", async () => {
    for (const user of [customer, owner1, staff, manager, admin]) assert.equal(await visible(user, hiddenId), 1);
  });
  it("leaves the public rating summary on published reviews", async () => {
    const r = (await as(db, ROLES.anon, `select rating::float8 rating, reviews::int n from provider_rating_summaries(array[$1]::uuid[])`, [SEED.provider1]))[0];
    assert.equal(r.n, 1);
    assert.equal(r.rating, 5);
  });
});

describe("R28: a review is only what the customer wrote", () => {
  it("refuses a forged reply, moderation state or back-dated time on insert", async () => {
    const booking = await completedBooking();
    for (const extra of [
      "reply_comment, reply_created_at", "moderation_status", "moderated_by", "created_at", "provider_id",
    ]) {
      const cols = extra.split(", ");
      const sql = `insert into reviews (booking_id, customer_id, rating, comment, ${extra}) values ($1, $2, 5, 'Nice', ${cols.map((c) => ({
        reply_comment: "'Thank you - owner'", reply_created_at: "now()", moderation_status: "'published'", moderated_by: "$2",
        created_at: "now() + interval '1 year'", provider_id: "$3",
      })[c]).join(", ")})`;
      assert.equal(await code(as(db, customer, sql, extra === "provider_id" ? [booking, SEED.customer, SEED.provider2] : [booking, SEED.customer])), "42501", extra);
    }
  });
  it("accepts the legitimate review and lets the server fill in the rest", async () => {
    const booking = await completedBooking();
    await as(db, customer, `insert into reviews (booking_id, customer_id, rating, comment) values ($1, $2, 4, 'Good')`, [booking, SEED.customer]);
    const row = (await sys(db, `select provider_id, moderation_status, reply_comment, moderated_by from reviews where booking_id = $1`, [booking]))[0];
    assert.deepEqual(row, { provider_id: SEED.provider1, moderation_status: "published", reply_comment: null, moderated_by: null });
  });
  it("refuses reviewing someone else's booking and anonymous inserts", async () => {
    const booking = await completedBooking();
    assert.equal(await code(as(db, stranger, `insert into reviews (booking_id, customer_id, rating) values ($1, $2, 5)`, [booking, strangerId])), "42501");
    assert.equal(await code(as(db, ROLES.anon, `insert into reviews (booking_id, customer_id, rating) values ($1, $2, 5)`, [booking, SEED.customer])), "42501");
  });
});

describe("C-D6: promotional codes", () => {
  before(async () => {
    await sys(db, `insert into promotional_codes (code, discount_type, discount_value, is_active) values ('VIP-SECRET', 'percentage', 50, true)`);
  });
  it("cannot be listed by a stranger, a customer, a provider or anonymous visitors", async () => {
    for (const user of [stranger, customer, owner1, staff]) assert.equal(await count(user, `select code from promotional_codes`), 0);
    assert.equal(await code(as(db, ROLES.anon, `select code from promotional_codes`)), "42501");
  });
  it("is readable by an administrator, and checkout still validates a code for a customer", async () => {
    assert.equal(await count(admin, `select code from promotional_codes where code = 'VIP-SECRET'`), 1);
    const r = (await as(db, customer, `select validate_and_apply_coupon('VIP-SECRET', $1, 200) r`, [SEED.provider1]))[0].r;
    assert.ok(r, "the definer function reads the table for the customer");
  });
});

describe("C-D10b: waitlist rows change only through commands", () => {
  let entry;
  const freshEntry = async (status = "active") => (await sys(db, `insert into waitlists (customer_id, branch_id, service_id, employee_id, preferred_date, preferred_time_start, preferred_time_end, status)
    select $1, $2, s.id, $3, current_date + 5, '10:00', '12:00', $4 from (select service_id as id from employee_services where employee_id = $3 limit 1) s returning id`,
    [SEED.customer, SEED.branch1, SEED.employee1, status]))[0].id;
  before(async () => { entry = await freshEntry(); });

  it("cannot be rewritten by the customer or the owner (no UPDATE privilege)", async () => {
    assert.equal(await code(as(db, customer, `update waitlists set status = 'claimed', expires_at = now() + interval '100 years' where id = $1`, [entry])), "42501");
    assert.equal(await code(as(db, owner1, `update waitlists set customer_id = $2 where id = $1`, [entry, strangerId])), "42501");
    assert.equal(await code(as(db, customer, `delete from waitlists where id = $1`, [entry])), "42501");
    assert.deepEqual((await sys(db, `select status, customer_id from waitlists where id = $1`, [entry]))[0], { status: "active", customer_id: SEED.customer });
  });
  it("is cancelled by cancel_waitlist_entry for the customer, and refuses everyone who has no part in it", async () => {
    for (const user of [stranger, owner2, staff]) assert.equal(await code(as(db, user, `select cancel_waitlist_entry($1)`, [entry])), "P0002");
    assert.equal(await code(as(db, ROLES.anon, `select cancel_waitlist_entry($1)`, [entry])), "42501");
    assert.equal(await code(as(db, ROLES.service, `select cancel_waitlist_entry($1)`, [entry])), "28000");
    assert.equal(await code(as(db, customer, `select cancel_waitlist_entry('99999999-9999-4999-8999-999999999999')`)), "P0002");
    const first = (await as(db, customer, `select cancel_waitlist_entry($1) r`, [entry]))[0].r;
    assert.equal(first.changed, true);
    const again = (await as(db, customer, `select cancel_waitlist_entry($1) r`, [entry]))[0].r;
    assert.equal(again.changed, false, "a repeat changes nothing");
    assert.equal((await sys(db, `select count(*)::int c from admin_audit_logs where action = 'waitlist.cancelled' and target_id = $1`, [entry]))[0].c, 1);
  });
  it("lets the owner and a delegate holding the bookings permission cancel an entry of their branch, and an administrator with a reason", async () => {
    const a = await freshEntry();
    assert.equal((await as(db, owner1, `select cancel_waitlist_entry($1, 'Fully booked') r`, [a]))[0].r.changed, true);
    const b = await freshEntry("notified");
    assert.equal((await as(db, manager, `select cancel_waitlist_entry($1) r`, [b]))[0].r.changed, true);
    const c = await freshEntry();
    assert.equal(await code(as(db, admin, `select cancel_waitlist_entry($1)`, [c])), "22023");
    assert.equal((await as(db, admin, `select cancel_waitlist_entry($1, 'Customer asked support') r`, [c]))[0].r.changed, true);
    const by = (await sys(db, `select details->>'by' b from admin_audit_logs where action = 'waitlist.cancelled' and target_id = $1`, [c]))[0].b;
    assert.equal(by, "admin");
  });
  it("refuses to cancel an entry that was already claimed or expired", async () => {
    for (const status of ["claimed", "expired"]) {
      const id = await freshEntry(status);
      assert.equal(await code(as(db, customer, `select cancel_waitlist_entry($1)`, [id])), "22023", status);
    }
  });
});

describe("C-D3b: the integrations registry holds no secret", () => {
  it("has no api_key column and nothing reads one", async () => {
    assert.equal((await sys(db, `select count(*)::int c from information_schema.columns where table_name = 'integrations' and column_name = 'api_key'`))[0].c, 0);
  });
  it("accepts a hint (bullets and the last four characters) and nothing that could be a key", async () => {
    const id = (await sys(db, `select id from integrations where key = 'tap'`))[0].id;
    assert.equal(await code(as(db, admin, `update integrations set key_masked = 'sk_live_51HxAbCdEfGhIjKlMnOpQrStUvWxYz0123' where id = $1`, [id])), "23514");
    assert.equal(await code(as(db, admin, `update integrations set key_masked = 'abcd1234' where id = $1`, [id])), "23514");
    await as(db, admin, `update integrations set key_masked = '••••4Kx2' where id = $1`, [id]);
    const hints = await sys(db, `select key_masked from integrations where key_masked is not null`);
    assert.ok(hints.every((h) => /^[*•]{0,12}[A-Za-z0-9]{0,4}$/.test(h.key_masked)), "every stored hint fits");
  });
  it("is readable by administrators only", async () => {
    assert.ok((await count(admin, `select id from integrations`)) > 0);
    for (const user of [customer, owner1, stranger]) assert.equal(await count(user, `select id from integrations`), 0);
    assert.equal(await code(as(db, ROLES.anon, `select id from integrations`)), "42501");
  });
});

describe("C-D24: accepted_payment_methods", () => {
  it("runs with the caller's rights and is not offered to anonymous visitors", async () => {
    const opts = (await sys(db, `select reloptions::text o from pg_class where relname = 'accepted_payment_methods'`))[0].o;
    assert.match(opts, /security_invoker=true/);
    assert.equal(await code(as(db, ROLES.anon, `select key from accepted_payment_methods`)), "42501");
    assert.equal(await code(as(db, customer, `select key from accepted_payment_methods`)), "ok");
  });
});
