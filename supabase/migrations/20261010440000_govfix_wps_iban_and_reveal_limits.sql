-- GOV-FIX M-5, L-2, L-3 (docs/reviews/2026-10-10-security-gov1.md).
--
-- M-5. Staff salary IBANs (employee_commission_rules.wps_iban) were readable in full by every console role and by the provider,
--      and calculate_staff_payroll returned them. Bank data is masked everywhere (Q3 rationale): the column is no longer
--      readable by signed-in users, a stored masked copy (wps_iban_masked) replaces it on every screen, the payroll summary
--      carries the masked form, and the full number comes only from reveal_employee_wps_iban: the provider's owner after a
--      fresh sign-in, or finance/owner with step-up and a referenced reason; every reveal is audited without the number.
--      The provider still enters or replaces the number (write privilege unchanged).
-- L-2. reveal_provider_iban accepted weak references (any 8 hex characters, two letters and two digits anywhere) and had no
--      ceiling after the alert at 10 reveals a day. A reference is now a ticket code (PAY-1042: letters, hyphen, 3+ digits),
--      a #number of 3+ digits, or the start of a real payout or approval id of that provider. More than 20 reveals in 24 hours
--      stop until a different owner allows 10 more (admin_lift_iban_reveal_limit). At the ceiling the function answers
--      {refused: true} without any account (not an exception), so the alert and the audit event it writes are kept.
-- L-3. The reveal returned the pending, unapproved IBAN in full, which a finance user could pay by hand. The pending account
--      now comes back masked and marked not approved.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- M-5: staff salary IBAN
-- ---------------------------------------------------------------------------------------------------------------------

ALTER TABLE public.employee_commission_rules
  ADD COLUMN IF NOT EXISTS wps_iban_masked TEXT GENERATED ALWAYS AS (public.mask_iban(wps_iban)) STORED;

REVOKE SELECT ON public.employee_commission_rules FROM anon, authenticated;
DO $govfix$
DECLARE
  v_cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_cols
    FROM pg_attribute a
   WHERE a.attrelid = 'public.employee_commission_rules'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname <> 'wps_iban';
  EXECUTE format('GRANT SELECT (%s) ON public.employee_commission_rules TO authenticated', v_cols);
END
$govfix$;

SELECT pg_temp.patch_function('public.calculate_staff_payroll(uuid,date,date)'::regprocedure,
$q$'wps_iban', r.wps_iban,$q$, $q$'wps_iban_masked', r.wps_iban_masked,$q$);

