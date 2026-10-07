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

// ---- C-D22: deactivated products keep their stock manageable -----------------------------------------------------------------

let costingBranch;
const secondBranchId = async () => {
  if (costingBranch) return costingBranch;
  const rows = await sys(db, `select id from branches where provider_id = $1 and id <> $2 order by id limit 1`, [SEED.provider1, SEED.branch1]);
  costingBranch = rows[0]?.id ?? (await sys(db, `insert into branches (provider_id, name_en, name_ar, address_text_en, address_text_ar, latitude, longitude)
    values ($1, 'Second Stockroom', 'مستودع ثان', 'Riyadh', 'الرياض', 24.7, 46.7) returning id`, [SEED.provider1]))[0].id;
  return costingBranch;
};

describe("C-D22: an inactive product still allows waste and transfer of what is left", () => {
  it("lets waste, a negative adjustment and a transfer through, and refuses only an increase with its own message", async () => {
    const supplier = await makeSupplier();
    const product = await makeProduct(supplier, 10, "Retired product");
    await orderFlow(supplier, product, 20, 10);
    await as(db, owner, `update inventory_products set is_active = false where id = $1`, [product]);
    const second = await secondBranchId();
    await as(db, owner, `select adjust_branch_inventory_stock($1, $2, -2, 'Expired stock written off', 'waste', $3)`, [SEED.branch1, product, rid()]);
    await as(db, owner, `select adjust_branch_inventory_stock($1, $2, -1, 'Recount found one fewer', 'adjustment', $3)`, [SEED.branch1, product, rid()]);
    await as(db, owner, `select transfer_branch_inventory_stock($1, $2, $3, 7, 'Move the leftovers away', $4)`, [SEED.branch1, second, product, rid()]);
    assert.equal((await stockRow(SEED.branch1, product)).q, 10);
    assert.equal((await stockRow(second, product)).q, 7);
    await expectError(as(db, owner, `select adjust_branch_inventory_stock($1, $2, 5, 'Found stock', 'adjustment', $3)`, [SEED.branch1, product, rid()]), /Product is inactive/);
  });

  it("does not open the commands to people without inventory scope, inactive product or not", async () => {
    const supplier = await makeSupplier();
    const product = await makeProduct(supplier, 10, "Retired guarded product");
    await orderFlow(supplier, product, 5, 10);
    await as(db, owner, `update inventory_products set is_active = false where id = $1`, [product]);
    const waste = (actor) => as(db, actor, `select adjust_branch_inventory_stock($1, $2, -1, 'Scope probe on a retired product', 'waste', $3)`, [SEED.branch1, product, rid()]);
    await expectError(waste(ROLES.anon), /permission denied|Forbidden|Authentication/i);
    await expectError(waste(stranger), /Forbidden/);
    await expectError(waste(ROLES.user(SEED.owner2)), /Forbidden/);
    await waste(delegate);
    await waste(admin);
    assert.equal((await stockRow(SEED.branch1, product)).q, 3);
  });

  it("refuses deactivation while a draft, submitted or approved order lists the product, and allows it once the order is cancelled or received", async () => {
    const supplier = await makeSupplier();
    const product = await makeProduct(supplier, 10, "Ordered product");
    const [{ r }] = await as(db, owner, `select create_supplier_purchase_order($1, $2, $3, 'Open order blocking deactivation', $4::jsonb) r`,
      [SEED.provider1, SEED.branch1, supplier, JSON.stringify([{ product_id: product, quantity: 3, unit_cost_sar: 10 }])]);
    await expectError(as(db, owner, `update inventory_products set is_active = false where id = $1`, [product]), /open purchase orders/);
    await as(db, owner, `select transition_supplier_purchase_order($1, 'submit')`, [r.id]);
    await expectError(as(db, owner, `update inventory_products set is_active = false where id = $1`, [product]), /open purchase orders/);
    await as(db, owner, `select transition_supplier_purchase_order($1, 'cancel', 'Order no longer needed')`, [r.id]);
    await as(db, owner, `update inventory_products set is_active = false where id = $1`, [product]);
    assert.equal((await sys(db, `select is_active from inventory_products where id = $1`, [product]))[0].is_active, false);
  });
});

