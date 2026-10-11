import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, SEED, sys } from "./harness.mjs";

// Role-by-operation negative matrix for the admin console, run against the full migration chain.
// Every role that is not an administrator (provider owner, provider employee, customer, anonymous) must be
// refused by the database itself, whichever route reaches it: the console commands, the tables the console
// writes, and the audit trail. Nothing here depends on what the interface hides.
//
// The command list is read from the catalog, not typed out, so a new admin command that forgets its
// administrator check fails here without anyone remembering to add it.

let db;
let admin;
let employee;
const owner = ROLES.user(SEED.owner1);
const otherOwner = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);

const ZERO_UUID = "00000000-0000-4000-8000-0000000000aa";

// SQLSTATE of a failed call, or "ok" when the call went through.
const outcome = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);

async function gatedFunctions() {
  return sys(db, `
    select p.oid::int as oid, p.oid::regprocedure::text as signature, p.proname
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and (p.proname like 'admin\\_%' or p.proname like 'get\\_admin\\_%'
           or pg_get_functiondef(p.oid) ~* 'IF NOT (public\\.)?(is_admin\\(\\)|admin_can\\([^)]*\\))\\s+THEN\\s+RAISE')
      -- GOV-1 session introspection: these answer "what may I do" for any signed-in caller and change nothing.
      and p.proname not in ('admin_can', 'admin_role', 'admin_role_of_account', 'admin_session_state', 'admin_table_write_allowed')
    order by 2`);
}

// One well-formed value per argument type, so the call reaches the administrator check the way a real one would.
async function callFor(fn) {
  const types = await sys(db, `
    select format_type(a.t, null) as type_name, ty.typtype, a.t::int as type_oid
    from unnest(string_to_array((select proargtypes::text from pg_proc where oid = $1::oid), ' ')::oid[]) with ordinality as a(t, ord)
    join pg_type ty on ty.oid = a.t
    order by a.ord`, [fn.oid]);
  const params = [];
  const casts = [];
  for (const [index, type] of types.entries()) {
    const name = type.type_name;
    let value;
    if (type.typtype === "e") {
      value = (await sys(db, `select enumlabel from pg_enum where enumtypid = $1::oid order by enumsortorder limit 1`, [type.type_oid]))[0].enumlabel;
    } else if (name.endsWith("[]")) value = "{}";
    else if (name === "uuid") value = ZERO_UUID;
    else if (["text", "character varying"].includes(name)) value = "probe-value";
    else if (["numeric", "integer", "bigint", "smallint"].includes(name)) value = "1";
    else if (name === "boolean") value = "true";
    else if (name === "date") value = "2026-01-01";
    else if (name === "jsonb" || name === "json") value = "{}";
    else if (name.startsWith("timestamp")) value = "2026-01-01T00:00:00Z";
    else throw new Error(`${fn.signature}: no probe value for argument type ${name}; extend callFor`);
    params.push(value);
    casts.push(`$${index + 1}::${name}`);
  }
  return { sql: `select ${fn.signature.split("(")[0]}(${casts.join(", ")})`, params };
}

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  // A genuine provider employee: registered staff at the first branch of the first provider.
  employee = ROLES.user(await createUser(db, { role: "provider_employee" }));
  await sys(db, `update employees set profile_id = $1 where id = $2`, [employee.sub, SEED.employee1]);
  await sys(db, `update providers set status = 'active' where id in ($1, $2)`, [SEED.provider1, SEED.provider2]);
});

