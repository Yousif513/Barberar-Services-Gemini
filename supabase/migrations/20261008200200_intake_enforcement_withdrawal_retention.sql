-- G72 Intake forms and patch tests: enforcement, consent withdrawal and retention.
-- Additive triggers only: employee_update_booking_status and the other booking commands are not redefined.

-- 1. Enforcement. A provider that switches enforce_requirements on cannot start or complete a service while a required
--    form or a valid patch test is missing. Cancellation and no-show are never blocked: those transitions do not match the
--    WHEN clause. A positive patch test blocks that service for that client until the owner clears it, whatever the setting
--    (the provider recorded the reaction; ignoring it would be unsafe).
CREATE OR REPLACE FUNCTION public.enforce_booking_intake() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_provider UUID;
  v_enforce BOOLEAN;
  v_state RECORD;
BEGIN
  IF NEW.customer_id IS NULL THEN RETURN NEW; END IF;
  SELECT s.* INTO v_state FROM public.intake_state_internal(NEW.id) s;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF v_state.blocked THEN
    RAISE EXCEPTION 'A positive patch test blocks this service for this client until the owner clears it' USING ERRCODE = '22023';
  END IF;
  SELECT br.provider_id INTO v_provider FROM public.branches br WHERE br.id = NEW.branch_id;
  SELECT COALESCE(enforce_requirements, FALSE) INTO v_enforce FROM public.provider_intake_settings WHERE provider_id = v_provider;
  IF COALESCE(v_enforce, FALSE) AND NOT v_state.met THEN
    IF v_state.form_required AND v_state.form_status <> 'submitted' THEN
      RAISE EXCEPTION 'The intake form (%) must be completed before the service starts or completes', v_state.form_status USING ERRCODE = '22023';
    END IF;
    RAISE EXCEPTION 'A valid patch test (%) is required before the service starts or completes', v_state.patch_status USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_booking_intake() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_booking_intake_enforcement ON public.bookings;
