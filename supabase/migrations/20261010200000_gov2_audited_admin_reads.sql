-- GOV-2 part 1: administrators read personal, bank, ledger, invoice and message data only through audited functions
-- (Q4 and D4 final decision texts, docs/legal/2026-10-10-privacy-decision-memo.md, adopted 2026-10-10).
--
--   * No direct table SELECT for a console session (is_admin(): admin profile + console role + aal2 + not locked) on the
--     tables that hold customer personal data, provider bank data, ledger rows, invoices, messages, staff records, addresses
--     and health-intake data. The permissive administrator policies are dropped, and a RESTRICTIVE select policy on each table
--     closes every other route (shared helpers, public catalogue rules). An administrator still reads their OWN rows where the
--     table has an owner column (their profile, their consents), because they are that data subject.
--   * The console reads that data through SECURITY DEFINER functions that are paged on the server, check the console
--     permission, and write one audit event per read: actor, console role, action, target ids, fields, purpose, filter, row
--     count, time, IP and user agent. Exports are built on the server, need step-up, and log the delivered row count.
--   * Console permissions: personal.read (owner, operations) for customer, applicant, staff and message data; money.ledger
--     (owner, finance) for the ledger, payouts, invoices and settlements; health.break_glass (owner only: no DPO role exists).
--     Analyst and finance hold no personal.read; analyst and operations hold no money permission.
--   * Health-intake answers have no administrator path except read_intake_answers_break_glass: owner, step-up, a written
--     reason of at least 20 characters, an audit event without the answers, a security alert every other administrator sees
--     and an out-of-band notice to every other owner.
--   * The shared provider helpers (can_access_provider_operation / _wide) let an administrator through only with
--     operations.write, so analyst and finance can no longer change provider-side data through them (GOV-1 gap
--     analyst-read-only-not-enforced-through-shared-provider-helpers).

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Read permissions
-- ---------------------------------------------------------------------------------------------------------------------

INSERT INTO public.admin_role_permissions (admin_role, permission, description_en, description_ar) VALUES
  ('owner', 'personal.read', 'Read customer, applicant, staff and message data through audited functions',
           'قراءة بيانات العملاء والمتقدمين والموظفين والرسائل عبر وظائف مسجلة في سجل التدقيق'),
  ('operations', 'personal.read', 'Read customer, applicant, staff and message data through audited functions',
           'قراءة بيانات العملاء والمتقدمين والموظفين والرسائل عبر وظائف مسجلة في سجل التدقيق'),
  ('owner', 'health.break_glass', 'Read health-intake answers through the logged break-glass (no DPO role exists yet)',
           'قراءة إجابات الاستبيان الصحي عبر إجراء الطوارئ المسجل (لا يوجد دور لمسؤول حماية البيانات بعد)')
ON CONFLICT (admin_role, permission) DO UPDATE SET description_en = EXCLUDED.description_en, description_ar = EXCLUDED.description_ar;

ALTER TABLE public.security_alerts DROP CONSTRAINT IF EXISTS security_alerts_kind_check;
ALTER TABLE public.security_alerts ADD CONSTRAINT security_alerts_kind_check CHECK (kind IN (
  'mfa_lockout', 'mfa_reset', 'iban_reveal_volume', 'break_glass_used', 'console_role_changed', 'iban_change_requested',
  'health_break_glass'));

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Internal helpers (no client role can call them)
-- ---------------------------------------------------------------------------------------------------------------------

-- D4: the smallest group a figure may describe. A business choice adopted with D4 (registered in declaredStatic).
CREATE OR REPLACE FUNCTION public.d4_small_cell_threshold()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT 5 $$;

-- A count of 1 to 4 people is suppressed; zero describes nobody and is shown.
CREATE OR REPLACE FUNCTION public.d4_is_small_cell(p_people BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT COALESCE(p_people, 0) BETWEEN 1 AND public.d4_small_cell_threshold() - 1 $$;

-- Refuses a caller that is not a console session holding at least one of the permissions. Callers outside the console get
-- the plain administrator refusal first, so the error never says which console permissions exist.
CREATE OR REPLACE FUNCTION public.gov2_require_read(p_permissions TEXT[], p_what TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(p_permissions) p WHERE public.admin_can(p)) THEN
    RAISE EXCEPTION 'Your console role cannot read %', p_what USING ERRCODE = '42501', HINT = 'console_role_forbidden';
  END IF;
  RETURN public.admin_role();
END;
$$;

-- The purpose recorded with a read. A screen passes its own purpose; an unknown purpose is refused rather than recorded.
CREATE OR REPLACE FUNCTION public.gov2_read_purpose(p_purpose TEXT, p_default TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_purpose TEXT := COALESCE(NULLIF(btrim(COALESCE(p_purpose, '')), ''), p_default);
BEGIN
  IF v_purpose NOT IN ('customer_support', 'privacy_request', 'finance_operations', 'payout_review', 'reconciliation',
                       'dispute_resolution', 'review_moderation', 'staff_administration', 'provider_onboarding',
                       'messaging_operations', 'audit_review', 'tax_reporting') THEN
    RAISE EXCEPTION 'Unknown purpose %', v_purpose USING ERRCODE = '22023';
  END IF;
  RETURN v_purpose;
END;
$$;

-- One audit event per read. It stores identifiers, never the values that were read (Q4 item 5).
CREATE OR REPLACE FUNCTION public.gov2_log_read(p_action TEXT, p_target_type TEXT, p_target_ids UUID[], p_fields TEXT[],
                                              p_purpose TEXT, p_filter JSONB, p_rows INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[] := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_target_ids, '{}'::uuid[])) x WHERE x IS NOT NULL);
BEGIN
  PERFORM public.write_audit_log(p_action, p_target_type,
    CASE WHEN cardinality(v_ids) = 1 THEN v_ids[1] END,
    jsonb_build_object(
      'console_role', public.admin_role(),
      'purpose', p_purpose,
      'fields', to_jsonb(COALESCE(p_fields, '{}'::text[])),
      'filter', COALESCE(p_filter, '{}'::jsonb),
      'rows', COALESCE(p_rows, 0),
      'target_count', cardinality(v_ids),
      'target_ids', to_jsonb(v_ids[1:500]))
    || public.request_client_info());
END;
$$;

