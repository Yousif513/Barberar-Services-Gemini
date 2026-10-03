import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const rootDir = resolve(process.cwd(), "..");
const webPlatformDir = process.cwd();

describe("Negative Authorization & Security Boundary Tests", () => {
  describe("Edge Functions Authorization Boundaries", () => {
    it("process-refund rejects missing Authorization header with 401 and non-admin with 403", async () => {
      const code = readFileSync(
        join(rootDir, "supabase/functions/process-refund/index.ts"),
        "utf8"
      );
      assert.ok(code.includes('req.headers.get("Authorization")'), "Must check Authorization header");
      assert.ok(code.includes('401'), "Must return 401 when unauthenticated");
      assert.ok(code.includes('profile?.role !== "admin"'), "Must require profiles.role === 'admin'");
      assert.ok(code.includes('403'), "Must return 403 when caller is not admin");
      assert.ok(!code.includes('"Access-Control-Allow-Origin": "*"'), "Forbidden: Access-Control-Allow-Origin: *");
    });

    it("process-payout enforces admin role gate and rejects wildcard CORS", async () => {
      const code = readFileSync(
        join(rootDir, "supabase/functions/process-payout/index.ts"),
        "utf8"
      );
      assert.ok(code.includes('req.headers.get("Authorization")'), "Must read Authorization header");
      assert.ok(code.includes('profile?.role !== "admin"'), "Must require admin role");
      assert.ok(code.includes('403'), "Must return 403 for non-admin");
      assert.ok(!code.includes('"Access-Control-Allow-Origin": "*"'), "Must not use wildcard CORS");
    });

    it("send-notification requires authenticated caller and restricts cross-user targeting", async () => {
      const code = readFileSync(
        join(rootDir, "supabase/functions/send-notification/index.ts"),
        "utf8"
      );
      assert.ok(code.includes('req.headers.get("Authorization")'), "Must require Authorization header");
      assert.ok(code.includes('user.id !== userId'), "Must check if caller targets another user");
      assert.ok(code.includes('profile?.role !== "admin"'), "Must require admin privileges to target other users");
      assert.ok(code.includes('403'), "Must return 403 when forbidden");
      assert.ok(!code.includes('from("notifications")'), "Must not query non-existent notifications table");
      assert.ok(!code.includes('"Access-Control-Allow-Origin": "*"'), "Must not use wildcard CORS");
    });

    it("expire-holds requires service_role or admin and rejects wildcard CORS", async () => {
      const code = readFileSync(
        join(rootDir, "supabase/functions/expire-holds/index.ts"),
        "utf8"
      );
      assert.ok(code.includes('req.headers.get("Authorization")'), "Must require Authorization header");
      assert.ok(code.includes('profile?.role !== "admin"'), "Must verify admin or service_role");
      assert.ok(code.includes('403'), "Must return 403 for unauthorized users");
      assert.ok(!code.includes('"Access-Control-Allow-Origin": "*"'), "Must not use wildcard CORS");
    });
  });

  describe("Database RLS & Stored Procedure Authorization Boundaries", () => {
    it("confirm_booking_payment strictly requires service_role", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261003190000_booking_hold_expiry.sql"),
        "utf8"
      );
      assert.ok(
        migrationCode.includes("IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN"),
        "confirm_booking_payment must fail closed without service_role"
      );
      assert.ok(
        migrationCode.includes("ERRCODE = '42501'"),
        "Must raise error code 42501 (insufficient privilege)"
      );
      assert.ok(
        migrationCode.includes("REVOKE ALL ON FUNCTION public.confirm_booking_payment"),
        "Must revoke execution from public"
      );
      assert.ok(
        migrationCode.includes("GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(UUID, TEXT, DECIMAL)\nTO service_role") ||
        migrationCode.includes("TO service_role;"),
        "Must grant execution only to service_role"
      );
    });

    it("expire_stale_booking_holds revokes public and anon execution", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261003190000_booking_hold_expiry.sql"),
        "utf8"
      );
      assert.ok(
        migrationCode.includes("REVOKE ALL ON FUNCTION public.expire_stale_booking_holds"),
        "Must revoke execution from public and anon"
      );
    });
  });

  describe("PCI-DSS Data Minimization & Privacy Rules", () => {
    it("shop/[id] does not collect or store raw card number, expiry, CVV, or cardholder", () => {
      const shopCode = readFileSync(
        join(webPlatformDir, "src/app/shop/[id]/page.tsx"),
        "utf8"
      );
      assert.ok(!shopCode.includes("cardNumber"), "Raw cardNumber state is forbidden");
      assert.ok(!shopCode.includes("cardCvv"), "Raw cardCvv state is forbidden");
      assert.ok(!shopCode.includes("cardExpiry"), "Raw cardExpiry state is forbidden");
      assert.ok(!shopCode.includes("isValidLuhn"), "Direct card validation in client is forbidden");
    });

    it("provider/pricing does not collect or store raw card number, expiry, CVV, or cardholder", () => {
      const pricingCode = readFileSync(
        join(webPlatformDir, "src/app/provider/pricing/page.tsx"),
        "utf8"
      );
      assert.ok(!pricingCode.includes('setCardNumber'), "Raw cardNumber state is forbidden");
      assert.ok(!pricingCode.includes('setCvv'), "Raw CVV state is forbidden");
      assert.ok(!pricingCode.includes('setExpiry'), "Raw expiry state is forbidden");
    });
  });

  describe("Financial & Ledger Integrity", () => {
    it("admin/ledger never falls back to mock demo records on empty or failed queries", () => {
      const ledgerCode = readFileSync(
        join(webPlatformDir, "src/app/admin/ledger/page.tsx"),
        "utf8"
      );
      assert.ok(!ledgerCode.includes("demo-p1"), "Forbidden mock provider demo-p1 found");
      assert.ok(!ledgerCode.includes("demo-p2"), "Forbidden mock provider demo-p2 found");
      assert.ok(!ledgerCode.includes("demo-e1"), "Forbidden mock employee demo-e1 found");
      assert.ok(!ledgerCode.includes("Omar Khaled"), "Forbidden mock name Omar Khaled found");
    });

    it("admin/payments has no grep-bait comments", () => {
      const paymentsCode = readFileSync(
        join(webPlatformDir, "src/app/admin/payments/page.tsx"),
        "utf8"
      );
      assert.ok(!paymentsCode.includes('Required admin-control markers'), "Grep-bait comments must be deleted");
      assert.ok(!paymentsCode.includes('refundDuplicate'), "Grep-bait comment refundDuplicate must be deleted");
    });
  });
});
