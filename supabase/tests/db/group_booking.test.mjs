import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { as, createMigratedDb, createUser, expectError, firstSlot, MIGRATIONS_DIR, ROLES, SEED, sys } from "./harness.mjs";

// G52 group booking against the full migrated schema: the provider opt-in, previewing without writing, creating a group in one
// transaction (all or nothing, replay safe), cancelling the group or one guest through cancel_booking, the payment deadline, and every role.
let db;
let admin;
let employeeUser;
let delegate;
let stranger;
const owner = ROLES.user(SEED.owner1);
const otherOwner = ROLES.user(SEED.owner2);

// Demo seed (provider 1, branch 1): professional 1 offers services 1 and 2, professional 2 offers service 2, professional 3 offers service 3.
const S1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const S2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const S3 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
const E1 = SEED.employee1;
const E2 = SEED.employee2;
const E3 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd3";
const PROVIDER2_BRANCH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const PROVIDER2_SERVICE = "cccccccc-cccc-4ccc-8ccc-ccccccccccc4";

const newCustomer = async () => ROLES.user(await createUser(db));
const count = async (table, where = "true", params = []) =>
  (await sys(db, `select count(*)::int n from ${table} where ${where}`, params))[0].n;

// Every scenario books its own day (never a Friday, when the seeded professionals start at 14:00, or a Saturday, when nobody works),
// so scenarios never collide with each other and the opening time is the same on every day used.
let dayCursor = Date.now() + 2 * 86400000;
function freshDate() {
  for (;;) {
    dayCursor += 86400000;
    const d = new Date(dayCursor);
    if (d.getUTCDay() !== 5 && d.getUTCDay() !== 6) return d.toISOString().slice(0, 10);
  }
}
const riyadhDate = (iso) => new Date(new Date(iso).getTime() + 3 * 3600000).toISOString().slice(0, 10);

const trio = () => [
  { label: "Bride", services: [{ service_id: S1 }], employee_id: E1 },
  { label: "Mother", services: [{ service_id: S2 }], employee_id: E2 },
  { label: "Aunt", services: [{ service_id: S3 }], employee_id: E3 },
];
const preview = (user, date, guests, branch = SEED.branch1) =>
  as(db, user, `select preview_group_booking($1, $2::date, $3::jsonb) r`, [branch, date, JSON.stringify(guests)]).then((r) => r[0].r);
// The assignment the preview suggests, in the shape create_group_booking takes.
async function planned(user, date, guests) {
  const p = await preview(user, date, guests);
  assert.equal(p.can_create, true, "the fixture needs free slots");
  return p.guests.map((x, i) => ({ ...guests[i], employee_id: x.employee_id, scheduled_at: x.scheduled_at }));
}
const create = (user, date, guests, { occasion = "wedding", notes = "Henna night", key = crypto.randomUUID(), branch = SEED.branch1 } = {}) =>
  as(db, user, `select create_group_booking($1, $2::date, $3::group_occasion, $4, $5::jsonb, $6) r`,
    [branch, date, occasion, notes, JSON.stringify(guests), key]).then((r) => r[0].r);
const enable = (user = owner, provider = SEED.provider1, max = 6, hold = null) =>
  as(db, user, `select set_provider_group_settings($1, true, $2, $3) r`, [provider, max, hold]);
const cancelGroup = (user, group, reason = "Plans changed") =>
  as(db, user, `select cancel_group_booking($1, $2) r`, [group, reason]).then((r) => r[0].r);
const cancelMember = (user, booking, reason = "Guest cannot come") =>
  as(db, user, `select cancel_group_member($1, $2) r`, [booking, reason]).then((r) => r[0].r);
const bookingRows = (ids) => sys(db, `select * from bookings where id = any($1::uuid[]) order by scheduled_at, id`, [ids]);
// A fresh group of three guests on its own day, planned from the preview.
async function makeGroup(host, { guests = trio(), ...options } = {}) {
  const date = freshDate();
  const plan = await planned(host, date, guests);
  const result = await create(host, date, plan, options);
  return { date, plan, result, ids: result.members.map((m) => m.booking_id) };
}

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  stranger = ROLES.user(await createUser(db, { role: "provider_employee" }));
  employeeUser = ROLES.user(await createUser(db, { role: "provider_employee" }));
  delegate = ROLES.user(await createUser(db, { role: "provider_employee" }));
  await sys(db, `update employees set profile_id = $1 where id = $2`, [employeeUser.sub, E1]);
  await sys(db, `insert into employees (branch_id, profile_id, name_en, name_ar) values ($1, $2, 'Front Desk', 'الاستقبال')`,
    [SEED.branch1, delegate.sub]);
  await sys(db, `insert into provider_memberships (provider_id, user_id, role, permissions, is_active)
                 values ($1, $2, 'manager', '{"bookings":true}', true)`, [SEED.provider1, delegate.sub]);
});