// ---- C-D27: purchase orders and reservations -------------------------------------------------------------------------------

const createOrder = (actor, supplier, items, requestId = null) =>
  as(db, actor, `select create_supplier_purchase_order($1, $2, $3, 'Order for the idempotency tests', $4::jsonb, $5) r`,
    [SEED.provider1, SEED.branch1, supplier, JSON.stringify(items), requestId]).then((rows) => rows[0].r);
const orderCount = async (supplier) => Number((await sys(db, `select count(*)::int n from supplier_purchase_orders where supplier_id = $1`, [supplier]))[0].n);

describe("C-D27: purchase order creation", () => {
  it("returns the first order again for the same request id, and refuses the id for another content or another person", async () => {
    const supplier = await makeSupplier();
    const product = await makeProduct(supplier, 10, "Idempotent product");
    const items = [{ product_id: product, quantity: 4, unit_cost_sar: 10 }];
    const request = rid();
    const first = await createOrder(owner, supplier, items, request);
    const second = await createOrder(owner, supplier, items, request);
    assert.equal(second.id, first.id);
    assert.equal(await orderCount(supplier), 1);
    await expectError(createOrder(owner, supplier, [{ product_id: product, quantity: 5, unit_cost_sar: 10 }], request), /already used/);
    await expectError(createOrder(delegate, supplier, items, request), /already used/);
  });

  it("de-duplicates two identical calls that carry no request id (the current screen)", async () => {
    const supplier = await makeSupplier();
    const product = await makeProduct(supplier, 10, "Double click product");
    const items = [{ product_id: product, quantity: 2, unit_cost_sar: 10 }];
    const a = await createOrder(owner, supplier, items);
    const b = await createOrder(owner, supplier, items);
    assert.equal(a.id, b.id);
    assert.equal(await orderCount(supplier), 1);
    const other = await createOrder(owner, supplier, [{ product_id: product, quantity: 3, unit_cost_sar: 10 }]);
    assert.notEqual(other.id, a.id, "a different order is a different order");
  });

  it("merges a product listed twice and refuses the same product at two costs, creating nothing", async () => {
    const supplier = await makeSupplier();
    const product = await makeProduct(supplier, 10, "Merged product");
    const order = await createOrder(owner, supplier, [
      { product_id: product, quantity: 2, unit_cost_sar: 10 }, { product_id: product, quantity: 3, unit_cost_sar: 10 }]);
    assert.equal(Number(order.subtotal_sar), 50);
    const lines = await sys(db, `select quantity::float8 q from supplier_purchase_order_items where purchase_order_id = $1`, [order.id]);
    assert.deepEqual(lines, [{ q: 5 }]);
    const before = await orderCount(supplier);
    await expectError(createOrder(owner, supplier, [
      { product_id: product, quantity: 1, unit_cost_sar: 10 }, { product_id: product, quantity: 1, unit_cost_sar: 11 }]), /different unit costs/);
    assert.equal(await orderCount(supplier), before);
  });

  it("refuses anonymous callers, strangers and a different provider owner", async () => {
    const supplier = await makeSupplier();
    const product = await makeProduct(supplier, 10, "Guarded order product");
    const items = [{ product_id: product, quantity: 1, unit_cost_sar: 10 }];
    await expectError(createOrder(ROLES.anon, supplier, items), /permission denied|Authentication/i);
    await expectError(createOrder(stranger, supplier, items), /Not authorized/);
    await expectError(createOrder(ROLES.user(SEED.owner2), supplier, items), /Not authorized/);
    assert.equal(await orderCount(supplier), 0);
  });

  it("lets a delegate cancel a submitted order but not one the owner approved; the owner and an administrator can", async () => {
    const supplier = await makeSupplier();
    const product = await makeProduct(supplier, 10, "Cancel rights product");
    const items = [{ product_id: product, quantity: 1, unit_cost_sar: 10 }];
    const submitted = await createOrder(delegate, supplier, items);
    await as(db, delegate, `select transition_supplier_purchase_order($1, 'submit')`, [submitted.id]);
    await as(db, delegate, `select transition_supplier_purchase_order($1, 'cancel', 'Delegate changed their mind')`, [submitted.id]);
    const approved = await createOrder(owner, supplier, [{ product_id: product, quantity: 2, unit_cost_sar: 10 }]);
    for (const action of ["submit", "approve"]) await as(db, owner, `select transition_supplier_purchase_order($1, $2)`, [approved.id, action]);
    await expectError(as(db, delegate, `select transition_supplier_purchase_order($1, 'cancel', 'Delegate cancelling an approved order')`, [approved.id]), /owner or administrator can cancel/);
    await as(db, admin, `select transition_supplier_purchase_order($1, 'cancel', 'Administrator cancelling an approved order')`, [approved.id]);
    const again = await createOrder(owner, supplier, [{ product_id: product, quantity: 3, unit_cost_sar: 10 }]);
    for (const action of ["submit", "approve"]) await as(db, owner, `select transition_supplier_purchase_order($1, $2)`, [again.id, action]);
    await as(db, owner, `select transition_supplier_purchase_order($1, 'cancel', 'Owner cancelling an approved order')`, [again.id]);
    assert.equal((await sys(db, `select status from supplier_purchase_orders where id = $1`, [again.id]))[0].status, "cancelled");
  });
});