REVOKE ALL ON FUNCTION public.gov2_require_read(TEXT[], TEXT), public.gov2_read_purpose(TEXT, TEXT),
  public.gov2_log_read(TEXT, TEXT, UUID[], TEXT[], TEXT, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.d4_small_cell_threshold(), public.d4_is_small_cell(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.d4_small_cell_threshold(), public.d4_is_small_cell(BIGINT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. No direct administrator reads
-- ---------------------------------------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins read all consents" ON public.consents;
DROP POLICY IF EXISTS "Admins read all DSR requests" ON public.data_subject_requests;
DROP POLICY IF EXISTS "Admins read employees" ON public.employees;
DROP POLICY IF EXISTS "Admins read payout allocations" ON public.payout_allocations;
DROP POLICY IF EXISTS "Admins manage ledger" ON public.transactional_ledger;
DROP POLICY IF EXISTS "Admins manage wallet credits" ON public.wallet_credits;
DROP POLICY IF EXISTS "Admins manage gift cards" ON public.gift_cards;
DROP POLICY IF EXISTS "Admins manage gift card redemptions" ON public.gift_card_redemptions;
DROP POLICY IF EXISTS "Admins view all tax invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins read message logs" ON public.message_log;
DROP POLICY IF EXISTS "Admins read message queue" ON public.message_queue;
DROP POLICY IF EXISTS "Administrators read analytics events" ON public.analytics_events;

DROP POLICY IF EXISTS "Authenticated read authorized payout requests" ON public.payout_requests;
CREATE POLICY "Authenticated read authorized payout requests" ON public.payout_requests
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = payout_requests.provider_id AND p.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Providers view invoices issued for their bookings" ON public.invoices;
CREATE POLICY "Providers view invoices issued for their bookings" ON public.invoices
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = invoices.provider_id AND p.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins manage all fee invoices" ON public.provider_fee_invoices;
DROP POLICY IF EXISTS "Provider owners view own fee invoices" ON public.provider_fee_invoices;
CREATE POLICY "Provider owners view own fee invoices" ON public.provider_fee_invoices
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_fee_invoices.provider_id AND p.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Customers and admins read wallet credit redemptions" ON public.wallet_credit_redemptions;
CREATE POLICY "Customers read own wallet credit redemptions" ON public.wallet_credit_redemptions
  FOR SELECT TO authenticated USING (customer_id = (SELECT auth.uid()));

-- In-app notifications are written by SECURITY DEFINER commands (admin_broadcast_notification) and server jobs.
DROP POLICY IF EXISTS "Admins and service role manage notifications" ON public.notifications;
CREATE POLICY "Service role manages notifications" ON public.notifications
  FOR ALL TO authenticated
  USING (COALESCE(auth.jwt()->>'role', '') = 'service_role')
  WITH CHECK (COALESCE(auth.jwt()->>'role', '') = 'service_role');

DROP POLICY IF EXISTS "Service role reads push tokens" ON public.expo_push_tokens;
CREATE POLICY "Service role reads push tokens" ON public.expo_push_tokens
  FOR SELECT TO authenticated USING (COALESCE(auth.jwt()->>'role', '') = 'service_role');

DROP POLICY IF EXISTS "Provider owners read client contacts" ON public.provider_client_contacts;
CREATE POLICY "Provider owners read client contacts" ON public.provider_client_contacts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_client_contacts.provider_id AND p.owner_id = (SELECT auth.uid())));

-- The restrictive policy is ANDed with every permissive one, so no other route (a shared helper, a public catalogue rule, a
-- policy added later) gives a console session these rows. Only tables a signed-in user can select at all get one.
DO $gov2$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('profiles', 'id = (SELECT auth.uid())'),
      ('consents', 'user_id = (SELECT auth.uid())'),
      ('data_subject_requests', 'user_id = (SELECT auth.uid())'),
      ('payout_requests', 'FALSE'),
      ('payout_allocations', 'FALSE'),
      ('transactional_ledger', 'FALSE'),
      ('wallet_credits', 'customer_id = (SELECT auth.uid())'),
      ('wallet_credit_redemptions', 'customer_id = (SELECT auth.uid())'),
      ('gift_cards', 'purchaser_id = (SELECT auth.uid())'),
      ('gift_card_redemptions', 'customer_id = (SELECT auth.uid())'),
      ('invoices', 'customer_id = (SELECT auth.uid())'),
      ('provider_fee_invoices', 'FALSE'),
      ('message_log', 'recipient_id = (SELECT auth.uid())'),
      ('message_queue', 'recipient_id = (SELECT auth.uid())'),
      ('notifications', 'user_id = (SELECT auth.uid())'),
      ('conversations', 'customer_id = (SELECT auth.uid())'),
      ('messages', 'FALSE'),
      ('whatsapp_conversations', 'FALSE'),
      ('whatsapp_messages', 'FALSE'),
      ('whatsapp_contact_addresses', 'FALSE'),
      -- Active staff are the public catalogue (name, title, photo); everything else about staff goes through functions.
      ('employees', 'is_active'),
      ('booking_home_addresses', 'FALSE'),
      ('walk_in_booking_details', 'FALSE'),
      ('provider_client_contacts', 'FALSE'),
      ('client_profiles', 'client_id = (SELECT auth.uid())'),
      ('intake_answers', 'customer_id = (SELECT auth.uid())'),
      ('intake_submissions', 'customer_id = (SELECT auth.uid())'),
      ('patch_test_results', 'customer_id = (SELECT auth.uid())'),
      ('expo_push_tokens', 'user_id = (SELECT auth.uid())'),
      ('analytics_events', 'FALSE')
    ) AS t(tbl, own_rows)
  LOOP
    CONTINUE WHEN to_regclass('public.' || r.tbl) IS NULL;
    CONTINUE WHEN NOT has_any_column_privilege('authenticated', ('public.' || r.tbl)::regclass, 'SELECT');
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Console sessions read only through audited functions', r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT (SELECT public.is_admin()) OR (%s))',
                   'Console sessions read only through audited functions', r.tbl, r.own_rows);
  END LOOP;
END $gov2$;

-- Reconciliation runs are platform-level money figures: finance and owner only.
DROP POLICY IF EXISTS "Reconciliation runs need the ledger permission" ON public.psp_reconciliation_runs;
CREATE POLICY "Reconciliation runs need the ledger permission" ON public.psp_reconciliation_runs
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT (SELECT public.is_admin()) OR (SELECT public.admin_can('money.ledger')));

-- Tables that now have no permissive write policy for signed-in users keep no write privilege either.
DO $gov2$
DECLARE
  r RECORD;
  c RECORD;
  p RECORD;
BEGIN
  FOR r IN SELECT unnest(ARRAY['transactional_ledger', 'wallet_credits', 'gift_cards', 'gift_card_redemptions', 'payout_allocations',
                               'provider_fee_invoices', 'message_log', 'message_queue']) AS tbl
  LOOP
    FOR c IN SELECT * FROM (VALUES ('INSERT', 'a'), ('UPDATE', 'w'), ('DELETE', 'd')) AS v(name, code)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_policy pol
         WHERE pol.polrelid = ('public.' || r.tbl)::regclass AND pol.polpermissive
           AND (pol.polcmd = c.code OR pol.polcmd = '*')
           AND (pol.polroles = '{0}'::oid[] OR (SELECT oid FROM pg_roles WHERE rolname = 'authenticated') = ANY (pol.polroles))
      ) THEN
        EXECUTE format('REVOKE %s ON public.%I FROM authenticated', c.name, r.tbl);
        -- A restrictive guard on a command nobody can run any more guards nothing; it goes with the privilege.
        FOR p IN SELECT pol.polname FROM pg_policy pol
                  WHERE pol.polrelid = ('public.' || r.tbl)::regclass AND NOT pol.polpermissive AND pol.polcmd = c.code
        LOOP
          EXECUTE format('DROP POLICY %I ON public.%I', p.polname, r.tbl);
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
END $gov2$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Shared provider helpers: an administrator passes only with operations.write (no analyst or finance changes)
-- ---------------------------------------------------------------------------------------------------------------------

