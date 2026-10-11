-- SECFIX-2 R2-H1 and R2-M8 (docs/reviews/2026-10-11-security-round2.md; Q4 final decision text).
--
-- GOV-2 and GOV-FIX closed direct console reads on 43 tables. Every other table whose read policy still carried an
-- administrator branch (is_admin(), or a shared provider helper that lets operations.write through) handed any console role,
-- analyst included, its rows by plain PostgREST SELECT with no audit row: provider notes about customers, applicants' contact
-- details and home address, agreement IP addresses, no-show contests, waitlists, customer blocks, membership and subscription
-- payments, receivables, payout holds, reward reversals, staff salaries and absences, webhook payloads and the audit log.
--   * The GOV-2 RESTRICTIVE policy ("Console sessions read only through audited functions") goes on each of those tables: a
--     console session reads only its own rows (as the data subject), or none. It is ANDed with every permissive policy, so no
--     other route (a helper, a policy added later) gives them back.
--   * The administrator branches are dropped from the permissive policies (DROP POLICY IF EXISTS, then CREATE POLICY).
--   * The audit log is readable only by the owner (new permission audit.read), only through admin_list_audit_events, which is
--     paged on the server and writes its own read event (ids, fields, purpose, filter). The analyst, finance and operations
--     roles no longer read it at all (R2-M8).
--   * supabase/tests/db/secfix2_console_read_policies.test.mjs enumerates pg_policies on every migration run and fails when a
--     table with an administrator read branch has no restrictive console policy and is not on its reviewed allow-list of
--     catalogue, configuration and governance tables.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Permission: only the owner reads the audit log
-- ---------------------------------------------------------------------------------------------------------------------

INSERT INTO public.admin_role_permissions (admin_role, permission, description_en, description_ar) VALUES
  ('owner', 'audit.read', 'Read the audit log through the audited, paged audit search',
           'قراءة سجل التدقيق عبر البحث المسجل والمقسم إلى صفحات')
ON CONFLICT (admin_role, permission) DO UPDATE SET description_en = EXCLUDED.description_en, description_ar = EXCLUDED.description_ar;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Administrator read branches dropped from the permissive policies
-- ---------------------------------------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins read audit logs" ON public.admin_audit_logs;
DROP POLICY IF EXISTS "Admins read all agreement acceptances" ON public.agreement_acceptances;
DROP POLICY IF EXISTS "Admins read all provider applications" ON public.provider_applications;
DROP POLICY IF EXISTS "Administrators read employee commission rules" ON public.employee_commission_rules;
DROP POLICY IF EXISTS "Console sessions read payout holds" ON public.provider_payout_holds;

DROP POLICY IF EXISTS "Users can view own booking services" ON public.booking_services;
CREATE POLICY "Users can view own booking services" ON public.booking_services
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b
                  WHERE b.id = booking_services.booking_id
                    AND (b.customer_id = (SELECT auth.uid())
                         OR b.employee_id IN (SELECT e.id FROM public.employees e WHERE e.profile_id = (SELECT auth.uid()))
                         OR EXISTS (SELECT 1 FROM public.branches br JOIN public.providers p ON p.id = br.provider_id
                                     WHERE br.id = b.branch_id AND p.owner_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Employees request own time off and owners manage" ON public.employee_time_off;
CREATE POLICY "Employees request own time off and owners manage" ON public.employee_time_off
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = employee_time_off.employee_id
                    AND (e.profile_id = (SELECT auth.uid())
                         OR EXISTS (SELECT 1 FROM public.branches b JOIN public.providers p ON p.id = b.provider_id
                                     WHERE b.id = e.branch_id
                                       AND (p.owner_id = (SELECT auth.uid()) OR COALESCE(auth.jwt()->>'role', '') = 'service_role')))));

DROP POLICY IF EXISTS "membership_payments_read" ON public.membership_payments;
CREATE POLICY "membership_payments_read" ON public.membership_payments
  FOR SELECT TO authenticated
  USING (customer_id = (SELECT auth.uid())
         OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id = membership_payments.provider_id AND p.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Customers read their own no-show contests" ON public.no_show_contests;
CREATE POLICY "Customers read their own no-show contests" ON public.no_show_contests
  FOR SELECT TO authenticated USING (customer_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Providers view own client imports" ON public.provider_client_imports;
CREATE POLICY "Providers view own client imports" ON public.provider_client_imports
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_client_imports.provider_id
                   AND (p.owner_id = (SELECT auth.uid()) OR COALESCE(auth.jwt()->>'role', '') = 'service_role')));

