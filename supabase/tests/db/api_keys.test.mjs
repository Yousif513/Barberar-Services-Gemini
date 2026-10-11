import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { as, createMigratedDb, createUser, expectError, MIGRATIONS_DIR, ROLES, SEED, sys } from "./harness.mjs";

// G69 part 1: provider API keys. Every check runs as a real role against the migrated schema.
//   - creation and revocation go through commands that identify the caller and the provider they own
//   - the plaintext key exists only in the create response: not in any table, not in the audit log
//   - authenticate_api_key is service-role only, answers every refusal identically, throttles last_used_at and
//     rate-limits per key from limits stored on the key and capped by a platform setting
//   - the retired plaintext-era token table can no longer hold a credential

let db;
let admin;
let employee;
let provider2Branch;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);

const KEY_RE = /^prm_live_[0-9a-f]{64}$/;
const outcome = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);
const failure = (promise) => promise.then(() => null, (error) => ({ code: error.code, message: error.message }));
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const inDays = (days) => new Date(Date.now() + days * 86400000).toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Rate-limit windows are clock minutes; do not start a sequence that could straddle a minute boundary.
async function awayFromMinuteBoundary() {
  const second = new Date().getUTCSeconds();
  if (second >= 52) await sleep((60 - second + 1) * 1000);
}

async function createKey(user, over = {}) {
  const args = {
    provider: SEED.provider1, branch: null, name: `Integration ${Math.random().toString(36).slice(2, 8)}`,
    scopes: "{services:read,bookings:read}", expires: inDays(30), rpm: 60, ...over,
  };
  const rows = await as(db, user,
    `select create_api_key($1, $2, $3, $4::text[], $5::timestamptz, $6) as r`,
    [args.provider, args.branch, args.name, args.scopes, args.expires, args.rpm]);
  return rows[0].r;
}
const authenticate = (key) => as(db, ROLES.service, `select authenticate_api_key($1) as r`, [key]).then((rows) => rows[0].r);
const auditFor = (action) => sys(db, `select actor_id, target_id, details from admin_audit_logs where action = $1 order by created_at`, [action]);

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  employee = ROLES.user(await createUser(db, { role: "provider_employee" }));
  await sys(db, `update employees set profile_id = $1 where id = $2`, [employee.sub, SEED.employee1]);
  await sys(db, `update providers set status = 'active' where id in ($1, $2)`, [SEED.provider1, SEED.provider2]);
  provider2Branch = (await sys(db, `select id from branches where provider_id = $1 limit 1`, [SEED.provider2]))[0].id;
});

