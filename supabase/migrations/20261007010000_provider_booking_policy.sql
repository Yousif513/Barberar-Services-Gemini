-- D-08 + D-27: the money terms a provider controls are bounded, and they change only through one audited command.
--
-- Before: providers.free_cancellation_hours, late_cancellation_fee_percent, no_show_fee_percent and deposit_percentage carried no
-- bound (the deposit only 0..100), and owners may write their own provider row. A deposit of 0 confirmed a booking with no
-- payment, so the marketplace fee of the first visit was never collectable. No screen could set the cancellation / no-show
-- terms at all, so every shop advertised the migration defaults.
--
-- After:
--   * CHECK constraints: hours 0..720, fee percentages 0..100, deposit above 0 and at most 100;
--   * a platform floor for the online deposit, read from platform_settings('minimum_online_deposit_percentage'); it stays unset
--     (JSON null) until the owner of the marketplace approves a value, and is enforced by a trigger whenever a deposit is written;
--   * set_provider_booking_policy(...): the audited command (owner, delegate holding the 'settings' permission, or an
--     administrator who states a reason). It stamps policy_confirmed_at, which drives the "Policy" step of the provider checklist;
--     that stamp cannot be written any other way.

-- 1. Rows written before the bounds existed are brought inside them (a row cannot be added to a constraint it already breaks).
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
UPDATE public.providers SET free_cancellation_hours = LEAST(GREATEST(free_cancellation_hours, 0), 720)
 WHERE free_cancellation_hours NOT BETWEEN 0 AND 720;
UPDATE public.providers SET late_cancellation_fee_percent = LEAST(GREATEST(late_cancellation_fee_percent, 0), 100)
 WHERE late_cancellation_fee_percent NOT BETWEEN 0 AND 100;
UPDATE public.providers SET no_show_fee_percent = LEAST(GREATEST(no_show_fee_percent, 0), 100)
 WHERE no_show_fee_percent NOT BETWEEN 0 AND 100;
UPDATE public.providers SET deposit_percentage = CASE WHEN deposit_percentage <= 0 THEN 20.00 ELSE 100.00 END
 WHERE deposit_percentage <= 0 OR deposit_percentage > 100;
SELECT set_config('request.jwt.claims', '', true);

ALTER TABLE public.providers DROP CONSTRAINT IF EXISTS providers_deposit_percentage_check;
ALTER TABLE public.providers DROP CONSTRAINT IF EXISTS providers_deposit_percentage_bounds;
ALTER TABLE public.providers DROP CONSTRAINT IF EXISTS providers_free_cancellation_hours_bounds;
ALTER TABLE public.providers DROP CONSTRAINT IF EXISTS providers_late_cancellation_fee_bounds;
ALTER TABLE public.providers DROP CONSTRAINT IF EXISTS providers_no_show_fee_bounds;
ALTER TABLE public.providers ADD CONSTRAINT providers_deposit_percentage_bounds CHECK (deposit_percentage > 0 AND deposit_percentage <= 100);
ALTER TABLE public.providers ADD CONSTRAINT providers_free_cancellation_hours_bounds CHECK (free_cancellation_hours BETWEEN 0 AND 720);
ALTER TABLE public.providers ADD CONSTRAINT providers_late_cancellation_fee_bounds CHECK (late_cancellation_fee_percent BETWEEN 0 AND 100);
ALTER TABLE public.providers ADD CONSTRAINT providers_no_show_fee_bounds CHECK (no_show_fee_percent BETWEEN 0 AND 100);

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS policy_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS policy_confirmed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Platform floor for the online deposit. JSON null means "no floor chosen yet"; the owner sets it from the console.
INSERT INTO public.platform_settings (key, value, description, requires_owner_approval)
VALUES ('minimum_online_deposit_percentage', 'null'::jsonb,
        'Lowest online deposit (percent of the service price) a provider may require. Unset until the marketplace owner approves a value; providers can never set a deposit of zero.',
        TRUE)
