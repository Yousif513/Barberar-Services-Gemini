import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {accessFixture,prepare,enroll,request,newProof,assertBusinessUnchanged,assertNoStoredSecrets} from './hq-access-independent-fixture.mjs';
import {inspectEnrollment,issueEnrollmentPermit,openAccessStore} from '../../scripts/hq-access/index.mjs';
import {handleHq} from '../src/lib/hq/server/handler.mjs';

const refusal=async(response,status,code)=>{assert.equal(response.status,status);const value=await response.json();assert.equal(value.ok,false);assert.equal(value.error.code,code);return value;};
const task=()=>({commandId:randomUUID(),type:'task.create',payload:{title:'Synthetic denied queued command',request:'Independent QA',outcome:'No write',acceptance:'No new record',limits:'Owned fixture only'}});

test('SEAT-01 SEAT-03 SEAT-06: independent rich history survives enrollment, lost-cookie commit, scoped receipt and reconnect',async t=>{
 const f=accessFixture(t);assert.equal(f.store.access.status(null).state,'bootstrap_required');
 assert.equal(f.store.getSession(f.seat.token),null);assert.equal(f.store.getSession(f.other.token),null);
 await refusal(await request(f,'state?view=overview'),401,'access_required');
 const {op:first,result,session}=enroll(f);assert.equal(result.session.workspaceId,f.seat.workspaceId);assert.equal(result.session.actorId,f.seat.actorId);
 assert.equal(f.store.query(session,'task',{id:f.taskId}).task.id,f.taskId);
 assertBusinessUnchanged(f);
 const recovery=prepare(f,'recover',first.credential);assert.ok(f.store.getSession(result.session.token),'staging keeps existing session');
 const committed=await request(f,'access/confirm',{body:{operationId:recovery.operationId,operationProof:recovery.operationProof,credential:recovery.credential,returnTo:`/hq/tasks/${f.taskId}`}});
 assert.equal(committed.status,200);const value=await committed.json();assert.equal(value.session.workspaceId,f.seat.workspaceId);assert.equal(value.session.actorId,f.seat.actorId);
 const cookie=committed.headers.get('set-cookie');assert.equal(cookie.includes('HttpOnly; SameSite=Strict'),true);assert.equal(cookie.includes('Path=/api/hq'),true);
 const token=cookie.match(/^volabi_session=([a-f0-9]{64});/)[1];f.secrets.push(token);
 // Deliberately discard that final cookie: only an operation proof can inspect its receipt.
 await refusal(await request(f,'state?view=overview'),401,'access_required');
 await refusal(await request(f,'access/receipt',{body:{operationId:recovery.operationId,operationProof:newProof()}}),400,'proof_invalid');
 const receipt=await request(f,'access/receipt',{body:{operationId:recovery.operationId,operationProof:recovery.operationProof}});assert.equal(receipt.status,200);assert.equal((await receipt.json()).receipt.state,'committed');
 const replay=await request(f,'access/confirm',{body:{operationId:recovery.operationId,operationProof:recovery.operationProof,credential:recovery.credential,returnTo:`/hq/tasks/${f.taskId}`}});assert.equal(replay.status,200);assert.equal(replay.headers.get('set-cookie'),null);assert.equal((await replay.json()).session,undefined);
 const next=prepare(f,'recover',recovery.credential),reconnected=f.store.access.confirm(next);f.secrets.push(reconnected.session.token);
 const recovered=f.store.getSession(reconnected.session.token);assert.equal(recovered.workspaceId,f.seat.workspaceId);assert.equal(recovered.actorId,f.seat.actorId);
 assert.equal(f.store.query(recovered,'meeting',{id:f.meetingId}).meeting.minutesStatus,'superseded');
 assert.equal(f.store.query(recovered,'project',{id:f.projectId}).project.status,'superseded');
 assertBusinessUnchanged(f);assertNoStoredSecrets(f);
});

test('SEAT-02 SEAT-05: HTTP wrong-seat, stale cookie/CSRF, direct details/receipts and forged claims refuse after healthy baselines',async t=>{
 const f=accessFixture(t),{op,result,session}=enroll(f),oldToken=result.session.token,oldCsrf=session.csrfToken;
 const own=await request(f,`state?view=task&id=${f.taskId}`,{token:oldToken});assert.equal(own.status,200);assert.equal((await own.json()).data.task.id,f.taskId);
 const commandId=f.taskEnvelope.commandId;assert.equal((await request(f,`commands/${commandId}`,{token:oldToken})).status,200);
 const neighbour=f.store.getSession(f.other.token);assert.equal(f.store.query(neighbour,'source',{id:f.secondary}).source.id,f.secondary);
 await refusal(await request(f,`state?view=source&id=${f.secondary}`,{token:oldToken}),404,'not_found');
 await refusal(await request(f,`state?view=task&id=${f.taskId}`,{token:f.other.token}),404,'not_found');
 await refusal(await request(f,`commands/${commandId}`,{token:f.other.token}),404,'not_found');
 const rotated=prepare(f,'rotate',op.credential,session),next=f.store.access.confirm(rotated);f.secrets.push(next.session.token);
 for(const route of ['state?view=overview',`state?view=task&id=${f.taskId}`,`commands/${commandId}`])await refusal(await request(f,route,{token:oldToken}),401,'access_required');
 await refusal(await request(f,'commands',{token:oldToken,csrf:oldCsrf,body:task()}),401,'access_required');
 await refusal(await request(f,'commands',{token:next.session.token,csrf:oldCsrf,body:task()}),403,'csrf_failed');
 assert.equal((await request(f,`state?view=task&id=${f.taskId}`,{token:next.session.token})).status,200);
 await refusal(await request(f,'access/stage',{token:next.session.token,csrf:next.session.csrfToken,body:{purpose:'rotate',credential:rotated.credential,workspaceId:f.other.workspaceId}}),400,'invalid_input');
 assertBusinessUnchanged(f);assertNoStoredSecrets(f);
});

