import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID,randomBytes,createHash,createDecipheriv,scryptSync} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {Worker} from 'node:worker_threads';
import {HqStore} from '../src/lib/hq/server/local-store.mjs';
import {handleHq} from '../src/lib/hq/server/handler.mjs';
import {recordDiagnostic} from '../src/lib/hq/server/access-storage.mjs';
import {initializeAccess,adoptAccess,resumeAccess,issueEnrollmentPermit,inspectEnrollment,openAccessStore,ACCESS_SCHEMA_SQL} from '../../scripts/hq-access/index.mjs';
import {createBackup,inspectBackup,restoreBackup} from '../../scripts/hq-recovery/index.mjs';

// Independent security suite. Every root, seat and secret is synthetic and ephemeral.
const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha=value=>createHash('sha256').update(value).digest('hex');
const at=()=>new Date().toISOString();
function nativeAcl(location,unsafe=false){
 const encoded=Buffer.from(location,'utf8').toString('base64');
 const script=`$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'));$ErrorActionPreference='Stop';$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a=New-Object Security.AccessControl.DirectorySecurity;$a.SetOwner($sid);$a.SetAccessRuleProtection($true,$false);$r=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$a.AddAccessRule($r);${unsafe?"$world=New-Object Security.Principal.SecurityIdentifier('S-1-1-0');$x=New-Object Security.AccessControl.FileSystemAccessRule($world,'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow');$a.AddAccessRule($x);":''}[IO.Directory]::SetAccessControl($p,$a);`;
 execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:'pipe',timeout:10000});
}
function sandbox(t){
 assert.equal(process.platform,'win32','native Windows acceptance is required');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'volabi-access-security-')),marker=randomUUID();
 nativeAcl(root);fs.writeFileSync(path.join(root,'SECURITY-TEST-OWNER'),marker,{flag:'wx'});
 const opened=[];t.after(()=>{for(const store of opened.reverse()){try{store.close();}catch{}}const real=fs.realpathSync(root);assert.equal(path.dirname(real).toLowerCase(),fs.realpathSync(os.tmpdir()).toLowerCase());assert.ok(path.basename(real).startsWith('volabi-access-security-'));assert.equal(fs.lstatSync(root).isSymbolicLink(),false);assert.equal(fs.readFileSync(path.join(root,'SECURITY-TEST-OWNER'),'utf8'),marker);fs.rmSync(root,{recursive:true,force:true});});
 return {root,open(store){opened.push(store);return store;}};
}
function markedRoot(box,name='instance'){
 const root=path.join(box.root,name),fixtureId=randomUUID();fs.mkdirSync(root);nativeAcl(root);
 fs.writeFileSync(path.join(root,'ACCESS-SYNTHETIC.json'),JSON.stringify({format:'volabi-access-synthetic-root-1',fixtureId,syntheticOnly:true}),{flag:'wx'});
 return {root,fixtureId};
}
function legacyFixture(box,name='legacy'){
 const f=markedRoot(box,name),store=new HqStore({filePath:path.join(f.root,'hq.sqlite')}),sessions=[store.createSession(),store.createSession()];
 for(const session of sessions){store.put(session,'recovery-fixture-proof',{id:randomUUID(),fixtureId:f.fixtureId,workspaceId:session.workspaceId,actorId:session.actorId,syntheticOnly:true});store.addSource(session,{id:randomUUID(),title:'Independent synthetic source',body:'مصدر تجريبي مستقل / independent source '+randomUUID(),provenance:{uri:'current-session:independent-security',locator:'synthetic fixture',authorKind:'synthetic-reviewer',status:'current-session',recoveredAt:at()}},null,true);}
 fs.writeFileSync(path.join(f.root,'fixture.json'),JSON.stringify({format:'volabi-synthetic-fixture-1',fixtureId:f.fixtureId,workspaces:sessions.map(s=>({id:s.workspaceId,actorId:s.actorId}))}),{flag:'wx'});
 const before=rows(store.db);store.close();return {...f,sessions,before};
}
const rows=db=>Object.fromEntries(['workspaces','records','record_versions','commands','events'].map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row=>({...row}))]));
function state(store){return JSON.parse(store.db.prepare('SELECT state FROM hq_access_state WHERE id=1').get().state);}
function authenticationMethod(store,purpose,workspaceId){const event=store.db.prepare('SELECT details FROM events WHERE action=? AND workspace_id=? ORDER BY seq DESC LIMIT 1').get('access.'+purpose+'.committed',workspaceId);assert.ok(event,'actual committed immutable security event required');return JSON.parse(event.details).authenticationMethod;}
function exception(fn,code){assert.throws(fn,error=>Boolean(error&&error.code===code),`expected ${code} at intended boundary`);}
async function rejection(fn,code){await assert.rejects(fn,error=>Boolean(error&&error.code===code),`expected ${code} at intended boundary`);}
function enroll(box,f,adopt=Boolean(f.sessions)){
 const bootstrap=adopt?adoptAccess({root:f.root,confirmation:f.fixtureId,legacyToken:f.sessions[0].token,serverStopped:true}):initializeAccess({root:f.root,confirmation:f.fixtureId});
 const store=box.open(openAccessStore(f.root)),challenge=store.access.challenge(),stage=store.access.stage({purpose:'enroll',challenge:challenge.challenge,permit:bootstrap.bootstrapProof},undefined,challenge.browserToken);
 const committed=store.access.confirm({operationId:stage.operationId,operationProof:stage.operationProof,credential:stage.credential});
 assert.ok(committed.session?.token,'confirmed saved factor must issue first ordinary session');
 const session=store.getSession(committed.session.token);assert.ok(session,'healthy confirmed session');assert.equal(authenticationMethod(store,'enroll',session.workspaceId),'restricted-bootstrap');
 return {...f,bootstrap,store,stage,committed,session,token:committed.session.token,credential:stage.credential};
}
function recovery(store,credential){const c=store.access.challenge();return store.access.stage({purpose:'recover',challenge:c.challenge,credential},undefined,c.browserToken);}
function confirm(store,stage,extras={}){return store.access.confirm({operationId:stage.operationId,operationProof:stage.operationProof,credential:stage.credential,...extras});}
function request(store,route,{method='POST',body={},token,csrf,origin='http://127.0.0.1:34781',headers={},raw}={}){
 const h={'host':'127.0.0.1:34781',...(method==='GET'?{}:{'origin':origin,'content-type':'application/json'}),...headers};if(token)h.cookie=`volabi_session=${token}`;if(csrf)h['x-hq-csrf']=csrf;
 const req=new Request('http://127.0.0.1:34781'+route,{method,headers:h,...(method==='GET'?{}:{body:raw??JSON.stringify(body)})});
 return handleHq(req,{store,env:{VOLABI_LOCAL_MODE:'enabled',VOLABI_ACCESS_MODE:'synthetic-guarded',VOLABI_ACCESS_ROOT:store.accessIdentity?.root||path.dirname(store.filePath||store.databasePath||'unused'),VOLABI_PROJECT_ROOT:projectRoot}});
}
async function httpCode(response,code){assert.ok(response.status>=400,'HTTP refusal required');const body=await response.json();assert.equal(body.ok,false);assert.equal(body.error?.code,code);assert.equal(response.headers.get('set-cookie'),null,'refusal must not issue a session');return body;}

