import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// C-D30 / D-03: strike policy, gift card limits, tip limits and the public URL come from platform_settings.

let db;
let admin;
let customer;
let svc;
const owner = ROLES.user(SEED.owner1);
let day = 0;

const update = (actor, key, value) => as(db, actor, `select admin_update_platform_setting($1, $2::jsonb, 'Owner decision for the constants test') r`, [key, JSON.stringify(value)]);
const noShow = async () => {
  day += 1;
  const [row] = await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount, deposit_required)
    values ($1, $2, $3, $4, 'confirmed', now() - make_interval(days => $5::int) - interval '3 hours', 30, 100, 100, 0, 0) returning id`,
    [customer.sub, SEED.branch1, SEED.employee1, svc.id, day]);
  await as(db, owner, `select mark_booking_no_show($1, 'Customer did not arrive')`, [row.id]);
  return row.id;
};
const eligibility = async () => (await as(db, customer, `select check_customer_booking_eligibility($1, $2) r`, [SEED.provider1, customer.sub]))[0].r;
const gift = (amount) => as(db, customer, `select purchase_gift_card('Sara', '+966500000001', null, $1) r`, [amount]);
const completed = async () => (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount, deposit_required)
  values ($1, $2, $3, $4, 'completed', now() - interval '2 days', 30, 100, 100, 0, 0) returning id`, [customer.sub, SEED.branch1, SEED.employee1, svc.id]))[0].id;

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  customer = ROLES.user(await createUser(db));
  svc = await serviceFor(db, SEED.employee1);
});

describe("seeded values keep today's behaviour and wait for the owner", () => {
  it("seeds the previous constants as unapproved settings and leaves the public URL unset", async () => {
    const rows = await sys(db, `select key, value, requires_owner_approval, approved_by from platform_settings where key in ('no_show_strike_policy','gift_card_limits','tip_limits','public_app_url') order by key`);
    assert.deepEqual(rows.map((r) => r.key), ["gift_card_limits", "no_show_strike_policy", "public_app_url", "tip_limits"]);
    assert.ok(rows.every((r) => r.requires_owner_approval && r.approved_by === null));
    assert.equal(rows.find((r) => r.key === "public_app_url").value, null);
  });
});

describe("no-show strike policy", () => {
  it("counts the threshold and window from the setting", async () => {
    for (let i = 0; i < 3; i += 1) await noShow();
    assert.deepEqual([(await eligibility()).no_show_strikes, (await eligibility()).requires_full_prepayment], [3, true]);
    await update(admin, "no_show_strike_policy", { strikes: 4, window_days: 60 });
    assert.equal((await eligibility()).requires_full_prepayment, false);
    await update(admin, "no_show_strike_policy", { strikes: 2, window_days: 60 });
    assert.equal((await eligibility()).requires_full_prepayment, true);
    await sys(db, `update bookings set no_show_at = now() - interval '10 days' where id in (select id from bookings where customer_id = $1 and status = 'no_show' order by id limit 2)`, [customer.sub]);
    await update(admin, "no_show_strike_policy", { strikes: 2, window_days: 2 });
    assert.deepEqual([(await eligibility()).no_show_strikes, (await eligibility()).requires_full_prepayment], [1, false], "only the no-show from the last two days counts");
  });

  it("counts nothing when the setting is missing instead of falling back to a number", async () => {
    await sys(db, `delete from platform_settings where key = 'no_show_strike_policy'`);
    assert.deepEqual([(await eligibility()).no_show_strikes, (await eligibility()).requires_full_prepayment], [0, false]);
  });
});

describe("gift card and tip limits", () => {
  it("refuses amounts outside the configured range and sets the expiry from valid_days", async () => {
    await expectError(gift(49), /between 50 and 5000/);
    await gift(50);
    await update(admin, "gift_card_limits", { min_sar: 100, max_sar: 200, valid_days: 30 });
    await expectError(gift(99), /between 100 and 200/);
    await expectError(gift(201), /between 100 and 200/);
    const [{ r }] = await gift(150);
    const [card] = await sys(db, `select (expires_at::date - current_date) d from gift_cards where id = $1`, [r.gift_card_id]);
    assert.equal(card.d, 30);
    await sys(db, `delete from platform_settings where key = 'gift_card_limits'`);
    await expectError(gift(150), /not configured/);
  });

  it("refuses a tip outside the configured range, and every tip when the setting is missing", async () => {
    const booking = await completed();
    const tip = (amount) => as(db, customer, `select add_booking_tip($1, $2, 'card') r`, [booking, amount]);
    await expectError(tip(4), /between 5 and 1000/);
    await expectError(tip(1001), /between 5 and 1000/);
    await update(admin, "tip_limits", { min_sar: 10, max_sar: 20 });
    await expectError(tip(9), /between 10 and 20/);
    await tip(15);
    await sys(db, `delete from platform_settings where key = 'tip_limits'`);
    await expectError(tip(15), /not configured|already sent/);
  });
});

describe("settings are edited by an administrator only, with valid shapes", () => {
  it("refuses other roles and malformed values", async () => {
    await sys(db, `insert into platform_settings (key, value) values ('tip_limits', '{"min_sar": 5, "max_sar": 1000}'), ('gift_card_limits', '{"min_sar": 50, "max_sar": 5000, "valid_days": 365}'),
      ('no_show_strike_policy', '{"strikes": 3, "window_days": 60}') on conflict (key) do nothing`);
    for (const actor of [ROLES.anon, customer, owner]) {
      await expectError(update(actor, "tip_limits", { min_sar: 1, max_sar: 2 }), /permission denied|Administrator access/i);
    }
    await expectError(update(admin, "public_app_url", "http://insecure.example"), /https/);
    await expectError(update(admin, "public_app_url", "https://exa mple.sa"), /https/);
    await expectError(update(admin, "tip_limits", { min_sar: 0, max_sar: 2 }), /Tip limits/);
    await expectError(update(admin, "no_show_strike_policy", { strikes: 0, window_days: 5 }), /strike policy/);
    await expectError(update(admin, "gift_card_limits", { min_sar: 10, max_sar: 5, valid_days: 30 }), /Gift card limits/);
  });
});

describe("message links (D-03)", () => {
  it("carries no link while public_app_url is unset, and the new paths once it is set", async () => {
    const booking = await completed();
    const vars = async () => (await sys(db, `select booking_message_variables($1, 'en') v`, [booking]))[0].v;
    const unset = await vars();
    for (const key of ["action_url", "confirm_url", "dashboard_url", "review_url", "rebook_url"]) assert.equal(unset[key], null, key);
    assert.ok(!JSON.stringify(unset).includes("primora.sa"));
    assert.equal(unset.customer_name.length > 0, true, "the other variables are untouched");
    await update(admin, "public_app_url", "https://app.example.sa/");
    const set = await vars();
    assert.equal(set.action_url, `https://app.example.sa/customer/bookings?booking=${booking}`);
    assert.equal(set.confirm_url, `https://app.example.sa/customer/bookings?booking=${booking}&action=confirm_attendance`);
    assert.equal(set.dashboard_url, "https://app.example.sa/provider/bookings");
    await update(admin, "public_app_url", null);
    assert.equal((await vars()).action_url, null);
  });
});
