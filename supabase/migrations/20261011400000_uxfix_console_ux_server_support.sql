-- UXFIX (UX review round 1, docs/reviews/2026-10-11-ux-review.md): the server side of the console fixes.
--   1. admin_session_state also answers the console-role catalogue (which role holds which permission) and how many
--      authenticator codes are left before the lockout, so the console trims navigation and actions to the signed-in role,
--      names the role that would grant a refused screen, and warns before the 10th wrong code (ux1-navigation-and-actions-
--      not-trimmed-to-console-role, ux1-forbidden-notice-blames-a-missing-administrator-role,
--      ux1-auth-and-validation-errors-shown-in-english-on-arabic-screens). It decides nothing: every command still checks.
--   2. admin_list_audit_events takes an event class (changes, reads or all) and answers the record types present, so the
--      audit log is not drowned by read events and its record-type filter follows the current schema
--      (ux1-audit-log-drowned-by-read-events). Nothing is deleted.
--   3. admin_privacy_find_customers: an audited lookup that lets privacy staff find the customer of a request received by
--      e-mail, phone or in person by name, e-mail or phone, instead of typing a full account ID shown nowhere
--      (ux1-privacy-log-request-needs-full-customer-id-shown-nowhere).
--   4. Clearing a customer's profile is erasure of the same data a privacy deletion removes, so it needs the same second
--      owner's approval (privacy.approve) through the approval inbox, never one administrator's decision
--      (ux1-clear-profile-bypasses-privacy-deletion-safeguards).

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Session state: role catalogue and codes left
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_session_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT := public.admin_role_of_account();
  v_mfa NUMERIC := public.session_amr_latest(ARRAY['totp', 'mfa/totp', 'webauthn', 'mfa/webauthn', 'phone', 'mfa/phone']);
  v_locked BOOLEAN;
  v_failed INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('signed_in', FALSE);
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.mfa_verification_failures WHERE user_id = v_uid AND locked_at IS NOT NULL) INTO v_locked;
  SELECT failed_count INTO v_failed FROM public.mfa_verification_failures WHERE user_id = v_uid;
  RETURN jsonb_build_object(
    'signed_in', TRUE,
    'is_admin_account', v_role IS NOT NULL,
    'console_role', v_role,
    'aal', COALESCE(auth.jwt()->>'aal', 'aal1'),
    'locked', v_locked,
    'session_live', public.session_is_live(),
    'active', public.is_admin(),
    'permissions', COALESCE((SELECT jsonb_agg(permission ORDER BY permission) FROM public.admin_role_permissions
                              WHERE admin_role = public.admin_role()), '[]'::jsonb),
    -- Which console role holds which permission: only for a console account, so the console can say who grants a screen.
    'role_permissions', CASE WHEN v_role IS NOT NULL THEN COALESCE((
        SELECT jsonb_object_agg(x.admin_role, x.permissions)
          FROM (SELECT admin_role, jsonb_agg(permission ORDER BY permission) AS permissions
                  FROM public.admin_role_permissions GROUP BY admin_role) x), '{}'::jsonb)
      ELSE '{}'::jsonb END,
    'mfa_attempts_left', GREATEST(0, 10 - COALESCE(v_failed, 0)),
    'step_up_valid_until', CASE WHEN v_mfa IS NOT NULL AND COALESCE(auth.jwt()->>'aal', '') = 'aal2'
                                THEN to_timestamp(v_mfa) + INTERVAL '5 minutes' END);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_session_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_session_state() TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Audit log: event class and record types
