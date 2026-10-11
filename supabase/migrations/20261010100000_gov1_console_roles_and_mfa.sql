-- GOV-1 part 1: console roles, permissions, AAL2 sessions, MFA step-up, MFA lockout and MFA reset.
--
-- Plan of record: docs/legal/2026-10-10-adopted-decisions.md, decisions D-Q5 and Q6 (final decision texts in
-- docs/legal/2026-10-10-money-governance-decision-memo.md and docs/legal/2026-10-10-privacy-decision-memo.md).
--
--   * Every administrator holds exactly one console role: owner, finance, operations or analyst (admin_role_assignments).
--     profiles.role = 'admin' still marks an administrator account, so every existing check keeps its meaning.
--     Administrators that exist when this migration runs become owners (they held every right before).
--     An account that becomes an administrator any other way starts as analyst (read-only, least privilege).
--   * public.is_admin() now means "any console role, in an AAL2 (MFA) session, not locked". It stays the read check.
--   * public.admin_can(permission) is the write check. operations and analyst hold no money permission; analyst holds none.
--   * public.require_recent_mfa() is the step-up check: a TOTP (or other MFA) verification in the last 5 minutes, read from
--     the amr claim of the session's JWT. It raises with HINT 'step_up_required' so the console can ask for a fresh code.
--   * public.require_recent_login() is the provider re-authentication check (HINT 'reauth_required').
--   * The MFA verification hook locks an account after 10 consecutive failed codes and raises a security alert.
--   * public.admin_reset_mfa() removes another administrator's factors: owner only, never yourself, reason and step-up.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Console roles and their permissions
-- ---------------------------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_role_permissions (
  admin_role TEXT NOT NULL CHECK (admin_role IN ('owner', 'finance', 'operations', 'analyst')),
  permission TEXT NOT NULL,
  description_en TEXT NOT NULL,
  description_ar TEXT NOT NULL,
  PRIMARY KEY (admin_role, permission)
);

-- The matrix is the D-Q5 text: owner everything; finance money and IBAN; operations providers, bookings, customers and
-- reviews with no money; analyst read-only (no row here, reads need only is_admin()).
INSERT INTO public.admin_role_permissions (admin_role, permission, description_en, description_ar) VALUES
  ('owner', 'operations.write', 'Change providers, bookings, customers, reviews and catalogue', 'تعديل المزودين والحجوزات والعملاء والتقييمات والكتالوج'),
  ('owner', 'money.payout', 'Request and approve provider payouts', 'طلب تحويلات المزودين واعتمادها'),
  ('owner', 'money.refund', 'Request and approve refunds', 'طلب المبالغ المستردة واعتمادها'),
  ('owner', 'money.ledger', 'Ledger, reconciliation, invoices and fee settlement', 'دفتر الحسابات والتسوية والفواتير وتسوية الرسوم'),
  ('owner', 'money.config', 'Fee rules, promotion codes and governance thresholds', 'قواعد الرسوم وأكواد الخصم وحدود الحوكمة'),
  ('owner', 'money.write', 'Direct writes to money tables', 'الكتابة المباشرة في جداول الأموال'),
  ('owner', 'iban.reveal', 'Reveal a provider IBAN for a referenced reason', 'كشف آيبان المزود لسبب موثق'),
  ('owner', 'iban.approve', 'Approve a provider IBAN creation or change', 'اعتماد إضافة آيبان المزود أو تغييره'),
  ('owner', 'roles.manage', 'Assign console roles', 'تعيين أدوار لوحة الإدارة'),
  ('owner', 'mfa.reset', 'Reset another administrator''s MFA', 'إعادة ضبط التحقق الثنائي لمسؤول آخر'),
  ('owner', 'settings.manage', 'Platform settings, feature flags, API keys and agreements', 'إعدادات المنصة والمزايا ومفاتيح API والاتفاقيات'),
  ('owner', 'break_glass.use', 'Execute an approval alone when no second eligible administrator exists', 'تنفيذ طلب اعتماد منفرداً عند عدم وجود مسؤول ثانٍ مؤهل'),
  ('owner', 'break_glass.review', 'Record the independent review of a break-glass action', 'تسجيل المراجعة المستقلة لإجراء الطوارئ'),
  ('owner', 'alerts.acknowledge', 'Acknowledge security alerts', 'الإقرار بتنبيهات الأمان'),
  ('finance', 'money.payout', 'Request and approve provider payouts', 'طلب تحويلات المزودين واعتمادها'),
  ('finance', 'money.refund', 'Request and approve refunds', 'طلب المبالغ المستردة واعتمادها'),
  ('finance', 'money.ledger', 'Ledger, reconciliation, invoices and fee settlement', 'دفتر الحسابات والتسوية والفواتير وتسوية الرسوم'),
  ('finance', 'money.config', 'Fee rules, promotion codes and governance thresholds', 'قواعد الرسوم وأكواد الخصم وحدود الحوكمة'),
  ('finance', 'money.write', 'Direct writes to money tables', 'الكتابة المباشرة في جداول الأموال'),
  ('finance', 'iban.reveal', 'Reveal a provider IBAN for a referenced reason', 'كشف آيبان المزود لسبب موثق'),
  ('finance', 'iban.approve', 'Approve a provider IBAN creation or change', 'اعتماد إضافة آيبان المزود أو تغييره'),
  ('finance', 'break_glass.review', 'Record the independent review of a break-glass action', 'تسجيل المراجعة المستقلة لإجراء الطوارئ'),
  ('operations', 'operations.write', 'Change providers, bookings, customers, reviews and catalogue', 'تعديل المزودين والحجوزات والعملاء والتقييمات والكتالوج')
