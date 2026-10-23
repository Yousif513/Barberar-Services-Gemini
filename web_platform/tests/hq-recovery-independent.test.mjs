import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,readdirSync,statSync,linkSync,mkdirSync,copyFileSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createDecipheriv,scryptSync,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {createBackup,inspectBackup,restoreBackup} from '../../scripts/hq-recovery/index.mjs';
import {HqStore} from '../src/lib/hq/server/local-store.mjs';
import {makeFixture,logicalState,command,digest} from './hq-recovery-independent-fixture.mjs';

const projectRoot=path.resolve(import.meta.dirname,'../..');
const secret=()=>Buffer.from(randomBytes(32).toString('hex'));
const output=(s,name)=>path.join(s.root,name);
const create=(s,passphrase,name='backup')=>createBackup({fixtureRoot:s.fixtureRoot,outputRoot:output(s,name),passphrase,projectRoot});
const open=(file)=>new DatabaseSync(file,{readOnly:true});
function independentDecode(packagePath,passphrase){
 const bytes=readFileSync(packagePath);assert.equal(bytes.subarray(0,8).toString(),'VHQREC01');const n=bytes.readUInt32BE(8);assert.ok(n>0&&n<=1024);const end=12+n,h=JSON.parse(bytes.subarray(12,end));
 assert.deepEqual([h.format,h.cipher,h.kdf,h.N,h.r,h.p],[1,'aes-256-gcm','scrypt',32768,8,1]);
 const key=scryptSync(passphrase,Buffer.from(h.salt,'base64'),32,{N:h.N,r:h.r,p:h.p,maxmem:64*1024*1024});
 const d=createDecipheriv('aes-256-gcm',key,Buffer.from(h.nonce,'base64'));d.setAAD(bytes.subarray(0,end));d.setAuthTag(bytes.subarray(bytes.length-16));
 try {const text=Buffer.concat([d.update(bytes.subarray(end,bytes.length-16)),d.final()]);assert.equal(text.length,h.plaintextBytes);return {bytes,text,document:JSON.parse(text)};}finally{key.fill(0);}
}
function mutateHistory(db,fn){
 const triggers=db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger'").all();
 for(const trigger of triggers)db.exec(`DROP TRIGGER "${trigger.name}"`);
 try{fn();}finally{for(const trigger of triggers)db.exec(trigger.sql);}
}
function alterRecord(db,kind,fn){
 const r=db.prepare('SELECT * FROM records WHERE kind=? LIMIT 1').get(kind);const body=JSON.stringify(fn(JSON.parse(r.body)));
 mutateHistory(db,()=>{db.prepare('UPDATE records SET body=? WHERE workspace_id=? AND kind=? AND id=?').run(body,r.workspace_id,kind,r.id);db.prepare('UPDATE record_versions SET body=? WHERE workspace_id=? AND kind=? AND id=? AND revision=?').run(body,r.workspace_id,kind,r.id,r.revision);});
}
const refused=async(fn,codes)=>assert.rejects(fn,e=>{assert.ok(codes.includes(e.code),`Expected ${codes.join(' or ')}, got ${e.code}`);return true;});
function stateFromFile(file){const db=open(file);try{return logicalState(db);}finally{db.close();}}