test('security: restricted bootstrap cannot read domain data, create sessions or nominate another seat',async t=>{
 const box=sandbox(t),f=markedRoot(box),boot=initializeAccess({root:f.root,confirmation:f.fixtureId}),store=box.open(openAccessStore(f.root));
 assert.equal(store.db.prepare('SELECT count(*) AS n FROM workspaces').get().n,1);
 assert.equal(store.db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
 assert.equal(store.getSession(boot.bootstrapProof),null);
 await httpCode(await request(store,'/api/hq/state',{method:'GET'}),'access_required');
 await httpCode(await request(store,'/api/hq/session'),'access_required');
 const c=store.access.challenge();
 exception(()=>store.access.stage({purpose:'enroll',challenge:c.challenge,permit:boot.bootstrapProof,workspaceId:randomUUID()},undefined,c.browserToken),'invalid_input');
 const stage=store.access.stage({purpose:'enroll',challenge:c.challenge,permit:boot.bootstrapProof},undefined,c.browserToken);
 assert.equal(store.db.prepare('SELECT count(*) AS n FROM sessions').get().n,0,'staging is not authentication');
 const done=confirm(store,stage);assert.equal(authenticationMethod(store,'enroll',boot.workspaceId),'restricted-bootstrap');assert.equal(done.session.workspaceId,boot.workspaceId);assert.equal(done.session.actorId,boot.actorId);
 const response=await request(store,'/api/hq/state',{method:'GET',token:done.session.token});assert.equal(response.status,200);
});

test('security: legacy adoption requires the original valid seat proof and preserves both workspaces',t=>{
 const box=sandbox(t),f=legacyFixture(box);
 exception(()=>adoptAccess({root:f.root,confirmation:f.fixtureId,legacyToken:randomBytes(32).toString('hex'),serverStopped:true}),'proof_invalid');
 assert.equal(fs.existsSync(path.join(f.root,'ACCESS-GUARD.json')),false);
 const enrolled=enroll(box,f,true),after=rows(enrolled.store.db);
 for(const table of ['workspaces','records','record_versions','commands'])assert.deepEqual(after[table],f.before[table],`${table} retains exact historical rows`);
 assert.deepEqual(after.events.slice(0,f.before.events.length),f.before.events,'original events retain exact values/order');
 assert.equal(enrolled.session.workspaceId,f.sessions[0].workspaceId);assert.equal(enrolled.session.actorId,f.sessions[0].actorId);
 assert.ok(enrolled.store.getSession(f.sessions[1].token),'other original workspace remains usable');
 assert.equal(enrolled.store.db.prepare('SELECT count(*) AS n FROM workspaces').get().n,2);
});

test('security: wrong, unknown and cross-instance recovery factors cannot guess or change a seat',t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box,'a')),b=enroll(box,legacyFixture(box,'b'));
 for(const credential of [a.credential.slice(0,-1)+(a.credential.endsWith('A')?'B':'A'),'vha1.'+randomUUID()+'.'+randomUUID()+'.'+randomBytes(32).toString('base64url'),b.credential]){
  const c=a.store.access.challenge();exception(()=>a.store.access.stage({purpose:'recover',challenge:c.challenge,credential},undefined,c.browserToken),'proof_invalid');
 }
 const c=a.store.access.challenge();exception(()=>a.store.access.stage({purpose:'recover',challenge:c.challenge,credential:a.credential,actorId:b.session.actorId,role:'CEO'},undefined,c.browserToken),'invalid_input');
 assert.equal(a.store.db.prepare('SELECT count(*) AS n FROM workspaces').get().n,2);
 assert.ok(a.store.getSession(a.token));
 const valid=recovery(a.store,a.credential),done=confirm(a.store,valid);assert.equal(done.session.workspaceId,a.session.workspaceId);assert.equal(done.session.actorId,a.session.actorId);
});

test('security: cancelled recovery and rotation retain the current factor until confirmed commit',t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box)),stage=recovery(a.store,a.credential);
 assert.ok(a.store.getSession(a.token),'old session remains valid while staged');
 const {receipt:pending}=a.store.access.receipt({operationId:stage.operationId,operationProof:stage.operationProof});assert.equal(JSON.stringify(pending).includes(stage.credential),false);
 const {receipt:cancel}=a.store.access.cancel({operationId:stage.operationId,operationProof:stage.operationProof});assert.equal(cancel.state,'cancelled');
 assert.ok(a.store.getSession(a.token),'cancellation cannot revoke old ordinary session');
 exception(()=>confirm(a.store,stage),'operation_conflict');
 const second=recovery(a.store,a.credential);const done=confirm(a.store,second);assert.ok(a.store.getSession(done.session.token));assert.equal(authenticationMethod(a.store,'recover',a.session.workspaceId),'recovery-factor');const current=a.store.getSession(done.session.token);exception(()=>a.store.access.stage({purpose:'rotate',credential:second.credential}),'session_required');exception(()=>a.store.access.stage({purpose:'rotate',credential:a.credential},current),'proof_invalid');const cancelledRotation=a.store.access.stage({purpose:'rotate',credential:second.credential},current);assert.ok(a.store.getSession(done.session.token));assert.equal(a.store.access.cancel({operationId:cancelledRotation.operationId,operationProof:cancelledRotation.operationProof}).receipt.state,'cancelled');const rotation=a.store.access.stage({purpose:'rotate',credential:second.credential},current),rotated=confirm(a.store,rotation);assert.equal(Boolean(a.store.getSession(done.session.token)),false);assert.ok(a.store.getSession(rotated.session.token));assert.equal(authenticationMethod(a.store,'rotate',a.session.workspaceId),'session-csrf-and-recovery-factor');const oldFactor=a.store.access.challenge();exception(()=>a.store.access.stage({purpose:'recover',challenge:oldFactor.challenge,credential:second.credential},undefined,oldFactor.browserToken),'proof_invalid');const next=recovery(a.store,rotation.credential);a.store.access.cancel({operationId:next.operationId,operationProof:next.operationProof});
});

