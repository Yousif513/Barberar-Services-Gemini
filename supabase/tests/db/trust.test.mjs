import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, nextWorkingDate, ROLES, SEED, sys } from "./harness.mjs";

let db;
let admin;
const owner1 = ROLES.user(SEED.owner1);
const customer = ROLES.user(SEED.customer);

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
});

describe("anonymous access", () => {
  it("exposes only read-only discovery functions to anonymous visitors", async () => {
    const allowed = new Set([
      "get_available_slots", "get_branch_available_slots", "get_branch_schedule_with_prayer_pauses",
      "search_marketplace_providers", "normalize_arabic",
    ]);
    const rows = await sys(db, `
      select distinct p.proname
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      join pg_roles r on r.oid = a.grantee
      where p.pronamespace = 'public'::regnamespace and a.privilege_type = 'EXECUTE' and r.rolname = 'anon'
        and p.prorettype <> 'trigger'::regtype
      order by 1`);
    const unexpected = rows.map((r) => r.proname).filter((n) => !allowed.has(n));
    assert.deepEqual(unexpected, [], `anon can execute: ${unexpected.join(", ")}`);
  });

  it("lets guests see availability before signing in", async () => {
    const date = await nextWorkingDate(db, SEED.employee1);
    const rows = await as(db, ROLES.anon, `select count(*)::int n from get_available_slots($1, $2::date, 30)`, [SEED.employee1, date]);
    assert.ok(rows[0].n > 0);
    const search = (await as(db, ROLES.anon, `select search_marketplace_providers(null) r`))[0].r;
    assert.ok(search.total_count > 0);
  });

  it("does not let anyone else confirm attendance on a booking", async () => {
    const b = (await sys(db, `select id from bookings limit 1`))[0];
    if (!b) return;
    await expectError(as(db, ROLES.anon, `select customer_confirm_attendance($1)`, [b.id]), /permission denied/);
    const stranger = ROLES.user(await createUser(db));
    await expectError(as(db, stranger, `select customer_confirm_attendance($1)`, [b.id]), /Not authorized|not found/);
  });
});

describe("verification and onboarding", () => {
  it("records CR verification only from the Wathq integration or an admin review", async () => {
    await expectError(as(db, owner1, `select record_wathq_cr_verification($1, '1010101010', true, '{}'::jsonb)`, [SEED.provider1]), /permission denied/);
    await expectError(as(db, owner1, `select admin_record_cr_review($1, '1010101010', 'looked at it')`, [SEED.provider1]), /Administrator/);
    const fn = await sys(db, `select count(*)::int n from pg_proc where proname = 'verify_provider_cr'`);
    assert.equal(fn[0].n, 0, "the self-verification function is gone");
    await as(db, admin, `select admin_record_cr_review($1, '1010101010', 'CR certificate checked, valid to 1449-03')`, [SEED.provider1]);
    const manual = (await sys(db, `select cr_verification_status, cr_wathq_data->>'source' src from providers where id = $1`, [SEED.provider1]))[0];
    assert.equal(manual.cr_verification_status, "manually_reviewed");
    assert.equal(manual.src, "manual_admin_review");
    await as(db, ROLES.service, `select record_wathq_cr_verification($1, '1010101010', true, '{"status":"active"}'::jsonb)`, [SEED.provider1]);
    const wathq = (await sys(db, `select cr_verification_status, cr_wathq_data->>'source' src from providers where id = $1`, [SEED.provider1]))[0];
    assert.equal(wathq.cr_verification_status, "verified");
    assert.equal(wathq.src, "wathq_api");
  });

  it("activates an approved provider and refuses incomplete applications", async () => {
    const applicant = await createUser(db);
    const insert = (lat) => as(db, ROLES.user(applicant),
      `insert into provider_applications (user_id, business_name_en, business_name_ar, contact_email, contact_phone, district, address_text, latitude, longitude, cr_number, tax_number)
       values ($1, 'Malqa Cuts', 'قصات الملقا', 'a@b.sa', '+966500001234', 'Al Malqa', 'King Fahd Rd', $2, $3, '1010202020', '300012345600003') returning id`,
      [applicant, lat, lat === null ? null : 46.6]).then((r) => r[0].id);
    const noLocation = await insert(null);
    await expectError(as(db, admin, `select approve_provider_application($1, 'Documents checked')`, [noLocation]), /location/);
    await as(db, admin, `select reject_provider_application($1, 'Missing location')`, [noLocation]);
    const app = await insert(24.8);
    await expectError(as(db, owner1, `select approve_provider_application($1, 'Documents checked')`, [app]), /Administrator/);
    const r = (await as(db, admin, `select approve_provider_application($1, 'Documents checked') r`, [app]))[0].r;
    const p = (await sys(db, `select status, is_verified, description_en, vat_number, cr_number from providers where id = $1`, [r.provider_id]))[0];
    assert.equal(p.status, "active");
    assert.equal(p.is_verified, true);
    assert.equal(p.description_en, null, "no invented marketing copy");
    assert.equal(p.vat_number, "300012345600003");
    const branch = (await sys(db, `select district, latitude from branches where id = $1`, [r.branch_id]))[0];
    assert.equal(branch.district, "Al Malqa");
    assert.equal(Number(branch.latitude), 24.8);
    const audit = await sys(db, `select count(*)::int n from admin_audit_logs where action = 'provider_application.approved' and target_id = $1`, [app]);
    assert.equal(audit[0].n, 1);
  });

  it("accepts only published agreements", async () => {
    const draft = (await sys(db, `select id, version, status from legal_agreements where agreement_key = 'customer_terms'`))[0];
    assert.equal(draft.status, "draft");
    await expectError(as(db, customer, `select record_agreement_acceptance('customer_terms', $1)`, [draft.version]), /published/);
    await expectError(as(db, admin, `select admin_publish_agreement($1, '')`, [draft.id]), /reviewed/);
    await as(db, admin, `select admin_publish_agreement($1, 'Reviewed by counsel 2026-10-04')`, [draft.id]);
    const id = (await as(db, customer, `select record_agreement_acceptance('customer_terms', $1) id`, [draft.version]))[0].id;
    assert.ok(id);
    const text = (await sys(db, `select content_ar from legal_agreements where id = $1`, [draft.id]))[0].content_ar;
    assert.ok(!text.includes("كوسيط تقني مرخص"), "no unbacked licensed-intermediary claim");
  });
});

