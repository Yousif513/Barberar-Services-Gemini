import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { HqError, hash, canonical } from "../../hq/server/local-boundary.mjs";
import { toCents, riyadhDateKey } from "../../booking-display.mjs";
export const LIMITS=Object.freeze({catalogs:100,requests:100,cases:100,events:500});
export const LOCALES=new Set(["en","ar","bn-BD","ur-PK","hi-IN"]);
export const csrfForPilot=token=>hash(`primora-pilot-csrf:${token}`);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(code="invalid_input",status=400)=>{throw new HqError(code,status);};
function obj(x,keys){if(!x||typeof x!=="object"||Array.isArray(x)||Object.keys(x).some(k=>!keys.includes(k)))fail();return x;}
function text(x,max,min=1){if(typeof x!=="string"||x.length>max||x.trim().length<min||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(x))fail();return x.trim();}
function identifier(x){const s=text(x,100);if(!/^[a-zA-Z0-9._:-]+$/.test(s))fail();return s;}
function integer(x,min,max){if(!Number.isSafeInteger(x)||x<min||x>max)fail();return x;}
function id(x){if(typeof x!=="string"||!uuid.test(x))fail();return x.toLowerCase();}
function iso(x,now){const s=text(x,40);const d=new Date(s);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s)||!Number.isFinite(+d)||d.toISOString().slice(0,10)!==s.slice(0,10)||+d>+now+300000)fail();return d.toISOString();}
function sourceInput(p,now){obj(p,["sourceTitle","sourceReference","observedAt","providerId","providerName","services"]);
 const reference=text(p.sourceReference,500);if(/^[a-z][a-z0-9+.-]*:/i.test(reference)){let u;try{u=new URL(reference);}catch{fail();}if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash)fail();}
 if(!Array.isArray(p.services)||p.services.length<1||p.services.length>30)fail();
 const serviceIds=new Set();const services=p.services.map(s=>{obj(s,["id","name","durationMinutes","priceCents","staff"]);const serviceId=identifier(s.id);if(serviceIds.has(serviceId))fail();serviceIds.add(serviceId);
 if(!Array.isArray(s.staff)||s.staff.length<1||s.staff.length>30)fail();const staffIds=new Set();const staff=s.staff.map(v=>{obj(v,["id","name"]);const staffId=identifier(v.id);if(staffIds.has(staffId))fail();staffIds.add(staffId);return{id:staffId,name:text(v.name,200)};});
 const priceCents=integer(s.priceCents,0,100000000);if(toCents(priceCents/100)!==priceCents)fail();
 return{id:serviceId,name:text(s.name,200),durationMinutes:integer(s.durationMinutes,1,1440),priceCents,staff};});
 return{sourceTitle:text(p.sourceTitle,200),sourceReference:reference,observedAt:iso(p.observedAt,now),providerId:identifier(p.providerId),providerName:text(p.providerName,200),services};
}
function requestTime(date,time,now){text(date,10);text(time,5);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))fail();const moment=new Date(`${date}T${time}:00+03:00`);if(!Number.isFinite(+moment)||riyadhDateKey(moment)!==date||+moment<=+now||+moment>+now+366*86400000)fail();}
export class PilotStore{
 constructor({filePath,clock=()=>new Date()}){this.clock=clock;if(filePath!==":memory:")mkdirSync(path.dirname(filePath),{recursive:true});this.db=new DatabaseSync(filePath);this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS pilot_sessions(workspace TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,expires TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS pilot_entities(workspace TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(workspace,kind,id));
 CREATE TABLE IF NOT EXISTS pilot_commands(workspace TEXT NOT NULL,id TEXT NOT NULL,material_hash TEXT NOT NULL,receipt TEXT NOT NULL,PRIMARY KEY(workspace,id));
 CREATE TABLE IF NOT EXISTS pilot_events(id INTEGER PRIMARY KEY AUTOINCREMENT,workspace TEXT NOT NULL,body TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS pilot_event_workspace ON pilot_events(workspace,id);`);}
 close(){this.db.close();}
 createSession(){const token=randomBytes(32).toString("hex"),workspaceId=randomUUID(),expiresAt=new Date(+this.clock()+30*86400000).toISOString();this.db.prepare("INSERT INTO pilot_sessions VALUES(?,?,?)").run(workspaceId,hash(token),expiresAt);return{token,workspaceId,csrf:csrfForPilot(token),expiresAt};}
 getSession(token){if(typeof token!=="string"||!/^[a-f0-9]{64}$/.test(token))return null;const row=this.db.prepare("SELECT workspace,expires FROM pilot_sessions WHERE token_hash=? AND expires>?").get(hash(token),this.clock().toISOString());return row?{workspaceId:row.workspace,expiresAt:row.expires,csrf:csrfForPilot(token)}:null;}
 checkSession(s){if(!s||!this.db.prepare("SELECT 1 FROM pilot_sessions WHERE workspace=? AND expires>?").get(s.workspaceId,this.clock().toISOString()))fail("session_required",401);}
 list(s,kind){return this.db.prepare("SELECT body FROM pilot_entities WHERE workspace=? AND kind=? ORDER BY rowid DESC").all(s.workspaceId,kind).map(x=>JSON.parse(x.body));}
 get(s,kind,entityId){const row=this.db.prepare("SELECT body FROM pilot_entities WHERE workspace=? AND kind=? AND id=?").get(s.workspaceId,kind,entityId);if(!row)fail("not_found",404);return JSON.parse(row.body);}
 put(s,kind,value){this.db.prepare("INSERT INTO pilot_entities VALUES(?,?,?,?) ON CONFLICT(workspace,kind,id) DO UPDATE SET body=excluded.body").run(s.workspaceId,kind,value.id,JSON.stringify(value));}
 quota(s,kind){if(this.list(s,kind).length>=LIMITS[`${kind}s`])fail("workspace_limit",409);}
 state(s){this.checkSession(s);return{session:{workspaceId:s.workspaceId,csrf:s.csrf,expiresAt:s.expiresAt},catalogs:this.list(s,"catalog"),requests:this.list(s,"request"),cases:this.list(s,"case"),events:this.db.prepare("SELECT id,body FROM pilot_events WHERE workspace=? ORDER BY id").all(s.workspaceId).map(x=>({id:Number(x.id),...JSON.parse(x.body)})),limits:LIMITS};}
 receipt(s,commandId){this.checkSession(s);id(commandId);const row=this.db.prepare("SELECT receipt FROM pilot_commands WHERE workspace=? AND id=?").get(s.workspaceId,commandId.toLowerCase());if(!row)fail("not_found",404);return JSON.parse(row.receipt);}
 command(s,c){this.checkSession(s);obj(c,["commandId","type","payload","locale"]);const commandId=id(c.commandId);if(!LOCALES.has(c.locale)||typeof c.type!=="string")fail();obj(c.payload,Object.keys(c.payload||{}));const materialHash=hash(canonical({type:c.type,payload:c.payload}));
 this.db.exec("BEGIN IMMEDIATE");try{
 const old=this.db.prepare("SELECT material_hash,receipt FROM pilot_commands WHERE workspace=? AND id=?").get(s.workspaceId,commandId);if(old){if(old.material_hash!==materialHash)fail("command_conflict",409);this.db.exec("COMMIT");return JSON.parse(old.receipt);}
 const eventCount=Number(this.db.prepare("SELECT count(*) AS n FROM pilot_events WHERE workspace=?").get(s.workspaceId).n);if(eventCount>=LIMITS.events)fail("workspace_limit",409);
 const now=this.clock(),createdAt=now.toISOString();let entity,kind;
 if(c.type==="import-source"){
  const input=sourceInput(c.payload,now),versionHash=hash(canonical(input));const same=this.list(s,"catalog").find(x=>x.versionHash===versionHash&&x.current);
  if(same){entity=same;kind="catalog";}else{this.quota(s,"catalog");for(const previous of this.list(s,"catalog").filter(x=>x.providerId===input.providerId&&x.current))this.put(s,"catalog",{...previous,current:false});entity={id:randomUUID(),versionHash,...input,importedAt:createdAt,current:true};kind="catalog";this.put(s,kind,entity);}
 }else if(c.type==="record-request"){
  const p=obj(c.payload,["sourceId","catalogHash","serviceId","staffId","requestedDate","requestedTime","notes"]),catalog=this.get(s,"catalog",id(p.sourceId));if(!catalog.current||catalog.versionHash!==p.catalogHash)fail("stale_source",409);
  const service=catalog.services.find(x=>x.id===identifier(p.serviceId)),staff=service?.staff.find(x=>x.id===identifier(p.staffId));if(!service||!staff)fail();requestTime(p.requestedDate,p.requestedTime,now);this.quota(s,"request");
  entity={id:randomUUID(),sourceId:catalog.id,catalogHash:catalog.versionHash,providerId:catalog.providerId,providerName:catalog.providerName,service:{id:service.id,name:service.name,durationMinutes:service.durationMinutes,priceCents:service.priceCents},staff,requestedDate:p.requestedDate,requestedTime:p.requestedTime,timeZone:"Asia/Riyadh",notes:text(p.notes,2000,0),status:"local_request",paymentStatus:"not_dispatched",createdAt,createdLocale:c.locale,source:{title:catalog.sourceTitle,reference:catalog.sourceReference,observedAt:catalog.observedAt}};kind="request";this.put(s,kind,entity);
 }else if(c.type==="open-case"){
  const p=obj(c.payload,["requestId","kind","reason","evidence"]);this.get(s,"request",id(p.requestId));if(!["inquiry","change","cancellation","refund","complaint"].includes(p.kind))fail();this.quota(s,"case");entity={id:randomUUID(),requestId:id(p.requestId),kind:p.kind,reason:text(p.reason,2000),evidence:text(p.evidence,4000,0),status:"local_case_recorded",createdAt,revision:1,followUps:[]};kind="case";this.put(s,kind,entity);
 }else if(c.type==="append-case-note"){
  const p=obj(c.payload,["caseId","expectedRevision","kind","text"]),current=this.get(s,"case",id(p.caseId));integer(p.expectedRevision,1,1000000);if(current.revision!==p.expectedRevision)fail("stale_revision",409);if(!["note","appeal"].includes(p.kind))fail();entity={...current,revision:current.revision+1,followUps:[...current.followUps,{id:randomUUID(),kind:p.kind,text:text(p.text,4000),createdAt}]};kind="case";this.put(s,kind,entity);
 }else fail();
 const prior=this.db.prepare("SELECT body FROM pilot_events WHERE workspace=? ORDER BY id DESC LIMIT 1").get(s.workspaceId);const previousHash=prior?JSON.parse(prior.body).eventHash:"0".repeat(64),event={entityType:kind,entityId:entity.id,action:c.type,createdAt,previousHash};event.eventHash=hash(canonical({...event,materialHash,commandId}));this.db.prepare("INSERT INTO pilot_events(workspace,body) VALUES(?,?)").run(s.workspaceId,JSON.stringify(event));
 const receipt={commandId,type:c.type,entityId:entity.id,recordedAt:createdAt,status:"recorded_local"};this.db.prepare("INSERT INTO pilot_commands VALUES(?,?,?,?)").run(s.workspaceId,commandId,materialHash,JSON.stringify(receipt));this.db.exec("COMMIT");return receipt;
 }catch(e){this.db.exec("ROLLBACK");throw e;}}
}
