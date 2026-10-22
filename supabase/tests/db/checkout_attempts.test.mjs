import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sessionClaims, sys } from "./harness.mjs";

let db;
let service;
let sequence = 0;
const CONTEXT = "a".repeat(64);
const OTHER_CONTEXT = "b".repeat(64);
const TYPES = ["booking", "gift_card", "package", "membership", "tip", "subscription"];
before(async () => { db = await createMigratedDb(); service = await serviceFor(db, SEED.employee1); });
after(async () => { await db?.close(); });

async function payable(type = "gift_card") {
  const actor = type === "subscription" ? SEED.owner1 : await createUser(db);
  let id;
  sequence += 1;
  if (type === "gift_card") {
    id = (await as(db, ROLES.user(actor), "select purchase_gift_card('Recipient', '+966500000123', null, 50, '') r"))[0].r.purchase_id;
  } else if (type === "package") {
    const pkg = (await sys(db, "insert into packages(provider_id,name_en,name_ar,price,session_count,expires_in_days,is_active) values($1,'Checkout package','باقة',50,2,90,true) returning id", [SEED.provider1]))[0].id;
    id = (await as(db, ROLES.user(actor), "select purchase_service_package($1) r", [pkg]))[0].r.purchase_id;
  } else if (type === "membership") {
    id = (await sys(db, `insert into memberships(customer_id,provider_id,plan_name_en,plan_name_ar,amount_due,period_days,visits_per_period,covers_all_services,idempotency_key)
      values($1,$2,'Checkout plan','اشتراك',50,30,2,true,$3) returning id`, [actor, SEED.provider1, randomUUID()]))[0].id;
  } else if (type === "subscription") {
    id = (await as(db, ROLES.user(actor), "select subscribe_provider_plan($1,'growth','monthly') r", [SEED.provider1]))[0].r.purchase_id;
  } else {
    const booking = (await sys(db, `insert into bookings(customer_id,branch_id,employee_id,service_id,status,scheduled_at,duration_minutes,subtotal_price,total_price,tax_amount,deposit_required,platform_commission,source)
      values($1,$2,$3,$4,$5,now()+make_interval(days=>$6::int),30,100,100,15,$7,0,'link') returning id`,
      [actor, SEED.branch1, SEED.employee1, service.id, type === "tip" ? "completed" : "pending_payment", 30 + sequence, type === "tip" ? 0 : 50]))[0].id;
    if (type === "booking") id = booking;
    else id = (await sys(db, "insert into booking_tips(booking_id,customer_id,employee_id,provider_id,amount,status) values($1,$2,$3,$4,50,'pending') returning id", [booking, actor, SEED.employee1, SEED.provider1]))[0].id;
  }
  const table = { booking: "bookings", gift_card: "gift_cards", package: "user_packages", membership: "memberships", tip: "booking_tips", subscription: "subscription_payments" }[type];
  const field = { booking: "deposit_required", gift_card: "original_amount", package: "amount_paid", membership: "amount_due", tip: "amount", subscription: "amount" }[type];
  const amount = Number((await sys(db, `select ${field} amount from ${table} where id=$1`, [id]))[0].amount);
  return { type, actor, id, amount, table };
}
function wire(p, id, change = {}) {
  return JSON.stringify({
    amount: p.amount, currency: "SAR", threeDSecure: true, save_card: false,
    metadata: { purchase_type: p.type, [p.type === "booking" ? "booking_id" : "purchase_id"]: p.id, checkout_attempt_id: id },
    reference: { transaction: id, idempotent: id, order: p.id },
    customer: { first_name: "Local fixture" }, ...change,
  });
}
async function claim(p, { id = randomUUID(), text = wire(p, id), context = CONTEXT, actor = p.actor, caller = ROLES.service } = {}) {
  return (await as(db, caller, "select claim_checkout_attempt($1,$2,$3,$4,$5,$6) r", [actor, p.type, p.id, id, text, context]))[0].r;
}
const read = async (p, actor = p.actor, context = CONTEXT, caller = ROLES.service) =>
  (await as(db, caller, "select read_checkout_attempt($1,$2,$3,$4) r", [actor, p.type, p.id, context]))[0].r;
