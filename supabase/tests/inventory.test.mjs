import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Isolated fixtures model the existing tenancy spine; no hosted data is modified.
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = id(1), other = id(2), manager = id(3), customer = id(4), admin = id(5);
const provider = id(11), foreignProvider = id(12), branch = id(21), secondBranch = id(22), foreignBranch = id(23);
const supplier = id(31), foreignSupplier = id(32), product = id(41), foreignProduct = id(42);
let db;
const run = (actor, sql, params = []) => db.transaction(async tx => {
  await tx.exec(`SET LOCAL ROLE ${actor ? 'authenticated' : 'anon'}`);
  await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: actor ? 'authenticated' : 'anon', sub: actor })]);
  return (await tx.query(sql, params)).rows;
});
const adjustment = (actor, delta, requestId = crypto.randomUUID(), branchId = branch, type = 'adjustment') =>
  run(actor, `select adjust_branch_inventory_stock($1,$2,$3,'Physical stock count',$4,$5) as result`, [branchId, product, delta, type, requestId]);
const transfer = (actor, from, to, quantity, requestId = crypto.randomUUID()) =>
  run(actor, `select transfer_branch_inventory_stock($1,$2,$3,$4,'Branch replenishment',$5)`, [from, to, product, quantity, requestId]);
const quantity = async b => Number((await db.query('select quantity_on_hand from branch_inventory_stock where branch_id=$1 and product_id=$2', [b, product])).rows[0]?.quantity_on_hand || 0);
before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    GRANT anon, authenticated, service_role TO postgres;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}') $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE TABLE profiles(id uuid PRIMARY KEY, role text, first_name text, last_name text);
    CREATE TABLE providers(id uuid PRIMARY KEY, owner_id uuid REFERENCES profiles, business_name_en text, business_name_ar text, created_at timestamptz DEFAULT now());
    CREATE TABLE branches(id uuid PRIMARY KEY, provider_id uuid REFERENCES providers, name_en text, name_ar text);
    CREATE TABLE provider_memberships(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES profiles, provider_id uuid REFERENCES providers,
      branch_id uuid REFERENCES branches, role text, is_active boolean DEFAULT true, created_at timestamptz DEFAULT now(), UNIQUE(user_id,provider_id,branch_id));
    CREATE TABLE employees(id uuid PRIMARY KEY, branch_id uuid REFERENCES branches, profile_id uuid REFERENCES profiles, name_en text, name_ar text, is_active boolean DEFAULT true);
    CREATE TABLE bookings(id uuid PRIMARY KEY, branch_id uuid REFERENCES branches, customer_id uuid REFERENCES profiles, employee_id uuid REFERENCES employees,
      status text, total_price numeric, scheduled_at timestamptz DEFAULT now());
    CREATE TABLE admin_audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES profiles, action text, target_type text, target_id uuid, details jsonb);
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin') $$;
    ALTER TABLE bookings ENABLE ROW LEVEL SECURITY; ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
    ALTER TABLE provider_memberships ENABLE ROW LEVEL SECURITY;
    CREATE POLICY membership_reads ON provider_memberships FOR SELECT TO authenticated USING (
      user_id = auth.uid() OR EXISTS(SELECT 1 FROM providers WHERE id=provider_id AND owner_id=auth.uid())
    );
  `);
  for (const [user, role] of [[owner,'provider_owner'],[other,'provider_owner'],[manager,'provider_employee'],[customer,'customer'],[admin,'admin']]) {
    await db.query('insert into profiles values($1,$2,$3,$4)', [user, role, role, 'Test']);
  }
  await db.query(`insert into providers(id,owner_id,business_name_en,business_name_ar) values($1,$2,'First Chain','السلسلة الأولى'),($3,$4,'Other Chain','السلسلة الثانية')`, [provider,owner,foreignProvider,other]);
  await db.query(`insert into branches values($1,$2,'Central','المركزي'),($3,$2,'West','الغربي'),($4,$5,'Foreign','الخارجي')`, [branch,provider,secondBranch,foreignBranch,foreignProvider]);
  await db.query(`insert into employees values($1,$2,$3,'Manager','مدير',true)`, [id(51),branch,manager]);
  await db.query(`insert into bookings(id,branch_id,customer_id,employee_id,status,total_price) values($1,$2,$3,$4,'confirmed',50),($5,$6,$3,$4,'completed',100)`, [id(61),branch,customer,id(51),id(62),secondBranch]);
  for (const file of ['20261005060000_enterprise_inventory_and_supply.sql', '20261005070000_inventory_controls_and_chain_operations.sql']) {
    await db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  await db.exec('CREATE TRIGGER validate_booking_status_transition_before_update BEFORE UPDATE OF status ON bookings FOR EACH ROW EXECUTE FUNCTION validate_booking_status_transition()');
  await run(owner, `insert into inventory_suppliers(id,provider_id,name) values($1,$2,'Supplier')`, [supplier,provider]);
  await run(other, `insert into inventory_suppliers(id,provider_id,name) values($1,$2,'Foreign supplier')`, [foreignSupplier,foreignProvider]);
  await run(owner, `insert into inventory_products(id,provider_id,supplier_id,name_en,name_ar,unit_cost_sar,default_reorder_point) values($1,$2,$3,'Shampoo','شامبو',10,5)`, [product,provider,supplier]);
  await run(other, `insert into inventory_products(id,provider_id,supplier_id,name_en,name_ar) values($1,$2,$3,'Other product','منتج')`, [foreignProduct,foreignProvider,foreignSupplier]);
  await run(owner, `select save_provider_operation_membership($1,$2,$3,'branch_manager','{"inventory":true,"bookings":true,"staff":true,"reports":true}',true,null,'Delegate branch operations')`, [provider,manager,branch]);
});
after(async () => { await db?.close(); });

test('anonymous and customer callers cannot mutate stock or inspect admin supply', async () => {
  for (const actor of [null, customer, other]) {
    await assert.rejects(adjustment(actor, 1), /permission denied|Forbidden/);
    await assert.rejects(run(actor, 'select get_admin_supply_overview()'), /permission denied|Administrator/);
  }
});
test('balances cannot be written directly, including by owners', async () => {
  await assert.rejects(run(owner, `insert into branch_inventory_stock(branch_id,product_id,quantity_on_hand) values($1,$2,99)`, [branch, product]), /permission denied/);
  await assert.rejects(run(owner, `insert into inventory_stock_movements(provider_id,branch_id,product_id,movement_type,quantity_delta) values($1,$2,$3,'adjustment',99)`, [provider,branch,product]), /permission denied/);
});
test('catalog writes enforce tenant association and emit audit records', async () => {
  await assert.rejects(run(owner, `update inventory_products set supplier_id=$1 where id=$2`, [foreignSupplier,product]), /another provider/);
  assert.equal((await run(other, 'select id from inventory_products where id=$1', [product])).length, 0);
  await run(owner, 'update inventory_products set is_active=false where id=$1', [product]);
  await assert.rejects(adjustment(owner, 2), /Forbidden/);
  await run(owner, 'update inventory_products set is_active=true where id=$1', [product]);
  assert.ok((await db.query(`select count(*)::int as count from admin_audit_logs where action='inventory_products.update'`)).rows[0].count >= 2);
});
test('adjustments are idempotent and reject reused IDs with changed payload', async () => {
  const request = crypto.randomUUID(); const before = await quantity(branch);
  await adjustment(owner, 20, request); await adjustment(owner, 20, request);
  assert.equal(await quantity(branch), before + 20);
  await assert.rejects(adjustment(owner, 21, request), /already used/);
});
test('transfers conserve stock and retry exactly once', async () => {
  const before = await quantity(branch); const targetBefore = await quantity(secondBranch); const request = crypto.randomUUID();
  await transfer(owner, branch, secondBranch, 4, request); await transfer(owner, branch, secondBranch, 4, request);
  assert.equal(await quantity(branch), before - 4); assert.equal(await quantity(secondBranch), targetBefore + 4);
  assert.equal((await db.query(`select count(*)::int as count from inventory_stock_movements where movement_type in ('transfer_in','transfer_out')`)).rows[0].count, 2);
});
test('stock commands reject foreign branches, insufficient and reserved balances', async () => {
  await assert.rejects(transfer(owner, branch, foreignBranch, 1), /Forbidden/);
  await assert.rejects(transfer(owner, branch, branch, 1), /Distinct/);
  await assert.rejects(transfer(owner, branch, secondBranch, 999), /Insufficient/);
  const before = await quantity(branch); await db.query('update branch_inventory_stock set quantity_reserved=$1 where branch_id=$2 and product_id=$3', [before,branch,product]);
  await assert.rejects(adjustment(owner, -1), /Insufficient/);
  await db.query('update branch_inventory_stock set quantity_reserved=0 where branch_id=$1', [branch]);
  await assert.rejects(adjustment(owner, 1, crypto.randomUUID(), branch, 'waste'), /Valid quantity/);
});
test('managers are branch scoped and cannot approve orders or escalate delegation', async () => {
  await adjustment(manager, 1);
  await assert.rejects(adjustment(manager, 1, crypto.randomUUID(), secondBranch), /Forbidden/);
  await assert.rejects(run(manager, `select save_provider_operation_membership($1,$2,$3,'manager','{"reports":true}',true,null,'Self escalation')`, [provider,manager,null]), /Only owners/);
  await assert.rejects(run(owner, `select save_provider_operation_membership($1,$2,$3,'owner','{}',true,null,'Owner escalation')`, [provider,manager,branch]), /Valid role/);
  const result = await run(manager, `select create_supplier_purchase_order($1,$2,$3,'Restock',$4) as result`, [provider,branch,supplier,JSON.stringify([{product_id:product,quantity:2,unit_cost_sar:10}])]);
  const orderId = result[0].result.id;
  await run(manager, `select transition_supplier_purchase_order($1,'submit')`, [orderId]);
  await assert.rejects(run(manager, `select transition_supplier_purchase_order($1,'approve')`, [orderId]), /Only the provider owner/);
  await run(owner, `select transition_supplier_purchase_order($1,'approve')`, [orderId]);
  const before = await quantity(branch); await run(manager, `select transition_supplier_purchase_order($1,'receive')`, [orderId]);
  assert.equal(await quantity(branch), before + 2);
  await assert.rejects(run(manager, `select transition_supplier_purchase_order($1,'receive')`, [orderId]), /Invalid purchase order transition/);
});
test('reports and booking/staff access follow explicit permissions', async () => {
  const report = await run(manager, `select get_provider_chain_operations($1,current_date-30,current_date) as result`, [provider]);
  assert.deepEqual(report[0].result.branches.map(b => b.branch_id), [branch]);
  assert.equal((await run(manager, 'select id from bookings')).length, 1);
  await assert.rejects(run(manager, `update employees set profile_id=$1 where id=$2`, [customer,id(51)]), /Only owners/);
  await run(owner, `select save_provider_operation_membership($1,$2,$3,'branch_manager','{}',true,(select id from provider_memberships where user_id=$2),'Revoke permissions')`, [provider,manager,branch]);
  await assert.rejects(adjustment(manager, 1), /Forbidden/);
  await assert.rejects(run(manager, `select get_provider_chain_operations($1,current_date-30,current_date)`, [provider]), /Reports permission/);
  assert.equal((await run(manager, 'select id from bookings')).length, 0);
  assert.equal((await run(manager, `update employees set is_active=false where id=$1 returning id`, [id(51)])).length, 0);
});
test('disabled memberships deny access and reject direct membership writes', async () => {
  await assert.rejects(run(owner, `update provider_memberships set permissions='{"inventory":true}'`), /permission denied/);
  await run(owner, `select save_provider_operation_membership($1,$2,$3,'branch_manager','{"inventory":true}',false,(select id from provider_memberships where user_id=$2),'Disable membership')`, [provider,manager,branch]);
  await assert.rejects(adjustment(manager, 1), /Forbidden/);
});
test('admin oversight is real, paginated, audited and honest on empty results', async () => {
  const result = (await run(admin, 'select get_admin_supply_overview(1,1) as result'))[0].result;
  assert.equal(result.total_orders, 1); assert.equal(result.orders.length, 1); assert.ok(result.metrics.stock_value_sar > 0);
  assert.ok(Array.isArray(result.provider_health));
  const supplierSearch = (await run(admin, `select get_admin_supply_overview(1,20,null,'Supplier') as result`))[0].result;
  assert.ok(supplierSearch.provider_health.some(p => p.provider_id === provider));
  const empty = (await run(admin, `select get_admin_supply_overview(1,20,null,'No such provider') as result`))[0].result;
  assert.deepEqual(empty.orders, []); assert.deepEqual(empty.provider_health, []);
  assert.ok((await db.query(`select count(*)::int as count from admin_audit_logs where action='supply_oversight.read'`)).rows[0].count >= 2);
});