test('security: confirmed response loss is resolved by redacted receipt and saved replacement, never another cookie',t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box)),stage=recovery(a.store,a.credential),done=confirm(a.store,stage);
 assert.equal(Boolean(a.store.getSession(a.token)),false,'old session revoked on commit');const oldFactor=a.store.access.challenge();exception(()=>a.store.access.stage({purpose:'recover',challenge:oldFactor.challenge,credential:a.credential},undefined,oldFactor.browserToken),'proof_invalid');
 const {receipt}=a.store.access.receipt({operationId:stage.operationId,operationProof:stage.operationProof});assert.equal(receipt.state,'committed');
 for(const secret of [a.credential,stage.credential,stage.operationProof,done.session.token])assert.equal(JSON.stringify(receipt).includes(secret),false);
 const replay=confirm(a.store,stage);assert.equal(Boolean(replay.session),false,'same-operation replay returns no replacement token');
 assert.equal(replay.receipt.operationId,done.receipt.operationId);
 exception(()=>confirm(a.store,{...stage,credential:a.credential}),'operation_conflict');
 const replacement=recovery(a.store,stage.credential),latest=confirm(a.store,replacement);assert.ok(a.store.getSession(latest.session.token),'confirmed saved replacement reconnects after lost delivery');
 const staleReplay=confirm(a.store,stage);assert.equal(Boolean(staleReplay.session),false);assert.ok(a.store.getSession(latest.session.token),'stale replay cannot revoke newer session');
});

test('security: audit persistence failure rolls back factor, generation, revocation and receipt atomically',t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box)),stage=recovery(a.store,a.credential),before=JSON.stringify(state(a.store)),events=a.store.db.prepare('SELECT count(*) AS n FROM events').get().n;
 const original=a.store.audit;let injected=false;a.store.audit=function(){injected=true;const error=new Error('independent synthetic audit fault');error.code='ENOSPC';throw error;};
 try{assert.throws(()=>confirm(a.store,stage));}finally{a.store.audit=original;}
 assert.equal(injected,true,'actual immutable audit path was faulted');
 assert.equal(sha(JSON.stringify(state(a.store))),sha(before),'security metadata completely rolls back');assert.equal(a.store.db.prepare('SELECT count(*) AS n FROM events').get().n,events);
 assert.ok(a.store.getSession(a.token),'original session survives failed commit');
 const done=confirm(a.store,stage);assert.ok(a.store.getSession(done.session.token));assert.equal(Boolean(a.store.getSession(a.token)),false);
});

test('security: revoked retained request objects and stale CSRF cannot read or commit commands',async t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box)),retained=a.store.getSession(a.token),command=taskCommand();
 const baseline=a.store.command(a.session,taskCommand());assert.ok(a.store.query(a.session,'task',{id:baseline.entityId}));assert.equal(a.store.receipt(a.session,baseline.commandId).commandId,baseline.commandId);const before=a.store.db.prepare('SELECT count(*) AS n FROM commands').get().n;
 const stage=recovery(a.store,a.credential),done=confirm(a.store,stage);
 exception(()=>a.store.query(retained,'overview',{}),'session_required');exception(()=>a.store.get(retained,'task',baseline.entityId),'session_required');exception(()=>a.store.receipt(retained,baseline.commandId),'session_required');exception(()=>a.store.command(retained,command),'session_required');
 assert.equal(a.store.db.prepare('SELECT count(*) AS n FROM commands').get().n,before);
 await httpCode(await request(a.store,'/api/hq/state',{method:'GET',token:a.token}),'access_required');
 await httpCode(await request(a.store,'/api/hq/commands',{token:a.token,csrf:retained.csrfToken,body:command}),'access_required');
 await httpCode(await request(a.store,'/api/hq/state?view=task&id='+baseline.entityId,{method:'GET',token:a.token}),'access_required');await httpCode(await request(a.store,'/api/hq/commands/'+baseline.commandId,{method:'GET',token:a.token}),'access_required');
 const current=a.store.getSession(done.session.token);assert.ok(current);await httpCode(await request(a.store,'/api/hq/access/stage',{token:done.session.token,body:{purpose:'rotate',credential:stage.credential}}),'csrf_failed');exception(()=>a.store.command({...current,actorId:a.sessions[1].actorId,role:'CEO'},taskCommand()),'session_required');
 await httpCode(await request(a.store,'/api/hq/access/signout',{token:done.session.token,csrf:retained.csrfToken,body:{operationId:randomUUID(),operationProof:randomBytes(32).toString('base64url')}}),'csrf_failed');
 const good=await request(a.store,'/api/hq/state?view=task&id='+baseline.entityId,{method:'GET',token:done.session.token});assert.equal(good.status,200);const goodReceipt=await request(a.store,'/api/hq/commands/'+baseline.commandId,{method:'GET',token:done.session.token});assert.equal(goodReceipt.status,200);const foreign=a.before.records.find(row=>row.workspace_id===a.sessions[1].workspaceId&&row.kind==='source');await httpCode(await request(a.store,'/api/hq/state?view=source&id='+foreign.id,{method:'GET',token:done.session.token}),'not_found');
});