DROP POLICY IF EXISTS "Providers view own blocked customers" ON public.provider_customer_blocks;
CREATE POLICY "Providers view own blocked customers" ON public.provider_customer_blocks
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_customer_blocks.provider_id AND p.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Providers insert customer blocks" ON public.provider_customer_blocks;
CREATE POLICY "Providers insert customer blocks" ON public.provider_customer_blocks
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_customer_blocks.provider_id AND p.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Providers remove customer blocks" ON public.provider_customer_blocks;
CREATE POLICY "Providers remove customer blocks" ON public.provider_customer_blocks
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_customer_blocks.provider_id AND p.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Providers manage own customer notes" ON public.provider_customer_notes;
CREATE POLICY "Providers manage own customer notes" ON public.provider_customer_notes
  FOR ALL TO authenticated
  USING (COALESCE(auth.jwt()->>'role', '') = 'service_role'
         OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_customer_notes.provider_id AND p.owner_id = (SELECT auth.uid())))
  WITH CHECK (COALESCE(auth.jwt()->>'role', '') = 'service_role'
              OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_customer_notes.provider_id AND p.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Members can view own memberships" ON public.provider_memberships;
CREATE POLICY "Members can view own memberships" ON public.provider_memberships
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())
         OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_memberships.provider_id
                      AND (p.owner_id = (SELECT auth.uid()) OR COALESCE(auth.jwt()->>'role', '') = 'service_role')));
DROP POLICY IF EXISTS "Provider owners and admins manage memberships" ON public.provider_memberships;
CREATE POLICY "Provider owners manage memberships" ON public.provider_memberships
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_memberships.provider_id
                   AND (p.owner_id = (SELECT auth.uid()) OR COALESCE(auth.jwt()->>'role', '') = 'service_role')));

DROP POLICY IF EXISTS "Provider owners and administrators read receivables" ON public.provider_receivables;
CREATE POLICY "Provider owners read receivables" ON public.provider_receivables
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_receivables.provider_id AND p.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Owners and admins read share tokens" ON public.provider_share_tokens;
CREATE POLICY "Owners read share tokens" ON public.provider_share_tokens
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_share_tokens.provider_id AND p.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Provider owners view own subscription" ON public.provider_subscriptions;
CREATE POLICY "Provider owners view own subscription" ON public.provider_subscriptions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_subscriptions.provider_id
                   AND (p.owner_id = (SELECT auth.uid()) OR COALESCE(auth.jwt()->>'role', '') = 'service_role')));

DROP POLICY IF EXISTS "Customers and console sessions read reward reversals" ON public.reward_reversals;
CREATE POLICY "Customers read their reward reversals" ON public.reward_reversals
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.wallet_credits c WHERE c.id = reward_reversals.wallet_credit_id AND c.customer_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Owners read own subscription payments" ON public.subscription_payments;
CREATE POLICY "Owners read own subscription payments" ON public.subscription_payments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = subscription_payments.provider_id AND p.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Customers view own waitlist entries" ON public.waitlists;
CREATE POLICY "Customers view own waitlist entries" ON public.waitlists
  FOR SELECT TO authenticated
  USING (customer_id = (SELECT auth.uid())
         OR EXISTS (SELECT 1 FROM public.branches br JOIN public.providers p ON p.id = br.provider_id
                     WHERE br.id = waitlists.branch_id AND p.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Owners and administrators read webhook deliveries" ON public.webhook_deliveries;
CREATE POLICY "Owners read webhook deliveries" ON public.webhook_deliveries
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = webhook_deliveries.provider_id AND p.owner_id = (SELECT auth.uid())));

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. The restrictive console policy on every table that holds personal, bank-adjacent, staff-pay or money rows
-- ---------------------------------------------------------------------------------------------------------------------

