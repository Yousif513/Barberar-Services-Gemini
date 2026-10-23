import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {makeFixture,logicalState} from './hq-recovery-independent-fixture.mjs';
import {restrictDirectory} from '../../scripts/hq-recovery/paths.mjs';
import {adoptAccess,openAccessStore} from '../../scripts/hq-access/index.mjs';
import {handleHq} from '../src/lib/hq/server/handler.mjs';

// Independent rich business fixture: source corrections, task, project, Council,
// decision/follow-up history and a neighbouring seat precede all access metadata.
export function accessFixture(t,{rich=true}={}){
 const f=makeFixture(t,{rich,opaque:true});
 restrictDirectory(f.root);restrictDirectory(f.fixtureRoot);
 fs.writeFileSync(path.join(f.fixtureRoot,'ACCESS-SYNTHETIC.json'),JSON.stringify({format:'volabi-access-synthetic-root-1',fixtureId:f.fixtureId,syntheticOnly:true}),{flag:'wx',mode:0o600});
 f.before=logicalState(f.store.db);f.close();
 f.bootstrap=adoptAccess({root:f.fixtureRoot,confirmation:f.fixtureId,legacyToken:f.seat.token,serverStopped:true});
 f.store=openAccessStore(f.fixtureRoot,{agents:f.options.agents,skills:[],initialSources:[]});f.closed=false;
 f.secrets=[f.seat.token,f.other.token,f.bootstrap.bootstrapProof];
 return f;
}
export function prepare(f,purpose,proof,session){
 let challenge,browser;
 if(purpose==='recover'||purpose==='enroll'&&!session){const c=f.store.access.challenge();challenge=c.challenge;browser=c.browserToken;f.secrets.push(c.challenge,c.browserToken);}
 const op=f.store.access.stage({purpose,...(purpose==='enroll'?{permit:proof}:{credential:proof}),...(challenge?{challenge}:{})},session,browser);
 f.secrets.push(op.credential,op.operationProof);return op;
}
export function enroll(f){const op=prepare(f,'enroll',f.bootstrap.bootstrapProof);const result=f.store.access.confirm(op);f.secrets.push(result.session.token);return {op,result,session:f.store.getSession(result.session.token)};}
export function assertBusinessUnchanged(f){
 const after=logicalState(f.store.db);
 for(const table of ['workspaces','records','record_versions','commands'])assert.deepEqual(after[table],f.before[table],`original ${table} remain exact`);
 assert.deepEqual(after.events.slice(0,f.before.events.length),f.before.events,'original audit history remains exact');
 assert.equal(after.events.slice(f.before.events.length).every(e=>e.action.startsWith('access.')||e.action==='workspace.read'),true,'only access changes and ordinary audited verification reads added');
 assert.equal(after.workspaces.length,2,'no third workspace');
 assert.ok(f.store.getSession(f.other.token),'original neighbouring session remains valid');
}
export async function request(f,route,{method,body,token,csrf,cookies,headers}={}){
 const url=`http://localhost:3198/api/hq/${route}`;
 const h={host:'localhost:3198',origin:'http://localhost:3198',...(body===undefined?{}:{'content-type':'application/json'}),...(token?{cookie:`volabi_session=${token}`}:{}) ,...(csrf?{'x-hq-csrf':csrf}:{}),...(cookies?{cookie:cookies}:{}),...headers};
 return handleHq(new Request(url,{method:method||(body===undefined?'GET':'POST'),headers:h,...(body===undefined?{}:{body:JSON.stringify(body)})}),{store:f.store,env:{VOLABI_LOCAL_MODE:'enabled',VOLABI_ACCESS_MODE:'synthetic-guarded',VOLABI_ACCESS_ROOT:f.fixtureRoot}});
}
export const newProof=()=>randomBytes(32).toString('base64url');
export function assertNoStoredSecrets(f){
 const logical=JSON.stringify(Object.fromEntries(['records','record_versions','commands','events','hq_access_state'].map(table=>[table,f.store.db.prepare(`SELECT * FROM ${table}`).all()])));
 const files=['hq.sqlite','hq.sqlite-wal'].map(name=>path.join(f.fixtureRoot,name)).filter(file=>fs.existsSync(file)).map(file=>fs.readFileSync(file));
 for(const value of f.secrets){assert.equal(logical.includes(value),false,'known synthetic secret absent from logical tables');assert.equal(files.some(bytes=>bytes.includes(Buffer.from(value))),false,'known synthetic secret absent from raw database pages');}
}