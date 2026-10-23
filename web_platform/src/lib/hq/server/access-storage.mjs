import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {safeExisting,assertOwned,noLinksBatch,boundedRead} from '../../../../../scripts/hq-recovery/paths.mjs';
import {validateSchema,validateFixture} from '../../../../../scripts/hq-recovery/schema.mjs';
import {HqError,canonical,hash} from './local-boundary.mjs';
import {ACCESS_SCHEMA_SQL,readAccessState,accessUuid} from './access-schema.mjs';
const fail=code=>{throw new HqError(code,503);};
const parse=(file,max=65536)=>{try{return JSON.parse(boundedRead(file,max,{native:false}).toString('utf8'));}catch{fail('storage_guard_invalid');}};
const identity=st=>({dev:String(st.dev),ino:String(st.ino)});
const assertRoot=owned=>{const actual=fs.statSync(owned.path,{bigint:true});if(String(actual.dev)!==owned.dev||String(actual.ino)!==owned.ino)fail('storage_identity_changed');assertOwned({...owned,dev:Number(owned.dev),ino:Number(owned.ino)});};
function assertFileCustody(owned,files){
  for(const file of files){if(!fs.existsSync(file))continue;const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)fail('storage_unsafe');if(process.platform!=='win32'&&((st.mode&0o077)!==0||String(st.uid)!==owned.owner))fail('storage_unsafe');}
  if(process.platform==='win32'){
    const encoded=Buffer.from(JSON.stringify({files:files.filter(file=>fs.existsSync(file)),owner:owned.owner,root:owned.path}),'utf8').toString('base64');
    const script=`$ErrorActionPreference='Stop';$v=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')));foreach($p in @($v.root)+@($v.files)){$q=[IO.Path]::GetFullPath($p);while($q){if([IO.File]::Exists($q)-or [IO.Directory]::Exists($q)){if(([IO.File]::GetAttributes($q)-band [IO.FileAttributes]::ReparsePoint)-ne 0){exit 7}};$q=[IO.Path]::GetDirectoryName($q)};$a=if([IO.Directory]::Exists($p)){[IO.Directory]::GetAccessControl($p)}else{[IO.File]::GetAccessControl($p)};if($a.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $v.owner){exit 8};foreach($r in $a.Access){if($r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $v.owner -or $r.AccessControlType -ne 'Allow'){exit 9}};if($a.Access.Count -lt 1){exit 10}};'ok'`;
    try{const answer=execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',timeout:10000,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();if(answer!=='ok')fail('storage_unsafe');}catch{fail('storage_unsafe');}
  }
}
export const accessFile=root=>path.join(root,'hq.sqlite');
export function validateOfflineAccessFiles(owned){const root=owned.path,file=accessFile(root);assertFileCustody(owned,[path.join(root,'ACCESS-SYNTHETIC.json'),path.join(root,'ACCESS-INTENT.json'),path.join(root,'fixture.json'),path.join(root,'ACCESS-GUARD.json'),file,`${file}-wal`,`${file}-shm`]);}
export function checkedRoot(root){
  if(typeof root!=='string'||!path.isAbsolute(root))fail('storage_unsafe');
  try{const r=safeExisting(root);const marker=parse(path.join(r.path,'ACCESS-SYNTHETIC.json'));if(Object.keys(marker).sort().join('|')!=='fixtureId|format|syntheticOnly'||marker.format!=='volabi-access-synthetic-root-1'||marker.syntheticOnly!==true||!accessUuid(marker.fixtureId))fail('storage_unsafe');
    const st=fs.statSync(r.path,{bigint:true});const owner=process.platform==='win32'?null:String(st.uid);
    // The owner comes from current OS identity, never caller/marker nomination.
    let osOwner=owner;if(process.platform==='win32'){osOwner=execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command','[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],{encoding:'utf8',timeout:10000,windowsHide:true}).trim();}
    const owned={path:r.path,owner:osOwner,...identity(st)};assertRoot(owned);return {owned,marker};
  }catch(error){if(error instanceof HqError)throw error;fail(fs.existsSync(root)?'storage_unsafe':'storage_missing');}
}
export function openExistingDatabase(file,{readOnly=false}={}){
  if(!fs.existsSync(file))fail('storage_missing');const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)fail('storage_unsafe');if(st.size<100)fail('storage_corrupt');
  const fd=fs.openSync(file,'r');try{const header=Buffer.alloc(100);if(fs.readSync(fd,header,0,100,0)!==100||header.subarray(0,16).toString('binary')!=='SQLite format 3\0')fail('storage_corrupt');if(header.readUInt32BE(68)===0x56485152)throw new HqError('inert_restore',403);}finally{fs.closeSync(fd);}
  const uri=pathToFileURL(file);uri.searchParams.set('mode',readOnly?'ro':'rw');
  try{return new DatabaseSync(uri.href,{readOnly,timeout:5000});}catch{fail('storage_corrupt');}
}
export function publishGuard(root,state){
  const guard={format:'volabi-access-guard-1',instanceId:state.instanceId,fixtureId:state.fixtureId,root:state.root,database:state.database,schemaHash:hash(ACCESS_SCHEMA_SQL)};
  const file=path.join(root,'ACCESS-GUARD.json');if(fs.existsSync(file))fail('storage_guard_invalid');
  const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,canonical(guard));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return guard;
}
export function inspectAccessRoot(root,previous=null){
  if(previous&&!fs.existsSync(root))fail('storage_missing');
  const {owned,marker}=previous?{owned:previous.owned,marker:parse(path.join(root,'ACCESS-SYNTHETIC.json'))}:checkedRoot(root),file=accessFile(owned.path),guardFile=path.join(owned.path,'ACCESS-GUARD.json');
  if(previous){if(!fs.existsSync(root))fail('storage_missing');if(canonical(identity(fs.lstatSync(root,{bigint:true})))!==canonical({dev:owned.dev,ino:owned.ino})||marker.fixtureId!==previous.marker.fixtureId||canonical(marker)!==canonical(previous.marker))fail('storage_identity_changed');}
  if(fs.existsSync(path.join(owned.path,'INERT-RESTORE.json')))throw new HqError('inert_restore',403);
  if(!fs.existsSync(guardFile))fail('storage_not_initialized');
  assertFileCustody(owned,[guardFile,file,path.join(root,'ACCESS-SYNTHETIC.json'),path.join(root,'fixture.json'),path.join(root,'ACCESS-INTENT.json'),`${file}-wal`,`${file}-shm`]);
  const guard=parse(guardFile);if(Object.keys(guard).sort().join('|')!=='database|fixtureId|format|instanceId|root|schemaHash'||guard.format!=='volabi-access-guard-1'||guard.fixtureId!==marker.fixtureId||guard.schemaHash!==hash(ACCESS_SCHEMA_SQL)||canonical(guard.root)!==canonical(owned))fail('storage_guard_invalid');
  if(!fs.existsSync(file))fail('storage_missing');const st=fs.lstatSync(file,{bigint:true});if(st.nlink!==1n||canonical(guard.database)!==canonical(identity(st)))fail('storage_identity_changed');
  return {root:owned.path,owned,file,guard,guardHash:hash(boundedRead(guardFile,65536,{native:false})),marker};
}
export function validateOpenedAccess(db,inspected){
  if(db.prepare('PRAGMA application_id').get().application_id===0x56485152)throw new HqError('inert_restore',403);
  try{validateSchema(db);validateFixture(db,parse(path.join(inspected.root,'fixture.json')));}catch(error){throw new HqError(error.code==='unsupported_schema'?'unsupported_schema':'storage_corrupt',503);}
  const state=readAccessState(db);if(state.instanceId!==inspected.guard.instanceId||state.fixtureId!==inspected.marker.fixtureId||canonical(state.root)!==canonical(inspected.owned)||canonical(state.database)!==canonical(inspected.guard.database))fail('storage_identity_changed');return state;
}
export function recheckAccess(store){
  try{const current=inspectAccessRoot(store.accessIdentity.root,store.accessIdentity);if(current.guardHash!==store.accessIdentity.guardHash)fail('storage_identity_changed');
    // A separate read-only connection verifies persisted metadata and header, including same-inode overwrites hidden by cached SQLite pages.
    const verifier=openExistingDatabase(current.file,{readOnly:true});try{const persisted=readAccessState(verifier);if(persisted.instanceId!==current.guard.instanceId||canonical(persisted.database)!==canonical(current.guard.database)||canonical(persisted.root)!==canonical(current.owned))fail('storage_identity_changed');}finally{verifier.close();}
    const state=readAccessState(store.db);if(state.instanceId!==current.guard.instanceId||canonical(state.database)!==canonical(current.guard.database)||canonical(state.root)!==canonical(current.owned))fail('storage_identity_changed');return state;}
  catch(error){store.accessBroken=true;attachAccessDiagnostic(store.accessIdentity,error);if(!store.db.isTransaction)store.close();throw error instanceof HqError?error:new HqError('storage_unavailable',503);}
}
export function attachAccessDiagnostic(inspected,error){error.diagnosticId=randomUUID();error.diagnosticRecorded=false;try{error.diagnosticId=recordDiagnostic(inspected,error.code||'storage_unavailable');error.diagnosticRecorded=true;}catch{}return error;}
export function recordDiagnostic(inspected,code){
  const diagnosticId=randomUUID(),line=JSON.stringify({diagnosticId,at:new Date().toISOString(),code:/^[a-z_]+$/.test(code)?code:'storage_unavailable'})+'\n';
  try{assertRoot(inspected.owned);const file=path.join(inspected.root,'ACCESS-DIAGNOSTICS.jsonl');let size=0;if(fs.existsSync(file)){noLinksBatch([file]);assertFileCustody(inspected.owned,[file]);const st=fs.statSync(file);if(st.nlink!==1)throw new Error('unsafe');size=st.size;}if(size+Buffer.byteLength(line)>65536)throw new Error('bounded');fs.appendFileSync(file,line,{mode:0o600});}catch{throw new HqError('diagnostic_unavailable',503);}return diagnosticId;
}