ON CONFLICT (admin_role, permission) DO UPDATE SET description_en = EXCLUDED.description_en, description_ar = EXCLUDED.description_ar;

ALTER TABLE public.admin_role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users read the console permission matrix" ON public.admin_role_permissions;
CREATE POLICY "Signed-in users read the console permission matrix" ON public.admin_role_permissions
  FOR SELECT TO authenticated USING (TRUE);

CREATE TABLE IF NOT EXISTS public.admin_role_assignments (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_role TEXT NOT NULL CHECK (admin_role IN ('owner', 'finance', 'operations', 'analyst')),
  assigned_by UUID,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_role_assignments_role ON public.admin_role_assignments (admin_role);

ALTER TABLE public.admin_role_assignments ENABLE ROW LEVEL SECURITY;

-- Existing administrators held every right; they become owners. Nothing else is invented.
INSERT INTO public.admin_role_assignments (user_id, admin_role, assigned_by, reason)
SELECT p.id, 'owner', NULL, 'GOV-1 migration: existing administrator mapped to owner (D-Q5)'
  FROM public.profiles p
 WHERE p.role = 'admin'
ON CONFLICT (user_id) DO NOTHING;

-- An account that becomes an administrator outside admin_set_console_role starts read-only; leaving the role removes it.
CREATE OR REPLACE FUNCTION public.sync_admin_role_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'admin' THEN
    INSERT INTO public.admin_role_assignments (user_id, admin_role, assigned_by, reason)
    VALUES (NEW.id, 'analyst', auth.uid(), 'Default read-only console role on becoming an administrator')
    ON CONFLICT (user_id) DO NOTHING;
  ELSIF TG_OP = 'UPDATE' AND OLD.role = 'admin' THEN
    DELETE FROM public.admin_role_assignments WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_admin_role_assignment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_admin_role_assignment ON public.profiles;
CREATE TRIGGER trg_sync_admin_role_assignment
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_admin_role_assignment();

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. MFA lockout state, security alerts and the out-of-band notification outbox
-- ---------------------------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mfa_verification_failures (
  user_id UUID PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  last_failed_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  unlocked_at TIMESTAMPTZ,
  unlocked_by UUID
);
ALTER TABLE public.mfa_verification_failures ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.security_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('mfa_lockout', 'mfa_reset', 'iban_reveal_volume', 'break_glass_used', 'console_role_changed', 'iban_change_requested')),
  user_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  acknowledgement_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_security_alerts_open ON public.security_alerts (created_at DESC) WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_security_alerts_user_kind ON public.security_alerts (user_id, kind, created_at DESC);
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

-- Rows waiting for an out-of-band channel (email, SMS) owned by a delivery worker running as service_role. The contact is
-- resolved from the recipient's profile at send time, so no phone number or address is copied here.
CREATE TABLE IF NOT EXISTS public.governance_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  template_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_governance_notifications_pending ON public.governance_notifications (created_at) WHERE status = 'pending';
ALTER TABLE public.governance_notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.queue_governance_notice(p_user_id UUID, p_template TEXT, p_payload JSONB DEFAULT '{}'::jsonb)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF v_profile.id IS NULL THEN
    RETURN 0;
  END IF;
  IF NULLIF(btrim(COALESCE(v_profile.email, '')), '') IS NOT NULL THEN
    INSERT INTO public.governance_notifications (recipient_user_id, channel, template_key, payload)
    VALUES (p_user_id, 'email', p_template, COALESCE(p_payload, '{}'::jsonb));
    v_count := v_count + 1;
  END IF;
  IF NULLIF(btrim(COALESCE(v_profile.phone_number, '')), '') IS NOT NULL THEN
    INSERT INTO public.governance_notifications (recipient_user_id, channel, template_key, payload)
    VALUES (p_user_id, 'sms', p_template, COALESCE(p_payload, '{}'::jsonb));
    v_count := v_count + 1;
  END IF;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_governance_notice(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Session checks: AAL2, console role, permission, step-up, provider re-authentication
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.session_is_aal2()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt()->>'aal', '') = 'aal2';
$$;