test('security: guarded open refuses missing database, guard, both and parent without implicit creation',t=>{
 const box=sandbox(t);
 for(const kind of ['database','guard','both','parent']){
  const a=enroll(box,legacyFixture(box,kind));assert.ok(a.store.getSession(a.token));a.store.close();
  if(kind==='parent'){fs.rmSync(a.root,{recursive:true});exception(()=>openAccessStore(a.root),'storage_missing');assert.equal(fs.existsSync(a.root),false);continue;}
  if(kind==='database'||kind==='both')fs.unlinkSync(path.join(a.root,'hq.sqlite'));
  if(kind==='guard'||kind==='both')fs.unlinkSync(path.join(a.root,'ACCESS-GUARD.json'));
  const existed=fs.readdirSync(a.root).sort();exception(()=>openAccessStore(a.root),kind==='database'?'storage_missing':'storage_not_initialized');
  const after=fs.readdirSync(a.root).filter(x=>x!=='ACCESS-DIAGNOSTICS.jsonl').sort();assert.deepEqual(after,existed.filter(x=>x!=='ACCESS-DIAGNOSTICS.jsonl'));
  if(kind==='database'||kind==='both')assert.equal(fs.existsSync(path.join(a.root,'hq.sqlite')),false);
  if(kind==='guard'||kind==='both')assert.equal(fs.existsSync(path.join(a.root,'ACCESS-GUARD.json')),false);
 }
});

test('security: cached guard loss blocks reads and writes while preserving existing business rows',t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box));assert.ok(a.store.query(a.session,'overview',{}));const before=rows(a.store.db),guard=path.join(a.root,'ACCESS-GUARD.json');
 fs.unlinkSync(guard);exception(()=>a.store.query(a.session,'overview',{}),'storage_not_initialized');exception(()=>a.store.command(a.session,taskCommand()),'storage_unavailable');
 assert.equal(fs.existsSync(guard),false);const check=new DatabaseSync(path.join(a.root,'hq.sqlite'),{readOnly:true});try{assert.deepEqual(rows(check),before,'storage refusal must not audit a fabricated successful business command');}finally{check.close();}
 const diagnostic=fs.readFileSync(path.join(a.root,'ACCESS-DIAGNOSTICS.jsonl'),'utf8');assert.ok(Buffer.byteLength(diagnostic)<=65536);assert.equal(diagnostic.includes(a.token),false);assert.equal(diagnostic.includes(a.credential),false);
});

test('security: native Windows junction and hard-linked database aliases refuse without rebinding',t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box));assert.ok(a.store.getSession(a.token));a.store.close();
 const junction=path.join(box.root,'junction');fs.symlinkSync(a.root,junction,'junction');exception(()=>openAccessStore(junction),'storage_unsafe');
 const alias=path.join(box.root,'alias.sqlite');fs.linkSync(path.join(a.root,'hq.sqlite'),alias);exception(()=>openAccessStore(a.root),'storage_unsafe');fs.unlinkSync(alias);
 const good=box.open(openAccessStore(a.root));assert.ok(good.getSession(a.token),'removing a separately created alias does not require guard rewrite');
});

test('security: native owner custody rejects an insecure instance directory',t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box));assert.ok(a.store.getSession(a.token));a.store.close();nativeAcl(a.root,true);
 try{exception(()=>openAccessStore(a.root),'storage_unsafe');}finally{nativeAcl(a.root);}
 assert.ok(box.open(openAccessStore(a.root)).getSession(a.token),'exact protected instance is healthy after ACL restored');
});

test('security: replaced database and swapped guard cannot be adopted as the cached authoritative instance',t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box,'a')),b=enroll(box,legacyFixture(box,'b'));assert.ok(a.store.query(a.session,'overview',{}));
 const guard=path.join(a.root,'ACCESS-GUARD.json'),saved=fs.readFileSync(guard);fs.writeFileSync(guard,fs.readFileSync(path.join(b.root,'ACCESS-GUARD.json')));
 exception(()=>a.store.query(a.session,'overview',{}),'storage_guard_invalid');fs.writeFileSync(guard,saved);a.store.close();b.store.close();
 const file=path.join(a.root,'hq.sqlite'),held=path.join(a.root,'held.sqlite');fs.renameSync(file,held);fs.copyFileSync(path.join(b.root,'hq.sqlite'),file);
 exception(()=>openAccessStore(a.root),'storage_identity_changed');assert.equal(fs.existsSync(held),true);assert.equal(fs.readFileSync(guard).equals(saved),true,'failure does not rewrite expected guard');
});

test('security: inert markers, moved inert application identity and unenrolled legacy storage refuse normal guarded open',t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box));a.store.close();fs.writeFileSync(path.join(a.root,'INERT-RESTORE.json'),'{}');exception(()=>openAccessStore(a.root),'inert_restore');fs.unlinkSync(path.join(a.root,'INERT-RESTORE.json'));
 const db=new DatabaseSync(path.join(a.root,'hq.sqlite'));db.exec('PRAGMA application_id=1447579986');db.close();exception(()=>openAccessStore(a.root),'inert_restore');
 const legacy=legacyFixture(box,'unadopted');exception(()=>openAccessStore(legacy.root),'storage_not_initialized');assert.equal(fs.existsSync(path.join(legacy.root,'ACCESS-GUARD.json')),false);
});

function taskCommand(){return {commandId:randomUUID(),type:'task.create',payload:{title:'Independent synthetic command',request:'Record only',outcome:'Synthetic outcome',acceptance:'No business effect',limits:'No activation or external write',sourceIds:[]}};}