ON CONFLICT (key) DO NOTHING;

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_def text := replace(pg_get_functiondef(p_sig), chr(13) || chr(10), chr(10));
  v_from text := replace(p_from, chr(13) || chr(10), chr(10));
  v_to text := replace(p_to, chr(13) || chr(10), chr(10));
BEGIN
  IF position(v_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, v_from, v_to);
END $$;

-- The console command that edits platform settings learns the new key (the rest of the function is untouched).
SELECT pg_temp.patch_function('public.admin_update_platform_setting(text, jsonb, text)'::regprocedure,
$from$  ELSIF p_key = 'referral_program' THEN$from$,
$to$  ELSIF p_key = 'minimum_online_deposit_percentage' THEN
    IF jsonb_typeof(p_value) NOT IN ('number', 'null') THEN
      RAISE EXCEPTION 'The minimum online deposit must be a percentage between 1 and 100, or null to remove the floor' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_value) = 'number' THEN
      v_num := (p_value #>> '{}')::numeric;
      IF v_num <= 0 OR v_num > 100 THEN
        RAISE EXCEPTION 'The minimum online deposit must be above 0 and at most 100 percent' USING ERRCODE = '22023';
      END IF;
    END IF;
  ELSIF p_key = 'referral_program' THEN$to$);

-- 3. Trigger: platform floor on every deposit write, and the policy stamp can only be written by the command.
CREATE OR REPLACE FUNCTION public.enforce_provider_booking_terms()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setting JSONB := public.platform_setting('minimum_online_deposit_percentage');
  v_min NUMERIC;