-- The latest timestamp (epoch seconds) of an authentication method in the session's amr claim. Supabase writes amr as an
-- array of {method, timestamp}; the RFC string form carries no time and therefore never counts as recent.
CREATE OR REPLACE FUNCTION public.session_amr_latest(p_methods TEXT[])
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT MAX((e->>'timestamp')::numeric)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(auth.jwt()->'amr') = 'array' THEN auth.jwt()->'amr' ELSE '[]'::jsonb END) e
   WHERE jsonb_typeof(e) = 'object'
     AND (e->>'timestamp') ~ '^[0-9]+(\.[0-9]+)?$'
     AND (p_methods IS NULL OR (e->>'method') = ANY (p_methods));
$$;

-- The console role of the caller, whatever the session strength. Used only to explain the state to the console.
CREATE OR REPLACE FUNCTION public.admin_role_of_account()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.admin_role
    FROM public.profiles p
    JOIN public.admin_role_assignments a ON a.user_id = p.id
   WHERE p.id = auth.uid() AND p.role = 'admin';
$$;

-- The console role in force: an administrator account, an AAL2 session and not locked by failed MFA attempts.
CREATE OR REPLACE FUNCTION public.admin_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.admin_role
    FROM public.profiles p
    JOIN public.admin_role_assignments a ON a.user_id = p.id
   WHERE p.id = auth.uid()
     AND p.role = 'admin'
     AND COALESCE(auth.jwt()->>'aal', '') = 'aal2'
     AND NOT EXISTS (SELECT 1 FROM public.mfa_verification_failures l WHERE l.user_id = p.id AND l.locked_at IS NOT NULL);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.admin_role() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.admin_can(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_role_permissions rp
     WHERE rp.admin_role = public.admin_role() AND rp.permission = p_permission
  );
$$;

-- Direct table writes: a non-administrator account is decided by the table's own policies; an administrator account needs
-- the permission for that class of table (used by the restrictive policies below).
CREATE OR REPLACE FUNCTION public.admin_table_write_allowed(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin') THEN TRUE
    ELSE public.admin_can(p_permission)
  END;
$$;

CREATE OR REPLACE FUNCTION public.require_recent_mfa(p_window INTERVAL DEFAULT INTERVAL '5 minutes')
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest NUMERIC;
BEGIN
  -- Server jobs (service_role) have no MFA session; an anonymous caller is refused by the command's own check.
  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' OR auth.uid() IS NULL THEN
    RETURN;
  END IF;
  v_latest := public.session_amr_latest(ARRAY['totp', 'mfa/totp', 'webauthn', 'mfa/webauthn', 'phone', 'mfa/phone']);
  IF COALESCE(auth.jwt()->>'aal', '') <> 'aal2' OR v_latest IS NULL OR to_timestamp(v_latest) < now() - p_window THEN
    RAISE EXCEPTION 'Confirm a fresh code from your authenticator app to continue (step-up required within % minutes)',
      EXTRACT(EPOCH FROM p_window)::integer / 60
      USING ERRCODE = '42501', HINT = 'step_up_required';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_recent_login(p_window INTERVAL DEFAULT INTERVAL '10 minutes')
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest NUMERIC;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' OR auth.uid() IS NULL THEN
    RETURN;
  END IF;
  v_latest := public.session_amr_latest(NULL);
  IF v_latest IS NULL OR to_timestamp(v_latest) < now() - p_window THEN
    RAISE EXCEPTION 'Sign in again to confirm it is you, then repeat this change (re-authentication required within % minutes)',
      EXTRACT(EPOCH FROM p_window)::integer / 60
      USING ERRCODE = '42501', HINT = 'reauth_required';
  END IF;
END;
$$;

-- The caller's address and browser as PostgREST reports them, for audit details.
CREATE OR REPLACE FUNCTION public.request_client_info()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_headers JSONB;
BEGIN
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  RETURN jsonb_build_object(
    'ip', NULLIF(btrim(split_part(COALESCE(v_headers->>'x-forwarded-for', v_headers->>'x-real-ip', ''), ',', 1)), ''),
    'user_agent', left(NULLIF(v_headers->>'user-agent', ''), 300));
END;
$$;

REVOKE ALL ON FUNCTION public.session_is_aal2(), public.session_amr_latest(TEXT[]), public.admin_role_of_account(), public.admin_role(),
  public.is_admin(), public.admin_can(TEXT), public.admin_table_write_allowed(TEXT), public.require_recent_mfa(INTERVAL),
  public.require_recent_login(INTERVAL), public.request_client_info() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.session_is_aal2(), public.session_amr_latest(TEXT[]), public.admin_role_of_account(), public.admin_role(),
  public.is_admin(), public.admin_can(TEXT), public.admin_table_write_allowed(TEXT), public.require_recent_mfa(INTERVAL),
  public.require_recent_login(INTERVAL), public.request_client_info() TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Policies on the new tables
-- ---------------------------------------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Administrators read console roles; everyone reads their own" ON public.admin_role_assignments;
CREATE POLICY "Administrators read console roles; everyone reads their own" ON public.admin_role_assignments
  FOR SELECT TO authenticated USING (public.is_admin() OR user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Administrators read security alerts" ON public.security_alerts;
CREATE POLICY "Administrators read security alerts" ON public.security_alerts
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Administrators read the governance outbox" ON public.governance_notifications;
CREATE POLICY "Administrators read the governance outbox" ON public.governance_notifications
  FOR SELECT TO authenticated USING (public.is_admin());

-- mfa_verification_failures has no client policy: only the Auth hook (as its owner) and the reset command touch it.

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Existing policies: administrator checks written inline now need the AAL2 console role too
-- ---------------------------------------------------------------------------------------------------------------------

DO $gov$
DECLARE
  r RECORD;
  v_using TEXT;
  v_check TEXT;
  v_sql TEXT;
BEGIN
  FOR r IN
    SELECT p.schemaname, p.tablename, p.policyname, p.cmd, p.qual, p.with_check
      FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND (COALESCE(p.qual, '') || ' ' || COALESCE(p.with_check, '')) LIKE $q$%profiles.role = 'admin'::user_role%$q$
  LOOP
    v_using := replace(r.qual, $q$profiles.role = 'admin'::user_role$q$, 'public.is_admin()');
    v_check := replace(r.with_check, $q$profiles.role = 'admin'::user_role$q$, 'public.is_admin()');
    v_sql := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF v_using IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_using); END IF;
    IF v_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_check); END IF;
    EXECUTE v_sql;
  END LOOP;
