import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, sys } from "./harness.mjs";

// GOV-FIX M-3: every Q6 command named in the review needs a TOTP code from the last 5 minutes. L-1: the audit purge refuses
// signed-in callers by the login role. L-4: re-authentication counts only methods that prove a credential.
let db;
let owner;
const now = () => Math.floor(Date.now() / 1000);
const stale = (user) => ROLES.user(user.sub, { amr: [{ method: "totp", timestamp: now() - 900 }, { method: "password", timestamp: now() - 950 }] });
const stepUp = /step-up required/;

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
});

describe("M-3: step-up on the remaining Q6 commands", () => {
  const ID = "00000000-0000-4000-8000-0000000000ab";
  const calls = [
    ["admin_update_data_request", `select admin_update_data_request($1, 'in_progress', 'Identity checked by phone')`, [ID]],
    ["admin_save_promo_code", `select admin_save_promo_code('SPRING', 'percentage', 10, 'Spring campaign approved')`, []],
    ["admin_set_promo_code_active", `select admin_set_promo_code_active($1, false, 'Campaign ended early')`, [ID]],
    ["admin_void_sponsored_attribution", `select admin_void_sponsored_attribution($1, 'void', 'Duplicate attribution')`, [ID]],
    ["admin_review_payout_request", `select admin_review_payout_request($1, 'processing', 'Bank details checked')`, [ID]],
    ["admin_set_api_setting", `select admin_set_api_setting('api.webhook_max_attempts', '5'::jsonb, 'Agreed with the partner')`, []],
    ["admin_revoke_api_key", `select admin_revoke_api_key($1, 'Key leaked in a ticket')`, [ID]],
  ];
  for (const [name, sql, params] of calls) {
    it(`${name} refuses a session whose last code is older than 5 minutes, before anything else`, async () => {
      const error = await expectError(as(db, stale(owner), sql, params), stepUp);
      assert.equal(error.hint, "step_up_required");
    });
  }

  it("lets the same commands through with a fresh code (they then apply their own checks)", async () => {
    for (const [, sql, params] of calls) {
      await as(db, owner, sql, params).catch((e) => assert.doesNotMatch(e.message, stepUp));
    }
  });

  it("the server export recorder carries step-up too and stays closed to clients", async () => {
    const [def] = await sys(db, `select prosrc from pg_proc where proname = 'admin_record_export'`);
    assert.match(def.prosrc, /require_recent_mfa/);
    await expectError(as(db, owner, `select admin_record_export('ledger', current_date, current_date, 1)`), /permission denied/);
  });
});

describe("L-1: the audit retention purge", () => {
  it("refuses a signed-in caller even where the function owner is postgres", async () => {
    // A database of its own: the test changes the session user, as PostgREST's login role (authenticator) does.
    const dbx = await createMigratedDb();
    const admin = await createUser(dbx, { role: "admin", adminRole: "owner" });
    await sys(dbx, `grant execute on function purge_expired_audit_logs() to authenticated`);
    await sys(dbx, `create role authenticator_test login`);
    await sys(dbx, `grant authenticated to authenticator_test`);
    const refused = await dbx.transaction(async (tx) => {
      await tx.exec(`SET LOCAL SESSION AUTHORIZATION authenticator_test`);
      await tx.exec(`SET LOCAL ROLE authenticated`);
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "authenticated", sub: admin, session_id: admin, aal: "aal2" })]);
      try { await tx.query(`select purge_expired_audit_logs()`); return null; } catch (e) { return e.message; }
    });
    assert.match(refused ?? "", /runs only as a server job/);
    await dbx.close();
  });
});

describe("L-4: re-authentication", () => {
  it("counts a fresh password or one-time code, never a recovery, invite, magic link or refresh entry", async () => {
    const person = await createUser(db);
    const withAmr = (method) => ROLES.user(person, { aal: "aal1", amr: [{ method, timestamp: now() - 10 }, { method: "password", timestamp: now() - 7200 }] });
    for (const method of ["recovery", "invite", "magiclink", "token_refresh", "email_change", "anonymous"]) {
      const error = await expectError(as(db, withAmr(method), `select require_recent_login()`), /re-authentication required/);
      assert.equal(error.hint, "reauth_required", method);
    }
    for (const method of ["password", "otp", "totp", "sso/saml"]) {
      await as(db, withAmr(method), `select require_recent_login()`);
    }
  });
});
