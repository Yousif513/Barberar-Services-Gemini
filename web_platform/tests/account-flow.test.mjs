import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { accountDestination, accountLoginPath, phoneOtpOptions, providerApplicationType, readSignupChoiceDraft, signupChoiceDraft } from "../src/lib/account-flow.mjs";

describe("account routing and confirmation continuation", () => {
  it("takes unapproved provider applicants directly to public onboarding", () => {
    assert.equal(accountDestination("customer", "provider", ""), "/become-provider");
    assert.equal(accountDestination("customer", "customer", "/provider/become"), "/become-provider");
    assert.equal(accountDestination("provider_owner", "provider", ""), "/provider/dashboard");
  });
  it("carries a booking's query and anchor and the portal through email confirmation", () => {
    const booking = "/customer/bookings/abc/confirmation?payment=returned#receipt";
    const confirmation = new URL(accountLoginPath(booking, "provider", true), "https://primora.test");
    assert.equal(confirmation.pathname, "/login");
    assert.equal(confirmation.searchParams.get("portal"), "provider");
    assert.equal(confirmation.searchParams.get("completeSignup"), "1");
    assert.equal(confirmation.searchParams.get("returnUrl"), booking);
    assert.equal(accountDestination("customer", "provider", confirmation.searchParams.get("returnUrl")), booking);
  });
  it("refuses foreign destinations, encoded authority bypasses and login loops", () => {
    for (const value of ["https://evil.test", "//evil.test", "/\\evil.test", "/%09/evil.test", "/login", "/login?returnUrl=/login"]) {
      assert.equal(accountLoginPath(value), "/login");
    }
    assert.equal(accountDestination("customer", "provider", "//evil.test"), "/become-provider");
  });
});

describe("phone account creation is explicit", () => {
  for (const [mode, allowed] of [["signin", false], ["signup", true]]) {
    it(`${mode} sends create_user=${allowed} to the Auth API`, async () => {
      const requests = [];
      const client = createClient("https://account-test.invalid", "public-test-key", {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: async (input, init) => {
          requests.push({ url: String(input), body: JSON.parse(init.body) });
          return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
        } },
      });
      const result = await client.auth.signInWithOtp({ phone: "+966500000000", options: phoneOtpOptions(mode) });
      assert.equal(result.error, null);
      assert.equal(requests.length, 1);
      assert.match(requests[0].url, /\/auth\/v1\/otp$/);
      assert.equal(requests[0].body.create_user, allowed);
      assert.equal(requests[0].body.channel, "sms");
    });
  }
});

describe("signup drafts preserve choices without claiming consent", () => {
  it("stores only optional choices, version and expiry", () => {
    const raw = signupChoiceDraft("terms-2", true, false, 1000);
    assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ["expiresAt", "marketing", "version", "whatsapp"]);
    assert.deepEqual(readSignupChoiceDraft(raw, "terms-2", 2000), { whatsapp: true, marketing: false });
    assert.equal(readSignupChoiceDraft(raw, "terms-3", 2000), null);
    assert.equal(readSignupChoiceDraft(raw, "terms-2", 1000 + 24 * 60 * 60 * 1000), null);
    assert.equal(readSignupChoiceDraft("broken", "terms-2", 2000), null);
  });
  it("rejects untyped choices and cannot restore an accepted-terms flag", () => {
    assert.equal(readSignupChoiceDraft(JSON.stringify({ version: "v1", whatsapp: "true", marketing: false, expiresAt: 5000 }), "v1", 2000), null);
    const result = readSignupChoiceDraft(JSON.stringify({ version: "v1", whatsapp: false, marketing: false, termsAccepted: true, token: "ignored", expiresAt: 5000 }), "v1", 2000);
    assert.deepEqual(result, { whatsapp: false, marketing: false });
  });
});

describe("provider application categories", () => {
  it("maps the visible business labels to the existing database categories", () => {
    for (const label of ["salon", "barbershop", "spa"]) assert.equal(providerApplicationType(label), "salon_barber_shop");
    assert.equal(providerApplicationType("freelancer"), "freelancer");
    assert.throws(() => providerApplicationType("unknown"));
  });
});