describe("administrator commands refuse every other role before doing anything else", () => {
  it("finds the commands from the catalog", async () => {
    const found = (await gatedFunctions()).map((f) => f.proname);
    for (const name of [
      "admin_dashboard_overview", "admin_review_payout_request", "admin_update_platform_setting", "admin_release_expired_holds",
      "admin_retry_refund_request", "admin_clear_customer_profile", "admin_set_provider_status", "admin_export_finance_report",
      "admin_customer_overview", "admin_update_data_request", "admin_set_phone_verified", "admin_release_payout",
      "admin_release_ledger_item", "admin_create_refund_request", "get_admin_supply_overview", "set_user_role",
    ]) {
      assert.ok(found.includes(name), `${name} is expected to be an administrator-only command`);
    }
  });

  it("rejects provider owner, provider employee, customer and anonymous callers with insufficient_privilege", async () => {
    const functions = await gatedFunctions();
    assert.ok(functions.length >= 16);
    const failures = [];
    for (const fn of functions) {
      const { sql, params } = await callFor(fn);
      for (const [role, user] of [["provider-owner", owner], ["provider-employee", employee], ["customer", customer], ["anonymous", ROLES.anon]]) {
        const result = await outcome(as(db, user, sql, params));
        if (result !== "42501") failures.push(`${role} -> ${fn.signature}: ${result}`);
      }
    }
    assert.deepEqual(failures, [], "each of these let a non-administrator past the administrator check or failed for another reason first");
  });

  it("lets an administrator through the same check", async () => {
    const functions = await gatedFunctions();
    const refused = [];
    for (const fn of functions) {
      const { sql, params } = await callFor(fn);
      if ((await outcome(as(db, admin, sql, params))) === "42501") refused.push(fn.signature);
    }
    assert.deepEqual(refused, [], "the administrator check must not reject administrators");
  });
});

describe("tables the console and the money flows write", () => {
  // Statements that must change nothing for the role: either the database refuses them or no row qualifies.
  const writes = [
    ["integrations", `update integrations set enabled = enabled returning 1`, `delete from integrations returning 1`],
    ["payment_methods", `update payment_methods set enabled = enabled returning 1`, `delete from payment_methods returning 1`],
    ["promotional_codes", `update promotional_codes set is_active = is_active returning 1`, `delete from promotional_codes returning 1`],
    ["platform_settings", `update platform_settings set updated_at = now() returning 1`, `delete from platform_settings returning 1`],
    ["fee_rules", `update fee_rules set is_active = is_active returning 1`, `delete from fee_rules returning 1`],
    ["transactional_ledger", `update transactional_ledger set payout_status = payout_status returning 1`, `delete from transactional_ledger returning 1`],
    ["wallet_credits", `update wallet_credits set amount = amount returning 1`, `delete from wallet_credits returning 1`],
    ["payout_requests", `update payout_requests set status = status returning 1`, `delete from payout_requests returning 1`],
    ["refund_requests", `update refund_requests set status = status returning 1`, `delete from refund_requests returning 1`],
    ["data_subject_requests", `update data_subject_requests set status = status returning 1`, `delete from data_subject_requests returning 1`],
    ["categories", `update categories set is_active = is_active returning 1`, `delete from categories returning 1`],
    ["admin_audit_logs", `update admin_audit_logs set action = action returning 1`, `delete from admin_audit_logs returning 1`],
  ];

  before(async () => {
    // Give every table something to qualify, so an empty table cannot pass the test by having nothing to change.
    const ledger = (await sys(db, `insert into transactional_ledger (provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
      values ($1, 'package_sale', 'chg_matrix_1', 100, 10, 90, 'pending') returning id`, [SEED.provider1]))[0].id;
    await sys(db, `insert into refund_requests (ledger_id, payment_intent_id, amount, reason, source, status, attempts, idempotency_key)
      values ($1, 'chg_matrix_1', 10, 'Gateway refused', 'admin', 'failed', 1, 'matrix-refund-1')`, [ledger]);
    await sys(db, `insert into payout_requests (provider_id, requested_by, amount, bank_name, iban)
      values ($1, $2, 50, 'Test Bank', 'SA0380000000608010167519')`, [SEED.provider1, SEED.owner1]);
    await sys(db, `insert into data_subject_requests (user_id, request_type, status) values ($1, 'export', 'pending')`, [SEED.customer]);
    await sys(db, `insert into wallet_credits (customer_id, amount, reason, source) values ($1, 5, 'Referral reward', 'referral')`, [SEED.customer]);
    await sys(db, `insert into promotional_codes (code, discount_type, discount_value) values ('MATRIX10', 'percentage', 10)`);
    await as(db, admin, `select admin_release_expired_holds('Seed one audit row')`);
  });

  it("have rows for the checks below to protect", async () => {
    const empty = [];
    for (const [table] of writes) {
      const count = (await sys(db, `select count(*)::int as n from ${table}`))[0].n;
      if (count === 0) empty.push(table);
    }
    assert.deepEqual(empty, [], "these tables are empty, so a refused write could not be told from nothing to change");
  });

  for (const [role, who] of [["a customer", () => customer], ["an anonymous visitor", () => ROLES.anon], ["another provider's owner", () => otherOwner], ["a provider employee", () => employee]]) {
    it(`${role} cannot update or delete them directly`, async () => {
      const changed = [];
      for (const [table, update, remove] of writes) {
        for (const statement of [update, remove]) {
          try {
            const rows = await as(db, who(), statement);
            if (rows.length > 0) changed.push(`${table}: ${statement} touched ${rows.length} rows`);
          } catch (error) {
            if (error.code !== "42501") changed.push(`${table}: ${statement} failed with ${error.code ?? error.message}`);
          }
        }
      }
      assert.deepEqual(changed, []);
    });
  }

  it("a customer cannot insert into the audit trail, the ledger or the settings", async () => {
    for (const [role, user] of [["customer", customer], ["anonymous", ROLES.anon], ["provider-owner", owner], ["provider-employee", employee]]) {
      assert.equal(await outcome(as(db, user, `insert into admin_audit_logs (actor_id, action, target_type) values (null, 'forged.entry', 'x')`)), "42501", `${role} audit insert`);
      assert.equal(await outcome(as(db, user, `insert into transactional_ledger (provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
        values ($1, 'package_sale', 'chg_forged', 1000, 0, 1000, 'pending')`, [SEED.provider1])), "42501", `${role} ledger insert`);
      assert.equal(await outcome(as(db, user, `insert into platform_settings (key, value) values ('forged', '1'::jsonb)`)), "42501", `${role} settings insert`);
    }
  });

  it("nobody can promote themselves to administrator", async () => {
    for (const [role, user] of [["customer", customer], ["provider-owner", owner], ["provider-employee", employee]]) {
      assert.equal(await outcome(as(db, user, `update profiles set role = 'admin' where id = $1`, [user.sub])), "42501", `${role} direct role update`);
      assert.equal(await outcome(as(db, user, `select set_user_role($1, 'admin', 'self-promotion attempt')`, [user.sub])), "42501", `${role} set_user_role`);
    }
  });
});