describe("provider opt-in", () => {
  it("is off for every provider until the owner enables it", async () => {
    assert.equal(await count("provider_group_settings"), 0);
    const host = await newCustomer();
    const date = freshDate();
    await expectError(preview(host, date, trio()), /does not offer group bookings/);
    await expectError(create(host, date, trio().map((g) => ({ ...g, scheduled_at: `${date}T07:00:00Z` }))), /does not offer group bookings/);
    assert.equal(await count("group_bookings"), 0);
    assert.deepEqual(await as(db, host, `select * from list_group_booking_providers()`), []);
  });

  it("lets only the owner (or an administrator with a reason) change it", async () => {
    await expectError(as(db, ROLES.anon, `select set_provider_group_settings($1, true, 6, null)`, [SEED.provider1]), /Authentication required|permission denied/);
    await expectError(as(db, ROLES.service, `select set_provider_group_settings($1, true, 6, null)`, [SEED.provider1]), /Authentication required/);
    const customer = await newCustomer();
    await expectError(as(db, customer, `select set_provider_group_settings($1, true, 6, null)`, [SEED.provider1]), /Provider not found/);
    await expectError(as(db, otherOwner, `select set_provider_group_settings($1, true, 6, null)`, [SEED.provider1]), /Provider not found/);
    await expectError(as(db, stranger, `select set_provider_group_settings($1, true, 6, null)`, [SEED.provider1]), /Provider not found/);
    await expectError(as(db, employeeUser, `select set_provider_group_settings($1, true, 6, null)`, [SEED.provider1]), /Provider not found/);
    await expectError(as(db, delegate, `select set_provider_group_settings($1, true, 6, null)`, [SEED.provider1]), /Only the provider owner/);
    await expectError(as(db, admin, `select set_provider_group_settings($1, true, 6, null)`, [SEED.provider1]), /reason of at least 3/);
    await expectError(as(db, owner, `select set_provider_group_settings($1::uuid, true, 6, null)`, ["99999999-9999-4999-8999-999999999999"]), /Provider not found/);
    assert.equal(await count("provider_group_settings"), 0, "every refused call left nothing behind");
    const before = await count("admin_audit_logs", `action = 'group_settings.updated'`);
    const r = await as(db, admin, `select set_provider_group_settings($1, false, 4, null, 'Support request 4412') r`, [SEED.provider1]);
    assert.equal(r[0].r.enabled, false);
    assert.equal(await count("admin_audit_logs", `action = 'group_settings.updated'`), before + 1);
  });

  it("validates the numbers", async () => {
    for (const [max, hold, pattern] of [[1, null, /between 2 and 30/], [31, null, /between 2 and 30/], [6, 0, /between 1 and 168/], [6, 169, /between 1 and 168/]]) {
      await expectError(as(db, owner, `select set_provider_group_settings($1, true, $2, $3)`, [SEED.provider1, max, hold]), pattern);
    }
    await sys(db, `delete from provider_group_settings`);
    await expectError(as(db, owner, `select set_provider_group_settings($1, true, null, null)`, [SEED.provider1]), /maximum group size is required/);
    await expectError(as(db, owner, `select set_provider_group_settings($1, null, 6, null)`, [SEED.provider1]), /enabled flag is required/);
    assert.equal(await count("provider_group_settings"), 0);
  });

  it("is audited, and its settings are visible only to the provider's own people and administrators", async () => {
    const before = await count("admin_audit_logs", `action = 'group_settings.updated'`);
    await enable(owner, SEED.provider1, 6, null);
    assert.equal(await count("admin_audit_logs", `action = 'group_settings.updated'`), before + 1);
    assert.equal((await as(db, owner, `select enabled, max_group_size from provider_group_settings`)).length, 1);
    assert.equal((await as(db, delegate, `select 1 from provider_group_settings`)).length, 1);
    assert.equal((await as(db, admin, `select 1 from provider_group_settings`)).length, 1);
    for (const who of [otherOwner, stranger, await newCustomer(), employeeUser]) {
      assert.equal((await as(db, who, `select 1 from provider_group_settings`)).length, 0);
    }
    await expectError(as(db, ROLES.anon, `select 1 from provider_group_settings`), /permission denied/);
    await expectError(as(db, owner, `update provider_group_settings set max_group_size = 30`), /permission denied|row-level/);
    await expectError(as(db, owner, `insert into provider_group_settings (provider_id, enabled, max_group_size) values ($1, true, 30)`, [SEED.provider2]), /permission denied|row-level/);
    await expectError(as(db, owner, `delete from provider_group_settings`), /permission denied|row-level/);
  });

  it("tells customers which providers take groups, and nobody who is signed out", async () => {
    const host = await newCustomer();
    const rows = await as(db, host, `select * from list_group_booking_providers()`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].provider_id, SEED.provider1);
    assert.equal(rows[0].max_group_size, 6);
    await expectError(as(db, ROLES.anon, `select * from list_group_booking_providers()`), /permission denied|Authentication required/);
    await sys(db, `update provider_group_settings set enabled = false where provider_id = $1`, [SEED.provider1]);
    assert.deepEqual(await as(db, host, `select * from list_group_booking_providers()`), []);
    await sys(db, `update provider_group_settings set enabled = true where provider_id = $1`, [SEED.provider1]);
  });
});

