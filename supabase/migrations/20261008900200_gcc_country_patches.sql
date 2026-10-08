-- G70: the functions that decide money and a branch-local day or clock now ask the configuration instead of a constant.
--
-- Every function is patched IN PLACE (the latest definition, not a pasted copy), so fixes other packages made to the same
-- functions stay. Saudi Arabia reproduces today's behaviour exactly: VAT 15 % and Asia/Riyadh come from the seeded SA row.
--
-- Left as they are, on purpose (documented in docs/work-packages/gcc-report.md): the platform-level reports and billing
-- (admin_booking_directory, admin_dashboard_overview, admin_get_event_counts, issue_monthly_fee_invoices,
-- generate_provider_monthly_fee_invoice, run_daily_psp_reconciliation, submit_data_request), the gift-card received message, and
-- the quiet-hours clock of a message that belongs to no booking: no branch is in scope there, so they keep the platform's
-- home time zone, Asia/Riyadh. The platform commission fallback (15 %) is not a tax and is an owner decision.

DROP FUNCTION IF EXISTS pg_temp.patch_function_all(regprocedure, text, text, integer);
CREATE OR REPLACE FUNCTION pg_temp.patch_function_all(p_sig regprocedure, p_from text, p_to text, p_expected integer) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE
  v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n'); -- a checkout with Windows line endings stores them in function bodies
  v_found integer;
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  v_found := (length(v_def) - length(replace(v_def, p_from, ''))) / length(p_from);
  IF v_found <> p_expected THEN
    RAISE EXCEPTION 'patch_function_all: expected % occurrence(s) of the pattern in %, found %', p_expected, p_sig, v_found;
  END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- booking_create_internal: the branch-local day, the VAT rate, and "no booking in a country that is not open".
-- ---------------------------------------------------------------------------------------------------------------------
SELECT pg_temp.patch_function_all('public.booking_create_internal(uuid,uuid,uuid,uuid[],timestamp with time zone,boolean,numeric,numeric,text,uuid,text,text,text,integer,timestamp with time zone[],timestamp with time zone[],text,uuid[],uuid,uuid,numeric)'::regprocedure,
$from$v_date DATE := (p_scheduled_at AT TIME ZONE 'Asia/Riyadh')::date;$from$,
$to$v_date DATE;
  v_vat_rate NUMERIC;$to$, 1);

-- The day is the branch's day: the professional's branch when one is named, else the branch asked for, else the provider's country.
SELECT pg_temp.patch_function_all('public.booking_create_internal(uuid,uuid,uuid,uuid[],timestamp with time zone,boolean,numeric,numeric,text,uuid,text,text,text,integer,timestamp with time zone[],timestamp with time zone[],text,uuid[],uuid,uuid,numeric)'::regprocedure,
$from$    RAISE EXCEPTION 'This provider is not accepting bookings' USING ERRCODE = '22023';
  END IF;$from$,
$to$    RAISE EXCEPTION 'This provider is not accepting bookings' USING ERRCODE = '22023';
  END IF;
  v_date := (p_scheduled_at AT TIME ZONE COALESCE(
    (SELECT public.branch_timezone(e0.branch_id) FROM public.employees e0 WHERE e0.id = v_employee_id),
    public.branch_timezone(p_branch_id),
    public.provider_timezone(v_provider_id)))::date;$to$, 1);

SELECT pg_temp.patch_function_all('public.booking_create_internal(uuid,uuid,uuid,uuid[],timestamp with time zone,boolean,numeric,numeric,text,uuid,text,text,text,integer,timestamp with time zone[],timestamp with time zone[],text,uuid[],uuid,uuid,numeric)'::regprocedure,
$from$AT TIME ZONE 'Asia/Riyadh')::date = v_date$from$,
$to$AT TIME ZONE public.branch_timezone(e.branch_id))::date = v_date$to$, 1);

