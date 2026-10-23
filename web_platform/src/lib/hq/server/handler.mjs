import path from "node:path";
import { HqStore } from "./local-store.mjs";
import { loadCatalog } from "./catalog.mjs";
import { HqError, isHqError, checkLocalRequest, readLocalCookie, checkCsrf } from "./local-boundary.mjs";
import {handleAccess} from './access-handler.mjs';
const maxBytes=32768;
const headers={"cache-control":"no-store, private","content-type":"application/json; charset=utf-8","x-content-type-options":"nosniff","cross-origin-resource-policy":"same-origin"};
const response=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{...headers,...extra}});
async function readBody(request,limit=maxBytes){
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))throw new HqError("invalid_input");
  const declared=request.headers.get("content-length");if(declared&&(!/^\d+$/.test(declared)||Number(declared)>limit))throw new HqError("request_too_large",413);
  const reader=request.body?.getReader();if(!reader)throw new HqError("invalid_input");
  const chunks=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new HqError("request_too_large",413);}chunks.push(value);}}finally{reader.releaseLock();}
  let value;try{value=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new HqError("invalid_input");}
  if(!value||typeof value!=="object"||Array.isArray(value))throw new HqError("invalid_input");return value;
}
function localStore(env){
  if(env.VOLABI_ACCESS_MODE){
    if(env.VOLABI_ACCESS_MODE!=='synthetic-guarded'||!env.VOLABI_ACCESS_ROOT)throw new HqError('access_mode_required',403);
    const guardedKey=Symbol.for('volabi.synthetic.guarded.sqlite');if(!globalThis[guardedKey])globalThis[guardedKey]=new Map();
    const cache=globalThis[guardedKey],root=env.VOLABI_ACCESS_ROOT;let guarded=cache.get(root);
    if(guarded&&!(guarded instanceof HqStore)){guarded.close();cache.delete(root);guarded=null;}
    if(guarded){try{guarded.access.check();}catch(error){guarded.close();cache.delete(root);throw error;}}
    else {const projectRoot=env.VOLABI_PROJECT_ROOT||path.resolve(process.cwd(),process.cwd().endsWith('web_platform')?'..':'.');const catalog=loadCatalog(projectRoot);guarded=new HqStore({accessRoot:root,...catalog});cache.set(root,guarded);}return guarded;
  }
  const root=env.VOLABI_PROJECT_ROOT||path.resolve(process.cwd(),process.cwd().endsWith("web_platform")?"..":".");
  const filePath=path.join(root,".local-volabi/hq.sqlite"),key=Symbol.for("volabi.local.sqlite");
  const catalog=loadCatalog(root);
  if(!globalThis[key])globalThis[key]=new Map();
  let store=globalThis[key].get(filePath);
  if(!store){store=new HqStore({filePath,...catalog});globalThis[key].set(filePath,store);}
  else {store.agents=catalog.agents;store.skills=catalog.skills;store.initialSources=catalog.initialSources;}
  return store;
}
export async function handleHq(request,options={}){
  try{
    const env=options.env||process.env;checkLocalRequest(request,env);
    const url=new URL(request.url),route=url.pathname.replace(/\/$/,""),method=request.method;
    if(!["GET","POST"].includes(method))return response({ok:false,error:{code:"method_not_allowed",message:"method_not_allowed"}},405,{allow:"GET, POST"});
    if(route.startsWith('/api/hq/access/')&&env.VOLABI_ACCESS_MODE!=='synthetic-guarded')throw new HqError('access_mode_required',403);
    const store=options.store||localStore(env),token=readLocalCookie(request),session=store.getSession(token);
    if(route.startsWith('/api/hq/access/'))return await handleAccess(request,{store,session,token,route,url,readBody,response});
    if(route==="/api/hq/session"&&method==="POST"){
      const body=await readBody(request);if(Object.keys(body).length)throw new HqError("invalid_input");
      if(store.access&&!session)throw new HqError('access_required',401);
      const created=session?null:store.createSession();const current=session||created;
      const {token:secret,...publicSession}=current;
      const cookie=secret?{"set-cookie":`volabi_session=${secret}; Path=/api/hq; HttpOnly; SameSite=Strict; Max-Age=2592000${url.protocol==="https:"?"; Secure":""}`} : {};
      return response({ok:true,session:publicSession},200,cookie);
    }
    if(!session)throw new HqError(store.access?'access_required':'session_required',401);
    if(route==="/api/hq/state"&&method==="GET"){
      const data=store.query(session,url.searchParams.get("view")||"overview",{id:url.searchParams.get("id"),q:url.searchParams.get("q")||"",status:url.searchParams.get("status")||"",page:url.searchParams.get("page")||0,ownerId:url.searchParams.get("ownerId")||"",sort:url.searchParams.get("sort")||"updated",phase:url.searchParams.get("phase")||"preparation",milestoneId:url.searchParams.get("milestoneId")||null});
      return response({ok:true,data});
    }
    if(route==="/api/hq/commands"&&method==="POST"){
      checkCsrf(token,request.headers.get("x-hq-csrf"));const receipt=store.command(session,await readBody(request));return response({ok:true,receipt});
    }
    const match=route.match(/^\/api\/hq\/commands\/([a-f0-9-]{36})$/i);
    if(match&&method==="GET")return response({ok:true,receipt:store.receipt(session,match[1])});
    throw new HqError("not_found",404);
  }catch(error){
    if(isHqError(error))return response({ok:false,error:{code:error.code,message:error.code,...(error.diagnosticId?{diagnosticId:error.diagnosticId,diagnosticRecorded:error.diagnosticRecorded===true}:{})}},error.status);
    // Storage/configuration details and request bodies never enter HTTP errors or logs.
    return response({ok:false,error:{code:"storage_unavailable",message:"storage_unavailable"}},503);
  }
}
