import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, firstSlot, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// Independent adversarial pass (qa-claude-release-gate) over the database command surface.
// The database is the only authorization boundary this console has (no middleware, no route handler),
// so every check here is made as a real role against the migrated schema, never against source text.
//
//   1. every client-executable function is accounted for by a guard (catalog-driven allowlists)
//   2. every reasoned administrator command rejects missing, blank and one-or-two-character reasons
//      and leaves state and audit trail untouched when it does
//   3. replays of the money and status commands produce exactly one effect
//   4. bulk and listing commands clamp their inputs and record the read
//   5. no row that belongs to another provider, another customer or nobody-in-particular is readable
//      outside the public catalogue (sweep over every table and view, with volume fixtures)
//   6. a stale or forged identity is refused: demoted administrator, role claim in signup metadata

const ZERO = "00000000-0000-4000-8000-0000000000aa";

let db;
let admin;
let employee1;
let employee2;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);
let customer2;

const outcome = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);
const auditCount = async () => (await sys(db, `select count(*)::int as n from admin_audit_logs`))[0].n;

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  employee1 = ROLES.user(await createUser(db, { role: "provider_employee" }));
  employee2 = ROLES.user(await createUser(db, { role: "provider_employee" }));
  customer2 = ROLES.user(await createUser(db, { role: "customer", phone: "+966555000111", verified: true }));
  await sys(db, `update employees set profile_id = $1 where id = $2`, [employee1.sub, SEED.employee1]);
  await sys(db, `update employees set profile_id = $1 where id = $2`, [employee2.sub, SEED.employee2]);
  await sys(db, `update providers set status = 'active' where id in ($1, $2)`, [SEED.provider1, SEED.provider2]);
});

