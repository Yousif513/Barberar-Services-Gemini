// G70: GCC multi-country configuration.
// Saudi Arabia reproduces today's behaviour exactly (the existing booking, availability and invoice suites are the oracle and run
// unchanged); a test-only country, "ZZ" (Asia/Dubai, VAT 5 %), inserted below by the test itself, proves that VAT, the local day
// and the slot times follow the branch's country. No other country exists in the migrated database.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let svc;
let date; // a working day of employee1 (YYYY-MM-DD, the Riyadh calendar day)
let nextDate;
let admin;
let adminId;
let zzBranch;
let zzDay;
let zzNight;
let saNight;
const customer = ROLES.user(SEED.customer);
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
let svc2; // a service of employee2, for counter bookings at the first branch
const created = []; // bookings this file made

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const iso = (d) => new Date(d).toISOString();
const slots = (user, employee, d, minutes = 30) => as(db, user, `select slot_start from get_available_slots($1, $2::date, $3) order by 1`, [employee, d, minutes])
  .then((rows) => rows.map((r) => iso(r.slot_start)));

const upsert = (user, o = {}) => as(db, user,
  `select admin_upsert_country($1, $2, $3, $4, $5, $6, $7::numeric, $8, $9, $10) r`,
  [o.code ?? "YY", o.nameEn ?? "Test land", o.nameAr ?? "بلد الاختبار", o.currency ?? "SAR", o.minor ?? 2, o.tz ?? "Asia/Dubai",
   o.vat ?? 5, o.dial ?? "+998", o.active ?? false, o.reason ?? "Test setup"]).then((r) => r[0].r);

const book = (user, slot, employee) => as(db, user,
  `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3,
     request_source => 'marketplace', request_coupon_code => null, request_gift_card_code => null, request_loyalty_points => 0)`,
  [employee, svc.id, slot]).then((r) => { created.push(r[0].id); return r[0]; });

const cancelAll = async () => {
  const open = await sys(db, `select id, customer_id from bookings where id = any($1::uuid[]) and status in ('pending_payment', 'confirmed')`, [`{${created.join(",")}}`]);
  for (const b of open) await as(db, ROLES.user(b.customer_id), `select cancel_booking($1, 'test cleanup')`, [b.id]);
};

const setHours = (employee, d, from, to) => sys(db,
  `insert into employee_availability (employee_id, day_of_week, start_time, end_time, is_working_day)
   values ($1, extract(dow from $2::date)::int, $3::time, $4::time, true)
   on conflict (employee_id, day_of_week) do update set start_time = $3::time, end_time = $4::time, is_working_day = true,
     has_second_shift = false, second_start_time = null, second_end_time = null`, [employee, d, from, to]);

const makeBranch = async (country, name) => (await sys(db,
  `insert into branches (provider_id, name_en, name_ar, address_text_en, address_text_ar, latitude, longitude, country_code)
   values ($1, $2, $2, 'Test street', 'شارع الاختبار', 25.2, 55.3, $3) returning id`, [SEED.provider1, name, country]))[0].id;

const makeEmployee = async (branchId, name) => {
  const id = (await sys(db, `insert into employees (branch_id, name_en, name_ar) values ($1, $2, $2) returning id`, [branchId, name]))[0].id;
  await sys(db, `insert into employee_services (employee_id, service_id) values ($1, $2)`, [id, svc.id]);
  return id;
};

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  date = await nextWorkingDate(db, SEED.employee1, 4);
  nextDate = addDays(date, 1);
  adminId = await createUser(db, { role: "admin" });
  admin = ROLES.user(adminId);
  // A service that fits the short night shifts below.
  await sys(db, `update employee_services set custom_duration_minutes = null where service_id = $1`, [svc.id]);
  await sys(db, `update services set base_duration_minutes = 30, buffer_before_minutes = 0, buffer_after_minutes = 0 where id = $1`, [svc.id]);
  svc = await serviceFor(db, SEED.employee1);
  svc2 = await serviceFor(db, SEED.employee2);

  // The test-only country, opened by an administrator the way a real one would be.
  await upsert(admin, { code: "ZZ", nameEn: "Test Emirate", tz: "Asia/Dubai", vat: 5, dial: "+999", active: true, reason: "Test country for G70" });
  zzBranch = await makeBranch("ZZ", "ZZ branch");
  zzDay = await makeEmployee(zzBranch, "ZZ day");
  zzNight = await makeEmployee(zzBranch, "ZZ night");
  await setHours(zzDay, date, "09:00", "17:00");
  await setHours(zzNight, nextDate, "00:00", "02:00");
  const saBranch2 = await makeBranch("SA", "SA second branch");
  saNight = await makeEmployee(saBranch2, "SA night");
  await setHours(saNight, nextDate, "00:00", "02:00");
  await setHours(SEED.employee1, date, "09:00", "17:00");
});

