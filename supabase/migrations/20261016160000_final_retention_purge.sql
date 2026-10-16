-- FINAL-7: review N8 (docs/reviews/2026-10-11-security-priv-recheck.md). Nothing removed what an erasure kept once its retention
-- ended (10 years from the end of the financial year of each record: Commercial Books Law Art. 8, VAT Implementing Regulations
-- Art. 66; the financial year is the calendar year, as privacy_retention_until already assumes). privacy_purge_expired_retention:
--   * scope: only records of erased customers (customer link cleared, pseudonymised by the engine), whose retention date passed
--     (Riyadh calendar), and never a booking an active legal hold still covers;
--   * the customer-side money sub-records (tips, wallet credits and their redemptions, coupon, gift-card and package redemptions,
--     loyalty balances) are deleted: their accounting effect is in the ledger, which is never deleted;
--   * a pseudonymised booking is then deleted when nothing still points at it; one the ledger, an invoice, a refund or a dispute
--     still references is kept as an anonymous accounting fact: its pseudonym is replaced by the fixed marker 'retention-ended'
--     (the same for every such booking, so it links nothing) and its retention basis says so;
--   * dry run by default: the purge runs and is rolled back, so the counts are exactly what a real run would do; service key, or a
--     privacy.approve console session after step-up; one audit entry per run.
-- It is NOT scheduled: when it runs, and whether the books may be anonymised rather than deleted after 10 years, is the owner's call
-- (recorded as gaps in the manifest).

CREATE TABLE IF NOT EXISTS public.privacy_retention_purge_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  txid BIGINT NOT NULL,
  actor_id UUID,
  dry_run BOOLEAN NOT NULL,
  cutoff DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  summary JSONB
);
ALTER TABLE public.privacy_retention_purge_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_retention_purge_runs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.privacy_retention_purge_runs TO service_role;

-- True only inside a recorded purge run of this transaction (a session cannot fake it by setting the GUC alone).
CREATE OR REPLACE FUNCTION public.privacy_retention_purge_active() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.privacy_retention_purge_runs r
     WHERE r.id::text = NULLIF(current_setting('primora.retention_purge_run', true), '')
       AND r.finished_at IS NULL AND r.txid = txid_current());
$$;
REVOKE ALL ON FUNCTION public.privacy_retention_purge_active() FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- The append-only guard lets a recorded purge run delete customer-side promotional/money sub-records (never ledger, no_delete or
-- immutable tables).
SELECT pg_temp.patch_function('public.guard_money_append_only()'::regprocedure,
$from$    IF v_mode = 'no_delete_allow_cascade' AND pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;$from$,
$to$    IF v_mode = 'no_delete_allow_cascade' AND pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;
    -- Review N8: the retention purge removes an erased customer's sub-record once its 10 years have passed.
    IF v_mode = 'no_delete_allow_cascade' AND public.privacy_retention_purge_active() THEN
      RETURN OLD;
    END IF;$to$);

-- The booking guard lets the purge destroy an expired booking's pseudonym (and nothing else changes it).
SELECT pg_temp.patch_function('public.protect_booking_immutable_fields()'::regprocedure,
$from$  IF public.privacy_erasure_active() THEN
    RETURN NEW;
  END IF;$from$,
$to$  IF public.privacy_erasure_active() THEN
    RETURN NEW;
  END IF;
  -- Review N8: after its retention a kept booking loses its pseudonym; every other field stays as recorded.
  IF public.privacy_retention_purge_active() AND OLD.pseudonymised_at IS NOT NULL AND NEW.pseudonym_token = 'retention-ended'
     AND OLD.retention_until < (now() AT TIME ZONE 'Asia/Riyadh')::date
     AND (to_jsonb(NEW) - 'pseudonym_token' - 'retention_basis' - 'updated_at') = (to_jsonb(OLD) - 'pseudonym_token' - 'retention_basis' - 'updated_at') THEN
    RETURN NEW;
  END IF;$to$);