describe("another provider's data", () => {
  it("is not writable by an owner or an employee of a different provider", async () => {
    const attempts = [
      [`update providers set business_name_en = business_name_en where id = $1 returning 1`, [SEED.provider1]],
      [`update branches set is_active = is_active where provider_id = $1 returning 1`, [SEED.provider1]],
      [`update services set is_active = is_active where provider_id = $1 returning 1`, [SEED.provider1]],
      [`update employees set is_active = is_active where branch_id = $1 returning 1`, [SEED.branch1]],
      [`update payout_requests set status = status where provider_id = $1 returning 1`, [SEED.provider1]],
    ];
    for (const user of [otherOwner]) {
      for (const [sql, params] of attempts) {
        const rows = await as(db, user, sql, params).catch((error) => {
          assert.equal(error.code, "42501", error.message);
          return [];
        });
        assert.equal(rows.length, 0, sql);
      }
    }
  });

  it("an employee cannot change the provider, its branches, prices or payouts", async () => {
    for (const [sql, params] of [
      [`update providers set business_name_en = business_name_en where id = $1 returning 1`, [SEED.provider1]],
      [`update services set base_price = base_price where provider_id = $1 returning 1`, [SEED.provider1]],
      [`update payout_requests set status = status where provider_id = $1 returning 1`, [SEED.provider1]],
      [`insert into payout_requests (provider_id, requested_by, amount, bank_name, iban) values ($1, $2, 1, 'Test Bank', 'SA0380000000608010167519') returning 1`, [SEED.provider1, employee.sub]],
    ]) {
      const rows = await as(db, employee, sql, params).catch((error) => {
        assert.equal(error.code, "42501", error.message);
        return [];
      });
      assert.equal(rows.length, 0, sql);
    }
  });
});

