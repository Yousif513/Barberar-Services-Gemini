import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { as, createMigratedDb, createUser, expectError, firstSlot, MIGRATIONS_DIR, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// G69 part 2: signed, retried, idempotent booking webhooks, exercised through real booking flows.

let db;
let admin;
let employee;
let svc;
let date;
let provider2Branch;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);

const vectors = JSON.parse(readFileSync(new URL("../fixtures/webhook-url-vectors.json", import.meta.url), "utf8"));
const outcome = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);
const failure = (promise) => promise.then(() => null, (error) => ({ code: error.code, message: error.message }));
const setSetting = (key, value) => as(db, admin, `select admin_set_api_setting($1, $2::jsonb, 'Webhook test setup')`, [key, JSON.stringify(value)]);
const service = (sql, params) => as(db, ROLES.service, sql, params);

async function endpoint(user, over = {}) {
  const a = {
    provider: SEED.provider1, branch: null, name: `Endpoint ${Math.random().toString(36).slice(2, 8)}`,
    url: `https://hooks.example.com/${Math.random().toString(36).slice(2, 10)}`,
    events: "{booking.created,booking.confirmed,booking.cancelled,booking.completed}", ...over,
  };
  return (await as(db, user, `select create_webhook_endpoint($1, $2, $3, $4, $5::text[]) r`, [a.provider, a.branch, a.name, a.url, a.events]))[0].r;
}
const deliveries = (sql = "true", params = []) => sys(db, `select * from webhook_deliveries where ${sql} order by created_at, event_type`, params);
const book = (user, slot, source = "marketplace") => as(db, user,
  `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3, request_source => $4)`,
  [SEED.employee1, svc.id, slot, source]).then((r) => r[0]);
const confirm = (b) => as(db, ROLES.service, `select confirm_booking_payment($1, $2, $3) r`, [b.id, `chg_${b.id}`, b.deposit_required]);
let slotIndex = 0;
async function freshBooking(user = customer) {
  // Each test books a different day so bookings of the shared employee never collide.
  slotIndex += 1;
  const day = await nextWorkingDate(db, SEED.employee1, 3 + slotIndex * 7);
  return book(user, await firstSlot(db, customer, SEED.employee1, day, svc.duration), "link");
}

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  employee = ROLES.user(await createUser(db, { role: "provider_employee" }));
  await sys(db, `update employees set profile_id = $1 where id = $2`, [employee.sub, SEED.employee1]);
  await sys(db, `update providers set status = 'active' where id in ($1, $2)`, [SEED.provider1, SEED.provider2]);
  svc = await serviceFor(db, SEED.employee1);
  date = await nextWorkingDate(db, SEED.employee1);
  provider2Branch = (await sys(db, `select id from branches where provider_id = $1 limit 1`, [SEED.provider2]))[0].id;
});

describe("the address policy in the database", () => {
  for (const vector of vectors) {
    it(`${vector.ok ? "accepts" : `rejects as ${vector.reason}`}: ${vector.url.length > 60 ? vector.url.slice(0, 50) + "…" : JSON.stringify(vector.url)}`, async () => {
      const reason = (await sys(db, `select webhook_url_rejection($1) r`, [vector.url]))[0].r;
      assert.equal(reason, vector.ok ? null : vector.reason);
    });
  }

  it("is stricter than the TypeScript policy for backslashes, non-ASCII hosts and numeric last labels", async () => {
    for (const url of ["https://example.com\\@evil.example/", "https://bücher.de/", "https://example.123/", "https://exa%6dple.com/", "https://a..b.com/"]) {
      assert.notEqual((await sys(db, `select webhook_url_rejection($1) r`, [url]))[0].r, null, url);
    }
  });
});

