import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync as readRaw } from "node:fs";
const readFileSync = (path, enc) => readRaw(path, enc).replace(/\r\n/g, "\n");
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webPlatformDir = resolve(__dirname, "..");
const rootDir = resolve(webPlatformDir, "..");

describe("Negative Authorization & Security Boundary Tests", () => {
  describe("Edge Functions Authorization Boundaries", () => {
    it("process-refund rejects missing Authorization header with 401 and non-admin with 403", async () => {
      const code = readFileSync(
        join(rootDir, "supabase/functions/process-refund/index.ts"),
        "utf8"
      );
      assert.ok(code.includes("resolveCaller(req)"), "Must resolve the caller from the Authorization header");
      assert.ok(code.includes('401'), "Must return 401 when unauthenticated");
      assert.ok(code.includes('caller.kind === "user"'), "Must reject non-admin users");
      assert.ok(code.includes('403'), "Must return 403 when caller is not admin");
      assert.ok(code.includes("processRefundRequest("), "Must refund only recorded refund requests");
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

    it("calculate-travel needs a signed-in session before it spends the maps quota", async () => {
      const code = readFileSync(join(rootDir, "supabase/functions/calculate-travel/index.ts"), "utf8");
      assert.ok(code.includes('req.headers.get("Authorization")'), "Must read Authorization header");
      assert.ok(code.includes("auth.getUser(") && code.includes("401"), "Must reject a request with no real session");
      assert.ok(code.indexOf("auth.getUser(") < code.indexOf("GOOGLE_MAPS_API_KEY"), "Must check the caller before using the key");
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

    it("admin/payments is a server redirect to the ledger, not a stub page carrying marker comments", () => {
      assert.ok(!existsSync(join(webPlatformDir, "src/app/admin/payments/page.tsx")), "the stub page must not come back");
      const config = readFileSync(join(webPlatformDir, "next.config.ts"), "utf8");
      assert.ok(config.includes('source: "/admin/payments", destination: "/admin/ledger"'), "the old address must redirect to the ledger");
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
      assert.ok(fnCode.includes("resolveCaller(req)"), "Must resolve the caller from the Authorization header");
      assert.ok(fnCode.includes('caller.kind === "user"'), "Must reject non-admin users");
      assert.ok(fnCode.includes("claim_message_batch"), "Must claim messages through the database");
      assert.ok(fnCode.includes("graph.facebook.com"), "Must send through the WhatsApp Cloud API");
      assert.ok(!fnCode.includes("wamid_"), "Must never fabricate WhatsApp message ids");
    });

    it("admin/notifications connects to live pipeline and offers queue dispatch", () => {
      const notifCode = readFileSync(
        join(webPlatformDir, "src/app/admin/notifications/page.tsx"),
        "utf8"
      );
      assert.ok(!notifCode.includes("INITIAL_HISTORY = ["), "Must not use hardcoded mock history");
      // GOV-2 (Q4): the log and the queue are read through audited / aggregate server functions.
      assert.ok(notifCode.includes('rpc("admin_list_message_log"'), "Must query the live message log through the audited function");
      assert.ok(notifCode.includes('rpc("admin_message_queue_summary"'), "Must query live message_queue sizes");
      assert.ok(notifCode.includes('functions.invoke("dispatch-messages"'), "Must allow manual queue dispatch through the Edge Function");
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
      assert.ok(pushCode.includes('corsHeaders as sharedCorsHeaders } from "../_shared/http.ts"'), "Must use the shared exact-origin CORS allowlist");
      assert.ok(!/endsWith\(["']\.vercel\.app["']\)|endsWith\(["']primora\.sa["']\)/.test(pushCode), "Forbidden: suffix origin matching in send-push");
      assert.ok(pushCode.includes("Authorization"), "Must verify caller authorization");
    });

    it("developer console no longer creates or hashes tokens in the browser (G40, G69)", () => {
      // The placeholder page generated a token with crypto.getRandomValues, hashed it in the browser and inserted it into
      // api_tokens from a React handler. G69 replaced it: keys are created and hashed by the database (create_api_key),
      // and the old address only redirects. web_platform/tests/developer-console.test.mjs checks the new screens.
      const old = readFileSync(join(webPlatformDir, "src/app/developer/page.tsx"), "utf8");
      assert.ok(old.includes('redirect("/provider/developer")'), "The old address must only redirect to the console");
      for (const gone of ["hashToken", "crypto.subtle", "getRandomValues", "api_tokens", "pk_live_", "is_approved", "dev-mock-profile", "tk-mock-1", "wh-mock-1"]) {
        assert.ok(!old.includes(gone), `The old developer page must not contain ${gone}`);
      }
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
      assert.ok(promoCode.includes('rpc("list_provider_promo_codes"'), "Must read the codes checkout redeems (promotional_codes) through the owner command");

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

  describe("P1-B · Scheduling Depth Boundaries (G22, G23, G20, G21)", () => {
    it("migration creates time off, closures, seasonal schedules and service variants (G22, G23)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004010000_scheduling_depth.sql"),
        "utf8"
      );

      // Closures
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.provider_closures"), "Must create provider_closures table");
      assert.ok(migrationCode.includes("valid_closure_dates"), "Must validate closure date range");
      assert.ok(migrationCode.includes("ALTER TABLE public.provider_closures ENABLE ROW LEVEL SECURITY"), "Must enable RLS on provider_closures");

      // Employee time off
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.employee_time_off"), "Must create employee_time_off table");
      assert.ok(migrationCode.includes("valid_time_off_dates"), "Must validate time off date range");
      assert.ok(migrationCode.includes("ALTER TABLE public.employee_time_off ENABLE ROW LEVEL SECURITY"), "Must enable RLS on employee_time_off");

      // Seasonal schedules
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.seasonal_schedules"), "Must create seasonal_schedules table");
      assert.ok(migrationCode.includes("season_name"), "Must store season_name");
      assert.ok(migrationCode.includes("ALTER TABLE public.seasonal_schedules ENABLE ROW LEVEL SECURITY"), "Must enable RLS on seasonal_schedules");

      // Buffer columns & variants
      assert.ok(migrationCode.includes("buffer_before_minutes"), "Must add buffer_before_minutes to services");
      assert.ok(migrationCode.includes("buffer_after_minutes"), "Must add buffer_after_minutes to services");
      assert.ok(migrationCode.includes("processing_time_minutes"), "Must add processing_time_minutes to services");
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.service_variants"), "Must create service_variants table");
    });

    it("get_available_slots checks time off, closures, and seasonal schedules (G22, G23)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004010000_scheduling_depth.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("public.employee_time_off"), "Must check employee_time_off");
      assert.ok(migrationCode.includes("public.provider_closures"), "Must check provider_closures");
      assert.ok(migrationCode.includes("public.seasonal_schedules"), "Must check seasonal_schedules");
      assert.ok(migrationCode.includes("v_is_seasonal := TRUE;"), "Must override shifts during seasonal dates");
    });

    it("get_branch_available_slots aggregates slots for 'Any Available Professional' (G20)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004010000_scheduling_depth.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("FUNCTION public.get_branch_available_slots"), "Must define get_branch_available_slots RPC");
      assert.ok(migrationCode.includes("available_employee_count"), "Must return count of available employees per slot");
      assert.ok(migrationCode.includes("candidate_employee_ids"), "Must return candidate employees array");
      assert.ok(migrationCode.includes("REVOKE ALL ON FUNCTION public.get_branch_available_slots"), "Must revoke public execution");
      assert.ok(migrationCode.includes("GRANT EXECUTE ON FUNCTION public.get_branch_available_slots"), "Must grant authenticated execution");
    });

    it("create_booking auto-assigns professional when target_employee_id IS NULL (G20)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004010000_scheduling_depth.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("IF v_resolved_employee_id IS NULL THEN"), "Must handle null employee_id for auto-assignment");
      assert.ok(migrationCode.includes("ORDER BY current_bookings ASC"), "Must assign employee with lowest current load");
    });

    it("reschedule_booking executes atomic reschedule respecting policy and re-enqueuing reminders (G21)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004010000_scheduling_depth.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("FUNCTION public.reschedule_booking"), "Must create reschedule_booking RPC");
      assert.ok(migrationCode.includes("FOR UPDATE"), "Must lock booking row during reschedule");
      assert.ok(migrationCode.includes("Cannot reschedule a booking with status"), "Must enforce state machine checks");
      assert.ok(migrationCode.includes("The selected employee is not available"), "Must verify new slot availability");
      assert.ok(migrationCode.includes("booking.reschedule"), "Must log reschedule action in admin_audit_log");
      assert.ok(migrationCode.includes("UPDATE public.message_queue"), "Must cancel old message reminders");
      assert.ok(migrationCode.includes("booking_reminder_24h"), "Must re-enqueue 24h reminder");
      assert.ok(migrationCode.includes("booking_reminder_2h"), "Must re-enqueue 2h reminder");
    });

    it("shop page integrates 'Any Available Professional' selection (G20)", () => {
      const shopCode = readFileSync(
        join(webPlatformDir, "src/app/shop/[id]/page.tsx"),
        "utf8"
      );
      assert.ok(shopCode.includes('id: "any"'), "Must provide 'any' specialist selection option");
      assert.ok(shopCode.includes("get_branch_available_slots"), "Must call get_branch_available_slots when 'any' is selected");
      assert.ok(shopCode.includes('selectedSpecialist.id === "any" ? null : selectedSpecialist.id'), "Must pass null target_employee_id for auto-assignment");
    });

    it("customer bookings page integrates interactive atomic reschedule (G21)", () => {
      const bookingsCode = readFileSync(
        join(webPlatformDir, "src/app/customer/bookings/page.tsx"),
        "utf8"
      );
      assert.ok(bookingsCode.includes("reschedule_booking"), "Must call reschedule_booking RPC");
      assert.ok(bookingsCode.includes("rescheduleBookingTarget"), "Must manage reschedule state");
      assert.ok(bookingsCode.includes("rescheduleTitle"), "Must render reschedule modal");
      assert.ok(bookingsCode.includes("confirmReschedule"), "Must have confirm reschedule action");
    });
  });

  describe("P1-C: People & Trust (G24, G26, G30, G42)", () => {
    it("provider_memberships establishes staff identity and RLS policies (G24)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004020000_people_and_trust.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.provider_memberships"), "Must create provider_memberships");
      assert.ok(migrationCode.includes("idx_memberships_user"), "Must index user_id");
      assert.ok(migrationCode.includes("idx_memberships_provider"), "Must index provider_id");
      assert.ok(migrationCode.includes("idx_memberships_branch"), "Must index branch_id");
      assert.ok(migrationCode.includes("ENABLE ROW LEVEL SECURITY"), "Must enable RLS on provider_memberships");
      assert.ok(migrationCode.includes("Members can view own memberships"), "Must define view policy");
      assert.ok(migrationCode.includes("Provider owners and admins manage memberships"), "Must define manage policy");
    });

    it("employee_update_booking_status validates statuses, checks auth, and audits (G24)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004020000_people_and_trust.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("FUNCTION public.employee_update_booking_status"), "Must define employee_update_booking_status RPC");
      assert.ok(migrationCode.includes("in_service"), "Must support in_service status");
      assert.ok(migrationCode.includes("no_show"), "Must support no_show status");
      assert.ok(migrationCode.includes("Forbidden: not authorized to update this booking"), "Must verify caller is assigned staff or owner");
      assert.ok(migrationCode.includes("booking.employee_status_update"), "Must log audit event");
      assert.ok(migrationCode.includes("REVOKE ALL ON FUNCTION public.employee_update_booking_status"), "Must revoke public execution");
      assert.ok(migrationCode.includes("GRANT EXECUTE ON FUNCTION public.employee_update_booking_status"), "Must grant authenticated execution");
    });

    it("reply_to_review enforces owner authorization and rejects empty replies (G30)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004020000_people_and_trust.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("FUNCTION public.reply_to_review"), "Must define reply_to_review RPC");
      assert.ok(migrationCode.includes("Reply text cannot be empty"), "Must validate non-empty reply");
      assert.ok(migrationCode.includes("Forbidden: only the provider owner can reply"), "Must enforce owner auth");
      assert.ok(migrationCode.includes("reply_comment"), "Must update reply_comment");
      assert.ok(migrationCode.includes("reply_created_at"), "Must record reply timestamp");
    });

    it("moderate_review authorizes admins, validates status, and logs audit events (G30)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004020000_people_and_trust.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("FUNCTION public.moderate_review"), "Must define moderate_review RPC");
      assert.ok(migrationCode.includes("Forbidden: only administrators can moderate reviews"), "Must restrict to admin role");
      assert.ok(migrationCode.includes("Invalid moderation status"), "Must validate moderation status enum");
      assert.ok(migrationCode.includes("review.moderate"), "Must log moderation audit");
    });

    it("employee_portfolios enforces PDPL client photo consent and employee profile fields (G42)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004020000_people_and_trust.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.employee_portfolios"), "Must create employee_portfolios");
      assert.ok(migrationCode.includes("customer_consent_confirmed"), "Must require customer consent flag");
      assert.ok(migrationCode.includes("years_of_experience"), "Must add years_of_experience to employees");
      assert.ok(migrationCode.includes("specialties"), "Must add specialties to employees");
      assert.ok(migrationCode.includes("instagram_handle"), "Must add instagram_handle to employees");
      assert.ok(migrationCode.includes("Public can view consented portfolio photos"), "Must enforce consent RLS on public view");
    });

    it("UI integrations: admin reviews, provider reviews, bookings, and shop page (G24, G26, G30, G42)", () => {
      const adminReviewsCode = readFileSync(
        join(webPlatformDir, "src/app/admin/reviews/page.tsx"),
        "utf8"
      );
      assert.ok(adminReviewsCode.includes("moderate_review"), "Admin reviews must call moderate_review RPC");
      assert.ok(!adminReviewsCode.includes("Bandar Al-Otaibi"), "Admin reviews must not have mock review fallbacks");

      const providerReviewsCode = readFileSync(
        join(webPlatformDir, "src/app/provider/reviews/page.tsx"),
        "utf8"
      );
      assert.ok(providerReviewsCode.includes("reply_to_review"), "Provider reviews must use reply_to_review RPC");
      assert.ok(!providerReviewsCode.includes("Marcus Vance"), "Provider reviews must not contain fake mock reviews");

      const providerBookingsCode = readFileSync(
        join(webPlatformDir, "src/app/provider/bookings/page.tsx"),
        "utf8"
      );
      assert.ok(providerBookingsCode.includes("employee_update_booking_status"), "Bookings must call employee_update_booking_status RPC");
      assert.ok(providerBookingsCode.includes("in_service"), "Bookings must support in_service status");
      assert.ok(providerBookingsCode.includes("no_show"), "Bookings must support no_show status");

      const shopCode = readFileSync(
        join(webPlatformDir, "src/app/shop/[id]/page.tsx"),
        "utf8"
      );
      assert.ok(shopCode.includes("shop.crVerified &&"), "Shop page shows the Wathq badge only for verified CRs");
      assert.ok(shopCode.includes("experienceYears"), "Shop page specialist card must render experience");
    });
  });

  describe("P1-D: Money Depth & Compliance (G33, G34, G38, G25)", () => {
    it("payment_disputes and open_booking_dispute enforce customer-only authorization (G33)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004030000_money_depth_and_compliance.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.payment_disputes"), "Must create payment_disputes table");
      assert.ok(migrationCode.includes("FUNCTION public.open_booking_dispute"), "Must create open_booking_dispute RPC");
      assert.ok(migrationCode.includes("v_booking.client_id != v_user_id"), "Must reject non-booking client");
      assert.ok(migrationCode.includes("ERRCODE = '42501'"), "Must raise 42501 on unauthorized open");
      assert.ok(migrationCode.includes("REVOKE ALL ON FUNCTION public.open_booking_dispute"), "Must revoke public execution");
      assert.ok(migrationCode.includes("dispute.opened"), "Must audit dispute.opened in admin_audit_log");
    });

    it("resolve_booking_dispute strictly requires admin and handles atomic refund and audit log (G33)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004030000_money_depth_and_compliance.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("FUNCTION public.resolve_booking_dispute"), "Must create resolve_booking_dispute RPC");
      assert.ok(migrationCode.includes("role = 'admin'"), "Must require admin role");
      assert.ok(migrationCode.includes("payout_status = 'refunded'"), "Must update transactional_ledger payout_status on refund");
      assert.ok(migrationCode.includes("status = 'cancelled'"), "Must cancel booking on refund");
      assert.ok(migrationCode.includes("dispute.resolved"), "Must audit dispute.resolved");
      assert.ok(migrationCode.includes("REVOKE ALL ON FUNCTION public.resolve_booking_dispute"), "Must revoke public execution");
    });

    it("psp_reconciliation_runs and run_daily_psp_reconciliation gate on admin and match ledger (G33)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004030000_money_depth_and_compliance.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.psp_reconciliation_runs"), "Must create psp_reconciliation_runs");
      assert.ok(migrationCode.includes("FUNCTION public.run_daily_psp_reconciliation"), "Must create run_daily_psp_reconciliation RPC");
      assert.ok(migrationCode.includes("FROM public.transactional_ledger"), "Must aggregate from transactional_ledger");
      assert.ok(migrationCode.includes("REVOKE ALL ON FUNCTION public.run_daily_psp_reconciliation"), "Must revoke public execution");
    });

    it("provider_fee_invoices and generate_provider_monthly_fee_invoice calculate commission and net receivable (G34)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004030000_money_depth_and_compliance.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.provider_fee_invoices"), "Must create provider_fee_invoices");
      assert.ok(migrationCode.includes("FUNCTION public.generate_provider_monthly_fee_invoice"), "Must create fee invoice generator RPC");
      assert.ok(migrationCode.includes("0.15"), "Must calculate 15% platform commission and VAT");
      assert.ok(migrationCode.includes("FEE-"), "Must format invoice number with FEE prefix");
      assert.ok(migrationCode.includes("REVOKE ALL ON FUNCTION public.generate_provider_monthly_fee_invoice"), "Must revoke public execution");
    });

    it("subscription_plans seed and subscribe_provider_plan enforce provider owner gate (G38)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004030000_money_depth_and_compliance.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.subscription_plans"), "Must create subscription_plans");
      assert.ok(migrationCode.includes("'starter'"), "Must seed starter plan");
      assert.ok(migrationCode.includes("'growth'"), "Must seed growth plan");
      assert.ok(migrationCode.includes("'elite'"), "Must seed elite plan");
      assert.ok(migrationCode.includes("FUNCTION public.subscribe_provider_plan"), "Must create subscribe_provider_plan RPC");
      assert.ok(migrationCode.includes("provider.subscribed_plan"), "Must audit provider.subscribed_plan");
      assert.ok(migrationCode.includes("REVOKE ALL ON FUNCTION public.subscribe_provider_plan"), "Must revoke public execution");
    });

    it("invoices table and generate_zatca_tax_invoice enforce ZATCA UUIDv4, hash chain, and TLV encoding (G25)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004030000_money_depth_and_compliance.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("CREATE SEQUENCE IF NOT EXISTS public.zatca_invoice_seq"), "Must create zatca sequence");
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.invoices"), "Must create invoices table");
      assert.ok(migrationCode.includes("zatca_qr_code"), "Must store zatca_qr_code");
      assert.ok(migrationCode.includes("previous_invoice_hash"), "Must chain previous_invoice_hash");
      assert.ok(migrationCode.includes("FUNCTION public.zatca_tlv_tag"), "Must create zatca_tlv_tag helper");
      assert.ok(migrationCode.includes("FUNCTION public.generate_zatca_tax_invoice"), "Must create generate_zatca_tax_invoice RPC");
      assert.ok(migrationCode.includes("300000000000003"), "Must enforce Saudi 15-digit Tax ID standard");
      assert.ok(migrationCode.includes("REVOKE ALL ON FUNCTION public.generate_zatca_tax_invoice"), "Must revoke public execution");
    });

    it("UI integrations: disputes, ledger reconciliation, pricing, and customer invoices (G33, G34, G38, G25)", () => {
      const adminDisputesCode = readFileSync(
        join(webPlatformDir, "src/app/admin/disputes/page.tsx"),
        "utf8"
      );
      assert.ok(adminDisputesCode.includes("payment_disputes"), "Admin disputes must query payment_disputes table");
      assert.ok(adminDisputesCode.includes("resolve_booking_dispute"), "Admin disputes must call resolve_booking_dispute RPC");
      assert.ok(!adminDisputesCode.includes("d-mock-1"), "Admin disputes must have no fake mock disputes");

      const adminLedgerCode = readFileSync(
        join(webPlatformDir, "src/app/admin/ledger/page.tsx"),
        "utf8"
      );
      assert.ok(adminLedgerCode.includes("run_daily_psp_reconciliation"), "Admin ledger must connect to run_daily_psp_reconciliation RPC");
      assert.ok(adminLedgerCode.includes('rpc("admin_list_fee_invoices"'), "Admin ledger must read provider fee invoices through the audited function");
      assert.ok(!adminLedgerCode.includes('"text-[#D1AF47] font-serif text-xs font-black">\n                  $'), "Ledger widget must not use dollar signs");

      const pricingCode = readFileSync(
        join(webPlatformDir, "src/app/provider/pricing/page.tsx"),
        "utf8"
      );
      assert.ok(pricingCode.includes("subscribe_provider_plan"), "Pricing page must call subscribe_provider_plan RPC");
      assert.ok(pricingCode.includes("provider_subscriptions"), "Pricing page must fetch current subscription");

      const customerBookingsCode = readFileSync(
        join(webPlatformDir, "src/app/customer/bookings/page.tsx"),
        "utf8"
      );
      assert.ok(customerBookingsCode.includes("generate_zatca_tax_invoice"), "Customer bookings must call generate_zatca_tax_invoice RPC");
      assert.ok(customerBookingsCode.includes("open_booking_dispute"), "Customer bookings must call open_booking_dispute RPC");
    });

    it("search_marketplace_providers and normalize_arabic enforce Arabic normalization and Haversine distance (G29)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004040000_growth_surfaces.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("FUNCTION public.normalize_arabic"), "Must create normalize_arabic helper function");
      assert.ok(migrationCode.includes("FUNCTION public.search_marketplace_providers"), "Must create search_marketplace_providers RPC");
      assert.ok(migrationCode.includes("6371 * acos"), "Must calculate Haversine distance in kilometers");
      assert.ok(migrationCode.includes("public.normalize_arabic(p.business_name_ar)"), "Must normalize Arabic business names for matching");
      assert.ok(migrationCode.includes("REVOKE ALL ON FUNCTION public.search_marketplace_providers"), "Must revoke public execution");
      assert.ok(migrationCode.includes("GRANT EXECUTE ON FUNCTION public.search_marketplace_providers"), "Must grant execution to authenticated");
    });

    it("import_provider_clients strictly enforces Saudi PDPL consent validation and provider ownership (G35)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004040000_growth_surfaces.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.provider_client_imports"), "Must create provider_client_imports table");
      assert.ok(migrationCode.includes("FUNCTION public.import_provider_clients"), "Must create import_provider_clients RPC");
      assert.ok(migrationCode.includes("IF NOT p_consent_confirmed THEN"), "Must strictly check PDPL consent");
      assert.ok(migrationCode.includes("PDPL Consent Required"), "Must error on missing PDPL consent");
      assert.ok(migrationCode.includes("Forbidden: not authorized to import clients"), "Must restrict to provider owner or admin");
      assert.ok(migrationCode.includes("provider.clients_imported"), "Must emit audit event");
      assert.ok(migrationCode.includes("REVOKE ALL ON FUNCTION public.import_provider_clients"), "Must revoke public execution");
    });

    it("get_provider_monthly_value_summary calculates G43 value metrics and commission savings (G43)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004040000_growth_surfaces.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.provider_value_summaries"), "Must create provider_value_summaries table");
      assert.ok(migrationCode.includes("FUNCTION public.get_provider_monthly_value_summary"), "Must create get_provider_monthly_value_summary RPC");
      assert.ok(migrationCode.includes("new_clients_acquired"), "Must track new clients acquired");
      assert.ok(migrationCode.includes("direct_commission_saved_sar"), "Must calculate direct channel commission savings");
      assert.ok(migrationCode.includes("ROUND(v_direct_gmv * 0.15, 2)"), "Must calculate 15% commission saved on direct GMV");
      assert.ok(migrationCode.includes("Forbidden: not authorized to view value summary"), "Must restrict access to provider owner or admin");
      assert.ok(migrationCode.includes("REVOKE ALL ON FUNCTION public.get_provider_monthly_value_summary"), "Must revoke public execution");
    });

    it("get_booking_address_secure masks client home service address until booking is confirmed (G37)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004040000_growth_surfaces.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("FUNCTION public.get_booking_address_secure"), "Must create get_booking_address_secure RPC");
      assert.ok(migrationCode.includes("is_home_service"), "Must add is_home_service column");
      assert.ok(migrationCode.includes("home_address_text"), "Must add home_address_text column");
      assert.ok(migrationCode.includes("Address hidden until booking confirmation"), "Must mask address before confirmation");
      assert.ok(migrationCode.includes("booking.address_revealed"), "Must audit address reveal event");
      assert.ok(migrationCode.includes("REVOKE ALL ON FUNCTION public.get_booking_address_secure"), "Must revoke public execution");
    });

    it("sitemap.ts and robots.ts provide discovery and SEO routes (G28)", () => {
      const sitemapCode = readFileSync(
        join(webPlatformDir, "src/app/sitemap.ts"),
        "utf8"
      );
      assert.ok(sitemapCode.includes("MetadataRoute.Sitemap"), "Must export Next.js Sitemap type");
      assert.ok(sitemapCode.includes("/categories/"), "Must include marketplace categories");
      assert.ok(sitemapCode.includes("`${baseUrl}/shop/${provider.id}`"), "Must list every verified shop page");
      assert.ok(sitemapCode.includes('.eq("is_verified", true)'), "Only verified providers are indexed");
      assert.ok(!sitemapCode.includes("?lang="), "No language URL variants the app does not serve");
      assert.ok(!sitemapCode.includes("district="), "No district URLs the discover page does not read");

      const robotsCode = readFileSync(
        join(webPlatformDir, "src/app/robots.ts"),
        "utf8"
      );
      assert.ok(robotsCode.includes("MetadataRoute.Robots"), "Must export Next.js Robots type");
      assert.ok(robotsCode.includes("sitemap.xml"), "Must point to sitemap");
      assert.ok(robotsCode.includes('"/admin/*"'), "Must disallow admin area in robots.txt");
    });

    it("growth surfaces UI integration: customer search, provider client CSV import, and provider dashboard value card (G29, G35, G43)", () => {
      const customerSearchCode = readFileSync(
        join(webPlatformDir, "src/app/customer/search/page.tsx"),
        "utf8"
      );
      assert.ok(customerSearchCode.includes("search_marketplace_providers"), "Customer search must call search_marketplace_providers RPC");
      assert.ok(!customerSearchCode.includes("MOCK_BRANCHES"), "Customer search must not use mock branches");
      assert.ok(customerSearchCode.includes("fetchProviders"), "Customer search must fetch live providers from DB");

      const providerCustomersCode = readFileSync(
        join(webPlatformDir, "src/app/provider/customers/page.tsx"),
        "utf8"
      );
      assert.ok(providerCustomersCode.includes("import_provider_clients"), "Provider customers must call import_provider_clients RPC");
      assert.ok(providerCustomersCode.includes("showImportModal"), "Provider customers must include import modal state");
      assert.ok(providerCustomersCode.includes("consentCheckbox"), "Provider customers must require PDPL consent confirmation");

      const providerDashboardCode = readFileSync(
        join(webPlatformDir, "src/app/provider/dashboard/page.tsx"),
        "utf8"
      );
      assert.ok(providerDashboardCode.includes("get_provider_monthly_value_summary"), "Provider dashboard must call get_provider_monthly_value_summary RPC");
      assert.ok(providerDashboardCode.includes("valueSummaryTitle"), "Provider dashboard must render G43 value summary card");
      assert.ok(providerDashboardCode.includes("commissionSaved"), "Provider dashboard must display commission saved metric");
    });
  });

  describe("P2-A: Booking Depth & Capacity (G44, G51, G53, G58, G57)", () => {
    it("waitlists table enforces statuses, time constraints, and RLS policies (G44)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004050000_booking_depth_and_capacity.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.waitlists"), "Must create waitlists table");
      assert.ok(migrationCode.includes("CHECK (status IN ('active', 'notified', 'claimed', 'expired', 'cancelled'))"), "Must validate waitlist status check");
      assert.ok(migrationCode.includes("preferred_time_end > preferred_time_start"), "Must validate time window constraint");
      assert.ok(migrationCode.includes("idx_waitlists_lookup"), "Must index branch_id, preferred_date, status");
      assert.ok(migrationCode.includes("idx_waitlists_customer"), "Must index customer_id, status");
      assert.ok(migrationCode.includes("ALTER TABLE public.waitlists ENABLE ROW LEVEL SECURITY"), "Must enable RLS on waitlists");
      assert.ok(migrationCode.includes("Customers view own waitlist entries"), "Must define view policy");
      assert.ok(migrationCode.includes("Customers insert own waitlist requests"), "Must define insert policy");
    });

    it("join_waitlist RPC validates auth, prevents duplicate entries, and returns queue position (G44)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004050000_booking_depth_and_capacity.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("FUNCTION public.join_waitlist"), "Must create join_waitlist RPC");
      assert.ok(migrationCode.includes("Authentication required to join waitlist"), "Must enforce authentication");
      assert.ok(migrationCode.includes("Waitlist date must be today or in the future"), "Must enforce non-past date");
      assert.ok(migrationCode.includes("End time must be after start time"), "Must enforce valid time range");
      assert.ok(migrationCode.includes("Already on active waitlist for this service and date"), "Must prevent duplicate active entries");
      assert.ok(migrationCode.includes("position"), "Must calculate position in waitlist queue");
      assert.ok(migrationCode.includes("REVOKE ALL ON FUNCTION public.join_waitlist"), "Must revoke public execution");
      assert.ok(migrationCode.includes("GRANT EXECUTE ON FUNCTION public.join_waitlist"), "Must grant authenticated execution");
    });

    it("claim_waitlist_slot and cancellation backfill trigger enforce 15-minute claim window (G44)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004050000_booking_depth_and_capacity.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("FUNCTION public.claim_waitlist_slot"), "Must create claim_waitlist_slot RPC");
      assert.ok(migrationCode.includes("Waitlist slot is not in notified state"), "Must check notified state before claiming");
      assert.ok(migrationCode.includes("Claim window has expired"), "Must check expiration before claiming");
      assert.ok(migrationCode.includes("FUNCTION public.backfill_waitlist_on_cancellation"), "Must create backfill trigger function");
      assert.ok(migrationCode.includes("trigger_backfill_waitlist_on_booking_cancellation"), "Must create cancellation trigger on bookings");
      assert.ok(migrationCode.includes("interval '15 minutes'"), "Must set 15-minute exclusive claim window");
      assert.ok(migrationCode.includes("waitlist_slot_opened"), "Must queue notification template on cancellation");
    });

    it("booking_services table and create_multi_service_booking RPC support sequential cart booking (G51)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004050000_booking_depth_and_capacity.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.booking_services"), "Must create booking_services table");
      assert.ok(migrationCode.includes("idx_booking_services_booking"), "Must index booking_services by booking and sequence");
      assert.ok(migrationCode.includes("ALTER TABLE public.booking_services ENABLE ROW LEVEL SECURITY"), "Must enable RLS on booking_services");
      assert.ok(migrationCode.includes("FUNCTION public.create_multi_service_booking"), "Must create create_multi_service_booking RPC");
      assert.ok(migrationCode.includes("services_payload must be a non-empty array"), "Must validate non-empty services array");
      assert.ok(migrationCode.includes("v_total_duration"), "Must calculate combined duration across services");
      assert.ok(migrationCode.includes("v_total_price"), "Must calculate combined price across services");
      assert.ok(migrationCode.includes("Selected time cannot accommodate the full combined duration"), "Must validate slot capacity for combined duration");
    });

    it("create_walk_in_booking RPC enforces 0% platform fee and creates walk-in profile (G53)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004050000_booking_depth_and_capacity.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("FUNCTION public.create_walk_in_booking"), "Must create create_walk_in_booking RPC");
      assert.ok(migrationCode.includes("Forbidden: not authorized to create walk-in"), "Must authorize caller against provider staff/owner");
      assert.ok(migrationCode.includes("0.00"), "Must enforce 0% platform fee for walk-in booking");
      assert.ok(migrationCode.includes("in_service"), "Must initialize walk-in status to in_service");
      assert.ok(migrationCode.includes("provider.walk_in_created"), "Must log walk-in audit event");
    });

    it("get_branch_schedule_with_prayer_pauses RPC returns prayer buffer windows and slots (G58)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004050000_booking_depth_and_capacity.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("FUNCTION public.get_branch_schedule_with_prayer_pauses"), "Must create get_branch_schedule_with_prayer_pauses RPC");
      assert.ok(migrationCode.includes("prayer_windows"), "Must return prayer windows array");
      assert.ok(migrationCode.includes("Asr"), "Must include Asr prayer pause");
      assert.ok(migrationCode.includes("Maghrib"), "Must include Maghrib prayer pause");
      assert.ok(migrationCode.includes("Isha"), "Must include Isha prayer pause");
    });

    it("provider_customer_blocks table, toggle_customer_block, and check_customer_booking_eligibility enforce blocklist and strikes (G57)", () => {
      const migrationCode = readFileSync(
        join(rootDir, "supabase/migrations/20261004050000_booking_depth_and_capacity.sql"),
        "utf8"
      );
      assert.ok(migrationCode.includes("CREATE TABLE IF NOT EXISTS public.provider_customer_blocks"), "Must create provider_customer_blocks table");
      assert.ok(migrationCode.includes("UNIQUE (provider_id, customer_id)"), "Must enforce unique provider/customer block");
      assert.ok(migrationCode.includes("FUNCTION public.check_customer_booking_eligibility"), "Must create check_customer_booking_eligibility RPC");
      assert.ok(migrationCode.includes("no_show_at >= (NOW() - interval '60 days')"), "Must evaluate past 60 days no-show strikes");
      assert.ok(migrationCode.includes("v_no_show_strikes >= 3"), "Must trigger mandatory full prepayment when no-shows >= 3");
      assert.ok(migrationCode.includes("FUNCTION public.toggle_customer_block"), "Must create toggle_customer_block RPC");
      assert.ok(migrationCode.includes("provider.customer_blocked"), "Must audit customer blocked event");
      assert.ok(migrationCode.includes("provider.customer_unblocked"), "Must audit customer unblocked event");
    });

    it("UI integrations: Shop page multi-service cart, waitlist modal, prayer pause indicators, and provider calendar walk-in (G44, G51, G53, G57, G58)", () => {
      const shopCode = readFileSync(
        join(webPlatformDir, "src/app/shop/[id]/page.tsx"),
        "utf8"
      );
      assert.ok(shopCode.includes("selectedServices"), "Shop page must manage selectedServices array");
      assert.ok(shopCode.includes("handleToggleService"), "Shop page must provide handleToggleService cart toggle");
      assert.ok(shopCode.includes("create_multi_service_booking"), "Shop page must call create_multi_service_booking when multiple services selected");
      assert.ok(shopCode.includes("showWaitlistModal"), "Shop page must provide waitlist modal state");
      assert.ok(shopCode.includes("join_waitlist"), "Shop page must call join_waitlist RPC");
      assert.ok(shopCode.includes("check_customer_booking_eligibility"), "Shop page must check customer booking eligibility");
      assert.ok(shopCode.includes("prayerPauseNotice"), "Shop page must display prayer pause notice");

      const providerCalendarCode = readFileSync(
        join(webPlatformDir, "src/app/provider/calendar/page.tsx"),
        "utf8"
      );
      assert.ok(providerCalendarCode.includes("create_walk_in_booking"), "Provider calendar must call create_walk_in_booking RPC");

      const providerCustomersCode = readFileSync(
        join(webPlatformDir, "src/app/provider/customers/page.tsx"),
        "utf8"
      );
      assert.ok(providerCustomersCode.includes("toggle_customer_block"), "Provider customers must call toggle_customer_block RPC");
      assert.ok(providerCustomersCode.includes("blockedCustomerIds"), "Provider customers must manage blocked customer state");
    });
  });

  describe("Commercials & Monetization Boundaries (P2-B: G45, G46, G47, G48, G49, G50)", () => {
    const p2bMigration = readFileSync(
      join(rootDir, "supabase/migrations/20261004060000_commercials_and_monetization.sql"),
      "utf8"
    );

    it("package_redemptions table and redeem_package_session RPC enforce ownership, validity, and audit trail (G45)", () => {
      assert.ok(p2bMigration.includes("CREATE TABLE IF NOT EXISTS public.package_redemptions"), "Must create package_redemptions table");
      assert.ok(p2bMigration.includes("ALTER TABLE public.package_redemptions ENABLE ROW LEVEL SECURITY"), "Must enable RLS on package_redemptions");
      assert.ok(p2bMigration.includes("FUNCTION public.purchase_service_package"), "Must define purchase_service_package RPC");
      assert.ok(p2bMigration.includes("FUNCTION public.redeem_package_session"), "Must define redeem_package_session RPC");
      assert.ok(p2bMigration.includes("Not authorized to redeem sessions from this package"), "Must check authorization (customer, provider owner, admin)");
      assert.ok(p2bMigration.includes("No remaining sessions in this package"), "Must validate session balance > 0");
      assert.ok(p2bMigration.includes("This package has expired"), "Must validate package expiry date");
      assert.ok(p2bMigration.includes("customer.package_session_redeemed"), "Must emit admin audit log on session redemption");
    });

    it("promotional_codes funding rules and apply_coupon_to_booking RPC enforce authorization and discount cap (G46)", () => {
      assert.ok(p2bMigration.includes("funding_source TEXT NOT NULL DEFAULT 'platform'"), "Must support funding_source on promotional_codes");
      assert.ok(p2bMigration.includes("min_order_amount DECIMAL"), "Must support min_order_amount on promotional_codes");
      assert.ok(p2bMigration.includes("max_discount_cap DECIMAL"), "Must support max_discount_cap on promotional_codes");
      assert.ok(p2bMigration.includes("CREATE TABLE IF NOT EXISTS public.coupon_redemptions"), "Must create coupon_redemptions table");
      assert.ok(p2bMigration.includes("FUNCTION public.validate_and_apply_coupon"), "Must define validate_and_apply_coupon RPC");
      assert.ok(p2bMigration.includes("FUNCTION public.apply_coupon_to_booking"), "Must define apply_coupon_to_booking RPC");
      assert.ok(p2bMigration.includes("Not authorized to apply coupon to this booking"), "Must enforce caller ownership or admin privilege");
      assert.ok(p2bMigration.includes("Cannot apply coupon to an already paid booking"), "Must forbid coupon application on paid bookings");
      assert.ok(p2bMigration.includes("booking.coupon_redeemed"), "Must log coupon redemption to admin_audit_logs");
    });

    it("booking_tips table and add_booking_tip RPC enforce 100% to professional and 0% platform fee (G47)", () => {
      assert.ok(p2bMigration.includes("CREATE TABLE IF NOT EXISTS public.booking_tips"), "Must create booking_tips table");
      assert.ok(p2bMigration.includes("amount DECIMAL(10,2) NOT NULL CHECK (amount >= 5.00)"), "Must enforce minimum 5.00 SAR tip");
      assert.ok(p2bMigration.includes("ALTER TABLE public.booking_tips ENABLE ROW LEVEL SECURITY"), "Must enable RLS on booking_tips");
      assert.ok(p2bMigration.includes("FUNCTION public.add_booking_tip"), "Must define add_booking_tip RPC");
      assert.ok(p2bMigration.includes("Only the booking customer can send a tip"), "Must restrict tipping to the booking customer");
      const moneyFix = readFileSync(join(rootDir, "supabase/migrations/20261005010000_review_fix_money.sql"), "utf8");
      assert.ok(moneyFix.includes("'tip', p_payment_intent_id, p_amount, 0, p_amount, p_amount, 'pending'"), "Tip reaches the ledger only after a confirmed payment, 0% platform share");
      assert.ok(moneyFix.includes("A tip was already sent for this visit"), "One tip per visit");
    });

    it("gift_cards & gift_card_redemptions enforce minimum 50 SAR, 365-day expiry, and balance tracking (G48)", () => {
      assert.ok(p2bMigration.includes("CREATE TABLE IF NOT EXISTS public.gift_cards"), "Must create gift_cards table");
      assert.ok(p2bMigration.includes("CREATE TABLE IF NOT EXISTS public.gift_card_redemptions"), "Must create gift_card_redemptions table");
      assert.ok(p2bMigration.includes("ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY"), "Must enable RLS on gift_cards");
      assert.ok(p2bMigration.includes("FUNCTION public.purchase_gift_card"), "Must define purchase_gift_card RPC");
      assert.ok(p2bMigration.includes("Minimum gift card amount is 50.00 SAR"), "Must enforce 50.00 SAR minimum gift card");
      assert.ok(p2bMigration.includes("INTERVAL '365 days'"), "Must set 365-day expiration default");
      assert.ok(p2bMigration.includes("FUNCTION public.redeem_gift_card"), "Must define redeem_gift_card RPC");
      assert.ok(p2bMigration.includes("Invalid or already fully redeemed gift card"), "Must validate remaining gift card balance");
      assert.ok(p2bMigration.includes("gift_card.redeemed"), "Must audit gift_card.redeemed event");
    });

    it("customer_referrals, wallet_credits, and automated trigger reward 25 SAR on first booking completion (G49)", () => {
      assert.ok(p2bMigration.includes("CREATE TABLE IF NOT EXISTS public.customer_referrals"), "Must create customer_referrals table");
      assert.ok(p2bMigration.includes("CREATE TABLE IF NOT EXISTS public.wallet_credits"), "Must create wallet_credits table");
      assert.ok(p2bMigration.includes("ALTER TABLE public.customer_referrals ENABLE ROW LEVEL SECURITY"), "Must enable RLS on customer_referrals");
      assert.ok(p2bMigration.includes("ALTER TABLE public.wallet_credits ENABLE ROW LEVEL SECURITY"), "Must enable RLS on wallet_credits");
      assert.ok(p2bMigration.includes("FUNCTION public.get_or_create_referral_code"), "Must define get_or_create_referral_code RPC");
      assert.ok(p2bMigration.includes("FUNCTION public.apply_referral_code"), "Must define apply_referral_code RPC");
      assert.ok(p2bMigration.includes("You cannot refer yourself"), "Must forbid self-referrals");
      assert.ok(p2bMigration.includes("reward_amount DECIMAL(10,2) NOT NULL DEFAULT 25.00"), "Must set 25.00 SAR referral bonus default");
    });

    it("customer_loyalty, loyalty_points_ledger, and tier multipliers enforce repeat visit point accrual (G50)", () => {
      assert.ok(p2bMigration.includes("CREATE TABLE IF NOT EXISTS public.customer_loyalty"), "Must create customer_loyalty table");
      assert.ok(p2bMigration.includes("CREATE TABLE IF NOT EXISTS public.loyalty_points_ledger"), "Must create loyalty_points_ledger table");
      assert.ok(p2bMigration.includes("tier IN ('bronze', 'silver', 'gold', 'platinum')"), "Must enforce loyalty tier domain");
      assert.ok(p2bMigration.includes("FUNCTION public.redeem_loyalty_points"), "Must define redeem_loyalty_points RPC");
      assert.ok(p2bMigration.includes("Minimum points redemption threshold is 100 points"), "Must require at least 100 points to redeem");
      assert.ok(p2bMigration.includes("loyalty.points_redeemed"), "Must audit loyalty point redemption");
      assert.ok(p2bMigration.includes("trigger_on_booking_completed_rewards"), "Must define unified booking completion rewards trigger");
      assert.ok(p2bMigration.includes("IF NEW.status = 'completed'"), "Trigger must evaluate booking status completed");
    });

    it("Frontend integration: customer packages, provider packages, coupons, tips, shop checkout, and wallet (P2-B)", () => {
      const customerPkgsCode = readFileSync(
        join(webPlatformDir, "src/app/customer/packages/page.tsx"),
        "utf8"
      );
      assert.ok(customerPkgsCode.includes("purchase_service_package"), "Customer packages must wire purchase_service_package RPC");

      const providerPkgsCode = readFileSync(
        join(webPlatformDir, "src/app/provider/packages/page.tsx"),
        "utf8"
      );
      assert.ok(providerPkgsCode.includes("redeem_package_session"), "Provider packages must wire redeem_package_session RPC");
      assert.ok(!providerPkgsCode.includes("catch (err) {\n        // Offline / mock fallback for demo:\n        const pkg"), "Provider packages must not have catch-and-succeed mock override");

      const adminCouponsCode = readFileSync(
        join(webPlatformDir, "src/app/admin/coupons/page.tsx"),
        "utf8"
      );
      assert.ok(adminCouponsCode.includes("funding_source"), "Admin coupons must configure funding_source");

      const customerBookingsCode = readFileSync(
        join(webPlatformDir, "src/app/customer/bookings/page.tsx"),
        "utf8"
      );
      assert.ok(customerBookingsCode.includes("add_booking_tip"), "Customer bookings must wire add_booking_tip RPC");
      assert.ok(customerBookingsCode.includes('purchaseType: "tip"'), "Tips are paid through checkout before they count");
      assert.ok(customerBookingsCode.includes("The full tip is paid to the provider for the specialist who served you"), "Customer bookings must say the tip is paid to the provider with no platform commission (the ledger credits the provider, not the specialist)");
      assert.ok(!customerBookingsCode.includes("goes directly to your specialist"), "Customer bookings must not claim tips go directly to the specialist");

      const shopCode = readFileSync(
        join(webPlatformDir, "src/app/shop/[id]/page.tsx"),
        "utf8"
      );
      assert.ok(shopCode.includes("request_coupon_code: appliedCoupon?.code"), "Shop page passes the promo code to create_booking");
      assert.ok(shopCode.includes("request_gift_card_code: appliedGiftCard?.code"), "Shop page passes the gift card to create_booking");
      assert.ok(shopCode.includes("request_loyalty_points: redeemLoyalty"), "Shop page passes loyalty points to create_booking");
      assert.ok(!shopCode.includes("apply_coupon_to_booking"), "No discount is applied after the booking is priced");

      const walletCode = readFileSync(
        join(webPlatformDir, "src/app/customer/wallet/page.tsx"),
        "utf8"
      );
      assert.ok(walletCode.includes("wallet_credits"), "Wallet page must query wallet_credits table");
      assert.ok(walletCode.includes("get_or_create_referral_code"), "Wallet page must call get_or_create_referral_code RPC");
      assert.ok(walletCode.includes("purchase_gift_card"), "Wallet page must call purchase_gift_card RPC");
    });
  });

  describe("Milestone P2-C: Multi-Branch, Operations & Analytics (G54, G55, G56, G59, G62, G64)", () => {
    const p2cMigrationPath = join(rootDir, "supabase/migrations/20261004070000_operations_analytics_and_discovery.sql");
    const p2cMigration = readFileSync(p2cMigrationPath, "utf8");

    it("customer_favorites and toggle_customer_favorite enforce authentication and owner scope (G64)", () => {
      assert.ok(p2cMigration.includes("CREATE TABLE IF NOT EXISTS public.customer_favorites"), "Must create customer_favorites table");
      assert.ok(p2cMigration.includes("UNIQUE (customer_id, provider_id)"), "Must enforce unique customer and provider favorite pair");
      assert.ok(p2cMigration.includes("ALTER TABLE public.customer_favorites ENABLE ROW LEVEL SECURITY"), "Must enable RLS on customer_favorites");
      assert.ok(p2cMigration.includes("CREATE POLICY \"Users view own favorites\""), "Must restrict favorites SELECT to owner");
      assert.ok(p2cMigration.includes("customer_id = auth.uid()"), "Policy must check auth.uid()");
      assert.ok(p2cMigration.includes("FUNCTION public.toggle_customer_favorite"), "Must define toggle_customer_favorite RPC");
      assert.ok(p2cMigration.includes("Authentication required to favorite salons"), "RPC must reject unauthenticated requests");
      assert.ok(p2cMigration.includes("GRANT EXECUTE ON FUNCTION public.toggle_customer_favorite TO authenticated"), "Must grant authenticated execution");
    });

    it("employee_commission_rules and calculate_staff_payroll enforce WPS/Mudad payroll and provider authorization (G55)", () => {
      assert.ok(p2cMigration.includes("CREATE TABLE IF NOT EXISTS public.employee_commission_rules"), "Must create employee_commission_rules table");
      assert.ok(p2cMigration.includes("base_salary_sar DECIMAL(10,2)"), "Must support base salary in SAR");
      assert.ok(p2cMigration.includes("commission_rate DECIMAL(5,2)"), "Must support commission rate percentage");
      assert.ok(p2cMigration.includes("wps_iban TEXT"), "Must record WPS IBAN");
      assert.ok(p2cMigration.includes("ALTER TABLE public.employee_commission_rules ENABLE ROW LEVEL SECURITY"), "Must enable RLS on commission rules");
      assert.ok(p2cMigration.includes("FUNCTION public.calculate_staff_payroll"), "Must define calculate_staff_payroll RPC");
      assert.ok(p2cMigration.includes("Forbidden: not authorized to calculate payroll for this provider"), "Must forbid unauthorized payroll access");
      assert.ok(p2cMigration.includes("tips_earned_sar"), "Must calculate tips separately (100% to staff)");
      assert.ok(p2cMigration.includes("commission_earned_sar"), "Must calculate commission earned");
      assert.ok(p2cMigration.includes("total_payout_sar"), "Must calculate total net payout");
    });

    it("get_provider_multi_branch_summary calculates chain rollups with owner authorization (G56)", () => {
      assert.ok(p2cMigration.includes("FUNCTION public.get_provider_multi_branch_summary"), "Must define get_provider_multi_branch_summary RPC");
      assert.ok(p2cMigration.includes("Forbidden: not authorized"), "Must check owner or admin authorization");
      assert.ok(p2cMigration.includes("chain_total_revenue_sar"), "Must aggregate chain total revenue");
      assert.ok(p2cMigration.includes("chain_total_bookings"), "Must aggregate chain total bookings");
      assert.ok(p2cMigration.includes("no_show_rate_pct"), "Must calculate no-show rate percentage per branch");
      assert.ok(p2cMigration.includes("active_staff"), "Must count active staff per branch");
    });

    it("get_provider_detailed_analytics returns real live KPIs and eliminates mock fallbacks (G54)", () => {
      assert.ok(p2cMigration.includes("FUNCTION public.get_provider_detailed_analytics"), "Must define get_provider_detailed_analytics RPC");
      assert.ok(p2cMigration.includes("Forbidden: not authorized to view reports for this provider"), "Must forbid unauthorized analytics access");
      assert.ok(p2cMigration.includes("gross_revenue_sar"), "Must return real gross revenue");
      assert.ok(p2cMigration.includes("platform_fees_sar"), "Must return platform escrow fees");
      assert.ok(p2cMigration.includes("net_earnings_sar"), "Must return net provider earnings");
      assert.ok(p2cMigration.includes("completion_rate_pct"), "Must return completion rate");
      assert.ok(p2cMigration.includes("repeat_rate_pct"), "Must return client repeat retention rate");
      assert.ok(p2cMigration.includes("sources_distribution"), "Must calculate acquisition source distribution");
      assert.ok(p2cMigration.includes("staff_performance"), "Must calculate specialist revenue performance");
      assert.ok(p2cMigration.includes("popular_services"), "Must return top popular services");
    });

    it("Frontend integration: provider reports, customer favorites, interactive discovery, and BNPL checkout (P2-C)", () => {
      const reportsCode = readFileSync(
        join(webPlatformDir, "src/app/provider/reports/page.tsx"),
        "utf8"
      );
      assert.ok(reportsCode.includes("get_provider_detailed_analytics"), "Provider reports must call get_provider_detailed_analytics RPC");
      assert.ok(reportsCode.includes("get_provider_multi_branch_summary"), "Provider reports must call get_provider_multi_branch_summary RPC");
      assert.ok(reportsCode.includes("calculate_staff_payroll"), "Provider reports must wire WPS calculate_staff_payroll RPC");
      assert.ok(!reportsCode.includes("throw new Error(\"No database records\")"), "Provider reports must eliminate mock fallback defect");

      const favoritesCode = readFileSync(
        join(webPlatformDir, "src/app/customer/favorites/page.tsx"),
        "utf8"
      );
      assert.ok(favoritesCode.includes("customer_favorites"), "Favorites page must query customer_favorites table");
      assert.ok(favoritesCode.includes("toggle_customer_favorite"), "Favorites page must wire toggle_customer_favorite RPC");

      const discoverCode = readFileSync(
        join(webPlatformDir, "src/app/discover/page.tsx"),
        "utf8"
      );
      assert.ok(discoverCode.includes("search_marketplace_providers"), "Discover page must call search_marketplace_providers RPC");
      assert.ok(discoverCode.includes("projectPin"), "Discover page must project map pins");
      assert.ok(discoverCode.includes("districtOptions"), "Discover page must offer district filters taken from the branches the search returns");

      const shopCode = readFileSync(
        join(webPlatformDir, "src/app/shop/[id]/page.tsx"),
        "utf8"
      );
      assert.ok(shopCode.includes("toggle_customer_favorite"), "Shop page must wire toggle_customer_favorite RPC");
      assert.ok(!/tabby|tamara|bnpl/i.test(shopCode), "No instalment option is shown until a BNPL provider is integrated");
    });
  });
});