describe("platform settings that gate the API", () => {
  it("start unset, and API keys cannot be created until the rate-limit ceiling is set", async () => {
    const rows = await sys(db, `select key, value from platform_settings where key like 'api.%' order by key`);
    assert.deepEqual(rows.map((r) => r.key), [
      "api.max_key_lifetime_days", "api.max_requests_per_minute", "api.webhook_disable_after_failures",
      "api.webhook_max_attempts", "api.webhook_retry_base_seconds"]);
    for (const row of rows) assert.equal(row.value, null, `${row.key} must be unset by default`);
    const refused = await failure(createKey(owner1));
    assert.equal(refused.code, "55000");
    assert.match(refused.message, /api\.max_requests_per_minute/);
    assert.equal((await sys(db, `select count(*)::int n from api_keys`))[0].n, 0);
  });

  it("are changed only by an administrator, with a reason and a valid whole number", async () => {
    for (const [name, user] of [["provider owner", owner1], ["employee", employee], ["customer", customer], ["anonymous", ROLES.anon]]) {
      assert.equal(await outcome(as(db, user, `select admin_set_api_setting('api.max_requests_per_minute', '600'::jsonb, 'Owner decision')`)), "42501", name);
    }
    for (const [label, value, reason] of [
      ["a missing reason", "600", null], ["a short reason", "600", "ab"], ["a string", '"600"', "Owner decision"],
      ["a fraction", "1.5", "Owner decision"], ["zero", "0", "Owner decision"], ["a negative number", "-5", "Owner decision"],
      ["a number beyond the sanity bound", "1000001", "Owner decision"], ["an object", "{}", "Owner decision"],
    ]) {
      assert.equal(await outcome(as(db, admin, `select admin_set_api_setting('api.max_requests_per_minute', $1::jsonb, $2)`, [value, reason])), "22023", label);
    }
    assert.equal(await outcome(as(db, admin, `select admin_set_api_setting('booking_hold_minutes', '600'::jsonb, 'Owner decision')`)), "22023", "only the API settings");
    assert.equal(await outcome(as(db, admin, `select admin_set_api_setting('api.max_requests_per_minute', null, 'Owner decision')`)), "22023", "a SQL null is not a value");
    assert.equal((await sys(db, `select value from platform_settings where key = 'api.max_requests_per_minute'`))[0].value, null);

    const done = (await as(db, admin, `select admin_set_api_setting('api.max_requests_per_minute', '600'::jsonb, 'Owner decision 2026-10-07') r`))[0].r;
    assert.deepEqual(done, { key: "api.max_requests_per_minute", value: 600 });
    const logged = (await sys(db, `select details from admin_audit_logs where action = 'platform_settings.update' and details->>'key' = 'api.max_requests_per_minute' order by created_at desc limit 1`))[0];
    assert.equal(logged.details.reason, "Owner decision 2026-10-07");
    assert.equal(logged.details.changes.value.after, 600);
  });

  it("can be put back to unset with JSON null", async () => {
    await as(db, admin, `select admin_set_api_setting('api.webhook_max_attempts', '5'::jsonb, 'Trial value')`);
    assert.equal((await sys(db, `select api_setting_int('api.webhook_max_attempts') v`))[0].v, 5);
    await as(db, admin, `select admin_set_api_setting('api.webhook_max_attempts', 'null'::jsonb, 'Switch deliveries off again')`);
    assert.equal((await sys(db, `select api_setting_int('api.webhook_max_attempts') v`))[0].v, null);
  });
});

