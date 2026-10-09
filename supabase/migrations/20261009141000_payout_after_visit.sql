-- M-09 of docs/reviews/2026-10-08-security-money.md.
--
-- 1. The provider share of a booking payment (the deposit) became withdrawable the moment the customer paid, for a visit that had not happened.
--    A booking_payment ledger row now counts toward the available balance, and is allocated by a payout release, only once the booking is
--    completed. Other entry types are unchanged (tips follow a completed booking; package, gift card and subscription sales have no visit: whether
--    they need a holding period is an owner decision recorded in the report). No payout hold period exists in platform_settings, so none is applied.
--
-- 2. When a refund is paid to the customer after the provider share of that payment was already paid out (a provider cancellation after release, a
--    dispute), claim_refund_request used to fail the refund for ever ("already_paid_out"). The customer is refunded; the share that was paid out
--    becomes a receivable of the provider (provider_receivables), booked when the refund actually succeeds. The available balance is reduced by open
--    receivables, so a provider with a receivable cannot withdraw until its earnings cover it, and the next payout release recovers the open
--    receivables (the release consumes the requested amount plus the receivables from the ledger rows; they are marked settled).

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

CREATE TABLE IF NOT EXISTS public.provider_receivables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE RESTRICT,
  ledger_id UUID NOT NULL REFERENCES public.transactional_ledger(id) ON DELETE RESTRICT,
  refund_request_id UUID NOT NULL UNIQUE REFERENCES public.refund_requests(id) ON DELETE RESTRICT,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled')),
  settled_payout_request_id UUID REFERENCES public.payout_requests(id) ON DELETE SET NULL,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_provider_receivables_open ON public.provider_receivables (provider_id) WHERE status = 'open';
ALTER TABLE public.provider_receivables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Provider owners and administrators read receivables" ON public.provider_receivables;
CREATE POLICY "Provider owners and administrators read receivables" ON public.provider_receivables FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_receivables.provider_id AND p.owner_id = auth.uid()));

-- Payable ledger rows: a booking payment only after the visit was performed.
CREATE OR REPLACE FUNCTION public.ledger_entry_payable(p_entry_type TEXT, p_booking_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT p_entry_type <> 'booking_payment' OR p_booking_id IS NULL
         OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = p_booking_id AND b.status = 'completed');
$fn$;
REVOKE ALL ON FUNCTION public.ledger_entry_payable(TEXT, UUID) FROM PUBLIC, anon, authenticated;

SELECT pg_temp.patch_function('public.provider_available_balance(uuid)'::regprocedure,
$from$      WHERE tl.provider_id = p_provider_id AND tl.payout_status = 'pending'
    ), 0)$from$,
$to$      WHERE tl.provider_id = p_provider_id AND tl.payout_status = 'pending'
        AND public.ledger_entry_payable(tl.entry_type, tl.booking_id)
    ), 0)$to$);

SELECT pg_temp.patch_function('public.provider_available_balance(uuid)'::regprocedure,
$from$      WHERE pr.provider_id = p_provider_id AND pr.status IN ('requested', 'processing')
    ), 0);$from$,
$to$      WHERE pr.provider_id = p_provider_id AND pr.status IN ('requested', 'processing')
    ), 0)
    - COALESCE((
      SELECT SUM(rc.amount) FROM public.provider_receivables rc
      WHERE rc.provider_id = p_provider_id AND rc.status = 'open'
    ), 0);$to$);

SELECT pg_temp.patch_function('public.admin_release_payout(uuid, text, text, text)'::regprocedure,
$from$  v_rows INT := 0;$from$,
$to$  v_rows INT := 0;
  v_recovered NUMERIC(10,2) := 0;$to$);

SELECT pg_temp.patch_function('public.admin_release_payout(uuid, text, text, text)'::regprocedure,
$from$  v_remaining := v_request.amount;$from$,
$to$  -- Open receivables of the provider (refunds paid after an earlier payout) are recovered from the ledger rows together with this payout.
  SELECT COALESCE(SUM(rc.amount), 0) INTO v_recovered
  FROM public.provider_receivables rc WHERE rc.provider_id = v_request.provider_id AND rc.status = 'open';
  v_remaining := v_request.amount + v_recovered;$to$);

