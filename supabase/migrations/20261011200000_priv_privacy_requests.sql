-- PRIV-1: privacy requests (Q1 "Final decision text", docs/legal/2026-10-10-privacy-decision-memo.md, adopted in
-- docs/legal/2026-10-10-adopted-decisions.md).
--   1. Access, Copy, Correction, Deletion and Consent-withdrawal requests, in-app or logged by staff (e-mail, phone, in person),
--      all recorded in privacy_requests (data_subject_requests renamed; every earlier row is kept) with channel, received_at,
--      type, requester, verification method, status, decision, reason and completed_at, plus a per-request event history.
--   2. Identity: an in-app request needs a sign-in by one-time code to the account's verified e-mail or phone in the last
--      10 minutes (Supabase Auth OTP; the session's amr carries "otp"). A staff-logged request waits until the customer confirms
--      it in the app the same way; nothing is released or deleted before. No supporting documents are collected.
--   3. 30 calendar days from receipt (internal target 15). One extension of up to 30 days, only for disproportionate effort or
--      multiple requests, recorded and notified before day 30. The queue escalates at day 20 and day 28.
--   4. Free of charge (there is no fee anywhere). Refusal only as repetitive, manifestly unfounded or disproportionate; the reason is
--      sent with the right to complain to SDAIA.
--   6. Correction: the contested field is taken out of processing (held aside, not readable by anyone but this workflow) until the
--      request is decided; on completion recipients are notified and the customer is told.
--   7. Access/copy and deletion run only as an approval decided by a different console user (privacy.approve) after step-up on both
--      sides; break-glass is never available for them.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Console permissions
-- ---------------------------------------------------------------------------------------------------------------------
-- privacy.manage works the queue (owner, operations: the roles that already read personal data). privacy.approve decides the
-- release of a copy and the execution of a deletion (owner). incident.manage keeps the breach register (owner; no DPO role exists,
-- gap dpo-role-not-defined).
INSERT INTO public.admin_role_permissions (admin_role, permission, description_en, description_ar) VALUES
  ('owner', 'privacy.manage', 'Work privacy requests: log, extend, refuse, correct, propose a copy or deletion, legal holds', 'معالجة طلبات الخصوصية: التسجيل والتمديد والرفض والتصحيح واقتراح النسخ أو الحذف والحجز القانوني'),
  ('operations', 'privacy.manage', 'Work privacy requests: log, extend, refuse, correct, propose a copy or deletion, legal holds', 'معالجة طلبات الخصوصية: التسجيل والتمديد والرفض والتصحيح واقتراح النسخ أو الحذف والحجز القانوني'),
  ('owner', 'privacy.approve', 'Approve the release of a data copy, a deletion or a legal hold proposed by someone else', 'اعتماد تسليم نسخة البيانات أو الحذف أو الحجز القانوني الذي اقترحه شخص آخر'),
  ('owner', 'incident.manage', 'Keep the personal data breach register', 'إدارة سجل حوادث تسرب البيانات الشخصية')
ON CONFLICT (admin_role, permission) DO UPDATE SET description_en = EXCLUDED.description_en, description_ar = EXCLUDED.description_ar;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. privacy_requests (data_subject_requests renamed, data preserved)
-- ---------------------------------------------------------------------------------------------------------------------
DROP VIEW IF EXISTS public.admin_data_subject_requests_view;
DROP FUNCTION IF EXISTS public.submit_data_request(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_update_data_request(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_list_data_requests(TEXT, INTEGER, INTEGER, TEXT);

ALTER TABLE IF EXISTS public.data_subject_requests RENAME TO privacy_requests;

DO $priv$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'privacy_requests' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.privacy_requests', r.policyname);
  END LOOP;
END $priv$;

-- The record outlives the account it is about (IR Art. 3(1)(d)): no foreign key that would delete it with the profile.
ALTER TABLE public.privacy_requests DROP CONSTRAINT IF EXISTS data_subject_requests_user_id_fkey;
ALTER TABLE public.privacy_requests DROP CONSTRAINT IF EXISTS data_subject_requests_reviewed_by_fkey;
ALTER TABLE public.privacy_requests DROP CONSTRAINT IF EXISTS data_subject_requests_request_type_check;
ALTER TABLE public.privacy_requests DROP CONSTRAINT IF EXISTS data_subject_requests_status_check;
ALTER TABLE public.privacy_requests RENAME COLUMN user_id TO subject_id;
ALTER TABLE public.privacy_requests RENAME COLUMN reviewed_by TO decided_by;
ALTER TABLE public.privacy_requests RENAME COLUMN reviewed_at TO decided_at;
ALTER TABLE public.privacy_requests RENAME COLUMN admin_notes TO staff_notes;
ALTER TABLE public.privacy_requests ALTER COLUMN request_type TYPE TEXT;
ALTER TABLE public.privacy_requests ALTER COLUMN status TYPE TEXT;
ALTER TABLE public.privacy_requests ALTER COLUMN status SET DEFAULT 'awaiting_verification';

ALTER TABLE public.privacy_requests
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS logged_by UUID,
  ADD COLUMN IF NOT EXISTS verification_method TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extended_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extension_code TEXT,
  ADD COLUMN IF NOT EXISTS extension_reason TEXT,
  ADD COLUMN IF NOT EXISTS extended_by UUID,
  ADD COLUMN IF NOT EXISTS extended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_day20_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_day28_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refusal_code TEXT,
  ADD COLUMN IF NOT EXISTS decision_reason TEXT,
  ADD COLUMN IF NOT EXISTS correction_field TEXT,
  ADD COLUMN IF NOT EXISTS correction_value TEXT,
  ADD COLUMN IF NOT EXISTS review_choice TEXT,
  ADD COLUMN IF NOT EXISTS consent_purposes TEXT[],
  ADD COLUMN IF NOT EXISTS approval_request_id UUID,
  ADD COLUMN IF NOT EXISTS execution_state TEXT,
  ADD COLUMN IF NOT EXISTS completion_summary JSONB,
  ADD COLUMN IF NOT EXISTS notice_contacts JSONB,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS legacy_dsr BOOLEAN NOT NULL DEFAULT FALSE;

-- Earlier rows: the old types map one to one; nothing about them was verified, so open ones wait for the customer's confirmation.
UPDATE public.privacy_requests SET
  legacy_dsr = TRUE,
  request_type = CASE request_type WHEN 'rectification' THEN 'correction' WHEN 'erasure' THEN 'deletion' WHEN 'export' THEN 'copy' ELSE request_type END,
  received_at = COALESCE(received_at, created_at),
  due_at = COALESCE(due_at, created_at + INTERVAL '30 days'),
  status = CASE status WHEN 'pending' THEN 'awaiting_verification' WHEN 'in_progress' THEN 'awaiting_verification'
                       WHEN 'rejected' THEN 'refused' ELSE status END,
  decision_reason = CASE WHEN status IN ('completed', 'rejected') THEN COALESCE(staff_notes, 'Recorded before PRIV-1') END,
  completed_at = CASE WHEN status IN ('completed', 'rejected') THEN COALESCE(decided_at, updated_at) END
 WHERE received_at IS NULL;

ALTER TABLE public.privacy_requests DROP COLUMN IF EXISTS due_date;
ALTER TABLE public.privacy_requests ALTER COLUMN received_at SET DEFAULT now();
ALTER TABLE public.privacy_requests ALTER COLUMN received_at SET NOT NULL;
ALTER TABLE public.privacy_requests ALTER COLUMN due_at SET NOT NULL;

ALTER TABLE public.privacy_requests DROP CONSTRAINT IF EXISTS privacy_requests_type_check;
ALTER TABLE public.privacy_requests ADD CONSTRAINT privacy_requests_type_check
  CHECK (request_type IN ('access', 'copy', 'correction', 'deletion', 'consent_withdrawal'));
ALTER TABLE public.privacy_requests DROP CONSTRAINT IF EXISTS privacy_requests_status_check;
ALTER TABLE public.privacy_requests ADD CONSTRAINT privacy_requests_status_check
  CHECK (status IN ('awaiting_verification', 'open', 'awaiting_approval', 'executing', 'completed', 'refused', 'withdrawn'));
ALTER TABLE public.privacy_requests DROP CONSTRAINT IF EXISTS privacy_requests_channel_check;
ALTER TABLE public.privacy_requests ADD CONSTRAINT privacy_requests_channel_check CHECK (channel IN ('in_app', 'email', 'phone', 'in_person'));
ALTER TABLE public.privacy_requests DROP CONSTRAINT IF EXISTS privacy_requests_staff_channel_logged;
ALTER TABLE public.privacy_requests ADD CONSTRAINT privacy_requests_staff_channel_logged CHECK (channel = 'in_app' OR logged_by IS NOT NULL OR legacy_dsr);
ALTER TABLE public.privacy_requests DROP CONSTRAINT IF EXISTS privacy_requests_verification_check;
ALTER TABLE public.privacy_requests ADD CONSTRAINT privacy_requests_verification_check
  CHECK (verification_method IS NULL OR verification_method IN ('in_app_otp_at_submission', 'in_app_otp_confirmation'));
ALTER TABLE public.privacy_requests DROP CONSTRAINT IF EXISTS privacy_requests_verified_before_work;
ALTER TABLE public.privacy_requests ADD CONSTRAINT privacy_requests_verified_before_work
  CHECK (status NOT IN ('open', 'awaiting_approval', 'executing') OR verified_at IS NOT NULL);
ALTER TABLE public.privacy_requests DROP CONSTRAINT IF EXISTS privacy_requests_extension_check;
ALTER TABLE public.privacy_requests ADD CONSTRAINT privacy_requests_extension_check CHECK (
  extended_due_at IS NULL OR (extension_code IN ('disproportionate_effort', 'multiple_requests') AND extension_reason IS NOT NULL
    AND extended_at IS NOT NULL AND extended_at < due_at AND extended_due_at > due_at AND extended_due_at <= due_at + INTERVAL '30 days'));
ALTER TABLE public.privacy_requests DROP CONSTRAINT IF EXISTS privacy_requests_refusal_check;
ALTER TABLE public.privacy_requests ADD CONSTRAINT privacy_requests_refusal_check CHECK (
  status <> 'refused' OR legacy_dsr OR (refusal_code IN ('repetitive', 'manifestly_unfounded', 'disproportionate') AND decision_reason IS NOT NULL));
ALTER TABLE public.privacy_requests DROP CONSTRAINT IF EXISTS privacy_requests_correction_check;
ALTER TABLE public.privacy_requests ADD CONSTRAINT privacy_requests_correction_check CHECK (
  correction_field IS NULL OR correction_field IN ('first_name', 'last_name', 'gender'));
ALTER TABLE public.privacy_requests DROP CONSTRAINT IF EXISTS privacy_requests_review_choice_check;
ALTER TABLE public.privacy_requests ADD CONSTRAINT privacy_requests_review_choice_check CHECK (
  review_choice IS NULL OR review_choice IN ('delete_text', 'deleted_user'));
ALTER TABLE public.privacy_requests DROP CONSTRAINT IF EXISTS privacy_requests_execution_state_check;
ALTER TABLE public.privacy_requests ADD CONSTRAINT privacy_requests_execution_state_check CHECK (
  execution_state IS NULL OR execution_state IN ('awaiting_build', 'built', 'erased_awaiting_auth', 'auth_deleted', 'account_held'));

DROP INDEX IF EXISTS public.idx_dsr_status_due_date;
CREATE INDEX IF NOT EXISTS idx_privacy_requests_open ON public.privacy_requests (due_at) WHERE status IN ('awaiting_verification', 'open', 'awaiting_approval', 'executing');
CREATE INDEX IF NOT EXISTS idx_privacy_requests_closed ON public.privacy_requests (completed_at DESC) WHERE status IN ('completed', 'refused', 'withdrawn');
CREATE UNIQUE INDEX IF NOT EXISTS uq_privacy_requests_one_open_per_type ON public.privacy_requests (subject_id, request_type)
  WHERE status IN ('awaiting_verification', 'open', 'awaiting_approval', 'executing');

-- No client reads or writes the table: customers use privacy_my_requests, the console the audited functions below.
REVOKE ALL ON public.privacy_requests FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.privacy_requests TO service_role;

-- What happened to a request, in order (IR Art. 3(1)(d): document every request and what was done). Append-only.
CREATE TABLE IF NOT EXISTS public.privacy_request_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.privacy_requests(id) ON DELETE RESTRICT,
  event TEXT NOT NULL,
  actor_id UUID,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('customer', 'console', 'system')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_privacy_request_events_request ON public.privacy_request_events (request_id, created_at);
ALTER TABLE public.privacy_request_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_request_events FROM anon, authenticated;
GRANT SELECT, INSERT ON public.privacy_request_events TO service_role;

CREATE OR REPLACE FUNCTION public.privacy_events_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'privacy_request_events is append-only' USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION public.privacy_events_append_only() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_privacy_events_append_only ON public.privacy_request_events;
CREATE TRIGGER trg_privacy_events_append_only BEFORE UPDATE OR DELETE ON public.privacy_request_events
  FOR EACH ROW EXECUTE FUNCTION public.privacy_events_append_only();

INSERT INTO public.privacy_request_events (request_id, event, actor_id, actor_kind, details, created_at)
SELECT r.id, 'migrated_from_data_subject_requests', NULL, 'system',
       jsonb_build_object('status', r.status, 'request_type', r.request_type), now()
  FROM public.privacy_requests r
 WHERE r.legacy_dsr AND NOT EXISTS (SELECT 1 FROM public.privacy_request_events e WHERE e.request_id = r.id);

-- The contested value of a correction, taken out of processing while the request is decided (Q1.6, IR Art. 7(1)).
CREATE TABLE IF NOT EXISTS public.privacy_field_restrictions (
  request_id UUID PRIMARY KEY REFERENCES public.privacy_requests(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL,
  field TEXT NOT NULL CHECK (field IN ('first_name', 'last_name', 'gender')),
  held_value TEXT,
  restricted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_privacy_field_restrictions_field ON public.privacy_field_restrictions (subject_id, field);
ALTER TABLE public.privacy_field_restrictions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_field_restrictions FROM anon, authenticated;
GRANT SELECT ON public.privacy_field_restrictions TO service_role;

-- Who was told about a completed correction (Q1.6, IR Art. 7(3)).
CREATE TABLE IF NOT EXISTS public.privacy_recipient_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.privacy_requests(id) ON DELETE RESTRICT,
  recipient_kind TEXT NOT NULL CHECK (recipient_kind IN ('provider', 'processor')),
  provider_id UUID,
  processor_name TEXT,
  field TEXT,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  method TEXT NOT NULL CHECK (method IN ('in_app_notification', 'manual')),
  CHECK ((recipient_kind = 'provider' AND provider_id IS NOT NULL) OR (recipient_kind = 'processor' AND processor_name IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_privacy_recipient_notices_request ON public.privacy_recipient_notices (request_id);
ALTER TABLE public.privacy_recipient_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_recipient_notices FROM anon, authenticated;
GRANT SELECT, INSERT ON public.privacy_recipient_notices TO service_role;

-- Q2.6: reuse of health answers for a later booking is its own consent purpose (PRIV-5 uses it).
ALTER TABLE public.consents DROP CONSTRAINT IF EXISTS consents_purpose_check;
ALTER TABLE public.consents ADD CONSTRAINT consents_purpose_check CHECK (purpose IN
  ('whatsapp', 'marketing', 'photos_portfolio', 'terms_privacy', 'data_processing', 'health_data', 'health_data_reuse'));

-- Escalated requests raise a security alert for the console.
ALTER TABLE public.security_alerts DROP CONSTRAINT IF EXISTS security_alerts_kind_check;
ALTER TABLE public.security_alerts ADD CONSTRAINT security_alerts_kind_check CHECK (kind IN (
  'mfa_lockout', 'mfa_reset', 'iban_reveal_volume', 'break_glass_used', 'console_role_changed', 'iban_change_requested',
  'health_break_glass', 'mfa_factor_added', 'iban_reveal_limit_reached', 'privacy_request_escalated', 'privacy_incident_deadline'));

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Internal helpers
-- ---------------------------------------------------------------------------------------------------------------------

-- Declared static (manifest declaredStatic): the Q1 deadlines.
CREATE OR REPLACE FUNCTION public.privacy_deadline_days() RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 30 $$;

-- The sentence every refusal and deletion notice carries (IR Art. 37: a complaint to SDAIA within 90 days).
CREATE OR REPLACE FUNCTION public.privacy_complaint_right() RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'en', 'You have the right to complain to the Saudi Data and AI Authority (SDAIA) within 90 days.',
    'ar', 'يحق لك تقديم شكوى إلى الهيئة السعودية للبيانات والذكاء الاصطناعي (سدايا) خلال 90 يوماً.');
$$;

CREATE OR REPLACE FUNCTION public.privacy_log_event(p_request_id UUID, p_event TEXT, p_details JSONB DEFAULT '{}'::jsonb)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.privacy_request_events (request_id, event, actor_id, actor_kind, details)
  VALUES (p_request_id, p_event, auth.uid(),
          CASE WHEN auth.uid() IS NULL THEN 'system' WHEN public.is_admin() THEN 'console' ELSE 'customer' END,
          COALESCE(p_details, '{}'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.privacy_log_event(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- In-app notice to the customer (when the account still exists) plus the out-of-band e-mail/SMS through the governance outbox.
CREATE OR REPLACE FUNCTION public.privacy_notify_customer(p_subject UUID, p_template TEXT, p_title_en TEXT, p_title_ar TEXT,
                                                          p_body_en TEXT, p_body_ar TEXT, p_payload JSONB DEFAULT '{}'::jsonb)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_subject) THEN
    INSERT INTO public.notifications (user_id, title_en, title_ar, body_en, body_ar, type, data)
    VALUES (p_subject, p_title_en, p_title_ar, p_body_en, p_body_ar, 'privacy_request', COALESCE(p_payload, '{}'::jsonb));
  END IF;
  PERFORM public.queue_governance_notice(p_subject, p_template, COALESCE(p_payload, '{}'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.privacy_notify_customer(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- Q1.2: a sign-in by one-time code to the account's verified e-mail or phone in the last 10 minutes.
CREATE OR REPLACE FUNCTION public.privacy_require_contact_otp() RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_latest NUMERIC;
  v_verified BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to make a privacy request' USING ERRCODE = '28000';
  END IF;
  SELECT (u.email_confirmed_at IS NOT NULL AND NULLIF(btrim(COALESCE(u.email, '')), '') IS NOT NULL)
      OR (u.phone_confirmed_at IS NOT NULL AND NULLIF(btrim(COALESCE(u.phone, '')), '') IS NOT NULL)
    INTO v_verified FROM auth.users u WHERE u.id = auth.uid();
  IF NOT COALESCE(v_verified, FALSE) THEN
    RAISE EXCEPTION 'Your account has no verified e-mail or phone to send a one-time code to' USING ERRCODE = '42501', HINT = 'no_verified_contact';
  END IF;
  v_latest := public.session_amr_latest(ARRAY['otp', 'magiclink', 'sms', 'email']);
  IF v_latest IS NULL OR to_timestamp(v_latest) < now() - INTERVAL '10 minutes' THEN
    RAISE EXCEPTION 'Confirm it is you: sign in with a one-time code sent to your verified e-mail or phone, then repeat the request'
      USING ERRCODE = '42501', HINT = 'contact_otp_required';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.privacy_require_contact_otp() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privacy_require_contact_otp() TO authenticated;

CREATE OR REPLACE FUNCTION public.privacy_require_console(p_permission TEXT) RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.admin_can(p_permission) THEN
    RAISE EXCEPTION 'Your console role cannot do this (% required)', p_permission USING ERRCODE = '42501', HINT = 'console_role_forbidden';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.privacy_require_console(TEXT) FROM PUBLIC, anon, authenticated;

-- Elapsed whole days since receipt, the deadline in force and the escalation level, for the queue and the customer.
CREATE OR REPLACE FUNCTION public.privacy_request_json(r public.privacy_requests, p_with_subject BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', r.id, 'subject_id', r.subject_id, 'request_type', r.request_type, 'channel', r.channel, 'status', r.status,
    'details', r.details, 'received_at', r.received_at, 'logged_by', r.logged_by,
    'verification_method', r.verification_method, 'verified_at', r.verified_at,
    'due_at', r.due_at, 'extended_due_at', r.extended_due_at, 'deadline_at', COALESCE(r.extended_due_at, r.due_at),
    'internal_target_at', r.received_at + INTERVAL '15 days',
    'extension_code', r.extension_code, 'extension_reason', r.extension_reason, 'extended_at', r.extended_at,
    'elapsed_days', floor(EXTRACT(EPOCH FROM (COALESCE(r.completed_at, now()) - r.received_at)) / 86400)::int,
    'escalation', CASE
      WHEN r.status NOT IN ('awaiting_verification', 'open', 'awaiting_approval', 'executing') THEN NULL
      WHEN now() >= COALESCE(r.extended_due_at, r.due_at) THEN 'overdue'
      WHEN r.extended_due_at IS NULL AND now() >= r.received_at + INTERVAL '28 days' THEN 'day_28'
      WHEN r.extended_due_at IS NULL AND now() >= r.received_at + INTERVAL '20 days' THEN 'day_20'
      WHEN now() >= r.received_at + INTERVAL '15 days' THEN 'past_internal_target'
    END,
    'escalated_day20_at', r.escalated_day20_at, 'escalated_day28_at', r.escalated_day28_at,
    'refusal_code', r.refusal_code, 'decision_reason', r.decision_reason, 'decided_by', r.decided_by, 'decided_at', r.decided_at,
    'correction_field', r.correction_field, 'correction_value', r.correction_value, 'review_choice', r.review_choice,
    'consent_purposes', to_jsonb(r.consent_purposes), 'approval_request_id', r.approval_request_id,
    'execution_state', r.execution_state, 'completion_summary', r.completion_summary, 'completed_at', r.completed_at,
    'staff_notes', r.staff_notes, 'legacy', r.legacy_dsr, 'created_at', r.created_at, 'complaint_right', public.privacy_complaint_right())
  || CASE WHEN p_with_subject THEN jsonb_build_object('subject', (
       SELECT jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name, 'exists', TRUE)
         FROM public.profiles p WHERE p.id = r.subject_id)) ELSE '{}'::jsonb END;
$$;
REVOKE ALL ON FUNCTION public.privacy_request_json(public.privacy_requests, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- Takes a contested field out of processing (held aside) for a correction request that has become verified.
CREATE OR REPLACE FUNCTION public.privacy_restrict_field(r public.privacy_requests) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_held TEXT;
BEGIN
  IF r.correction_field IS NULL OR EXISTS (SELECT 1 FROM public.privacy_field_restrictions WHERE request_id = r.id) THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.privacy_field_restrictions WHERE subject_id = r.subject_id AND field = r.correction_field) THEN
    RETURN;
  END IF;
  EXECUTE format('SELECT %I::text FROM public.profiles WHERE id = $1', r.correction_field) INTO v_held USING r.subject_id;
  INSERT INTO public.privacy_field_restrictions (request_id, subject_id, field, held_value) VALUES (r.id, r.subject_id, r.correction_field, v_held);
  PERFORM set_config('primora.privacy_field_write', 'on', true);
  EXECUTE format('UPDATE public.profiles SET %I = NULL WHERE id = $1', r.correction_field) USING r.subject_id;
  PERFORM set_config('primora.privacy_field_write', '', true);
  PERFORM public.privacy_log_event(r.id, 'field_restricted', jsonb_build_object('field', r.correction_field));
END $$;
REVOKE ALL ON FUNCTION public.privacy_restrict_field(public.privacy_requests) FROM PUBLIC, anon, authenticated;

-- Ends a restriction: the held value goes back (refused or withdrawn) or is destroyed (corrected).
CREATE OR REPLACE FUNCTION public.privacy_release_field(p_request_id UUID, p_restore BOOLEAN) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.privacy_field_restrictions;
BEGIN
  SELECT * INTO f FROM public.privacy_field_restrictions WHERE request_id = p_request_id FOR UPDATE;
  IF f.request_id IS NULL THEN RETURN; END IF;
  IF p_restore THEN
    EXECUTE format('UPDATE public.profiles SET %I = $2 WHERE id = $1', f.field) USING f.subject_id, f.held_value;
  END IF;
  DELETE FROM public.privacy_field_restrictions WHERE request_id = p_request_id;
  PERFORM public.privacy_log_event(p_request_id, CASE WHEN p_restore THEN 'field_restored' ELSE 'held_value_destroyed' END,
    jsonb_build_object('field', f.field));
END $$;
REVOKE ALL ON FUNCTION public.privacy_release_field(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- A restricted field is not edited from anywhere else while the request is open.
CREATE OR REPLACE FUNCTION public.privacy_guard_restricted_profile_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f RECORD;
BEGIN
  IF COALESCE(current_setting('primora.privacy_field_write', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  FOR f IN SELECT field FROM public.privacy_field_restrictions WHERE subject_id = NEW.id LOOP
    IF (to_jsonb(NEW) -> f.field) IS DISTINCT FROM (to_jsonb(OLD) -> f.field) THEN
      RAISE EXCEPTION 'This detail is under a correction request and cannot change until the request is decided' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.privacy_guard_restricted_profile_fields() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_privacy_restricted_fields ON public.profiles;
CREATE TRIGGER trg_privacy_restricted_fields BEFORE UPDATE OF first_name, last_name, gender ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.privacy_guard_restricted_profile_fields();

-- Records a set of consent withdrawals for the subject (the in-app request, or one confirmed after a staff log).
CREATE OR REPLACE FUNCTION public.privacy_withdraw_consents(r public.privacy_requests) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p TEXT;
  v_done TEXT[] := '{}';
  v_version TEXT;
BEGIN
  v_version := COALESCE((SELECT version FROM public.legal_agreements WHERE agreement_key = 'privacy_notice' AND status = 'published'
                          ORDER BY published_at DESC NULLS LAST LIMIT 1), 'unpublished');
  FOREACH p IN ARRAY COALESCE(r.consent_purposes, '{}'::text[]) LOOP
    IF EXISTS (SELECT 1 FROM (SELECT status FROM public.consents WHERE user_id = r.subject_id AND purpose = p
                               ORDER BY created_at DESC LIMIT 1) l WHERE l.status = 'granted') THEN
      INSERT INTO public.consents (user_id, purpose, status, document_version, method)
      VALUES (r.subject_id, p, 'withdrawn', v_version, 'privacy_request');
      v_done := v_done || p;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('withdrawn', to_jsonb(v_done), 'not_active', to_jsonb(ARRAY(
    SELECT x FROM unnest(COALESCE(r.consent_purposes, '{}'::text[])) x WHERE NOT x = ANY (v_done))));
END $$;
REVOKE ALL ON FUNCTION public.privacy_withdraw_consents(public.privacy_requests) FROM PUBLIC, anon, authenticated;

-- What happens once a request is verified: a correction restricts its field; a consent withdrawal is carried out at once.
CREATE OR REPLACE FUNCTION public.privacy_start_request(p_id UUID) RETURNS public.privacy_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.privacy_requests;
  v_result JSONB;
BEGIN
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_id FOR UPDATE;
  IF r.request_type = 'correction' THEN
    PERFORM public.privacy_restrict_field(r);
  ELSIF r.request_type = 'consent_withdrawal' THEN
    v_result := public.privacy_withdraw_consents(r);
    UPDATE public.privacy_requests SET status = 'completed', completed_at = now(), completion_summary = v_result,
           decision_reason = 'Consent withdrawal recorded', updated_at = now()
     WHERE id = p_id RETURNING * INTO r;
    PERFORM public.privacy_log_event(p_id, 'completed', v_result);
    PERFORM public.privacy_notify_customer(r.subject_id, 'privacy_request_completed',
      'Your consent withdrawal is recorded', 'تم تسجيل سحب موافقتك',
      'We recorded the withdrawal of the consents you selected.', 'سجلنا سحب الموافقات التي اخترتها.',
      jsonb_build_object('request_id', p_id, 'request_type', r.request_type));
  END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.privacy_start_request(UUID) FROM PUBLIC, anon, authenticated;

-- Validates the type-specific options of a new request and returns them normalised.
CREATE OR REPLACE FUNCTION public.privacy_request_options(p_subject UUID, p_type TEXT, p_options JSONB)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o JSONB := COALESCE(p_options, '{}'::jsonb);
  v_field TEXT := NULLIF(btrim(COALESCE(o->>'correction_field', '')), '');
  v_value TEXT := NULLIF(btrim(COALESCE(o->>'correction_value', '')), '');
  v_choice TEXT := NULLIF(btrim(COALESCE(o->>'review_choice', '')), '');
  v_purposes TEXT[];
BEGIN
  IF p_type = 'correction' THEN
    IF v_field IS NULL OR v_field NOT IN ('first_name', 'last_name', 'gender') THEN
      RAISE EXCEPTION 'Choose the detail to correct: first name, last name or gender' USING ERRCODE = '22023';
    END IF;
    IF v_field = 'gender' AND COALESCE(v_value, '') NOT IN ('male', 'female') THEN
      RAISE EXCEPTION 'Gender must be male or female' USING ERRCODE = '22023';
    END IF;
    IF v_field IN ('first_name', 'last_name') AND (v_value IS NULL OR char_length(v_value) > 50) THEN
      RAISE EXCEPTION 'Give the correct value (1 to 50 characters)' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.privacy_field_restrictions WHERE subject_id = p_subject AND field = v_field) THEN
      RAISE EXCEPTION 'A correction of this detail is already being decided' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('correction_field', v_field, 'correction_value', v_value);
  ELSIF p_type = 'deletion' THEN
    IF v_choice IS NULL OR v_choice NOT IN ('delete_text', 'deleted_user') THEN
      RAISE EXCEPTION 'Choose what happens to your reviews: delete their text, or keep them as "Deleted user"' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_subject AND role <> 'customer') THEN
      RAISE EXCEPTION 'Business and console accounts are closed through PRIMORA support, not this request' USING ERRCODE = '22023',
        HINT = 'not_a_customer_account';
    END IF;
    RETURN jsonb_build_object('review_choice', v_choice);
  ELSIF p_type = 'consent_withdrawal' THEN
    IF jsonb_typeof(o->'consent_purposes') <> 'array' THEN
      RAISE EXCEPTION 'Choose at least one consent to withdraw' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(DISTINCT x) INTO v_purposes FROM jsonb_array_elements_text(o->'consent_purposes') x;
    IF v_purposes IS NULL OR NOT v_purposes <@ ARRAY['whatsapp', 'marketing', 'photos_portfolio', 'data_processing', 'health_data', 'health_data_reuse'] THEN
      RAISE EXCEPTION 'Choose at least one consent to withdraw from the list' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('consent_purposes', to_jsonb(v_purposes));
  END IF;
  RETURN '{}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION public.privacy_request_options(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Customer commands
-- ---------------------------------------------------------------------------------------------------------------------

-- Submits an in-app request. Free of charge. Verified by a fresh one-time code sign-in. Repeating a type that is still open
-- returns the open request instead of opening a second one.
CREATE OR REPLACE FUNCTION public.privacy_submit_request(p_request_type TEXT, p_details TEXT DEFAULT NULL, p_options JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_details TEXT := NULLIF(btrim(COALESCE(p_details, '')), '');
  v_opts JSONB;
  r public.privacy_requests;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to make a privacy request' USING ERRCODE = '28000';
  END IF;
  IF p_request_type IS NULL OR p_request_type NOT IN ('access', 'copy', 'correction', 'deletion', 'consent_withdrawal') THEN
    RAISE EXCEPTION 'Unknown request type' USING ERRCODE = '22023';
  END IF;
  IF v_details IS NOT NULL AND char_length(v_details) > 2000 THEN
    RAISE EXCEPTION 'Details are limited to 2000 characters' USING ERRCODE = '22023';
  END IF;
  IF public.is_admin() THEN
    RAISE EXCEPTION 'A console session cannot file a privacy request; sign in to your customer account' USING ERRCODE = '42501';
  END IF;
  PERFORM public.privacy_require_contact_otp();
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('privacy:' || v_uid::text || ':' || p_request_type, 0));
  SELECT * INTO r FROM public.privacy_requests
   WHERE subject_id = v_uid AND request_type = p_request_type AND status IN ('awaiting_verification', 'open', 'awaiting_approval', 'executing')
   ORDER BY received_at LIMIT 1;
  IF r.id IS NOT NULL THEN
    RETURN public.privacy_request_json(r) || jsonb_build_object('created', FALSE);
  END IF;
  v_opts := public.privacy_request_options(v_uid, p_request_type, p_options);

  INSERT INTO public.privacy_requests (subject_id, request_type, channel, status, details, received_at, due_at,
    verification_method, verified_at, correction_field, correction_value, review_choice, consent_purposes)
  VALUES (v_uid, p_request_type, 'in_app', 'open', v_details, now(), now() + make_interval(days => public.privacy_deadline_days()),
    'in_app_otp_at_submission', now(), v_opts->>'correction_field', v_opts->>'correction_value', v_opts->>'review_choice',
    CASE WHEN v_opts ? 'consent_purposes' THEN ARRAY(SELECT jsonb_array_elements_text(v_opts->'consent_purposes')) END)
  RETURNING * INTO r;
  PERFORM public.privacy_log_event(r.id, 'received', jsonb_build_object('channel', 'in_app', 'request_type', p_request_type));
  PERFORM public.privacy_log_event(r.id, 'identity_verified', jsonb_build_object('method', 'in_app_otp_at_submission'));
  PERFORM public.write_audit_log('privacy.request_submitted', 'privacy_requests', r.id,
    jsonb_build_object('request_type', p_request_type, 'channel', 'in_app', 'due_at', r.due_at));
  r := public.privacy_start_request(r.id);
  IF r.status <> 'completed' THEN
    PERFORM public.privacy_notify_customer(v_uid, 'privacy_request_received',
      'We received your privacy request', 'استلمنا طلب الخصوصية',
      'We will answer within 30 days. It is free of charge.', 'سنرد خلال 30 يوماً، والطلب مجاني.',
      jsonb_build_object('request_id', r.id, 'request_type', p_request_type, 'due_at', r.due_at));
  END IF;
  RETURN public.privacy_request_json(r) || jsonb_build_object('created', TRUE);
END $$;
REVOKE ALL ON FUNCTION public.privacy_submit_request(TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privacy_submit_request(TEXT, TEXT, JSONB) TO authenticated;

-- Confirms a request staff logged from another channel (Q1.2: verified the same way before anything is released or deleted).
CREATE OR REPLACE FUNCTION public.privacy_confirm_request(p_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.privacy_requests;
BEGIN
  PERFORM public.privacy_require_contact_otp();
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_request_id AND subject_id = auth.uid() FOR UPDATE;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF r.status <> 'awaiting_verification' THEN
    RETURN public.privacy_request_json(r) || jsonb_build_object('unchanged', TRUE);
  END IF;
  IF r.request_type = 'deletion' AND r.review_choice IS NULL THEN
    RAISE EXCEPTION 'Choose what happens to your reviews before confirming' USING ERRCODE = '22023';
  END IF;
  UPDATE public.privacy_requests SET status = 'open', verification_method = 'in_app_otp_confirmation', verified_at = now(), updated_at = now()
   WHERE id = r.id RETURNING * INTO r;
  PERFORM public.privacy_log_event(r.id, 'identity_verified', jsonb_build_object('method', 'in_app_otp_confirmation'));
  PERFORM public.write_audit_log('privacy.request_confirmed', 'privacy_requests', r.id, jsonb_build_object('request_type', r.request_type));
  r := public.privacy_start_request(r.id);
  RETURN public.privacy_request_json(r);
END $$;
REVOKE ALL ON FUNCTION public.privacy_confirm_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privacy_confirm_request(UUID) TO authenticated;

-- The deletion choice for a staff-logged deletion request is the customer's own (Q2.1: per customer choice).
CREATE OR REPLACE FUNCTION public.privacy_set_review_choice(p_request_id UUID, p_choice TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.privacy_requests;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_choice IS NULL OR p_choice NOT IN ('delete_text', 'deleted_user') THEN
    RAISE EXCEPTION 'Choose delete_text or deleted_user' USING ERRCODE = '22023';
  END IF;
  UPDATE public.privacy_requests SET review_choice = p_choice, updated_at = now()
   WHERE id = p_request_id AND subject_id = auth.uid() AND request_type = 'deletion' AND status IN ('awaiting_verification', 'open')
  RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found or no longer open' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.privacy_log_event(r.id, 'review_choice_set', jsonb_build_object('review_choice', p_choice));
  RETURN public.privacy_request_json(r);
END $$;
REVOKE ALL ON FUNCTION public.privacy_set_review_choice(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privacy_set_review_choice(UUID, TEXT) TO authenticated;

-- The customer withdraws a request that has not been approved yet; a contested field goes back as it was.
CREATE OR REPLACE FUNCTION public.privacy_withdraw_request(p_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.privacy_requests;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_request_id AND subject_id = auth.uid() FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002'; END IF;
  IF r.status NOT IN ('awaiting_verification', 'open') THEN
    RAISE EXCEPTION 'This request can no longer be withdrawn (it is %)', r.status USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('primora.privacy_field_write', 'on', true);
  PERFORM public.privacy_release_field(r.id, TRUE);
  PERFORM set_config('primora.privacy_field_write', '', true);
  UPDATE public.privacy_requests SET status = 'withdrawn', completed_at = now(), decision_reason = 'Withdrawn by the customer',
         correction_value = NULL, updated_at = now()
   WHERE id = r.id RETURNING * INTO r;
  PERFORM public.privacy_log_event(r.id, 'withdrawn_by_customer');
  PERFORM public.write_audit_log('privacy.request_withdrawn', 'privacy_requests', r.id, jsonb_build_object('request_type', r.request_type));
  RETURN public.privacy_request_json(r);
END $$;
REVOKE ALL ON FUNCTION public.privacy_withdraw_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privacy_withdraw_request(UUID) TO authenticated;

-- The customer's own requests, newest first (with the copy's download state once PRIV-2 adds it).
CREATE OR REPLACE FUNCTION public.privacy_my_requests()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(public.privacy_request_json(r) - 'staff_notes' - 'decided_by' - 'logged_by' ORDER BY r.received_at DESC)
                     FROM public.privacy_requests r WHERE r.subject_id = auth.uid()), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.privacy_my_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privacy_my_requests() TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Console commands
-- ---------------------------------------------------------------------------------------------------------------------

-- A request received by e-mail, phone or in person, logged by staff. It waits for the customer's in-app confirmation.
CREATE OR REPLACE FUNCTION public.admin_privacy_log_request(p_subject_id UUID, p_request_type TEXT, p_channel TEXT,
  p_received_at TIMESTAMPTZ, p_details TEXT, p_options JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_details TEXT := NULLIF(btrim(COALESCE(p_details, '')), '');
  v_received TIMESTAMPTZ := COALESCE(p_received_at, now());
  v_opts JSONB;
  r public.privacy_requests;
BEGIN
  PERFORM public.privacy_require_console('privacy.manage');
  IF p_channel IS NULL OR p_channel NOT IN ('email', 'phone', 'in_person') THEN
    RAISE EXCEPTION 'The channel must be email, phone or in_person' USING ERRCODE = '22023';
  END IF;
  IF p_request_type IS NULL OR p_request_type NOT IN ('access', 'copy', 'correction', 'deletion', 'consent_withdrawal') THEN
    RAISE EXCEPTION 'Unknown request type' USING ERRCODE = '22023';
  END IF;
  IF v_received > now() + INTERVAL '1 minute' OR v_received < now() - INTERVAL '30 days' THEN
    RAISE EXCEPTION 'The received time must be the actual time it arrived, in the last 30 days' USING ERRCODE = '22023';
  END IF;
  IF v_details IS NULL OR char_length(v_details) < 10 OR char_length(v_details) > 2000 THEN
    RAISE EXCEPTION 'Describe what the customer asked for (10 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_subject_id) THEN
    RAISE EXCEPTION 'Customer account not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('privacy:' || p_subject_id::text || ':' || p_request_type, 0));
  IF EXISTS (SELECT 1 FROM public.privacy_requests WHERE subject_id = p_subject_id AND request_type = p_request_type
               AND status IN ('awaiting_verification', 'open', 'awaiting_approval', 'executing')) THEN
    RAISE EXCEPTION 'This customer already has an open % request', p_request_type USING ERRCODE = '22023';
  END IF;
  -- The review choice of a deletion is the customer's; it is asked for when they confirm.
  v_opts := public.privacy_request_options(p_subject_id, p_request_type,
              CASE WHEN p_request_type = 'deletion' THEN COALESCE(p_options, '{}'::jsonb) || '{"review_choice":"deleted_user"}'::jsonb
                   ELSE p_options END);
  INSERT INTO public.privacy_requests (subject_id, request_type, channel, status, details, received_at, due_at, logged_by,
    correction_field, correction_value, review_choice, consent_purposes)
  VALUES (p_subject_id, p_request_type, p_channel, 'awaiting_verification', v_details, v_received,
    v_received + make_interval(days => public.privacy_deadline_days()), auth.uid(),
    v_opts->>'correction_field', v_opts->>'correction_value', NULL,
    CASE WHEN v_opts ? 'consent_purposes' THEN ARRAY(SELECT jsonb_array_elements_text(v_opts->'consent_purposes')) END)
  RETURNING * INTO r;
  PERFORM public.privacy_log_event(r.id, 'received', jsonb_build_object('channel', p_channel, 'request_type', p_request_type, 'logged_by_staff', TRUE));
  PERFORM public.write_audit_log('privacy.request_logged', 'privacy_requests', r.id,
    jsonb_build_object('request_type', p_request_type, 'channel', p_channel, 'subject_id', p_subject_id, 'received_at', v_received)
    || public.request_client_info());
  PERFORM public.privacy_notify_customer(p_subject_id, 'privacy_request_confirm',
    'Confirm your privacy request', 'أكّد طلب الخصوصية',
    'We logged a privacy request for your account. Open Privacy in your account and confirm it with a one-time code.',
    'سجلنا طلب خصوصية لحسابك. افتح صفحة الخصوصية في حسابك وأكّده برمز لمرة واحدة.',
    jsonb_build_object('request_id', r.id, 'request_type', p_request_type, 'due_at', r.due_at));
  RETURN public.privacy_request_json(r);
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_log_request(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_log_request(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB) TO authenticated;

-- One extension of up to 30 days, decided and notified before the 30-day deadline, for disproportionate effort or multiple requests.
CREATE OR REPLACE FUNCTION public.admin_privacy_extend_request(p_request_id UUID, p_code TEXT, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  r public.privacy_requests;
BEGIN
  PERFORM public.privacy_require_console('privacy.manage');
  IF p_code IS NULL OR p_code NOT IN ('disproportionate_effort', 'multiple_requests') THEN
    RAISE EXCEPTION 'An extension is allowed only for disproportionate effort or multiple requests' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 20 THEN
    RAISE EXCEPTION 'Explain the reason the customer will read (at least 20 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_request_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002'; END IF;
  IF r.status NOT IN ('awaiting_verification', 'open', 'awaiting_approval', 'executing') THEN
    RAISE EXCEPTION 'Only an open request can be extended' USING ERRCODE = '22023';
  END IF;
  IF r.extended_due_at IS NOT NULL THEN
    RAISE EXCEPTION 'This request was already extended once; a second extension is not allowed' USING ERRCODE = '22023';
  END IF;
  IF now() >= r.due_at THEN
    RAISE EXCEPTION 'The extension must be notified before day 30; the deadline has passed' USING ERRCODE = '22023';
  END IF;
  IF p_code = 'multiple_requests' AND NOT EXISTS (
       SELECT 1 FROM public.privacy_requests o WHERE o.subject_id = r.subject_id AND o.id <> r.id AND o.received_at > r.received_at - INTERVAL '12 months') THEN
    RAISE EXCEPTION 'Multiple requests: this customer has no other request in the last 12 months' USING ERRCODE = '22023';
  END IF;
  UPDATE public.privacy_requests SET extended_due_at = due_at + INTERVAL '30 days', extension_code = p_code, extension_reason = v_reason,
         extended_by = auth.uid(), extended_at = now(), updated_at = now()
   WHERE id = r.id RETURNING * INTO r;
  PERFORM public.privacy_log_event(r.id, 'extended', jsonb_build_object('code', p_code, 'extended_due_at', r.extended_due_at));
  PERFORM public.write_audit_log('privacy.request_extended', 'privacy_requests', r.id,
    jsonb_build_object('code', p_code, 'reason', v_reason, 'extended_due_at', r.extended_due_at) || public.request_client_info());
  PERFORM public.privacy_notify_customer(r.subject_id, 'privacy_request_extended',
    'Your privacy request needs more time', 'طلب الخصوصية يحتاج وقتاً إضافياً',
    'We extended the answer date of your request once, by up to 30 days. Reason: ' || v_reason,
    'مددنا موعد الرد على طلبك مرة واحدة بحد أقصى 30 يوماً. السبب: ' || v_reason,
    jsonb_build_object('request_id', r.id, 'request_type', r.request_type, 'extended_due_at', r.extended_due_at, 'reason', v_reason));
  RETURN public.privacy_request_json(r, TRUE);
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_extend_request(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_extend_request(UUID, TEXT, TEXT) TO authenticated;

-- Refusal: only repetitive, manifestly unfounded or disproportionate, with the reason and the right to complain to SDAIA.
CREATE OR REPLACE FUNCTION public.admin_privacy_refuse_request(p_request_id UUID, p_code TEXT, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  r public.privacy_requests;
BEGIN
  PERFORM public.require_recent_mfa();
  PERFORM public.privacy_require_console('privacy.manage');
  IF p_code IS NULL OR p_code NOT IN ('repetitive', 'manifestly_unfounded', 'disproportionate') THEN
    RAISE EXCEPTION 'A request may be refused only as repetitive, manifestly unfounded or disproportionate' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 20 THEN
    RAISE EXCEPTION 'Explain the refusal the customer will read (at least 20 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_request_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002'; END IF;
  IF r.status NOT IN ('awaiting_verification', 'open', 'awaiting_approval') THEN
    RAISE EXCEPTION 'This request is % and can no longer be refused', r.status USING ERRCODE = '22023';
  END IF;
  IF r.status = 'awaiting_approval' AND r.approval_request_id IS NOT NULL THEN
    UPDATE public.admin_approval_requests SET status = 'cancelled', decided_by = auth.uid(), decided_at = now(),
           decision_reason = 'Privacy request refused: ' || v_reason
     WHERE id = r.approval_request_id AND status = 'pending';
  END IF;
  PERFORM set_config('primora.privacy_field_write', 'on', true);
  PERFORM public.privacy_release_field(r.id, TRUE);
  PERFORM set_config('primora.privacy_field_write', '', true);
  UPDATE public.privacy_requests SET status = 'refused', refusal_code = p_code, decision_reason = v_reason, decided_by = auth.uid(),
         decided_at = now(), completed_at = now(), correction_value = NULL, updated_at = now()
   WHERE id = r.id RETURNING * INTO r;
  PERFORM public.privacy_log_event(r.id, 'refused', jsonb_build_object('code', p_code));
  PERFORM public.write_audit_log('privacy.request_refused', 'privacy_requests', r.id,
    jsonb_build_object('code', p_code, 'reason', v_reason, 'request_type', r.request_type) || public.request_client_info());
  PERFORM public.privacy_notify_customer(r.subject_id, 'privacy_request_refused',
    'Your privacy request was refused', 'رُفض طلب الخصوصية',
    'Reason: ' || v_reason || ' ' || (public.privacy_complaint_right()->>'en'),
    'السبب: ' || v_reason || ' ' || (public.privacy_complaint_right()->>'ar'),
    jsonb_build_object('request_id', r.id, 'request_type', r.request_type, 'refusal_code', p_code, 'reason', v_reason));
  RETURN public.privacy_request_json(r, TRUE);
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_refuse_request(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_refuse_request(UUID, TEXT, TEXT) TO authenticated;

-- Correction completed: the new value replaces the contested one, every provider that received it is notified, the customer is told.
CREATE OR REPLACE FUNCTION public.admin_privacy_complete_correction(p_request_id UUID, p_note TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
  r public.privacy_requests;
  v_providers UUID[];
  pr RECORD;
BEGIN
  PERFORM public.privacy_require_console('privacy.manage');
  IF v_note IS NULL OR char_length(v_note) < 10 THEN
    RAISE EXCEPTION 'Record how the correction was checked (at least 10 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_request_id FOR UPDATE;
  IF r.id IS NULL OR r.request_type <> 'correction' THEN RAISE EXCEPTION 'Correction request not found' USING ERRCODE = 'P0002'; END IF;
  IF r.status <> 'open' THEN
    RAISE EXCEPTION 'Only a verified, open correction request can be completed (it is %)', r.status USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = r.subject_id) THEN
    RAISE EXCEPTION 'The customer account no longer exists' USING ERRCODE = 'P0002';
  END IF;
  PERFORM set_config('primora.privacy_field_write', 'on', true);
  PERFORM public.privacy_release_field(r.id, FALSE);
  EXECUTE format('UPDATE public.profiles SET %I = $2 WHERE id = $1', r.correction_field) USING r.subject_id, r.correction_value;
  PERFORM set_config('primora.privacy_field_write', '', true);

  -- Recipients: every business the customer booked with received the name (and gender, for gendered services).
  SELECT array_agg(DISTINCT br.provider_id) INTO v_providers
    FROM public.bookings b JOIN public.branches br ON br.id = b.branch_id WHERE b.customer_id = r.subject_id;
  FOR pr IN SELECT p.id, p.owner_id FROM public.providers p WHERE p.id = ANY (COALESCE(v_providers, '{}'::uuid[])) LOOP
    INSERT INTO public.privacy_recipient_notices (request_id, recipient_kind, provider_id, field, method)
    VALUES (r.id, 'provider', pr.id, r.correction_field, 'in_app_notification');
    INSERT INTO public.notifications (user_id, title_en, title_ar, body_en, body_ar, type, data)
    VALUES (pr.owner_id, 'A customer record was corrected', 'تم تصحيح بيانات عميل',
      'A customer you served had their ' || replace(r.correction_field, '_', ' ') || ' corrected. Update any copy you keep outside PRIMORA.',
      'صُححت بيانات أحد عملائك. حدّث أي نسخة تحتفظ بها خارج بريمورا.',
      'privacy_correction', jsonb_build_object('request_id', r.id, 'field', r.correction_field));
  END LOOP;

  UPDATE public.privacy_requests SET status = 'completed', decided_by = auth.uid(), decided_at = now(), completed_at = now(),
         decision_reason = v_note, correction_value = NULL,
         completion_summary = jsonb_build_object('field', r.correction_field, 'providers_notified', COALESCE(cardinality(v_providers), 0)),
         updated_at = now()
   WHERE id = r.id RETURNING * INTO r;
  PERFORM public.privacy_log_event(r.id, 'completed', r.completion_summary);
  PERFORM public.write_audit_log('privacy.correction_completed', 'privacy_requests', r.id,
    jsonb_build_object('field', r.correction_field, 'providers_notified', COALESCE(cardinality(v_providers), 0), 'note', v_note)
    || public.request_client_info());
  PERFORM public.privacy_notify_customer(r.subject_id, 'privacy_request_completed',
    'Your correction is complete', 'اكتمل تصحيح بياناتك',
    'We corrected your details and told the businesses that received them.', 'صححنا بياناتك وأبلغنا الجهات التي استلمتها.',
    jsonb_build_object('request_id', r.id, 'request_type', 'correction'));
  RETURN public.privacy_request_json(r, TRUE);
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_complete_correction(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_complete_correction(UUID, TEXT) TO authenticated;

-- A staff note on a request (what was checked, a printed copy requested): appended to the history.
CREATE OR REPLACE FUNCTION public.admin_privacy_add_note(p_request_id UUID, p_note TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
  r public.privacy_requests;
BEGIN
  PERFORM public.privacy_require_console('privacy.manage');
  IF v_note IS NULL OR char_length(v_note) < 3 OR char_length(v_note) > 1000 THEN
    RAISE EXCEPTION 'A note is 3 to 1000 characters' USING ERRCODE = '22023';
  END IF;
  UPDATE public.privacy_requests SET staff_notes = left(concat_ws(E'\n', staff_notes, to_char(now() AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || ' ' || v_note), 4000),
         updated_at = now()
   WHERE id = p_request_id RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.privacy_log_event(r.id, 'note_added');
  PERFORM public.write_audit_log('privacy.note_added', 'privacy_requests', r.id, jsonb_build_object('note', v_note));
  RETURN public.privacy_request_json(r, TRUE);
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_add_note(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_add_note(UUID, TEXT) TO authenticated;

-- The queue, paged and audited: open requests by deadline, or closed ones by completion.
CREATE OR REPLACE FUNCTION public.admin_privacy_list_requests(p_state TEXT DEFAULT 'open', p_limit INTEGER DEFAULT 50,
                                                             p_offset INTEGER DEFAULT 0, p_purpose TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_purpose TEXT;
  v_open BOOLEAN;
  v_total BIGINT;
  v_rows JSONB;
  v_ids UUID[];
BEGIN
  PERFORM public.gov2_require_read(ARRAY['privacy.manage', 'privacy.approve'], 'privacy requests');
  v_purpose := public.gov2_read_purpose(p_purpose, 'privacy_request');
  IF p_state NOT IN ('open', 'closed') THEN RAISE EXCEPTION 'The state must be open or closed' USING ERRCODE = '22023'; END IF;
  v_open := p_state = 'open';
  SELECT count(*) INTO v_total FROM public.privacy_requests
   WHERE (status IN ('awaiting_verification', 'open', 'awaiting_approval', 'executing')) = v_open;
  SELECT COALESCE(jsonb_agg(public.privacy_request_json(x.req, TRUE) ORDER BY x.k1 ASC NULLS LAST, x.k2 DESC NULLS LAST, x.sid), '[]'::jsonb),
         COALESCE(array_agg(x.sid), '{}')
    INTO v_rows, v_ids
    FROM (SELECT r AS req, r.subject_id AS sid,
                 CASE WHEN v_open THEN COALESCE(r.extended_due_at, r.due_at) END AS k1, CASE WHEN NOT v_open THEN r.completed_at END AS k2
            FROM public.privacy_requests r
           WHERE (r.status IN ('awaiting_verification', 'open', 'awaiting_approval', 'executing')) = v_open
           ORDER BY k1 ASC NULLS LAST, k2 DESC NULLS LAST, r.id LIMIT v_limit OFFSET v_offset) x;
  PERFORM public.gov2_log_read('privacy_requests.listed', 'privacy_requests', v_ids,
    ARRAY['request_type', 'status', 'details', 'deadline', 'first_name', 'last_name'], v_purpose,
    jsonb_build_object('state', p_state, 'limit', v_limit, 'offset', v_offset), jsonb_array_length(v_rows));
  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_list_requests(TEXT, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_list_requests(TEXT, INTEGER, INTEGER, TEXT) TO authenticated;

-- One request with its history, audited.
CREATE OR REPLACE FUNCTION public.admin_privacy_get_request(p_request_id UUID, p_purpose TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.privacy_requests;
  v_purpose TEXT;
BEGIN
  PERFORM public.gov2_require_read(ARRAY['privacy.manage', 'privacy.approve'], 'privacy requests');
  v_purpose := public.gov2_read_purpose(p_purpose, 'privacy_request');
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_request_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.gov2_log_read('privacy_request.viewed', 'privacy_requests', ARRAY[r.subject_id],
    ARRAY['request', 'history', 'first_name', 'last_name'], v_purpose, jsonb_build_object('request_id', r.id), 1);
  RETURN public.privacy_request_json(r, TRUE) || jsonb_build_object(
    'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('event', e.event, 'actor_kind', e.actor_kind, 'actor_id', e.actor_id,
                                                             'details', e.details, 'created_at', e.created_at) ORDER BY e.created_at, e.id)
                          FROM public.privacy_request_events e WHERE e.request_id = r.id), '[]'::jsonb),
    'restricted_field', (SELECT field FROM public.privacy_field_restrictions WHERE request_id = r.id),
    'recipients_notified', (SELECT count(*) FROM public.privacy_recipient_notices WHERE request_id = r.id));
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_get_request(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_get_request(UUID, TEXT) TO authenticated;

-- Day-20 and day-28 escalation (the scheduler, or a privacy.manage holder from the queue). Each level is recorded once per
-- request, raises a security alert and a notice to every owner.
CREATE OR REPLACE FUNCTION public.privacy_escalate_requests()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_owner RECORD;
  v_20 INTEGER := 0;
  v_28 INTEGER := 0;
  v_level TEXT;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    PERFORM public.privacy_require_console('privacy.manage');
  END IF;
  FOR r IN
    SELECT * FROM public.privacy_requests
     WHERE status IN ('awaiting_verification', 'open', 'awaiting_approval', 'executing')
       AND ((escalated_day20_at IS NULL AND now() >= received_at + INTERVAL '20 days')
         OR (escalated_day28_at IS NULL AND now() >= received_at + INTERVAL '28 days'))
     FOR UPDATE
  LOOP
    IF r.escalated_day28_at IS NULL AND now() >= r.received_at + INTERVAL '28 days' THEN
      v_level := 'day_28';
      UPDATE public.privacy_requests SET escalated_day28_at = now(), escalated_day20_at = COALESCE(escalated_day20_at, now()) WHERE id = r.id;
      v_28 := v_28 + 1;
    ELSE
      v_level := 'day_20';
      UPDATE public.privacy_requests SET escalated_day20_at = now() WHERE id = r.id;
      v_20 := v_20 + 1;
    END IF;
    PERFORM public.privacy_log_event(r.id, 'escalated', jsonb_build_object('level', v_level));
    INSERT INTO public.security_alerts (kind, user_id, details)
    VALUES ('privacy_request_escalated', NULL, jsonb_build_object('request_id', r.id, 'level', v_level, 'request_type', r.request_type,
            'deadline_at', COALESCE(r.extended_due_at, r.due_at)));
    FOR v_owner IN SELECT a.user_id FROM public.admin_role_assignments a JOIN public.profiles p ON p.id = a.user_id AND p.role = 'admin'
                    WHERE a.admin_role = 'owner' LOOP
      PERFORM public.queue_governance_notice(v_owner.user_id, 'privacy_request_escalated',
        jsonb_build_object('request_id', r.id, 'level', v_level, 'request_type', r.request_type, 'deadline_at', COALESCE(r.extended_due_at, r.due_at)));
    END LOOP;
  END LOOP;
  IF v_20 + v_28 > 0 THEN
    PERFORM public.write_audit_log('privacy.requests_escalated', 'privacy_requests', NULL, jsonb_build_object('day_20', v_20, 'day_28', v_28));
  END IF;
  RETURN jsonb_build_object('day_20', v_20, 'day_28', v_28);
END $$;
REVOKE ALL ON FUNCTION public.privacy_escalate_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privacy_escalate_requests() TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Approval kinds for the copy and the deletion (four eyes, no break-glass)
-- ---------------------------------------------------------------------------------------------------------------------
ALTER TABLE public.admin_approval_requests DROP CONSTRAINT IF EXISTS admin_approval_requests_kind_check;
ALTER TABLE public.admin_approval_requests ADD CONSTRAINT admin_approval_requests_kind_check CHECK (kind IN (
  'payout_release', 'refund', 'iban_change', 'setting_change', 'ledger_settlement', 'ledger_adjustment', 'fee_rule_change',
  'payout_hold', 'reward_program', 'role_change', 'booking_cancellation', 'reconciliation_import', 'sponsored_price_change',
  'privacy_export', 'privacy_deletion', 'privacy_legal_hold'));

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
  END;
$$;

SELECT pg_temp.patch_function('public.governance_execute(uuid)'::regprocedure,
$from$                       'booking_cancellation', 'reconciliation_import', 'sponsored_price_change') THEN$from$,
$to$                       'booking_cancellation', 'reconciliation_import', 'sponsored_price_change',
                       'privacy_export', 'privacy_deletion', 'privacy_legal_hold') THEN$to$);

-- A rejected or withdrawn copy/deletion goes back to the queue as an open request.
SELECT pg_temp.patch_function('public.admin_decide_approval(uuid,text,text)'::regprocedure,
$from$    IF v_req.kind = 'reconciliation_import' THEN
      UPDATE public.tap_reconciliation_imports SET status = 'rejected' WHERE id = v_req.target_id AND status = 'pending_approval';
    END IF;$from$,
$to$    IF v_req.kind = 'reconciliation_import' THEN
      UPDATE public.tap_reconciliation_imports SET status = 'rejected' WHERE id = v_req.target_id AND status = 'pending_approval';
    END IF;
    IF v_req.kind IN ('privacy_export', 'privacy_deletion') THEN
      PERFORM public.privacy_approval_closed(v_req.id, 'rejected', v_reason);
    END IF;
    IF v_req.kind = 'privacy_legal_hold' THEN
      UPDATE public.privacy_legal_holds SET status = 'rejected' WHERE id = v_req.target_id AND status = 'pending_approval';
    END IF;$to$);
SELECT pg_temp.patch_function('public.admin_cancel_approval(uuid,text)'::regprocedure,
$from$  IF v_req.kind = 'reconciliation_import' THEN
    UPDATE public.tap_reconciliation_imports SET status = 'withdrawn' WHERE id = v_req.target_id AND status = 'pending_approval';
  END IF;$from$,
$to$  IF v_req.kind = 'reconciliation_import' THEN
    UPDATE public.tap_reconciliation_imports SET status = 'withdrawn' WHERE id = v_req.target_id AND status = 'pending_approval';
  END IF;
  IF v_req.kind IN ('privacy_export', 'privacy_deletion') THEN
    PERFORM public.privacy_approval_closed(v_req.id, 'cancelled', v_reason);
  END IF;
  IF v_req.kind = 'privacy_legal_hold' THEN
    UPDATE public.privacy_legal_holds SET status = 'withdrawn' WHERE id = v_req.target_id AND status = 'pending_approval';
  END IF;$to$);

CREATE OR REPLACE FUNCTION public.privacy_approval_closed(p_approval_id UUID, p_outcome TEXT, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.privacy_requests;
BEGIN
  UPDATE public.privacy_requests SET status = 'open', approval_request_id = NULL, updated_at = now()
   WHERE approval_request_id = p_approval_id AND status = 'awaiting_approval' RETURNING * INTO r;
  IF r.id IS NOT NULL THEN
    PERFORM public.privacy_log_event(r.id, 'approval_' || p_outcome, jsonb_build_object('approval_id', p_approval_id, 'reason', p_reason));
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.privacy_approval_closed(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. The dashboard queue counts privacy requests
-- ---------------------------------------------------------------------------------------------------------------------
SELECT pg_temp.patch_function('public.admin_dashboard_overview()'::regprocedure,
$from$    (SELECT jsonb_build_object('key', 'data_requests', 'count', count(*), 'oldest_at', min(created_at),
                               'overdue', count(*) FILTER (WHERE due_date < v_today), 'next_due', min(due_date))
       FROM data_subject_requests WHERE status IN ('pending', 'in_progress')),$from$,
$to$    (SELECT jsonb_build_object('key', 'data_requests', 'count', count(*), 'oldest_at', min(received_at),
                               'overdue', count(*) FILTER (WHERE COALESCE(extended_due_at, due_at) < now()),
                               'next_due', (min(COALESCE(extended_due_at, due_at)) AT TIME ZONE 'Asia/Riyadh')::date)
       FROM privacy_requests WHERE status IN ('awaiting_verification', 'open', 'awaiting_approval', 'executing')),$to$);
