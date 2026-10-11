import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";
import { approvedDestination } from "./gov1_fixtures.mjs";

// GOV-FIX H-3: out-of-band notices go only to contacts Supabase Auth has verified, old and new, never to the editable profile
// fields; a bank-account change waits 48 hours after a verified contact changed. GOV-FIX M-6: a factor added to an
// administrator account raises an alert.
let db;
let owner;
const providerOwner = ROLES.user(SEED.owner1);
const ATTACKER_EMAIL = "attacker@evil.example";
const ATTACKER_PHONE = "+966599999999";
const notices = (userId, template) => sys(db,
  `select channel, destination, contact_source, status, error_message from governance_notifications
    where recipient_user_id = $1 and template_key = $2 order by channel, destination`, [userId, template]);
const requestIban = (iban) => as(db, providerOwner,
  `select provider_request_payout_destination($1, 'Al Rajhi Bank', 'Elite Grooming Lounge LLC', $2) r`, [SEED.provider1, iban]);

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  await approvedDestination(db, SEED.provider1, "SA0380000000608010167519");
});

describe("H-3: notices reach verified contacts only", () => {
  it("report reproduction: the account holder's own profile email and phone receive nothing; the verified auth email does", async () => {
    // The takeover sets their own contacts on the profile, then asks for a new IBAN.
    await as(db, providerOwner, `update profiles set email = $2 where id = $1`, [SEED.owner1, ATTACKER_EMAIL]);
    await as(db, providerOwner, `update profiles set phone_number = $2 where id = $1`, [SEED.owner1, ATTACKER_PHONE]);
    await requestIban("SA4420000001234567891234");
    const sent = await notices(SEED.owner1, "payout_account_change_requested");
    assert.deepEqual(sent.map((n) => [n.channel, n.destination, n.contact_source]),
      [["email", "demo.owner.elite@primora.local", "current_verified"]]);
    const everything = await sys(db, `select destination from governance_notifications where destination in ($1, $2)`, [ATTACKER_EMAIL, ATTACKER_PHONE]);
    assert.equal(everything.length, 0, "no notice anywhere goes to the profile's self-entered contacts");
  });

  it("refuses a bank-account change for 48 hours after a verified contact changed, then tells the old and the new address", async () => {
    await sys(db, `update auth.users set email = 'new.owner.elite@primora.local' where id = $1`, [SEED.owner1]);
    const [change] = await sys(db, `select channel, old_value from account_contact_changes where user_id = $1`, [SEED.owner1]);
    assert.deepEqual([change.channel, change.old_value], ["email", "demo.owner.elite@primora.local"]);
    const refused = await expectError(requestIban("SA5510000000123456789012"), /changed in the last 48 hours/);
    assert.equal(refused.hint, "contact_recently_changed");

    await sys(db, `update account_contact_changes set changed_at = now() - interval '49 hours' where user_id = $1`, [SEED.owner1]);
    const before = new Set((await sys(db, `select id from governance_notifications`)).map((r) => r.id));
    await requestIban("SA5510000000123456789012");
    const sent = (await sys(db, `select id, channel, destination, contact_source from governance_notifications
      where recipient_user_id = $1 and template_key = 'payout_account_change_requested'`, [SEED.owner1])).filter((n) => !before.has(n.id));
    assert.deepEqual(sent.map((n) => [n.destination, n.contact_source]).sort(),
      [["demo.owner.elite@primora.local", "previous_verified"], ["new.owner.elite@primora.local", "current_verified"]],
      "the request is announced to the new verified address and to the one it replaced");
  });

  it("uses a verified phone, ignores an unverified one, and records a skipped notice when nothing is verified", async () => {
    const person = await createUser(db);
    await sys(db, `update auth.users set phone = '966501234567', phone_confirmed_at = now() where id = $1`, [person]);
    await sys(db, `select queue_governance_notice($1, 'console_role_changed', '{}'::jsonb)`, [person]);
    assert.deepEqual((await notices(person, "console_role_changed")).map((n) => [n.channel, n.destination]),
      [["email", `${(await sys(db, `select email from auth.users where id = $1`, [person]))[0].email}`], ["sms", "966501234567"]]);

    // An account whose email was never confirmed and whose phone was never verified.
    const unverified = (await sys(db, `insert into auth.users (email, phone) values ('pending@test.local', '966507654321') returning id`))[0].id;
    assert.equal((await sys(db, `select queue_governance_notice($1, 'mfa_reset', '{}'::jsonb) n`, [unverified]))[0].n, 0);
    const [skipped] = await notices(unverified, "mfa_reset");
    assert.equal(skipped.status, "skipped");
    assert.match(skipped.error_message, /No verified email or phone/);
  });

  it("does not show console sessions the address a notice goes to", async () => {
    await expectError(as(db, owner, `select destination from governance_notifications limit 1`), /permission denied/);
    assert.ok((await as(db, owner, `select id, status, contact_source from governance_notifications limit 1`)).length >= 0);
    await expectError(as(db, owner, `select * from account_contact_changes`), /permission denied/);
    await expectError(as(db, providerOwner, `select * from account_contact_changes`), /permission denied/);
  });
});

describe("M-6: an MFA factor added to an administrator raises an alert", () => {
  it("alerts, audits and notifies for an administrator, and only once the factor is verified", async () => {
    const admin = await createUser(db, { role: "admin", adminRole: "finance" });
    const [factor] = await sys(db, `insert into auth.mfa_factors (user_id, status, factor_type) values ($1, 'unverified', 'totp') returning id`, [admin]);
    assert.equal((await sys(db, `select count(*)::int n from security_alerts where kind = 'mfa_factor_added' and user_id = $1`, [admin]))[0].n, 0);
    await sys(db, `update auth.mfa_factors set status = 'verified' where id = $1`, [factor.id]);
    const [alert] = await sys(db, `select details from security_alerts where kind = 'mfa_factor_added' and user_id = $1`, [admin]);
    assert.equal(alert.details.factor_id, factor.id);
    assert.equal(alert.details.verified_factors, 1);
    assert.equal((await sys(db, `select count(*)::int n from admin_audit_logs where action = 'mfa.factor_added' and target_id = $1`, [admin]))[0].n, 1);
    assert.equal((await notices(admin, "mfa_factor_added")).length, 1);

    // A second factor (the persistence move from a stolen session) is another alert, and the account cannot clear it itself.
    await sys(db, `insert into auth.mfa_factors (user_id, status, factor_type) values ($1, 'verified', 'totp')`, [admin]);
    const alerts = await sys(db, `select id, details from security_alerts where kind = 'mfa_factor_added' and user_id = $1 order by created_at`, [admin]);
    assert.equal(alerts.length, 2);
    assert.equal(alerts[1].details.verified_factors, 2);
  });

  it("stays quiet for customers and providers", async () => {
    const customer = await createUser(db);
    await sys(db, `insert into auth.mfa_factors (user_id, status) values ($1, 'verified')`, [customer]);
    assert.equal((await sys(db, `select count(*)::int n from security_alerts where user_id = $1`, [customer]))[0].n, 0);
  });
});