BEGIN
  IF jsonb_typeof(v_setting) = 'number' THEN
    v_min := (v_setting #>> '{}')::numeric;
    IF v_min IS NOT NULL AND NEW.deposit_percentage < v_min
       AND (TG_OP = 'INSERT' OR NEW.deposit_percentage IS DISTINCT FROM OLD.deposit_percentage) THEN
      RAISE EXCEPTION 'The online deposit cannot be lower than the platform minimum of % percent', v_min USING ERRCODE = '22023';
    END IF;
  END IF;

  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role'
     AND current_setting('primora.policy_command', TRUE) IS DISTINCT FROM 'on' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.policy_confirmed_at := NULL;
      NEW.policy_confirmed_by := NULL;
    ELSE
      NEW.policy_confirmed_at := OLD.policy_confirmed_at;
      NEW.policy_confirmed_by := OLD.policy_confirmed_by;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_provider_booking_terms() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS provider_booking_terms_before_write ON public.providers;
CREATE TRIGGER provider_booking_terms_before_write
  BEFORE INSERT OR UPDATE ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_provider_booking_terms();

-- 4. The command.
CREATE OR REPLACE FUNCTION public.set_provider_booking_policy(
  p_provider_id UUID,
  p_free_cancellation_hours INTEGER,
  p_late_cancellation_fee_percent NUMERIC,
  p_no_show_fee_percent NUMERIC,
  p_deposit_percentage NUMERIC,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_provider public.providers;
  v_is_admin BOOLEAN;
  v_allowed BOOLEAN;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_late NUMERIC;
  v_no_show NUMERIC;
  v_deposit NUMERIC;
  v_setting JSONB := public.platform_setting('minimum_online_deposit_percentage');
  v_min NUMERIC;
  v_changed BOOLEAN;
  v_before JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_provider FROM public.providers WHERE id = p_provider_id FOR UPDATE;
  v_is_admin := public.is_admin();
  IF v_provider.id IS NULL OR NOT (v_is_admin OR public.is_provider_staff(p_provider_id, v_uid)) THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;

  v_allowed := v_is_admin
    OR v_provider.owner_id = v_uid
    OR EXISTS (
      SELECT 1 FROM public.provider_memberships m
      WHERE m.provider_id = p_provider_id AND m.user_id = v_uid AND m.is_active
        AND m.branch_id IS NULL AND m.role IN ('manager', 'owner')
        AND m.permissions -> 'settings' = 'true'::jsonb);
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'You do not have permission to change the booking policy of this business' USING ERRCODE = '42501';
  END IF;
  IF v_is_admin AND v_provider.owner_id IS DISTINCT FROM v_uid AND (v_reason IS NULL OR char_length(v_reason) < 3) THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required to change another business''s policy' USING ERRCODE = '22023';
  END IF;

  IF p_free_cancellation_hours IS NULL OR p_late_cancellation_fee_percent IS NULL
     OR p_no_show_fee_percent IS NULL OR p_deposit_percentage IS NULL THEN
    RAISE EXCEPTION 'Free cancellation hours, late fee, no-show fee and deposit are all required' USING ERRCODE = '22023';
  END IF;
  v_late := round(p_late_cancellation_fee_percent, 2);
  v_no_show := round(p_no_show_fee_percent, 2);
  v_deposit := round(p_deposit_percentage, 2);
  IF p_free_cancellation_hours NOT BETWEEN 0 AND 720 THEN
    RAISE EXCEPTION 'Free cancellation window must be between 0 and 720 hours' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_late BETWEEN 0 AND 100) THEN
    RAISE EXCEPTION 'The late cancellation fee must be between 0 and 100 percent' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_no_show BETWEEN 0 AND 100) THEN
    RAISE EXCEPTION 'The no-show fee must be between 0 and 100 percent' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_deposit > 0 AND v_deposit <= 100) THEN
    RAISE EXCEPTION 'The online deposit must be above 0 and at most 100 percent' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_setting) = 'number' THEN
    v_min := (v_setting #>> '{}')::numeric;
    IF v_deposit < v_min THEN
      RAISE EXCEPTION 'The online deposit cannot be lower than the platform minimum of % percent', v_min USING ERRCODE = '22023';
    END IF;
  END IF;

  v_before := jsonb_build_object(
    'free_cancellation_hours', v_provider.free_cancellation_hours,
    'late_cancellation_fee_percent', v_provider.late_cancellation_fee_percent,
    'no_show_fee_percent', v_provider.no_show_fee_percent,
    'deposit_percentage', v_provider.deposit_percentage);
  v_changed := v_provider.policy_confirmed_at IS NULL
    OR v_provider.free_cancellation_hours IS DISTINCT FROM p_free_cancellation_hours
    OR v_provider.late_cancellation_fee_percent IS DISTINCT FROM v_late
    OR v_provider.no_show_fee_percent IS DISTINCT FROM v_no_show
    OR v_provider.deposit_percentage IS DISTINCT FROM v_deposit;

  IF v_changed THEN
    PERFORM set_config('primora.policy_command', 'on', TRUE);
    IF v_reason IS NOT NULL THEN PERFORM set_config('primora.audit_reason', v_reason, TRUE); END IF;
    UPDATE public.providers
       SET free_cancellation_hours = p_free_cancellation_hours,
           late_cancellation_fee_percent = v_late,
           no_show_fee_percent = v_no_show,
           deposit_percentage = v_deposit,
           policy_confirmed_at = now(),
           policy_confirmed_by = v_uid
     WHERE id = p_provider_id
     RETURNING * INTO v_provider;
    PERFORM set_config('primora.policy_command', '', TRUE);
    PERFORM set_config('primora.audit_reason', '', TRUE);
    PERFORM public.write_audit_log('provider.booking_policy_set', 'providers', p_provider_id,
      jsonb_build_object('before', v_before,
        'after', jsonb_build_object('free_cancellation_hours', p_free_cancellation_hours,
          'late_cancellation_fee_percent', v_late, 'no_show_fee_percent', v_no_show, 'deposit_percentage', v_deposit),
        'reason', v_reason));
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE, 'provider_id', p_provider_id, 'changed', v_changed,
    'free_cancellation_hours', v_provider.free_cancellation_hours,
    'late_cancellation_fee_percent', v_provider.late_cancellation_fee_percent,
    'no_show_fee_percent', v_provider.no_show_fee_percent,
    'deposit_percentage', v_provider.deposit_percentage,
    'policy_confirmed_at', v_provider.policy_confirmed_at);
END;
$$;
REVOKE ALL ON FUNCTION public.set_provider_booking_policy(UUID, INTEGER, NUMERIC, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_provider_booking_policy(UUID, INTEGER, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated;
