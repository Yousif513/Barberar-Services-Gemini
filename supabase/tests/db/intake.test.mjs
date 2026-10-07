import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// G72 intake forms and patch tests against the full migrated schema: templates and versions, per-service requirements, explicit
// consent, validation, who can read answers (and that every read is audited), patch tests, enforcement on and off, withdrawal,
// deletion, retention and every role.
let db;
let admin;
let employeeUser;
let delegate;
let stranger;
let otherProviderEmployee;
const owner = ROLES.user(SEED.owner1);
const otherOwner = ROLES.user(SEED.owner2);
let scenario = 0;
let serviceId;
let templateId;
const PROVIDER2_EMPLOYEE = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4";
const SECRET = "Penicillin and latex, asthma since childhood";

const FIELDS = [
  { key: "allergies", type: "long_text", label_en: "Allergies", label_ar: "الحساسية", required: true, max_length: 200 },
  { key: "pregnant", type: "yes_no", label_en: "Pregnant", label_ar: "حامل", required: true },
  { key: "skin", type: "single_choice", label_en: "Skin type", label_ar: "نوع البشرة",
    options: [{ value: "normal", label_en: "Normal", label_ar: "عادية" }, { value: "sensitive", label_en: "Sensitive", label_ar: "حساسة" }] },
  { key: "meds", type: "multi_choice", label_en: "Medication", label_ar: "الأدوية",
    options: [{ value: "blood", label_en: "Blood thinners", label_ar: "مميعات" }, { value: "acne", label_en: "Acne treatment", label_ar: "علاج حب الشباب" }] },
  { key: "last_peel", type: "date", label_en: "Last peel", label_ar: "آخر تقشير" },
  { key: "ack", type: "acknowledge", label_en: "I acknowledge", label_ar: "أقر", required: true },
];
const GOOD = { allergies: SECRET, pregnant: false, skin: "sensitive", meds: ["blood"], last_peel: "2026-01-31", ack: true };

const newCustomer = async () => ROLES.user(await createUser(db));
const count = async (table, where = "true", params = []) =>
  (await sys(db, `select count(*)::int n from ${table} where ${where}`, params))[0].n;
const call = (user, sql, params = []) => as(db, user, sql, params).then((r) => r[0]?.r);