describe("previewing a group", () => {
  it("writes nothing and suggests one professional per guest from real availability", async () => {
    const host = await newCustomer();
    const tables = ["bookings", "group_bookings", "group_booking_members", "notifications"];
    const before = await Promise.all(tables.map((t) => count(t)));
    const date = freshDate();
    const p = await preview(host, date, trio());
    assert.equal(p.can_create, true);
    assert.equal(p.guest_count, 3);
    assert.equal(p.max_group_size, 6);
    assert.equal(p.standard_hold_minutes, 15);
    assert.deepEqual(p.guests.map((g) => g.employee_id), [E1, E2, E3]);
    assert.equal(new Set(p.guests.map((g) => g.scheduled_at)).size, 1, "three professionals work in parallel at the opening time");
    assert.equal(riyadhDate(p.guests[0].scheduled_at), date);
    assert.ok(p.guests.every((g) => g.available && g.matched_preference && g.reason === null));
    assert.equal(p.subtotal_sar, p.guests.reduce((sum, g) => sum + g.subtotal_sar, 0), "the subtotal adds each guest's own services");
    assert.deepEqual(p.guests.slice(0, 2).map((g) => g.subtotal_sar), [85, 70]);
    assert.deepEqual(await Promise.all(tables.map((t) => count(t))), before);
  });

  it("never puts one professional in two overlapping places", async () => {
    const host = await newCustomer();
    const date = freshDate();
    // Only professionals 1 and 2 offer service 2, so the third guest must wait for one of them to be free.
    const guests = [1, 2, 3].map((n) => ({ label: `Guest ${n}`, services: [{ service_id: S2 }] }));
    const p = await preview(host, date, guests);
    assert.equal(p.can_create, true);
    const [a, b, c] = p.guests;
    assert.equal(a.scheduled_at, b.scheduled_at);
    assert.notEqual(a.employee_id, b.employee_id);
    assert.ok(new Date(c.scheduled_at) > new Date(a.scheduled_at), "the third guest starts after the first two");
    assert.ok([a.employee_id, b.employee_id].includes(c.employee_id));
  });

  it("keeps a preferred time when a professional is free and offers the nearest slot when not", async () => {
    const host = await newCustomer();
    const date = freshDate();
    const wanted = `${date}T07:00:00Z`; // 10:00 in Riyadh
    const guests = [
      { label: "Bride", services: [{ service_id: S1 }], employee_id: E1, scheduled_at: wanted },
      { label: "Mother", services: [{ service_id: S1 }], employee_id: E1, scheduled_at: wanted },
    ];
    const p = await preview(host, date, guests);
    assert.equal(new Date(p.guests[0].scheduled_at).toISOString(), new Date(wanted).toISOString());
    assert.equal(p.guests[0].matched_preference, true);
    assert.equal(p.guests[1].matched_preference, false);
    assert.equal(p.guests[1].reason, "preferred_time_unavailable");
    assert.notEqual(p.guests[1].scheduled_at, p.guests[0].scheduled_at);
    assert.equal(p.guests[1].employee_id, E1);
    assert.equal(p.can_create, true);
  });

  it("reports a guest nobody can take instead of inventing a slot", async () => {
    const host = await newCustomer();
    const date = freshDate();
    // Professional 2 does not offer service 3.
    const guests = [{ label: "Bride", services: [{ service_id: S1 }] }, { label: "Mother", services: [{ service_id: S3 }], employee_id: E2 }];
    const p = await preview(host, date, guests);
    assert.equal(p.can_create, false);
    assert.equal(p.all_available, false);
    assert.equal(p.guests[0].available, true);
    assert.equal(p.guests[1].available, false);
    assert.equal(p.guests[1].reason, "no_availability");
    assert.equal(p.guests[1].scheduled_at, null);
  });

  it("refuses bad requests with a reason", async () => {
    const host = await newCustomer();
    const date = freshDate();
    await expectError(preview(host, "2020-01-01", trio()), /cannot be in the past/);
    await expectError(preview(host, date, trio(), "99999999-9999-4999-8999-999999999999"), /Branch not found/);
    await expectError(preview(host, date, trio().slice(0, 1)), /at least 2 guests/);
    await expectError(preview(host, date, []), /non-empty array/);
    await expectError(as(db, host, `select preview_group_booking($1, $2::date, '{}'::jsonb)`, [SEED.branch1, date]), /non-empty array/);
    await expectError(preview(host, date, [{ label: "A" }, { label: "B" }]), /between 1 and 6 services/);
    await expectError(preview(host, date, [{ label: "A", services: [{ service_id: S1 }, { service_id: S1 }] }, { label: "B", services: [{ service_id: S2 }] }]), /same service twice/);
    await expectError(preview(host, date, [{ label: "A", services: [{ service_id: "not-a-uuid" }] }, { label: "B", services: [{ service_id: S2 }] }]), /not valid/);
    await expectError(preview(host, date, [{ label: "x".repeat(81), services: [{ service_id: S1 }] }, { label: "B", services: [{ service_id: S2 }] }]), /longer than 80/);
    await expectError(preview(host, date, Array.from({ length: 7 }, (_, i) => ({ label: `G${i}`, services: [{ service_id: S2 }] }))), /at most 6 guests/);
    await expectError(preview(host, date, Array.from({ length: 31 }, (_, i) => ({ label: `G${i}`, services: [{ service_id: S2 }] }))), /at most 30 guests/);
  });

  it("is for signed-in customers only", async () => {
    const date = freshDate();
    await expectError(preview(ROLES.anon, date, trio()), /permission denied|Authentication required/);
    await expectError(preview(ROLES.service, date, trio()), /Authentication required/);
  });
});

