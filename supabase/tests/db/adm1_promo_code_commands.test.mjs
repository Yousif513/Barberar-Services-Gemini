import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, firstSlot, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// ADM1 item 4 (C-D26): administrators change promotional codes only through reasoned, audited, bounded commands.
let db;
let admin;
let stranger;
let svc;
let date;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);

const save = (user, args = {}) => as(db, user,
  `select admin_save_promo_code(p_code => $1, p_discount_type => $2, p_discount_value => $3, p_reason => $4, p_id => $5, p_max_redemptions => $6,
     p_funding_source => $7, p_min_order_amount => $8, p_max_discount_cap => $9, p_per_customer_limit => $10, p_first_booking_only => $11,
     p_is_active => $12, p_starts_at => $13, p_ends_at => $14) r`,
  [args.code ?? "SPRING15", args.type ?? "percentage", args.value ?? 15, args.reason ?? "Spring campaign approved by marketing", args.id ?? null,
    args.max ?? null, args.funding ?? "platform", args.min ?? 0, args.cap ?? null, "limit" in args ? args.limit : 1, args.first ?? false,
    args.active ?? true, args.starts ?? null, args.ends ?? null]).then((rows) => rows[0].r);
const toggle = (user, id, active, reason = "Campaign paused for review") => as(db, user, `select admin_set_promo_code_active($1, $2, $3) r`, [id, active, reason]).then((rows) => rows[0].r);
const audit = (action, id) => sys(db, `select details from admin_audit_logs where action = $1 and target_id = $2`, [action, id]);

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  stranger = ROLES.user(await createUser(db));
  svc = await serviceFor(db, SEED.employee1);
  date = await nextWorkingDate(db, SEED.employee1, 5);
});

