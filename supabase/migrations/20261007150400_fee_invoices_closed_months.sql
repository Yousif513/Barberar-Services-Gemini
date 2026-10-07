-- Migration: 20261007150400_fee_invoices_closed_months.sql
-- FIX-DBB / R19: provider fee invoices.
--  * generate_provider_monthly_fee_invoice had no caller, rewrote an existing invoice on a second run (turning a PAID invoice back to
--    "issued" with new amounts) and could be run for a month that was still open. It now refuses an open month (Asia/Riyadh), never
--    overwrites (ON CONFLICT DO NOTHING; a repeat returns the invoice that exists) and has a caller:
--    issue_monthly_fee_invoices() bills every provider with completed bookings in the last closed month, scheduled monthly where pg_cron exists.
--  * admin_mark_fee_invoice_paid records collection (status paid, paid_at, method, reason, audit); a paid invoice stays paid.
-- Left as it was, on purpose: the arithmetic (VAT 15 percent on the receivable only). Whether VAT applies to the whole commission is a tax
-- question for counsel and is recorded in the report. Netting a receivable against a payout (admin_release_payout) is deferred.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $helper$
DECLARE
  v_crlf text := chr(13) || chr(10);
  v_def text := replace(pg_get_functiondef(p_sig), v_crlf, chr(10));
  v_from text := replace(p_from, v_crlf, chr(10));
BEGIN
  IF position(v_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, v_from, replace(p_to, v_crlf, chr(10)));
END $helper$;

SELECT pg_temp.patch_function('public.generate_provider_monthly_fee_invoice(uuid, date)'::regprocedure,
  $q$  v_id UUID;
BEGIN$q$,
  $q$  v_id UUID;
  v_existing_due NUMERIC(12,2);
  v_existing_status TEXT;
BEGIN$q$);

SELECT pg_temp.patch_function('public.generate_provider_monthly_fee_invoice(uuid, date)'::regprocedure,
  $q$    RAISE EXCEPTION 'Only administrators can issue provider fee invoices' USING ERRCODE = '42501';
  END IF;$q$,
  $q$    RAISE EXCEPTION 'Only administrators can issue provider fee invoices' USING ERRCODE = '42501';
  END IF;
  IF p_month_date IS NULL OR v_end >= (now() AT TIME ZONE 'Asia/Riyadh')::date THEN
    RAISE EXCEPTION 'A fee invoice can only be issued for a closed month' USING ERRCODE = '22023';
  END IF;$q$);

SELECT pg_temp.patch_function('public.generate_provider_monthly_fee_invoice(uuid, date)'::regprocedure,
  $q$  ON CONFLICT (invoice_number) DO UPDATE
  SET total_bookings_count = EXCLUDED.total_bookings_count, gross_gmv_sar = EXCLUDED.gross_gmv_sar,
      deposit_captured_sar = EXCLUDED.deposit_captured_sar, platform_commission_sar = EXCLUDED.platform_commission_sar,
      net_fee_receivable_sar = EXCLUDED.net_fee_receivable_sar, vat_on_commission_sar = EXCLUDED.vat_on_commission_sar,
      total_invoice_due_sar = EXCLUDED.total_invoice_due_sar, status = EXCLUDED.status
  RETURNING id INTO v_id;$q$,
  $q$  ON CONFLICT (invoice_number) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- Issued before: the invoice is a record and is never rewritten, whatever its status.
    SELECT f.id, f.total_invoice_due_sar, f.status INTO v_id, v_existing_due, v_existing_status
    FROM public.provider_fee_invoices f WHERE f.invoice_number = v_number;
    RETURN jsonb_build_object('success', TRUE, 'already_issued', TRUE, 'invoice_id', v_id, 'invoice_number', v_number,
                              'status', v_existing_status, 'total_due_sar', v_existing_due);
  END IF;$q$);

-- The caller: bills the last closed month (Asia/Riyadh) for every provider that completed bookings in it. Safe to run again.
CREATE OR REPLACE FUNCTION public.issue_monthly_fee_invoices(p_month_date DATE DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_month DATE := date_trunc('month', COALESCE(p_month_date, ((now() AT TIME ZONE 'Asia/Riyadh')::date - interval '1 month')::date))::date;
  v_provider UUID;
  v_result JSONB;
  v_new INT := 0;
  v_existing INT := 0;
BEGIN
  IF NOT public.is_admin() AND COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only administrators or the scheduler can issue fee invoices' USING ERRCODE = '42501';
  END IF;
  FOR v_provider IN
    SELECT DISTINCT br.provider_id
    FROM public.bookings b JOIN public.branches br ON br.id = b.branch_id
    WHERE b.status = 'completed'
      AND (b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN v_month AND (v_month + interval '1 month - 1 day')::date
  LOOP
    v_result := public.generate_provider_monthly_fee_invoice(v_provider, v_month);
    IF COALESCE((v_result ->> 'already_issued')::boolean, FALSE) THEN v_existing := v_existing + 1; ELSE v_new := v_new + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('month', to_char(v_month, 'YYYY-MM'), 'issued', v_new, 'already_issued', v_existing);
END;
$$;
REVOKE ALL ON FUNCTION public.issue_monthly_fee_invoices(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_monthly_fee_invoices(DATE) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_mark_fee_invoice_paid(p_invoice_id UUID, p_payment_method TEXT, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_invoice public.provider_fee_invoices;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_invoice FROM public.provider_fee_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Fee invoice not found' USING ERRCODE = 'P0002'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 OR p_payment_method IS NULL OR length(trim(p_payment_method)) < 2
    OR length(p_payment_method) > 50 THEN
    RAISE EXCEPTION 'A payment method and a reason of at least 3 characters are required' USING ERRCODE = '22023'; END IF;
  IF v_invoice.status = 'paid' THEN
    RETURN jsonb_build_object('invoice_id', v_invoice.id, 'status', 'paid', 'already_paid', TRUE, 'paid_at', v_invoice.paid_at);
  END IF;
  IF v_invoice.status NOT IN ('issued', 'overdue') THEN
    RAISE EXCEPTION 'Only an issued or overdue invoice can be marked paid (this one is %)', v_invoice.status USING ERRCODE = '22023'; END IF;
  UPDATE public.provider_fee_invoices SET status = 'paid', paid_at = now(), payment_method = trim(p_payment_method) WHERE id = p_invoice_id;
  PERFORM public.write_audit_log('fee_invoice.paid', 'provider_fee_invoices', p_invoice_id,
    jsonb_build_object('provider_id', v_invoice.provider_id, 'invoice_number', v_invoice.invoice_number,
      'total_due_sar', v_invoice.total_invoice_due_sar, 'payment_method', trim(p_payment_method), 'reason', trim(p_reason)));
  RETURN jsonb_build_object('invoice_id', p_invoice_id, 'status', 'paid', 'already_paid', FALSE);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_mark_fee_invoice_paid(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_fee_invoice_paid(UUID, TEXT, TEXT) TO authenticated, service_role;

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'primora-issue-fee-invoices';
    -- 03:00 UTC on the 2nd: the previous month is closed in Riyadh by then, whatever the month length.
    PERFORM cron.schedule('primora-issue-fee-invoices', '0 3 2 * *',
      $job$ SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true), public.issue_monthly_fee_invoices(); $job$);
  ELSE
    RAISE NOTICE 'pg_cron not available: call public.issue_monthly_fee_invoices() on the 2nd of each month from an external scheduler.';
  END IF;
END
$outer$;

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