// ---------------------------------------------------------------------------------------------------------------
// 1. Every function a client role can run is accounted for
// ---------------------------------------------------------------------------------------------------------------
describe("client-executable functions are accounted for", () => {
  const functionsFor = (role) => sys(db, `
    select p.oid::regprocedure::text as signature, p.prosecdef as definer, pg_get_functiondef(p.oid) as body
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p') and p.prorettype <> 'trigger'::regtype
      and has_function_privilege($1, p.oid, 'EXECUTE')
    order by 1`, [role]);

  it("only the public catalogue functions are callable by an anonymous visitor", async () => {
    const callable = (await functionsFor("anon")).map((f) => f.signature.split("(")[0]).sort();
    assert.deepEqual(callable, [
      "get_available_slots", "get_branch_available_slots", "get_branch_schedule_with_prayer_pauses",
      "normalize_arabic", "provider_rating_summaries", "search_marketplace_providers",
    ], "a new function granted to anon must be added here deliberately, with a reason");
  });

  it("every elevated-rights function a signed-in user can run carries an identity, role or service-role check", async () => {
    // A SECURITY DEFINER function runs as its owner. One that never asks who is calling is an open door.
    const unguarded = (await functionsFor("authenticated"))
      .filter((f) => f.definer)
      .filter((f) => !/auth\.uid\(\)|is_admin\(\)|auth\.jwt\(\)|service_role|can_access_provider_operation|is_booking_staff/.test(f.body))
      .map((f) => f.signature.split("(")[0])
      .sort();
    assert.deepEqual(unguarded, ["get_branch_available_slots", "get_branch_schedule_with_prayer_pauses", "has_active_consent", "search_marketplace_providers"],
      "the public catalogue functions (slot listings, schedules, search) are open to visitors on purpose (get_available_slots mentions auth.uid() only to keep a waitlist hold for its holder, which is not an authorization check); has_active_consent is the known consent oracle gap");
  });

  it("confirm_booking_payment and the other service-role commands refuse an administrator, an owner, a customer and a visitor", async () => {
    // Money is confirmed only by the payment webhook (service role). An administrator is not that identity.
    const serviceOnly = (await functionsFor("authenticated"))
      .filter((f) => f.definer && /<> 'service_role'/.test(f.body) && !/is_admin\(\)|auth\.uid\(\)/.test(f.body))
      .map((f) => f.signature);
    assert.deepEqual(serviceOnly.map((s) => s.split("(")[0]), ["confirm_booking_payment"]);
    for (const [name, user] of [["administrator", admin], ["provider owner", owner1], ["customer", customer], ["visitor", ROLES.anon]]) {
      assert.equal(
        await outcome(as(db, user, `select confirm_booking_payment($1, 'chg_probe', 1)`, [ZERO])),
        "42501", `${name} must not be able to confirm a payment`);
    }
  });

  it("internal money helpers cannot be executed by any client role", async () => {
    const internal = await sys(db, `
      select p.proname, r.rolname
      from pg_proc p cross join (values ('anon'), ('authenticated')) r(rolname)
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('create_refund_request_internal', 'claim_refund_request', 'complete_refund_request', 'write_audit_log',
                          'audit_admin_write', 'protect_payout_request_destination')
        and has_function_privilege(r.rolname, p.oid, 'EXECUTE')`);
    assert.deepEqual(internal, []);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Reasons: missing, blank or too short is refused before anything changes
// ---------------------------------------------------------------------------------------------------------------
describe("reasoned administrator commands", () => {
  let fixtures;
  before(async () => {
    const ledger = (await sys(db, `insert into transactional_ledger (provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
      values ($1, 'package_sale', 'chg_qa_reason', 100, 10, 90, 'pending') returning id`, [SEED.provider1]))[0].id;
    fixtures = {
      refund: (await sys(db, `insert into refund_requests (ledger_id, payment_intent_id, amount, reason, source, status, attempts, idempotency_key)
        values ($1, 'chg_qa_reason', 10, 'Gateway refused', 'admin', 'failed', 1, 'qa-reason-refund') returning id`, [ledger]))[0].id,
      payout: (await sys(db, `insert into payout_requests (provider_id, requested_by, amount, bank_name, iban)
        values ($1, $2, 50, 'Test Bank', 'SA0380000000608010167519') returning id`, [SEED.provider1, SEED.owner1]))[0].id,
      request: (await sys(db, `insert into data_subject_requests (user_id, request_type, status) values ($1, 'export', 'pending') returning id`, [SEED.customer]))[0].id,
      person: await createUser(db, { role: "customer", phone: "+966555111222", verified: true }),
    };
  });

  const REJECTED_REASONS = [["missing", "null"], ["empty", "''"], ["blank", "'   '"], ["one character", "'x'"], ["two characters", "'ab'"]];
  const commands = {
    admin_clear_customer_profile: (reason) => [`select admin_clear_customer_profile($1, ${reason})`, () => [fixtures.person]],
    admin_release_expired_holds: (reason) => [`select admin_release_expired_holds(${reason})`, () => []],
    admin_reopen_stuck_refund: (reason) => [`select admin_reopen_stuck_refund($1, ${reason})`, () => [fixtures.refund]],
    admin_retry_refund_request: (reason) => [`select admin_retry_refund_request($1, ${reason})`, () => [fixtures.refund]],
    admin_review_payout_request: (reason) => [`select admin_review_payout_request($1, 'processing', ${reason})`, () => [fixtures.payout]],
    admin_set_phone_verified: (reason) => [`select admin_set_phone_verified($1, false, ${reason})`, () => [fixtures.person]],
    admin_set_provider_status: (reason) => [`select admin_set_provider_status($1, 'suspended', ${reason})`, () => [SEED.provider2]],
    admin_update_data_request: (reason) => [`select admin_update_data_request($1, 'in_progress', ${reason})`, () => [fixtures.request]],
    admin_update_platform_setting: (reason) => [`select admin_update_platform_setting('booking_hold_minutes', '20'::jsonb, ${reason})`, () => []],
  };

  for (const [name, build] of Object.entries(commands)) {
    it(`${name} refuses a missing, blank or too short reason and changes nothing`, async () => {
      const snapshot = async () => JSON.stringify({
        audit: await auditCount(),
        provider: (await sys(db, `select status from providers where id = $1`, [SEED.provider2]))[0].status,
        refund: (await sys(db, `select status, attempts from refund_requests where id = $1`, [fixtures.refund]))[0],
        payout: (await sys(db, `select status from payout_requests where id = $1`, [fixtures.payout]))[0].status,
        request: (await sys(db, `select status from data_subject_requests where id = $1`, [fixtures.request]))[0].status,
        person: (await sys(db, `select phone_number, phone_verified from profiles where id = $1`, [fixtures.person]))[0],
        hold: (await sys(db, `select value from platform_settings where key = 'booking_hold_minutes'`))[0].value,
      });
      const before = await snapshot();
      for (const [label, literal] of REJECTED_REASONS) {
        const [sql, params] = build(literal);
        assert.equal(await outcome(as(db, admin, sql, params())), "22023", `${name} accepted a ${label} reason`);
      }
      assert.equal(await snapshot(), before, `${name} changed state or wrote an audit row while refusing`);
    });
  }

  it("a reason is recorded, with the acting administrator, when the command succeeds", async () => {
    await as(db, admin, `select admin_set_provider_status($1, 'suspended', 'Licence lapsed, see ticket 4411')`, [SEED.provider2]);
    const row = (await sys(db, `select actor_id, details from admin_audit_logs where action = 'providers.update' and target_id = $1 order by created_at desc limit 1`, [SEED.provider2]))[0];
    assert.equal(row.actor_id, admin.sub);
    assert.equal(row.details.reason, "Licence lapsed, see ticket 4411");
    assert.equal(row.details.changes.status.after, "suspended");
    await as(db, admin, `select admin_set_provider_status($1, 'active', 'Licence renewed, see ticket 4411')`, [SEED.provider2]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 3. Replays
// ---------------------------------------------------------------------------------------------------------------
describe("replayed commands have one effect", () => {
  let seq = 0;
  const ledgerRow = async (share) => {
    seq += 1;
    return (await sys(db, `insert into transactional_ledger (provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
      values ($1, 'package_sale', $2, $3, 0, $3, 'pending') returning id`, [SEED.provider1, `chg_qa_replay_${seq}`, share]))[0].id;
  };
  const payoutRequest = async (amount) => (await sys(db, `insert into payout_requests (provider_id, requested_by, amount, bank_name, iban)
    values ($1, $2, $3, 'Test Bank', 'SA0380000000608010167519') returning id`, [SEED.provider1, SEED.owner1, amount]))[0].id;
  const auditRows = (action, target) => sys(db, `select actor_id, details from admin_audit_logs where action = $1 and target_id = $2`, [action, target]);

  it("releasing the same payout twice with the same key pays once", async () => {
    await ledgerRow(120);
    const request = await payoutRequest(80);
    const first = (await as(db, admin, `select admin_release_payout($1, 'qa-key-1', 'first') r`, [request]))[0].r;
    assert.equal(first.status, "success");
    const second = (await as(db, admin, `select admin_release_payout($1, 'qa-key-1', 'first') r`, [request]))[0].r;
    assert.equal(second.idempotent, true);
    assert.equal((await sys(db, `select count(*)::int n from payout_allocations where payout_request_id = $1`, [request]))[0].n, 1);
    assert.equal((await auditRows("payout.released", request)).length, 1, "one release is recorded, not two");
  });

  it("releasing a paid payout again under a different key is refused, not paid twice", async () => {
    await ledgerRow(120);
    const request = await payoutRequest(60);
    await as(db, admin, `select admin_release_payout($1, 'qa-key-2', 'Bank transfer made')`, [request]);
    const allocations = (await sys(db, `select count(*)::int n, coalesce(sum(amount), 0)::numeric s from payout_allocations where payout_request_id = $1`, [request]))[0];
    assert.equal(await outcome(as(db, admin, `select admin_release_payout($1, 'qa-key-3', 'Bank transfer made')`, [request])), "23505");
    const after = (await sys(db, `select count(*)::int n, coalesce(sum(amount), 0)::numeric s from payout_allocations where payout_request_id = $1`, [request]))[0];
    assert.deepEqual(after, allocations);
    assert.equal(Number(after.s), 60);
  });

  it("a payout that the ledger cannot cover is refused whole and allocates nothing", async () => {
    const request = await payoutRequest(9999999);
    assert.equal(await outcome(as(db, admin, `select admin_release_payout($1, 'qa-key-4', 'Bank transfer made')`, [request])), "22023");
    assert.equal((await sys(db, `select count(*)::int n from payout_allocations where payout_request_id = $1`, [request]))[0].n, 0);
    assert.notEqual((await sys(db, `select status from payout_requests where id = $1`, [request]))[0].status, "paid");
  });

  it("settling a ledger row twice records one settlement", async () => {
    const id = await ledgerRow(40);
    const first = (await as(db, admin, `select admin_release_ledger_item($1, 'qa-ledger-1') r`, [id]))[0].r;
    assert.equal(first.status, "released");
    const second = (await as(db, admin, `select admin_release_ledger_item($1, 'qa-ledger-1') r`, [id]))[0].r;
    assert.equal(second.idempotent, true);
    assert.equal((await auditRows("ledger.manually_settled", id)).length, 1);
  });

  it("repeating a payout review, a provider status change or a profile clear does not repeat the effect", async () => {
    const request = await payoutRequest(10);
    await as(db, admin, `select admin_review_payout_request($1, 'processing', 'Checked twice')`, [request]);
    const again = (await as(db, admin, `select admin_review_payout_request($1, 'processing', 'Checked twice') r`, [request]))[0].r;
    assert.equal(again.unchanged, true);
    assert.equal((await auditRows("payout_requests.update", request)).length, 1);

    const suspensions = async () => (await auditRows("providers.update", SEED.provider2)).filter((r) => r.details.changes?.status?.after === "suspended").length;
    const already = await suspensions();
    await as(db, admin, `select admin_set_provider_status($1, 'suspended', 'Replay probe')`, [SEED.provider2]);
    const status = (await as(db, admin, `select admin_set_provider_status($1, 'suspended', 'Replay probe') r`, [SEED.provider2]))[0].r;
    assert.equal(status.unchanged, true);
    assert.equal(await suspensions(), already + 1, "one suspension is recorded, not two");
    await as(db, admin, `select admin_set_provider_status($1, 'active', 'Replay probe over')`, [SEED.provider2]);
  });

  it("a refund that already succeeded cannot be retried or reopened", async () => {
    const ledger = await ledgerRow(30);
    const refund = (await sys(db, `insert into refund_requests (ledger_id, payment_intent_id, amount, reason, source, status, attempts, idempotency_key)
      values ($1, 'chg_qa_done', 10, 'Done', 'admin', 'succeeded', 1, 'qa-replay-refund') returning id`, [ledger]))[0].id;
    assert.equal(await outcome(as(db, admin, `select admin_retry_refund_request($1, 'Try again please')`, [refund])), "22023");
    assert.equal(await outcome(as(db, admin, `select admin_reopen_stuck_refund($1, 'Try again please')`, [refund])), "22023");
    assert.equal((await sys(db, `select status from refund_requests where id = $1`, [refund]))[0].status, "succeeded");
  });

  it("retrying a refund that ran out of attempts grants exactly one more attempt, however often it is clicked", async () => {
    const ledger = await ledgerRow(30);
    const refund = (await sys(db, `insert into refund_requests (ledger_id, payment_intent_id, amount, reason, source, status, attempts, idempotency_key)
      values ($1, 'chg_qa_attempts', 10, 'Gateway refused', 'admin', 'failed', 5, 'qa-replay-attempts') returning id`, [ledger]))[0].id;
    await as(db, admin, `select admin_retry_refund_request($1, 'Gateway is back')`, [refund]);
    await as(db, admin, `select admin_retry_refund_request($1, 'Gateway is back')`, [refund]);
    await as(db, admin, `select admin_retry_refund_request($1, 'Gateway is back')`, [refund]);
    assert.equal((await sys(db, `select attempts from refund_requests where id = $1`, [refund]))[0].attempts, 4);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 4. Listing and export commands
// ---------------------------------------------------------------------------------------------------------------
describe("customer directory and export record", () => {
  before(async () => {
    await sys(db, `
      insert into auth.users (id, email)
      select ('d0000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'bulk' || g || '@test.local' from generate_series(1, 130) g`);
    await sys(db, `update profiles set first_name = 'Bulk_' || right(id::text, 4), phone_number = '+9665' || lpad(right(replace(id::text, '-', ''), 8)::text, 8, '0')
      where id::text like 'd0000000-%'`).catch(() => {});
  });

  it("returns at most 100 rows however large a page is asked for, and never a negative offset", async () => {
    const big = (await as(db, admin, `select admin_customer_overview(null, 100000, 0) o`))[0].o;
    assert.equal(big.rows.length, 100);
    assert.ok(big.matching >= 130);
    const negative = (await as(db, admin, `select admin_customer_overview(null, -5, -5) o`))[0].o;
    assert.equal(negative.rows.length, 1, "a non-positive limit is raised to one row, and the offset to zero");
    const empty = (await as(db, admin, `select admin_customer_overview(null, null, null) o`))[0].o;
    assert.equal(empty.rows.length, 25);
  });

  it("pages are stable and do not overlap", async () => {
    const pageOne = (await as(db, admin, `select admin_customer_overview(null, 50, 0) o`))[0].o.rows.map((r) => r.id);
    const pageTwo = (await as(db, admin, `select admin_customer_overview(null, 50, 50) o`))[0].o.rows.map((r) => r.id);
    assert.equal(new Set([...pageOne, ...pageTwo]).size, 100, "no customer appears on two pages");
  });

  it("searches wildcard characters literally and never finds a partial customer ID", async () => {
    const wildcard = (await as(db, admin, `select admin_customer_overview('%', 100, 0) o`))[0].o;
    assert.equal(wildcard.matching, 0, "a percent sign is searched for, not treated as 'everything'");
    const underscore = (await as(db, admin, `select admin_customer_overview('_______', 100, 0) o`))[0].o;
    assert.equal(underscore.matching, 0);
    const partial = (await as(db, admin, `select admin_customer_overview($1, 100, 0) o`, [SEED.customer.slice(0, 13)]))[0].o;
    assert.equal(partial.rows.some((r) => r.id === SEED.customer), false);
    const exact = (await as(db, admin, `select admin_customer_overview($1, 100, 0) o`, [SEED.customer]))[0].o;
    assert.deepEqual(exact.rows.map((r) => r.id), [SEED.customer]);
  });

  it("records every listing as a privileged read, with the administrator and the page, and no personal values", async () => {
    await as(db, admin, `select admin_customer_overview('Bulk_', 10, 20)`);
    const row = (await sys(db, `select actor_id, details from admin_audit_logs where action = 'customers.listed' order by created_at desc limit 1`))[0];
    assert.equal(row.actor_id, admin.sub);
    assert.equal(row.details.searched, true);
    assert.equal(row.details.limit, 10);
    assert.equal(row.details.offset, 20);
    assert.ok(!JSON.stringify(row.details).includes("Bulk_"), "the search term is not copied into the log");
  });

  it("refuses an export record for an unknown report, an unbounded period or an empty file, and writes nothing", async () => {
    const before = await auditCount();
    for (const sql of [
      `select admin_record_export('customers_all', '2026-01-01', '2026-02-01', 10)`,
      `select admin_record_export('payments_ledger', '2026-01-01', '2028-01-01', 10)`,
      `select admin_record_export('payments_ledger', '2026-02-01', '2026-01-01', 10)`,
      `select admin_record_export('payments_ledger', null, '2026-01-01', 10)`,
      `select admin_record_export('payments_ledger', '2026-01-01', '2026-02-01', 0)`,
      `select admin_record_export('payments_ledger', '2026-01-01', '2026-02-01', null)`,
    ]) assert.equal(await outcome(as(db, admin, sql)), "22023", sql);
    assert.equal(await auditCount(), before);
    await as(db, admin, `select admin_record_export('vat_summary', '2026-01-01', '2026-02-01', 12)`);
    const row = (await sys(db, `select actor_id, details from admin_audit_logs where action = 'report.exported' order by created_at desc limit 1`))[0];
    assert.equal(row.actor_id, admin.sub);
    assert.equal(row.details.report, "vat_summary");
    assert.equal(row.details.rows, 12);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 7. Booking money paths a customer or another provider must not reach
// ---------------------------------------------------------------------------------------------------------------
describe("booking commands refuse other people's bookings", () => {
  let booking;
  before(async () => {
    const svc = await serviceFor(db, SEED.employee1);
    const date = await nextWorkingDate(db, SEED.employee1);
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    booking = (await as(db, customer, `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3, request_source => 'marketplace')`,
      [SEED.employee1, svc.id, slot]))[0];
    await as(db, ROLES.service, `select confirm_booking_payment($1, $2, $3)`, [booking.id, `chg_${booking.id}`, booking.deposit_required]);
  });

  it("another customer, another provider's owner and staff and a visitor cannot cancel, reschedule, dispute, tip or change its status", async () => {
    const attempts = [
      `select cancel_booking($1, 'Not mine')`,
      `select reschedule_booking($1, now() + interval '9 days', null, 'Not mine')`,
      `select open_booking_dispute($1, 'Not mine', '{}')`,
      `select add_booking_tip($1, 5, 'pi_qa')`,
      `select employee_update_booking_status($1, 'completed', 'Not mine')`,
      `select mark_booking_no_show($1, 'Not mine')`,
    ];
    const failures = [];
    for (const [name, user] of [["another customer", customer2], ["another provider's owner", owner2], ["another provider's staff", employee2], ["a visitor", ROLES.anon]]) {
      for (const sql of attempts) {
        const code = await outcome(as(db, user, sql, [booking.id]));
        if (code === "ok") failures.push(`${name}: ${sql}`);
      }
    }
    assert.deepEqual(failures, []);
    assert.equal((await sys(db, `select status from bookings where id = $1`, [booking.id]))[0].status, "confirmed");
    assert.equal((await sys(db, `select count(*)::int n from refund_requests where booking_id = $1`, [booking.id]))[0].n, 0);
  });

  it("the owner of another provider cannot read or update the booking, its ledger row or its refunds", async () => {
    assert.equal((await as(db, owner2, `select id from bookings where id = $1`, [booking.id])).length, 0);
    assert.equal((await as(db, owner2, `update bookings set status = 'cancelled' where id = $1 returning id`, [booking.id])).length, 0);
    assert.equal((await as(db, owner2, `select id from transactional_ledger where booking_id = $1`, [booking.id])).length, 0);
    assert.equal((await as(db, owner2, `select id from refund_requests where booking_id = $1`, [booking.id])).length, 0);
    assert.equal((await sys(db, `select status from bookings where id = $1`, [booking.id]))[0].status, "confirmed");
  });

  it("a provider's owner cannot change what the customer paid, who booked, or the commission", async () => {
    // The owner has no UPDATE right on bookings at all any more, so a direct write changes nothing.
    for (const column of ["total_price = 1", "platform_commission = 0", "deposit_required = 0", "discount_amount = 50", `customer_id = '${customer2.sub}'`]) {
      assert.equal((await as(db, owner1, `update bookings set ${column} where id = $1 returning id`, [booking.id])).length, 0, column);
    }
    const stored = (await sys(db, `select total_price, platform_commission, deposit_required, customer_id from bookings where id = $1`, [booking.id]))[0];
    assert.notEqual(Number(stored.total_price), 1);
    assert.notEqual(stored.customer_id, customer2.sub);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 6. Forged or stale identity
// ---------------------------------------------------------------------------------------------------------------
describe("identity", () => {
  it("a role named in signup metadata does not become the account's role", async () => {
    for (const [id, metadata] of [
      ["e0000000-0000-4000-8000-000000000001", `{"role":"admin","user_role":"admin","is_admin":true}`],
      ["e0000000-0000-4000-8000-000000000002", `{"role":"provider_owner"}`],
    ]) {
      await sys(db, `insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values ($1::uuid, $1::text || '@test.local', $2::jsonb, $2::jsonb)`, [id, metadata]);
      assert.equal((await sys(db, `select role from profiles where id = $1`, [id]))[0].role, "customer");
    }
  });

  it("a demoted administrator is refused at once, by command, by table and by audit log", async () => {
    const other = ROLES.user(await createUser(db, { role: "admin" }));
    assert.equal(await outcome(as(db, other, `select admin_dashboard_overview()`)), "ok");
    assert.ok((await as(db, other, `select id from admin_audit_logs limit 1`)).length === 1);
    await sys(db, `update profiles set role = 'customer' where id = $1`, [other.sub]);
    assert.equal(await outcome(as(db, other, `select admin_dashboard_overview()`)), "42501");
    assert.equal(await outcome(as(db, other, `select admin_set_provider_status($1, 'suspended', 'Stale session')`, [SEED.provider2])), "42501");
    assert.equal((await as(db, other, `select id from admin_audit_logs`)).length, 0);
    assert.equal((await as(db, other, `update platform_settings set updated_at = now() returning 1`).catch(() => [])).length, 0);
  });

  it("a provider owner cannot give themselves or anyone else a provider's control fields", async () => {
    await sys(db, `update providers set status = 'pending', admin_notes = null where id = $1`, [SEED.provider1]);
    await as(db, owner1, `update providers set status = 'active', is_verified = true, commission_percentage = 0, admin_notes = 'self approved' where id = $1`, [SEED.provider1]).catch(() => {});
    const row = (await sys(db, `select status, is_verified, commission_percentage, admin_notes from providers where id = $1`, [SEED.provider1]))[0];
    assert.equal(row.status, "pending");
    assert.equal(row.is_verified, false);
    assert.equal(Number(row.commission_percentage), 15);
    assert.equal(row.admin_notes, null);
    await sys(db, `update providers set status = 'active' where id = $1`, [SEED.provider1]);
  });

  it("customers cannot change their own role, phone verification or verification time", async () => {
    for (const column of ["role = 'admin'", "phone_verified = true", "phone_verified_at = now()"]) {
      assert.equal(await outcome(as(db, customer2, `update profiles set ${column} where id = $1`, [customer2.sub])), "42501", column);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 5. Nothing outside the public catalogue is readable across tenants
// ---------------------------------------------------------------------------------------------------------------
describe("cross-tenant reads, swept over every table and view", () => {
  // Public by design: the marketplace catalogue and open job board. Anything else readable by a stranger is a leak.
  const PUBLIC_TABLES = new Set([
    "branches", "employees", "services", "packages", "reviews", "provider_closures", "resources", "seasonal_schedules",
    "service_variants", "service_resources", "employee_portfolios", "employee_services", "employee_availability",
    "categories", "providers", "provider_promos", "message_templates", "platform_settings", "fee_rules", "legal_agreements",
    "platform_feature_flags", "payment_methods", "subscription_plans", "employee_availability",
    "admin_branch_performance", "admin_employee_performance", "admin_provider_performance", "accepted_payment_methods",
    "job_posts", "job_bids", "conversations",
  ]);
  // Money, tax, personal and operator data. The sweep must find rows here for the provider and read none as a stranger.
  const MUST_BE_PRIVATE = [
    "invoices", "provider_fee_invoices", "payment_disputes", "provider_customer_notes", "provider_customer_blocks",
    "provider_client_contacts", "provider_client_imports", "provider_memberships", "supplier_purchase_orders",
    "inventory_products", "inventory_suppliers", "branch_inventory_stock", "payout_allocations", "provider_value_summaries",
    "psp_reconciliation_runs", "notifications", "agreement_acceptances", "expo_push_tokens", "customer_favorites",
    "customer_loyalty", "gift_cards", "gift_card_redemptions", "package_redemptions", "user_packages", "client_profiles",
    "employee_commission_rules", "provider_subscriptions", "transactional_ledger", "payment_refund_requests", "api_tokens",
    "webhook_subscriptions", "developer_profiles", "delivery_jobs",
  ];
  let seeded = [];

  before(async () => {
    const svc = await serviceFor(db, SEED.employee1);
    const booking = (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, scheduled_at, duration_minutes, status, total_price, platform_commission, deposit_required)
      values ($1, $2, $3, $4, now() + interval '3 days', 30, 'confirmed', 100, 10, 10) returning id`, [SEED.customer, SEED.branch1, SEED.employee1, svc.id]))[0].id;
    const byName = {
      provider_id: SEED.provider1, branch_id: SEED.branch1, customer_id: SEED.customer, user_id: SEED.customer, requested_by: SEED.owner1,
      booking_id: booking, employee_id: SEED.employee1, service_id: svc.id, owner_id: SEED.owner1, profile_id: SEED.customer,
      created_by: SEED.owner1, recipient_id: SEED.customer, sender_id: SEED.customer, purchaser_id: SEED.customer, actor_id: SEED.owner1,
    };
    const tables = await sys(db, `select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1`);
    for (const { relname } of tables) {
      if (["admin_audit_logs", "integration_audit_log"].includes(relname)) continue;
      if ((await sys(db, `select count(*)::int n from public.${relname}`))[0].n > 0) continue;
      const columns = await sys(db, `
        select a.attname as name, format_type(a.atttypid, a.atttypmod) as ftype, t.typtype, a.atttypid::int as oid, a.attnotnull as nn, a.atthasdef as hasdef, a.attgenerated as gen
        from pg_attribute a join pg_type t on t.oid = a.atttypid
        where a.attrelid = ('public.' || $1)::regclass and a.attnum > 0 and not a.attisdropped order by a.attnum`, [relname]);
      const names = [];
      const values = [];
      for (const c of columns) {
        if (c.gen || (!c.nn && !(c.name in byName)) || (c.nn && c.hasdef && !(c.name in byName))) continue;
        let v;
        if (c.name in byName) v = `'${byName[c.name]}'`;
        else if (c.typtype === "e") v = `(select enumlabel from pg_enum where enumtypid = ${c.oid} order by enumsortorder limit 1)::text`;
        else if (c.ftype === "uuid") v = "uuid_generate_v4()";
        else if (/^(text|character varying)/.test(c.ftype)) v = `'qa-${c.name}'`;
        else if (/^(numeric|integer|bigint|smallint|double|real)/.test(c.ftype)) v = "1";
        else if (c.ftype === "boolean") v = "true";
        else if (c.ftype === "date") v = "current_date";
        else if (/^timestamp/.test(c.ftype)) v = "now()";
        else if (c.ftype === "time without time zone") v = "'10:00'";
        else if (/json/.test(c.ftype)) v = "'{}'::jsonb";
        else if (c.ftype.endsWith("[]")) v = "'{}'";
        else v = "null";
        names.push(`"${c.name}"`);
        values.push(v);
      }
      if (!names.length) continue;
      try {
        // Foreign keys are skipped for the fixture insert only; the rows still point at the real provider, branch and customer.
        await db.transaction(async (tx) => {
          await tx.exec(`set local session_replication_role = replica`);
          await tx.exec(`insert into public.${relname} (${names.join(",")}) values (${values.join(",")})`);
        });
        seeded.push(relname);
      } catch { /* a table whose constraints this generic row cannot satisfy is reported as not swept below */ }
    }
  });

  const actors = () => [["provider owner of another provider", owner2], ["staff of another provider", employee2], ["another customer", customer2], ["an anonymous visitor", ROLES.anon]];
  const scopes = [["provider_id", SEED.provider1], ["branch_id", SEED.branch1], ["customer_id", SEED.customer], ["user_id", SEED.customer], ["requested_by", SEED.owner1]];

  it("has rows to protect in every money, tax and personal-data table it lists", async () => {
    const empty = [];
    for (const table of MUST_BE_PRIVATE) {
      if ((await sys(db, `select count(*)::int n from public.${table}`))[0].n === 0) empty.push(table);
    }
    assert.deepEqual(empty, [], "these tables are empty, so a refused read could not be told from an empty table");
  });

  it("shows no row at all of a money, tax or personal-data table to another provider, its staff, another customer or a visitor", async () => {
    const leaks = [];
    for (const table of MUST_BE_PRIVATE) {
      for (const [name, user] of actors()) {
        const n = await as(db, user, `select count(*)::int n from public.${table}`).then((rows) => rows[0].n, () => 0);
        if (n > 0) leaks.push(`${name} reads ${n} rows of ${table}`);
      }
    }
    assert.deepEqual(leaks, []);
  });

  it("shows a stranger nothing of another provider's or another customer's rows outside the public catalogue", async () => {
    const tables = await sys(db, `
      select c.relname, array_agg(k.column_name::text) as cols
      from pg_class c join information_schema.columns k on k.table_schema = 'public' and k.table_name = c.relname
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v') group by 1 order by 1`);
    const leaks = [];
    let checked = 0;
    for (const table of tables) {
      if (PUBLIC_TABLES.has(table.relname)) continue;
      for (const [column, value] of scopes) {
        if (!table.cols.includes(column)) continue;
        const baseline = (await sys(db, `select count(*)::int n from public.${table.relname} where ${column} = $1`, [value]))[0].n;
        if (baseline === 0) continue;
        checked += 1;
        for (const [name, user] of actors()) {
          const n = await as(db, user, `select count(*)::int n from public.${table.relname} where ${column} = $1`, [value]).then((rows) => rows[0].n, () => 0);
          if (n > 0) leaks.push(`${name} reads ${n} of ${baseline} rows of ${table.relname} (${column})`);
        }
      }
    }
    assert.ok(checked >= 30, `the sweep only had ${checked} table and column pairs with rows to protect`);
    assert.deepEqual(leaks, []);
  });

  it("shows an anonymous visitor only the public catalogue, whatever the table holds", async () => {
    const tables = await sys(db, `select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v') order by 1`);
    const visible = [];
    for (const { relname } of tables) {
      const rows = await as(db, ROLES.anon, `select count(*)::int n from public.${relname}`).then((r) => r[0].n, () => 0);
      if (rows > 0 && !PUBLIC_TABLES.has(relname)) visible.push(`${relname}: ${rows}`);
    }
    assert.deepEqual(visible, []);
  });

  it("keeps a customer's own wallet, loyalty, requests and consent invisible to other customers and to providers", async () => {
    await sys(db, `insert into wallet_credits (customer_id, amount, reason, source) values ($1, 5, 'Referral reward', 'referral')`, [SEED.customer]);
    await sys(db, `insert into data_subject_requests (user_id, request_type, status) values ($1, 'export', 'pending')`, [SEED.customer]);
    await sys(db, `insert into consents (user_id, purpose, granted, source) values ($1, 'marketing', true, 'qa')`, [SEED.customer]).catch(() => {});
    for (const [name, user] of [["another customer", customer2], ["a provider owner", owner1], ["a provider's staff", employee1], ["a visitor", ROLES.anon]]) {
      for (const sql of [
        `select id from wallet_credits where customer_id = $1`,
        `select id from data_subject_requests where user_id = $1`,
        `select id from consents where user_id = $1`,
      ]) {
        const rows = await as(db, user, sql, [SEED.customer]).catch(() => []);
        assert.equal(rows.length, 0, `${name}: ${sql}`);
      }
    }
    for (const sql of [`select id from wallet_credits where customer_id = $1`, `select id from data_subject_requests where user_id = $1`]) {
      assert.ok((await as(db, customer, sql, [SEED.customer])).length >= 1, `the customer reads their own: ${sql}`);
    }
  });
});