describe("create_webhook_endpoint", () => {
  it("returns the signing secret once and keeps it where no client can read it", async () => {
    const created = await endpoint(owner1, { name: "Accounting hook" });
    assert.match(created.signing_secret, /^whsec_[0-9a-f]{64}$/);
    assert.deepEqual(created.event_types, ["booking.cancelled", "booking.completed", "booking.confirmed", "booking.created"]);
    const stored = (await sys(db, `select signing_secret from webhook_subscription_secrets where subscription_id = $1`, [created.id]))[0];
    assert.equal(stored.signing_secret, created.signing_secret);

    const holding = [];
    for (const { relname } of await sys(db, `select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'`)) {
      const n = (await sys(db, `select count(*)::int n from public."${relname}" t where t::text like $1`, [`%${created.signing_secret.slice(6)}%`]))[0].n;
      if (n > 0) holding.push(relname);
    }
    assert.deepEqual(holding, ["webhook_subscription_secrets"], "the secret exists in exactly one table");
    const log = JSON.stringify(await sys(db, `select * from admin_audit_logs`));
    assert.ok(!log.includes(created.signing_secret.slice(6)), "no secret in the audit log");
    assert.ok(!log.includes("hooks.example.com"), "the address can carry a token and is never logged");

    for (const [name, user] of [["owner", owner1], ["other owner", owner2], ["customer", customer], ["employee", employee], ["administrator", admin], ["anonymous", ROLES.anon]]) {
      for (const sql of [`select * from webhook_subscription_secrets`, `select signing_secret from webhook_subscription_secrets`]) {
        assert.equal(await outcome(as(db, user, sql)), "42501", `${name}: ${sql}`);
      }
    }
    const visible = (await as(db, owner1, `select * from webhook_subscriptions where id = $1`, [created.id]))[0];
    assert.ok(!Object.keys(visible).some((c) => /secret|signing/.test(c)), "the endpoint row has no secret column");
    assert.ok(!JSON.stringify(visible).includes(created.signing_secret));
  });

  it("is available only to the provider owner, validates its input and refuses a duplicate address", async () => {
    assert.equal(await outcome(endpoint(ROLES.anon)), "42501");
    for (const [name, user] of [["other owner", owner2], ["customer", customer], ["employee", employee], ["administrator", admin]]) {
      assert.equal(await outcome(endpoint(user)), "P0002", name);
    }
    assert.equal(await outcome(endpoint(owner1, { branch: provider2Branch })), "P0002");
    const bad = [
      ["a short name", { name: "ab" }], ["an http address", { url: "http://hooks.example.com/x" }], ["a private address", { url: "https://10.0.0.1/x" }],
      ["localhost", { url: "https://localhost/x" }], ["no events", { events: "{}" }], ["an unknown event", { events: "{booking.deleted}" }],
      ["a null event", { events: "{booking.created,NULL}" }],
    ];
    for (const [label, over] of bad) assert.equal(await outcome(endpoint(owner1, over)), "22023", label);
    const refused = await failure(endpoint(owner1, { url: "https://169.254.169.254/latest" }));
    assert.match(refused.message, /ip_literal/);
    const first = await endpoint(owner1, { url: "https://dup.example.com/hook" });
    assert.equal(await outcome(endpoint(owner1, { url: "https://DUP.example.com/hook" })), "23505");
    assert.equal(await outcome(endpoint(owner2, { provider: SEED.provider2, url: "https://dup.example.com/hook" })), "ok", "per provider");
    await as(db, owner1, `select delete_webhook_endpoint($1, 'Replaced by another address')`, [first.id]);
    assert.equal(await outcome(endpoint(owner1, { url: "https://dup.example.com/hook" })), "ok", "a deleted address can be registered again");
  });

  it("audits the creation without the address or the secret", async () => {
    const created = await endpoint(owner1, { name: "Audited hook", branch: SEED.branch1 });
    const row = (await sys(db, `select actor_id, details from admin_audit_logs where action = 'webhook_endpoint.created' and target_id = $1`, [created.id]))[0];
    assert.equal(row.actor_id, SEED.owner1);
    assert.equal(row.details.provider_id, SEED.provider1);
    assert.equal(row.details.branch_id, SEED.branch1);
  });
});