END
$gov$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Direct table writes by administrators: a restrictive policy per table and command narrows them to the console role
--    that owns that class of data. Non-administrator accounts are unaffected (their own policies still decide).
-- ---------------------------------------------------------------------------------------------------------------------

DO $gov$
DECLARE
  v_helpers TEXT[];
  r RECORD;
  v_permission TEXT;
  v_money TEXT[] := ARRAY['transactional_ledger', 'payout_requests', 'payout_allocations', 'payment_refund_requests', 'refund_requests',
    'payment_disputes', 'provider_fee_invoices', 'psp_reconciliation_runs', 'invoices', 'wallet_credits', 'gift_cards',
    'gift_card_redemptions', 'customer_loyalty', 'loyalty_points_ledger', 'customer_referrals', 'coupon_redemptions',
    'package_redemptions', 'booking_tips', 'payment_methods', 'employee_commission_rules', 'fee_rules', 'provider_receivables'];
  v_settings TEXT[] := ARRAY['integrations', 'integration_audit_log', 'legal_agreements', 'message_templates', 'platform_settings',
    'platform_feature_flags'];
BEGIN
  -- Helper functions that let an administrator through (the policies of some tables call them instead of is_admin()).
  SELECT array_agg(p.proname::text) INTO v_helpers
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosrc ~ 'is_admin\(\)' AND p.proname <> 'is_admin';

  FOR r IN
    SELECT DISTINCT p.tablename
      FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND p.permissive = 'PERMISSIVE'
       AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
       AND ('authenticated' = ANY (p.roles) OR 'public' = ANY (p.roles))
       AND (COALESCE(p.qual, '') || ' ' || COALESCE(p.with_check, '') ~ 'is_admin\(\)'
            OR EXISTS (SELECT 1 FROM unnest(COALESCE(v_helpers, ARRAY[]::text[])) h
                        WHERE COALESCE(p.qual, '') || ' ' || COALESCE(p.with_check, '') ~ ('\m' || h || '\(')))
  LOOP
    v_permission := CASE WHEN r.tablename = ANY (v_money) THEN 'money.write'
                         WHEN r.tablename = ANY (v_settings) THEN 'settings.manage'
                         ELSE 'operations.write' END;
    IF has_table_privilege('authenticated', format('public.%I', r.tablename), 'INSERT') THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Console role guards administrator inserts', r.tablename);
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.admin_table_write_allowed(%L))',
                     'Console role guards administrator inserts', r.tablename, v_permission);
    END IF;
    IF has_table_privilege('authenticated', format('public.%I', r.tablename), 'UPDATE') THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Console role guards administrator updates', r.tablename);
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.admin_table_write_allowed(%L)) WITH CHECK (public.admin_table_write_allowed(%L))',
                     'Console role guards administrator updates', r.tablename, v_permission, v_permission);
    END IF;
    IF has_table_privilege('authenticated', format('public.%I', r.tablename), 'DELETE') THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Console role guards administrator deletes', r.tablename);
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.admin_table_write_allowed(%L))',
                     'Console role guards administrator deletes', r.tablename, v_permission);
    END IF;
  END LOOP;
END
$gov$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. Existing commands: the administrator branch of every command that changes data now needs the permission for it.
--    Read commands keep public.is_admin() (every console role, including analyst). Each listed function is patched in
--    place from its latest definition.
-- ---------------------------------------------------------------------------------------------------------------------

DO $gov$
DECLARE
  m RECORD;
  f RECORD;
  v_def TEXT;
  v_new TEXT;
  v_hits INTEGER;