SELECT pg_temp.patch_function('public.can_access_provider_operation(uuid, uuid, text)'::regprocedure,
  $q$AND (public.is_admin() OR EXISTS ($q$, $q$AND (public.admin_can('operations.write') OR EXISTS ($q$);
SELECT pg_temp.patch_function('public.can_access_provider_wide(uuid, text)'::regprocedure,
  $q$AND (public.is_admin() OR EXISTS ($q$, $q$AND (public.admin_can('operations.write') OR EXISTS ($q$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Existing audited reads: scope by console permission
-- ---------------------------------------------------------------------------------------------------------------------

SELECT pg_temp.patch_function('public.admin_customer_overview(text, integer, integer)'::regprocedure,
  $q$  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;$q$,
  $q$  PERFORM public.gov2_require_read(ARRAY['personal.read'], 'customer personal data');$q$);

SELECT pg_temp.patch_function('public.admin_booking_directory(text, text, date, date, integer, integer)'::regprocedure,
  $q$  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;$q$,
  $q$  PERFORM public.gov2_require_read(ARRAY['personal.read', 'money.ledger'], 'bookings with customer names');$q$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Audited read functions
-- ---------------------------------------------------------------------------------------------------------------------

-- Data subject requests: open requests (oldest deadline first) or closed ones (latest decision first).
CREATE OR REPLACE FUNCTION public.admin_list_data_requests(p_state TEXT DEFAULT 'open', p_limit INTEGER DEFAULT 50,
                                                           p_offset INTEGER DEFAULT 0, p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_purpose TEXT;
  v_statuses TEXT[];
  v_total BIGINT;
  v_rows JSONB;
  v_ids UUID[];
BEGIN
  PERFORM public.gov2_require_read(ARRAY['personal.read'], 'data subject requests');
  v_purpose := public.gov2_read_purpose(p_purpose, 'privacy_request');
  IF p_state = 'open' THEN v_statuses := ARRAY['pending', 'in_progress'];
  ELSIF p_state = 'closed' THEN v_statuses := ARRAY['completed', 'rejected'];
  ELSE RAISE EXCEPTION 'The state must be open or closed' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_total FROM public.data_subject_requests WHERE status = ANY (v_statuses);
  SELECT COALESCE(jsonb_agg(to_jsonb(x) - 'sort_a' - 'sort_b' ORDER BY x.sort_a, x.sort_b DESC, x.id), '[]'::jsonb),
         COALESCE(array_agg(x.user_id), '{}'::uuid[])
    INTO v_rows, v_ids
    FROM (
      SELECT d.id, d.user_id, d.request_type, d.status, d.details, d.due_date, d.admin_notes, d.reviewed_at, d.created_at,
             jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name) AS profiles,
             CASE WHEN p_state = 'open' THEN d.due_date END AS sort_a,
             CASE WHEN p_state = 'closed' THEN d.reviewed_at END AS sort_b
        FROM public.data_subject_requests d
        LEFT JOIN public.profiles p ON p.id = d.user_id
       WHERE d.status = ANY (v_statuses)
       ORDER BY sort_a ASC NULLS LAST, sort_b DESC NULLS LAST, d.id
       LIMIT v_limit OFFSET v_offset
    ) x;

  PERFORM public.gov2_log_read('data_requests.listed', 'data_subject_requests', v_ids,
    ARRAY['request_type', 'status', 'details', 'due_date', 'admin_notes', 'first_name', 'last_name'], v_purpose,
    jsonb_build_object('state', p_state, 'limit', v_limit, 'offset', v_offset), jsonb_array_length(v_rows));
  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;

-- Recorded consents, latest first, optionally for one person.
CREATE OR REPLACE FUNCTION public.admin_list_consents(p_user_id UUID DEFAULT NULL, p_limit INTEGER DEFAULT 50,
                                                      p_offset INTEGER DEFAULT 0, p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_purpose TEXT;
  v_total BIGINT;
  v_rows JSONB;
  v_ids UUID[];
BEGIN
  PERFORM public.gov2_require_read(ARRAY['personal.read'], 'consent records');
  v_purpose := public.gov2_read_purpose(p_purpose, 'privacy_request');
  SELECT count(*) INTO v_total FROM public.consents WHERE p_user_id IS NULL OR user_id = p_user_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id), '[]'::jsonb), COALESCE(array_agg(x.user_id), '{}'::uuid[])
    INTO v_rows, v_ids
    FROM (
      SELECT c.id, c.user_id, c.purpose, c.status, c.document_version, c.method, c.created_at
        FROM public.consents c
       WHERE p_user_id IS NULL OR c.user_id = p_user_id
       ORDER BY c.created_at DESC, c.id
       LIMIT v_limit OFFSET v_offset
    ) x;
  PERFORM public.gov2_log_read('consents.listed', 'consents', COALESCE(ARRAY[p_user_id], v_ids),
    ARRAY['purpose', 'status', 'document_version', 'method'], v_purpose,
    jsonb_build_object('user_id', p_user_id, 'limit', v_limit, 'offset', v_offset), jsonb_array_length(v_rows));
  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;

-- Ledger rows with the filter totals. Dates are Riyadh calendar days.
CREATE OR REPLACE FUNCTION public.admin_list_ledger_entries(p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL,
                                                            p_provider_id UUID DEFAULT NULL, p_payout_status TEXT DEFAULT NULL,
                                                            p_limit INTEGER DEFAULT 100, p_offset INTEGER DEFAULT 0,
                                                            p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_status TEXT := NULLIF(btrim(COALESCE(p_payout_status, '')), '');
  v_purpose TEXT;
  v_summary JSONB;
  v_rows JSONB;
  v_ids UUID[];
BEGIN
  PERFORM public.gov2_require_read(ARRAY['money.ledger'], 'the ledger');
  v_purpose := public.gov2_read_purpose(p_purpose, 'finance_operations');
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'The start date is after the end date' USING ERRCODE = '22023';
  END IF;

  WITH hits AS (
    SELECT tl.*, COALESCE(tl.provider_id, br.provider_id) AS owner_provider_id, b.invoice_number
      FROM public.transactional_ledger tl
      LEFT JOIN public.bookings b ON b.id = tl.booking_id
      LEFT JOIN public.branches br ON br.id = b.branch_id
     WHERE (p_from IS NULL OR tl.created_at >= (p_from::timestamp AT TIME ZONE 'Asia/Riyadh'))
       AND (p_to IS NULL OR tl.created_at < ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Riyadh'))
       AND (v_status IS NULL OR tl.payout_status = v_status)
       AND (p_provider_id IS NULL OR COALESCE(tl.provider_id, br.provider_id) = p_provider_id)
  ), page AS (
    SELECT * FROM hits ORDER BY created_at DESC, id LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object('total', (SELECT count(*) FROM hits),
                            'total_captured', (SELECT COALESCE(sum(total_captured), 0) FROM hits),
                            'platform_share', (SELECT COALESCE(sum(platform_share), 0) FROM hits),
                            'provider_share', (SELECT COALESCE(sum(provider_share), 0) FROM hits)),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'id', p.id, 'booking_id', p.booking_id, 'invoice_number', p.invoice_number, 'payment_intent_id', p.payment_intent_id,
                   'entry_type', p.entry_type, 'provider_id', p.owner_provider_id, 'total_captured', p.total_captured,
                   'platform_share', p.platform_share, 'provider_share', p.provider_share, 'employee_share', p.employee_share,
                   'refunded_amount', p.refunded_amount, 'payout_status', p.payout_status, 'created_at', p.created_at,
                   'providers', (SELECT jsonb_build_object('business_name_en', pr.business_name_en, 'business_name_ar', pr.business_name_ar)
                                   FROM public.providers pr WHERE pr.id = p.owner_provider_id))
                 ORDER BY p.created_at DESC, p.id), '[]'::jsonb) FROM page p),
         (SELECT COALESCE(array_agg(p.id), '{}'::uuid[]) FROM page p)
    INTO v_summary, v_rows, v_ids;

  PERFORM public.gov2_log_read('ledger.listed', 'transactional_ledger', v_ids,
    ARRAY['amounts', 'payout_status', 'payment_intent_id', 'invoice_number'], v_purpose,
    jsonb_build_object('from', p_from, 'to', p_to, 'provider_id', p_provider_id, 'payout_status', v_status,
                       'limit', v_limit, 'offset', v_offset), jsonb_array_length(v_rows));
  RETURN v_summary || jsonb_build_object('rows', v_rows);
END;
$$;

-- Payout requests with the masked account only (Q3: the IBAN is never in a list).
CREATE OR REPLACE FUNCTION public.admin_list_payout_requests(p_status TEXT DEFAULT NULL, p_provider_id UUID DEFAULT NULL,
                                                             p_limit INTEGER DEFAULT 100, p_offset INTEGER DEFAULT 0,
                                                             p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_status TEXT := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_purpose TEXT;
  v_total BIGINT;
  v_rows JSONB;
  v_ids UUID[];
BEGIN
  PERFORM public.gov2_require_read(ARRAY['money.ledger', 'money.payout'], 'payout requests');
  v_purpose := public.gov2_read_purpose(p_purpose, 'payout_review');
  SELECT count(*) INTO v_total FROM public.payout_requests r
   WHERE (v_status IS NULL OR r.status = v_status) AND (p_provider_id IS NULL OR r.provider_id = p_provider_id);
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.requested_at DESC, x.id), '[]'::jsonb), COALESCE(array_agg(x.id), '{}'::uuid[])
    INTO v_rows, v_ids
    FROM (
      SELECT r.id, r.provider_id, r.amount, r.bank_name, r.iban_masked, r.status, r.admin_note, r.requested_at, r.processed_at,
             jsonb_build_object('business_name_en', pr.business_name_en, 'business_name_ar', pr.business_name_ar) AS providers
        FROM public.payout_requests r
        LEFT JOIN public.providers pr ON pr.id = r.provider_id
       WHERE (v_status IS NULL OR r.status = v_status) AND (p_provider_id IS NULL OR r.provider_id = p_provider_id)
       ORDER BY r.requested_at DESC, r.id
       LIMIT v_limit OFFSET v_offset
    ) x;
  PERFORM public.gov2_log_read('payout_requests.listed', 'payout_requests', v_ids,
    ARRAY['amount', 'bank_name', 'iban_masked', 'status', 'admin_note'], v_purpose,
    jsonb_build_object('status', v_status, 'provider_id', p_provider_id, 'limit', v_limit, 'offset', v_offset),
    jsonb_array_length(v_rows));
  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;

-- Monthly statements: VAT by provider and branch, settlements by provider, staff earnings by employee.
CREATE OR REPLACE FUNCTION public.admin_finance_summary(p_kind TEXT, p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL,
                                                        p_provider_id UUID DEFAULT NULL, p_limit INTEGER DEFAULT 100,
                                                        p_offset INTEGER DEFAULT 0, p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_from DATE := date_trunc('month', p_from)::date;
  v_to DATE := date_trunc('month', p_to)::date;
  v_purpose TEXT;
  v_total BIGINT;
  v_rows JSONB;
  v_ids UUID[];
BEGIN
  PERFORM public.gov2_require_read(ARRAY['money.ledger'], 'financial statements');
  v_purpose := public.gov2_read_purpose(p_purpose, 'finance_operations');
  IF p_kind = 'vat' THEN
    SELECT count(*) INTO v_total FROM public.monthly_vat_summary v
     WHERE (v_from IS NULL OR v.month_start >= v_from) AND (v_to IS NULL OR v.month_start <= v_to)
       AND (p_provider_id IS NULL OR v.provider_id = p_provider_id);
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.month_start DESC, x.provider_id, x.branch_id), '[]'::jsonb),
           COALESCE(array_agg(DISTINCT x.provider_id), '{}'::uuid[])
      INTO v_rows, v_ids
      FROM (
        SELECT v.month_start, v.provider_id, v.branch_id, v.total_bookings, v.total_vat_collected, v.total_sales,
               jsonb_build_object('business_name_en', pr.business_name_en, 'business_name_ar', pr.business_name_ar) AS providers,
               jsonb_build_object('name_en', br.name_en, 'name_ar', br.name_ar) AS branches
          FROM public.monthly_vat_summary v
          LEFT JOIN public.providers pr ON pr.id = v.provider_id
          LEFT JOIN public.branches br ON br.id = v.branch_id
         WHERE (v_from IS NULL OR v.month_start >= v_from) AND (v_to IS NULL OR v.month_start <= v_to)
           AND (p_provider_id IS NULL OR v.provider_id = p_provider_id)
         ORDER BY v.month_start DESC, v.provider_id, v.branch_id
         LIMIT v_limit OFFSET v_offset
      ) x;
  ELSIF p_kind = 'settlement' THEN
    SELECT count(*) INTO v_total FROM public.provider_settlement_summary s
     WHERE (v_from IS NULL OR s.month_start >= v_from) AND (v_to IS NULL OR s.month_start <= v_to)
       AND (p_provider_id IS NULL OR s.provider_id = p_provider_id);
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.month_start DESC, x.provider_id), '[]'::jsonb),
           COALESCE(array_agg(DISTINCT x.provider_id), '{}'::uuid[])
      INTO v_rows, v_ids
      FROM (
        SELECT s.month_start, s.provider_id, s.total_transactions, s.gross_captured_volume, s.platform_share_collected,
               s.provider_share_expected, s.provider_share_released,
               jsonb_build_object('business_name_en', pr.business_name_en, 'business_name_ar', pr.business_name_ar) AS providers
          FROM public.provider_settlement_summary s
          LEFT JOIN public.providers pr ON pr.id = s.provider_id
         WHERE (v_from IS NULL OR s.month_start >= v_from) AND (v_to IS NULL OR s.month_start <= v_to)
           AND (p_provider_id IS NULL OR s.provider_id = p_provider_id)
         ORDER BY s.month_start DESC, s.provider_id
         LIMIT v_limit OFFSET v_offset
      ) x;
  ELSIF p_kind = 'employee_earnings' THEN
    SELECT count(*) INTO v_total FROM public.employee_earnings_summary s
      JOIN public.employees e ON e.id = s.employee_id JOIN public.branches br ON br.id = e.branch_id
     WHERE (v_from IS NULL OR s.month_start >= v_from) AND (v_to IS NULL OR s.month_start <= v_to)
       AND (p_provider_id IS NULL OR br.provider_id = p_provider_id);
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.month_start DESC, x.employee_id), '[]'::jsonb),
           COALESCE(array_agg(DISTINCT x.employee_id), '{}'::uuid[])
      INTO v_rows, v_ids
      FROM (
        SELECT s.month_start, s.employee_id, s.total_completed_bookings, s.total_employee_earnings,
               jsonb_build_object('name_en', e.name_en, 'name_ar', e.name_ar) AS employees
          FROM public.employee_earnings_summary s
          JOIN public.employees e ON e.id = s.employee_id
          JOIN public.branches br ON br.id = e.branch_id
         WHERE (v_from IS NULL OR s.month_start >= v_from) AND (v_to IS NULL OR s.month_start <= v_to)
           AND (p_provider_id IS NULL OR br.provider_id = p_provider_id)
         ORDER BY s.month_start DESC, s.employee_id
         LIMIT v_limit OFFSET v_offset
      ) x;
  ELSE
    RAISE EXCEPTION 'Unknown statement %', p_kind USING ERRCODE = '22023';
  END IF;
  PERFORM public.gov2_log_read('finance_summary.viewed', CASE p_kind WHEN 'employee_earnings' THEN 'employees' ELSE 'providers' END,
    v_ids, ARRAY['monthly_totals'], v_purpose,
    jsonb_build_object('kind', p_kind, 'from', v_from, 'to', v_to, 'provider_id', p_provider_id, 'limit', v_limit, 'offset', v_offset),
    jsonb_array_length(v_rows));
  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;

-- Monthly platform-fee invoices issued to providers.
CREATE OR REPLACE FUNCTION public.admin_list_fee_invoices(p_status TEXT DEFAULT NULL, p_provider_id UUID DEFAULT NULL,
                                                          p_limit INTEGER DEFAULT 100, p_offset INTEGER DEFAULT 0,
                                                          p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_status TEXT := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_purpose TEXT;
  v_total BIGINT;
  v_rows JSONB;
  v_ids UUID[];
BEGIN
  PERFORM public.gov2_require_read(ARRAY['money.ledger'], 'provider fee invoices');
  v_purpose := public.gov2_read_purpose(p_purpose, 'finance_operations');
  SELECT count(*) INTO v_total FROM public.provider_fee_invoices f
   WHERE (v_status IS NULL OR f.status = v_status) AND (p_provider_id IS NULL OR f.provider_id = p_provider_id);
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id), '[]'::jsonb), COALESCE(array_agg(x.id), '{}'::uuid[])
    INTO v_rows, v_ids
    FROM (
      SELECT f.id, f.provider_id, f.invoice_number, f.period_start, f.period_end, f.total_bookings_count, f.gross_gmv_sar,
             f.deposit_captured_sar, f.platform_commission_sar, f.net_fee_receivable_sar, f.vat_on_commission_sar,
             f.total_invoice_due_sar, f.status, f.created_at,
             jsonb_build_object('business_name_en', pr.business_name_en, 'business_name_ar', pr.business_name_ar) AS providers
        FROM public.provider_fee_invoices f
        LEFT JOIN public.providers pr ON pr.id = f.provider_id
       WHERE (v_status IS NULL OR f.status = v_status) AND (p_provider_id IS NULL OR f.provider_id = p_provider_id)
       ORDER BY f.created_at DESC, f.id
       LIMIT v_limit OFFSET v_offset
    ) x;
  PERFORM public.gov2_log_read('fee_invoices.listed', 'provider_fee_invoices', v_ids, ARRAY['invoice_totals', 'status'], v_purpose,
    jsonb_build_object('status', v_status, 'provider_id', p_provider_id, 'limit', v_limit, 'offset', v_offset),
    jsonb_array_length(v_rows));
  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;

-- The stored tax invoice of one booking (finance or owner; Q2 item 4 restricts invoices to the finance role).
CREATE OR REPLACE FUNCTION public.admin_get_booking_invoice(p_booking_id UUID, p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purpose TEXT;
  v_invoice JSONB;
BEGIN
  PERFORM public.gov2_require_read(ARRAY['money.ledger'], 'tax invoices');
  v_purpose := public.gov2_read_purpose(p_purpose, 'finance_operations');
  SELECT to_jsonb(i) INTO v_invoice FROM public.invoices i WHERE i.booking_id = p_booking_id ORDER BY i.created_at DESC LIMIT 1;
  PERFORM public.gov2_log_read('invoice.viewed', 'invoices', ARRAY[(v_invoice->>'id')::uuid],
    ARRAY['invoice', 'buyer_name', 'amounts', 'zatca_qr_code'], v_purpose,
    jsonb_build_object('booking_id', p_booking_id), CASE WHEN v_invoice IS NULL THEN 0 ELSE 1 END);
  RETURN v_invoice;
END;
$$;

-- Financial exports, built on the server so the audit event carries the row count actually delivered (Q4 item 4).
-- Step-up within 5 minutes (Q6: data export). A period with more than 20,000 rows is refused, never cut short.
CREATE OR REPLACE FUNCTION public.admin_export_finance_report(p_report TEXT, p_from DATE, p_to DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max CONSTANT INTEGER := 20000;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_count BIGINT;
  v_rows JSONB;
BEGIN
  PERFORM public.gov2_require_read(ARRAY['money.ledger'], 'financial exports');
  IF p_report NOT IN ('payments_ledger', 'vat_summary', 'provider_settlements') THEN
    RAISE EXCEPTION 'Unknown report %', p_report USING ERRCODE = '22023';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to OR p_to - p_from > 400 THEN
    RAISE EXCEPTION 'The export period must be a valid range of at most 400 days' USING ERRCODE = '22023';
  END IF;
  PERFORM public.require_recent_mfa();
  v_start := p_from::timestamp AT TIME ZONE 'Asia/Riyadh';
  v_end := (p_to + 1)::timestamp AT TIME ZONE 'Asia/Riyadh';

  IF p_report = 'payments_ledger' THEN
    SELECT count(*) INTO v_count FROM public.transactional_ledger WHERE created_at >= v_start AND created_at < v_end;
    IF v_count > v_max THEN
      RAISE EXCEPTION 'This period has more than % rows. Choose a shorter period.', v_max USING ERRCODE = '54000', HINT = 'too_many_rows';
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'created_at', tl.created_at, 'invoice_number', b.invoice_number, 'provider_name', pr.business_name_en,
             'entry_type', tl.entry_type, 'payment_intent_id', tl.payment_intent_id, 'total_captured', tl.total_captured,
             'platform_share', tl.platform_share, 'provider_share', tl.provider_share, 'employee_share', tl.employee_share,
             'refunded_amount', tl.refunded_amount, 'payout_status', tl.payout_status) ORDER BY tl.created_at, tl.id), '[]'::jsonb)
      INTO v_rows
      FROM public.transactional_ledger tl
      LEFT JOIN public.bookings b ON b.id = tl.booking_id
      LEFT JOIN public.branches br ON br.id = b.branch_id
      LEFT JOIN public.providers pr ON pr.id = COALESCE(tl.provider_id, br.provider_id)
     WHERE tl.created_at >= v_start AND tl.created_at < v_end;
  ELSIF p_report = 'vat_summary' THEN
    SELECT count(*) INTO v_count FROM public.monthly_vat_summary
     WHERE month_start BETWEEN date_trunc('month', p_from)::date AND date_trunc('month', p_to)::date;
    IF v_count > v_max THEN
      RAISE EXCEPTION 'This period has more than % rows. Choose a shorter period.', v_max USING ERRCODE = '54000', HINT = 'too_many_rows';
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'month_start', v.month_start, 'provider_name', pr.business_name_en, 'branch_name', br.name_en,
             'total_bookings', v.total_bookings, 'total_sales', v.total_sales, 'total_vat_collected', v.total_vat_collected)
             ORDER BY v.month_start, v.provider_id, v.branch_id), '[]'::jsonb)
      INTO v_rows
      FROM public.monthly_vat_summary v
      LEFT JOIN public.providers pr ON pr.id = v.provider_id
      LEFT JOIN public.branches br ON br.id = v.branch_id
     WHERE v.month_start BETWEEN date_trunc('month', p_from)::date AND date_trunc('month', p_to)::date;
  ELSE
    SELECT count(*) INTO v_count FROM public.provider_settlement_summary
     WHERE month_start BETWEEN date_trunc('month', p_from)::date AND date_trunc('month', p_to)::date;
    IF v_count > v_max THEN
      RAISE EXCEPTION 'This period has more than % rows. Choose a shorter period.', v_max USING ERRCODE = '54000', HINT = 'too_many_rows';
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'month_start', s.month_start, 'provider_name', pr.business_name_en, 'total_transactions', s.total_transactions,
             'gross_captured_volume', s.gross_captured_volume, 'platform_share_collected', s.platform_share_collected,
             'provider_share_expected', s.provider_share_expected, 'provider_share_released', s.provider_share_released)
             ORDER BY s.month_start, s.provider_id), '[]'::jsonb)
      INTO v_rows
      FROM public.provider_settlement_summary s
      LEFT JOIN public.providers pr ON pr.id = s.provider_id
     WHERE s.month_start BETWEEN date_trunc('month', p_from)::date AND date_trunc('month', p_to)::date;
  END IF;

  -- Nothing is delivered for an empty period, so nothing is recorded as exported.
  IF jsonb_array_length(v_rows) > 0 THEN
    PERFORM public.gov2_log_read('report.exported', 'reports', NULL, ARRAY['report_columns'], 'finance_operations',
      jsonb_build_object('report', p_report, 'from', p_from, 'to', p_to), jsonb_array_length(v_rows));
  END IF;
  RETURN jsonb_build_object('report', p_report, 'from', p_from, 'to', p_to, 'row_count', jsonb_array_length(v_rows), 'rows', v_rows);
