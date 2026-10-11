-- PRIVFIX-3: health retention, from docs/reviews/2026-10-11-security-priv.md (M4). Spec: Q2.6 "Final decision text",
-- docs/legal/2026-10-10-privacy-decision-memo.md ("destroyed 30 days after the appointment is completed or cancelled ... reused for
-- future bookings only with separate explicit consent ... only the assigned provider can read the answers").
--   (a) An appointment nobody closed (pending payment, confirmed, checked in) counts as concluded at its scheduled end: its answers are
--       destroyed 30 days after the scheduled time, whatever its status.
--   (b) Patch-test results are health data under the same rules: destroyed 30 days after the appointment they were recorded for (or
--       after the test, when recorded without a booking), kept longer only as the latest result per service under the 12-month reuse
--       consent; readable by the customer, the provider assigned to that booking (its professional, or the owner when the
--       professional has no account) and the person who recorded the test. The owner also sees an uncleared positive result, the
--       safety block only the owner can clear. Console sessions still never read them.
--   (c) The purge, the request escalation, the dispute-hold release and incident maintenance are scheduled with pg_cron where it exists.

-- ---------------------------------------------------------------------------------------------------------------------
-- (a) + (b) the purge
-- ---------------------------------------------------------------------------------------------------------------------
-- When an appointment counts as concluded for the 30-day clock.
CREATE OR REPLACE FUNCTION public.intake_appointment_concluded_at(p_booking_id UUID) RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE b.status::text
           WHEN 'cancelled' THEN COALESCE(b.cancelled_at, b.scheduled_at)
           WHEN 'no_show' THEN COALESCE(b.no_show_at, b.scheduled_at)
           -- Completed, or never closed: the scheduled end of the appointment.
           ELSE b.scheduled_at + make_interval(mins => COALESCE(b.duration_minutes, 0))
         END
    FROM public.bookings b WHERE b.id = p_booking_id;
$$;
REVOKE ALL ON FUNCTION public.intake_appointment_concluded_at(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.intake_purge_internal(p_dry_run BOOLEAN) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ids UUID[];
  v_patch UUID[];
  v_days INTEGER := public.health_answer_retention_days();
  v_cutoff TIMESTAMPTZ := now() - make_interval(days => public.health_answer_retention_days());
BEGIN
  SELECT array_agg(s.id) INTO v_ids
    FROM public.intake_submissions s
   WHERE s.status = 'submitted'
     AND public.intake_appointment_concluded_at(s.booking_id) < v_cutoff
     -- Under the reuse consent the latest answers to each form are kept for the next booking, and nothing older.
     AND NOT (public.health_reuse_consent_active(s.customer_id)
              AND s.id = (SELECT s2.id FROM public.intake_submissions s2
                           WHERE s2.customer_id = s.customer_id AND s2.template_id = s.template_id AND s2.status = 'submitted'
                           ORDER BY s2.submitted_at DESC LIMIT 1));
  SELECT array_agg(p.id) INTO v_patch
    FROM public.patch_test_results p
   WHERE COALESCE(public.intake_appointment_concluded_at(p.booking_id), p.tested_at) < v_cutoff
     AND p.tested_at < v_cutoff
     AND NOT (public.health_reuse_consent_active(p.customer_id)
              AND p.id = (SELECT p2.id FROM public.patch_test_results p2
                           WHERE p2.customer_id = p.customer_id AND p2.service_id = p.service_id
                           ORDER BY p2.tested_at DESC, p2.created_at DESC LIMIT 1));
  IF p_dry_run OR (v_ids IS NULL AND v_patch IS NULL) THEN
    RETURN jsonb_build_object('configured', TRUE, 'retention_days', v_days, 'purged', 0, 'patch_tests_purged', 0,
      'eligible', COALESCE(cardinality(v_ids), 0), 'patch_tests_eligible', COALESCE(cardinality(v_patch), 0));
  END IF;
  IF v_ids IS NOT NULL THEN
    DELETE FROM public.intake_answers WHERE submission_id = ANY (v_ids);
    UPDATE public.intake_submissions SET status = 'purged', answers_removed_at = now(), removal_reason = 'retention', updated_at = now()
     WHERE id = ANY (v_ids);
  END IF;
  IF v_patch IS NOT NULL THEN
    DELETE FROM public.patch_test_results WHERE id = ANY (v_patch);
  END IF;
  PERFORM public.write_audit_log('intake.retention_purge', 'intake_submissions', NULL,
    jsonb_build_object('purged', COALESCE(cardinality(v_ids), 0), 'patch_tests_purged', COALESCE(cardinality(v_patch), 0), 'retention_days', v_days));
  RETURN jsonb_build_object('configured', TRUE, 'retention_days', v_days, 'purged', COALESCE(cardinality(v_ids), 0),
    'patch_tests_purged', COALESCE(cardinality(v_patch), 0), 'eligible', COALESCE(cardinality(v_ids), 0),
    'patch_tests_eligible', COALESCE(cardinality(v_patch), 0));
END $$;
REVOKE ALL ON FUNCTION public.intake_purge_internal(BOOLEAN) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- (b) who reads a patch-test result
-- ---------------------------------------------------------------------------------------------------------------------
-- Takes the row's columns (not its id) so the policy never re-reads the table it guards.
CREATE OR REPLACE FUNCTION public.can_read_patch_test_result(p_provider_id UUID, p_booking_id UUID, p_recorded_by UUID, p_result TEXT,
                                                             p_cleared_at TIMESTAMPTZ) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND NOT public.is_admin() AND (
    p_recorded_by = auth.uid()
    OR (p_booking_id IS NOT NULL AND public.intake_is_assigned_provider(p_booking_id))
    OR ((p_booking_id IS NULL OR (p_result = 'positive' AND p_cleared_at IS NULL))
        AND EXISTS (SELECT 1 FROM public.providers p WHERE p.id = p_provider_id AND p.owner_id = auth.uid())));
$$;
REVOKE ALL ON FUNCTION public.can_read_patch_test_result(UUID, UUID, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_patch_test_result(UUID, UUID, UUID, TEXT, TIMESTAMPTZ) TO authenticated;

DROP POLICY IF EXISTS "Client and provider staff read patch tests" ON public.patch_test_results;
DROP POLICY IF EXISTS "Client and assigned provider read patch tests" ON public.patch_test_results;
CREATE POLICY "Client and assigned provider read patch tests" ON public.patch_test_results FOR SELECT TO authenticated
  USING (customer_id = (SELECT auth.uid()) OR public.can_read_patch_test_result(provider_id, booking_id, recorded_by, result, cleared_at));

-- ---------------------------------------------------------------------------------------------------------------------
-- (c) the schedule (gap privacy-jobs-not-scheduled)
-- ---------------------------------------------------------------------------------------------------------------------
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.unschedule(jobname) FROM cron.job
     WHERE jobname IN ('primora-intake-purge', 'primora-privacy-escalate', 'primora-privacy-release-holds', 'primora-privacy-incidents',
                       'primora-privacy-export', 'primora-privacy-erase');
    PERFORM cron.schedule('primora-intake-purge', '17 2 * * *',
      $job$ SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true), public.purge_expired_intake(false); $job$);
    PERFORM cron.schedule('primora-privacy-escalate', '7 * * * *',
      $job$ SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true), public.privacy_escalate_requests(); $job$);
    PERFORM cron.schedule('primora-privacy-release-holds', '27 3 * * *',
      $job$ SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true), public.privacy_release_due_holds(); $job$);
    PERFORM cron.schedule('primora-privacy-incidents', '*/30 * * * *',
      $job$ SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true), public.privacy_incident_maintenance(); $job$);
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
      CREATE EXTENSION IF NOT EXISTS pg_net;
      -- The builder and the erasure worker (Edge Functions); they need the Vault secrets project_url and service_role_key.
      PERFORM cron.schedule('primora-privacy-export', '*/15 * * * *',
        $job$ SELECT net.http_post(
                url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/privacy-export',
                headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
                           'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')),
                body := '{}'::jsonb) $job$);
      PERFORM cron.schedule('primora-privacy-erase', '*/15 * * * *',
        $job$ SELECT net.http_post(
                url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/privacy-erase-account',
                headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
                           'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')),
                body := '{}'::jsonb) $job$);
    END IF;
  ELSE
    RAISE NOTICE 'pg_cron not available: run purge_expired_intake, privacy_escalate_requests, privacy_release_due_holds and privacy_incident_maintenance daily from an external scheduler.';
  END IF;
END
$outer$;