CREATE TRIGGER trg_booking_intake_enforcement
  BEFORE UPDATE OF status, checked_in_at ON public.bookings
  FOR EACH ROW
  WHEN ((NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
        OR (NEW.checked_in_at IS NOT NULL AND OLD.checked_in_at IS NULL))
  EXECUTE FUNCTION public.enforce_booking_intake();

-- A client with an uncleared positive result for a service cannot be booked for it.
CREATE OR REPLACE FUNCTION public.block_booking_for_positive_patch_test() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_provider UUID;
BEGIN
  SELECT provider_id INTO v_provider FROM public.branches WHERE id = NEW.branch_id;
  IF EXISTS (SELECT 1 FROM public.patch_test_results p
              WHERE p.provider_id = v_provider AND p.customer_id = NEW.customer_id AND p.service_id = NEW.service_id
                AND p.client_profile_id IS NOT DISTINCT FROM NEW.client_profile_id AND p.result = 'positive' AND p.cleared_at IS NULL) THEN
    RAISE EXCEPTION 'This service is blocked for this client after a positive patch test; contact the provider' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.block_booking_for_positive_patch_test() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_booking_patch_test_block ON public.bookings;
CREATE TRIGGER trg_booking_patch_test_block
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  WHEN (NEW.customer_id IS NOT NULL AND NEW.status IN ('pending_payment', 'confirmed'))
  EXECUTE FUNCTION public.block_booking_for_positive_patch_test();

-- 2. Withdrawal. A withdrawn health-data consent blanks the answers of future-dated submissions and keeps a non-sensitive
--    tombstone (status, version, when). Past submissions stay until the customer deletes them or retention purges them.
CREATE OR REPLACE FUNCTION public.blank_intake_on_consent_withdrawal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids UUID[];
BEGIN
  IF NEW.purpose <> 'health_data' OR NEW.status <> 'withdrawn' THEN RETURN NEW; END IF;
  SELECT array_agg(s.id) INTO v_ids
    FROM public.intake_submissions s JOIN public.bookings b ON b.id = s.booking_id
   WHERE s.customer_id = NEW.user_id AND s.status = 'submitted' AND b.scheduled_at > now();
  IF v_ids IS NOT NULL THEN
    DELETE FROM public.intake_answers WHERE submission_id = ANY (v_ids);
    UPDATE public.intake_submissions SET status = 'withdrawn', answers_removed_at = now(), removal_reason = 'consent_withdrawn', updated_at = now()
     WHERE id = ANY (v_ids);
    PERFORM public.write_audit_log('intake.blanked_on_withdrawal', 'consents', NEW.id, jsonb_build_object('submissions', cardinality(v_ids)));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.blank_intake_on_consent_withdrawal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_consents_blank_intake ON public.consents;
CREATE TRIGGER trg_consents_blank_intake AFTER INSERT ON public.consents
  FOR EACH ROW EXECUTE FUNCTION public.blank_intake_on_consent_withdrawal();

-- 3. Retention. The platform setting intake.retention_days is a number of days chosen by the owner. It is NULL (unset) until then
--    and the purge does nothing while it is unset.
INSERT INTO public.platform_settings (key, value, description, requires_owner_approval) VALUES
  ('intake.retention_days', 'null'::jsonb,
   'Days after the appointment that intake answers are kept before the purge removes them (a whole number). Unset until the owner decides: nothing is purged while it is unset.', TRUE)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.intake_purge_internal(p_dry_run BOOLEAN) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_setting JSONB := public.platform_setting('intake.retention_days');
  v_days INTEGER;
  v_ids UUID[];
BEGIN
  IF v_setting IS NULL OR jsonb_typeof(v_setting) <> 'number' OR (v_setting #>> '{}') !~ '^[0-9]{1,5}$' OR (v_setting #>> '{}')::integer < 1 THEN
    RETURN jsonb_build_object('configured', FALSE, 'purged', 0);
  END IF;
  v_days := (v_setting #>> '{}')::integer;
  SELECT array_agg(s.id) INTO v_ids
    FROM public.intake_submissions s JOIN public.bookings b ON b.id = s.booking_id
   WHERE s.status = 'submitted' AND b.scheduled_at < now() - make_interval(days => v_days);
  IF p_dry_run OR v_ids IS NULL THEN
    RETURN jsonb_build_object('configured', TRUE, 'retention_days', v_days, 'purged', 0, 'eligible', COALESCE(cardinality(v_ids), 0));
  END IF;
  DELETE FROM public.intake_answers WHERE submission_id = ANY (v_ids);
  UPDATE public.intake_submissions SET status = 'purged', answers_removed_at = now(), removal_reason = 'retention', updated_at = now()
   WHERE id = ANY (v_ids);
  PERFORM public.write_audit_log('intake.retention_purge', 'intake_submissions', NULL,
    jsonb_build_object('purged', cardinality(v_ids), 'retention_days', v_days));
  RETURN jsonb_build_object('configured', TRUE, 'retention_days', v_days, 'purged', cardinality(v_ids), 'eligible', cardinality(v_ids));
END $$;
REVOKE ALL ON FUNCTION public.intake_purge_internal(BOOLEAN) FROM PUBLIC, anon, authenticated;

-- For the scheduled job (service role) and for an administrator. Neither reads an answer; the purge only deletes.
CREATE OR REPLACE FUNCTION public.purge_expired_intake(p_dry_run BOOLEAN DEFAULT FALSE) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the scheduled job can run the intake purge' USING ERRCODE = '42501';
  END IF;
  RETURN public.intake_purge_internal(COALESCE(p_dry_run, FALSE));
END $$;
REVOKE ALL ON FUNCTION public.purge_expired_intake(BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_intake(BOOLEAN) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_purge_expired_intake(p_reason TEXT, p_dry_run BOOLEAN DEFAULT FALSE) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  RETURN public.intake_purge_internal(COALESCE(p_dry_run, FALSE));
END $$;
REVOKE ALL ON FUNCTION public.admin_purge_expired_intake(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_expired_intake(TEXT, BOOLEAN) TO authenticated;
