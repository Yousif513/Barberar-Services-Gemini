import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

// Independent reviewer tests: source was frozen before these tests; no reviewer RED claim.
const migration = readFileSync(new URL("../../migrations/20261022124446_held_checkout_read_queue.sql", import.meta.url), "utf8");
const expectedFields = ["id","purchase_type","target_id","amount_sar","currency","status","is_current","reconciliation_required","created_at","updated_at","unknown_at"].sort();
const signatures = ["public.admin_list_held_checkout_attempts(text,text,uuid,uuid,integer,integer)","public.admin_get_held_checkout_attempt(uuid)"];
const noAccess = /permission denied|Administrator access required|console role|Authenticated console session/i;
const sentinel = "REVIEW_PRIVATE_SENTINEL";
let db, finance, owner, operations, analyst;
const list = async (actor, args=[null,null,null,null,25,0]) => (await as(db,actor,"select public.admin_list_held_checkout_attempts($1,$2,$3,$4,$5,$6) value",args))[0].value;
const detail = async (actor,id) => (await as(db,actor,"select public.admin_get_held_checkout_attempt($1) value",[id]))[0].value;
async function fixture({status="unknown",flag=false,current=true,type="booking",created="2026-02-01T00:00:00Z"}={}){
  const id=randomUUID(), target=randomUUID();
  await sys(db,`insert into public.payment_checkout_attempts(id,actor_id,purchase_type,target_id,provider_id,amount_sar,status,request_text,request_sha256,gateway_context,charge_id,checkout_url,gateway_status,is_current,reconciliation_required,created_at,updated_at,unknown_at)
    values($1,$2,$3,$4,$5,125.25,$6,$7,repeat('a',64),repeat('b',64),$8,$9,$10,$11,$12,$13,$13,case when $6='unknown' then $13::timestamptz end)`,
    [id,SEED.customer,type,target,SEED.provider1,status,JSON.stringify({email:sentinel+"@example.invalid",phone:sentinel}),["ready","captured","failed"].includes(status)?`chg_${id}`:null,status==="ready"?`https://${sentinel.toLowerCase()}.invalid/checkout`:null,sentinel,current,flag,created]);
  return {id,target};
}
async function freshFinance(){return ROLES.user(await createUser(db,{role:"admin",adminRole:"finance"}));}
async function denyBoth(actor,id){for(const call of [()=>list(actor),()=>detail(actor,id)]){const error=await expectError(call(),noAccess);assert.equal(error.code,"42501");}}
async function auditRows(){return (await sys(db,"select count(*)::int n from public.admin_audit_logs where action like 'checkout.operator.%'"))[0].n;}
before(async()=>{db=await createMigratedDb();finance=await freshFinance();owner=ROLES.user(await createUser(db,{role:"admin",adminRole:"owner"}));operations=ROLES.user(await createUser(db,{role:"admin",adminRole:"operations"}));analyst=ROLES.user(await createUser(db,{role:"admin",adminRole:"analyst"}));});
after(async()=>{await db?.close();});

