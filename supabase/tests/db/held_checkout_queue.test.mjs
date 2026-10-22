import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

let db, owner, finance, operations, analyst;
const KEYS = ["id","purchase_type","target_id","amount_sar","currency","status","is_current","reconciliation_required","created_at","updated_at","unknown_at"].sort();
const list = async (actor, params = [null,null,null,null,25,0]) => (await as(db,actor,"select admin_list_held_checkout_attempts($1,$2,$3,$4,$5,$6) r",params))[0].r;
const detail = async (actor,id) => (await as(db,actor,"select admin_get_held_checkout_attempt($1) r",[id]))[0].r;
async function seed(status="unknown", flagged=false, type="gift_card", current=true, created="2026-01-01T00:00:00Z") {
  const id=randomUUID(), target=randomUUID();
  await sys(db,`insert into payment_checkout_attempts(id,actor_id,purchase_type,target_id,amount_sar,status,request_text,request_sha256,gateway_context,charge_id,checkout_url,gateway_status,is_current,reconciliation_required,created_at,unknown_at)
    values($1,$2,$3,$4,50,$5,'{"email":"private-fixture@example.invalid","phone":"PRIVATE_FIXTURE"}',repeat('a',64),repeat('b',64),$6,$7,'PRIVATE_GATEWAY',$8,$9,$10,case when $5='unknown' then $10::timestamptz end)`,
    [id,SEED.customer,type,target,status,["captured","failed","ready"].includes(status)?`chg_${id}`:null,status==="ready"?"https://private.invalid/checkout":null,current,flagged,created]);
  return {id,target};
}
before(async()=>{db=await createMigratedDb();for(const role of ["owner","finance","operations","analyst"]){const user=ROLES.user(await createUser(db,{role:"admin",adminRole:role}));if(role==="owner")owner=user;else if(role==="finance")finance=user;else if(role==="operations")operations=user;else analyst=user;}});
after(async()=>{await db?.close();});