CREATE OR REPLACE FUNCTION public.reveal_employee_wps_iban(p_employee_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_rule public.employee_commission_rules;
  v_is_owner BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_rule FROM public.employee_commission_rules WHERE employee_id = p_employee_id;
  v_is_owner := v_rule.id IS NOT NULL AND EXISTS (SELECT 1 FROM public.providers p WHERE p.id = v_rule.provider_id AND p.owner_id = auth.uid());
  IF v_is_owner THEN
    PERFORM public.require_recent_login(INTERVAL '10 minutes');
    IF v_reason IS NULL OR char_length(v_reason) < 5 THEN
      RAISE EXCEPTION 'Say why you need the full account number (at least 5 characters)' USING ERRCODE = '22023';
    END IF;
  ELSE
    PERFORM public.require_recent_mfa();
    IF NOT public.admin_can('iban.reveal') THEN
      RAISE EXCEPTION 'Only the provider owner, finance or an owner can reveal a salary account' USING ERRCODE = '42501';
    END IF;
    IF v_reason IS NULL OR char_length(v_reason) < 15 OR v_reason !~* '([a-z]{2,}-[0-9]{3,}|#[0-9]{3,})' THEN
      RAISE EXCEPTION 'A reason of at least 15 characters with a ticket reference (for example TCK-1042 or #5521) is required' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_rule.id IS NULL OR v_rule.wps_iban IS NULL THEN
    RAISE EXCEPTION 'No salary account is recorded for this employee' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.write_audit_log('employee_wps_iban.revealed', 'employees', p_employee_id,
    jsonb_build_object('reason', v_reason, 'provider_id', v_rule.provider_id, 'iban_last4', right(v_rule.wps_iban, 4),
                       'by_provider_owner', v_is_owner) || public.request_client_info());
  RETURN jsonb_build_object('employee_id', p_employee_id, 'iban', v_rule.wps_iban, 'expires_at', now() + INTERVAL '60 seconds');
END;
$$;
REVOKE ALL ON FUNCTION public.reveal_employee_wps_iban(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_employee_wps_iban(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- L-2 and L-3: provider IBAN reveal
-- ---------------------------------------------------------------------------------------------------------------------

ALTER TABLE public.security_alerts DROP CONSTRAINT IF EXISTS security_alerts_kind_check;
ALTER TABLE public.security_alerts ADD CONSTRAINT security_alerts_kind_check CHECK (kind IN (
  'mfa_lockout', 'mfa_reset', 'iban_reveal_volume', 'break_glass_used', 'console_role_changed', 'iban_change_requested',
  'health_break_glass', 'mfa_factor_added', 'iban_reveal_limit_reached'));

CREATE TABLE IF NOT EXISTS public.iban_reveal_limit_lifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lifted_by UUID NOT NULL,
  reason TEXT NOT NULL,
  lifted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id <> lifted_by)
);
CREATE INDEX IF NOT EXISTS idx_iban_reveal_limit_lifts_user ON public.iban_reveal_limit_lifts (user_id, lifted_at DESC);
ALTER TABLE public.iban_reveal_limit_lifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Administrators read reveal limit lifts" ON public.iban_reveal_limit_lifts;
CREATE POLICY "Administrators read reveal limit lifts" ON public.iban_reveal_limit_lifts FOR SELECT TO authenticated USING (public.is_admin());
SELECT public.grant_data_api_access('public.iban_reveal_limit_lifts');
SELECT public.attach_admin_audit_trigger('public.iban_reveal_limit_lifts');
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.iban_reveal_limit_lifts FROM anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.iban_reveal_limit_lifts FROM service_role;

-- The most reveals an administrator may make in 24 hours: 20, plus 10 for each lift another owner granted in that window.
CREATE OR REPLACE FUNCTION public.iban_reveal_ceiling(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 20 + 10 * (SELECT COUNT(*)::int FROM public.iban_reveal_limit_lifts l
                     WHERE l.user_id = p_user_id AND l.lifted_at > now() - INTERVAL '24 hours');
$$;
REVOKE ALL ON FUNCTION public.iban_reveal_ceiling(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_lift_iban_reveal_limit(p_user_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('alerts.acknowledge') THEN
    RAISE EXCEPTION 'Only an owner can allow more IBAN reveals' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Another owner allows more reveals for you' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 15 THEN
    RAISE EXCEPTION 'A reason of at least 15 characters is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_role_assignments a JOIN public.admin_role_permissions rp ON rp.admin_role = a.admin_role
                  WHERE a.user_id = p_user_id AND rp.permission = 'iban.reveal') THEN
    RAISE EXCEPTION 'This person cannot reveal IBANs' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.iban_reveal_limit_lifts (user_id, lifted_by, reason) VALUES (p_user_id, auth.uid(), v_reason);
  PERFORM public.write_audit_log('iban.reveal_limit_lifted', 'profiles', p_user_id,
    jsonb_build_object('reason', v_reason, 'ceiling', public.iban_reveal_ceiling(p_user_id)) || public.request_client_info());
  RETURN jsonb_build_object('user_id', p_user_id, 'ceiling', public.iban_reveal_ceiling(p_user_id));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_lift_iban_reveal_limit(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_lift_iban_reveal_limit(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.reveal_provider_iban(p_provider_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_active public.provider_payout_destinations;
  v_pending public.provider_payout_destinations;
  v_count INTEGER;
  v_ceiling INTEGER;
  v_ref TEXT;
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('iban.reveal') THEN
    RAISE EXCEPTION 'Only finance or an owner can reveal an IBAN' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 15 THEN
    RAISE EXCEPTION 'A reason of at least 15 characters is required' USING ERRCODE = '22023';
  END IF;
  -- L-2: a ticket code (letters, hyphen, 3+ digits), a #number of 3+ digits, or the start of a real payout or approval id of
  -- this provider. Bare hex that matches nothing is refused.
  IF v_reason !~* '(^|[^a-z0-9])[a-z]{2,}-[0-9]{3,}' AND v_reason !~ '#[0-9]{3,}' THEN
    v_ref := lower(substring(v_reason FROM '([0-9a-fA-F]{8})(-[0-9a-fA-F]{4})?'));
    IF v_ref IS NULL OR NOT (
         EXISTS (SELECT 1 FROM public.payout_requests pr WHERE pr.provider_id = p_provider_id AND pr.id::text LIKE v_ref || '%')
      OR EXISTS (SELECT 1 FROM public.admin_approval_requests ar
                  WHERE ar.id::text LIKE v_ref || '%' AND (ar.summary->>'provider_id') = p_provider_id::text)) THEN
      RAISE EXCEPTION 'Include a ticket reference (for example PAY-1042 or #5521) or the id of this provider''s payout request in the reason'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- L-2: a hard ceiling per 24 hours that only another owner raises.
  PERFORM pg_advisory_xact_lock(hashtext('iban_reveal:' || auth.uid()::text));
  SELECT COUNT(*) INTO v_count FROM public.admin_audit_logs
   WHERE action = 'iban.revealed' AND actor_id = auth.uid() AND created_at > now() - INTERVAL '24 hours';
  v_ceiling := public.iban_reveal_ceiling(auth.uid());
  IF v_count >= v_ceiling THEN
    IF NOT EXISTS (SELECT 1 FROM public.security_alerts WHERE kind = 'iban_reveal_limit_reached' AND user_id = auth.uid()
                    AND created_at > now() - INTERVAL '24 hours' AND acknowledged_at IS NULL) THEN
      INSERT INTO public.security_alerts (kind, user_id, details)
      VALUES ('iban_reveal_limit_reached', auth.uid(), jsonb_build_object('reveals_in_24h', v_count, 'ceiling', v_ceiling));
    END IF;
    -- Answered, not raised, so the alert above is kept: nothing is revealed.
    PERFORM public.write_audit_log('iban.reveal_refused', 'providers', p_provider_id,
      jsonb_build_object('reason', v_reason, 'reveals_in_24h', v_count, 'ceiling', v_ceiling) || public.request_client_info());
    RETURN jsonb_build_object('provider_id', p_provider_id, 'refused', TRUE, 'refusal', 'reveal_limit_reached',
      'reveals_in_24h', v_count, 'ceiling', v_ceiling,
      'message', format('You have revealed %s IBANs in 24 hours, the most allowed; another owner can allow more from Approvals', v_count));
  END IF;

  SELECT * INTO v_active FROM public.provider_payout_destinations WHERE provider_id = p_provider_id AND status = 'active';
  SELECT * INTO v_pending FROM public.provider_payout_destinations WHERE provider_id = p_provider_id AND status = 'pending';
  IF v_active.id IS NULL AND v_pending.id IS NULL THEN
    RAISE EXCEPTION 'This provider has no bank account on file' USING ERRCODE = 'P0002';
  END IF;

  -- The audit event never contains the IBAN.
  PERFORM public.write_audit_log('iban.revealed', 'providers', p_provider_id,
    jsonb_build_object('reason', v_reason, 'active_destination_id', v_active.id, 'pending_destination_id', v_pending.id,
                       'pending_shown_masked', v_pending.id IS NOT NULL)
      || public.request_client_info());
  v_count := v_count + 1;
  IF v_count > 10 AND NOT EXISTS (SELECT 1 FROM public.security_alerts WHERE kind = 'iban_reveal_volume' AND user_id = auth.uid()
                                     AND created_at > now() - INTERVAL '24 hours') THEN
    INSERT INTO public.security_alerts (kind, user_id, details)
    VALUES ('iban_reveal_volume', auth.uid(), jsonb_build_object('reveals_in_24h', v_count));
  END IF;

  RETURN jsonb_build_object(
    'provider_id', p_provider_id,
    'expires_at', now() + INTERVAL '60 seconds',
    'reveals_in_24h', v_count,
    'ceiling', v_ceiling,
    'active', CASE WHEN v_active.id IS NOT NULL THEN jsonb_build_object('destination_id', v_active.id, 'iban', v_active.iban,
                'bank_name', v_active.bank_name, 'account_holder_name', v_active.account_holder_name, 'approved', TRUE) END,
    -- L-3: an account waiting for approval is never shown in full: nobody may pay it.
    'pending', CASE WHEN v_pending.id IS NOT NULL THEN jsonb_build_object('destination_id', v_pending.id, 'iban_masked', public.mask_iban(v_pending.iban),
                'bank_name', v_pending.bank_name, 'account_holder_name', v_pending.account_holder_name, 'approved', FALSE) END);
END;
$$;
REVOKE ALL ON FUNCTION public.reveal_provider_iban(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_provider_iban(UUID, TEXT) TO authenticated;