END;
$$;

-- The browser-supplied export count is no longer accepted: exports go through admin_export_finance_report.
REVOKE ALL ON FUNCTION public.admin_record_export(TEXT, DATE, DATE, INTEGER) FROM PUBLIC, anon, authenticated;

-- Outbound message log. The recipient number is masked to its last three digits.
CREATE OR REPLACE FUNCTION public.admin_list_message_log(p_status TEXT DEFAULT NULL, p_channel TEXT DEFAULT NULL,
                                                         p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0,
                                                         p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_status TEXT := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_channel TEXT := NULLIF(btrim(COALESCE(p_channel, '')), '');
  v_purpose TEXT;
  v_total BIGINT;
  v_rows JSONB;
  v_ids UUID[];
BEGIN
  PERFORM public.gov2_require_read(ARRAY['personal.read'], 'the message log');
  v_purpose := public.gov2_read_purpose(p_purpose, 'messaging_operations');
  SELECT count(*) INTO v_total FROM public.message_log m
   WHERE (v_status IS NULL OR m.status = v_status) AND (v_channel IS NULL OR m.channel = v_channel);
  SELECT COALESCE(jsonb_agg(to_jsonb(x) - 'recipient_id' ORDER BY x.sent_at DESC NULLS LAST, x.id), '[]'::jsonb),
         COALESCE(array_agg(x.recipient_id), '{}'::uuid[])
    INTO v_rows, v_ids
    FROM (
      SELECT m.id, m.recipient_id,
             CASE WHEN m.recipient_phone IS NULL THEN NULL
                  ELSE repeat('•', GREATEST(char_length(m.recipient_phone) - 3, 0)) || right(m.recipient_phone, 3) END AS recipient_phone,
             m.channel, m.template_name, m.locale, m.message_body, m.status, m.cost_sar, m.sent_at, m.error_details
        FROM public.message_log m
       WHERE (v_status IS NULL OR m.status = v_status) AND (v_channel IS NULL OR m.channel = v_channel)
       ORDER BY m.sent_at DESC NULLS LAST, m.id
       LIMIT v_limit OFFSET v_offset
    ) x;
  PERFORM public.gov2_log_read('message_log.listed', 'message_log', v_ids,
    ARRAY['recipient_phone_masked', 'message_body', 'status', 'error_details'], v_purpose,
    jsonb_build_object('status', v_status, 'channel', v_channel, 'limit', v_limit, 'offset', v_offset), jsonb_array_length(v_rows));
  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;

-- Queue sizes only (an aggregate: not logged under D4).
CREATE OR REPLACE FUNCTION public.admin_message_queue_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'pending', (SELECT count(*) FROM public.message_queue WHERE status = 'pending'),
    'deferred', (SELECT count(*) FROM public.message_queue WHERE status = 'deferred_quiet_hours'));