// Each fixture is newly created in the OS temporary directory; the running HQ file is never read.
test('independent recovery REC01/02/08: whole-instance exact historical bytes survive rich WAL capture and remain inert',async t=>{
 const s=makeFixture(t,{opaque:true}),passphrase=secret();t.after(()=>passphrase.fill(0));
 assert.ok(existsSync(s.options.filePath+'-wal'));assert.ok(statSync(s.options.filePath+'-wal').size>0);
 const packageReport=await create(s,passphrase);assert.equal(packageReport.dataIntegrity,'passed');assert.deepEqual(readdirSync(output(s,'backup')).sort(),['backup.vhq','journal.json','receipt.json']);
 const originalDigest=digest(readFileSync(packageReport.packagePath)),captured=s.expected;
 command(s,'source.add',{title:'Synthetic after-capture sentinel',body:'This newer source must never be rolled back.',provenance:{uri:'current-session:sentinel',locator:'after capture',authorKind:'human'}});
 const liveBefore=logicalState(s.store.db),identity=statSync(s.options.filePath),sessions=liveBefore.sessions;
 const report=await restoreBackup({packagePath:packageReport.packagePath,outputRoot:output(s,'restored'),passphrase,projectRoot});
 assert.equal(report.dataIntegrity,'passed');assert.equal(report.inert,true);assert.equal(report.sessionCount,0);assert.equal(report.authority,'historical-only');
 assert.deepEqual(stateFromFile(report.databasePath),captured);
 assert.deepEqual(logicalState(s.store.db),liveBefore);assert.equal(statSync(s.options.filePath).ino,identity.ino);assert.equal(digest(readFileSync(packageReport.packagePath)),originalDigest);
 const decoded=independentDecode(packageReport.packagePath,passphrase);const text=decoded.text.toString('utf8');
 for(const row of sessions)assert.ok(!text.includes(row.token_hash));for(const token of [s.seat.token,s.other.token])assert.ok(!text.includes(token));
 assert.ok(!decoded.text.includes(Buffer.from('SQLite format 3')));assert.ok(!JSON.stringify(report).includes(s.body));assert.ok(!JSON.stringify(report).includes(passphrase.toString()));
 assert.throws(()=>new HqStore({...s.options,filePath:report.databasePath}),e=>e.code==='inert_restore');
 const restored=open(report.databasePath);try{assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(restored.prepare('PRAGMA foreign_key_check').all().length,0);assert.equal(restored.prepare('SELECT count(*) n FROM sessions').get().n,0);
  const old=restored.prepare("SELECT body FROM record_versions WHERE kind='source' AND id=? AND revision=1").get(s.sourceId);assert.equal(JSON.parse(old.body).body,s.body);
  const rec=restored.prepare("SELECT body FROM records WHERE kind='recommendation' AND json_extract(body,'$.taskId')=?").get(s.taskId);const citation=JSON.parse(rec.body).citations[0];assert.equal(citation.quote,s.body);assert.equal(s.body.slice(citation.start,citation.end),s.body);assert.notEqual(s.body.length,Buffer.byteLength(s.body));
  const m=JSON.parse(restored.prepare("SELECT body FROM records WHERE kind='meeting' AND id=?").get(s.meetingId).body);assert.equal(m.notes.filter(n=>n.kind==='dissent').length,2);assert.equal(m.notes[1].supersedesId,m.notes[0].id);assert.ok(m.minutes.includes('Corrected'));assert.equal(m.status,'draft');
  assert.equal(JSON.parse(restored.prepare("SELECT body FROM records WHERE kind='decision' AND id=?").get(s.minutesDecisionId).body).status,'approved');
  assert.ok(restored.prepare("SELECT body FROM records WHERE kind='council-classification'").all().some(r=>JSON.parse(r.body).dependencyPins?.length));
  assert.ok(restored.prepare('SELECT count(*) n FROM events').get().n>100);
 }finally{restored.close();decoded.text.fill(0);}
});

test('independent recovery REC01: open multi-record transaction is excluded without checkpointing or source mutation',async t=>{
 const s=makeFixture(t,{rich:false}),passphrase=secret();t.after(()=>passphrase.fill(0));const committed=logicalState(s.store.db);s.store.db.exec('BEGIN IMMEDIATE');
 const id=crypto.randomUUID();s.store.db.prepare('INSERT INTO records VALUES(?,?,?,?,?)').run(s.seat.workspaceId,'independent-uncommitted',id,1,JSON.stringify({id,uncommitted:true}));
 s.store.db.prepare('INSERT INTO record_versions VALUES(?,?,?,?,?,?)').run(s.seat.workspaceId,'independent-uncommitted',id,1,JSON.stringify({id,uncommitted:true}),new Date().toISOString());
 let report;try{report=await create(s,passphrase);assert.equal(s.store.db.prepare("SELECT count(*) n FROM records WHERE kind='independent-uncommitted'").get().n,1);}finally{s.store.db.exec('ROLLBACK');}
 const restored=await restoreBackup({packagePath:report.packagePath,outputRoot:output(s,'restored'),passphrase,projectRoot});assert.deepEqual(stateFromFile(restored.databasePath),{...committed,sessions:[]});assert.deepEqual(logicalState(s.store.db),committed);
});

