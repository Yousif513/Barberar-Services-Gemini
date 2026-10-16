-- PRIV-2: the copy of a customer's data (Q1.5) and the approval that releases it (Q1.7).
--   * An access or copy request is released only after a different privacy.approve holder approves it (both sides step up).
--   * The package is built on the server: privacy_export_payload collects profile, addresses, bookings, payments (no card data is
--     ever held: Tap's hosted page takes the card), invoices, messages sent and received (the other party's identifiers removed,
--     e-mail addresses and phone numbers in their text redacted), reviews, consents and health-intake answers. The Edge Function
--     privacy-export renders it as JSON and as an Arabic/English PDF and stores both in the private bucket privacy-exports.
--   * The customer downloads it in the app through privacy-export-download, which checks their own session, the request and the
--     7-day expiry (privacy_export_authorize_download) and records every download. Expired files are removed.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Export records and the private bucket
-- ---------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.privacy_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES public.privacy_requests(id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_build' CHECK (status IN ('awaiting_build', 'built', 'failed', 'expired')),
  json_path TEXT,
  pdf_path TEXT,
  json_sha256 TEXT,
  pdf_sha256 TEXT,
  row_counts JSONB,
  built_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  downloads INTEGER NOT NULL DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ,
  failure TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'built' OR (json_path IS NOT NULL AND pdf_path IS NOT NULL AND built_at IS NOT NULL AND expires_at = built_at + INTERVAL '7 days'))
);
CREATE INDEX IF NOT EXISTS idx_privacy_exports_expiry ON public.privacy_exports (expires_at) WHERE status = 'built';
ALTER TABLE public.privacy_exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_exports FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.privacy_exports TO service_role;

