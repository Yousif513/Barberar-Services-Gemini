-- PRIV-4: health-intake answers (Q2 item 6 and X3 item 6, docs/legal/2026-10-10-privacy-decision-memo.md).
--   * Collection stays OFF until the owner records the approved transfer risk assessment (TR Art. 7) covering health-intake
--     data (X3(6)): no answer is accepted, a required form does not block a visit, and providers and customers see why.
--   * Answers are destroyed 30 days after the appointment is completed or cancelled (a no-show counts as a concluded
--     appointment). The purge is a function; scheduling it is an owner/operations task (gap privacy-jobs-not-scheduled).
--   * They are reused for a later booking only with the separate explicit consent "health_data_reuse", which lapses 12 months
--     after it was given; while it is in force the latest answers per form are kept for that reuse and nothing older.
--   * Only the provider assigned to the booking reads them: the booking's professional, or the business owner when no
--     professional is assigned. Console sessions never do (the owner break-glass of GOV-2 stays the only exception).

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. The collection gate (X3(6))
-- ---------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.privacy_transfer_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('health_intake')),
  document_reference TEXT NOT NULL CHECK (char_length(document_reference) BETWEEN 3 AND 300),
  approved_on DATE NOT NULL,
  signed_by TEXT NOT NULL CHECK (char_length(signed_by) BETWEEN 3 AND 200),
  notes TEXT,
  recorded_by UUID NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID,
  revoke_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_privacy_transfer_assessment_active ON public.privacy_transfer_assessments (scope) WHERE revoked_at IS NULL;
ALTER TABLE public.privacy_transfer_assessments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_transfer_assessments FROM anon, authenticated;
GRANT SELECT ON public.privacy_transfer_assessments TO service_role;

CREATE OR REPLACE FUNCTION public.health_intake_collection_enabled() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.privacy_transfer_assessments WHERE scope = 'health_intake' AND revoked_at IS NULL);
$$;
REVOKE ALL ON FUNCTION public.health_intake_collection_enabled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.health_intake_collection_enabled() TO service_role;

-- What providers, customers and the console are told (bilingual), with the assessment reference once recorded.
CREATE OR REPLACE FUNCTION public.health_intake_collection_status()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'enabled', public.health_intake_collection_enabled(),
    'signed_in', auth.uid() IS NOT NULL,
    'approved_on', (SELECT approved_on FROM public.privacy_transfer_assessments WHERE scope = 'health_intake' AND revoked_at IS NULL),
    'notice_en', CASE WHEN public.health_intake_collection_enabled() THEN NULL ELSE
      'Health questions are switched off. PRIMORA hosts data outside Saudi Arabia, and health answers are collected only after the owner approves the transfer risk assessment. Forms that require them do not block a visit meanwhile; ask the client in person if the treatment needs it.' END,
    'notice_ar', CASE WHEN public.health_intake_collection_enabled() THEN NULL ELSE
      'أسئلة الحالة الصحية متوقفة. تستضيف بريمورا البيانات خارج المملكة، ولا تُجمع الإجابات الصحية إلا بعد اعتماد المالك لتقييم مخاطر النقل. لا تمنع النماذج التي تتطلبها إتمام الزيارة في هذه الأثناء؛ اسأل العميل مباشرة إذا تطلبت المعالجة ذلك.' END);
$$;
REVOKE ALL ON FUNCTION public.health_intake_collection_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.health_intake_collection_status() TO authenticated;