describe("the audit trail", () => {
  it("cannot be forged, edited or deleted through any client role", async () => {
    const before = (await sys(db, `select count(*)::int as n from admin_audit_logs`))[0].n;
    assert.ok(before > 0);
    for (const [role, user] of [["admin", admin], ["customer", customer], ["anonymous", ROLES.anon]]) {
      assert.equal(await outcome(as(db, user, `insert into admin_audit_logs (actor_id, action, target_type) values (null, 'forged.entry', 'x')`)), "42501", `${role} insert`);
      assert.equal(await outcome(as(db, user, `select write_audit_log('forged.entry', 'x', null, '{}'::jsonb)`)), "42501", `${role} writer`);
      const edited = await as(db, user, `update admin_audit_logs set action = 'edited' returning 1`).catch(() => []);
      const removed = await as(db, user, `delete from admin_audit_logs returning 1`).catch(() => []);
      assert.equal(edited.length + removed.length, 0, `${role} cannot change existing rows`);
    }
    assert.equal((await sys(db, `select count(*)::int as n from admin_audit_logs`))[0].n, before);
    assert.equal((await sys(db, `select count(*)::int as n from admin_audit_logs where action in ('edited', 'forged.entry')`))[0].n, 0);
  });

  it("is readable by the console owner only, through the audited admin_list_audit_events (SECFIX-2 R2-M8)", async () => {
    assert.equal((await as(db, admin, `select id from admin_audit_logs limit 1`)).length, 0, "no direct read, even for the owner");
    assert.ok((await as(db, admin, `select admin_list_audit_events(null, null, null, null, 1, 0, null) r`))[0].r.rows.length === 1);
    for (const user of [owner, employee, customer, ROLES.anon]) {
      assert.equal((await as(db, user, `select id from admin_audit_logs`).catch(() => [])).length, 0);
    }
  });

  it("has no writer that a client role can execute", async () => {
    const rows = await sys(db, `
      select p.oid::regprocedure::text as signature, r.rolname
      from pg_proc p cross join (values ('anon'), ('authenticated')) r(rolname)
      where p.pronamespace = 'public'::regnamespace and p.proname in ('write_audit_log', 'audit_admin_write', 'audit_inventory_catalog')
        and has_function_privilege(r.rolname, p.oid, 'EXECUTE')`);
    assert.deepEqual(rows, []);
  });
});

describe("what the landing page summary reveals", () => {
  it("contains counts and money totals, never a customer's name, email or phone", async () => {
    const id = await createUser(db, { role: "customer", phone: "+966599887766", verified: true });
    await sys(db, `update profiles set first_name = 'Zainab', last_name = 'Qahtani', email = 'zainab.qahtani@example.test' where id = $1`, [id]);
    await sys(db, `insert into data_subject_requests (user_id, request_type, status, details) values ($1, 'erasure', 'pending', 'Please delete my account')`, [id]);
    const text = JSON.stringify((await as(db, admin, `select admin_dashboard_overview() as o`))[0].o);
    for (const secret of ["Zainab", "Qahtani", "zainab.qahtani", "+966599887766", "Please delete my account"]) {
      assert.ok(!text.includes(secret), `the overview must not contain ${secret}`);
    }
  });
});

describe("database invariants the authorization model relies on", () => {
  it("every elevated-rights function pins its search path", async () => {
    const rows = await sys(db, `
      select p.oid::regprocedure::text as signature from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    assert.deepEqual(rows, []);
  });

  it("every table in public has row-level security switched on", async () => {
    const rows = await sys(db, `
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    assert.deepEqual(rows, []);
  });

  it("the views added for the console run with the caller's rights and are closed to anonymous visitors", async () => {
    const rows = await sys(db, `
      select c.relname,
             coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), 'false') as invoker,
             has_table_privilege('anon', c.oid, 'SELECT') as anon_can_read
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v' and c.relname in ('admin_branch_performance', 'admin_employee_performance')`);
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.invoker, "true", `${row.relname} must be security_invoker`);
      assert.equal(row.anon_can_read, false, `${row.relname} must not be readable by anonymous visitors`);
    }
  });
});
