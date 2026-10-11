import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, firstSlot, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// FIX-PROV R9: a code a provider creates through the command can be redeemed at checkout, and only by customers of that provider.
let db;
let svc;
let date;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);

const create = (user, extra = {}) => as(db, user,
  `select create_provider_promo_code(p_provider_id => $1, p_code => $2, p_discount_type => $3, p_discount_value => $4, p_ends_at => $5, p_max_redemptions => $6, p_min_order_amount => $7) r`,
  [extra.provider ?? SEED.provider1, extra.code ?? "EID20", extra.type ?? "percentage", extra.value ?? 20, extra.ends ?? null, extra.max ?? null, extra.min ?? 0]).then((rows) => rows[0].r);
const book = (user, slot, coupon, employee = SEED.employee1, service = svc.id) => as(db, user,
  `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3, request_source => 'marketplace', request_coupon_code => $4, request_gift_card_code => null, request_loyalty_points => 0)`,
  [employee, service, slot, coupon]).then((r) => r[0]);

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  date = await nextWorkingDate(db, SEED.employee1, 5);
});

describe("provider promo codes (R9)", () => {
  it("creates a provider-funded code in the table checkout reads, audited", async () => {
    const r = await create(owner1);
    assert.equal(r.code, "EID20");
    const row = (await sys(db, `select provider_id, funding_source, is_active, discount_type, discount_value, redeemed_count from promotional_codes where id = $1`, [r.id]))[0];
    assert.equal(row.provider_id, SEED.provider1);
    assert.equal(row.funding_source, "provider");
    assert.equal(row.is_active, true);
    assert.equal(Number(row.discount_value), 20);
    assert.equal(row.redeemed_count, 0);
    assert.equal((await sys(db, `select 1 from admin_audit_logs where action = 'provider.promo_code_created' and target_id = $1`, [r.id])).length, 1);
  });

  it("is redeemed at checkout by a customer, counted, and refused for another provider's booking", async () => {
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    const booked = await book(customer, slot, "eid20");
    const row = (await sys(db, `select discount_amount, subtotal_price, coupon_id from bookings where id = $1`, [booked.id]))[0];
    assert.ok(Number(row.discount_amount) > 0, "a discount was applied");
    assert.ok(row.coupon_id);
    assert.equal(Number(row.discount_amount), Math.round(Number(row.subtotal_price) * 20) / 100);
    assert.equal((await sys(db, `select redeemed_count from promotional_codes where code = 'EID20'`))[0].redeemed_count, 1);
    const svc2 = await serviceFor(db, SEED.employee2);
    const other = await sys(db, `select e.id from employees e join branches b on b.id = e.branch_id where b.provider_id = $1 limit 1`, [SEED.provider2]);
    if (other[0]) {
      const otherSvc = await serviceFor(db, other[0].id);
      const otherDate = await nextWorkingDate(db, other[0].id, 5);
      const otherSlot = otherSvc ? await firstSlot(db, customer, other[0].id, otherDate, otherSvc.duration) : null;
      if (otherSvc && otherSlot) await expectError(book(customer, otherSlot, "EID20", other[0].id, otherSvc.id), /not valid/);
    }
    void svc2;
  });

  it("answers an unknown, expired or exhausted code with the same refusal", async () => {
    const expired = await create(owner1, { code: "OLD15", ends: new Date(Date.now() + 60000).toISOString() });
    await sys(db, `update promotional_codes set starts_at = now() - interval '2 minutes', ends_at = now() - interval '1 minute' where id = $1`, [expired.id]);
    const one = await create(owner1, { code: "ONCE10", max: 1, value: 10 });
    await sys(db, `update promotional_codes set redeemed_count = 1 where id = $1`, [one.id]);
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    for (const code of ["OLD15", "ONCE10", "NOSUCHCODE"]) await expectError(book(customer, slot, code), /not valid/);
  });

  it("refuses invalid input", async () => {
    await expectError(create(owner1, { code: "ab" }), /4 to 20/);
    await expectError(create(owner1, { code: "BAD CODE" }), /4 to 20/);
    await expectError(create(owner1, { code: "FREE100", type: "bogus" }), /percentage or a flat/);
    await expectError(create(owner1, { code: "ZERO", value: 0 }), /outside what a code/);
    await expectError(create(owner1, { code: "OVER", value: 101 }), /outside what a code/);
    await expectError(create(owner1, { code: "FLATBIG", type: "flat", value: 10001 }), /outside what a code/);
    await expectError(create(owner1, { code: "PASTDAY", ends: new Date(Date.now() - 3600000).toISOString() }), /future/);
    await expectError(create(owner1, { code: "NEGMIN", min: -1 }), /positive/);
    await expectError(create(owner1, { code: "ZEROMAX", max: 0 }), /at least 1/);
  });

  it("answers a duplicate code without saying who holds it", async () => {
    await expectError(create(owner1, { code: "EID20" }), /cannot be used/);
    await expectError(create(owner2, { code: "eid20", provider: SEED.provider2 }), /cannot be used/);
  });

  it("is refused to anonymous visitors, customers, employees and another provider's owner", async () => {
    await assert.rejects(create(ROLES.anon, { code: "ANONCODE" }), (e) => e.code === "42501");
    await expectError(create(customer, { code: "CUSTCODE" }), /Provider not found/);
    await expectError(create(owner2, { code: "STRANGER1" }), /Provider not found/);
    const stylist = ROLES.user(await createUser(db, { role: "provider_employee" }));
    await sys(db, `update employees set profile_id = $1 where id = $2`, [stylist.sub, SEED.employee1]);
    await expectError(create(stylist, { code: "STAFFCODE" }), /Provider not found/);
  });

  it("lists only the owner's own codes with their counts", async () => {
    const mine = (await as(db, owner1, `select list_provider_promo_codes($1) r`, [SEED.provider1]))[0].r;
    assert.ok(mine.some((c) => c.code === "EID20" && c.redeemed_count === 1));
    assert.ok(mine.every((c) => typeof c.id === "string"));
    await expectError(as(db, owner2, `select list_provider_promo_codes($1)`, [SEED.provider1]), /Provider not found/);
    await expectError(as(db, customer, `select list_provider_promo_codes($1)`, [SEED.provider1]), /Provider not found/);
    await assert.rejects(as(db, ROLES.anon, `select list_provider_promo_codes($1)`, [SEED.provider1]), (e) => e.code === "42501");
    const theirs = (await as(db, owner2, `select list_provider_promo_codes($1) r`, [SEED.provider2]))[0].r;
    assert.ok(!theirs.some((c) => c.code === "EID20"), "another provider never sees the code");
  });

  it("switches a code off and on, idempotently, and a switched-off code is refused at checkout", async () => {
    const id = (await sys(db, `select id from promotional_codes where code = 'EID20'`))[0].id;
    const off = (await as(db, owner1, `select set_provider_promo_code_active($1, false) r`, [id]))[0].r;
    assert.equal(off.changed, true);
    const again = (await as(db, owner1, `select set_provider_promo_code_active($1, false) r`, [id]))[0].r;
    assert.equal(again.changed, false);
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    await expectError(book(customer, slot, "EID20"), /not valid/);
    const on = (await as(db, owner1, `select set_provider_promo_code_active($1, true) r`, [id]))[0].r;
    assert.equal(on.changed, true);
    assert.equal((await sys(db, `select count(*)::int n from admin_audit_logs where action in ('provider.promo_code_disabled', 'provider.promo_code_enabled') and target_id = $1`, [id]))[0].n, 2);
  });

  it("refuses to switch another provider's code, and anonymous visitors", async () => {
    const id = (await sys(db, `select id from promotional_codes where code = 'EID20'`))[0].id;
    await expectError(as(db, owner2, `select set_provider_promo_code_active($1, false)`, [id]), /Code not found/);
    await expectError(as(db, customer, `select set_provider_promo_code_active($1, false)`, [id]), /Code not found/);
    await assert.rejects(as(db, ROLES.anon, `select set_provider_promo_code_active($1, false)`, [id]), (e) => e.code === "42501");
    await expectError(as(db, owner1, `select set_provider_promo_code_active($1, null)`, [id]), /on or off/);
  });

  it("does not let a client write promotional codes directly", async () => {
    await assert.rejects(as(db, owner1, `insert into promotional_codes (code, discount_type, discount_value, provider_id, funding_source) values ('DIRECT10', 'percentage', 10, $1, 'provider')`, [SEED.provider1]), /permission denied|row-level security/);
  });
});