describe("managing an endpoint", () => {
  it("updates name and events, pauses, resumes, rotates the secret and deletes, all owner-only and replay-safe", async () => {
    const e = await endpoint(owner1, { name: "Lifecycle hook" });
    const strangers = [["other owner", owner2], ["customer", customer], ["employee", employee], ["administrator", admin]];
    const calls = [
      [`select update_webhook_endpoint($1, 'Renamed hook', '{booking.created}'::text[])`], [`select set_webhook_endpoint_active($1, false, 'Maintenance window')`],
      [`select rotate_webhook_secret($1, 'Suspected leak')`], [`select delete_webhook_endpoint($1, 'No longer needed')`],
    ];
    for (const [sql] of calls) {
      assert.equal(await outcome(as(db, ROLES.anon, sql, [e.id])), "42501", sql);
      for (const [name, user] of strangers) assert.equal(await outcome(as(db, user, sql, [e.id])), "P0002", `${name}: ${sql}`);
    }
    assert.equal(await outcome(as(db, owner1, `select update_webhook_endpoint($1, 'x', '{booking.created}'::text[])`, [e.id])), "22023");
    assert.equal(await outcome(as(db, owner1, `select update_webhook_endpoint($1, 'Renamed hook', '{}'::text[])`, [e.id])), "22023");
    assert.equal(await outcome(as(db, owner1, `select set_webhook_endpoint_active($1, false, 'no')`, [e.id])), "22023");

    await as(db, owner1, `select update_webhook_endpoint($1, 'Renamed hook', '{booking.created}'::text[])`, [e.id]);
    assert.deepEqual((await sys(db, `select name, event_types from webhook_subscriptions where id = $1`, [e.id]))[0], { name: "Renamed hook", event_types: ["booking.created"] });

    const paused = (await as(db, owner1, `select set_webhook_endpoint_active($1, false, 'Maintenance window') r`, [e.id]))[0].r;
    assert.deepEqual(paused, { id: e.id, is_active: false, changed: true });
    assert.equal((await as(db, owner1, `select set_webhook_endpoint_active($1, false, 'Maintenance window') r`, [e.id]))[0].r.changed, false);
    assert.equal((await sys(db, `select disabled_reason from webhook_subscriptions where id = $1`, [e.id]))[0].disabled_reason, "owner");
    await as(db, owner1, `select set_webhook_endpoint_active($1, true, 'Maintenance finished')`, [e.id]);
    assert.deepEqual((await sys(db, `select is_active, disabled_reason, consecutive_failures from webhook_subscriptions where id = $1`, [e.id]))[0], { is_active: true, disabled_reason: null, consecutive_failures: 0 });

    const rotated = (await as(db, owner1, `select rotate_webhook_secret($1, 'Suspected leak') r`, [e.id]))[0].r;
    assert.match(rotated.signing_secret, /^whsec_[0-9a-f]{64}$/);
    assert.notEqual(rotated.signing_secret, e.signing_secret);
    assert.equal((await sys(db, `select signing_secret from webhook_subscription_secrets where subscription_id = $1`, [e.id]))[0].signing_secret, rotated.signing_secret);
    assert.ok(!JSON.stringify(await sys(db, `select * from admin_audit_logs`)).includes(rotated.signing_secret.slice(6)));

    const gone = (await as(db, owner1, `select delete_webhook_endpoint($1, 'No longer needed') r`, [e.id]))[0].r;
    assert.deepEqual(gone, { id: e.id, deleted: true, changed: true });
    assert.equal((await as(db, owner1, `select delete_webhook_endpoint($1, 'No longer needed') r`, [e.id]))[0].r.changed, false);
    assert.equal((await sys(db, `select count(*)::int n from webhook_subscription_secrets where subscription_id = $1`, [e.id]))[0].n, 0, "the secret is destroyed");
    assert.equal((await as(db, owner1, `select id from webhook_subscriptions where id = $1`, [e.id])).length, 0, "a deleted endpoint disappears from the owner's view");
    assert.equal(await outcome(as(db, owner1, `select update_webhook_endpoint($1, 'Renamed again', '{booking.created}'::text[])`, [e.id])), "P0002");
    for (const action of ["webhook_endpoint.paused", "webhook_endpoint.resumed", "webhook_endpoint.secret_rotated", "webhook_endpoint.deleted", "webhook_endpoint.updated"]) {
      assert.equal((await sys(db, `select count(*)::int n from admin_audit_logs where action = $1 and target_id = $2`, [action, e.id]))[0].n, 1, action);
    }
  });
});

describe("who can read or write the tables", () => {
  let mine;
  let theirs;
  before(async () => {
    mine = await endpoint(owner1, { name: "Visible to owner one" });
    theirs = await endpoint(owner2, { provider: SEED.provider2, name: "Visible to owner two" });
  });

  it("shows endpoints only to their provider's owner and to administrators", async () => {
    const ids = (user) => as(db, user, `select id from webhook_subscriptions`).then((rows) => rows.map((r) => r.id));
    assert.ok((await ids(owner1)).includes(mine.id) && !(await ids(owner1)).includes(theirs.id));
    assert.ok((await ids(owner2)).includes(theirs.id) && !(await ids(owner2)).includes(mine.id));
    assert.deepEqual(await ids(customer), []);
    assert.deepEqual(await ids(employee), []);
    const all = await ids(admin);
    assert.ok(all.includes(mine.id) && all.includes(theirs.id));
    assert.equal(await outcome(as(db, ROLES.anon, `select id from webhook_subscriptions`)), "42501");
  });

  it("refuses every direct write from a client role", async () => {
    for (const [name, user] of [["owner", owner1], ["administrator", admin], ["customer", customer], ["anonymous", ROLES.anon]]) {
      for (const sql of [
        `insert into webhook_subscriptions (provider_id, target_url, event_types) values ('${SEED.provider1}', 'http://169.254.169.254/', '{booking.created}')`,
        `update webhook_subscriptions set target_url = 'http://127.0.0.1/' where id = '${mine.id}'`,
        `delete from webhook_subscriptions where id = '${mine.id}'`,
        `insert into webhook_deliveries (subscription_id, provider_id, booking_id, event_id, event_type, payload) values ('${mine.id}', '${SEED.provider1}', gen_random_uuid(), gen_random_uuid(), 'booking.created', '{}')`,
        `update webhook_deliveries set status = 'delivered'`, `delete from webhook_deliveries`,
      ]) assert.equal(await outcome(as(db, user, sql)), "42501", `${name}: ${sql.slice(0, 50)}`);
    }
  });
});

