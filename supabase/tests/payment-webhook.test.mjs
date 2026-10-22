import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
globalThis.fetch = async () => { throw new Error("External network forbidden in webhook tests"); };
const helper=await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(readFileSync(new URL("../functions/_shared/checkout-attempts.ts",import.meta.url),"utf8"))).toString("base64")}`);
const current=readFileSync(new URL("../functions/payment-webhook/index.ts",import.meta.url),"utf8");
const executable=stripTypeScriptTypes(current.replace(/^import .+\r?\n/gm,""));
const attemptId="11111111-1111-4111-8111-111111111111";
const targetId="22222222-2222-4222-8222-222222222222";
function setup(overrides={}) {
 const calls=[],requests=[],refunds=[];let handler;
 const charge={id:"chg_verified",status:"CAPTURED",currency:"SAR",amount:25,metadata:{checkout_attempt_id:attemptId,purchase_type:"booking",booking_id:targetId},reference:{transaction:attemptId,order:targetId},...overrides.charge};
 const db={async rpc(name,args){calls.push({name,args});return overrides.rpc?overrides.rpc(name,args,calls):{data:{success:true},error:null};}};
 new Function("serve","createClient","processRefundRequest","checkoutGatewayContext","Deno","fetch",executable)(
  fn=>{handler=fn},()=>db,async(...args)=>{refunds.push(args);return {status:"queued"}},helper.checkoutGatewayContext,
  {env:{get:name=>({SUPABASE_URL:"https://local.invalid",SUPABASE_SERVICE_ROLE_KEY:"fixture-only",TAP_SECRET_KEY:"fixture-only"})[name]}},
  async(url,init)=>{requests.push({url,init});return Response.json(charge,{status:overrides.gatewayStatus??200})}
 );
 return {calls,requests,refunds,run:async(payload={id:charge.id,status:"DECLINED",metadata:{booking_id:"untrusted"}})=>{const response=await handler(new Request("https://local.invalid/webhook",{method:"POST",body:JSON.stringify(payload)}));return {status:response.status,body:await response.json()};}};
}
describe("verified checkout webhook receipt binding",()=>{
 it("ignores callback metadata, records fetched receipt before confirming the actual booking",async()=>{
  const h=setup();assert.equal((await h.run()).status,200);
  assert.deepEqual(h.calls.map(c=>c.name),["record_checkout_attempt","confirm_booking_payment"]);
  assert.equal(h.calls[0].args.p_charge.metadata.booking_id,targetId);assert.equal(h.calls[1].args.target_booking_id,targetId);
  assert.match(h.calls[0].args.p_gateway_context,/^[a-f0-9]{64}$/);assert.ok(h.requests[0].url.endsWith("/chg_verified"));
 });
 it("observes noncaptured attempts without a money confirmation",async()=>{
  const h=setup({charge:{status:"DECLINED"}});assert.equal((await h.run()).body.status,"observed");assert.deepEqual(h.calls.map(c=>c.name),["record_checkout_attempt"]);assert.equal(h.refunds.length,0);
 });
 it("does not confirm a receipt refused by the durable binding command",async()=>{
  const h=setup({rpc:async()=>({data:null,error:{message:"mismatch"}})});assert.equal((await h.run()).status,409);assert.equal(h.calls.length,1);assert.equal(h.refunds.length,0);
 });
 it("does not fall back to legacy confirmation for a malformed attempt id",async()=>{
  const h=setup({charge:{metadata:{checkout_attempt_id:"invalid",purchase_type:"booking",booking_id:targetId}}});assert.equal((await h.run()).status,409);assert.equal(h.calls.length,0);
 });
 it("replayed captures still execute idempotent confirmation",async()=>{
  const h=setup();await h.run();await h.run();assert.equal(h.calls.filter(c=>c.name==="record_checkout_attempt").length,2);assert.equal(h.calls.filter(c=>c.name==="confirm_booking_payment").length,2);
 });
 it("retries confirmation after a prior failure to apply the already recorded capture",async()=>{
  let failures=1;const h=setup({rpc:async(name)=>name==="confirm_booking_payment"&&failures-->0?{data:null,error:new Error("offline")}:{data:{success:true},error:null}});
  assert.equal((await h.run()).status,500);assert.equal((await h.run()).status,200);assert.equal(h.calls.filter(c=>c.name==="confirm_booking_payment").length,2);
 });
 it("retains legacy in-flight capture handling without claiming an attempt",async()=>{
  const h=setup({charge:{metadata:{purchase_type:"booking",booking_id:targetId}}});assert.equal((await h.run()).status,200);assert.deepEqual(h.calls.map(c=>c.name),["confirm_booking_payment"]);
 });
 for(const type of ["membership","package","gift_card","tip","subscription"]){it(`binds ${type} before its existing confirmation command`,async()=>{
  const h=setup({charge:{metadata:{checkout_attempt_id:attemptId,purchase_type:type,purchase_id:targetId}}});assert.equal((await h.run()).status,200);assert.equal(h.calls[0].name,"record_checkout_attempt");assert.equal(h.calls[1].name,type==="membership"?"confirm_membership_payment":"confirm_purchase_payment");
 });}
 for(const [label,charge] of Object.entries({currency:{currency:"USD"},id:{id:"chg_other"},amount:{amount:-1},nonfinite:{amount:"Infinity"}})){it(`skips an invalid fetched ${label}`,async()=>{
  const h=setup({charge});assert.equal((await h.run({id:"chg_verified"})).body.status,"skipped");assert.equal(h.calls.length,0);
 });}
 it("fails verification on provider outage without recording or confirming",async()=>{
  const h=setup({gatewayStatus:503});assert.equal((await h.run()).status,502);assert.equal(h.calls.length,0);
 });
});