END;
$$;

-- Staff directory with each person's recorded outcomes. Earnings are money: shown only to a role holding money.ledger.
CREATE OR REPLACE FUNCTION public.admin_list_employees(p_search TEXT DEFAULT NULL, p_status TEXT DEFAULT NULL,
                                                       p_provider_id UUID DEFAULT NULL, p_limit INTEGER DEFAULT 25,
                                                       p_offset INTEGER DEFAULT 0, p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 200);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_search TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_status TEXT := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_pattern TEXT;
  v_money BOOLEAN := public.admin_can('money.ledger');
  v_purpose TEXT;
  v_total BIGINT;
  v_rows JSONB;
  v_ids UUID[];
BEGIN
  PERFORM public.gov2_require_read(ARRAY['personal.read'], 'staff records');
  v_purpose := public.gov2_read_purpose(p_purpose, 'staff_administration');
  IF v_status IS NOT NULL AND v_status NOT IN ('all', 'active', 'inactive') THEN
    RAISE EXCEPTION 'The status must be all, active or inactive' USING ERRCODE = '22023';
  END IF;
  IF v_search IS NOT NULL THEN
    v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  WITH hits AS (
    SELECT e.*, br.name_en AS branch_name_en, br.name_ar AS branch_name_ar, br.provider_id,
           pr.business_name_en, pr.business_name_ar
      FROM public.employees e
      JOIN public.branches br ON br.id = e.branch_id
      LEFT JOIN public.providers pr ON pr.id = br.provider_id
     WHERE (v_status IS NULL OR v_status = 'all' OR (v_status = 'active' AND e.is_active) OR (v_status = 'inactive' AND NOT COALESCE(e.is_active, FALSE)))
       AND (p_provider_id IS NULL OR br.provider_id = p_provider_id)
       AND (v_pattern IS NULL OR COALESCE(e.name_en, '') ILIKE v_pattern OR COALESCE(e.name_ar, '') ILIKE v_pattern
            OR COALESCE(e.title_en, '') ILIKE v_pattern OR COALESCE(e.title_ar, '') ILIKE v_pattern)
  ), page AS (
    SELECT * FROM hits ORDER BY name_en ASC NULLS LAST, id LIMIT v_limit OFFSET v_offset
  )
  SELECT (SELECT count(*) FROM hits),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'id', p.id, 'name_en', p.name_en, 'name_ar', p.name_ar, 'title_en', p.title_en, 'title_ar', p.title_ar,
                   'is_active', p.is_active, 'photo_url', p.photo_url, 'work_type', p.work_type,
                   'branches', jsonb_build_object('name_en', p.branch_name_en, 'name_ar', p.branch_name_ar, 'provider_id', p.provider_id,
                     'providers', jsonb_build_object('business_name_en', p.business_name_en, 'business_name_ar', p.business_name_ar)),
                   'performance', (SELECT jsonb_build_object('completed_bookings', ep.completed_bookings,
                                     'employee_earnings', CASE WHEN v_money THEN ep.employee_earnings END,
                                     'review_count', ep.review_count, 'rating_sum', ep.rating_sum)
                                     FROM public.admin_employee_performance ep WHERE ep.employee_id = p.id))
                 ORDER BY p.name_en ASC NULLS LAST, p.id), '[]'::jsonb) FROM page p),
         (SELECT COALESCE(array_agg(p.id), '{}'::uuid[]) FROM page p)
    INTO v_total, v_rows, v_ids;

  PERFORM public.gov2_log_read('employees.listed', 'employees', v_ids,
    CASE WHEN v_money THEN ARRAY['name', 'title', 'status', 'performance', 'earnings'] ELSE ARRAY['name', 'title', 'status', 'performance'] END,
    v_purpose, jsonb_build_object('searched', v_search IS NOT NULL, 'status', v_status, 'provider_id', p_provider_id,
                                  'limit', v_limit, 'offset', v_offset), jsonb_array_length(v_rows));
  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;

