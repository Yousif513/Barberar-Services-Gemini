import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyRefundCreation, findRefundForRequest, parseTapRefund, riyadhDay, saudiBusinessDaysBetween, tapRefundState, toReconciliationEvents } from "../functions/_shared/tap-refund-status.ts";

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
    // Only reads at Tap: GET one refund, or POST /v2/refunds/list (Tap's list endpoint); never POST /v2/refunds (a new refund).
    const tapCalls = [...source.matchAll(/fetch\(\s*[`"]https:\/\/api\.tap\.company\/v2\/([^`"]*)[`"]/g)].map((m) => m[1]);
    assert.ok(tapCalls.length >= 2, "reads a refund by id and lists refunds");
    for (const path of tapCalls) assert.match(path, /^refunds\/(list|\$\{encodeURIComponent\(begun\.gateway_refund_id\)\})$/, path);
    assert.match(source, /admin_begin_tap_refund_check/);
    assert.match(source, /apply_tap_refund_status/);
    assert.match(source, /apply_tap_refund_lookup/);
    assert.match(source, /corsHeaders\(req\)/);
    assert.doesNotMatch(source, /Access-Control-Allow-Origin": "\*"/);
  });
});

// PAY-WAVE2 (QA release gate item 4): only an answer that proves what happened is definite; everything else is unknown and the refund
// is never sent again automatically.
describe("classifyRefundCreation", () => {
  it("treats a timeout, a dropped connection and a missing answer as unknown", () => {
    for (const thrown of [new DOMException("The signal has been aborted", "TimeoutError"), new TypeError("connection reset"), "x"]) {
      const outcome = classifyRefundCreation({ thrown });
      assert.equal(outcome.kind, "unknown");
      assert.equal(outcome.gatewayRefundId, null);
    }
    assert.equal(classifyRefundCreation({}).kind, "unknown");
  });

  it("treats 5xx, 408, 409, 425 and a 2xx without a refund id as unknown", () => {
    for (const httpStatus of [500, 502, 503, 504, 408, 409, 425]) assert.equal(classifyRefundCreation({ httpStatus, body: {} }).kind, "unknown", String(httpStatus));
    assert.equal(classifyRefundCreation({ httpStatus: 200, body: undefined }).kind, "unknown");
    assert.equal(classifyRefundCreation({ httpStatus: 200, body: { status: "REFUNDED" } }).kind, "unknown");
    const odd = classifyRefundCreation({ httpStatus: 200, body: { id: "re_odd", status: "SOMETHING_NEW" } });
    assert.deepEqual([odd.kind, odd.gatewayRefundId, odd.gatewayStatus], ["unknown", "re_odd", "SOMETHING_NEW"]);
  });

  it("accepts a named refund that Tap reports as refunded or pending, and keeps the SAR amount only", () => {
    const done = classifyRefundCreation({ httpStatus: 200, body: { id: "re_1", status: "REFUNDED", amount: 40, currency: "SAR" } });
    assert.deepEqual(done, { kind: "accepted", gatewayRefundId: "re_1", gatewayStatus: "REFUNDED", amount: 40 });
    const pending = classifyRefundCreation({ httpStatus: 201, body: { id: "re_2", status: "pending", amount: 40, currency: "USD" } });
    assert.deepEqual([pending.kind, pending.gatewayStatus, pending.amount], ["accepted", "PENDING", null]);
  });

  it("is a definite refusal only for Tap's own failed refund or a 4xx it gives before creating anything", () => {
    const failed = classifyRefundCreation({ httpStatus: 200, body: { id: "re_3", status: "DECLINED" } });
    assert.deepEqual([failed.kind, failed.gatewayRefundId], ["refused", "re_3"]);
    for (const httpStatus of [400, 401, 403, 404, 422, 429]) assert.equal(classifyRefundCreation({ httpStatus, body: { errors: [{ code: "1" }] } }).kind, "refused", String(httpStatus));
  });
});

describe("findRefundForRequest", () => {
  const wanted = { refundRequestId: "11111111-1111-4111-8111-111111111111", chargeId: "chg_1" };
  const item = (id, over = {}) => ({ id, status: "REFUNDED", amount: 40, currency: "SAR", charge_id: "chg_1", metadata: { refund_request_id: wanted.refundRequestId }, ...over });

  it("matches the refund of the same charge that carries the refund request id", () => {
    const found = findRefundForRequest({ refunds: [item("re_other", { metadata: { refund_request_id: "x" } }), item("re_mine"), item("re_c", { charge_id: "chg_2" })], has_more: true }, wanted);
    assert.equal(found.match.id, "re_mine");
    assert.equal(found.ambiguous, false);
    assert.equal(found.hasMore, true);
    assert.equal(found.lastId, "re_c");
  });

  it("reports two refunds for one request as ambiguous and finds nothing in an empty or malformed list", () => {
    const twice = findRefundForRequest({ refunds: [item("re_a"), item("re_b")] }, wanted);
    assert.deepEqual([twice.match, twice.ambiguous], [null, true]);
    for (const body of [null, {}, { refunds: "nope" }, { refunds: [null, { id: "../x" }] }]) {
      const none = findRefundForRequest(body, wanted);
      assert.deepEqual([none.match, none.ambiguous, none.hasMore], [null, false, false]);
    }
  });
});

describe("process-refund", () => {
  const refunds = readFileSync(new URL("../functions/_shared/refunds.ts", import.meta.url), "utf8");
  const endpoint = readFileSync(new URL("../functions/process-refund/index.ts", import.meta.url), "utf8");
  it("bounds the Tap call, records an indeterminate answer as unknown and never as a refusal", () => {
    assert.match(refunds, /signal: AbortSignal\.timeout\(TAP_TIMEOUT_MS\)/);
    assert.match(refunds, /classifyRefundCreation\(\{ thrown: error \}\)/);
    assert.match(refunds, /outcome\.kind === "unknown"[\s\S]*record_refund_outcome_unknown/);
    assert.doesNotMatch(refunds, /catch \(error\) \{\s*failure =/);
    assert.match(endpoint, /\.in\("status", \["pending", "failed"\]\)/, "the queue never holds an unknown refund");
    assert.match(endpoint, /outcome\.status === "unknown" \? 202/);
  });
});
