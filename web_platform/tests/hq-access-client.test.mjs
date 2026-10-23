import {test,after} from 'node:test';
import assert from 'node:assert/strict';
let external=0;globalThis.fetch=async()=>{external++;throw new Error('Unexpected test network');};after(()=>assert.equal(external,0));
const client=()=>import('../src/lib/hq/access-client.ts');
const operation={operationId:'c0162f6f-07ab-4f94-8336-57f3eae83d98',operationProof:'synthetic-operation-proof-only',purpose:'recover',expiresAt:'2026-10-23T12:05:00Z'};
const session={workspaceId:'f5dd9969-d27a-4fb7-ae5b-227bc66f4600',actorId:'synthetic-original-actor',actorLabel:'Synthetic preparer',csrfToken:'synthetic-only-csrf-value',mode:'local-development',employeesActive:false};
const receipt={operationId:operation.operationId,purpose:'recover',state:'committed',at:'2026-10-23T12:00:00Z',priorGeneration:1,generation:2};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});

test('Access status makes only a no-store current-cookie status request and refuses public seat details',async()=>{
 const {getAccessStatus}=await client();const calls=[];
 assert.deepEqual(await getAccessStatus(async(url,init)=>{calls.push({url,init});return reply({ok:true,access:{state:'access_required'}});}),{state:'access_required'});
 assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/hq/access/status');assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.cache,'no-store');assert.equal(calls[0].init.credentials,'same-origin');
 for(const leak of [{enrolled:false},{session}])await assert.rejects(getAccessStatus(async()=>reply({ok:true,access:{state:'access_required',...leak}})),e=>e.code==='unknown_result');
});
test('Authenticated status accepts only the bounded inactive local session shape',async()=>{
 const {getAccessStatus}=await client();assert.equal((await getAccessStatus(async()=>reply({ok:true,access:{state:'authenticated',enrolled:true,session}}))).session.actorId,session.actorId);
 for(const changed of [{employeesActive:true},{mode:'production'},{csrfToken:''}])await assert.rejects(getAccessStatus(async()=>reply({ok:true,access:{state:'authenticated',enrolled:true,session:{...session,...changed}}})),e=>e.code==='unknown_result');
});
test('Recovery preparation obtains a browser challenge then sends the factor only in one bounded JSON body',async()=>{
 const {prepareAccess}=await client();const calls=[];
 const actual=await prepareAccess('recover','synthetic-current-factor',{state:'access_required'},async(url,init)=>{calls.push({url,init});return calls.length===1?reply({ok:true,challenge:'synthetic-browser-challenge',expiresAt:operation.expiresAt}):reply({ok:true,...operation,credential:'synthetic-replacement-factor'});});
 assert.equal(actual.operationId,operation.operationId);assert.deepEqual(calls.map(c=>c.url),['/api/hq/access/challenge','/api/hq/access/stage']);
 assert.deepEqual(JSON.parse(calls[1].init.body),{purpose:'recover',credential:'synthetic-current-factor',challenge:'synthetic-browser-challenge'});assert.equal(calls[1].init.headers['x-hq-csrf'],undefined);
 assert.equal(calls.some(c=>c.url.includes('factor')),false);
});
test('Bootstrap proof uses only challenge/enrollment; existing-session enrollment and rotation carry CSRF',async()=>{
 const {prepareAccess}=await client();let calls=[];
 await prepareAccess('enroll','synthetic-bootstrap-proof',{state:'bootstrap_required'},async(url,init)=>{calls.push({url,init});return calls.length===1?reply({ok:true,challenge:'synthetic-browser-challenge',expiresAt:operation.expiresAt}):reply({ok:true,...operation,purpose:'enroll',credential:'synthetic-replacement-factor'});});
 assert.equal(JSON.parse(calls[1].init.body).permit,'synthetic-bootstrap-proof');assert.equal(calls.length,2);
 for(const purpose of ['enroll','rotate']){calls=[];await prepareAccess(purpose,'synthetic-proof-value',{state:'authenticated',enrolled:purpose==='rotate',session},async(url,init)=>{calls.push({url,init});return reply({ok:true,...operation,purpose,credential:'synthetic-replacement-factor'});});assert.equal(calls.length,1);assert.equal(calls[0].init.headers['x-hq-csrf'],session.csrfToken);assert.equal('workspaceId' in JSON.parse(calls[0].init.body),false);}
});
test('Return destinations are exact existing routes and never carry a query, external URL or encoded escape',async()=>{
 const {safeHqReturn}=await client();for(const good of ['/hq','/hq/agents','/hq/agents/adam','/hq/tasks/'+operation.operationId,'/hq/knowledge/'+operation.operationId])assert.equal(safeHqReturn(good),good);
 assert.equal(safeHqReturn(null),'/hq');for(const bad of ['//example.com/hq','https://example.com/hq','/hq/../admin','/hq/%2e%2e/admin','/hq/tasks/unknown','/hq/agents/not-real','/hq/office','/hq/skills','/hq/access','/hq?credential=secret','/hq#secret','/hq\\tasks','/hq/tasks/'+operation.operationId+'\n'])assert.equal(safeHqReturn(bad),null,bad);
});
test('Confirmation checks operation identity, committed state and returned destination before allowing success',async()=>{
 const {confirmAccess}=await client();let called;
 const actual=await confirmAccess(operation,'synthetic-saved-factor','/hq',async(url,init)=>{called={url,init};return reply({ok:true,receipt,session,returnTo:'/hq'});});assert.equal(actual.session.actorId,session.actorId);assert.equal(called.url,'/api/hq/access/confirm');assert.equal(JSON.parse(called.init.body).credential,'synthetic-saved-factor');
 for(const body of [{receipt:{...receipt,operationId:session.workspaceId}},{receipt:{...receipt,purpose:'rotate'}},{receipt:{...receipt,state:'pending'}},{receipt,returnTo:'https://example.com'}])await assert.rejects(confirmAccess(operation,'synthetic-saved-factor','/hq',async()=>reply({ok:true,...body})),e=>e.code==='unknown_result');
 let posts=0;await assert.rejects(confirmAccess(operation,'synthetic-saved-factor','//example.com',async()=>{posts++;}),e=>e.code==='return_forbidden');assert.equal(posts,0);
});
test('Lost confirmation has no automatic replay; receipt lookup carries only the scoped proof and no credential',async()=>{
 const {confirmAccess,checkAccessReceipt}=await client();let calls=0;
 await assert.rejects(confirmAccess(operation,'synthetic-saved-factor','/hq',async()=>{calls++;throw new TypeError('Connection lost');}),e=>e.code==='unknown_result'&&!e.definitive);assert.equal(calls,1);
 const value=await checkAccessReceipt(operation,async(url,init)=>{assert.equal(url,'/api/hq/access/receipt');assert.deepEqual(JSON.parse(init.body),{operationId:operation.operationId,operationProof:operation.operationProof});return reply({ok:true,receipt});});assert.equal(value.state,'committed');
});
test('Cancellation accepts truthful terminal receipts and never treats pending or mismatched data as cancelled',async()=>{
 const {cancelAccess}=await client();assert.equal((await cancelAccess(operation,async()=>reply({ok:true,receipt:{...receipt,state:'cancelled'}}))).state,'cancelled');
 assert.equal((await cancelAccess(operation,async()=>reply({ok:true,receipt}))).state,'committed');
 await assert.rejects(cancelAccess(operation,async()=>reply({ok:true,receipt:{...receipt,state:'pending'}})),e=>e.code==='unknown_result');
});
test('Refusals expose safe codes and diagnostic UUIDs, never server-provided message or arbitrary diagnostics',async()=>{
 const {getAccessStatus}=await client();await assert.rejects(getAccessStatus(async()=>reply({ok:false,error:{code:'storage_missing',message:'synthetic-secret-that-must-not-escape',diagnosticId:operation.operationId}},503)),e=>e.code==='storage_missing'&&e.diagnosticId===operation.operationId&&!e.message.includes('secret')&&!e.definitive);
 await assert.rejects(getAccessStatus(async()=>reply({ok:false,error:{code:'unbounded-attacker-secret',message:'secret',diagnosticId:'secret'}},400)),e=>e.code==='unknown_result'&&e.diagnosticId===undefined);
 await assert.rejects(getAccessStatus(async()=>reply({ok:false,error:{code:'rate_limited'}},429)),e=>e.code==='rate_limited'&&e.definitive);
});
test('Oversized secret material is refused before any stage network request',async()=>{
 const {prepareAccess}=await client();let calls=0;await assert.rejects(prepareAccess('rotate','界'.repeat(2000),{state:'authenticated',enrolled:true,session},async()=>{calls++;}),e=>e.code==='request_too_large');assert.equal(calls,0);
});
test('Signout and all-session revocation keep one client-generated receipt proof across a lost response',async()=>{
 const {newRevocationOperation,revokeAccess,checkAccessReceipt}=await client();
 for(const all of [false,true]){const scoped=newRevocationOperation(all);assert.match(scoped.operationProof,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(scoped.operationId,operation.operationId);let called;
 const expected={...receipt,operationId:scoped.operationId,purpose:all?'revoke':'signout'};
 await assert.rejects(revokeAccess(session,scoped,all?'synthetic-current-factor':undefined,async(url,init)=>{called={url,init};throw new TypeError('Response lost');}),e=>e.code==='unknown_result');
 assert.equal(called.url,'/api/hq/access/'+scoped.purpose);assert.equal(called.init.headers['x-hq-csrf'],session.csrfToken);assert.deepEqual(JSON.parse(called.init.body),{operationId:scoped.operationId,operationProof:scoped.operationProof,...(all?{credential:'synthetic-current-factor',confirmed:true}:{})});
 assert.equal((await checkAccessReceipt(scoped,async(url,init)=>{assert.equal(url,'/api/hq/access/receipt');assert.equal(JSON.parse(init.body).operationProof,scoped.operationProof);return reply({ok:true,receipt:expected});})).purpose,scoped.purpose);
 }
});
