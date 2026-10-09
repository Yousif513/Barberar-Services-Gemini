// FIX-MONEY: M-16 (one tax invoice per booking) and P-15 (deterministic invoice chain order).
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

const customer = ROLES.user(SEED.customer);
let db;
let svc;
let seq = 0;

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  await sys(db, `update providers set vat_number = '310123456700003' where id = $1`, [SEED.provider1]);
});

async function completedBooking() {
  seq += 1;
  const b = (await sys(db,
    `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price,
       tax_amount, deposit_required, platform_commission, source, is_first_visit)
     values ($1, $2, $3, $4, 'completed', now() - make_interval(days => 10, mins => $5::int), 30, 100, 100, 15, 0, 0, 'marketplace', true) returning id`,
    [SEED.customer, SEED.branch1, SEED.employee1, svc.id, seq * 40]))[0];
  return b.id;
}
const generate = (user, id) => as(db, user, `select generate_zatca_tax_invoice($1) r`, [id]).then((r) => r[0].r);

describe("M-16: one tax invoice per booking", () => {
  it("a repeated or concurrent-looking request returns the same invoice, from every role that may ask", async () => {
    const id = await completedBooking();
    const owner = ROLES.user(SEED.owner1);
    const admin = ROLES.user(await createUser(db, { role: "admin" }));
    const a = await generate(customer, id);
    const b = await generate(owner, id);
    const c = await generate(admin, id);
    assert.equal(a.idempotent, undefined);
    assert.equal(b.idempotent, true);
    assert.equal(c.invoice_number, a.invoice_number);
    assert.equal((await sys(db, `select count(*)::int n from invoices where booking_id = $1`, [id]))[0].n, 1);
  });

  it("the table refuses a second invoice for a booking whatever the code does", async () => {
    const id = await completedBooking();
    await generate(customer, id);
    await assert.rejects(sys(db,
      `insert into invoices (booking_id, provider_id, invoice_number, subtotal_sar, vat_amount_sar, total_amount_sar, seller_name, seller_vat_number, invoice_hash, zatca_qr_code)
       values ($1, $2, 'INV-DUP-1', 100, 15, 115, 'Seller', '300000000000003', 'h-dup', 'qr')`, [id, SEED.provider1]), /duplicate key|unique/i);
  });

  it("the existence check happens under the provider's chain lock", async () => {
    const def = (await sys(db, `select pg_get_functiondef('public.generate_zatca_tax_invoice(uuid)'::regprocedure) d`))[0].d.replace(/\r/g, "");
    assert.ok(def.indexOf("pg_advisory_xact_lock") < def.indexOf("FROM public.invoices WHERE booking_id = p_booking_id"), "lock before the check");
  });
});

describe("P-15: the invoice chain follows a per-provider counter", () => {
  it("numbers invoices 1, 2, 3 per provider in issue order and links each to the previous one", async () => {
    const ids = [await completedBooking(), await completedBooking(), await completedBooking()];
    const issued = [];
    for (const id of ids) issued.push(await generate(customer, id));
    const seqs = (await sys(db, `select chain_seq::int s from invoices where id = any ($1::uuid[]) order by chain_seq`, [issued.map((i) => i.id)])).map((r) => r.s);
    assert.equal(seqs[1], seqs[0] + 1);
    assert.equal(seqs[2], seqs[1] + 1);
    assert.equal(issued[1].previous_invoice_hash, issued[0].invoice_hash);
    assert.equal(issued[2].previous_invoice_hash, issued[1].invoice_hash);
  });

  it("two invoices with the same timestamp are ordered by the counter, not by a random uuid", async () => {
    const insert = (id, hash) => sys(db,
      `insert into invoices (id, provider_id, invoice_number, subtotal_sar, vat_amount_sar, total_amount_sar, seller_name, seller_vat_number, invoice_hash, zatca_qr_code, created_at)
       values ($1, $2, $3, 100, 15, 115, 'Seller', '300000000000003', $4, 'qr', '2030-01-01T00:00:00Z')`, [id, SEED.provider2, `INV-TIE-${hash}`, hash]);
    // the older chain element carries the LARGER uuid: the old tie-break (created_at, id) would pick it as the newest
    await insert("ffffffff-ffff-4fff-8fff-ffffffffffff", "tie-first");
    await insert("00000000-0000-4000-8000-000000000001", "tie-second");
    const rows = await sys(db, `select invoice_hash, chain_seq::int s from invoices where provider_id = $1 and invoice_hash like 'tie-%' order by chain_seq`, [SEED.provider2]);
    assert.deepEqual(rows.map((r) => r.invoice_hash), ["tie-first", "tie-second"]);
    await sys(db, `update providers set vat_number = '300000000000003' where id = $1`, [SEED.provider2]);
    const s2 = await serviceFor(db, "dddddddd-dddd-4ddd-8ddd-ddddddddddd4");
    const branch2 = (await sys(db, `select branch_id from employees where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4'`))[0].branch_id;
    const b = (await sys(db,
      `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount, deposit_required, platform_commission, source, is_first_visit)
       values ($1, $2, 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4', $3, 'completed', now() - interval '9 days', 30, 100, 100, 15, 0, 0, 'marketplace', true) returning id`,
      [SEED.customer, branch2, s2.id]))[0].id;
    const next = await generate(customer, b);
    assert.equal(next.previous_invoice_hash, "tie-second", "the chain continues from the highest counter");
  });
});
