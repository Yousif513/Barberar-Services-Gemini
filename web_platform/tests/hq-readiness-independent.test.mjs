import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer,request as httpRequest} from 'node:http';
import {HqStore} from '../src/lib/hq/server/local-store.mjs';
import {handleHq} from '../src/lib/hq/server/handler.mjs';
import {assessTaskSkills} from '../src/lib/hq/readiness.mjs';

let externalCalls=0;
globalThis.fetch=async()=>{externalCalls++;throw Error('LIVE_NETWORK_FORBIDDEN_IN_INDEPENDENT_READINESS_REVIEW');};
after(()=>assert.equal(externalCalls,0));
const required={skillId:'primora-evidence-research',version:'1.0.0',sha256:'a'.repeat(64)};
const installed={id:required.skillId,name:'Evidence research',version:required.version,sha256:required.sha256,installed:true,bindingStatus:'proposed',evidenceStatus:'unknown',permissions:[]};
const agents=[{id:'nora',name:'Nora',role:'Chief of Staff',activationStatus:'inactive',skills:[installed]},{id:'daniel',name:'Daniel',role:'Finance',activationStatus:'inactive',skills:[]}];
function setup(t){
 const dir=mkdtempSync(path.join(tmpdir(),'hq-readiness-independent-'));
 const options={filePath:path.join(dir,'hq.sqlite'),agents:structuredClone(agents),skills:[structuredClone(installed)],initialSources:[{title:'Controlled source',body:'Review local requirements. Approval is record only.',provenance:{uri:'repo:independent-readiness',locator:'synthetic local fixture',authorKind:'current-session',status:'proposed',recoveredAt:'2026-10-22'}}]};
 const s={store:new HqStore(options),options,dir};s.session=s.store.createSession();
 t.after(()=>{s.store.close();assert.equal(path.dirname(path.resolve(dir)),path.resolve(tmpdir()));assert.ok(path.basename(dir).startsWith('hq-readiness-independent-'));rmSync(dir,{recursive:true,force:true});});
 s.sourceId=s.store.db.prepare("SELECT id FROM records WHERE workspace_id=? AND kind='source'").get(s.session.workspaceId).id;
 return s;
}
const envelope=(type,payload,expectedRevision)=>({commandId:randomUUID(),type,payload,...(expectedRevision===undefined?{}:{expectedRevision})});
const execute=(s,type,payload,revision)=>s.store.command(s.session,envelope(type,payload,revision));
const taskInput=(s,skillRequirements=[required])=>({title:'Independent capability review',request:'Compare exact source and skill expectations',outcome:'A source-linked local review',acceptance:'No employee or business action',ownerId:'nora',reviewerId:'development-preparer',limits:'Local records only',sourceIds:[s.sourceId],skillRequirements});
const read=(s,kind,id)=>s.store.get(s.session,kind,id);
const snapshot=s=>Object.fromEntries(['records','record_versions','commands','events'].map(table=>[table,s.store.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()]));
const code=(fn,expected)=>assert.throws(fn,error=>error.code===expected);
const histories=(s,kind,id)=>s.store.db.prepare('SELECT revision,body FROM record_versions WHERE workspace_id=? AND kind=? AND id=? ORDER BY revision').all(s.session.workspaceId,kind,id);
function pending(s){const taskId=execute(s,'task.create',taskInput(s)).entityId;const receipt=execute(s,'recommendation.prepare',{taskId},1);return{taskId,recommendation:read(s,'recommendation',receipt.recordIds.recommendationId),decision:read(s,'decision',receipt.recordIds.decisionId)};}
function approve(s,p){return execute(s,'decision.record',{decisionId:p.decision.id,recommendationHash:p.recommendation.hash,choice:'approve',reason:'Approve this local evidence packet only'},1);}
function deepFreeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;}