describe("minimized read-only held checkout operator queue",()=>{
  it("requires existing finance authority; denies non-console roles, service tokens and direct table reads",async()=>{
    const row=await seed();
    for(const actor of [ROLES.anon,ROLES.service,ROLES.user(SEED.customer),ROLES.user(SEED.owner1),operations,analyst,ROLES.user(finance.sub,{aal:"aal1"}),ROLES.user(finance.sub,{session_id:randomUUID()})]){
      await expectError(list(actor),/permission|Administrator|session|authentication|console/i);
      await expectError(detail(actor,row.id),/permission|Administrator|session|authentication|console/i);
    }
    for(const actor of [ROLES.anon,ROLES.service,finance,owner,ROLES.user(SEED.customer)])await expectError(as(db,actor,"select * from payment_checkout_attempts"),/permission denied/i);
    assert.ok((await list(owner)).items.some(x=>x.id===row.id));
    assert.equal((await detail(finance,row.id)).attempt.id,row.id);
  });
  it("includes unknown/submitting and captured/failed quarantine across all six types, including noncurrent",async()=>{
    for(const [i,type] of ["booking","gift_card","package","membership","tip","subscription"].entries()){
      const state=["submitting","unknown","captured","failed","captured","unknown"][i];
      const row=await seed(state,["captured","failed"].includes(state),type,false);
      const response=await list(finance,[null,type,row.id,null,25,0]);
      assert.equal(response.total,1);assert.equal(response.items[0].id,row.id);
      assert.equal(response.items[0].is_current,false);
      assert.equal((await detail(finance,row.id)).attempt.status,state);
    }
    for(const status of ["ready","captured","failed"]){const row=await seed(status);assert.equal((await detail(finance,row.id)).attempt,null);assert.equal((await list(finance,[null,null,row.id,null,25,0])).total,0);}
  });
  it("returns exactly the same safe projection in list/detail and never private wire or provider fields",async()=>{
    const row=await seed();const response=await list(finance,[null,null,null,row.target,25,0]);const got=await detail(finance,row.id);
    assert.deepEqual(Object.keys(response).sort(),["items","total","as_of","limit","offset"].sort());
    assert.deepEqual(Object.keys(response.items[0]).sort(),KEYS);assert.deepEqual(Object.keys(got.attempt).sort(),KEYS);
    assert.deepEqual(got.attempt,response.items[0]);assert.equal(got.attempt.currency,"SAR");assert.equal(Number(got.attempt.amount_sar),50);
    assert.ok(Number.isFinite(Date.parse(got.as_of)));assert.doesNotMatch(JSON.stringify([got,response]),/PRIVATE_|private-fixture|private.invalid|request_text|gateway_context|actor_id|provider_id|charge_id|checkout_url/);
  });
  it("uses exact filters, stable oldest/id order and bounded pagination with honest empty pages",async()=>{
    const rows=await Promise.all([seed("submitting",false,"tip",true,"2020-01-01T00:00:00Z"),seed("submitting",false,"tip",true,"2020-01-01T00:00:00Z"),seed("submitting",false,"tip",true,"2020-01-02T00:00:00Z")]);
    const first=await list(finance,["submitting","tip",null,null,2,0]), second=await list(finance,["submitting","tip",null,null,2,2]);
    assert.deepEqual(first.items.map(x=>x.id),rows.slice(0,2).map(x=>x.id).sort());assert.equal(first.total,3);assert.equal(second.items.length,1);assert.equal(second.items[0].id,rows[2].id);
    assert.equal((await list(finance,[null,null,rows[0].id,randomUUID(),1,0])).total,0);
    assert.deepEqual((await list(finance,[null,null,null,null,50,100000])).items,[]);
    const defaults=(await as(db,finance,"select admin_list_held_checkout_attempts() r"))[0].r;assert.equal(defaults.limit,25);assert.equal(defaults.offset,0);
    assert.deepEqual(await detail(finance,randomUUID()).then(r=>r.attempt),null);
  });
  it("rejects invalid and null bounds/unknown filters and null detail before returning data",async()=>{
    for(const params of [["ready",null,null,null,25,0],["bogus",null,null,null,25,0],[null,"bogus",null,null,25,0],[null,null,null,null,0,0],[null,null,null,null,51,0],[null,null,null,null,null,0],[null,null,null,null,25,-1],[null,null,null,null,25,100001],[null,null,null,null,25,null]])await expectError(list(finance,params),/Invalid/i);
    await expectError(detail(finance,null),/Invalid/i);
  });
  it("logs every successful list/detail/empty read with allowlisted fields and filter IDs only",async()=>{
    const row=await seed();const before=(await sys(db,"select count(*)::int n from admin_audit_logs where action like 'checkout.operator.%'"))[0].n;
    await list(finance,[null,null,row.id,null,1,0]);await detail(finance,row.id);await detail(finance,randomUUID());
    const logs=await sys(db,"select action,actor_id,details from admin_audit_logs where action like 'checkout.operator.%' order by created_at desc,id desc limit 3");
    const after=(await sys(db,"select count(*)::int n from admin_audit_logs where action like 'checkout.operator.%'"))[0].n;assert.equal(after-before,3);
    for(const log of logs){assert.equal(log.actor_id,finance.sub);assert.equal(log.details.purpose,"reconciliation");assert.deepEqual([...log.details.fields].sort(),KEYS);assert.doesNotMatch(JSON.stringify(log.details),/PRIVATE_|private-fixture|private.invalid/);}
  });
  it("fails closed if audit cannot persist and performs no checkout, reconciliation or financial mutation",async()=>{
    const row=await seed();const snap=async()=>JSON.stringify((await sys(db,"select to_jsonb(a) r from payment_checkout_attempts a order by id")).map(x=>x.r));
    const before=await snap();
    await db.exec(`create function public.test_fail_checkout_read_audit() returns trigger language plpgsql as $$ begin if NEW.action like 'checkout.operator.%' then raise exception 'Controlled audit unavailable'; end if; return NEW; end $$;
      create trigger test_fail_checkout_read_audit before insert on admin_audit_logs for each row execute function public.test_fail_checkout_read_audit();`);
    try{await expectError(list(finance),/audit unavailable/);await expectError(detail(finance,row.id),/audit unavailable/);}finally{await db.exec("drop trigger test_fail_checkout_read_audit on admin_audit_logs;drop function public.test_fail_checkout_read_audit();");}
    assert.equal(await snap(),before);await list(finance);await detail(finance,row.id);assert.equal(await snap(),before);
  });
});