-- Per-employee figures for the provider screens (rows describe one person each, so the read is logged).
CREATE OR REPLACE FUNCTION public.admin_employee_performance_report(p_provider_id UUID DEFAULT NULL, p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_money BOOLEAN := public.admin_can('money.ledger');
  v_purpose TEXT;
  v_rows JSONB;
  v_ids UUID[];
BEGIN
  PERFORM public.gov2_require_read(ARRAY['personal.read', 'money.ledger'], 'staff performance');
  v_purpose := public.gov2_read_purpose(p_purpose, 'provider_onboarding');
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'employee_id', ep.employee_id, 'branch_id', ep.branch_id, 'provider_id', ep.provider_id,
           'completed_bookings', ep.completed_bookings, 'cancelled_bookings', ep.cancelled_bookings,
           'no_show_bookings', ep.no_show_bookings, 'gross_revenue', ep.gross_revenue, 'commission_amount', ep.commission_amount,
           'employee_earnings', CASE WHEN v_money THEN ep.employee_earnings END,
           'review_count', ep.review_count, 'rating_sum', ep.rating_sum, 'repeat_customers', ep.repeat_customers)
           ORDER BY ep.provider_id, ep.employee_id), '[]'::jsonb),
         COALESCE(array_agg(ep.employee_id), '{}'::uuid[])
    INTO v_rows, v_ids
    FROM public.admin_employee_performance ep
   WHERE p_provider_id IS NULL OR ep.provider_id = p_provider_id;
  PERFORM public.gov2_log_read('employee_performance.viewed', 'employees', v_ids,
    CASE WHEN v_money THEN ARRAY['booking_counts', 'revenue', 'reviews', 'earnings'] ELSE ARRAY['booking_counts', 'revenue', 'reviews'] END,
    v_purpose, jsonb_build_object('provider_id', p_provider_id), jsonb_array_length(v_rows));
  RETURN v_rows;
