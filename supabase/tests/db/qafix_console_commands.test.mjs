import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

// QAFIX (docs/reviews/2026-10-17-qa-release-gate.md, gap direct-table-updates-report-success-when-the-row-policy-refuses).
// The catalogue, branch, package, integration and payment-method controls used to write their tables from the browser, and a
// console role without the table permission got 200 with no row changed. Each command below must refuse such a role with
// the permission it lacks (never an empty success), refuse a missing or stale row, and change exactly what it says.

let db;
let owner;
let operations;
let finance;
let analyst;
let customer;
let serviceId;
let categoryId;
let packageId;

const nowS = () => Math.floor(Date.now() / 1000);
const staleSession = (id) => ROLES.user(id, { amr: [{ method: "totp", timestamp: nowS() - 900 }, { method: "password", timestamp: nowS() - 900 }] });
const call = (user, sql, params = []) => as(db, user, sql, params).then((r) => r[0]?.r);
const one = async (sql, params = []) => (await sys(db, sql, params))[0];
const refusedFor = async (promise, permission) => {
  const error = await expectError(promise, /does not include the .* permission, so nothing was changed/);
  assert.equal(error.code, "42501");
  assert.equal(error.hint, "missing_permission");
  assert.equal(error.detail, permission);
};
const service = (id) => one(`select status, is_active, base_price::float8 price, featured_on_landing, updated_at from services where id = $1`, [id]);

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
  customer = ROLES.user(await createUser(db));
  ({ id: serviceId, category_id: categoryId } = await one(`select id, category_id from services where status = 'active' order by id limit 1`));
  ({ id: packageId } = await one(`insert into packages (provider_id, name_en, name_ar, price, session_count, is_active)
    values ($1, 'Five blow-dries', 'خمس جلسات تجفيف', 500, 5, true) returning id`, [SEED.provider1]));
  // A connected Tap integration in test mode that routes the card methods (the state the payment screens rely on).
  await sys(db, `update integrations set enabled = true, status = 'connected', env = 'test',
                   supported_payment_method_keys = array['mada','apple_pay','visa','mastercard','stc_pay'] where key = 'tap'`);
  await sys(db, `update integrations set enabled = false, status = 'disconnected' where key in ('tamara', 'tabby')`);
  await sys(db, `update payment_methods set gateway_key = 'tap', env = 'test' where key in ('mada','apple_pay','visa','mastercard','stc_pay')`);
});

