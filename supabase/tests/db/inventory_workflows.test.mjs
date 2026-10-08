import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

// P3 operations against the full reconciled migration chain (booking/money/trust fixes + P3):
// owner, delegated staff, unrelated user, customer and admin; revocation, retries, insufficient
// stock, purchase-order receipt and recovery after a failed command.
let db;
let admin;
let customer;
let stranger;
let manager;
let secondBranch;
let supplier;
let product;
const owner = ROLES.user(SEED.owner1);
const otherOwner = ROLES.user(SEED.owner2);

const adjust = (user, delta, requestId = crypto.randomUUID(), branch = SEED.branch1, type = "adjustment") =>
  as(db, user, `select adjust_branch_inventory_stock($1, $2, $3, 'Physical stock count', $4, $5) r`,
    [branch, product, delta, type, requestId]);
const transfer = (user, from, to, qty, requestId = crypto.randomUUID()) =>
  as(db, user, `select transfer_branch_inventory_stock($1, $2, $3, $4, 'Branch replenishment', $5) r`,
    [from, to, product, qty, requestId]);
const onHand = async (branch) => Number((await sys(db,
  `select quantity_on_hand q from branch_inventory_stock where branch_id = $1 and product_id = $2`, [branch, product]))[0]?.q || 0);
const membershipId = async (user) => (await sys(db,
  `select id from provider_memberships where user_id = $1 and provider_id = $2`, [user.sub, SEED.provider1]))[0]?.id;

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  customer = ROLES.user(await createUser(db));
  stranger = ROLES.user(await createUser(db, { role: "provider_employee" }));
  manager = ROLES.user(await createUser(db, { role: "provider_employee" }));
  await sys(db, `update providers set status = 'active' where id in ($1, $2)`, [SEED.provider1, SEED.provider2]);

  secondBranch = (await sys(db, `
    insert into branches (provider_id, name_en, name_ar, address_text_en, address_text_ar, latitude, longitude)
    values ($1, 'North Branch', 'الفرع الشمالي', 'North Riyadh', 'شمال الرياض', 24.80, 46.65) returning id`, [SEED.provider1]))[0].id;
  // The manager is registered staff at branch 1; the stranger works for nobody here.
  await sys(db, `insert into employees (branch_id, profile_id, name_en, name_ar) values ($1, $2, 'Branch Manager', 'مدير الفرع')`,
    [SEED.branch1, manager.sub]);

  supplier = (await as(db, owner, `insert into inventory_suppliers (provider_id, name) values ($1, 'Riyadh Beauty Supply') returning id`,
    [SEED.provider1]))[0].id;
  product = (await as(db, owner, `
    insert into inventory_products (provider_id, supplier_id, name_en, name_ar, unit_cost_sar, default_reorder_point)
    values ($1, $2, 'Beard Oil', 'زيت اللحية', 25, 5) returning id`, [SEED.provider1, supplier]))[0].id;
});