describe("create_api_key", () => {
  it("returns the key once and stores only its SHA-256 digest, a prefix and the last four characters", async () => {
    const created = await createKey(owner1, { name: "Accounting sync", scopes: "{services:read,services:read,bookings:read}" });
    assert.match(created.key, KEY_RE);
    assert.equal(created.key_prefix, created.key.slice(0, 10));
    assert.equal(created.key_last4, created.key.slice(-4));
    assert.deepEqual(created.scopes, ["bookings:read", "services:read"], "duplicates collapse, order is stable");
    assert.equal(created.requests_per_minute, 60);
    assert.equal(created.provider_id, SEED.provider1);
    assert.equal(created.branch_id, null);

    const meta = (await sys(db, `select * from api_keys where id = $1`, [created.id]))[0];
    assert.equal(meta.key_prefix, created.key.slice(0, 10));
    assert.equal(meta.key_last4, created.key.slice(-4));
    assert.equal(meta.created_by, SEED.owner1);
    assert.equal(meta.last_used_at, null);
    assert.equal(meta.revoked_at, null);
    const stored = (await sys(db, `select token_hash from api_key_hashes where key_id = $1`, [created.id]))[0];
    assert.equal(stored.token_hash, sha256(created.key), "the digest is the standard SHA-256 of the UTF-8 key");

    const second = await createKey(owner1);
    assert.notEqual(second.key, created.key);
    assert.notEqual(second.key.slice(9), created.key.slice(9));
  });

  it("leaves the plaintext in no table at all and no key material in the audit log", async () => {
    const created = await createKey(owner1, { name: "Secrecy probe" });
    await authenticate(created.key);
    const secret = created.key.slice(9);
    const digest = sha256(created.key);
    const tables = await sys(db, `select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1`);
    const holding = [];
    for (const { relname } of tables) {
      const n = (await sys(db, `select count(*)::int n from public."${relname}" t where t::text like $1`, [`%${secret}%`]))[0].n;
      if (n > 0) holding.push(relname);
    }
    assert.deepEqual(holding, [], "no table may contain the key");
    const log = JSON.stringify(await sys(db, `select * from admin_audit_logs`));
    for (const material of [created.key, secret, digest, created.key.slice(0, 10) + created.key.slice(-4)]) {
      assert.ok(!log.includes(material), "the audit log must hold no key, digest or prefix");
    }
    const row = (await auditFor("api_key.created")).find((r) => r.target_id === created.id);
    assert.equal(row.actor_id, SEED.owner1);
    assert.equal(row.details.provider_id, SEED.provider1);
    assert.deepEqual(row.details.scopes, ["bookings:read", "services:read"]);
    assert.equal(row.details.requests_per_minute, 60);
    assert.ok(!("name" in row.details) && !("key_prefix" in row.details));
  });

  it("is available only to the owner of the provider; everyone else is told it does not exist", async () => {
    assert.equal(await outcome(createKey(ROLES.anon)), "42501", "anonymous callers have no EXECUTE right");
    for (const [name, user] of [["another provider's owner", owner2], ["a customer", customer], ["the provider's employee", employee], ["an administrator", admin]]) {
      const refused = await failure(createKey(user, { name: `Intruder ${name}` }));
      assert.equal(refused?.code, "P0002", name);
      assert.match(refused.message, /Provider not found/);
    }
    assert.equal(await outcome(createKey(owner1, { provider: "00000000-0000-4000-8000-0000000000aa" })), "P0002");
    assert.equal(await outcome(createKey(owner1, { provider: null })), "P0002");
    assert.equal(await outcome(createKey(owner1, { branch: provider2Branch, name: "Wrong branch" })), "P0002", "a branch of another provider");
    const owned = await createKey(owner1, { branch: SEED.branch1, name: "Branch scoped key" });
    assert.equal(owned.branch_id, SEED.branch1);
    assert.equal((await sys(db, `select count(*)::int n from api_keys where name like 'Intruder%'`))[0].n, 0);
  });

  it("validates name, scopes, expiry and rate limit, and refuses a duplicate active name", async () => {
    const bad = [
      ["a short name", { name: "ab" }], ["a long name", { name: "x".repeat(81) }], ["a blank name", { name: "    " }],
      ["no scopes", { scopes: "{}" }], ["a null scope", { scopes: "{services:read,NULL}" }], ["an unknown scope", { scopes: "{services:write}" }],
      ["webhooks:manage, which is not a key scope", { scopes: "{webhooks:manage}" }],
      ["a customer contact scope", { scopes: "{customers:read}" }],
      ["an expiry in the past", { expires: inDays(-1) }], ["no expiry", { expires: null }],
      ["a zero limit", { rpm: 0 }], ["a missing limit", { rpm: null }], ["a limit above the ceiling", { rpm: 601 }],
    ];
    for (const [label, over] of bad) {
      assert.equal(await outcome(createKey(owner1, { name: `Bad ${Math.random().toString(36).slice(2, 8)}`, ...over })), "22023", label);
    }
    await createKey(owner1, { name: "Unique name", rpm: 600 });
    const duplicate = await failure(createKey(owner1, { name: "  unique NAME " }));
    assert.equal(duplicate.code, "23505");
    assert.equal(await outcome(createKey(owner2, { provider: SEED.provider2, name: "Unique name" })), "ok", "names are per provider");
  });

  it("honours the optional lifetime ceiling only when it is set", async () => {
    assert.equal(await outcome(createKey(owner1, { name: "Long lived", expires: inDays(3000) })), "ok", "no ceiling while unset");
    await as(db, admin, `select admin_set_api_setting('api.max_key_lifetime_days', '90'::jsonb, 'Security policy')`);
    assert.equal(await outcome(createKey(owner1, { name: "Too long", expires: inDays(120) })), "22023");
    assert.equal(await outcome(createKey(owner1, { name: "Within ceiling", expires: inDays(80) })), "ok");
    await as(db, admin, `select admin_set_api_setting('api.max_key_lifetime_days', 'null'::jsonb, 'Policy reviewed')`);
  });

  it("refuses to create keys again once the ceiling is cleared", async () => {
    await as(db, admin, `select admin_set_api_setting('api.max_requests_per_minute', 'null'::jsonb, 'Pause key creation')`);
    assert.equal(await outcome(createKey(owner1, { name: "While paused" })), "55000");
    await as(db, admin, `select admin_set_api_setting('api.max_requests_per_minute', '600'::jsonb, 'Resume key creation')`);
    assert.equal(await outcome(createKey(owner1, { name: "After resume" })), "ok");
  });
});