describe("enqueueing on real booking transitions", () => {
  let hook;
  before(async () => {
    await setSetting("api.webhook_max_attempts", 3);
    await setSetting("api.webhook_retry_base_seconds", 10);
    // Park the endpoints made by earlier blocks so each booking produces exactly the deliveries of this block's receiver.
    await sys(db, `update webhook_subscriptions set is_active = false where provider_id is not null`);
    hook = await endpoint(owner1, { name: "Primary receiver", url: "https://receiver.example.com/primora" });
  });

  it("does nothing while delivery settings are unset, and starts without a backlog once they are set", async () => {
    await setSetting("api.webhook_max_attempts", null);
    const quiet = await freshBooking();
    assert.equal((await deliveries("booking_id = $1", [quiet.id])).length, 0);
    await as(db, owner1, `select cancel_booking($1, 'cleanup')`, [quiet.id]);
    await setSetting("api.webhook_max_attempts", 3);
    assert.equal((await deliveries("booking_id = $1", [quiet.id])).length, 0, "nothing from the quiet period appears later");
    await setSetting("api.webhook_retry_base_seconds", null);
    assert.equal((await service(`select webhook_delivery_settings() s`))[0].s.enabled, false, "either setting unset switches delivery off");
    await setSetting("api.webhook_retry_base_seconds", 10);
  });

  it("emits created, confirmed and cancelled with stable ids, once each, and nothing for other changes", async () => {
    const b = await freshBooking();
    let rows = await deliveries("booking_id = $1", [b.id]);
    assert.deepEqual(rows.map((r) => r.event_type), ["booking.created"]);
    assert.equal(rows[0].event_id, (await sys(db, `select md5('primora:booking-event:' || $1::text || ':booking.created')::uuid id`, [b.id]))[0].id);
    assert.equal(rows[0].status, "pending");
    assert.equal(rows[0].attempt_count, 0);

    await confirm(b);
    await confirm(b);
    await sys(db, `update bookings set status = status where id = $1`, [b.id]);
    await sys(db, `update bookings set duration_minutes = duration_minutes where id = $1`, [b.id]);
    rows = await deliveries("booking_id = $1", [b.id]);
    assert.deepEqual(rows.map((r) => r.event_type).sort(), ["booking.confirmed", "booking.created"], "a replayed confirmation and no-op updates add nothing");

    await as(db, owner1, `select cancel_booking($1, 'Customer asked')`, [b.id]);
    rows = await deliveries("booking_id = $1", [b.id]);
    assert.deepEqual(rows.map((r) => r.event_type).sort(), ["booking.cancelled", "booking.confirmed", "booking.created"]);
    assert.equal(new Set(rows.map((r) => r.event_id)).size, 3);
    await expectError(sys(db, `insert into webhook_deliveries (subscription_id, provider_id, booking_id, event_id, event_type, payload)
                               values ($1, $2, $3, $4, 'booking.created', '{}')`, [hook.id, SEED.provider1, b.id, rows[0].event_id]), /duplicate key|unique/i);
  });

  it("emits created and confirmed for a booking inserted as confirmed, and completed on completion", async () => {
    const past = (await sys(db,
      `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount, deposit_required, platform_commission, source)
       values ($1, $2, $3, $4, 'confirmed', now() - interval '3 hours' - interval '200 days', $5, $6, $6, 1, 0, 0, 'link') returning *`,
      [SEED.customer, SEED.branch1, SEED.employee1, svc.id, svc.duration, svc.price]))[0];
    assert.deepEqual((await deliveries("booking_id = $1", [past.id])).map((r) => r.event_type).sort(), ["booking.confirmed", "booking.created"]);
    await as(db, owner1, `select employee_update_booking_status($1, 'completed')`, [past.id]);
    assert.ok((await deliveries("booking_id = $1", [past.id])).some((r) => r.event_type === "booking.completed"));
  });

  it("carries booking facts only: no customer name, phone, email, notes, address or payment details", async () => {
    await sys(db, `update profiles set first_name = 'Zainab', last_name = 'Qahtani', email = 'zainab.q@example.test' where id = $1`, [SEED.customer]);
    const b = await freshBooking();
    await sys(db, `update bookings set walk_in_name = 'Walk In Person', walk_in_phone = '+966511112222', cancellation_reason = 'private reason' where id = $1`, [b.id]);
    await confirm(b);
    const rows = await deliveries("booking_id = $1", [b.id]);
    assert.equal(rows.length, 2);
    const text = JSON.stringify(rows.map((r) => r.payload));
    for (const secret of ["Zainab", "Qahtani", "zainab.q", "Walk In Person", "+966511112222", "private reason", SEED.customer, "chg_", "customer_id", "phone", "email", "home_address"]) {
      assert.ok(!text.includes(secret), `payload must not contain ${secret}`);
    }
    const payload = rows.find((r) => r.event_type === "booking.confirmed").payload;
    assert.equal(payload.id, rows.find((r) => r.event_type === "booking.confirmed").event_id);
    assert.equal(payload.type, "booking.confirmed");
    assert.equal(payload.api_version, "v1");
    assert.deepEqual(Object.keys(payload.data.booking).sort(), [
      "branch_id", "created_at", "currency", "discount_amount", "duration_minutes", "employee_id", "id", "is_home_service", "scheduled_at",
      "service_id", "service_name_en", "service_name_ar", "source", "status", "tax_amount", "total_price"].sort());
    assert.equal(payload.data.booking.currency, "SAR");
    assert.equal(payload.data.booking.id, b.id);
    await as(db, owner1, `select cancel_booking($1, 'cleanup')`, [b.id]);
  });

  it("delivers only to the owning provider's active endpoints that subscribed to the event and branch", async () => {
    const other = await endpoint(owner2, { provider: SEED.provider2, name: "Other provider hook", url: "https://other.example.com/hook" });
    const cancelsOnly = await endpoint(owner1, { name: "Cancellations only", url: "https://cancel.example.com/hook", events: "{booking.cancelled}" });
    const wrongBranch = await endpoint(owner2, { provider: SEED.provider2, branch: provider2Branch, name: "Provider two branch hook", url: "https://branch2.example.com/hook" });
    const paused = await endpoint(owner1, { name: "Paused hook", url: "https://paused.example.com/hook" });
    await as(db, owner1, `select set_webhook_endpoint_active($1, false, 'Paused for the test')`, [paused.id]);
    const b = await freshBooking();
    const created = await deliveries("booking_id = $1", [b.id]);
    const subs = created.map((r) => r.subscription_id);
    assert.ok(subs.includes(hook.id));
    for (const e of [other, cancelsOnly, wrongBranch, paused]) assert.ok(!subs.includes(e.id), "must not receive a booking.created of provider one");
    await as(db, owner1, `select cancel_booking($1, 'Customer asked')`, [b.id]);
    const cancelled = (await deliveries("booking_id = $1 and event_type = 'booking.cancelled'", [b.id])).map((r) => r.subscription_id);
    assert.ok(cancelled.includes(cancelsOnly.id) && cancelled.includes(hook.id));
    assert.ok(!cancelled.includes(paused.id) && !cancelled.includes(other.id));
  });

  it("shows deliveries to the owner of the provider and to nobody else", async () => {
    const count = (user) => as(db, user, `select count(*)::int n from webhook_deliveries`).then((r) => r[0].n, () => 0);
    assert.ok((await count(owner1)) > 0);
    assert.equal(await count(owner2), 0, "provider two has no delivery of provider one, and no booking of its own in this test");
    assert.equal(await count(customer), 0);
    assert.equal(await count(employee), 0);
    assert.equal(await count(ROLES.anon), 0);
    assert.equal(await count(admin), 0, "console sessions read no delivery payloads directly (SECFIX-2 R2-H1)");
  });
});

