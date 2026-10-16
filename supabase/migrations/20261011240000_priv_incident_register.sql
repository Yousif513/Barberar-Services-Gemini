-- PRIV-5: personal data breach register (X1 "Final decision text", docs/legal/2026-10-10-privacy-decision-memo.md).
-- Each incident records discovered_at and aware_at (which starts the 72-hour SDAIA clock), description, categories and approximate
-- number of data subjects, data types, risk assessment, containment and preventive actions, the SDAIA decision (notify, or a reasoned
-- conclusion that no harm is possible), the SDAIA reference and notified_at (with the reason when later than 72 hours, IR Art.
-- 24(2)), the data-subject decision and sent_at, and evidence (stored files or references). Kept 5 years. Access: incident.manage
-- (owner; there is no DPO or security console role yet, gap dpo-role-not-defined). Every change is audited and kept as history.

CREATE SEQUENCE IF NOT EXISTS public.privacy_incident_seq;

CREATE TABLE IF NOT EXISTS public.privacy_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) >= 20),
  discovered_at TIMESTAMPTZ NOT NULL,
  aware_at TIMESTAMPTZ NOT NULL,
  subject_categories TEXT[] NOT NULL DEFAULT '{}',
  approx_subjects INTEGER CHECK (approx_subjects IS NULL OR approx_subjects >= 0),
  data_types TEXT[] NOT NULL DEFAULT '{}',
  risk_level TEXT NOT NULL DEFAULT 'unassessed' CHECK (risk_level IN ('unassessed', 'no_harm_possible', 'low', 'medium', 'high')),
  risk_assessment TEXT,
  containment_actions TEXT,
  preventive_actions TEXT,
  sdaia_decision TEXT NOT NULL DEFAULT 'pending' CHECK (sdaia_decision IN ('pending', 'notify', 'not_required_no_harm')),
  sdaia_decision_reason TEXT,
  sdaia_reference TEXT,
  sdaia_notified_at TIMESTAMPTZ,
  sdaia_late_reason TEXT,
  subjects_decision TEXT NOT NULL DEFAULT 'pending' CHECK (subjects_decision IN ('pending', 'notify', 'not_required')),
  subjects_decision_reason TEXT,
  subjects_notified_at TIMESTAMPTZ,
  subjects_channels TEXT[],
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'contained', 'closed')),
  closed_at TIMESTAMPTZ,
  closure_note TEXT,
  deadline_alerted_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (aware_at >= discovered_at - INTERVAL '1 minute'),
  -- Notifying SDAIA is the default; not notifying needs the reasoned no-harm conclusion.
  CHECK (sdaia_decision <> 'not_required_no_harm' OR (risk_level = 'no_harm_possible' AND char_length(COALESCE(sdaia_decision_reason, '')) >= 30)),
  CHECK (sdaia_notified_at IS NULL OR (sdaia_decision = 'notify' AND sdaia_reference IS NOT NULL)),
  CHECK (sdaia_notified_at IS NULL OR sdaia_notified_at <= aware_at + INTERVAL '72 hours' OR char_length(COALESCE(sdaia_late_reason, '')) >= 20),
  CHECK (subjects_notified_at IS NULL OR subjects_decision = 'notify'),
  CHECK (subjects_decision <> 'not_required' OR char_length(COALESCE(subjects_decision_reason, '')) >= 20),
  CHECK (status <> 'closed' OR (closed_at IS NOT NULL AND sdaia_decision <> 'pending' AND subjects_decision <> 'pending'
                               AND (sdaia_decision <> 'notify' OR sdaia_notified_at IS NOT NULL)
                               AND (subjects_decision <> 'notify' OR subjects_notified_at IS NOT NULL)))
);
CREATE INDEX IF NOT EXISTS idx_privacy_incidents_open ON public.privacy_incidents (aware_at) WHERE status <> 'closed';
ALTER TABLE public.privacy_incidents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_incidents FROM anon, authenticated;
GRANT SELECT, DELETE ON public.privacy_incidents TO service_role;