describe("creating a group", () => {
  it("books every guest as an ordinary booking of the host, grouped under one occasion", async () => {
    const host = await newCustomer();
    const auditBefore = await count("admin_audit_logs", `action = 'group_booking.created'`);
    const { date, plan, result, ids } = await makeGroup(host);
    assert.equal((await sys(db, `show timezone`))[0].TimeZone, "UTC", "the session runs in UTC like a hosted one");
    assert.equal(result.replayed, false);
    assert.equal(result.headcount, 3);
    assert.equal(result.status, "active");
    assert.equal(result.occasion, "wedding");
    assert.equal(result.event_date, date);
    assert.deepEqual(result.members.map((m) => [m.sequence, m.guest_label]), [[1, "Bride"], [2, "Mother"], [3, "Aunt"]]);

    const bookings = await bookingRows(ids);
    assert.equal(bookings.length, 3);
    for (const b of bookings) {
      assert.equal(b.customer_id, host.sub, "created as the host, through the normal engine");
      assert.equal(b.branch_id, SEED.branch1);
      assert.equal(riyadhDate(b.scheduled_at.toISOString()), date);
    }
    assert.deepEqual(plan.map((g) => g.employee_id).sort(), bookings.map((b) => b.employee_id).sort());
    assert.ok(bookings.every((b) => b.status === "pending_payment" && Number(b.deposit_required) > 0));

    const [group] = await sys(db, `select * from group_bookings where id = $1`, [result.group_id]);
    assert.equal(group.host_id, host.sub);
    assert.equal(group.provider_id, SEED.provider1);
    assert.equal(group.branch_id, SEED.branch1);
    assert.equal(group.notes, "Henna night");
    assert.equal(group.payment_due_at, null, "no hold chosen: the platform's standard hold applies");
    assert.equal(await count("group_booking_members", `group_id = $1`, [result.group_id]), 3);

    const deposits = bookings.reduce((sum, b) => sum + Number(b.deposit_required), 0);
    assert.equal(result.payment.deposit_due, deposits);
    assert.equal(result.payment.awaiting_payment, 3);
    const [summary] = await as(db, host, `select * from group_booking_payment_summary where group_id = $1`, [result.group_id]);
    assert.equal(Number(summary.deposit_due), deposits);
    assert.equal(summary.member_count, 3);
    assert.equal(summary.awaiting_payment_count, 3);
    assert.equal(summary.effective_status, "active");

    assert.equal(await count("admin_audit_logs", `action = 'group_booking.created'`), auditBefore + 1);
    const [{ n }] = await sys(db, `select count(*)::int n from notifications where user_id = $1 and data->>'group_id' = $2`, [host.sub, result.group_id]);
    assert.equal(n, 1, "one notification tells the host each guest booking needs its own deposit");
  });

  it("books a guest with several services through the same engine, and a guest from a saved profile", async () => {
    const host = await newCustomer();
    const [profile] = await sys(db, `insert into client_profiles (client_id, name, type) values ($1, 'Little Noor', 'dependent') returning id`, [host.sub]);
    const guests = [
      { label: "Bride", services: [{ service_id: S1 }, { service_id: S2 }], employee_id: E1 },
      { client_profile_id: profile.id, services: [{ service_id: S3 }], employee_id: E3 },
    ];
    const { result, ids } = await makeGroup(host, { guests });
    const [bride, noor] = result.members;
    assert.equal(bride.guest_label, "Bride");
    assert.equal(noor.guest_label, "Little Noor", "the saved profile's name labels the guest");
    assert.equal(await count("booking_services", `booking_id = $1`, [bride.booking_id]), 2);
    const [b] = await sys(db, `select client_profile_id from bookings where id = $1`, [noor.booking_id]);
    assert.equal(b.client_profile_id, profile.id);
    assert.equal(ids.length, 2);
  });

  it("refuses somebody else's saved profile without creating anything", async () => {
    const host = await newCustomer();
    const other = await newCustomer();
    const [profile] = await sys(db, `insert into client_profiles (client_id, name, type) values ($1, 'Not yours', 'dependent') returning id`, [other.sub]);
    const date = freshDate();
    const plan = await planned(host, date, trio());
    const before = [await count("bookings"), await count("group_bookings")];
    await expectError(create(host, date, [{ ...plan[0], client_profile_id: profile.id }, plan[1]]), /saved profile that was not found/);
    assert.deepEqual([await count("bookings"), await count("group_bookings")], before);
  });

  it("answers a repeated request with the same group, and refuses a key reused for a different one", async () => {
    const host = await newCustomer();
    const date = freshDate();
    const plan = await planned(host, date, trio());
    const key = crypto.randomUUID();
    const first = await create(host, date, plan, { key });
    const bookingsBefore = await count("bookings");
    const again = await create(host, date, plan, { key });
    assert.equal(again.replayed, true);
    assert.equal(again.group_id, first.group_id);
    assert.deepEqual(again.members.map((m) => m.booking_id), first.members.map((m) => m.booking_id));
    assert.equal(await count("bookings"), bookingsBefore, "a replay books nothing more");
    assert.equal(await count("group_bookings", `idempotency_key = $1`, [key]), 1);
    await expectError(create(host, date, plan, { key, notes: "A different note" }), /already used for a different group/);
    await expectError(create(host, date, plan.slice(0, 2), { key }), /already used for a different group/);
    // The same key belongs to the host who used it: somebody else's request with it is a new, independent request.
    const other = await newCustomer();
    const otherDate = freshDate();
    const otherPlan = await planned(other, otherDate, trio());
    assert.equal((await create(other, otherDate, otherPlan, { key })).replayed, false);
  });

  it("rolls back every guest when one of them cannot be booked, and the same key works once the request is fixed", async () => {
    const host = await newCustomer();
    const date = freshDate();
    const plan = await planned(host, date, trio());
    const key = crypto.randomUUID();
    const tables = ["bookings", "group_bookings", "group_booking_members", "notifications"];
    const before = await Promise.all(tables.map((t) => count(t)));

    // Guest 2 asks for professional 1 at guest 1's time: the engine refuses the slot after guest 1 was already booked.
    const clash = [plan[0], { ...plan[1], employee_id: E1, services: [{ service_id: S1 }], scheduled_at: plan[0].scheduled_at }, plan[2]];
    const e = await expectError(create(host, date, clash, { key }), /Guest 2 could not be booked/);
    assert.match(e.message, /no longer available|No professional/);
    assert.deepEqual(await Promise.all(tables.map((t) => count(t))), before, "nothing of the failed group remains");

    // A guest whose service belongs to another provider fails the same way, after two guests were booked.
    const foreign = [plan[0], plan[1], { ...plan[2], services: [{ service_id: PROVIDER2_SERVICE }] }];
    await expectError(create(host, date, foreign, { key }), /Guest 3 could not be booked/);
    assert.deepEqual(await Promise.all(tables.map((t) => count(t))), before);

    const ok = await create(host, date, plan, { key });
    assert.equal(ok.replayed, false);
    assert.equal(ok.members.length, 3);
  });

  it("holds a provider to the size it chose", async () => {
    const host = await newCustomer();
    await enable(owner, SEED.provider1, 3, null);
    try {
      const date = freshDate();
      const four = Array.from({ length: 4 }, (_, i) => ({ label: `Guest ${i + 1}`, services: [{ service_id: S2 }], scheduled_at: `${date}T0${6 + i}:00:00Z` }));
      await expectError(preview(host, date, four), /at most 3 guests/);
      await expectError(create(host, date, four), /at most 3 guests/);
      await expectError(create(host, date, four.slice(0, 1)), /at least 2 guests/);
      const ok = await create(host, date, await planned(host, date, four.slice(0, 3)));
      assert.equal(ok.headcount, 3);
    } finally {
      await enable(owner, SEED.provider1, 6, null);
    }
  });

  it("refuses a provider that has not enabled groups, or has switched them off again", async () => {
    const host = await newCustomer();
    const date = freshDate();
    const guests = [{ label: "A", services: [{ service_id: PROVIDER2_SERVICE }] }, { label: "B", services: [{ service_id: PROVIDER2_SERVICE }] }];
    await expectError(preview(host, date, guests, PROVIDER2_BRANCH), /does not offer group bookings/);
    await sys(db, `update provider_group_settings set enabled = false where provider_id = $1`, [SEED.provider1]);
    try {
      await expectError(preview(host, date, trio()), /does not offer group bookings/);
      await expectError(create(host, date, trio().map((g) => ({ ...g, scheduled_at: `${date}T07:00:00Z` }))), /does not offer group bookings/);
    } finally {
      await sys(db, `update provider_group_settings set enabled = true where provider_id = $1`, [SEED.provider1]);
    }
  });

  it("validates the request", async () => {
    const host = await newCustomer();
    const date = freshDate();
    const plan = await planned(host, date, trio());
    const bad = (guests, pattern, options) => expectError(create(host, date, guests, options), pattern);
    await bad(plan, /idempotency key of 8 to 128/, { key: "short" });
    await expectError(as(db, host, `select create_group_booking($1, $2::date, null, 'n', $3::jsonb, $4)`, [SEED.branch1, date, JSON.stringify(plan), crypto.randomUUID()]), /occasion is required/);
    await bad(plan, /longer than 1000/, { notes: "n".repeat(1001) });
    await bad(plan.map((g) => ({ ...g, scheduled_at: undefined })), /needs a start time/);
    await bad([plan[0], { ...plan[1], scheduled_at: `${freshDate()}T07:00:00Z` }, plan[2]], /must be booked on the event date/);
    // 21:30 UTC is half past midnight in Riyadh: the next day, so not the event date even though the UTC date matches.
    await bad([plan[0], { ...plan[1], scheduled_at: `${date}T21:30:00Z` }, plan[2]], /must be booked on the event date/);
    await bad([plan[0], { ...plan[1], label: undefined }, plan[2]], /needs a name or a saved profile/);
    await expectError(create(host, "2020-01-01", plan), /cannot be in the past/);
    assert.equal(await count("group_bookings", `host_id = $1`, [host.sub]), 0, "every refused request left nothing behind");
  });

  it("is for signed-in customers only", async () => {
    const date = freshDate();
    const plan = trio().map((g) => ({ ...g, scheduled_at: `${date}T07:00:00Z` }));
    await expectError(create(ROLES.anon, date, plan), /permission denied|Authentication required/);
    await expectError(create(ROLES.service, date, plan), /Authentication required/);
    assert.equal(await count("group_bookings", `event_date = $1::date`, [date]), 0);
  });
});