-- The owner records the signed transfer risk assessment (document reference, approval date, signer). Owner only, step-up.
CREATE OR REPLACE FUNCTION public.admin_privacy_record_transfer_assessment(p_document_reference TEXT, p_approved_on DATE, p_signed_by TEXT, p_notes TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  PERFORM public.require_recent_mfa();
  IF public.admin_role() IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only an owner records the transfer risk assessment approval' USING ERRCODE = '42501', HINT = 'console_role_forbidden';
  END IF;
  IF char_length(btrim(COALESCE(p_document_reference, ''))) < 3 OR char_length(btrim(COALESCE(p_signed_by, ''))) < 3 THEN
    RAISE EXCEPTION 'Give the signed document reference and who signed it' USING ERRCODE = '22023';
  END IF;
  IF p_approved_on IS NULL OR p_approved_on > (now() AT TIME ZONE 'Asia/Riyadh')::date THEN
    RAISE EXCEPTION 'The approval date must be the date it was signed (not in the future)' USING ERRCODE = '22023';
  END IF;
  IF public.health_intake_collection_enabled() THEN
    RAISE EXCEPTION 'An approved assessment is already recorded; revoke it first to replace it' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.privacy_transfer_assessments (scope, document_reference, approved_on, signed_by, notes, recorded_by)
  VALUES ('health_intake', btrim(p_document_reference), p_approved_on, btrim(p_signed_by), NULLIF(btrim(COALESCE(p_notes, '')), ''), auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.write_audit_log('privacy.transfer_assessment_recorded', 'privacy_transfer_assessments', v_id,
    jsonb_build_object('scope', 'health_intake', 'document_reference', btrim(p_document_reference), 'approved_on', p_approved_on)
    || public.request_client_info());
  RETURN jsonb_build_object('id', v_id) || public.health_intake_collection_status();
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_record_transfer_assessment(TEXT, DATE, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_record_transfer_assessment(TEXT, DATE, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_privacy_revoke_transfer_assessment(p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  PERFORM public.require_recent_mfa();
  IF public.admin_role() IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only an owner revokes the transfer risk assessment approval' USING ERRCODE = '42501', HINT = 'console_role_forbidden';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'Give the reason (at least 10 characters)' USING ERRCODE = '22023';
  END IF;
  UPDATE public.privacy_transfer_assessments SET revoked_at = now(), revoked_by = auth.uid(), revoke_reason = btrim(p_reason)
   WHERE scope = 'health_intake' AND revoked_at IS NULL RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'No approved assessment is recorded' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.write_audit_log('privacy.transfer_assessment_revoked', 'privacy_transfer_assessments', v_id,
    jsonb_build_object('reason', btrim(p_reason)) || public.request_client_info());
  RETURN public.health_intake_collection_status();
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_revoke_transfer_assessment(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_revoke_transfer_assessment(TEXT) TO authenticated;

-- No answer is accepted while collection is off.
SELECT pg_temp.patch_function('public.submit_booking_intake(uuid,jsonb)'::regprocedure,
$from$  -- Explicit consent first: the latest health-data consent row must be a grant.$from$,
$to$  -- X3(6): no health answer is collected until the owner records the approved transfer risk assessment.
  IF NOT public.health_intake_collection_enabled() THEN
    RAISE EXCEPTION 'Health questions are not collected yet: PRIMORA has not approved the transfer risk assessment for health data'
      USING ERRCODE = '42501', HINT = 'health_intake_gated';
  END IF;
  -- Explicit consent first: the latest health-data consent row must be a grant.$to$);

-- A required form does not block a visit while collection is off (state 'collection_paused').
SELECT pg_temp.patch_function('public.intake_state_internal(uuid)'::regprocedure,
$from$  IF r.service_id IS NOT NULL AND r.form_required THEN
    SELECT s.status, s.template_id INTO v_sub FROM public.intake_submissions s WHERE s.booking_id = p_booking_id;$from$,
$to$  IF r.service_id IS NOT NULL AND r.form_required AND NOT public.health_intake_collection_enabled() THEN
    v_form := 'collection_paused';
  ELSIF r.service_id IS NOT NULL AND r.form_required THEN
    SELECT s.status, s.template_id INTO v_sub FROM public.intake_submissions s WHERE s.booking_id = p_booking_id;$to$);
SELECT pg_temp.patch_function('public.intake_state_internal(uuid)'::regprocedure,
$from$    ((v_form IN ('not_required', 'submitted')) AND$from$,
$to$    ((v_form IN ('not_required', 'submitted', 'collection_paused')) AND$to$);

SELECT pg_temp.patch_function('public.get_booking_intake(uuid)'::regprocedure,
$from$    'consent_active', public.has_active_consent(v_uid, 'health_data'),$from$,
$to$    'consent_active', public.has_active_consent(v_uid, 'health_data'),
    'collection', public.health_intake_collection_status(),
    'reuse_consent_active', public.health_reuse_consent_active(v_uid),$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Reuse consent (12 months)
-- ---------------------------------------------------------------------------------------------------------------------
SELECT pg_temp.patch_function('public.record_consent(text,text,text,text)'::regprocedure,
$from$'terms_privacy', 'data_processing', 'health_data') THEN$from$,
$to$'terms_privacy', 'data_processing', 'health_data', 'health_data_reuse') THEN$to$);

-- Declared static (manifest declaredStatic): the Q2.6 periods.
CREATE OR REPLACE FUNCTION public.health_reuse_consent_months() RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 12 $$;
CREATE OR REPLACE FUNCTION public.health_answer_retention_days() RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 30 $$;

CREATE OR REPLACE FUNCTION public.health_reuse_consent_active(p_user_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM (SELECT status, created_at FROM public.consents WHERE user_id = p_user_id AND purpose = 'health_data_reuse'
                    ORDER BY created_at DESC, id DESC LIMIT 1) l
     WHERE l.status = 'granted' AND l.created_at > now() - make_interval(months => public.health_reuse_consent_months()))
  AND EXISTS (
    SELECT 1 FROM (SELECT status FROM public.consents WHERE user_id = p_user_id AND purpose = 'health_data'
                    ORDER BY created_at DESC, id DESC LIMIT 1) h WHERE h.status = 'granted');
$$;
REVOKE ALL ON FUNCTION public.health_reuse_consent_active(UUID) FROM PUBLIC, anon, authenticated;

-- The customer's own earlier answers to the same form, offered to prefill a new booking's form, only under the reuse consent.
CREATE OR REPLACE FUNCTION public.get_reusable_intake_answers(p_booking_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_template UUID;
  v RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT r.template_id INTO v_template FROM public.bookings b JOIN public.intake_service_requirements r ON r.service_id = b.service_id
   WHERE b.id = p_booking_id AND b.customer_id = v_uid AND r.form_required;
  IF v_template IS NULL THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.health_reuse_consent_active(v_uid) THEN
    RETURN jsonb_build_object('available', FALSE, 'reason', 'no_reuse_consent');
  END IF;
  SELECT s.id, s.booking_id, s.submitted_at, s.template_version, a.answers INTO v
    FROM public.intake_submissions s JOIN public.intake_answers a ON a.submission_id = s.id
   WHERE s.customer_id = v_uid AND s.template_id = v_template AND s.status = 'submitted' AND s.booking_id <> p_booking_id
   ORDER BY s.submitted_at DESC LIMIT 1;
  IF v.id IS NULL THEN RETURN jsonb_build_object('available', FALSE, 'reason', 'none_kept'); END IF;
  RETURN jsonb_build_object('available', TRUE, 'submitted_at', v.submitted_at, 'template_version', v.template_version, 'answers', v.answers);
END $$;
REVOKE ALL ON FUNCTION public.get_reusable_intake_answers(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_reusable_intake_answers(UUID) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Retention: destroyed 30 days after the appointment concluded
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intake_purge_internal(p_dry_run BOOLEAN) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ids UUID[];
  v_days INTEGER := public.health_answer_retention_days();
BEGIN
  SELECT array_agg(s.id) INTO v_ids
    FROM public.intake_submissions s JOIN public.bookings b ON b.id = s.booking_id
   WHERE s.status = 'submitted'
     AND b.status IN ('completed', 'cancelled', 'no_show')
     AND CASE b.status
           WHEN 'cancelled' THEN COALESCE(b.cancelled_at, b.scheduled_at)
           WHEN 'no_show' THEN COALESCE(b.no_show_at, b.scheduled_at)
           ELSE b.scheduled_at + make_interval(mins => COALESCE(b.duration_minutes, 0))
         END < now() - make_interval(days => v_days)
     -- Under the reuse consent the latest answers to each form are kept for the next booking, and nothing older.
     AND NOT (public.health_reuse_consent_active(s.customer_id)
              AND s.id = (SELECT s2.id FROM public.intake_submissions s2
                           WHERE s2.customer_id = s.customer_id AND s2.template_id = s.template_id AND s2.status = 'submitted'
                           ORDER BY s2.submitted_at DESC LIMIT 1));
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

-- The owner-unset retention setting is superseded by the adopted 30-day rule.
UPDATE public.platform_settings SET value = '30'::jsonb,
       description = 'Superseded by the adopted Q2.6 rule: health answers are destroyed 30 days after the appointment is completed or cancelled (health_answer_retention_days()). Kept for reference only.'
 WHERE key = 'intake.retention_days';

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Only the assigned provider reads answers
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intake_is_assigned_provider(p_booking_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND NOT public.is_admin() AND EXISTS (
    SELECT 1 FROM public.bookings bk JOIN public.branches br ON br.id = bk.branch_id JOIN public.providers p ON p.id = br.provider_id
      LEFT JOIN public.employees e ON e.id = bk.employee_id
     WHERE bk.id = p_booking_id
       AND ((e.id IS NOT NULL AND e.is_active AND e.profile_id = auth.uid())
         OR (e.profile_id IS NULL AND p.owner_id = auth.uid())));
$$;
REVOKE ALL ON FUNCTION public.intake_is_assigned_provider(UUID) FROM PUBLIC, anon, authenticated;

SELECT pg_temp.patch_function('public.read_booking_intake_answers(uuid)'::regprocedure,
$from$  IF NOT FOUND OR NOT public.intake_is_serving_staff(p_booking_id) THEN$from$,
$to$  -- Q2.6: only the provider assigned to the booking (its professional, or the owner when the professional has no account).
  IF NOT FOUND OR NOT public.intake_is_assigned_provider(p_booking_id) THEN$to$);

-- Whether the caller may open the answers of a booking (the provider screens show the button only then).
CREATE OR REPLACE FUNCTION public.can_read_booking_intake_answers(p_booking_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.intake_is_assigned_provider(p_booking_id);
$$;
REVOKE ALL ON FUNCTION public.can_read_booking_intake_answers(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_booking_intake_answers(UUID) TO authenticated;