describe("revoking keys", () => {
  it("is done by the owner with a reason, is idempotent, and is refused for every other role", async () => {
    const created = await createKey(owner1, { name: "To revoke" });
    for (const [name, user] of [["another provider's owner", owner2], ["a customer", customer], ["the employee", employee], ["an administrator", admin]]) {
      assert.equal(await outcome(as(db, user, `select revoke_api_key($1, 'Not mine to revoke')`, [created.id])), "P0002", name);
    }
    assert.equal(await outcome(as(db, ROLES.anon, `select revoke_api_key($1, 'Not mine to revoke')`, [created.id])), "42501");
    for (const reason of [null, "", "  ", "ab"]) {
      assert.equal(await outcome(as(db, owner1, `select revoke_api_key($1, $2)`, [created.id, reason])), "22023", String(reason));
    }
    assert.equal((await sys(db, `select revoked_at from api_keys where id = $1`, [created.id]))[0].revoked_at, null);

    const first = (await as(db, owner1, `select revoke_api_key($1, 'Leaked in a public repository') r`, [created.id]))[0].r;
    assert.equal(first.already_revoked, false);
    const again = (await as(db, owner1, `select revoke_api_key($1, 'Leaked in a public repository') r`, [created.id]))[0].r;
    assert.equal(again.already_revoked, true);
    assert.equal(again.revoked_at, first.revoked_at);
    const rows = (await auditFor("api_key.revoked")).filter((r) => r.target_id === created.id);
    assert.equal(rows.length, 1, "a replay writes no second audit row");
    assert.equal(rows[0].details.reason, "Leaked in a public repository");
    assert.equal(rows[0].actor_id, SEED.owner1);
    const meta = (await sys(db, `select revoked_by from api_keys where id = $1`, [created.id]))[0];
    assert.equal(meta.revoked_by, SEED.owner1);
    assert.equal(await outcome(as(db, owner1, `select revoke_api_key('00000000-0000-4000-8000-0000000000aa', 'No such key')`)), "P0002");
  });

  it("stops the key from authenticating, and frees its name", async () => {
    const created = await createKey(owner1, { name: "Revoked then reused" });
    assert.ok((await authenticate(created.key)).key_id);
    await as(db, owner1, `select revoke_api_key($1, 'Rotation')`, [created.id]);
    const refused = await failure(authenticate(created.key));
    assert.equal(refused.code, "28000");
    assert.equal(await outcome(createKey(owner1, { name: "Revoked then reused" })), "ok");
  });

  it("can be forced by an administrator through the kill-switch command only", async () => {
    const created = await createKey(owner1, { name: "Incident response" });
    for (const [name, user] of [["owner", owner1], ["employee", employee], ["customer", customer], ["anonymous", ROLES.anon]]) {
      assert.equal(await outcome(as(db, user, `select admin_revoke_api_key($1, 'Incident 2026-10-07')`, [created.id])), "42501", name);
    }
    assert.equal(await outcome(as(db, admin, `select admin_revoke_api_key($1, 'x')`, [created.id])), "22023");
    assert.equal(await outcome(as(db, admin, `select admin_revoke_api_key('00000000-0000-4000-8000-0000000000aa', 'Incident 2026-10-07')`)), "P0002");
    const done = (await as(db, admin, `select admin_revoke_api_key($1, 'Incident 2026-10-07') r`, [created.id]))[0].r;
    assert.equal(done.already_revoked, false);
    assert.equal(await failure(authenticate(created.key)).then((e) => e.code), "28000");
    const rows = (await auditFor("api_key.revoked")).filter((r) => r.target_id === created.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].details.by_administrator, true);
    assert.equal(rows[0].details.reason, "Incident 2026-10-07");
    const again = (await as(db, admin, `select admin_revoke_api_key($1, 'Incident 2026-10-07') r`, [created.id]))[0].r;
    assert.equal(again.already_revoked, true);
  });
});