function receipt(a, status = "INITIATED", change = {}) {
  const payload = JSON.parse(a.request_text);
  return { id: a.charge_id ?? `chg_${a.id.replaceAll("-", "")}`, amount: a.amount_sar, currency: "SAR", status,
    metadata: payload.metadata, reference: payload.reference, transaction: { url: "https://checkout.local.invalid/charge" }, ...change };
}
const record = async (a, charge = receipt(a), context = CONTEXT, caller = ROLES.service) =>
  (await as(db, caller, "select record_checkout_attempt($1,$2,$3::jsonb) r", [a.id, context, JSON.stringify(charge)]))[0].r;
const unknown = async (a, context = CONTEXT, caller = ROLES.service) =>
  (await as(db, caller, "select mark_checkout_attempt_unknown($1,$2) r", [a.id, context]))[0].r;

describe("durable checkout ownership and dispatch", () => {
  for (const type of TYPES) {
    it(`uses authoritative ${type} ownership and amount`, async () => {
      const p = await payable(type);
      assert.equal(await read(p), null);
      await expectError(claim(p, { actor: await createUser(db) }), /not found|payer|owner/i);
      const wrongAmountId = randomUUID();
      await expectError(claim(p, { id: wrongAmountId, text: wire(p, wrongAmountId, { amount: p.amount + 1 }) }), /amount/i);
      const a = await claim(p);
      assert.equal(a.dispatch, true);
      assert.equal(a.actor_id, p.actor);
      assert.equal(a.purchase_type, type);
      assert.equal(a.target_id, p.id);
      assert.equal(Number(a.amount_sar), p.amount);
      assert.equal(a.status, "submitting");
      assert.equal(a.currency, "SAR");
      assert.equal(a.request_sha256, createHash("sha256").update(a.request_text).digest("hex"));
      assert.equal((await read(p)).id, a.id);
      await expectError(read(p, await createUser(db)), /not found|payer|owner/i);
    });
  }
  it("returns one initial dispatch across same/new UUID claims and preserves exact wire bytes", async () => {
    const p = await payable();
    const id = randomUUID();
    const text = ` \n ${wire(p, id)} \n`;
    const claims = await Promise.all([claim(p, { id, text }), claim(p, { id, text }), claim(p)]);
    assert.equal(claims.filter((a) => a.dispatch).length, 1);
    assert.equal(new Set(claims.map((a) => a.id)).size, 1);
    assert.equal(claims[0].request_text, text);
    assert.equal(claims[0].request_sha256, createHash("sha256").update(text).digest("hex"));
    await expectError(claim(p, { id, text: wire(p, id) }), /immutable|different|conflict|request/i);
    const changed = await payable();
    await expectError(claim(changed, { id }), /already|different|conflict|attempt/i);
  });
  it("rejects unauthorized roles and direct table access, including service direct mutations", async () => {
    const p = await payable();
    const a = await claim(p);
    for (const user of [ROLES.anon, ROLES.user(p.actor), ROLES.user(SEED.owner1)]) {
      await expectError(claim(p, { caller: user }), /permission denied|Service role/i);
      await expectError(read(p, p.actor, CONTEXT, user), /permission denied|Service role/i);
      await expectError(record(a, receipt(a), CONTEXT, user), /permission denied|Service role/i);
      await expectError(unknown(a, CONTEXT, user), /permission denied|Service role/i);
      await expectError(as(db, user, "select * from payment_checkout_attempts"), /permission denied/);
    }
    await expectError(as(db, ROLES.service, "update payment_checkout_attempts set status='failed' where id=$1", [a.id]), /permission denied/);
    await expectError(as(db, ROLES.service, "select * from payment_checkout_attempts"), /permission denied/);
    await expectError(as(db, ROLES.service, "select checkout_payable_snapshot($1,$2,$3,false)", [p.actor,p.type,p.id]), /permission denied/);
  });
  it("fails closed for gateway context, missing routing and paused seller", async () => {
    const p = await payable("booking");
    for (const context of ["", "x".repeat(64), OTHER_CONTEXT.slice(1)]) {
      await expectError(claim(p, { context }), /context/i);
    }
    await sys(db, "update platform_feature_flags set is_enabled=true where flag_key='payments_marketplace_split'");
    await expectError(claim(p), /split|routing/i);
    await sys(db, "update platform_feature_flags set is_enabled=false where flag_key='payments_marketplace_split'");
    await sys(db, "update providers set is_verified=false where id=$1", [SEED.provider1]);
    await expectError(claim(p), /salon|provider|seller/i);
    await sys(db, "update providers set is_verified=true where id=$1", [SEED.provider1]);
    const a = await claim(p);
    await expectError(read(p, p.actor, OTHER_CONTEXT), /context/i);
    await expectError(claim(p, { context: OTHER_CONTEXT }), /context/i);
    await expectError(record(a, receipt(a), OTHER_CONTEXT), /context/i);
    await expectError(unknown(a, OTHER_CONTEXT), /context/i);
  });
  it("rejects malformed payload bindings and a target that is no longer payable", async () => {
    const p = await payable();
    const id = randomUUID();
    const base = JSON.parse(wire(p,id));
    for (const payload of ["not-json", "null", "[]", JSON.stringify({...base,currency:"USD"}),
      JSON.stringify({...base,amount:p.amount+1}), JSON.stringify({...base,metadata:{...base.metadata,checkout_attempt_id:randomUUID()}}),
      JSON.stringify({...base,reference:{...base.reference,idempotent:randomUUID()}}),
      JSON.stringify({...base,reference:{...base.reference,order:randomUUID()}})]) {
      await expectError(claim(p,{id,text:payload}), /request|JSON|amount|currency|metadata|reference/i);
    }
    await sys(db, "update gift_cards set status='cancelled' where id=$1", [p.id]);
    await expectError(claim(p), /awaiting|payable|payment/i);
  });
});