END;
$$;

-- Provider applications with the applicant's name and contact details.
CREATE OR REPLACE FUNCTION public.admin_list_provider_applications(p_status TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 200,
                                                                   p_offset INTEGER DEFAULT 0, p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_status TEXT := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_purpose TEXT;
  v_total BIGINT;
  v_rows JSONB;
  v_ids UUID[];
BEGIN
  PERFORM public.gov2_require_read(ARRAY['personal.read'], 'provider applications');
  v_purpose := public.gov2_read_purpose(p_purpose, 'provider_onboarding');
  SELECT count(*) INTO v_total FROM public.provider_applications a WHERE v_status IS NULL OR a.status::text = v_status;
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id), '[]'::jsonb), COALESCE(array_agg(x.user_id), '{}'::uuid[])
    INTO v_rows, v_ids
    FROM (
      SELECT a.id, a.user_id, p.first_name, p.last_name, a.business_name_en, a.business_name_ar, a.business_type, a.cr_number,
             a.tax_number, a.contact_email, a.contact_phone, a.city, a.district, a.address_text, a.trade_license_url, a.status,
             a.rejection_reason, a.admin_notes, a.reviewed_by, a.reviewed_at, a.created_at, a.updated_at,
             a.cr_verification_status, a.cr_check_data
        FROM public.provider_applications a
        LEFT JOIN public.profiles p ON p.id = a.user_id
       WHERE v_status IS NULL OR a.status::text = v_status
       ORDER BY a.created_at DESC, a.id
       LIMIT v_limit OFFSET v_offset
    ) x;
  PERFORM public.gov2_log_read('provider_applications.listed', 'provider_applications', v_ids,
    ARRAY['applicant_name', 'contact_email', 'contact_phone', 'address', 'cr_number', 'tax_number'], v_purpose,
    jsonb_build_object('status', v_status, 'limit', v_limit, 'offset', v_offset), jsonb_array_length(v_rows));
  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;

-- Names of the people behind audit entries and moderation or dispute rows. Console staff are colleagues and their names
-- are returned to any console session without a log entry; anyone else needs personal.read (or a money permission for a
-- dispute) and the lookup is logged with the ids it resolved.
CREATE OR REPLACE FUNCTION public.admin_people_names(p_ids UUID[], p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[] := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_ids, '{}'::uuid[])) x WHERE x IS NOT NULL);
  v_purpose TEXT;
  v_personal BOOLEAN;
  v_staff JSONB;
  v_others JSONB := '[]'::jsonb;
  v_other_ids UUID[];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  v_purpose := public.gov2_read_purpose(p_purpose, 'audit_review');
  IF cardinality(v_ids) > 500 THEN
    RAISE EXCEPTION 'At most 500 people can be looked up at once' USING ERRCODE = '22023';
  END IF;
  v_personal := public.admin_can('personal.read')
             OR (v_purpose = 'dispute_resolution' AND (public.admin_can('money.refund') OR public.admin_can('money.ledger')));

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'email', p.email,
                                               'staff', TRUE) ORDER BY p.id), '[]'::jsonb)
    INTO v_staff
    FROM public.profiles p
   WHERE p.id = ANY (v_ids) AND EXISTS (SELECT 1 FROM public.admin_role_assignments a WHERE a.user_id = p.id);

  IF v_personal THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'staff', FALSE)
                              ORDER BY p.id), '[]'::jsonb),
           COALESCE(array_agg(p.id), '{}'::uuid[])
      INTO v_others, v_other_ids
      FROM public.profiles p
     WHERE p.id = ANY (v_ids) AND NOT EXISTS (SELECT 1 FROM public.admin_role_assignments a WHERE a.user_id = p.id);
    IF cardinality(v_other_ids) > 0 THEN
      PERFORM public.gov2_log_read('people.names_viewed', 'profiles', v_other_ids, ARRAY['first_name', 'last_name'], v_purpose,
        jsonb_build_object('requested', cardinality(v_ids)), cardinality(v_other_ids));
    END IF;
  END IF;
  RETURN v_staff || v_others;
END;
$$;