BEGIN
  FOR m IN
    SELECT * FROM (VALUES
      ('admin_change_professional_handle', 'operations.write', FALSE),
      ('admin_clear_customer_profile', 'operations.write', TRUE),
      ('admin_clear_no_show', 'operations.write', FALSE),
      ('admin_confirm_application_cr', 'operations.write', FALSE),
      ('admin_create_refund_request', 'money.refund', TRUE),
      ('admin_mark_fee_invoice_paid', 'money.ledger', TRUE),
      ('admin_publish_agreement', 'settings.manage', FALSE),
      ('admin_purge_demo_data', 'settings.manage', TRUE),
      ('admin_purge_expired_intake', 'operations.write', TRUE),
      ('admin_record_cr_review', 'operations.write', FALSE),
      ('admin_release_expired_holds', 'operations.write', FALSE),
      ('admin_release_ledger_item', 'money.ledger', TRUE),
      ('admin_release_payout', 'money.payout', TRUE),
      ('admin_reopen_stuck_refund', 'money.refund', TRUE),
      ('admin_retry_refund_request', 'money.refund', TRUE),
      ('admin_review_client_import', 'operations.write', FALSE),
      ('admin_review_payout_request', 'money.payout', FALSE),
      ('admin_revoke_api_key', 'settings.manage', FALSE),
      ('admin_save_fee_rule', 'money.config', FALSE),
      ('admin_save_promo_code', 'money.config', FALSE),
      ('admin_set_api_setting', 'settings.manage', FALSE),
      ('admin_set_branch_country', 'operations.write', FALSE),
      ('admin_set_feature_flag', 'settings.manage', FALSE),
      ('admin_set_phone_verified', 'operations.write', FALSE),
      ('admin_set_professional_visibility', 'operations.write', FALSE),
      ('admin_set_promo_code_active', 'money.config', FALSE),
      ('admin_set_provider_status', 'operations.write', FALSE),
      ('admin_set_whatsapp_channel_verified', 'operations.write', FALSE),
      ('admin_update_data_request', 'operations.write', FALSE),
      ('admin_update_platform_setting', 'settings.manage', FALSE),
      ('admin_uphold_no_show_contest', 'operations.write', FALSE),
      ('admin_upsert_country', 'settings.manage', FALSE),
      ('admin_void_sponsored_attribution', 'money.ledger', FALSE),
      ('approve_provider_application', 'operations.write', FALSE),
      ('reject_provider_application', 'operations.write', FALSE),
      ('moderate_review', 'operations.write', FALSE),
      ('resolve_booking_dispute', 'money.refund', TRUE),
      ('run_daily_psp_reconciliation', 'money.ledger', FALSE),
      ('generate_provider_monthly_fee_invoice', 'money.ledger', FALSE),
      ('issue_monthly_fee_invoices', 'money.ledger', FALSE),
      ('generate_zatca_tax_invoice', 'money.ledger', FALSE),
      ('set_user_role', 'roles.manage', TRUE),
      ('cancel_booking', 'operations.write', FALSE),
      ('cancel_booking_series', 'operations.write', FALSE),
      ('cancel_membership', 'operations.write', FALSE),
      ('cancel_waitlist_entry', 'operations.write', FALSE),
      ('create_provider_share_token', 'operations.write', FALSE),
      ('revoke_provider_share_token', 'operations.write', FALSE),
      ('create_walk_in_booking', 'operations.write', FALSE),
      ('customer_confirm_attendance', 'operations.write', FALSE),
      ('employee_update_booking_status', 'operations.write', FALSE),
      ('enqueue_series_payment_reminders', 'operations.write', FALSE),
      ('expire_memberships', 'operations.write', FALSE),
      ('expire_provider_subscriptions', 'operations.write', FALSE),
      ('expire_stale_booking_holds', 'operations.write', FALSE),
      ('import_provider_clients', 'operations.write', FALSE),
      ('mark_booking_no_show', 'operations.write', FALSE),
      ('provider_create_membership_plan', 'operations.write', FALSE),
      ('provider_set_membership_plan_active', 'operations.write', FALSE),
      ('provider_update_membership_plan', 'operations.write', FALSE),
      ('redeem_package_session', 'operations.write', FALSE),
      ('reply_to_review', 'operations.write', FALSE),
      ('reschedule_booking', 'operations.write', FALSE),
      ('save_provider_operation_membership', 'operations.write', FALSE),
      ('send_membership_expiry_reminders', 'operations.write', FALSE),
      ('set_provider_booking_policy', 'operations.write', FALSE),
      ('set_provider_group_settings', 'operations.write', FALSE),
      ('set_provider_recurring_settings', 'operations.write', FALSE),
      ('toggle_customer_block', 'operations.write', FALSE),
      ('transition_supplier_purchase_order', 'operations.write', FALSE),
      ('enforce_leave_approval', 'operations.write', FALSE),
      ('guard_branch_country', 'operations.write', FALSE),
      ('guard_delegated_staff_changes', 'operations.write', FALSE),
      ('protect_provider_control_fields', 'operations.write', FALSE),
      ('validate_booking_status_transition', 'operations.write', FALSE)
    ) AS t(fname, permission, step_up)
  LOOP
    v_hits := 0;
    FOR f IN
      SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = m.fname AND p.prosrc ~ 'is_admin\(\)'
    LOOP
      v_def := replace(pg_get_functiondef(f.oid), E'\r\n', E'\n');
      v_new := regexp_replace(v_def, '(public\.)?\mis_admin\(\)', format('public.admin_can(%L)', m.permission), 'g');
      IF m.step_up THEN
        -- Step-up is the first statement of the body: the command's own authorization check follows it.
        v_new := regexp_replace(v_new, E'\nBEGIN\n', E'\nBEGIN\n  PERFORM public.require_recent_mfa();\n');
      END IF;
      EXECUTE v_new;
      v_hits := v_hits + 1;
    END LOOP;
    IF v_hits = 0 THEN
      RAISE EXCEPTION 'GOV-1: no administrator check found in public.%', m.fname;
    END IF;
  END LOOP;
