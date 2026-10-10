import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";
import { acceptTerms, enableProgramme } from "./reward_fixtures.mjs";

// MONEY part 3 (D-Q7): programmes ship disabled; enabling needs every value, published terms and a different owner; with one
// administrator a programme cannot be enabled; terms are bilingual, immutable and accepted at enrolment; loyalty earning
// respects the cap; a loyalty discount is settled to the provider by the platform.
let db;
let owner;
let owner2;
let finance;
let operations;
let analyst;
const customer = ROLES.user(SEED.customer);
const owner1 = ROLES.user(SEED.owner1);
const outcome = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);
const EN = "These are the test terms of the programme, used only by the automated tests and never shown to anyone. ".repeat(3);
const AR = "هذه شروط اختبار للبرنامج تستخدمها الاختبارات الآلية فقط ولا تُعرض على أحد إطلاقاً. ".repeat(3);

const propose = (user, program, v = {}) => as(db, user,
  `select admin_propose_reward_program($1, $2, $3, $4, $5, $6, $7, 'Launching the programme for the season', $8, $9) r`,
  [program, v.enabled ?? true, v.reward ?? null, v.cap ?? null, v.budget ?? null, v.expiry ?? null, v.terms ?? null, v.pps ?? null, v.minRedeem ?? null])
  .then((r) => r[0].r);
const publish = (user, program, version, en = EN, ar = AR) =>
  as(db, user, `select admin_publish_reward_terms($1, $2, $3, $4, 'Publishing the approved terms')`, [program, version, en, ar]);

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  owner2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
});

describe("enabling a programme", () => {
  it("is refused while any value is unset, naming what is missing", async () => {
    await expectError(propose(finance, "referral"), /reward value, per-customer monthly cap, programme monthly budget, credit expiry, published terms version/);
    await expectError(propose(finance, "referral", { reward: 10, cap: 20, budget: 1000, expiry: 30 }), /published terms version/);
    await expectError(propose(finance, "referral", { reward: 10, cap: 20, budget: 1000, expiry: 30, terms: "v-unpublished" }), /not published/);
    await expectError(propose(finance, "loyalty", { reward: 0.1, cap: 20, budget: 1000, expiry: 30, terms: "x" }), /points per SAR, minimum points to redeem/);
    await expectError(propose(finance, "referral", { reward: 10, cap: 2000, budget: 1000, expiry: 30, terms: "x" }), /cannot exceed|not published/);
  });

  it("needs a different owner to approve; finance proposes but never approves, and nobody approves their own", async () => {
    await publish(finance, "referral", "ref-2026-10");
    const asked = await propose(finance, "referral", { reward: 10, cap: 20, budget: 1000, expiry: 30, terms: "ref-2026-10" });
    assert.equal(asked.status, "pending_approval");
    await expectError(as(db, finance, `select admin_decide_approval($1, 'approve', 'Looks right to me')`, [asked.approval_id]), /your own request/);
    const finance2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
    await expectError(as(db, finance2, `select admin_decide_approval($1, 'approve', 'Looks right to me')`, [asked.approval_id]), /cannot decide/);
    await expectError(as(db, operations, `select admin_decide_approval($1, 'approve', 'Looks right to me')`, [asked.approval_id]), /cannot decide/);
    const done = (await as(db, owner, `select admin_decide_approval($1, 'approve', 'Owner approves the launch') r`, [asked.approval_id]))[0].r;
    assert.equal(done.result.status, "enabled");
    const [p] = await sys(db, `select enabled, proposed_by, approved_by from reward_programs where program = 'referral'`);
    assert.deepEqual([p.enabled, p.proposed_by, p.approved_by], [true, finance.sub, owner.sub]);
    const setting = (await sys(db, `select value from platform_settings where key = 'referral_program'`))[0].value;
    assert.deepEqual([setting.enabled, Number(setting.reward_sar), setting.terms_version], [true, 10, "ref-2026-10"]);
  });

  it("refuses every role without money.config, and every direct write (constraint holds even for the table owner)", async () => {
    for (const user of [operations, analyst, customer, owner1, ROLES.anon]) {
      assert.equal(await outcome(propose(user, "loyalty", { enabled: false })), "42501");
      assert.equal(await outcome(publish(user, "loyalty", "l-1")), "42501");
    }
    for (const user of [owner, finance]) assert.equal(await outcome(as(db, user, `update reward_programs set enabled = true`)), "42501");
    await expectError(sys(db, `update reward_programs set enabled = true where program = 'loyalty'`), /reward_programs_enabled_complete/);
    await expectError(sys(db, `update platform_settings set value = '{"enabled": true}'::jsonb where key = 'loyalty_program'`), /approved programme change/);
  });

  it("cannot be enabled with one administrator: break-glass never applies", async () => {
    const solo = await createMigratedDb();
    const only = ROLES.user(await createUser(solo, { role: "admin", adminRole: "owner" }));
    await as(solo, only, `select admin_publish_reward_terms('referral', 'v1', $1, $2, 'Publishing the approved terms')`, [EN, AR]);
    const [asked] = await as(solo, only, `select admin_propose_reward_program('referral', true, 10, 20, 1000, 30, 'v1', 'Launching the programme for the season') r`);
    await expectError(as(solo, only, `select admin_decide_approval($1, 'approve', 'Approving my own request')`, [asked.r.approval_id]), /your own request/);
    await expectError(as(solo, only, `select admin_break_glass_execute($1, 'Only owner, launching the programme now')`, [asked.r.approval_id]), /never available/);
    assert.equal((await sys(solo, `select enabled from reward_programs where program = 'referral'`))[0].enabled, false);
  });
});