test('SEAT-02 SEAT-05: independent queued write rechecks authority; neighbour enrollment requires its matching session and local permit',async t=>{
 const f=accessFixture(t,{rich:false}),{op,result,session}=enroll(f),other=f.store.getSession(f.other.token);
 assert.equal(f.store.query(session,'source',{id:f.sourceId}).source.id,f.sourceId,'healthy A baseline');assert.equal(f.store.query(other,'source',{id:f.secondary}).source.id,f.secondary,'healthy B baseline');
 assert.throws(()=>f.store.access.stage({purpose:'enroll'},other),e=>e.code==='proof_invalid');
 const {fingerprint}=inspectEnrollment({root:f.fixtureRoot,token:f.other.token});const permit=issueEnrollmentPermit({root:f.fixtureRoot,token:f.other.token,confirmation:fingerprint});f.secrets.push(permit.permit);
 await refusal(await request(f,'access/stage',{body:{purpose:'enroll',permit:permit.permit}}),401,'session_required');
 await refusal(await request(f,'access/stage',{token:result.session.token,csrf:session.csrfToken,body:{purpose:'enroll',permit:permit.permit}}),400,'proof_invalid');
 const staged=f.store.access.stage({purpose:'enroll',permit:permit.permit},other);f.secrets.push(staged.credential,staged.operationProof);const enrolledOther=f.store.access.confirm(staged);f.secrets.push(enrolledOther.session.token);
 const transaction=f.store.transaction.bind(f.store),retained=f.store.getSession(result.session.token);let entered=false;
 f.store.transaction=fn=>{f.store.transaction=transaction;entered=true;f.store.access.revoke({operationId:randomUUID(),operationProof:newProof(),credential:op.credential,confirmed:true},retained);return transaction(fn);};
 assert.throws(()=>f.store.command(retained,task()),e=>e.code==='session_required');assert.equal(entered,true,'revocation occurred after command preflight and before transaction');
 assert.equal(f.store.getSession(result.session.token),null);assert.ok(f.store.getSession(enrolledOther.session.token));
 // B has legitimately enrolled: original B cookie is revoked, but its business rows stay exact.
 const after=f.store.db.prepare('SELECT * FROM records ORDER BY workspace_id,kind,id').all().map(x=>({...x}));assert.deepEqual(after,f.before.records);
 assert.deepEqual(f.store.db.prepare('SELECT * FROM commands ORDER BY workspace_id,id').all().map(x=>({...x})),f.before.commands);
 assertNoStoredSecrets(f);
});

test('DB-01: healthy guarded baseline then missing database, missing root and absent parent never bootstrap storage or anonymous workspaces',async t=>{
 const f=accessFixture(t,{rich:false});enroll(f);assert.equal((await request(f,'access/status')).status,200);f.close();
 const file=path.join(f.fixtureRoot,'hq.sqlite'),held=path.join(f.fixtureRoot,'WITHHELD-DB');fs.renameSync(file,held);
 const env={VOLABI_LOCAL_MODE:'enabled',VOLABI_ACCESS_MODE:'synthetic-guarded',VOLABI_ACCESS_ROOT:f.fixtureRoot};
 for(const route of ['access/status','session','state?view=overview','commands']){
  const post=route==='session'||route==='commands';const r=await handleHq(new Request(`http://localhost:3198/api/hq/${route}`,{method:post?'POST':'GET',headers:{host:'localhost:3198',origin:'http://localhost:3198',...(post?{'content-type':'application/json'}:{})},...(post?{body:'{}'}:{})}),{env});
  assert.equal(r.status,503);assert.equal((await r.json()).error.code,'storage_missing');assert.equal(fs.existsSync(file),false);
 }
 const absent=path.join(f.root,'never-created','instance');assert.throws(()=>openAccessStore(absent),e=>e.code.startsWith('storage_'));assert.equal(fs.existsSync(path.dirname(absent)),false);
 fs.renameSync(held,file);f.store=openAccessStore(f.fixtureRoot);f.closed=false;assertBusinessUnchanged(f);
});