describe("the delivery state machine", () => {
  let ep;
  let delivery;
  const claim = (limit = 50) => service(`select webhook_claim_deliveries($1) r`, [limit]).then((r) => r[0].r);
  const record = (id, attempt, delivered, status = delivered ? 200 : 500, note = delivered ? null : "The endpoint answered 500") =>
    service(`select webhook_record_attempt($1, $2, $3, $4, $5) r`, [id, attempt, delivered, status, note]).then((r) => r[0].r);
  const mine = (claimed) => claimed.filter((c) => c.subscription_id === ep.id);
  const makeDue = (id) => sys(db, `update webhook_deliveries set next_attempt_at = now() - interval '1 second' where id = $1`, [id]);

  before(async () => {
    await setSetting("api.webhook_max_attempts", 3);
    await setSetting("api.webhook_retry_base_seconds", 10);
    await setSetting("api.webhook_disable_after_failures", null);
    // Park every endpoint created by earlier tests so this block sees only its own delivery.
    await sys(db, `update webhook_subscriptions set is_active = false where provider_id is not null`);
    ep = await endpoint(owner1, { name: "State machine receiver", url: "https://state.example.com/hook" });
    await freshBooking();
    delivery = (await deliveries("subscription_id = $1", [ep.id]))[0];
  });

  it("is reachable by the service role only", async () => {
    for (const [name, user] of [["anonymous", ROLES.anon], ["owner", owner1], ["administrator", admin], ["customer", customer]]) {
      for (const sql of [`select webhook_claim_deliveries(5)`, `select webhook_delivery_settings()`, `select webhook_record_attempt('${delivery.id}', 1, true, 200, null)`]) {
        assert.equal(await outcome(as(db, user, sql)), "42501", `${name}: ${sql}`);
      }
    }
    const spoofed = await failure(db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', '{"role":"authenticated"}', true)`);
      return (await tx.query(`select webhook_claim_deliveries(5)`)).rows;
    }));
    assert.match(spoofed.message, /Service role required/);
  });

  it("offers a due delivery once, with what the sender needs, and leases it", async () => {
    const first = mine(await claim());
    assert.equal(first.length, 1);
    assert.deepEqual(Object.keys(first[0]).sort(), ["attempt_count", "delivery_id", "event_id", "event_type", "payload", "signing_secret", "subscription_id", "target_url"]);
    assert.equal(first[0].delivery_id, delivery.id);
    assert.equal(first[0].signing_secret, ep.signing_secret);
    assert.equal(first[0].target_url, ep.target_url ?? "https://state.example.com/hook");
    assert.equal(first[0].attempt_count, 0);
    assert.equal(mine(await claim()).length, 0, "a leased delivery is not offered again");
    const lease = (await sys(db, `select extract(epoch from next_attempt_at - now()) s from webhook_deliveries where id = $1`, [delivery.id]))[0].s;
    assert.ok(lease > 240 && lease <= 300, `lease is five minutes, was ${lease}s`);
  });

  it("retries with exponential back-off recorded in the table, then gives up", async () => {
    const wait = async (id) => (await sys(db, `select extract(epoch from next_attempt_at - now()) s from webhook_deliveries where id = $1`, [id]))[0].s;
    const a1 = await record(delivery.id, 1, false);
    assert.deepEqual([a1.status, a1.attempt_count, a1.applied], ["pending", 1, true]);
    let s = await wait(delivery.id);
    assert.ok(s > 8 && s <= 10, `first retry after the base (10s), was ${s}`);
    const row1 = (await deliveries("id = $1", [delivery.id]))[0];
    assert.deepEqual([row1.last_status_code, row1.last_error], [500, "The endpoint answered 500"]);

    await makeDue(delivery.id);
    assert.equal(mine(await claim())[0].attempt_count, 1);
    const a2 = await record(delivery.id, 2, false);
    assert.equal(a2.status, "pending");
    s = await wait(delivery.id);
    assert.ok(s > 18 && s <= 20, `second retry after twice the base, was ${s}`);

    await makeDue(delivery.id);
    await claim();
    const a3 = await record(delivery.id, 3, false, null, "The endpoint did not answer in time");
    assert.deepEqual([a3.status, a3.attempt_count], ["failed", 3], "the third failure exhausts the attempts");
    assert.equal(mine(await claim()).length, 0, "a failed delivery is never offered again");
    const ended = (await deliveries("id = $1", [delivery.id]))[0];
    assert.deepEqual([ended.last_status_code, ended.last_error], [null, "The endpoint did not answer in time"]);
    const sub = (await sys(db, `select consecutive_failures, is_active, last_failure_at from webhook_subscriptions where id = $1`, [ep.id]))[0];
    assert.equal(sub.consecutive_failures, 3);
    assert.equal(sub.is_active, true, "without the disable setting an endpoint is never switched off");
    assert.ok(sub.last_failure_at);
  });

  it("ignores a replayed or out-of-order report", async () => {
    const replay = await record(delivery.id, 3, false);
    assert.equal(replay.applied, false);
    assert.equal(replay.status, "failed");
    assert.equal((await record(delivery.id, 1, true)).applied, false, "a delivered report for an old attempt cannot resurrect it");
    assert.equal((await sys(db, `select attempt_count from webhook_deliveries where id = $1`, [delivery.id]))[0].attempt_count, 3);
    assert.equal(await outcome(service(`select webhook_record_attempt($1, 0, true, 200, null)`, [delivery.id])), "22023");
    assert.equal(await outcome(service(`select webhook_record_attempt('00000000-0000-4000-8000-0000000000aa', 1, true, 200, null)`)), "P0002");
  });

  it("marks a success delivered, resets the failure streak, and refuses a second report", async () => {
    await freshBooking();
    const next = (await deliveries("subscription_id = $1 and status = 'pending' and attempt_count = 0", [ep.id]))[0];
    await claim();
    await record(next.id, 1, false);
    assert.equal((await sys(db, `select consecutive_failures from webhook_subscriptions where id = $1`, [ep.id]))[0].consecutive_failures, 4);
    await makeDue(next.id);
    await claim();
    const done = await record(next.id, 2, true, 204, null);
    assert.deepEqual([done.status, done.attempt_count, done.applied], ["delivered", 2, true]);
    const row = (await deliveries("id = $1", [next.id]))[0];
    assert.ok(row.delivered_at);
    assert.equal(row.last_error, null);
    assert.equal(row.last_status_code, 204);
    assert.equal((await sys(db, `select consecutive_failures, last_success_at is not null as ok from webhook_subscriptions where id = $1`, [ep.id]))[0].consecutive_failures, 0);
    assert.equal((await record(next.id, 3, false)).applied, false);
  });

  it("caps the back-off at 24 hours however large the base", async () => {
    await setSetting("api.webhook_retry_base_seconds", 1000000);
    await setSetting("api.webhook_max_attempts", 40);
    await freshBooking();
    const d = (await deliveries("subscription_id = $1 and status = 'pending' and attempt_count = 0", [ep.id]))[0];
    await claim();
    await record(d.id, 1, false);
    const s = (await sys(db, `select extract(epoch from next_attempt_at - now()) s from webhook_deliveries where id = $1`, [d.id]))[0].s;
    assert.ok(s > 86390 && s <= 86400, `capped at one day, was ${s}`);
    await setSetting("api.webhook_retry_base_seconds", 10);
    await setSetting("api.webhook_max_attempts", 3);
  });

  it("refuses to record an attempt while delivery settings are unset, and offers nothing", async () => {
    await freshBooking();
    const d = (await deliveries("subscription_id = $1 and status = 'pending' and attempt_count = 0", [ep.id]))[0];
    await setSetting("api.webhook_max_attempts", null);
    try {
      assert.deepEqual(await claim(), []);
      assert.equal(await outcome(record(d.id, 1, true)), "55000");
    } finally {
      await setSetting("api.webhook_max_attempts", 3);
    }
  });

  it("switches an endpoint off after the configured streak of failures and skips what was waiting", async () => {
    await setSetting("api.webhook_disable_after_failures", 2);
    const flaky = await endpoint(owner1, { name: "Flaky receiver", url: "https://flaky.example.com/hook" });
    await sys(db, `update webhook_subscriptions set is_active = false where id = $1 and false`, [flaky.id]);
    const b1 = await freshBooking();
    const b2 = await freshBooking();
    const waiting = await deliveries("subscription_id = $1", [flaky.id]);
    assert.equal(waiting.length, 2);
    await claim();
    const first = await record(waiting[0].id, 1, false);
    assert.equal(first.endpoint_disabled, false);
    const second = await record(waiting[1].id, 1, false);
    assert.equal(second.endpoint_disabled, true);
    assert.equal(second.status, "skipped");
    const sub = (await sys(db, `select is_active, disabled_reason, disabled_at is not null as at, consecutive_failures from webhook_subscriptions where id = $1`, [flaky.id]))[0];
    assert.deepEqual(sub, { is_active: false, disabled_reason: "consecutive_failures", at: true, consecutive_failures: 2 });
    assert.deepEqual((await deliveries("subscription_id = $1", [flaky.id])).map((r) => r.status), ["skipped", "skipped"]);
    assert.equal((await sys(db, `select count(*)::int n from admin_audit_logs where action = 'webhook_endpoint.auto_disabled' and target_id = $1`, [flaky.id]))[0].n, 1);

    await confirm(b1);
    assert.equal((await deliveries("subscription_id = $1", [flaky.id])).length, 2, "a disabled endpoint receives no new events");

    // The owner can put the endpoint back and re-queue what was skipped.
    assert.equal(await outcome(as(db, owner1, `select retry_webhook_delivery($1, 'Receiver fixed')`, [waiting[0].id])), "22023", "resume the endpoint first");
    await as(db, owner1, `select set_webhook_endpoint_active($1, true, 'Receiver fixed')`, [flaky.id]);
    assert.equal((await sys(db, `select consecutive_failures from webhook_subscriptions where id = $1`, [flaky.id]))[0].consecutive_failures, 0);
    for (const [name, user] of [["other owner", owner2], ["customer", customer], ["employee", employee], ["administrator", admin]]) {
      assert.equal(await outcome(as(db, user, `select retry_webhook_delivery($1, 'Receiver fixed')`, [waiting[0].id])), "P0002", name);
    }
    assert.equal(await outcome(as(db, ROLES.anon, `select retry_webhook_delivery($1, 'Receiver fixed')`, [waiting[0].id])), "42501");
    assert.equal(await outcome(as(db, owner1, `select retry_webhook_delivery($1, 'no')`, [waiting[0].id])), "22023");
    const retried = (await as(db, owner1, `select retry_webhook_delivery($1, 'Receiver fixed') r`, [waiting[0].id]))[0].r;
    assert.deepEqual(retried, { id: waiting[0].id, status: "pending", changed: true });
    assert.equal((await as(db, owner1, `select retry_webhook_delivery($1, 'Receiver fixed') r`, [waiting[0].id]))[0].r.changed, false, "a second retry is a no-op");
    const back = (await deliveries("id = $1", [waiting[0].id]))[0];
    assert.deepEqual([back.status, back.attempt_count, back.last_error], ["pending", 0, null]);
    await setSetting("api.webhook_disable_after_failures", null);
    await as(db, owner1, `select cancel_booking($1, 'cleanup')`, [b2.id]);
  });

  it("does not let an owner retry a delivery that already arrived", async () => {
    const delivered = (await deliveries("status = 'delivered'"))[0];
    assert.equal(await outcome(as(db, owner1, `select retry_webhook_delivery($1, 'Please send again')`, [delivered.id])), "22023");
  });

  it("reports the settings the sender runs under", async () => {
    await setSetting("api.webhook_disable_after_failures", 4);
    assert.deepEqual((await service(`select webhook_delivery_settings() s`))[0].s, { enabled: true, max_attempts: 3, retry_base_seconds: 10, disable_after_failures: 4 });
    await setSetting("api.webhook_disable_after_failures", null);
  });
});