test('security: HTTP recovery challenge is bound to the exact browser while bad origin, body and forged scope refuse',async t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box));
 const challengeResponse=await request(a.store,'/api/hq/access/challenge');assert.equal(challengeResponse.status,200);const challengeBody=await challengeResponse.json(),cookie=challengeResponse.headers.get('set-cookie');assert.ok(cookie?.includes('HttpOnly'));assert.ok(cookie.includes('SameSite=Strict'));assert.ok(cookie.includes('Path=/api/hq/access'));assert.equal(challengeResponse.headers.get('cache-control'),'no-store, private');
 const browserCookie=cookie.split(';')[0],body={purpose:'recover',challenge:challengeBody.challenge,credential:a.credential};
 await httpCode(await request(a.store,'/api/hq/access/stage',{method:'GET'}),'method_not_allowed');
 await httpCode(await request(a.store,'/api/hq/access/stage',{body,headers:{cookie:'volabi_access_browser='+randomBytes(32).toString('hex')}}),'proof_invalid');
 await httpCode(await request(a.store,'/api/hq/access/stage',{body,origin:'https://hostile.invalid',headers:{cookie:browserCookie}}),'origin_forbidden');
 await httpCode(await request(a.store,'/api/hq/access/stage',{body:{...body,workspaceId:a.session.workspaceId},headers:{cookie:browserCookie}}),'invalid_input');
 await httpCode(await request(a.store,'/api/hq/access/stage',{raw:'{',headers:{cookie:browserCookie}}),'invalid_input');
 await httpCode(await request(a.store,'/api/hq/access/stage',{raw:JSON.stringify({x:'x'.repeat(4096)}),headers:{cookie:browserCookie}}),'request_too_large');
 const valid=await request(a.store,'/api/hq/access/stage',{body,headers:{cookie:browserCookie}});assert.equal(valid.status,200,'same challenge with exact browser remains usable after unrelated parsing refusals');const staged=await valid.json();assert.equal(valid.headers.get('set-cookie'),null);assert.equal(Boolean(staged.session),false);
 await httpCode(await request(a.store,'/api/hq/access/receipt',{body:{operationId:staged.operationId,operationProof:randomBytes(32).toString('hex')}}),'proof_invalid');
 const known=await request(a.store,'/api/hq/access/receipt',{body:{operationId:staged.operationId,operationProof:staged.operationProof}});assert.equal(known.status,200);assert.equal(JSON.stringify(await known.json()).includes(staged.credential),false);
});

test('security: unauthenticated challenges cannot replace a proved pending seat operation or disable normal sessions',t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box)),stage=recovery(a.store,a.credential);
 for(let i=0;i<12;i++)a.store.access.challenge();
 assert.ok(a.store.getSession(a.token),'authenticated session survives challenge issuance');
 const {receipt}=a.store.access.receipt({operationId:stage.operationId,operationProof:stage.operationProof});assert.equal(receipt.state,'pending');
 const done=confirm(a.store,stage);assert.ok(a.store.getSession(done.session.token),'original proved pending operation survives unauthenticated issuance');
});

test('security: invalid proof budget persists across reopen and never disables an existing valid session',t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box)),c=a.store.access.challenge(),wrong=a.credential.slice(0,-1)+(a.credential.endsWith('A')?'B':'A');
 for(let i=0;i<5;i++)exception(()=>a.store.access.stage({purpose:'recover',challenge:c.challenge,credential:wrong},undefined,c.browserToken),'proof_invalid');
 exception(()=>a.store.access.stage({purpose:'recover',challenge:c.challenge,credential:a.credential},undefined,c.browserToken),'proof_invalid');
 a.store.close();const reopened=box.open(openAccessStore(a.root));assert.ok(reopened.getSession(a.token));
 exception(()=>reopened.access.stage({purpose:'recover',challenge:c.challenge,credential:a.credential},undefined,c.browserToken),'proof_invalid');
 let invalid=state(reopened).attempts.length;assert.ok(invalid>=5,'invalid attempts must be durable');
 while(invalid<30){const fresh=reopened.access.challenge();exception(()=>reopened.access.stage({purpose:'recover',challenge:fresh.challenge,credential:wrong},undefined,fresh.browserToken),'proof_invalid');invalid=state(reopened).attempts.length;}
 reopened.close();const again=box.open(openAccessStore(a.root));exception(()=>again.access.challenge(),'rate_limited');exception(()=>again.access.stage({purpose:'recover',challenge:c.challenge,credential:a.credential},undefined,c.browserToken),'rate_limited');
 assert.ok(again.getSession(a.token));assert.ok(again.query(again.getSession(a.token),'overview',{}),'instance invalid budget cannot globally block authenticated access');
});

function independentlyDecrypt(bytes,keyText){
 const n=bytes.readUInt32BE(8),prefix=bytes.subarray(0,12+n),header=JSON.parse(bytes.subarray(12,12+n));assert.equal(header.cipher,'aes-256-gcm');assert.equal(header.kdf,'scrypt');
 const key=scryptSync(keyText,Buffer.from(header.salt,'base64'),32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 try{const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(header.nonce,'base64'));cipher.setAAD(prefix);cipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([cipher.update(bytes.subarray(12+n,-16)),cipher.final()]);}finally{key.fill(0);}
}
function authCanaries(s){const canaries=[s.instanceId,s.initialization.proofHash,...Object.keys(s.sessions),...Object.values(s.seats).map(x=>x.verifier),...Object.keys(s.permits),...Object.keys(s.challenges),...Object.values(s.challenges).map(x=>x.browserHash),...Object.values(s.operations).flatMap(x=>[x.proofHash,x.nextVerifier,x.sessionHash,x.permitHash])];return [...new Set(canaries.filter(x=>typeof x==='string'&&x.length>=32))];}

test('security: encrypted new-schema capture physically excludes every auth control and restores inert with exact business history',async t=>{
 const box=sandbox(t),f=legacyFixture(box),a=enroll(box,f,true),stage=recovery(a.store,a.credential),control=state(a.store),before=rows(a.store.db),canaries=[a.token,a.credential,stage.credential,stage.operationProof,a.bootstrap.bootstrapProof,...authCanaries(control)],key=Buffer.from('independent access physical exclusion key');
 t.after(()=>key.fill(0));const created=await createBackup({fixtureRoot:a.root,outputRoot:path.join(box.root,'package'),passphrase:key,projectRoot});
 const plain=independentlyDecrypt(fs.readFileSync(created.packagePath),key);for(const canary of canaries)assert.equal(plain.includes(Buffer.from(canary)),false,'portable logical payload must exclude an authentication canary');
 const inspected=await inspectBackup({packagePath:created.packagePath,outputRoot:path.join(box.root,'inspection'),passphrase:key,projectRoot});assert.equal(inspected.dataIntegrity,'passed');
 const restored=await restoreBackup({packagePath:created.packagePath,outputRoot:path.join(box.root,'restored'),passphrase:key,projectRoot}),raw=fs.readFileSync(restored.databasePath);
 for(const canary of canaries)assert.equal(raw.includes(Buffer.from(canary)),false,'raw restored native pages must exclude an authentication canary');
 assert.equal(raw.includes(Buffer.from('hq_access_state')),false,'fresh sanitized schema contains no control table');
 const db=new DatabaseSync(restored.databasePath,{readOnly:true});try{assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);assert.deepEqual(rows(db),before);}finally{db.close();}
 assert.throws(()=>new HqStore({filePath:restored.databasePath}),e=>e.code==='inert_restore');
 assert.equal(fs.existsSync(path.join(path.dirname(restored.databasePath),'ACCESS-GUARD.json')),false);assert.equal(fs.existsSync(path.join(path.dirname(restored.databasePath),'ACCESS-SYNTHETIC.json')),false);
 assert.ok(a.store.getSession(a.token),'backup must not revoke or mutate the original synthetic instance');
});