SELECT pg_temp.patch_function_all('public.booking_create_internal(uuid,uuid,uuid,uuid[],timestamp with time zone,boolean,numeric,numeric,text,uuid,text,text,text,integer,timestamp with time zone[],timestamp with time zone[],text,uuid[],uuid,uuid,numeric)'::regprocedure,
$from$    RAISE EXCEPTION 'The selected professional does not work at this provider' USING ERRCODE = '22023';
  END IF;$from$,
$to$    RAISE EXCEPTION 'The selected professional does not work at this provider' USING ERRCODE = '22023';
  END IF;
  IF NOT public.country_is_active(public.branch_country(v_branch_id)) THEN
    RAISE EXCEPTION 'Bookings are not open in the country of this branch' USING ERRCODE = '22023';
  END IF;
  v_vat_rate := public.country_vat_rate(public.branch_country(v_branch_id));$to$, 1);

SELECT pg_temp.patch_function_all('public.booking_create_internal(uuid,uuid,uuid,uuid[],timestamp with time zone,boolean,numeric,numeric,text,uuid,text,text,text,integer,timestamp with time zone[],timestamp with time zone[],text,uuid[],uuid,uuid,numeric)'::regprocedure,
$from$v_tax := ROUND(v_taxable * 0.15, 2);$from$,
$to$v_tax := ROUND(v_taxable * v_vat_rate / 100, 2);$to$, 1);

-- ---------------------------------------------------------------------------------------------------------------------
-- create_walk_in_booking: VAT of the branch's country; no counter booking in a country that is not open.
-- ---------------------------------------------------------------------------------------------------------------------
SELECT pg_temp.patch_function_all('public.create_walk_in_booking(uuid,uuid,uuid,text,text,text,numeric,timestamp with time zone,text)'::regprocedure,
$from$    RAISE EXCEPTION 'Branch not found' USING ERRCODE = 'P0002';
  END IF;$from$,
$to$    RAISE EXCEPTION 'Branch not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.country_is_active(public.branch_country(p_branch_id)) THEN
    RAISE EXCEPTION 'Bookings are not open in the country of this branch' USING ERRCODE = '22023';
  END IF;$to$, 1);

SELECT pg_temp.patch_function_all('public.create_walk_in_booking(uuid,uuid,uuid,text,text,text,numeric,timestamp with time zone,text)'::regprocedure,
$from$ROUND(v_price * 0.15, 2)$from$,
$to$ROUND(v_price * public.country_vat_rate(public.branch_country(p_branch_id)) / 100, 2)$to$, 1);

-- ---------------------------------------------------------------------------------------------------------------------
-- generate_zatca_tax_invoice: ZATCA is a Saudi regime. A branch in another country is refused, never invoiced under Saudi rules.
-- ---------------------------------------------------------------------------------------------------------------------
SELECT pg_temp.patch_function_all('public.generate_zatca_tax_invoice(uuid)'::regprocedure,
$from$  SELECT * INTO v_existing FROM public.invoices WHERE booking_id = p_booking_id;$from$,
$to$  -- 'SA' here is deliberate: ZATCA (Fatoora) is the Saudi e-invoicing regime and applies to Saudi branches only.
  IF public.branch_country(v_booking.branch_id) IS DISTINCT FROM 'SA' THEN
    RAISE EXCEPTION 'ZATCA tax invoices exist only for branches in Saudi Arabia. This branch is in another country, so no ZATCA invoice can be issued for it'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing FROM public.invoices WHERE booking_id = p_booking_id;$to$, 1);

SELECT pg_temp.patch_function_all('public.generate_zatca_tax_invoice(uuid)'::regprocedure,
$from$v_booking.total_price, 15,$from$,
$to$v_booking.total_price, public.country_vat_rate(public.branch_country(v_booking.branch_id)),$to$, 1);

-- ---------------------------------------------------------------------------------------------------------------------
-- Availability: the slots of a branch are on the branch's clock; a country that is not open has none.
-- ---------------------------------------------------------------------------------------------------------------------
SELECT pg_temp.patch_function_all('public.get_available_slots(uuid,date,integer,timestamp with time zone[],timestamp with time zone[],integer,integer,uuid)'::regprocedure,
$from$v_day_start TIMESTAMPTZ := target_date::timestamp AT TIME ZONE 'Asia/Riyadh';$from$,
$to$v_tz TEXT;
  v_day_start TIMESTAMPTZ;$to$, 1);

