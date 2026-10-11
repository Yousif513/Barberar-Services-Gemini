import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// D-26: client events through an insert-only command, server events from additive triggers, an admin-only report.

let db;
let admin;
let customer;
let svc;
const owner = ROLES.user(SEED.owner1);
const track = (actor, event, anon = null, props = {}) => as(db, actor, `select track_analytics_event($1, $2, $3::jsonb)`, [event, anon, JSON.stringify(props)]);
const events = (name) => sys(db, `select event, user_id, anon_id, props, source from analytics_events where event = $1 order by created_at, id`, [name]);

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  customer = ROLES.user(await createUser(db));
  svc = await serviceFor(db, SEED.employee1);
});

describe("client events", () => {
  it("records an anonymous and a signed-in event and ignores a spoofed user id", async () => {
    await track(ROLES.anon, "search_performed", "anon-visitor-0001", { city: "Riyadh", results: 12 });
    await track(customer, "shop_viewed", null, { provider: SEED.provider1 });
    const [a] = await events("search_performed");
    assert.deepEqual([a.user_id, a.anon_id, a.source, a.props.results], [null, "anon-visitor-0001", "client", 12]);
    const [s] = await events("shop_viewed");
    assert.deepEqual([s.user_id, s.source], [customer.sub, "client"]);
  });

  it("refuses bad names, server-owned names, personal data, oversized props and unidentified anonymous callers", async () => {
    await expectError(track(ROLES.anon, "Bad Name", "anon-visitor-0001"), /lower_snake_case/);
    await expectError(track(ROLES.anon, "booking_completed", "anon-visitor-0001"), /server only/);
    await expectError(track(customer, "payment_succeeded"), /server only/);
    await expectError(track(customer, "profile_saved", null, { phone_number: "+966500000000" }), /personal data/);
    await expectError(track(customer, "profile_saved", null, { nested: { user_email: "a@b.sa" } }), /personal data/);
    await expectError(track(customer, "big_event", null, { blob: "x".repeat(5000) }), /4096/);
    await expectError(track(ROLES.anon, "search_performed"), /anonymous id/);
    await expectError(as(db, ROLES.anon, `select track_analytics_event('search_performed', 'anon-visitor-0001', '[1]'::jsonb)`), /object/);
  });

  it("limits a person to 120 events a minute", async () => {
    await sys(db, `insert into analytics_events (event, anon_id, source) select 'flood_event', 'anon-flooder-01', 'client' from generate_series(1, 120)`);
    await expectError(track(ROLES.anon, "flood_event", "anon-flooder-01"), /Too many events/);
    await track(ROLES.anon, "flood_event", "anon-flooder-02");
  });

  it("cannot be read or written directly by any client, administrators included (GOV-2: only aggregate counts)", async () => {
    await expectError(as(db, ROLES.anon, `select * from analytics_events`), /permission denied/i);
    assert.equal((await as(db, customer, `select id from analytics_events`)).length, 0);
    assert.equal((await as(db, owner, `select id from analytics_events`)).length, 0);
    assert.equal((await as(db, admin, `select id from analytics_events`)).length, 0);
    assert.ok((await sys(db, `select count(*)::int n from analytics_events`))[0].n >= 2);
    await expectError(as(db, customer, `insert into analytics_events (event, source) values ('forged_event', 'server')`), /permission denied|row-level/i);
    await expectError(as(db, admin, `update analytics_events set event = 'edited_event'`), /permission denied|row-level/i);
    await expectError(as(db, admin, `delete from analytics_events`), /permission denied|row-level/i);
  });
});

describe("server events", () => {
  it("records the booking funnel from status changes and the payment from the ledger, without personal data", async () => {
    const [booking] = await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount, deposit_required)
      values ($1, $2, $3, $4, 'confirmed', now() - interval '3 hours', 30, 100, 100, 0, 0) returning id`, [customer.sub, SEED.branch1, SEED.employee1, svc.id]);
    await as(db, owner, `select employee_update_booking_status($1, 'completed')`, [booking.id]);
    await sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
      values ($1, $2, 'booking_payment', 'pi_analytics_1', 100, 10, 90, 'pending')`, [booking.id, SEED.provider1]);
    const confirmed = (await events("booking_confirmed")).filter((e) => e.props.booking_id === booking.id);
    const completed = (await events("booking_completed")).filter((e) => e.props.booking_id === booking.id);
    const paid = (await events("payment_succeeded")).filter((e) => e.props.booking_id === booking.id);
    assert.deepEqual([confirmed.length, completed.length, paid.length], [1, 1, 1]);
    assert.deepEqual([completed[0].source, completed[0].user_id], ["server", customer.sub]);
    assert.equal(Number(paid[0].props.amount_sar), 100);
    assert.ok(!JSON.stringify([confirmed, completed, paid]).match(/phone|email|name/i));
  });

  it("records cancelled and no-show bookings too, and a status-less update adds nothing", async () => {
    const make = async (hoursAgo) => (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount, deposit_required)
      values ($1, $2, $3, $4, 'confirmed', now() - make_interval(hours => $5::int), 30, 100, 100, 0, 0) returning id`, [customer.sub, SEED.branch1, SEED.employee1, svc.id, hoursAgo]))[0].id;
    const missed = await make(30);
    await as(db, owner, `select mark_booking_no_show($1, 'Customer did not arrive')`, [missed]);
    const cancelled = await make(-48);
    await as(db, customer, `select cancel_booking($1, 'Plans changed')`, [cancelled]);
    assert.equal((await events("booking_no_show")).filter((e) => e.props.booking_id === missed).length, 1);
    assert.equal((await events("booking_cancelled")).filter((e) => e.props.booking_id === cancelled).length, 1);
    const before = (await sys(db, `select count(*)::int n from analytics_events`))[0].n;
    await sys(db, `update bookings set cancellation_reason = 'edited' where id = $1`, [missed]);
    assert.equal((await sys(db, `select count(*)::int n from analytics_events`))[0].n, before);
  });
});

describe("funnel report", () => {
  it("counts events per Riyadh day and person for an administrator only", async () => {
    const report = (await as(db, admin, `select admin_get_event_counts(current_date - 2, current_date + 1) r`))[0].r;
    const completed = report.filter((r) => r.event === "booking_completed");
    // D4: a day cell with 1 to 4 people is suppressed (no event or people figure), larger cells are shown.
    assert.ok(completed.length >= 1 && completed.every((r) => r.source === "server"
      && (r.suppressed ? r.people === null && r.events === null : r.people >= 5)));
    for (const actor of [ROLES.anon, customer, owner]) {
      await expectError(as(db, actor, `select admin_get_event_counts(current_date - 2, current_date)`), /permission denied|Administrator access/i);
    }
    await expectError(as(db, admin, `select admin_get_event_counts(current_date, current_date - 1)`), /range/);
  });
});