describe("pausing and deleting drop what is waiting", () => {
  it("marks pending deliveries skipped when an endpoint is paused or deleted", async () => {
    await setSetting("api.webhook_max_attempts", 3);
    await setSetting("api.webhook_retry_base_seconds", 10);
    await sys(db, `update webhook_subscriptions set is_active = false where provider_id is not null`);
    const p = await endpoint(owner1, { name: "Pause me", url: "https://pause.example.com/hook" });
    const d = await endpoint(owner1, { name: "Delete me", url: "https://delete.example.com/hook" });
    const b = await freshBooking();
    assert.equal((await deliveries("booking_id = $1", [b.id])).length, 2);
    await as(db, owner1, `select set_webhook_endpoint_active($1, false, 'Pause for a while')`, [p.id]);
    await as(db, owner1, `select delete_webhook_endpoint($1, 'Retire this receiver')`, [d.id]);
    assert.deepEqual((await deliveries("booking_id = $1", [b.id])).map((r) => r.status), ["skipped", "skipped"]);
  });
});

describe("the retired subscription rows", () => {
  it("are switched off and lose their client-chosen secret column", async () => {
    const sql = readFileSync(`${MIGRATIONS_DIR}/20261006093000_webhook_endpoints.sql`, "utf8");
    const block = sql.split("-- BEGIN legacy-webhook-retirement")[1].split("-- END legacy-webhook-retirement")[0];
    assert.equal((await sys(db, `select count(*)::int n from information_schema.columns where table_name = 'webhook_subscriptions' and column_name = 'secret_key'`))[0].n, 0);
    // Recreate what the migration found: a developer-owned row with a secret chosen in the browser.
    await sys(db, `alter table webhook_subscriptions add column secret_key varchar(255)`);
    const profile = (await sys(db, `insert into developer_profiles (developer_id, app_name, is_approved) values ($1, 'Old integrator', true) returning id`, [SEED.owner1]))[0].id;
    await sys(db, `alter table webhook_subscriptions drop constraint webhook_subscriptions_owned_or_retired`);
    await sys(db, `alter table webhook_subscriptions drop constraint webhook_subscriptions_known_events`);
    const legacy = (await sys(db, `insert into webhook_subscriptions (developer_profile_id, target_url, event_types, secret_key, is_active)
      values ($1, 'http://api.myclientapp.com/webhooks', '{booking.created,booking.updated}', 'whsec_browser_chosen', true) returning id`, [profile]))[0].id;
    await db.exec(block);
    await sys(db, `alter table webhook_subscriptions add constraint webhook_subscriptions_known_events check (event_types <@ array['booking.created','booking.confirmed','booking.cancelled','booking.completed']::text[])`);
    await sys(db, `alter table webhook_subscriptions add constraint webhook_subscriptions_owned_or_retired check (provider_id is not null or is_active = false)`);
    const row = (await sys(db, `select is_active, disabled_reason, event_types, provider_id from webhook_subscriptions where id = $1`, [legacy]))[0];
    assert.deepEqual(row, { is_active: false, disabled_reason: "retired", event_types: ["booking.created"], provider_id: null });
    assert.equal((await sys(db, `select count(*)::int n from information_schema.columns where table_name = 'webhook_subscriptions' and column_name = 'secret_key'`))[0].n, 0);
    assert.ok(!JSON.stringify(await sys(db, `select * from webhook_subscriptions`)).includes("whsec_browser_chosen"));
    await expectError(sys(db, `insert into webhook_subscriptions (target_url, event_types, is_active) values ('https://x.example.com/', '{}', true)`), /owned_or_retired/);
  });
});