async function makeBooking(customer, { employee = SEED.employee1, past = false } = {}) {
  scenario += 1;
  const svc = await serviceFor(db, employee);
  const date = await nextWorkingDate(db, employee, 2 + (scenario % 6));
  const slots = await as(db, customer, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 limit 1`, [employee, date, svc.duration]);
  assert.ok(slots[0], "the fixture needs a free slot");
  const [b] = await as(db, customer, `select * from create_booking($1, $2, $3)`, [employee, svc.id, slots[0].slot_start]);
  if (b.status === "pending_payment") {
    await as(db, ROLES.service, `select confirm_booking_payment($1, $2, $3)`, [b.id, `chg_${b.id}`, b.deposit_required]);
  }
  if (past) await forceBooking(b.id, `scheduled_at = now() - interval '2 hours' - interval '${scenario} days'`);
  return b;
}
// Fixture only: the immutable-field trigger is switched off for one statement so a booking can be moved into the past.
async function forceBooking(id, setClause) {
  await db.exec(`alter table bookings disable trigger protect_booking_immutable_fields_before_update`);
  try { await db.query(`update bookings set ${setClause} where id = $1`, [id]); }
  finally { await db.exec(`alter table bookings enable trigger protect_booking_immutable_fields_before_update`); }
}
const consent = (user, status = "granted") => as(db, user, `select record_consent('health_data', $1, 'v1.0', 'web_form') r`, [status]);
const currentVersion = async () => (await sys(db, `select current_version v from intake_form_templates where id = $1`, [templateId]))[0].v;
const submit = (user, booking, answers = GOOD) => call(user, `select submit_booking_intake($1, $2::jsonb) r`, [booking, JSON.stringify(answers)]);
const read = (user, booking) => call(user, `select read_booking_intake_answers($1) r`, [booking]);
const state = async (booking) => (await sys(db, `select * from intake_state_internal($1)`, [booking]))[0];
const setRequirement = (user = owner, svc = serviceId, tpl = templateId, form = true, patch = false, days = null, hours = null) =>
  call(user, `select set_service_intake_requirement($1, $2, $3, $4, $5, $6) r`, [svc, tpl, form, patch, days, hours]);
const enforce = (on, user = owner) => call(user, `select set_provider_intake_enforcement($1, $2) r`, [SEED.provider1, on]);
const checkIn = (user, booking) => as(db, user, `select employee_update_booking_status($1, 'in_service', null) r`, [booking]);
const record = (user, booking, result = "negative", at = null, key = null) =>
  call(user, `select record_patch_test($1, $2, $3, $4, $5) r`, [booking, serviceId, result, at, key]);

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  stranger = ROLES.user(await createUser(db, { role: "provider_employee" }));
  employeeUser = ROLES.user(await createUser(db, { role: "provider_employee" }));
  delegate = ROLES.user(await createUser(db, { role: "provider_employee" }));
  otherProviderEmployee = ROLES.user(await createUser(db, { role: "provider_employee" }));
  await sys(db, `update employees set profile_id = $1 where id = $2`, [employeeUser.sub, SEED.employee1]);
  await sys(db, `update employees set profile_id = $1 where id = $2`, [otherProviderEmployee.sub, PROVIDER2_EMPLOYEE]);
  await sys(db, `insert into employees (branch_id, profile_id, name_en, name_ar) values ($1, $2, 'Front Desk', 'الاستقبال')`, [SEED.branch1, delegate.sub]);
  await sys(db, `insert into provider_memberships (provider_id, user_id, role, permissions, is_active)
                 values ($1, $2, 'manager', '{"bookings":true}', true)`, [SEED.provider1, delegate.sub]);
  serviceId = (await serviceFor(db, SEED.employee1)).id;
});

describe("templates and versions", () => {
  it("lets the owner create a template, publishes a new version only when the fields change", async () => {
    const r = await call(owner, `select save_intake_template($1, null, 'Consultation', 'استشارة', $2::jsonb) r`, [SEED.provider1, JSON.stringify(FIELDS)]);
    templateId = r.id;
    assert.equal(r.version, 1);
    const same = await call(owner, `select save_intake_template($1, $2, 'Consultation 2', 'استشارة', $3::jsonb) r`, [SEED.provider1, templateId, JSON.stringify(FIELDS)]);
    assert.equal(same.version, 1, "a rename alone does not publish a version");
    const changed = await call(owner, `select save_intake_template($1, $2, 'Consultation 2', 'استشارة', $3::jsonb) r`,
      [SEED.provider1, templateId, JSON.stringify([...FIELDS, { key: "notes", type: "short_text", label_en: "Notes", label_ar: "ملاحظات" }])]);
    assert.equal(changed.version, 2);
    assert.equal(await count("intake_form_template_versions", "template_id = $1", [templateId]), 2);
    await call(owner, `select save_intake_template($1, $2, 'Consultation', 'استشارة', $3::jsonb) r`, [SEED.provider1, templateId, JSON.stringify(FIELDS)]);
    assert.equal(await count("admin_audit_logs", `action = 'intake.template_saved'`), 4);
  });

  it("keeps a published version immutable", async () => {
    await expectError(sys(db, `update intake_form_template_versions set fields = '[]'::jsonb`), /cannot be changed/);
  });

  it("refuses everybody except the owner", async () => {
    const args = [SEED.provider1, JSON.stringify(FIELDS)];
    const sql = `select save_intake_template($1, null, 'X', 'س', $2::jsonb) r`;
    await expectError(call(ROLES.anon, sql, args), /Authentication required|permission denied/);
    await expectError(call(await newCustomer(), sql, args), /Provider not found/);
    await expectError(call(otherOwner, sql, args), /Provider not found/);
    await expectError(call(stranger, sql, args), /Provider not found/);
    await expectError(call(employeeUser, sql, args), /Provider not found/);
    await expectError(call(otherProviderEmployee, sql, args), /Provider not found/);
    await expectError(call(delegate, sql, args), /Only the provider owner/);
    await expectError(call(admin, sql, args), /Provider not found/);
    await expectError(call(owner, `select save_intake_template($1, $2, 'X', 'س', $3::jsonb) r`, [SEED.provider2, templateId, JSON.stringify(FIELDS)]), /Provider not found/);
    await expectError(call(otherOwner, `select save_intake_template($1, $2, 'X', 'س', $3::jsonb) r`, [SEED.provider2, templateId, JSON.stringify(FIELDS)]), /Template not found/);
  });

  it("validates the field list", async () => {
    const bad = [
      [[], /between 1 and 60/],
      [Array.from({ length: 61 }, (_, i) => ({ ...FIELDS[1], key: `f${i}` })), /between 1 and 60/],
      [[FIELDS[0], FIELDS[0]], /used twice/],
      [[{ ...FIELDS[0], key: "Bad Key" }], /field key/],
      [[{ ...FIELDS[0], type: "file" }], /type is not supported/],
      [[{ ...FIELDS[0], label_ar: "" }], /English and an Arabic label/],
      [[{ ...FIELDS[0], max_length: 3000 }], /maximum length/],
      [[{ ...FIELDS[2], options: [FIELDS[2].options[0]] }], /between 2 and 30 options/],
      [[{ ...FIELDS[2], options: [FIELDS[2].options[0], FIELDS[2].options[0]] }], /used twice/],
      [[{ ...FIELDS[0], required: "yes" }], /required must be true or false/],
    ];
    for (const [fields, pattern] of bad) {
      await expectError(call(owner, `select save_intake_template($1, null, 'X', 'س', $2::jsonb) r`, [SEED.provider1, JSON.stringify(fields)]), pattern);
    }
    await expectError(call(owner, `select save_intake_template($1, null, '', 'س', $2::jsonb) r`, [SEED.provider1, JSON.stringify(FIELDS)]), /name of 1 to 120/);
  });

  it("lets only the owner and delegates with the bookings permission read templates", async () => {
    assert.ok((await as(db, owner, `select id from intake_form_templates`)).length >= 1);
    assert.ok((await as(db, delegate, `select id from intake_form_templates`)).length >= 1);
    for (const user of [await newCustomer(), otherOwner, stranger, employeeUser, admin]) {
      assert.equal((await as(db, user, `select id from intake_form_templates`)).length, 0);
    }
    await expectError(as(db, ROLES.anon, `select id from intake_form_templates`), /permission denied/);
    for (const user of [owner, delegate, await newCustomer()]) {
      await expectError(as(db, user, `insert into intake_form_templates (provider_id, name_en, name_ar) values ($1, 'x', 'x')`, [SEED.provider1]), /permission denied/);
    }
  });
});

describe("per-service requirements", () => {
  it("defaults to a form before the appointment and makes the patch test the provider's own setting", async () => {
    assert.equal(await count("intake_service_requirements"), 0, "nothing is required until the provider sets it");
    await expectError(setRequirement(owner, serviceId, templateId, false, true, null), /how many days/);
    await expectError(setRequirement(owner, serviceId, templateId, false, true, 0), /how many days/);
    await expectError(setRequirement(owner, serviceId, templateId, true, false, null, 800), /between 0 and 720/);
    await expectError(setRequirement(owner, serviceId, null, true), /active form/);
    await expectError(setRequirement(otherOwner, serviceId, templateId), /Provider not found/);
    await expectError(setRequirement(delegate, serviceId, templateId), /Only the provider owner/);
    await expectError(setRequirement(admin, serviceId, templateId), /Provider not found/);
    await expectError(setRequirement(await newCustomer(), serviceId, templateId), /Provider not found/);
    await expectError(setRequirement(ROLES.anon, serviceId, templateId), /Authentication required|permission denied/);
    const r = await setRequirement(owner);
    assert.equal(r.form_required, true);
    assert.equal(r.patch_test_required, false);
    assert.equal(r.patch_validity_days, null);
    await expectError(call(owner, `select save_intake_template($1, $2, 'X', 'س', $3::jsonb, false) r`, [SEED.provider1, templateId, JSON.stringify(FIELDS)]), /still used/);
  });

  it("refuses a template of another provider", async () => {
    const other = await call(otherOwner, `select save_intake_template($1, null, 'Theirs', 'لهم', $2::jsonb) r`, [SEED.provider2, JSON.stringify(FIELDS)]);
    await expectError(setRequirement(owner, serviceId, other.id), /active form/);
  });
});

describe("explicit consent and the customer's submission", () => {
  it("saves nothing before the health-data consent, and nothing for invalid answers", async () => {
    const customer = await newCustomer();
    const booking = await makeBooking(customer);
    await expectError(submit(customer, booking.id), /consent to share health information/);
    assert.equal(await count("intake_submissions", "booking_id = $1", [booking.id]), 0);
    await consent(customer);
    const bad = [
      [{ ...GOOD, allergies: undefined }, /Answer required: allergies/],
      [{ ...GOOD, allergies: "x".repeat(201) }, /too long/],
      [{ ...GOOD, pregnant: "no" }, /yes or no/],
      [{ ...GOOD, skin: "oily" }, /not one of the choices/],
      [{ ...GOOD, meds: ["blood", "blood"] }, /valid set of choices/],
      [{ ...GOOD, meds: ["nope"] }, /valid set of choices/],
      [{ ...GOOD, last_peel: "2026-02-31" }, /real date/],
      [{ ...GOOD, last_peel: "31/01/2026" }, /YYYY-MM-DD/],
      [{ ...GOOD, ack: false }, /Acknowledgement required/],
      [{ ...GOOD, extra: 1 }, /no field named extra/],
    ];
    for (const [answers, pattern] of bad) await expectError(submit(customer, booking.id, answers), pattern);
    assert.equal(await count("intake_submissions", "booking_id = $1", [booking.id]), 0);
    const ok = await submit(customer, booking.id);
    assert.equal(ok.status, "submitted");
    assert.equal(ok.template_version, await currentVersion());
    const again = await submit(customer, booking.id, { ...GOOD, allergies: "none" });
    assert.equal(again.submission_id, ok.submission_id, "a second submission replaces the first");
    assert.equal(await count("intake_answers", "submission_id = $1", [ok.submission_id]), 1);
  });

  it("records which version was answered", async () => {
    const customer = await newCustomer();
    const booking = await makeBooking(customer);
    await consent(customer);
    const a = await submit(customer, booking.id);
    const v0 = await currentVersion();
    await call(owner, `select save_intake_template($1, $2, 'Consultation', 'استشارة', $3::jsonb) r`,
      [SEED.provider1, templateId, JSON.stringify([...FIELDS, { key: "notes", type: "short_text", label_en: "Notes", label_ar: "ملاحظات" }])]);
    assert.equal((await sys(db, `select template_version from intake_submissions where id = $1`, [a.submission_id]))[0].template_version, v0);
    const b = await submit(customer, booking.id);
    assert.equal(b.template_version, v0 + 1);
    await call(owner, `select save_intake_template($1, $2, 'Consultation', 'استشارة', $3::jsonb) r`, [SEED.provider1, templateId, JSON.stringify(FIELDS)]);
  });

  it("refuses another customer, an anonymous caller, a service without a form and a finished booking", async () => {
    const customer = await newCustomer();
    const booking = await makeBooking(customer);
    await consent(customer);
    const other = await newCustomer();
    await consent(other);
    await expectError(submit(other, booking.id), /Booking not found/);
    await expectError(submit(ROLES.anon, booking.id), /Authentication required|permission denied/);
    await expectError(submit(owner, booking.id), /Booking not found/);
    await sys(db, `delete from intake_service_requirements where service_id = $1`, [serviceId]);
    await expectError(submit(customer, booking.id), /no form/);
    await setRequirement();
    await call(customer, `select cancel_booking($1, 'Changed my mind') r`, [booking.id]);
    await expectError(submit(customer, booking.id), /upcoming booking/);
  });

  it("lets nobody write the tables directly and lets a stranger read nothing", async () => {
    const customer = await newCustomer();
    const booking = await makeBooking(customer);
    await consent(customer);
    const s = await submit(customer, booking.id);
    for (const user of [customer, owner, employeeUser, admin]) {
      await expectError(as(db, user, `insert into intake_answers (submission_id, customer_id, answers) values ($1, $2, '{}')`, [s.submission_id, customer.sub]), /permission denied/);
      await expectError(as(db, user, `update intake_answers set answers = '{}'::jsonb`), /permission denied/);
      await expectError(as(db, user, `delete from intake_answers`), /permission denied/);
      await expectError(as(db, user, `update intake_submissions set status = 'deleted'`), /permission denied/);
      await expectError(as(db, user, `insert into patch_test_results (provider_id, service_id, customer_id, result, tested_at) values ($1, $2, $3, 'negative', now())`, [SEED.provider1, serviceId, customer.sub]), /permission denied/);
    }
    assert.equal((await as(db, customer, `select answers from intake_answers where submission_id = $1`, [s.submission_id])).length, 1);
    for (const user of [await newCustomer(), otherOwner, stranger, otherProviderEmployee, owner, delegate, employeeUser, admin]) {
      assert.equal((await as(db, user, `select answers from intake_answers where submission_id = $1`, [s.submission_id])).length, 0, "no staff or administrator SELECT on answers");
    }
    await expectError(as(db, ROLES.anon, `select answers from intake_answers`), /permission denied/);
  });
});

describe("who reads answers, and the audit trail", () => {
  it("lets the owner, a delegate and the assigned employee read through the command, auditing each read", async () => {
    const customer = await newCustomer();
    const booking = await makeBooking(customer);
    await consent(customer);
    await submit(customer, booking.id);
    let reads = await count("admin_audit_logs", `action = 'intake.answers_read'`);
    for (const user of [owner, delegate, employeeUser]) {
      const r = await read(user, booking.id);
      assert.equal(r.status, "submitted");
      assert.equal(r.answers.allergies, SECRET);
      assert.equal(r.fields.length, FIELDS.length);
      reads += 1;
      assert.equal(await count("admin_audit_logs", `action = 'intake.answers_read'`), reads);
    }
    const audit = await sys(db, `select details::text d, actor_id from admin_audit_logs where action = 'intake.answers_read' order by created_at desc limit 3`);
    assert.ok(audit.every((a) => !a.d.includes("Penicillin") && !a.d.includes("asthma")), "the audit row never carries an answer");
    assert.deepEqual(new Set(audit.map((a) => a.actor_id)), new Set([owner.sub, delegate.sub, employeeUser.sub]));
    const view = await call(customer, `select get_booking_intake($1) r`, [booking.id]);
    assert.equal(view.submission.read_count, 3, "the customer sees how many times the answers were read");
    assert.equal(view.submission.answers.allergies, SECRET);
  });

  it("refuses everyone else without writing an audit row", async () => {
    const customer = await newCustomer();
    const booking = await makeBooking(customer);
    await consent(customer);
    await submit(customer, booking.id);
    const before = await count("admin_audit_logs", `action = 'intake.answers_read'`);
    for (const [name, user] of [["other customer", await newCustomer()], ["customer", customer], ["other owner", otherOwner], ["stranger", stranger],
      ["other provider employee", otherProviderEmployee], ["administrator", admin]]) {
      await expectError(read(user, booking.id), /Booking not found/, name);
    }
    await expectError(read(ROLES.anon, booking.id), /Authentication required|permission denied/);
    await expectError(read(owner, "00000000-0000-4000-8000-0000000000aa"), /Booking not found/);
    assert.equal(await count("admin_audit_logs", `action = 'intake.answers_read'`), before);
  });

  it("answers with a status, not answers, when nothing was submitted", async () => {
    const booking = await makeBooking(await newCustomer());
    assert.deepEqual(await read(owner, booking.id), { booking_id: booking.id, status: "missing", answers: null });
  });

  it("refuses to show answers of a cancelled booking", async () => {
    const customer = await newCustomer();
    const booking = await makeBooking(customer);
    await consent(customer);
    await submit(customer, booking.id);
    await call(customer, `select cancel_booking($1, 'Changed my mind') r`, [booking.id]);
    await expectError(read(owner, booking.id), /cancelled or missed/);
  });
});

describe("the non-sensitive status view", () => {
  it("shows the people who serve a booking what is missing, and nobody else", async () => {
    const customer = await newCustomer();
    const booking = await makeBooking(customer);
    const rows = (user) => as(db, user, `select * from provider_booking_intake_status where booking_id = $1`, [booking.id]);
    for (const user of [owner, delegate, employeeUser, customer]) {
      const [row] = await rows(user);
      assert.equal(row.form_status, "missing");
      assert.equal(row.met, false);
      assert.equal("answers" in row, false);
    }
    for (const user of [await newCustomer(), otherOwner, stranger, otherProviderEmployee]) assert.equal((await rows(user)).length, 0);
    await expectError(as(db, ROLES.anon, `select * from provider_booking_intake_status`), /permission denied/);
    await consent(customer);
    await submit(customer, booking.id);
    assert.equal((await rows(owner))[0].met, true);
  });

  it("gives an administrator counts and statuses only", async () => {
    const overview = await call(admin, `select admin_intake_overview() r`);
    assert.ok(overview.templates >= 1);
    assert.ok(overview.submissions_by_status.submitted >= 1);
    assert.equal(overview.retention_days, null);
    assert.ok(!JSON.stringify(overview).includes("Penicillin"));
    for (const user of [owner, employeeUser, await newCustomer(), ROLES.anon]) {
      await expectError(call(user, `select admin_intake_overview() r`), /Administrator access required|permission denied/);
    }
  });
});

describe("patch tests", () => {
  it("is not required until the provider asks for it, then needs a validity the provider chose", async () => {
    const customer = await newCustomer();
    const booking = await makeBooking(customer);
    await expectError(record(employeeUser, booking.id), /does not require a patch test/);
    await setRequirement(owner, serviceId, templateId, true, true, 30, 24);
    assert.equal((await state(booking.id)).patch_status, "missing");
  });

  it("is recorded by the people who serve the booking, idempotently", async () => {
    const customer = await newCustomer();
    const booking = await makeBooking(customer);
    const key = crypto.randomUUID();
    const first = await record(employeeUser, booking.id, "negative", new Date(Date.now() - 3 * 86400000).toISOString(), key);
    assert.equal(first.replayed, false);
    const replay = await record(employeeUser, booking.id, "negative", new Date(Date.now() - 3 * 86400000).toISOString(), key);
    assert.equal(replay.id, first.id);
    assert.equal(replay.replayed, true);
    await expectError(record(owner, booking.id, "negative", null, key), /another request/);
    assert.equal(await count("patch_test_results", "customer_id = $1", [customer.sub]), 1);
    assert.equal((await state(booking.id)).patch_status, "valid");
    await record(delegate, booking.id);
    await record(owner, booking.id);
    for (const [user, pattern] of [[stranger, /Booking not found/], [otherOwner, /Booking not found/], [otherProviderEmployee, /Booking not found/],
      [admin, /Booking not found/], [customer, /Booking not found/], [await newCustomer(), /Booking not found/], [ROLES.anon, /Authentication required|permission denied/]]) {
      await expectError(record(user, booking.id), pattern);
    }
    await expectError(record(employeeUser, booking.id, "maybe"), /negative or positive/);
    await expectError(record(employeeUser, booking.id, "negative", new Date(Date.now() + 86400000).toISOString()), /future/);
  });

  it("judges validity by the appointment: expired, too late, valid", async () => {
    const customer = await newCustomer();
    const booking = await makeBooking(customer);
    assert.equal((await state(booking.id)).patch_status, "missing");
    await record(employeeUser, booking.id, "negative", new Date(Date.now() - 40 * 86400000).toISOString());
    assert.equal((await state(booking.id)).patch_status, "expired", "older than the provider's validity");
    await sys(db, `delete from patch_test_results where customer_id = $1`, [customer.sub]);
    await record(employeeUser, booking.id, "negative", new Date().toISOString());
    const [row] = await sys(db, `select (scheduled_at - now()) > interval '24 hours' as far from bookings where id = $1`, [booking.id]);
    assert.equal((await state(booking.id)).patch_status, row.far ? "valid" : "too_late");
  });

  it("shows the client their own results and the staff of that provider only", async () => {
    const customer = await newCustomer();
    const booking = await makeBooking(customer);
    await record(employeeUser, booking.id, "negative", new Date(Date.now() - 86400000).toISOString());
    assert.equal((await as(db, customer, `select id from patch_test_results where customer_id = $1`, [customer.sub])).length, 1);
    for (const user of [owner, delegate, employeeUser]) {
      assert.equal((await as(db, user, `select id from patch_test_results where customer_id = $1`, [customer.sub])).length, 1);
    }
    for (const user of [await newCustomer(), otherOwner, stranger, otherProviderEmployee, admin]) {
      assert.equal((await as(db, user, `select id from patch_test_results where customer_id = $1`, [customer.sub])).length, 0);
    }
  });

  it("blocks the service after a positive result until the owner clears it with a reason", async () => {
    const customer = await newCustomer();
    const booking = await makeBooking(customer);
    const pos = await record(employeeUser, booking.id, "positive", new Date(Date.now() - 86400000).toISOString());
    const st = await state(booking.id);
    assert.equal(st.blocked, true);
    assert.equal(st.patch_status, "blocked");
    assert.equal(st.met, false);
    // the same client cannot book the service again
    const svc = await serviceFor(db, SEED.employee1);
    const date = await nextWorkingDate(db, SEED.employee1, 9);
    const slots = await as(db, customer, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 limit 1`, [SEED.employee1, date, svc.duration]);
    await expectError(as(db, customer, `select * from create_booking($1, $2, $3)`, [SEED.employee1, svc.id, slots[0].slot_start]), /blocked for this client/);
    // the block holds even while enforcement is off
    await expectError(checkIn(employeeUser, booking.id), /positive patch test/);
    for (const [user, pattern] of [[delegate, /Only the provider owner/], [employeeUser, /Provider not found|Only the provider owner/],
      [otherOwner, /Provider not found/], [admin, /Provider not found/], [customer, /Provider not found/]]) {
      await expectError(call(user, `select clear_patch_test_block($1, 'Doctor cleared it') r`, [pos.id]), pattern);
    }
    await expectError(call(owner, `select clear_patch_test_block($1, 'x') r`, [pos.id]), /reason of at least 3/);
    const cleared = await call(owner, `select clear_patch_test_block($1, 'Dermatologist confirmed no reaction') r`, [pos.id]);
    assert.equal(cleared.replayed, false);
    assert.equal((await call(owner, `select clear_patch_test_block($1, 'Dermatologist confirmed no reaction') r`, [pos.id])).replayed, true);
    assert.equal((await state(booking.id)).blocked, false);
    assert.equal(await count("admin_audit_logs", `action = 'intake.patch_block_cleared'`), 1);
    const negative = await record(owner, booking.id, "negative");
    await expectError(call(owner, `select clear_patch_test_block($1, 'Not a positive') r`, [negative.id]), /Only a positive/);
  });

  it("keeps a patch test specific to the person it was done on", async () => {
    const customer = await newCustomer();
    const booking = await makeBooking(customer);
    const [dependent] = await as(db, customer, `insert into client_profiles (client_id, name, type) values ($1, 'Child', 'dependent') returning id`, [customer.sub])
      .catch(() => sys(db, `insert into client_profiles (client_id, name, type) values ($1, 'Child', 'dependent') returning id`, [customer.sub]));
    await record(employeeUser, booking.id, "negative", new Date(Date.now() - 86400000).toISOString());
    assert.equal((await state(booking.id)).patch_status === "valid" || (await state(booking.id)).patch_status === "too_late", true);
    await forceBooking(booking.id, `client_profile_id = '${dependent.id}'`);
    assert.equal((await state(booking.id)).patch_status, "missing", "the customer's own test does not cover their dependent");
  });
});