test('invalid requirements revisions preserve exact task, pending decision, immutable history, audit and receipts',t=>{
 const s=setup(t),p=pending(s),before=snapshot(s);
 const invalid=[null,{},[null],new Array(1),[{...required,skillId:'Primora-research'}],[{...required,skillId:'../private'}],[{...required,skillId:'x'.repeat(121)}],[{...required,version:'v'.repeat(101)}],[{...required,version:''}],[{...required,sha256:'A'.repeat(64)}],[{...required,sha256:'a'.repeat(63)}],[{...required,version:1}],[{...required,sha256:false}],[required,{...required,skillId:' '+required.skillId+' '}],[{...required,permissions:['finance.execute']}],[{...required,bindingStatus:'adopted'}],[{...required,installCommand:'run'}],Array.from({length:21},(_,i)=>({...required,skillId:'skill-'+i}))];
 for(const rows of invalid){const command=envelope('task.revise',{taskId:p.taskId,title:'MUST ROLL BACK',skillRequirements:rows},1);code(()=>s.store.command(s.session,command),'invalid_input');assert.deepEqual(snapshot(s),before);code(()=>s.store.receipt(s.session,command.commandId),'not_found');}
 assert.equal(read(s,'decision',p.decision.id).status,'pending');assert.deepEqual(read(s,'task',p.taskId).skillRequirements,[required]);
});

test('late receipt failure rolls back a valid requirements revision and decision supersession together',t=>{
 const s=setup(t),p=pending(s),command=envelope('task.revise',{taskId:p.taskId,skillRequirements:[{...required,version:'2.0.0'}]},1),before=snapshot(s);
 s.store.db.exec("CREATE TRIGGER independent_block_receipt BEFORE INSERT ON commands WHEN NEW.id='"+command.commandId+"' BEGIN SELECT RAISE(ABORT,'INDEPENDENT_FORCED_RECEIPT_FAILURE'); END;");
 assert.throws(()=>s.store.command(s.session,command),/INDEPENDENT_FORCED_RECEIPT_FAILURE/);assert.deepEqual(snapshot(s),before);
 s.store.db.exec('DROP TRIGGER independent_block_receipt');
 const ok=s.store.command(s.session,command);assert.equal(ok.revision,2);assert.equal(read(s,'decision',p.decision.id).status,'superseded');
});

test('approved prior requirement packet cannot authorize followup after material pin revision',t=>{
 const s=setup(t),p=pending(s);approve(s,p);
 const oldRecommendation=structuredClone(read(s,'recommendation',p.recommendation.id)),oldDecisionHistory=histories(s,'decision',p.decision.id);
 execute(s,'task.revise',{taskId:p.taskId,skillRequirements:[{...required,sha256:'b'.repeat(64)}]},1);
 code(()=>execute(s,'followup.record',{taskId:p.taskId,decisionId:p.decision.id,note:'Old approval must not apply',nextAction:'No dispatch'},2),'invalid_transition');
 assert.deepEqual(read(s,'recommendation',p.recommendation.id),oldRecommendation);assert.deepEqual(histories(s,'decision',p.decision.id),oldDecisionHistory);
 const oldTask=histories(s,'task',p.taskId).map(row=>JSON.parse(row.body)).find(task=>task.revision===1);assert.deepEqual(oldTask.skillRequirements,[required]);
 const prepared=execute(s,'recommendation.prepare',{taskId:p.taskId},2),fresh=read(s,'recommendation',prepared.recordIds.recommendationId),decision=read(s,'decision',prepared.recordIds.decisionId);
 assert.notEqual(fresh.hash,oldRecommendation.hash);assert.equal(fresh.taskRevision,2);assert.equal(decision.status,'pending');
 assert.deepEqual(decision.scope,{environment:'local',effects:['record-only'],employeeActivation:false,businessPermissions:false,financialExecution:false});
 assert.throws(()=>s.store.db.prepare("UPDATE record_versions SET body='{}' WHERE kind='task'").run(),/immutable history/);
});