test('independent recovery REC02/09: non-contiguous audit sequence and reserved high-water mark survive exactly',async t=>{
 const s=makeFixture(t,{rich:false}),passphrase=secret();t.after(()=>passphrase.fill(0));s.store.db.prepare("UPDATE sqlite_sequence SET seq=seq+100 WHERE name='events'").run();s.store.audit(s.seat,'independent.sequence.gap','workspace',s.seat.workspaceId,null,{});s.store.db.prepare("UPDATE sqlite_sequence SET seq=seq+31 WHERE name='events'").run();
 const expected={...logicalState(s.store.db),sessions:[]},report=await create(s,passphrase),r=await restoreBackup({packagePath:report.packagePath,outputRoot:output(s,'restored'),passphrase,projectRoot});assert.deepEqual(stateFromFile(r.databasePath),expected);assert.ok(expected.sequence>Math.max(...expected.events.map(e=>e.seq)));
});

test('independent recovery REC06: installed-skill pins remain unresolved metadata and never imply complete dependencies',async t=>{
 const s=makeFixture(t),passphrase=secret();t.after(()=>passphrase.fill(0));const r=await create(s,passphrase),inspected=await inspectBackup({packagePath:r.packagePath,outputRoot:output(s,'inspected'),passphrase,projectRoot});assert.equal(inspected.dataIntegrity,'passed');assert.notEqual(inspected.dependencies.status,'passed');assert.ok(inspected.dependencies.gaps.length>0);assert.ok(!JSON.stringify(inspected).includes('Synthetic objection'));
});

