import { randomUUID } from 'node:crypto';
import { HqError, hash, canonical } from './local-boundary.mjs';
const now=()=>new Date().toISOString();
const fail=(code='invalid_input')=>{throw new HqError(code,409);};
const txt=(v,max=4000)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail();return v.trim();};
const rev=(p,n)=>{if(!Number.isInteger(n)||p.revision!==n)fail('stale_revision');};
const ids=(v=[])=>{if(!Array.isArray(v)||v.length>100||new Set(v).size!==v.length||v.some(x=>typeof x!=='string'))fail();return v;};
const all=(s,seat,kind)=>s.db.prepare('SELECT body FROM records WHERE workspace_id=? AND kind=? ORDER BY id').all(seat.workspaceId,kind).map(r=>JSON.parse(r.body));
const milestones=(s,seat,id)=>s.db.prepare("SELECT body FROM records WHERE workspace_id=? AND kind='milestone' AND json_extract(body,'$.projectId')=? ORDER BY id").all(seat.workspaceId,id).map(r=>JSON.parse(r.body));
const closures=(s,seat,id)=>s.db.prepare("SELECT body FROM records WHERE workspace_id=? AND kind='project-closure' AND json_extract(body,'$.projectId')=? ORDER BY json_extract(body,'$.createdAt'),rowid").all(seat.workspaceId,id).map(r=>JSON.parse(r.body));
function fresh(s,seat,c,cache=new Map()){
 if(cache.has(c.id))return cache.get(c.id);cache.set(c.id,false);
 try{
  const task=s.get(seat,'task',c.taskId),decision=s.get(seat,'decision',c.decisionId);
  if(task.currentRecommendationId!==c.recommendationId||task.revision!==decision.taskRevision||!['pending','approved'].includes(decision.status))return false;
  const current=preview(s,seat,c.projectId,c.milestoneId,false);
  if(current.milestones.some(d=>displayed(s,seat,s.get(seat,'milestone',d.id),cache).status!=='accepted-locally'))return false;
  const valid=c.snapshot.fingerprint===current.fingerprint;cache.set(c.id,valid);return valid;
 }catch{return false;}
}
function displayed(s,seat,p,cache=new Map()){
 if(!['accepted-locally','closure-requested'].includes(p.status))return p;
 const c=p.currentClosureId?s.get(seat,'project-closure',p.currentClosureId):closures(s,seat,p.projectId||p.id).filter(c=>c.milestoneId===(p.projectId?p.id:null)).at(-1);
 return c&&fresh(s,seat,c,cache)?p:{...p,status:'superseded'};
}
export function preview(s,seat,id,mid=null,checks=true){
 const p=s.get(seat,'project',id),ms=milestones(s,seat,id),m=mid?s.get(seat,'milestone',mid):null;if(m&&m.projectId!==p.id)fail('not_found');
 const ts=(m?m.taskIds:p.taskIds).map(id=>s.get(seat,'task',id));
 const ss=[...new Set([...ts.flatMap(t=>t.sourceIds),...(m?m.sourceIds:ms.flatMap(m=>m.sourceIds))])].map(id=>s.get(seat,'source',id));
 const deps=m?m.dependencyIds.map(id=>s.get(seat,'milestone',id)):ms;
 const blockers=[...(m?m.blockers:ms.flatMap(m=>m.blockers))];
 if(!ts.length)blockers.push('tasks_required');if(!ss.length)blockers.push('evidence_required');if(ss.length>12)blockers.push('evidence_limit');
 if(checks)for(const d of deps)if(displayed(s,seat,d).status!=='accepted-locally')blockers.push(`milestone:${d.id}`);
 const core={projectId:p.id,milestoneId:m?.id||null,projectRevision:p.revision,milestoneRevision:m?.revision||null,criteria:m?m.acceptance:p.acceptance,tasks:ts.map(t=>({id:t.id,revision:t.revision,title:t.title,status:t.status})),sources:ss.map(x=>({id:x.id,version:x.version,sha256:x.sha256,title:x.title})),milestones:deps.map(d=>({id:d.id,revision:d.revision,title:d.title,status:d.status}))};
 // Operational task status is not evidence of completion. Revisions and exact source versions are the acceptance material.
 const material={...core,tasks:core.tasks.map(({id,revision})=>({id,revision})),milestones:core.milestones.map(({id,revision})=>({id,revision}))};
 return {...core,blockers,fingerprint:hash(canonical(material)),ready:blockers.length===0};
}
function changed(s,seat,p,commandId,action,details={}){const next={...p,revision:p.revision+1,status:'tracking',updatedAt:now()};s.put(seat,'project',next);s.audit(seat,action,'project',p.id,commandId,{revision:next.revision,...details});return next;}
export function linkTask(s,seat,p,taskId,commandId,reason){s.get(seat,'task',taskId);if(p.taskIds.includes(taskId))fail('duplicate_link');if(p.taskIds.length>=100)fail();return changed(s,seat,{...p,taskIds:[...p.taskIds,taskId]},commandId,'project.task.linked',{taskId,reason});}
export function projectCommand(s,seat,type,p,n,commandId){
 const fields={
 'project.create':['title','objective','acceptance','ownerId'],
 'project.revise':['projectId','title','objective','acceptance','ownerId','reason'],
 'project.start':['projectId'],
 'project.reopen':['projectId','milestoneId','reason'],
 'project.task.link':['projectId','taskId','reason'],
 'project.task.unlink':['projectId','taskId','reason'],
 'milestone.create':['projectId','title','outcome','acceptance','taskIds','dependencyIds','sourceIds','blockers','dueDate'],
 'milestone.revise':['projectId','milestoneId','title','outcome','acceptance','taskIds','dependencyIds','sourceIds','blockers','dueDate','reason'],
 'project.closure.prepare':['projectId','milestoneId','reason','fingerprint']};
 if(!fields[type]||Object.keys(p).some(k=>!fields[type].includes(k)))fail();

 if(type==='project.create'){
 const at=now(),row=s.put(seat,'project',{id:randomUUID(),revision:1,title:txt(p.title,180),objective:txt(p.objective),acceptance:txt(p.acceptance),ownerId:s.validateOwner(p.ownerId||'development-preparer'),taskIds:[],status:'planning',createdAt:at,updatedAt:at});s.audit(seat,type,'project',row.id,commandId,{revision:1});return receipt(row);
 }
 const project=s.get(seat,'project',p.projectId);rev(project,n);let next=project,mid;
 if(type==='project.revise'){const fields={};for(const k of ['title','objective','acceptance'])if(Object.hasOwn(p,k))fields[k]=txt(p[k],k==='title'?180:4000);if(Object.hasOwn(p,'ownerId'))fields.ownerId=s.validateOwner(p.ownerId);next=changed(s,seat,{...project,...fields},commandId,type,{reason:p.reason===undefined?'Material revision':txt(p.reason)});}
 else if(type==='project.start'){if(!['planning','superseded'].includes(displayed(s,seat,project).status))fail('invalid_transition');next=changed(s,seat,project,commandId,type);}
 else if(type==='project.task.link'){next=linkTask(s,seat,project,p.taskId,commandId,txt(p.reason));}
 else if(type==='project.task.unlink'){txt(p.reason);if(!project.taskIds.includes(p.taskId))fail('not_found');if(milestones(s,seat,project.id).some(m=>m.taskIds.includes(p.taskId)))fail('milestone_task_in_use');next=changed(s,seat,{...project,taskIds:project.taskIds.filter(id=>id!==p.taskId)},commandId,type,{taskId:p.taskId,reason:p.reason});}
 else if(type==='milestone.create'||type==='milestone.revise'){
 const old=type==='milestone.revise'?s.get(seat,'milestone',p.milestoneId):null;if(old&&old.projectId!==project.id)fail('not_found');mid=old?.id||randomUUID();const v={...old,...p};const taskIds=ids(v.taskIds),dependencyIds=ids(v.dependencyIds),sourceIds=ids(v.sourceIds);if(taskIds.some(id=>!project.taskIds.includes(id)))fail('invalid_link');for(const id of taskIds)s.get(seat,'task',id);for(const id of sourceIds)s.get(seat,'source',id);
 const graph=new Map(milestones(s,seat,project.id).map(m=>[m.id,m.dependencyIds]));graph.set(mid,dependencyIds);for(const id of dependencyIds)if(!graph.has(id))fail('not_found');const colors=new Map();const visit=id=>{if(colors.get(id)===1)fail('dependency_cycle');if(colors.get(id)===2)return;colors.set(id,1);for(const next of graph.get(id)||[])visit(next);colors.set(id,2);};visit(mid);
 if(!Array.isArray(v.blockers||[])||(v.blockers||[]).length>30)fail();const blockers=(v.blockers||[]).map(x=>txt(x,500));const dueDate=v.dueDate||null;if(dueDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||Number.isNaN(Date.parse(dueDate))||new Date(dueDate).toISOString().slice(0,10)!==dueDate))fail();
 s.put(seat,'milestone',{id:mid,projectId:project.id,revision:(old?.revision||0)+1,title:txt(v.title,180),outcome:txt(v.outcome),acceptance:txt(v.acceptance),taskIds,dependencyIds,sourceIds,blockers,dueDate,status:'tracking',createdAt:old?.createdAt||now(),updatedAt:now()});next=changed(s,seat,project,commandId,type,{milestoneId:mid,reason:p.reason===undefined?'Milestone definition':txt(p.reason)});
 }
 else if(type==='project.reopen'){const reason=txt(p.reason);mid=p.milestoneId||null;if(mid){const m=s.get(seat,'milestone',mid);if(m.projectId!==project.id)fail('not_found');s.put(seat,'milestone',{...m,revision:m.revision+1,status:'tracking',updatedAt:now()});}next=changed(s,seat,project,commandId,type,{milestoneId:mid,reason});}
 else if(type==='project.closure.prepare'){
 const reason=txt(p.reason);mid=p.milestoneId||null;const snap=preview(s,seat,project.id,mid);if(p.fingerprint!==undefined&&p.fingerprint!==snap.fingerprint)fail('stale_recommendation');if(!snap.ready)fail('evidence_required');const target=mid?s.get(seat,'milestone',mid):project;if(['closure-requested','accepted-locally'].includes(displayed(s,seat,target).status))fail('invalid_transition');
 const task=s.createTask(seat,{title:target.title,request:reason,outcome:mid?target.outcome:target.objective,acceptance:target.acceptance,limits:'Local acceptance record only; no activation, permissions, money or deployment.',sourceIds:snap.sources.map(x=>x.id)},commandId);const body=s.preparePayload(seat,task);body.summary=`Local acceptance evidence only. Criteria: ${snap.criteria}\nProject revision: ${snap.projectRevision}; milestone revision: ${snap.milestoneRevision||"none"}. Exact immutable snapshot fingerprint: ${snap.fingerprint}. The project closure history retains all bound task revisions and source hashes. No task completion, independent review, employee activation or business execution is inferred.`;
 const result=s.publish(seat,task,body,commandId,'evidence-preparation');const c=s.put(seat,'project-closure',{id:randomUUID(),projectId:project.id,milestoneId:mid,snapshot:snap,taskId:task.id,recommendationId:result.recordIds.recommendationId,decisionId:result.recordIds.decisionId,createdAt:now()});s.put(seat,mid?'milestone':'project',{...target,status:'closure-requested',currentClosureId:c.id,updatedAt:now()});s.audit(seat,type,'project',project.id,commandId,{closureId:c.id,fingerprint:snap.fingerprint,reason});return {...result,recordIds:{...result.recordIds,projectId:project.id,milestoneId:mid,closureId:c.id}};
 }else fail();return {...receipt(next),recordIds:{projectId:next.id,...(mid?{milestoneId:mid}:{})}};
}
const receipt=p=>({entityType:'project',entityId:p.id,revision:p.revision,recordIds:{projectId:p.id}});
export function projectFollowup(s,seat,decision){const c=all(s,seat,'project-closure').find(c=>c.decisionId===decision.id);if(c&&(!fresh(s,seat,c)||!preview(s,seat,c.projectId,c.milestoneId).ready))fail('stale_recommendation');}
export function projectDecision(s,seat,decision,choice,commandId){const c=all(s,seat,'project-closure').find(c=>c.decisionId===decision.id);if(!c)return;if(!fresh(s,seat,c)||!preview(s,seat,c.projectId,c.milestoneId).ready)fail('stale_recommendation');const kind=c.milestoneId?'milestone':'project',id=c.milestoneId||c.projectId,row=s.get(seat,kind,id);if(row.status!=='closure-requested')fail('stale_recommendation');s.put(seat,kind,{...row,status:choice==='approve'?'accepted-locally':'tracking',updatedAt:now()});s.audit(seat,'project.closure.decided','project',c.projectId,commandId,{closureId:c.id,decisionId:decision.id,choice,fingerprint:c.snapshot.fingerprint});}
export function projectQuery(s,seat,view,o){
 if(view==='project-preview')return preview(s,seat,o.id,o.milestoneId||null);
 if(view==='project'){const p=s.get(seat,'project',o.id),ms=milestones(s,seat,p.id),ts=p.taskIds.map(id=>s.get(seat,'task',id)),ss=[...new Set([...ts.flatMap(t=>t.sourceIds),...ms.flatMap(m=>m.sourceIds)])].map(id=>s.get(seat,'source',id));return{project:displayed(s,seat,p),milestones:ms.map(m=>displayed(s,seat,m)),tasks:ts,sources:ss,closures:closures(s,seat,p.id),events:s.events(seat,'project',p.id),versions:s.db.prepare("SELECT body FROM record_versions WHERE workspace_id=? AND kind='project' AND id=? ORDER BY revision").all(seat.workspaceId,p.id).map(r=>JSON.parse(r.body))};}
 const {q='',status='',ownerId='',sort='updated',page=0}=o;if(typeof q!=='string'||q.length>200||typeof status!=='string'||status.length>80||typeof ownerId!=='string'||ownerId.length>100||!['created','updated','title'].includes(sort)||!Number.isSafeInteger(Number(page))||Number(page)<0||Number(page)>100000)fail();
 const terms=[seat.workspaceId];let where="workspace_id=? AND kind='project'";
 if(q){where+=" AND (instr(lower(json_extract(body,'$.title')),lower(?))>0 OR instr(lower(json_extract(body,'$.objective')),lower(?))>0)";terms.push(q,q);}
 if(status){where+=" AND json_extract(body,'$.status')=?";terms.push(status);}
 if(ownerId){where+=" AND json_extract(body,'$.ownerId')=?";terms.push(ownerId);}
 const count=s.db.prepare("SELECT count(*) total, sum(CASE WHEN json_extract(body,'$.status')='accepted-locally' THEN 1 ELSE 0 END) accepted FROM records WHERE workspace_id=? AND kind='project'").get(seat.workspaceId);
 const total=s.db.prepare(`SELECT count(*) n FROM records WHERE ${where}`).get(...terms).n;
 const order={created:"json_extract(body,'$.createdAt') DESC,id DESC",updated:"json_extract(body,'$.updatedAt') DESC,id DESC",title:"json_extract(body,'$.title') COLLATE NOCASE,id"}[sort];
 const items=s.db.prepare(`SELECT body FROM records WHERE ${where} ORDER BY ${order} LIMIT 25 OFFSET ?`).all(...terms,Number(page)*25).map(r=>JSON.parse(r.body));
 return{items,total,page:Number(page),pageSize:25,counts:{open:count.total-(count.accepted||0),accepted:count.accepted||0}};
}

export function refreshProjects(s,seat,commandId){
 const rows=s.db.prepare("SELECT kind,body FROM records WHERE workspace_id=? AND kind IN ('project','milestone') AND json_extract(body,'$.status') IN ('accepted-locally','closure-requested')").all(seat.workspaceId);
 for(const row of rows){const value=JSON.parse(row.body),qualified=displayed(s,seat,value);if(qualified.status!==value.status){s.put(seat,row.kind,{...qualified,updatedAt:now()});s.audit(seat,'project.acceptance.superseded','project',value.projectId||value.id,commandId,{targetId:value.id,previousStatus:value.status,closureId:value.currentClosureId||null});}}
}