describe("C-D27: reservations are written by commands and respected by the stock commands", () => {
  const reserved = async (product) => Number((await sys(db, `select quantity_reserved::float8 q from branch_inventory_stock where branch_id = $1 and product_id = $2`, [SEED.branch1, product]))[0].q);
  it("reserves and releases with receipts, keeps reserved stock out of waste and transfers, and refuses overdrafts", async () => {
    const supplier = await makeSupplier();
    const product = await makeProduct(supplier, 10, "Reserved product");
    await orderFlow(supplier, product, 20, 10);
    const request = rid();
    const reserve = (qty, id = rid(), actor = owner) => as(db, actor, `select reserve_inventory_stock($1, $2, $3, 'Held for the wedding party', $4) r`, [SEED.branch1, product, qty, id]).then((r) => r[0].r);
    assert.equal(Number((await reserve(5, request)).quantity_reserved), 5);
    assert.equal(Number((await reserve(5, request)).quantity_reserved), 5, "the same request id is not applied twice");
    assert.equal(await reserved(product), 5);
    await expectError(as(db, owner, `select reserve_inventory_stock($1, $2, 6, 'Held for the wedding party', $3)`, [SEED.branch1, product, request]), /already used/);
    await expectError(reserve(16), /Insufficient unreserved stock/);
    await expectError(as(db, owner, `select adjust_branch_inventory_stock($1, $2, -16, 'Throw away reserved stock', 'waste', $3)`, [SEED.branch1, product, rid()]), /Insufficient unreserved stock/);
    await expectError(as(db, owner, `select transfer_branch_inventory_stock($1, $2, $3, 16, 'Move reserved stock away', $4)`, [SEED.branch1, await secondBranchId(), product, rid()]), /Insufficient unreserved stock/);
    const release = (qty, actor = owner) => as(db, actor, `select release_inventory_stock($1, $2, $3, 'Party cancelled', $4) r`, [SEED.branch1, product, qty, rid()]).then((r) => r[0].r);
    assert.equal(Number((await release(2)).quantity_reserved), 3);
    await expectError(release(4), /more than is reserved/);
    await expectError(reserve(0), /Valid quantity/);
    await expectError(reserve(1.0005), /Valid quantity/);
    assert.equal(await reserved(product), 3);
  });

  it("refuses reservations to anonymous callers, strangers and a different provider owner", async () => {
    const supplier = await makeSupplier();
    const product = await makeProduct(supplier, 10, "Guarded reserved product");
    await orderFlow(supplier, product, 5, 10);
    const probe = (actor, fn) => as(db, actor, `select ${fn}($1, $2, 1, 'Scope probe for reservations', $3)`, [SEED.branch1, product, rid()]);
    for (const fn of ["reserve_inventory_stock", "release_inventory_stock"]) {
      await expectError(probe(ROLES.anon, fn), /permission denied/i);
      await expectError(probe(stranger, fn), /Forbidden/);
      await expectError(probe(ROLES.user(SEED.owner2), fn), /Forbidden/);
    }
    await probe(delegate, "reserve_inventory_stock");
    await probe(admin, "release_inventory_stock");
  });
});