for(const corruption of ['orphan-task-source','cross-workspace-task-source','missing-current-history','missing-intermediate-history','historical-citation-mismatch','wrong-source-hash','wrong-citation','bad-command-receipt','bad-watermark','foreign-schema-table','changed-immutability-trigger'])test(`independent recovery REC03: malformed fixture refuses ${corruption}`,async t=>{
 const s=makeFixture(t),passphrase=secret();t.after(()=>passphrase.fill(0));const healthy=await create(s,passphrase,'healthy-baseline');assert.equal(healthy.dataIntegrity,'passed');
 if(corruption==='orphan-task-source')alterRecord(s.store.db,'task',r=>({...r,sourceIds:[crypto.randomUUID()]}));
 if(corruption==='cross-workspace-task-source')alterRecord(s.store.db,'task',r=>({...r,sourceIds:[s.secondary]}));
 if(corruption==='missing-current-history')mutateHistory(s.store.db,()=>s.store.db.exec("DELETE FROM record_versions WHERE rowid=(SELECT v.rowid FROM record_versions v JOIN records r USING(workspace_id,kind,id,revision) WHERE v.kind='task' LIMIT 1)"));
 if(corruption==='missing-intermediate-history')mutateHistory(s.store.db,()=>s.store.db.exec("DELETE FROM record_versions WHERE rowid=(SELECT v.rowid FROM record_versions v JOIN records r USING(workspace_id,kind,id) WHERE v.revision=2 AND r.revision>2 LIMIT 1)"));
 if(corruption==='historical-citation-mismatch')mutateHistory(s.store.db,()=>{const r=s.store.db.prepare("SELECT rowid,body FROM record_versions WHERE kind='source' AND id=? AND revision=1").get(s.sourceId),v=JSON.parse(r.body);v.body+='Synthetic altered historical source.';v.sha256=digest(v.body);s.store.db.prepare('UPDATE record_versions SET body=? WHERE rowid=?').run(JSON.stringify(v),r.rowid);});
 if(corruption==='wrong-source-hash')alterRecord(s.store.db,'source',r=>({...r,sha256:'0'.repeat(64)}));
 if(corruption==='wrong-citation')alterRecord(s.store.db,'recommendation',r=>({...r,citations:r.citations.map(c=>({...c,quote:'Changed citation without matching old source'}))}));
 if(corruption==='bad-command-receipt')mutateHistory(s.store.db,()=>s.store.db.exec("UPDATE commands SET receipt='{}' WHERE rowid=(SELECT rowid FROM commands LIMIT 1)"));
 if(corruption==='bad-watermark')s.store.db.exec("UPDATE sqlite_sequence SET seq=0 WHERE name='events'");
 if(corruption==='foreign-schema-table')s.store.db.exec('CREATE TABLE independent_unknown_schema(secret TEXT)');
 if(corruption==='changed-immutability-trigger'){s.store.db.exec('DROP TRIGGER events_no_delete');s.store.db.exec('CREATE TRIGGER events_no_delete BEFORE DELETE ON events BEGIN SELECT 1; END');}
 const expectedCodes={'orphan-task-source':['record_link_invalid'],'cross-workspace-task-source':['record_link_invalid','workspace_link_invalid'],'missing-current-history':['history_incomplete'],'missing-intermediate-history':['history_incomplete'],'historical-citation-mismatch':['source_pin_invalid','citation_invalid'],'wrong-source-hash':['source_hash_invalid'],'wrong-citation':['citation_invalid','recommendation_hash_invalid'],'bad-command-receipt':['receipt_invalid'],'bad-watermark':['sequence_invalid'],'foreign-schema-table':['unsupported_schema'],'changed-immutability-trigger':['unsupported_schema']};const before=logicalState(s.store.db);await refused(()=>create(s,passphrase),expectedCodes[corruption]);assert.deepEqual(logicalState(s.store.db),before);if(existsSync(output(s,'backup'))){assert.deepEqual(readdirSync(output(s,'backup')).sort(),['INCOMPLETE.json','failure-journal.json']);const failure=JSON.parse(readFileSync(path.join(output(s,'backup'),'failure-journal.json'),'utf8'));assert.equal(failure.outcome,'failed');assert.ok(expectedCodes[corruption].includes(failure.code));assert.equal(failure.cleanup,'complete');}
});

for(const corruption of ['wrong-password','header','ciphertext','tag','truncated'])test(`independent recovery REC03/04: package authentication failure ${corruption} publishes no database`,async t=>{
 const s=makeFixture(t,{rich:false}),passphrase=secret();t.after(()=>passphrase.fill(0));const r=await create(s,passphrase);let packagePath=r.packagePath,attempt=passphrase;
 if(corruption==='wrong-password')attempt=secret();else{const b=readFileSync(packagePath);if(corruption==='header')b[13]^=1;if(corruption==='ciphertext')b[Math.floor(b.length/2)]^=1;if(corruption==='tag')b[b.length-1]^=1;packagePath=path.join(s.root,'tampered.vhq');writeFileSync(packagePath,corruption==='truncated'?b.subarray(0,b.length-8):b);}
 try{await refused(()=>restoreBackup({packagePath,outputRoot:output(s,'failed-restore'),passphrase:attempt,projectRoot}),corruption==='header'||corruption==='truncated'?['invalid_envelope','authentication_failed']:['authentication_failed']);}finally{if(attempt!==passphrase)attempt.fill(0);}
 const out=output(s,'failed-restore');if(existsSync(out)){const names=readdirSync(out,{recursive:true}).map(String);assert.ok(!names.some(n=>n.endsWith('.sqlite')));const printable=names.filter(n=>/\.(json|txt)$/.test(n)).map(n=>readFileSync(path.join(out,n),'utf8')).join('');assert.ok(!printable.includes(passphrase.toString()));assert.ok(!printable.includes(s.body));}
});

