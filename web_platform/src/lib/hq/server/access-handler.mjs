import {HqError,checkCsrf} from './local-boundary.mjs';
const cookie=(request,name,pattern)=>{const values=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(`${name}=`));if(values.length!==1)return null;const value=values[0].slice(name.length+1);return pattern.test(value)?value:null;};
const exact=(body,allowed,required=[])=>{if(Object.keys(body).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(body,k)))throw new HqError('invalid_input');for(const [key,value]of Object.entries(body)){if(key==='confirmed'){if(typeof value!=='boolean')throw new HqError('invalid_input');}else if(typeof value!=='string'||value.length>(key==='returnTo'?240:key==='credential'?256:100))throw new HqError('invalid_input');}};
const sessionCookie=(value,url,maxAge=2592000)=>`volabi_session=${value}; Path=/api/hq; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${url.protocol==='https:'?'; Secure':''}`;
export async function handleAccess(request,{store,session,token,route,url,readBody,response}){
  if(!store.access)throw new HqError('access_mode_required',403);
  const action=route.slice('/api/hq/access/'.length);
  if(action==='status'&&request.method==='GET')return response({ok:true,access:store.access.status(session)});
  if(request.method!=='POST')throw new HqError('method_not_allowed',405);
  const body=await readBody(request,4096),browser=cookie(request,'volabi_access_browser',/^[A-Za-z0-9_-]{43}$/);
  let result;
  if(action==='challenge'){exact(body,[]);const issued=store.access.challenge(browser);return response({ok:true,challenge:issued.challenge,expiresAt:issued.expiresAt},200,{'set-cookie':`volabi_access_browser=${issued.browserToken}; Path=/api/hq/access; HttpOnly; SameSite=Strict; Max-Age=300${url.protocol==='https:'?'; Secure':''}`});}
  if(action==='stage'){exact(body,['purpose','challenge','credential','permit'],['purpose']);if(body.purpose==='rotate'||body.purpose==='enroll'&&session)checkCsrf(token,request.headers.get('x-hq-csrf'));result=store.access.stage(body,session,browser);}
  else if(action==='confirm'){exact(body,['operationId','operationProof','credential','returnTo'],['operationId','operationProof','credential']);result=store.access.confirm(body);}
  else if(action==='receipt'||action==='cancel'){exact(body,['operationId','operationProof'],['operationId','operationProof']);result=store.access[action](body);}
  else if(action==='signout'||action==='revoke'){exact(body,action==='signout'?['operationId','operationProof']:['operationId','operationProof','credential','confirmed'],['operationId','operationProof']);if(session)checkCsrf(token,request.headers.get('x-hq-csrf'));result=store.access[action](body,session);}
  else throw new HqError('not_found',404);
  const extra={};if(result.session){const {token:secret,...publicSession}=result.session;result={...result,session:publicSession};extra['set-cookie']=sessionCookie(secret,url);}else if(result.clearSession)extra['set-cookie']=sessionCookie('',url,0);
  if(Object.hasOwn(result,'clearSession')){const {clearSession:_clear,...publicResult}=result;result=publicResult;}
  return response({ok:true,...result},200,extra);
}