describe("owner workflows", () => {
  it("adds stock, retries safely and rejects a reused request id with a different payload", async () => {
    const request = crypto.randomUUID();
    await adjust(owner, 20, request);
    await adjust(owner, 20, request); // network retry: same id, same payload
    assert.equal(await onHand(SEED.branch1), 20);
    await expectError(adjust(owner, 21, request), /already used/);
    const movements = await sys(db, `select count(*)::int n from inventory_stock_movements where product_id = $1`, [product]);
    assert.equal(movements[0].n, 1, "a retried command writes one movement");
  });

  it("refuses waste beyond stock, then succeeds with the same request id once stock exists", async () => {
    const request = crypto.randomUUID();
    await expectError(adjust(owner, -500, request, SEED.branch1, "waste"), /Insufficient/);
    assert.equal(await onHand(SEED.branch1), 20, "a failed command changes nothing");
    await adjust(owner, -2, crypto.randomUUID(), SEED.branch1, "waste");
    assert.equal(await onHand(SEED.branch1), 18);
    // The failed request left no receipt, so the operator can reuse its id after correcting it.
    await expectError(adjust(owner, -500, request, SEED.branch1, "waste"), /Insufficient/);
  });

  it("transfers conserve stock and reject insufficient or foreign transfers", async () => {
    await transfer(owner, SEED.branch1, secondBranch, 8);
    assert.equal(await onHand(SEED.branch1), 10);
    assert.equal(await onHand(secondBranch), 8);
    await expectError(transfer(owner, SEED.branch1, secondBranch, 999), /Insufficient/);
    assert.equal(await onHand(SEED.branch1) + await onHand(secondBranch), 18);
    const foreignBranch = (await sys(db, `select id from branches where provider_id = $1 limit 1`, [SEED.provider2]))[0].id;
    await expectError(transfer(owner, SEED.branch1, foreignBranch, 1), /Forbidden/);
  });

  it("deactivates a product reversibly and audits catalog changes", async () => {
    await as(db, owner, `update inventory_products set is_active = false where id = $1`, [product]);
    await expectError(adjust(owner, 1), /Product is inactive/);
    await as(db, owner, `update inventory_products set is_active = true where id = $1`, [product]);
    await adjust(owner, 1);
    const audit = await sys(db, `select count(*)::int n from admin_audit_logs where action = 'inventory_products.update'`);
    assert.ok(audit[0].n >= 2);
  });

  it("runs a purchase order from draft to received exactly once", async () => {
    const created = (await as(db, owner, `select create_supplier_purchase_order($1, $2, $3, 'Restock', $4) r`,
      [SEED.provider1, SEED.branch1, supplier, JSON.stringify([{ product_id: product, quantity: 6, unit_cost_sar: 25 }])]))[0].r;
    const orderId = created.id || created.purchase_order_id;
    assert.ok(orderId, "order id returned");
    await as(db, owner, `select transition_supplier_purchase_order($1, 'submit')`, [orderId]);
    await as(db, owner, `select transition_supplier_purchase_order($1, 'approve')`, [orderId]);
    const beforeReceipt = await onHand(SEED.branch1);
    await as(db, owner, `select transition_supplier_purchase_order($1, 'receive')`, [orderId]);
    assert.equal(await onHand(SEED.branch1), beforeReceipt + 6);
    await expectError(as(db, owner, `select transition_supplier_purchase_order($1, 'receive')`, [orderId]), /Invalid purchase order transition/);
    assert.equal(await onHand(SEED.branch1), beforeReceipt + 6, "a repeated receipt adds nothing");
  });
});

describe("delegated staff", () => {
  it("can be granted branch-scoped inventory access only for registered staff", async () => {
    await expectError(as(db, owner, `select save_provider_operation_membership($1, $2, $3, 'branch_manager', '{"inventory":true}', true, null, 'Delegate')`,
      [SEED.provider1, stranger.sub, SEED.branch1]), /registered staff/);
    await as(db, owner, `select save_provider_operation_membership($1, $2, $3, 'branch_manager', '{"inventory":true,"reports":true}', true, null, 'Delegate branch stock')`,
      [SEED.provider1, manager.sub, SEED.branch1]);
    await adjust(manager, 1);
    await expectError(adjust(manager, 1, crypto.randomUUID(), secondBranch), /Forbidden/);
  });

  it("cannot approve orders, grant itself access, or replay another user's request id", async () => {
    const created = (await as(db, manager, `select create_supplier_purchase_order($1, $2, $3, 'Manager restock', $4) r`,
      [SEED.provider1, SEED.branch1, supplier, JSON.stringify([{ product_id: product, quantity: 1, unit_cost_sar: 25 }])]))[0].r;
    const orderId = created.id || created.purchase_order_id;
    await as(db, manager, `select transition_supplier_purchase_order($1, 'submit')`, [orderId]);
    await expectError(as(db, manager, `select transition_supplier_purchase_order($1, 'approve')`, [orderId]), /Only the provider owner/);
    await expectError(as(db, manager, `select save_provider_operation_membership($1, $2, null, 'manager', '{"staff":true}', true, null, 'Self escalation')`,
      [SEED.provider1, manager.sub]), /Only owners/);
    const ownersRequest = crypto.randomUUID();
    await adjust(owner, 1, ownersRequest);
    await expectError(adjust(manager, 1, ownersRequest), /already used/);
  });

  it("loses access immediately when permissions are revoked or the membership is disabled", async () => {
    const id = await membershipId(manager);
    await as(db, owner, `select save_provider_operation_membership($1, $2, $3, 'branch_manager', '{"inventory":false,"reports":false}', true, $4, 'Revoke stock access')`,
      [SEED.provider1, manager.sub, SEED.branch1, id]);
    await expectError(adjust(manager, 1), /Forbidden/);
    await expectError(as(db, manager, `select get_provider_chain_operations($1, current_date - 30, current_date)`, [SEED.provider1]), /Reports permission/);
    await as(db, owner, `select save_provider_operation_membership($1, $2, $3, 'branch_manager', '{"inventory":true}', false, $4, 'Disable access')`,
      [SEED.provider1, manager.sub, SEED.branch1, id]);
    await expectError(adjust(manager, 1), /Forbidden/);
    await expectError(as(db, manager, `update provider_memberships set is_active = true where id = $1`, [id]), /permission denied/);
  });
});

