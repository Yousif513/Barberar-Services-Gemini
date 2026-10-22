import { test, after } from "node:test";
import assert from "node:assert/strict";
let network=0;globalThis.fetch=async()=>{network++;throw new Error("Unexpected HQ test network");};after(()=>assert.equal(network,0));
const client=()=>import("../src/lib/hq/client.ts");
const session={workspaceId:"workspace-one",actorId:"local-reviewer",actorLabel:"Development preparer",csrfToken:"local-csrf",mode:"local-development",employeesActive:false};
const command={commandId:"17ab7825-0154-4c46-b002-2914213faee5",type:"task.create",payload:{title:"Actual requested work"}};
const receipt={commandId:command.commandId,type:command.type,entityType:"task",entityId:"task-one",revision:1,recordIds:{taskId:"task-one"},effect:"record-only",recordedAt:"2026-10-22T12:00:00Z"};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
const missing=()=>reply({ok:false,error:{code:"not_found",message:"Not observed"}},404);
test("local session is explicit, cookie-based and cannot activate employees",async()=>{
 const {openHqSession}=await client();const calls=[];
 const actual=await openHqSession(async(url,init)=>{calls.push({url,init});return reply({ok:true,session});});
 assert.equal(actual.employeesActive,false);assert.equal(calls[0].url,"/api/hq/session");assert.equal(calls[0].init.credentials,"same-origin");assert.equal(calls[0].init.body,"{}");
});
test("state queries encode filters and never change the local endpoint",async()=>{
 const {loadHqState}=await client();let called;
 const result=await loadHqState("tasks",{q:"A & B",page:2},async(url,init)=>{called={url,init};return reply({ok:true,data:{items:[],total:0,page:2,pageSize:25}});});
 assert.equal(new URL(called.url,"http://localhost").searchParams.get("q"),"A & B");assert.equal(called.init.cache,"no-store");assert.equal(result.total,0);
});
test("a new command recovers its identity before one CSRF-protected post",async()=>{
 const {submitHqCommand}=await client();const calls=[];
 const result=await submitHqCommand(session,command,async(url,init)=>{calls.push({url,init});return calls.length===1?missing():reply({ok:true,receipt});});
 assert.equal(result.effect,"record-only");assert.equal(calls.length,2);assert.match(calls[0].url,/commands\/17ab/);assert.equal(calls[0].init.method,"GET");assert.equal(calls[1].init.headers["x-hq-csrf"],session.csrfToken);assert.equal(JSON.parse(calls[1].init.body).commandId,command.commandId);
});
test("a lost post response recovers the same receipt without a second post",async()=>{
 const {submitHqCommand}=await client();let posts=0,gets=0;
 const fetcher=async(_url,init)=>{if(init.method==="GET"){gets++;return gets===1?missing():reply({ok:true,receipt});}posts++;throw new TypeError("connection lost");};
 await assert.rejects(submitHqCommand(session,command,fetcher),e=>e.code==="unknown_receipt");
 assert.equal((await submitHqCommand(session,command,fetcher)).commandId,command.commandId);assert.equal(posts,1);assert.equal(gets,2);
});
test("failed recovery and malformed receipts never authorize success or a new post",async()=>{
 const {submitHqCommand}=await client();
 for(const invalid of [{...receipt,commandId:"other"},{...receipt,effect:"execute"},{...receipt,revision:0}])await assert.rejects(submitHqCommand(session,command,async()=>reply({ok:true,receipt:invalid})),e=>e.code==="unknown_receipt");
 let calls=0;await assert.rejects(submitHqCommand(session,command,async()=>{calls++;throw new TypeError("offline");}),e=>e.code==="unknown_receipt");assert.equal(calls,1);
});
test("same command double-click coalesces; changed payload cannot borrow its result",async()=>{
 const {submitHqCommand}=await client();let calls=0,release;
 const held=new Promise(resolve=>{release=resolve;});
 const fetcher=async()=>{calls++;await held;return reply({ok:true,receipt});};
 const first=submitHqCommand(session,command,fetcher);const second=submitHqCommand(session,{...command},fetcher);
 await assert.rejects(submitHqCommand(session,{...command,payload:{title:"different"}},fetcher),e=>e.code==="command_conflict");
 release();await Promise.all([first,second]);assert.equal(calls,1);
});
test("server denial remains a typed refusal and is not a fake empty state",async()=>{
 const {loadHqState}=await client();await assert.rejects(loadHqState("tasks",{},async()=>reply({ok:false,error:{code:"local_disabled",message:"private filesystem path must not become UI copy"}},403)),e=>e.code==="local_disabled"&&!e.message.includes("filesystem"));
});

test("recovery refusal retains an unresolved command while a verified rejected POST is definite",async()=>{
 const {submitHqCommand}=await client();
 for(const status of [401,403,409])await assert.rejects(submitHqCommand(session,command,async()=>reply({ok:false,error:{code:"session_required"}},status)),error=>error.definitive===false);
 let calls=0;await assert.rejects(submitHqCommand(session,command,async()=>++calls===1?missing():reply({ok:false,error:{code:"stale_revision"}},409)),error=>error.code==="stale_revision"&&error.definitive===true);assert.equal(calls,2);
});

test("textarea selection maps CRLF and repeated Unicode quotes to the exact original UTF16 range",async()=>{
 const {citationFromSelection}=await client();const source={id:"source-one",version:3,sha256:"original-sha",body:"😀 first\r\nrepeat\r\nrepeat\rend"};const displayed=source.body.replace(/\r\n?/g,"\n");const start=displayed.lastIndexOf("repeat");const actual=citationFromSelection(source,start,start+"repeat\nend".length);
 assert.equal(actual.start,source.body.lastIndexOf("repeat"));assert.equal(actual.end,source.body.length);assert.equal(actual.quote,"repeat\rend");assert.equal(source.body.slice(actual.start,actual.end),actual.quote);assert.equal(actual.version,3);assert.equal(actual.sha256,"original-sha");
 const multi=citationFromSelection(source,0,displayed.indexOf("repeat")+6);assert.equal(multi.quote,"😀 first\r\nrepeat");assert.equal(multi.end,source.body.indexOf("repeat")+6);
 for(const [a,b] of [[0,0],[-1,2],[2,1],[0,1000],[0.5,2]])assert.equal(citationFromSelection(source,a,b),null);
});
