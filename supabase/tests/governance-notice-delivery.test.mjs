import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { backoffMinutes, buildRequest, classifyResponse, configuredChannels, renderNotice, senderConfig } from "../functions/_shared/governance-notice-delivery.ts";

// SECFIX-2 R2-H4: the pure logic of the governance notice sender. No provider credential exists in the repository; every
// value below is a test value shaped like the provider's format, and nothing is sent anywhere.
const env = (values) => (name) => values[name];
const TWILIO_SID = `AC${"0".repeat(32)}`;
const notice = (channel, destination, template = "payout_account_change_requested", payload = { bank_name: "Test Bank", iban_masked: "SA03 **** **** **** **** 7519" }) =>
  ({ id: "6f1c1a52-6b7e-4f0e-9a52-1f3f6b6f2b11", channel, destination, template_key: template, payload, attempts: 1 });

describe("senderConfig", () => {
  it("is inert while nothing is set: no channel is configured", () => {
    const config = senderConfig(env({}));
    assert.deepEqual(configuredChannels(config), []);
    assert.deepEqual(config.problems, []);
  });

  it("configures a channel only when every value is present and well formed, and names what is missing", () => {
    const partial = senderConfig(env({ GOVERNANCE_EMAIL_PROVIDER: "resend", GOVERNANCE_SMS_PROVIDER: "twilio", GOVERNANCE_SMS_ACCOUNT_SID: TWILIO_SID }));
    assert.deepEqual(configuredChannels(partial), []);
    assert.ok(partial.problems.some((p) => p.includes("GOVERNANCE_EMAIL_API_KEY")));
    assert.ok(partial.problems.some((p) => p.includes("GOVERNANCE_SMS_AUTH_TOKEN")));
    const other = senderConfig(env({ GOVERNANCE_EMAIL_PROVIDER: "carrier-pigeon" }));
    assert.deepEqual(configuredChannels(other), []);
    assert.match(other.problems[0], /not supported/);
    const full = senderConfig(env({
      GOVERNANCE_EMAIL_PROVIDER: "resend", GOVERNANCE_EMAIL_API_KEY: "test-key", GOVERNANCE_EMAIL_FROM: "PRIMORA <security@example.test>",
      GOVERNANCE_SMS_PROVIDER: "twilio", GOVERNANCE_SMS_ACCOUNT_SID: TWILIO_SID, GOVERNANCE_SMS_AUTH_TOKEN: "test-token", GOVERNANCE_SMS_FROM: "+15005550006",
    }));
    assert.deepEqual(configuredChannels(full), ["email", "sms"]);
    assert.ok(!JSON.stringify(full.problems).includes("test-key"), "problems never echo a secret");
  });
});

describe("renderNotice", () => {
  it("writes Arabic and English, with the masked IBAN only", () => {
    const m = renderNotice("payout_account_change_requested", { bank_name: "Test Bank", iban_masked: "SA03 **** 7519", iban: "SA0380000000608010167519" });
    assert.match(m.text, /طُلب تغيير حساب التحويل/);
    assert.match(m.text, /payout bank account/);
    assert.ok(m.text.includes("SA03 **** 7519"));
    assert.ok(!m.text.includes("SA0380000000608010167519"), "an unexpected full IBAN in the payload is never printed");
  });

  it("has a text for every template the database queues", () => {
    const sql = readFileSync(new URL("../migrations/20261010420000_govfix_h3_verified_contacts_m6_factor_alerts.sql", import.meta.url), "utf8");
    assert.ok(sql.includes("queue_governance_notice"));
    for (const key of ["payout_account_change_requested", "payout_account_change_approved", "payout_account_change_rejected", "break_glass_used",
      "health_break_glass_used", "console_role_change_requested", "console_role_changed", "mfa_factor_added", "mfa_locked", "mfa_reset",
      "reconciliation_break_escalated"]) {
      const m = renderNotice(key, {});
      assert.ok(!m.subject.includes("a security event"), `${key} has its own subject`);
      assert.ok(m.text.length > 20);
    }
    assert.match(renderNotice("something_new", {}).subject, /security event/);
  });
});

