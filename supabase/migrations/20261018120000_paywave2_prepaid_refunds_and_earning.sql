-- PAY-WAVE2, red team RT-H2 and the prepaid half of M-09 (docs/reviews/2026-10-17-redteam-whole-stack.md).
--
-- A provider could cancel a customer's paid membership and keep all the money, and that money was payable at once: the
-- package_sale row of every membership and package counted in the provider's available balance from the moment of sale.
--   * Prepaid sales are linked to their purchase (transactional_ledger.purchase_type / purchase_id, frozen like the other
--     identity columns) and are payable only as they are earned (ledger_prepaid_earned_share): the share of the sessions or
--     visits delivered (a redemption whose booking is completed, or a package session recorded without a booking), everything
--     left once the membership or package has ended, never what an open refund or an open dispute holds. Payout releases and the
--     manual settlement pay nothing more. Gift cards were already a platform liability settled to the provider only when a
--     booking that used them is completed; this migration does not change them.
--   * Cancelling a paid membership refunds the customer in the same transaction through the refund queue
--     (create_purchase_refund_request_internal, sent to Tap by process-refund):
--       - the customer's own cancellation: the unused visits (amount x visits left / visits per period);
--       - a cancellation by the provider, or from the console: the greater of the unused visits and the unused time.
--     Both are owner decisions recorded as defaults (paywave2-membership-refund-rule); half a halala goes to the customer.
--   * A console session no longer cancels through cancel_membership. admin_cancel_membership needs step-up, operations.write and
--     a reason of 10 characters; when the refund is due and the caller lacks money.refund, or the refund is SAR 1,000 or more or
--     takes the caller past SAR 5,000 today (D-Q5), it becomes a 'membership_cancellation' request a different money.refund
--     holder approves. No break-glass.
--   * A refund after the provider was already paid for a prepaid sale books what the provider was paid beyond its remaining
--     share as a receivable.
--   * payment_disputes gains a purchase (membership or package) instead of a booking; the commands are in the next migration.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Prepaid sales name their purchase
-- ---------------------------------------------------------------------------------------------------------------------

ALTER TABLE public.transactional_ledger
  ADD COLUMN IF NOT EXISTS purchase_type TEXT,
  ADD COLUMN IF NOT EXISTS purchase_id UUID;
ALTER TABLE public.transactional_ledger DROP CONSTRAINT IF EXISTS transactional_ledger_purchase_link;
ALTER TABLE public.transactional_ledger ADD CONSTRAINT transactional_ledger_purchase_link CHECK (
  (purchase_type IS NULL AND purchase_id IS NULL)
  OR (purchase_type IN ('membership', 'package') AND purchase_id IS NOT NULL AND entry_type = 'package_sale'));

DO $backfill$
BEGIN
  PERFORM set_config('primora.ledger_system_write', 'on', true);
  UPDATE public.transactional_ledger tl SET purchase_type = 'membership', purchase_id = m.id
    FROM public.memberships m
   WHERE tl.entry_type = 'package_sale' AND tl.purchase_id IS NULL AND m.payment_intent_id = tl.payment_intent_id;
  UPDATE public.transactional_ledger tl SET purchase_type = 'package', purchase_id = up.id
    FROM public.user_packages up
   WHERE tl.entry_type = 'package_sale' AND tl.purchase_id IS NULL AND up.payment_intent_id = tl.payment_intent_id;
  PERFORM set_config('primora.ledger_system_write', '', true);
END
$backfill$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_purchase_sale ON public.transactional_ledger (purchase_type, purchase_id) WHERE purchase_id IS NOT NULL;

-- The link is identity: frozen like the booking and the payment reference.
DROP TRIGGER IF EXISTS trg_money_append_only ON public.transactional_ledger;
CREATE TRIGGER trg_money_append_only BEFORE DELETE OR UPDATE ON public.transactional_ledger
  FOR EACH ROW EXECUTE FUNCTION public.guard_money_append_only('ledger',
    'id,booking_id,payment_intent_id,total_captured,entry_type,provider_id,created_at,adjusts_entry_id,reverses_entry_id,reason_code,justification,maker_id,checker_id,approved_at,approval_request_id,break_glass,tap_object_id,funded_by,purchase_type,purchase_id');

ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS purchase_type TEXT,
  ADD COLUMN IF NOT EXISTS purchase_id UUID;
ALTER TABLE public.refund_requests DROP CONSTRAINT IF EXISTS refund_requests_purchase_link;
ALTER TABLE public.refund_requests ADD CONSTRAINT refund_requests_purchase_link CHECK (
  (purchase_type IS NULL AND purchase_id IS NULL) OR (purchase_type IN ('membership', 'package') AND purchase_id IS NOT NULL AND booking_id IS NULL));