describe("durable checkout uncertain outcomes and receipt binding", () => {
  it("never reclaims an old submission or an unknown attempt for another POST", async () => {
    const p = await payable();
    const a = await claim(p);
    await sys(db, "update payment_checkout_attempts set created_at=now()-interval '3 days' where id=$1", [a.id]);
    assert.equal((await claim(p)).dispatch, false);
    assert.equal((await unknown(a)).status, "unknown");
    const again = await claim(p);
    assert.equal(again.id,a.id);
    assert.equal(again.dispatch,false);
    assert.equal((await read(p)).status,"unknown");
    assert.equal((await unknown(a)).status,"unknown");
  });
  it("recovers a matching ready charge and does not overwrite it with a raced unknown marker", async () => {
    const p=await payable(), a=await claim(p);
    await unknown(a);
    const ready=await record(a);
    assert.equal(ready.status,"ready");
    assert.equal(ready.charge_id,receipt(a).id);
    assert.equal((await unknown(a)).status,"ready");
    const replay=await claim(p);
    assert.equal(replay.id,a.id);
    assert.equal(replay.dispatch,false);
    assert.equal(replay.checkout_url,ready.checkout_url);
  });
  it("validates every fetched receipt binding, including optional echoed idempotency", async () => {
    const p=await payable(), a=await claim(p), base=receipt(a);
    const changes=[
      {amount:p.amount+1},{currency:"USD"},{id:"bad"},
      {metadata:{...base.metadata,checkout_attempt_id:randomUUID()}},
      {metadata:{...base.metadata,purchase_id:randomUUID()}},
      {metadata:{...base.metadata,purchase_type:"booking"}},
      {reference:{...base.reference,transaction:randomUUID()}},
      {reference:{...base.reference,order:randomUUID()}},
      {reference:{...base.reference,idempotent:randomUUID()}},
    ];
    for (const change of changes) await expectError(record(a,{...base,...change}), /receipt|charge|amount|currency|reference|metadata/i);
    assert.equal((await read(p)).status,"submitting");
    const noEcho={...base,reference:{transaction:a.id,order:p.id}};
    assert.equal((await record(a,noEcho)).status,"ready");
    await expectError(record(a,{...base,id:"chg_different"}), /already|bound|charge/i);
    const other=await claim(await payable());
    await expectError(record(other,receipt(other,"INITIATED",{id:base.id})), /already|unique|charge/i);
  });
  for (const status of ["UNKNOWN","TIMEDOUT","UNRECOGNIZED"]) {
    it(`quarantines authenticated ${status} without allowing a new attempt`,async()=>{
      const p=await payable(),a=await claim(p);
      assert.equal((await record(a,receipt(a,status))).status,"unknown");
      assert.equal((await claim(p)).dispatch,false);
    });
  }
  for (const status of ["FAILED","DECLINED","CANCELLED","ABANDONED","RESTRICTED","VOID"]) {
    it(`only a bound authenticated ${status} receipt permits a new attempt`,async()=>{
      const p=await payable(),a=await claim(p);
      assert.equal((await record(a,receipt(a,status))).status,"failed");
      assert.equal((await read(p)).status,"failed");
      const next=await claim(p);
      assert.notEqual(next.id,a.id);
      assert.equal(next.dispatch,true);
      assert.equal((await record(a,receipt(a,"INITIATED"))).status,"failed");
    });
  }
  it("keeps CAPTURED monotonic across stale results and repeated webhooks",async()=>{
    const p=await payable(),a=await claim(p);
    assert.equal((await record(a,receipt(a,"CAPTURED"))).status,"captured");
    assert.equal((await record(a,receipt(a,"INITIATED"))).status,"captured");
    assert.equal((await record(a,receipt(a,"FAILED"))).status,"captured");
    assert.equal((await unknown(a)).status,"captured");
    const current=await claim(p);
    assert.equal(current.id,a.id);
    assert.equal(current.dispatch,false);
    // Receipt persistence is not money confirmation: the existing webhook command remains responsible.
    assert.equal((await sys(db,"select status from gift_cards where id=$1",[p.id]))[0].status,"pending_payment");
    assert.equal((await record(a,receipt(a,"CAPTURED"))).status,"captured");
  });
  it("records a late capture of a failed attempt and quarantines the newer attempt",async()=>{
    const p=await payable(),a=await claim(p);
    await record(a,receipt(a,"DECLINED"));
    const next=await claim(p);
    await record(next,receipt(next));
    const late=await record(a,receipt(a,"CAPTURED"));
    assert.equal(late.status,"captured");
    assert.equal(late.reconciliation_required,true);
    const latest=await read(p);
    assert.equal(latest.id,next.id);
    assert.equal(latest.status,"unknown");
    assert.equal(latest.reconciliation_required,true);
    assert.equal((await record(next,receipt(next))).status,"unknown");
    assert.equal((await claim(p)).dispatch,false);
    assert.equal((await record(next,receipt(next,"CAPTURED"))).status,"captured");
    assert.equal((await record(a,receipt(a,"CAPTURED"))).status,"captured");
    assert.equal((await sys(db,"select count(*)::int n from payment_checkout_attempts where target_id=$1 and status='captured'",[p.id]))[0].n,2);
  });
  it("freezes financial identity and wire bytes while writing minimized audit events",async()=>{
    const p=await payable(),a=await claim(p);
    for (const [field,value] of [["request_text","{}"],["request_sha256","0".repeat(64)],["gateway_context",OTHER_CONTEXT],["actor_id",await createUser(db)],["target_id",randomUUID()],["amount_sar","1"]]) {
      await expectError(sys(db,`update payment_checkout_attempts set ${field}=$1 where id=$2`,[value,a.id]),/immutable|frozen|identity/i);
    }
    await unknown(a);
    await record(a);
    const audit=await sys(db,"select action,details from admin_audit_logs where target_type='payment_checkout_attempts' and target_id=$1 order by created_at",[a.id]);
    assert.ok(audit.some(x=>x.action==="checkout.claimed"));
    assert.ok(audit.some(x=>x.action==="checkout.unknown"));
    assert.ok(audit.some(x=>x.action==="checkout.recorded"));
    assert.ok(audit.every(x=>!JSON.stringify(x.details).includes("Local fixture")));
    assert.ok(audit.every(x=>!Object.hasOwn(x.details,"request_text")));
    assert.ok(audit.every(x=>x.details.actor_id===p.actor));
  });
});