describe("admin_save_service", () => {
  it("refuses the analyst, finance and a customer with the missing permission and changes nothing", async () => {
    const before = await service(serviceId);
    for (const user of [analyst, finance]) {
      await refusedFor(call(user, `select admin_save_service($1, '{"status":"draft"}'::jsonb) r`, [serviceId]), "operations.write");
    }
    await expectError(call(customer, `select admin_save_service($1, '{"status":"draft"}'::jsonb) r`, [serviceId]), /does not include the operations\.write permission/);
    await expectError(as(db, ROLES.anon, `select admin_save_service($1, '{"status":"draft"}'::jsonb) r`, [serviceId]), /permission denied/);
    assert.deepEqual(await service(serviceId), before);
  });

  it("is the reproduction of the false success: the analyst's direct write matched no row and raised nothing", async () => {
    const rows = await as(db, analyst, `update services set status = 'draft' where id = $1 returning id`, [serviceId]);
    assert.deepEqual(rows, [], "the row policy refuses without an error, which is why the screens now call the command");
    assert.equal((await service(serviceId)).status, "active");
  });

  it("switches a service off through its status, so the stored state really changes (the old is_active write was reverted)", async () => {
    const off = await call(operations, `select admin_save_service($1, '{"status":"draft"}'::jsonb, 'Stylist on leave') r`, [serviceId]);
    assert.equal(off.changed, true);
    assert.equal(off.service.status, "draft");
    assert.equal(off.service.is_active, false);
    assert.deepEqual({ status: (await service(serviceId)).status, is_active: (await service(serviceId)).is_active }, { status: "draft", is_active: false });
    const audit = await one(`select details from admin_audit_logs where action = 'services.update' and target_id = $1 order by created_at desc limit 1`, [serviceId]);
    assert.deepEqual(audit.details.changes.status, { before: "active", after: "draft" });
    assert.equal(audit.details.reason, "Stylist on leave");
    const again = await call(operations, `select admin_save_service($1, '{"status":"draft"}'::jsonb) r`, [serviceId]);
    assert.equal(again.changed, false, "a repeat changes nothing and says so");
    const on = await call(owner, `select admin_save_service($1, '{"status":"active","featured_on_landing":true,"base_price":175}'::jsonb) r`, [serviceId]);
    assert.equal(on.service.is_active, true);
    assert.equal(on.service.featured_on_landing, true);
    assert.equal(Number(on.service.base_price), 175);
  });

  it("archives a service and keeps it, so it can be switched on again", async () => {
    const archived = await call(operations, `select admin_save_service($1, '{"status":"archived"}'::jsonb, 'Retired from the menu') r`, [serviceId]);
    assert.equal(archived.service.status, "archived");
    assert.equal(archived.service.is_active, false);
    assert.equal((await one(`select count(*)::int n from services where id = $1`, [serviceId])).n, 1, "archiving never deletes");
    await call(operations, `select admin_save_service($1, '{"status":"active"}'::jsonb) r`, [serviceId]);
  });

  it("refuses a stale screen, a missing service, an unknown field and invalid values", async () => {
    const { updated_at: loaded } = await service(serviceId);
    await call(operations, `select admin_save_service($1, '{"base_price":180}'::jsonb) r`, [serviceId]);
    const stale = await expectError(call(operations, `select admin_save_service($1, '{"base_price":190}'::jsonb, null, $2) r`, [serviceId, loaded]),
      /changed by someone else after you opened it/);
    assert.equal(stale.code, "40001");
    assert.equal(stale.hint, "stale_write");
    assert.equal((await service(serviceId)).price, 180);
    const missing = await expectError(call(operations, `select admin_save_service('00000000-0000-4000-8000-00000000abcd', '{"status":"draft"}'::jsonb) r`),
      /no longer exists/);
    assert.equal(missing.code, "P0002");
    await expectError(call(operations, `select admin_save_service($1, '{"is_active":false}'::jsonb) r`, [serviceId]), /cannot be set from the console/);
    await expectError(call(operations, `select admin_save_service($1, '{"base_price":-1}'::jsonb) r`, [serviceId]), /zero or more/);
    await expectError(call(operations, `select admin_save_service($1, '{"base_price":"free"}'::jsonb) r`, [serviceId]), /wrong kind/);
    await expectError(call(operations, `select admin_save_service($1, '{"base_duration_minutes":0}'::jsonb) r`, [serviceId]), /between 5 and 1440/);
    await expectError(call(operations, `select admin_save_service($1, '{"images":["javascript:alert(1)"]}'::jsonb) r`, [serviceId]), /https:\/\//);
  });

  it("creates a service with both names and a real category, and refuses one without", async () => {
    const created = await call(operations, `select admin_save_service(null, $1::jsonb, 'New treatment') r`,
      [JSON.stringify({ name_en: "Scalp ritual", name_ar: "طقس فروة الرأس", category_id: categoryId, base_price: 220, base_duration_minutes: 45 })]);
    assert.equal(created.created, true);
    assert.equal(created.service.status, "active");
    assert.equal((await one(`select count(*)::int n from admin_audit_logs where action = 'services.insert' and target_id = $1`, [created.service.id])).n, 1);
    await expectError(call(operations, `select admin_save_service(null, $1::jsonb) r`,
      [JSON.stringify({ name_en: "No category", name_ar: "بدون فئة", base_price: 10, base_duration_minutes: 30 })]), /existing category/);
    await expectError(call(operations, `select admin_save_service(null, $1::jsonb) r`,
      [JSON.stringify({ name_en: "English only", category_id: categoryId, base_price: 10, base_duration_minutes: 30 })]), /English and an Arabic name/);
  });
});

describe("admin_set_branch_active", () => {
  it("refuses the analyst and finance, requires a reason and changes the branch with an audited reason", async () => {
    for (const user of [analyst, finance]) {
      await refusedFor(call(user, `select admin_set_branch_active($1, false, 'Maintenance') r`, [SEED.branch1]), "operations.write");
    }
    assert.equal((await one(`select is_active from branches where id = $1`, [SEED.branch1])).is_active, true);
    await expectError(call(operations, `select admin_set_branch_active($1, false, '') r`, [SEED.branch1]), /reason of at least 3/);
    const off = await call(operations, `select admin_set_branch_active($1, false, 'Water damage, closed for repairs') r`, [SEED.branch1]);
    assert.equal(off.changed, true);
    assert.equal(off.is_active, false);
    assert.equal(typeof off.upcoming_bookings, "number");
    assert.equal((await one(`select is_active from branches where id = $1`, [SEED.branch1])).is_active, false);
    const audit = await one(`select details from admin_audit_logs where action = 'branch.deactivated' and target_id = $1`, [SEED.branch1]);
    assert.equal(audit.details.reason, "Water damage, closed for repairs");
    assert.equal((await call(operations, `select admin_set_branch_active($1, false, 'Again') r`, [SEED.branch1])).changed, false);
    assert.equal((await call(owner, `select admin_set_branch_active($1, true, 'Repairs finished') r`, [SEED.branch1])).is_active, true);
    await expectError(call(operations, `select admin_set_branch_active('00000000-0000-4000-8000-00000000abcd', false, 'Gone') r`), /no longer exists/);
  });
});

describe("admin_set_package_active", () => {
  it("lets operations switch a package off and on, refuses the analyst, and the console still lists the switched-off one", async () => {
    await refusedFor(call(analyst, `select admin_set_package_active($1, false, 'Old offer') r`, [packageId]), "operations.write");
    const off = await call(operations, `select admin_set_package_active($1, false, 'Offer ended') r`, [packageId]);
    assert.equal(off.changed, true);
    assert.equal((await one(`select is_active from packages where id = $1`, [packageId])).is_active, false);
    const seenByConsole = await as(db, analyst, `select id from packages where id = $1`, [packageId]);
    assert.equal(seenByConsole.length, 1, "a console account sees the switched-off package so it can be switched on again");
    const seenByCustomer = await as(db, customer, `select id from packages where id = $1`, [packageId]);
    assert.equal(seenByCustomer.length, 0, "customers still see active packages only");
    assert.equal((await one(`select details->>'reason' reason from admin_audit_logs where action = 'package.deactivated' and target_id = $1`, [packageId])).reason, "Offer ended");
    assert.equal((await call(operations, `select admin_set_package_active($1, true, 'Back by demand') r`, [packageId])).changed, true);
  });
});

describe("integration commands", () => {
  const tap = () => one(`select id, enabled, env, status, updated_at from integrations where key = 'tap'`);

  it("refuse operations and finance with settings.manage, and an owner without a fresh code", async () => {
    const { id } = await tap();
    for (const user of [operations, finance, analyst]) {
      await refusedFor(call(user, `select admin_set_integration_state($1, '{"enabled":false}'::jsonb, 'Outage at Tap') r`, [id]), "settings.manage");
    }
    const stepUp = await expectError(call(staleSession(owner.sub), `select admin_set_integration_state($1, '{"enabled":false}'::jsonb, 'Outage at Tap') r`, [id]),
      /fresh code/);
    assert.equal(stepUp.hint, "step_up_required");
    assert.equal((await tap()).enabled, true);
  });

  it("change the state with a reason and write the integration history on the server", async () => {
    const { id, updated_at } = await tap();
    const off = await call(owner, `select admin_set_integration_state($1, '{"enabled":false}'::jsonb, 'Outage at Tap', $2) r`, [id, updated_at]);
    assert.equal(off.changed, true);
    assert.equal(off.integration.enabled, false);
    const history = await one(`select actor_id, change from integration_audit_log where integration_key = 'tap' order by created_at desc limit 1`);
    assert.equal(history.actor_id, owner.sub);
    assert.match(history.change, /disabled \(reason: Outage at Tap\)/);
    await expectError(call(owner, `select admin_set_integration_state($1, '{"enabled":true}'::jsonb, 'Back', $2) r`, [id, updated_at]), /changed by someone else/);
    assert.equal((await call(owner, `select admin_set_integration_state($1, '{"enabled":true}'::jsonb, 'Tap recovered') r`, [id])).integration.enabled, true);
    await expectError(call(owner, `select admin_set_integration_state($1, '{"enabled":true}'::jsonb, '') r`, [id]), /reason of at least 3/);
    await expectError(call(owner, `select admin_set_integration_state($1, '{"base_url":"https://evil.example"}'::jsonb, 'Swap') r`, [id]), /edit form/);
  });

  it("no browser can write the integration history any more", async () => {
    await expectError(as(db, owner, `insert into integration_audit_log (integration_key, actor_id, change) values ('tap', $1, 'forged')`, [owner.sub]),
      /permission denied/);
  });

  it("save registry details: a new integration, a fixed key, and no full secret in the key hint", async () => {
    const created = await call(owner, `select admin_save_integration(null, $1::jsonb, 'Courier for product orders') r`,
      [JSON.stringify({ key: "aramex", name: "Aramex", category: "logistics", base_url: "https://ws.aramex.net", key_masked: "••••9f2a" })]);
    assert.equal(created.created, true);
    assert.equal(created.integration.enabled, false);
    await expectError(call(owner, `select admin_save_integration(null, $1::jsonb, 'Duplicate') r`,
      [JSON.stringify({ key: "aramex", name: "Aramex again", category: "logistics" })]), /already exists/);
    const id = created.integration.id;
    await expectError(call(owner, `select admin_save_integration($1, '{"key":"aramex_v2"}'::jsonb, 'Rename') r`, [id]), /cannot be changed/);
    await expectError(call(owner, `select admin_save_integration($1, '{"key_masked":"sk_live_51HxYzAbCdEf"}'::jsonb, 'Paste key') r`, [id]), /never a full key/);
    await expectError(call(owner, `select admin_save_integration($1, '{"base_url":"http://plain.example"}'::jsonb, 'Plain http') r`, [id]), /https:\/\//);
    await refusedFor(call(operations, `select admin_save_integration($1, '{"name":"Aramex KSA"}'::jsonb, 'Rename') r`, [id]), "settings.manage");
    const edited = await call(owner, `select admin_save_integration($1, '{"name":"Aramex KSA"}'::jsonb, 'Local entity name') r`, [id]);
    assert.equal(edited.integration.name, "Aramex KSA");
    assert.equal((await call(owner, `select admin_save_integration($1, '{"name":"Aramex KSA"}'::jsonb, 'Same name') r`, [id])).changed, false);
  });
});

describe("payment method commands", () => {
  const method = (key) => one(`select id, enabled, is_default, gateway_key, env from payment_methods where key = $1`, [key]);

  it("refuse finance and the analyst with settings.manage and change nothing", async () => {
    const { id } = await method("visa");
    for (const user of [finance, analyst, operations]) {
      await refusedFor(call(user, `select admin_set_payment_method($1, '{"enabled":false}'::jsonb, 'Card outage') r`, [id]), "settings.manage");
      await refusedFor(call(user, `select admin_set_default_payment_method($1, 'Cheaper fees') r`, [id]), "settings.manage");
    }
    assert.equal((await method("visa")).enabled, true);
  });

  it("set one default per audience in one step: a customer default never removes the provider payout default", async () => {
    const before = await sys(db, `select key from payment_methods where is_default order by key`);
    assert.ok(before.some((r) => r.key === "bank_transfer"), "the migrations set a provider payout default");
    const { id } = await method("apple_pay");
    const answer = await call(owner, `select admin_set_default_payment_method($1, 'Most customers pay with Apple Pay') r`, [id]);
    assert.equal(answer.changed, true);
    const defaults = await sys(db, `select key, enabled_for_roles from payment_methods where is_default order by key`);
    const customerDefaults = defaults.filter((r) => r.enabled_for_roles.includes("customer")).map((r) => r.key);
    assert.deepEqual(customerDefaults, ["apple_pay"], "exactly one customer default");
    assert.ok(defaults.some((r) => r.key === "bank_transfer"), "the provider payout default is kept");
    assert.equal((await one(`select details->>'reason' reason from admin_audit_logs where action = 'payment_method.default_set' and target_id = $1`, [id])).reason,
      "Most customers pay with Apple Pay");
  });

  it("refuse a default or a gateway that cannot take a payment", async () => {
    const { id: tamara } = await method("tamara");
    const refusal = await expectError(call(owner, `select admin_set_default_payment_method($1, 'Instalments first') r`, [tamara]), /cannot be the default/);
    assert.equal(refusal.hint, "gateway_not_operational");
    const { id: mada } = await method("mada");
    await expectError(call(owner, `select admin_set_payment_method($1, '{"gateway_key":"moyasar"}'::jsonb, 'Switch acquirer') r`, [mada]), /connected, enabled payment integration/);
    assert.equal((await method("mada")).gateway_key, "tap");
  });

  it("switch a method off and on with a reason", async () => {
    const { id } = await method("stc_pay");
    const off = await call(owner, `select admin_set_payment_method($1, '{"enabled":false}'::jsonb, 'STC Pay outage') r`, [id]);
    assert.equal(off.changed, true);
    assert.equal((await method("stc_pay")).enabled, false);
    assert.equal((await call(owner, `select admin_set_payment_method($1, '{"enabled":false}'::jsonb, 'Again') r`, [id])).changed, false);
    assert.equal((await call(owner, `select admin_set_payment_method($1, '{"enabled":true}'::jsonb, 'STC Pay back') r`, [id])).method.enabled, true);
  });
});
