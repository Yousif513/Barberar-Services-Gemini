import {chromium,expect} from "@playwright/test";
import assert from "node:assert/strict";
import {mkdirSync,writeFileSync,readFileSync,existsSync} from "node:fs";
import {createHash,randomUUID} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const base=process.env.HQ_BASE_URL||"http://127.0.0.1:3113";
assert.equal(new URL(base).hostname,"127.0.0.1");
const out=path.join(root,".admin-console/evidence/volabi-first-loop");
mkdirSync(out,{recursive:true});
const tag="Independent "+randomUUID().slice(0,8);
const report={reviewer:"server_hq_audit",base,tag,startedAt:new Date().toISOString(),checks:[],overlays:[],routes:[],blockedExternal:[],browserErrors:[],commandRequests:[],receiptReads:[],expectedHttp:[],commands:[],deviceAttempts:[],screenshots:[],media:[],findings:[]};
let browser,currentPage;
const overlaySet=new Set();
const check=(name,detail={})=>{report.checks.push({name,status:"passed",...detail});console.log("PASS "+name);};
const markOverlay=kind=>overlaySet.add(kind);
async function context(locale="en",width=1440,cookies=[]){
 const ctx=await browser.newContext({viewport:{width,height:900},timezoneId:"Asia/Riyadh",locale:locale==="ar"?"ar-SA":"en-GB",serviceWorkers:"block",permissions:[]});
 await ctx.route("**/*",async route=>{
  const url=new URL(route.request().url());
  if(url.origin===base||["data:","blob:","about:"].includes(url.protocol))return route.continue();
  report.blockedExternal.push({url:route.request().url(),type:route.request().resourceType()});
  return route.abort("blockedbyclient");
 });
 await ctx.routeWebSocket("**/*",route=>{const u=new URL(route.url());const b=new URL(base);if(["ws:","wss:"].includes(u.protocol)&&u.hostname===b.hostname&&u.port===b.port)route.connectToServer();else{report.blockedExternal.push({url:route.url(),type:"websocket"});route.close();}});
 await ctx.exposeBinding("__hqReviewDeviceAttempt",(source,type)=>{report.deviceAttempts.push({type,url:source.page?.url()});});
 await ctx.addInitScript(({language})=>{
  localStorage.setItem("primora_lang",language);
  window.__hqReviewMediaCalls=0;
  if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=async()=>{window.__hqReviewMediaCalls++;await window.__hqReviewDeviceAttempt("getUserMedia");throw new Error("Microphone/camera not permitted in acceptance");};
  window.__hqReviewSpeechCalls=0;
  if(window.speechSynthesis)window.speechSynthesis.speak=()=>{window.__hqReviewSpeechCalls++;void window.__hqReviewDeviceAttempt("speechSynthesis");throw new Error("Speech synthesis not exercised");};
 },{language:locale});
 if(cookies.length)await ctx.addCookies(cookies);
 const page=await ctx.newPage();page.setDefaultTimeout(12000);
 page.on("request",req=>{if(req.url()===base+"/api/hq/commands"&&req.method()==="POST"){const c=req.postDataJSON();report.commandRequests.push({commandId:c.commandId,type:c.type});}const m=req.url().match(/\/api\/hq\/commands\/([a-f0-9-]{36})$/i);if(m&&req.method()==="GET")report.receiptReads.push(m[1]);});
 page.on("pageerror",error=>report.browserErrors.push({kind:"pageerror",message:error.message,url:page.url()}));
 page.on("console",message=>{if(message.type()==="error")report.browserErrors.push({kind:"console",message:message.text(),url:message.location().url});});
 page.on("response",response=>{if(response.url().startsWith(base+"/api/hq")&&response.status()>=400)report.expectedHttp.push({status:response.status(),url:response.url()});});
 return {ctx,page};
}
async function goto(page,route){currentPage=page;await page.goto(base+route);await expect(page.locator("#hq-main h1")).toBeVisible();report.routes.push(route);}
async function save(page,type,action){
 const response=page.waitForResponse(r=>r.url().endsWith("/api/hq/commands")&&r.request().method()==="POST"&&r.request().postDataJSON()?.type===type);
 const [r]=await Promise.all([response,action()]);const data=await r.json();
 report.commands.push({type,status:r.status(),commandId:r.request().postDataJSON().commandId,receipt:data.receipt||null});
 assert.equal(r.status(),200,JSON.stringify(data));assert.equal(data.receipt.effect,"record-only");return data.receipt;
}
async function snap(page,name){const p=path.join(out,name);await page.screenshot({path:p,fullPage:true});report.screenshots.push(p);}
async function open(page,trigger,kind,title){await trigger.click();const d=page.getByRole("dialog",{name:title,exact:true});await expect(d).toBeVisible();markOverlay(kind);return d;}
async function escape(page,trigger){await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);await expect(trigger).toBeFocused();}
async function inspectDialog(page,trigger,kind,title){
 await trigger.focus();const d=await open(page,trigger,kind,title);
 for(let i=0;i<6;i++){await page.keyboard.press("Tab");assert.ok(await d.evaluate(el=>el.contains(document.activeElement)),"Keyboard focus escaped "+kind);}
 await escape(page,trigger);return d;
}
const button=(page,name)=>page.getByRole("button",{name,exact:true}).first();
async function main(){
 browser=await chromium.launch({headless:true});
 const en=await context(),page=en.page;currentPage=page;
 await goto(page,"/hq");await expect(page.getByText("Company employees are inactive.",{exact:false}).first()).toBeVisible();
 const hqPolicyResponse=await en.ctx.request.get(base+"/hq",{maxRedirects:0}),loginPolicyResponse=await en.ctx.request.get(base+"/login",{maxRedirects:0});
 assert.equal(hqPolicyResponse.status(),200);assert.equal(loginPolicyResponse.status(),200);
 const hqPolicy=hqPolicyResponse.headers()["permissions-policy"],loginPolicy=loginPolicyResponse.headers()["permissions-policy"];
 assert.match(hqPolicy,/microphone=\(self\)/);assert.match(hqPolicy,/camera=\(\)/);
 assert.match(loginPolicy,/microphone=\(\)/);assert.match(loginPolicy,/camera=\(\)/);
 check("Actual HTTP policy scopes microphone self toHQ and denies microphone/camera on marketplace",{hqPolicy,loginPolicy});
 if(process.argv.includes("--inspect")){console.log((await page.locator("body").innerText()).slice(0,6000));await snap(page,"independent-inspect.png");return;}
 await inspectDialog(page,button(page,"+ Compose a request"),"task-composer","Compose a request");
 check("Task composer has focus containment and Escape restores its trigger");
 await goto(page,"/hq/knowledge");
 let d=await open(page,button(page,"+ Add a source record"),"source-intake","Add a source record");
 const exact="First acquisition only. Repeat acquisition commission is zero.\nA local development decision does not move funds.";
 await d.getByLabel("Title",{exact:true}).fill(tag+" source");
 await d.getByLabel("Source location",{exact:true}).fill("current-session:"+tag.replaceAll(" ","-"));
 await d.getByLabel("Prompt, section or locator",{exact:true}).fill("Independent acceptance / original exact text");
 await d.getByLabel("Exact source text",{exact:true}).fill(exact);
 const sourceReceipt=await save(page,"source.add",()=>d.getByRole("button",{name:"Save record",exact:true}).click()),sourceId=sourceReceipt.recordIds.sourceId;
 await expect(page).toHaveURL(base+"/hq/knowledge/"+sourceId);await expect(page.getByText(exact,{exact:true})).toBeVisible();
 await expect(page.getByText("Proposed · v1",{exact:true})).toBeVisible();
 check("Source intake persists exact authored text and proposed provenance");
 await goto(page,"/hq/tasks");
 d=await open(page,button(page,"+ Compose a request"),"task-composer","Compose a request");
 await d.getByLabel("Title",{exact:true}).fill(tag+" task");
 await d.getByLabel("Your request",{exact:true}).fill("Review the sourced first-acquisition and refund controls without changing terms.");
 await d.getByLabel("Required outcome",{exact:true}).fill("A source-linked authored recommendation for local CEO review.");
 await d.getByLabel("How you will accept the result",{exact:true}).fill("Exact quote and auditable record only.");
 await d.getByLabel("Proposed owner",{exact:true}).selectOption("daniel");
 await d.getByLabel("Independent reviewer",{exact:true}).selectOption("omar");
 await d.getByLabel("Scope, limits and prohibited actions",{exact:true}).fill("Local record only. No employee activation, provider calls, financial operations or external messages.");
 await d.getByRole("checkbox",{name:new RegExp(tag+" source")}).check();
 const taskReceipt=await save(page,"task.create",()=>d.getByRole("button",{name:"Save record",exact:true}).click()),taskId=taskReceipt.recordIds.taskId;
 await expect(page).toHaveURL(base+"/hq/tasks/"+taskId);await expect(page.locator("h1")).toHaveText(tag+" task");
 await page.reload();await expect(page.locator("h1")).toHaveText(tag+" task");
 check("Request creates persistent task, proposed owner and independent reviewer; survives reload");
 await inspectDialog(page,button(page,"Change linked sources"),"source-picker","Change linked sources");
 await inspectDialog(page,button(page,"Task readiness"),"readiness-comparison","Compare readiness");
 d=await open(page,button(page,"Write a recommendation"),"recommendation","Write a recommendation");
 await d.getByLabel("Title",{exact:true}).fill(tag+" authored recommendation");
 await d.getByLabel("Recommendation and reasoning",{exact:true}).fill("Preserve the approved zero-repeat acquisition requirement. Obtain commercial and PSP evidence before any live change.");
 await d.getByLabel("Explicit next action",{exact:true}).fill("Record this bounded local review; do not execute financial or employee work.");
 await d.getByLabel("Source",{exact:true}).selectOption(sourceId);
 await expect(d.getByLabel("Exact source text",{exact:true})).toHaveValue(exact);
 await d.getByLabel("Exact quote",{exact:true}).fill("not present in source");
 await d.getByRole("button",{name:"Add a source record",exact:true}).click();
 await expect(d.getByRole("alert")).toContainText("exactly match");
 await d.getByLabel("Exact quote",{exact:true}).fill("Repeat acquisition commission is zero.");
 await d.getByRole("button",{name:"Add a source record",exact:true}).click();
 const recReceipt=await save(page,"recommendation.publish",()=>d.getByRole("button",{name:"Save record",exact:true}).click()),decisionId=recReceipt.recordIds.decisionId;
 await expect(page).toHaveURL(base+"/hq/decisions/"+decisionId);
 await expect(page.getByText("Authored development recommendation",{exact:true})).toBeVisible();
 await expect(page.locator("blockquote")).toHaveText("Repeat acquisition commission is zero.");
 check("AUTHORED recommendation rejects false quote and binds exact source range/hash");
 await inspectDialog(page,button(page,"Inspect recorded proposal"),"skill-change-review","Inspect recorded proposal");
 await inspectDialog(page,button(page,"Request changes"),"request-changes","Request changes");
 d=await open(page,button(page,"Approve this local proposal"),"decision-confirmation","Record your exact decision");
 await d.getByLabel("Reason",{exact:true}).fill("Approve record-only local follow-up with the displayed exact source and proposal hash.");
 const decisionReceipt=await save(page,"decision.record",()=>d.getByRole("button",{name:"Approve this local proposal",exact:true}).click());
 assert.equal(decisionReceipt.recordIds.decisionId,decisionId);
 await expect(page.getByText("Approved · record only",{exact:true})).toBeVisible();
 await goto(page,"/hq/tasks/"+taskId);
 await page.getByLabel("Factual follow-up note",{exact:true}).fill("Checked the original source and reviewed exact recommendation.");
 await page.getByLabel("Explicit next action",{exact:true}).fill("Await separate business and provider acceptance.");
 await save(page,"followup.record",()=>button(page,"Record a follow-up").click());
 await page.reload();await expect(page.getByText("Checked the original source and reviewed exact recommendation.",{exact:true})).toBeVisible();
 await inspectDialog(page,button(page,"Inspect evidence"),"recommendation","Recommendation");
 await inspectDialog(page,page.getByRole("button",{name:"followup.recorded",exact:true}).first(),"audit-event","Immutable event detail");
 check("CEO record-only approval and factual follow-up persist with immutable audit event");
 report.ids={taskId,sourceId,decisionId};report.sourceOriginal=exact;
 const linkColors=await page.locator("a.hq-button-primary").first().evaluate(el=>{const c=getComputedStyle(el);return {text:el.textContent,color:c.color,background:c.backgroundColor};});
 const luminance=rgb=>{const c=rgb.match(/[0-9.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;};
 const l1=luminance(linkColors.color),l2=luminance(linkColors.background),contrast=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
 assert.ok(contrast>=4.5,JSON.stringify({...linkColors,contrast}));
 check("F-UI1 primary action link has readable computed contrast",{...linkColors,contrast});
 await snap(page,"independent-en-task.png");

 // Unknown command outcome: server commits, browser deliberately loses only the response.
 let lost=false;
 await page.route(base+"/api/hq/commands",async route=>{
  if(!lost&&route.request().postDataJSON()?.type==="followup.record"){lost=true;const r=await route.fetch();assert.equal(r.status(),200);await route.abort("connectionclosed");}
  else await route.continue();
 });
 await page.getByLabel("Factual follow-up note",{exact:true}).fill("Unknown receipt recovery sentinel.");
 await page.getByLabel("Explicit next action",{exact:true}).fill("Recover the same local command.");
 await button(page,"Record a follow-up").click();await expect(page.getByText("A previous save needs checking.",{exact:true})).toBeVisible();
 await expect(page.getByLabel("Factual follow-up note",{exact:true})).toHaveValue("Unknown receipt recovery sentinel.");
 const pending=await page.evaluate(()=>Object.entries(sessionStorage).find(([k])=>k.includes("followup."))?.[1]);assert.ok(pending);
 await page.reload();await expect(page.getByText("A previous save needs checking.",{exact:true})).toBeVisible();
 const originalCommand=JSON.parse(pending),receiptUrl=base+"/api/hq/commands/"+originalCommand.commandId;
 await page.route(receiptUrl,route=>route.fulfill({status:403,contentType:"application/json",body:JSON.stringify({ok:false,error:{code:"session_required",message:"session_required"}})}));
 await button(page,"Check the same command").click();
 await expect(page.getByText("A previous save needs checking.",{exact:true})).toBeVisible();
 await expect(page.locator("#hq-main").getByRole("alert")).toContainText("local session needs checking");
 const held=await page.evaluate(()=>Object.entries(sessionStorage).find(([k])=>k.includes("followup."))?.[1]);assert.equal(JSON.parse(held).commandId,originalCommand.commandId);
 await page.unroute(receiptUrl);await button(page,"Check the same command").click();
 await expect(page.getByText("Unknown receipt recovery sentinel.",{exact:true})).toHaveCount(1);
 assert.equal(report.commandRequests.filter(c=>c.commandId===JSON.parse(pending).commandId).length,1);assert.ok(report.receiptReads.includes(JSON.parse(pending).commandId));
 await page.unroute(base+"/api/hq/commands");
 check("Lost command response survives reload and recovers SAME receipt without duplicate effect",{commandId:JSON.parse(pending).commandId});

 await goto(page,"/hq/knowledge/"+sourceId);
 d=await open(page,button(page,"Propose a correction"),"source-correction","Propose a correction");
 await d.getByLabel("Exact source text",{exact:true}).fill(exact+"\nProposed correction after recorded approval.");
 await d.getByLabel("Reason",{exact:true}).fill("Prove stale approval cannot support a new follow-up.");
 await save(page,"source.correct",()=>d.getByRole("button",{name:"Save record",exact:true}).click());
 await expect(page.getByText("Proposed correction · v2",{exact:true})).toBeVisible();
 await expect(page.getByRole("combobox")).toHaveAccessibleName("Version");await page.getByRole("combobox").selectOption("1");await expect(page.getByText(exact,{exact:true})).toBeVisible();await expect(page.getByText("current-session · proposed",{exact:true})).toBeVisible();
 await page.getByRole("combobox").selectOption("2");await expect(page.getByText(exact+"\nProposed correction after recorded approval.",{exact:true})).toBeVisible();
 check("Correction retains original source bytes/provenance while labelling proposed v2");
 await goto(page,"/hq/tasks/"+taskId);
 await page.getByLabel("Factual follow-up note",{exact:true}).fill("Retain this stale follow-up draft.");
 await page.getByLabel("Explicit next action",{exact:true}).fill("Review the corrected source before a new recommendation.");
 const stale=page.waitForResponse(r=>r.url().endsWith("/api/hq/commands")&&r.request().postDataJSON()?.type==="followup.record");
 await button(page,"Record a follow-up").click();assert.equal((await stale).status(),409);
 await expect(page.locator("#hq-main").getByRole("alert")).toContainText("A cited source changed");
 await expect(page.getByLabel("Factual follow-up note",{exact:true})).toHaveValue("Retain this stale follow-up draft.");
 await expect(page.getByLabel("Explicit next action",{exact:true})).toHaveValue("Review the corrected source before a new recommendation.");
 check("Stale source after approval refuses follow-up and preserves both input drafts");

 // Fixture arrangement uses only local record commands; authored selection/publication is exercised through UI.
 const raw="😀 Lead\r\nRepeat rule.\r\nGap\r\nRepeat rule.\r\nDone";
 const fixture=await page.evaluate(async({title,raw})=>{
  const session=(await(await fetch("/api/hq/session",{method:"POST",headers:{"content-type":"application/json"},body:"{}"})).json()).session;
  const command=async(type,payload)=>{const r=await fetch("/api/hq/commands",{method:"POST",headers:{"content-type":"application/json","x-hq-csrf":session.csrfToken},body:JSON.stringify({commandId:crypto.randomUUID(),type,payload})});const j=await r.json();if(!r.ok)throw new Error(j.error?.code);return j.receipt;};
  const source=await command("source.add",{title,body:raw,provenance:{uri:"current-session:crlf-fixture",locator:"repeated CRLF selection",authorKind:"current-session",status:"proposed"}});
  const task=await command("task.create",{title:title+" task",request:"Verify original citation selection",outcome:"Exact repeated occurrence",acceptance:"Original CRLF UTF16 offsets",limits:"Local fixture only",sourceIds:[source.entityId]});
  return {sourceId:source.entityId,taskId:task.entityId};
 },{title:tag+" CRLF fixture",raw});
 await goto(page,"/hq/tasks/"+fixture.taskId);
 d=await open(page,button(page,"Write a recommendation"),"recommendation","Write a recommendation");
 await d.getByLabel("Title",{exact:true}).fill(tag+" exact selection");
 await d.getByLabel("Recommendation and reasoning",{exact:true}).fill("Verify original text selection without a synthesized fact.");
 await d.getByLabel("Explicit next action",{exact:true}).fill("Review only.");
 await d.getByLabel("Source",{exact:true}).selectOption(fixture.sourceId);
 const area=d.getByLabel("Exact source text",{exact:true});await area.focus();
 const display=raw.replace(/\r\n?/g,"\n"),selectionStart=display.lastIndexOf("Repeat rule.");
 await area.evaluate((el,{start,end})=>el.setSelectionRange(start,end),{start:selectionStart,end:display.length-1});
 await page.keyboard.press("Shift+ArrowRight");
 await expect(d.getByLabel("Exact quote",{exact:true})).toHaveValue("Repeat rule.\nDone");
 await d.getByRole("button",{name:"Add a source record",exact:true}).click();
 const publishing=page.waitForRequest(req=>req.url().endsWith("/api/hq/commands")&&req.method()==="POST"&&req.postDataJSON()?.type==="recommendation.publish");
 const [selectedReceipt,posted]=await Promise.all([save(page,"recommendation.publish",()=>d.getByRole("button",{name:"Save record",exact:true}).click()),publishing]);
 const citation=posted.postDataJSON().payload.citations[0];
 assert.equal(citation.start,raw.lastIndexOf("Repeat rule."));assert.equal(citation.end,raw.length);assert.equal(citation.quote,"Repeat rule.\r\nDone");
 check("Actual authored selection preserves second repeated occurrence and original CRLF UTF16 offsets",{start:citation.start,end:citation.end,decisionId:selectedReceipt.recordIds.decisionId});

 await goto(page,"/hq/tasks");
 await inspectDialog(page,button(page,"Filter"),"filters","Filter");
 await page.getByRole("textbox",{name:"Search this register",exact:true}).fill("not-found-"+tag);
 await expect(page.getByText("No records match these filters.",{exact:true})).toBeVisible();
 await goto(page,"/hq/decisions");await goto(page,"/hq/agents");
 await expect(page.locator(".hq-agent-card")).toHaveCount(15);
 check("Registers distinguish filtered-empty and retain15 inactive original identities");

 for(const person of ["nora","daniel"]){
  await goto(page,"/hq/agents/"+person);
  const name=person==="nora"?"Nora":"Daniel";await expect(page.locator("h1")).toHaveText(name);
  const portrait=page.getByRole("img",{name,exact:true});await expect(portrait).toBeVisible();
  assert.ok(await portrait.evaluate(el=>el.complete&&el.naturalWidth>0));
  await page.getByRole("tab",{name:"Skills & gaps",exact:true}).click();
  const data=await page.evaluate(async id=>(await(await fetch("/api/hq/state?view=agent&id="+id)).json()).data,person);
  const shown=await page.locator("[role=tabpanel] h3").allTextContents();
  assert.deepEqual(shown,data.agent.skills.map(s=>s.name));
  assert.ok(data.skills.length>data.agent.skills.length,"Profile must not replace role skills with global catalog");
  if(person==="nora"){
   await inspectDialog(page,button(page,"Skill and version evidence"),"skill-evidence","Skill and version evidence");
   await inspectDialog(page,button(page,"Evidence & freshness"),"evaluation-evidence","Evidence & freshness");
   await inspectDialog(page,button(page,"Propose a skill change"),"skill-change","Propose a skill change");
   await inspectDialog(page,button(page,"Prepare evaluation request"),"evaluation-request","Prepare evaluation request");
   await inspectDialog(page,button(page,"Compare readiness"),"readiness-comparison","Compare readiness");
  }
  await page.getByRole("tab",{name:"Original functions",exact:true}).click();
  assert.equal(await page.locator("[role=tabpanel] section.hq-panel").count(),data.agent.functions.length);
  assert.ok(data.agent.functions.length>0);
  await page.getByRole("tab",{name:"Voice & conversations",exact:true}).click();
  const audio=page.locator("audio");
  await expect(audio).toHaveCount(1);
  const sound=await audio.evaluate(async el=>{el.load();await new Promise((resolve,reject)=>{el.addEventListener("loadedmetadata",resolve,{once:true});el.addEventListener("error",reject,{once:true});});await el.play();el.pause();return {src:el.currentSrc,duration:el.duration};});
  assert.ok(sound.duration>0&&Number.isFinite(sound.duration));report.media.push({person,portrait:await portrait.getAttribute("src"),audio:sound});
  if(person==="nora"){await inspectDialog(page,button(page,"Prepare a conversation"),"task-composer","Prepare a conversation");await inspectDialog(page,button(page,"Prepare a meeting"),"task-composer","Prepare a meeting");}
 }
 check("Nora/Daniel expose only their own skills/functions and load actual original portrait/local audio files");
 await snap(page,"independent-en-daniel.png");

 const ar=await context("ar",375,await en.ctx.cookies()),arp=ar.page;
 // Locale control remains authoritative if the shared preference key differs.
 await goto(arp,"/hq");if(await arp.getByRole("button",{name:"العربية",exact:true}).count())await arp.getByRole("button",{name:"العربية",exact:true}).click();
 await expect(arp.locator(".hq")).toHaveAttribute("dir","rtl");
 for(const route of ["/hq","/hq/tasks","/hq/tasks/"+taskId,"/hq/decisions","/hq/decisions/"+decisionId,"/hq/knowledge","/hq/knowledge/"+sourceId,"/hq/agents","/hq/agents/nora"]){
  await goto(arp,route);await expect(arp.locator(".hq")).toHaveAttribute("dir","rtl");
  assert.ok(await arp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Horizontal overflow "+route);
 }
 await arp.getByRole("tab",{name:"الصوت والمحادثات",exact:true}).click();await expect(arp.getByText("لا يوجد ملف صوت عربي موثّق.",{exact:false})).toBeVisible();
 await snap(arp,"independent-ar-nora-375.png");
 const mobile=arp.getByRole("button",{name:"مساحة عمل المؤسس",exact:true});
 await inspectDialog(arp,mobile,"mobile-navigation","مساحة عمل المؤسس");
 check("All9 route families render Arabic RTL at375 without horizontal overflow; Arabic voice gap is truthful");

 // Actual foreign seat has no access; no mocked authorization success.
 const foreign=await context(),fp=foreign.page;
 await fp.goto(base+"/hq/tasks/"+taskId);await expect(fp.locator("#hq-main").getByRole("alert")).toContainText("unavailable in the current workspace");
 await page.goto(base+"/hq/tasks/"+randomUUID());await expect(page.locator("#hq-main").getByRole("alert")).toContainText("unavailable in the current workspace");
 await page.route(base+"/api/hq/state?view=overview",route=>route.fulfill({status:403,contentType:"application/json",body:JSON.stringify({ok:false,error:{code:"local_disabled",message:"local_disabled"}})}));
 await page.goto(base+"/hq");await expect(page.locator("#hq-main").getByRole("alert")).toContainText("not enabled in this process");await page.unroute(base+"/api/hq/state?view=overview");
 check("Actual foreign and missing records refuse; controlled forbidden response displays error, not invented data");

 assert.deepEqual(report.deviceAttempts,[]);assert.equal(await page.evaluate(()=>window.__hqReviewMediaCalls),0);assert.equal(await page.evaluate(()=>window.__hqReviewSpeechCalls),0);
 const expected=["audit-event","decision-confirmation","evaluation-evidence","evaluation-request","filters","readiness-comparison","recommendation","request-changes","skill-change","skill-change-review","skill-evidence","source-correction","source-intake","source-picker","task-composer"];
 for(const kind of expected)assert.ok(overlaySet.has(kind),"Untested overlay "+kind);
 report.unexpectedBrowserErrors=report.browserErrors.filter(e=>!(e.kind==="console"&&e.url.startsWith(base+"/api/hq/")&&/Failed to load resource/.test(e.message)&&/(403|404|409|ERR_CONNECTION_CLOSED)/.test(e.message)));assert.deepEqual(report.unexpectedBrowserErrors,[],"Unexpected browser console/page error");
 report.overlays=[...overlaySet];report.status="passed";report.finishedAt=new Date().toISOString();
 check("All15 approved overlay destinations exercised with keyboard closure; no microphone, remote speech, invitations or money");
}
try{await main();}
catch(error){report.status="failed";report.failure={message:error.message,stack:error.stack,url:currentPage?.url()};console.error(error);try{if(currentPage)await snap(currentPage,"independent-failure.png");}catch{}process.exitCode=1;}
finally{
 report.overlays=[...overlaySet];
 report.fileHashes=Object.fromEntries(["web_platform/src/components/hq/hq-workspace.tsx","web_platform/src/components/hq/hq-overlays.tsx","web_platform/src/components/hq/hq-agent-profile.tsx","web_platform/src/components/hq/hq-common.tsx","web_platform/src/components/hq/hq-shell.tsx","web_platform/src/components/hq/hq-context.tsx","web_platform/src/lib/hq/client.ts","web_platform/src/lib/hq/copy.ts","web_platform/src/lib/hq/voice.ts","web_platform/src/app/hq/hq.css","web_platform/src/lib/hq/contracts.ts","web_platform/tests-browser/hq-local-acceptance.mjs"].filter(f=>existsSync(path.join(root,f))).map(f=>[f,createHash("sha256").update(readFileSync(path.join(root,f))).digest("hex")]));
 writeFileSync(path.join(out,"independent-frontend.json"),JSON.stringify(report,null,2)+"\n");
 await browser?.close();
 console.log(JSON.stringify({status:report.status,checks:report.checks.length,overlays:report.overlays.length,failure:report.failure?.message}));
}
