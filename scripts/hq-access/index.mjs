import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {HqStore,applyHqSchema} from '../../web_platform/src/lib/hq/server/local-store.mjs';
import {HqError,hash,canonical} from '../../web_platform/src/lib/hq/server/local-boundary.mjs';
import {ACCESS_SCHEMA_SQL,readAccessState,writeAccessState,accessUuid} from '../../web_platform/src/lib/hq/server/access-schema.mjs';
import {checkedRoot,accessFile,openExistingDatabase,publishGuard,validateOfflineAccessFiles} from '../../web_platform/src/lib/hq/server/access-storage.mjs';
import {validateSchema,validateFixture} from '../hq-recovery/schema.mjs';
export {ACCESS_SCHEMA_SQL} from '../../web_platform/src/lib/hq/server/access-schema.mjs';
const secret=()=>randomBytes(32).toString('base64url');
const proofHash=value=>hash(`volabi-access-proof:v1:${value}`);
const refuse=(code,status=400)=>{throw new HqError(code,status);};
const id=stat=>({dev:String(stat.dev),ino:String(stat.ino)});
const when=()=>new Date().toISOString();
function confirmFixture(marker,confirmation){if(confirmation!==marker.fixtureId)refuse('confirmation_required');}
function writeNew(file,value){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,canonical(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
export function openAccessStore(root,options={}){return new HqStore({...options,accessRoot:root});}
export function accessFingerprint(state,workspaceId){return hash(canonical({instanceId:state.instanceId,workspaceId,actorId:state.seats[workspaceId]?.actorId,generation:state.seats[workspaceId]?.generation}));}
function pendingState(owned,marker,db,workspaceId,actorId,operationId,bootstrapProof,instanceId=randomUUID()){
  const seats={},sessions={};for(const w of db.prepare('SELECT id,actor_id FROM workspaces').all())seats[w.id]={actorId:w.actor_id,generation:0,verifier:null};
  for(const s of db.prepare('SELECT token_hash,workspace_id FROM sessions').all())sessions[s.token_hash]={workspaceId:s.workspace_id,generation:0};
  return {version:1,instanceId,fixtureId:marker.fixtureId,root:owned,database:id(fs.statSync(accessFile(owned.path),{bigint:true})),initialization:{operationId,status:'pending',workspaceId,actorId,proofHash:proofHash(bootstrapProof),expiresAt:Date.now()+300000},seats,sessions,permits:{},operations:{},challenges:{},attempts:[],receipts:{}};
}
function responseFor(state,bootstrapProof){const i=state.initialization;return {operationId:i.operationId,instanceId:state.instanceId,workspaceId:i.workspaceId,actorId:i.actorId,bootstrapProof,expiresAt:new Date(i.expiresAt).toISOString(),fingerprint:accessFingerprint(state,i.workspaceId)};}
function auditIntent(db,state,purpose){const i=state.initialization;db.prepare('INSERT INTO events(id,workspace_id,action,target_type,target_id,actor_id,command_id,at,details) VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),i.workspaceId,`access.${purpose}.pending`,'access',i.operationId,i.actorId,null,when(),canonical({operationId:i.operationId,priorGeneration:0,generation:0,authenticationMethod:purpose==='adopt'?'legacy-session-and-local-operator':'explicit-local-initializer',reason:'Explicit owned synthetic instance; saved-factor confirmation required before ordinary access.',outcome:'pending'}));}
function newIntent(owned,marker,purpose,workspaceId=randomUUID(),actorId=randomUUID()){return {format:'volabi-access-intent-1',operationId:randomUUID(),fixtureId:marker.fixtureId,purpose,workspaceId,actorId,instanceId:randomUUID(),root:owned,database:fs.existsSync(accessFile(owned.path))?id(fs.statSync(accessFile(owned.path),{bigint:true})):null};}
function updateIntent(root,intent){const temporary=path.join(root,`ACCESS-INTENT-${randomUUID()}.tmp`);writeNew(temporary,intent);fs.renameSync(temporary,path.join(root,'ACCESS-INTENT.json'));}
function expectedFixture(marker,intent){return {format:'volabi-synthetic-fixture-1',fixtureId:marker.fixtureId,workspaces:[{id:intent.workspaceId,actorId:intent.actorId}]};}
function ensureFixture(root,marker,intent){const file=path.join(root,'fixture.json'),expected=expectedFixture(marker,intent);if(fs.existsSync(file)){if(canonical(JSON.parse(fs.readFileSync(file,'utf8')))!==canonical(expected))refuse('fixture_marker_invalid');}else writeNew(file,expected);}
function assertEmptyPartialSchema(db){
  const reference=new DatabaseSync(':memory:');try{applyHqSchema(reference);const normalize=x=>x.replace(/\bIF NOT EXISTS\s+/gi,'').replace(/\s+/g,' ').replace(/\s*([(),;])\s*/g,'$1').trim().replace(/;$/,'');const expected=new Map(reference.prepare("SELECT name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all().map(x=>[x.name,normalize(x.sql)]));
    if(db.prepare('PRAGMA application_id').get().application_id!==0||db.prepare('PRAGMA user_version').get().user_version!==0)refuse('resume_refused');
    for(const row of db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all()){if(expected.get(row.name)!==normalize(row.sql||''))refuse('unsupported_schema');if(row.type==='table'&&db.prepare(`SELECT count(*) AS n FROM ${row.name}`).get().n!==0)refuse('resume_refused');}
  }finally{reference.close();}
}
function finishFresh(owned,marker,intent,bootstrapProof){
  const root=owned.path,file=accessFile(root);if(fs.existsSync(path.join(root,'ACCESS-GUARD.json'))||fs.existsSync(path.join(root,'INERT-RESTORE.json')))refuse('resume_refused');
  validateOfflineAccessFiles(owned);
  if(!fs.existsSync(file)){if(intent.database!==null)refuse('storage_missing');const fd=fs.openSync(file,'wx',0o600);fs.closeSync(fd);}
  const actual=id(fs.statSync(file,{bigint:true}));if(intent.database!==null&&canonical(intent.database)!==canonical(actual))refuse('storage_identity_changed');
  if(intent.database===null){if(fs.statSync(file).size!==0)refuse('resume_refused');intent.database=actual;updateIntent(root,intent);}
  const uri=pathToFileURL(file);uri.searchParams.set('mode','rw');const db=new DatabaseSync(uri.href);try{assertEmptyPartialSchema(db);applyHqSchema(db);db.exec('BEGIN IMMEDIATE');try{
      db.prepare('INSERT INTO workspaces VALUES(?,?,?)').run(intent.workspaceId,intent.actorId,when());const proof={id:randomUUID(),fixtureId:marker.fixtureId,workspaceId:intent.workspaceId,actorId:intent.actorId,syntheticOnly:true},body=canonical(proof);db.prepare('INSERT INTO records VALUES(?,?,?,?,?)').run(intent.workspaceId,'recovery-fixture-proof',proof.id,1,body);db.prepare('INSERT INTO record_versions VALUES(?,?,?,?,?,?)').run(intent.workspaceId,'recovery-fixture-proof',proof.id,1,body,when());
      db.exec(ACCESS_SCHEMA_SQL);const state=pendingState(owned,marker,db,intent.workspaceId,intent.actorId,intent.operationId,bootstrapProof,intent.instanceId);db.prepare('INSERT INTO hq_access_state VALUES(1,1,?)').run(canonical(state));auditIntent(db,state,'initialize');db.exec('COMMIT');ensureFixture(root,marker,intent);publishGuard(root,state);return responseFor(state,bootstrapProof);
    }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
  }finally{db.close();}
}
export function initializeAccess({root,confirmation}={}){
  const {owned,marker}=checkedRoot(root);confirmFixture(marker,confirmation);
  if(fs.readdirSync(root).some(x=>x!=='ACCESS-SYNTHETIC.json'))refuse('target_not_empty');
  const intent=newIntent(owned,marker,'initialize');writeNew(path.join(root,'ACCESS-INTENT.json'),intent);return finishFresh(owned,marker,intent,secret());
}
export function adoptAccess({root,confirmation,legacyToken,serverStopped}={}){
  const {owned,marker}=checkedRoot(root);confirmFixture(marker,confirmation);if(serverStopped!==true)refuse('offline_confirmation_required');
  validateOfflineAccessFiles(owned);
  if(fs.existsSync(path.join(root,'ACCESS-GUARD.json'))||fs.existsSync(path.join(root,'ACCESS-INTENT.json')))refuse('already_initialized');
  const db=openExistingDatabase(accessFile(root));try{
    if(db.prepare("SELECT 1 FROM sqlite_schema WHERE name='hq_access_state'").get())refuse('already_initialized');validateSchema(db);const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixture.json'),'utf8'));validateFixture(db,fixture);if(fixture.fixtureId!==marker.fixtureId)refuse('fixture_marker_invalid');
    if(typeof legacyToken!=='string'||!(/^[a-f0-9]{64}$/).test(legacyToken))refuse('proof_invalid');const seat=db.prepare('SELECT s.workspace_id,s.actor_id FROM sessions s JOIN workspaces w ON w.id=s.workspace_id AND w.actor_id=s.actor_id WHERE s.token_hash=? AND s.expires_at>?').get(hash(legacyToken),when());if(!seat)refuse('proof_invalid');
    const intent=newIntent(owned,marker,'adopt',seat.workspace_id,seat.actor_id),bootstrapProof=secret();writeNew(path.join(root,'ACCESS-INTENT.json'),intent);
    db.exec('BEGIN IMMEDIATE');try{db.exec(ACCESS_SCHEMA_SQL);const state=pendingState(owned,marker,db,seat.workspace_id,seat.actor_id,intent.operationId,bootstrapProof,intent.instanceId);db.prepare('INSERT INTO hq_access_state VALUES(1,1,?)').run(canonical(state));auditIntent(db,state,'adopt');db.exec('COMMIT');publishGuard(root,state);return responseFor(state,bootstrapProof);}catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
  }finally{db.close();}
}
export function resumeAccess({root,confirmation,operationId,legacyToken}={}){
  const {owned,marker}=checkedRoot(root);confirmFixture(marker,confirmation);validateOfflineAccessFiles(owned);if(!accessUuid(operationId))refuse('proof_invalid');const intent=JSON.parse(fs.readFileSync(path.join(root,'ACCESS-INTENT.json'),'utf8'));if(intent.format!=='volabi-access-intent-1'||intent.operationId!==operationId||intent.fixtureId!==marker.fixtureId||!['initialize','adopt'].includes(intent.purpose)||!accessUuid(intent.workspaceId)||!accessUuid(intent.actorId)||!accessUuid(intent.instanceId)||canonical(intent.root)!==canonical(owned))refuse('proof_invalid');
  if(intent.purpose==='initialize'&&(!fs.existsSync(accessFile(root))||fs.statSync(accessFile(root)).size===0))return finishFresh(owned,marker,intent,secret());
  if(!fs.existsSync(accessFile(root)))refuse('storage_missing');
  const probe=openExistingDatabase(accessFile(root));let hasState;try{hasState=!!probe.prepare("SELECT 1 FROM sqlite_schema WHERE name='hq_access_state'").get();}finally{probe.close();}
  if(!hasState){if(intent.purpose==='initialize')return finishFresh(owned,marker,intent,secret());
    const db=openExistingDatabase(accessFile(root));try{validateSchema(db);validateFixture(db,JSON.parse(fs.readFileSync(path.join(root,'fixture.json'),'utf8')));if(canonical(intent.database)!==canonical(id(fs.statSync(accessFile(root),{bigint:true}))))refuse('storage_identity_changed');if(typeof legacyToken!=='string'||!/^[a-f0-9]{64}$/.test(legacyToken)||!db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND workspace_id=? AND actor_id=? AND expires_at>?').get(hash(legacyToken),intent.workspaceId,intent.actorId,when()))refuse('proof_invalid');const bootstrapProof=secret();db.exec('BEGIN IMMEDIATE');try{db.exec(ACCESS_SCHEMA_SQL);const state=pendingState(owned,marker,db,intent.workspaceId,intent.actorId,operationId,bootstrapProof,intent.instanceId);db.prepare('INSERT INTO hq_access_state VALUES(1,1,?)').run(canonical(state));auditIntent(db,state,'adopt');db.exec('COMMIT');publishGuard(root,state);return responseFor(state,bootstrapProof);}catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}}finally{db.close();}}
  const db=openExistingDatabase(accessFile(root));try{validateSchema(db);const state=readAccessState(db);if(state.initialization.operationId!==operationId||state.initialization.workspaceId!==intent.workspaceId||state.initialization.actorId!==intent.actorId||state.instanceId!==intent.instanceId||state.initialization.status!=='pending'||canonical(state.root)!==canonical(owned)||canonical(state.database)!==canonical(id(fs.statSync(accessFile(root),{bigint:true}))))refuse('resume_refused');if(intent.purpose==='initialize')ensureFixture(root,marker,intent);validateFixture(db,JSON.parse(fs.readFileSync(path.join(root,'fixture.json'),'utf8')));
    if(fs.existsSync(path.join(root,'ACCESS-GUARD.json'))){const checked=openAccessStore(root);checked.close();}
    const bootstrapProof=secret();db.exec('BEGIN IMMEDIATE');try{state.initialization.proofHash=proofHash(bootstrapProof);state.initialization.expiresAt=Date.now()+300000;state.operations={};writeAccessState(db,state);auditIntent(db,state,'resume');db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
    if(!fs.existsSync(path.join(root,'ACCESS-GUARD.json')))publishGuard(root,state);else {const check=openAccessStore(root);check.close();}return responseFor(state,bootstrapProof);
  }finally{db.close();}
}
export function issueEnrollmentPermit({root,confirmation,token}={}){
  const store=openAccessStore(root);try{const session=store.getSession(token);if(!session)refuse('proof_invalid');return store.access.mutate(state=>{const seat=state.seats[session.workspaceId],fingerprint=accessFingerprint(state,session.workspaceId);if(confirmation!==fingerprint)refuse('confirmation_required');if(seat.verifier)refuse('already_enrolled');const permit=secret(),expiresAt=Date.now()+300000;state.permits[proofHash(permit)]={workspaceId:session.workspaceId,actorId:session.actorId,generation:seat.generation,expiresAt,purpose:'enroll'};store.audit(session,'access.permit.issued','access',randomUUID(),null,{generation:seat.generation,authenticationMethod:'session-and-local-operator',reason:'Explicit exact-seat enrollment permit; five-minute single use.',outcome:'issued'});return {permit,expiresAt:new Date(expiresAt).toISOString(),fingerprint};});}finally{store.close();}
}
export function inspectEnrollment({root,token}={}){const store=openAccessStore(root);try{const session=store.getSession(token);if(!session)refuse('proof_invalid');return {fingerprint:accessFingerprint(readAccessState(store.db),session.workspaceId)};}finally{store.close();}}
export function inspectInitialization({root}={}){const {owned}=checkedRoot(root);validateOfflineAccessFiles(owned);const intent=JSON.parse(fs.readFileSync(path.join(root,'ACCESS-INTENT.json'),'utf8'));if(!['initialize','adopt'].includes(intent.purpose)||!accessUuid(intent.operationId))refuse('resume_refused');return {purpose:intent.purpose,operationId:intent.operationId};}
