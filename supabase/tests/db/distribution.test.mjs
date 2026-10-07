// G61 Distribution: booking attribution by channel and campaign. Analytics only: it never changes a fee, it writes no personal data, and only the
// customer who made a booking can record where it came from. Counts go to the owner, an administrator or a delegate holding the reports permission.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let svc;
let date;
let dates = [];
let admin;
let employee;
let reporter;
let frontDesk;
let strangerCustomer;
const customer = ROLES.user(SEED.customer);
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);

// A fresh booking of the demo customer at the first demo provider: the first free slot of the first working day that still has one.
const book = async (user = customer, token = null) => {
  for (const day of dates) {
    const slots = await as(db, user, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 limit 1`, [SEED.employee1, day, svc.duration]);
    if (!slots[0]) continue;
    return as(db, user,
      `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3, request_source_token => $4)`,
      [SEED.employee1, svc.id, slots[0].slot_start, token]).then((r) => r[0]);
  }
  throw new Error("no free slot left in the test window");
};
const record = (user, bookingId, over = {}) => as(db, user,
  `select record_booking_attribution($1, $2, $3, $4, $5, $6, $7) r`,
  [bookingId, over.channel ?? "google", over.source ?? null, over.medium ?? null, over.campaign ?? null, over.path ?? null, over.host ?? null]).then((r) => r[0].r);
const counts = (user, provider = SEED.provider1, from = null, to = null) =>
  as(db, user, `select provider_bookings_by_channel($1, $2::date, $3::date) r`, [provider, from, to]).then((r) => r[0].r);
const issue = (user, source) => as(db, user, `select create_provider_share_token($1, $2, 'test', null) t`, [SEED.provider1, source]).then((r) => r[0].t);

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  date = await nextWorkingDate(db, SEED.employee1);
  for (let ahead = 3; ahead <= 20; ahead += 1) {
    const day = await nextWorkingDate(db, SEED.employee1, ahead);
    if (!dates.includes(day)) dates.push(day);
  }
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  strangerCustomer = ROLES.user(await createUser(db));
  employee = ROLES.user(await createUser(db, { role: "provider_employee" }));
  reporter = ROLES.user(await createUser(db, { role: "provider_employee" }));
  frontDesk = ROLES.user(await createUser(db, { role: "provider_employee" }));
  await sys(db, `update employees set profile_id = $1 where id = $2`, [employee.sub, SEED.employee1]);
  for (const person of [reporter, frontDesk]) {
    await sys(db, `insert into employees (branch_id, profile_id, name_en, name_ar) values ($1, $2, 'Delegate', 'مفوّض')`, [SEED.branch1, person.sub]);
  }
  await sys(db, `insert into provider_memberships (provider_id, user_id, role, permissions, is_active) values ($1, $2, 'manager', '{"reports":true}', true)`,
    [SEED.provider1, reporter.sub]);
  await sys(db, `insert into provider_memberships (provider_id, user_id, role, permissions, is_active) values ($1, $2, 'receptionist', '{"bookings":true}', true)`,
    [SEED.provider1, frontDesk.sub]);
});

describe("record_booking_attribution", () => {
  it("is written by the customer of the booking, with every field normalised", async () => {
    const b = await book();
    const r = await record(customer, b.id, { channel: " Google ", source: "Google", medium: "CPC", campaign: "Spring-2026", path: `/shop/${SEED.provider1}`, host: "WWW.Google.com" });
    assert.equal(r.recorded, true);
    assert.equal(r.channel, "google");
    const row = (await sys(db, `select * from booking_attribution where booking_id = $1`, [b.id]))[0];
    assert.deepEqual(
      [row.channel, row.utm_source, row.utm_medium, row.utm_campaign, row.landing_path, row.referrer_host, row.verified_by_token],
      ["google", "google", "cpc", "spring-2026", `/shop/${SEED.provider1}`, "www.google.com", false],
    );
  });

  it("writes once: a replay reports the stored row and changes nothing", async () => {
    const b = await book();
    await record(customer, b.id, { channel: "instagram", campaign: "first" });
    const again = await record(customer, b.id, { channel: "facebook", campaign: "second" });
    assert.equal(again.recorded, false);
    assert.equal(again.already_recorded, true);
    assert.equal(again.channel, "instagram");
    const rows = await sys(db, `select channel, utm_campaign from booking_attribution where booking_id = $1`, [b.id]);
    assert.deepEqual(rows, [{ channel: "instagram", utm_campaign: "first" }]);
  });

  it("refuses everybody but the booking's customer", async () => {
    const b = await book();
    await expectError(record(ROLES.anon, b.id), /permission denied|not found|Authentication/i);
    await expectError(record(strangerCustomer, b.id), /Booking not found/);
    await expectError(record(owner1, b.id), /Booking not found/); // the provider cannot write the customer's source either
    await expectError(record(owner2, b.id), /Booking not found/);
    await expectError(record(employee, b.id), /Booking not found/);
    await expectError(record(admin, b.id), /Booking not found/);
    await expectError(record(customer, "00000000-0000-4000-8000-000000000000"), /Booking not found/);
    const service = await as(db, ROLES.service, `select record_booking_attribution($1, 'google') r`, [b.id]).then(
      () => "allowed", (e) => e.message);
    assert.match(service, /Authentication required/); // no end user behind a service-role call
    assert.equal((await sys(db, `select count(*)::int n from booking_attribution where booking_id = $1`, [b.id]))[0].n, 0);
  });

  it("validates every field", async () => {
    const b = await book();
    await expectError(record(customer, b.id, { channel: "myspace" }), /channel must be/);
    await expectError(record(customer, b.id, { channel: "" }), /channel must be/);
    await expectError(record(customer, b.id, { source: "bad source" }), /utm_source/);
    await expectError(record(customer, b.id, { source: "<script>" }), /utm_source/);
    await expectError(record(customer, b.id, { source: "x".repeat(65) }), /utm_source/);
    await expectError(record(customer, b.id, { source: "-leading" }), /utm_source/);
    await expectError(record(customer, b.id, { medium: "a b" }), /utm_medium/);
    await expectError(record(customer, b.id, { medium: "عربي" }), /utm_medium/);
    await expectError(record(customer, b.id, { campaign: "spring?x=1" }), /utm_campaign/);
    await expectError(record(customer, b.id, { campaign: "x".repeat(65) }), /utm_campaign/);
    await expectError(record(customer, b.id, { path: "shop/1" }), /landing path/);
    await expectError(record(customer, b.id, { path: "/shop/1?ref=secret" }), /landing path/);
    await expectError(record(customer, b.id, { path: `/${"a".repeat(200)}` }), /landing path/);
    await expectError(record(customer, b.id, { host: "https://google.com/search?q=x" }), /host name only/);
    await expectError(record(customer, b.id, { host: "google.com/search" }), /host name only/);
    await expectError(record(customer, b.id, { host: "a b.com" }), /host name only/);
    await expectError(record(customer, b.id, { host: "-bad.com" }), /host name only/);
    assert.equal((await sys(db, `select count(*)::int n from booking_attribution where booking_id = $1`, [b.id]))[0].n, 0, "a refused call stores nothing");
    // The boundary values are accepted.
    const ok = await record(customer, b.id, { channel: "other", source: "x".repeat(64), medium: "0", campaign: "a.b_c-d", path: "/", host: "m.facebook.com" });
    assert.equal(ok.recorded, true);
  });

  it("the table itself refuses malformed values even to the database owner", async () => {
    const b = await book();
    await expectError(sys(db, `insert into booking_attribution (booking_id, channel) values ($1, 'myspace')`, [b.id]), /check constraint|violates/i);
    await expectError(sys(db, `insert into booking_attribution (booking_id, channel, utm_campaign) values ($1, 'google', 'BAD CAMPAIGN')`, [b.id]), /check constraint|violates/i);
    await expectError(sys(db, `insert into booking_attribution (booking_id, channel, landing_path) values ($1, 'google', 'https://x.com/a?b=c')`, [b.id]), /check constraint|violates/i);
    await expectError(sys(db, `insert into booking_attribution (booking_id, channel, referrer_host) values ($1, 'google', 'x.com/path')`, [b.id]), /check constraint|violates/i);
  });

  it("refuses a booking older than a day", async () => {
    const b = await book();
    await sys(db, `update bookings set created_at = now() - interval '25 hours' where id = $1`, [b.id]);
    await expectError(record(customer, b.id), /too old/);
  });

  it("takes the channel of the provider's QR, WhatsApp or Instagram token, whatever the browser reported", async () => {
    const qr = await issue(owner1, "qr");
    const b = await book(customer, qr.token);
    const r = await record(customer, b.id, { channel: "facebook" });
    assert.equal(r.channel, "qr");
    assert.equal(r.verified_by_token, true);
    const wa = await issue(owner1, "whatsapp");
    const b2 = await book(customer, wa.token);
    assert.equal((await record(customer, b2.id, { channel: "google" })).channel, "whatsapp");
    // A plain link token does not name a channel: the browser's report stands.
    const link = await issue(owner1, "link");
    const b3 = await book(customer, link.token);
    const r3 = await record(customer, b3.id, { channel: "tiktok" });
    assert.equal(r3.channel, "tiktok");
    assert.equal(r3.verified_by_token, false);
  });

  it("never changes a fee: the booking row is identical before and after", async () => {
    const b = await book();
    const before = (await sys(db, `select source, source_token_id, platform_commission, total_price, deposit_required, tax_amount, status from bookings where id = $1`, [b.id]))[0];
    await record(customer, b.id, { channel: "qr", source: "qr", campaign: "flyer" });
    const after = (await sys(db, `select source, source_token_id, platform_commission, total_price, deposit_required, tax_amount, status from bookings where id = $1`, [b.id]))[0];
    assert.deepEqual(after, before);
    assert.equal(after.source, "marketplace", "claiming a QR channel does not make the booking provider-sourced");
  });
});

describe("booking_attribution table", () => {
  it("lets the customer read their own row and nobody else reads any, direct writes are refused", async () => {
    const b = await book();
    await record(customer, b.id, { channel: "tiktok", campaign: "reel" });
    assert.equal((await as(db, customer, `select count(*)::int n from booking_attribution`))[0].n >= 1, true);
    for (const user of [strangerCustomer, owner1, owner2, employee, reporter, admin]) {
      assert.equal((await as(db, user, `select count(*)::int n from booking_attribution`))[0].n, 0, `${user.sub} reads no rows`);
    }
    await expectError(as(db, ROLES.anon, `select * from booking_attribution`), /permission denied/i);
    for (const user of [customer, strangerCustomer, owner1, admin]) {
      await expectError(as(db, user, `insert into booking_attribution (booking_id, channel) values ($1, 'direct')`, [b.id]), /row-level security|permission denied/i);
      const updated = await as(db, user, `update booking_attribution set channel = 'direct' where booking_id = $1 returning 1`, [b.id]).catch(() => []);
      assert.equal(updated.length, 0, "no direct update");
      const deleted = await as(db, user, `delete from booking_attribution where booking_id = $1 returning 1`, [b.id]).catch(() => []);
      assert.equal(deleted.length, 0, "no direct delete");
    }
    assert.equal((await sys(db, `select channel from booking_attribution where booking_id = $1`, [b.id]))[0].channel, "tiktok");
  });

  it("carries no column that can hold a person, an address or a full URL", async () => {
    const columns = (await sys(db, `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'booking_attribution' order by 1`)).map((c) => c.column_name);
    assert.deepEqual(columns, ["booking_id", "captured_at", "channel", "landing_path", "referrer_host", "utm_campaign", "utm_medium", "utm_source", "verified_by_token"]);
  });
});

describe("provider_bookings_by_channel", () => {
  let freshProvider;
  before(async () => {
    // Use a window nobody else books in: count against a known delta rather than absolute numbers.
    freshProvider = SEED.provider1;
  });

  it("counts by channel and campaign for the owner, and adds up", async () => {
    const base = await counts(owner1, freshProvider);
    const a = await book();
    const b = await book();
    const c = await book();
    await record(customer, a.id, { channel: "google", source: "google", medium: "organic", campaign: "gbp-listing" });
    await record(customer, b.id, { channel: "google", source: "google", medium: "organic", campaign: "gbp-listing" });
    await record(customer, c.id, { channel: "snapchat", source: "snap", medium: "social", campaign: "story-1" });
    await as(db, customer, `select cancel_booking($1, 'changed my mind')`, [b.id]);
    const now = await counts(owner1, freshProvider);

    assert.equal(now.bookings - base.bookings, 3);
    assert.equal(now.attributed - base.attributed, 3);
    assert.equal(now.unattributed, base.unattributed);
    const by = (list, channel) => list.find((x) => x.channel === channel) ?? { bookings: 0, completed: 0, lost: 0 };
    assert.equal(by(now.by_channel, "google").bookings - by(base.by_channel, "google").bookings, 2);
    assert.equal(by(now.by_channel, "google").lost - by(base.by_channel, "google").lost, 1);
    assert.equal(by(now.by_channel, "snapchat").bookings - by(base.by_channel, "snapchat").bookings, 1);
    const campaign = now.by_campaign.find((x) => x.utm_campaign === "gbp-listing");
    assert.deepEqual([campaign.utm_source, campaign.utm_medium, campaign.bookings], ["google", "organic", 2]);
    assert.equal(now.by_channel.reduce((n, x) => n + x.bookings, 0), now.attributed, "the channels add up to the attributed bookings");
    assert.equal(now.attributed + now.unattributed, now.bookings);
    assert.equal(now.provider_id, freshProvider);
  });

  it("counts a booking nobody attributed as unattributed, and keeps walk-ins apart", async () => {
    const base = await counts(owner1);
    await book();
    const now = await counts(owner1);
    assert.equal(now.unattributed - base.unattributed, 1);
    assert.equal(now.walk_ins, base.walk_ins);
    const svc2 = await serviceFor(db, SEED.employee2);
    const when = (await sys(db, `select (date_trunc('hour', now() + interval '9 days'))::text t`))[0].t;
    await as(db, owner1, `select create_walk_in_booking(p_branch_id => $1, p_employee_id => $2, p_service_id => $3, p_customer_name => 'Counter guest',
        p_customer_phone => null, p_payment_method => 'cash', p_scheduled_at => $4::timestamptz, p_notes => null) r`, [SEED.branch1, SEED.employee2, svc2.id, when]);
    const after = await counts(owner1);
    assert.equal(after.walk_ins - now.walk_ins, 1);
    assert.equal(after.unattributed, now.unattributed, "a counter booking is nobody's channel");
    assert.equal(after.bookings, now.bookings);
  });

  it("returns aggregates only: no booking, customer, name or contact detail", async () => {
    const b = await book();
    await record(customer, b.id, { channel: "facebook", campaign: "page-post" });
    const result = await counts(owner1);
    assert.deepEqual(Object.keys(result).sort(), ["attributed", "bookings", "by_campaign", "by_channel", "from", "provider_id", "to", "unattributed", "walk_ins"]);
    for (const row of result.by_channel) assert.deepEqual(Object.keys(row).sort(), ["bookings", "channel", "completed", "lost"]);
    for (const row of result.by_campaign) assert.deepEqual(Object.keys(row).sort(), ["bookings", "completed", "utm_campaign", "utm_medium", "utm_source"]);
    const text = JSON.stringify(result);
    assert.equal(text.includes(b.id), false, "no booking id");
    assert.equal(text.includes(SEED.customer), false, "no customer id");
    const profile = (await sys(db, `select p.first_name, p.last_name, p.phone_number, u.email from profiles p left join auth.users u on u.id = p.id where p.id = $1`, [SEED.customer]))[0] ?? {};
    for (const value of Object.values(profile)) if (value && String(value).length > 2) assert.equal(text.includes(String(value)), false, `no ${value}`);
  });

  it("honours the date range in Riyadh days and rejects a bad one", async () => {
    const today = (await sys(db, `select (now() at time zone 'Asia/Riyadh')::date::text d`))[0].d;
    const all = await counts(owner1, SEED.provider1, today, today);
    assert.equal(all.from, today);
    assert.equal(all.to, today);
    const past = await counts(owner1, SEED.provider1, "2020-01-01", "2020-01-31");
    assert.equal(past.bookings, 0);
    assert.deepEqual(past.by_channel, []);
    assert.deepEqual(past.by_campaign, []);
    const defaults = await counts(owner1);
    const diff = (await sys(db, `select ($1::date - $2::date) d`, [defaults.to, defaults.from]))[0].d;
    assert.equal(diff, 29, "the default window is the last 30 days");
    await expectError(counts(owner1, SEED.provider1, "2026-02-01", "2026-01-01"), /must not be after/);
    await expectError(counts(owner1, SEED.provider1, "2024-01-01", "2026-01-01"), /at most 366 days/);
  });

  it("is open to the owner, a reports delegate and an administrator, and to nobody else", async () => {
    for (const user of [owner1, reporter, admin]) {
      const r = await counts(user);
      assert.equal(typeof r.bookings, "number");
    }
    await expectError(counts(owner2), /Provider not found/); // another provider's owner
    await expectError(counts(frontDesk), /Provider not found/); // a delegate without the reports permission
    await expectError(counts(employee), /Provider not found/); // an employee
    await expectError(counts(strangerCustomer), /Provider not found/);
    await expectError(counts(customer), /Provider not found/);
    await expectError(counts(ROLES.anon), /permission denied|Authentication/i);
    await expectError(counts(ROLES.service), /Authentication required/);
    await expectError(counts(owner1, "00000000-0000-4000-8000-000000000000"), /Provider not found/);
    // The second provider's owner reads their own.
    assert.equal(typeof (await counts(owner2, SEED.provider2)).bookings, "number");
    await expectError(counts(owner1, SEED.provider2), /Provider not found/);
  });

  it("does not count another provider's bookings", async () => {
    const two = await counts(owner2, SEED.provider2);
    const b = await book();
    await record(customer, b.id, { channel: "google" });
    const after = await counts(owner2, SEED.provider2);
    assert.equal(after.bookings, two.bookings);
  });
});

describe("admin_booking_channel_counts", () => {
  it("gives an administrator platform-wide counts and refuses every other role", async () => {
    const platform = await as(db, admin, `select admin_booking_channel_counts() r`).then((r) => r[0].r);
    const p1 = await counts(owner1, SEED.provider1);
    const p2 = await counts(owner2, SEED.provider2);
    assert.equal(platform.bookings >= p1.bookings + p2.bookings, true);
    assert.equal(platform.attributed + platform.unattributed, platform.bookings);
    assert.equal("provider_id" in platform, false);
    for (const user of [customer, strangerCustomer, owner1, owner2, employee, reporter, frontDesk]) {
      await expectError(as(db, user, `select admin_booking_channel_counts()`), /Administrator access required/);
    }
    await expectError(as(db, ROLES.anon, `select admin_booking_channel_counts()`), /permission denied/i);
    await expectError(as(db, ROLES.service, `select admin_booking_channel_counts()`), /Administrator access required/);
    await expectError(as(db, admin, `select admin_booking_channel_counts('2026-03-01'::date, '2026-01-01'::date)`), /must not be after/);
  });

  it("keeps the internal counter out of reach of every client role", async () => {
    for (const user of [customer, owner1, admin, ROLES.anon]) {
      await expectError(as(db, user, `select booking_channel_counts_internal(null, null, null)`), /permission denied/i);
    }
  });
});

describe("session time zone", () => {
  it("runs in UTC like a hosted session and still resolves Riyadh days", async () => {
    assert.equal((await sys(db, `show timezone`))[0].TimeZone, "UTC");
    // A booking created just before midnight Riyadh time belongs to that Riyadh day, not the UTC one.
    const b = await book();
    await record(customer, b.id, { channel: "direct" });
    await sys(db, `update bookings set created_at = (((now() at time zone 'Asia/Riyadh')::date)::timestamp + interval '23 hours 59 minutes') at time zone 'Asia/Riyadh' where id = $1`, [b.id]);
    const today = (await sys(db, `select (now() at time zone 'Asia/Riyadh')::date::text d`))[0].d;
    const lateToday = await counts(owner1, SEED.provider1, today, today);
    const direct = lateToday.by_channel.find((x) => x.channel === "direct");
    assert.ok(direct && direct.bookings >= 1, "the 23:59 Riyadh booking is in today's Riyadh range");
  });
});
