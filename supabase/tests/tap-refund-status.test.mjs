import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTapRefund, riyadhDay, saudiBusinessDaysBetween, tapRefundState, toReconciliationEvents } from "../functions/_shared/tap-refund-status.ts";

// MONEY part 4 (D-Q9): the pure logic behind "Check with Tap" and the itemised reconciliation import.

describe("tapRefundState", () => {
  it("maps Tap's refund statuses the same way the database does", () => {
    for (const s of ["REFUNDED", "refunded", " SUCCESS "]) assert.equal(tapRefundState(s), "succeeded");
    for (const s of ["PENDING", "IN_PROGRESS", "INITIATED"]) assert.equal(tapRefundState(s), "processing");
    for (const s of ["FAILED", "DECLINED", "CANCELLED", "REJECTED"]) assert.equal(tapRefundState(s), "failed");
    for (const s of ["", null, undefined, 42, "SOMETHING_NEW"]) assert.equal(tapRefundState(s), "unknown");
  });

  it("keeps the table identical to public.tap_refund_state in the migration", () => {
    const sql = readFileSync(new URL("../migrations/20261010330000_money_tap_reconciliation.sql", import.meta.url), "utf8");
    for (const s of ["REFUNDED", "SUCCESS", "PENDING", "IN_PROGRESS", "INITIATED", "FAILED", "DECLINED", "CANCELLED", "REJECTED"]) {
      assert.ok(sql.includes(`'${s}'`), `${s} is mapped in SQL too`);
    }
  });
});

describe("parseTapRefund", () => {
  it("reads only id, status, amount, currency and charge id", () => {
    const parsed = parseTapRefund({ id: "re_ndf8s6d7fsdfn", status: "pending", amount: 5.255, currency: "sar", charge_id: "chg_1",
      customer: { email: "someone@example.com" }, card: { last_four: "4242" } });
    assert.deepEqual(parsed, { id: "re_ndf8s6d7fsdfn", status: "PENDING", state: "processing", amount: 5.26, currency: "SAR", chargeId: "chg_1" });
    assert.ok(!JSON.stringify(parsed).includes("example.com"));
  });

  it("refuses an answer without a usable id", () => {
    assert.equal(parseTapRefund(null), null);
    assert.equal(parseTapRefund({ status: "REFUNDED" }), null);
    assert.equal(parseTapRefund({ id: "../../etc", status: "REFUNDED" }), null);
    assert.equal(parseTapRefund({ id: "re_ok", status: "REFUNDED", amount: "abc" }).amount, null);
  });
});

describe("Saudi business days", () => {
  it("skips Friday and Saturday in Riyadh", () => {
    // Thursday 2026-10-08 10:00 Riyadh to Sunday 2026-10-11: Friday and Saturday do not count.
    assert.equal(saudiBusinessDaysBetween(new Date("2026-10-08T07:00:00Z"), new Date("2026-10-11T07:00:00Z")), 1);
    // Sunday to Wednesday: three business days.
    assert.equal(saudiBusinessDaysBetween(new Date("2026-10-11T07:00:00Z"), new Date("2026-10-14T07:00:00Z")), 3);
    assert.equal(saudiBusinessDaysBetween(new Date("2026-10-14T07:00:00Z"), new Date("2026-10-11T07:00:00Z")), 0);
  });

  it("uses the Riyadh day, not the UTC day", () => {
    assert.equal(riyadhDay(new Date("2026-10-10T22:30:00Z")), "2026-10-11");
    assert.equal(riyadhDay(new Date("2026-10-10T20:30:00Z")), "2026-10-10");
  });
});

describe("toReconciliationEvents", () => {
  it("keeps SAR objects with an id, rounds to two decimals and drops everything else", () => {
    const events = toReconciliationEvents("charge", [
      { id: "chg_a", amount: 115, currency: "SAR", status: "CAPTURED", transaction: { created: "1760050000000" }, customer: { phone: "+966500000000" } },
      { id: "chg_b", amount: 10, currency: "USD", status: "CAPTURED" },
      { id: "", amount: 10, currency: "SAR" },
      null,
    ]);
    assert.equal(events.length, 1);
    assert.deepEqual({ ...events[0], occurred_at: typeof events[0].occurred_at }, { object_type: "charge", tap_object_id: "chg_a", charge_id: null,
      amount: "115.00", currency: "SAR", status: "CAPTURED", occurred_at: "string" });
    assert.ok(!JSON.stringify(events).includes("+966"));
    const refunds = toReconciliationEvents("refund", [{ id: "re_a", charge_id: "chg_a", amount: "20.5", currency: "sar", status: "refunded" }]);
    assert.deepEqual([refunds[0].charge_id, refunds[0].amount, refunds[0].status], ["chg_a", "20.50", "REFUNDED"]);
  });
});

describe("the Edge Function", () => {
  const source = readFileSync(new URL("../functions/check-refund-status/index.ts", import.meta.url), "utf8");
  it("authorises the caller, reads the Tap key from the environment and never moves money", () => {
    assert.match(source, /resolveCaller\(req\)/);
    assert.match(source, /adminSessionAllows\(token, "money\.refund"\)/);
    assert.match(source, /Deno\.env\.get\("TAP_SECRET_KEY"\)/);
    assert.doesNotMatch(source, /sk_(test|live)_/);
    assert.match(source, /method: "GET"/);
    assert.doesNotMatch(source, /method: "POST"[\s\S]*api\.tap\.company/);
    assert.match(source, /admin_begin_tap_refund_check/);
    assert.match(source, /apply_tap_refund_status/);
    assert.match(source, /corsHeaders\(req\)/);
    assert.doesNotMatch(source, /Access-Control-Allow-Origin": "\*"/);
  });
});
