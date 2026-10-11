-- MONEY part 5: the effective platform fee and the provider's VAT status (D-D3 final decision text, adopted 2026-10-10).
--
--   * Providers and administrators see the effective platform fee computed from the fee rules in force (percentage, minimum,
--     maximum, the date it took effect, scheduled changes), "+ VAT on this fee" at the platform's VAT rate where applicable, and
--     sample amounts from the provider's own catalogue for a worked example of the net payout. No free-standing commission %.
--   * The provider's VAT registration status is captured at onboarding (registered with a 15-digit number that starts and ends
--     with 3, or not registered), copied to the provider on approval, and changed only through a command that resets it to
--     unverified. Checking the number against ZATCA is an external integration that does not exist yet (recorded as a gap).

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. VAT registration status
-- ---------------------------------------------------------------------------------------------------------------------

ALTER TABLE public.provider_applications ADD COLUMN IF NOT EXISTS vat_registration_status TEXT;
ALTER TABLE public.provider_applications DROP CONSTRAINT IF EXISTS provider_applications_vat_status_check;
-- Applications filed before this rule keep a NULL status (the provider declares it later through provider_set_vat_status).
ALTER TABLE public.provider_applications ADD CONSTRAINT provider_applications_vat_status_check CHECK (
  vat_registration_status IS NULL
  OR (vat_registration_status = 'registered' AND tax_number ~ '^3[0-9]{13}3$')
  OR (vat_registration_status = 'not_registered' AND NULLIF(btrim(COALESCE(tax_number, '')), '') IS NULL)) NOT VALID;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS vat_registration_status TEXT CHECK (vat_registration_status IS NULL OR vat_registration_status IN ('registered', 'not_registered')),
  ADD COLUMN IF NOT EXISTS vat_status_declared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vat_status_source TEXT CHECK (vat_status_source IS NULL OR vat_status_source IN ('onboarding', 'provider_update')),
  ADD COLUMN IF NOT EXISTS vat_verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (vat_verification_status IN ('unverified', 'verified', 'mismatch'));
ALTER TABLE public.providers DROP CONSTRAINT IF EXISTS providers_vat_status_consistent;
ALTER TABLE public.providers ADD CONSTRAINT providers_vat_status_consistent CHECK (
  vat_registration_status IS NULL
  OR (vat_registration_status = 'registered' AND vat_number ~ '^3[0-9]{13}3$')
  OR (vat_registration_status = 'not_registered' AND vat_number IS NULL)) NOT VALID;

-- The VAT status and number change only through the command (or on approval, or a server job); a direct write by the provider
-- or a console session is refused.
CREATE OR REPLACE FUNCTION public.guard_provider_vat_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.vat_registration_status, NEW.vat_number, NEW.vat_verification_status, NEW.vat_status_source, NEW.vat_status_declared_at)
       IS DISTINCT FROM (OLD.vat_registration_status, OLD.vat_number, OLD.vat_verification_status, OLD.vat_status_source, OLD.vat_status_declared_at)
     AND COALESCE(current_setting('primora.vat_status_write', true), '') <> 'on'
     AND COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'The VAT status changes only through provider_set_vat_status' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_provider_vat_status() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_provider_vat_status ON public.providers;
CREATE TRIGGER trg_guard_provider_vat_status BEFORE UPDATE ON public.providers FOR EACH ROW EXECUTE FUNCTION public.guard_provider_vat_status();

-- Approval copies the declared status with the number.
SELECT pg_temp.patch_function('public.approve_provider_application(uuid,text,numeric)'::regprocedure,
$from$                                commission_percentage, status, contact_email, contact_phone, cr_number, vat_number)$from$,
$to$                                commission_percentage, status, contact_email, contact_phone, cr_number, vat_number,
                                vat_registration_status, vat_status_declared_at, vat_status_source)$to$);
SELECT pg_temp.patch_function('public.approve_provider_application(uuid,text,numeric)'::regprocedure,
$from$          NULLIF(v_app.cr_number, ''), v_vat)$from$,
$to$          NULLIF(v_app.cr_number, ''), CASE WHEN v_app.vat_registration_status = 'not_registered' THEN NULL ELSE v_vat END,
          CASE WHEN v_app.vat_registration_status = 'registered' AND v_vat IS NULL THEN NULL ELSE v_app.vat_registration_status END,
          CASE WHEN v_app.vat_registration_status IS NOT NULL THEN now() END,
          CASE WHEN v_app.vat_registration_status IS NOT NULL THEN 'onboarding' END)$to$);