describe("country configuration: Saudi Arabia is today's behaviour", () => {
  it("seeds Saudi Arabia only, with today's currency, time zone, VAT and dial code", async () => {
    const rows = await sys(db, `select code, name_en, currency_code, currency_minor_units, timezone, vat_rate_percent::numeric v, phone_dial_code, active
                                from countries where code <> 'ZZ' order by code`);
    assert.deepEqual(rows.map((r) => r.code), ["SA"], "no other country is seeded: that is an owner and legal decision");
    assert.deepEqual({ ...rows[0], v: Number(rows[0].v) }, {
      code: "SA", name_en: "Saudi Arabia", currency_code: "SAR", currency_minor_units: 2, timezone: "Asia/Riyadh", v: 15, phone_dial_code: "+966", active: true,
    });
    assert.equal((await sys(db, `select name_ar from countries where code = 'SA'`))[0].name_ar.length > 3, true);
  });

  it("resolves a Saudi branch, its provider and the country", async () => {
    const r = (await as(db, customer, `select country_vat_rate('SA')::numeric v, country_timezone('sa') tz, country_is_active('SA') a, branch_country($1) bc,
        branch_timezone($1) bt, provider_country($2) pc, provider_timezone($2) pt`, [SEED.branch1, SEED.provider1]))[0];
    assert.deepEqual({ ...r, v: Number(r.v) }, { v: 15, tz: "Asia/Riyadh", a: true, bc: "SA", bt: "Asia/Riyadh", pc: "SA", pt: "Asia/Riyadh" });
    const none = (await as(db, customer, `select country_vat_rate('QQ') v, branch_timezone(gen_random_uuid()) t, country_is_active('QQ') a`))[0];
    assert.deepEqual(none, { v: null, t: null, a: false });
  });

  it("gives the same slots as before on a Saudi branch (09:00-17:00 Riyadh = 06:00-14:00 UTC)", async () => {
    const expected = [];
    for (let m = 9 * 60; m + 60 <= 17 * 60; m += 30) {
      expected.push(`${date}T${String(Math.floor(m / 60) - 3).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00.000Z`);
    }
    assert.deepEqual(await slots(customer, SEED.employee1, date, 60), expected);
  });

  it("prices a Saudi booking with VAT of exactly 15 % and the same totals as the fixed rate gave", async () => {
    const slot = (await slots(customer, SEED.employee1, date, 30))[0];
    const b = await book(customer, slot, SEED.employee1);
    const expected = (await sys(db, `select round($1::numeric * 0.15, 2) t`, [b.subtotal_price]))[0].t;
    assert.equal(b.tax_amount, expected);
    assert.equal(Number(b.tax_amount), Math.round(Number(svc.price) * 15) / 100);
    assert.equal(Number(b.subtotal_price), Number(svc.price));
    await cancelAll();
  });

  it("prices a counter booking with the same 15 % for awkward amounts", async () => {
    for (const [i, price] of [0.05, 33.33, 99.99, 1234.57].entries()) {
      const when = (await sys(db, `select (date_trunc('hour', now()) + make_interval(days => $1::int, hours => 2))::text t`, [20 + i]))[0].t;
      const r = (await as(db, owner1, `select create_walk_in_booking(p_branch_id => $1, p_employee_id => $2, p_service_id => $3, p_customer_name => 'Parity',
          p_payment_method => 'cash', p_total_price => $4::numeric, p_scheduled_at => $5::timestamptz) r`,
        [SEED.branch1, SEED.employee2, svc2.id, price, when]))[0].r;
      const row = (await sys(db, `select tax_amount, round(total_price * 0.15, 2) expected from bookings where id = $1`, [r.booking_id]))[0];
      assert.equal(row.tax_amount, row.expected, `walk-in at ${price}`);
    }
  });

  it("issues the same ZATCA invoice for a Saudi branch: rate 15, the booking's VAT", async () => {
    await sys(db, `update providers set vat_number = '300012345600003' where id = $1`, [SEED.provider1]);
    const b = (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
        subtotal_price, total_price, tax_amount, deposit_required, platform_commission, source)
        values ($1, $2, $3, $4, 'completed', now() - interval '40 days', 30, 200, 200, round(200 * 0.15, 2), 0, 0, 'link') returning id`,
      [SEED.customer, SEED.branch1, SEED.employee1, svc.id]))[0];
    const inv = (await as(db, customer, `select generate_zatca_tax_invoice($1) r`, [b.id]))[0].r;
    assert.equal(inv.success, true);
    assert.equal(Number(inv.vat_rate_percent), 15);
    assert.equal(Number(inv.vat_amount_sar), 30);
    assert.equal(Number(inv.total_amount_sar), 230);
  });

  it("no longer carries the fixed VAT or time zone in the functions it converted", async () => {
    const defs = await sys(db, `select p.proname, pg_get_functiondef(p.oid) d from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname in ('booking_create_internal','create_walk_in_booking','generate_zatca_tax_invoice','get_available_slots',
        'reschedule_booking','booking_message_variables','get_provider_dashboard_summary','get_provider_detailed_analytics','get_branch_schedule_with_prayer_pauses',
        'waitlist_sweep','join_waitlist','backfill_waitlist_on_cancellation','create_group_booking','preview_booking_series','calculate_staff_payroll')`);
    assert.equal(defs.length, 15);
    for (const f of defs) {
      assert.equal(/Asia\/Riyadh/.test(f.d), false, `${f.proname} still names Asia/Riyadh`);
      assert.equal(/\*\s*0\.15\b/.test(f.d), false, `${f.proname} still multiplies by 0.15`);
    }
    const quiet = (await sys(db, `select pg_get_functiondef('claim_message_batch(integer)'::regprocedure) d`))[0].d;
    assert.match(quiet, /branch_timezone/, "reminders use the booking's branch clock when a branch is in scope");
  });
});

describe("country configuration: a branch in another country follows its country", () => {
  it("takes VAT from the branch's country", async () => {
    const slot = (await slots(customer, zzDay, date, 30))[0];
    const b = await book(customer, slot, zzDay);
    assert.equal(Number(b.tax_amount), Math.round(Number(b.subtotal_price) * 5) / 100);
    assert.notEqual(Number(b.tax_amount), Math.round(Number(b.subtotal_price) * 15) / 100);
    await cancelAll();
  });

  it("lists slots on the branch's clock: 09:00 Asia/Dubai is 05:00 UTC, not 06:00", async () => {
    const list = await slots(customer, zzDay, date, 60);
    assert.equal(list[0], `${date}T05:00:00.000Z`);
    assert.equal(list.at(-1), `${date}T12:00:00.000Z`);
    assert.equal(list.length, 15);
  });

  it("decides the branch-local day: 00:30 on the next day in Dubai is still today in Riyadh and in UTC", async () => {
    const dubai = await slots(customer, zzNight, nextDate, 30);
    assert.deepEqual(dubai, [0, 30, 60, 90].map((m) => iso(Date.parse(`${nextDate}T00:00:00Z`) - 4 * 3600000 + m * 60000)));
    const riyadh = await slots(customer, saNight, nextDate, 30);
    assert.deepEqual(riyadh, [0, 30, 60, 90].map((m) => iso(Date.parse(`${nextDate}T00:00:00Z`) - 3 * 3600000 + m * 60000)));
    // The booking engine agrees: it accepts the Dubai slot (its local day is the next day) and the Riyadh one.
    const b = await book(customer, dubai[1], zzNight);
    assert.equal(b.status, "pending_payment");
    const vars = (await sys(db, `select booking_message_variables($1, 'en') v`, [b.id]))[0].v;
    assert.equal(vars.booking_date, nextDate, "the message names the branch's day");
    assert.equal(vars.booking_time, "00:30", "and the branch's clock");
    const b2 = await book(customer, riyadh[1], saNight);
    const vars2 = (await sys(db, `select booking_message_variables($1, 'en') v`, [b2.id]))[0].v;
    assert.deepEqual([vars2.booking_date, vars2.booking_time], [nextDate, "00:30"]);
    await cancelAll();
  });

  it("lets an administrator give one branch a time zone of its own without changing its tax", async () => {
    const branch = (await sys(db, `select branch_id from employees where id = $1`, [saNight]))[0].branch_id;
    const r = (await as(db, admin, `select admin_set_branch_country($1, 'SA', 'Asia/Dubai', 'Branch keeps Dubai time') r`, [branch]))[0].r;
    assert.equal(r.changed, true);
    assert.equal((await as(db, customer, `select branch_timezone($1) t, country_vat_rate(branch_country($1))::numeric v`, [branch]))[0].t, "Asia/Dubai");
    assert.equal(Number((await as(db, customer, `select country_vat_rate(branch_country($1)) v`, [branch]))[0].v), 15);
    const list = await slots(customer, saNight, nextDate, 30);
    assert.equal(list[0], iso(Date.parse(`${nextDate}T00:00:00Z`) - 4 * 3600000));
    const back = (await as(db, admin, `select admin_set_branch_country($1, 'SA', null, 'Back to the country clock') r`, [branch]))[0].r;
    assert.equal(back.changed, true);
    assert.equal((await as(db, customer, `select branch_timezone($1) t`, [branch]))[0].t, "Asia/Riyadh");
  });

  it("refuses a ZATCA tax invoice for a branch outside Saudi Arabia, and writes nothing", async () => {
    const b = (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
        subtotal_price, total_price, tax_amount, deposit_required, platform_commission, source)
        values ($1, $2, $3, $4, 'completed', now() - interval '41 days', 30, 200, 200, round(200 * 0.05, 2), 0, 0, 'link') returning id`,
      [SEED.customer, zzBranch, zzDay, svc.id]))[0];
    await expectError(as(db, customer, `select generate_zatca_tax_invoice($1)`, [b.id]), /only for branches in Saudi Arabia/);
    await expectError(as(db, owner1, `select generate_zatca_tax_invoice($1)`, [b.id]), /only for branches in Saudi Arabia/);
    assert.equal((await sys(db, `select count(*)::int n from invoices where booking_id = $1`, [b.id]))[0].n, 0);
  });

  it("opens nothing in a country that is not active: no slots, no booking, no counter booking", async () => {
    await upsert(admin, { code: "ZZ", nameEn: "Test Emirate", tz: "Asia/Dubai", vat: 5, dial: "+999", active: false, reason: "Close the test country" });
    assert.deepEqual(await slots(customer, zzDay, date, 30), []);
    await expectError(book(customer, `${date}T05:00:00Z`, zzDay), /not open in the country/);
    await expectError(as(db, owner1, `select create_walk_in_booking(p_branch_id => $1, p_employee_id => $2, p_service_id => $3, p_customer_name => 'Closed',
        p_payment_method => 'cash', p_scheduled_at => now() + interval '30 days')`, [zzBranch, zzDay, svc.id]), /not open in the country/);
    // Saudi Arabia is untouched.
    assert.equal((await slots(customer, SEED.employee1, date, 30)).length > 0, true);
    await upsert(admin, { code: "ZZ", nameEn: "Test Emirate", tz: "Asia/Dubai", vat: 5, dial: "+999", active: true, reason: "Reopen the test country" });
    assert.equal((await slots(customer, zzDay, date, 30)).length > 0, true);
  });

  it("prices a counter booking with the branch's VAT", async () => {
    const when = (await sys(db, `select (date_trunc('hour', now()) + interval '31 days 3 hours')::text t`))[0].t;
    const r = (await as(db, owner1, `select create_walk_in_booking(p_branch_id => $1, p_employee_id => $2, p_service_id => $3, p_customer_name => 'ZZ walk-in',
        p_payment_method => 'cash', p_total_price => 200, p_scheduled_at => $4::timestamptz) r`, [zzBranch, zzDay, svc.id, when]))[0].r;
    assert.equal(Number((await sys(db, `select tax_amount from bookings where id = $1`, [r.booking_id]))[0].tax_amount), 10);
  });
});