CREATE OR REPLACE FUNCTION public.privacy_purge_expired_retention(p_dry_run BOOLEAN DEFAULT TRUE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  v_run UUID;
  v_counts JSONB := '{}'::jsonb;
  v_n INTEGER;
  v_deleted INTEGER := 0;
  v_anonymised INTEGER := 0;
  v_held TEXT[];
  b RECORD;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    PERFORM public.require_recent_mfa();
    PERFORM public.privacy_require_console('privacy.approve');
  END IF;
  INSERT INTO public.privacy_retention_purge_runs (txid, actor_id, dry_run, cutoff)
  VALUES (txid_current(), auth.uid(), COALESCE(p_dry_run, TRUE), v_today) RETURNING id INTO v_run;
  PERFORM set_config('primora.retention_purge_run', v_run::text, true);
  PERFORM set_config('primora.audit_rows', '1000000', true);
  SELECT COALESCE(array_agg(pseudonym_token) FILTER (WHERE pseudonym_token IS NOT NULL), '{}') INTO v_held
    FROM public.privacy_legal_holds WHERE status = 'active';

  BEGIN

  -- Expired customer-side sub-records of erased customers: each by its own date.
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.purge_targets (tbl TEXT, id UUID, booking_id UUID) ON COMMIT DROP;
  TRUNCATE pg_temp.purge_targets;
  INSERT INTO pg_temp.purge_targets
  SELECT 'booking_tips', t.id, t.booking_id FROM public.booking_tips t
   WHERE t.customer_id IS NULL AND t.pseudonymised_at IS NOT NULL AND public.privacy_retention_until(t.created_at) < v_today
     AND NOT EXISTS (SELECT 1 FROM public.bookings bk WHERE bk.id = t.booking_id AND bk.pseudonym_token = ANY (v_held))
  UNION ALL
  SELECT 'wallet_credit_redemptions', r.id, r.booking_id FROM public.wallet_credit_redemptions r
   WHERE r.customer_id IS NULL AND r.pseudonymised_at IS NOT NULL AND public.privacy_retention_until(r.created_at) < v_today
     AND NOT EXISTS (SELECT 1 FROM public.bookings bk WHERE bk.id = r.booking_id AND bk.pseudonym_token = ANY (v_held))
  UNION ALL
  SELECT 'coupon_redemptions', r.id, r.booking_id FROM public.coupon_redemptions r
   WHERE r.customer_id IS NULL AND r.pseudonymised_at IS NOT NULL AND public.privacy_retention_until(r.redeemed_at) < v_today
     AND NOT EXISTS (SELECT 1 FROM public.bookings bk WHERE bk.id = r.booking_id AND bk.pseudonym_token = ANY (v_held))
  UNION ALL
  SELECT 'gift_card_redemptions', r.id, r.booking_id FROM public.gift_card_redemptions r
   WHERE r.customer_id IS NULL AND r.pseudonymised_at IS NOT NULL AND public.privacy_retention_until(r.redeemed_at) < v_today
     AND NOT EXISTS (SELECT 1 FROM public.bookings bk WHERE bk.id = r.booking_id AND bk.pseudonym_token = ANY (v_held))
  UNION ALL
  SELECT 'package_redemptions', r.id, r.booking_id FROM public.package_redemptions r
   WHERE r.customer_id IS NULL AND r.pseudonymised_at IS NOT NULL AND public.privacy_retention_until(r.redeemed_at) < v_today
     AND NOT EXISTS (SELECT 1 FROM public.bookings bk WHERE bk.id = r.booking_id AND bk.pseudonym_token = ANY (v_held))
  UNION ALL
  SELECT 'wallet_credits', w.id, NULL FROM public.wallet_credits w
   WHERE w.customer_id IS NULL AND w.pseudonymised_at IS NOT NULL AND public.privacy_retention_until(w.created_at) < v_today
     AND NOT EXISTS (SELECT 1 FROM public.wallet_credit_redemptions r WHERE r.wallet_credit_id = w.id
                       AND public.privacy_retention_until(r.created_at) >= v_today)
  UNION ALL
  SELECT 'customer_loyalty', l.id, NULL FROM public.customer_loyalty l
   WHERE l.customer_id IS NULL AND l.pseudonymised_at IS NOT NULL
     AND public.privacy_retention_until(COALESCE(l.updated_at, l.created_at)) < v_today;
  SELECT COALESCE(jsonb_object_agg(tbl, n), '{}'::jsonb) INTO v_counts
    FROM (SELECT tbl, count(*) n FROM pg_temp.purge_targets GROUP BY tbl) x;

  DELETE FROM public.booking_tips t USING pg_temp.purge_targets p WHERE p.tbl = 'booking_tips' AND p.id = t.id;
  DELETE FROM public.wallet_credit_redemptions t USING pg_temp.purge_targets p WHERE p.tbl = 'wallet_credit_redemptions' AND p.id = t.id;
  DELETE FROM public.coupon_redemptions t USING pg_temp.purge_targets p WHERE p.tbl = 'coupon_redemptions' AND p.id = t.id;
  DELETE FROM public.gift_card_redemptions t USING pg_temp.purge_targets p WHERE p.tbl = 'gift_card_redemptions' AND p.id = t.id;
  DELETE FROM public.package_redemptions t USING pg_temp.purge_targets p WHERE p.tbl = 'package_redemptions' AND p.id = t.id;
  DELETE FROM public.wallet_credits t USING pg_temp.purge_targets p WHERE p.tbl = 'wallet_credits' AND p.id = t.id
     AND NOT EXISTS (SELECT 1 FROM public.wallet_credit_redemptions r WHERE r.wallet_credit_id = t.id);
  DELETE FROM public.customer_loyalty t USING pg_temp.purge_targets p WHERE p.tbl = 'customer_loyalty' AND p.id = t.id;

  -- Expired pseudonymised bookings: deleted when nothing still points at them, otherwise kept anonymous.
  FOR b IN SELECT bk.id FROM public.bookings bk
            WHERE bk.customer_id IS NULL AND bk.pseudonymised_at IS NOT NULL AND bk.retention_until IS NOT NULL AND bk.retention_until < v_today
              AND bk.pseudonym_token <> 'retention-ended' AND NOT bk.pseudonym_token = ANY (v_held) LOOP
    IF public.privacy_booking_is_linked(b.id) THEN
      v_anonymised := v_anonymised + 1;
      UPDATE public.bookings SET pseudonym_token = 'retention-ended',
             retention_basis = 'Retention ended ' || v_today || '; kept only as an anonymous accounting record referenced by the ledger'
       WHERE id = b.id;
    ELSE
      v_deleted := v_deleted + 1;
      BEGIN
        DELETE FROM public.group_booking_members WHERE booking_id = b.id;
        DELETE FROM public.bookings WHERE id = b.id;
      EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN
        v_deleted := v_deleted - 1;
        v_anonymised := v_anonymised + 1;
        UPDATE public.bookings SET pseudonym_token = 'retention-ended',
               retention_basis = 'Retention ended ' || v_today || '; kept only as an anonymous record another record references'
         WHERE id = b.id;
      END;
    END IF;
  END LOOP;
  -- A dry run undoes everything above; the counts stay.
  IF COALESCE(p_dry_run, TRUE) THEN
    RAISE EXCEPTION 'dry run' USING ERRCODE = 'PD001';
  END IF;
  EXCEPTION WHEN SQLSTATE 'PD001' THEN
    NULL;
  END;
  v_counts := jsonb_build_object('dry_run', COALESCE(p_dry_run, TRUE), 'cutoff', v_today, 'sub_records', v_counts,
    'bookings_deleted', v_deleted, 'bookings_anonymised', v_anonymised);

  UPDATE public.privacy_retention_purge_runs SET finished_at = clock_timestamp(), summary = v_counts WHERE id = v_run;
  PERFORM set_config('primora.retention_purge_run', '', true);
  PERFORM public.write_audit_log('privacy.retention_purged', 'privacy_retention_purge_runs', v_run, v_counts);
  RETURN v_counts || jsonb_build_object('run_id', v_run);
END $$;
REVOKE ALL ON FUNCTION public.privacy_purge_expired_retention(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privacy_purge_expired_retention(BOOLEAN) TO authenticated, service_role;
