import {HqError,hash,canonical} from './local-boundary.mjs';
export const ACCESS_SCHEMA_SQL='CREATE TABLE hq_access_state(id INTEGER PRIMARY KEY CHECK(id=1),schema_version INTEGER NOT NULL CHECK(schema_version=1),state TEXT NOT NULL CHECK(json_valid(state)))';
export const ACCESS_SCHEMA_HASH=hash(ACCESS_SCHEMA_SQL);
export const accessUuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
export const accessHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>object(x)&&Object.keys(x).sort().join('|')===[...keys].sort().join('|');
const int=x=>Number.isSafeInteger(x)&&x>=0;
const physical=x=>typeof x==='string'&&/^\d+$/.test(x);
const map=(x,limit=1024)=>object(x)&&Object.keys(x).length<=limit&&Object.keys(x).every(k=>!['__proto__','prototype','constructor'].includes(k));
export function validateAccessState(s){
  const bad=()=>{throw new HqError('storage_guard_invalid',503);};
  if(!exact(s,['version','instanceId','fixtureId','root','database','initialization','seats','sessions','permits','operations','challenges','attempts','receipts'])||s.version!==1||!accessUuid(s.instanceId)||!accessUuid(s.fixtureId))bad();
  if(!exact(s.root,['path','owner','dev','ino'])||typeof s.root.path!=='string'||typeof s.root.owner!=='string'||!physical(s.root.dev)||!physical(s.root.ino)||!exact(s.database,['dev','ino'])||!physical(s.database.dev)||!physical(s.database.ino))bad();
  if(!exact(s.initialization,['operationId','status','workspaceId','actorId','proofHash','expiresAt'])||!accessUuid(s.initialization.operationId)||!['pending','active'].includes(s.initialization.status)||!accessUuid(s.initialization.workspaceId)||!accessUuid(s.initialization.actorId)||!accessHash(s.initialization.proofHash)||!int(s.initialization.expiresAt))bad();
  for(const key of ['seats','sessions','permits','operations','challenges','receipts'])if(!map(s[key]))bad();
  for(const [key,v] of Object.entries(s.seats))if(!accessUuid(key)||!exact(v,['actorId','generation','verifier'])||!accessUuid(v.actorId)||!int(v.generation)||!(v.verifier===null||accessHash(v.verifier)))bad();
  for(const [key,v] of Object.entries(s.sessions))if(!accessHash(key)||!exact(v,['workspaceId','generation'])||!accessUuid(v.workspaceId)||!int(v.generation))bad();
  for(const [key,v] of Object.entries(s.permits))if(!accessHash(key)||!exact(v,['workspaceId','actorId','generation','expiresAt','purpose'])||!accessUuid(v.workspaceId)||!accessUuid(v.actorId)||!int(v.generation)||!int(v.expiresAt)||v.purpose!=='enroll')bad();
  for(const [key,v] of Object.entries(s.challenges))if(!accessHash(key)||!exact(v,['expiresAt','attempts','used','browserHash'])||!int(v.expiresAt)||!int(v.attempts)||v.attempts>5||typeof v.used!=='boolean'||!accessHash(v.browserHash))bad();
  for(const [key,v] of Object.entries(s.operations))if(!accessUuid(key)||!exact(v,['purpose','workspaceId','actorId','generation','proofHash','nextVerifier','expiresAt','sessionHash','permitHash','attempts'])||!['enroll','recover','rotate'].includes(v.purpose)||!accessUuid(v.workspaceId)||!accessUuid(v.actorId)||!int(v.generation)||!accessHash(v.proofHash)||!accessHash(v.nextVerifier)||!int(v.expiresAt)||!int(v.attempts)||v.attempts>5||!(v.sessionHash===null||accessHash(v.sessionHash))||!(v.permitHash===null||accessHash(v.permitHash)))bad();
  if(!Array.isArray(s.attempts)||s.attempts.length>30||s.attempts.some(x=>!int(x)))bad();
  for(const [key,v] of Object.entries(s.receipts))if(!accessUuid(key)||!exact(v,['operationId','purpose','state','at','priorGeneration','generation','proofHash','materialHash','requestHash'])||v.operationId!==key||!['enroll','recover','rotate','signout','revoke'].includes(v.purpose)||!['committed','cancelled','expired'].includes(v.state)||typeof v.at!=='string'||!Number.isFinite(Date.parse(v.at))||!int(v.priorGeneration)||!int(v.generation)||!accessHash(v.proofHash)||!accessHash(v.materialHash)||!accessHash(v.requestHash))bad();
  return s;
}
export function readAccessState(db){const rows=db.prepare('SELECT id,schema_version,state FROM hq_access_state').all();if(rows.length!==1||rows[0].id!==1||rows[0].schema_version!==1||typeof rows[0].state!=='string'||Buffer.byteLength(rows[0].state)>1024*1024)throw new HqError('storage_guard_invalid',503);let state;try{state=JSON.parse(rows[0].state);}catch{throw new HqError('storage_guard_invalid',503);}return validateAccessState(state);}
export function writeAccessState(db,state){validateAccessState(state);const bytes=canonical(state);if(Buffer.byteLength(bytes)>1024*1024)throw new HqError('storage_guard_invalid',503);db.prepare('UPDATE hq_access_state SET state=? WHERE id=1 AND schema_version=1').run(bytes);}