describe("admin_upsert_country", () => {
  it("is refused to every role but an administrator", async () => {
    const employeeUser = ROLES.user(await createUser(db, { role: "provider_employee" }));
    for (const [who, user] of [["anonymous", ROLES.anon], ["customer", customer], ["provider owner", owner1], ["other provider's owner", owner2], ["employee", employeeUser], ["service role", ROLES.service]]) {
      await assert.rejects(upsert(user, { code: "XX" }), (e) => ["42501", "28000"].includes(e.code), `${who} must be refused`);
    }
    assert.equal((await sys(db, `select count(*)::int n from countries where code = 'XX'`))[0].n, 0);
  });

  it("creates, then updates, a country with a reason, and audits both", async () => {
    const created = await upsert(admin, { code: "yy", currency: "aed", minor: 2, vat: 5, reason: "Prepare a country" });
    assert.equal(created.success, true);
    assert.equal(created.created, true);
    assert.equal(created.active, false, "a new country stays closed until an administrator opens it");
    const again = await upsert(admin, { code: "YY", currency: "AED", vat: 6.5, reason: "Rate decided by the owner" });
    assert.equal(again.created, false);
    assert.equal(Number(again.vat_rate_percent), 6.5);
    const row = (await sys(db, `select currency_code, vat_rate_percent::numeric v, active from countries where code = 'YY'`))[0];
    assert.deepEqual({ ...row, v: Number(row.v) }, { currency_code: "AED", v: 6.5, active: false });
    const audit = await sys(db, `select action, actor_id, details->>'reason' reason from admin_audit_logs where target_type = 'countries' and details->>'code' = 'YY' order by created_at, id`);
    assert.deepEqual(audit.map((a) => a.action), ["country.created", "country.updated"]);
    assert.equal(audit[0].actor_id, adminId);
    assert.equal(audit[1].reason, "Rate decided by the owner");
  });

  it("validates its input and asks for a reason", async () => {
    await expectError(upsert(admin, { code: "YY", reason: "no" }), /reason of at least 3/);
    await expectError(upsert(admin, { code: "YYY" }), /two-letter/);
    await expectError(upsert(admin, { code: "YY", vat: 120 }), /between 0 and 100/);
    await expectError(upsert(admin, { code: "YY", vat: -1 }), /between 0 and 100/);
    await expectError(upsert(admin, { code: "YY", tz: "Mars/Olympus" }), /Unknown time zone/);
    await expectError(upsert(admin, { code: "YY", currency: "DIRHAM" }), /three-letter/);
    await expectError(upsert(admin, { code: "YY", minor: 9 }), /0 to 4 minor units/);
    await expectError(upsert(admin, { code: "YY", dial: "998" }), /dial code/);
    await expectError(upsert(admin, { code: "YY", nameEn: "x" }), /2 to 80/);
    await expectError(as(db, admin, `select admin_upsert_country('YY', 'A land', 'بلد', 'AED', 2, 'Asia/Dubai', null, '+998', false, 'Missing the rate')`), /all required/);
  });

  it("will not open a country whose currency the money model does not hold, and will not close the last open country", async () => {
    await expectError(upsert(admin, { code: "YY", currency: "AED", active: true, reason: "Try to open" }), /only when it uses SAR/);
    // With another country open, Saudi Arabia could be closed; with Saudi Arabia the only one open, it cannot.
    await upsert(admin, { code: "ZZ", nameEn: "Test Emirate", tz: "Asia/Dubai", vat: 5, dial: "+999", active: false, reason: "Close the test country" });
    await expectError(upsert(admin, { code: "SA", nameEn: "Saudi Arabia", nameAr: "المملكة العربية السعودية", currency: "SAR", tz: "Asia/Riyadh", vat: 15, dial: "+966", active: false, reason: "Close everything" }),
      /At least one country must stay active/);
    assert.equal((await sys(db, `select active from countries where code = 'SA'`))[0].active, true);
    await upsert(admin, { code: "ZZ", nameEn: "Test Emirate", tz: "Asia/Dubai", vat: 5, dial: "+999", active: true, reason: "Reopen the test country" });
  });
});