test('security: old v1 fixture package remains fully inspectable and inert after access schema support',async t=>{
 const box=sandbox(t),f=legacyFixture(box),key=Buffer.from('independent unchanged v1 package key');t.after(()=>key.fill(0));
 const created=await createBackup({fixtureRoot:f.root,outputRoot:path.join(box.root,'package-v1'),passphrase:key,projectRoot}),plain=independentlyDecrypt(fs.readFileSync(created.packagePath),key);
 for(const session of f.sessions){assert.equal(plain.includes(Buffer.from(session.token)),false);assert.equal(plain.includes(Buffer.from(sha(session.token))),false);}
 const inspection=await inspectBackup({packagePath:created.packagePath,outputRoot:path.join(box.root,'inspect-v1'),passphrase:key,projectRoot});assert.equal(inspection.dataIntegrity,'passed');
 const restored=await restoreBackup({packagePath:created.packagePath,outputRoot:path.join(box.root,'restore-v1'),passphrase:key,projectRoot}),db=new DatabaseSync(restored.databasePath,{readOnly:true});try{assert.deepEqual(rows(db),f.before);assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);}finally{db.close();}
 assert.throws(()=>new HqStore({filePath:restored.databasePath}),e=>e.code==='inert_restore');
});

test('security: a request queued after initial authorization rechecks its seat inside the write transaction',t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box));a.store.command(a.session,taskCommand());const command=taskCommand(),retained=a.store.getSession(a.token),other=box.open(openAccessStore(a.root)),stage=recovery(other,a.credential),before=a.store.db.prepare('SELECT count(*) AS n FROM commands').get().n,original=a.store.transaction.bind(a.store);let paused=false;
 a.store.transaction=function(fn){paused=true;a.store.transaction=original;confirm(other,stage);return original(fn);};
 exception(()=>a.store.command(retained,command),'session_required');assert.equal(paused,true,'revocation occurred after preflight and before the actual SQLite transaction');
 assert.equal(a.store.db.prepare('SELECT count(*) AS n FROM commands').get().n,before,'queued stale request cannot commit after revocation');
});

test('security: guard loss after a real business write rolls back before commit and closes the cached handle',t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box));a.store.command(a.session,taskCommand());const before=rows(a.store.db),original=a.store.audit.bind(a.store),guard=path.join(a.root,'ACCESS-GUARD.json');let injected=false;
 a.store.audit=function(session,action,...rest){original(session,action,...rest);if(action==='task.requested'){injected=true;fs.unlinkSync(guard);}};
 exception(()=>a.store.command(a.session,taskCommand()),'storage_not_initialized');assert.equal(injected,true);assert.equal(a.store.db.isOpen,false,'affected cached handle is drained/closed after rollback');
 const db=new DatabaseSync(path.join(a.root,'hq.sqlite'),{readOnly:true});try{assert.deepEqual(rows(db),before);}finally{db.close();}
 assert.equal(fs.existsSync(guard),false,'refusal does not recreate guard');
});

test('security: adopted second-seat enrollment requires exact current cookie and one-use local permit together',t=>{
 const box=sandbox(t),f=legacyFixture(box),a=enroll(box,f,true),otherToken=f.sessions[1].token,otherSession=a.store.getSession(otherToken);assert.ok(otherSession,'original second seat is healthy');
 exception(()=>a.store.access.stage({purpose:'enroll'},otherSession),'proof_invalid');
 const inspected=inspectEnrollment({root:a.root,token:otherToken}),issued=issueEnrollmentPermit({root:a.root,token:otherToken,confirmation:inspected.fingerprint});
 exception(()=>a.store.access.stage({purpose:'enroll',permit:issued.permit}),'session_required');
 exception(()=>a.store.access.stage({purpose:'enroll',permit:issued.permit},a.session),'proof_invalid');
 const stage=a.store.access.stage({purpose:'enroll',permit:issued.permit},otherSession),done=confirm(a.store,stage);
 assert.equal(done.session.workspaceId,otherSession.workspaceId);assert.equal(done.session.actorId,otherSession.actorId);assert.equal(authenticationMethod(a.store,'enroll',otherSession.workspaceId),'session-csrf-and-local-permit');
 assert.ok(a.store.getSession(a.token),'enrolling second seat cannot revoke first seat');assert.equal(Boolean(a.store.getSession(otherToken)),false);
 const current=a.store.getSession(done.session.token);exception(()=>a.store.access.stage({purpose:'enroll',permit:issued.permit},current),'proof_invalid');
});

function future(milliseconds,fn){const OriginalDate=globalThis.Date;class TestDate extends OriginalDate{constructor(...args){super(...(args.length?args:[OriginalDate.now()+milliseconds]));}static now(){return OriginalDate.now()+milliseconds;}}globalThis.Date=TestDate;try{return fn();}finally{globalThis.Date=OriginalDate;}}