CREATE INDEX IF NOT EXISTS idx_refund_requests_purchase ON public.refund_requests (purchase_type, purchase_id) WHERE purchase_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_money_append_only ON public.refund_requests;
CREATE TRIGGER trg_money_append_only BEFORE DELETE OR UPDATE ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_money_append_only('no_delete',
    'id,booking_id,ledger_id,payment_intent_id,amount,source,idempotency_key,created_at,purchase_type,purchase_id');

ALTER TABLE public.refund_requests DROP CONSTRAINT IF EXISTS refund_requests_source_check;
ALTER TABLE public.refund_requests ADD CONSTRAINT refund_requests_source_check CHECK (source IN (
  'customer_cancellation', 'provider_cancellation', 'no_show_remainder', 'dispute', 'admin', 'late_payment_conflict',
  'admin_cancellation', 'admin_no_show',
  'customer_membership_cancellation', 'provider_membership_cancellation', 'admin_membership_cancellation'));

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS refund_request_id UUID REFERENCES public.refund_requests(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS refund_rule TEXT;
ALTER TABLE public.memberships DROP CONSTRAINT IF EXISTS memberships_refund_rule_check;
ALTER TABLE public.memberships ADD CONSTRAINT memberships_refund_rule_check
  CHECK (refund_rule IS NULL OR refund_rule IN ('customer_unused_visits', 'greater_of_unused_visits_or_time'));

-- A dispute is about a booking, or about a purchase (membership or package) that has no booking.
ALTER TABLE public.payment_disputes
  ADD COLUMN IF NOT EXISTS purchase_type TEXT,
  ADD COLUMN IF NOT EXISTS purchase_id UUID;
ALTER TABLE public.payment_disputes ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE public.payment_disputes DROP CONSTRAINT IF EXISTS payment_disputes_subject;
ALTER TABLE public.payment_disputes ADD CONSTRAINT payment_disputes_subject CHECK (
  (booking_id IS NOT NULL AND purchase_type IS NULL AND purchase_id IS NULL)
  OR (booking_id IS NULL AND purchase_type IN ('membership', 'package') AND purchase_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_disputes_purchase ON public.payment_disputes (purchase_type, purchase_id) WHERE purchase_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_money_append_only ON public.payment_disputes;
CREATE TRIGGER trg_money_append_only BEFORE DELETE OR UPDATE ON public.payment_disputes
  FOR EACH ROW EXECUTE FUNCTION public.guard_money_append_only('no_delete',
    'id,booking_id,purchase_type,purchase_id,provider_id,charge_id,disputed_amount_sar,created_at');

ALTER TABLE public.admin_approval_requests DROP CONSTRAINT IF EXISTS admin_approval_requests_kind_check;
ALTER TABLE public.admin_approval_requests ADD CONSTRAINT admin_approval_requests_kind_check CHECK (kind IN (
  'payout_release', 'refund', 'iban_change', 'setting_change', 'ledger_settlement', 'ledger_adjustment', 'fee_rule_change',
  'payout_hold', 'reward_program', 'role_change', 'booking_cancellation', 'reconciliation_import', 'sponsored_price_change',
  'privacy_export', 'privacy_deletion', 'privacy_legal_hold', 'customer_profile_clear', 'privacy_legal_hold_release',
  'privacy_legal_hold_renewal', 'incident_aware_at_correction', 'privacy_retention_purge', 'refund_outcome', 'membership_cancellation'));

SELECT pg_temp.patch_function('public.governance_approver_permission(text)'::regprocedure,
$from$    WHEN 'refund_outcome' THEN 'money.refund'$from$,
$to$    WHEN 'refund_outcome' THEN 'money.refund'
    WHEN 'membership_cancellation' THEN 'money.refund'$to$);
SELECT pg_temp.patch_function('public.governance_execute(uuid)'::regprocedure,
$from$                       'refund_outcome') THEN$from$,
$to$                       'refund_outcome', 'membership_cancellation') THEN$to$);

-- The daily cumulative refund cap counts console membership cancellations and the ones waiting for a second person.
SELECT pg_temp.patch_function('public.refund_needs_approval(numeric)'::regprocedure,
$from$rr.source IN ('admin', 'dispute', 'admin_cancellation', 'admin_no_show')$from$,
$to$rr.source IN ('admin', 'dispute', 'admin_cancellation', 'admin_no_show', 'admin_membership_cancellation')$to$);
SELECT pg_temp.patch_function('public.refund_needs_approval(numeric)'::regprocedure,
$from$ar.kind IN ('refund', 'booking_cancellation')$from$,
$to$ar.kind IN ('refund', 'booking_cancellation', 'membership_cancellation')$to$);

-- The purchase confirmations write the link.
SELECT pg_temp.patch_function('public.confirm_membership_payment(uuid,text,numeric)'::regprocedure,
$from$  INSERT INTO public.transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id,
                                           total_captured, platform_share, provider_share, payout_status)
  VALUES (NULL, v_row.provider_id, 'package_sale', p_payment_intent_id, p_amount, 0, p_amount, 'pending');$from$,
$to$  -- RT-H2: the provider earns it visit by visit (ledger_prepaid_earned_share), not at the sale.
  INSERT INTO public.transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id,
                                           total_captured, platform_share, provider_share, payout_status, purchase_type, purchase_id)
  VALUES (NULL, v_row.provider_id, 'package_sale', p_payment_intent_id, p_amount, 0, p_amount, 'pending', 'membership', v_row.id);$to$);