CREATE TABLE IF NOT EXISTS public.privacy_incident_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.privacy_incidents(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  actor_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_privacy_incident_events_incident ON public.privacy_incident_events (incident_id, created_at);
ALTER TABLE public.privacy_incident_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_incident_events FROM anon, authenticated;
GRANT SELECT ON public.privacy_incident_events TO service_role;

-- Evidence files: a private bucket written and read only by incident.manage holders in a console session.
DO $bucket$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit)
    VALUES ('privacy-incident-evidence', 'privacy-incident-evidence', FALSE, 26214400)
    ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = EXCLUDED.file_size_limit;
    EXECUTE 'DROP POLICY IF EXISTS "Incident managers upload evidence" ON storage.objects';
    EXECUTE $p$CREATE POLICY "Incident managers upload evidence" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'privacy-incident-evidence' AND public.admin_can('incident.manage'))$p$;
    EXECUTE 'DROP POLICY IF EXISTS "Incident managers read evidence" ON storage.objects';
    EXECUTE $p$CREATE POLICY "Incident managers read evidence" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'privacy-incident-evidence' AND public.admin_can('incident.manage'))$p$;
  END IF;
END $bucket$;

CREATE OR REPLACE FUNCTION public.privacy_incident_json(i public.privacy_incidents) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(i) || jsonb_build_object(
    'sdaia_deadline_at', i.aware_at + INTERVAL '72 hours',
    'hours_left', CASE WHEN i.sdaia_decision = 'pending' OR (i.sdaia_decision = 'notify' AND i.sdaia_notified_at IS NULL)
                       THEN round((EXTRACT(EPOCH FROM (i.aware_at + INTERVAL '72 hours' - now())) / 3600)::numeric, 1) END,
    'retain_until', COALESCE(i.closed_at, i.created_at) + INTERVAL '5 years');