describe("branches in countries", () => {
  it("lets only an administrator move a branch, and not while it has upcoming bookings", async () => {
    const branch = zzBranch;
    for (const [who, user] of [["anonymous", ROLES.anon], ["customer", customer], ["provider owner", owner1], ["other provider's owner", owner2]]) {
      await assert.rejects(as(db, user, `select admin_set_branch_country($1, 'SA', null, 'Trying to move it')`, [branch]), (e) => ["42501", "28000"].includes(e.code), `${who} must be refused`);
    }
    await expectError(as(db, admin, `select admin_set_branch_country($1, 'SA', null, 'x')`, [branch]), /reason of at least 3/);
    await expectError(as(db, admin, `select admin_set_branch_country(gen_random_uuid(), 'SA', null, 'No such branch')`), /Branch not found/);
    await expectError(as(db, admin, `select admin_set_branch_country($1, 'QQ', null, 'No such country')`, [branch]), /Country not found/);
    await expectError(as(db, admin, `select admin_set_branch_country($1, 'ZZ', 'Mars/Olympus', 'Bad zone')`, [branch]), /Unknown time zone/);
    const slot = (await slots(customer, zzDay, date, 30))[0];
    const b = await book(customer, slot, zzDay);
    await expectError(as(db, admin, `select admin_set_branch_country($1, 'SA', null, 'Move with a booking open')`, [branch]), /upcoming bookings/);
    assert.equal((await as(db, customer, `select branch_country($1) c`, [branch]))[0].c, "ZZ");
    await as(db, customer, `select cancel_booking($1, 'test cleanup')`, [b.id]);
    const noop = (await as(db, admin, `select admin_set_branch_country($1, 'ZZ', null, 'Same place again') r`, [branch]))[0].r;
    assert.equal(noop.changed, false);
    const audit = await sys(db, `select action from admin_audit_logs where action = 'branch.country_changed'`);
    assert.equal(audit.length >= 2, true, "the earlier time-zone changes were audited");
  });

  it("keeps a provider from choosing its own branch's country or time zone", async () => {
    await assert.rejects(as(db, owner1, `update branches set country_code = 'ZZ' where id = $1`, [SEED.branch1]), (e) => e.code === "42501");
    await assert.rejects(as(db, owner1, `update branches set timezone = 'Asia/Dubai' where id = $1`, [SEED.branch1]), (e) => e.code === "42501");
    const added = (await as(db, owner1, `insert into branches (provider_id, name_en, name_ar, address_text_en, address_text_ar, latitude, longitude, country_code, timezone)
      values ($1, 'Owner branch', 'فرع المالك', 'Street', 'شارع', 24.7, 46.7, 'ZZ', 'Asia/Dubai') returning country_code, timezone`, [SEED.provider1]))[0];
    assert.deepEqual(added, { country_code: "SA", timezone: null }, "a new branch takes the provider's country");
    // Ordinary edits still work.
    await as(db, owner1, `update branches set name_en = 'Renamed' where id = $1`, [SEED.branch1]);
    assert.equal((await sys(db, `select country_code from branches where id = $1`, [SEED.branch1]))[0].country_code, "SA");
  });

  it("refuses a country that does not exist", async () => {
    await assert.rejects(sys(db, `update branches set country_code = 'QQ' where id = $1`, [SEED.branch1]), (e) => e.code === "23503");
  });
});