describe("checkout continuation boundaries", () => {
  it("recovers after cancellation and consumes an existing capture before pending validation", async () => {
    const p=await payable(),a=await claim(p);
    await sys(db,"update gift_cards set status='cancelled' where id=$1",[p.id]);
    assert.equal((await read(p)).id,a.id);
    await unknown(a);
    assert.equal((await record(a,receipt(a,"CAPTURED"))).status,"captured");
    const replay=await claim(p);
    assert.equal(replay.id,a.id);
    assert.equal(replay.dispatch,false);
  });
  it("replays a verified capture after the existing money command confirms the purchase",async()=>{
    const p=await payable(),a=await claim(p),charge=receipt(a,"CAPTURED");
    await record(a,charge);
    await as(db,ROLES.service,"select confirm_purchase_payment('gift_card',$1,$2,$3)",[p.id,charge.id,p.amount]);
    assert.equal((await read(p)).status,"captured");
    assert.equal((await record(a,charge)).status,"captured");
    assert.equal((await claim(p)).dispatch,false);
    assert.equal((await sys(db,"select count(*)::int n from transactional_ledger where payment_intent_id=$1",[charge.id]))[0].n,1);
  });
  it("never dispatches again with a failed attempt's original UUID",async()=>{
    const p=await payable(),id=randomUUID(),text=wire(p,id),a=await claim(p,{id,text});
    await record(a,receipt(a,"FAILED"));
    const replay=await claim(p,{id,text});
    assert.equal(replay.status,"failed");
    assert.equal(replay.dispatch,false);
  });
  it("fails closed when routing configuration is absent",async()=>{
    const p=await payable();
    const flag=(await sys(db,"delete from platform_feature_flags where flag_key='payments_marketplace_split' returning *"))[0];
    try { await expectError(claim(p),/routing/i); }
    finally {
      await sys(db,"insert into platform_feature_flags select * from jsonb_populate_record(null::public.platform_feature_flags,$1::jsonb)",[JSON.stringify(flag)]);
    }
  });
  it("does not return a ready checkout after its seller is paused",async()=>{
    const p=await payable("booking"),a=await claim(p);
    await record(a);
    await sys(db,"update providers set is_verified=false where id=$1",[SEED.provider1]);
    try { await expectError(claim(p),/salon|seller/i); }
    finally { await sys(db,"update providers set is_verified=true where id=$1",[SEED.provider1]); }
  });
  it("keeps current-submission and already-captured siblings quarantined after an older late capture",async()=>{
    for (const siblingState of ["submitting","captured"]) {
      const p=await payable(),old=await claim(p);
      await record(old,receipt(old,"DECLINED"));
      const current=await claim(p);
      if (siblingState==="captured") await record(current,receipt(current,"CAPTURED"));
      await record(old,receipt(old,"CAPTURED"));
      const latest=await read(p);
      assert.equal(latest.id,current.id);
      assert.equal(latest.status,siblingState==="captured"?"captured":"unknown");
      assert.equal(latest.reconciliation_required,true);
      assert.equal((await claim(p)).dispatch,false);
    }
  });
});


