import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {LIMITS,RecoveryError,canonical,deadline,digest,exactKeys,isUuid,isHash,parseJson,refuse,runtimeCheck} from './common.mjs';
import {DEFAULT_PROJECT_ROOT,safeExisting,createOwnedRoot,exclusiveFile,publish,cleanFiles,boundedRead,noLinks,assertOwned} from './paths.mjs';
import {SCHEMA_FINGERPRINT,validateSchema,captureLogical,validateLogical,validateFixture,validateFixtureRows,rebuild,verifyRebuilt} from './schema.mjs';
import {encryptEnvelope,decryptEnvelope,validateEnvelope} from './envelope.mjs';
import {captureDependencies,verifyDependencies} from './dependencies.mjs';
const time=()=>new Date().toISOString();
const sqliteScratch=['snapshot.native','sanitized.native','restore.stage'];
const scratch=[...sqliteScratch.flatMap(name=>[name,`${name}-journal`,`${name}-wal`,`${name}-shm`]),'package.stage'];
const normalizeError=error=>error instanceof RecoveryError?error:new RecoveryError(error?.code==='ENOSPC'?'storage_full':error?.code==='EACCES'||error?.code==='EPERM'?'permission_denied':'operation_failed');
async function operation(kind,options,work){
 runtimeCheck();const projectRoot=options.projectRoot||DEFAULT_PROJECT_ROOT;
 if(!Buffer.isBuffer(options.passphrase)||options.passphrase.length<12||options.passphrase.length>256)refuse('passphrase_length');
 const source=kind==='create'?safeExisting(options.fixtureRoot,{projectRoot}):safeExisting(options.packagePath,{projectRoot,file:true});
 if(kind!=='create')validateEnvelope(boundedRead(source.path,LIMITS.package));
 const owned=createOwnedRoot(options.outputRoot,{projectRoot,sourcePaths:[source.path]});
 const startedAt=time(),started=Date.now(),operationId=options.operationId||randomUUID();if(!isUuid(operationId))refuse('invalid_operation_id');let published=[];
 try{
  exclusiveFile(owned,'INCOMPLETE.json',canonical({operationId,operation:kind,startedAt,operator:owned.owner,outcome:'in-progress',cleanup:'check-owned-directory-before-removal'}));
  let stageDeadline=deadline();const result=await work({owned,source,projectRoot,checkTime:()=>stageDeadline(),startStage:()=>{stageDeadline=deadline();},startedAt,operationId,published});
  cleanFiles(owned,scratch);
  const receipt={format:'volabi-recovery-receipt-1',operationId,operation:kind,startedAt,completedAt:time(),elapsedMs:Date.now()-started,operator:owned.owner,outcome:'completed',cleanup:'complete',inert:true,authority:'historical-only',sessionCount:0,...result};
  const receiptBytes=canonical(receipt);exclusiveFile(owned,'receipt.json',receiptBytes);published.push('receipt.json');
  exclusiveFile(owned,'journal.json',canonical({format:'volabi-recovery-journal-1',operationId,operation:kind,outcome:'completed',packageDigest:receipt.packageDigest,snapshotId:receipt.snapshotId,capture:receipt.capture,receiptDigest:digest(receiptBytes),at:time(),operator:owned.owner}));published.push('journal.json');
  cleanFiles(owned,['INCOMPLETE.json']);return receipt;
 }catch(error){
  const failure=normalizeError(error);let cleanup='complete';
  try{cleanFiles(owned,[...scratch,...published]);}catch{cleanup='cleanup-needed';}
  try{assertOwned(owned);const notice={format:'volabi-recovery-failure-1',operationId,operation:kind,outcome:'failed',code:failure.code,cleanup,at:time(),operator:owned.owner};
   if(fs.existsSync(path.join(owned.path,'INCOMPLETE.json')))cleanFiles(owned,['INCOMPLETE.json']);exclusiveFile(owned,'INCOMPLETE.json',canonical(notice));
   exclusiveFile(owned,'failure-journal.json',canonical(notice));
  }catch{failure.cleanup='cleanup-needed';}
  failure.cleanup??=cleanup;throw failure;
 }
}
function validatePayload(payload){
 exactKeys(payload,['format','fixture','manifest','tables','sequence'],'invalid_payload');
 if(payload.format!=='volabi-recovery-payload-1')refuse('invalid_payload');
 exactKeys(payload.manifest,['snapshotId','capture','schemaFingerprint','dataDigest','counts','dependencies'],'invalid_payload');
 const m=payload.manifest;if(!isUuid(m.snapshotId)||m.schemaFingerprint!==SCHEMA_FINGERPRINT||!isHash(m.dataDigest))refuse('manifest_invalid');
 exactKeys(m.capture,['startedAt','completedAt','eventWatermark','dependencyStartedAt','dependencyCompletedAt'],'manifest_invalid');
 if(!Number.isSafeInteger(m.capture.eventWatermark)||m.capture.eventWatermark!==payload.sequence)refuse('sequence_invalid');
 for(const field of ['startedAt','completedAt','dependencyStartedAt','dependencyCompletedAt'])if(typeof m.capture[field]!=='string'||!Number.isFinite(Date.parse(m.capture[field])))refuse('manifest_invalid');
 const summary=validateLogical(payload);if(summary.dataDigest!==m.dataDigest||canonical(summary.counts)!==canonical(m.counts))refuse('content_digest_mismatch');
 validateFixtureRows({workspaces:payload.tables.workspaces.map(r=>({id:r.id,actorId:r.actor_id})),proofs:payload.tables.records.filter(r=>r.kind==='recovery-fixture-proof')},payload.fixture);return summary;
}
export async function createBackup(options){
 return operation('create',options,async context=>{
  const{owned,source,projectRoot,checkTime,published}=context;
  const fixtureMarker=path.join(source.path,'fixture.json');noLinks(fixtureMarker);if(!fs.existsSync(fixtureMarker))refuse('fixture_marker_missing');const fixture=parseJson(boundedRead(fixtureMarker,64*1024),'fixture_marker_invalid');
  const sourceFile=safeExisting(path.join(source.path,'hq.sqlite'),{projectRoot,file:true,maxBytes:LIMITS.snapshot});
  const sourceDb=new DatabaseSync(sourceFile.path,{readOnly:true});const snapshot=exclusiveFile(owned,'snapshot.native',Buffer.alloc(0));const capturedAt=time();let authHashes=[];
  try{
   sourceDb.exec('PRAGMA busy_timeout=5000');validateSchema(sourceDb);validateFixture(sourceDb,fixture);checkTime();
   await backup(sourceDb,snapshot,{rate:64,progress:()=>{checkTime();if(fs.statSync(snapshot).size>LIMITS.snapshot)refuse('snapshot_limit');}});
  }finally{sourceDb.close();}
  checkTime();if(fs.statSync(snapshot).size>LIMITS.snapshot)refuse('snapshot_limit');
  const db=new DatabaseSync(snapshot,{readOnly:true});let data;
  try{validateSchema(db);validateFixture(db,fixture);data=captureLogical(db);authHashes=db.prepare('SELECT token_hash FROM sessions').all().map(r=>r.token_hash);}finally{db.close();}
  const capturedUntil=time(),summary=validateLogical(data),dependencyStartedAt=time();context.startStage();
  const dependencies=captureDependencies(projectRoot,data,checkTime),dependencyStatus=verifyDependencies(dependencies,projectRoot,checkTime);if(dependencyStatus.gaps.some(x=>x.reason==='mismatch'))refuse('dependency_changed_during_capture');
  const dependencyCompletedAt=time();context.startStage();
  const sanitized=path.join(owned.path,'sanitized.native');rebuild(sanitized,data);verifyRebuilt(sanitized,data);
  const sanitizedBytes=boundedRead(sanitized,LIMITS.snapshot);for(const canary of authHashes)if(sanitizedBytes.includes(Buffer.from(canary)))refuse('authentication_canary_leaked');sanitizedBytes.fill(0);authHashes=[];
  const capture={startedAt:capturedAt,completedAt:capturedUntil,eventWatermark:data.sequence,dependencyStartedAt,dependencyCompletedAt};
  const manifest={snapshotId:randomUUID(),capture,schemaFingerprint:SCHEMA_FINGERPRINT,dataDigest:summary.dataDigest,counts:summary.counts,dependencies};
  const payload={format:'volabi-recovery-payload-1',fixture,manifest,...data};validatePayload(payload);
  const bytes=encryptEnvelope(payload,options.passphrase);checkTime();
  // Remove captured raw pages and sanitized plaintext before exposing the final encrypted file.
  cleanFiles(owned,scratch);exclusiveFile(owned,'package.stage',bytes);const packageDigest=digest(bytes),packagePath=publish(owned,'package.stage','backup.vhq');published.push('backup.vhq');
  return {snapshotId:manifest.snapshotId,capture,packagePath,packageDigest,schemaFingerprint:SCHEMA_FINGERPRINT,dataDigest:summary.dataDigest,counts:summary.counts,workspaceCount:summary.workspaceCount,kindCounts:summary.kindCounts,dataIntegrity:'passed',dependencies:dependencyStatus,fullFidelity:dependencyStatus.status==='passed',limitations:['synthetic-fixtures-only','historical-records-only','passphrase-is-not-an-identity-signature','source-prose-is-sensitive','same-disk-is-not-disaster-recovery']};
 });
}
async function readPackage(context,options){
 const{source,projectRoot,checkTime}=context;const bytes=boundedRead(source.path,LIMITS.package),payload=decryptEnvelope(bytes,options.passphrase);checkTime();const summary=validatePayload(payload),packageDigest=digest(bytes);
 verifyCreationCompletion(source.path,payload,packageDigest);
 context.startStage();
 const dependencies=verifyDependencies(payload.manifest.dependencies,projectRoot,checkTime);
 return {payload,summary,dependencies,packageDigest};
}
function verifyCreationCompletion(packagePath,payload,packageDigest){
 const root=path.dirname(packagePath);if(fs.existsSync(path.join(root,'INCOMPLETE.json')))refuse('package_not_complete');
 try{
  const receiptBytes=boundedRead(path.join(root,'receipt.json'),128*1024),receipt=parseJson(receiptBytes),journal=parseJson(boundedRead(path.join(root,'journal.json'),64*1024));
  if(receipt.format!=='volabi-recovery-receipt-1'||receipt.operation!=='create'||receipt.outcome!=='completed'||receipt.cleanup!=='complete'||receipt.packageDigest!==packageDigest||receipt.snapshotId!==payload.manifest.snapshotId||receipt.dataDigest!==payload.manifest.dataDigest||journal.format!=='volabi-recovery-journal-1'||journal.operation!=='create'||journal.outcome!=='completed'||journal.operationId!==receipt.operationId||journal.packageDigest!==packageDigest||journal.snapshotId!==receipt.snapshotId||journal.receiptDigest!==digest(receiptBytes))refuse('package_not_complete');
 }catch{refuse('package_not_complete');}
}
function verificationResult({payload,summary,dependencies,packageDigest}){
 return {snapshotId:payload.manifest.snapshotId,capture:payload.manifest.capture,packageDigest,schemaFingerprint:payload.manifest.schemaFingerprint,dataDigest:summary.dataDigest,counts:summary.counts,workspaceCount:summary.workspaceCount,kindCounts:summary.kindCounts,dataIntegrity:'passed',dependencies,fullFidelity:dependencies.status==='passed',limitations:['synthetic-fixtures-only','historical-records-only','external-skills-not-reinstalled-or-authorized']};
}
export async function inspectBackup(options){return operation('inspect',options,async context=>{const result=await readPackage(context,options);return verificationResult(result);});}
export async function restoreBackup(options){
 return operation('restore',options,async context=>{
  const result=await readPackage(context,options),{owned,checkTime,published}=context;context.startStage();
  const stage=path.join(owned.path,'restore.stage');rebuild(stage,result.payload);verifyRebuilt(stage,result.payload);checkTime();
  const db=new DatabaseSync(stage,{readOnly:true});try{validateFixture(db,result.payload.fixture);}finally{db.close();}
  cleanFiles(owned,scratch.filter(name=>name!=='restore.stage'));
  exclusiveFile(owned,'INERT-RESTORE.json',canonical({format:'volabi-inert-restore-1',packageDigest:result.packageDigest,snapshotId:result.payload.manifest.snapshotId,authority:'historical-only',sessions:0}));published.push('INERT-RESTORE.json');
  const databasePath=publish(owned,'restore.stage','hq.sqlite');published.push('hq.sqlite');return {...verificationResult(result),databasePath};
 });
}
export function recoverInterrupted(outputRoot,operationId){
 if(!isUuid(operationId))refuse('invalid_operation_id');const location=safeExisting(outputRoot).path,marker=parseJson(boundedRead(path.join(location,'INCOMPLETE.json'),64*1024));if(marker.operationId!==operationId||typeof marker.operator!=='string')refuse('cleanup_ownership_unknown');
 const stat=fs.lstatSync(location),owned={path:location,dev:stat.dev,ino:stat.ino,owner:marker.operator};assertOwned(owned);
 let cleanup='complete';try{cleanFiles(owned,[...scratch,'backup.vhq','hq.sqlite','hq.sqlite-wal','hq.sqlite-shm','hq.sqlite-journal','receipt.json','journal.json','INERT-RESTORE.json']);}catch{cleanup='cleanup-needed';}
 cleanFiles(owned,['INCOMPLETE.json']);exclusiveFile(owned,'INCOMPLETE.json',canonical({operationId,outcome:'failed',code:'operation_interrupted',cleanup,operator:owned.owner,at:time()}));
 return {code:'operation_interrupted',cleanup};
}