describe("who can read or write the tables", () => {
  let key1;
  let key2;
  before(async () => {
    key1 = await createKey(owner1, { name: "Visible to owner one" });
    key2 = await createKey(owner2, { provider: SEED.provider2, name: "Visible to owner two" });
  });

  it("shows owners their own provider's key metadata and nobody else's", async () => {
    const ids = (user) => as(db, user, `select id from api_keys`).then((rows) => rows.map((r) => r.id));
    const mine = await ids(owner1);
    assert.ok(mine.includes(key1.id) && !mine.includes(key2.id));
    const theirs = await ids(owner2);
    assert.ok(theirs.includes(key2.id) && !theirs.includes(key1.id));
    assert.deepEqual(await ids(customer), []);
    assert.deepEqual(await ids(employee), []);
    const everything = await ids(admin);
    assert.ok(everything.includes(key1.id) && everything.includes(key2.id), "administrators can audit every key");
    assert.equal(await outcome(as(db, ROLES.anon, `select id from api_keys`)), "42501");
  });

  it("exposes no credential column through the metadata table", async () => {
    const row = (await as(db, owner1, `select * from api_keys where id = $1`, [key1.id]))[0];
    assert.deepEqual(Object.keys(row).sort(), [
      "branch_id", "created_at", "created_by", "expires_at", "id", "key_last4", "key_prefix", "last_used_at", "name",
      "provider_id", "requests_per_minute", "revoked_at", "revoked_by", "scopes"]);
    assert.ok(!JSON.stringify(row).includes(key1.key.slice(9)));
  });

  it("keeps digests and counters away from every client role, administrators included", async () => {
    for (const [name, user] of [["owner", owner1], ["other owner", owner2], ["customer", customer], ["employee", employee], ["administrator", admin], ["anonymous", ROLES.anon]]) {
      for (const sql of [`select token_hash from api_key_hashes`, `select * from api_key_hashes`, `select count(*) from api_key_hashes`,
                         `select * from api_rate_counters`, `select count(*) from api_rate_counters`]) {
        assert.equal(await outcome(as(db, user, sql)), "42501", `${name}: ${sql}`);
      }
    }
    assert.ok((await as(db, ROLES.service, `select token_hash from api_key_hashes where key_id = $1`, [key1.id])).length === 1, "the service role can");
  });

  it("refuses direct writes to the key table, so every change goes through a command", async () => {
    for (const [name, user] of [["owner", owner1], ["administrator", admin], ["customer", customer], ["anonymous", ROLES.anon]]) {
      for (const sql of [
        `insert into api_keys (provider_id, name, key_prefix, key_last4, scopes, requests_per_minute, expires_at) values ('${SEED.provider1}', 'Forged key', 'prm_live_a', 'abcd', '{services:read}', 1000000, now() + interval '1 year')`,
        `update api_keys set expires_at = now() + interval '10 years', requests_per_minute = 1000000 where id = '${key1.id}'`,
        `update api_keys set revoked_at = null where id = '${key1.id}'`,
        `delete from api_keys where id = '${key1.id}'`,
      ]) {
        assert.equal(await outcome(as(db, user, sql)), "42501", `${name}: ${sql.slice(0, 40)}`);
      }
    }
    assert.equal((await sys(db, `select requests_per_minute from api_keys where id = $1`, [key1.id]))[0].requests_per_minute, 60);
  });

  it("never stores anything that is not a digest in the digest table", async () => {
    await expectError(sys(db, `insert into api_key_hashes (key_id, token_hash) values ($1, $2)`, [key1.id, key1.key]), /check constraint|token_hash/i);
  });
});