END
$gov$;

-- The two commands that compared profiles.role inline.
SELECT pg_temp.patch_function('public.admin_broadcast_notification(text,text,text,text,text,boolean,boolean)'::regprocedure,
$from$role = 'admin')$from$, $to$role = 'admin' AND public.admin_can('operations.write'))$to$);
SELECT pg_temp.patch_function('public.enqueue_direct_message(character varying,uuid,character varying,character varying,jsonb,character varying,timestamp with time zone)'::regprocedure,
$from$role = 'admin')$from$, $to$role = 'admin' AND public.admin_can('operations.write'))$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 8. Role changes: the last owner stays, granting the administrator role gives the read-only analyst role
-- ---------------------------------------------------------------------------------------------------------------------

SELECT pg_temp.patch_function('public.set_user_role(uuid,user_role,text)'::regprocedure,
$from$    RAISE EXCEPTION 'The last administrator cannot be removed' USING ERRCODE = '22023';
  END IF;$from$,
$to$    RAISE EXCEPTION 'The last administrator cannot be removed' USING ERRCODE = '22023';
  END IF;
  IF v_before.role = 'admin' AND target_role <> 'admin'
     AND EXISTS (SELECT 1 FROM public.admin_role_assignments WHERE user_id = target_user_id AND admin_role = 'owner')
     AND NOT EXISTS (SELECT 1 FROM public.admin_role_assignments a JOIN public.profiles p ON p.id = a.user_id
                      WHERE a.admin_role = 'owner' AND p.role = 'admin' AND a.user_id <> target_user_id) THEN
    RAISE EXCEPTION 'The last owner cannot be removed; make another administrator owner first' USING ERRCODE = '22023';
  END IF;$to$);

