// FIX-BOOKING item 7a (D10 / C-D10): the waitlist offer is an exclusive claim, it expires for real, and the next in line is offered the slot.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let svc;
let date;
let orig; let cA; let cB; let cC;
let phone = 500100000;
const riyadh = (hhmm) => `${date}T${hhmm}:00+03:00`;
const clock = (d) => new Date(d).toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" });

const reachable = async () => {
  phone += 1;
  const id = await createUser(db, { phone: `+966${phone}`, verified: true });
  await sys(db, `insert into consents (user_id, purpose, status) values ($1, 'whatsapp', 'granted')`, [id]);
  return ROLES.user(id);
};
const book = (user, hhmm, { claim = null, employee = SEED.employee1 } = {}) => as(db, user,
  `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3, request_waitlist_claim_id => $4)`,
  [employee, svc.id, riyadh(hhmm), claim]).then((r) => r[0]);
const cancel = (user, b) => as(db, user, `select cancel_booking($1, 'test')`, [b.id]);
const join = (user, from, to) => as(db, user,
  `select join_waitlist($1, $2, $3, $4::date, $5::time, $6::time) r`, [SEED.branch1, svc.id, null, date, from, to]).then((r) => r[0].r);
const entry = async (id) => (await sys(db, `select * from waitlists where id = $1`, [id]))[0];
const sweep = () => as(db, ROLES.service, `select expire_waitlist_claims() n`).then((r) => r[0].n);
const slots = (user, duration = 30) => as(db, user, `select slot_start from get_available_slots($1, $2::date, $3) order by 1`, [SEED.employee1, date, duration])
  .then((rows) => rows.map((r) => clock(r.slot_start)));
const expireNow = (id) => sys(db, `update waitlists set expires_at = now() - interval '1 minute' where id = $1`, [id]);
const queued = (userId) => sys(db, `select variables, status from message_queue where recipient_id = $1 and template_name = 'waitlist_slot_opened' order by created_at`, [userId]);

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  date = await nextWorkingDate(db, SEED.employee1);
  await sys(db, `update services set base_duration_minutes = 30, buffer_before_minutes = 0, buffer_after_minutes = 0, processing_time_minutes = 0 where id = $1`, [svc.id]);
  await sys(db, `update employee_services set custom_duration_minutes = null where service_id = $1`, [svc.id]);
  await sys(db, `update employee_availability set start_time = '09:00', end_time = '17:00', is_working_day = true, has_second_shift = false,
                   second_start_time = null, second_end_time = null where employee_id = $1 and day_of_week = extract(dow from $2::date)::int`, [SEED.employee1, date]);
  orig = await reachable(); cA = await reachable(); cB = await reachable(); cC = await reachable();
});

