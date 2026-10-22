import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { HqStore } from "../src/lib/hq/server/local-store.mjs";
import { handleHq } from "../src/lib/hq/server/handler.mjs";
import { loadCatalog } from "../src/lib/hq/server/catalog.mjs";
import { checkLocalRequest } from "../src/lib/hq/server/local-boundary.mjs";

const agents=[{id:"nora",name:"Nora",role:"Chief of Staff",activationStatus:"inactive",skills:[]}];
const sourceBody=" \r\nFirst acquisition only. Repeat acquisition commission is zero.\r\nمصدر المراجعة — no business execution. \r\n";
const seeded={title:"Exact founder design",body:sourceBody,provenance:{uri:"https://chatgpt.com/share/fixture",locator:"P074 / user",authorKind:"human_original_user",status:"founder_direction_preserved",recoveredAt:"2026-10-22"}};
const sha=v=>createHash("sha256").update(v).digest("hex");
const env={VOLABI_LOCAL_MODE:"enabled"};
const resources=[];
let networkCalls,originalFetch;
beforeEach(()=>{networkCalls=0;originalFetch=globalThis.fetch;globalThis.fetch=async()=>{networkCalls++;throw new Error("External transport blocked by independent HQ review");};});
afterEach(async()=>{for(const close of resources.splice(0).reverse())await close();globalThis.fetch=originalFetch;assert.equal(networkCalls,0,"No external fetch may be used");});
function setup(){
 const dir=mkdtempSync(path.join(tmpdir(),"hq-independent-"));
 const options={filePath:path.join(dir,"test.sqlite"),agents,initialSources:[seeded]};
 const state={store:new HqStore(options),options,dir};
 resources.push(()=>{try{state.store.close();}catch{}assert.equal(path.dirname(path.resolve(dir)),path.resolve(tmpdir()));assert.ok(path.basename(dir).startsWith("hq-independent-"));rmSync(dir,{recursive:true,force:true});});
 state.session=state.store.createSession();
 return state;
}
function envelope(type,payload,expectedRevision){return {commandId:randomUUID(),type,payload,...(expectedRevision===undefined?{}:{expectedRevision})};}
function run(s,type,payload,revision){return s.store.command(s.session,envelope(type,payload,revision));}
function source(s){return s.store.query(s.session,"sources").items[0];}
function createTask(s,change={}){
 const receipt=run(s,"task.create",{title:"Independent evidence review",request:"Check refund controls",outcome:"Evidence-linked local recommendation",acceptance:"Preserve original source and no financial action",ownerId:"nora",reviewerId:"development-preparer",limits:"Local record only",sourceIds:[source(s).id],...change});
 return s.store.query(s.session,"task",{id:receipt.entityId}).task;
}
function prepare(s){
 const task=createTask(s),r=run(s,"recommendation.prepare",{taskId:task.id},task.revision);
 return s.store.query(s.session,"decision",{id:r.recordIds.decisionId});
}
function approve(s,p){return run(s,"decision.record",{decisionId:p.decision.id,recommendationHash:p.recommendation.hash,choice:"approve",reason:"Approve local review only"},p.task.revision);}
const snapshot=s=>Object.fromEntries(["records","record_versions","commands","events"].map(t=>[t,Number(s.store.db.prepare("SELECT count(*) n FROM "+t).get().n)]));
const expectCode=(fn,code)=>assert.throws(fn,e=>e.code===code);
async function serve(s,extraEnv={},normalizedHost="127.0.0.1"){
 let settings={...env,...extraEnv};
 const server=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const internalOrigin="http://"+normalizedHost+":"+server.address().port;
  const body=Buffer.concat(chunks);
  const web=new Request(internalOrigin+req.url,{method:req.method,headers:req.headers,...(body.length?{body}: {})});
  const response=await handleHq(web,{store:s.store,env:settings});
  res.writeHead(response.status,Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 resources.push(()=>new Promise(resolve=>server.close(resolve)));
 const origin="http://127.0.0.1:"+server.address().port;
 async function call(route,{method="GET",body,cookie,csrf,headers={}}={}){
  const bytes=body===undefined?undefined:typeof body==="string"?body:JSON.stringify(body);
  return await new Promise((resolve,reject)=>{
   const req=httpRequest(origin+route,{method,headers:{...(method==="POST"?{origin,"content-type":"application/json"}:{}),...(cookie?{cookie}:{}),...(csrf?{"x-hq-csrf":csrf}:{}),...headers}},res=>{
    const chunks=[];res.on("data",c=>chunks.push(c));res.on("end",()=>{const raw=Buffer.concat(chunks).toString("utf8");resolve({status:res.statusCode,headers:res.headers,json:JSON.parse(raw)});});
   });req.on("error",reject);req.end(bytes);
  });
 }
 return {origin,call,setEnv:value=>{settings=value;}};
}
async function seat(api){
 const r=await api.call("/api/hq/session",{method:"POST",body:{}});
 assert.equal(r.status,200);
 return {session:r.json.session,cookie:r.headers["set-cookie"][0].split(";")[0],response:r};
}

test("Next-normalized localhost URL accepts actual127 loopback Host/Origin through real HTTP session and command",async()=>{
 const s=setup(),api=await serve(s,{},"localhost"),a=await seat(api);
 const cmd=envelope("task.create",{title:"Normalized local transport",request:"Keep actual browser origin",outcome:"Record",acceptance:"No alias confusion",limits:"Local",sourceIds:[]});
 const r=await api.call("/api/hq/commands",{method:"POST",body:cmd,cookie:a.cookie,csrf:a.session.csrfToken});
 assert.equal(r.status,200);assert.equal(r.json.receipt.effect,"record-only");
});
test("normalized local URL does not permit foreign origin/host/port/path/query/hash/userinfo",()=>{
 const url="http://localhost:3113/api/hq/session";
 const valid={host:"127.0.0.1:3113",origin:"http://127.0.0.1:3113"};
 const accepted=checkLocalRequest(new Request(url,{method:"POST",headers:valid}),env);
 assert.equal(accepted.origin,valid.origin);
 for(const change of [
  {host:"outside.invalid:3113"},{origin:"https://outside.invalid"},
  {origin:"http://localhost:3113"},{host:"127.0.0.1:3114"},
  {host:"127.0.0.1:3113/path"},{host:"127.0.0.1:3113?query=x"},
  {host:"127.0.0.1:3113#fragment"},{host:"user@127.0.0.1:3113"}
 ])expectCode(()=>checkLocalRequest(new Request(url,{method:"POST",headers:{...valid,...change}}),env),"origin_forbidden");
 expectCode(()=>checkLocalRequest(new Request("http://outside.invalid:3113/api/hq/session",{method:"POST",headers:valid}),env),"origin_forbidden");
});
test("real HTTP session/CSRF wiring records one SQLite task and refreshes without minting another identity",async()=>{
 const s=setup(),api=await serve(s),a=await seat(api);
 assert.match(a.response.headers["set-cookie"][0],/HttpOnly; SameSite=Strict/);
 assert.equal(a.session.mode,"local-development");assert.equal(a.session.employeesActive,false);
 assert.ok(!JSON.stringify(a.response.json).includes(a.cookie.split("=")[1]));
 const refreshed=await api.call("/api/hq/session",{method:"POST",body:{},cookie:a.cookie});
 assert.equal(refreshed.json.session.workspaceId,a.session.workspaceId);
 const cmd=envelope("task.create",{title:"HTTP Arabic review",request:"تحقق من المصدر",outcome:"A local source report",acceptance:"Exact evidence",limits:"No financial execution",sourceIds:[]});
 const r=await api.call("/api/hq/commands",{method:"POST",body:cmd,cookie:a.cookie,csrf:a.session.csrfToken});
 assert.equal(r.status,200);assert.equal(r.json.receipt.effect,"record-only");
 const q=await api.call("/api/hq/state?view=task&id="+r.json.receipt.entityId,{cookie:a.cookie});
 assert.equal(q.status,200);assert.equal(q.json.data.task.request,"تحقق من المصدر");
 assert.match(q.headers["cache-control"],/no-store/);
});
test("real HTTP denies missing/foreign CSRF, marketplace bearer and forged actor with no mutation",async()=>{
 const s=setup(),api=await serve(s),a=await seat(api),b=await seat(api),cmd=envelope("task.create",{});
 for(const csrf of [undefined,b.session.csrfToken,"bad"]){
  const r=await api.call("/api/hq/commands",{method:"POST",body:cmd,cookie:a.cookie,csrf});
  assert.equal(r.status,403);assert.equal(r.json.error.code,"csrf_failed");
 }
 assert.equal((await api.call("/api/hq/state",{headers:{authorization:"Bearer fake-marketplace-only"}})).status,401);
 const before=snapshot(s);
 const forged=envelope("task.create",{actorId:a.session.actorId,workspaceId:a.session.workspaceId});
 assert.equal((await api.call("/api/hq/commands",{method:"POST",body:forged,cookie:a.cookie,csrf:a.session.csrfToken})).status,400);
 assert.deepEqual(snapshot(s),before);
});
test("real HTTP loopback/Origin/cloud checks reject before touching storage",async()=>{
 const s=setup(),api=await serve(s);
 const before=snapshot(s);
 for(const headers of [{host:"evil.invalid"},{host:"localhost:1"},{origin:"https://evil.invalid"},{"sec-fetch-site":"cross-site"},{origin:""}]){
  const r=await api.call("/api/hq/session",{method:"POST",body:{},headers});assert.equal(r.status,403);assert.equal(r.json.error.code,"origin_forbidden");
 }
 for(const settings of [{},{VOLABI_LOCAL_MODE:"true"},{...env,VERCEL:"1"}]){
  api.setEnv(settings);const r=await api.call("/api/hq/session",{method:"POST",body:{}});assert.equal(r.status,403);assert.equal(r.json.error.code,"local_disabled");
 }
 assert.deepEqual(snapshot(s),before);
});
test("real HTTP foreign scopes hide task, recommendation, source and command receipt identities",async()=>{
 const s=setup(),api=await serve(s),a=await seat(api),b=await seat(api);
 const actor=s.store.getSession(a.cookie.split("=")[1]);
 const sourceId=s.store.query(actor,"sources").items[0].id;
 const cmd=envelope("task.create",{title:"Private seat task",request:"Private request sentinel",outcome:"Review",acceptance:"No leak",limits:"Local",sourceIds:[sourceId]});
 const result=await api.call("/api/hq/commands",{method:"POST",body:cmd,cookie:a.cookie,csrf:a.session.csrfToken});
 assert.equal(result.status,200);
 for(const route of ["/api/hq/state?view=task&id="+result.json.receipt.entityId,"/api/hq/state?view=source&id="+sourceId,"/api/hq/commands/"+cmd.commandId]){
  const r=await api.call(route,{cookie:b.cookie});assert.equal(r.status,404);assert.equal(r.json.error.code,"not_found");assert.ok(!JSON.stringify(r.json).includes("sentinel"));
 }
 const forbidden=await api.call("/api/hq/commands",{method:"POST",body:envelope("recommendation.prepare",{taskId:result.json.receipt.entityId},1),cookie:b.cookie,csrf:b.session.csrfToken});
 assert.equal(forbidden.status,404);
 const all=await api.call("/api/hq/state?view=tasks&q=sentinel",{cookie:b.cookie});assert.equal(all.json.data.total,0);
});
test("real HTTP rejects oversized/malformed bodies and storage failure exposes no raw paths",async()=>{
 const s=setup(),api=await serve(s),a=await seat(api);
 for(const body of ["{bad-json","[]"]){
  const r=await api.call("/api/hq/commands",{method:"POST",body,cookie:a.cookie,csrf:a.session.csrfToken});assert.equal(r.status,400);
 }
 const tooBig=await api.call("/api/hq/commands",{method:"POST",body:'{"x":"'+ "x".repeat(33000)+'"}',cookie:a.cookie,csrf:a.session.csrfToken});assert.equal(tooBig.status,413);
 s.store.close();
 const failed=await api.call("/api/hq/state",{cookie:a.cookie});assert.equal(failed.status,503);assert.deepEqual(failed.json,{ok:false,error:{code:"storage_unavailable",message:"storage_unavailable"}});
});
test("HTTP replay survives actual store close/reopen and recovers identical receipt without another effect",async()=>{
 const s=setup(),api=await serve(s),a=await seat(api);
 const cmd=envelope("task.create",{title:"Restart",request:"Persist request",outcome:"Survive restart",acceptance:"One receipt",limits:"Local",sourceIds:[]});
 const first=await api.call("/api/hq/commands",{method:"POST",body:cmd,cookie:a.cookie,csrf:a.session.csrfToken});assert.equal(first.status,200);
 s.store.close();s.store=new HqStore(s.options);
 const replay=await api.call("/api/hq/commands",{method:"POST",body:{...cmd,payload:{...cmd.payload}},cookie:a.cookie,csrf:a.session.csrfToken});
 assert.deepEqual(replay.json,first.json);
 const recovered=await api.call("/api/hq/commands/"+cmd.commandId,{cookie:a.cookie});assert.deepEqual(recovered.json.receipt,first.json.receipt);
 const changed=await api.call("/api/hq/commands",{method:"POST",body:{...cmd,payload:{...cmd.payload,outcome:"Changed material"}},cookie:a.cookie,csrf:a.session.csrfToken});assert.equal(changed.status,409);
 const q=await api.call("/api/hq/state?view=tasks",{cookie:a.cookie});assert.equal(q.json.data.total,1);
});
test("parallel HTTP replay of the same command has one task and one immutable mutation receipt",async()=>{
 const s=setup(),api=await serve(s),a=await seat(api);
 const cmd=envelope("task.create",{title:"Concurrent",request:"Same command",outcome:"One task",acceptance:"No duplicate",limits:"Local",sourceIds:[]});
 const replies=await Promise.all(Array.from({length:5},()=>api.call("/api/hq/commands",{method:"POST",body:cmd,cookie:a.cookie,csrf:a.session.csrfToken})));
 assert.ok(replies.every(r=>r.status===200));for(const r of replies)assert.deepEqual(r.json,replies[0].json);
 assert.equal(s.store.db.prepare("SELECT count(*) n FROM commands WHERE id=?").get(cmd.commandId).n,1);
});
test("actual HTTP rejects financial, employee, permission and external-contact executors with no receipt",async()=>{
 const s=setup(),api=await serve(s),a=await seat(api),before=snapshot(s);
 for(const type of ["refund.execute","payment.capture","employee.activate","permission.grant","meeting.invite","message.send"]){
  const cmd=envelope(type,{});
  const refused=await api.call("/api/hq/commands",{method:"POST",body:cmd,cookie:a.cookie,csrf:a.session.csrfToken});
  assert.equal(refused.status,400);assert.equal(refused.json.error.code,"invalid_input");
  const receipt=await api.call("/api/hq/commands/"+cmd.commandId,{cookie:a.cookie});assert.equal(receipt.status,404);
 }
 assert.deepEqual(snapshot(s),before);
});
test("source intake preserves exact CRLF/whitespace bytes/hash and cannot forge adopted authorship",()=>{
 const s=setup();assert.equal(source(s).body,sourceBody);assert.equal(source(s).sha256,sha(sourceBody));
 const r=run(s,"source.add",{title:"Quoted current request",body:sourceBody,provenance:{uri:"current-session:independent",locator:"local",authorKind:"CEO",status:"approved"}});
 const added=s.store.query(s.session,"source",{id:r.entityId}).source;
 assert.equal(added.body,sourceBody);assert.equal(added.sha256,sha(sourceBody));assert.equal(added.provenance.authorKind,"current-session");assert.equal(added.provenance.status,"proposed");
});
test("cross-task/foreign/unattached source citations cannot be laundered into a recommendation",()=>{
 const s=setup(),t=createTask(s),other=s.store.createSession(),foreign=s.store.query(other,"sources").items[0];
 const quote=source(s),citation={sourceId:quote.id,version:1,sha256:quote.sha256,start:0,end:8,quote:quote.body.slice(0,8)};
 const r=run(s,"source.add",{title:"Unattached",body:"Other source",provenance:{uri:"current-session:other",locator:"local",authorKind:"local",status:"proposed"}});
 const unattached=s.store.query(s.session,"source",{id:r.entityId}).source;
 for(const change of [{sourceId:foreign.id},{sourceId:unattached.id,sha256:unattached.sha256,quote:unattached.body.slice(0,8)}]){
  assert.throws(()=>run(s,"recommendation.publish",{taskId:t.id,title:"Invalid lineage",summary:"No",nextStep:"Review",citations:[{...citation,...change}]},1),e=>["not_found","invalid_citation"].includes(e.code));
 }
 assert.equal(s.store.query(s.session,"task",{id:t.id}).recommendations.length,0);
});
test("source changed before decision blocks approval and preserves old source/citation versions",()=>{
 const s=setup(),p=prepare(s),old=p.sources[0];run(s,"source.correct",{sourceId:old.id,body:"Corrected proposed source",reason:"New evidence"},old.version);
 expectCode(()=>approve(s,p),"stale_source");
 const history=s.store.query(s.session,"source",{id:old.id}).versions;
 assert.equal(history[0].body,sourceBody);assert.equal(history[1].correctionReason,"New evidence");
 const decision=s.store.query(s.session,"decision",{id:p.decision.id});assert.notEqual(decision.sources[0].sha256,old.sha256);assert.equal(decision.recommendation.citations[0].sha256,old.sha256);assert.equal(decision.recommendation.citations[0].quote,old.body.slice(decision.recommendation.citations[0].start,decision.recommendation.citations[0].end));assert.equal(decision.decision.status,"pending");
});
test("F-HQ1 source corrected after approval blocks follow-up against invalidated cited material",()=>{
 const s=setup(),p=prepare(s);approve(s,p);
 run(s,"source.correct",{sourceId:p.sources[0].id,body:"Corrected material after approval",reason:"Changed evidence"},p.sources[0].version);
 const before=snapshot(s);
 expectCode(()=>run(s,"followup.record",{taskId:p.task.id,decisionId:p.decision.id,note:"Must not follow stale decision",nextAction:"Review changed source"},p.task.revision),"stale_source");
 assert.deepEqual(snapshot(s),before);
});
test("request changes then new recommendation has new hash/decision and old decision cannot be followed",()=>{
 const s=setup(),p=prepare(s);
 run(s,"decision.record",{decisionId:p.decision.id,recommendationHash:p.recommendation.hash,choice:"request_changes",reason:"Need different recommendation"},p.task.revision);
 const next=run(s,"recommendation.prepare",{taskId:p.task.id},p.task.revision),d=s.store.query(s.session,"decision",{id:next.recordIds.decisionId});
 assert.notEqual(d.recommendation.hash,p.recommendation.hash);assert.notEqual(d.decision.id,p.decision.id);assert.equal(d.task.revision,p.task.revision);
 expectCode(()=>run(s,"followup.record",{taskId:p.task.id,decisionId:p.decision.id,note:"Old",nextAction:"None"},p.task.revision),"invalid_transition");
});
test("failed composite proposal rolls back partial task/version/audit rows and leaves no receipt",()=>{
 const s=setup(),cmd=envelope("proposal.create",{kind:"meeting",agentId:"nora",reason:"Prepare local meeting only",plan:"Agenda proposal",limits:"No invitation",sourceIds:[]});
 const before=snapshot(s);
 expectCode(()=>s.store.command(s.session,cmd),"evidence_required");assert.deepEqual(snapshot(s),before);expectCode(()=>s.store.receipt(s.session,cmd.commandId),"not_found");
});
test("receipt insertion failure rolls back material task and audit together",()=>{
 const s=setup(),sourceId=source(s).id,before=snapshot(s);
 const cmd=envelope("task.create",{title:"Forced rollback",request:"One transaction",outcome:"Nothing partial",acceptance:"No task or audit effect",limits:"Local",sourceIds:[sourceId]});
 s.store.db.exec("CREATE TRIGGER independent_fail_receipt BEFORE INSERT ON commands BEGIN SELECT RAISE(ABORT,'forced review rollback'); END;");
 assert.throws(()=>s.store.command(s.session,cmd),/forced review rollback/);assert.deepEqual(snapshot(s),before);
 s.store.db.exec("DROP TRIGGER independent_fail_receipt");
});
test("application audit, versions and receipt history are immutable and exclude text/session secrets",()=>{
 const s=setup(),p=prepare(s);approve(s,p);
 const raw=JSON.stringify(s.store.db.prepare("SELECT details FROM events").all());
 for(const secret of ["First acquisition","Check refund controls","Approve local review only",s.session.token,s.session.csrfToken])assert.ok(!raw.includes(secret));
 for(const table of ["events","record_versions","commands"]){
  assert.throws(()=>s.store.db.exec("UPDATE "+table+" SET "+(table==="events"?"details='{}'":table==="commands"?"payload_hash='changed'":"body='{}'")),/immutable history/);
  assert.throws(()=>s.store.db.exec("DELETE FROM "+table),/immutable history/);
 }
});
test("expired session and ambiguous cookies cannot access persisted state",async()=>{
 const s=setup(),api=await serve(s),a=await seat(api);
 assert.equal((await api.call("/api/hq/state",{cookie:a.cookie+"; "+a.cookie})).status,401);
 s.store.db.prepare("UPDATE sessions SET expires_at=?").run("2000-01-01T00:00:00.000Z");
 assert.equal((await api.call("/api/hq/state",{cookie:a.cookie})).status,401);
});
test("list pagination/search remains scoped and cannot inject query SQL",()=>{
 const s=setup();for(let i=0;i<27;i++)createTask(s,{title:"Review "+i});
 const other=s.store.createSession();assert.equal(s.store.query(other,"tasks").total,0);
 const a=s.store.query(s.session,"tasks",{page:0}),b=s.store.query(s.session,"tasks",{page:1});
 assert.equal(a.items.length,25);assert.equal(b.items.length,2);assert.equal(new Set([...a.items,...b.items].map(t=>t.id)).size,27);
 assert.equal(s.store.query(s.session,"tasks",{q:"' OR 1=1 --"}).total,0);
 expectCode(()=>s.store.query(s.session,"tasks",{page:"-1"}),"invalid_input");
});
test("real catalog preserves original inactive identities and source proposal/conditional distinctions",()=>{
 const root=path.resolve(import.meta.dirname,"../.."),catalog=loadCatalog(root);
 assert.equal(catalog.agents.length,15);assert.equal(new Set(catalog.agents.map(a=>a.id)).size,15);
 assert.ok(catalog.agents.every(a=>a.activationStatus==="inactive"&&a.skills.every(s=>s.permissions.length===0)));
 const json=JSON.parse(readFileSync(path.join(root,"planning/volabi/persona-and-skills/FINANCE_CONTROL_SOURCE_EXCERPTS.json"),"utf8"));
 for(const e of json.records){
  const found=catalog.initialSources.find(s=>s.title.startsWith(e.id+":"));
  assert.ok(found,e.id);assert.equal(found.body,e.excerpt_utf8);assert.equal(found.provenance.authorKind,e.author_kind);assert.equal(found.provenance.status,e.status);
 }
});