-- ---------------------------------------------------------------------------------------------------------------------
-- A read event is one written when somebody looked at data: by gov2_log_read (purpose and fields recorded) or by a read
-- function that names itself *.listed, *.viewed, *.read, *_read, *.revealed or *_downloaded.
CREATE OR REPLACE FUNCTION public.audit_event_is_read(p_action TEXT, p_details JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(p_details ? 'purpose' AND p_details ? 'fields', FALSE)
      OR COALESCE(p_action ~ '\.([a-z_]+_)?(listed|viewed|read|revealed|downloaded)$', FALSE);
$$;
REVOKE ALL ON FUNCTION public.audit_event_is_read(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_event_is_read(TEXT, JSONB) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_list_audit_events(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER, TEXT);
CREATE OR REPLACE FUNCTION public.admin_list_audit_events(
  p_action TEXT DEFAULT NULL, p_target_type TEXT DEFAULT NULL, p_from TIMESTAMPTZ DEFAULT NULL, p_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0, p_purpose TEXT DEFAULT NULL, p_event_class TEXT DEFAULT 'all')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_action TEXT := NULLIF(btrim(COALESCE(p_action, '')), '');
  v_type TEXT := NULLIF(btrim(COALESCE(p_target_type, '')), '');
  v_class TEXT := COALESCE(NULLIF(btrim(COALESCE(p_event_class, '')), ''), 'all');
  v_purpose TEXT;
  v_total BIGINT;
  v_rows JSONB;
  v_ids UUID[];
  v_types JSONB;
BEGIN
  PERFORM public.gov2_require_read(ARRAY['audit.read'], 'the audit log');
  v_purpose := public.gov2_read_purpose(p_purpose, 'audit_review');
  IF v_action IS NOT NULL AND char_length(v_action) > 80 THEN
    RAISE EXCEPTION 'The action filter is at most 80 characters' USING ERRCODE = '22023';
  END IF;
  IF v_class NOT IN ('all', 'changes', 'reads') THEN
    RAISE EXCEPTION 'The event class is all, changes or reads' USING ERRCODE = '22023';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'The From date must not be after the To date' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_total FROM public.admin_audit_logs a
   WHERE (v_action IS NULL OR a.action ILIKE '%' || replace(replace(v_action, '%', '\%'), '_', '\_') || '%')
     AND (v_type IS NULL OR a.target_type = v_type)
     AND (v_class = 'all' OR public.audit_event_is_read(a.action, a.details) = (v_class = 'reads'))
     AND (p_from IS NULL OR a.created_at >= p_from) AND (p_to IS NULL OR a.created_at <= p_to);
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id DESC), '[]'::jsonb), COALESCE(array_agg(x.id), '{}'::uuid[])
    INTO v_rows, v_ids
    FROM (
      SELECT a.id, a.actor_id, a.action, a.target_type, a.target_id, a.details, a.created_at,
             public.audit_event_is_read(a.action, a.details) AS is_read
        FROM public.admin_audit_logs a
       WHERE (v_action IS NULL OR a.action ILIKE '%' || replace(replace(v_action, '%', '\%'), '_', '\_') || '%')
         AND (v_type IS NULL OR a.target_type = v_type)
         AND (v_class = 'all' OR public.audit_event_is_read(a.action, a.details) = (v_class = 'reads'))
         AND (p_from IS NULL OR a.created_at >= p_from) AND (p_to IS NULL OR a.created_at <= p_to)
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT v_limit OFFSET v_offset
    ) x;
  -- The record types that occur in the log, for the filter (the schema renames tables; the log keeps what it recorded).
  SELECT COALESCE(jsonb_agg(t.target_type ORDER BY t.target_type), '[]'::jsonb) INTO v_types
    FROM (SELECT DISTINCT target_type FROM public.admin_audit_logs WHERE target_type IS NOT NULL) t;
  PERFORM public.gov2_log_read('audit.listed', 'admin_audit_logs', v_ids,
    ARRAY['actor_id', 'action', 'target_type', 'target_id', 'details'], v_purpose,
    jsonb_build_object('action', v_action, 'target_type', v_type, 'event_class', v_class, 'from', p_from, 'to', p_to,
                       'limit', v_limit, 'offset', v_offset),
    jsonb_array_length(v_rows));
  RETURN jsonb_build_object('total', v_total, 'rows', v_rows, 'target_types', v_types);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_audit_events(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_events(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Finding the customer of an off-app privacy request
-- ---------------------------------------------------------------------------------------------------------------------
-- privacy.manage only. At least 3 characters; at most 10 customer accounts come back, with the e-mail and phone masked to
-- what is enough to confirm the person on the line. The lookup is recorded as a read with the ids returned and the kind of
-- query, never the query text itself (it is personal data).
CREATE OR REPLACE FUNCTION public.admin_privacy_find_customers(p_query TEXT, p_purpose TEXT DEFAULT 'privacy_request')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query TEXT := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_purpose TEXT;
  v_digits TEXT;
  v_pattern TEXT;
  v_id UUID;
  v_kind TEXT;
  v_rows JSONB;
  v_ids UUID[];
  v_more BOOLEAN;
BEGIN
  PERFORM public.privacy_require_console('privacy.manage');
  v_purpose := public.gov2_read_purpose(p_purpose, 'privacy_request');
  IF v_query IS NULL OR char_length(v_query) < 3 THEN
    RAISE EXCEPTION 'Search by at least 3 characters of the name, e-mail or phone' USING ERRCODE = '22023', HINT = 'query_too_short';
  END IF;
  IF char_length(v_query) > 120 THEN
    RAISE EXCEPTION 'The search is at most 120 characters' USING ERRCODE = '22023';
  END IF;
  v_digits := regexp_replace(v_query, '\D', '', 'g');
  v_pattern := '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  IF v_query ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_id := v_query::uuid;
    v_kind := 'account_id';
  ELSIF position('@' IN v_query) > 0 THEN
    v_kind := 'email';
  ELSIF char_length(v_digits) >= 4 AND v_query ~ '^[0-9 +()-]+$' THEN
    v_kind := 'phone';
  ELSE
    v_kind := 'name';
  END IF;

  WITH found AS (
    SELECT p.id, p.first_name, p.last_name, p.email, p.phone_number, p.created_at
      FROM public.profiles p
     WHERE p.role = 'customer'
       AND CASE v_kind
             WHEN 'account_id' THEN p.id = v_id
             WHEN 'email' THEN p.email ILIKE v_pattern
             WHEN 'phone' THEN regexp_replace(COALESCE(p.phone_number, ''), '\D', '', 'g') LIKE '%' || v_digits || '%'
             ELSE (COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) ILIKE v_pattern
                  OR p.email ILIKE v_pattern
           END
     ORDER BY p.created_at DESC, p.id
     LIMIT 11
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', f.id,
           'first_name', f.first_name,
           'last_name', f.last_name,
           'email_masked', CASE WHEN f.email IS NULL OR position('@' IN f.email) = 0 THEN NULL
                                ELSE left(f.email, 1) || '***' || substring(f.email FROM position('@' IN f.email)) END,
           'phone_last4', CASE WHEN f.phone_number IS NULL THEN NULL ELSE right(regexp_replace(f.phone_number, '\D', '', 'g'), 4) END,
           'joined_at', f.created_at) ORDER BY f.created_at DESC, f.id) FILTER (WHERE f.rn <= 10), '[]'::jsonb),
         COALESCE(array_agg(f.id) FILTER (WHERE f.rn <= 10), '{}'::uuid[]),
         count(*) > 10
    INTO v_rows, v_ids, v_more
    FROM (SELECT found.*, row_number() OVER (ORDER BY found.created_at DESC, found.id) AS rn FROM found) f;

  PERFORM public.gov2_log_read('privacy.subject_lookup', 'profiles', v_ids,
    ARRAY['first_name', 'last_name', 'email', 'phone_number'], v_purpose,
    jsonb_build_object('query_kind', v_kind, 'query_length', char_length(v_query)),
    jsonb_array_length(v_rows));
  RETURN jsonb_build_object('rows', v_rows, 'more', v_more);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_privacy_find_customers(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_find_customers(TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Clearing a customer profile needs a second owner, as a privacy deletion does
-- ---------------------------------------------------------------------------------------------------------------------
ALTER TABLE public.admin_approval_requests DROP CONSTRAINT IF EXISTS admin_approval_requests_kind_check;
ALTER TABLE public.admin_approval_requests ADD CONSTRAINT admin_approval_requests_kind_check CHECK (kind IN (
  'payout_release', 'refund', 'iban_change', 'setting_change', 'ledger_settlement', 'ledger_adjustment', 'fee_rule_change',
  'payout_hold', 'reward_program', 'role_change', 'booking_cancellation', 'reconciliation_import', 'sponsored_price_change',
  'privacy_export', 'privacy_deletion', 'privacy_legal_hold', 'customer_profile_clear'));

CREATE OR REPLACE FUNCTION public.governance_approver_permission(p_kind TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_kind
    WHEN 'payout_release' THEN 'money.payout'
    WHEN 'refund' THEN 'money.refund'
    WHEN 'booking_cancellation' THEN 'money.refund'
    WHEN 'iban_change' THEN 'iban.approve'
    WHEN 'setting_change' THEN 'money.config'
    WHEN 'ledger_settlement' THEN 'money.payout'
    WHEN 'ledger_adjustment' THEN 'money.ledger'
    WHEN 'reconciliation_import' THEN 'money.ledger'
    WHEN 'fee_rule_change' THEN 'money.config'
    WHEN 'payout_hold' THEN 'money.payout'
    WHEN 'reward_program' THEN 'rewards.approve'
    WHEN 'role_change' THEN 'roles.manage'
    WHEN 'sponsored_price_change' THEN 'settings.manage'
    WHEN 'privacy_export' THEN 'privacy.approve'
    WHEN 'privacy_deletion' THEN 'privacy.approve'
    WHEN 'privacy_legal_hold' THEN 'privacy.approve'
    WHEN 'customer_profile_clear' THEN 'privacy.approve'
  END;
$$;

SELECT pg_temp.patch_function('public.governance_execute(uuid)'::regprocedure,
$from$                       'privacy_export', 'privacy_deletion', 'privacy_legal_hold') THEN$from$,
$to$                       'privacy_export', 'privacy_deletion', 'privacy_legal_hold', 'customer_profile_clear') THEN$to$);

CREATE OR REPLACE FUNCTION public.admin_clear_customer_profile(p_customer_id UUID, p_reason TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
  v_approved BOOLEAN;
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('operations.write') THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_customer_id FOR UPDATE;
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Customer not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_profile.role <> 'customer' THEN
    RAISE EXCEPTION 'Only customer profiles can be cleared here' USING ERRCODE = '22023';
  END IF;

  -- UXFIX: the same data a privacy deletion erases goes only with a different owner's approval (privacy.approve). The first
  -- call asks; the approval runs this function again inside the approved execution.
  v_approved := public.governance_execution_active('customer_profile_clear', v_profile.id);
  IF NOT v_approved THEN
    RETURN public.governance_request('customer_profile_clear', 'profiles', v_profile.id, NULL,
      jsonb_build_object('reason', v_reason),
      v_reason,
      jsonb_build_object('cleared', jsonb_build_array('first_name', 'last_name', 'email', 'phone_number', 'gender', 'expo_push_token'),
                         'kept', jsonb_build_array('sign_in_identity', 'bookings', 'invoices', 'messages')));
  END IF;

  -- The row-level audit trigger picks the reason up for the profiles.update entry.
  PERFORM set_config('primora.audit_reason', v_reason, true);

  UPDATE public.profiles
  SET first_name = NULL,
      last_name = NULL,
      email = NULL,
      phone_number = NULL,
      phone_verified = FALSE,
      phone_verified_at = NULL,
      gender = NULL,
      expo_push_token = NULL
  WHERE id = v_profile.id;

  PERFORM public.write_audit_log('customer.profile_cleared', 'profiles', v_profile.id,
    jsonb_build_object('reason', v_reason,
                       'approval_request_id', NULLIF(current_setting('primora.governance_approval', true), ''),
                       'cleared', jsonb_build_array('first_name', 'last_name', 'email', 'phone_number', 'gender', 'expo_push_token'),
                       'kept', jsonb_build_array('sign_in_identity', 'bookings', 'invoices', 'messages')));

  RETURN jsonb_build_object('customer_id', v_profile.id, 'cleared', TRUE);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_clear_customer_profile(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_clear_customer_profile(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.gov_exec_customer_profile_clear(p_req public.admin_approval_requests)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.governance_execution_active('customer_profile_clear', p_req.target_id) THEN
    RAISE EXCEPTION 'A customer profile is cleared only as an approved request' USING ERRCODE = '42501';
  END IF;
  RETURN public.admin_clear_customer_profile(p_req.target_id, p_req.payload->>'reason');
END;
$$;
REVOKE ALL ON FUNCTION public.gov_exec_customer_profile_clear(public.admin_approval_requests) FROM PUBLIC, anon, authenticated;