DO $secfix2$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('admin_audit_logs', 'FALSE'),
      ('agreement_acceptances', 'user_id = (SELECT auth.uid())'),
      ('booking_services', 'EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_services.booking_id AND b.customer_id = (SELECT auth.uid()))'),
      ('employee_commission_rules', 'EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_commission_rules.employee_id AND e.profile_id = (SELECT auth.uid()))'),
      ('employee_time_off', 'EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_time_off.employee_id AND e.profile_id = (SELECT auth.uid()))'),
      ('membership_payments', 'customer_id = (SELECT auth.uid())'),
      ('subscription_payments', 'FALSE'),
      ('memberships', 'customer_id = (SELECT auth.uid())'),
      ('membership_redemptions', 'customer_id = (SELECT auth.uid())'),
      ('no_show_contests', 'customer_id = (SELECT auth.uid())'),
      ('waitlists', 'customer_id = (SELECT auth.uid())'),
      ('provider_customer_blocks', 'FALSE'),
      ('provider_customer_notes', 'FALSE'),
      ('provider_applications', 'user_id = (SELECT auth.uid())'),
      ('provider_client_imports', 'FALSE'),
      ('provider_memberships', 'user_id = (SELECT auth.uid())'),
      ('provider_payout_holds', 'FALSE'),
      ('provider_receivables', 'FALSE'),
      ('provider_share_tokens', 'FALSE'),
      ('provider_subscriptions', 'FALSE'),
      ('reward_reversals', 'EXISTS (SELECT 1 FROM public.wallet_credits c WHERE c.id = reward_reversals.wallet_credit_id AND c.customer_id = (SELECT auth.uid()))'),
      ('sponsored_attributions', 'FALSE'),
      ('sponsored_clicks', 'FALSE'),
      ('webhook_deliveries', 'FALSE'),
      -- Reconciliation evidence and breaks: finance reads them through admin_reconciliation_overview (logged), never directly.
      ('tap_reconciliation_imports', 'FALSE'),
      ('tap_reconciliation_events', 'FALSE'),
      ('tap_reconciliation_runs', 'FALSE'),
      ('reconciliation_breaks', 'FALSE')
    ) AS t(tbl, own_rows)
  LOOP
    CONTINUE WHEN to_regclass('public.' || r.tbl) IS NULL;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Console sessions read only through audited functions', r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT (SELECT public.is_admin()) OR (%s))',
                   'Console sessions read only through audited functions', r.tbl, r.own_rows);
  END LOOP;
END $secfix2$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. The audit log, through an audited and paged function (owner only)
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_list_audit_events(p_action TEXT DEFAULT NULL, p_target_type TEXT DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL, p_to TIMESTAMPTZ DEFAULT NULL, p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0,
  p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_action TEXT := NULLIF(btrim(COALESCE(p_action, '')), '');
  v_type TEXT := NULLIF(btrim(COALESCE(p_target_type, '')), '');
  v_purpose TEXT;
  v_total BIGINT;
  v_rows JSONB;
  v_ids UUID[];
BEGIN
  PERFORM public.gov2_require_read(ARRAY['audit.read'], 'the audit log');
  v_purpose := public.gov2_read_purpose(p_purpose, 'audit_review');
  IF v_action IS NOT NULL AND char_length(v_action) > 80 THEN
    RAISE EXCEPTION 'The action filter is at most 80 characters' USING ERRCODE = '22023';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'The From date must not be after the To date' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_total FROM public.admin_audit_logs a
   WHERE (v_action IS NULL OR a.action ILIKE '%' || replace(replace(v_action, '%', '\%'), '_', '\_') || '%')
     AND (v_type IS NULL OR a.target_type = v_type)
     AND (p_from IS NULL OR a.created_at >= p_from) AND (p_to IS NULL OR a.created_at <= p_to);
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id DESC), '[]'::jsonb), COALESCE(array_agg(x.id), '{}'::uuid[])
    INTO v_rows, v_ids
    FROM (
      SELECT a.id, a.actor_id, a.action, a.target_type, a.target_id, a.details, a.created_at
        FROM public.admin_audit_logs a
       WHERE (v_action IS NULL OR a.action ILIKE '%' || replace(replace(v_action, '%', '\%'), '_', '\_') || '%')
         AND (v_type IS NULL OR a.target_type = v_type)
         AND (p_from IS NULL OR a.created_at >= p_from) AND (p_to IS NULL OR a.created_at <= p_to)
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT v_limit OFFSET v_offset
    ) x;
  PERFORM public.gov2_log_read('audit.listed', 'admin_audit_logs', v_ids,
    ARRAY['actor_id', 'action', 'target_type', 'target_id', 'details'], v_purpose,
    jsonb_build_object('action', v_action, 'target_type', v_type, 'from', p_from, 'to', p_to, 'limit', v_limit, 'offset', v_offset),
    jsonb_array_length(v_rows));
  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_audit_events(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_events(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER, TEXT) TO authenticated;
