import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {LIMITS,canonical,digest,exactKeys,isHash,parseJson,refuse} from './common.mjs';
import {noLinks,noLinksBatch,boundedRead} from './paths.mjs';
const REQUIRED=[
 'web_platform/src/lib/hq/server/local-store.mjs','web_platform/src/lib/hq/server/local-boundary.mjs','web_platform/src/lib/hq/server/council-store.mjs','web_platform/src/lib/hq/server/projects-store.mjs','web_platform/src/lib/hq/server/catalog.mjs',
 'planning/volabi/persona-and-skills/PERSONA_REGISTRY.json','planning/volabi/persona-and-skills/ROLE_AND_FUNCTION_SKILL_MAP.json','planning/volabi/AGENT_PROFILE_CONTRACTS.json','planning/volabi/persona-and-skills/FINANCE_CONTROL_SOURCE_EXCERPTS.json',
 'planning/volabi/APPROVAL_20261022.md','planning/volabi/DESIGN.md','docs/legal/2026-10-10-adopted-decisions.md','docs/volabi-finance-refund-gaps.md',
 'scripts/hq-recovery/common.mjs','scripts/hq-recovery/envelope.mjs','scripts/hq-recovery/paths.mjs','scripts/hq-recovery/schema.mjs','scripts/hq-recovery/dependencies.mjs','scripts/hq-recovery/index.mjs','scripts/hq-recovery/cli.mjs','scripts/hq-recovery/worker.mjs'
];
const ACCESS_REFERENCES=[
 'web_platform/src/lib/hq/server/access-schema.mjs','web_platform/src/lib/hq/server/access-storage.mjs','web_platform/src/lib/hq/server/access-controls.mjs','web_platform/src/lib/hq/server/access-handler.mjs',
 'scripts/hq-access/index.mjs','scripts/hq-access/cli.mjs'
];
function relativeReference(value){if(typeof value!=='string'||path.isAbsolute(value)||value.includes('\\')||value.split('/').some(part=>['.','..',''].includes(part)))refuse('dependency_reference_invalid');return value;}
function refs(projectRoot){
 const names=[...REQUIRED,...ACCESS_REFERENCES.filter(ref=>fs.existsSync(path.join(projectRoot,ref)))];const file=path.join(projectRoot,'planning/volabi/persona-and-skills/PERSONA_REGISTRY.json');
 if(fs.existsSync(file)){noLinks(file);const people=parseJson(boundedRead(file,LIMITS.dependencyFile)).profiles;if(!Array.isArray(people)||people.length>100)refuse('dependency_inventory_invalid');for(const person of people){if(!/^[a-z][a-z0-9-]*$/.test(person.agent_id))refuse('dependency_inventory_invalid');names.push(`web_platform/public/volabi/agents/${person.agent_id}.png`,`web_platform/public/volabi/voices/${person.agent_id}-en.wav`);}}
 if(names.length>LIMITS.dependencyFiles)refuse('dependency_limit');return names.sort();
}
function allowedReference(value){return REQUIRED.includes(value)||ACCESS_REFERENCES.includes(value)||/^web_platform\/public\/volabi\/(agents\/[a-z][a-z0-9-]*\.png|voices\/[a-z][a-z0-9-]*-en\.wav)$/.test(value);}
export function captureDependencies(projectRoot,data,checkTime){
 const files=[];let total=0;const references=refs(projectRoot);noLinksBatch(references.map(r=>path.join(projectRoot,r)));
 for(const reference of references){
  checkTime();relativeReference(reference);const file=path.join(projectRoot,reference);noLinks(file,false);
  if(!fs.existsSync(file)){files.push({reference,sha256:null,bytes:0,status:'missing'});continue;}
  const bytes=boundedRead(file,LIMITS.dependencyFile,{native:false});total+=bytes.length;if(total>LIMITS.dependencyTotal)refuse('dependency_limit');files.push({reference,sha256:digest(bytes),bytes:bytes.length,status:'captured'});
 }
 const externalMap=new Map();
 const scan=value=>{if(!value||typeof value!=='object')return;if(typeof value.skillId==='string'){const id=value.skillId;if(!/^[a-z0-9][a-z0-9-]*$/.test(id))refuse('skill_reference_invalid');const entry={id,version:value.version??null,sha256:value.sha256??null,status:'not-verified-external'};externalMap.set(canonical(entry),entry);}for(const v of Object.values(value))if(v&&typeof v==='object')scan(v);};
 for(const row of data.tables.record_versions)scan(parseJson(Buffer.from(row.body)));
 let commit,dirty;try{commit=execFileSync('git',['-c','core.fsmonitor=false','rev-parse','HEAD'],{cwd:projectRoot,encoding:'utf8',timeout:5000,windowsHide:true}).trim();dirty=execFileSync('git',['-c','core.fsmonitor=false','status','--porcelain','--untracked-files=no'],{cwd:projectRoot,encoding:'utf8',timeout:5000,windowsHide:true}).trim().length>0;}catch{refuse('repository_provenance_unavailable');}
 return {files,external:[...externalMap.values()].sort((a,b)=>canonical(a).localeCompare(canonical(b))),commit,dirty,runtime:process.versions.node};
}
export function verifyDependencies(inventory,projectRoot,checkTime){
 exactKeys(inventory,['files','external','commit','dirty','runtime'],'dependency_inventory_invalid');
 if(!Array.isArray(inventory.files)||inventory.files.length>LIMITS.dependencyFiles||!Array.isArray(inventory.external)||inventory.external.length>LIMITS.dependencyFiles||typeof inventory.commit!=='string'||!/^[a-f0-9]{40}$/.test(inventory.commit)||typeof inventory.dirty!=='boolean'||typeof inventory.runtime!=='string')refuse('dependency_inventory_invalid');
 const gaps=[],seen=new Set();let total=0;
 noLinksBatch(inventory.files.map(entry=>path.join(projectRoot,relativeReference(entry.reference))));
 for(const entry of inventory.files){
  checkTime();exactKeys(entry,['reference','sha256','bytes','status'],'dependency_inventory_invalid');const reference=relativeReference(entry.reference);if(!allowedReference(reference)||seen.has(reference)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||entry.bytes>LIMITS.dependencyFile||!['missing','captured'].includes(entry.status)||(entry.status==='captured'?!isHash(entry.sha256):entry.sha256!==null))refuse('dependency_inventory_invalid');seen.add(reference);const file=path.join(projectRoot,reference);noLinks(file,false);
  if(entry.status==='missing'||!fs.existsSync(file)){gaps.push({reference,reason:'missing'});continue;}
  const bytes=boundedRead(file,LIMITS.dependencyFile,{native:false});total+=bytes.length;if(total>LIMITS.dependencyTotal)refuse('dependency_limit');if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)gaps.push({reference,reason:'mismatch'});
 }
 for(const required of REQUIRED)if(!seen.has(required))refuse('dependency_inventory_incomplete');
 // Re-enumeration detects missing/added media and a changing persona registry.
 for(const required of refs(projectRoot))if(!seen.has(required))gaps.push({reference:required,reason:'not-captured'});
 for(const entry of inventory.external){exactKeys(entry,['id','version','sha256','status'],'dependency_inventory_invalid');if(!/^[a-z0-9][a-z0-9-]*$/.test(entry.id)||entry.status!=='not-verified-external'||entry.version!==null&&typeof entry.version!=='string'||entry.sha256!==null&&!isHash(entry.sha256))refuse('dependency_inventory_invalid');gaps.push({reference:`external-skill:${entry.id}`,reason:'not-verified-external'});}
 return {status:gaps.length?'blocked':'passed',gaps};
}