describe("enforcement", () => {
  it("is off by default and changes nothing for a provider that has not switched it on", async () => {
    assert.equal(await count("provider_intake_settings"), 0);
    const booking = await makeBooking(await newCustomer());
    const r = await checkIn(employeeUser, booking.id);
    assert.equal(r[0].r.success, true, "checking in works while enforcement is off, even without a form");
  });

  it("lets only the owner switch it", async () => {
    await expectError(enforce(true, delegate), /Only the provider owner/);
    await expectError(enforce(true, admin), /Provider not found/);
    await expectError(enforce(true, otherOwner), /Provider not found/);
    await expectError(enforce(true, await newCustomer()), /Provider not found/);
    await expectError(enforce(true, ROLES.anon), /Authentication required|permission denied/);
    await expectError(call(owner, `select set_provider_intake_enforcement($1, null) r`, [SEED.provider1]), /enabled flag/);
    assert.equal(await count("provider_intake_settings"), 0);
  });

  it("refuses to start or complete while a requirement is unmet, never blocks cancellation, and releases once met", async () => {
    await setRequirement(owner, serviceId, templateId, true, false);
    await enforce(true);
    const customer = await newCustomer();
    const booking = await makeBooking(customer, { past: true });
    await expectError(checkIn(employeeUser, booking.id), /intake form \(missing\)/);
    await expectError(as(db, employeeUser, `select employee_update_booking_status($1, 'completed', 'done')`, [booking.id]), /intake form \(missing\)/);
    await expectError(as(db, owner, `select employee_update_booking_status($1, 'completed', 'done')`, [booking.id]), /intake form/);
    await expectError(sys(db, `update bookings set status = 'completed' where id = $1`, [booking.id]), /intake form/);
    assert.equal((await sys(db, `select status::text s, checked_in_at from bookings where id = $1`, [booking.id]))[0].s, "confirmed");

    await consent(customer);
    const sub = await submit(customer, booking.id).catch((e) => e);
    // the booking is past-dated but still confirmed, so the form can be completed
    assert.equal(sub.status, "submitted");
    await checkIn(employeeUser, booking.id);
    const done = await as(db, employeeUser, `select employee_update_booking_status($1, 'completed', 'done') r`, [booking.id]);
    assert.equal(done[0].r.status, "completed");

    const another = await makeBooking(await newCustomer());
    const cancelled = await as(db, employeeUser, `select employee_update_booking_status($1, 'cancelled', 'Client asked') r`, [another.id]);
    assert.equal(cancelled[0].r.status, "cancelled", "cancellation is never blocked");
    const noShowCandidate = await makeBooking(await newCustomer(), { past: true });
    const noShow = await as(db, employeeUser, `select employee_update_booking_status($1, 'no_show', 'Did not arrive') r`, [noShowCandidate.id]).catch((e) => e);
    assert.ok(!/intake/.test(noShow.message ?? ""), "a no-show is never blocked by an intake requirement");
  });

  it("also asks for a valid patch test when the service needs one", async () => {
    await setRequirement(owner, serviceId, templateId, false, true, 30, 0);
    const customer = await newCustomer();
    const booking = await makeBooking(customer);
    await expectError(checkIn(employeeUser, booking.id), /patch test \(missing\)/);
    await record(employeeUser, booking.id, "negative", new Date(Date.now() - 86400000).toISOString());
    assert.equal((await checkIn(employeeUser, booking.id))[0].r.success, true);
    await enforce(false);
    await setRequirement();
  });

  it("does not ask a walk-in client, who has no account, for a form", async () => {
    await enforce(true);
    const [row] = await sys(db, `select id from bookings where customer_id is null limit 1`);
    if (row) assert.equal((await state(row.id)).met, true);
    await enforce(false);
  });
});

