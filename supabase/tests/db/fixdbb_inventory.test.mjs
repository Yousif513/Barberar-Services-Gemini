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

// ---- C-D21b: valuation is not retroactive -----------------------------------------------------------------------------------

const orderFlow = async (supplier, product, quantity, cost, actor = owner) => {
  const [created] = await as(db, actor, `select create_supplier_purchase_order($1, $2, $3, 'Restock for the valuation test', $4::jsonb) r`,
    [SEED.provider1, SEED.branch1, supplier, JSON.stringify([{ product_id: product, quantity, unit_cost_sar: cost }])]);
  const id = created.r.id;
  for (const action of ["submit", "approve", "receive"]) {
    await as(db, owner, `select transition_supplier_purchase_order($1, $2, 'Receiving for the valuation test')`, [id, action]);
  }
  return id;
};
const findKey = (value, key) => {
  if (value && typeof value === "object") {
    if (key in value) return value[key];
    for (const v of Object.values(value)) { const found = findKey(v, key); if (found !== undefined) return found; }
  }
  return undefined;
};
const chainValue = async (branchId = SEED.branch1) => {
  const [row] = await as(db, owner, `select get_provider_chain_operations($1, '2026-01-01', '2026-12-31') r`, [SEED.provider1]);
  const branches = findKey(row.r, "branches") ?? [];
  const branch = branches.find((b) => b.branch_id === branchId || b.id === branchId);
  return Number(findKey(branch ?? row.r, "stock_value_sar"));
};
const stockRow = async (branch, product) =>
  (await sys(db, `select quantity_on_hand::float8 q, average_unit_cost_sar::float8 avg from branch_inventory_stock where branch_id = $1 and product_id = $2`, [branch, product]))[0];

describe("C-D21b: stock valuation uses the recorded moving-average cost", () => {
  it("keeps 100 units bought at SAR 10 at SAR 1,000 after the product cost is edited to SAR 50", async () => {
    const supplier = await makeSupplier();
    const product = await makeProduct(supplier, 10, "Valuation product");
    const before = await chainValue();
    await orderFlow(supplier, product, 100, 10);
    assert.equal((await chainValue()) - before, 1000);
    await as(db, owner, `update inventory_products set unit_cost_sar = 50 where id = $1`, [product]);
    assert.equal((await chainValue()) - before, 1000, "an edit of the product cost must not revalue stock already bought");
    assert.deepEqual(await stockRow(SEED.branch1, product), { q: 100, avg: 10 });
  });

  it("moves the average only when stock arrives: 100 at 10 plus 100 at 20 is 200 at 15", async () => {
    const supplier = await makeSupplier();
    const product = await makeProduct(supplier, 10, "Average product");
    await orderFlow(supplier, product, 100, 10);
    await orderFlow(supplier, product, 100, 20);
    assert.deepEqual(await stockRow(SEED.branch1, product), { q: 200, avg: 15 });
    await as(db, owner, `select adjust_branch_inventory_stock($1, $2, -50, 'Damaged in storage', 'waste', $3)`, [SEED.branch1, product, rid()]);
    assert.deepEqual(await stockRow(SEED.branch1, product), { q: 150, avg: 15 }, "waste leaves the average untouched");
    const [movement] = await sys(db, `select unit_cost_sar::float8 c from inventory_stock_movements where product_id = $1 and movement_type = 'waste'`, [product]);
    assert.equal(movement.c, 15, "waste is valued at the average cost");
  });

  it("carries the source average into the receiving branch on a transfer", async () => {
    const [{ id: second }] = await sys(db, `select id from branches where provider_id = $1 and id <> $2 limit 1`, [SEED.provider1, SEED.branch1])
      .then((rows) => rows.length ? rows : sys(db, `insert into branches (provider_id, name_en, name_ar, address_text_en, address_text_ar, latitude, longitude)
        values ($1, 'Costing Branch', 'فرع التكلفة', 'Riyadh', 'الرياض', 24.7, 46.7) returning id`, [SEED.provider1]));
    const supplier = await makeSupplier();
    const product = await makeProduct(supplier, 10, "Transfer product");
    await orderFlow(supplier, product, 100, 12);
    await as(db, owner, `select transfer_branch_inventory_stock($1, $2, $3, 40, 'Rebalance the stockrooms', $4)`, [SEED.branch1, second, product, rid()]);
    assert.deepEqual(await stockRow(SEED.branch1, product), { q: 60, avg: 12 });
    assert.deepEqual(await stockRow(second, product), { q: 40, avg: 12 });
  });

  it("audits a cost edit with before, after and the reason, and refuses an edit without one", async () => {
    const product = await makeProduct(await makeSupplier(), 10, "Audited cost product");
    await as(db, owner, `select set_inventory_product_cost($1, 14.25, 'Supplier raised the price')`, [product]);
    const [log] = await sys(db, `select details from admin_audit_logs where target_id = $1 and action = 'inventory_products.cost_change' order by created_at desc limit 1`, [product]);
    assert.deepEqual([Number(log.details.before), Number(log.details.after), log.details.reason, log.details.via], [10, 14.25, "Supplier raised the price", "command"]);
    await expectError(as(db, owner, `select set_inventory_product_cost($1, 15, 'x')`, [product]), /reason/i);
    await expectError(as(db, owner, `select set_inventory_product_cost($1, -1, 'Negative cost')`, [product]), /cost/i);
    await expectError(as(db, owner, `select set_inventory_product_cost($1, 1.005, 'Three decimals')`, [product]), /two decimals/i);
    await as(db, owner, `update inventory_products set unit_cost_sar = 16 where id = $1`, [product]);
    const [direct] = await sys(db, `select details from admin_audit_logs where target_id = $1 and action = 'inventory_products.cost_change' order by created_at desc limit 1`, [product]);
    assert.equal(direct.details.via, "direct_update");
  });

  it("refuses the cost command to anonymous users, strangers and a delegate of another provider, and answers not found", async () => {
    const product = await makeProduct(await makeSupplier(), 10, "Guarded cost product");
    await expectError(as(db, ROLES.anon, `select set_inventory_product_cost($1, 11, 'Anonymous attempt')`, [product]), /permission denied|Authentication/i);
    await expectError(as(db, stranger, `select set_inventory_product_cost($1, 11, 'Stranger attempt')`, [product]), /not found/i);
    await expectError(as(db, ROLES.user(SEED.owner2), `select set_inventory_product_cost($1, 11, 'Other owner attempt')`, [product]), /not found/i);
    const [{ r }] = await as(db, delegate, `select set_inventory_product_cost($1, 11, 'Provider-wide delegate edit') r`, [product]);
    assert.equal(Number(r.unit_cost_sar), 11);
    const [{ r: byAdmin }] = await as(db, admin, `select set_inventory_product_cost($1, 12, 'Administrator correction') r`, [product]);
    assert.equal(Number(byAdmin.unit_cost_sar), 12);
  });
});