test('requirements revision replay survives restart and changed pins or foreign workspace cannot reuse authority',t=>{
 const s=setup(t),taskId=execute(s,'task.create',taskInput(s)).entityId;
 const command=envelope('task.revise',{taskId,skillRequirements:[{skillId:'global-missing',version:null,sha256:null}]},1),receipt=s.store.command(s.session,command),before=snapshot(s);
 s.store.close();s.store=new HqStore(s.options);
 assert.deepEqual(s.store.command(s.session,structuredClone(command)),receipt);assert.deepEqual(snapshot(s),before);
 code(()=>s.store.command(s.session,{...command,payload:{...command.payload,skillRequirements:[{skillId:'global-missing',version:'new',sha256:null}]}}),'command_conflict');
 const other=s.store.createSession(),otherBefore=snapshot(s);
 code(()=>s.store.command(other,{...command,commandId:randomUUID(),expectedRevision:2}),'not_found');code(()=>s.store.receipt(other,command.commandId),'not_found');assert.deepEqual(snapshot(s),otherBefore);
 assert.deepEqual(read(s,'task',taskId).skillRequirements,[{skillId:'global-missing',version:null,sha256:null}]);
});

test('legacy absent requirements stay undeclared through unrelated revision; valid bounds remain exact',t=>{
 const s=setup(t),legacy={...taskInput(s),id:randomUUID(),revision:1,status:'requested',sourceIds:[s.sourceId],currentRecommendationId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};delete legacy.skillRequirements;
 s.store.transaction(()=>s.store.put(s.session,'task',legacy));
 assert.deepEqual(assessTaskSkills(read(s,'task',legacy.id),s.store.agents[0],s.store.skills).rows,[]);
 execute(s,'task.revise',{taskId:legacy.id,outcome:'Still an undeclared legacy request'},1);assert.equal(Object.hasOwn(read(s,'task',legacy.id),'skillRequirements'),false);
 const maximum={skillId:'x'.repeat(120),version:'v'.repeat(100),sha256:'0'.repeat(64)},rows=[maximum,...Array.from({length:19},(_,i)=>({skillId:'skill-'+i,version:null,sha256:null}))];
 const id=execute(s,'task.create',taskInput(s,rows)).entityId;assert.deepEqual(read(s,'task',id).skillRequirements,rows);
 execute(s,'task.revise',{taskId:id,skillRequirements:[]},1);assert.deepEqual(read(s,'task',id).skillRequirements,[]);assert.equal(assessTaskSkills(read(s,'task',id),s.store.agents[0],s.store.skills).requirementsDeclared,false);
});

test('readiness uses only exact task rows and authoritative global metadata independent of proposed role map',()=>{
 const task=deepFreeze({skillRequirements:[required,{skillId:'role-only',version:'1',sha256:'c'.repeat(64)},{skillId:'unpinned',version:null,sha256:null}]}),role=deepFreeze({skills:[{id:'role-only',installed:true,version:'1',sha256:'c'.repeat(64)}]}),catalog=deepFreeze([{...installed,version:'2.0.0'},{id:'unpinned',installed:true,version:'7',sha256:'d'.repeat(64)},{id:'not-required',installed:true,version:'1',sha256:'e'.repeat(64)}]);
 const a=assessTaskSkills(task,role,catalog);assert.equal(a.rows.length,3);assert.deepEqual(a.rows.map(row=>row.skillId),task.skillRequirements.map(row=>row.skillId));
 assert.equal(a.rows[0].instructionStatus,'met');assert.equal(a.rows[0].versionStatus,'failed');assert.equal(a.rows[0].hashStatus,'met');assert.equal(a.rows[0].associationStatus,'missing');
 assert.equal(a.rows[1].instructionStatus,'missing');assert.equal(a.rows[1].associationStatus,'proposed');assert.equal(a.rows[1].versionStatus,'unknown');assert.equal(a.rows[1].hashStatus,'unknown');
 assert.equal(a.rows[2].versionStatus,'unknown');assert.equal(a.rows[2].hashStatus,'unknown');
 const missing=assessTaskSkills({skillRequirements:[required]},role,[{...installed,installed:false}]).rows[0];assert.equal(missing.instructionStatus,'missing');assert.equal(missing.versionStatus,'unknown');assert.equal(missing.hashStatus,'unknown');
 const noMetadata=assessTaskSkills({skillRequirements:[required]},undefined,undefined);assert.equal(noMetadata.rows[0].instructionStatus,'unknown');assert.equal(noMetadata.rows[0].associationStatus,'unknown');
});