test('security: expired saved-factor stage consumes only the stage and leaves old factor and session usable',t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box)),stage=recovery(a.store,a.credential);
 const {receipt}=future(301000,()=>a.store.access.receipt({operationId:stage.operationId,operationProof:stage.operationProof}));assert.equal(receipt.state,'expired');
 exception(()=>confirm(a.store,stage),'operation_conflict');assert.ok(a.store.getSession(a.token));
 const fresh=recovery(a.store,a.credential),done=confirm(a.store,fresh);assert.ok(a.store.getSession(done.session.token));const c=a.store.access.challenge();future(301000,()=>exception(()=>a.store.access.stage({purpose:'recover',challenge:c.challenge,credential:fresh.credential},undefined,c.browserToken),'proof_invalid'));assert.ok(a.store.getSession(done.session.token),'expired challenge cannot revoke the healthy session');
});

test('security: truly concurrent worker confirmations produce one session and one committed transition',{timeout:120000},async t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box)),stage=recovery(a.store,a.credential),barrier=new SharedArrayBuffer(4),signal=new Int32Array(barrier),workers=[],ready=[];
 const source=`const {parentPort,workerData}=require('node:worker_threads');(async()=>{const {openAccessStore}=await import(workerData.module);const store=openAccessStore(workerData.root);parentPort.postMessage({ready:true});Atomics.wait(new Int32Array(workerData.barrier),0,0);try{const result=store.access.confirm(workerData.body);parentPort.postMessage({done:true,ok:true,session:Boolean(result.session),state:result.receipt.state});}catch(error){parentPort.postMessage({done:true,ok:false,code:error.code||'native_error'});}finally{store.close();}})().catch(error=>parentPort.postMessage({done:true,ok:false,code:error.code||'native_error'}));`;
 const completed=[];for(let i=0;i<2;i++){const worker=new Worker(source,{eval:true,workerData:{module:pathToFileURL(path.join(projectRoot,'scripts/hq-access/index.mjs')).href,root:a.root,barrier,body:{operationId:stage.operationId,operationProof:stage.operationProof,credential:stage.credential}},stdout:true,stderr:true});workers.push(worker);let makeReady,failReady;ready.push(new Promise((resolve,reject)=>{makeReady=resolve;failReady=reject;}));completed.push(new Promise((resolve,reject)=>{worker.on('message',message=>{if(message.ready)makeReady();if(message.done){if(!message.ok)failReady(new Error('worker refused before or during concurrent confirmation'));resolve(message);}});worker.on('error',error=>{failReady(error);reject(error);});worker.on('exit',code=>{if(code!==0)reject(new Error('synthetic worker exited unexpectedly'));});}));worker.stdout.resume();worker.stderr.resume();}
 t.after(async()=>{await Promise.all(workers.map(w=>w.terminate()));});await Promise.all(ready);Atomics.store(signal,0,1);Atomics.notify(signal,0,2);const outcomes=await Promise.all(completed);
 assert.equal(outcomes.filter(x=>x.ok&&x.session).length,1,'exactly one simultaneous confirmer receives an ordinary session');
 assert.equal(a.store.db.prepare("SELECT count(*) AS n FROM events WHERE action='access.recover.committed' AND target_id=?").get(stage.operationId).n,1);
 assert.equal(a.store.db.prepare('SELECT count(*) AS n FROM sessions WHERE workspace_id=?').get(a.session.workspaceId).n,1);
 const replay=confirm(a.store,stage);assert.equal(Boolean(replay.session),false);assert.equal(replay.receipt.state,'committed');
 const fresh=recovery(a.store,stage.credential),done=confirm(a.store,fresh);assert.ok(a.store.getSession(done.session.token));
});

function nativeFileAcl(location,unsafe=false){const encoded=Buffer.from(location,'utf8').toString('base64'),script=`$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'));$ErrorActionPreference='Stop';$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a=New-Object Security.AccessControl.FileSecurity;$a.SetOwner($sid);$a.SetAccessRuleProtection($true,$false);$r=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow');$a.AddAccessRule($r);${unsafe?"$world=New-Object Security.Principal.SecurityIdentifier('S-1-1-0');$x=New-Object Security.AccessControl.FileSystemAccessRule($world,'Read','Allow');$a.AddAccessRule($x);":''}[IO.File]::SetAccessControl($p,$a);`;execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:'pipe',timeout:10000});}

test('security: explicit insecure guard and database file ACLs refuse even under an owner-only directory',t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box));assert.ok(a.store.getSession(a.token));a.store.close();
 for(const name of ['ACCESS-GUARD.json','hq.sqlite']){const file=path.join(a.root,name);nativeFileAcl(file,true);try{exception(()=>openAccessStore(a.root),'storage_unsafe');}finally{nativeFileAcl(file);}const healthy=box.open(openAccessStore(a.root));assert.ok(healthy.getSession(a.token));healthy.close();}
 const journal=path.join(a.root,'ACCESS-DIAGNOSTICS.jsonl');fs.writeFileSync(journal,'x'.repeat(65535));const nearCap=sha(fs.readFileSync(journal));exception(()=>recordDiagnostic(a.store.accessIdentity,'storage_missing'),'diagnostic_unavailable');assert.equal(fs.statSync(journal).size,65535);assert.equal(sha(fs.readFileSync(journal)),nearCap,'no line can cross the exact journal budget');fs.writeFileSync(journal,'safe diagnostic marker\n');const before=sha(fs.readFileSync(journal));nativeFileAcl(journal,true);try{exception(()=>recordDiagnostic(a.store.accessIdentity,'storage_missing'),'diagnostic_unavailable');}finally{nativeFileAcl(journal);}assert.equal(sha(fs.readFileSync(journal)),before,'unsafe explicit journal ACL refuses before append');
});

test('security: lost signout or revoke responses replay receipts without clearing or revoking a newer session',async t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box));let token=a.token,credential=a.credential;
 for(const purpose of ['signout','revoke']){
  const current=a.store.getSession(token),body={operationId:randomUUID(),operationProof:randomBytes(32).toString('base64url'),...(purpose==='revoke'?{credential,confirmed:true}:{})},initial=await request(a.store,'/api/hq/access/'+purpose,{body,token,csrf:current.csrfToken});assert.equal(initial.status,200);assert.equal(authenticationMethod(a.store,purpose,a.session.workspaceId),purpose==='signout'?'session-and-csrf':'session-csrf-and-recovery-factor');assert.ok(initial.headers.get('set-cookie')?.includes('Max-Age=0'));assert.equal(Boolean(a.store.getSession(token)),false);
  const stage=recovery(a.store,credential),done=confirm(a.store,stage);token=done.session.token;credential=stage.credential;const fresh=a.store.getSession(token);
  const replay=await request(a.store,'/api/hq/access/'+purpose,{body,token,csrf:fresh.csrfToken});assert.equal(replay.status,200);assert.equal(replay.headers.has('set-cookie'),false,'old committed operation must not clear a newer cookie');assert.ok(a.store.getSession(token),'old committed operation must not revoke a newer server session');
  if(purpose==='revoke')await httpCode(await request(a.store,'/api/hq/access/revoke',{body:{...body,credential},token,csrf:fresh.csrfToken}),'operation_conflict');
 }
});

