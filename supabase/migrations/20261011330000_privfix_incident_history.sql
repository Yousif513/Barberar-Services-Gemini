-- PRIVFIX-4: the incident register (review L4, docs/reviews/2026-10-11-security-priv.md).
--   * privacy_incident_events is append-only like privacy_request_events, and no longer cascades from the incident; only the 5-year
--     purge (privacy_incident_maintenance) removes an incident together with its history.
--   * A wrong aware_at can be corrected once, before closing, with a reason (at least 20 characters) after step-up; the old and new
--     times are kept in the history and the audit log, and the 72-hour clock follows the corrected time.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

ALTER TABLE public.privacy_incident_events DROP CONSTRAINT IF EXISTS privacy_incident_events_incident_id_fkey;
ALTER TABLE public.privacy_incident_events ADD CONSTRAINT privacy_incident_events_incident_id_fkey
  FOREIGN KEY (incident_id) REFERENCES public.privacy_incidents(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.privacy_incident_events_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- The 5-year purge removes a closed incident's history with it; nothing else changes or deletes a history row.
  IF TG_OP = 'DELETE' AND COALESCE(current_setting('primora.incident_purge', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'privacy_incident_events is append-only' USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION public.privacy_incident_events_append_only() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_privacy_incident_events_append_only ON public.privacy_incident_events;
CREATE TRIGGER trg_privacy_incident_events_append_only BEFORE UPDATE OR DELETE ON public.privacy_incident_events
  FOR EACH ROW EXECUTE FUNCTION public.privacy_incident_events_append_only();

SELECT pg_temp.patch_function('public.privacy_incident_maintenance()'::regprocedure,
$from$  DELETE FROM public.privacy_incidents WHERE status = 'closed' AND closed_at < now() - INTERVAL '5 years';$from$,
$to$  PERFORM set_config('primora.incident_purge', 'on', true);
  DELETE FROM public.privacy_incident_events e USING public.privacy_incidents pi
   WHERE e.incident_id = pi.id AND pi.status = 'closed' AND pi.closed_at < now() - INTERVAL '5 years';
  DELETE FROM public.privacy_incidents WHERE status = 'closed' AND closed_at < now() - INTERVAL '5 years';
  PERFORM set_config('primora.incident_purge', '', true);$to$);

ALTER TABLE public.privacy_incidents
  ADD COLUMN IF NOT EXISTS aware_at_corrected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aware_at_correction_reason TEXT,
  ADD COLUMN IF NOT EXISTS aware_at_original TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.admin_incident_correct_aware_at(p_incident_id UUID, p_aware_at TIMESTAMPTZ, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i public.privacy_incidents;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_old TIMESTAMPTZ;
BEGIN
  PERFORM public.require_recent_mfa();
  PERFORM public.privacy_require_console('incident.manage');
  IF v_reason IS NULL OR char_length(v_reason) < 20 THEN
    RAISE EXCEPTION 'Explain the correction (at least 20 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO i FROM public.privacy_incidents WHERE id = p_incident_id FOR UPDATE;
  IF i.id IS NULL THEN RAISE EXCEPTION 'Incident not found' USING ERRCODE = 'P0002'; END IF;
  IF i.status = 'closed' THEN RAISE EXCEPTION 'A closed incident is kept as recorded' USING ERRCODE = '22023'; END IF;
  IF i.aware_at_corrected_at IS NOT NULL THEN
    RAISE EXCEPTION 'The awareness time was already corrected once' USING ERRCODE = '22023', HINT = 'already_corrected';
  END IF;
  IF p_aware_at IS NULL OR p_aware_at > now() + INTERVAL '5 minutes' OR p_aware_at < i.discovered_at - INTERVAL '1 minute' THEN
    RAISE EXCEPTION 'The awareness time must be after the discovery and not in the future' USING ERRCODE = '22023';
  END IF;
  IF i.sdaia_notified_at IS NOT NULL AND i.sdaia_notified_at > p_aware_at + INTERVAL '72 hours' AND char_length(COALESCE(i.sdaia_late_reason, '')) < 20 THEN
    RAISE EXCEPTION 'With this time the SDAIA filing would be late; record the late-filing reason first' USING ERRCODE = '22023';
  END IF;
  v_old := i.aware_at;
  UPDATE public.privacy_incidents SET aware_at = p_aware_at, aware_at_original = v_old, aware_at_corrected_at = now(),
         aware_at_correction_reason = v_reason, deadline_alerted_at = CASE WHEN p_aware_at > v_old THEN NULL ELSE deadline_alerted_at END,
         updated_at = now()
   WHERE id = i.id RETURNING * INTO i;
  INSERT INTO public.privacy_incident_events (incident_id, event, actor_id, details)
  VALUES (i.id, 'aware_at_corrected', auth.uid(), jsonb_build_object('from', v_old, 'to', p_aware_at, 'reason', v_reason));
  PERFORM public.write_audit_log('privacy.incident_aware_at_corrected', 'privacy_incidents', i.id,
    jsonb_build_object('from', v_old, 'to', p_aware_at, 'reason', v_reason) || public.request_client_info());
  RETURN public.privacy_incident_json(i);
END $$;
REVOKE ALL ON FUNCTION public.admin_incident_correct_aware_at(UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_incident_correct_aware_at(UUID, TIMESTAMPTZ, TEXT) TO authenticated;
