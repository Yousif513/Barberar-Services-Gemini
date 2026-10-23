import {DatabaseSync} from 'node:sqlite';
import {LIMITS,INERT_APPLICATION_ID,canonical,digest,exactKeys,isUuid,isHash,parseJson,refuse} from './common.mjs';
export const TABLES=Object.freeze({
 workspaces:['id','actor_id','created_at'],sessions:['token_hash','workspace_id','actor_id','expires_at'],
 records:['workspace_id','kind','id','revision','body'],record_versions:['workspace_id','kind','id','revision','body','created_at'],
 commands:['workspace_id','id','payload_hash','receipt'],events:['seq','id','workspace_id','action','target_type','target_id','actor_id','command_id','at','details']
});
const definitions=[
 ['table','workspaces','CREATE TABLE workspaces(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,created_at TEXT NOT NULL)'],
 ['table','sessions','CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),actor_id TEXT NOT NULL,expires_at TEXT NOT NULL)'],
 ['table','records','CREATE TABLE records(workspace_id TEXT NOT NULL REFERENCES workspaces(id),kind TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(workspace_id,kind,id))'],
 ['table','record_versions','CREATE TABLE record_versions(workspace_id TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(workspace_id,kind,id,revision))'],
 ['table','commands','CREATE TABLE commands(workspace_id TEXT NOT NULL,id TEXT NOT NULL,payload_hash TEXT NOT NULL,receipt TEXT NOT NULL,PRIMARY KEY(workspace_id,id))'],
 ['table','events','CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,workspace_id TEXT NOT NULL,action TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT NOT NULL,actor_id TEXT NOT NULL,command_id TEXT,at TEXT NOT NULL,details TEXT NOT NULL)'],
 ['index','records_kind','CREATE INDEX records_kind ON records(workspace_id,kind)'],
 ['index','records_project_parent',"CREATE INDEX records_project_parent ON records(workspace_id,kind,json_extract(body,'$.projectId'))"],
 ['index','events_target','CREATE INDEX events_target ON events(workspace_id,target_type,target_id,seq)'],
 ...['record_versions','commands','events'].flatMap(table=>['update','delete'].map(action=>['trigger',`${table}_no_${action}`,`CREATE TRIGGER ${table}_no_${action} BEFORE ${action.toUpperCase()} ON ${table} BEGIN SELECT RAISE(ABORT,'immutable history'); END`]))
];
const normalize=sql=>sql.replace(/\bIF NOT EXISTS\s+/gi,'').replace(/\s+/g,' ').replace(/\s*([(),;])\s*/g,'$1').trim().replace(/;$/,'');
const expected=definitions.map(([type,name,sql])=>({type,name,sql:normalize(sql)})).sort((a,b)=>a.name.localeCompare(b.name));
export const SCHEMA_FINGERPRINT=digest(canonical(expected));
// Only this versioned source-only table is accepted; rebuilt packages keep the v1 inert schema.
export const ACCESS_CONTROL_SCHEMA='CREATE TABLE hq_access_state(id INTEGER PRIMARY KEY CHECK(id=1),schema_version INTEGER NOT NULL CHECK(schema_version=1),state TEXT NOT NULL CHECK(json_valid(state)))';
const accessDefinition={type:'table',name:'hq_access_state',sql:normalize(ACCESS_CONTROL_SCHEMA)};
const expectedWithAccess=[...expected,accessDefinition].sort((a,b)=>a.name.localeCompare(b.name));
export function validateSchema(db,{inert=false}={}){
 const rows=db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>({type:r.type,name:r.name,sql:normalize(r.sql||'')})).sort((a,b)=>a.name.localeCompare(b.name));
 const withAccess=!inert&&canonical(rows)===canonical(expectedWithAccess);
 if(!withAccess&&canonical(rows)!==canonical(expected))refuse('unsupported_schema');
 if(withAccess){
  const controls=db.prepare("SELECT id,schema_version,json_type(state) AS shape,length(CAST(state AS BLOB)) AS bytes FROM hq_access_state").all();
  if(controls.length!==1||controls[0].id!==1||controls[0].schema_version!==1||controls[0].shape!=='object'||controls[0].bytes>1024*1024)refuse('unsupported_access_state');
 }
 const appId=db.prepare('PRAGMA application_id').get().application_id;
 if(appId!==(inert?INERT_APPLICATION_ID:0)||db.prepare('PRAGMA user_version').get().user_version!==0)refuse('unsupported_schema');
 if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)refuse('sqlite_integrity_failed');
}
export function captureLogical(db){
 validateSchema(db);const tables={};let count=0;
 for(const[table,columns]of Object.entries(TABLES)){
  if(table==='sessions'){tables[table]=[];continue;}
  const n=db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;if(n>LIMITS.rowsPerTable||(count+=n)>LIMITS.rowsTotal)refuse('row_limit');
  tables[table]=db.prepare(`SELECT ${table==='events'?'':'rowid AS _rowid,'}${columns.join(',')} FROM ${table} ORDER BY ${table==='events'?'seq':'rowid'}`).all().map(r=>({...r}));
 }
 const sequenceRows=db.prepare('SELECT name,seq FROM sqlite_sequence').all();if(sequenceRows.some(r=>r.name!=='events'))refuse('sequence_invalid');
 const sequence=sequenceRows[0]?.seq??0;
 const data={tables,sequence};validateLogical(data);return data;
}
const key=(workspace,kind,id)=>`${workspace}\0${kind}\0${id}`;
const safeInteger=(n,min=0)=>Number.isSafeInteger(n)&&n>=min;
function json(text){if(typeof text!=='string'||Buffer.byteLength(text)>LIMITS.cell)refuse('cell_limit');return parseJson(Buffer.from(text));}
export function validateLogical({tables,sequence}){
 exactKeys(tables,Object.keys(TABLES));if(!safeInteger(sequence))refuse('sequence_invalid');let total=0;
 for(const[table,columns]of Object.entries(TABLES)){
  const rows=tables[table];if(!Array.isArray(rows)||rows.length>LIMITS.rowsPerTable||(total+=rows.length)>LIMITS.rowsTotal)refuse('row_limit');
  let prior=0;
  for(const row of rows){exactKeys(row,table==='events'?columns:['_rowid',...columns]);const rowid=table==='events'?row.seq:row._rowid;if(!safeInteger(rowid,1)||rowid<=prior)refuse('row_order_invalid');prior=rowid;
   for(const column of columns){const value=row[column];if(value===null&&table==='events'&&column==='command_id')continue;if(['revision','seq'].includes(column)){if(!safeInteger(value,1))refuse('invalid_row');}else if(typeof value!=='string'||Buffer.byteLength(value)>LIMITS.cell)refuse('invalid_row');}
  }
 }
 if(tables.sessions.length)refuse('sessions_forbidden');
 const workspaces=new Map();for(const row of tables.workspaces){if(!isUuid(row.id)||!isUuid(row.actor_id)||workspaces.has(row.id))refuse('workspace_invalid');workspaces.set(row.id,row.actor_id);}
 if(!workspaces.size)refuse('workspace_invalid');
 const records=new Map(),versions=new Map(),sources=new Map(),commands=new Map();
 for(const row of tables.records){if(!workspaces.has(row.workspace_id)||!isUuid(row.id)||!row.kind)refuse('workspace_link_invalid');const k=key(row.workspace_id,row.kind,row.id);if(records.has(k))refuse('duplicate_record');const body=json(row.body);if(body?.id!==row.id)refuse('record_identity_invalid');records.set(k,{row,body});}
 for(const row of tables.record_versions){const k=key(row.workspace_id,row.kind,row.id),rec=records.get(k);if(!rec)refuse('history_orphan');const body=json(row.body);if(body?.id!==row.id)refuse('record_identity_invalid');let list=versions.get(k);if(!list){list=[];versions.set(k,list);}list.push(row);
  if(row.kind==='source'){if(!safeInteger(body.version,1)||typeof body.body!=='string'||!isHash(body.sha256)||digest(body.body)!==body.sha256)refuse('source_hash_invalid');const sk=key(row.workspace_id,'source',`${row.id}/${body.version}/${body.sha256}`);if(sources.has(sk))refuse('source_version_invalid');sources.set(sk,body);}
 }
 for(const[k,{row}]of records){const list=(versions.get(k)||[]).sort((a,b)=>a.revision-b.revision);if(list.length!==row.revision||list.some((v,i)=>v.revision!==i+1)||list.at(-1)?.body!==row.body)refuse('history_incomplete');}
 function reference(workspace,kind,id){if(id===null||id===undefined||id==='')return;if(typeof id!=='string'||!records.has(key(workspace,kind,id)))refuse('record_link_invalid');}
 function sourcePin(workspace,pin){const id=pin.sourceId||pin.id;reference(workspace,'source',id);const source=sources.get(key(workspace,'source',`${id}/${pin.version}/${pin.sha256}`));if(!source)refuse('source_pin_invalid');return source;}
 function walkPins(workspace,value,depth=0){
  if(!value||typeof value!=='object')return;if(depth>LIMITS.depth)refuse('resource_limit');
  if(typeof value.sourceId==='string'&&Object.hasOwn(value,'version')&&Object.hasOwn(value,'sha256')){
   const source=sourcePin(workspace,value);if(Object.hasOwn(value,'quote')){if(!safeInteger(value.start)||!safeInteger(value.end,1)||value.end<=value.start||value.end>source.body.length||source.body.slice(value.start,value.end)!==value.quote)refuse('citation_invalid');}
  }
  for(const[k,v]of Object.entries(value)){
   if(['dependencyPins','sources'].includes(k)&&Array.isArray(v))for(const pin of v)if(pin&&typeof pin==='object'&&Object.hasOwn(pin,'version')&&Object.hasOwn(pin,'sha256'))sourcePin(workspace,pin);
   if(v&&typeof v==='object')walkPins(workspace,v,depth+1);
  }
 }
 function invariants(workspace,kind,body){
  // Opaque kinds are retained without interpreting unknown application semantics.
  if(!['task','source','recommendation','decision','followup','project','milestone','project-closure','meeting','council-packet','council-classification'].includes(kind))return;
  for(const[field,target]of Object.entries({taskId:'task',recommendationId:'recommendation',decisionId:'decision',projectId:'project',milestoneId:'milestone',meetingId:'meeting',currentRecommendationId:'recommendation',currentClosureId:'project-closure'}))if(Object.hasOwn(body,field))reference(workspace,target,body[field]);
  for(const[field,target]of Object.entries({sourceIds:'source',taskIds:'task',dependencyIds:'milestone'}))if(Object.hasOwn(body,field)){if(!Array.isArray(body[field]))refuse('record_link_invalid');for(const id of body[field])reference(workspace,target,id);}
  walkPins(workspace,body);
  if(kind==='source'&&digest(body.body)!==body.sha256)refuse('source_hash_invalid');
  if(kind==='recommendation'){const unhashed={...body};delete unhashed.hash;if(digest(canonical(unhashed))!==body.hash)refuse('recommendation_hash_invalid');}
  if(kind==='decision'){
   const recommendation=records.get(key(workspace,'recommendation',body.recommendationId))?.body;
   if(recommendation?.hash!==body.recommendationHash||recommendation?.decisionId!==body.id||recommendation?.taskId!==body.taskId)refuse('decision_link_invalid');
   if(body.scope?.financialExecution!==false||body.scope?.employeeActivation!==false||body.scope?.businessPermissions!==false||body.scope?.environment!=='local')refuse('authority_not_local');
  }
  if(kind==='council-classification'){
   const source=sourcePin(workspace,body);if(!source||!['corporate-internal','private-founder','restricted'].includes(body.classification)||!Array.isArray(body.dependencyPins))refuse('classification_invalid');
  }
  if(kind==='milestone'){for(const id of body.dependencyIds||[])if(records.get(key(workspace,'milestone',id))?.body.projectId!==body.projectId)refuse('milestone_link_invalid');}
  if(kind==='meeting'){
   for(const handoff of body.handoffs||[]){reference(workspace,'task',handoff.taskId);reference(workspace,'council-packet',handoff.packetId);}
   const ids=new Set((body.notes||[]).map(n=>n.id));for(const note of body.notes||[])if(note.supersedesId&&!ids.has(note.supersedesId))refuse('note_correction_invalid');
  }
 }
 for(const[k,{row,body}]of records){invariants(row.workspace_id,row.kind,body);for(const version of versions.get(k)||[])invariants(row.workspace_id,row.kind,json(version.body));}
 // Restriction provenance may grow, but a restricted/private source is never downgraded.
 const labels=new Map();for(const row of tables.records.filter(r=>r.kind==='council-classification')){const label=json(row.body),k=key(row.workspace_id,'source',label.sourceId),past=labels.get(k)||{restricted:false,pins:[]};if(past.restricted&&label.classification==='corporate-internal')refuse('classification_downgrade');if(past.pins.length&&canonical(past.pins)!==canonical(label.dependencyPins))refuse('classification_pins_changed');labels.set(k,{restricted:past.restricted||label.classification!=='corporate-internal',pins:label.dependencyPins});}
 for(const row of tables.commands){if(!workspaces.has(row.workspace_id)||!isUuid(row.id)||!isHash(row.payload_hash))refuse('command_invalid');const r=json(row.receipt);if(r.commandId!==row.id||r.effect!=='record-only')refuse('receipt_invalid');reference(row.workspace_id,r.entityType,r.entityId);for(const[field,id]of Object.entries(r.recordIds||{})){if(id==null)continue;const kind={closureId:'project-closure',packetId:'council-packet',noteId:null}[field]??field.replace(/Id$/,'');if(field!=='noteId')reference(row.workspace_id,kind,id);}commands.set(`${row.workspace_id}\0${row.id}`,r);}
 let last=0;for(const row of tables.events){if(!workspaces.has(row.workspace_id)||row.actor_id!==workspaces.get(row.workspace_id)||!isUuid(row.id))refuse('event_invalid');json(row.details);if(row.command_id&&!commands.has(`${row.workspace_id}\0${row.command_id}`))refuse('event_command_missing');last=row.seq;}
 const auditedCommands=new Set(tables.events.filter(r=>r.command_id).map(r=>`${r.workspace_id}\0${r.command_id}`));for(const id of commands.keys())if(!auditedCommands.has(id))refuse('command_audit_missing');
 if(sequence<last)refuse('sequence_invalid');
 return {counts:Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,rows.length])),workspaceCount:workspaces.size,sequence,dataDigest:digest(canonical({tables,sequence})),kindCounts:Object.fromEntries([...new Set(tables.records.map(r=>r.kind))].sort().map(kind=>[kind,tables.records.filter(r=>r.kind===kind).length]))};
}
export function validateFixture(db,marker){
 return validateFixtureRows({workspaces:db.prepare('SELECT id,actor_id AS actorId FROM workspaces ORDER BY id').all().map(r=>({...r})),proofs:db.prepare("SELECT workspace_id,body FROM records WHERE kind='recovery-fixture-proof'").all()},marker);
}
export function validateFixtureRows({workspaces,proofs},marker){
 exactKeys(marker,['format','fixtureId','workspaces'],'fixture_marker_invalid');if(marker.format!=='volabi-synthetic-fixture-1'||!isUuid(marker.fixtureId)||!Array.isArray(marker.workspaces)||!marker.workspaces.length||marker.workspaces.length>100)refuse('fixture_marker_invalid');
 for(const row of marker.workspaces){exactKeys(row,['id','actorId'],'fixture_marker_invalid');if(!isUuid(row.id)||!isUuid(row.actorId))refuse('fixture_marker_invalid');}
 const actual=[...workspaces].sort((a,b)=>a.id.localeCompare(b.id));
 if(canonical(actual)!==canonical([...marker.workspaces].sort((a,b)=>a.id.localeCompare(b.id))))refuse('fixture_inventory_mismatch');
 for(const workspace of marker.workspaces){const selected=proofs.filter(r=>r.workspace_id===workspace.id);if(selected.length!==1)refuse('fixture_proof_missing');const proof=json(selected[0].body);exactKeys(proof,['id','fixtureId','workspaceId','actorId','syntheticOnly'],'fixture_proof_invalid');if(proof.fixtureId!==marker.fixtureId||proof.workspaceId!==workspace.id||proof.actorId!==workspace.actorId||proof.syntheticOnly!==true)refuse('fixture_proof_invalid');}
}
export function rebuild(file,data){
 validateLogical(data);const db=new DatabaseSync(file);try{
  db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=DELETE;PRAGMA synchronous=FULL;');
  for(const[type,,sql]of definitions)if(type!=='trigger')db.exec(sql);
  db.exec('BEGIN IMMEDIATE');try{
   for(const[table,columns]of Object.entries(TABLES)){if(table==='sessions')continue;const names=table==='events'?columns:['_rowid',...columns],sqlNames=names.map(n=>n==='_rowid'?'rowid':n);const insert=db.prepare(`INSERT INTO ${table}(${sqlNames.join(',')}) VALUES(${names.map(()=>'?').join(',')})`);for(const row of data.tables[table])insert.run(...names.map(n=>row[n]));}
   db.prepare("DELETE FROM sqlite_sequence WHERE name='events'").run();db.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)').run('events',data.sequence);db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  for(const[type,,sql]of definitions)if(type==='trigger')db.exec(sql);
  db.exec(`PRAGMA application_id=${INERT_APPLICATION_ID}`);validateSchema(db,{inert:true});
 }finally{db.close();}
}
export function verifyRebuilt(file,data){
 const db=new DatabaseSync(file,{readOnly:true});try{validateSchema(db,{inert:true});for(const[table,columns]of Object.entries(TABLES)){const rows=db.prepare(`SELECT ${table==='events'?'':'rowid AS _rowid,'}${columns.join(',')} FROM ${table} ORDER BY ${table==='events'?'seq':'rowid'}`).all().map(r=>({...r}));if(canonical(rows)!==canonical(data.tables[table]))refuse('restore_comparison_failed');}if(db.prepare("SELECT seq FROM sqlite_sequence WHERE name='events'").get()?.seq!==data.sequence)refuse('sequence_invalid');return true;}finally{db.close();}
}