describe("cancelling", () => {
  it("lets the host cancel the whole group through cancel_booking, refunding a paid deposit", async () => {
    const host = await newCustomer();
    const { result, ids } = await makeGroup(host);
    const [paid] = await bookingRows([ids[0]]);
    await as(db, ROLES.service, `select confirm_booking_payment($1, $2, $3)`, [paid.id, `chg_${paid.id}`, paid.deposit_required]);

    const r = await cancelGroup(host, result.group_id);
    assert.equal(r.cancelled, 3);
    assert.equal(r.failed, 0);
    assert.deepEqual(r.results.map((x) => x.outcome), ["cancelled", "cancelled", "cancelled"]);
    const bookings = await bookingRows(ids);
    assert.ok(bookings.every((b) => b.status === "cancelled" && b.cancelled_by === "customer"));
    const refunded = bookings.find((b) => b.id === paid.id);
    assert.equal(Number(refunded.refund_amount), Number(paid.deposit_required), "the paid deposit is refunded by the existing cancellation flow");
    const [group] = await sys(db, `select status, cancelled_at, cancel_reason from group_bookings where id = $1`, [result.group_id]);
    assert.equal(group.status, "cancelled");
    assert.ok(group.cancelled_at);
    const [summary] = await as(db, host, `select * from group_booking_payment_summary where group_id = $1`, [result.group_id]);
    assert.equal(summary.effective_status, "cancelled");
    assert.equal(Number(summary.deposit_due), 0);

    const again = await cancelGroup(host, result.group_id);
    assert.equal(again.cancelled, 0);
    assert.deepEqual(again.results.map((x) => x.outcome), ["already_cancelled", "already_cancelled", "already_cancelled"]);
  });

  it("cancels one guest and leaves the others, and ends the group with its last guest", async () => {
    const host = await newCustomer();
    const { result, ids } = await makeGroup(host);
    const r = await cancelMember(host, ids[1], "Mother cannot come");
    assert.equal(r.cancelled, 1);
    assert.equal(r.results.length, 1);
    assert.equal(r.results[0].sequence, 2);
    assert.deepEqual((await bookingRows(ids)).map((b) => b.status).sort(), ["cancelled", "pending_payment", "pending_payment"]);
    assert.equal((await sys(db, `select status from group_bookings where id = $1`, [result.group_id]))[0].status, "active");

    assert.equal((await cancelMember(host, ids[1])).results[0].outcome, "already_cancelled");
    await cancelMember(host, ids[0]);
    assert.equal((await sys(db, `select status from group_bookings where id = $1`, [result.group_id]))[0].status, "active");
    await cancelMember(host, ids[2]);
    assert.equal((await sys(db, `select status from group_bookings where id = $1`, [result.group_id]))[0].status, "cancelled");
  });

  it("leaves a guest who was already served alone when the group is cancelled", async () => {
    const host = await newCustomer();
    const { result, ids } = await makeGroup(host);
    await sys(db, `update bookings set status = 'completed' where id = $1`, [ids[2]]);
    const r = await cancelGroup(host, result.group_id);
    assert.equal(r.cancelled, 2);
    assert.deepEqual(r.results.map((x) => x.outcome), ["cancelled", "cancelled", "not_cancellable"]);
    assert.equal((await sys(db, `select status from group_bookings where id = $1`, [result.group_id]))[0].status, "active");
  });

  it("lets the provider's owner and a delegated manager cancel with a reason, refunding in full", async () => {
    const host = await newCustomer();
    const { result, ids } = await makeGroup(host);
    await expectError(cancelGroup(owner, result.group_id, null), /reason of at least 3/);
    await expectError(cancelMember(delegate, ids[0], "  "), /reason of at least 3/);
    const one = await cancelMember(delegate, ids[0], "Professional is unwell");
    assert.equal(one.cancelled, 1);
    const rest = await cancelGroup(owner, result.group_id, "Salon closed that day");
    assert.equal(rest.cancelled, 2);
    const bookings = await bookingRows(ids);
    assert.ok(bookings.every((b) => b.status === "cancelled" && b.cancelled_by === "provider"));
    assert.equal((await sys(db, `select status from group_bookings where id = $1`, [result.group_id]))[0].status, "cancelled");
  });

  it("answers 'not found' to everyone else, and refuses the signed-out", async () => {
    const host = await newCustomer();
    const { result, ids } = await makeGroup(host);
    const outsiders = [await newCustomer(), otherOwner, stranger, employeeUser, admin];
    for (const who of outsiders) {
      await expectError(cancelGroup(who, result.group_id, "Because I can"), /Group booking not found/);
      await expectError(cancelMember(who, ids[0], "Because I can"), /Group booking not found/);
    }
    await expectError(cancelGroup(host, "99999999-9999-4999-8999-999999999999"), /Group booking not found/);
    await expectError(cancelMember(host, "99999999-9999-4999-8999-999999999999"), /Group booking not found/);
    await expectError(cancelGroup(ROLES.anon, result.group_id), /permission denied|Authentication required/);
    await expectError(cancelMember(ROLES.anon, ids[0]), /permission denied|Authentication required/);
    await expectError(cancelGroup(ROLES.service, result.group_id), /Authentication required/);
    await expectError(cancelMember(ROLES.service, ids[0]), /Authentication required/);
    assert.ok((await bookingRows(ids)).every((b) => b.status === "pending_payment"), "every refused call left the bookings alone");
  });

  it("does not treat an ordinary booking as a group member", async () => {
    const host = await newCustomer();
    const date = freshDate();
    const [b] = await as(db, host, `select * from create_booking($1, $2, $3::timestamptz)`, [E2, S2, await firstSlot(db, host, E2, date, 45)]);
    await expectError(cancelMember(host, b.id), /Group booking not found/);
    assert.equal((await bookingRows([b.id]))[0].status, "pending_payment");
  });
});