describe("independent held-checkout security verification",()=>{
  it("reapplies the exact migration without broadening grants or changing stored attempts",async()=>{
    const row=await fixture();
    const before=(await sys(db,"select to_jsonb(a) value from public.payment_checkout_attempts a where id=$1",[row.id]))[0].value;
    await db.exec(migration);
    assert.deepEqual((await sys(db,"select to_jsonb(a) value from public.payment_checkout_attempts a where id=$1",[row.id]))[0].value,before);
    for(const signature of signatures){
      const grants=(await sys(db,"select has_function_privilege('authenticated',$1,'EXECUTE') auth,has_function_privilege('anon',$1,'EXECUTE') anon,has_function_privilege('service_role',$1,'EXECUTE') service",[signature]))[0];
      assert.deepEqual(grants,{auth:true,anon:false,service:false});
      const fn=(await sys(db,"select p.prosecdef,p.provolatile,p.proconfig from pg_proc p where p.oid=$1::regprocedure",[signature]))[0];
      assert.equal(fn.prosecdef,true);assert.equal(fn.provolatile,"v");assert.ok(fn.proconfig.includes('search_path=""'));
    }
  });
  it("rejects every non-finance role, weak/no identity and forged service identity before returning any data",async()=>{
    const row=await fixture();const before=await auditRows();
    for(const actor of [ROLES.anon,ROLES.service,ROLES.user(SEED.customer),ROLES.user(SEED.owner1),operations,analyst,ROLES.user(null),ROLES.user(finance.sub,{aal:"aal1"}),{sub:finance.sub,role:"service_role"}])await denyBoth(actor,row.id);
    assert.equal(await auditRows(),before);
    assert.equal((await detail(owner,row.id)).attempt.id,row.id);
    assert.equal((await detail(finance,row.id)).attempt.id,row.id);
  });
  it("rechecks actual expired, deleted, wrong-owner and malformed sessions on every RPC",async()=>{
    const row=await fixture(), actor=await freshFinance();
    assert.equal((await detail(actor,row.id)).attempt.id,row.id);
    await sys(db,"update auth.sessions set not_after=now()-interval '1 second' where id=$1",[actor.sub]);
    await denyBoth(actor,row.id);
    await sys(db,"update auth.sessions set not_after=null where id=$1",[actor.sub]);
    await denyBoth(ROLES.user(actor.sub,{session_id:owner.sub}),row.id);
    await denyBoth(ROLES.user(actor.sub,{session_id:"not-a-session"}),row.id);
    await sys(db,"delete from auth.sessions where id=$1",[actor.sub]);
    await denyBoth(actor,row.id);
  });
  it("revokes queue access immediately when the account is MFA locked, downgraded, or loses its permission",async()=>{
    const row=await fixture(), locked=await freshFinance(), downgraded=await freshFinance();
    await sys(db,"insert into public.mfa_verification_failures(user_id,failed_count,locked_at) values($1,10,now()) on conflict(user_id) do update set locked_at=now()",[locked.sub]);
    await denyBoth(locked,row.id);
    await sys(db,"update public.admin_role_assignments set admin_role='analyst' where user_id=$1",[downgraded.sub]);
    await denyBoth(downgraded,row.id);
    await sys(db,"delete from public.admin_role_permissions where admin_role='finance' and permission='money.ledger'");
    try{await denyBoth(finance,row.id);assert.equal((await detail(owner,row.id)).attempt.id,row.id);}finally{
      await sys(db,"insert into public.admin_role_permissions(admin_role,permission,description_en,description_ar) values('finance','money.ledger','Independent fixture restoration','اختبار')");
    }
  });
  it("keeps table, sensitive columns, direct mutation, private helper and audit tampering unavailable",async()=>{
    const row=await fixture();
    for(const actor of [owner,finance,operations,ROLES.user(SEED.customer),ROLES.anon,ROLES.service]){
      for(const sql of ["select id from public.payment_checkout_attempts", "select request_text from public.payment_checkout_attempts", "update public.payment_checkout_attempts set reconciliation_required=false", "delete from public.payment_checkout_attempts"]){await expectError(as(db,actor,sql),/permission denied/);}
    }
    for(const actor of [owner,finance]){
      await expectError(as(db,actor,"select public.gov2_log_read('x','payment_checkout_attempts','{}','{}','reconciliation','{}',0)"),/permission denied/);
      await expectError(as(db,actor,"select public.checkout_payable_snapshot($1,'booking',$2,false)",[SEED.customer,row.target]),/permission denied/);
      await expectError(as(db,actor,"update public.admin_audit_logs set action='hidden' where action like 'checkout.operator.%'"),/permission denied|append.only|immutable|cannot|never/i);
      await expectError(as(db,actor,"delete from public.admin_audit_logs where action like 'checkout.operator.%'"),/permission denied|append.only|immutable|cannot|never/i);
    }
  });
  it("returns identical list/detail allowlists, excludes nonheld guesses and hides all sensitive sentinels",async()=>{
    const held=await fixture({status:"captured",flag:true,current:false,type:"subscription"});
    const found=await list(finance,[null,"subscription",held.id,held.target,1,0]);
    assert.equal(found.total,1);assert.equal(found.items.length,1);
    const got=await detail(finance,held.id);assert.deepEqual(got.attempt,found.items[0]);assert.equal(got.attempt.is_current,false);
    assert.deepEqual(Object.keys(got).sort(),["as_of","attempt"]);assert.deepEqual(Object.keys(got.attempt).sort(),expectedFields);
    assert.equal(got.attempt.amount_sar,125.25);assert.equal(got.attempt.currency,"SAR");
    assert.doesNotMatch(JSON.stringify([got,found]),new RegExp(sentinel+"|actor_id|provider_id|charge_id|gateway|request_text|checkout_url","i"));
    for(const state of ["ready","captured","failed"]){const hidden=await fixture({status:state});assert.equal((await detail(finance,hidden.id)).attempt,null);assert.equal((await list(finance,[null,null,hidden.id,null,1,0])).total,0);}
    const guessed=randomUUID();assert.equal((await detail(finance,guessed)).attempt,null);assert.deepEqual((await list(finance,[null,null,guessed,null,1,0])).items,[]);
    const audit=await sys(db,"select details from public.admin_audit_logs where action like 'checkout.operator.%'");
    assert.doesNotMatch(JSON.stringify(audit),new RegExp(sentinel,"i"));
  });
  it("enforces typed exact-UUID searches and strict bounds, preserving no audit receipts for invalid input",async()=>{
    const before=await auditRows();
    for(const args of [["",null,null,null,25,0],[null,"",null,null,25,0],["ready",null,null,null,25,0],[null,null,null,null,-1,0],[null,null,null,null,51,0],[null,null,null,null,25,-1],[null,null,null,null,25,100001],[null,null,null,null,null,0],[null,null,null,null,25,null],[null,null,"not-a-uuid",null,25,0],[null,null,null,"%' OR TRUE --",25,0]]){
      const error=await expectError(list(finance,args),/Invalid|invalid input syntax/);assert.ok(["22023","22P02"].includes(error.code));
    }
    await expectError(detail(finance,null),/Invalid/);
    assert.equal(await auditRows(),before);
    const row=await fixture();assert.equal((await list(finance,[null,null,row.id,randomUUID(),50,0])).total,0);
    assert.equal((await list(finance,[null,null,null,null,50,100000])).items.length,0);
  });
  it("keeps pagination deterministic and audits exactly the rows returned with complete purpose metadata",async()=>{
    const a=await fixture({type:"membership",created:"2001-01-01T00:00:00Z"}),b=await fixture({type:"membership",created:"2001-01-01T00:00:00Z"});
    const one=await list(finance,[null,"membership",null,null,1,0]),two=await list(finance,[null,"membership",null,null,1,1]);
    assert.equal(one.total,2);assert.equal(two.total,2);assert.deepEqual([one.items[0].id,two.items[0].id],[a.id,b.id].sort());
    const audit=(await sys(db,"select actor_id,target_type,target_id,details from public.admin_audit_logs where action='checkout.operator.list' and details->'filter'->>'purchase_type'='membership' order by created_at desc,id desc"));
    assert.equal(audit.length,2);
    for(const record of audit){assert.equal(record.actor_id,finance.sub);assert.equal(record.target_type,"payment_checkout_attempts");assert.equal(record.details.console_role,"finance");assert.equal(record.details.purpose,"reconciliation");assert.equal(record.details.rows,1);assert.equal(record.details.target_ids.length,1);assert.equal(record.target_id,record.details.target_ids[0]);assert.deepEqual([...record.details.fields].sort(),expectedFields);}
    const before=await auditRows();await list(finance,[null,null,randomUUID(),null,1,0]);await detail(finance,randomUUID());assert.equal(await auditRows()-before,2);
    const empties=await sys(db,"select details from public.admin_audit_logs where action like 'checkout.operator.%' and (details->>'rows')::int=0");assert.ok(empties.length>=2);assert.ok(empties.every(r=>r.details.target_ids.length===0));
  });
  it("fails closed for audit failure on populated and empty responses without any checkout or financial changes",async()=>{
    const row=await fixture();
    const tableNames=["payment_checkout_attempts","transactional_ledger","reconciliation_breaks","tap_reconciliation_events","tap_reconciliation_runs","refund_requests"];
    const snapshot=async()=>{const out={};for(const name of tableNames)out[name]=(await sys(db,`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') value from public.${name} t`))[0].value;return out;};
    const before=await snapshot(), beforeAudit=await auditRows();
    await db.exec(`create function public.test_independent_read_audit_failure() returns trigger language plpgsql as $$ begin if NEW.action like 'checkout.operator.%' then raise exception 'Independent audit unavailable'; end if; return NEW; end $$;
      create trigger test_independent_read_audit_failure before insert on public.admin_audit_logs for each row execute function public.test_independent_read_audit_failure();`);
    try{for(const call of [()=>list(finance),()=>list(finance,[null,null,randomUUID(),null,1,0]),()=>detail(finance,row.id),()=>detail(finance,randomUUID())])await expectError(call(),/Independent audit unavailable/);}finally{await db.exec("drop trigger test_independent_read_audit_failure on public.admin_audit_logs;drop function public.test_independent_read_audit_failure();");}
    assert.deepEqual(await snapshot(),before);assert.equal(await auditRows(),beforeAudit);
    await list(finance);await detail(finance,row.id);assert.deepEqual(await snapshot(),before);assert.equal(await auditRows(),beforeAudit+2);
  });
  it("uses qualified relations despite caller temporary-schema shadows",async()=>{
    const row=await fixture();
    await db.exec(`create temporary table payment_checkout_attempts(id uuid);insert into payment_checkout_attempts values('${randomUUID()}');create temporary table admin_role_permissions(admin_role text,permission text);`);
    try{assert.equal((await detail(finance,row.id)).attempt.id,row.id);await denyBoth(analyst,row.id);}finally{await db.exec("drop table pg_temp.payment_checkout_attempts;drop table pg_temp.admin_role_permissions;");}
  });
});
