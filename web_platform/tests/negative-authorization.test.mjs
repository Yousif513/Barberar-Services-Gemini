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

  describe("Phone Identity & Verification Boundaries (G09)", () => {
    it("handle_new_user does not fabricate random +9665 phone numbers", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261003200000_phone_identity_and_consents.sql"),
        "utf8"
      );
      assert.ok(
        !migrationCode.includes("'+9665' || floor(random()"),
        "Fabricated random phone fallback must be removed"
      );
      assert.ok(
        migrationCode.includes("ALTER TABLE public.profiles ALTER COLUMN phone_number DROP NOT NULL"),
        "profiles.phone_number must be nullable until verified"
      );
      assert.ok(
        migrationCode.includes("phone_verified BOOLEAN NOT NULL DEFAULT FALSE"),
        "profiles must have phone_verified defaulting to FALSE"
      );
    });

    it("manual phone number change un-verifies phone status", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261003200000_phone_identity_and_consents.sql"),
        "utf8"
      );
      assert.ok(
        migrationCode.includes("handle_profile_phone_update"),
        "Must have trigger to un-verify phone on manual change"
      );
      assert.ok(
        migrationCode.includes("NEW.phone_verified := FALSE"),
        "Must set phone_verified to FALSE when phone_number changes without service_role"
      );
    });
  });

  describe("Saudi PDPL Consents & Data Subject Requests Boundaries (G13)", () => {
    it("consents table enforces strict RLS and immutability", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261003200000_phone_identity_and_consents.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("ENABLE ROW LEVEL SECURITY"), "Consents must have RLS enabled");
      assert.ok(migrationCode.includes('CREATE POLICY "Users read own consents"'), "Users can only read own consents");
      assert.ok(migrationCode.includes('CREATE POLICY "Users insert own consents"'), "Users can only insert own consents");
      assert.ok(migrationCode.includes('CREATE POLICY "Admins read all consents"'), "Admins can read all consents");
      assert.ok(!migrationCode.includes('CREATE POLICY "Users update own consents"'), "Consents must be immutable (no user update)");
      assert.ok(!migrationCode.includes('CREATE POLICY "Users delete own consents"'), "Consents must be immutable (no user delete)");
    });

    it("data_subject_requests enforces 30-day statutory due date and admin queue authorization", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261003200000_phone_identity_and_consents.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("INTERVAL '30 days'"), "Must enforce 30-day statutory due date default");
      assert.ok(migrationCode.includes('CREATE POLICY "Users submit own DSR requests"'), "Users can submit own DSR");
      assert.ok(migrationCode.includes('CREATE POLICY "Admins update DSR requests"'), "Only admins can update DSR requests");
      assert.ok(migrationCode.includes('admin_data_subject_requests_view'), "Must provide admin view");
      assert.ok(migrationCode.includes('WITH (security_invoker = true)'), "Admin view must use security_invoker = true");
    });
  });

  describe("Booking Preservation Through Guest Authentication (G16)", () => {
    it("shop/[id] caches pending booking and restores selections on load", () => {
      const shopCode = readFileSync(
        join(webPlatformDir, "src/app/shop/[id]/page.tsx"),
        "utf8"
      );
      assert.ok(shopCode.includes('sessionStorage.setItem("primora_pending_booking"'), "Must cache pending booking in sessionStorage");
      assert.ok(shopCode.includes('sessionStorage.getItem("primora_pending_booking"'), "Must check sessionStorage on load");
      assert.ok(shopCode.includes("setShowAuthModal(true)"), "Must present inline auth modal to guest");
      assert.ok(!shopCode.includes('if (!user) {\n        router.push("/login");\n        return;'), "No bare redirect to /login that loses state");
    });

    it("login page respects returnUrl query parameter and supports phone OTP", () => {
      const loginCode = readFileSync(
        join(webPlatformDir, "src/app/login/page.tsx"),
        "utf8"
      );
      assert.ok(loginCode.includes('searchParams.get("returnUrl")'), "Must read returnUrl from searchParams");
      assert.ok(loginCode.includes('returnUrl.startsWith("/")') || loginCode.includes("returnUrl.startsWith('/')"), "Must validate returnUrl is relative path");
      assert.ok(loginCode.includes("signInWithOtp"), "Must support phone OTP sign-in");
      assert.ok(loginCode.includes("verifyOtp"), "Must support phone OTP verification");
    });
  });

  describe("Supply & Agreements Boundaries (P0-C: G01, G18, G03)", () => {
    it("approve_provider_application & reject_provider_application fail closed for non-admins", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261003210000_supply_and_agreements.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("IF NOT public.is_admin() THEN"), "Must check is_admin()");
      assert.ok(migrationCode.includes("ERRCODE = '42501'"), "Must raise error code 42501 (insufficient privilege)");
      assert.ok(migrationCode.includes("admin_audit_logs"), "Must log approval/rejection to admin_audit_logs");
      assert.ok(migrationCode.includes("REVOKE ALL ON FUNCTION public.approve_provider_application"), "Must revoke execution from public");
      assert.ok(migrationCode.includes("REVOKE ALL ON FUNCTION public.reject_provider_application"), "Must revoke execution from public");
    });

    it("provider_applications and legal_agreements enforce strict RLS and security_invoker views", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261003210000_supply_and_agreements.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("ENABLE ROW LEVEL SECURITY"), "Must enable RLS");
      assert.ok(migrationCode.includes("admin_provider_applications_view"), "Must define admin provider applications view");
      assert.ok(migrationCode.includes("WITH (security_invoker = true)"), "Admin view must use security_invoker = true");
      assert.ok(migrationCode.includes("status = 'published'"), "Public users can only read published agreements");
      assert.ok(migrationCode.includes("provider_agreement"), "Must seed provider agreement");
      assert.ok(migrationCode.includes("'draft'"), "Provider agreement must be seeded as draft until legal counsel confirms");
    });

    it("bookings table enforces valid sources and first-visit attribution trigger", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261003210000_supply_and_agreements.sql"),
        "utf8"
      );
      assert.ok(
        migrationCode.includes("CHECK (source IN ('marketplace', 'link', 'qr', 'whatsapp', 'instagram', 'walk_in', 'import'))"),
        "Must enforce source check constraint"
      );
      assert.ok(migrationCode.includes("handle_booking_first_visit_detection"), "Must detect first visit automatically");
    });

    it("provider-management.tsx fixes Defect #1 (no catch-and-succeed, honest rollback on error)", () => {
      const adminCode = readFileSync(
        join(webPlatformDir, "src/app/admin/providers/provider-management.tsx"),
        "utf8"
      );
      // Ensure no catch-and-succeed pattern exists
      assert.ok(!adminCode.includes("setProviders(providers.filter("), "Must not do fake local update in catch block");
      assert.ok(adminCode.includes("setError("), "Failed write must surface error message to operator");
      assert.ok(adminCode.includes("Applications Review Queue") || adminCode.includes("قائمة طلبات الانضمام"), "Must include application review queue");
      assert.ok(adminCode.includes("approve_provider_application"), "Must call atomic approve RPC");
      assert.ok(adminCode.includes("reject_provider_application"), "Must call atomic reject RPC");
    });

    it("provider dashboard renders guided setup checklist and public share kit with 0% commission", () => {
      const dashCode = readFileSync(
        join(webPlatformDir, "src/app/provider/dashboard/page.tsx"),
        "utf8"
      );
      assert.ok(dashCode.includes("setupTitle"), "Must render guided setup checklist");
      assert.ok(dashCode.includes("shareKitTitle"), "Must render share kit title");
      assert.ok(dashCode.includes("source=link"), "Must provide direct booking link with source=link");
      assert.ok(dashCode.includes("source=qr"), "Must provide QR code link with source=qr");
      assert.ok(dashCode.includes("source=whatsapp"), "Must support WhatsApp sharing");
      assert.ok(dashCode.includes("source=instagram"), "Must support Instagram bio sharing");
      assert.ok(dashCode.includes("0% Commission") || dashCode.includes("العمولة 0%"), "Must highlight 0% direct booking commission");
    });

    it("shop page passes booking source to create_booking RPC", () => {
      const shopCode = readFileSync(
        join(webPlatformDir, "src/app/shop/[id]/page.tsx"),
        "utf8"
      );
      assert.ok(shopCode.includes('request_source: bookingSource'), "Must pass request_source to create_booking RPC");
    });
  });

  describe("Booking Rules & Money (P0-D: G17, G10, G02, G14, G12)", () => {
    it("get_available_slots supports overnight shifts spanning into next day (21:00 - 02:00)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261003220000_booking_rules_and_money.sql"),
        "utf8"
      );
      assert.ok(
        migrationCode.includes("IF v_shift_end <= v_shift_start THEN"),
        "Must check if shift end is less than or equal to start time"
      );
      assert.ok(
        migrationCode.includes("((target_date + 1)::text || ' ' || v_shift_end::text || '+03')::timestamptz"),
        "Must shift end boundary by 1 day when overnight"
      );
      assert.ok(
        migrationCode.includes("v_prev_day_of_week"),
        "Must account for previous day overnight spillover into morning"
      );
    });

    it("cancel_booking and mark_booking_no_show enforce provider cancellation policies and log audit", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261003220000_booking_rules_and_money.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("free_cancellation_hours"), "Must check free cancellation hours");
      assert.ok(migrationCode.includes("late_cancellation_fee_percent"), "Must enforce late cancellation fee percent");
      assert.ok(migrationCode.includes("no_show_fee_percent"), "Must enforce no show fee percent");
      assert.ok(migrationCode.includes("cancellation_fee"), "Must record cancellation fee");
      assert.ok(migrationCode.includes("refund_amount"), "Must record refund amount");
      assert.ok(migrationCode.includes("mark_booking_no_show"), "Must provide mark_booking_no_show RPC");
      assert.ok(migrationCode.includes("admin_audit_logs"), "Must log cancellation and no-show to admin_audit_logs");
    });

    it("fee_rules table replaces hardcoded 15% commission with dynamic rules", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261003220000_booking_rules_and_money.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.fee_rules"), "Must create fee_rules table");
      assert.ok(migrationCode.includes("calculate_booking_platform_commission"), "Must provide commission calculation function");
      assert.ok(migrationCode.includes("('link', NULL, 0.00, 0.00, 0.00"), "Direct channels must have 0% platform fee");
      assert.ok(migrationCode.includes("('marketplace', TRUE, 20.00, 10.00, 40.00"), "Marketplace first visit has min and max limits");
      assert.ok(!migrationCode.includes("NEW.commission_percentage := 15.00;"), "Hardcoded 15.00 override must be removed");
    });

    it("admin_release_payout executes single server transaction with idempotency and audit logs", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261003220000_booking_rules_and_money.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("CREATE OR REPLACE FUNCTION public.admin_release_payout"), "Must create admin_release_payout RPC");
      assert.ok(migrationCode.includes("p_idempotency_key TEXT"), "Must require idempotency key");
      assert.ok(migrationCode.includes("FOR UPDATE"), "Must use row-level locking");
      assert.ok(migrationCode.includes("admin_audit_logs"), "Must log payout release to audit logs in same transaction");
      assert.ok(migrationCode.includes("CREATE OR REPLACE FUNCTION public.request_provider_payout"), "Must provide request_provider_payout RPC");
    });

    it("admin/ledger eliminates 3-step browser mutation (Defect #3)", () => {
      const ledgerCode = readFileSync(
        join(webPlatformDir, "src/app/admin/ledger/page.tsx"),
        "utf8"
      );
      assert.ok(!ledgerCode.includes('.update({ payout_status: "released" })'), "Must not update transactional_ledger directly from browser");
      assert.ok(ledgerCode.includes('supabase.rpc("admin_release_payout"'), "Must call atomic admin_release_payout RPC");
      assert.ok(ledgerCode.includes("idempotencyKey"), "Must generate idempotency key");
    });

    it("provider/wallet eliminates direct-insert fallback", () => {
      const walletCode = readFileSync(
        join(webPlatformDir, "src/app/provider/wallet/page.tsx"),
        "utf8"
      );
      assert.ok(!walletCode.includes("falling back to direct insert"), "Direct-insert fallback must be eliminated");
      assert.ok(walletCode.includes('supabase.rpc("request_provider_payout"'), "Must call request_provider_payout RPC");
    });

    it("payments_marketplace_split feature flag defaults to OFF", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261003220000_booking_rules_and_money.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("('payments_marketplace_split', FALSE"), "Feature flag must default to FALSE");
      const checkoutCode = readFileSync(
        join(rootDir, "supabase/functions/payment-checkout/index.ts"),
        "utf8"
      );
      assert.ok(checkoutCode.includes("payments_marketplace_split"), "Checkout must check marketplace split feature flag");
    });

    it("shop and confirmation pages disclose cancellation & no-show policies", () => {
      const shopCode = readFileSync(
        join(webPlatformDir, "src/app/shop/[id]/page.tsx"),
        "utf8"
      );
      assert.ok(shopCode.includes("Cancellation & No-Show Policy") || shopCode.includes("سياسة الإلغاء وعدم الحضور"), "Shop page must display cancellation policy");

      const confirmationCode = readFileSync(
        join(webPlatformDir, "src/app/customer/bookings/[id]/confirmation/page.tsx"),
        "utf8"
      );
      assert.ok(confirmationCode.includes("Cancellation & No-Show Terms") || confirmationCode.includes("سياسة الإلغاء وعدم الحضور"), "Confirmation page must display cancellation policy");
    });
  });

  describe("WhatsApp Messaging Pipeline (P0-E: G11)", () => {
    it("message_templates seeds bilingual AR/EN utility templates", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261003230000_whatsapp_messaging_pipeline.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.message_templates"), "Must create message_templates table");
      assert.ok(migrationCode.includes("'booking_confirmation', 'ar'"), "Must seed Arabic booking confirmation");
      assert.ok(migrationCode.includes("'booking_confirmation', 'en'"), "Must seed English booking confirmation");
      assert.ok(migrationCode.includes("'reminder_24h', 'ar'"), "Must seed Arabic 24h reminder");
      assert.ok(migrationCode.includes("'reminder_2h', 'ar'"), "Must seed Arabic 2h reminder");
      assert.ok(migrationCode.includes("'post_visit_review', 'ar'"), "Must seed Arabic post-visit review");
      assert.ok(migrationCode.includes("'owner_new_booking', 'ar'"), "Must seed Arabic owner alert");
    });

    it("message_queue and message_log enforce RLS and cost tracking", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261003230000_whatsapp_messaging_pipeline.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.message_queue"), "Must create message_queue table");
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.message_log"), "Must create message_log table");
      assert.ok(migrationCode.includes("cost_sar NUMERIC(10, 4) NOT NULL DEFAULT 0.1500"), "Must record SAR utility cost");
      assert.ok(migrationCode.includes("ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY"), "Must enable RLS on queue");
      assert.ok(migrationCode.includes("ALTER TABLE public.message_log ENABLE ROW LEVEL SECURITY"), "Must enable RLS on log");
    });

    it("booking lifecycle trigger enqueues confirmations and cancels on cancellation", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261003230000_whatsapp_messaging_pipeline.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("handle_booking_messaging_lifecycle"), "Must create lifecycle messaging function");
      assert.ok(migrationCode.includes("NEW.status = 'confirmed'"), "Must handle booking confirmation");
      assert.ok(migrationCode.includes("NEW.status = 'completed'"), "Must handle booking completion for review");
      assert.ok(migrationCode.includes("NEW.status IN ('cancelled', 'no_show')"), "Must cancel reminders on cancel or no-show");
      assert.ok(migrationCode.includes("trg_booking_messaging_lifecycle"), "Must bind trigger to bookings table");
    });

    it("dispatcher stored procedure enforces Saudi quiet hours, phone verification, and consent", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261003230000_whatsapp_messaging_pipeline.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("dispatch_message_queue_batch"), "Must create dispatch_message_queue_batch RPC");
      assert.ok(migrationCode.includes("Asia/Riyadh"), "Must evaluate Saudi AST timezone (UTC+3)");
      assert.ok(migrationCode.includes("v_current_hour_ast >= 22 OR v_current_hour_ast < 9"), "Must enforce 22:00-09:00 quiet hours");
      assert.ok(migrationCode.includes("deferred_quiet_hours"), "Must defer non-urgent messages during quiet hours");
      assert.ok(migrationCode.includes("phone_verified"), "Must check recipient phone verification status");
      assert.ok(migrationCode.includes("skipped_unverified"), "Must skip unverified phone numbers");
      assert.ok(migrationCode.includes("public.consents"), "Must check PDPL consent records");
      assert.ok(migrationCode.includes("skipped_no_consent"), "Must skip when consent is missing");
    });

    it("dispatch-messages edge function validates admin/service_role and CORS", () => {
      const fnCode = readFileSync(
        join(rootDir, "supabase/functions/dispatch-messages/index.ts"),
        "utf8"
      );
      assert.ok(fnCode.includes("Authorization"), "Must require Authorization header");
      assert.ok(fnCode.includes("profile.role !== \"admin\""), "Must require admin role when not service_role");
      assert.ok(fnCode.includes("dispatch_message_queue_batch"), "Must invoke database dispatcher RPC");
    });

    it("admin/notifications connects to live pipeline and offers queue dispatch", () => {
      const notifCode = readFileSync(
        join(webPlatformDir, "src/app/admin/notifications/page.tsx"),
        "utf8"
      );
      assert.ok(!notifCode.includes("INITIAL_HISTORY = ["), "Must not use hardcoded mock history");
      assert.ok(notifCode.includes('from("message_log")'), "Must query live message_log");
      assert.ok(notifCode.includes('from("message_queue")'), "Must query live message_queue");
      assert.ok(notifCode.includes('dispatch_message_queue_batch'), "Must allow manual queue dispatch");
      assert.ok(notifCode.includes("Quiet Hours") || notifCode.includes("ساعات الهدوء"), "Must display quiet hours metrics");
    });

    it("customer bookings page eliminates mock fallback and handles interactive attendance action", () => {
      const bookingsCode = readFileSync(
        join(webPlatformDir, "src/app/customer/bookings/page.tsx"),
        "utf8"
      );
      assert.ok(!bookingsCode.includes("bk-100"), "Must not fall back to mock bk-100 on error");
      assert.ok(bookingsCode.includes("customer_confirm_attendance"), "Must support customer_confirm_attendance RPC");
      assert.ok(bookingsCode.includes("confirm_attendance"), "Must check for confirm_attendance URL parameter");
    });
  });

  describe("P1-A · Platform Hygiene, Data Integrity & Security Tests (G31, G32, G40, G39)", () => {
    it("migration creates missing tables with strict RLS and constraints (G31)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004000000_platform_hygiene_data_integrity.sql"),
        "utf8"
      );
      // notifications table
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.notifications"), "Must create notifications table");
      assert.ok(migrationCode.includes("ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY"), "Must enable RLS on notifications");
      assert.ok(migrationCode.includes("user_id = auth.uid()"), "Must restrict notifications to recipient");

      // expo_push_tokens table
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.expo_push_tokens"), "Must create expo_push_tokens table");
      assert.ok(migrationCode.includes("ALTER TABLE public.expo_push_tokens ENABLE ROW LEVEL SECURITY"), "Must enable RLS on expo_push_tokens");
      assert.ok(migrationCode.includes("token VARCHAR(255) NOT NULL UNIQUE"), "Must have unique constraint on token");

      // provider_customer_notes table
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.provider_customer_notes"), "Must create provider_customer_notes table");
      assert.ok(migrationCode.includes("ALTER TABLE public.provider_customer_notes ENABLE ROW LEVEL SECURITY"), "Must enable RLS on provider_customer_notes");
      assert.ok(migrationCode.includes("UNIQUE (provider_id, customer_id)"), "Must have unique constraint on provider-customer note");

      // provider_promos table
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.provider_promos"), "Must create provider_promos table");
      assert.ok(migrationCode.includes("ALTER TABLE public.provider_promos ENABLE ROW LEVEL SECURITY"), "Must enable RLS on provider_promos");
    });

    it("send-push edge function eliminates wildcard CORS and uses allowlist (G40)", () => {
      const pushCode = readFileSync(
        join(rootDir, "supabase/functions/send-push/index.ts"),
        "utf8"
      );
      assert.ok(!pushCode.includes('"Access-Control-Allow-Origin": "*"'), "Forbidden: wildcard CORS in send-push");
      assert.ok(pushCode.includes("getCorsHeaders"), "Must use dynamic CORS allowlist helper");
      assert.ok(pushCode.includes("Authorization"), "Must verify caller authorization");
    });

    it("developer console hashes tokens with SHA-256 and removes simulated accounts (G40, G69)", () => {
      const devCode = readFileSync(
        join(webPlatformDir, "src/app/developer/page.tsx"),
        "utf8"
      );
      assert.ok(devCode.includes("hashToken"), "Must have SHA-256 hashToken function");
      assert.ok(devCode.includes("SHA-256"), "Must use SHA-256 algorithm");
      assert.ok(!devCode.includes("dev-mock-profile"), "Must remove mock developer profile");
      assert.ok(!devCode.includes("tk-mock-1"), "Must remove mock API tokens");
      assert.ok(!devCode.includes("wh-mock-1"), "Must remove mock webhooks");
      assert.ok(devCode.includes("is_approved: false"), "Must require admin audit/approval for tokens");
    });

    it("admin screens enforce SAR-only currency without dollar signs (G32)", () => {
      const adminDashboard = readFileSync(join(webPlatformDir, "src/app/admin/page.tsx"), "utf8");
      assert.ok(!adminDashboard.includes("tooltipItem.raw} $"), "No USD $ symbol in dashboard chart tooltip");

      const adminBookings = readFileSync(join(webPlatformDir, "src/app/admin/bookings/page.tsx"), "utf8");
      assert.ok(!adminBookings.includes(`text-[#D1AF47] text-[10px] font-black">\n            $`), "No USD $ symbol in KPI badge");
      assert.ok(adminBookings.includes(`{lang === "ar" ? "ر.س" : "SAR"}`), "Must render SAR currency");
    });

    it("CRM, promotions and notifications connect to real tables without mock fallbacks (G31, G32)", () => {
      const promoCode = readFileSync(join(webPlatformDir, "src/app/provider/promotions/page.tsx"), "utf8");
      assert.ok(!promoCode.includes('"promo-1"'), "Must not use mock promo-1");
      assert.ok(!promoCode.includes('"promo-2"'), "Must not use mock promo-2");
      assert.ok(promoCode.includes('from("provider_promos")'), "Must query real provider_promos");

      const custCode = readFileSync(join(webPlatformDir, "src/app/provider/customers/page.tsx"), "utf8");
      assert.ok(!custCode.includes('"cust-1"'), "Must not use mock cust-1");
      assert.ok(!custCode.includes('"cust-2"'), "Must not use mock cust-2");
      assert.ok(custCode.includes('from("provider_customer_notes")'), "Must query real provider_customer_notes");

      const notifCode = readFileSync(join(webPlatformDir, "src/app/customer/notifications/page.tsx"), "utf8");
      assert.ok(!notifCode.includes("Escrow funds released"), "Must not use fake escrow mock notification");
      assert.ok(notifCode.includes('from("notifications")'), "Must query real notifications table");
    });

    it("admin layout includes responsive mobile drawer and WCAG AA focus rings (G39)", () => {
      const layoutCode = readFileSync(join(webPlatformDir, "src/app/admin/layout.tsx"), "utf8");
      assert.ok(layoutCode.includes("mobileMenuOpen"), "Must have mobileMenuOpen state");
      assert.ok(layoutCode.includes("md:hidden"), "Must have mobile-specific responsive containers");
      assert.ok(layoutCode.includes("focus-visible:ring-[#D1AF47]"), "Must have WCAG AA focus rings");
    });
  });
});



