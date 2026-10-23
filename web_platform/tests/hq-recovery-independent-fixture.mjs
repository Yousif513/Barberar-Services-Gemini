import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {HqStore} from '../src/lib/hq/server/local-store.mjs';

export const digest=v=>createHash('sha256').update(v).digest('hex');
export const tables=['workspaces','sessions','records','record_versions','commands','events'];
export function logicalState(db){
 const sort={workspaces:'id',sessions:'token_hash',records:'workspace_id,kind,id',record_versions:'workspace_id,kind,id,revision',commands:'workspace_id,id',events:'seq'};
 const result=Object.fromEntries(tables.map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY ${sort[table]}`).all().map(row=>({...row}))]));
 result.sequence=db.prepare("SELECT seq FROM sqlite_sequence WHERE name='events'").get()?.seq??0;
 return result;
}
export const command=(s,type,payload,expectedRevision)=>s.store.command(s.seat,{commandId:randomUUID(),type,payload,...(expectedRevision===undefined?{}:{expectedRevision})});
const source=(s,title,body)=>command(s,'source.add',{title,body,provenance:{uri:'current-session:independent-recovery',locator:'synthetic acceptance',authorKind:'human'}}).entityId;
const cite=(s,id)=>{const x=s.store.query(s.seat,'source',{id}).source;return {sourceId:id,version:x.version,sha256:x.sha256,start:0,end:x.body.length,quote:x.body};};
const classify=(s,id,label)=>{const c=cite(s,id);command(s,'council.source.classify',{sourceId:id,version:c.version,sha256:c.sha256,classification:label,reason:'Synthetic classification acceptance'},c.version);};
const meeting=(s,id)=>s.store.query(s.seat,'meeting',{id}).meeting;
const act=(s,id,type,fields)=>command(s,type,{meetingId:id,...fields},meeting(s,id).revision);
const approve=(s,id)=>{const d=s.store.query(s.seat,'decision',{id});return command(s,'decision.record',{decisionId:id,recommendationHash:d.recommendation.hash,choice:'approve',reason:'Synthetic local record confirmation only'},d.task.revision);};
function packet(s,id,phase){const p=s.store.query(s.seat,'meeting-preview',{id,phase});return act(s,id,'council.prepare',{phase,fingerprint:p.fingerprint,reason:'Synthetic exact snapshot'});}
export function makeFixture(t,{rich=true,opaque=false}={}){
 const root=mkdtempSync(path.join(tmpdir(),'hq-recovery-independent-'));
 const fixtureRoot=path.join(root,'fixture');mkdirSync(fixtureRoot);
 const options={filePath:path.join(fixtureRoot,'hq.sqlite'),agents:['nora','alexander','adam','omar','layla','daniel'].map(id=>({id,activationStatus:'inactive',skills:[]})),initialSources:[],skills:[]};
 const store=new HqStore(options),seat=store.createSession(),other=store.createSession(),fixtureId=randomUUID();
 const s={root,fixtureRoot,store,seat,other,fixtureId,options,close(){if(!this.closed){this.store.close();this.closed=true;}}};
 t.after(()=>{s.close();assert.ok(root.startsWith(path.join(tmpdir(),'hq-recovery-independent-')));rmSync(root,{recursive:true,force:true});});
 writeFileSync(path.join(fixtureRoot,'fixture.json'),JSON.stringify({format:'volabi-synthetic-fixture-1',fixtureId,workspaces:[seat,other].map(a=>({id:a.workspaceId,actorId:a.actorId}))}));
 for(const a of [seat,other])store.put(a,'recovery-fixture-proof',{id:randomUUID(),fixtureId,workspaceId:a.workspaceId,actorId:a.actorId,syntheticOnly:true});
 s.secondary=source({...s,seat:other},'Synthetic second workspace canary','Independent neighbour remains a separate workspace.');
 s.body='مراجعة محلية 😀\r\nEnglish evidence remains exact.\r\nRefunds stay held.';
 s.sourceId=source(s,'Synthetic multilingual source',s.body);
 if(rich){
  s.privateId=source(s,'Synthetic founder private','Founder-private fixture evidence.');classify(s,s.privateId,'private-founder');
  s.restrictedId=source(s,'Synthetic restricted','Restricted fixture evidence.');classify(s,s.restrictedId,'restricted');
  s.unknownId=source(s,'Synthetic unclassified','Unknown classification fixture evidence.');
  classify(s,s.sourceId,'corporate-internal');
  s.projectId=command(s,'project.create',{title:'Synthetic recovery initiative',objective:'Recover historical evidence',acceptance:'Exact immutable snapshots',ownerId:'alexander'}).entityId;
  let p=store.query(seat,'project',{id:s.projectId}).project;
  const taskPayload={title:'Synthetic multilingual review',request:'Inspect Arabic and English evidence',outcome:'Source linked recommendation',acceptance:'Preserve exact UTF-16 citations',limits:'Local record only',sourceIds:[s.sourceId],projectId:s.projectId,projectRevision:p.revision};
  s.taskEnvelope={commandId:randomUUID(),type:'task.create',payload:taskPayload};
  const tr=store.command(seat,s.taskEnvelope);s.taskId=tr.entityId;assert.deepEqual(store.command(seat,s.taskEnvelope),tr);
  assert.throws(()=>store.command(seat,{...s.taskEnvelope,payload:{...taskPayload,title:'Conflicting synthetic title'}}),e=>e.code==='command_conflict');
  const rr=command(s,'recommendation.publish',{taskId:s.taskId,title:'Synthetic recommendation',summary:'Review cited source exactly',nextStep:'Founder decision record only',citations:[cite(s,s.sourceId)]},1);approve(s,rr.recordIds.decisionId);
  command(s,'followup.record',{taskId:s.taskId,decisionId:rr.recordIds.decisionId,note:'Synthetic result recorded',nextAction:'No business action'},1);
  p=store.query(seat,'project',{id:s.projectId}).project;
  s.milestoneId=command(s,'milestone.create',{projectId:s.projectId,title:'Synthetic evidence milestone',outcome:'Record fidelity',acceptance:'Exact bytes',taskIds:[s.taskId],sourceIds:[s.sourceId],dependencyIds:[],blockers:[]},p.revision).recordIds.milestoneId;
  for(const milestoneId of [s.milestoneId,null]){p=store.query(seat,'project',{id:s.projectId}).project;const r=command(s,'project.closure.prepare',{projectId:s.projectId,milestoneId,reason:'Synthetic acceptance'},p.revision);approve(s,r.recordIds.decisionId);}
  s.meetingId=command(s,'council.create',{title:'Synthetic Council recovery',purpose:'Retain original meaning',questions:'Which evidence remains valid?',agenda:[{id:'evidence',title:'Exact evidence'}],coordinatorId:'nora',projectId:s.projectId}).entityId;
  act(s,s.meetingId,'council.participants',{participants:[{agentId:'adam',contribution:'Independent challenge proposed, never attendance',skillRequirements:[{skillId:'primora-business-strategy',version:'1.0.0',sha256:'a'.repeat(64)}]}]});
  act(s,s.meetingId,'council.materials',{materials:[{...cite(s,s.sourceId),agendaId:'evidence'}]});
  const prep=packet(s,s.meetingId,'preparation');approve(s,prep.recordIds.decisionId);
  const dissent=act(s,s.meetingId,'council.note',{kind:'dissent',body:'Synthetic objection: incomplete corroboration.',citations:[cite(s,s.sourceId)]});
  act(s,s.meetingId,'council.minutes',{body:'Synthetic minutes preserve dissent; no attendance claimed.',reason:'First operator record'});
  const minutes=packet(s,s.meetingId,'minutes');approve(s,minutes.recordIds.decisionId);
  s.minutesDecisionId=minutes.recordIds.decisionId;
  act(s,s.meetingId,'council.correct',{noteId:dissent.recordIds.noteId,body:'Qualified synthetic objection remains unresolved.',reason:'Clarified objection'});
  act(s,s.meetingId,'council.correct',{body:'Corrected synthetic minutes retain dissent.',reason:'Qualification'});
  act(s,s.meetingId,'council.cancel',{reason:'Synthetic cancellation'});act(s,s.meetingId,'council.reopen',{reason:'Synthetic explicit reopening'});
  command(s,'source.correct',{sourceId:s.sourceId,body:s.body+'\r\nA later correction keeps the earlier exact source version.',reason:'Synthetic corrected evidence'},1);
  assert.equal(store.query(seat,'project',{id:s.projectId}).project.status,'superseded');
  assert.equal(store.query(seat,'meeting',{id:s.meetingId}).meeting.minutesStatus,'superseded');
  for(let i=0;i<110;i++)store.audit(seat,'independent.synthetic.check','task',s.taskId,null,{index:i});
 }
 if(opaque){s.opaqueId=randomUUID();store.put(seat,'independent-future-kind',{id:s.opaqueId,meaning:'Opaque supported-schema record survives without interpretation',text:'عربي 😀\r\nExact unknown kind'});}
 s.before=logicalState(store.db);s.expected={...s.before,sessions:[]};
 return s;
}