SELECT pg_temp.patch_function_all('public.get_available_slots(uuid,date,integer,timestamp with time zone[],timestamp with time zone[],integer,integer,uuid)'::regprocedure,
$from$v_day_end TIMESTAMPTZ := (target_date + 1)::timestamp AT TIME ZONE 'Asia/Riyadh';$from$,
$to$v_day_end TIMESTAMPTZ;$to$, 1);

SELECT pg_temp.patch_function_all('public.get_available_slots(uuid,date,integer,timestamp with time zone[],timestamp with time zone[],integer,integer,uuid)'::regprocedure,
$from$  IF v_emp_branch_id IS NULL THEN
    RETURN;
  END IF;$from$,
$to$  IF v_emp_branch_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.country_is_active(public.branch_country(v_emp_branch_id)) THEN
    RETURN;
  END IF;
  v_tz := public.branch_timezone(v_emp_branch_id);
  v_day_start := target_date::timestamp AT TIME ZONE v_tz;
  v_day_end := (target_date + 1)::timestamp AT TIME ZONE v_tz;$to$, 1);

SELECT pg_temp.patch_function_all('public.get_available_slots(uuid,date,integer,timestamp with time zone[],timestamp with time zone[],integer,integer,uuid)'::regprocedure,
$from$AT TIME ZONE 'Asia/Riyadh';$from$, $to$AT TIME ZONE v_tz;$to$, 2);

-- ---------------------------------------------------------------------------------------------------------------------
-- Booking-scoped days and clocks: the booking's (or the requested) branch decides.
-- ---------------------------------------------------------------------------------------------------------------------
SELECT pg_temp.patch_function_all('public.reschedule_booking(uuid,timestamp with time zone,uuid,text,timestamp with time zone[],timestamp with time zone[])'::regprocedure,
$from$v_date DATE := (new_scheduled_at AT TIME ZONE 'Asia/Riyadh')::date;$from$,
$to$v_date DATE;$to$, 1);
SELECT pg_temp.patch_function_all('public.reschedule_booking(uuid,timestamp with time zone,uuid,text,timestamp with time zone[],timestamp with time zone[])'::regprocedure,
$from$SELECT * INTO v_booking FROM public.bookings WHERE id = target_booking_id FOR UPDATE;$from$,
$to$SELECT * INTO v_booking FROM public.bookings WHERE id = target_booking_id FOR UPDATE;
  v_date := (new_scheduled_at AT TIME ZONE public.branch_timezone(v_booking.branch_id))::date;$to$, 1);

SELECT pg_temp.patch_function_all('public.preview_booking_series(uuid,integer,integer)'::regprocedure,
$from$'Asia/Riyadh'$from$, $to$public.branch_timezone(v_a.branch_id)$to$, 3);
SELECT pg_temp.patch_function_all('public.create_booking_series_from_booking(uuid,integer,integer,boolean,text)'::regprocedure,
$from$'Asia/Riyadh'$from$, $to$public.branch_timezone(v_a.branch_id)$to$, 3);

SELECT pg_temp.patch_function_all('public.create_group_booking(uuid,date,group_occasion,text,jsonb,text,timestamp with time zone[],timestamp with time zone[])'::regprocedure,
$from$'Asia/Riyadh'$from$, $to$public.branch_timezone(p_branch_id)$to$, 1);
SELECT pg_temp.patch_function_all('public.group_booking_check_request(uuid,date,integer)'::regprocedure,
$from$'Asia/Riyadh'$from$, $to$public.branch_timezone(p_branch_id)$to$, 1);

SELECT pg_temp.patch_function_all('public.join_waitlist(uuid,uuid,uuid,date,time without time zone,time without time zone)'::regprocedure,
$from$'Asia/Riyadh'$from$, $to$public.branch_timezone(p_branch_id)$to$, 1);
SELECT pg_temp.patch_function_all('public.waitlist_sweep()'::regprocedure,
$from$'Asia/Riyadh'$from$, $to$public.branch_timezone(v_old.branch_id)$to$, 2);
SELECT pg_temp.patch_function_all('public.backfill_waitlist_on_cancellation()'::regprocedure,
$from$'Asia/Riyadh'$from$, $to$public.branch_timezone(OLD.branch_id)$to$, 2);

