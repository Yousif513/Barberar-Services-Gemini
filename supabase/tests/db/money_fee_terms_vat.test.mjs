import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

// MONEY part 5 (D-D3): the effective platform fee from the fee rules in force (no free-standing commission %), VAT on the fee,
// sample amounts for a worked example, and the provider's VAT status captured at onboarding and changed only by command.
let db;
let admin;
let analyst;
let finance;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);
const now = () => Math.floor(Date.now() / 1000);
const outcome = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);
const terms = (user, providerId = null) => as(db, user, `select provider_effective_fee_terms($1) t`, [providerId]).then((r) => r[0].t);

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
});

describe("effective fee terms", () => {
  it("shows the provider the marketplace rules in force with their dates, VAT rate and its own sample prices", async () => {
    const t = await terms(owner1);
    assert.equal(t.provider_id, SEED.provider1);
    const inForce = await sys(db, `select id, fee_percentage, effective_from from fee_rules where channel = 'marketplace' and effective_to is null`);
    assert.equal(t.rules.length, inForce.length);
    assert.ok(t.rules.every((r) => r.effective_from), "each rule says when it took effect");
    assert.equal(Number(t.vat_rate_percent), Number((await sys(db, `select vat_rate_percent v from countries where code = 'SA'`))[0].v));
    const prices = await sys(db, `select distinct coalesce(es.custom_price, s.base_price)::numeric p from services s join employee_services es on es.service_id = s.id
      join employees e on e.id = es.employee_id join branches b on b.id = e.branch_id where b.provider_id = $1 and coalesce(es.custom_price, s.base_price) > 0`, [SEED.provider1]);
    assert.ok(t.sample_prices.every((p) => prices.some((x) => Number(x.p) === Number(p))), "sample amounts come from the provider's own catalogue");
    assert.deepEqual(t.own_channels, ["link", "qr", "whatsapp", "instagram", "walk_in", "import"]);
  });

  it("lists a scheduled increase and its notice before it takes effect", async () => {
    const [first] = await sys(db, `select fee_percentage, min_fee_sar, max_fee_sar from fee_rules where channel = 'marketplace' and is_first_visit and effective_to is null`);
    const [asked] = await as(db, finance, `select admin_propose_fee_rule_change('marketplace', true, $1, $2, $3, now() + interval '40 days', 'Fee increase agreed with providers') r`,
      [Number(first.fee_percentage) + 1, Number(first.min_fee_sar), first.max_fee_sar === null ? null : Number(first.max_fee_sar) + 5]);
    await as(db, admin, `select admin_decide_approval($1, 'approve', 'Signed agreement amendment')`, [asked.r.approval_id]);
    const t = await terms(owner1);
    assert.equal(t.scheduled.length, 1);
    assert.equal(Number(t.scheduled[0].fee_percentage), Number(first.fee_percentage) + 1);
    assert.equal(t.notices.length, 1);
  });

  it("is readable by the provider's owner and console roles only", async () => {
    assert.equal((await terms(analyst, SEED.provider2)).provider_id, SEED.provider2);
    assert.equal(await outcome(terms(owner2, SEED.provider1)), "P0002", "another provider's owner gets not found");
    assert.equal(await outcome(terms(customer)), "P0002");
    assert.equal(await outcome(terms(ROLES.anon)), "42501");
  });

  it("leaves no free-standing commission % on the console: the providers screen reads the fee terms instead", async () => {
    // providers.commission_percentage is not read by pricing (calculate_booking_platform_commission uses fee_rules only).
    const [fn] = await sys(db, `select prosrc from pg_proc where proname = 'calculate_booking_platform_commission'`);
    assert.doesNotMatch(fn.prosrc, /commission_percentage/);
  });
});

describe("VAT registration status", () => {
  it("is set only by the owner through the command, with format validation and a recent sign-in", async () => {
    const set = (user, status, number, providerId = SEED.provider1) =>
      as(db, user, `select provider_set_vat_status($1, $2, $3) r`, [providerId, status, number]).then((r) => r[0].r);
    await expectError(set(owner1, "registered", "123"), /15 digits/);
    await expectError(set(owner1, "registered", "300000000000004"), /15 digits/);
    await expectError(set(owner1, "not_registered", "300000000000003"), /no VAT number/);
    await expectError(set(owner1, "exempt", null), /registered or not_registered/);
    assert.equal(await outcome(set(owner2, "registered", "300000000000003")), "P0002");
    for (const user of [admin, customer]) assert.equal(await outcome(set(user, "registered", "300000000000003")), "P0002");
    assert.equal(await outcome(set(ROLES.anon, "registered", "300000000000003")), "42501");
    const staleOwner = ROLES.user(SEED.owner1, { amr: [{ method: "password", timestamp: now() - 3600 }] });
    await expectError(set(staleOwner, "registered", "300000000000003"), /Sign in again/);

    const r = await set(owner1, "registered", "3000 0000 0000 003");
    assert.deepEqual([r.status, r.verification], ["registered", "unverified"]);
    const [row] = await sys(db, `select vat_registration_status, vat_number, vat_status_source, vat_verification_status from providers where id = $1`, [SEED.provider1]);
    assert.deepEqual([row.vat_registration_status, row.vat_number, row.vat_status_source, row.vat_verification_status],
      ["registered", "300000000000003", "provider_update", "unverified"]);
    const [audit] = await sys(db, `select details from admin_audit_logs where action = 'provider.vat_status_changed' and target_id = $1 order by created_at desc limit 1`, [SEED.provider1]);
    assert.equal(audit.details.number_last3_after, "003");
    assert.ok(!JSON.stringify(audit.details).includes("300000000000003"), "the full number stays out of the log");
  });

  it("cannot be written directly, not even by the owner's own row policy", async () => {
    assert.notEqual(await outcome(as(db, owner1, `update providers set vat_registration_status = 'not_registered', vat_number = null where id = $1`, [SEED.provider1])), "ok");
    await expectError(as(db, admin, `update providers set vat_number = '311111111111113' where id = $1`, [SEED.provider1]), /provider_set_vat_status|permission denied/);
    const asCommand = (sql, params) => db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "authenticated", sub: SEED.owner1 })]);
      return (await tx.query(sql, params)).rows;
    });
    await expectError(asCommand(`update providers set vat_number = '311111111111113' where id = $1`, [SEED.provider1]), /provider_set_vat_status/);
  });

  it("is captured at onboarding consistently with the number, and approval copies it", async () => {
    const applicant = await createUser(db, { role: "customer" });
    const insert = (status, number) => sys(db, `insert into provider_applications (user_id, business_name_en, business_name_ar, contact_email, contact_phone, city, district,
        address_text, tax_number, vat_registration_status) values ($1, 'VAT Studio', 'استوديو', 'vat@studio.test', '+966501230000', 'Riyadh', 'Olaya', 'Street 1', $2, $3) returning id`,
      [applicant, number, status]);
    await expectError(insert("registered", "12345"), /provider_applications_vat_status_check/);
    await expectError(insert("not_registered", "300000000000003"), /provider_applications_vat_status_check/);
    const [{ id }] = await insert("not_registered", null);
    assert.ok(id);
    const [fn] = await sys(db, `select prosrc from pg_proc where proname = 'approve_provider_application'`);
    assert.match(fn.prosrc, /vat_registration_status, vat_status_declared_at, vat_status_source/);
  });
});