SELECT pg_temp.patch_function('public.confirm_purchase_payment(text,uuid,text,numeric)'::regprocedure,
$from$    INSERT INTO public.transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id,
                                             total_captured, platform_share, provider_share, payout_status)
    VALUES (NULL, v_pack.provider_id, 'package_sale', p_payment_intent_id, p_amount, 0, p_amount, 'pending');$from$,
$to$    -- RT-H2: the provider earns it session by session (ledger_prepaid_earned_share), not at the sale.
    INSERT INTO public.transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id,
                                             total_captured, platform_share, provider_share, payout_status, purchase_type, purchase_id)
    VALUES (NULL, v_pack.provider_id, 'package_sale', p_payment_intent_id, p_amount, 0, p_amount, 'pending', 'package', v_pack.id);$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Prepaid value is payable as it is earned
-- ---------------------------------------------------------------------------------------------------------------------

-- The part of a prepaid sale's provider share that is earned now, before what was already paid out. A ledger row without a
-- purchase link keeps the earlier rule (all of its share); the purchase confirmations always write the link.
CREATE OR REPLACE FUNCTION public.ledger_prepaid_earned_share(p_entry public.transactional_ledger)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open NUMERIC(10,2);
  v_cap NUMERIC(10,2);
  v_membership public.memberships;
  v_package public.user_packages;
  v_total INTEGER;
  v_delivered INTEGER;
BEGIN
  IF p_entry.purchase_id IS NULL THEN
    RETURN p_entry.provider_share;
  END IF;
  -- An open dispute holds the whole remainder until it is decided.
  IF EXISTS (SELECT 1 FROM public.payment_disputes d
              WHERE d.purchase_type = p_entry.purchase_type AND d.purchase_id = p_entry.purchase_id AND d.status IN ('opened', 'under_review')) THEN
    RETURN 0;
  END IF;
  -- Money an open refund may still return to the customer is never the provider's.
  SELECT COALESCE(SUM(r.amount), 0) INTO v_open FROM public.refund_requests r
   WHERE r.ledger_id = p_entry.id AND r.status IN ('pending', 'processing', 'unknown', 'failed');
  v_cap := GREATEST(p_entry.provider_share - v_open, 0);

  IF p_entry.purchase_type = 'membership' THEN
    SELECT * INTO v_membership FROM public.memberships WHERE id = p_entry.purchase_id;
    IF v_membership.id IS NULL THEN
      RETURN 0;
    END IF;
    IF v_membership.status IN ('expired', 'cancelled') OR (v_membership.status = 'active' AND v_membership.period_end <= now()) THEN
      RETURN v_cap;
    END IF;
    v_total := v_membership.visits_per_period;
    SELECT count(*)::int INTO v_delivered
      FROM public.membership_redemptions mr JOIN public.bookings b ON b.id = mr.booking_id
     WHERE mr.membership_id = v_membership.id AND mr.voided_at IS NULL AND b.status = 'completed';
  ELSE
    SELECT * INTO v_package FROM public.user_packages WHERE id = p_entry.purchase_id;
    IF v_package.id IS NULL THEN
      RETURN 0;
    END IF;
    IF v_package.status IN ('expired', 'cancelled') OR (v_package.expires_at IS NOT NULL AND v_package.expires_at <= now()) THEN
      RETURN v_cap;
    END IF;
    v_total := v_package.session_count;
    -- A session recorded without a booking was given in person when it was recorded.
    SELECT count(*)::int INTO v_delivered
      FROM public.package_redemptions pr LEFT JOIN public.bookings b ON b.id = pr.booking_id
     WHERE pr.user_package_id = v_package.id AND pr.reversed_at IS NULL AND (pr.booking_id IS NULL OR b.status = 'completed');
  END IF;
  IF v_total IS NULL OR v_total <= 0 THEN
    RETURN 0;
  END IF;
  RETURN LEAST(v_cap, ROUND(p_entry.total_captured * LEAST(v_delivered, v_total)::numeric / v_total, 2));
END;
$$;
REVOKE ALL ON FUNCTION public.ledger_prepaid_earned_share(public.transactional_ledger) FROM PUBLIC, anon, authenticated, service_role;