-- Health-intake answers: the only administrator path (Q4 item 2, Q2 item 6). No DPO console role exists, so this is
-- owner-only until one is created (gap dpo-role-not-defined).
CREATE OR REPLACE FUNCTION public.read_intake_answers_break_glass(p_submission_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  s public.intake_submissions;
  v_answers JSONB;
  v_fields JSONB;
  v_owner RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.admin_can('health.break_glass') THEN
    RAISE EXCEPTION 'Only the data protection break-glass holder can read health answers' USING ERRCODE = '42501';
  END IF;
  PERFORM public.require_recent_mfa();
  IF v_reason IS NULL OR char_length(v_reason) < 20 THEN
    RAISE EXCEPTION 'A written reason of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM public.intake_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Intake submission not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT a.answers INTO v_answers FROM public.intake_answers a WHERE a.submission_id = s.id;
  SELECT v.fields INTO v_fields FROM public.intake_form_template_versions v WHERE v.id = s.template_version_id;

  -- The audit event and the alert name the submission and the reason, never an answer.
  PERFORM public.gov2_log_read('intake.break_glass_read', 'intake_submissions', ARRAY[s.id], ARRAY['answers'], 'privacy_request',
    jsonb_build_object('reason', v_reason, 'booking_id', s.booking_id, 'customer_id', s.customer_id,
                       'answers_present', v_answers IS NOT NULL), CASE WHEN v_answers IS NULL THEN 0 ELSE 1 END);
  INSERT INTO public.security_alerts (kind, user_id, details)
  VALUES ('health_break_glass', auth.uid(), jsonb_build_object('submission_id', s.id, 'booking_id', s.booking_id, 'reason', v_reason));
  FOR v_owner IN
    SELECT a.user_id FROM public.admin_role_assignments a WHERE a.admin_role = 'owner' AND a.user_id <> auth.uid()
  LOOP
    PERFORM public.queue_governance_notice(v_owner.user_id, 'health_break_glass_used',
      jsonb_build_object('submission_id', s.id, 'actor_id', auth.uid()));
  END LOOP;

  RETURN jsonb_build_object('submission_id', s.id, 'booking_id', s.booking_id, 'status', s.status,
    'template_version', s.template_version, 'fields', v_fields, 'answers', v_answers, 'answers_removed_at', s.answers_removed_at);
END;
$$;

DO $gov2$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.admin_list_data_requests(text, integer, integer, text)',
    'public.admin_list_consents(uuid, integer, integer, text)',
    'public.admin_list_ledger_entries(date, date, uuid, text, integer, integer, text)',
    'public.admin_list_payout_requests(text, uuid, integer, integer, text)',
    'public.admin_finance_summary(text, date, date, uuid, integer, integer, text)',
    'public.admin_list_fee_invoices(text, uuid, integer, integer, text)',
    'public.admin_get_booking_invoice(uuid, text)',
    'public.admin_export_finance_report(text, date, date)',
    'public.admin_list_message_log(text, text, integer, integer, text)',
    'public.admin_message_queue_summary()',
    'public.admin_list_employees(text, text, uuid, integer, integer, text)',
    'public.admin_employee_performance_report(uuid, text)',
    'public.admin_list_provider_applications(text, integer, integer, text)',
    'public.admin_people_names(uuid[], text)',
    'public.read_intake_answers_break_glass(uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $gov2$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. D4: aggregate tiles are not logged, and a cell describing 1 to 4 people is suppressed
-- ---------------------------------------------------------------------------------------------------------------------

-- Dashboard figures: each KPI is suppressed when the number of distinct people behind it is 1 to 4. Queue counts are work
-- items and stay; a queue's money total is suppressed when fewer than 5 rows make it up.
CREATE OR REPLACE FUNCTION public.d4_suppress_dashboard(p_kpis JSONB, p_queues JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  v_day_start TIMESTAMPTZ := v_today::timestamp AT TIME ZONE 'Asia/Riyadh';
  v_kpis JSONB := p_kpis;
  v_queues JSONB := '[]'::jsonb;
  v_suppressed TEXT[] := '{}';
  v_people BIGINT;
  q JSONB;
BEGIN
  SELECT count(DISTINCT COALESCE(customer_id::text, client_profile_id::text, id::text)) INTO v_people FROM public.bookings
   WHERE scheduled_at >= v_day_start AND scheduled_at < v_day_start + interval '1 day' AND status <> 'cancelled';
  IF public.d4_is_small_cell(v_people) THEN
    v_kpis := jsonb_set(v_kpis, '{bookings_today}', 'null'::jsonb); v_suppressed := v_suppressed || 'bookings_today'::text;
  END IF;

  SELECT count(DISTINCT COALESCE(b.customer_id::text, b.client_profile_id::text, tl.booking_id::text, tl.id::text)) INTO v_people
    FROM public.transactional_ledger tl LEFT JOIN public.bookings b ON b.id = tl.booking_id
   WHERE tl.created_at >= now() - interval '7 days'
     AND COALESCE(tl.entry_type, 'booking_payment') = ANY (ARRAY['booking_payment', 'tip', 'package_sale', 'gift_card_sale', 'subscription']);
  IF public.d4_is_small_cell(v_people) THEN
    v_kpis := jsonb_set(jsonb_set(v_kpis, '{captured_7d_sar}', 'null'::jsonb), '{platform_share_7d_sar}', 'null'::jsonb);
    v_suppressed := v_suppressed || ARRAY['captured_7d_sar', 'platform_share_7d_sar'];
  END IF;

  IF public.d4_is_small_cell((p_kpis->>'live_providers')::bigint) THEN
    v_kpis := jsonb_set(v_kpis, '{live_providers}', 'null'::jsonb); v_suppressed := v_suppressed || 'live_providers'::text;
  END IF;
  IF public.d4_is_small_cell((p_kpis->>'customers')::bigint) THEN
    v_kpis := jsonb_set(v_kpis, '{customers}', 'null'::jsonb); v_suppressed := v_suppressed || 'customers'::text;
  END IF;

  SELECT count(DISTINCT COALESCE(customer_id::text, client_profile_id::text, id::text)) INTO v_people FROM public.bookings
   WHERE scheduled_at >= now() - interval '30 days' AND scheduled_at < now()
     AND (status IN ('completed', 'no_show') OR (status = 'cancelled' AND cancelled_by IS DISTINCT FROM 'system'));
  IF public.d4_is_small_cell(v_people) THEN
    v_kpis := jsonb_set(jsonb_set(v_kpis, '{completed_30d}', 'null'::jsonb), '{finished_30d}', 'null'::jsonb);
    v_suppressed := v_suppressed || ARRAY['completed_30d', 'finished_30d'];
  END IF;

  FOR q IN SELECT * FROM jsonb_array_elements(COALESCE(p_queues, '[]'::jsonb)) LOOP
    IF q ? 'amount_sar' AND public.d4_is_small_cell((q->>'count')::bigint) THEN
      q := jsonb_set(q, '{amount_sar}', 'null'::jsonb) || jsonb_build_object('amount_suppressed', TRUE);
    END IF;
    v_queues := v_queues || jsonb_build_array(q);
  END LOOP;

  RETURN jsonb_build_object('kpis', v_kpis || jsonb_build_object('suppressed', to_jsonb(v_suppressed)), 'queues', v_queues);
END;
$$;
REVOKE ALL ON FUNCTION public.d4_suppress_dashboard(JSONB, JSONB) FROM PUBLIC, anon, authenticated;

SELECT pg_temp.patch_function('public.admin_dashboard_overview()'::regprocedure,
  $q$    'kpis', v_kpis,
    'queues', v_queues,$q$,
  $q$    'small_cell_threshold', public.d4_small_cell_threshold(),
    'kpis', public.d4_suppress_dashboard(v_kpis, v_queues)->'kpis',
    'queues', public.d4_suppress_dashboard(v_kpis, v_queues)->'queues',$q$);

-- Funnel cells (one event, one source, one Riyadh day) with 1 to 4 people are suppressed.
SELECT pg_temp.patch_function('public.admin_get_event_counts(date, date)'::regprocedure,
  $q$jsonb_build_object('day', d, 'event', event, 'source', source, 'events', n, 'people', people)$q$,
  $q$jsonb_build_object('day', d, 'event', event, 'source', source,
                                'events', CASE WHEN public.d4_is_small_cell(people) THEN NULL ELSE n END,
                                'people', CASE WHEN public.d4_is_small_cell(people) THEN NULL ELSE people END,
                                'suppressed', public.d4_is_small_cell(people))$q$);

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