test('independent recovery REC05: output aliases, existing targets, fixture-internal output and hard links refuse',async t=>{
 const s=makeFixture(t,{rich:false}),passphrase=secret();t.after(()=>passphrase.fill(0));assert.equal((await create(s,passphrase,'healthy-baseline')).dataIntegrity,'passed');await refused(()=>createBackup({fixtureRoot:s.fixtureRoot,outputRoot:s.fixtureRoot,passphrase,projectRoot}),['source_overlap','target_exists']);await refused(()=>createBackup({fixtureRoot:s.fixtureRoot,outputRoot:path.join(s.fixtureRoot,'nested'),passphrase,projectRoot}),['source_overlap']);const existing=output(s,'existing');mkdirSync(existing);writeFileSync(path.join(existing,'sentinel'),'keep');await refused(()=>create(s,passphrase,'existing'),['target_exists']);assert.equal(readFileSync(path.join(existing,'sentinel'),'utf8'),'keep');
 const r=await create(s,passphrase),alias=path.join(s.root,'alias.vhq');linkSync(r.packagePath,alias);await refused(()=>inspectBackup({packagePath:alias,outputRoot:output(s,'hardlinked'),passphrase,projectRoot}),['unsafe_path']);
});

test('independent recovery REC07: fixture markers cannot select an unmarked or incomplete workspace inventory',async t=>{
 const s=makeFixture(t,{rich:false}),passphrase=secret();t.after(()=>passphrase.fill(0));assert.equal((await create(s,passphrase,'healthy-baseline')).dataIntegrity,'passed');const file=path.join(s.fixtureRoot,'fixture.json'),original=readFileSync(file,'utf8'),m=JSON.parse(original);writeFileSync(file,JSON.stringify({...m,workspaces:m.workspaces.slice(0,1)}));await refused(()=>create(s,passphrase,'inventory-fail'),['fixture_inventory_mismatch']);writeFileSync(file,original);s.store.db.exec("DELETE FROM records WHERE kind='recovery-fixture-proof'");await refused(()=>create(s,passphrase,'proof-fail'),['fixture_proof_missing']);
});

test('independent recovery CLI REC04/07: piped input and secret arguments are refused without printing supplied material',t=>{
 const s=makeFixture(t,{rich:false}),secretText='SyntheticCLIInputNeverAnActualCredential',cli=path.join(projectRoot,'scripts/hq-recovery/cli.mjs');const help=spawnSync(process.execPath,[cli,'--help'],{encoding:'utf8',timeout:10000,cwd:projectRoot});assert.equal(help.status,0);assert.match(help.stdout,/create --fixture/);assert.match(help.stdout,/[\u0600-\u06ff]/);
 for(const args of [['create','--fixture',s.fixtureRoot,'--output',output(s,'cli-pipe')],['create','--fixture',s.fixtureRoot,'--output',output(s,'cli-args'),'--passphrase',secretText]]){const child=spawnSync(process.execPath,[cli,...args],{input:secretText+'\nSYNTHETIC ONLY\n',encoding:'utf8',timeout:10000,cwd:projectRoot});assert.notEqual(child.status,0);assert.match(child.stderr,args.includes('--passphrase')?/invalid_arguments/:/interactive_terminal_required/);assert.ok(!(child.stdout+child.stderr).includes(secretText));assert.ok(!existsSync(output(s,args.includes('--passphrase')?'cli-args':'cli-pipe')));}
});


