-- PRIV-3: deletion engine (Q2 "Final decision text", docs/legal/2026-10-10-privacy-decision-memo.md).
-- On a verified deletion request approved by a different privacy.approve holder (Q1.7), in one transaction:
--   1. Deleted: profile (name, e-mail, phone, gender, push token), booking home addresses, device tokens, consents, favourites,
--      notifications, the review author link (customer's choice: the review is deleted, or kept as "Deleted user"), every message
--      in every thread the customer is party to (the provider keeps a "conversation deleted" tombstone and is notified, IR 8(2)(a)).
--      There is no avatar or saved-address store in PRIMORA. The auth account (e-mail, phone, password, MFA factors) is deleted
--      right after by the Edge Function privacy-erase-account through the Auth admin API (service key).
--   2. Destroyed: every health-intake answer and patch-test result, whatever else is held.
--   3. Pseudonymised: bookings linked to an invoice, a ledger entry, a refund or another retained money record keep id, date,
--      service, price, VAT, provider and references; customer_id becomes NULL and a random token (one per erased customer, stored
--      nowhere else) is written instead; every other customer field is nulled; the row is labelled with its legal basis and the
--      date it may be destroyed with its invoice. Bookings with no such link are deleted. Memberships, purchased packages, gift
--      cards and payment disputes keep their money record the same way.
--   4. Retained unaltered: tax invoices, ledger, payouts and Tap records, 10 years from the end of the financial year. From now on
--      the B2C simplified invoice carries no customer name, e-mail, phone or address (generate_zatca_tax_invoice).
--   5. Legal hold: a court case naming the customer (chosen categories, never health data) or an open payment dispute (that
--      booking's record, its payments and the messages with that business; released 30 days after the dispute closes). Each hold
--      records reason, reference, approver and review date; reviewed every 90 days.
--   7. Every erased customer is recorded in deletion_ledger (identifier and dates only); privacy_reapply_deletion_ledger re-applies
--      it after any restore. The ledger can be exported for an archive outside the database (a restore rolls the table back too).
--   8. Completion notice: deleted, retained, legal basis, retention end, and the right to complain to SDAIA within 90 days.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Schema: pseudonymised money records, tombstones, holds, runs and the deletion ledger
-- ---------------------------------------------------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS pseudonym_token TEXT,
  ADD COLUMN IF NOT EXISTS pseudonymised_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retention_basis TEXT,
  ADD COLUMN IF NOT EXISTS retention_until DATE;
-- A pseudonymised booking has no customer and is not a walk-in.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_customer_required_unless_walk_in;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_customer_required_unless_walk_in
  CHECK (customer_id IS NOT NULL OR source::text = 'walk_in' OR pseudonymised_at IS NOT NULL);
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_pseudonymised_complete;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_pseudonymised_complete CHECK (
  pseudonymised_at IS NULL OR (customer_id IS NULL AND pseudonym_token IS NOT NULL AND retention_basis IS NOT NULL AND retention_until IS NOT NULL));

DO $cols$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('memberships', 'customer_id'), ('membership_payments', 'customer_id'), ('membership_redemptions', 'customer_id'),
      ('user_packages', 'customer_id'), ('gift_cards', 'purchaser_id'), ('payment_disputes', 'customer_id')) AS t(tbl, col)
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', r.tbl, r.col);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS pseudonym_token TEXT', r.tbl);
  END LOOP;
END $cols$;

