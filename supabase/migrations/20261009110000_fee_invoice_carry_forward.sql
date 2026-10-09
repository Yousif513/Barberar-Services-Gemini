-- M-04 and M-05 of docs/reviews/2026-10-08-security-money.md.
--
-- M-04. The monthly fee invoice counted completed bookings scheduled in the month and was never rewritten, so a booking completed after
-- its month's invoice was issued was never billed. Each billed booking is now stamped with the invoice that billed it
-- (bookings.fee_invoice_id). An invoice run bills every completed booking not yet stamped whose visit date is on or before the end of the
-- month, so late completions and earlier months that were never run are carried forward. When the month already has an invoice and
-- something new is billable, a supplementary invoice (supplement_no 1, 2, ...) is issued for the same month; the issued invoice itself is
-- never rewritten. With nothing new to bill, a repeat run answers already_issued.
--
-- M-05. The invoice number used the first 8 hex characters of the provider id, so two providers sharing them collided and the second
-- provider's invoice was dropped. The number now carries the whole id and the identity of an invoice is (provider, month, supplement).
-- Issued invoices keep the number they were issued with.
--
-- Invoices issued before this migration did not record which bookings they billed: every completed booking visited inside an issued
-- month is treated as billed by that month's original invoice (a booking completed after its invoice cannot be told apart; see the report).

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