test('independent recovery REC01: competing supported commands are captured atomically across all durable tables',async t=>{
 const s=makeFixture(t,{rich:false}),passphrase=secret();t.after(()=>passphrase.fill(0));
 const code=`import {parentPort,workerData} from 'node:worker_threads';import {randomUUID} from 'node:crypto';import {HqStore} from ${JSON.stringify(new URL('../src/lib/hq/server/local-store.mjs',import.meta.url).href)};const store=new HqStore(workerData.options);let first=true;const beganAt=Date.now();for(let n=0;n<500;n++){store.command(workerData.seat,{commandId:randomUUID(),type:'task.create',payload:{title:'Concurrent synthetic task '+n,request:'One complete command',outcome:'Atomic receipt and audit',acceptance:'No partial capture',limits:'Synthetic fixture only',sourceIds:[]}});if(first){parentPort.postMessage({state:'started',at:beganAt});first=false;}await new Promise(r=>setTimeout(r,50));}store.close();parentPort.postMessage({state:'done',at:Date.now()});`;
 const worker=new Worker(new URL('data:text/javascript,'+encodeURIComponent(code)),{workerData:{options:s.options,seat:s.seat}});t.after(async()=>{await worker.terminate();});
 const messages=[];worker.on('message',message=>messages.push(message));const exited=once(worker,'exit');await once(worker,'message');const packageReport=await create(s,passphrase);const stateAfterCapture=logicalState(s.store.db);await exited;const began=messages.find(m=>m.state==='started'),ended=messages.find(m=>m.state==='done');assert.ok(began.at<=Date.parse(packageReport.capture.startedAt));assert.ok(ended.at>=Date.parse(packageReport.capture.completedAt));
 const r=await restoreBackup({packagePath:packageReport.packagePath,outputRoot:output(s,'restored'),passphrase,projectRoot});const state=stateFromFile(r.databasePath);
 for(const row of state.records.filter(row=>row.kind==='task')){const body=JSON.parse(row.body);assert.equal(state.record_versions.filter(v=>v.workspace_id===row.workspace_id&&v.kind==='task'&&v.id===row.id).length,1);const events=state.events.filter(e=>e.target_type==='task'&&e.target_id===row.id&&e.action==='task.requested');assert.equal(events.length,1);assert.equal(state.commands.filter(c=>c.workspace_id===row.workspace_id&&JSON.parse(c.receipt).entityId===body.id).length,1);}
 assert.ok(state.records.filter(row=>row.kind==='task').length>0);assert.ok(state.records.length<=stateAfterCapture.records.length);assert.equal(logicalState(s.store.db).records.filter(row=>row.kind==='task').length,500);
});

test('independent recovery REC07/09: disposable derivative proves immutable history uniqueness and allocator continuity',async t=>{
 const s=makeFixture(t),passphrase=secret();t.after(()=>passphrase.fill(0));const b=await create(s,passphrase),r=await restoreBackup({packagePath:b.packagePath,outputRoot:output(s,'restored'),passphrase,projectRoot});const original=stateFromFile(r.databasePath),derivative=path.join(s.root,'independent-derivative.sqlite');copyFileSync(r.databasePath,derivative);const db=new DatabaseSync(derivative);
 try{for(const table of ['record_versions','commands','events']){assert.throws(()=>db.exec(`DELETE FROM ${table}`));assert.throws(()=>db.exec(`UPDATE ${table} SET rowid=rowid`));}
 const receipt=original.commands[0];assert.throws(()=>db.prepare('INSERT INTO commands VALUES(?,?,?,?)').run(receipt.workspace_id,receipt.id,receipt.payload_hash,receipt.receipt));
 const event=original.events[0];db.prepare('INSERT INTO events(id,workspace_id,action,target_type,target_id,actor_id,command_id,at,details) VALUES(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),event.workspace_id,'independent.derivative.constraint','workspace',event.workspace_id,event.actor_id,null,new Date().toISOString(),JSON.stringify({syntheticDerivativeOnly:true}));assert.ok(db.prepare('SELECT max(seq) n FROM events').get().n>original.sequence);
 }finally{db.close();}
 assert.deepEqual(stateFromFile(r.databasePath),original);assert.throws(()=>new HqStore({...s.options,filePath:r.databasePath}),e=>e.code==='inert_restore');
});