describe("buildRequest", () => {
  const config = senderConfig(env({
    GOVERNANCE_EMAIL_PROVIDER: "resend", GOVERNANCE_EMAIL_API_KEY: "test-key", GOVERNANCE_EMAIL_FROM: "security@example.test",
    GOVERNANCE_SMS_PROVIDER: "twilio", GOVERNANCE_SMS_ACCOUNT_SID: TWILIO_SID, GOVERNANCE_SMS_AUTH_TOKEN: "test-token", GOVERNANCE_SMS_FROM: "+15005550006",
  }));

  it("sends an email through Resend with an idempotency key per notice", () => {
    const n = notice("email", "owner@example.test");
    const r = buildRequest(n, config, renderNotice(n.template_key, n.payload));
    assert.equal(r.url, "https://api.resend.com/emails");
    assert.equal(r.init.headers.Authorization, "Bearer test-key");
    assert.equal(r.init.headers["Idempotency-Key"], `governance-notice-${n.id}`);
    assert.deepEqual(JSON.parse(r.init.body).to, ["owner@example.test"]);
  });

  it("sends an SMS through Twilio's Messages resource", () => {
    const n = notice("sms", "+966500000999");
    const r = buildRequest(n, config, renderNotice(n.template_key, n.payload));
    assert.equal(r.url, `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`);
    const form = new URLSearchParams(r.init.body);
    assert.equal(form.get("To"), "+966500000999");
    assert.equal(form.get("From"), "+15005550006");
    assert.equal(r.init.headers.Authorization, `Basic ${btoa(`${TWILIO_SID}:test-token`)}`);
  });

  it("refuses an unconfigured channel and a malformed destination", () => {
    const none = senderConfig(env({}));
    assert.throws(() => buildRequest(notice("email", "a@example.test"), none, { subject: "s", text: "t" }), /not configured/);
    assert.throws(() => buildRequest(notice("sms", "0500000999"), config, { subject: "s", text: "t" }), /E.164/);
    assert.throws(() => buildRequest(notice("email", "not-an-address"), config, { subject: "s", text: "t" }), /not an email/);
  });
});

describe("classifyResponse", () => {
  it("records sent only when the provider accepted the message and named it", () => {
    assert.deepEqual(classifyResponse("email", 200, { id: "re_123" }), { outcome: "sent", providerMessageId: "re_123" });
    assert.deepEqual(classifyResponse("sms", 201, { sid: "SM1", status: "queued" }), { outcome: "sent", providerMessageId: "SM1" });
    assert.equal(classifyResponse("email", 200, {}).outcome, "retry", "no id: delivery not confirmed");
    assert.equal(classifyResponse("sms", 201, { sid: "SM2", status: "failed" }).outcome, "retry");
  });

  it("retries outages and rate limits, and fails a refused destination for good", () => {
    for (const status of [429, 500, 502, 503]) assert.equal(classifyResponse("email", status, {}).outcome, "retry");
    assert.equal(classifyResponse("email", 401, {}).outcome, "retry");
    assert.equal(classifyResponse("email", 422, { message: "Invalid `to` field" }).outcome, "failed");
    assert.equal(classifyResponse("sms", 400, { message: "The 'To' number is not a valid phone number." }).outcome, "failed");
  });
});

describe("backoffMinutes", () => {
  it("matches the database: 2^attempts minutes, at most 6 hours", () => {
    assert.deepEqual([1, 2, 3, 8, 12].map(backoffMinutes), [2, 4, 8, 256, 360]);
    const sql = readFileSync(new URL("../migrations/20261011130000_secfix2_h4_governance_notice_delivery.sql", import.meta.url), "utf8");
    assert.ok(sql.includes("LEAST(make_interval(mins => (2 ^ v_row.attempts)::int), INTERVAL '6 hours')"));
    assert.ok(sql.includes("v_row.attempts < 8"));
  });
});