describe("country table access", () => {
  it("shows signed-in users the open countries only, and an administrator all of them", async () => {
    assert.deepEqual((await as(db, customer, `select code from countries order by code`)).map((r) => r.code), ["SA", "ZZ"]);
    assert.equal((await as(db, customer, `select code from countries where code = 'YY'`)).length, 0, "a closed country is invisible to customers");
    assert.equal((await as(db, admin, `select code from countries where code = 'YY'`)).length, 1);
  });

  it("refuses anonymous visitors and every direct write", async () => {
    await assert.rejects(as(db, ROLES.anon, `select code from countries`), (e) => e.code === "42501");
    for (const user of [customer, owner1, admin]) {
      await assert.rejects(as(db, user, `insert into countries (code, name_en, name_ar, currency_code, currency_minor_units, timezone, vat_rate_percent, phone_dial_code)
        values ('XX', 'Nowhere', 'لا مكان', 'SAR', 2, 'UTC', 0, '+1')`), (e) => e.code === "42501");
      await assert.rejects(as(db, user, `update countries set vat_rate_percent = 0 where code = 'SA'`), (e) => ["42501"].includes(e.code) || /permission|row-level/i.test(e.message));
    }
    assert.equal(Number((await sys(db, `select vat_rate_percent v from countries where code = 'SA'`))[0].v), 15);
  });

  it("answers the resolvers to signed-in users and the service role, never to visitors", async () => {
    assert.equal(Number((await as(db, ROLES.service, `select country_vat_rate('ZZ') v`))[0].v), 5);
    await assert.rejects(as(db, ROLES.anon, `select country_vat_rate('SA')`), (e) => e.code === "42501");
    await assert.rejects(as(db, ROLES.anon, `select branch_timezone($1)`, [SEED.branch1]), (e) => e.code === "42501");
  });
});