describe("private checkout audit trigger", () => {
  it("records administrator maintenance without copying immutable wire or untrusted gateway values", async () => {
    const p=await payable(),id=randomUUID();
    const text=wire(p,id,{customer:{first_name:"AUDIT_PRIVATE_NAME",email:"audit-private@example.invalid",phone:{number:"AUDIT_PRIVATE_PHONE"}}});
    const a=await claim(p,{id,text});
    const trigger=await sys(db,`select p.proname from pg_trigger t join pg_proc p on p.oid=t.tgfoid
      where t.tgrelid='public.payment_checkout_attempts'::regclass and t.tgname='trg_audit_admin_write' and t.tgenabled<>'D'`);
    assert.deepEqual(trigger.map(r=>r.proname),["audit_checkout_admin_write"]);
    const admin=ROLES.user(await createUser(db,{role:"admin"}));
    await expectError(as(db,admin,"update payment_checkout_attempts set gateway_status='maintenance' where id=$1",[a.id]),/permission denied/);
    // An owner-run maintenance fixture retains the admin JWT, like a future authorized definer command.
    // It grants no table privilege to an administrator or the service role.
    await db.transaction(async tx=>{
      await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:"authenticated",sub:admin.sub,...sessionClaims(admin)})]);
      assert.equal((await tx.query("select public.is_admin() ok")).rows[0].ok,true);
      await tx.query("update payment_checkout_attempts set gateway_status=$2,checkout_url=$3 where id=$1",
        [a.id,"AUDIT_RAW_GATEWAY audit-private@example.invalid","https://local.invalid/AUDIT_PRIVATE_TOKEN"]);
    });
    const rows=await sys(db,"select actor_id,action,details from admin_audit_logs where target_type='payment_checkout_attempts' and target_id=$1 order by created_at",[a.id]);
    const maintenance=rows.find(r=>r.action==="payment_checkout_attempts.update");
    assert.ok(maintenance,"the actual administrator trigger emitted its audit event");
    assert.equal(maintenance.actor_id,admin.sub);
    assert.equal(maintenance.details.actor_id,p.actor);
    assert.equal(maintenance.details.status,"submitting");
    assert.equal(maintenance.details.request_sha256,a.request_sha256);
    assert.deepEqual(maintenance.details.changed_fields,["checkout_url","gateway_status"]);
    const auditText=JSON.stringify(rows);
    for(const privateValue of ["AUDIT_PRIVATE_NAME","audit-private@example.invalid","AUDIT_PRIVATE_PHONE","AUDIT_RAW_GATEWAY","AUDIT_PRIVATE_TOKEN",text]) {
      assert.equal(auditText.includes(privateValue),false,"private request/gateway contents never enter the append-only audit log");
    }
    assert.equal((await sys(db,"select request_text from payment_checkout_attempts where id=$1",[a.id]))[0].request_text,text);
  });
});