describe("the payment deadline", () => {
  const stale = (ids) => sys(db, `update bookings set created_at = now() - interval '2 hours' where id = any($1::uuid[])`, [ids]);
  const sweep = () => as(db, ROLES.service, `select expire_stale_booking_holds() n`).then((r) => r[0].n);

  it("releases unpaid guest bookings after the standard hold when the provider chose no longer one", async () => {
    const host = await newCustomer();
    const { result, ids } = await makeGroup(host);
    await stale(ids);
    await sweep();
    assert.ok((await bookingRows(ids)).every((b) => b.status === "cancelled"));
    const [summary] = await as(db, host, `select * from group_booking_payment_summary where group_id = $1`, [result.group_id]);
    assert.equal(summary.effective_status, "cancelled", "a group whose every guest lapsed reads as cancelled");
  });

  it("keeps them until the group's deadline when the provider chose a longer hold, then releases them", async () => {
    await enable(owner, SEED.provider1, 6, 48);
    try {
      const host = await newCustomer();
      const { result, ids } = await makeGroup(host);
      const [group] = await sys(db, `select payment_due_at, created_at from group_bookings where id = $1`, [result.group_id]);
      assert.ok(group.payment_due_at, "a deadline is recorded");
      const hours = (group.payment_due_at - group.created_at) / 3600000;
      assert.ok(hours > 0 && hours <= 48, "no later than the hold the provider chose");
      await stale(ids);
      await sweep();
      assert.ok((await bookingRows(ids)).every((b) => b.status === "pending_payment"), "held while the deadline is in the future");

      await sys(db, `update group_bookings set payment_due_at = now() - interval '1 minute' where id = $1`, [result.group_id]);
      await sweep();
      assert.ok((await bookingRows(ids)).every((b) => b.status === "cancelled"), "released once the deadline has passed");
    } finally {
      await enable(owner, SEED.provider1, 6, null);
    }
  });

  it("does not hold an ordinary booking, and pays one guest at a time", async () => {
    await enable(owner, SEED.provider1, 6, 48);
    try {
      const host = await newCustomer();
      const { result, ids } = await makeGroup(host);
      const [b0] = await bookingRows([ids[0]]);
      await as(db, ROLES.service, `select confirm_booking_payment($1, $2, $3)`, [b0.id, `chg_${b0.id}`, b0.deposit_required]);
      const [summary] = await as(db, host, `select * from group_booking_payment_summary where group_id = $1`, [result.group_id]);
      assert.equal(summary.confirmed_count, 1);
      assert.equal(summary.awaiting_payment_count, 2);
      const rest = (await bookingRows(ids.slice(1))).reduce((sum, b) => sum + Number(b.deposit_required), 0);
      assert.equal(Number(summary.deposit_due), rest, "the deposit still due is the sum of the unpaid guests' deposits");

      const other = await newCustomer();
      const [plain] = await as(db, other, `select * from create_booking($1, $2, $3::timestamptz)`, [E2, S2, await firstSlot(db, other, E2, freshDate(), 45)]);
      await stale([plain.id]);
      await sweep();
      assert.equal((await bookingRows([plain.id]))[0].status, "cancelled");
    } finally {
      await enable(owner, SEED.provider1, 6, null);
    }
  });
});