test('security: actual running Windows database rename either denies replacement or closes the orphaned cached handle',t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box));assert.ok(a.store.query(a.session,'overview',{}));const file=path.join(a.root,'hq.sqlite'),held=path.join(a.root,'held.sqlite');let locked=false;
 try{fs.renameSync(file,held);}catch(error){assert.ok(['EPERM','EBUSY','EACCES'].includes(error.code),'only a native Windows sharing denial is an acceptable unperformed rename');locked=true;}
 if(locked){assert.ok(a.store.query(a.session,'overview',{}),'OS denied rename; original instance remains authoritative');return;}
 exception(()=>a.store.query(a.session,'overview',{}),'storage_missing');assert.equal(a.store.db.isOpen,false,'renamed open database cannot remain authoritative');assert.equal(fs.existsSync(file),false);assert.equal(fs.existsSync(held),true);
});

test('security: same-inode native overwrite is detected instead of serving stale cached SQLite pages',t=>{
 const box=sandbox(t),a=enroll(box,legacyFixture(box,'a')),b=enroll(box,legacyFixture(box,'b'));assert.ok(a.store.query(a.session,'overview',{}));a.store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');b.store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');const file=path.join(a.root,'hq.sqlite'),before=fs.statSync(file,{bigint:true}).ino,foreign=fs.readFileSync(path.join(b.root,'hq.sqlite')),fd=fs.openSync(file,'r+');
 try{fs.writeSync(fd,foreign,0,foreign.length,0);fs.ftruncateSync(fd,foreign.length);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 assert.equal(fs.statSync(file,{bigint:true}).ino,before,'actual overwrite retains exact native file identity');
 exception(()=>a.store.query(a.session,'overview',{}),'storage_identity_changed');assert.equal(a.store.db.isOpen,false);
});

test('security: early partial initialization and adoption stay blocked until exact owned-operation resume with original proof',t=>{
 const box=sandbox(t),fresh=markedRoot(box,'partial-fresh'),originalOpen=fs.openSync;let faulted=false;
 fs.openSync=function(file,flags,...rest){if(!faulted&&file===path.join(fresh.root,'hq.sqlite')&&flags==='wx'){faulted=true;const error=new Error('independent synthetic early init fault');error.code='EIO';throw error;}return originalOpen.call(fs,file,flags,...rest);};
 try{assert.throws(()=>initializeAccess({root:fresh.root,confirmation:fresh.fixtureId}));}finally{fs.openSync=originalOpen;}
 assert.equal(faulted,true);assert.equal(fs.existsSync(path.join(fresh.root,'hq.sqlite')),false);assert.equal(fs.existsSync(path.join(fresh.root,'ACCESS-GUARD.json')),false);
 exception(()=>openAccessStore(fresh.root),'storage_not_initialized');const intent=JSON.parse(fs.readFileSync(path.join(fresh.root,'ACCESS-INTENT.json'),'utf8'));
 exception(()=>resumeAccess({root:fresh.root,confirmation:fresh.fixtureId,operationId:randomUUID()}),'proof_invalid');
 const resumed=resumeAccess({root:fresh.root,confirmation:fresh.fixtureId,operationId:intent.operationId}),store=box.open(openAccessStore(fresh.root));assert.equal(resumed.operationId,intent.operationId);assert.equal(store.db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
 const challenge=store.access.challenge(),stage=store.access.stage({purpose:'enroll',challenge:challenge.challenge,permit:resumed.bootstrapProof},undefined,challenge.browserToken),done=confirm(store,stage);assert.equal(done.session.workspaceId,intent.workspaceId);assert.equal(done.session.actorId,intent.actorId);
 const legacy=legacyFixture(box,'partial-legacy'),originalExec=DatabaseSync.prototype.exec;faulted=false;DatabaseSync.prototype.exec=function(sql,...rest){if(!faulted&&sql===ACCESS_SCHEMA_SQL){faulted=true;const error=new Error('independent synthetic early adoption fault');error.code='EIO';throw error;}return originalExec.call(this,sql,...rest);};
 try{assert.throws(()=>adoptAccess({root:legacy.root,confirmation:legacy.fixtureId,legacyToken:legacy.sessions[0].token,serverStopped:true}));}finally{DatabaseSync.prototype.exec=originalExec;}
 assert.equal(faulted,true);assert.equal(fs.existsSync(path.join(legacy.root,'ACCESS-GUARD.json')),false);const legacyIntent=JSON.parse(fs.readFileSync(path.join(legacy.root,'ACCESS-INTENT.json'),'utf8'));
 exception(()=>resumeAccess({root:legacy.root,confirmation:legacy.fixtureId,operationId:legacyIntent.operationId,legacyToken:randomBytes(32).toString('hex')}),'proof_invalid');
 const adopted=resumeAccess({root:legacy.root,confirmation:legacy.fixtureId,operationId:legacyIntent.operationId,legacyToken:legacy.sessions[0].token}),adoptedStore=box.open(openAccessStore(legacy.root));assert.equal(adopted.workspaceId,legacy.sessions[0].workspaceId);assert.equal(adopted.actorId,legacy.sessions[0].actorId);assert.equal(Boolean(adoptedStore.getSession(legacy.sessions[0].token)),false,'pending adoption cannot become ordinary authentication');
 const after=rows(adoptedStore.db);for(const table of ['workspaces','records','record_versions','commands'])assert.deepEqual(after[table],legacy.before[table]);assert.deepEqual(after.events.slice(0,legacy.before.events.length),legacy.before.events);
});