-- What a payable row can still pay out. Booking and other rows keep the earlier formula exactly; a prepaid sale pays its earned
-- share less what it already paid, never below zero (a refund after payout is a receivable instead).
CREATE OR REPLACE FUNCTION public.ledger_entry_open_amount(p_entry public.transactional_ledger)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_entry.purchase_id IS NULL THEN p_entry.provider_share - v.allocated
    ELSE GREATEST(public.ledger_prepaid_earned_share(p_entry) - v.allocated, 0)
  END
  FROM (SELECT COALESCE((SELECT SUM(pa.amount) FROM public.payout_allocations pa WHERE pa.ledger_id = p_entry.id), 0) AS allocated) v;
$$;
REVOKE ALL ON FUNCTION public.ledger_entry_open_amount(public.transactional_ledger) FROM PUBLIC, anon, authenticated, service_role;

SELECT pg_temp.patch_function('public.provider_available_balance(uuid)'::regprocedure,
$from$      SELECT SUM(tl.provider_share - COALESCE((SELECT SUM(pa.amount) FROM public.payout_allocations pa WHERE pa.ledger_id = tl.id), 0))
      FROM public.transactional_ledger tl$from$,
$to$      SELECT SUM(public.ledger_entry_open_amount(tl))
      FROM public.transactional_ledger tl$to$);

SELECT pg_temp.patch_function('public.admin_release_payout(uuid,text,text,text)'::regprocedure,
$from$    SELECT tl.id, tl.provider_share - COALESCE((SELECT SUM(pa.amount) FROM public.payout_allocations pa WHERE pa.ledger_id = tl.id), 0) AS open_amount
    FROM public.transactional_ledger tl$from$,
$to$    SELECT tl.id, public.ledger_entry_open_amount(tl) AS open_amount, tl.purchase_id, tl.provider_share,
           COALESCE((SELECT SUM(pa.amount) FROM public.payout_allocations pa WHERE pa.ledger_id = tl.id), 0) AS allocated
    FROM public.transactional_ledger tl$to$);
SELECT pg_temp.patch_function('public.admin_release_payout(uuid,text,text,text)'::regprocedure,
$from$    IF v_take = v_row.open_amount THEN
      UPDATE public.transactional_ledger SET payout_status = 'released', payout_request_id = v_request.id WHERE id = v_row.id;
    END IF;$from$,
$to$    -- A prepaid sale is released only once all of its share is paid; until then the rest is earned visit by visit.
    IF v_take = v_row.open_amount AND (v_row.purchase_id IS NULL OR v_row.allocated + v_take >= v_row.provider_share) THEN
      UPDATE public.transactional_ledger SET payout_status = 'released', payout_request_id = v_request.id WHERE id = v_row.id;
    END IF;$to$);

-- The manual (bank transfer) settlement pays only what is earned: a booking after its visit, a prepaid sale once fully earned.
SELECT pg_temp.patch_function('public.admin_release_ledger_item(uuid,text,text,text)'::regprocedure,
$from$  IF EXISTS (SELECT 1 FROM public.payout_allocations WHERE ledger_id = p_ledger_id) THEN
    RAISE EXCEPTION 'This row is partly allocated to a payout; release it through the payout request' USING ERRCODE = '22023';
  END IF;$from$,
$to$  IF EXISTS (SELECT 1 FROM public.payout_allocations WHERE ledger_id = p_ledger_id) THEN
    RAISE EXCEPTION 'This row is partly allocated to a payout; release it through the payout request' USING ERRCODE = '22023';
  END IF;
  IF NOT public.ledger_entry_payable(v_row.entry_type, v_row.booking_id) THEN
    RAISE EXCEPTION 'This entry is not earned yet: the visit has not been completed' USING ERRCODE = '22023', HINT = 'not_earned';
  END IF;
  IF v_row.purchase_id IS NOT NULL AND public.ledger_prepaid_earned_share(v_row) < v_row.provider_share THEN
    RAISE EXCEPTION 'This prepaid sale is not fully earned yet (SAR % of SAR %); it is paid visit by visit through payout requests',
      public.ledger_prepaid_earned_share(v_row), v_row.provider_share USING ERRCODE = '22023', HINT = 'not_earned';
  END IF;$to$);

