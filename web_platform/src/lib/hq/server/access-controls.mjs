import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {HqError,hash,canonical} from './local-boundary.mjs';
import {readAccessState,writeAccessState,accessUuid} from './access-schema.mjs';
import {recheckAccess} from './access-storage.mjs';
export const ACCESS_STAGE_MS=300000;
const secret=()=>randomBytes(32).toString('base64url');
const failure=code=>({refusal:code});
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export const accessVerifier=(state,workspaceId,value)=>hash(`volabi-access-factor:v1:${state.instanceId}:${workspaceId}:${value}`);
const tokenHash=value=>hash(`volabi-access-proof:v1:${value}`);
const credential=(s,id)=>`vha1.${s.instanceId}.${id}.${secret()}`;
const selector=(s,value)=>{if(typeof value!=='string')return null;const p=value.split('.');return p.length===4&&p[0]==='vha1'&&p[1]===s.instanceId&&accessUuid(p[2])&&/^[a-zA-Z0-9_-]{43}$/.test(p[3])?p[2]:null;};
const stamp=()=>new Date().toISOString();
const receiptPublic=r=>{const {proofHash:_p,materialHash:_m,requestHash:_r,...clean}=r;return clean;};
export function validatedReturn(value='/hq'){
  if(typeof value!=='string'||value.length>240||/[\\%?#\u0000-\u0020]/.test(value)||!value.startsWith('/hq')||value.startsWith('//'))throw new HqError('return_forbidden');
  if(['/hq','/hq/tasks','/hq/projects','/hq/council','/hq/decisions','/hq/knowledge','/hq/agents'].includes(value))return value;
  const dynamic=value.match(/^\/hq\/(tasks|projects|council|decisions|knowledge)\/([^/]+)$/);if(dynamic&&accessUuid(dynamic[2]))return value;
  const agent=value.match(/^\/hq\/agents\/([a-z][a-z0-9-]{0,79})$/);if(agent&&['alexander','adam','nora','sarah','victoria','emma','maya','ethan','daniel','sophia','layla','omar','olivia','lina','rayan'].includes(agent[1]))return value;
  throw new HqError('return_forbidden');
}
export class AccessControls {
  constructor(store){this.store=store;this.proofs=new WeakMap();}
  check(){if(this.store.accessBroken)throw new HqError('storage_unavailable',503);return recheckAccess(this.store);}
  mutate(fn){const result=this.store.transaction(()=>{const state=this.check();this.cleanup(state);const out=fn(state);writeAccessState(this.store.db,state);return out;});if(result?.refusal)throw new HqError(result.refusal,result.refusal==='rate_limited'?429:result.refusal==='operation_conflict'?409:400);return result;}
  cleanup(s){const time=Date.now();s.attempts=s.attempts.filter(x=>x>time-900000);for(const [k,c]of Object.entries(s.challenges))if(c.expiresAt<time)delete s.challenges[k];for(const [k,p]of Object.entries(s.permits))if(p.expiresAt<time)delete s.permits[k];for(const [id,op]of Object.entries(s.operations))if(op.expiresAt<time){s.receipts[id]=this.resultReceipt(id,op,'expired');delete s.operations[id];this.audit(op,id,'expired',op.generation,'Pending factor operation expired; existing factor and sessions retained.');}const keys=Object.keys(s.receipts);for(const k of keys.slice(0,Math.max(0,keys.length-512)))delete s.receipts[k];}
  invalid(s,challenge){if(s.attempts.length>=30)return failure('rate_limited');s.attempts.push(Date.now());if(challenge)challenge.attempts=Math.min(5,challenge.attempts+1);return failure('proof_invalid');}
  active(s){return s.initialization.status==='active';}
  status(session){const s=this.check();if(session){this.validateSession(session);return {state:'authenticated',enrolled:!!s.seats[session.workspaceId]?.verifier,session};}return {state:this.active(s)?'access_required':'bootstrap_required'};}
  attach(session,token){const s=readAccessState(this.store.db),binding=s.sessions[hash(token)];if(!this.active(s)||!binding||binding.workspaceId!==session.workspaceId||binding.generation!==s.seats[session.workspaceId]?.generation)return null;this.proofs.set(session,hash(token));return session;}
  validateSession(session){const s=this.check(),key=this.proofs.get(session),seat=s.seats[session?.workspaceId],binding=s.sessions[key];if(!this.active(s)||!key||!seat||!binding||binding.workspaceId!==session.workspaceId||binding.generation!==seat.generation||seat.actorId!==session.actorId||!this.store.db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND workspace_id=? AND actor_id=? AND expires_at>?').get(key,session.workspaceId,session.actorId,stamp()))throw new HqError('session_required',401);return {state:s,key,seat};}
  challenge(browserToken){return this.mutate(s=>{if(s.attempts.length>=30)return failure('rate_limited');if(Object.keys(s.challenges).length>=64)return failure('rate_limited');const challenge=secret(),browser=typeof browserToken==='string'&&/^[A-Za-z0-9_-]{43}$/.test(browserToken)?browserToken:secret(),expiresAt=Date.now()+ACCESS_STAGE_MS;s.challenges[tokenHash(challenge)]={expiresAt,attempts:0,used:false,browserHash:tokenHash(browser)};return {challenge,browserToken:browser,expiresAt:new Date(expiresAt).toISOString()};});}
  stage(body,session=null,browserToken=null){
    if(!body||!['enroll','recover','rotate'].includes(body.purpose)||Object.keys(body).some(k=>!['purpose','challenge','credential','permit'].includes(k)))throw new HqError('invalid_input');
    return this.mutate(s=>{if(s.attempts.length>=30)return failure('rate_limited');let workspaceId,actorId,sessionHash=null,permitHash=null,c=null;
      const bootstrap=body.purpose==='enroll'&&!this.active(s);
      if(body.purpose==='recover'||bootstrap){c=s.challenges[tokenHash(body.challenge||'')];if(!c||c.used||c.attempts>=5||c.expiresAt<=Date.now()||!equal(c.browserHash,tokenHash(browserToken||'')))return this.invalid(s,c);}
      if(bootstrap){const init=s.initialization;if(init.expiresAt<=Date.now()||!equal(init.proofHash,tokenHash(body.permit||'')))return this.invalid(s,c);workspaceId=init.workspaceId;actorId=init.actorId;permitHash=init.proofHash;}
      else if(body.purpose==='recover'){workspaceId=selector(s,body.credential);const seat=s.seats[workspaceId];if(!seat?.verifier||!equal(seat.verifier,accessVerifier(s,workspaceId,body.credential)))return this.invalid(s,c);actorId=seat.actorId;}
      else {const valid=this.validateSession(session);workspaceId=session.workspaceId;actorId=session.actorId;sessionHash=valid.key;
        if(body.purpose==='rotate'){if(!s.seats[workspaceId].verifier||!equal(s.seats[workspaceId].verifier,accessVerifier(s,workspaceId,body.credential||'')))return this.invalid(s);}
        else {permitHash=tokenHash(body.permit||'');const p=s.permits[permitHash];if(s.seats[workspaceId].verifier||!p||p.workspaceId!==workspaceId||p.actorId!==actorId||p.generation!==s.seats[workspaceId].generation||p.expiresAt<=Date.now())return this.invalid(s);}
      }
      if(Object.values(s.operations).some(o=>o.workspaceId===workspaceId))return failure('operation_conflict');
      if(c)c.used=true;
      const operationId=randomUUID(),operationProof=secret(),replacement=credential(s,workspaceId),expiresAt=Date.now()+ACCESS_STAGE_MS;
      s.operations[operationId]={purpose:body.purpose,workspaceId,actorId,generation:s.seats[workspaceId].generation,proofHash:tokenHash(operationProof),nextVerifier:accessVerifier(s,workspaceId,replacement),expiresAt,sessionHash,permitHash,attempts:0};
      this.audit(s.operations[operationId],operationId,'staged',s.seats[workspaceId].generation,'Proof accepted; replacement awaits saved-copy confirmation.');
      return {operationId,operationProof,credential:replacement,expiresAt:new Date(expiresAt).toISOString(),purpose:body.purpose};
    });
  }
  resultReceipt(id,op,state,generation=op.generation,materialHash=hash('no-commit'),requestHash=materialHash){return {operationId:id,purpose:op.purpose,state,at:stamp(),priorGeneration:op.generation,generation,proofHash:op.proofHash,materialHash,requestHash};}
  audit(op,id,outcome,generation,reason){this.store.audit({workspaceId:op.workspaceId,actorId:op.actorId},`access.${op.purpose}.${outcome}`,'access',id,null,{operationId:id,priorGeneration:op.generation,generation,authenticationMethod:op.purpose==='recover'?'recovery-factor':op.purpose==='signout'?'session-and-csrf':['rotate','revoke'].includes(op.purpose)?'session-csrf-and-recovery-factor':op.sessionHash?'session-csrf-and-local-permit':'restricted-bootstrap',reason,outcome});}
  proof(s,body){if(!accessUuid(body?.operationId)||typeof body.operationProof!=='string'||body.operationProof.length>100)return null;const op=s.operations[body.operationId]||s.receipts[body.operationId];return op&&equal(op.proofHash,tokenHash(body.operationProof))?op:null;}
  confirm(body){const returnTo=validatedReturn(body?.returnTo);return this.mutate(s=>{const op=this.proof(s,body);if(!op)return this.invalid(s);const materialHash=hash(canonical({credential:body.credential,returnTo}));
      if(s.receipts[body.operationId]){if(op.state!=='committed'||op.materialHash!==materialHash)return failure('operation_conflict');return {receipt:receiptPublic(op),returnTo};}
      if(op.expiresAt<=Date.now())return failure('operation_expired');if(op.attempts>=5)return failure('proof_invalid');
      if(!equal(op.nextVerifier,accessVerifier(s,op.workspaceId,body.credential||''))){op.attempts++;return this.invalid(s);}
      const seat=s.seats[op.workspaceId];if(seat.generation!==op.generation)return failure('operation_conflict');
      if(op.sessionHash){const row=this.store.db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?').get(op.sessionHash,stamp());if(!row||s.sessions[op.sessionHash]?.generation!==op.generation)return failure('operation_conflict');}
      if(op.purpose==='enroll'){if(seat.verifier)return failure('operation_conflict');if(op.sessionHash){const p=s.permits[op.permitHash];if(!p||p.expiresAt<=Date.now()||p.generation!==op.generation)return failure('operation_conflict');delete s.permits[op.permitHash];}else if(s.initialization.status!=='pending'||s.initialization.expiresAt<=Date.now()||s.initialization.proofHash!==op.permitHash)return failure('operation_conflict');}
      seat.generation++;seat.verifier=op.nextVerifier;s.initialization.status='active';this.revokeSeat(s,op.workspaceId);const token=randomBytes(32).toString('hex');this.store.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),op.workspaceId,op.actorId,new Date(Date.now()+2592000000).toISOString());s.sessions[hash(token)]={workspaceId:op.workspaceId,generation:seat.generation};
      const receipt=this.resultReceipt(body.operationId,op,'committed',seat.generation,materialHash);s.receipts[body.operationId]=receipt;delete s.operations[body.operationId];this.audit(op,body.operationId,'committed',seat.generation,'Saved replacement custody confirmed; exact seat sessions replaced atomically.');
      writeAccessState(this.store.db,s);return {receipt:receiptPublic(receipt),session:{...this.store.getSession(token),token},returnTo};
    });}
  receipt(body){return this.mutate(s=>{const op=this.proof(s,body);if(!op)return this.invalid(s);return {receipt:s.receipts[body.operationId]?receiptPublic(op):{operationId:body.operationId,purpose:op.purpose,state:'pending',at:new Date(op.expiresAt-ACCESS_STAGE_MS).toISOString(),priorGeneration:op.generation,generation:op.generation}};});}
  cancel(body){return this.mutate(s=>{const op=this.proof(s,body);if(!op)return this.invalid(s);if(s.receipts[body.operationId])return {receipt:receiptPublic(op)};const receipt=this.resultReceipt(body.operationId,op,'cancelled');s.receipts[body.operationId]=receipt;delete s.operations[body.operationId];this.audit(op,body.operationId,'cancelled',op.generation,'Operator cancelled pending factor; existing factor and sessions retained.');return {receipt:receiptPublic(receipt)};});}
  revokeSeat(s,id){this.store.db.prepare('DELETE FROM sessions WHERE workspace_id=?').run(id);for(const [key,v] of Object.entries(s.sessions))if(v.workspaceId===id)delete s.sessions[key];for(const [key,v]of Object.entries(s.permits))if(v.workspaceId===id)delete s.permits[key];}
  sessionOperation(body,session,purpose){
    if(!accessUuid(body?.operationId)||typeof body.operationProof!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.operationProof))throw new HqError('invalid_input');
    const requestHash=hash(canonical({purpose,...(purpose==='revoke'?{factorHash:hash(body.credential||''),confirmed:body.confirmed===true}:{})}));
    return this.mutate(s=>{const id=body.operationId,prior=s.receipts[id];
      if(prior){if(!equal(prior.proofHash,tokenHash(body.operationProof)))return this.invalid(s);if(prior.purpose!==purpose||prior.requestHash!==requestHash)return failure('operation_conflict');return {receipt:receiptPublic(prior),clearSession:false};}
      const valid=this.validateSession(session);
      if(purpose==='revoke'&&(body.confirmed!==true||!valid.seat.verifier||!equal(valid.seat.verifier,accessVerifier(s,session.workspaceId,body.credential||''))))return this.invalid(s);
      const generation=s.seats[session.workspaceId].generation,op={purpose,workspaceId:session.workspaceId,actorId:session.actorId,generation,proofHash:tokenHash(body.operationProof),sessionHash:valid.key};
      if(purpose==='signout'){this.store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(valid.key);delete s.sessions[valid.key];}
      else {s.seats[session.workspaceId].generation++;this.revokeSeat(s,session.workspaceId);}
      const resulting=s.seats[session.workspaceId].generation,receipt=this.resultReceipt(id,op,'committed',resulting,hash(`${valid.key}:${requestHash}`),requestHash);s.receipts[id]=receipt;
      this.audit(op,id,'committed',resulting,purpose==='signout'?'Operator explicitly signed out this local session.':'Current factor and explicit confirmation revoked all exact-seat sessions; factor retained for reconnect.');return {receipt:receiptPublic(receipt),clearSession:true};
    });
  }
  signout(body,session){return this.sessionOperation(body,session,'signout');}
  revoke(body,session){return this.sessionOperation(body,session,'revoke');}
}