-- Private bucket, no client policy: only the Edge Functions (service key) read or write it.
DO $bucket$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('privacy-exports', 'privacy-exports', FALSE, 20971520, ARRAY['application/json', 'application/pdf'])
    ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END $bucket$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Proposing the release of a copy or a deletion (the maker); the approver is someone else (governance)
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_privacy_propose_execution(p_request_id UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  r public.privacy_requests;
  v_kind TEXT;
  v_result JSONB;
  v_summary JSONB;
BEGIN
  PERFORM public.require_recent_mfa();
  PERFORM public.privacy_require_console('privacy.manage');
  IF v_reason IS NULL OR char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Record what you checked before proposing this (at least 10 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_request_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002'; END IF;
  IF r.request_type NOT IN ('access', 'copy', 'deletion') THEN
    RAISE EXCEPTION 'Only access, copy and deletion requests are executed through an approval' USING ERRCODE = '22023';
  END IF;
  IF r.status = 'awaiting_verification' THEN
    RAISE EXCEPTION 'The customer has not confirmed their identity yet; nothing is released or deleted before' USING ERRCODE = '42501',
      HINT = 'identity_not_verified';
  END IF;
  IF r.status <> 'open' THEN
    RAISE EXCEPTION 'This request is % ', r.status USING ERRCODE = '22023';
  END IF;
  IF r.request_type = 'deletion' AND r.review_choice IS NULL THEN
    RAISE EXCEPTION 'The customer has not chosen what happens to their reviews' USING ERRCODE = '22023';
  END IF;
  v_kind := CASE WHEN r.request_type = 'deletion' THEN 'privacy_deletion' ELSE 'privacy_export' END;
  v_summary := jsonb_build_object('request_type', r.request_type, 'subject_id', r.subject_id, 'channel', r.channel,
                                  'deadline_at', COALESCE(r.extended_due_at, r.due_at))
               || CASE WHEN v_kind = 'privacy_deletion' THEN jsonb_build_object('preview', public.privacy_deletion_preview_internal(r.subject_id))
                       ELSE '{}'::jsonb END;
  v_result := public.governance_request(v_kind, 'privacy_requests', r.id, NULL,
    jsonb_build_object('request_id', r.id, 'request_type', r.request_type), v_reason, v_summary);
  UPDATE public.privacy_requests SET status = 'awaiting_approval', approval_request_id = (v_result->>'approval_id')::uuid, updated_at = now()
   WHERE id = r.id;
  PERFORM public.privacy_log_event(r.id, 'proposed_for_approval', jsonb_build_object('kind', v_kind, 'approval_id', v_result->>'approval_id'));
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_propose_execution(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_propose_execution(UUID, TEXT) TO authenticated;

-- Approved: the export is queued for the builder (Edge Function privacy-export).
CREATE OR REPLACE FUNCTION public.gov_exec_privacy_export(p_req public.admin_approval_requests)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.privacy_requests;
  v_export UUID;
BEGIN
  IF NOT public.governance_execution_active('privacy_export', p_req.target_id) THEN
    RAISE EXCEPTION 'A copy is released only as an approved request' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_req.target_id FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'awaiting_approval' OR r.verified_at IS NULL THEN
    RAISE EXCEPTION 'The privacy request is no longer waiting for this approval' USING ERRCODE = '22023';
  END IF;
  UPDATE public.privacy_requests SET status = 'executing', execution_state = 'awaiting_build', decided_by = auth.uid(), decided_at = now(),
         updated_at = now()
   WHERE id = r.id;
  INSERT INTO public.privacy_exports (request_id, subject_id) VALUES (r.id, r.subject_id)
  ON CONFLICT (request_id) DO UPDATE SET status = 'awaiting_build', failure = NULL
  RETURNING id INTO v_export;
  PERFORM public.privacy_log_event(r.id, 'approved', jsonb_build_object('approval_id', p_req.id, 'export_id', v_export));
  RETURN jsonb_build_object('request_id', r.id, 'export_id', v_export, 'next', 'build');
END $$;
REVOKE ALL ON FUNCTION public.gov_exec_privacy_export(public.admin_approval_requests) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. The package (service key only; the Edge Function renders it)
-- ---------------------------------------------------------------------------------------------------------------------

-- Removes e-mail addresses and phone numbers from text written by someone else.
CREATE OR REPLACE FUNCTION public.privacy_redact_text(p_text TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(regexp_replace(p_text,
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[redacted e-mail]', 'g'),
    '(\+?[0-9][0-9 ()-]{7,}[0-9])', '[redacted number]', 'g');
$$;

CREATE OR REPLACE FUNCTION public.privacy_export_payload(p_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.privacy_requests;
  s UUID;
  v JSONB;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the export builder reads the package' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_request_id;
  IF r.id IS NULL OR r.request_type NOT IN ('access', 'copy') OR r.status NOT IN ('executing', 'completed')
     OR NOT EXISTS (SELECT 1 FROM public.privacy_exports e WHERE e.request_id = r.id) THEN
    RAISE EXCEPTION 'No approved copy for this request' USING ERRCODE = '42501';
  END IF;
  s := r.subject_id;

  v := jsonb_build_object(
    'format', 'primora-personal-data-copy/1',
    'request', jsonb_build_object('id', r.id, 'type', r.request_type, 'received_at', r.received_at, 'generated_at', now()),
    'profile', (SELECT jsonb_build_object('id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'email', p.email,
                  'phone_number', p.phone_number, 'phone_verified', p.phone_verified, 'gender', p.gender,
                  'language_preference', p.language_preference, 'referral_code', p.referral_code, 'created_at', p.created_at)
                  FROM public.profiles p WHERE p.id = s),
    'addresses', COALESCE((SELECT jsonb_agg(jsonb_build_object('booking_id', b.id, 'address', COALESCE(h.address_text, b.home_address_text),
                    'latitude', COALESCE(h.latitude, b.home_address_lat), 'longitude', COALESCE(h.longitude, b.home_address_lng)) ORDER BY b.scheduled_at)
                  FROM public.bookings b LEFT JOIN public.booking_home_addresses h ON h.booking_id = b.id
                  WHERE b.customer_id = s AND (h.booking_id IS NOT NULL OR b.home_address_text IS NOT NULL OR b.home_address_lat IS NOT NULL)), '[]'::jsonb),
    'bookings', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'scheduled_at', b.scheduled_at, 'status', b.status,
                    'service_en', sv.name_en, 'service_ar', sv.name_ar, 'business', COALESCE(pv.business_name_en, pv.business_name_ar),
                    'home_service', b.is_home_service, 'subtotal_sar', b.subtotal_price, 'discount_sar', b.discount_amount,
                    'total_sar', b.total_price, 'vat_sar', b.tax_amount, 'cancellation_reason', b.cancellation_reason,
                    'cancelled_at', b.cancelled_at, 'created_at', b.created_at) ORDER BY b.scheduled_at)
                  FROM public.bookings b JOIN public.services sv ON sv.id = b.service_id
                  JOIN public.branches br ON br.id = b.branch_id JOIN public.providers pv ON pv.id = br.provider_id
                  WHERE b.customer_id = s), '[]'::jsonb),
    'payments', jsonb_build_object(
      'card_note', 'Card details are entered on Tap Payments'' hosted page and are never received or stored by PRIMORA.',
      'charges', COALESCE((SELECT jsonb_agg(jsonb_build_object('booking_id', l.booking_id, 'type', l.entry_type, 'amount_sar', l.total_captured,
                    'refunded_sar', l.refunded_amount, 'payment_reference', '****' || right(COALESCE(l.payment_intent_id, ''), 4), 'at', l.created_at)
                    ORDER BY l.created_at)
                  FROM public.transactional_ledger l JOIN public.bookings b ON b.id = l.booking_id
                  WHERE b.customer_id = s AND l.entry_type IN ('booking_payment', 'tip')), '[]'::jsonb),
      'refunds', COALESCE((SELECT jsonb_agg(jsonb_build_object('booking_id', rr.booking_id, 'amount_sar', rr.amount, 'status', rr.status, 'at', rr.created_at)
                    ORDER BY rr.created_at)
                  FROM public.refund_requests rr JOIN public.bookings b ON b.id = rr.booking_id WHERE b.customer_id = s), '[]'::jsonb),
      'wallet_credits', COALESCE((SELECT jsonb_agg(jsonb_build_object('amount_sar', w.amount, 'source', w.source, 'at', w.created_at) ORDER BY w.created_at)
                  FROM public.wallet_credits w WHERE w.customer_id = s), '[]'::jsonb),
      'packages', COALESCE((SELECT jsonb_agg(jsonb_build_object('package_id', u.package_id, 'at', u.created_at) ORDER BY u.created_at)
                  FROM public.user_packages u WHERE u.customer_id = s), '[]'::jsonb)),
    'invoices', COALESCE((SELECT jsonb_agg(jsonb_build_object('invoice_number', i.invoice_number, 'issue_date', i.issue_date,
                    'seller', i.seller_name, 'seller_vat_number', i.seller_vat_number, 'subtotal_sar', i.subtotal_sar, 'vat_sar', i.vat_amount_sar,
                    'total_sar', i.total_amount_sar, 'booking_id', i.booking_id) ORDER BY i.issue_date)
                  FROM public.invoices i WHERE i.customer_id = s), '[]'::jsonb),
    'messages', COALESCE((SELECT jsonb_agg(jsonb_build_object('conversation_id', c.id,
                    'business', (SELECT COALESCE(pv.business_name_en, pv.business_name_ar) FROM public.providers pv WHERE pv.id = c.provider_id),
                    'messages', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                        'direction', CASE WHEN m.sender_id = s THEN 'sent' ELSE 'received' END,
                        'text', CASE WHEN m.sender_id = s THEN m.body ELSE public.privacy_redact_text(m.body) END,
                        'at', m.created_at) ORDER BY m.created_at)
                      FROM public.messages m WHERE m.conversation_id = c.id), '[]'::jsonb)) ORDER BY c.created_at)
                  FROM public.conversations c WHERE c.customer_id = s), '[]'::jsonb),
    'reviews', COALESCE((SELECT jsonb_agg(jsonb_build_object('booking_id', rv.booking_id, 'rating', rv.rating, 'comment', rv.comment,
                    'business_reply', public.privacy_redact_text(rv.reply_comment), 'at', rv.created_at) ORDER BY rv.created_at)
                  FROM public.reviews rv WHERE rv.customer_id = s), '[]'::jsonb),
    'consents', COALESCE((SELECT jsonb_agg(jsonb_build_object('purpose', c.purpose, 'status', c.status, 'document_version', c.document_version,
                    'method', c.method, 'ip_address', c.ip_address, 'at', c.created_at) ORDER BY c.created_at)
                  FROM public.consents c WHERE c.user_id = s), '[]'::jsonb),
    'health_intake', COALESCE((SELECT jsonb_agg(jsonb_build_object('booking_id', si.booking_id, 'status', si.status,
                    'form_en', t.name_en, 'form_ar', t.name_ar, 'submitted_at', si.submitted_at, 'fields', tv.fields, 'answers', a.answers)
                    ORDER BY si.submitted_at)
                  FROM public.intake_submissions si
                  JOIN public.intake_form_templates t ON t.id = si.template_id
                  JOIN public.intake_form_template_versions tv ON tv.id = si.template_version_id
                  LEFT JOIN public.intake_answers a ON a.submission_id = si.id
                  WHERE si.customer_id = s), '[]'::jsonb),
    'privacy_requests', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', q.request_type, 'status', q.status, 'received_at', q.received_at,
                    'completed_at', q.completed_at) ORDER BY q.received_at)
                  FROM public.privacy_requests q WHERE q.subject_id = s), '[]'::jsonb));

  PERFORM public.write_audit_log('privacy.export_payload_built', 'privacy_requests', r.id, jsonb_build_object(
    'bookings', jsonb_array_length(v->'bookings'), 'invoices', jsonb_array_length(v->'invoices'),
    'conversations', jsonb_array_length(v->'messages'), 'reviews', jsonb_array_length(v->'reviews'),
    'consents', jsonb_array_length(v->'consents'), 'health_intake', jsonb_array_length(v->'health_intake')));
  UPDATE public.privacy_exports SET attempts = attempts + 1 WHERE request_id = r.id;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.privacy_export_payload(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_export_payload(UUID) TO service_role;

-- The builder stored both files: the request is complete and the customer is told the files are ready (7 days).
CREATE OR REPLACE FUNCTION public.privacy_export_record_built(p_request_id UUID, p_json_path TEXT, p_pdf_path TEXT,
                                                             p_json_sha256 TEXT, p_pdf_sha256 TEXT, p_row_counts JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.privacy_exports;
  r public.privacy_requests;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the export builder records a built copy' USING ERRCODE = '42501';
  END IF;
  IF p_json_sha256 !~ '^[0-9a-f]{64}$' OR p_pdf_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Both SHA-256 digests are required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO e FROM public.privacy_exports WHERE request_id = p_request_id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'No export for this request' USING ERRCODE = 'P0002'; END IF;
  IF p_json_path <> e.subject_id::text || '/' || p_request_id::text || '/personal-data.json'
     OR p_pdf_path <> e.subject_id::text || '/' || p_request_id::text || '/personal-data.pdf' THEN
    RAISE EXCEPTION 'Unexpected storage path' USING ERRCODE = '22023';
  END IF;
  UPDATE public.privacy_exports SET status = 'built', json_path = p_json_path, pdf_path = p_pdf_path, json_sha256 = p_json_sha256,
         pdf_sha256 = p_pdf_sha256, row_counts = p_row_counts, built_at = v_now, expires_at = v_now + INTERVAL '7 days', failure = NULL
   WHERE id = e.id RETURNING * INTO e;
  UPDATE public.privacy_requests SET status = 'completed', execution_state = 'built', completed_at = v_now,
         decision_reason = COALESCE(decision_reason, 'Copy delivered in the app'),
         completion_summary = jsonb_build_object('files', jsonb_build_array('json', 'pdf'), 'expires_at', e.expires_at, 'row_counts', p_row_counts),
         updated_at = v_now
   WHERE id = p_request_id RETURNING * INTO r;
  PERFORM public.privacy_log_event(r.id, 'copy_ready', jsonb_build_object('expires_at', e.expires_at));
  PERFORM public.write_audit_log('privacy.export_built', 'privacy_requests', r.id,
    jsonb_build_object('expires_at', e.expires_at, 'row_counts', p_row_counts, 'json_sha256', p_json_sha256, 'pdf_sha256', p_pdf_sha256));
  PERFORM public.privacy_notify_customer(r.subject_id, 'privacy_copy_ready',
    'Your data copy is ready', 'نسخة بياناتك جاهزة',
    'Download it from Privacy in your account. The link works for 7 days and only when you are signed in. A printed copy is available on request.',
    'نزّلها من صفحة الخصوصية في حسابك. يعمل الرابط 7 أيام وبعد تسجيل دخولك فقط. تتوفر نسخة مطبوعة عند الطلب.',
    jsonb_build_object('request_id', r.id, 'expires_at', e.expires_at));
  RETURN jsonb_build_object('request_id', r.id, 'expires_at', e.expires_at);
END $$;
REVOKE ALL ON FUNCTION public.privacy_export_record_built(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_export_record_built(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.privacy_export_record_failure(p_request_id UUID, p_error TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the export builder records a failure' USING ERRCODE = '42501';
  END IF;
  UPDATE public.privacy_exports SET status = 'failed', failure = left(COALESCE(p_error, 'unknown'), 500) WHERE request_id = p_request_id AND status <> 'built';
  PERFORM public.privacy_log_event(p_request_id, 'copy_build_failed', jsonb_build_object('error', left(COALESCE(p_error, 'unknown'), 500)));
END $$;
REVOKE ALL ON FUNCTION public.privacy_export_record_failure(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_export_record_failure(UUID, TEXT) TO service_role;

-- Exports waiting for the builder (the Edge Function picks these up when the scheduler or the approver calls it).
CREATE OR REPLACE FUNCTION public.privacy_exports_to_build(p_limit INTEGER DEFAULT 10)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the export builder lists pending exports' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('request_id', e.request_id, 'subject_id', e.subject_id))
                     FROM (SELECT * FROM public.privacy_exports WHERE status IN ('awaiting_build', 'failed') AND attempts < 8
                            ORDER BY created_at LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)) e), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.privacy_exports_to_build(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_exports_to_build(INTEGER) TO service_role;

-- Called with the customer's own token by privacy-export-download: only the subject, only a built copy, only for 7 days.
CREATE OR REPLACE FUNCTION public.privacy_export_authorize_download(p_request_id UUID, p_file TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.privacy_exports;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to download your data' USING ERRCODE = '28000'; END IF;
  IF p_file IS NULL OR p_file NOT IN ('json', 'pdf') THEN RAISE EXCEPTION 'The file must be json or pdf' USING ERRCODE = '22023'; END IF;
  SELECT * INTO e FROM public.privacy_exports WHERE request_id = p_request_id AND subject_id = auth.uid() FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Copy not found' USING ERRCODE = 'P0002'; END IF;
  IF e.status = 'expired' OR (e.status = 'built' AND now() >= e.expires_at) THEN
    RAISE EXCEPTION 'This download expired 7 days after it was ready; make a new copy request' USING ERRCODE = '42501', HINT = 'export_expired';
  END IF;
  IF e.status <> 'built' THEN RAISE EXCEPTION 'The copy is not ready yet' USING ERRCODE = '22023'; END IF;
  UPDATE public.privacy_exports SET downloads = downloads + 1, last_downloaded_at = now() WHERE id = e.id;
  PERFORM public.privacy_log_event(p_request_id, 'copy_downloaded', jsonb_build_object('file', p_file));
  PERFORM public.write_audit_log('privacy.export_downloaded', 'privacy_requests', p_request_id,
    jsonb_build_object('file', p_file) || public.request_client_info());
  RETURN jsonb_build_object('path', CASE WHEN p_file = 'json' THEN e.json_path ELSE e.pdf_path END,
    'content_type', CASE WHEN p_file = 'json' THEN 'application/json' ELSE 'application/pdf' END, 'expires_at', e.expires_at);
END $$;
REVOKE ALL ON FUNCTION public.privacy_export_authorize_download(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privacy_export_authorize_download(UUID, TEXT) TO authenticated;

-- Expired copies: marked expired, and their paths handed to the builder to delete from storage.
CREATE OR REPLACE FUNCTION public.privacy_expire_exports()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_paths JSONB;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the export builder expires copies' USING ERRCODE = '42501';
  END IF;
  WITH x AS (
    UPDATE public.privacy_exports SET status = 'expired' WHERE status = 'built' AND expires_at <= now()
    RETURNING request_id, json_path, pdf_path)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('request_id', request_id, 'paths', jsonb_build_array(json_path, pdf_path))), '[]'::jsonb)
    INTO v_paths FROM x;
  IF jsonb_array_length(v_paths) > 0 THEN
    PERFORM public.write_audit_log('privacy.exports_expired', 'privacy_exports', NULL, jsonb_build_object('count', jsonb_array_length(v_paths)));
  END IF;
  RETURN v_paths;
END $$;
REVOKE ALL ON FUNCTION public.privacy_expire_exports() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_expire_exports() TO service_role;

-- The customer's list carries the copy's state.
CREATE OR REPLACE FUNCTION public.privacy_my_requests()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  RETURN COALESCE((SELECT jsonb_agg((public.privacy_request_json(r) - 'staff_notes' - 'decided_by' - 'logged_by')
             || jsonb_build_object('export', (SELECT jsonb_build_object('status', CASE WHEN e.status = 'built' AND now() >= e.expires_at THEN 'expired' ELSE e.status END,
                                                                       'expires_at', e.expires_at, 'downloads', e.downloads)
                                                FROM public.privacy_exports e WHERE e.request_id = r.id))
             ORDER BY r.received_at DESC)
           FROM public.privacy_requests r WHERE r.subject_id = auth.uid()), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.privacy_my_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privacy_my_requests() TO authenticated;
