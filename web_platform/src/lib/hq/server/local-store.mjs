import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { HqError, hash, canonical, csrfForSession } from "./local-boundary.mjs";
const now = () => new Date().toISOString();
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const text = (value, max = 4000, optional = false) => {
  if (optional && (value === undefined || value === null)) return "";
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new HqError("invalid_input");
  return value.trim();
};
const sourceBody = value => {
  if (typeof value !== "string" || !value.trim() || value.length > 200000) throw new HqError("invalid_input");
  return value;
};
const ensureRevision = (actual, expected) => { if (!Number.isInteger(expected) || actual !== expected) throw new HqError("stale_revision", 409); };
const scope = () => ({ environment:"local", effects:["record-only"], employeeActivation:false, businessPermissions:false, financialExecution:false });
const allowedKinds = new Set(["task", "source", "recommendation", "decision", "followup"]);
export class HqStore {
  constructor({ filePath, initialSources = [], agents = [], skills = [] }) {
    mkdirSync(path.dirname(filePath), { recursive:true });
    this.db = new DatabaseSync(filePath);
    this.agents = agents; this.skills = skills; this.initialSources = initialSources;
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),actor_id TEXT NOT NULL,expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS records(workspace_id TEXT NOT NULL REFERENCES workspaces(id),kind TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(workspace_id,kind,id));
      CREATE TABLE IF NOT EXISTS record_versions(workspace_id TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(workspace_id,kind,id,revision));
      CREATE TABLE IF NOT EXISTS commands(workspace_id TEXT NOT NULL,id TEXT NOT NULL,payload_hash TEXT NOT NULL,receipt TEXT NOT NULL,PRIMARY KEY(workspace_id,id));
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,workspace_id TEXT NOT NULL,action TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT NOT NULL,actor_id TEXT NOT NULL,command_id TEXT,at TEXT NOT NULL,details TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS records_kind ON records(workspace_id,kind);
      CREATE INDEX IF NOT EXISTS events_target ON events(workspace_id,target_type,target_id,seq);`);
    for (const table of ["record_versions", "commands", "events"]) {
      this.db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_no_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'immutable history'); END;
        CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'immutable history'); END;`);
    }
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  createSession() {
    const token = randomBytes(32).toString("hex"), workspaceId = randomUUID(), actorId = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    this.transaction(() => {
      this.db.prepare("INSERT INTO workspaces VALUES(?,?,?)").run(workspaceId, actorId, now());
      this.db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(hash(token), workspaceId, actorId, expiresAt);
      const session = { workspaceId, actorId };
      for (const source of this.initialSources) this.addSource(session, source, null, true);
      this.audit(session,"workspace.opened","workspace",workspaceId,null,{ mode:"local-development",businessAuthority:false });
    });
    return { ...this.getSession(token), token };
  }
  getSession(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
    const row = this.db.prepare("SELECT * FROM sessions WHERE token_hash=? AND expires_at>?").get(hash(token),now());
    return row ? { workspaceId:row.workspace_id, actorId:row.actor_id, actorLabel:"Local founder review", csrfToken:csrfForSession(token), mode:"local-development", employeesActive:false } : null;
  }
  assertSession(session) {
    if (!session || !uuid(session.workspaceId) || !uuid(session.actorId) || !this.db.prepare("SELECT 1 FROM workspaces WHERE id=? AND actor_id=?").get(session.workspaceId,session.actorId)) throw new HqError("session_required",401);
  }
  get(session, kind, id) {
    if (!allowedKinds.has(kind) || !uuid(id)) throw new HqError("not_found",404);
    const row = this.db.prepare("SELECT body FROM records WHERE workspace_id=? AND kind=? AND id=?").get(session.workspaceId,kind,id);
    if (!row) throw new HqError("not_found",404);
    return JSON.parse(row.body);
  }
  put(session,kind,value) {
    const old = this.db.prepare("SELECT revision FROM records WHERE workspace_id=? AND kind=? AND id=?").get(session.workspaceId,kind,value.id);
    const revision = old ? old.revision + 1 : 1, body = canonical(value);
    this.db.prepare("INSERT INTO records VALUES(?,?,?,?,?) ON CONFLICT(workspace_id,kind,id) DO UPDATE SET revision=excluded.revision,body=excluded.body").run(session.workspaceId,kind,value.id,revision,body);
    this.db.prepare("INSERT INTO record_versions VALUES(?,?,?,?,?,?)").run(session.workspaceId,kind,value.id,revision,body,now());
    return value;
  }
  audit(session,action,kind,id,commandId,details={}) {
    this.db.prepare("INSERT INTO events(id,workspace_id,action,target_type,target_id,actor_id,command_id,at,details) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(randomUUID(),session.workspaceId,action,kind,id,session.actorId,commandId,now(),canonical(details));
  }
  events(session,kind,id) {
    return this.db.prepare("SELECT * FROM events WHERE workspace_id=? AND target_type=? AND target_id=? ORDER BY seq DESC LIMIT 100").all(session.workspaceId,kind,id)
      .map(e=>({id:e.id,seq:e.seq,action:e.action,targetType:e.target_type,targetId:e.target_id,actorId:e.actor_id,commandId:e.command_id,at:e.at,details:JSON.parse(e.details)}));
  }
  related(session,kind,taskId) {
    return this.db.prepare("SELECT body FROM records WHERE workspace_id=? AND kind=? AND json_extract(body,'$.taskId')=? ORDER BY json_extract(body,'$.createdAt')").all(session.workspaceId,kind,taskId).map(r=>JSON.parse(r.body));
  }
  sourceVersions(session,id) {
    this.get(session,"source",id);
    return this.db.prepare("SELECT body FROM record_versions WHERE workspace_id=? AND kind='source' AND id=? ORDER BY revision").all(session.workspaceId,id).map(r=>JSON.parse(r.body));
  }
  addSource(session,p,commandId,seed=false) {
    const body=sourceBody(p.body), title=text(p.title,180), original=p.provenance||{};
    if (!seed && body.length>20000) throw new HqError("invalid_input");
    const uri=text(original.uri,1000), locator=text(original.locator,200), authorKind=text(original.authorKind,80);
    if (!/^(https:\/\/|repo:|current-session:)/.test(uri)) throw new HqError("invalid_input");
    const provenance={uri,locator,authorKind:seed?authorKind:"current-session",status:seed?text(original.status,80):["proposed","current-session"].includes(original.status)?original.status:"proposed",recoveredAt:seed?text(original.recoveredAt,80):now()};
    const source=this.put(session,"source",{id:randomUUID(),version:1,title,body,sha256:hash(body),provenance,createdAt:now()});
    this.audit(session,"source.recorded","source",source.id,commandId,{version:1,sha256:source.sha256,status:provenance.status});
    return source;
  }
  validateSources(session,ids) {
    if (!Array.isArray(ids) || ids.length>12 || new Set(ids).size!==ids.length) throw new HqError("invalid_input");
    return ids.map(id=>this.get(session,"source",id));
  }
  validateOwner(id) { if (id!=="development-preparer" && !this.agents.some(a=>a.id===id)) throw new HqError("invalid_input"); return id; }
  createTask(session,p,commandId) {
    const sources=this.validateSources(session,p.sourceIds||[]), at=now();
    const task=this.put(session,"task",{id:randomUUID(),revision:1,title:text(p.title,180),request:text(p.request),outcome:text(p.outcome,2000),acceptance:text(p.acceptance,2000),ownerId:this.validateOwner(p.ownerId||"development-preparer"),reviewerId:this.validateOwner(p.reviewerId||"development-preparer"),limits:text(p.limits,2000),status:"requested",sourceIds:sources.map(s=>s.id),currentRecommendationId:null,createdAt:at,updatedAt:at});
    this.audit(session,"task.requested","task",task.id,commandId,{revision:task.revision,sourceIds:task.sourceIds,ownerId:task.ownerId});return task;
  }
  validateCitations(session,citations) {
    if (!Array.isArray(citations) || !citations.length || citations.length>12) throw new HqError("invalid_citation");
    return citations.map(c=>{
      const source=this.get(session,"source",c.sourceId);
      if (source.version!==c.version || source.sha256!==c.sha256 || !Number.isInteger(c.start)||!Number.isInteger(c.end)||c.start<0||c.end<=c.start||c.end>source.body.length||c.end-c.start>1200||source.body.slice(c.start,c.end)!==c.quote) throw new HqError("invalid_citation");
      return {sourceId:source.id,version:source.version,sha256:source.sha256,start:c.start,end:c.end,quote:c.quote};
    });
  }
  preparePayload(session,task) {
    const sources=this.validateSources(session,task.sourceIds);
    if (!sources.length) throw new HqError("evidence_required",409);
    const tokens=new Set((`${task.request} ${task.outcome}`.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]).filter(w=>!["the","and","for","with","this","that","from","review"].includes(w)));
    const citations=sources.slice(0,6).map(source=>{
      let start=0,score=-1;
      for (const match of source.body.matchAll(/[^\n]+(?:\n[^\n]+)*/g)) {
        const candidate=match[0].toLowerCase(),value=[...tokens].reduce((n,t)=>n+(candidate.includes(t)?1:0),0);
        if(value>score){score=value;start=match.index;}
      }
      const end=Math.min(source.body.length,start+650);
      return {sourceId:source.id,version:source.version,sha256:source.sha256,start,end,quote:source.body.slice(start,end)};
    });
    const ar=/[\u0600-\u06ff]/.test(task.request);
    return { title:task.title,
      summary:ar?`مذكرة تطوير محلية مستندة إلى المصادر المرفقة. المطلوب: ${task.outcome}. تُعرض المقتطفات الأصلية أدناه للتحقق، ولا تعني تشغيل الموظف المقترح أو تفويض إجراء تجاري.`:`Local source-linked development brief. Requested outcome: ${task.outcome}. Review the exact cited requirements and prepare the requested work within the recorded limits. This brief does not claim that the proposed employee acted or that a business action is authorized.`,
      nextStep:ar?`راجع المقتطفات ومعايير القبول ثم سجّل قرار المراجعة والمتابعة المحلية. الحدود: ${task.limits}`:`Review the cited evidence against the acceptance criteria, record the local review decision, then record its follow-up. Limits: ${task.limits}`,citations};
  }
  publish(session,task,p,commandId,mode) {
    if(!["requested","changes_requested"].includes(task.status))throw new HqError("invalid_transition",409);
    const citations=this.validateCitations(session,p.citations);
    if(citations.some(c=>!task.sourceIds.includes(c.sourceId)))throw new HqError("invalid_citation");
    const rec={id:randomUUID(),taskId:task.id,taskRevision:task.revision,title:text(p.title,180),summary:text(p.summary,8000),nextStep:text(p.nextStep,4000),author:{id:"development-preparer",label:"Development preparer"},mode,citations,createdAt:now(),decisionId:randomUUID()};
    rec.hash=hash(canonical(rec));this.put(session,"recommendation",rec);
    const decision=this.put(session,"decision",{id:rec.decisionId,taskId:task.id,taskRevision:task.revision,recommendationId:rec.id,recommendationHash:rec.hash,status:"pending",reason:"",scope:scope(),createdAt:now(),decidedAt:null,actorId:null});
    this.put(session,"task",{...task,currentRecommendationId:rec.id,status:"awaiting_decision",updatedAt:now()});
    this.audit(session,"recommendation.prepared","task",task.id,commandId,{recommendationId:rec.id,hash:rec.hash,taskRevision:task.revision,sourceVersions:citations.map(c=>({id:c.sourceId,version:c.version,sha256:c.sha256}))});
    this.audit(session,"decision.queued","decision",decision.id,commandId,{recommendationId:rec.id,hash:rec.hash});
    return {entityType:"recommendation",entityId:rec.id,revision:task.revision,recordIds:{taskId:task.id,recommendationId:rec.id,decisionId:decision.id}};
  }
  receipt(session,id) {
    this.assertSession(session);
    if(!uuid(id))throw new HqError("not_found",404);
    const r=this.db.prepare("SELECT receipt FROM commands WHERE workspace_id=? AND id=?").get(session.workspaceId,id);
    if(!r)throw new HqError("not_found",404);return JSON.parse(r.receipt);
  }
  command(session,envelope) {
    this.assertSession(session);
    if(!envelope||!uuid(envelope.commandId)||typeof envelope.type!=="string"||!envelope.payload||Array.isArray(envelope.payload)||typeof envelope.payload!=="object"||Object.keys(envelope).some(k=>!["commandId","type","expectedRevision","payload"].includes(k)))throw new HqError("invalid_input");
    const {commandId,type,payload:p,expectedRevision}=envelope;
    if(["actorId","workspaceId","role","permissions","financialExecution"].some(k=>Object.hasOwn(p,k)))throw new HqError("invalid_input");
    const materialHash=hash(canonical(envelope));
    return this.transaction(()=>{
      const old=this.db.prepare("SELECT * FROM commands WHERE workspace_id=? AND id=?").get(session.workspaceId,commandId);
      if(old){if(old.payload_hash!==materialHash)throw new HqError("command_conflict",409);return JSON.parse(old.receipt);}
      let result;
      if(type==="task.create"){
        const task=this.createTask(session,p,commandId);result={entityType:"task",entityId:task.id,revision:1,recordIds:{taskId:task.id}};
      } else if(type==="task.revise"){
        const task=this.get(session,"task",p.taskId);ensureRevision(task.revision,expectedRevision);
        const next={...task,revision:task.revision+1,status:"requested",currentRecommendationId:null,updatedAt:now()};
        for(const field of ["title","request","outcome","acceptance","limits"])if(Object.hasOwn(p,field))next[field]=text(p[field],field==="title"?180:4000);
        for(const field of ["ownerId","reviewerId"])if(Object.hasOwn(p,field))next[field]=this.validateOwner(p[field]);
        if(Object.hasOwn(p,"sourceIds"))next.sourceIds=this.validateSources(session,p.sourceIds).map(s=>s.id);
        for(const d of this.related(session,"decision",task.id))if(d.status==="pending")this.put(session,"decision",{...d,status:"superseded"});
        this.put(session,"task",next);this.audit(session,"task.revised","task",task.id,commandId,{revision:next.revision});result={entityType:"task",entityId:task.id,revision:next.revision,recordIds:{taskId:task.id}};
      } else if(type==="recommendation.prepare"||type==="recommendation.publish"){
        const task=this.get(session,"task",p.taskId);ensureRevision(task.revision,expectedRevision);
        result=this.publish(session,task,type==="recommendation.prepare"?this.preparePayload(session,task):p,commandId,type==="recommendation.prepare"?"evidence-preparation":"authored-development");
      } else if(type==="decision.record"){
        const decision=this.get(session,"decision",p.decisionId),task=this.get(session,"task",decision.taskId),rec=this.get(session,"recommendation",decision.recommendationId);
        ensureRevision(task.revision,expectedRevision);
        if(decision.status!=="pending"||task.currentRecommendationId!==rec.id||rec.taskRevision!==task.revision||p.recommendationHash!==rec.hash||decision.recommendationHash!==rec.hash)throw new HqError("stale_recommendation",409);
        for(const c of rec.citations){const source=this.get(session,"source",c.sourceId);if(source.version!==c.version||source.sha256!==c.sha256)throw new HqError("stale_source",409);}
        const states={approve:"approved",decline:"declined",request_changes:"changes_requested"};if(!Object.hasOwn(states,p.choice))throw new HqError("invalid_input");
        const status=states[p.choice];this.put(session,"decision",{...decision,status,reason:text(p.reason,4000),decidedAt:now(),actorId:session.actorId});
        this.put(session,"task",{...task,status:status==="approved"?"approved_for_followup":status,updatedAt:now()});
        this.audit(session,"decision.recorded","decision",decision.id,commandId,{status,recommendationHash:rec.hash,taskRevision:task.revision,effect:"record-only"});
        this.audit(session,"task.decided","task",task.id,commandId,{decisionId:decision.id,status});result={entityType:"decision",entityId:decision.id,revision:task.revision,recordIds:{taskId:task.id,decisionId:decision.id}};
      } else if(type==="followup.record"){
        const task=this.get(session,"task",p.taskId),decision=this.get(session,"decision",p.decisionId);ensureRevision(task.revision,expectedRevision);
        if(decision.taskId!==task.id||decision.recommendationId!==task.currentRecommendationId||decision.taskRevision!==task.revision||!["approved","declined","changes_requested"].includes(decision.status))throw new HqError("invalid_transition",409);
        const recommendation=this.get(session,"recommendation",decision.recommendationId);
        if(recommendation.hash!==decision.recommendationHash)throw new HqError("stale_recommendation",409);
        for(const c of recommendation.citations){const source=this.get(session,"source",c.sourceId);if(source.version!==c.version||source.sha256!==c.sha256)throw new HqError("stale_source",409);}
        const followup=this.put(session,"followup",{id:randomUUID(),taskId:task.id,decisionId:decision.id,note:text(p.note),nextAction:text(p.nextAction),status:"recorded",actorId:session.actorId,createdAt:now()});
        this.put(session,"task",{...task,status:"followup_recorded",updatedAt:now()});this.audit(session,"followup.recorded","task",task.id,commandId,{followupId:followup.id,decisionId:decision.id});result={entityType:"followup",entityId:followup.id,revision:task.revision,recordIds:{taskId:task.id,followupId:followup.id,decisionId:decision.id}};
      } else if(type==="source.add"){
        const source=this.addSource(session,p,commandId);result={entityType:"source",entityId:source.id,revision:source.version,recordIds:{sourceId:source.id}};
      } else if(type==="source.correct"){
        const source=this.get(session,"source",p.sourceId);ensureRevision(source.version,expectedRevision);
        const body=sourceBody(p.body);if(body.length>20000)throw new HqError("invalid_input");const correctionReason=text(p.reason);const next=this.put(session,"source",{...source,version:source.version+1,body,sha256:hash(body),provenance:{...source.provenance,status:"proposed-correction",authorKind:"local-reviewer",recoveredAt:now()},supersedesVersion:source.version,correctionReason,createdAt:now()});
        this.audit(session,"source.correction_proposed","source",source.id,commandId,{version:next.version,previousVersion:source.version,sha256:next.sha256});result={entityType:"source",entityId:source.id,revision:next.version,recordIds:{sourceId:source.id}};
      } else if(type==="proposal.create"){
        if(!["skill-change","evaluation","meeting"].includes(p.kind))throw new HqError("invalid_input");this.validateOwner(p.agentId);
        const reason=text(p.reason),plan=text(p.plan),limits=text(p.limits),skill=p.skillId?text(p.skillId,100):"";
        if(p.kind!=="meeting"&&!skill)throw new HqError("invalid_input");
        const title=`${p.kind}: ${p.agentId}${skill?` / ${skill}`:""}`;
        const task=this.createTask(session,{title,request:reason,outcome:plan,acceptance:"Review exact proposal, dependencies and limits; no employee/business execution",ownerId:p.agentId,reviewerId:"development-preparer",limits,sourceIds:p.sourceIds||[]},commandId);
        const prepared=this.preparePayload(session,task);prepared.summary=`${reason}\n\n${plan}\n\nProposed change: ${p.change||p.kind}. Version/hash: ${p.versionOrHash||"not specified"}. Limits: ${limits}. Approval records this proposal only; no binding, invitation, recording or evaluation is executed.`;
        result=this.publish(session,task,prepared,commandId,"authored-development");
      } else throw new HqError("invalid_input");
      const receipt={commandId,type,...result,effect:"record-only",recordedAt:now()};
      this.db.prepare("INSERT INTO commands VALUES(?,?,?,?)").run(session.workspaceId,commandId,materialHash,canonical(receipt));return receipt;
    });
  }
  list(session,kind,{q="",status="",page=0,limit=25}={}) {
    if(!allowedKinds.has(kind)||!Number.isSafeInteger(Number(page))||Number(page)<0||Number(page)>100000||typeof q!=="string"||q.length>200||typeof status!=="string"||status.length>80)throw new HqError("invalid_input");
    const terms=[session.workspaceId,kind];let where="workspace_id=? AND kind=?";
    if(q){where+=" AND (instr(lower(json_extract(body,'$.title')),lower(?))>0 OR instr(lower(json_extract(body,'$.request')),lower(?))>0)";terms.push(q,q);}
    if(status){where+=" AND json_extract(body,'$.status')=?";terms.push(status);}
    const total=this.db.prepare(`SELECT count(*) n FROM records WHERE ${where}`).get(...terms).n;
    const items=this.db.prepare(`SELECT body FROM records WHERE ${where} ORDER BY json_extract(body,'$.createdAt') DESC,id DESC LIMIT ? OFFSET ?`).all(...terms,limit,Number(page)*limit).map(r=>JSON.parse(r.body));
    return {items,total,page:Number(page),pageSize:limit};
  }
  query(session,view,options={}) {
    this.assertSession(session);let data;
    if(view==="overview"){
      const tasks=this.list(session,"task",{limit:5}),decisions=this.list(session,"decision",{status:"pending",limit:5});
      data={counts:{tasks:tasks.total,pendingDecisions:decisions.total,sources:this.list(session,"source",{limit:1}).total,followups:this.list(session,"followup",{limit:1}).total},tasks:tasks.items,decisions:decisions.items,agents:this.agents,mode:"local-development"};
    } else if(["tasks","decisions","sources"].includes(view))data=this.list(session,({tasks:"task",decisions:"decision",sources:"source"})[view],options);
    else if(view==="task"){
      const task=this.get(session,"task",options.id);data={task,recommendations:this.related(session,"recommendation",task.id),decisions:this.related(session,"decision",task.id),sources:task.sourceIds.map(id=>this.get(session,"source",id)),followups:this.related(session,"followup",task.id),events:this.events(session,"task",task.id)};
    } else if(view==="decision"){
      const decision=this.get(session,"decision",options.id),rec=this.get(session,"recommendation",decision.recommendationId);data={decision,recommendation:rec,task:this.get(session,"task",decision.taskId),sources:rec.citations.map(c=>this.get(session,"source",c.sourceId)),events:this.events(session,"decision",decision.id)};
    } else if(view==="source"){
      const source=this.get(session,"source",options.id);const affectedTasks=this.db.prepare("SELECT body FROM records WHERE workspace_id=? AND kind='task' AND EXISTS(SELECT 1 FROM json_each(json_extract(body,'$.sourceIds')) WHERE value=?) ORDER BY json_extract(body,'$.createdAt') DESC LIMIT 100").all(session.workspaceId,source.id).map(r=>JSON.parse(r.body));data={source,versions:this.sourceVersions(session,source.id),affectedTasks,events:this.events(session,"source",source.id)};
    } else if(view==="agents"){
      const q=String(options.q||"").toLowerCase();const items=this.agents.filter(a=>!q||`${a.name} ${a.role}`.toLowerCase().includes(q));data={items,total:items.length,page:0,pageSize:25};
    } else if(view==="agent"){
      const agent=this.agents.find(a=>a.id===options.id);if(!agent)throw new HqError("not_found",404);
      const tasks=this.db.prepare("SELECT body FROM records WHERE workspace_id=? AND kind='task' AND json_extract(body,'$.ownerId')=? ORDER BY json_extract(body,'$.createdAt') DESC LIMIT 25").all(session.workspaceId,agent.id).map(r=>JSON.parse(r.body));data={agent,skills:this.skills,relatedTasks:tasks,events:[]};
    } else throw new HqError("invalid_input");
    this.audit(session,"workspace.read",["task","decision","source","agent"].includes(view)?view:"workspace",options.id||session.workspaceId,null,{view,returned:Array.isArray(data.items)?data.items.length:1});return data;
  }
}
