import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

// These suites must never reach a network, including through an accidentally uninjected helper.
globalThis.fetch = async () => { throw new Error("External network forbidden in checkout tests"); };
const path = new URL("../functions/_shared/checkout-attempts.ts", import.meta.url);

it("durable checkout recovery module exists before payment dispatch can be used", () => {
  assert.ok(existsSync(path), "checkout still has no durable recovery service");
});

const mod = existsSync(path) ? await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(readFileSync(path, "utf8"))).toString("base64")}`) : {};
const attempt = (overrides={}) => ({id:"11111111-1111-4111-8111-111111111111",actor_id:"actor",purchase_type:"booking",target_id:"22222222-2222-4222-8222-222222222222",amount_sar:25,currency:"SAR",status:"unknown",gateway_context:"context",request_text:'{"amount":25}',created_at:new Date(0).toISOString(),...overrides});
const charge = (a, overrides={}) => ({id:"chg_one",status:"INITIATED",currency:"SAR",amount:25,metadata:{checkout_attempt_id:a.id,purchase_type:"booking",booking_id:a.target_id},reference:{transaction:a.id,order:a.target_id},transaction:{url:"https://checkout.local.invalid/one"},...overrides});
function database(a, overrides={}) {
 const calls=[];
 return {calls,async rpc(name,args) {calls.push({name,args}); if(overrides[name])return overrides[name](args); if(name==="mark_checkout_attempt_unknown")return {data:{...a,status:"unknown"},error:null}; if(name==="record_checkout_attempt")return {data:{...a,status:args.p_charge.status==="CAPTURED"?"captured":"ready",charge_id:args.p_charge.id,checkout_url:args.p_charge.transaction?.url},error:null}; return {data:{success:true},error:null};}};
}
const options = (a, db, fetchImpl) => ({db,apiKey:"fixture",gatewayContext:"context",attempt:a,fetchImpl});

describe("durable checkout recovery without financial network calls", () => {
 it("submits exactly the persisted wire bytes and stores the receipt",async()=>{
  const a=attempt({status:"submitting",request_text:'{ "amount": 25, "currency": "SAR" }'});const db=database(a);const requests=[];
  const r=await mod.dispatchCheckoutAttempt(options(a,db,async(url,init)=>{requests.push({url,init});return Response.json(charge(a));}));
  assert.equal(requests.length,1);assert.equal(requests[0].init.body,a.request_text);assert.equal(r.status,"ready");assert.equal(db.calls[0].name,"record_checkout_attempt");
 });
 it("quarantines a transport timeout instead of posting again",async()=>{
  const a=attempt({status:"submitting"});const db=database(a);let posts=0;
  const r=await mod.dispatchCheckoutAttempt(options(a,db,async()=>{posts++;throw new Error("timeout");}));
  assert.equal(r.status,"unknown");assert.equal(posts,1);assert.equal(db.calls[0].name,"mark_checkout_attempt_unknown");
 });
 it("quarantines a response whose receipt could not be committed",async()=>{
  const a=attempt({status:"submitting"});const db=database(a,{record_checkout_attempt:()=>({error:{message:"offline"},data:null})});
  assert.equal((await mod.dispatchCheckoutAttempt(options(a,db,async()=>Response.json(charge(a))))).status,"unknown");
  assert.equal(db.calls.at(-1).name,"mark_checkout_attempt_unknown");
 });
 it("does not turn gateway HTTP failure into a safe-to-retry charge",async()=>{
  const a=attempt({status:"submitting"});const db=database(a);
  assert.equal((await mod.dispatchCheckoutAttempt(options(a,db,async()=>Response.json({error:"busy"},{status:503})))).status,"unknown");
 });
 it("looks up the original reference and refetches the matching charge before recording",async()=>{
  const a=attempt();const db=database(a);const requests=[];
  const r=await mod.recoverCheckoutAttempt(options(a,db,async(url,init={})=>{requests.push({url,init});return Response.json(url.endsWith("/list")?{charges:[{id:"chg_one"}],has_more:false}:charge(a));}));
  assert.equal(r.status,"ready");assert.equal(requests.length,2);assert.deepEqual(JSON.parse(requests[0].init.body).reference,{transaction:[a.id],order:[a.target_id]});assert.ok(requests[1].url.endsWith("/chg_one"));assert.equal(db.calls[0].name,"record_checkout_attempt");
 });
 it("empty lookup does not prove failure or authorize a new charge",async()=>{
  const a=attempt();const db=database(a);const requests=[];
  const r=await mod.recoverCheckoutAttempt(options(a,db,async(url,init)=>{requests.push({url,init});return Response.json({charges:[],has_more:false});}));
  assert.equal(r.status,"unknown");assert.equal(requests.length,1);assert.equal(db.calls.length,0);
 });
 it("fully paginates before accepting one matching receipt",async()=>{
  const a=attempt();const db=database(a);let lists=0;const requests=[];
  const r=await mod.recoverCheckoutAttempt(options(a,db,async(url,init)=>{requests.push({url,init});if(url.endsWith("/list")){lists++;return Response.json(lists===1?{charges:[{id:"chg_one"}],has_more:true}:{charges:[],has_more:false});}return Response.json(charge(a));}));
  assert.equal(r.status,"ready");assert.equal(lists,2);assert.equal(JSON.parse(requests[1].init.body).starting_after,"chg_one");
 });
 for(const [label,response] of Object.entries({ambiguous:{charges:[{id:"chg_one"},{id:"chg_two"}],has_more:false},malformed:{charges:[],has_more:"false"},truncated:{charges:[],has_more:true}})){
  it(`keeps ${label} lookup held`,async()=>{const a=attempt();const db=database(a);const r=await mod.recoverCheckoutAttempt(options(a,db,async()=>Response.json(response)));assert.equal(r.status,"unknown");assert.equal(db.calls.length,0);});
 }
 it("refuses mismatched fetched charge instead of applying its outcome",async()=>{
  const a=attempt({charge_id:"chg_one"});const db=database(a);
  assert.equal((await mod.recoverCheckoutAttempt(options(a,db,async()=>Response.json(charge(a,{amount:1}))))).status,"unknown");assert.equal(db.calls.length,0);
 });
 it("does not send a failed create response back as ready",async()=>{
  const a=attempt({status:"submitting"});const db=database(a);let n=0;
  await mod.dispatchCheckoutAttempt(options(a,db,async()=>Response.json(++n===1?charge(a,{status:"DECLINED"}):charge(a,{status:"DECLINED"}))));
  assert.equal(n,2,"failure must be authenticated by charge retrieval");
 });
 it("retries idempotent capture confirmation on every recovered captured receipt",async()=>{
  const a=attempt({status:"captured",charge_id:"chg_one"});const db=database(a);
  await mod.recoverCheckoutAttempt(options(a,db,async()=>Response.json(charge(a,{status:"CAPTURED"}))));
  assert.equal(db.calls.at(-1).name,"confirm_booking_payment");assert.equal(db.calls.at(-1).args.target_payment_intent_id,"chg_one");
 });
 it("does not re-post an attempt older than the provider idempotency window",async()=>{
  const a=attempt();const db=database(a);const calls=[];
  await mod.recoverCheckoutAttempt(options(a,db,async(url)=>{calls.push(url);return Response.json({charges:[],has_more:false});}));
  assert.deepEqual(calls,["https://api.tap.company/v2/charges/list"]);
 });
});


describe("terminal create evidence normalization",()=>{
 for(const status of ["declined","Declined","captured","Captured"]){it(`refetches ${status} before recording its final outcome`,async()=>{
  const a=attempt({status:"submitting"});const db=database(a);let calls=0;
  await mod.dispatchCheckoutAttempt(options(a,db,async()=>Response.json(charge(a,{status:++calls===1?status:status.toUpperCase()}))));
  assert.equal(calls,2);
 });}
});


it("confirms a capture observed while quarantining a raced submission",async()=>{
 const a=attempt({status:"submitting"});const db=database(a,{mark_checkout_attempt_unknown:()=>({data:{...a,status:"captured",charge_id:"chg_race"},error:null})});
 const r=await mod.dispatchCheckoutAttempt(options(a,db,async()=>{throw new Error("timeout")}));
 assert.equal(r.status,"captured");assert.equal(db.calls.at(-1).name,"confirm_booking_payment");assert.equal(db.calls.at(-1).args.target_payment_intent_id,"chg_race");
});