describe("authenticate_api_key", () => {
  it("is callable by the service role only", async () => {
    const created = await createKey(owner1, { name: "Auth roles" });
    for (const [name, user] of [["anonymous", ROLES.anon], ["customer", customer], ["provider owner", owner1], ["administrator", admin]]) {
      assert.equal(await outcome(as(db, user, `select authenticate_api_key($1)`, [created.key])), "42501", name);
    }
    // A role that somehow holds EXECUTE still has to present a service-role JWT.
    const refused = await failure(db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', '{"role":"authenticated","sub":"${SEED.owner1}"}', true)`);
      return (await tx.query(`select authenticate_api_key($1)`, [created.key])).rows;
    }));
    assert.equal(refused.code, "42501");
    assert.match(refused.message, /Service role required/);
  });

  it("returns the provider, the branch, the scopes and the rate-limit state", async () => {
    const created = await createKey(owner1, { name: "Auth shape", branch: SEED.branch1, scopes: "{availability:read}", rpm: 5 });
    await awayFromMinuteBoundary();
    const auth = await authenticate(created.key);
    assert.equal(auth.key_id, created.id);
    assert.equal(auth.provider_id, SEED.provider1);
    assert.equal(auth.branch_id, SEED.branch1);
    assert.deepEqual(auth.scopes, ["availability:read"]);
    assert.equal(auth.rate_limit.limit, 5);
    assert.equal(auth.rate_limit.remaining, 4);
    assert.equal(auth.rate_limit.exceeded, false);
    const now = Math.floor(Date.now() / 1000);
    assert.ok(auth.rate_limit.reset_at > now - 2 && auth.rate_limit.reset_at <= now + 61, "reset is the end of the current minute");
    assert.equal(auth.rate_limit.reset_at % 60, 0);
  });

  it("answers every refusal with the same code and message", async () => {
    const revoked = await createKey(owner1, { name: "Will be revoked" });
    await as(db, owner1, `select revoke_api_key($1, 'Testing refusals')`, [revoked.id]);
    const expired = await createKey(owner1, { name: "Will expire" });
    await sys(db, `update api_keys set expires_at = now() - interval '1 second' where id = $1`, [expired.id]);
    const blocked = await createKey(owner2, { provider: SEED.provider2, name: "Provider blocked" });
    await sys(db, `update providers set status = 'suspended' where id = $1`, [SEED.provider2]);
    const unknown = `prm_live_${"0123456789abcdef".repeat(4)}`;

    const results = [];
    for (const [label, key] of [["unknown", unknown], ["revoked", revoked.key], ["expired", expired.key], ["provider suspended", blocked.key],
                                ["malformed", "not-a-key"], ["wrong prefix", unknown.replace("prm_live_", "pk_live__")],
                                ["too short", unknown.slice(0, 20)], ["upper case digest", unknown.toUpperCase().replace("PRM_LIVE_", "prm_live_")],
                                ["empty", ""], ["null", null]]) {
      const error = await failure(authenticate(key));
      assert.ok(error, `${label} must be refused`);
      results.push({ label, ...error });
    }
    for (const r of results) {
      assert.equal(r.code, "28000", r.label);
      assert.equal(r.message, "Invalid API key", r.label);
    }
    await sys(db, `update providers set status = 'active' where id = $1`, [SEED.provider2]);
    assert.ok((await authenticate(blocked.key)).key_id, "reactivating the provider restores its keys");
  });

  it("updates last_used_at at most once a minute", async () => {
    const created = await createKey(owner1, { name: "Last used" });
    assert.equal((await sys(db, `select last_used_at from api_keys where id = $1`, [created.id]))[0].last_used_at, null);
    await authenticate(created.key);
    const first = (await sys(db, `select last_used_at from api_keys where id = $1`, [created.id]))[0].last_used_at;
    assert.ok(first, "first use is recorded");
    await authenticate(created.key);
    assert.deepEqual((await sys(db, `select last_used_at from api_keys where id = $1`, [created.id]))[0].last_used_at, first, "a second call inside the minute leaves it alone");
    await sys(db, `update api_keys set last_used_at = now() - interval '2 minutes' where id = $1`, [created.id]);
    await authenticate(created.key);
    const later = (await sys(db, `select last_used_at > now() - interval '30 seconds' as fresh from api_keys where id = $1`, [created.id]))[0];
    assert.equal(later.fresh, true, "after a minute it moves again");
  });

  it("rate-limits per key from the limit stored on the key, then resets in the next window", async () => {
    const limited = await createKey(owner1, { name: "Rate limited", rpm: 3 });
    const other = await createKey(owner1, { name: "Neighbour", rpm: 3 });
    await awayFromMinuteBoundary();
    const seen = [];
    for (let i = 0; i < 3; i += 1) seen.push((await authenticate(limited.key)).rate_limit);
    assert.deepEqual(seen.map((r) => r.remaining), [2, 1, 0]);
    assert.ok(seen.every((r) => r.exceeded === false && r.limit === 3));
    for (let i = 0; i < 4; i += 1) {
      const over = (await authenticate(limited.key)).rate_limit;
      assert.equal(over.exceeded, true);
      assert.equal(over.remaining, 0);
      assert.equal(over.limit, 3);
      assert.equal(over.reset_at, seen[0].reset_at, "the reset time of the window does not drift");
    }
    const counter = await sys(db, `select request_count from api_rate_counters where key_id = $1`, [limited.id]);
    assert.deepEqual(counter.map((r) => r.request_count), [3], "refused requests do not push the counter past the limit");
    assert.equal((await authenticate(other.key)).rate_limit.exceeded, false, "another key is unaffected");

    // Move the used window a minute into the past: the next request opens a fresh window and prunes the old one.
    await sys(db, `update api_rate_counters set window_start = window_start - interval '1 minute' where key_id = $1`, [limited.id]);
    const fresh = (await authenticate(limited.key)).rate_limit;
    assert.equal(fresh.exceeded, false);
    assert.equal(fresh.remaining, 2);
    assert.equal((await sys(db, `select count(*)::int n from api_rate_counters where key_id = $1`, [limited.id]))[0].n, 1, "old windows are removed");
  });
});

