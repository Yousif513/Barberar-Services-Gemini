import { test, after } from "node:test";
import assert from "node:assert/strict";
let unexpectedNetwork = 0;
globalThis.fetch = async () => { unexpectedNetwork++; throw new Error("Unexpected network in pending package test"); };
after(() => assert.equal(unexpectedNetwork, 0));
const helper = () => import("../src/lib/pending-package-payments.js");
const row = { id: "owned-purchase", package_name_en: "Purchased name", package_name_ar: "اسم الباقة", status: "pending_payment", amount_paid: "123.45", session_count: 3, created_at: "2026-10-21T12:00:00Z" };
function client(result = { data: [row], count: 1, error: null }) {
  const calls = [];
  const c = { calls, auth: { getSession: async () => ({ data: { session: { user: { id: "customer-one" } } }, error: null }) }, from(table) {
    calls.push(["from", table]);
    const q = { select: (...args) => { calls.push(["select", ...args]); return q; }, eq: (...args) => { calls.push(["eq", ...args]); return q; }, order: (...args) => { calls.push(["order", ...args]); return q; }, range: (...args) => { calls.push(["range", ...args]); return q; }, then: (resolve) => Promise.resolve(result).then(resolve) };
    return q;
  }};
  return c;
}
test("pending package recovery reads the owned snapshot even when no live offer is visible", async () => {
  const { loadPendingPackagePayments } = await helper();
  const c = client();
  const result = await loadPendingPackagePayments(c, 2);
  assert.equal(result.items[0].id, row.id);
  assert.equal(result.items[0].amount, 123.45);
  assert.equal(result.items[0].name.en, "Purchased name");
  assert.equal(result.total, 1);
  assert.deepEqual(c.calls.filter(call => ["from", "eq", "range"].includes(call[0])), [["from","user_packages"],["eq","customer_id","customer-one"],["eq","status","pending_payment"],["range",50,74]]);
  assert.ok(!c.calls.some(call => call.includes("packages") || call.includes("is_active")));
});
test("a failed query remains an error and a successful empty result stays empty", async () => {
  const { loadPendingPackagePayments } = await helper();
  await assert.rejects(loadPendingPackagePayments(client({ data: null, count: null, error: new Error("permission denied") })), /permission denied/);
  assert.deepEqual((await loadPendingPackagePayments(client({ data: [], count: 0, error: null }))).items, []);
});
test("missing identity never issues an unscoped package read", async () => {
  const { loadPendingPackagePayments } = await helper();
  const c = client(); c.auth.getSession = async () => ({ data: { session: null }, error: null });
  const result = await loadPendingPackagePayments(c);
  assert.equal(result.actorId, null);
  assert.deepEqual(c.calls, []);
});
test("invalid financial snapshot and missing exact count fail rather than inventing a price or total", async () => {
  const { loadPendingPackagePayments } = await helper();
  for (const data of [{...row, amount_paid:null},{...row, amount_paid:"NaN"},{...row, session_count:0}]) {
    await assert.rejects(loadPendingPackagePayments(client({ data:[data],count:1,error:null })));
  }
  await assert.rejects(loadPendingPackagePayments(client({data:[row],count:null,error:null})));
});
for (const state of ["ready", "unknown", "captured"]) test(`${state} package continuation uses the existing target and refreshes actual rows without activating locally`, async () => {
  const { resumePendingPackagePayment } = await helper();
  const events=[];
  const c=client();
  c.functions={invoke:async(_name,{body})=>{events.push(body);return {data:state === "ready" ? {success:true,state,attemptId:"attempt-one",chargeId:"charge-one",checkoutUrl:"https://checkout.example.test/existing"} : {success:false,state,attemptId:"attempt-one"},error:null};}};
  const options={locale:"ar",returnUrl:"mobileapp://bookings",openCheckout:async(url)=>events.push(["open",url]),refresh:async()=>events.push(["refresh"])};
  if(state==="ready") await resumePendingPackagePayment(c,"owned-purchase",options);
  else await assert.rejects(resumePendingPackagePayment(c,"owned-purchase",options),failure=>failure.state===state);
  assert.deepEqual(events[0],{purchaseType:"package",purchaseId:"owned-purchase",returnUrl:"mobileapp://bookings",action:"recover"});
  assert.equal(events.filter(event=>Array.isArray(event)&&event[0]==="refresh").length,1);
  assert.equal(events.filter(event=>Array.isArray(event)&&event[0]==="open").length,state==="ready" ? 1 : 0);
  assert.equal(events.filter(event=>!Array.isArray(event)).length,1);
});