-- A retained record no longer follows the account it came from.
ALTER TABLE public.user_packages DROP CONSTRAINT IF EXISTS user_packages_customer_id_fkey;
ALTER TABLE public.user_packages ADD CONSTRAINT user_packages_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.gift_cards DROP CONSTRAINT IF EXISTS gift_cards_purchaser_id_fkey;
ALTER TABLE public.gift_cards ADD CONSTRAINT gift_cards_purchaser_id_fkey FOREIGN KEY (purchaser_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.payment_disputes DROP CONSTRAINT IF EXISTS payment_disputes_customer_id_fkey;
ALTER TABLE public.payment_disputes ADD CONSTRAINT payment_disputes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.group_bookings ALTER COLUMN host_id DROP NOT NULL;
ALTER TABLE public.group_bookings DROP CONSTRAINT IF EXISTS group_bookings_host_id_fkey;
ALTER TABLE public.group_bookings ADD CONSTRAINT group_bookings_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- The provider keeps a "conversation deleted" tombstone; a review may stay as "Deleted user".
ALTER TABLE public.conversations ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS customer_deleted_at TIMESTAMPTZ;
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_customer_id_fkey;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_tombstone_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_tombstone_check CHECK (customer_id IS NOT NULL OR customer_deleted_at IS NOT NULL);
ALTER TABLE public.reviews ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS author_deleted_at TIMESTAMPTZ;
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_customer_id_fkey;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_author_check;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_author_check CHECK (customer_id IS NOT NULL OR author_deleted_at IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.privacy_legal_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL,
  basis TEXT NOT NULL CHECK (basis IN ('court_case', 'payment_dispute')),
  case_reference TEXT NOT NULL CHECK (char_length(case_reference) BETWEEN 3 AND 200),
  booking_id UUID,
  dispute_id UUID,
  categories TEXT[] NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) >= 20),
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'active', 'released', 'rejected', 'withdrawn')),
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  approval_request_id UUID,
  review_due_at TIMESTAMPTZ,
  last_reviewed_at TIMESTAMPTZ,
  last_reviewed_by UUID,
  last_review_note TEXT,
  pseudonym_token TEXT,
  held_conversation_ids UUID[],
  dispute_closed_at TIMESTAMPTZ,
  release_due_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  released_by UUID,
  release_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Q2.5: health data is never held; a dispute holds only that booking, its payments and the messages about it.
  CHECK (NOT ('health' = ANY (categories))),
  CHECK (categories <@ ARRAY['account', 'reviews', 'messages', 'bookings']::text[] AND cardinality(categories) >= 1),
  CHECK (basis <> 'payment_dispute' OR (booking_id IS NOT NULL AND categories <@ ARRAY['messages', 'bookings']::text[])),
  CHECK (status <> 'active' OR (approved_by IS NOT NULL AND review_due_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_privacy_legal_holds_subject ON public.privacy_legal_holds (subject_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_privacy_legal_holds_review ON public.privacy_legal_holds (review_due_at) WHERE status = 'active';
ALTER TABLE public.privacy_legal_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_legal_holds FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.privacy_legal_holds TO service_role;

CREATE TABLE IF NOT EXISTS public.privacy_erasure_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL,
  request_id UUID,
  mode TEXT NOT NULL CHECK (mode IN ('request', 'hold_release', 'reapply')),
  txid BIGINT NOT NULL,
  actor_id UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  summary JSONB
);
CREATE INDEX IF NOT EXISTS idx_privacy_erasure_runs_subject ON public.privacy_erasure_runs (subject_id, started_at DESC);
ALTER TABLE public.privacy_erasure_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_erasure_runs FROM anon, authenticated;
GRANT SELECT ON public.privacy_erasure_runs TO service_role;

-- Q2.7: who was erased (identifier and dates only), so the erasure can be applied again after a restore.
CREATE TABLE IF NOT EXISTS public.deletion_ledger (
  subject_id UUID PRIMARY KEY,
  request_id UUID,
  review_choice TEXT NOT NULL DEFAULT 'delete_text' CHECK (review_choice IN ('delete_text', 'deleted_user')),
  erased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  auth_deleted_at TIMESTAMPTZ,
  account_held BOOLEAN NOT NULL DEFAULT FALSE,
  reapplied_count INTEGER NOT NULL DEFAULT 0,
  last_reapplied_at TIMESTAMPTZ
);
ALTER TABLE public.deletion_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deletion_ledger FROM anon, authenticated;
GRANT SELECT ON public.deletion_ledger TO service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. The erasure flag: only an engine run recorded in this transaction may rewrite frozen booking fields
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.privacy_erasure_active() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.privacy_erasure_runs r
     WHERE r.id::text = NULLIF(current_setting('primora.privacy_erasure_run', true), '')
       AND r.finished_at IS NULL AND r.txid = txid_current());
$$;
REVOKE ALL ON FUNCTION public.privacy_erasure_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privacy_erasure_active() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.protect_booking_immutable_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Q2.3: the deletion engine pseudonymises a retained booking (and its foreign keys follow erased rows) inside a recorded run.
  IF public.privacy_erasure_active() THEN
    RETURN NEW;
  END IF;
  IF ROW(
    NEW.customer_id, NEW.branch_id, NEW.service_id, NEW.is_home_service,
    NEW.home_address_lat, NEW.home_address_lng, NEW.duration_minutes,
    NEW.total_price, NEW.deposit_required, NEW.tax_amount, NEW.platform_commission,
    NEW.client_profile_id, NEW.subtotal_price, NEW.discount_amount, NEW.coupon_id,
    NEW.gift_card_amount, NEW.loyalty_points_redeemed, NEW.source
  ) IS DISTINCT FROM ROW(
    OLD.customer_id, OLD.branch_id, OLD.service_id, OLD.is_home_service,
    OLD.home_address_lat, OLD.home_address_lng, OLD.duration_minutes,
    OLD.total_price, OLD.deposit_required, OLD.tax_amount, OLD.platform_commission,
    OLD.client_profile_id, OLD.subtotal_price, OLD.discount_amount, OLD.coupon_id,
    OLD.gift_card_amount, OLD.loyalty_points_redeemed, OLD.source
  ) THEN
    RAISE EXCEPTION 'Booking commercial fields are immutable after creation'
      USING ERRCODE = '22000';
  END IF;

  -- GOV-1 review C-2: money columns. Set at creation only, or by the one command that owns them (cancellation and no-show set
  -- the refund and fee, the monthly fee invoice stamps itself, releasing discounts stamps the time).
  IF ROW(NEW.wallet_credit_amount, NEW.package_covered_amount, NEW.user_package_id, NEW.invoice_number, NEW.fee_rule_id, NEW.fee_rule_snapshot)
     IS DISTINCT FROM ROW(OLD.wallet_credit_amount, OLD.package_covered_amount, OLD.user_package_id, OLD.invoice_number, OLD.fee_rule_id, OLD.fee_rule_snapshot) THEN
    RAISE EXCEPTION 'Booking money fields are immutable after creation' USING ERRCODE = '22000';
  END IF;
  IF ROW(NEW.refund_amount, NEW.cancellation_fee, NEW.fee_invoice_id, NEW.discounts_released_at)
       IS DISTINCT FROM ROW(OLD.refund_amount, OLD.cancellation_fee, OLD.fee_invoice_id, OLD.discounts_released_at)
     AND COALESCE(current_setting('primora.booking_money_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Booking refund, fee and invoice fields change only through the command that owns them' USING ERRCODE = '22000';
  END IF;

  IF (NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at OR NEW.employee_id IS DISTINCT FROM OLD.employee_id)
     AND COALESCE(current_setting('primora.reschedule_in_progress', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Booking time and professional can only change through reschedule_booking'
      USING ERRCODE = '22000';
  END IF;

  -- A pseudonymised booking stays pseudonymised.
  IF OLD.pseudonymised_at IS NOT NULL AND ROW(NEW.pseudonym_token, NEW.pseudonymised_at, NEW.retention_basis, NEW.retention_until, NEW.customer_id)
       IS DISTINCT FROM ROW(OLD.pseudonym_token, OLD.pseudonymised_at, OLD.retention_basis, OLD.retention_until, OLD.customer_id) THEN
    RAISE EXCEPTION 'A pseudonymised booking cannot be re-identified or relabelled' USING ERRCODE = '22000';
  END IF;
  IF OLD.pseudonymised_at IS NULL AND NEW.pseudonymised_at IS NOT NULL THEN
    RAISE EXCEPTION 'Bookings are pseudonymised only by the deletion engine' USING ERRCODE = '22000';
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Invoices: simplified B2C invoices carry no customer name, e-mail, phone or address (Q2.4, ZATCA guideline 4.3.2)
-- ---------------------------------------------------------------------------------------------------------------------
SELECT pg_temp.patch_function('public.generate_zatca_tax_invoice(uuid)'::regprocedure,
$from$  SELECT NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), '') INTO v_buyer
  FROM public.profiles WHERE id = v_booking.customer_id;
$from$,
$to$  -- Q2.4: a B2C sale is a simplified tax invoice; it names no buyer (no name, e-mail, phone or address).
  v_buyer := NULL;
$to$);
SELECT pg_temp.patch_function('public.generate_zatca_tax_invoice(uuid)'::regprocedure,
$from$v_provider.vat_number, COALESCE(v_buyer, v_booking.walk_in_name), v_prev,$from$,
$to$v_provider.vat_number, v_buyer, v_prev,$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. What a deletion would do (customer, maker and approver all see the same counts)
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.privacy_booking_is_linked(p_booking_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.transactional_ledger WHERE booking_id = p_booking_id)
      OR EXISTS (SELECT 1 FROM public.invoices WHERE booking_id = p_booking_id)
      OR EXISTS (SELECT 1 FROM public.refund_requests WHERE booking_id = p_booking_id)
      OR EXISTS (SELECT 1 FROM public.payment_disputes WHERE booking_id = p_booking_id)
      OR EXISTS (SELECT 1 FROM public.membership_redemptions WHERE booking_id = p_booking_id)
      OR EXISTS (SELECT 1 FROM public.sponsored_attributions WHERE booking_id = p_booking_id)
      OR EXISTS (SELECT 1 FROM public.bookings WHERE id = p_booking_id AND (fee_invoice_id IS NOT NULL OR user_package_id IS NOT NULL));
$$;
REVOKE ALL ON FUNCTION public.privacy_booking_is_linked(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.privacy_deletion_preview_internal(p_subject UUID) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'account_exists', EXISTS (SELECT 1 FROM public.profiles WHERE id = p_subject),
    'bookings_to_pseudonymise', (SELECT count(*) FROM public.bookings b WHERE b.customer_id = p_subject AND public.privacy_booking_is_linked(b.id)),
    'bookings_to_delete', (SELECT count(*) FROM public.bookings b WHERE b.customer_id = p_subject AND NOT public.privacy_booking_is_linked(b.id)),
    'invoices_retained', (SELECT count(*) FROM public.invoices WHERE customer_id = p_subject),
    'conversations', (SELECT count(*) FROM public.conversations WHERE customer_id = p_subject),
    'messages', (SELECT count(*) FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id WHERE c.customer_id = p_subject),
    'reviews', (SELECT count(*) FROM public.reviews WHERE customer_id = p_subject),
    'health_answers', (SELECT count(*) FROM public.intake_answers WHERE customer_id = p_subject),
    'consents', (SELECT count(*) FROM public.consents WHERE user_id = p_subject),
    'favourites', (SELECT count(*) FROM public.customer_favorites WHERE customer_id = p_subject),
    'device_tokens', (SELECT count(*) FROM public.expo_push_tokens WHERE user_id = p_subject),
    'open_disputes', (SELECT count(*) FROM public.payment_disputes WHERE customer_id = p_subject AND status IN ('opened', 'under_review')),
    'active_holds', (SELECT count(*) FROM public.privacy_legal_holds WHERE subject_id = p_subject AND status = 'active'),
    'wallet_balance_sar', (SELECT COALESCE(sum(remaining_amount), 0) FROM public.wallet_credits WHERE customer_id = p_subject AND NOT is_spent
                             AND (expires_at IS NULL OR expires_at > now())),
    'unused_package_sessions', (SELECT COALESCE(sum(remaining_sessions), 0) FROM public.user_packages WHERE customer_id = p_subject AND status = 'active'
                                  AND (expires_at IS NULL OR expires_at > now())),
    'active_memberships', (SELECT count(*) FROM public.memberships WHERE customer_id = p_subject AND status = 'active'));
$$;
REVOKE ALL ON FUNCTION public.privacy_deletion_preview_internal(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.privacy_deletion_preview()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  RETURN public.privacy_deletion_preview_internal(auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.privacy_deletion_preview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privacy_deletion_preview() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_privacy_deletion_preview(p_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.privacy_requests;
BEGIN
  PERFORM public.gov2_require_read(ARRAY['privacy.manage', 'privacy.approve'], 'privacy requests');
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_request_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.gov2_log_read('privacy_deletion.previewed', 'privacy_requests', ARRAY[r.subject_id], ARRAY['counts'], 'privacy_request',
    jsonb_build_object('request_id', r.id), 1);
  RETURN public.privacy_deletion_preview_internal(r.subject_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_deletion_preview(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_deletion_preview(UUID) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. The engine
-- ---------------------------------------------------------------------------------------------------------------------
-- 10 years from the end of the financial year the record belongs to. The financial year is taken as the calendar year
-- (Gregorian, Riyadh) until the owner records otherwise (gap financial-year-end-not-recorded).
CREATE OR REPLACE FUNCTION public.privacy_retention_until(p_at TIMESTAMPTZ) RETURNS DATE LANGUAGE sql IMMUTABLE AS $$
  SELECT make_date(EXTRACT(YEAR FROM (p_at AT TIME ZONE 'Asia/Riyadh'))::int + 10, 12, 31);
$$;


CREATE OR REPLACE FUNCTION public.privacy_erase_subject_internal(p_subject UUID, p_request_id UUID, p_review_choice TEXT, p_mode TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run UUID;
  v_token TEXT := encode(extensions.gen_random_bytes(16), 'hex');
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
  b RECORD;
  c RECORD;
  dsp RECORD;
BEGIN
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
  SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_court
    FROM public.privacy_legal_holds h, unnest(h.categories) x WHERE h.subject_id = p_subject AND h.status = 'active' AND h.basis = 'court_case';
  SELECT COALESCE(array_agg(DISTINCT h.booking_id), '{}') INTO v_hold_bookings
    FROM public.privacy_legal_holds h WHERE h.subject_id = p_subject AND h.status = 'active' AND h.basis = 'payment_dispute';
  SELECT COALESCE(array_agg(DISTINCT br.provider_id), '{}') INTO v_hold_providers
    FROM public.bookings bk JOIN public.branches br ON br.id = bk.branch_id WHERE bk.id = ANY (v_hold_bookings);
  -- A court case naming the customer keeps the account with whatever it holds, so the held records stay linked to the person.
  v_account_held := cardinality(v_court) > 0;
  UPDATE public.privacy_legal_holds SET pseudonym_token = COALESCE(pseudonym_token, v_token)
   WHERE subject_id = p_subject AND status = 'active' AND basis = 'payment_dispute';

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
  d := d || jsonb_build_object('messages', v_total,
    'conversations_tombstoned', (SELECT count(*) FROM public.conversations WHERE customer_deleted_at = v_now AND customer_id IS NULL));

  -- 1. Reviews: deleted, or kept as "Deleted user" (the customer's choice).
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
  END IF;

  -- 3. Bookings: pseudonymised when linked to a retained record, deleted otherwise; a held booking keeps its content.
  IF NOT 'bookings' = ANY (v_court) THEN
    DELETE FROM public.booking_series WHERE customer_id = p_subject;
    FOR b IN SELECT bk.id, bk.scheduled_at FROM public.bookings bk WHERE bk.customer_id = p_subject LOOP
      IF b.id = ANY (v_hold_bookings) THEN
        UPDATE public.bookings SET customer_id = NULL, pseudonym_token = v_token, pseudonymised_at = v_now,
               retention_basis = 'Legal hold: open payment dispute (PDPL Art. 18); then Commercial Books Law Art. 8 / VAT IR Art. 66',
               retention_until = public.privacy_retention_until(b.scheduled_at)
         WHERE id = b.id;
        v_ret := v_ret + 1;
      ELSIF public.privacy_booking_is_linked(b.id) OR EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id) THEN
        DELETE FROM public.booking_home_addresses WHERE booking_id = b.id;
        UPDATE public.bookings SET customer_id = NULL, client_profile_id = NULL, home_address_lat = NULL, home_address_lng = NULL,
               home_address_text = NULL, walk_in_name = NULL, walk_in_phone = NULL, cancellation_reason = NULL,
               pseudonym_token = v_token, pseudonymised_at = v_now,
               retention_basis = 'Pseudonymised: retained under Commercial Books Law Art. 8 / VAT IR Art. 66',
               retention_until = public.privacy_retention_until(b.scheduled_at)
         WHERE id = b.id;
        v_ret := v_ret + 1;
      ELSE
        DELETE FROM public.group_booking_members WHERE booking_id = b.id;
        DELETE FROM public.bookings WHERE id = b.id;
        v_del := v_del + 1;
      END IF;
    END LOOP;
    SELECT max(retention_until) INTO v_until FROM public.bookings WHERE pseudonym_token = v_token;
  END IF;
  d := d || jsonb_build_object('bookings_pseudonymised', v_ret, 'bookings_deleted', v_del);

  -- Money records outside bookings keep their record without the person.
  UPDATE public.memberships SET customer_id = NULL, pseudonym_token = v_token WHERE customer_id = p_subject;
  UPDATE public.membership_payments SET customer_id = NULL, pseudonym_token = v_token WHERE customer_id = p_subject;
  UPDATE public.membership_redemptions SET customer_id = NULL, pseudonym_token = v_token WHERE customer_id = p_subject;
  UPDATE public.user_packages SET customer_id = NULL, pseudonym_token = v_token WHERE customer_id = p_subject;
  UPDATE public.gift_cards SET purchaser_id = NULL, pseudonym_token = v_token WHERE purchaser_id = p_subject;
  UPDATE public.payment_disputes SET customer_id = NULL, pseudonym_token = v_token WHERE customer_id = p_subject;
  UPDATE public.group_bookings SET host_id = NULL WHERE host_id = p_subject;
  SELECT count(*) INTO v_invoices FROM public.invoices WHERE customer_id = p_subject;
  SELECT count(*) INTO v_ledger FROM public.transactional_ledger l JOIN public.bookings bk ON bk.id = l.booking_id WHERE bk.pseudonym_token = v_token;

  -- 1. The account: profile, contact details, consents, favourites, device tokens, notifications and every other row that follows
  --    the profile. Not while a court case holds the account.
  IF NOT v_account_held AND EXISTS (SELECT 1 FROM public.profiles WHERE id = p_subject) THEN
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
      jsonb_build_object('category', 'ledger_and_payment_records', 'count', v_ledger,
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
-- 6. Executing an approved deletion; the auth account follows through the Edge Function
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gov_exec_privacy_deletion(p_req public.admin_approval_requests)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.privacy_requests;
  v_contacts JSONB;
  v_summary JSONB;
BEGIN
  IF NOT public.governance_execution_active('privacy_deletion', p_req.target_id) THEN
    RAISE EXCEPTION 'A deletion runs only as an approved request' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_req.target_id FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'awaiting_approval' OR r.verified_at IS NULL OR r.request_type <> 'deletion' THEN
    RAISE EXCEPTION 'The privacy request is no longer waiting for this approval' USING ERRCODE = '22023';
  END IF;
  -- The completion notice goes to the verified contacts the account has now; they are destroyed once the notice is queued.
  SELECT jsonb_strip_nulls(jsonb_build_object(
           'email', CASE WHEN u.email_confirmed_at IS NOT NULL THEN NULLIF(lower(btrim(COALESCE(u.email, ''))), '') END,
           'sms', CASE WHEN u.phone_confirmed_at IS NOT NULL THEN NULLIF(btrim(COALESCE(u.phone, '')), '') END))
    INTO v_contacts FROM auth.users u WHERE u.id = r.subject_id;
  v_summary := public.privacy_erase_subject_internal(r.subject_id, r.id, r.review_choice, 'request');
  UPDATE public.privacy_requests SET status = 'executing',
         execution_state = CASE WHEN (v_summary->>'account_held')::boolean THEN 'account_held' ELSE 'erased_awaiting_auth' END,
         completion_summary = v_summary, notice_contacts = COALESCE(v_contacts, '{}'::jsonb), decided_by = auth.uid(), decided_at = now(),
         details = NULL, updated_at = now()
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

-- Completes a deletion: request closed, completion notice queued to the snapshotted verified contacts, contacts destroyed.
CREATE OR REPLACE FUNCTION public.privacy_finish_deletion(p_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.privacy_requests;
  v_payload JSONB;
  k TEXT;
  v_dest TEXT;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_request_id FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'executing' OR r.execution_state NOT IN ('erased_awaiting_auth', 'account_held', 'auth_deleted') THEN
    RAISE EXCEPTION 'This deletion is not waiting to be completed' USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object('request_id', r.id, 'deleted', r.completion_summary->'deleted', 'retained', r.completion_summary->'retained',
                                  'held', r.completion_summary->'held', 'complaint_right', public.privacy_complaint_right());
  FOR k, v_dest IN SELECT key, value FROM jsonb_each_text(COALESCE(r.notice_contacts, '{}'::jsonb)) LOOP
    INSERT INTO public.governance_notifications (recipient_user_id, channel, template_key, payload, destination, contact_source)
    VALUES (r.subject_id, k, 'privacy_deletion_completed', v_payload, v_dest, 'current_verified');
    v_count := v_count + 1;
  END LOOP;
  IF v_count = 0 THEN
    INSERT INTO public.governance_notifications (recipient_user_id, channel, template_key, payload, status, error_message)
    VALUES (r.subject_id, 'email', 'privacy_deletion_completed', v_payload, 'skipped', 'No verified e-mail or phone was on the account');
  END IF;
  UPDATE public.privacy_requests SET status = 'completed', completed_at = now(), notice_contacts = NULL,
         decision_reason = COALESCE(decision_reason, 'Deletion carried out'), updated_at = now()
   WHERE id = r.id RETURNING * INTO r;
  PERFORM public.privacy_log_event(r.id, 'completed', jsonb_build_object('completion_notices', v_count));
  PERFORM public.write_audit_log('privacy.deletion_completed', 'privacy_requests', r.id,
    jsonb_build_object('completion_notices', v_count, 'execution_state', r.execution_state));
  RETURN jsonb_build_object('request_id', r.id, 'status', r.status, 'completion_notices', v_count);
END $$;
REVOKE ALL ON FUNCTION public.privacy_finish_deletion(UUID) FROM PUBLIC, anon, authenticated;

-- For the Edge Function: auth accounts to delete (approved requests, and ledger entries whose account came back after a restore).
CREATE OR REPLACE FUNCTION public.privacy_auth_erasures_due()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the erasure worker lists accounts to delete' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'requests', COALESCE((SELECT jsonb_agg(jsonb_build_object('request_id', r.id, 'subject_id', r.subject_id,
                  'phone', r.notice_contacts->>'sms') ORDER BY r.decided_at)
                FROM public.privacy_requests r WHERE r.status = 'executing' AND r.execution_state = 'erased_awaiting_auth'), '[]'::jsonb),
    'restored', COALESCE((SELECT jsonb_agg(jsonb_build_object('subject_id', l.subject_id))
                FROM public.deletion_ledger l
               WHERE NOT l.account_held AND l.auth_deleted_at IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = l.subject_id)), '[]'::jsonb),
    'whatsapp_channels', COALESCE((SELECT jsonb_agg(phone_number_id) FROM public.whatsapp_channels), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.privacy_auth_erasures_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_auth_erasures_due() TO service_role;

-- WhatsApp receptionist threads are keyed by a peppered hash only the Edge Function can compute; it passes the hashes here.
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
    PERFORM public.privacy_log_event(p_request_id, 'whatsapp_threads_erased', jsonb_build_object('threads', v_n));
  END IF;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.privacy_erase_whatsapp(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_erase_whatsapp(UUID, TEXT[]) TO service_role;

-- The Edge Function deleted the auth account through the Auth admin API: confirmed here against auth.users, then completed.
CREATE OR REPLACE FUNCTION public.privacy_record_auth_erasure(p_request_id UUID, p_subject_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.privacy_requests;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the erasure worker records an auth deletion' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = p_subject_id) THEN
    RAISE EXCEPTION 'The auth account still exists' USING ERRCODE = '22023';
  END IF;
  UPDATE public.deletion_ledger SET auth_deleted_at = now() WHERE subject_id = p_subject_id;
  IF p_request_id IS NULL THEN
    PERFORM public.write_audit_log('privacy.auth_account_reerased', 'deletion_ledger', p_subject_id, '{}'::jsonb);
    RETURN jsonb_build_object('subject_id', p_subject_id, 'reapplied', TRUE);
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
-- 7. Deletion ledger after a restore (Q2.7)
-- ---------------------------------------------------------------------------------------------------------------------
-- p_entries: optional entries from the archive kept outside the database ([{subject_id, review_choice, erased_at}]); they are added
-- first, because a restore rolls this table back too. Every entry whose data reappeared is then erased again; holds still apply.
CREATE OR REPLACE FUNCTION public.privacy_reapply_deletion_ledger(p_entries JSONB DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e RECORD;
  v_added INTEGER := 0;
  v_n INTEGER;
  v_reapplied INTEGER := 0;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    PERFORM public.require_recent_mfa();
    PERFORM public.privacy_require_console('privacy.approve');
  END IF;
  IF p_entries IS NOT NULL THEN
    IF jsonb_typeof(p_entries) <> 'array' THEN RAISE EXCEPTION 'Entries must be an array' USING ERRCODE = '22023'; END IF;
    FOR e IN SELECT (x->>'subject_id')::uuid AS subject_id, COALESCE(x->>'review_choice', 'delete_text') AS review_choice,
                    COALESCE((x->>'erased_at')::timestamptz, now()) AS erased_at
               FROM jsonb_array_elements(p_entries) x LOOP
      INSERT INTO public.deletion_ledger (subject_id, review_choice, erased_at, auth_deleted_at)
      VALUES (e.subject_id, e.review_choice, e.erased_at, e.erased_at) ON CONFLICT (subject_id) DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_added := v_added + v_n;
    END LOOP;
  END IF;
  FOR e IN SELECT * FROM public.deletion_ledger LOOP
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
    jsonb_build_object('entries', (SELECT count(*) FROM public.deletion_ledger), 'reapplied', v_reapplied, 'added_from_archive', v_added));
  RETURN jsonb_build_object('entries', (SELECT count(*) FROM public.deletion_ledger), 'reapplied', v_reapplied, 'added_from_archive', v_added,
    'auth_accounts_to_delete', COALESCE((SELECT jsonb_agg(l.subject_id) FROM public.deletion_ledger l
      WHERE NOT l.account_held AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = l.subject_id)), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.privacy_reapply_deletion_ledger(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privacy_reapply_deletion_ledger(JSONB) TO authenticated, service_role;

-- The ledger for the archive outside the database: identifiers and dates only.
CREATE OR REPLACE FUNCTION public.admin_privacy_export_deletion_ledger()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v JSONB;
BEGIN
  PERFORM public.require_recent_mfa();
  PERFORM public.privacy_require_console('privacy.approve');
  SELECT COALESCE(jsonb_agg(jsonb_build_object('subject_id', subject_id, 'review_choice', review_choice, 'erased_at', erased_at,
           'auth_deleted_at', auth_deleted_at, 'account_held', account_held, 'reapplied_count', reapplied_count,
           'last_reapplied_at', last_reapplied_at) ORDER BY erased_at), '[]'::jsonb)
    INTO v FROM public.deletion_ledger;
  PERFORM public.write_audit_log('privacy.deletion_ledger_exported', 'deletion_ledger', NULL,
    jsonb_build_object('rows', jsonb_array_length(v)) || public.request_client_info());
  RETURN jsonb_build_object('generated_at', now(), 'entries', v);
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_export_deletion_ledger() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_export_deletion_ledger() TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 8. Legal holds (Q2.5)
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_privacy_propose_legal_hold(p_subject_id UUID, p_basis TEXT, p_case_reference TEXT,
  p_categories TEXT[], p_booking_id UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
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
  ELSE
    SELECT array_agg(DISTINCT x) INTO v_categories FROM unnest(COALESCE(p_categories, '{}'::text[])) x;
    IF v_categories IS NULL OR NOT v_categories <@ ARRAY['account', 'reviews', 'messages', 'bookings'] THEN
      RAISE EXCEPTION 'Choose what the case needs: account, reviews, messages or bookings' USING ERRCODE = '22023';
    END IF;
  END IF;
  INSERT INTO public.privacy_legal_holds (subject_id, basis, case_reference, booking_id, dispute_id, categories, reason, created_by)
  VALUES (p_subject_id, p_basis, v_ref, CASE WHEN p_basis = 'payment_dispute' THEN p_booking_id END, v_dispute, v_categories, v_reason, auth.uid())
  RETURNING id INTO v_id;
  v_result := public.governance_request('privacy_legal_hold', 'privacy_legal_holds', v_id, NULL,
    jsonb_build_object('hold_id', v_id), v_reason,
    jsonb_build_object('basis', p_basis, 'case_reference', v_ref, 'categories', to_jsonb(v_categories), 'subject_id', p_subject_id));
  UPDATE public.privacy_legal_holds SET approval_request_id = (v_result->>'approval_id')::uuid WHERE id = v_id;
  RETURN v_result || jsonb_build_object('hold_id', v_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_propose_legal_hold(UUID, TEXT, TEXT, TEXT[], UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_propose_legal_hold(UUID, TEXT, TEXT, TEXT[], UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.gov_exec_privacy_legal_hold(p_req public.admin_approval_requests)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h public.privacy_legal_holds;
BEGIN
  IF NOT public.governance_execution_active('privacy_legal_hold', p_req.target_id) THEN
    RAISE EXCEPTION 'A legal hold starts only as an approved request' USING ERRCODE = '42501';
  END IF;
  UPDATE public.privacy_legal_holds SET status = 'active', approved_by = auth.uid(), approved_at = now(), review_due_at = now() + INTERVAL '90 days'
   WHERE id = p_req.target_id AND status = 'pending_approval' RETURNING * INTO h;
  IF h.id IS NULL THEN RAISE EXCEPTION 'The hold is no longer pending' USING ERRCODE = '22023'; END IF;
  PERFORM public.write_audit_log('privacy.legal_hold_started', 'privacy_legal_holds', h.id,
    jsonb_build_object('basis', h.basis, 'case_reference', h.case_reference, 'categories', to_jsonb(h.categories), 'review_due_at', h.review_due_at));
  RETURN jsonb_build_object('hold_id', h.id, 'review_due_at', h.review_due_at);
END $$;
REVOKE ALL ON FUNCTION public.gov_exec_privacy_legal_hold(public.admin_approval_requests) FROM PUBLIC, anon, authenticated;

-- After a dispute hold ends: the held booking's other customer fields are nulled, its address deleted, and the messages with that
-- business deleted (the thread becomes a tombstone).
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
         walk_in_name = NULL, walk_in_phone = NULL, cancellation_reason = NULL
   WHERE id = h.booking_id AND pseudonymised_at IS NOT NULL;
  FOR v_conv IN SELECT c.id FROM public.conversations c
                 WHERE c.id = ANY (COALESCE(h.held_conversation_ids, '{}'::uuid[]))
                    OR (c.provider_id = v_provider AND c.customer_id = h.subject_id) LOOP
    DELETE FROM public.messages WHERE conversation_id = v_conv.id;
    UPDATE public.conversations SET customer_id = NULL, customer_deleted_at = now(), subject = NULL, last_message_preview = NULL WHERE id = v_conv.id;
    v_n := v_n + 1;
  END LOOP;
  UPDATE public.privacy_erasure_runs SET finished_at = clock_timestamp(), summary = jsonb_build_object('booking_id', h.booking_id, 'threads', v_n)
   WHERE id = v_run;
  PERFORM set_config('primora.privacy_erasure_run', '', true);
  RETURN jsonb_build_object('booking_id', h.booking_id, 'threads_tombstoned', v_n);
END $$;
REVOKE ALL ON FUNCTION public.privacy_finish_held_booking(public.privacy_legal_holds) FROM PUBLIC, anon, authenticated;

-- Releases a hold and, when the customer's deletion already ran, carries out what the hold had deferred.
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
    ELSE
      v_summary := public.privacy_erase_subject_internal(h.subject_id, l.request_id, l.review_choice, 'hold_release');
    END IF;
  END IF;
  RETURN jsonb_build_object('hold_id', h.id, 'status', 'released', 'erasure', v_summary);
END $$;
REVOKE ALL ON FUNCTION public.privacy_release_hold_internal(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- The 90-day review: keep (next review in 90 days) or release.
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
    UPDATE public.privacy_legal_holds SET last_reviewed_at = now(), last_reviewed_by = auth.uid(), last_review_note = v_note,
           review_due_at = now() + INTERVAL '90 days'
     WHERE id = h.id RETURNING * INTO h;
    PERFORM public.write_audit_log('privacy.legal_hold_reviewed', 'privacy_legal_holds', h.id,
      jsonb_build_object('kept', TRUE, 'note', v_note, 'review_due_at', h.review_due_at));
    RETURN jsonb_build_object('hold_id', h.id, 'status', 'active', 'review_due_at', h.review_due_at);
  END IF;
  UPDATE public.privacy_legal_holds SET last_reviewed_at = now(), last_reviewed_by = auth.uid(), last_review_note = v_note WHERE id = h.id;
  RETURN public.privacy_release_hold_internal(h.id, v_note);
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_review_legal_hold(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_review_legal_hold(UUID, BOOLEAN, TEXT) TO authenticated;

-- Dispute holds: the close date is taken from the dispute; the hold is released 30 days after (the scheduler, or the console).
CREATE OR REPLACE FUNCTION public.privacy_release_due_holds()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  h RECORD;
  v_released INTEGER := 0;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    PERFORM public.privacy_require_console('privacy.approve');
  END IF;
  UPDATE public.privacy_legal_holds lh SET dispute_closed_at = COALESCE(d.resolved_at, now()),
         release_due_at = COALESCE(d.resolved_at, now()) + INTERVAL '30 days'
    FROM public.payment_disputes d
   WHERE lh.dispute_id = d.id AND lh.status = 'active' AND lh.dispute_closed_at IS NULL AND d.status NOT IN ('opened', 'under_review');
  FOR h IN SELECT id FROM public.privacy_legal_holds WHERE status = 'active' AND release_due_at IS NOT NULL AND release_due_at <= now() LOOP
    PERFORM public.privacy_release_hold_internal(h.id, 'Released 30 days after the payment dispute closed (Q2.5)');
    v_released := v_released + 1;
  END LOOP;
  RETURN jsonb_build_object('released', v_released);
END $$;
REVOKE ALL ON FUNCTION public.privacy_release_due_holds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privacy_release_due_holds() TO authenticated, service_role;

-- Holds, the review queue first, audited.
CREATE OR REPLACE FUNCTION public.admin_privacy_list_legal_holds(p_state TEXT DEFAULT 'active', p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_rows JSONB;
  v_ids UUID[];
BEGIN
  PERFORM public.gov2_require_read(ARRAY['privacy.manage', 'privacy.approve'], 'legal holds');
  IF p_state NOT IN ('active', 'pending_approval', 'closed') THEN RAISE EXCEPTION 'Unknown state' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(jsonb_agg((to_jsonb(h) - 'pseudonym_token') || jsonb_build_object('review_overdue', COALESCE(h.review_due_at < now(), FALSE))
                            ORDER BY h.review_due_at NULLS LAST, h.created_at), '[]'::jsonb),
         COALESCE(array_agg(h.subject_id), '{}')
    INTO v_rows, v_ids
    FROM (SELECT * FROM public.privacy_legal_holds
           WHERE CASE p_state WHEN 'closed' THEN status IN ('released', 'rejected', 'withdrawn') ELSE status = p_state END
           ORDER BY review_due_at NULLS LAST, created_at LIMIT v_limit OFFSET GREATEST(COALESCE(p_offset, 0), 0)) h;
  PERFORM public.gov2_log_read('privacy_legal_holds.listed', 'privacy_legal_holds', v_ids, ARRAY['basis', 'case_reference', 'categories'],
    'privacy_request', jsonb_build_object('state', p_state), jsonb_array_length(v_rows));
  RETURN jsonb_build_object('rows', v_rows,
    'review_overdue', (SELECT count(*) FROM public.privacy_legal_holds WHERE status = 'active' AND review_due_at < now()));
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_list_legal_holds(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_list_legal_holds(TEXT, INTEGER, INTEGER) TO authenticated;

-- Ledger figures for the console (no identifiers).
CREATE OR REPLACE FUNCTION public.admin_privacy_deletion_ledger_summary()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.gov2_require_read(ARRAY['privacy.manage', 'privacy.approve'], 'the deletion ledger');
  RETURN jsonb_build_object('entries', (SELECT count(*) FROM public.deletion_ledger),
    'auth_pending', (SELECT count(*) FROM public.privacy_requests WHERE status = 'executing' AND execution_state = 'erased_awaiting_auth'),
    'last_erased_at', (SELECT max(erased_at) FROM public.deletion_ledger),
    'last_reapplied_at', (SELECT max(last_reapplied_at) FROM public.deletion_ledger));
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_deletion_ledger_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_deletion_ledger_summary() TO authenticated;