-- A refund on a prepaid sale after the provider was paid: the provider owes back what it was paid beyond its share after the refund.
SELECT pg_temp.patch_function('public.complete_refund_request(uuid,boolean,text,text)'::regprocedure,
$from$    v_receivable := LEAST(
      GREATEST(v_paid_out - COALESCE((SELECT SUM(rc.amount) FROM public.provider_receivables rc WHERE rc.ledger_id = v_refund.ledger_id), 0), 0),
      ROUND(v_paid_out * v_refund.amount / v_ledger_row.total_captured, 2));$from$,
$to$    v_receivable := CASE WHEN v_ledger_row.purchase_id IS NOT NULL THEN
        GREATEST(v_paid_out - GREATEST(v_ledger_row.provider_share - v_refund.amount, 0)
                 - COALESCE((SELECT SUM(rc.amount) FROM public.provider_receivables rc WHERE rc.ledger_id = v_refund.ledger_id), 0), 0)
      ELSE LEAST(
        GREATEST(v_paid_out - COALESCE((SELECT SUM(rc.amount) FROM public.provider_receivables rc WHERE rc.ledger_id = v_refund.ledger_id), 0), 0),
        ROUND(v_paid_out * v_refund.amount / v_ledger_row.total_captured, 2)) END;$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Refunds of a purchase
-- ---------------------------------------------------------------------------------------------------------------------

-- The purchase refund counterpart of create_refund_request_internal: idempotent by key, never more than what is captured and not
-- already owed (pending, in progress, unknown at Tap or failed and waiting to be retried).
CREATE OR REPLACE FUNCTION public.create_purchase_refund_request_internal(p_purchase_type TEXT, p_purchase_id UUID, p_amount NUMERIC,
                                                                          p_source TEXT, p_reason TEXT, p_idempotency_key TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger public.transactional_ledger;
  v_open NUMERIC(10,2);
  v_amount NUMERIC(10,2);
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.refund_requests WHERE idempotency_key = p_idempotency_key;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  SELECT * INTO v_ledger FROM public.transactional_ledger
   WHERE purchase_type = p_purchase_type AND purchase_id = p_purchase_id AND entry_type = 'package_sale'
   FOR UPDATE;
  IF v_ledger.id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_open FROM public.refund_requests
   WHERE ledger_id = v_ledger.id AND status IN ('pending', 'processing', 'unknown', 'failed');
  v_amount := LEAST(ROUND(COALESCE(p_amount, 0), 2), v_ledger.total_captured - v_ledger.refunded_amount - v_open);
  IF v_amount <= 0 THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.refund_requests (booking_id, ledger_id, payment_intent_id, amount, reason, source, idempotency_key, requested_by,
                                      purchase_type, purchase_id)
  VALUES (NULL, v_ledger.id, v_ledger.payment_intent_id, v_amount, left(COALESCE(p_reason, ''), 500), p_source, p_idempotency_key, auth.uid(),
          p_purchase_type, p_purchase_id)
  RETURNING id INTO v_id;
  PERFORM public.write_audit_log('refund.requested', 'refund_requests', v_id,
    jsonb_build_object('purchase_type', p_purchase_type, 'purchase_id', p_purchase_id, 'amount', v_amount, 'source', p_source));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_purchase_refund_request_internal(TEXT, UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_refund_request_internal(TEXT, UUID, NUMERIC, TEXT, TEXT, TEXT) TO service_role;

-- What a cancellation now gives back. 'customer': the unused visits. 'provider' (also the console): the greater of the unused
-- visits and the unused time. Nothing once the period is over. Rounded to the halala, half up (in the customer's favour).
CREATE OR REPLACE FUNCTION public.membership_refund_quote(p_membership public.memberships, p_rule TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_visits NUMERIC;
  v_time NUMERIC;
  v_fraction NUMERIC;
BEGIN
  IF p_rule IS NULL OR p_rule NOT IN ('customer', 'provider') THEN
    RAISE EXCEPTION 'Unknown refund rule %', p_rule USING ERRCODE = '22023';
  END IF;
  IF p_membership.status <> 'active' OR p_membership.paid_at IS NULL OR p_membership.period_end IS NULL OR now() >= p_membership.period_end THEN
    RETURN 0;
  END IF;
  v_visits := p_membership.visits_remaining::numeric / p_membership.visits_per_period;
  v_time := CASE
    WHEN now() <= p_membership.period_start THEN 1
    ELSE EXTRACT(EPOCH FROM (p_membership.period_end - now()))
         / NULLIF(EXTRACT(EPOCH FROM (p_membership.period_end - p_membership.period_start)), 0)
  END;
  v_fraction := CASE WHEN p_rule = 'customer' THEN v_visits ELSE GREATEST(v_visits, COALESCE(v_time, 0)) END;
  RETURN ROUND(p_membership.amount_due * LEAST(GREATEST(v_fraction, 0), 1), 2);
END;
$$;
REVOKE ALL ON FUNCTION public.membership_refund_quote(public.memberships, TEXT) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Cancelling a paid membership refunds the customer
-- ---------------------------------------------------------------------------------------------------------------------

SELECT pg_temp.patch_function('public.cancel_membership(uuid,text)'::regprocedure,
$from$  v_row public.memberships;
BEGIN$from$,
$to$  v_row public.memberships;
  v_console BOOLEAN;
  v_by TEXT;
  v_rule TEXT;
  v_refund_amount NUMERIC(10,2) := 0;
  v_refund_id UUID;
BEGIN$to$);
SELECT pg_temp.patch_function('public.cancel_membership(uuid,text)'::regprocedure,
$from$  IF NOT (v_row.customer_id = v_user OR public.admin_can('operations.write')
          OR EXISTS (SELECT 1 FROM public.providers WHERE id = v_row.provider_id AND owner_id = v_user)) THEN$from$,
$to$  -- RT-H2: a console session cancels through admin_cancel_membership (step-up, reason, refund approval rules).
  v_console := COALESCE(current_setting('primora.console_membership_cancellation', true), '') = v_row.id::text;
  IF NOT v_console AND public.is_admin() AND v_row.customer_id IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'A console cancellation goes through admin_cancel_membership, which applies the refund approval rules'
      USING ERRCODE = '42501', HINT = 'use_admin_cancel_membership';
  END IF;
  IF NOT (v_row.customer_id = v_user OR v_console
          OR EXISTS (SELECT 1 FROM public.providers WHERE id = v_row.provider_id AND owner_id = v_user)) THEN$to$);
SELECT pg_temp.patch_function('public.cancel_membership(uuid,text)'::regprocedure,
$from$  IF v_row.status NOT IN ('pending_payment', 'active') THEN
    RAISE EXCEPTION 'This membership has already ended' USING ERRCODE = '22023';
  END IF;
  -- Cancelling never moves money: a refund of a paid membership goes through the existing refund process.
  UPDATE public.memberships
     SET status = 'cancelled', cancelled_at = now(), cancelled_by = v_user, cancel_reason = btrim(p_reason), updated_at = now()
   WHERE id = v_row.id;
  PERFORM public.write_audit_log('membership.cancelled', 'memberships', v_row.id,
    jsonb_build_object('previous_status', v_row.status, 'visits_forfeited', v_row.visits_remaining, 'by_customer', v_row.customer_id = v_user));
  RETURN jsonb_build_object('success', TRUE, 'membership_id', v_row.id, 'status', 'cancelled', 'previous_status', v_row.status);$from$,
$to$  IF v_row.status NOT IN ('pending_payment', 'active') OR (v_row.status = 'active' AND v_row.period_end <= now()) THEN
    RAISE EXCEPTION 'This membership has already ended' USING ERRCODE = '22023';
  END IF;
  -- RT-H2: cancelling a paid membership refunds the customer in the same transaction, through the refund queue (process-refund
  -- sends it to Tap, to the original payment method). The customer's own cancellation returns the unused visits; a cancellation
  -- by the provider or from the console returns the greater of the unused visits and the unused time (owner decision
  -- paywave2-membership-refund-rule).
  v_by := CASE WHEN v_console THEN 'console' WHEN v_row.customer_id = v_user THEN 'customer' ELSE 'provider' END;
  IF v_row.status = 'active' THEN
    v_rule := CASE WHEN v_by = 'customer' THEN 'customer_unused_visits' ELSE 'greater_of_unused_visits_or_time' END;
    v_refund_amount := public.membership_refund_quote(v_row, CASE WHEN v_by = 'customer' THEN 'customer' ELSE 'provider' END);
    IF v_refund_amount > 0 THEN
      v_refund_id := public.create_purchase_refund_request_internal('membership', v_row.id, v_refund_amount,
        CASE v_by WHEN 'customer' THEN 'customer_membership_cancellation' WHEN 'console' THEN 'admin_membership_cancellation'
                  ELSE 'provider_membership_cancellation' END,
        'Membership cancelled: ' || btrim(p_reason), 'mcancel:' || v_row.id::text);
    END IF;
    v_refund_amount := COALESCE((SELECT rr.amount FROM public.refund_requests rr WHERE rr.id = v_refund_id), 0);
  END IF;
  UPDATE public.memberships
     SET status = 'cancelled', cancelled_at = now(), cancelled_by = v_user, cancel_reason = btrim(p_reason), updated_at = now(),
         refund_request_id = v_refund_id, refund_amount = CASE WHEN v_row.status = 'active' THEN v_refund_amount END, refund_rule = v_rule
   WHERE id = v_row.id;
  IF v_row.status = 'active' AND v_row.customer_id IS NOT NULL AND (v_by <> 'customer' OR v_refund_amount > 0) THEN
    INSERT INTO public.notifications (user_id, title_en, title_ar, body_en, body_ar, type, data)
    VALUES (v_row.customer_id,
            CASE WHEN v_by = 'customer' THEN 'Membership cancelled' ELSE 'Your membership was cancelled' END,
            CASE WHEN v_by = 'customer' THEN 'تم إلغاء العضوية' ELSE 'أُلغيت عضويتك' END,
            CASE WHEN v_by = 'customer' THEN 'Your membership ' || v_row.plan_name_en || ' is cancelled.'
                 ELSE 'The salon cancelled your membership ' || v_row.plan_name_en || '.' END
              || CASE WHEN v_refund_amount > 0 THEN ' SAR ' || to_char(v_refund_amount, 'FM999999990.00')
                        || ' is being refunded to your original payment method.' ELSE '' END,
            CASE WHEN v_by = 'customer' THEN 'أُلغيت عضويتك ' || v_row.plan_name_ar || '.'
                 ELSE 'ألغى الصالون عضويتك ' || v_row.plan_name_ar || '.' END
              || CASE WHEN v_refund_amount > 0 THEN ' يُعاد إليك مبلغ ' || to_char(v_refund_amount, 'FM999999990.00')
                        || ' ر.س إلى وسيلة الدفع الأصلية.' ELSE '' END,
            'membership', jsonb_build_object('membership_id', v_row.id, 'refund_request_id', v_refund_id, 'refund_amount', v_refund_amount));
  END IF;
  PERFORM public.write_audit_log('membership.cancelled', 'memberships', v_row.id,
    jsonb_build_object('previous_status', v_row.status, 'visits_forfeited', v_row.visits_remaining, 'by_customer', v_row.customer_id = v_user,
                       'cancelled_by', v_by, 'refund_rule', v_rule, 'refund_amount', v_refund_amount, 'refund_request_id', v_refund_id));
  RETURN jsonb_build_object('success', TRUE, 'membership_id', v_row.id, 'status', 'cancelled', 'previous_status', v_row.status,
                            'refund_amount', v_refund_amount, 'refund_request_id', v_refund_id, 'refund_rule', v_rule);$to$);

-- What cancelling would give back now, for the caller's role (the customer, the provider owner or the console). Reads nothing
-- personal; a console read is audited.
CREATE OR REPLACE FUNCTION public.preview_membership_cancellation(p_membership_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_row public.memberships;
  v_by TEXT;
  v_amount NUMERIC(10,2) := 0;
  v_ledger public.transactional_ledger;
  v_open NUMERIC(10,2);
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_row FROM public.memberships WHERE id = p_membership_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Membership not found' USING ERRCODE = 'P0002'; END IF;
  v_by := CASE
    WHEN v_row.customer_id = v_user THEN 'customer'
    WHEN EXISTS (SELECT 1 FROM public.providers WHERE id = v_row.provider_id AND owner_id = v_user) THEN 'provider'
    WHEN public.admin_can('operations.write') OR public.admin_can('money.refund') THEN 'console'
  END;
  IF v_by IS NULL THEN RAISE EXCEPTION 'Membership not found' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status = 'active' THEN
    SELECT * INTO v_ledger FROM public.transactional_ledger
     WHERE purchase_type = 'membership' AND purchase_id = v_row.id AND entry_type = 'package_sale';
    SELECT COALESCE(SUM(amount), 0) INTO v_open FROM public.refund_requests
     WHERE ledger_id = v_ledger.id AND status IN ('pending', 'processing', 'unknown', 'failed');
    v_amount := LEAST(public.membership_refund_quote(v_row, CASE WHEN v_by = 'customer' THEN 'customer' ELSE 'provider' END),
                      GREATEST(COALESCE(v_ledger.total_captured - v_ledger.refunded_amount - v_open, 0), 0));
  END IF;
  IF v_by = 'console' THEN
    PERFORM public.write_audit_log('membership.cancellation_previewed', 'memberships', v_row.id,
      jsonb_build_object('refund_amount', v_amount, 'status', v_row.status));
  END IF;
  RETURN jsonb_build_object('membership_id', v_row.id, 'status', v_row.status, 'cancelled_by', v_by,
    'refund_rule', CASE WHEN v_row.status <> 'active' THEN NULL WHEN v_by = 'customer' THEN 'customer_unused_visits' ELSE 'greater_of_unused_visits_or_time' END,
    'refund_amount', v_amount, 'amount_paid', v_row.amount_due, 'visits_remaining', v_row.visits_remaining,
    'visits_per_period', v_row.visits_per_period, 'period_end', v_row.period_end,
    'ended', v_row.status NOT IN ('pending_payment', 'active') OR (v_row.status = 'active' AND v_row.period_end <= now()));
END;
$$;
REVOKE ALL ON FUNCTION public.preview_membership_cancellation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_membership_cancellation(UUID) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. A console cancellation applies the refund approval rules
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_cancel_membership(p_membership_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_row public.memberships;
  v_ledger public.transactional_ledger;
  v_open NUMERIC(10,2);
  v_refund NUMERIC(10,2) := 0;
  v_executing BOOLEAN := public.governance_execution_active('membership_cancellation', p_membership_id);
  v_approval UUID := NULLIF(current_setting('primora.governance_approval', true), '')::uuid;
  v_approved NUMERIC;
  v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.require_recent_mfa();
  IF NOT v_executing AND NOT public.admin_can('operations.write') THEN
    RAISE EXCEPTION 'Your console role cannot change memberships' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.memberships WHERE id = p_membership_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Membership not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', TRUE, 'membership_id', v_row.id, 'status', 'cancelled', 'replayed', TRUE);
  END IF;
  IF v_row.status NOT IN ('pending_payment', 'active') OR (v_row.status = 'active' AND v_row.period_end <= now()) THEN
    RAISE EXCEPTION 'This membership has already ended' USING ERRCODE = '22023';
  END IF;
  IF v_row.status = 'active' THEN
    SELECT * INTO v_ledger FROM public.transactional_ledger
     WHERE purchase_type = 'membership' AND purchase_id = v_row.id AND entry_type = 'package_sale';
    SELECT COALESCE(SUM(amount), 0) INTO v_open FROM public.refund_requests
     WHERE ledger_id = v_ledger.id AND status IN ('pending', 'processing', 'unknown', 'failed');
    v_refund := LEAST(public.membership_refund_quote(v_row, 'provider'),
                      GREATEST(COALESCE(v_ledger.total_captured - v_ledger.refunded_amount - v_open, 0), 0));
  END IF;

  IF v_refund > 0 AND NOT v_executing AND (NOT public.admin_can('money.refund') OR public.refund_needs_approval(v_refund)) THEN
    RETURN public.governance_request('membership_cancellation', 'memberships', v_row.id, v_refund,
      jsonb_build_object('reason', v_reason, 'refund_amount', v_refund),
      v_reason,
      jsonb_build_object('membership_id', v_row.id, 'provider_id', v_row.provider_id, 'plan_name_en', v_row.plan_name_en,
                         'plan_name_ar', v_row.plan_name_ar, 'refund_amount', v_refund, 'amount_paid', v_row.amount_due,
                         'visits_remaining', v_row.visits_remaining, 'visits_per_period', v_row.visits_per_period,
                         'period_end', v_row.period_end, 'status_before', v_row.status))
      || jsonb_build_object('refund_amount', v_refund);
  END IF;
  IF v_executing THEN
    SELECT amount_sar INTO v_approved FROM public.admin_approval_requests WHERE id = v_approval;
    IF v_refund > COALESCE(v_approved, 0) THEN
      RAISE EXCEPTION 'The refund grew to SAR % since SAR % was approved; ask again', v_refund, v_approved USING ERRCODE = '22023';
    END IF;
  END IF;

  PERFORM set_config('primora.audit_reason', v_reason, true);
  PERFORM set_config('primora.console_membership_cancellation', v_row.id::text, true);
  v_result := public.cancel_membership(v_row.id, v_reason);
  PERFORM set_config('primora.console_membership_cancellation', '', true);
  PERFORM public.write_audit_log('membership.console_cancelled', 'memberships', v_row.id,
    jsonb_build_object('reason', v_reason, 'refund_amount', v_result->'refund_amount', 'refund_request_id', v_result->'refund_request_id',
                       'approval_request_id', v_approval, 'console_role', public.admin_role()) || public.request_client_info());
  RETURN v_result || jsonb_build_object('approval_request_id', v_approval);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_cancel_membership(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_membership(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.gov_exec_membership_cancellation(p_req public.admin_approval_requests)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.governance_execution_active('membership_cancellation', p_req.target_id) THEN
    RAISE EXCEPTION 'A console membership cancellation with a refund runs only as an approved request' USING ERRCODE = '42501';
  END IF;
  RETURN public.admin_cancel_membership(p_req.target_id, p_req.payload->>'reason');
END;
$$;
REVOKE ALL ON FUNCTION public.gov_exec_membership_cancellation(public.admin_approval_requests) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. The customer sees the refunds of their own purchases
-- ---------------------------------------------------------------------------------------------------------------------

-- Whether the caller bought the purchase (answers nothing about anyone else's).
CREATE OR REPLACE FUNCTION public.purchase_belongs_to_caller(p_purchase_type TEXT, p_purchase_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND CASE p_purchase_type
    WHEN 'membership' THEN EXISTS (SELECT 1 FROM public.memberships m WHERE m.id = p_purchase_id AND m.customer_id = auth.uid())
    WHEN 'package' THEN EXISTS (SELECT 1 FROM public.user_packages up WHERE up.id = p_purchase_id AND up.customer_id = auth.uid())
    ELSE FALSE
  END;
$$;
REVOKE ALL ON FUNCTION public.purchase_belongs_to_caller(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_belongs_to_caller(TEXT, UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "Customers read own purchase refund requests" ON public.refund_requests;
CREATE POLICY "Customers read own purchase refund requests" ON public.refund_requests FOR SELECT TO authenticated
  USING (purchase_id IS NOT NULL AND public.purchase_belongs_to_caller(purchase_type, purchase_id));

-- The refunds console names the purchase a refund belongs to.
SELECT pg_temp.patch_function('public.admin_list_refund_requests(text,integer,integer,text)'::regprocedure,
$from$             rr.gateway_refund_id, rr.gateway_status, rr.tap_checks,$from$,
$to$             rr.purchase_type, rr.purchase_id, rr.gateway_refund_id, rr.gateway_status, rr.tap_checks,$to$);