CREATE OR REPLACE FUNCTION public.provider_set_vat_status(p_provider_id UUID, p_status TEXT, p_vat_number TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_number TEXT := NULLIF(regexp_replace(COALESCE(p_vat_number, ''), '\s+', '', 'g'), '');
  v_before public.providers;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_before FROM public.providers WHERE id = p_provider_id AND owner_id = auth.uid() FOR UPDATE;
  IF v_before.id IS NULL THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('registered', 'not_registered') THEN
    RAISE EXCEPTION 'The VAT status is registered or not_registered' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'registered' AND (v_number IS NULL OR v_number !~ '^3[0-9]{13}3$') THEN
    RAISE EXCEPTION 'A VAT number has 15 digits and starts and ends with 3' USING ERRCODE = '22023', HINT = 'vat_number_format';
  END IF;
  IF p_status = 'not_registered' AND v_number IS NOT NULL THEN
    RAISE EXCEPTION 'A provider that is not VAT-registered has no VAT number' USING ERRCODE = '22023';
  END IF;
  -- A VAT status drives the invoicing path: changing it needs a recent sign-in.
  PERFORM public.require_recent_login(INTERVAL '10 minutes');
  PERFORM set_config('primora.vat_status_write', 'on', true);
  UPDATE public.providers
     SET vat_registration_status = p_status, vat_number = CASE WHEN p_status = 'registered' THEN v_number END,
         vat_status_declared_at = now(), vat_status_source = 'provider_update', vat_verification_status = 'unverified'
   WHERE id = p_provider_id;
  PERFORM public.write_audit_log('provider.vat_status_changed', 'providers', p_provider_id,
    jsonb_build_object('status_before', v_before.vat_registration_status, 'status_after', p_status,
                       'number_last3_before', right(COALESCE(v_before.vat_number, ''), 3), 'number_last3_after', right(COALESCE(v_number, ''), 3)));
  RETURN jsonb_build_object('status', p_status, 'verification', 'unverified');
END;
$$;
REVOKE ALL ON FUNCTION public.provider_set_vat_status(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_set_vat_status(UUID, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. The effective fee terms of a provider
-- ---------------------------------------------------------------------------------------------------------------------

-- p_provider_id NULL means the caller's own provider. Owners read their own; console sessions read any provider.
CREATE OR REPLACE FUNCTION public.provider_effective_fee_terms(p_provider_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider public.providers;
  v_admin BOOLEAN := public.is_admin();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_provider_id IS NULL THEN
    SELECT * INTO v_provider FROM public.providers WHERE owner_id = auth.uid() ORDER BY created_at LIMIT 1;
  ELSE
    SELECT * INTO v_provider FROM public.providers WHERE id = p_provider_id AND (v_admin OR owner_id = auth.uid());
  END IF;
  IF v_provider.id IS NULL THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object(
    'provider_id', v_provider.id,
    'rules', COALESCE((SELECT jsonb_agg(jsonb_build_object('channel', r.channel, 'is_first_visit', r.is_first_visit, 'fee_percentage', r.fee_percentage,
                                                          'min_fee_sar', r.min_fee_sar, 'max_fee_sar', r.max_fee_sar, 'effective_from', r.effective_from)
                                       ORDER BY r.is_first_visit DESC NULLS LAST)
                         FROM public.fee_rules r
                        WHERE r.channel = 'marketplace' AND r.is_active AND r.effective_from <= now() AND (r.effective_to IS NULL OR r.effective_to > now())), '[]'::jsonb),
    'scheduled', COALESCE((SELECT jsonb_agg(jsonb_build_object('channel', r.channel, 'is_first_visit', r.is_first_visit, 'fee_percentage', r.fee_percentage,
                                                              'min_fee_sar', r.min_fee_sar, 'max_fee_sar', r.max_fee_sar, 'effective_from', r.effective_from)
                                           ORDER BY r.effective_from)
                             FROM public.fee_rules r WHERE r.channel = 'marketplace' AND r.is_active AND r.effective_from > now()), '[]'::jsonb),
    'own_channels', jsonb_build_array('link', 'qr', 'whatsapp', 'instagram', 'walk_in', 'import'),
    'vat_rate_percent', public.country_vat_rate('SA'),
    'vat_registration_status', v_provider.vat_registration_status,
    'vat_verification_status', v_provider.vat_verification_status,
    'vat_number_last3', CASE WHEN v_provider.vat_number IS NULL THEN NULL ELSE right(v_provider.vat_number, 3) END,
    'notices', COALESCE((SELECT jsonb_agg(jsonb_build_object('effective_from', n.effective_from, 'is_first_visit', n.is_first_visit,
                                                            'before', n.before_terms, 'after', n.after_terms, 'notified_at', n.notified_at)
                                         ORDER BY n.notified_at DESC)
                           FROM public.provider_fee_change_notices n WHERE n.provider_id = v_provider.id AND n.effective_from > now() - INTERVAL '60 days'), '[]'::jsonb),
    -- The provider's own active service prices, for the worked example (never an invented amount).
    'sample_prices', COALESCE((SELECT jsonb_agg(p ORDER BY p) FROM (
        SELECT DISTINCT COALESCE(es.custom_price, s.base_price) AS p
          FROM public.services s
          JOIN public.employee_services es ON es.service_id = s.id
          JOIN public.employees e ON e.id = es.employee_id
          JOIN public.branches b ON b.id = e.branch_id
         WHERE b.provider_id = v_provider.id AND COALESCE(s.is_active, TRUE) AND COALESCE(es.custom_price, s.base_price) > 0
         LIMIT 5) x), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.provider_effective_fee_terms(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_effective_fee_terms(UUID) TO authenticated;
