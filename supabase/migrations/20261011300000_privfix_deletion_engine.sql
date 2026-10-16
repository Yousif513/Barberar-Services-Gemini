-- PRIVFIX-1: deletion engine fixes from docs/reviews/2026-10-11-security-priv.md (C1, H1, H2, H3, M3, M5, M6, M7, L3) and the
-- hold renewal rule. Spec: Q1/Q2 "Final decision text", docs/legal/2026-10-10-privacy-decision-memo.md.
--   C1  privacy_reapply_deletion_ledger no longer takes entries; archive entries come back only through
--       privacy_import_deletion_archive (service key only, digest checked, each entry matching a completed deletion request), are
--       inserted with auth_deleted_at NULL, and the engine refuses any subject that is not a customer account.
--   H1  An account kept by a court hold is deleted (auth too) once the hold is released: privacy_auth_erasures_due lists it, the worker
--       deletes it and the final completion notice is queued.
--   H2  A court hold keeps the account only when it names the "account" category with its own reason; otherwise the profile and
--       contact details are deleted and only the named categories are kept, re-linked to the hold's own pseudonym.
--   H3  Contact details are erased from the notice outbox, the WhatsApp/SMS queue and log, and the earlier-contacts table.
--   M3  Tips, wallet credits and their redemptions, coupon, gift-card and package redemptions and loyalty balances are money records:
--       kept 10 years pseudonymised (foreign keys SET NULL) instead of deleted with the profile.
--   M5  Pseudonym tokens are random per retained row (per hold while a hold lasts); a released hold forgets its token and subject.
--   M6  The deletion closes the subject's other open requests, destroys held correction values and request texts, and expires
--       built copies (the worker deletes the files).
--   M7  Every phone number the account has held is kept aside until the WhatsApp threads under it are erased, then destroyed.
--   L3  The deletion re-checks that the subject is still a customer when it runs.
--   Hold renewal: keeping a hold at its 90-day review needs a reason and an approver who is neither the proposer nor whoever last
--   approved or renewed it.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------------------------------------------------
-- M3: money records outlive the account, pseudonymised.
DO $money$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('booking_tips'), ('wallet_credits'), ('wallet_credit_redemptions'), ('coupon_redemptions'),
                                 ('gift_card_redemptions'), ('package_redemptions'), ('customer_loyalty')) AS t(tbl) LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN customer_id DROP NOT NULL', r.tbl);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS pseudonym_token TEXT', r.tbl);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS pseudonymised_at TIMESTAMPTZ', r.tbl);
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.tbl, r.tbl || '_customer_id_fkey');
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE SET NULL',
                   r.tbl, r.tbl || '_customer_id_fkey');
  END LOOP;
END $money$;

-- The append-only guard lets the deletion engine (and only a recorded run) clear the customer link of a frozen money row.
SELECT pg_temp.patch_function('public.guard_money_append_only()'::regprocedure,
$from$  FOREACH v_col IN ARRAY v_frozen LOOP
    IF v_old->v_col IS DISTINCT FROM v_new->v_col THEN$from$,
$to$  FOREACH v_col IN ARRAY v_frozen LOOP
    -- Q2.4 / review M3: an erased customer's money record is kept pseudonymised; only a recorded erasure run clears the link.
    IF v_col = 'customer_id' AND v_new->v_col = 'null'::jsonb AND public.privacy_erasure_active() THEN
      CONTINUE;
    END IF;
    IF v_old->v_col IS DISTINCT FROM v_new->v_col THEN$to$);

-- A held review keeps its hold's pseudonym while the hold lasts.
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS pseudonym_token TEXT;

-- H3: an erased recipient's phone and message text are cleared from the WhatsApp/SMS queue and log.
ALTER TABLE public.message_queue ALTER COLUMN recipient_phone DROP NOT NULL;
ALTER TABLE public.message_log ALTER COLUMN recipient_phone DROP NOT NULL;
ALTER TABLE public.message_log ALTER COLUMN message_body DROP NOT NULL;

-- H2: the account is held only when the hold says so, with its own reason.
ALTER TABLE public.privacy_legal_holds ADD COLUMN IF NOT EXISTS account_reason TEXT;
ALTER TABLE public.privacy_legal_holds DROP CONSTRAINT IF EXISTS privacy_legal_holds_account_reason_check;
ALTER TABLE public.privacy_legal_holds ADD CONSTRAINT privacy_legal_holds_account_reason_check
  CHECK (NOT ('account' = ANY (categories)) OR char_length(btrim(COALESCE(account_reason, ''))) >= 20);
-- M5: a released hold of an erased subject forgets who it was about.
ALTER TABLE public.privacy_legal_holds ALTER COLUMN subject_id DROP NOT NULL;
ALTER TABLE public.privacy_legal_holds DROP CONSTRAINT IF EXISTS privacy_legal_holds_subject_check;
ALTER TABLE public.privacy_legal_holds ADD CONSTRAINT privacy_legal_holds_subject_check
  CHECK (subject_id IS NOT NULL OR status IN ('released', 'rejected', 'withdrawn'));
ALTER TABLE public.privacy_legal_holds ADD COLUMN IF NOT EXISTS renewals INTEGER NOT NULL DEFAULT 0;

-- M6: built copies of an erased subject are removed from storage by the worker.
ALTER TABLE public.privacy_exports ADD COLUMN IF NOT EXISTS files_removed_at TIMESTAMPTZ;

-- H1, M7: what the worker still needs after the profile is gone: every phone the account held (to erase WhatsApp threads keyed by
-- a peppered hash of it) and the verified contacts for the final notice. Destroyed as soon as the auth account is deleted.
CREATE TABLE IF NOT EXISTS public.privacy_erasure_pending (
  subject_id UUID PRIMARY KEY,
  phones TEXT[] NOT NULL DEFAULT '{}',
  notice_contacts JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.privacy_erasure_pending ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_erasure_pending FROM anon, authenticated, service_role;
SELECT public.attach_admin_audit_trigger('public.privacy_erasure_pending');

-- H3: the completion notice keeps its address only until it is sent (or finally fails, is skipped or waived).
CREATE OR REPLACE FUNCTION public.privacy_scrub_sent_completion_notice() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.template_key IN ('privacy_deletion_completed') AND NEW.status IN ('sent', 'failed', 'skipped', 'waived') THEN
    NEW.destination := NULL;
    NEW.payload := '{}'::jsonb;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.privacy_scrub_sent_completion_notice() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_privacy_scrub_completion_notice ON public.governance_notifications;
CREATE TRIGGER trg_privacy_scrub_completion_notice BEFORE UPDATE OF status ON public.governance_notifications
  FOR EACH ROW EXECUTE FUNCTION public.privacy_scrub_sent_completion_notice();

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.privacy_new_token() RETURNS TEXT LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT encode(extensions.gen_random_bytes(16), 'hex');
$$;
REVOKE ALL ON FUNCTION public.privacy_new_token() FROM PUBLIC, anon, authenticated;

-- C1.3 / L3: the privacy engine erases customer accounts only.
CREATE OR REPLACE FUNCTION public.privacy_require_customer_subject(p_subject UUID) RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_subject AND role IS DISTINCT FROM 'customer')
     OR EXISTS (SELECT 1 FROM public.admin_role_assignments WHERE user_id = p_subject)
     OR EXISTS (SELECT 1 FROM public.providers WHERE owner_id = p_subject)
     OR EXISTS (SELECT 1 FROM public.employees WHERE profile_id = p_subject) THEN
    RAISE EXCEPTION 'Only a customer account is erased by a privacy deletion; business and console accounts are closed through support'
      USING ERRCODE = '42501', HINT = 'not_a_customer_account';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.privacy_require_customer_subject(UUID) FROM PUBLIC, anon, authenticated;

-- Review M2: a request is verified through the contact the account had before it. A verified e-mail or phone that changed in the
-- 30 days before the request, or since, blocks the release of a copy and a deletion (cooling-off), whatever code was entered.
CREATE OR REPLACE FUNCTION public.privacy_contact_changed_recently(p_subject UUID, p_since TIMESTAMPTZ) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.account_contact_changes
                  WHERE user_id = p_subject AND changed_at > LEAST(COALESCE(p_since, now()), now()) - INTERVAL '30 days');