SELECT pg_temp.patch_function_all('public.get_branch_schedule_with_prayer_pauses(uuid,date,integer,uuid,timestamp with time zone[],timestamp with time zone[],text[])'::regprocedure,
$from$'Asia/Riyadh'$from$, $to$public.branch_timezone(p_branch_id)$to$, 3);

-- ---------------------------------------------------------------------------------------------------------------------
-- Reminders and messages.
-- ---------------------------------------------------------------------------------------------------------------------
SELECT pg_temp.patch_function_all('public.booking_message_variables(uuid,text)'::regprocedure,
$from$'Asia/Riyadh'$from$, $to$public.branch_timezone(b.branch_id)$to$, 2);

-- Quiet hours (22:00-09:00) are the recipient's branch's clock when the message belongs to a booking. A message that belongs to
-- no booking has no branch in scope and keeps the platform's home clock, Asia/Riyadh.
SELECT pg_temp.patch_function_all('public.claim_message_batch(integer)'::regprocedure,
$from$AT TIME ZONE 'Asia/Riyadh',$from$,
$to$AT TIME ZONE COALESCE((SELECT public.branch_timezone(bq.branch_id) FROM public.bookings bq WHERE bq.id = v_msg.booking_id), 'Asia/Riyadh'),$to$, 1);
SELECT pg_temp.patch_function_all('public.claim_message_batch(integer)'::regprocedure,
$from$v_local := now() AT TIME ZONE 'Asia/Riyadh';$from$,
$to$v_local := now() AT TIME ZONE COALESCE((SELECT public.branch_timezone(bq.branch_id) FROM public.bookings bq WHERE bq.id = v_msg.booking_id), 'Asia/Riyadh');$to$, 1);

SELECT pg_temp.patch_function_all('public.send_membership_expiry_reminders(integer)'::regprocedure,
$from$RETURNING m.id, m.customer_id,$from$, $to$RETURNING m.id, m.provider_id, m.customer_id,$to$, 1);
SELECT pg_temp.patch_function_all('public.send_membership_expiry_reminders(integer)'::regprocedure,
$from$'Asia/Riyadh'$from$, $to$public.provider_timezone(provider_id)$to$, 2);

-- ---------------------------------------------------------------------------------------------------------------------
-- Provider reports: the provider's own days. (A subselect so that the zone is looked up once per query, not once per row.)
-- ---------------------------------------------------------------------------------------------------------------------
SELECT pg_temp.patch_function_all('public.get_provider_dashboard_summary(uuid)'::regprocedure,
$from$'Asia/Riyadh'$from$, $to$(SELECT public.provider_timezone(p_provider_id))$to$, 4);
SELECT pg_temp.patch_function_all('public.get_provider_detailed_analytics(uuid,date,date)'::regprocedure,
$from$'Asia/Riyadh'$from$, $to$(SELECT public.provider_timezone(p_provider_id))$to$, 6);
SELECT pg_temp.patch_function_all('public.get_provider_multi_branch_summary(uuid,date,date)'::regprocedure,
$from$'Asia/Riyadh'$from$, $to$(SELECT public.provider_timezone(p_provider_id))$to$, 2);
SELECT pg_temp.patch_function_all('public.get_provider_chain_operations(uuid,date,date)'::regprocedure,
$from$'Asia/Riyadh'$from$, $to$(SELECT public.provider_timezone(p_provider_id))$to$, 3);
SELECT pg_temp.patch_function_all('public.calculate_staff_payroll(uuid,date,date)'::regprocedure,
$from$'Asia/Riyadh'$from$, $to$(SELECT public.provider_timezone(p_provider_id))$to$, 2);
SELECT pg_temp.patch_function_all('public.booking_channel_counts_internal(uuid,date,date)'::regprocedure,
$from$'Asia/Riyadh'$from$, $to$(SELECT public.provider_timezone(p_provider_id))$to$, 4);
SELECT pg_temp.patch_function_all('public.api_list_bookings(uuid,uuid,text[],text,text,text,timestamp with time zone,uuid,integer)'::regprocedure,
$from$'Asia/Riyadh'$from$, $to$COALESCE(public.branch_timezone(p_branch_id), public.provider_timezone(p_provider_id))$to$, 2);