describe("search, import and messaging", () => {
  it("searches with Arabic normalization and reports no rating when there are no reviews", async () => {
    await sys(db, `update providers set business_name_ar = 'صالون الأناقة' where id = $1`, [SEED.provider1]);
    const hit = (await as(db, ROLES.anon, `select search_marketplace_providers('الاناقه') r`))[0].r;
    const row = hit.providers.find((p) => p.provider_id === SEED.provider1);
    assert.ok(row, "hamza and taa marbuta variants match");
    if (Number(row.reviews) === 0) assert.equal(row.rating, null);
    assert.ok(Array.isArray(row.sample_services));
  });

  it("imports clients as provider contacts without inventing accounts", async () => {
    const profilesBefore = (await sys(db, `select count(*)::int n from profiles`))[0].n;
    await expectError(as(db, owner1, `select import_provider_clients($1, '[{"name":"Ali","phone":"0501112222"}]'::jsonb, false)`, [SEED.provider1]), /PDPL/);
    await expectError(as(db, customer, `select import_provider_clients($1, '[{"name":"Ali"}]'::jsonb, true)`, [SEED.provider1]), /provider owner/);
    const r = (await as(db, owner1, `select import_provider_clients($1, $2::jsonb, true) r`, [SEED.provider1,
      JSON.stringify([{ name: "Ali", phone: "0501112222" }, { name: "Bad", phone: "12" }, { name: "Omar", phone: "+966501113333", is_vip: true }])]))[0].r;
    assert.equal(r.successful_rows, 2);
    assert.equal(r.skipped_rows, 1);
    const contact = (await sys(db, `select phone from provider_client_contacts where full_name = 'Ali'`))[0];
    assert.equal(contact.phone, "+966501112222");
    assert.equal((await sys(db, `select count(*)::int n from profiles`))[0].n, profilesBefore);
  });

  it("dispatches only to verified, consenting recipients and never marks a message sent without a provider id", async () => {
    const verified = await createUser(db, { phone: "+966509990001", verified: true });
    const unverified = await createUser(db, { phone: "+966509990002", verified: false });
    await as(db, ROLES.user(verified), `select record_consent('whatsapp')`);
    const enqueue = (id, phone) => sys(db, `insert into message_queue (recipient_phone, recipient_id, channel, template_name, locale, variables, scheduled_for, status)
      values ($2, $1, 'whatsapp', 'booking_confirmation', 'en', '{"customer_name":"Sara","provider_name":"Elite"}'::jsonb, now(), 'pending') returning id`, [id, phone]).then((r) => r[0].id);
    const okId = await enqueue(verified, "+966509990001");
    const badId = await enqueue(unverified, "+966509990002");

    await expectError(as(db, customer, `select claim_message_batch(10)`), /permission denied/);
    const batch = (await as(db, ROLES.service, `select claim_message_batch(50) r`))[0].r;
    const mine = batch.messages.find((m) => m.queue_id === okId);
    assert.ok(mine, "verified + consenting recipient is claimed");
    assert.equal(mine.template, "primora_booking_confirmation");
    assert.equal(mine.body_params[0], "Sara");
    assert.equal((await sys(db, `select status from message_queue where id = $1`, [badId]))[0].status, "skipped_unverified");

    await expectError(as(db, ROLES.service, `select complete_message_delivery($1, true, '')`, [okId]), /provider message id/);
    await as(db, ROLES.service, `select complete_message_delivery($1, true, 'wamid.HBgM123')`, [okId]);
    const log = (await sys(db, `select status, external_id, cost_sar from message_log where queue_id = $1 and status = 'sent'`, [okId]))[0];
    assert.equal(log.external_id, "wamid.HBgM123");
    assert.equal(log.cost_sar, null, "no invented cost");
    assert.equal((await sys(db, `select count(*)::int n from pg_proc where proname = 'dispatch_message_queue_batch'`))[0].n, 0);
  });
});

describe("provider analytics (P2-C)", () => {
  it("runs the analytics functions for the owner and refuses customers", async () => {
    const from = "2026-01-01";
    const to = "2026-12-31";
    for (const fn of ["get_provider_detailed_analytics", "get_provider_multi_branch_summary", "calculate_staff_payroll"]) {
      const ok = await as(db, owner1, `select ${fn}($1, $2::date, $3::date) r`, [SEED.provider1, from, to]);
      assert.ok(ok[0].r !== undefined, `${fn} returned`);
      await expectError(as(db, customer, `select ${fn}($1, $2::date, $3::date)`, [SEED.provider1, from, to]), /not authorized|Forbidden/i);
    }
    const summary = (await as(db, owner1, `select get_provider_monthly_value_summary($1) r`, [SEED.provider1]))[0].r;
    assert.equal(summary.success, true);
    const fav = (await as(db, customer, `select toggle_customer_favorite($1) r`, [SEED.provider1]))[0].r;
    assert.ok(fav !== undefined);
  });
});