$$;
REVOKE ALL ON FUNCTION public.privacy_incident_json(public.privacy_incidents) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.privacy_incident_text_array(p JSONB) RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(p) = 'array' THEN ARRAY(SELECT left(btrim(x), 100) FROM jsonb_array_elements_text(p) x WHERE btrim(x) <> '') ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.admin_incident_create(p_title TEXT, p_description TEXT, p_discovered_at TIMESTAMPTZ, p_aware_at TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.privacy_incidents;
BEGIN
  PERFORM public.privacy_require_console('incident.manage');
  IF p_discovered_at IS NULL OR p_aware_at IS NULL OR p_aware_at > now() + INTERVAL '5 minutes' OR p_discovered_at > now() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'Give when it was discovered and when PRIMORA became aware (not in the future)' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.privacy_incidents (reference, title, description, discovered_at, aware_at, created_by)
  VALUES ('INC-' || to_char(now() AT TIME ZONE 'Asia/Riyadh', 'YYYY') || '-' || lpad(nextval('public.privacy_incident_seq')::text, 4, '0'),
          btrim(p_title), btrim(p_description), p_discovered_at, p_aware_at, auth.uid())
  RETURNING * INTO i;
  INSERT INTO public.privacy_incident_events (incident_id, event, actor_id, details)
  VALUES (i.id, 'created', auth.uid(), jsonb_build_object('aware_at', i.aware_at));
  PERFORM public.write_audit_log('privacy.incident_created', 'privacy_incidents', i.id,
    jsonb_build_object('reference', i.reference, 'aware_at', i.aware_at) || public.request_client_info());
  RETURN public.privacy_incident_json(i);
END $$;
REVOKE ALL ON FUNCTION public.admin_incident_create(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_incident_create(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- The assessment fields; only the keys given change. aware_at can be corrected once with a reason (it moves the clock).
CREATE OR REPLACE FUNCTION public.admin_incident_update(p_incident_id UUID, p_changes JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i public.privacy_incidents;
  c JSONB := COALESCE(p_changes, '{}'::jsonb);
  k TEXT;
BEGIN
  PERFORM public.privacy_require_console('incident.manage');
  FOR k IN SELECT jsonb_object_keys(c) LOOP
    IF k NOT IN ('title', 'description', 'subject_categories', 'approx_subjects', 'data_types', 'risk_level', 'risk_assessment',
                 'containment_actions', 'preventive_actions', 'status') THEN
      RAISE EXCEPTION 'Field % cannot be changed here', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF c ? 'status' AND c->>'status' NOT IN ('open', 'contained') THEN
    RAISE EXCEPTION 'Use admin_incident_close to close an incident' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO i FROM public.privacy_incidents WHERE id = p_incident_id FOR UPDATE;
  IF i.id IS NULL THEN RAISE EXCEPTION 'Incident not found' USING ERRCODE = 'P0002'; END IF;
  IF i.status = 'closed' THEN RAISE EXCEPTION 'A closed incident is kept as recorded' USING ERRCODE = '22023'; END IF;
  UPDATE public.privacy_incidents SET
    title = COALESCE(btrim(c->>'title'), title),
    description = COALESCE(btrim(c->>'description'), description),
    subject_categories = COALESCE(public.privacy_incident_text_array(c->'subject_categories'), subject_categories),
    approx_subjects = CASE WHEN c ? 'approx_subjects' THEN (c->>'approx_subjects')::integer ELSE approx_subjects END,
    data_types = COALESCE(public.privacy_incident_text_array(c->'data_types'), data_types),
    risk_level = COALESCE(c->>'risk_level', risk_level),
    risk_assessment = CASE WHEN c ? 'risk_assessment' THEN NULLIF(btrim(c->>'risk_assessment'), '') ELSE risk_assessment END,
    containment_actions = CASE WHEN c ? 'containment_actions' THEN NULLIF(btrim(c->>'containment_actions'), '') ELSE containment_actions END,
    preventive_actions = CASE WHEN c ? 'preventive_actions' THEN NULLIF(btrim(c->>'preventive_actions'), '') ELSE preventive_actions END,
    status = COALESCE(c->>'status', status),
    updated_at = now()
   WHERE id = i.id RETURNING * INTO i;
  INSERT INTO public.privacy_incident_events (incident_id, event, actor_id, details)
  VALUES (i.id, 'updated', auth.uid(), jsonb_build_object('fields', (SELECT jsonb_agg(x) FROM jsonb_object_keys(c) x)));
  PERFORM public.write_audit_log('privacy.incident_updated', 'privacy_incidents', i.id,
    jsonb_build_object('fields', (SELECT jsonb_agg(x) FROM jsonb_object_keys(c) x), 'risk_level', i.risk_level, 'status', i.status));
  RETURN public.privacy_incident_json(i);
END $$;
REVOKE ALL ON FUNCTION public.admin_incident_update(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_incident_update(UUID, JSONB) TO authenticated;

-- The SDAIA decision: notify (default; then the reference and the time it was filed), or the reasoned conclusion that no harm is possible.
CREATE OR REPLACE FUNCTION public.admin_incident_record_sdaia(p_incident_id UUID, p_decision TEXT, p_reason TEXT, p_reference TEXT,
                                                             p_notified_at TIMESTAMPTZ, p_late_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.privacy_incidents;
BEGIN
  PERFORM public.require_recent_mfa();
  PERFORM public.privacy_require_console('incident.manage');
  IF p_decision NOT IN ('notify', 'not_required_no_harm') THEN RAISE EXCEPTION 'Decision must be notify or not_required_no_harm' USING ERRCODE = '22023'; END IF;
  IF p_notified_at IS NOT NULL AND p_notified_at > now() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'The filing time cannot be in the future' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO i FROM public.privacy_incidents WHERE id = p_incident_id FOR UPDATE;
  IF i.id IS NULL THEN RAISE EXCEPTION 'Incident not found' USING ERRCODE = 'P0002'; END IF;
  IF i.status = 'closed' THEN RAISE EXCEPTION 'A closed incident is kept as recorded' USING ERRCODE = '22023'; END IF;
  BEGIN
    UPDATE public.privacy_incidents SET sdaia_decision = p_decision, sdaia_decision_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
           sdaia_reference = NULLIF(btrim(COALESCE(p_reference, '')), ''), sdaia_notified_at = p_notified_at,
           sdaia_late_reason = NULLIF(btrim(COALESCE(p_late_reason, '')), ''), updated_at = now()
     WHERE id = i.id RETURNING * INTO i;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'Not recorded: a no-harm conclusion needs risk level "no harm possible" and a reason of at least 30 characters; a filing needs the SDAIA reference; a filing after 72 hours needs the reason for the delay'
      USING ERRCODE = '22023';
  END;
  INSERT INTO public.privacy_incident_events (incident_id, event, actor_id, details)
  VALUES (i.id, 'sdaia_decision', auth.uid(), jsonb_build_object('decision', p_decision, 'notified_at', p_notified_at, 'reference', i.sdaia_reference));
  PERFORM public.write_audit_log('privacy.incident_sdaia_recorded', 'privacy_incidents', i.id,
    jsonb_build_object('decision', p_decision, 'notified_at', p_notified_at, 'within_72h', p_notified_at <= i.aware_at + INTERVAL '72 hours')
    || public.request_client_info());
  RETURN public.privacy_incident_json(i);
END $$;
REVOKE ALL ON FUNCTION public.admin_incident_record_sdaia(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_incident_record_sdaia(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_incident_record_subjects(p_incident_id UUID, p_decision TEXT, p_reason TEXT, p_notified_at TIMESTAMPTZ,
                                                                p_channels TEXT[])
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.privacy_incidents;
BEGIN
  PERFORM public.require_recent_mfa();
  PERFORM public.privacy_require_console('incident.manage');
  IF p_decision NOT IN ('notify', 'not_required') THEN RAISE EXCEPTION 'Decision must be notify or not_required' USING ERRCODE = '22023'; END IF;
  IF p_channels IS NOT NULL AND NOT p_channels <@ ARRAY['sms', 'email'] THEN RAISE EXCEPTION 'Channels are sms and email' USING ERRCODE = '22023'; END IF;
  IF p_notified_at IS NOT NULL AND (p_channels IS NULL OR cardinality(p_channels) = 0) THEN
    RAISE EXCEPTION 'Say how the people affected were told (SMS, e-mail)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO i FROM public.privacy_incidents WHERE id = p_incident_id FOR UPDATE;
  IF i.id IS NULL THEN RAISE EXCEPTION 'Incident not found' USING ERRCODE = 'P0002'; END IF;
  IF i.status = 'closed' THEN RAISE EXCEPTION 'A closed incident is kept as recorded' USING ERRCODE = '22023'; END IF;
  BEGIN
    UPDATE public.privacy_incidents SET subjects_decision = p_decision, subjects_decision_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
           subjects_notified_at = p_notified_at, subjects_channels = p_channels, updated_at = now()
     WHERE id = i.id RETURNING * INTO i;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'Not recorded: deciding not to notify needs a reason of at least 20 characters; a sent time needs the decision to notify'
      USING ERRCODE = '22023';
  END;
  INSERT INTO public.privacy_incident_events (incident_id, event, actor_id, details)
  VALUES (i.id, 'subjects_decision', auth.uid(), jsonb_build_object('decision', p_decision, 'notified_at', p_notified_at));
  PERFORM public.write_audit_log('privacy.incident_subjects_recorded', 'privacy_incidents', i.id,
    jsonb_build_object('decision', p_decision, 'notified_at', p_notified_at) || public.request_client_info());
  RETURN public.privacy_incident_json(i);
END $$;
REVOKE ALL ON FUNCTION public.admin_incident_record_subjects(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_incident_record_subjects(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT[]) TO authenticated;

-- Evidence: a file uploaded to the private bucket (its path) or a reference to where it is kept.
CREATE OR REPLACE FUNCTION public.admin_incident_add_evidence(p_incident_id UUID, p_label TEXT, p_reference TEXT, p_storage_path TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.privacy_incidents;
BEGIN
  PERFORM public.privacy_require_console('incident.manage');
  IF char_length(btrim(COALESCE(p_label, ''))) < 3 THEN RAISE EXCEPTION 'Name the evidence' USING ERRCODE = '22023'; END IF;
  IF NULLIF(btrim(COALESCE(p_reference, '')), '') IS NULL AND NULLIF(btrim(COALESCE(p_storage_path, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Upload a file or give where the evidence is kept' USING ERRCODE = '22023';
  END IF;
  IF p_storage_path IS NOT NULL AND p_storage_path !~ ('^' || p_incident_id::text || '/[A-Za-z0-9._-]{1,120}$') THEN
    RAISE EXCEPTION 'Evidence files are stored under the incident''s folder' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO i FROM public.privacy_incidents WHERE id = p_incident_id FOR UPDATE;
  IF i.id IS NULL THEN RAISE EXCEPTION 'Incident not found' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.privacy_incidents SET evidence = evidence || jsonb_build_array(jsonb_build_object('label', left(btrim(p_label), 200),
           'reference', NULLIF(left(btrim(COALESCE(p_reference, '')), 500), ''), 'storage_path', p_storage_path, 'added_at', now(), 'added_by', auth.uid())),
         updated_at = now()
   WHERE id = i.id RETURNING * INTO i;
  INSERT INTO public.privacy_incident_events (incident_id, event, actor_id, details)
  VALUES (i.id, 'evidence_added', auth.uid(), jsonb_build_object('label', left(btrim(p_label), 200), 'file', p_storage_path IS NOT NULL));
  PERFORM public.write_audit_log('privacy.incident_evidence_added', 'privacy_incidents', i.id, jsonb_build_object('file', p_storage_path IS NOT NULL));
  RETURN public.privacy_incident_json(i);
END $$;
REVOKE ALL ON FUNCTION public.admin_incident_add_evidence(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_incident_add_evidence(UUID, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_incident_close(p_incident_id UUID, p_note TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.privacy_incidents;
BEGIN
  PERFORM public.require_recent_mfa();
  PERFORM public.privacy_require_console('incident.manage');
  IF char_length(btrim(COALESCE(p_note, ''))) < 20 THEN RAISE EXCEPTION 'Summarise the outcome (at least 20 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO i FROM public.privacy_incidents WHERE id = p_incident_id FOR UPDATE;
  IF i.id IS NULL THEN RAISE EXCEPTION 'Incident not found' USING ERRCODE = 'P0002'; END IF;
  IF i.containment_actions IS NULL OR i.preventive_actions IS NULL OR i.risk_level = 'unassessed' THEN
    RAISE EXCEPTION 'Record the risk assessment, containment and preventive actions before closing' USING ERRCODE = '22023';
  END IF;
  BEGIN
    UPDATE public.privacy_incidents SET status = 'closed', closed_at = now(), closure_note = btrim(p_note), updated_at = now()
     WHERE id = i.id RETURNING * INTO i;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'Not closed: both decisions (SDAIA and the people affected) must be recorded, with the filing and sending times when the decision was to notify'
      USING ERRCODE = '22023';
  END;
  INSERT INTO public.privacy_incident_events (incident_id, event, actor_id, details) VALUES (i.id, 'closed', auth.uid(), '{}'::jsonb);
  PERFORM public.write_audit_log('privacy.incident_closed', 'privacy_incidents', i.id, jsonb_build_object('reference', i.reference) || public.request_client_info());
  RETURN public.privacy_incident_json(i);
END $$;
REVOKE ALL ON FUNCTION public.admin_incident_close(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_incident_close(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_incident_list(p_state TEXT DEFAULT 'open', p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows JSONB;
BEGIN
  PERFORM public.privacy_require_console('incident.manage');
  IF p_state NOT IN ('open', 'closed') THEN RAISE EXCEPTION 'The state must be open or closed' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(jsonb_agg(public.privacy_incident_json(x.i) ORDER BY x.k), '[]'::jsonb) INTO v_rows
    FROM (SELECT i, CASE WHEN p_state = 'open' THEN EXTRACT(EPOCH FROM i.aware_at) ELSE -EXTRACT(EPOCH FROM i.closed_at) END AS k
            FROM public.privacy_incidents i WHERE (i.status = 'closed') = (p_state = 'closed')
           ORDER BY k LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200) OFFSET GREATEST(COALESCE(p_offset, 0), 0)) x;
  PERFORM public.write_audit_log('privacy.incidents_listed', 'privacy_incidents', NULL,
    jsonb_build_object('state', p_state, 'rows', jsonb_array_length(v_rows)) || public.request_client_info());
  RETURN jsonb_build_object('rows', v_rows, 'total', (SELECT count(*) FROM public.privacy_incidents WHERE (status = 'closed') = (p_state = 'closed')));
END $$;
REVOKE ALL ON FUNCTION public.admin_incident_list(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_incident_list(TEXT, INTEGER, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_incident_get(p_incident_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.privacy_incidents;
BEGIN
  PERFORM public.privacy_require_console('incident.manage');
  SELECT * INTO i FROM public.privacy_incidents WHERE id = p_incident_id;
  IF i.id IS NULL THEN RAISE EXCEPTION 'Incident not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.write_audit_log('privacy.incident_viewed', 'privacy_incidents', i.id, public.request_client_info());
  RETURN public.privacy_incident_json(i) || jsonb_build_object('events', COALESCE((SELECT jsonb_agg(jsonb_build_object('event', e.event,
    'actor_id', e.actor_id, 'details', e.details, 'created_at', e.created_at) ORDER BY e.created_at, e.id)
    FROM public.privacy_incident_events e WHERE e.incident_id = i.id), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.admin_incident_get(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_incident_get(UUID) TO authenticated;

-- Scheduler: an incident with no SDAIA filing 48 hours after awareness raises one alert and an owner notice; closed incidents are
-- deleted 5 years after closing (with their history).
CREATE OR REPLACE FUNCTION public.privacy_incident_maintenance()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i RECORD;
  v_owner RECORD;
  v_alerted INTEGER := 0;
  v_purged INTEGER;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the scheduler runs incident maintenance' USING ERRCODE = '42501';
  END IF;
  FOR i IN SELECT * FROM public.privacy_incidents
            WHERE status <> 'closed' AND deadline_alerted_at IS NULL AND now() >= aware_at + INTERVAL '48 hours'
              AND (sdaia_decision = 'pending' OR (sdaia_decision = 'notify' AND sdaia_notified_at IS NULL)) FOR UPDATE LOOP
    UPDATE public.privacy_incidents SET deadline_alerted_at = now() WHERE id = i.id;
    INSERT INTO public.security_alerts (kind, user_id, details)
    VALUES ('privacy_incident_deadline', NULL, jsonb_build_object('incident_id', i.id, 'reference', i.reference, 'deadline_at', i.aware_at + INTERVAL '72 hours'));
    FOR v_owner IN SELECT a.user_id FROM public.admin_role_assignments a JOIN public.profiles p ON p.id = a.user_id AND p.role = 'admin'
                    WHERE a.admin_role = 'owner' LOOP
      PERFORM public.queue_governance_notice(v_owner.user_id, 'privacy_incident_deadline',
        jsonb_build_object('reference', i.reference, 'deadline_at', i.aware_at + INTERVAL '72 hours'));
    END LOOP;
    v_alerted := v_alerted + 1;
  END LOOP;
  DELETE FROM public.privacy_incidents WHERE status = 'closed' AND closed_at < now() - INTERVAL '5 years';
  GET DIAGNOSTICS v_purged = ROW_COUNT;
  RETURN jsonb_build_object('alerted', v_alerted, 'purged', v_purged);
END $$;
REVOKE ALL ON FUNCTION public.privacy_incident_maintenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_incident_maintenance() TO service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- PRIV hygiene across the package: every new table carries the console write audit trigger; the server key may insert and read
-- the append-only records and write the working tables; constant helpers are not callable from outside.
-- ---------------------------------------------------------------------------------------------------------------------
DO $priv$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['privacy_request_events', 'privacy_field_restrictions', 'privacy_recipient_notices', 'privacy_exports',
    'privacy_legal_holds', 'privacy_erasure_runs', 'deletion_ledger', 'privacy_transfer_assessments', 'privacy_incidents',
    'privacy_incident_events'] LOOP
    PERFORM public.attach_admin_audit_trigger(('public.' || t)::regclass);
  END LOOP;
END $priv$;
GRANT SELECT, INSERT ON public.privacy_field_restrictions, public.deletion_ledger, public.privacy_transfer_assessments,
  public.privacy_erasure_runs, public.privacy_incident_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.privacy_incidents TO service_role;

REVOKE ALL ON FUNCTION public.privacy_deadline_days(), public.privacy_complaint_right(), public.privacy_redact_text(TEXT),
  public.privacy_retention_until(TIMESTAMPTZ), public.health_answer_retention_days(), public.health_reuse_consent_months(),
  public.privacy_incident_text_array(JSONB) FROM PUBLIC, anon, authenticated;
