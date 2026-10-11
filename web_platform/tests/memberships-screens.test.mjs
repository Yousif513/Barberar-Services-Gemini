import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// G65 memberships: source guards for the wiring that is easy to break silently. Behaviour (money, redemption, expiry) is
// executed against the migrated schema in supabase/tests/db/memberships.test.mjs.
const webRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");
const customer = read("src/app/customer/memberships/page.tsx");
const provider = read("src/app/provider/memberships/page.tsx");
const checkout = read("../supabase/functions/payment-checkout/index.ts");
const webhook = read("../supabase/functions/payment-webhook/index.ts");

describe("membership screens", () => {
  it("every command the screens call exists by name, and none of them is a direct table write", () => {
    for (const rpc of ["purchase_membership", "renew_membership", "cancel_membership"]) assert.ok(customer.includes(`rpc("${rpc}"`), rpc);
    for (const rpc of ["provider_create_membership_plan", "provider_update_membership_plan", "provider_set_membership_plan_active", "list_provider_memberships",
      "list_membership_redeemable_bookings", "redeem_membership_visit", "void_membership_redemption", "cancel_membership"]) assert.ok(provider.includes(`rpc("${rpc}"`), rpc);
    for (const source of [customer, provider]) assert.doesNotMatch(source, /supabase\s*\.from\([^)]*\)\s*\.(insert|update|upsert|delete)\(/, "memberships change only through database commands");
  });

  it("a purchase carries an idempotency key and hands off to the hosted payment page; the browser never sends an amount", () => {
    assert.match(customer, /p_idempotency_key/);
    assert.match(customer, /purchaseType: "membership"/);
    assert.doesNotMatch(customer, /amount\s*:/i);
    assert.doesNotMatch(customer, /card_number|cvv|cardNumber/i);
  });

  it("both languages, SAR formatter, no native dialogs, loading and error states", () => {
    for (const source of [customer, provider]) {
      assert.match(source, /ar: \{/);
      assert.match(source, /sar\(/);
      assert.doesNotMatch(source, /\b(window\.)?(confirm|alert|prompt)\(/);
      assert.match(source, /role="alert"/);
      assert.match(source, /loading/i);
    }
    assert.match(provider, /dir=\{dir\}/);
    assert.match(customer, /dir=\{dir\}/);
  });

  it("the Edge Functions read the amount from the database row and route the membership purchase type to its own confirmation", () => {
    assert.match(checkout, /case "membership"[\s\S]*from\("memberships"\)\.select\("id, amount_due, status"\)[\s\S]*eq\("customer_id", userId\)/);
    assert.match(checkout, /status === "pending_payment"/);
    assert.match(webhook, /purchaseType === "membership"[\s\S]*confirm_membership_payment/);
    assert.match(webhook, /p_payment_intent_id: chargeId/);
  });
});