test('matching metadata never adopts bindings, invents behavioral evidence, grants permission or activates execution',()=>{
 const task=deepFreeze({skillRequirements:[required]}),role=deepFreeze({activationStatus:'active',permissions:['finance.execute'],skills:[{...installed,bindingStatus:'adopted',evidenceStatus:'passed'}]}),catalog=deepFreeze([{...installed,permissions:['finance.execute'],bindingStatus:'adopted',evidenceStatus:'passed'}]);
 const a=assessTaskSkills(task,role,catalog);assert.equal(a.rows[0].instructionStatus,'met');assert.equal(a.rows[0].versionStatus,'met');assert.equal(a.rows[0].hashStatus,'met');assert.equal(a.executionStatus,'inactive-for-execution');
 assert.equal(a.rows[0].bindingStatus,'not-adopted');assert.equal(a.rows[0].evidenceStatus,'unknown');assert.equal(a.rows[0].permissionStatus,'not-granted');
});

async function serve(t,s){
 const server=createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);const response=await handleHq(new Request('http://localhost:'+server.address().port+req.url,{method:req.method,headers:req.headers,...(bytes.length?{body:bytes}:{})}),{store:s.store,env:{VOLABI_LOCAL_MODE:'enabled'}});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const origin='http://127.0.0.1:'+server.address().port;
 return async(route,{body,cookie,csrf}={})=>new Promise((resolve,reject)=>{const request=httpRequest(origin+route,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{}),...(csrf?{'x-hq-csrf':csrf}:{})}},response=>{const chunks=[];response.on('data',c=>chunks.push(c));response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,data:JSON.parse(Buffer.concat(chunks).toString())}));});request.on('error',reject);request.end(body?JSON.stringify(body):undefined);});
}
test('actual loopback HTTP persists exact pins and rejects malformed rows without changing the task',async t=>{
 const s=setup(t),call=await serve(t,s),seat=await call('/api/hq/session',{body:{}}),cookie=seat.headers['set-cookie'][0].split(';')[0],csrf=seat.data.session.csrfToken;
 const create=envelope('task.create',{...taskInput(s),sourceIds:[]}),saved=await call('/api/hq/commands',{body:create,cookie,csrf});assert.equal(saved.status,200);assert.equal(saved.data.receipt.effect,'record-only');const id=saved.data.receipt.entityId;
 const detail=await call('/api/hq/state?view=task&id='+id,{cookie});assert.deepEqual(detail.data.data.task.skillRequirements,[required]);
 const bad=await call('/api/hq/commands',{body:envelope('task.revise',{taskId:id,skillRequirements:[{...required,permissions:['business.execute']}]},1),cookie,csrf});assert.equal(bad.status,400);assert.equal(bad.data.error.code,'invalid_input');
 const after=await call('/api/hq/state?view=task&id='+id,{cookie});assert.equal(after.data.data.task.revision,1);assert.deepEqual(after.data.data.task.skillRequirements,[required]);assert.equal(after.data.data.task.status,'requested');
 const stolen=await call('/api/hq/commands',{body:envelope('task.revise',{taskId:id,skillRequirements:[]},1),cookie});assert.equal(stolen.status,403);
 assert.equal(s.store.agents[0].activationStatus,'inactive');assert.deepEqual(s.store.skills[0].permissions,[]);
});