describe("scope enforcement helper", () => {
  it("accepts a granted scope and refuses a missing one", async () => {
    assert.equal(await outcome(as(db, ROLES.service, `select api_require_scope('{services:read,bookings:read}'::text[], 'bookings:read')`)), "ok");
    for (const [scopes, wanted] of [["{services:read}", "bookings:read"], ["{}", "services:read"]]) {
      assert.equal(await outcome(as(db, ROLES.service, `select api_require_scope($1::text[], $2)`, [scopes, wanted])), "42501", `${scopes} / ${wanted}`);
    }
    assert.equal(await outcome(as(db, ROLES.service, `select api_require_scope(null, 'services:read')`)), "42501");
    assert.equal(await outcome(as(db, ROLES.service, `select api_require_scope('{services:read}'::text[], null)`)), "42501");
    for (const user of [ROLES.anon, owner1, admin]) {
      assert.equal(await outcome(as(db, user, `select api_require_scope('{services:read}'::text[], 'services:read')`)), "42501");
    }
  });

  it("lists exactly the v1 scopes, without webhook management or customer contact", async () => {
    const scopes = (await as(db, owner1, `select api_allowed_scopes() s`))[0].s;
    assert.deepEqual(scopes, ["services:read", "employees:read", "availability:read", "bookings:read"]);
  });
});