describe("catalog invariants of the new objects", () => {
  const OWNER_COMMANDS = ["create_webhook_endpoint", "update_webhook_endpoint", "set_webhook_endpoint_active", "rotate_webhook_secret", "delete_webhook_endpoint", "retry_webhook_delivery"];
  const SERVICE_ONLY = ["webhook_delivery_settings", "webhook_claim_deliveries", "webhook_record_attempt", "webhook_delivery_enabled", "api_booking_json"];

  it("pins every elevated function's search path and grants the right roles", async () => {
    const rows = await sys(db, `
      select p.proname, p.prosecdef,
             exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') as pinned,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_x, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as service_x
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1)`, [[...OWNER_COMMANDS, ...SERVICE_ONLY, "enqueue_booking_webhooks"]]);
    assert.equal(rows.length, OWNER_COMMANDS.length + SERVICE_ONLY.length + 1);
    for (const row of rows) {
      assert.equal(row.prosecdef, true, row.proname);
      assert.equal(row.pinned, true, row.proname);
      assert.equal(row.anon_x, false, row.proname);
      if (OWNER_COMMANDS.includes(row.proname)) assert.equal(row.auth_x, true, row.proname);
      else assert.equal(row.auth_x, false, `${row.proname} must not be executable by signed-in users`);
      if (SERVICE_ONLY.includes(row.proname)) assert.equal(row.service_x, true, row.proname);
    }
  });

  it("has row-level security and the administrator audit trigger on every webhook table", async () => {
    const rows = await sys(db, `
      select c.relname, c.relrowsecurity as rls, exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'trg_audit_admin_write') as audited
      from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('webhook_subscriptions', 'webhook_subscription_secrets', 'webhook_deliveries')`);
    assert.equal(rows.length, 3);
    for (const row of rows) assert.deepEqual([row.rls, row.audited], [true, true], row.relname);
  });

  it("adds booking triggers that only read: they are AFTER triggers", async () => {
    const rows = await sys(db, `select tgname, (tgtype & 2) = 0 as after_row from pg_trigger where tgrelid = 'public.bookings'::regclass and tgname like 'trg_webhook_%' order by 1`);
    assert.deepEqual(rows.map((r) => r.tgname), ["trg_webhook_booking_created", "trg_webhook_booking_status"]);
    assert.ok(rows.every((r) => r.after_row));
  });
});