$$;
REVOKE ALL ON FUNCTION public.privacy_contact_changed_recently(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.privacy_require_unchanged_contacts(r public.privacy_requests) RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.privacy_contact_changed_recently(r.subject_id, r.received_at) THEN
    RAISE EXCEPTION 'The account''s e-mail or phone changed within 30 days of this request; nothing is released or deleted until the cooling-off period ends'
      USING ERRCODE = '42501', HINT = 'contact_changed_recently';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.privacy_require_unchanged_contacts(public.privacy_requests) FROM PUBLIC, anon, authenticated;

-- A held category is re-linked to one active court hold's pseudonym (or, after a release, to another hold that still covers it).
CREATE OR REPLACE FUNCTION public.privacy_court_hold_for(p_subject UUID, p_category TEXT, p_except UUID DEFAULT NULL)
RETURNS public.privacy_legal_holds LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.privacy_legal_holds
   WHERE subject_id = p_subject AND status = 'active' AND basis = 'court_case' AND p_category = ANY (categories)
     AND id IS DISTINCT FROM p_except
   ORDER BY approved_at NULLS LAST, id LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.privacy_court_hold_for(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- H3: contact details in the outboxes and queues, for a subject and for a set of bookings.
CREATE OR REPLACE FUNCTION public.privacy_scrub_contact_traces(p_subject UUID, p_bookings UUID[], p_phones TEXT[]) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_queue_deleted INTEGER;
  v_queue INTEGER;
  v_log INTEGER;
  v_notices INTEGER;
  v_skipped INTEGER;
  v_changes INTEGER := 0;
BEGIN
  DELETE FROM public.message_queue
   WHERE status IN ('pending', 'processing', 'deferred_quiet_hours')
     AND ((p_subject IS NOT NULL AND recipient_id = p_subject) OR booking_id = ANY (COALESCE(p_bookings, '{}'))
          OR recipient_phone = ANY (COALESCE(p_phones, '{}')));
  GET DIAGNOSTICS v_queue_deleted = ROW_COUNT;
  UPDATE public.message_queue SET recipient_phone = NULL, variables = '{}'::jsonb, recipient_id = NULL, updated_at = now()
   WHERE (p_subject IS NOT NULL AND recipient_id = p_subject) OR booking_id = ANY (COALESCE(p_bookings, '{}'))
      OR recipient_phone = ANY (COALESCE(p_phones, '{}'));
  GET DIAGNOSTICS v_queue = ROW_COUNT;
  UPDATE public.message_log SET recipient_phone = NULL, message_body = NULL, recipient_id = NULL
   WHERE (p_subject IS NOT NULL AND recipient_id = p_subject) OR booking_id = ANY (COALESCE(p_bookings, '{}'))
      OR recipient_phone = ANY (COALESCE(p_phones, '{}'));
  GET DIAGNOSTICS v_log = ROW_COUNT;
  IF p_subject IS NOT NULL THEN
    UPDATE public.governance_notifications SET status = 'skipped', error_message = 'The recipient''s account was erased',
           destination = NULL, payload = '{}'::jsonb, next_attempt_at = NULL
     WHERE recipient_user_id = p_subject AND status IN ('pending', 'undeliverable');
    GET DIAGNOSTICS v_skipped = ROW_COUNT;
    UPDATE public.governance_notifications SET destination = NULL, payload = '{}'::jsonb
     WHERE recipient_user_id = p_subject AND status <> 'sending' AND (destination IS NOT NULL OR payload <> '{}'::jsonb);
    GET DIAGNOSTICS v_notices = ROW_COUNT;
    DELETE FROM public.account_contact_changes WHERE user_id = p_subject;
    GET DIAGNOSTICS v_changes = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('message_queue_deleted', v_queue_deleted, 'message_queue_cleared', v_queue, 'message_log_cleared', v_log,
    'notices_cleared', COALESCE(v_notices, 0) + COALESCE(v_skipped, 0), 'previous_contacts', v_changes);
END $$;
REVOKE ALL ON FUNCTION public.privacy_scrub_contact_traces(UUID, UUID[], TEXT[]) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. The engine
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.privacy_erase_subject_internal(p_subject UUID, p_request_id UUID, p_review_choice TEXT, p_mode TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run UUID;
  v_court TEXT[];
  v_hold_bookings UUID[];
  v_hold_providers UUID[];
  v_account_held BOOLEAN;
  v_now TIMESTAMPTZ := now();
  v_n INTEGER;
  v_total INTEGER;
  d JSONB := '{}'::jsonb;
  v_until DATE;
  v_ret INTEGER := 0;
  v_del INTEGER := 0;
  v_invoices INTEGER;
  v_ledger INTEGER;
  v_summary JSONB;
  v_bookings UUID[];
  v_retained UUID[] := '{}';
  v_phones TEXT[];
  v_contacts JSONB;
  v_hold public.privacy_legal_holds;
  v_token TEXT;
  b RECORD;
  c RECORD;
  dsp RECORD;
BEGIN
  PERFORM public.privacy_require_customer_subject(p_subject);
  INSERT INTO public.privacy_erasure_runs (subject_id, request_id, mode, txid, actor_id)
  VALUES (p_subject, p_request_id, p_mode, txid_current(), auth.uid()) RETURNING id INTO v_run;
  PERFORM set_config('primora.privacy_erasure_run', v_run::text, true);
  PERFORM set_config('primora.privacy_field_write', 'on', true);
  -- One summary audit row describes the erasure; the per-row console write log would copy identifiers of erased rows.
  PERFORM set_config('primora.audit_rows', '1000000', true);

  -- Q2.5(b): an open payment dispute holds that booking's records; the approver of this deletion is the hold's approver.
  IF p_mode = 'request' THEN
    FOR dsp IN SELECT * FROM public.payment_disputes WHERE customer_id = p_subject AND status IN ('opened', 'under_review') LOOP
      IF NOT EXISTS (SELECT 1 FROM public.privacy_legal_holds WHERE dispute_id = dsp.id AND status = 'active') THEN
        INSERT INTO public.privacy_legal_holds (subject_id, basis, case_reference, booking_id, dispute_id, categories, reason, status,
                                                created_by, approved_by, approved_at, review_due_at, approval_request_id)
        VALUES (p_subject, 'payment_dispute', 'payment_dispute:' || dsp.id::text, dsp.booking_id, dsp.id, ARRAY['bookings', 'messages'],
                'Open payment dispute on this booking when the deletion was approved (PDPL Art. 18; Q2.5(b))', 'active',
                auth.uid(), auth.uid(), v_now, v_now + INTERVAL '90 days',
                NULLIF(current_setting('primora.governance_approval', true), '')::uuid);
      END IF;
    END LOOP;
  END IF;
  -- M5: one random pseudonym per hold, never one per person.
  UPDATE public.privacy_legal_holds SET pseudonym_token = public.privacy_new_token()
   WHERE subject_id = p_subject AND status = 'active' AND pseudonym_token IS NULL;
  SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_court
    FROM public.privacy_legal_holds h, unnest(h.categories) x WHERE h.subject_id = p_subject AND h.status = 'active' AND h.basis = 'court_case';
  SELECT COALESCE(array_agg(DISTINCT h.booking_id), '{}') INTO v_hold_bookings
    FROM public.privacy_legal_holds h WHERE h.subject_id = p_subject AND h.status = 'active' AND h.basis = 'payment_dispute';
  SELECT COALESCE(array_agg(DISTINCT br.provider_id), '{}') INTO v_hold_providers
    FROM public.bookings bk JOIN public.branches br ON br.id = bk.branch_id WHERE bk.id = ANY (v_hold_bookings);
  -- H2: the account (profile, contact details, auth login) is kept only when a court hold names it, with its own reason.
  v_account_held := 'account' = ANY (v_court);

  SELECT COALESCE(array_agg(id), '{}') INTO v_bookings FROM public.bookings WHERE customer_id = p_subject;
  -- M7: every phone the account has held, before the record of earlier contacts is destroyed.
  SELECT COALESCE(array_agg(DISTINCT p) FILTER (WHERE p IS NOT NULL AND p <> ''), '{}') INTO v_phones FROM (
    SELECT btrim(u.phone) AS p FROM auth.users u WHERE u.id = p_subject
    UNION ALL SELECT btrim(pr.phone_number) FROM public.profiles pr WHERE pr.id = p_subject
    UNION ALL SELECT btrim(c2.old_value) FROM public.account_contact_changes c2 WHERE c2.user_id = p_subject AND c2.channel = 'sms'
    UNION ALL SELECT btrim(bk.walk_in_phone) FROM public.bookings bk WHERE bk.customer_id = p_subject) x;
  SELECT jsonb_strip_nulls(jsonb_build_object(
           'email', CASE WHEN u.email_confirmed_at IS NOT NULL THEN NULLIF(lower(btrim(COALESCE(u.email, ''))), '') END,
           'sms', CASE WHEN u.phone_confirmed_at IS NOT NULL THEN NULLIF(btrim(COALESCE(u.phone, '')), '') END))
    INTO v_contacts FROM auth.users u WHERE u.id = p_subject;

  -- 2. Health answers and patch-test results: destroyed whatever else is held.
  DELETE FROM public.intake_answers WHERE customer_id = p_subject;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  d := d || jsonb_build_object('health_answers', v_n);
  UPDATE public.intake_submissions SET status = 'deleted', answers_removed_at = v_now, removal_reason = 'customer_deleted', updated_at = v_now
   WHERE customer_id = p_subject AND status = 'submitted';
  DELETE FROM public.patch_test_results WHERE customer_id = p_subject;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  d := d || jsonb_build_object('patch_test_results', v_n);

  -- 1. Messages: every message in every thread, unless a court case holds messages or a dispute holds that business's thread.
  v_total := 0;
  v_n := 0;
  IF NOT 'messages' = ANY (v_court) THEN
    FOR c IN SELECT cv.id, cv.provider_id, p.owner_id FROM public.conversations cv JOIN public.providers p ON p.id = cv.provider_id
              WHERE cv.customer_id = p_subject AND NOT cv.provider_id = ANY (v_hold_providers) LOOP
      DELETE FROM public.messages WHERE conversation_id = c.id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_total := v_total + v_n;
      UPDATE public.conversations SET customer_id = NULL, customer_deleted_at = v_now, subject = NULL, last_message_preview = NULL,
             unread_for_customer = FALSE, updated_at = v_now
       WHERE id = c.id;
      INSERT INTO public.notifications (user_id, title_en, title_ar, body_en, body_ar, type, data)
      VALUES (c.owner_id, 'A customer deleted their account', 'حذف أحد العملاء حسابه',
        'The conversation with this customer was deleted at their request. Delete any copy of their personal data you keep outside PRIMORA.',
        'حُذفت المحادثة مع هذا العميل بناءً على طلبه. احذف أي نسخة من بياناته الشخصية تحتفظ بها خارج بريمورا.',
        'privacy_deletion', jsonb_build_object('conversation_id', c.id));
    END LOOP;
  END IF;
  -- A thread held for a dispute keeps its messages; it no longer points at the account, and the hold records which thread it is.
  IF NOT v_account_held AND cardinality(v_hold_providers) > 0 THEN
    UPDATE public.privacy_legal_holds h SET held_conversation_ids = ARRAY(
        SELECT cv.id FROM public.conversations cv JOIN public.bookings bk ON bk.id = h.booking_id
          JOIN public.branches br ON br.id = bk.branch_id
         WHERE cv.customer_id = p_subject AND cv.provider_id = br.provider_id)
     WHERE h.subject_id = p_subject AND h.status = 'active' AND h.basis = 'payment_dispute';
    UPDATE public.conversations SET customer_id = NULL, customer_deleted_at = v_now, updated_at = v_now
     WHERE customer_id = p_subject AND provider_id = ANY (v_hold_providers);
  END IF;
  -- H2: threads held for a court case stay as they are, recorded on the hold, no longer linked to the account.
  IF NOT v_account_held AND 'messages' = ANY (v_court) THEN
    v_hold := public.privacy_court_hold_for(p_subject, 'messages');
    UPDATE public.privacy_legal_holds SET held_conversation_ids = ARRAY(
        SELECT DISTINCT x FROM unnest(COALESCE(held_conversation_ids, '{}'::uuid[]) ||
               ARRAY(SELECT cv.id FROM public.conversations cv WHERE cv.customer_id = p_subject)) x)
     WHERE id = v_hold.id;
    UPDATE public.conversations SET customer_id = NULL, customer_deleted_at = v_now, updated_at = v_now WHERE customer_id = p_subject;
  END IF;
  d := d || jsonb_build_object('messages', v_total,
    'conversations_tombstoned', (SELECT count(*) FROM public.conversations WHERE customer_deleted_at = v_now AND customer_id IS NULL));

  -- 1. Reviews: deleted, or kept as "Deleted user" (the customer's choice); a held review keeps its text under the hold's pseudonym.
  IF NOT 'reviews' = ANY (v_court) THEN
    IF p_review_choice = 'deleted_user' THEN
      UPDATE public.reviews SET customer_id = NULL, author_deleted_at = v_now WHERE customer_id = p_subject;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      d := d || jsonb_build_object('reviews_kept_as_deleted_user', v_n, 'reviews_deleted', 0);
    ELSE
      DELETE FROM public.reviews WHERE customer_id = p_subject;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      d := d || jsonb_build_object('reviews_deleted', v_n, 'reviews_kept_as_deleted_user', 0);
    END IF;
  ELSIF NOT v_account_held THEN
    v_hold := public.privacy_court_hold_for(p_subject, 'reviews');
    UPDATE public.reviews SET customer_id = NULL, author_deleted_at = v_now, pseudonym_token = v_hold.pseudonym_token WHERE customer_id = p_subject;
  END IF;

  -- 3. Bookings: pseudonymised when linked to a retained record, deleted otherwise; a held booking keeps its content.
  IF NOT v_account_held THEN
    DELETE FROM public.booking_series WHERE customer_id = p_subject;
  END IF;
  IF 'bookings' = ANY (v_court) AND NOT v_account_held THEN
    v_hold := public.privacy_court_hold_for(p_subject, 'bookings');
    FOR b IN SELECT bk.id, bk.scheduled_at FROM public.bookings bk WHERE bk.customer_id = p_subject LOOP
      UPDATE public.bookings SET customer_id = NULL, pseudonym_token = v_hold.pseudonym_token, pseudonymised_at = v_now,
             retention_basis = 'Legal hold: court case (PDPL Art. 18(2)(b)); then Commercial Books Law Art. 8 / VAT IR Art. 66',
             retention_until = public.privacy_retention_until(b.scheduled_at)
       WHERE id = b.id;
      v_retained := v_retained || b.id;
      v_ret := v_ret + 1;
    END LOOP;
  ELSIF NOT 'bookings' = ANY (v_court) THEN
    FOR b IN SELECT bk.id, bk.scheduled_at FROM public.bookings bk WHERE bk.customer_id = p_subject LOOP
      IF b.id = ANY (v_hold_bookings) THEN
        SELECT pseudonym_token INTO v_token FROM public.privacy_legal_holds
         WHERE booking_id = b.id AND subject_id = p_subject AND status = 'active' AND basis = 'payment_dispute' ORDER BY created_at LIMIT 1;
        UPDATE public.bookings SET customer_id = NULL, pseudonym_token = v_token, pseudonymised_at = v_now,
               retention_basis = 'Legal hold: open payment dispute (PDPL Art. 18); then Commercial Books Law Art. 8 / VAT IR Art. 66',
               retention_until = public.privacy_retention_until(b.scheduled_at)
         WHERE id = b.id;
        v_retained := v_retained || b.id;
        v_ret := v_ret + 1;
      ELSIF public.privacy_booking_is_linked(b.id) OR EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id) THEN
        DELETE FROM public.booking_home_addresses WHERE booking_id = b.id;
        UPDATE public.bookings SET customer_id = NULL, client_profile_id = NULL, home_address_lat = NULL, home_address_lng = NULL,
               home_address_text = NULL, walk_in_name = NULL, walk_in_phone = NULL, cancellation_reason = NULL,
               pseudonym_token = public.privacy_new_token(), pseudonymised_at = v_now,
               retention_basis = 'Pseudonymised: retained under Commercial Books Law Art. 8 / VAT IR Art. 66',
               retention_until = public.privacy_retention_until(b.scheduled_at)
         WHERE id = b.id;
        v_retained := v_retained || b.id;
        v_ret := v_ret + 1;
      ELSE
        DELETE FROM public.group_booking_members WHERE booking_id = b.id;
        DELETE FROM public.bookings WHERE id = b.id;
        v_del := v_del + 1;
      END IF;
    END LOOP;
  END IF;
  SELECT max(retention_until) INTO v_until FROM public.bookings WHERE id = ANY (v_retained);
  d := d || jsonb_build_object('bookings_pseudonymised', v_ret, 'bookings_deleted', v_del);

  -- Money records keep their record without the person (Q2.4; review M3): a random pseudonym per row.
  SELECT count(*) INTO v_invoices FROM public.invoices WHERE customer_id = p_subject;
  IF NOT v_account_held THEN
    UPDATE public.memberships SET customer_id = NULL, pseudonym_token = public.privacy_new_token() WHERE customer_id = p_subject;
    UPDATE public.membership_payments SET customer_id = NULL, pseudonym_token = public.privacy_new_token() WHERE customer_id = p_subject;
    UPDATE public.membership_redemptions SET customer_id = NULL, pseudonym_token = public.privacy_new_token() WHERE customer_id = p_subject;
    UPDATE public.user_packages SET customer_id = NULL, pseudonym_token = public.privacy_new_token() WHERE customer_id = p_subject;
    UPDATE public.gift_cards SET purchaser_id = NULL, pseudonym_token = public.privacy_new_token() WHERE purchaser_id = p_subject;
    UPDATE public.payment_disputes SET customer_id = NULL, pseudonym_token = public.privacy_new_token() WHERE customer_id = p_subject;
    UPDATE public.group_bookings SET host_id = NULL WHERE host_id = p_subject;
    v_total := 0;
    UPDATE public.booking_tips SET customer_id = NULL, pseudonym_token = public.privacy_new_token(), pseudonymised_at = v_now WHERE customer_id = p_subject;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
    UPDATE public.wallet_credit_redemptions SET customer_id = NULL, pseudonym_token = public.privacy_new_token(), pseudonymised_at = v_now WHERE customer_id = p_subject;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
    UPDATE public.wallet_credits SET customer_id = NULL, pseudonym_token = public.privacy_new_token(), pseudonymised_at = v_now WHERE customer_id = p_subject;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
    UPDATE public.coupon_redemptions SET customer_id = NULL, pseudonym_token = public.privacy_new_token(), pseudonymised_at = v_now WHERE customer_id = p_subject;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
    UPDATE public.gift_card_redemptions SET customer_id = NULL, pseudonym_token = public.privacy_new_token(), pseudonymised_at = v_now WHERE customer_id = p_subject;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
    UPDATE public.package_redemptions SET customer_id = NULL, pseudonym_token = public.privacy_new_token(), pseudonymised_at = v_now WHERE customer_id = p_subject;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
    UPDATE public.customer_loyalty SET customer_id = NULL, pseudonym_token = public.privacy_new_token(), pseudonymised_at = v_now WHERE customer_id = p_subject;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
    d := d || jsonb_build_object('money_records_pseudonymised', v_total);
  END IF;
  SELECT count(*) INTO v_ledger FROM public.transactional_ledger l WHERE l.booking_id = ANY (v_retained);

  -- 1. The account: profile, contact details, consents, favourites, device tokens, notifications and every other row that follows
  --    the profile, and the contact details in outboxes, queues and logs. Not while a court case holds the account.
  IF NOT v_account_held THEN
    d := d || jsonb_build_object('contact_traces', public.privacy_scrub_contact_traces(p_subject,
      ARRAY(SELECT x FROM unnest(v_bookings) x WHERE NOT x = ANY (v_hold_bookings)), v_phones));
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_subject) THEN
      d := d || jsonb_build_object(
        'consents', (SELECT count(*) FROM public.consents WHERE user_id = p_subject),
        'favourites', (SELECT count(*) FROM public.customer_favorites WHERE customer_id = p_subject),
        'device_tokens', (SELECT count(*) FROM public.expo_push_tokens WHERE user_id = p_subject)
                         + (SELECT count(*) FROM public.profiles WHERE id = p_subject AND expo_push_token IS NOT NULL),
        'notifications', (SELECT count(*) FROM public.notifications WHERE user_id = p_subject));
      -- Invoices stay unaltered; their account link is cleared by the foreign key (ON DELETE SET NULL).
      DELETE FROM public.profiles WHERE id = p_subject;
      d := d || jsonb_build_object('profile', TRUE);
    ELSE
      d := d || jsonb_build_object('profile', FALSE);
    END IF;
    -- Kept aside for the worker until the auth account and the WhatsApp threads are gone (then destroyed).
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = p_subject) THEN
      INSERT INTO public.privacy_erasure_pending (subject_id, phones, notice_contacts)
      VALUES (p_subject, v_phones, COALESCE(v_contacts, '{}'::jsonb))
      ON CONFLICT (subject_id) DO UPDATE SET
        phones = ARRAY(SELECT DISTINCT x FROM unnest(privacy_erasure_pending.phones || EXCLUDED.phones) x),
        notice_contacts = privacy_erasure_pending.notice_contacts || EXCLUDED.notice_contacts;
    END IF;
  ELSE
    d := d || jsonb_build_object('profile', FALSE);
  END IF;

  INSERT INTO public.deletion_ledger (subject_id, request_id, review_choice, erased_at, account_held)
  VALUES (p_subject, p_request_id, COALESCE(p_review_choice, 'delete_text'), v_now, v_account_held)
  ON CONFLICT (subject_id) DO UPDATE SET
    request_id = COALESCE(EXCLUDED.request_id, deletion_ledger.request_id),
    account_held = EXCLUDED.account_held,
    reapplied_count = deletion_ledger.reapplied_count + CASE WHEN p_mode = 'reapply' THEN 1 ELSE 0 END,
    last_reapplied_at = CASE WHEN p_mode = 'reapply' THEN v_now ELSE deletion_ledger.last_reapplied_at END;

  v_summary := jsonb_build_object(
    'erased_at', v_now,
    'mode', p_mode,
    'deleted', d || jsonb_build_object('auth_account', CASE WHEN v_account_held THEN 'held' ELSE 'pending' END, 'avatar', 'none held'),
    'retained', jsonb_build_array(
      jsonb_build_object('category', 'bookings_pseudonymised', 'count', v_ret,
        'basis', 'Commercial Books Law Art. 8; VAT Implementing Regulations Art. 66', 'until', v_until),
      jsonb_build_object('category', 'tax_invoices', 'count', v_invoices,
        'basis', 'Commercial Books Law Art. 8; VAT Implementing Regulations Art. 66',
        'until', '10 years from the end of the financial year of each invoice'),
      jsonb_build_object('category', 'ledger_and_payment_records', 'count', v_ledger + COALESCE((d->>'money_records_pseudonymised')::int, 0),
        'basis', 'Commercial Books Law Art. 8; VAT Implementing Regulations Art. 66',
        'until', '10 years from the end of the financial year of each record')),
    'held', COALESCE((SELECT jsonb_agg(jsonb_build_object('basis', h.basis, 'reference', h.case_reference, 'categories', to_jsonb(h.categories),
                        'review_due_at', h.review_due_at, 'release', CASE WHEN h.basis = 'payment_dispute'
                          THEN '30 days after the dispute closes' ELSE 'when the proceedings end' END))
                        FROM public.privacy_legal_holds h WHERE h.subject_id = p_subject AND h.status = 'active'), '[]'::jsonb),
    'account_held', v_account_held,
    'complaint_right', public.privacy_complaint_right());

  UPDATE public.privacy_erasure_runs SET finished_at = clock_timestamp(), summary = v_summary WHERE id = v_run;
  PERFORM set_config('primora.privacy_erasure_run', '', true);
  PERFORM set_config('primora.privacy_field_write', '', true);
  PERFORM public.write_audit_log('privacy.subject_erased', 'privacy_requests', p_request_id,
    jsonb_build_object('mode', p_mode, 'counts', d, 'retained_bookings', v_ret, 'account_held', v_account_held, 'run_id', v_run));
  RETURN v_summary;
END $$;
REVOKE ALL ON FUNCTION public.privacy_erase_subject_internal(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Executing an approved deletion (L3 re-check; M6 other requests, held values and copies)
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gov_exec_privacy_deletion(p_req public.admin_approval_requests)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.privacy_requests;
  o RECORD;
  v_contacts JSONB;
  v_summary JSONB;
  v_closed INTEGER := 0;
  v_exports INTEGER;
BEGIN
  IF NOT public.governance_execution_active('privacy_deletion', p_req.target_id) THEN
    RAISE EXCEPTION 'A deletion runs only as an approved request' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_req.target_id FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'awaiting_approval' OR r.verified_at IS NULL OR r.request_type <> 'deletion' THEN
    RAISE EXCEPTION 'The privacy request is no longer waiting for this approval' USING ERRCODE = '22023';
  END IF;
  -- L3: the account may have changed role between the proposal and the approval.
  PERFORM public.privacy_require_customer_subject(r.subject_id);
  PERFORM public.privacy_require_unchanged_contacts(r);
  -- The completion notice goes to the verified contacts the account has now; they are destroyed once the notice is queued.
  SELECT jsonb_strip_nulls(jsonb_build_object(
           'email', CASE WHEN u.email_confirmed_at IS NOT NULL THEN NULLIF(lower(btrim(COALESCE(u.email, ''))), '') END,
           'sms', CASE WHEN u.phone_confirmed_at IS NOT NULL THEN NULLIF(btrim(COALESCE(u.phone, '')), '') END))
    INTO v_contacts FROM auth.users u WHERE u.id = r.subject_id;
  v_summary := public.privacy_erase_subject_internal(r.subject_id, r.id, r.review_choice, 'request');

  -- M6: the subject's other open requests end, held correction values and request texts are destroyed, built copies expire.
  FOR o IN SELECT * FROM public.privacy_requests
            WHERE subject_id = r.subject_id AND id <> r.id AND status IN ('awaiting_verification', 'open', 'awaiting_approval', 'executing')
            FOR UPDATE LOOP
    IF o.approval_request_id IS NOT NULL THEN
      UPDATE public.admin_approval_requests SET status = 'cancelled', decided_by = auth.uid(), decided_at = now(),
             decision_reason = 'Superseded by the deletion of the account'
       WHERE id = o.approval_request_id AND status = 'pending';
    END IF;
    UPDATE public.privacy_requests SET status = 'withdrawn', completed_at = now(), decision_reason = 'Superseded by the deletion of the account',
           approval_request_id = NULL, updated_at = now()
     WHERE id = o.id;
    PERFORM public.privacy_log_event(o.id, 'superseded_by_deletion', jsonb_build_object('deletion_request_id', r.id));
    v_closed := v_closed + 1;
  END LOOP;
  DELETE FROM public.privacy_field_restrictions WHERE subject_id = r.subject_id;
  UPDATE public.privacy_requests SET correction_value = NULL, details = NULL, updated_at = now()
   WHERE subject_id = r.subject_id AND (correction_value IS NOT NULL OR details IS NOT NULL);
  UPDATE public.privacy_exports SET status = 'expired' WHERE subject_id = r.subject_id AND status IN ('awaiting_build', 'built', 'failed');
  GET DIAGNOSTICS v_exports = ROW_COUNT;
  v_summary := jsonb_set(v_summary, '{deleted}', (v_summary->'deleted')
    || jsonb_build_object('other_requests_closed', v_closed, 'data_copies_destroyed', v_exports));

  UPDATE public.privacy_requests SET status = 'executing',
         execution_state = CASE WHEN (v_summary->>'account_held')::boolean THEN 'account_held' ELSE 'erased_awaiting_auth' END,
         completion_summary = v_summary, notice_contacts = COALESCE(v_contacts, '{}'::jsonb), decided_by = auth.uid(), decided_at = now(),
         details = NULL, correction_value = NULL, updated_at = now()
   WHERE id = r.id RETURNING * INTO r;
  PERFORM public.privacy_log_event(r.id, 'approved', jsonb_build_object('approval_id', p_req.id));
  PERFORM public.privacy_log_event(r.id, 'data_erased', jsonb_build_object('deleted', v_summary->'deleted', 'account_held', v_summary->'account_held'));
  IF (v_summary->>'account_held')::boolean THEN
    PERFORM public.privacy_finish_deletion(r.id);
  END IF;
  RETURN jsonb_build_object('request_id', r.id, 'next', CASE WHEN (v_summary->>'account_held')::boolean THEN 'done' ELSE 'delete_auth_account' END,
                            'summary', v_summary);
END $$;
REVOKE ALL ON FUNCTION public.gov_exec_privacy_deletion(public.admin_approval_requests) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. The worker's list (H1, C1.4, M6, M7)
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.privacy_auth_erasures_due()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the erasure worker lists accounts to delete' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'requests', COALESCE((SELECT jsonb_agg(jsonb_build_object('request_id', r.id, 'subject_id', r.subject_id,
                  'phone', r.notice_contacts->>'sms',
                  'phones', COALESCE((SELECT to_jsonb(p.phones) FROM public.privacy_erasure_pending p WHERE p.subject_id = r.subject_id), '[]'::jsonb))
                  ORDER BY r.decided_at)
                FROM public.privacy_requests r WHERE r.status = 'executing' AND r.execution_state = 'erased_awaiting_auth'), '[]'::jsonb),
    -- H1: an account a court hold kept, whose hold has been released and whose data the engine then erased.
    'held_released', COALESCE((SELECT jsonb_agg(jsonb_build_object('subject_id', l.subject_id,
                  'phones', COALESCE((SELECT to_jsonb(p.phones) FROM public.privacy_erasure_pending p WHERE p.subject_id = l.subject_id), '[]'::jsonb)))
                FROM public.deletion_ledger l
               WHERE NOT l.account_held AND l.auth_deleted_at IS NULL
                 AND NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = l.subject_id)
                 AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = l.subject_id)
                 AND public.privacy_has_completed_deletion(l.subject_id)
                 AND NOT EXISTS (SELECT 1 FROM public.privacy_requests q WHERE q.subject_id = l.subject_id AND q.status = 'executing')), '[]'::jsonb),
    -- C1.4: an account a restore brought back, only for a subject whose deletion request completed.
    'restored', COALESCE((SELECT jsonb_agg(jsonb_build_object('subject_id', l.subject_id))
                FROM public.deletion_ledger l
               WHERE NOT l.account_held AND l.auth_deleted_at IS NOT NULL
                 AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = l.subject_id)
                 AND public.privacy_has_completed_deletion(l.subject_id)), '[]'::jsonb),
    -- M6: copy files of an erased subject still in storage.
    'export_files', COALESCE((SELECT jsonb_agg(jsonb_build_object('request_id', e.request_id,
                  'paths', to_jsonb(ARRAY(SELECT x FROM unnest(ARRAY[e.json_path, e.pdf_path]) x WHERE x IS NOT NULL))))
                FROM public.privacy_exports e
               WHERE e.status = 'expired' AND e.files_removed_at IS NULL AND (e.json_path IS NOT NULL OR e.pdf_path IS NOT NULL)
                 AND EXISTS (SELECT 1 FROM public.deletion_ledger l WHERE l.subject_id = e.subject_id)), '[]'::jsonb),
    'whatsapp_channels', COALESCE((SELECT jsonb_agg(phone_number_id) FROM public.whatsapp_channels), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.privacy_auth_erasures_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_auth_erasures_due() TO service_role;

CREATE OR REPLACE FUNCTION public.privacy_has_completed_deletion(p_subject UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.privacy_requests WHERE subject_id = p_subject AND request_type = 'deletion' AND status = 'completed'
                    AND verified_at IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.privacy_has_completed_deletion(UUID) FROM PUBLIC, anon, authenticated;

-- M6: the worker removed the copy files of an erased subject from storage.
CREATE OR REPLACE FUNCTION public.privacy_record_export_files_removed(p_request_ids UUID[])
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n INTEGER;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the erasure worker records removed copy files' USING ERRCODE = '42501';
  END IF;
  UPDATE public.privacy_exports SET files_removed_at = now(), json_path = NULL, pdf_path = NULL, json_sha256 = NULL, pdf_sha256 = NULL
   WHERE request_id = ANY (COALESCE(p_request_ids, '{}')) AND status = 'expired' AND files_removed_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    PERFORM public.write_audit_log('privacy.export_files_removed', 'privacy_exports', NULL, jsonb_build_object('count', v_n));
  END IF;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.privacy_record_export_files_removed(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_record_export_files_removed(UUID[]) TO service_role;

-- M7: the count of erased WhatsApp threads goes into the completion summary.
CREATE OR REPLACE FUNCTION public.privacy_erase_whatsapp(p_request_id UUID, p_hashes TEXT[])
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n INTEGER;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the erasure worker erases WhatsApp threads' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_hashes, '{}'::text[])) h WHERE h !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'Invalid hash' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.whatsapp_messages WHERE conversation_id IN (SELECT id FROM public.whatsapp_conversations WHERE customer_hash = ANY (p_hashes));
  DELETE FROM public.whatsapp_conversations WHERE customer_hash = ANY (p_hashes);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF p_request_id IS NOT NULL THEN
    UPDATE public.privacy_requests SET completion_summary = jsonb_set(COALESCE(completion_summary, '{}'::jsonb), '{deleted,whatsapp_threads}',
             to_jsonb(COALESCE((completion_summary #>> '{deleted,whatsapp_threads}')::int, 0) + v_n), true)
     WHERE id = p_request_id AND completion_summary ? 'deleted';
    PERFORM public.privacy_log_event(p_request_id, 'whatsapp_threads_erased', jsonb_build_object('threads', v_n));
  END IF;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.privacy_erase_whatsapp(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_erase_whatsapp(UUID, TEXT[]) TO service_role;

-- The worker deleted the auth account: confirmed against auth.users. For an approved request the request completes; for an account a
-- released court hold kept, the final completion notice is queued (H1). What was kept aside for the worker is destroyed.
CREATE OR REPLACE FUNCTION public.privacy_record_auth_erasure(p_request_id UUID, p_subject_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.privacy_requests;
  p public.privacy_erasure_pending;
  v_run public.privacy_erasure_runs;
  v_payload JSONB;
  k TEXT;
  v_dest TEXT;
  v_count INTEGER := 0;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the erasure worker records an auth deletion' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = p_subject_id) THEN
    RAISE EXCEPTION 'The auth account still exists' USING ERRCODE = '22023';
  END IF;
  UPDATE public.deletion_ledger SET auth_deleted_at = now() WHERE subject_id = p_subject_id;
  DELETE FROM public.privacy_erasure_pending WHERE subject_id = p_subject_id RETURNING * INTO p;
  IF p_request_id IS NULL THEN
    -- H1: after a court hold's release the customer gets the final summary.
    SELECT * INTO v_run FROM public.privacy_erasure_runs WHERE subject_id = p_subject_id AND mode = 'hold_release' AND finished_at IS NOT NULL
     ORDER BY started_at DESC LIMIT 1;
    IF p.subject_id IS NOT NULL AND v_run.id IS NOT NULL THEN
      v_payload := jsonb_build_object('final', TRUE, 'deleted', (v_run.summary->'deleted') || '{"auth_account": true}'::jsonb,
                                      'retained', v_run.summary->'retained', 'held', v_run.summary->'held',
                                      'complaint_right', public.privacy_complaint_right());
      FOR k, v_dest IN SELECT key, value FROM jsonb_each_text(COALESCE(p.notice_contacts, '{}'::jsonb)) LOOP
        INSERT INTO public.governance_notifications (recipient_user_id, channel, template_key, payload, destination, contact_source)
        VALUES (p_subject_id, k, 'privacy_deletion_completed', v_payload, v_dest, 'current_verified');
        v_count := v_count + 1;
      END LOOP;
    END IF;
    PERFORM public.write_audit_log('privacy.auth_account_reerased', 'deletion_ledger', p_subject_id,
      jsonb_build_object('after_hold_release', v_run.id IS NOT NULL, 'completion_notices', v_count));
    RETURN jsonb_build_object('subject_id', p_subject_id, 'reapplied', TRUE, 'completion_notices', v_count);
  END IF;
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_request_id AND subject_id = p_subject_id FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'executing' OR r.execution_state <> 'erased_awaiting_auth' THEN
    RAISE EXCEPTION 'This deletion is not waiting for the auth account' USING ERRCODE = '22023';
  END IF;
  UPDATE public.privacy_requests SET execution_state = 'auth_deleted',
         completion_summary = jsonb_set(completion_summary, '{deleted,auth_account}', 'true'::jsonb), updated_at = now()
   WHERE id = r.id;
  PERFORM public.privacy_log_event(r.id, 'auth_account_deleted');
  RETURN public.privacy_finish_deletion(r.id);
END $$;
REVOKE ALL ON FUNCTION public.privacy_record_auth_erasure(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_record_auth_erasure(UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Deletion ledger after a restore (C1)
-- ---------------------------------------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.privacy_reapply_deletion_ledger(JSONB);

-- Re-erases every ledger entry whose data reappeared. Only entries of a completed deletion request; the engine refuses any account
-- that is not a customer. Console (privacy.approve after step-up) or the scheduler.
CREATE OR REPLACE FUNCTION public.privacy_reapply_deletion_ledger()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e RECORD;
  v_reapplied INTEGER := 0;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    PERFORM public.require_recent_mfa();
    PERFORM public.privacy_require_console('privacy.approve');
  END IF;
  FOR e IN SELECT * FROM public.deletion_ledger l WHERE public.privacy_has_completed_deletion(l.subject_id) LOOP
    IF (NOT e.account_held AND EXISTS (SELECT 1 FROM public.profiles WHERE id = e.subject_id))
       OR EXISTS (SELECT 1 FROM public.bookings WHERE customer_id = e.subject_id)
       OR EXISTS (SELECT 1 FROM public.conversations WHERE customer_id = e.subject_id)
       OR EXISTS (SELECT 1 FROM public.reviews WHERE customer_id = e.subject_id)
       OR EXISTS (SELECT 1 FROM public.intake_answers WHERE customer_id = e.subject_id) THEN
      PERFORM public.privacy_erase_subject_internal(e.subject_id, NULL, e.review_choice, 'reapply');
      v_reapplied := v_reapplied + 1;
    END IF;
  END LOOP;
  PERFORM public.write_audit_log('privacy.deletion_ledger_reapplied', 'deletion_ledger', NULL,
    jsonb_build_object('entries', (SELECT count(*) FROM public.deletion_ledger), 'reapplied', v_reapplied));
  RETURN jsonb_build_object('entries', (SELECT count(*) FROM public.deletion_ledger), 'reapplied', v_reapplied,
    'auth_accounts_to_delete', COALESCE((SELECT jsonb_agg(l.subject_id) FROM public.deletion_ledger l
      WHERE NOT l.account_held AND public.privacy_has_completed_deletion(l.subject_id)
        AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = l.subject_id)), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.privacy_reapply_deletion_ledger() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privacy_reapply_deletion_ledger() TO authenticated, service_role;

-- The ledger for the archive outside the database: identifiers and dates only, with the SHA-256 of the entries an import checks.
CREATE OR REPLACE FUNCTION public.admin_privacy_export_deletion_ledger()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v JSONB;
BEGIN
  PERFORM public.require_recent_mfa();
  PERFORM public.privacy_require_console('privacy.approve');
  SELECT COALESCE(jsonb_agg(jsonb_build_object('subject_id', subject_id, 'request_id', request_id, 'review_choice', review_choice,
           'erased_at', erased_at, 'auth_deleted_at', auth_deleted_at, 'account_held', account_held, 'reapplied_count', reapplied_count,
           'last_reapplied_at', last_reapplied_at) ORDER BY erased_at, subject_id), '[]'::jsonb)
    INTO v FROM public.deletion_ledger;
  PERFORM public.write_audit_log('privacy.deletion_ledger_exported', 'deletion_ledger', NULL,
    jsonb_build_object('rows', jsonb_array_length(v)) || public.request_client_info());
  RETURN jsonb_build_object('generated_at', now(), 'entries', v, 'sha256', encode(extensions.digest(v::text, 'sha256'), 'hex'));
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_export_deletion_ledger() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_export_deletion_ledger() TO authenticated;

-- C1: after a restore, archive entries come back only through the service key, only when the archive's digest matches what the
-- export printed, and only for a subject whose deletion request is recorded as completed (same request id). Entries are inserted
-- with auth_deleted_at NULL; the worker then deletes the auth account through the normal path.
CREATE OR REPLACE FUNCTION public.privacy_import_deletion_archive(p_entries JSONB, p_archive_sha256 TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e RECORD;
  v_added INTEGER := 0;
  v_skipped INTEGER := 0;
  v_n INTEGER;
  v_result JSONB;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the service key imports a deletion archive' USING ERRCODE = '42501';
  END IF;
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN RAISE EXCEPTION 'Entries must be an array' USING ERRCODE = '22023'; END IF;
  IF p_archive_sha256 IS NULL OR encode(extensions.digest(p_entries::text, 'sha256'), 'hex') <> lower(p_archive_sha256) THEN
    RAISE EXCEPTION 'The archive does not match its SHA-256 digest' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT (x->>'subject_id')::uuid AS subject_id, NULLIF(x->>'request_id', '')::uuid AS request_id,
                  COALESCE(x->>'review_choice', 'delete_text') AS review_choice, COALESCE((x->>'erased_at')::timestamptz, now()) AS erased_at
             FROM jsonb_array_elements(p_entries) x LOOP
    IF e.request_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.privacy_requests q WHERE q.id = e.request_id AND q.subject_id = e.subject_id
                                             AND q.request_type = 'deletion' AND q.status = 'completed' AND q.verified_at IS NOT NULL) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    INSERT INTO public.deletion_ledger (subject_id, request_id, review_choice, erased_at, auth_deleted_at)
    VALUES (e.subject_id, e.request_id, e.review_choice, e.erased_at, NULL) ON CONFLICT (subject_id) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_added := v_added + v_n;
  END LOOP;
  PERFORM public.write_audit_log('privacy.deletion_archive_imported', 'deletion_ledger', NULL,
    jsonb_build_object('added', v_added, 'skipped_without_completed_request', v_skipped, 'sha256', lower(p_archive_sha256)));
  v_result := public.privacy_reapply_deletion_ledger();
  RETURN v_result || jsonb_build_object('added_from_archive', v_added, 'skipped_without_completed_request', v_skipped);
END $$;
REVOKE ALL ON FUNCTION public.privacy_import_deletion_archive(JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_import_deletion_archive(JSONB, TEXT) TO service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. Legal holds: scope (H2), release (H1, M5), renewal
-- ---------------------------------------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_privacy_propose_legal_hold(UUID, TEXT, TEXT, TEXT[], UUID, TEXT);
CREATE OR REPLACE FUNCTION public.admin_privacy_propose_legal_hold(p_subject_id UUID, p_basis TEXT, p_case_reference TEXT,
  p_categories TEXT[], p_booking_id UUID, p_reason TEXT, p_account_reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_account_reason TEXT := NULLIF(btrim(COALESCE(p_account_reason, '')), '');
  v_ref TEXT := NULLIF(btrim(COALESCE(p_case_reference, '')), '');
  v_categories TEXT[];
  v_id UUID;
  v_dispute UUID;
  v_result JSONB;
BEGIN
  PERFORM public.require_recent_mfa();
  PERFORM public.privacy_require_console('privacy.manage');
  IF p_basis IS NULL OR p_basis NOT IN ('court_case', 'payment_dispute') THEN
    RAISE EXCEPTION 'A hold is only for a court case naming the customer or an open payment dispute' USING ERRCODE = '22023';
  END IF;
  IF v_ref IS NULL OR char_length(v_ref) < 3 THEN RAISE EXCEPTION 'The case reference is required' USING ERRCODE = '22023'; END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 20 THEN RAISE EXCEPTION 'Explain the hold (at least 20 characters)' USING ERRCODE = '22023'; END IF;
  IF p_categories IS NOT NULL AND 'health' = ANY (p_categories) THEN
    RAISE EXCEPTION 'Health data is never held; it is destroyed on deletion whatever else is held' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_subject_id) AND NOT EXISTS (SELECT 1 FROM public.deletion_ledger WHERE subject_id = p_subject_id) THEN
    RAISE EXCEPTION 'Customer not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_basis = 'payment_dispute' THEN
    SELECT d.id INTO v_dispute FROM public.payment_disputes d
     WHERE d.booking_id = p_booking_id AND d.customer_id = p_subject_id AND d.status IN ('opened', 'under_review') LIMIT 1;
    IF v_dispute IS NULL THEN
      RAISE EXCEPTION 'No open payment dispute by this customer on that booking' USING ERRCODE = '22023';
    END IF;
    v_categories := ARRAY['bookings', 'messages'];
    v_account_reason := NULL;
  ELSE
    SELECT array_agg(DISTINCT x) INTO v_categories FROM unnest(COALESCE(p_categories, '{}'::text[])) x;
    IF v_categories IS NULL OR NOT v_categories <@ ARRAY['account', 'reviews', 'messages', 'bookings'] THEN
      RAISE EXCEPTION 'Choose what the case needs: account, reviews, messages or bookings' USING ERRCODE = '22023';
    END IF;
    -- H2: the account (profile, contact details, login) is kept only when the case needs it, said in its own words.
    IF 'account' = ANY (v_categories) AND (v_account_reason IS NULL OR char_length(v_account_reason) < 20) THEN
      RAISE EXCEPTION 'Explain why the case needs the account itself (profile, contact details and login), at least 20 characters'
        USING ERRCODE = '22023', HINT = 'account_reason_required';
    END IF;
    IF NOT 'account' = ANY (v_categories) THEN v_account_reason := NULL; END IF;
  END IF;
  INSERT INTO public.privacy_legal_holds (subject_id, basis, case_reference, booking_id, dispute_id, categories, reason, account_reason, created_by)
  VALUES (p_subject_id, p_basis, v_ref, CASE WHEN p_basis = 'payment_dispute' THEN p_booking_id END, v_dispute, v_categories, v_reason,
          v_account_reason, auth.uid())
  RETURNING id INTO v_id;
  v_result := public.governance_request('privacy_legal_hold', 'privacy_legal_holds', v_id, NULL,
    jsonb_build_object('hold_id', v_id), v_reason,
    jsonb_build_object('basis', p_basis, 'case_reference', v_ref, 'categories', to_jsonb(v_categories), 'subject_id', p_subject_id,
                       'account_reason', v_account_reason));
  UPDATE public.privacy_legal_holds SET approval_request_id = (v_result->>'approval_id')::uuid WHERE id = v_id;
  RETURN v_result || jsonb_build_object('hold_id', v_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_propose_legal_hold(UUID, TEXT, TEXT, TEXT[], UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_propose_legal_hold(UUID, TEXT, TEXT, TEXT[], UUID, TEXT, TEXT) TO authenticated;

-- A released dispute hold: the held booking's other customer fields are nulled, its address deleted, the messages with that business
-- deleted (tombstone), the queue/log traces of that booking cleared, and the booking gets a fresh pseudonym (M5).
CREATE OR REPLACE FUNCTION public.privacy_finish_held_booking(h public.privacy_legal_holds) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run UUID;
  v_provider UUID;
  v_n INTEGER := 0;
  v_conv RECORD;
BEGIN
  INSERT INTO public.privacy_erasure_runs (subject_id, request_id, mode, txid, actor_id)
  VALUES (h.subject_id, NULL, 'hold_release', txid_current(), auth.uid()) RETURNING id INTO v_run;
  PERFORM set_config('primora.privacy_erasure_run', v_run::text, true);
  PERFORM set_config('primora.audit_rows', '1000000', true);
  SELECT br.provider_id INTO v_provider FROM public.bookings b JOIN public.branches br ON br.id = b.branch_id WHERE b.id = h.booking_id;
  DELETE FROM public.booking_home_addresses WHERE booking_id = h.booking_id;
  UPDATE public.bookings SET client_profile_id = NULL, home_address_lat = NULL, home_address_lng = NULL, home_address_text = NULL,
         walk_in_name = NULL, walk_in_phone = NULL, cancellation_reason = NULL, pseudonym_token = public.privacy_new_token(),
         retention_basis = 'Pseudonymised: retained under Commercial Books Law Art. 8 / VAT IR Art. 66'
   WHERE id = h.booking_id AND pseudonymised_at IS NOT NULL;
  PERFORM public.privacy_scrub_contact_traces(NULL, ARRAY[h.booking_id], NULL);
  FOR v_conv IN SELECT c.id FROM public.conversations c
                 WHERE c.id = ANY (COALESCE(h.held_conversation_ids, '{}'::uuid[]))
                    OR (c.provider_id = v_provider AND c.customer_id = h.subject_id) LOOP
    DELETE FROM public.messages WHERE conversation_id = v_conv.id;
    UPDATE public.conversations SET customer_id = NULL, customer_deleted_at = COALESCE(customer_deleted_at, now()), subject = NULL,
           last_message_preview = NULL WHERE id = v_conv.id;
    v_n := v_n + 1;
  END LOOP;
  UPDATE public.privacy_erasure_runs SET finished_at = clock_timestamp(), summary = jsonb_build_object('booking_id', h.booking_id, 'threads', v_n)
   WHERE id = v_run;
  PERFORM set_config('primora.privacy_erasure_run', '', true);
  RETURN jsonb_build_object('booking_id', h.booking_id, 'threads_tombstoned', v_n);
END $$;
REVOKE ALL ON FUNCTION public.privacy_finish_held_booking(public.privacy_legal_holds) FROM PUBLIC, anon, authenticated;

-- A released court hold of an erased subject whose account was not held: what it kept is finished, or handed to another active
-- court hold that still covers the same category.
CREATE OR REPLACE FUNCTION public.privacy_finish_court_hold(h public.privacy_legal_holds, l public.deletion_ledger) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run UUID;
  v_other public.privacy_legal_holds;
  v_threads INTEGER := 0;
  v_reviews INTEGER := 0;
  v_bookings INTEGER := 0;
  v_deleted INTEGER := 0;
  v_conv RECORD;
  b RECORD;
BEGIN
  INSERT INTO public.privacy_erasure_runs (subject_id, request_id, mode, txid, actor_id)
  VALUES (h.subject_id, l.request_id, 'hold_release', txid_current(), auth.uid()) RETURNING id INTO v_run;
  PERFORM set_config('primora.privacy_erasure_run', v_run::text, true);
  PERFORM set_config('primora.audit_rows', '1000000', true);

  IF 'messages' = ANY (h.categories) AND h.held_conversation_ids IS NOT NULL THEN
    v_other := public.privacy_court_hold_for(h.subject_id, 'messages', h.id);
    IF v_other.id IS NOT NULL THEN
      UPDATE public.privacy_legal_holds SET held_conversation_ids = ARRAY(SELECT DISTINCT x FROM
             unnest(COALESCE(held_conversation_ids, '{}'::uuid[]) || h.held_conversation_ids) x) WHERE id = v_other.id;
    ELSE
      FOR v_conv IN SELECT c.id FROM public.conversations c WHERE c.id = ANY (h.held_conversation_ids) LOOP
        DELETE FROM public.messages WHERE conversation_id = v_conv.id;
        UPDATE public.conversations SET subject = NULL, last_message_preview = NULL WHERE id = v_conv.id;
        v_threads := v_threads + 1;
      END LOOP;
    END IF;
  END IF;

  IF 'reviews' = ANY (h.categories) THEN
    v_other := public.privacy_court_hold_for(h.subject_id, 'reviews', h.id);
    IF v_other.id IS NOT NULL THEN
      UPDATE public.reviews SET pseudonym_token = v_other.pseudonym_token WHERE pseudonym_token = h.pseudonym_token;
    ELSIF l.review_choice = 'deleted_user' THEN
      UPDATE public.reviews SET pseudonym_token = NULL WHERE pseudonym_token = h.pseudonym_token;
      GET DIAGNOSTICS v_reviews = ROW_COUNT;
    ELSE
      DELETE FROM public.reviews WHERE pseudonym_token = h.pseudonym_token;
      GET DIAGNOSTICS v_reviews = ROW_COUNT;
    END IF;
  END IF;

  IF 'bookings' = ANY (h.categories) THEN
    v_other := public.privacy_court_hold_for(h.subject_id, 'bookings', h.id);
    FOR b IN SELECT id FROM public.bookings WHERE pseudonym_token = h.pseudonym_token LOOP
      IF v_other.id IS NOT NULL THEN
        UPDATE public.bookings SET pseudonym_token = v_other.pseudonym_token WHERE id = b.id;
      ELSIF public.privacy_booking_is_linked(b.id) OR EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id) THEN
        DELETE FROM public.booking_home_addresses WHERE booking_id = b.id;
        UPDATE public.bookings SET client_profile_id = NULL, home_address_lat = NULL, home_address_lng = NULL, home_address_text = NULL,
               walk_in_name = NULL, walk_in_phone = NULL, cancellation_reason = NULL, pseudonym_token = public.privacy_new_token(),
               retention_basis = 'Pseudonymised: retained under Commercial Books Law Art. 8 / VAT IR Art. 66'
         WHERE id = b.id;
        PERFORM public.privacy_scrub_contact_traces(NULL, ARRAY[b.id], NULL);
        v_bookings := v_bookings + 1;
      ELSE
        PERFORM public.privacy_scrub_contact_traces(NULL, ARRAY[b.id], NULL);
        DELETE FROM public.group_booking_members WHERE booking_id = b.id;
        DELETE FROM public.bookings WHERE id = b.id;
        v_deleted := v_deleted + 1;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.privacy_erasure_runs SET finished_at = clock_timestamp(),
         summary = jsonb_build_object('hold_id', h.id, 'threads', v_threads, 'reviews', v_reviews, 'bookings_pseudonymised', v_bookings,
                                      'bookings_deleted', v_deleted)
   WHERE id = v_run;
  PERFORM set_config('primora.privacy_erasure_run', '', true);
  RETURN jsonb_build_object('threads_tombstoned', v_threads, 'reviews', v_reviews, 'bookings_pseudonymised', v_bookings, 'bookings_deleted', v_deleted);
END $$;
REVOKE ALL ON FUNCTION public.privacy_finish_court_hold(public.privacy_legal_holds, public.deletion_ledger) FROM PUBLIC, anon, authenticated;

-- Releases a hold and, when the customer's deletion already ran, carries out what the hold had deferred (H1). The hold then forgets
-- its pseudonym and, for an erased customer, who it was about (M5).
CREATE OR REPLACE FUNCTION public.privacy_release_hold_internal(p_hold_id UUID, p_reason TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  h public.privacy_legal_holds;
  l public.deletion_ledger;
  v_summary JSONB;
BEGIN
  UPDATE public.privacy_legal_holds SET status = 'released', released_at = now(), released_by = auth.uid(), release_reason = p_reason
   WHERE id = p_hold_id AND status = 'active' RETURNING * INTO h;
  IF h.id IS NULL THEN RAISE EXCEPTION 'Active hold not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.write_audit_log('privacy.legal_hold_released', 'privacy_legal_holds', h.id, jsonb_build_object('reason', p_reason));
  SELECT * INTO l FROM public.deletion_ledger WHERE subject_id = h.subject_id;
  IF l.subject_id IS NOT NULL THEN
    IF h.basis = 'payment_dispute' THEN
      v_summary := public.privacy_finish_held_booking(h);
    ELSIF l.account_held THEN
      -- The account was kept: once no active court hold names it, the engine erases it (the worker then deletes the login).
      IF NOT EXISTS (SELECT 1 FROM public.privacy_legal_holds WHERE subject_id = h.subject_id AND status = 'active' AND basis = 'court_case'
                       AND 'account' = ANY (categories)) THEN
        v_summary := public.privacy_erase_subject_internal(h.subject_id, l.request_id, l.review_choice, 'hold_release');
      END IF;
    ELSE
      v_summary := public.privacy_finish_court_hold(h, l);
    END IF;
    UPDATE public.privacy_legal_holds SET pseudonym_token = NULL, subject_id = NULL, held_conversation_ids = NULL WHERE id = h.id;
  ELSE
    UPDATE public.privacy_legal_holds SET pseudonym_token = NULL WHERE id = h.id;
  END IF;
  RETURN jsonb_build_object('hold_id', h.id, 'status', 'released', 'erasure', v_summary);
END $$;
REVOKE ALL ON FUNCTION public.privacy_release_hold_internal(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- The 90-day review. Keeping the hold needs a reason and a reviewer who is neither its proposer nor whoever last approved or renewed
-- it, so one person cannot renew a hold indefinitely. A dispute hold whose dispute closed is not kept (it ends 30 days after).
CREATE OR REPLACE FUNCTION public.admin_privacy_review_legal_hold(p_hold_id UUID, p_keep BOOLEAN, p_note TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
  h public.privacy_legal_holds;
BEGIN
  PERFORM public.require_recent_mfa();
  PERFORM public.privacy_require_console('privacy.approve');
  IF v_note IS NULL OR char_length(v_note) < 20 THEN
    RAISE EXCEPTION 'Record the outcome of the review (at least 20 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO h FROM public.privacy_legal_holds WHERE id = p_hold_id AND status = 'active' FOR UPDATE;
  IF h.id IS NULL THEN RAISE EXCEPTION 'Active hold not found' USING ERRCODE = 'P0002'; END IF;
  IF p_keep THEN
    IF auth.uid() = h.created_by OR auth.uid() = COALESCE(h.last_reviewed_by, h.approved_by) THEN
      RAISE EXCEPTION 'A hold is kept only by a new approver: not the person who proposed it or who last approved or renewed it'
        USING ERRCODE = '42501', HINT = 'new_approver_required';
    END IF;
    IF h.basis = 'payment_dispute' AND h.dispute_closed_at IS NOT NULL THEN
      RAISE EXCEPTION 'The dispute closed; this hold ends 30 days after and is not renewed' USING ERRCODE = '22023';
    END IF;
    UPDATE public.privacy_legal_holds SET last_reviewed_at = now(), last_reviewed_by = auth.uid(), last_review_note = v_note,
           review_due_at = now() + INTERVAL '90 days', renewals = renewals + 1
     WHERE id = h.id RETURNING * INTO h;
    PERFORM public.write_audit_log('privacy.legal_hold_reviewed', 'privacy_legal_holds', h.id,
      jsonb_build_object('kept', TRUE, 'note', v_note, 'review_due_at', h.review_due_at, 'renewals', h.renewals));
    RETURN jsonb_build_object('hold_id', h.id, 'status', 'active', 'review_due_at', h.review_due_at, 'renewals', h.renewals);
  END IF;
  UPDATE public.privacy_legal_holds SET last_reviewed_at = now(), last_reviewed_by = auth.uid(), last_review_note = v_note WHERE id = h.id;
  RETURN public.privacy_release_hold_internal(h.id, v_note);
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_review_legal_hold(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_review_legal_hold(UUID, BOOLEAN, TEXT) TO authenticated;

-- The hold list never carries the pseudonym.
SELECT pg_temp.patch_function('public.admin_privacy_list_legal_holds(text,integer,integer)'::regprocedure,
$from$(to_jsonb(h) - 'pseudonym_token')$from$,
$to$(to_jsonb(h) - 'pseudonym_token' - 'held_conversation_ids')$to$);
SELECT pg_temp.patch_function('public.admin_privacy_list_legal_holds(text,integer,integer)'::regprocedure,
$from$COALESCE(array_agg(h.subject_id), '{}')$from$,
$to$COALESCE(array_agg(h.subject_id) FILTER (WHERE h.subject_id IS NOT NULL), '{}')$to$);
