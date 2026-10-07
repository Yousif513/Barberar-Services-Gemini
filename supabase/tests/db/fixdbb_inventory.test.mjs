import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

// FIX-DBB inventory group: audit allow-list (C-D29), moving-average valuation (C-D21b), inactive products (C-D22),
// purchase-order idempotency, merge, cancel rights and reservations (C-D27).

let db;
let admin;
let stranger;
let delegate; // branch-level delegate with inventory permission (not the owner)
const owner = ROLES.user(SEED.owner1);
const rid = () => crypto.randomUUID();

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  stranger = ROLES.user(await createUser(db));
  delegate = ROLES.user(await createUser(db, { role: "provider_employee" }));
  await sys(db, `insert into employees (branch_id, profile_id, name_en, name_ar) values ($1, $2, 'Stock Manager', 'مدير المخزون')`, [SEED.branch1, delegate.sub]);
  await as(db, owner, `select save_provider_operation_membership($1, $2, null, 'inventory_manager', '{"inventory":true}'::jsonb, true, null, 'Delegation for the inventory fix tests')`,
    [SEED.provider1, delegate.sub]);
});

const makeSupplier = (extra = {}) =>
  as(db, owner, `insert into inventory_suppliers (provider_id, name, contact_name, contact_phone, contact_email, payment_terms)
    values ($1, $2, 'Contact Person', '+966501234567', 'supplier@example.test', 'Net 30') returning id`, [SEED.provider1, extra.name ?? `Supplier ${rid().slice(0, 8)}`]).then((r) => r[0].id);
const makeProduct = (supplier, cost = 10, name = "Shampoo") =>
  as(db, owner, `insert into inventory_products (provider_id, supplier_id, sku, name_en, name_ar, unit_cost_sar, retail_price_sar)
    values ($1, $2, $3, $4, $4, $5, 30) returning id`, [SEED.provider1, supplier, `SKU-${rid().slice(0, 8)}`, name, cost]).then((r) => r[0].id);

describe("C-D29: the catalogue audit keeps contact details out of the log", () => {
  it("logs an allow-list of columns and only the names of the others that changed", async () => {
    const supplier = await makeSupplier();
    await as(db, owner, `update inventory_suppliers set contact_phone = '+966509999999', contact_email = 'new@example.test', status = 'inactive' where id = $1`, [supplier]);
    const logs = await sys(db, `select action, details from admin_audit_logs where target_type = 'inventory_suppliers' and target_id = $1 order by created_at, id`, [supplier]);
    assert.ok(logs.length >= 2, "the insert and the update are both logged");
    const text = JSON.stringify(logs);
    for (const secret of ["+966501234567", "+966509999999", "supplier@example.test", "new@example.test", "Contact Person"]) {
      assert.ok(!text.includes(secret), `${secret} must not be in the audit log`);
    }
    const update = logs.find((l) => l.action.endsWith("update"));
    assert.equal(update.details.after.status, "inactive");
    assert.ok(update.details.changed_columns.includes("contact_phone") && update.details.changed_columns.includes("contact_email"));
  });

  it("keeps the product columns that matter (cost, price, state) in the log", async () => {
    const product = await makeProduct(await makeSupplier(), 10);
    await as(db, owner, `update inventory_products set unit_cost_sar = 12.5, is_active = true where id = $1`, [product]);
    const [update] = await sys(db, `select details from admin_audit_logs where target_type = 'inventory_products' and target_id = $1 and action like '%update' limit 1`, [product]);
    assert.equal(Number(update.details.before.unit_cost_sar), 10);
    assert.equal(Number(update.details.after.unit_cost_sar), 12.5);
  });
});