describe("the retired plaintext-era token table", () => {
  it("revokes every existing token and drops its credential, then refuses new ones", async () => {
    const sql = readFileSync(`${MIGRATIONS_DIR}/20261006090000_api_keys.sql`, "utf8");
    const block = sql.split("-- BEGIN legacy-token-retirement")[1].split("-- END legacy-token-retirement")[0];
    assert.ok(block.includes("UPDATE public.api_tokens"), "the test runs the migration's own statements");
    // Recreate the world the migration found: a live row holding what the old page stored.
    await sys(db, `alter table api_tokens drop constraint api_tokens_retired_no_credentials`);
    const profile = (await sys(db, `insert into developer_profiles (developer_id, app_name, is_approved) values ($1, 'Old integrator', true) returning id`, [SEED.owner1]))[0].id;
    await sys(db, `insert into api_tokens (developer_profile_id, token_hash, scopes, status) values ($1, 'pk_live_8a38a7c29e1f4c76b92a34419cb7d100', '{bookings:read}', 'active')`, [profile]);
    await sys(db, `insert into api_tokens (developer_profile_id, token_hash, scopes, status) values ($1, $2, '{bookings:write}', 'active')`, [profile, sha256("pk_live_old")]);
    await db.exec(block);
    const rows = await sys(db, `select token_hash, status from api_tokens`);
    assert.ok(rows.length >= 2, "history is kept");
    for (const row of rows) assert.deepEqual(row, { token_hash: null, status: "revoked" });
    await expectError(sys(db, `insert into api_tokens (developer_profile_id, token_hash, scopes) values ($1, 'pk_live_new', '{}')`, [profile]), /api_tokens_retired_no_credentials/);
    assert.equal(JSON.stringify(await sys(db, `select * from api_tokens`)).includes("pk_live"), false);
  });

  it("is invisible to every client role", async () => {
    for (const [name, user] of [["owner", owner1], ["customer", customer], ["administrator", admin], ["anonymous", ROLES.anon]]) {
      assert.equal(await outcome(as(db, user, `select * from api_tokens`)), "42501", name);
      assert.equal(await outcome(as(db, user, `insert into api_tokens (developer_profile_id, scopes) values ('${SEED.provider1}', '{}')`)), "42501", name);
    }
  });

  it("keeps developer profiles as data but stops a developer approving themselves", async () => {
    const own = (await as(db, owner1, `select id, is_approved from developer_profiles`));
    assert.ok(own.length >= 1);
    assert.equal((await as(db, owner2, `select id from developer_profiles`)).length, 0);
    assert.equal(await outcome(as(db, owner1, `update developer_profiles set is_approved = true`)), "42501");
    assert.equal(await outcome(as(db, owner1, `insert into developer_profiles (developer_id, app_name, is_approved) values ('${SEED.owner1}', 'Fresh', true)`)), "42501");
    assert.equal(await outcome(as(db, owner1, `delete from developer_profiles`)), "42501");
  });
});

describe("catalog invariants of the new objects", () => {
  const COMMANDS = ["create_api_key", "revoke_api_key", "admin_revoke_api_key", "admin_set_api_setting"];
  const SERVICE_ONLY = ["authenticate_api_key", "api_require_scope", "api_setting_int"];

  it("pins the search path of every elevated function and grants the right roles", async () => {
    const rows = await sys(db, `
      select p.proname, p.prosecdef,
             exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') as pinned,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_x,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as service_x
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1)`, [[...COMMANDS, ...SERVICE_ONLY]]);
    assert.equal(rows.length, COMMANDS.length + SERVICE_ONLY.length);
    for (const row of rows) {
      // api_require_scope reads no table, so it runs with the caller's rights; every function that does is elevated and pinned.
      assert.equal(row.prosecdef, row.proname !== "api_require_scope", row.proname);
      if (row.prosecdef) assert.equal(row.pinned, true, `${row.proname} pins its search path`);
      assert.equal(row.anon_x, false, `${row.proname} is closed to anonymous callers`);
      if (SERVICE_ONLY.includes(row.proname)) {
        assert.equal(row.auth_x, false, `${row.proname} is not executable by signed-in users`);
        assert.equal(row.service_x, true, row.proname);
      } else {
        assert.equal(row.auth_x, true, row.proname);
      }
    }
  });

  it("has row-level security and the administrator audit trigger on every new table", async () => {
    const rows = await sys(db, `
      select c.relname, c.relrowsecurity as rls,
             exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'trg_audit_admin_write') as audited
      from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('api_keys', 'api_key_hashes', 'api_rate_counters') order by 1`);
    assert.equal(rows.length, 3);
    for (const row of rows) assert.deepEqual([row.rls, row.audited], [true, true], row.relname);
  });
});
