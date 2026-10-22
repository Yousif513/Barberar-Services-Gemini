import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { heldCheckoutArgs, parseHeldCheckoutList, parseHeldCheckoutDetail, elapsedCheckoutMinutes } from "../src/lib/held-checkout-client.mjs";

const id = "11ecf50a-3a11-43b9-8ab9-354827244b11";
const target = "22ecf50a-3a11-43b9-8ab9-354827244b22";
const asOf = "2026-10-22T10:15:00+00:00";
const row = () => ({ id, purchase_type: "booking", target_id: target, amount_sar: 125.5, currency: "SAR", status: "unknown", is_current: true, reconciliation_required: false, created_at: "2026-10-22T09:00:00+00:00", updated_at: "2026-10-22T10:00:00+00:00", unknown_at: "2026-10-22T10:00:00+00:00" });
const page = () => ({ items: [row()], total: 1, as_of: asOf, limit: 25, offset: 0 });

describe("held checkout client read contract", () => {
  it("normalizes exact UUID filters and sends only bounded read arguments", () => {
    assert.deepEqual(heldCheckoutArgs({ status: "", purchaseType: "", attemptId: "", targetId: "" }, 0), { p_status: null, p_purchase_type: null, p_attempt_id: null, p_target_id: null, p_limit: 25, p_offset: 0 });
    assert.deepEqual(heldCheckoutArgs({ status: "captured", purchaseType: "gift_card", attemptId: ` ${id.toUpperCase()} `, targetId: target }, 25), { p_status: "captured", p_purchase_type: "gift_card", p_attempt_id: id, p_target_id: target, p_limit: 25, p_offset: 25 });
  });
  it("rejects invalid filters and paging before dispatch", () => {
    const base = { status: "", purchaseType: "", attemptId: "", targetId: "" };
    for (const [field, value, code] of [["attemptId", "%", "attemptId"], ["targetId", "prefix", "targetId"], ["status", "ready", "status"], ["purchaseType", "all-data", "purchaseType"]]) assert.throws(() => heldCheckoutArgs({ ...base, [field]: value }, 0), { message: code });
    for (const offset of [-1, 100001, 1.5, NaN]) assert.throws(() => heldCheckoutArgs(base, offset), { message: "offset" });
  });
  it("accepts real read projection and distinguishes honest empty pages", () => {
    assert.deepEqual(parseHeldCheckoutList(page(), 0), page());
    assert.deepEqual(parseHeldCheckoutList({ ...page(), items: [], total: 0 }, 0).items, []);
    assert.deepEqual(parseHeldCheckoutList({ ...page(), items: [], total: 5, offset: 25 }, 25), { items: [], total: 5, as_of: asOf, limit: 25, offset: 25 });
    assert.deepEqual(parseHeldCheckoutDetail({ attempt: row(), as_of: asOf }, id).attempt, row());
    assert.equal(parseHeldCheckoutDetail({ attempt: null, as_of: asOf }, id).attempt, null);
  });
  it("rejects malformed or non-held records instead of inventing data", () => {
    for (const change of [{ currency: "USD" }, { amount_sar: "125.5" }, { amount_sar: NaN }, { status: "ready" }, { status: "failed" }, { unknown_at: null }, { is_current: "yes" }, { created_at: "local time" }, { target_id: "bad-id" }, { request_text: "sensitive payload" }]) assert.throws(() => parseHeldCheckoutList({ ...page(), items: [{ ...row(), ...change }] }, 0), { message: "response" });
    assert.equal(parseHeldCheckoutList({ ...page(), items: [{ ...row(), status: "captured", reconciliation_required: true }] }, 0).items[0].status, "captured");
  });
  it("rejects malformed paging and wrong detail identity", () => {
    for (const change of [{ total: -1 }, { total: "1" }, { total: 0 }, { limit: 51 }, { limit: 50 }, { limit: 0 }, { offset: 25 }, { as_of: "invalid" }, { items: null }]) assert.throws(() => parseHeldCheckoutList({ ...page(), ...change }, 0), { message: "response" });
    assert.throws(() => parseHeldCheckoutDetail({ attempt: row(), as_of: asOf }, target), { message: "response" });
  });
  it("calculates elapsed time from the server snapshot without an SLA", () => {
    assert.equal(elapsedCheckoutMinutes(row(), asOf), 75);
    assert.equal(elapsedCheckoutMinutes(row(), "invalid"), null);
    assert.equal(elapsedCheckoutMinutes(row(), "2026-10-22T08:00:00Z"), null);
  });
});