CREATE OR REPLACE FUNCTION public.admin_set_console_role(p_user_id UUID, p_admin_role TEXT, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_role TEXT := NULLIF(btrim(COALESCE(p_admin_role, '')), '');
  v_profile public.profiles;
  v_before TEXT;
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('roles.manage') THEN
    RAISE EXCEPTION 'Only an owner can change console roles' USING ERRCODE = '42501';
  END IF;
  IF v_role IS NOT NULL AND v_role NOT IN ('owner', 'finance', 'operations', 'analyst') THEN
    RAISE EXCEPTION 'Unknown console role' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF p_user_id = v_actor THEN
    RAISE EXCEPTION 'You cannot change your own role; ask another owner' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('primora.set_user_role'));

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_role IS NOT NULL AND v_profile.role IN ('provider_owner', 'provider_employee') THEN
    RAISE EXCEPTION 'A provider account cannot also be an administrator; use a separate account' USING ERRCODE = '22023';
  END IF;
  SELECT admin_role INTO v_before FROM public.admin_role_assignments WHERE user_id = p_user_id;
  IF v_profile.role <> 'admin' THEN
    v_before := NULL;
  END IF;
  IF v_before IS NOT DISTINCT FROM v_role THEN
    RETURN jsonb_build_object('user_id', p_user_id, 'admin_role', v_role, 'changed', FALSE);
  END IF;
  IF v_before = 'owner' AND v_role IS DISTINCT FROM 'owner'
     AND NOT EXISTS (SELECT 1 FROM public.admin_role_assignments a JOIN public.profiles p ON p.id = a.user_id
                      WHERE a.admin_role = 'owner' AND p.role = 'admin' AND a.user_id <> p_user_id) THEN
    RAISE EXCEPTION 'The last owner cannot be removed; make another administrator owner first' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('primora.audit_reason', v_reason, true);
  IF v_role IS NULL THEN
    UPDATE public.profiles SET role = 'customer' WHERE id = p_user_id;
  ELSE
    IF v_profile.role <> 'admin' THEN
      UPDATE public.profiles SET role = 'admin' WHERE id = p_user_id;
    END IF;
    INSERT INTO public.admin_role_assignments (user_id, admin_role, assigned_by, assigned_at, reason)
    VALUES (p_user_id, v_role, v_actor, now(), v_reason)
    ON CONFLICT (user_id) DO UPDATE SET admin_role = EXCLUDED.admin_role, assigned_by = EXCLUDED.assigned_by,
      assigned_at = EXCLUDED.assigned_at, reason = EXCLUDED.reason;
  END IF;

  PERFORM public.write_audit_log('admin.console_role_changed', 'profiles', p_user_id,
    jsonb_build_object('role_before', v_before, 'role_after', v_role, 'reason', v_reason) || public.request_client_info());
  INSERT INTO public.security_alerts (kind, user_id, details)
  VALUES ('console_role_changed', p_user_id, jsonb_build_object('role_before', v_before, 'role_after', v_role, 'changed_by', v_actor));
  PERFORM public.queue_governance_notice(p_user_id, 'console_role_changed', jsonb_build_object('role_before', v_before, 'role_after', v_role));
  RETURN jsonb_build_object('user_id', p_user_id, 'admin_role', v_role, 'role_before', v_before, 'changed', TRUE);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_console_role(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_console_role(UUID, TEXT, TEXT) TO authenticated;

-- The directory shows each administrator's console role, MFA enrolment and lockout.
SELECT pg_temp.patch_function('public.admin_role_directory(text,text,integer,integer)'::regprocedure,
$from$      SELECT p.id, p.first_name, p.last_name, p.email, p.role::text AS role, p.created_at,$from$,
$to$      SELECT p.id, p.first_name, p.last_name, p.email, p.role::text AS role, p.created_at,
             (SELECT a.admin_role FROM public.admin_role_assignments a WHERE a.user_id = p.id AND p.role = 'admin') AS console_role,
             CASE WHEN p.role = 'admin' THEN EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = p.id AND f.status::text = 'verified') END AS mfa_enrolled,
             CASE WHEN p.role = 'admin' THEN EXISTS (SELECT 1 FROM public.mfa_verification_failures l WHERE l.user_id = p.id AND l.locked_at IS NOT NULL) END AS mfa_locked,$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 9. MFA verification hook (Supabase Auth): 10 consecutive failed codes lock the account and raise an alert
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hook_mfa_verification_attempt(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := NULLIF(event->>'user_id', '')::uuid;
  v_valid BOOLEAN := COALESCE((event->>'valid')::boolean, FALSE);
  v_row public.mfa_verification_failures;
  v_locked_message TEXT := 'This account is locked after 10 incorrect authenticator codes. Ask another administrator to reset your MFA. / تم قفل الحساب بعد 10 رموز تحقق خاطئة. اطلب من مسؤول آخر إعادة ضبط التحقق الثنائي.';
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('decision', 'continue');
  END IF;
  INSERT INTO public.mfa_verification_failures (user_id) VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_row FROM public.mfa_verification_failures WHERE user_id = v_user FOR UPDATE;

  IF v_row.locked_at IS NOT NULL THEN
    RETURN jsonb_build_object('decision', 'reject', 'message', v_locked_message);
  END IF;
  IF v_valid THEN
    UPDATE public.mfa_verification_failures SET failed_count = 0 WHERE user_id = v_user;
    RETURN jsonb_build_object('decision', 'continue');
  END IF;

  UPDATE public.mfa_verification_failures
     SET failed_count = failed_count + 1, last_failed_at = now(),
         locked_at = CASE WHEN failed_count + 1 >= 10 THEN now() ELSE NULL END
   WHERE user_id = v_user
  RETURNING * INTO v_row;

  IF v_row.locked_at IS NOT NULL THEN
    INSERT INTO public.security_alerts (kind, user_id, details)
    VALUES ('mfa_lockout', v_user, jsonb_build_object('failed_count', v_row.failed_count, 'factor_id', event->>'factor_id'));
    INSERT INTO public.admin_audit_logs (actor_id, action, target_type, target_id, details)
    SELECT p.id, 'mfa.locked', 'profiles', p.id, jsonb_build_object('failed_count', v_row.failed_count, 'actor_role', 'supabase_auth')
      FROM public.profiles p WHERE p.id = v_user;
    PERFORM public.queue_governance_notice(v_user, 'mfa_locked', jsonb_build_object('failed_count', v_row.failed_count));
    RETURN jsonb_build_object('decision', 'reject', 'message', v_locked_message);
  END IF;
  RETURN jsonb_build_object('decision', 'continue');
END;
$$;
REVOKE ALL ON FUNCTION public.hook_mfa_verification_attempt(JSONB) FROM PUBLIC, anon, authenticated;
DO $gov$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
    GRANT EXECUTE ON FUNCTION public.hook_mfa_verification_attempt(JSONB) TO supabase_auth_admin;
  END IF;
END
$gov$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 10. The console's view of the caller, and MFA reset of another administrator
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_session_state()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT := public.admin_role_of_account();
  v_mfa NUMERIC := public.session_amr_latest(ARRAY['totp', 'mfa/totp', 'webauthn', 'mfa/webauthn', 'phone', 'mfa/phone']);
  v_locked BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('signed_in', FALSE);
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.mfa_verification_failures WHERE user_id = v_uid AND locked_at IS NOT NULL) INTO v_locked;
  RETURN jsonb_build_object(
    'signed_in', TRUE,
    'is_admin_account', v_role IS NOT NULL,
    'console_role', v_role,
    'aal', COALESCE(auth.jwt()->>'aal', 'aal1'),
    'locked', v_locked,
    'active', public.is_admin(),
    'permissions', COALESCE((SELECT jsonb_agg(permission ORDER BY permission) FROM public.admin_role_permissions
                              WHERE admin_role = public.admin_role()), '[]'::jsonb),
    'step_up_valid_until', CASE WHEN v_mfa IS NOT NULL AND COALESCE(auth.jwt()->>'aal', '') = 'aal2'
                                THEN to_timestamp(v_mfa) + INTERVAL '5 minutes' END);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_session_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_session_state() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reset_mfa(p_user_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_factors INTEGER;
  v_sessions INTEGER;
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('mfa.reset') THEN
    RAISE EXCEPTION 'Only an owner can reset another administrator''s MFA' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_user_id = v_actor THEN
    RAISE EXCEPTION 'You cannot reset your own MFA; ask another owner' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'admin') THEN
    RAISE EXCEPTION 'MFA reset here is for administrator accounts only' USING ERRCODE = '22023';
  END IF;

  DELETE FROM auth.mfa_factors WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_factors = ROW_COUNT;
  -- Every session of the account ends, so the next sign-in enrols a new factor.
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_sessions = ROW_COUNT;
  UPDATE public.mfa_verification_failures
     SET failed_count = 0, locked_at = NULL, unlocked_at = now(), unlocked_by = v_actor
   WHERE user_id = p_user_id;

  PERFORM public.write_audit_log('mfa.reset', 'profiles', p_user_id,
    jsonb_build_object('reason', v_reason, 'factors_removed', v_factors, 'sessions_ended', v_sessions) || public.request_client_info());
  INSERT INTO public.security_alerts (kind, user_id, details)
  VALUES ('mfa_reset', p_user_id, jsonb_build_object('reset_by', v_actor, 'factors_removed', v_factors));
  PERFORM public.queue_governance_notice(p_user_id, 'mfa_reset', jsonb_build_object('factors_removed', v_factors));
  RETURN jsonb_build_object('user_id', p_user_id, 'factors_removed', v_factors, 'sessions_ended', v_sessions);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reset_mfa(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_mfa(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_acknowledge_security_alert(p_alert_id UUID, p_note TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_alert public.security_alerts;
BEGIN
  IF NOT public.admin_can('alerts.acknowledge') THEN
    RAISE EXCEPTION 'Only an owner can acknowledge security alerts' USING ERRCODE = '42501';
  END IF;
  IF v_note IS NULL OR char_length(v_note) < 10 THEN
    RAISE EXCEPTION 'A note of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_alert FROM public.security_alerts WHERE id = p_alert_id FOR UPDATE;
  IF v_alert.id IS NULL THEN
    RAISE EXCEPTION 'Alert not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_alert.acknowledged_at IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_alert.id, 'changed', FALSE);
  END IF;
  UPDATE public.security_alerts SET acknowledged_by = auth.uid(), acknowledged_at = now(), acknowledgement_note = v_note WHERE id = p_alert_id;
  PERFORM public.write_audit_log('security_alert.acknowledged', 'security_alerts', p_alert_id, jsonb_build_object('kind', v_alert.kind, 'note', v_note));
  RETURN jsonb_build_object('id', v_alert.id, 'changed', TRUE);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_acknowledge_security_alert(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_acknowledge_security_alert(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 11. Grants and the administrator audit trigger on the new tables
-- ---------------------------------------------------------------------------------------------------------------------

SELECT public.grant_data_api_access('public.admin_role_permissions');
SELECT public.grant_data_api_access('public.admin_role_assignments');
SELECT public.grant_data_api_access('public.mfa_verification_failures');
SELECT public.grant_data_api_access('public.security_alerts');
SELECT public.grant_data_api_access('public.governance_notifications');
REVOKE INSERT, UPDATE, DELETE ON public.admin_role_permissions, public.admin_role_assignments, public.security_alerts,
  public.governance_notifications FROM authenticated;
DO $gov$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT SELECT, INSERT, UPDATE ON public.mfa_verification_failures TO supabase_auth_admin;
  END IF;
END
$gov$;

SELECT public.attach_admin_audit_trigger('public.admin_role_permissions');
SELECT public.attach_admin_audit_trigger('public.admin_role_assignments');
SELECT public.attach_admin_audit_trigger('public.mfa_verification_failures');
SELECT public.attach_admin_audit_trigger('public.security_alerts');
SELECT public.attach_admin_audit_trigger('public.governance_notifications');