describe("who can read a group", () => {
  it("shows a group to its host, the provider's owner and a delegated manager, and to nobody else", async () => {
    const host = await newCustomer();
    const { result, ids } = await makeGroup(host);
    const id = result.group_id;
    for (const who of [host, owner, delegate]) {
      assert.equal((await as(db, who, `select 1 from group_bookings where id = $1`, [id])).length, 1);
      assert.equal((await as(db, who, `select 1 from group_booking_members where group_id = $1`, [id])).length, 3);
      assert.equal((await as(db, who, `select 1 from group_booking_payment_summary where group_id = $1`, [id])).length, 1);
    }
    for (const who of [await newCustomer(), otherOwner, stranger, employeeUser]) {
      assert.equal((await as(db, who, `select 1 from group_bookings`)).length, 0);
      assert.equal((await as(db, who, `select 1 from group_booking_members where group_id = $1`, [id])).length, 0);
      assert.equal((await as(db, who, `select 1 from group_booking_payment_summary where group_id = $1`, [id])).length, 0);
    }
    assert.equal(ids.length, 3);
  });

  it("gives an administrator counts only, never the rows", async () => {
    assert.equal((await as(db, admin, `select 1 from group_bookings`)).length, 0);
    assert.equal((await as(db, admin, `select 1 from group_booking_members`)).length, 0);
    assert.equal((await as(db, admin, `select 1 from group_booking_payment_summary`)).length, 0);
    const before = await count("admin_audit_logs", `action = 'admin.group_booking_counts.viewed'`);
    const [{ r }] = await as(db, admin, `select admin_group_booking_counts() r`);
    assert.equal(r.groups_total, await count("group_bookings"));
    assert.equal(r.groups_active, await count("group_bookings", `status = 'active'`));
    assert.equal(r.by_occasion.wedding, await count("group_bookings", `occasion = 'wedding'`));
    assert.equal(r.providers_enabled, 1);
    assert.ok(!JSON.stringify(r).includes("Bride"), "no guest label in the counts");
    assert.equal(await count("admin_audit_logs", `action = 'admin.group_booking_counts.viewed'`), before + 1);
    for (const who of [await newCustomer(), owner, delegate, stranger, employeeUser]) {
      await expectError(as(db, who, `select admin_group_booking_counts()`), /Administrator access required/);
    }
    await expectError(as(db, ROLES.anon, `select admin_group_booking_counts()`), /permission denied|Administrator access required/);
    await expectError(as(db, ROLES.service, `select admin_group_booking_counts()`), /Administrator access required/);
  });

  it("refuses the signed-out and every direct write", async () => {
    const host = await newCustomer();
    const { result } = await makeGroup(host);
    for (const table of ["group_bookings", "group_booking_members", "group_booking_payment_summary"]) {
      await expectError(as(db, ROLES.anon, `select 1 from ${table}`), /permission denied/);
    }
    for (const who of [host, owner, delegate, admin, stranger]) {
      await expectError(as(db, who, `update group_bookings set headcount = 30 where id = $1`, [result.group_id]), /permission denied|row-level/);
      await expectError(as(db, who, `delete from group_bookings where id = $1`, [result.group_id]), /permission denied|row-level/);
      await expectError(as(db, who, `update group_booking_members set guest_label = 'Changed' where group_id = $1`, [result.group_id]), /permission denied|row-level/);
      await expectError(as(db, who, `insert into group_bookings (host_id, provider_id, branch_id, event_date, occasion, headcount, request_fingerprint, idempotency_key)
                                      values ($1, $2, $3, current_date, 'party', 2, 'x', 'forged-key-0001')`, [who.sub, SEED.provider1, SEED.branch1]), /permission denied|row-level/);
    }
    assert.equal((await sys(db, `select headcount from group_bookings where id = $1`, [result.group_id]))[0].headcount, 3);
  });

  it("keeps the engine's helpers out of reach of clients", async () => {
    const host = await newCustomer();
    const date = freshDate();
    for (const sql of [
      `select group_booking_parse_guests('[]'::jsonb, false)`,
      `select group_booking_summary(gen_random_uuid())`,
      `select group_booking_cancel_members(gen_random_uuid(), null, 'a reason')`,
      `select group_booking_check_request('${SEED.branch1}'::uuid, '${date}'::date, 2)`,
    ]) {
      await expectError(as(db, host, sql), /permission denied/);
    }
  });
});

describe("the core booking engine", () => {
  it("still has exactly one definition of each core function, and the migrations do not redefine them", async () => {
    for (const name of ["create_booking", "cancel_booking", "reschedule_booking", "booking_create_internal", "get_available_slots", "confirm_booking_payment"]) {
      const rows = await sys(db, `select count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = $1`, [name]);
      assert.equal(rows[0].n, 1, `${name} has one definition`);
    }
    for (const file of ["20261008500000_group_booking_tables.sql", "20261008500100_group_booking_commands.sql"]) {
      const text = readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf8");
      assert.doesNotMatch(text, /(CREATE|REPLACE)\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.(create_booking|cancel_booking|reschedule_booking|booking_create_internal|get_available_slots|confirm_booking_payment)\s*\(/i, file);
    }
  });
});