describe("waitlist exclusive claim (D10 / C-D10)", () => {
  it("joining needs a verified phone number and WhatsApp consent", async () => {
    const anonymousPhone = ROLES.user(await createUser(db));
    await expectError(join(anonymousPhone, "09:00", "11:00"), /Verify your phone/);
    const noConsent = ROLES.user(await createUser(db, { phone: "+966500999001", verified: true }));
    await expectError(join(noConsent, "09:00", "11:00"), /Allow WhatsApp/);
    const ok = await join(cC, "08:00", "08:30");
    assert.equal(ok.success, true);
    await expectError(join(cC, "08:00", "08:30"), /Already on active waitlist/);
    await sys(db, `update waitlists set status = 'cancelled' where id = $1`, [ok.waitlist_id]);
  });

  it("holds the freed slot for the first waitlister: strangers cannot see or book it (reproduced: they could)", async () => {
    const b = await book(orig, "10:00");
    const a = await join(cA, "09:00", "11:00");
    const bb = await join(cB, "09:00", "11:00");
    await cancel(orig, b);

    const ea = await entry(a.waitlist_id);
    assert.equal(ea.status, "notified");
    assert.equal(clock(ea.held_slot_start), "10:00");
    assert.equal(ea.held_employee_id, SEED.employee1);
    assert.equal(ea.held_from_booking_id, b.id);
    assert.equal((await entry(bb.waitlist_id)).status, "active");
    const msgs = await queued(cA.sub);
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].variables.claim_url, new RegExp(`claim_waitlist=${a.waitlist_id}`));
    assert.equal(msgs[0].variables.expires_minutes, "15", "unset setting keeps the promised 15 minutes");
    assert.equal((await queued(cB.sub)).length, 0);

    assert.ok(!(await slots(cC)).includes("10:00"), "the held slot is not offered to a stranger");
    assert.ok(!(await slots(cB)).includes("10:00"), "nor to the next in line");
    assert.ok((await slots(cA)).includes("10:00"), "but it is offered to the holder");
    assert.ok((await slots(cC)).includes("10:30") && (await slots(cC)).includes("09:30"), "the neighbouring slots stay open");
    await expectError(book(cC, "10:00"), /no longer available/);
    await expectError(book(cC, "10:00", { employee: null }), /No professional is available/);
    await expectError(book(cB, "10:00"), /no longer available/);

    // other people's offers
    await expectError(as(db, cC, `select claim_waitlist_slot($1)`, [a.waitlist_id]), /not found/);
    await expectError(as(db, cB, `select claim_waitlist_slot($1)`, [bb.waitlist_id]), /no longer open/);
    await expectError(book(cC, "10:00", { claim: a.waitlist_id }), /no longer open|no longer available/);
    await expectError(book(cB, "10:00", { claim: a.waitlist_id }), /no longer open|no longer available/);
    await expectError(as(db, ROLES.anon, `select claim_waitlist_slot($1)`, [a.waitlist_id]), /permission denied/);

    // the holder claims and books
    const claim = (await as(db, cA, `select claim_waitlist_slot($1) r`, [a.waitlist_id]))[0].r;
    assert.equal(claim.success, true);
    assert.equal(clock(claim.slot_start), "10:00");
    assert.equal(claim.employee_id, SEED.employee1);
    assert.ok(claim.seconds_left > 0 && claim.seconds_left <= 900);
    await expectError(book(cA, "10:30", { claim: a.waitlist_id }), /different professional, service or time/);
    const mine = await book(cA, "10:00", { claim: a.waitlist_id });
    assert.equal(mine.status, "pending_payment");
    const done = await entry(a.waitlist_id);
    assert.deepEqual([done.status, done.claimed_booking_id], ["claimed", mine.id]);
    assert.equal((await entry(bb.waitlist_id)).status, "active", "nothing to offer onward: the slot is taken");
    await expectError(book(cA, "10:00", { claim: a.waitlist_id }), /no longer open|no longer available/);
    assert.equal((await as(db, cA, `select claim_waitlist_slot($1) r`, [a.waitlist_id]))[0].r.status, "claimed", "claiming again is idempotent");
    await sys(db, `update waitlists set status = 'cancelled' where id = $1`, [bb.waitlist_id]);
  });

  it("the holder booking the held slot without passing the offer id uses the offer up too", async () => {
    const b = await book(orig, "12:00");
    const a = await join(cA, "11:30", "12:30");
    await cancel(orig, b);
    assert.equal((await entry(a.waitlist_id)).status, "notified");
    const mine = await book(cA, "12:00");
    const done = await entry(a.waitlist_id);
    assert.deepEqual([done.status, done.claimed_booking_id], ["claimed", mine.id]);
  });

  it("an expired offer is swept, the next waitlister is offered the slot, and the first can re-join", async () => {
    const b = await book(orig, "14:00");
    const a = await join(cA, "13:30", "14:30");
    const bb = await join(cB, "13:30", "14:30");
    await cancel(orig, b);
    assert.equal((await entry(a.waitlist_id)).status, "notified");
    await expireNow(a.waitlist_id);

    assert.equal(await sweep(), 1);
    assert.equal((await entry(a.waitlist_id)).status, "expired");
    const eb = await entry(bb.waitlist_id);
    assert.equal(eb.status, "notified");
    assert.equal(clock(eb.held_slot_start), "14:00");
    assert.equal((await queued(cB.sub)).length, 1, "the next in line is messaged");
    await expectError(book(cC, "14:00"), /no longer available/);
    assert.ok((await slots(cB)).includes("14:00"));

    // the first customer is not locked out any more (the stale `notified` row used to block re-joining)
    const again = await join(cA, "13:30", "14:30");
    assert.equal(again.success, true);
    await sys(db, `update waitlists set status = 'cancelled' where id = $1`, [again.waitlist_id]);

    // nobody left: the slot is free for everybody
    await expireNow(bb.waitlist_id);
    assert.equal(await sweep(), 1);
    assert.equal((await entry(bb.waitlist_id)).status, "expired");
    assert.ok((await slots(cC)).includes("14:00"));
    const taken = await book(cC, "14:00");
    assert.equal(taken.status, "pending_payment");
  });

  it("claiming an offer that ran out answers 'expired' and persists it (a RAISE would have rolled it back)", async () => {
    const b = await book(orig, "15:00");
    const a = await join(cA, "14:30", "15:30");
    await cancel(orig, b);
    await expireNow(a.waitlist_id);
    const r = (await as(db, cA, `select claim_waitlist_slot($1) r`, [a.waitlist_id]))[0].r;
    assert.deepEqual([r.success, r.status], [false, "expired"]);
    assert.equal((await entry(a.waitlist_id)).status, "expired");
    await expectError(as(db, cA, `select claim_waitlist_slot($1)`, [a.waitlist_id]), /no longer open/);
  });

  it("an offer past its time no longer blocks the slot, and a booking with it is refused", async () => {
    const b = await book(orig, "16:00");
    const a = await join(cA, "15:30", "16:30");
    await cancel(orig, b);
    await expireNow(a.waitlist_id);
    await expectError(book(cA, "16:00", { claim: a.waitlist_id }), /no longer open/);
    assert.ok((await slots(cC)).includes("16:00"));
  });

  it("the claim window comes from platform_settings and defaults to 15 minutes", async () => {
    await sys(db, `insert into platform_settings (key, value) values ('waitlist_claim_minutes', '5'::jsonb)
                   on conflict (key) do update set value = excluded.value`);
    const b = await book(orig, "11:00");
    const a = await join(cB, "10:30", "11:30");
    await cancel(orig, b);
    const e = await entry(a.waitlist_id);
    const minutes = Math.round((new Date(e.expires_at) - new Date(e.notified_at)) / 60000);
    assert.equal(minutes, 5);
    assert.equal((await queued(cB.sub)).at(-1).variables.expires_minutes, "5");
    await sys(db, `delete from platform_settings where key = 'waitlist_claim_minutes'`);
  });

  it("only the scheduler can sweep", async () => {
    for (const user of [ROLES.anon, cA, ROLES.user(SEED.owner1)]) {
      await expectError(as(db, user, `select expire_waitlist_claims()`), /permission denied/);
    }
    const admin = ROLES.user(await createUser(db, { role: "admin" }));
    await expectError(as(db, admin, `select expire_waitlist_claims()`), /permission denied/);
    assert.equal(typeof (await sweep()), "number");
  });

  it("keeps one version of each function and its privileges", async () => {
    const rows = await sys(db, `select proname, count(*)::int n, bool_or(has_function_privilege('anon', oid, 'EXECUTE')) anon,
        bool_and(has_function_privilege('authenticated', oid, 'EXECUTE')) auth
      from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('create_booking','create_multi_service_booking','booking_create_internal','claim_waitlist_slot','join_waitlist','expire_waitlist_claims','waitlist_sweep') group by 1`);
    const by = Object.fromEntries(rows.map((r) => [r.proname, r]));
    for (const r of rows) assert.equal(r.n, 1, r.proname);
    for (const name of ["create_booking", "create_multi_service_booking", "claim_waitlist_slot", "join_waitlist"]) {
      assert.equal(by[name].auth, true, name); assert.equal(by[name].anon, false, name);
    }
    for (const name of ["booking_create_internal", "expire_waitlist_claims", "waitlist_sweep"]) {
      assert.equal(by[name].auth, false, name); assert.equal(by[name].anon, false, name);
    }
  });
});