describe("untrusted gateway status audit minimization",()=>{
  it("keeps raw unexpected receipt status private and audits only UNRECOGNIZED",async()=>{
    const p=await payable(),a=await claim(p);
    const untrusted="unrecognized audit-private@example.invalid AUDIT_PRIVATE_STATUS_TOKEN";
    const observed=await record(a,receipt(a,untrusted));
    assert.equal(observed.status,"unknown");
    assert.equal(observed.gateway_status,untrusted.toUpperCase(),"private provider evidence remains available for reconciliation");
    const rows=await sys(db,"select action,details from admin_audit_logs where target_type='payment_checkout_attempts' and target_id=$1",[a.id]);
    const recorded=rows.find(r=>r.action==="checkout.recorded");
    assert.ok(recorded);
    assert.equal(recorded.details.gateway_status,"UNRECOGNIZED");
    const allAudit=JSON.stringify(rows).toUpperCase();
    for(const sentinel of [untrusted,"audit-private@example.invalid","AUDIT_PRIVATE_STATUS_TOKEN"]) {
      assert.equal(allAudit.includes(sentinel.toUpperCase()),false,"no target audit entry copies untrusted provider status");
    }
    const known=await record(a,receipt(a,"INITIATED"));
    assert.equal(known.status,"ready");
    const knownAudit=await sys(db,"select details from admin_audit_logs where target_type='payment_checkout_attempts' and target_id=$1 and action='checkout.recorded' order by created_at desc limit 1",[a.id]);
    assert.equal(knownAudit[0].details.gateway_status,"INITIATED");
  });
});