describe("unauthorized callers", () => {
  it("cannot read or mutate another provider's stock or catalog", async () => {
    await expectError(adjust(otherOwner, 5), /Forbidden/);
    await expectError(adjust(customer, 5), /Forbidden|permission denied/);
    await expectError(adjust(ROLES.anon, 5), /permission denied/);
    assert.equal((await as(db, otherOwner, `select id from inventory_products where id = $1`, [product])).length, 0);
    await expectError(as(db, owner, `insert into branch_inventory_stock (branch_id, product_id, quantity_on_hand) values ($1, $2, 999)`,
      [secondBranch, product]), /permission denied/);
  });

  it("cannot open the admin supply overview", async () => {
    await expectError(as(db, owner, `select get_admin_supply_overview()`), /Administrator|permission denied/);
    await expectError(as(db, ROLES.anon, `select get_admin_supply_overview()`), /permission denied/);
  });
});

describe("admin oversight", () => {
  it("returns real orders and stock health and audits each read", async () => {
    const r = (await as(db, admin, `select get_admin_supply_overview(1, 20) r`))[0].r;
    assert.ok(r.total_orders >= 2);
    assert.ok(r.orders.every((o) => Array.isArray(o.items) && o.items.length > 0), "each order carries its line items");
    assert.ok(r.metrics.stock_value_sar > 0, "stock value is computed from real balances");
    assert.ok(r.provider_health.some((h) => h.provider_id === SEED.provider1));
    const empty = (await as(db, admin, `select get_admin_supply_overview(1, 20, null, 'no such provider at all') r`))[0].r;
    assert.deepEqual(empty.orders, []);
    const audit = await sys(db, `select count(*)::int n from admin_audit_logs where action = 'supply_oversight.read'`);
    assert.ok(audit[0].n >= 2);
  });
});

describe("booking safeguards survive P3", () => {
  it("anonymous visitors still can execute only discovery functions", async () => {
    const allowed = new Set(["get_available_slots", "get_branch_available_slots", "get_branch_schedule_with_prayer_pauses",
      "search_marketplace_providers", "normalize_arabic", "provider_rating_summaries",
      "track_analytics_event", // D-26: insert-only client event recorder
      "public_professional_profile", // G75: the public professional page
      "get_sponsored_placements", "record_sponsored_click"]); // G63: the labelled sponsored block and its click counter (public by design)
    const rows = await sys(db, `
      select distinct p.proname from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      join pg_roles r on r.oid = a.grantee
      where p.pronamespace = 'public'::regnamespace and a.privilege_type = 'EXECUTE' and r.rolname = 'anon'
        and p.prorettype <> 'trigger'::regtype`);
    assert.deepEqual(rows.map((r) => r.proname).filter((n) => !allowed.has(n)), []);
  });

  it("a customer still cannot move a booking into completed", async () => {
    const booking = (await sys(db, `select id, customer_id from bookings where status = 'confirmed' limit 1`))[0];
    if (!booking) return;
    await expectError(as(db, ROLES.user(booking.customer_id), `update bookings set status = 'completed' where id = $1`, [booking.id]),
      /Invalid booking status transition/);
  });
});