describe("terms", () => {
  it("are published in both languages, in full, and never change", async () => {
    await expectError(publish(finance, "loyalty", "short", "Too short", AR), /at least 200 characters/);
    await expectError(publish(finance, "loyalty", "bad version!"), /letters, digits/);
    await publish(finance, "loyalty", "loy-1");
    await expectError(publish(owner, "loyalty", "loy-1"), /already published/);
    await expectError(sys(db, `update reward_terms set body_en = 'changed' where version = 'loy-1'`), /never change/);
    await expectError(sys(db, `delete from reward_terms where version = 'loy-1'`), /append-only|never change/);
  });

  it("are accepted by a customer at enrolment, for the current version only", async () => {
    const status = (await as(db, customer, `select reward_program_status('referral') s`))[0].s;
    assert.deepEqual([status.enabled, status.accepted, status.terms_version], [true, false, "ref-2026-10"]);
    assert.ok(status.terms_ar.length >= 200 && status.terms_en.length >= 200);
    await expectError(as(db, customer, `select accept_reward_terms('referral', 'old', 'ar')`), /not the current terms/);
    await expectError(as(db, owner1, `select accept_reward_terms('referral', 'ref-2026-10', 'ar')`), /Only customers/);
    await expectError(as(db, ROLES.anon, `select accept_reward_terms('referral', 'ref-2026-10', 'ar')`), /permission denied/);
    await as(db, customer, `select accept_reward_terms('referral', 'ref-2026-10', 'ar')`);
    assert.equal((await as(db, customer, `select reward_program_status('referral') s`))[0].s.accepted, true);
    assert.equal((await as(db, customer, `select count(*)::int n from reward_terms_acceptances`))[0].n, 1);
    assert.equal((await as(db, ROLES.user(await createUser(db)), `select count(*)::int n from reward_terms_acceptances`))[0].n, 0, "nobody reads another's acceptance");
    await expectError(as(db, customer, `select accept_reward_terms('loyalty', 'loy-1', 'en')`), /not running/);
  });
});

describe("loyalty", () => {
  it("earns only after the terms are accepted, within the monthly cap, with expiry; the discount is settled by the platform", async () => {
    await enableProgramme(db, "loyalty", { reward: 0.5, pointsPerSar: 1, minRedeem: 10, cap: 20, budget: 1000, expiry: 365 });
    const svc = await serviceFor(db, SEED.employee1);
    const visit = async (user, total, extra = "") => {
      const [row] = await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price,
          total_price, tax_amount, deposit_required, platform_commission, source${extra ? ", loyalty_points_redeemed, discount_amount" : ""})
        values ($1, $2, $3, $4, 'confirmed', now() - interval '2 hours' - make_interval(mins => (random() * 1000)::int), 30, $5, $5, 0, 0, 0, 'marketplace'${extra})
        returning id`, [user.sub, SEED.branch1, SEED.employee1, svc.id, total]);
      await as(db, owner1, `select employee_update_booking_status($1, 'completed')`, [row.id]);
      return row.id;
    };
    const member = ROLES.user(await createUser(db));
    await visit(member, 30);
    assert.equal((await sys(db, `select count(*)::int n from customer_loyalty where customer_id = $1`, [member.sub]))[0].n, 0, "no enrolment, no points");
    await acceptTerms(db, member, "loyalty");
    await visit(member, 30);
    await visit(member, 30);
    const [row] = await sys(db, `select points_balance from customer_loyalty where customer_id = $1`, [member.sub]);
    assert.equal(row.points_balance, 40, "30 points, then only 10 more: SAR 20 cap / 0.5 per point = 40 points this month");
    const [earned] = await sys(db, `select expires_at from loyalty_points_ledger l join customer_loyalty c on c.id = l.loyalty_id where c.customer_id = $1 limit 1`, [member.sub]);
    assert.ok(new Date(earned.expires_at) > new Date(Date.now() + 360 * 86400000));

    const redeemed = await visit(member, 40, ", 20, 10");
    const [settlement] = await sys(db, `select provider_share, funded_by from transactional_ledger where booking_id = $1 and entry_type = 'loyalty_settlement'`, [redeemed]);
    assert.deepEqual([Number(settlement.provider_share), settlement.funded_by], [10, "platform"], "the provider is paid the loyalty discount");
    await expectError(as(db, customer, `select expire_loyalty_points()`), /Service role|permission denied/);
    assert.equal(typeof (await as(db, ROLES.service, `select expire_loyalty_points() n`))[0].n, "number");
  });

  it("tags every wallet credit redemption as platform-funded", async () => {
    const [c] = await sys(db, `select pg_get_constraintdef(oid) d from pg_constraint where conname = 'wallet_credit_redemptions_funded_by_check'`);
    assert.match(c.d, /platform/);
  });
});

describe("console view", () => {
  it("is readable by console roles only", async () => {
    const view = (await as(db, analyst, `select admin_reward_programs() v`))[0].v;
    assert.equal(view.programs.length, 2);
    assert.equal(view.can_approve, false);
    assert.equal((await as(db, owner2, `select admin_reward_programs() v`))[0].v.can_approve, true);
    for (const user of [customer, owner1, ROLES.anon]) assert.equal(await outcome(as(db, user, `select admin_reward_programs()`)), "42501");
  });
});