describe("withdrawal, deletion and retention", () => {
  it("blanks the answers of future bookings on withdrawal, keeps a tombstone, and keeps past ones", async () => {
    const customer = await newCustomer();
    await consent(customer);
    const future = await makeBooking(customer);
    const past = await makeBooking(customer, { past: true });
    const fs = await submit(customer, future.id);
    const ps = await submit(customer, past.id);
    const r = await call(customer, `select withdraw_health_data_consent() r`);
    assert.equal(r.answers_removed, 1);
    assert.equal(await count("intake_answers", "submission_id = $1", [fs.submission_id]), 0);
    assert.equal(await count("intake_answers", "submission_id = $1", [ps.submission_id]), 1, "a past submission stays until deleted or purged");
    const [tomb] = await sys(db, `select status, removal_reason, answers_removed_at, template_version from intake_submissions where id = $1`, [fs.submission_id]);
    assert.equal(tomb.status, "withdrawn");
    assert.equal(tomb.removal_reason, "consent_withdrawn");
    assert.equal((await state(future.id)).form_status, "withdrawn");
    assert.equal((await read(owner, future.id)).answers, null);
    await expectError(submit(customer, future.id), /consent to share health information/);
    assert.equal((await call(customer, `select get_booking_intake($1) r`, [future.id])).consent_active, false);
    await consent(customer);
    assert.equal((await submit(customer, future.id)).status, "submitted", "after a fresh consent the form can be completed again");
    // a plain consent withdrawal through the existing rpc blanks too
    await as(db, customer, `select record_consent('health_data', 'withdrawn', 'v1.0', 'web_form')`);
    assert.equal(await count("intake_answers", "submission_id = $1", [fs.submission_id]), 0);
  });

  it("lets the customer delete a submission, once, and nobody else", async () => {
    const customer = await newCustomer();
    await consent(customer);
    const booking = await makeBooking(customer);
    const s = await submit(customer, booking.id);
    await expectError(call(await newCustomer(), `select delete_booking_intake($1) r`, [booking.id]), /Booking not found/);
    await expectError(call(owner, `select delete_booking_intake($1) r`, [booking.id]), /Booking not found/);
    await expectError(call(ROLES.anon, `select delete_booking_intake($1) r`, [booking.id]), /Authentication required|permission denied/);
    assert.equal((await call(customer, `select delete_booking_intake($1) r`, [booking.id])).removed, true);
    assert.equal((await call(customer, `select delete_booking_intake($1) r`, [booking.id])).removed, false);
    assert.equal(await count("intake_answers", "submission_id = $1", [s.submission_id]), 0);
    assert.equal((await sys(db, `select removal_reason from intake_submissions where id = $1`, [s.submission_id]))[0].removal_reason, "customer_deleted");
  });

  it("purges nothing while the retention setting is unset", async () => {
    const customer = await newCustomer();
    await consent(customer);
    const old = await makeBooking(customer, { past: true });
    await forceBooking(old.id, `scheduled_at = now() - interval '${400 + scenario} days'`);
    const s = await submit(customer, old.id);
    assert.deepEqual(await call(ROLES.service, `select purge_expired_intake() r`), { configured: false, purged: 0 });
    assert.deepEqual(await call(admin, `select admin_purge_expired_intake('Quarterly clean-up') r`), { configured: false, purged: 0 });
    assert.equal(await count("intake_answers", "submission_id = $1", [s.submission_id]), 1);

    await sys(db, `update platform_settings set value = '365'::jsonb where key = 'intake.retention_days'`);
    for (const user of [owner, employeeUser, customer, ROLES.anon]) {
      await expectError(call(user, `select purge_expired_intake() r`), /Only the scheduled job|permission denied/);
      await expectError(call(user, `select admin_purge_expired_intake('Quarterly clean-up') r`), /Administrator access required|permission denied/);
    }
    await expectError(call(admin, `select admin_purge_expired_intake('x') r`), /reason of at least 3/);
    const dry = await call(ROLES.service, `select purge_expired_intake(true) r`);
    assert.equal(dry.eligible >= 1 && dry.purged === 0, true);
    assert.equal(await count("intake_answers", "submission_id = $1", [s.submission_id]), 1);
    const run = await call(admin, `select admin_purge_expired_intake('Quarterly clean-up') r`);
    assert.ok(run.purged >= 1);
    assert.equal(await count("intake_answers", "submission_id = $1", [s.submission_id]), 0);
    assert.equal((await sys(db, `select status, removal_reason from intake_submissions where id = $1`, [s.submission_id]))[0].status, "purged");
    await sys(db, `update platform_settings set value = 'null'::jsonb where key = 'intake.retention_days'`);
  });
});

describe("consent purpose", () => {
  it("accepts the health-data purpose and rejects an unknown one", async () => {
    const customer = await newCustomer();
    assert.ok((await consent(customer))[0].r);
    await expectError(as(db, customer, `select record_consent('biometrics', 'granted', 'v1.0', 'web_form')`), /Invalid consent purpose/);
    await expectError(as(db, customer, `insert into consents (user_id, purpose) values ($1, 'health_data')`, [customer.sub]), /permission denied/);
  });
});
