-- Migration: 20261005090000_admin_dashboard_overview.sql
-- fabricated-dashboard (adminwright manifest): the /admin landing page rendered invented revenue in US
-- dollars, invented people and a fixed May 2025 date range. It now reads this one admin-only summary:
-- the work waiting for an operator (how many items, how long the oldest has waited, the money at stake)
-- and a few live platform figures in SAR. Read-only; every value is computed from the live tables at
-- call time, in the Asia/Riyadh calendar.

CREATE OR REPLACE FUNCTION public.admin_dashboard_overview()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  v_day_start TIMESTAMPTZ := v_today::timestamp AT TIME ZONE 'Asia/Riyadh';
  v_hold_minutes INT := COALESCE((public.platform_setting('booking_hold_minutes'))::text::int, 15);
  v_money_entries TEXT[] := ARRAY['booking_payment', 'tip', 'package_sale', 'gift_card_sale', 'subscription'];
  v_completed BIGINT;
  v_finished BIGINT;
  v_queues JSONB;
  v_kpis JSONB;
  v_reconciliation JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;

  -- Work waiting for an operator, in the order the dashboard lists it.
  v_queues := jsonb_build_array(
    (SELECT jsonb_build_object('key', 'payout_requests', 'count', count(*), 'oldest_at', min(requested_at),
                               'amount_sar', COALESCE(sum(amount), 0))
       FROM payout_requests WHERE status = 'requested'),
    (SELECT jsonb_build_object('key', 'payouts_processing', 'count', count(*),
                               'oldest_at', min(COALESCE(processed_at, requested_at)), 'amount_sar', COALESCE(sum(amount), 0))
       FROM payout_requests WHERE status = 'processing'),
    -- Refunds owed to customers that have not reached them. process-refund retries 'pending' and
    -- 'failed' rows until the fifth attempt; after that a failed refund only moves if an operator acts.
    (SELECT jsonb_build_object('key', 'refund_requests', 'count', count(*), 'oldest_at', min(created_at),
                               'amount_sar', COALESCE(sum(amount), 0),
                               'failed', count(*) FILTER (WHERE status = 'failed'),
                               'stalled', count(*) FILTER (WHERE status = 'failed' AND attempts >= 5),
                               -- claimed_at is added by 20261005150000; the body is resolved when it runs.
                               'stuck', count(*) FILTER (WHERE status = 'processing'
                                                           AND (claimed_at IS NULL OR claimed_at < now() - interval '15 minutes')))
       FROM refund_requests WHERE status IN ('pending', 'processing', 'failed')),
    (SELECT jsonb_build_object('key', 'disputes', 'count', count(*), 'oldest_at', min(created_at),
                               'amount_sar', COALESCE(sum(disputed_amount_sar), 0))
       FROM payment_disputes WHERE status IN ('opened', 'under_review')),
    (SELECT jsonb_build_object('key', 'provider_applications', 'count', count(*), 'oldest_at', min(created_at))
       FROM provider_applications WHERE status IN ('pending', 'under_review')),
    (SELECT jsonb_build_object('key', 'data_requests', 'count', count(*), 'oldest_at', min(created_at),
                               'overdue', count(*) FILTER (WHERE due_date < v_today), 'next_due', min(due_date))
       FROM data_subject_requests WHERE status IN ('pending', 'in_progress')),
    (SELECT jsonb_build_object('key', 'expired_holds', 'count', count(*), 'oldest_at', min(created_at),
                               'hold_minutes', v_hold_minutes)
       FROM bookings
      WHERE status = 'pending_payment' AND created_at < now() - make_interval(mins => v_hold_minutes)),
    (SELECT jsonb_build_object('key', 'flagged_reviews', 'count', count(*), 'oldest_at', min(created_at))
       FROM reviews WHERE moderation_status = 'flagged')
  );

  v_reconciliation := jsonb_build_object(
    'latest', (SELECT jsonb_build_object('run_date', run_date, 'status', status,
                                         'discrepancy_amount_sar', discrepancy_amount_sar, 'created_at', created_at)
                 FROM psp_reconciliation_runs ORDER BY run_date DESC, created_at DESC LIMIT 1),
    'discrepant_30d', (SELECT count(*) FROM psp_reconciliation_runs
                        WHERE status = 'discrepant' AND run_date >= v_today - 30)
  );

  -- Completion over visits that were due in the last 30 days. Holds that expired unpaid were never
  -- bookable visits, so system cancellations are left out of the denominator.
  SELECT count(*) FILTER (WHERE status = 'completed'),
         count(*) FILTER (WHERE status IN ('completed', 'no_show')
                             OR (status = 'cancelled' AND cancelled_by IS DISTINCT FROM 'system'))
    INTO v_completed, v_finished
    FROM bookings
   WHERE scheduled_at >= now() - interval '30 days' AND scheduled_at < now();

  v_kpis := jsonb_build_object(
    'bookings_today', (SELECT count(*) FROM bookings
                        WHERE scheduled_at >= v_day_start AND scheduled_at < v_day_start + interval '1 day'
                          AND status <> 'cancelled'),
    'captured_7d_sar', (SELECT COALESCE(sum(total_captured), 0) FROM transactional_ledger
                         WHERE created_at >= now() - interval '7 days'
                           AND COALESCE(entry_type, 'booking_payment') = ANY (v_money_entries)),
    'platform_share_7d_sar', (SELECT COALESCE(sum(platform_share), 0) FROM transactional_ledger
                               WHERE created_at >= now() - interval '7 days'
                                 AND COALESCE(entry_type, 'booking_payment') = ANY (v_money_entries)),
    -- Providers customers can find, by the rule search_marketplace_providers applies: verified (which
    -- sync_provider_status_verified clears on suspension or rejection) with an active branch.
    'live_providers', (SELECT count(*) FROM providers p
                        WHERE p.is_verified
                          AND EXISTS (SELECT 1 FROM branches b WHERE b.provider_id = p.id AND COALESCE(b.is_active, TRUE))),
    'customers', (SELECT count(*) FROM profiles WHERE role = 'customer'),
    'completed_30d', v_completed,
    'finished_30d', v_finished
  );

  RETURN jsonb_build_object(
    'generated_at', now(),
    'timezone', 'Asia/Riyadh',
    'kpis', v_kpis,
    'queues', v_queues,
    'reconciliation', v_reconciliation
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_overview() TO authenticated;