describe("admin_save_promo_code", () => {
  let id;
  it("creates a code with the per-customer limit and first-booking rule, and audits it with the reason", async () => {
    const r = await save(admin, { code: " spring15 ", limit: 2, first: true, max: 50, min: 40, cap: 30 });
    assert.deepEqual([r.created, r.code], [true, "SPRING15"]);
    id = r.id;
    const [row] = await sys(db, `select discount_type, discount_value, max_redemptions, per_customer_limit, first_booking_only, min_order_amount, max_discount_cap, funding_source, is_active from promotional_codes where id = $1`, [id]);
    assert.deepEqual([row.discount_type, Number(row.discount_value), row.max_redemptions, row.per_customer_limit, row.first_booking_only, Number(row.min_order_amount), Number(row.max_discount_cap), row.funding_source, row.is_active],
      ["percentage", 15, 50, 2, true, 40, 30, "platform", true]);
    const [entry] = await audit("promo_code.created", id);
    assert.equal(entry.details.reason, "Spring campaign approved by marketing");
    assert.equal(entry.details.per_customer_limit, 2);
  });

  it("replaces the code's settings on a second save and audits the change", async () => {
    const r = await save(admin, { id, code: "SPRING15", value: 20, limit: null, first: false, reason: "Raised after the first week" });
    assert.equal(r.created, false);
    const [row] = await sys(db, `select discount_value, per_customer_limit, first_booking_only from promotional_codes where id = $1`, [id]);
    assert.deepEqual([Number(row.discount_value), row.per_customer_limit, row.first_booking_only], [20, null, false]);
    assert.equal((await audit("promo_code.updated", id)).length, 1);
  });

  it("is redeemed at checkout by a customer and then cannot change its name or lower its limit below the use", async () => {
    const created = await save(admin, { code: "BOOK10", value: 10, limit: 1 });
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    const booked = await as(db, customer,
      `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3, request_source => 'marketplace', request_coupon_code => 'BOOK10', request_gift_card_code => null, request_loyalty_points => 0)`,
      [SEED.employee1, svc.id, slot]);
    assert.ok(booked[0]);
    assert.equal((await sys(db, `select redeemed_count from promotional_codes where id = $1`, [created.id]))[0].redeemed_count, 1);
    await expectError(save(admin, { id: created.id, code: "RENAMED10", value: 10 }), /already used keeps its name/);
    await expectError(save(admin, { id: created.id, code: "BOOK10", value: 10, max: 1 }).then(() => save(admin, { id: created.id, code: "BOOK10", value: 10, max: 0 })), /between 1 and 1000000/);
  });

  it("refuses invalid input with 22023 and a duplicate name with 23505", async () => {
    await expectError(save(admin, { reason: "no" }), /reason of at least 3/);
    await expectError(save(admin, { reason: "   " }), /reason of at least 3/);
    await expectError(save(admin, { code: "ab" }), /4 to 20 letters/);
    await expectError(save(admin, { code: "BAD CODE!" }), /4 to 20 letters/);
    await expectError(save(admin, { type: "bogus" }), /percentage or a flat amount/);
    await expectError(save(admin, { value: 0 }), /outside what a code can give/);
    await expectError(save(admin, { value: 101 }), /outside what a code can give/);
    await expectError(save(admin, { type: "flat", value: 10001 }), /outside what a code can give/);
    await expectError(save(admin, { funding: "somebody" }), /funding source/);
    await expectError(save(admin, { max: -1 }), /redemption limit/);
    await expectError(save(admin, { limit: 0 }), /per-customer limit/);
    await expectError(save(admin, { min: -5 }), /minimum order/);
    await expectError(save(admin, { cap: 0 }), /discount cap/);
    await expectError(save(admin, { starts: "2030-02-01T00:00:00Z", ends: "2030-01-01T00:00:00Z" }), /end after it starts/);
    await expectError(save(admin, { code: "SPRING15" }), /already exists/);
    await expectError(save(admin, { id: "00000000-0000-4000-8000-0000000000aa", code: "NOPE1234" }), /not found/);
  });

  it("refuses everyone who is not an administrator, including the service role", async () => {
    for (const actor of [ROLES.anon, customer, stranger, owner1, owner2, ROLES.service]) {
      await expectError(save(actor, { code: "FORBID10" }), /permission denied|Administrator access required/i);
    }
    assert.equal((await sys(db, `select count(*)::int n from promotional_codes where code = 'FORBID10'`))[0].n, 0);
  });

  it("no client can write the table directly any more", async () => {
    const insert = `insert into promotional_codes (code, discount_type, discount_value) values ('DIRECT10', 'percentage', 10)`;
    for (const actor of [admin, owner1, customer]) {
      await expectError(as(db, actor, insert), /permission denied|row-level security/);
    }
    await expectError(as(db, admin, `update promotional_codes set is_active = false`), /permission denied|row-level security/);
    await expectError(as(db, admin, `delete from promotional_codes`), /permission denied|row-level security/);
    assert.ok((await as(db, admin, `select 1 from promotional_codes limit 1`)).length > 0, "administrators still read the codes");
  });
});

describe("admin_set_promo_code_active", () => {
  it("switches a code off and on with a reason, idempotently, and audits each change once", async () => {
    const { id } = await save(admin, { code: "PAUSE10" });
    const off = await toggle(admin, id, false);
    assert.deepEqual([off.is_active, off.changed], [false, true]);
    assert.equal((await toggle(admin, id, false)).changed, false, "a replay changes nothing");
    assert.equal((await audit("promo_code.deactivated", id)).length, 1);
    const on = await toggle(admin, id, true, "Review finished, resumed");
    assert.equal(on.changed, true);
    assert.equal((await audit("promo_code.activated", id)).length, 1);
  });

  it("requires a reason and a known code, and refuses everyone who is not an administrator", async () => {
    const { id } = await save(admin, { code: "GUARD10" });
    await expectError(toggle(admin, id, false, "x"), /reason of at least 3/);
    await expectError(toggle(admin, "00000000-0000-4000-8000-0000000000bb", false), /not found/);
    await expectError(as(db, admin, `select admin_set_promo_code_active($1, null, 'Not a boolean')`, [id]), /on or off/);
    for (const actor of [ROLES.anon, customer, stranger, owner1, owner2, ROLES.service]) {
      await expectError(toggle(actor, id, false), /permission denied|Administrator access required/i);
    }
    assert.equal((await sys(db, `select is_active from promotional_codes where id = $1`, [id]))[0].is_active, true);
  });
});