SELECT pg_temp.patch_function('public.admin_release_payout(uuid, text, text, text)'::regprocedure,
$from$    WHERE tl.provider_id = v_request.provider_id AND tl.payout_status = 'pending'
    ORDER BY tl.created_at, tl.id$from$,
$to$    WHERE tl.provider_id = v_request.provider_id AND tl.payout_status = 'pending'
      AND public.ledger_entry_payable(tl.entry_type, tl.booking_id)
    ORDER BY tl.created_at, tl.id$to$);

SELECT pg_temp.patch_function('public.admin_release_payout(uuid, text, text, text)'::regprocedure,
$from$  UPDATE public.payout_requests
  SET status = 'paid', processed_at = now(), processed_by = auth.uid(),$from$,
$to$  UPDATE public.provider_receivables
  SET status = 'settled', settled_payout_request_id = v_request.id, settled_at = now()
  WHERE provider_id = v_request.provider_id AND status = 'open';

  UPDATE public.payout_requests
  SET status = 'paid', processed_at = now(), processed_by = auth.uid(),$to$);

-- A refund after payout is no longer refused: the customer is refunded and the paid-out share becomes a receivable (booked when the refund succeeds).
SELECT pg_temp.patch_function('public.claim_refund_request(uuid)'::regprocedure,
$from$  IF v_ledger.payout_status IN ('released', 'paid') THEN
    UPDATE public.refund_requests
    SET status = 'failed', error_message = 'Funds were already paid out to the provider; recover manually before refunding'
    WHERE id = v_refund.id;
    RETURN jsonb_build_object('claimed', FALSE, 'reason', 'already_paid_out');
  END IF;$from$,
$to$  -- A share already paid out to the provider does not stop the refund: complete_refund_request books it as a receivable of the provider.$to$);

SELECT pg_temp.patch_function('public.complete_refund_request(uuid, boolean, text, text)'::regprocedure,
$from$  v_booking_status public.booking_status;
BEGIN$from$,
$to$  v_booking_status public.booking_status;
  v_ledger_row public.transactional_ledger;
  v_paid_out NUMERIC(10,2);
  v_receivable NUMERIC(10,2);
BEGIN$to$);

SELECT pg_temp.patch_function('public.complete_refund_request(uuid, boolean, text, text)'::regprocedure,
$from$  UPDATE public.transactional_ledger SET refunded_amount = refunded_amount + v_refund.amount WHERE id = v_refund.ledger_id;
$from$,
$to$  UPDATE public.transactional_ledger SET refunded_amount = refunded_amount + v_refund.amount WHERE id = v_refund.ledger_id;

  -- The part of this refund that the provider has already been paid is owed back by the provider (capped by what was paid out for this row).
  SELECT * INTO v_ledger_row FROM public.transactional_ledger WHERE id = v_refund.ledger_id;
  SELECT COALESCE(SUM(pa.amount), 0) INTO v_paid_out FROM public.payout_allocations pa WHERE pa.ledger_id = v_refund.ledger_id;
  IF v_ledger_row.provider_id IS NOT NULL AND v_paid_out > 0 AND v_ledger_row.total_captured > 0 THEN
    v_receivable := LEAST(
      GREATEST(v_paid_out - COALESCE((SELECT SUM(rc.amount) FROM public.provider_receivables rc WHERE rc.ledger_id = v_refund.ledger_id), 0), 0),
      ROUND(v_paid_out * v_refund.amount / v_ledger_row.total_captured, 2));
    IF v_receivable > 0 THEN
      INSERT INTO public.provider_receivables (provider_id, ledger_id, refund_request_id, amount, reason)
      VALUES (v_ledger_row.provider_id, v_ledger_row.id, v_refund.id, v_receivable, 'Refund paid to the customer after the provider share was paid out')
      ON CONFLICT (refund_request_id) DO NOTHING;
    END IF;
  END IF;
$to$);

SELECT public.grant_data_api_access('public.provider_receivables');
SELECT public.attach_admin_audit_trigger('public.provider_receivables');