ALTER TABLE public.provider_fee_invoices ADD COLUMN IF NOT EXISTS supplement_no INTEGER NOT NULL DEFAULT 0 CHECK (supplement_no >= 0);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_invoices_provider_period ON public.provider_fee_invoices (provider_id, period_start, supplement_no);

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS fee_invoice_id UUID
  REFERENCES public.provider_fee_invoices(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX IF NOT EXISTS idx_bookings_unbilled_completed ON public.bookings (branch_id, scheduled_at) WHERE status = 'completed' AND fee_invoice_id IS NULL;

UPDATE public.bookings b SET fee_invoice_id = f.id
FROM public.branches br, public.provider_fee_invoices f
WHERE br.id = b.branch_id AND f.provider_id = br.provider_id AND f.supplement_no = 0
  AND b.status = 'completed' AND b.fee_invoice_id IS NULL
  AND (b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN f.period_start AND f.period_end;

-- declarations
SELECT pg_temp.patch_function('public.generate_provider_monthly_fee_invoice(uuid, date)'::regprocedure,
$from$  v_number TEXT := 'FEE-' || to_char(v_start, 'YYYYMM') || '-' || left(p_provider_id::text, 8);$from$,
$to$  v_number TEXT;
  v_new_id UUID := gen_random_uuid();
  v_supp INTEGER;$to$);

-- select the unbilled completed bookings (stamping them with the invoice about to be inserted) under a per provider and month lock
SELECT pg_temp.patch_function('public.generate_provider_monthly_fee_invoice(uuid, date)'::regprocedure,
$from$  SELECT COUNT(*), COALESCE(SUM(b.total_price), 0), COALESCE(SUM(b.platform_commission), 0)
  INTO v_count, v_gmv, v_commission
  FROM public.bookings b
  JOIN public.branches br ON br.id = b.branch_id
  WHERE br.provider_id = p_provider_id
    AND b.status = 'completed'
    AND (b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN v_start AND v_end;$from$,
$to$  PERFORM pg_advisory_xact_lock(hashtextextended('fee-invoice:' || p_provider_id::text || ':' || to_char(v_start, 'YYYYMM'), 0));
  SELECT COALESCE(MAX(f.supplement_no) + 1, 0) INTO v_supp
  FROM public.provider_fee_invoices f WHERE f.provider_id = p_provider_id AND f.period_start = v_start;
  v_number := 'FEE-' || to_char(v_start, 'YYYYMM') || '-' || replace(p_provider_id::text, '-', '')
              || CASE WHEN v_supp > 0 THEN '-S' || v_supp ELSE '' END;

  WITH stamped AS (
    UPDATE public.bookings b SET fee_invoice_id = v_new_id
    FROM public.branches br
    WHERE br.id = b.branch_id AND br.provider_id = p_provider_id
      AND b.status = 'completed' AND b.fee_invoice_id IS NULL
      AND (b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date <= v_end
    RETURNING b.total_price, b.platform_commission)
  SELECT COUNT(*), COALESCE(SUM(total_price), 0), COALESCE(SUM(platform_commission), 0)
  INTO v_count, v_gmv, v_commission FROM stamped;

  IF v_count = 0 AND v_supp > 0 THEN
    -- Nothing new to bill for a month that already has its invoice: the invoice is a record and is never rewritten.
    SELECT f.id, f.total_invoice_due_sar, f.status INTO v_id, v_existing_due, v_existing_status
    FROM public.provider_fee_invoices f WHERE f.provider_id = p_provider_id AND f.period_start = v_start
    ORDER BY f.supplement_no DESC LIMIT 1;
    RETURN jsonb_build_object('success', TRUE, 'already_issued', TRUE, 'invoice_id', v_id, 'invoice_number', v_number,
                              'status', v_existing_status, 'total_due_sar', v_existing_due);
  END IF;$to$);

SELECT pg_temp.patch_function('public.generate_provider_monthly_fee_invoice(uuid, date)'::regprocedure,
$from$    AND tl.entry_type = 'booking_payment'
    AND b.status = 'completed'
    AND (b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN v_start AND v_end;$from$,
$to$    AND tl.entry_type = 'booking_payment'
    AND b.fee_invoice_id = v_new_id;$to$);

SELECT pg_temp.patch_function('public.generate_provider_monthly_fee_invoice(uuid, date)'::regprocedure,
$from$INSERT INTO public.provider_fee_invoices (provider_id, invoice_number,$from$,
$to$INSERT INTO public.provider_fee_invoices (id, supplement_no, provider_id, invoice_number,$to$);

SELECT pg_temp.patch_function('public.generate_provider_monthly_fee_invoice(uuid, date)'::regprocedure,
$from$  VALUES (p_provider_id, v_number,$from$,
$to$  VALUES (v_new_id, v_supp, p_provider_id, v_number,$to$);

SELECT pg_temp.patch_function('public.generate_provider_monthly_fee_invoice(uuid, date)'::regprocedure,
$from$  ON CONFLICT (invoice_number) DO NOTHING$from$,
$to$  ON CONFLICT DO NOTHING$to$);

SELECT pg_temp.patch_function('public.generate_provider_monthly_fee_invoice(uuid, date)'::regprocedure,
$from$    SELECT f.id, f.total_invoice_due_sar, f.status INTO v_id, v_existing_due, v_existing_status
    FROM public.provider_fee_invoices f WHERE f.invoice_number = v_number;$from$,
$to$    UPDATE public.bookings SET fee_invoice_id = NULL WHERE fee_invoice_id = v_new_id;
    SELECT f.id, f.total_invoice_due_sar, f.status INTO v_id, v_existing_due, v_existing_status
    FROM public.provider_fee_invoices f WHERE f.provider_id = p_provider_id AND f.period_start = v_start
    ORDER BY f.supplement_no DESC LIMIT 1;$to$);

-- the batch looks for providers with anything unbilled up to the end of the month, not only visits inside it
SELECT pg_temp.patch_function('public.issue_monthly_fee_invoices(date)'::regprocedure,
$from$    WHERE b.status = 'completed'
      AND (b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN v_month AND (v_month + interval '1 month - 1 day')::date$from$,
$to$    WHERE b.status = 'completed'
      AND ((b.fee_invoice_id IS NULL AND (b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date <= (v_month + interval '1 month - 1 day')::date)
           OR (b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN v_month AND (v_month + interval '1 month - 1 day')::date)$to$);
