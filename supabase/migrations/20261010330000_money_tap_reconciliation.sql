-- MONEY part 4: Tap reconciliation, "Check with Tap" and refund timelines (D-Q9 final decision text, adopted 2026-10-10).
--
--   * Tap is the system of record for whether, how much and when money moved; transactional_ledger for entitlements. Tap
--     objects (charges, refunds, settlements) and PRIMORA settlement bank-statement lines are imported append-only into
--     tap_reconciliation_events. run_tap_reconciliation(day) matches every Tap charge and refund to the ledger and every Tap
--     settlement to a bank-statement credit, and opens a reconciliation break for anything unmatched or different.
--   * A break is never edited away. It is resolved only by an approved ledger correction (part 1) that cites the Tap object id;
--     a charge or refund break that later matches on Tap's own data (a timing difference) is closed as auto-matched, recorded.
--     Breaks open for more than 3 business days (Saudi weekend Friday and Saturday) escalate to the owners.
--   * Refund timelines: a refund is initiated at Tap within 3 business days of the customer becoming entitled and must reach
--     succeeded at Tap within 14 calendar days of the cancellation notice. "Check with Tap" is available on a refund still
--     processing at Tap after 2 business days: an Edge Function fetches the refund from Tap and apply_tap_refund_status records
--     the answer. It never moves money.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Business days (Saudi weekend: Friday and Saturday, Asia/Riyadh)
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.saudi_add_business_days(p_from TIMESTAMPTZ, p_days INTEGER)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_local TIMESTAMP := p_from AT TIME ZONE 'Asia/Riyadh';
  v_left INTEGER := GREATEST(COALESCE(p_days, 0), 0);
BEGIN
  WHILE v_left > 0 LOOP
    v_local := v_local + INTERVAL '1 day';
    IF EXTRACT(ISODOW FROM v_local) NOT IN (5, 6) THEN
      v_left := v_left - 1;
    END IF;
  END LOOP;
  RETURN v_local AT TIME ZONE 'Asia/Riyadh';
END;
$$;

-- Whole business days from p_from to p_to (the weekend days in between do not count).
CREATE OR REPLACE FUNCTION public.saudi_business_days_between(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(COUNT(*)::int, 0)
    FROM generate_series((p_from AT TIME ZONE 'Asia/Riyadh')::date + 1, (p_to AT TIME ZONE 'Asia/Riyadh')::date, INTERVAL '1 day') d
   WHERE p_to > p_from AND EXTRACT(ISODOW FROM d) NOT IN (5, 6);
$$;
REVOKE ALL ON FUNCTION public.saudi_add_business_days(TIMESTAMPTZ, INTEGER), public.saudi_business_days_between(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saudi_add_business_days(TIMESTAMPTZ, INTEGER), public.saudi_business_days_between(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Imports, events, runs and breaks
-- ---------------------------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tap_reconciliation_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('tap_api', 'tap_settlement_file', 'bank_statement')),
  business_day DATE NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by UUID,
  object_count INTEGER NOT NULL DEFAULT 0,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_tap_imports_day ON public.tap_reconciliation_imports (business_day, source);

CREATE TABLE IF NOT EXISTS public.tap_reconciliation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES public.tap_reconciliation_imports(id) ON DELETE RESTRICT,
  object_type TEXT NOT NULL CHECK (object_type IN ('charge', 'refund', 'settlement', 'bank_credit')),
  tap_object_id TEXT NOT NULL CHECK (char_length(tap_object_id) BETWEEN 3 AND 128),
  charge_id TEXT,
  reference TEXT,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL CHECK (currency = 'SAR'),
  status TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  business_day DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (object_type, tap_object_id)
);
CREATE INDEX IF NOT EXISTS idx_tap_events_day ON public.tap_reconciliation_events (business_day, object_type);
CREATE INDEX IF NOT EXISTS idx_tap_events_reference ON public.tap_reconciliation_events (reference) WHERE reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.tap_reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_day DATE NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('matched', 'breaks', 'no_tap_data')),
  counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ran_by UUID,
  run_count INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.reconciliation_breaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_day DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('charge_missing_in_ledger', 'ledger_missing_at_tap', 'charge_amount_mismatch',
    'refund_missing_in_ledger', 'refund_missing_at_tap', 'refund_amount_mismatch', 'refund_failed_at_tap',
    'settlement_missing_in_bank', 'settlement_amount_mismatch')),
  subject TEXT NOT NULL,
  tap_object_id TEXT,
  ledger_id UUID REFERENCES public.transactional_ledger(id) ON DELETE RESTRICT,
  refund_request_id UUID REFERENCES public.refund_requests(id) ON DELETE RESTRICT,
  provider_id UUID,
  tap_amount NUMERIC(12,2),
  ledger_amount NUMERIC(12,2),
  difference NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'escalated', 'resolved', 'auto_matched')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  escalate_after TIMESTAMPTZ NOT NULL,
  escalated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_entry_id UUID REFERENCES public.transactional_ledger(id) ON DELETE RESTRICT,
  approval_request_id UUID,
  CHECK (status <> 'resolved' OR (resolution_entry_id IS NOT NULL AND approval_request_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reconciliation_break_open ON public.reconciliation_breaks (kind, subject) WHERE status IN ('open', 'escalated');
CREATE INDEX IF NOT EXISTS idx_reconciliation_breaks_status ON public.reconciliation_breaks (status, opened_at);

ALTER TABLE public.tap_reconciliation_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tap_reconciliation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tap_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_breaks ENABLE ROW LEVEL SECURITY;
DO $money$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tap_reconciliation_imports', 'tap_reconciliation_events', 'tap_reconciliation_runs', 'reconciliation_breaks'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Finance reads reconciliation', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.admin_can(''money.ledger''))', 'Finance reads reconciliation', t);
    PERFORM public.grant_data_api_access(('public.' || t)::regclass);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('REVOKE DELETE, TRUNCATE ON public.%I FROM service_role', t);
    PERFORM public.attach_admin_audit_trigger(('public.' || t)::regclass);
  END LOOP;
END
$money$;
DROP TRIGGER IF EXISTS trg_money_append_only ON public.tap_reconciliation_events;
CREATE TRIGGER trg_money_append_only BEFORE UPDATE OR DELETE ON public.tap_reconciliation_events FOR EACH ROW EXECUTE FUNCTION public.guard_money_append_only('immutable', '');
DROP TRIGGER IF EXISTS trg_money_append_only ON public.tap_reconciliation_imports;
CREATE TRIGGER trg_money_append_only BEFORE UPDATE OR DELETE ON public.tap_reconciliation_imports FOR EACH ROW
  EXECUTE FUNCTION public.guard_money_append_only('no_delete', 'id,source,business_day,imported_at,imported_by,reason');
DROP TRIGGER IF EXISTS trg_money_append_only ON public.reconciliation_breaks;
CREATE TRIGGER trg_money_append_only BEFORE UPDATE OR DELETE ON public.reconciliation_breaks FOR EACH ROW
  EXECUTE FUNCTION public.guard_money_append_only('no_delete', 'id,business_day,kind,subject,tap_object_id,ledger_id,refund_request_id,provider_id,tap_amount,ledger_amount,difference,opened_at,escalate_after');

-- A break is never "resolved" except by the approved correction that cites it (gov_exec_ledger_adjustment).
CREATE OR REPLACE FUNCTION public.guard_reconciliation_break_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'resolved' AND OLD.status IS DISTINCT FROM 'resolved'
     AND NOT (COALESCE(NULLIF(current_setting('primora.governance_approval', true), ''), '-') = COALESCE(NEW.approval_request_id::text, '')
              AND EXISTS (SELECT 1 FROM public.admin_approval_requests a
                           WHERE a.id = NEW.approval_request_id AND a.kind = 'ledger_adjustment' AND a.status = 'executing')) THEN
    RAISE EXCEPTION 'A reconciliation break is resolved only by an approved correction that cites it' USING ERRCODE = '42501';
  END IF;
  IF OLD.status IN ('resolved', 'auto_matched') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'A closed reconciliation break stays closed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_reconciliation_break_resolution() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_reconciliation_break_resolution ON public.reconciliation_breaks;
CREATE TRIGGER trg_reconciliation_break_resolution BEFORE UPDATE OF status ON public.reconciliation_breaks
  FOR EACH ROW EXECUTE FUNCTION public.guard_reconciliation_break_resolution();

-- Refund timeline columns.
ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS entitled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gateway_status TEXT CHECK (gateway_status IS NULL OR gateway_status IN ('processing', 'succeeded', 'failed', 'unknown')),
  ADD COLUMN IF NOT EXISTS gateway_status_raw TEXT,
  ADD COLUMN IF NOT EXISTS gateway_status_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gateway_succeeded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tap_checks INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_tap_check_at TIMESTAMPTZ;
UPDATE public.refund_requests SET entitled_at = created_at WHERE entitled_at IS NULL;
ALTER TABLE public.refund_requests ALTER COLUMN entitled_at SET DEFAULT now();
ALTER TABLE public.refund_requests ALTER COLUMN entitled_at SET NOT NULL;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Recording evidence
-- ---------------------------------------------------------------------------------------------------------------------

-- Inserts one batch of objects. Shared by the Tap API import (service role) and the console's file import.
CREATE OR REPLACE FUNCTION public.reconciliation_insert_events(p_source TEXT, p_business_day DATE, p_events JSONB, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_import UUID;
  v_event JSONB;
  v_new INTEGER := 0;
  v_rows INTEGER;
  v_type TEXT;
BEGIN
  IF p_business_day IS NULL OR p_business_day > (now() AT TIME ZONE 'Asia/Riyadh')::date THEN
    RAISE EXCEPTION 'The business day is a date up to today' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_events) IS DISTINCT FROM 'array' OR jsonb_array_length(p_events) > 5000 THEN
    RAISE EXCEPTION 'The events are a list of at most 5000 objects' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.tap_reconciliation_imports (source, business_day, imported_by, reason)
  VALUES (p_source, p_business_day, auth.uid(), p_reason) RETURNING id INTO v_import;
  FOR v_event IN SELECT * FROM jsonb_array_elements(p_events) LOOP
    v_type := v_event->>'object_type';
    IF v_type IS NULL OR v_type NOT IN ('charge', 'refund', 'settlement', 'bank_credit')
       OR (p_source = 'bank_statement' AND v_type <> 'bank_credit')
       OR (p_source <> 'bank_statement' AND v_type = 'bank_credit') THEN
      RAISE EXCEPTION 'Object % has a type this source cannot import', COALESCE(v_event->>'tap_object_id', '?') USING ERRCODE = '22023';
    END IF;
    IF NULLIF(btrim(COALESCE(v_event->>'tap_object_id', '')), '') IS NULL OR (v_event->>'amount') IS NULL
       OR (v_event->>'amount') !~ '^-?[0-9]+(\.[0-9]{1,2})?$' OR upper(COALESCE(v_event->>'currency', '')) <> 'SAR' THEN
      RAISE EXCEPTION 'Every object needs an id, an amount with at most 2 decimals and currency SAR' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.tap_reconciliation_events (import_id, object_type, tap_object_id, charge_id, reference, amount, currency, status, occurred_at, business_day)
    VALUES (v_import, v_type, btrim(v_event->>'tap_object_id'), NULLIF(btrim(COALESCE(v_event->>'charge_id', '')), ''),
            NULLIF(btrim(COALESCE(v_event->>'reference', '')), ''), (v_event->>'amount')::numeric, 'SAR',
            upper(COALESCE(NULLIF(v_event->>'status', ''), 'RECORDED')), COALESCE((v_event->>'occurred_at')::timestamptz, now()), p_business_day)
    ON CONFLICT (object_type, tap_object_id) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_new := v_new + v_rows;
  END LOOP;
  UPDATE public.tap_reconciliation_imports SET object_count = v_new WHERE id = v_import;
  PERFORM public.write_audit_log('reconciliation.imported', 'tap_reconciliation_imports', v_import,
    jsonb_build_object('source', p_source, 'business_day', p_business_day, 'objects', jsonb_array_length(p_events), 'new', v_new, 'reason', p_reason));
  RETURN jsonb_build_object('import_id', v_import, 'received', jsonb_array_length(p_events), 'new', v_new);
END;
$$;
REVOKE ALL ON FUNCTION public.reconciliation_insert_events(TEXT, DATE, JSONB, TEXT) FROM PUBLIC, anon, authenticated;

-- The Edge Function (service role) records what Tap's API returned for a day.
CREATE OR REPLACE FUNCTION public.record_tap_reconciliation_import(p_business_day DATE, p_events JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  RETURN public.reconciliation_insert_events('tap_api', p_business_day, p_events, 'Tap API import');
END;
$$;
REVOKE ALL ON FUNCTION public.record_tap_reconciliation_import(DATE, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tap_reconciliation_import(DATE, JSONB) TO service_role;

-- Finance imports a Tap settlement report or PRIMORA's settlement bank statement (rows parsed by the console).
CREATE OR REPLACE FUNCTION public.admin_import_reconciliation_file(p_source TEXT, p_business_day DATE, p_rows JSONB, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('money.ledger') THEN
    RAISE EXCEPTION 'Your console role cannot import reconciliation files' USING ERRCODE = '42501';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('tap_settlement_file', 'bank_statement') THEN
    RAISE EXCEPTION 'The source is a Tap settlement file or the bank statement' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  RETURN public.reconciliation_insert_events(p_source, p_business_day, p_rows, v_reason);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_import_reconciliation_file(TEXT, DATE, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_import_reconciliation_file(TEXT, DATE, JSONB, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. The daily reconciliation
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reconciliation_open_break(p_day DATE, p_kind TEXT, p_subject TEXT, p_tap TEXT, p_ledger UUID, p_refund UUID,
  p_tap_amount NUMERIC, p_ledger_amount NUMERIC)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  INSERT INTO public.reconciliation_breaks (business_day, kind, subject, tap_object_id, ledger_id, refund_request_id, provider_id, tap_amount,
                                            ledger_amount, difference, escalate_after)
  VALUES (p_day, p_kind, p_subject, p_tap, p_ledger, p_refund,
          (SELECT provider_id FROM public.transactional_ledger WHERE id = COALESCE(p_ledger, (SELECT ledger_id FROM public.refund_requests WHERE id = p_refund))),
          p_tap_amount, p_ledger_amount, COALESCE(p_tap_amount, 0) - COALESCE(p_ledger_amount, 0),
          public.saudi_add_business_days(now(), 3))
  ON CONFLICT (kind, subject) WHERE status IN ('open', 'escalated') DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;
REVOKE ALL ON FUNCTION public.reconciliation_open_break(DATE, TEXT, TEXT, TEXT, UUID, UUID, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;

-- Breaks open longer than 3 business days escalate to every owner (out-of-band notice) once.
CREATE OR REPLACE FUNCTION public.escalate_reconciliation_breaks()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_break RECORD;
  v_owner RECORD;
  v_count INTEGER := 0;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' AND NOT public.admin_can('money.ledger') THEN
    RAISE EXCEPTION 'Your console role cannot escalate reconciliation breaks' USING ERRCODE = '42501';
  END IF;
  FOR v_break IN SELECT * FROM public.reconciliation_breaks WHERE status = 'open' AND escalate_after <= now() FOR UPDATE LOOP
    UPDATE public.reconciliation_breaks SET status = 'escalated', escalated_at = now() WHERE id = v_break.id;
    FOR v_owner IN SELECT a.user_id FROM public.admin_role_assignments a JOIN public.profiles p ON p.id = a.user_id AND p.role = 'admin'
                    WHERE a.admin_role = 'owner' LOOP
      PERFORM public.queue_governance_notice(v_owner.user_id, 'reconciliation_break_escalated',
        jsonb_build_object('break_id', v_break.id, 'kind', v_break.kind, 'business_day', v_break.business_day, 'difference', v_break.difference));
    END LOOP;
    PERFORM public.write_audit_log('reconciliation.break_escalated', 'reconciliation_breaks', v_break.id,
      jsonb_build_object('kind', v_break.kind, 'business_day', v_break.business_day, 'difference', v_break.difference, 'opened_at', v_break.opened_at));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.escalate_reconciliation_breaks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escalate_reconciliation_breaks() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.run_tap_reconciliation(p_business_day DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_has_tap BOOLEAN;
  v_has_settlements BOOLEAN;
  v_opened INTEGER := 0;
  v_auto INTEGER := 0;
  v_seen TEXT[] := ARRAY[]::TEXT[];
  v_status TEXT;
  r RECORD;
  v_counts JSONB;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    PERFORM public.require_recent_mfa();
    IF NOT public.admin_can('money.ledger') THEN
      RAISE EXCEPTION 'Your console role cannot run reconciliation' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_business_day IS NULL OR p_business_day >= (now() AT TIME ZONE 'Asia/Riyadh')::date THEN
    RAISE EXCEPTION 'Reconcile a business day that has ended (before today in Riyadh)' USING ERRCODE = '22023';
  END IF;
  v_start := p_business_day::timestamp AT TIME ZONE 'Asia/Riyadh';
  v_end := v_start + INTERVAL '1 day';
  v_has_tap := EXISTS (SELECT 1 FROM public.tap_reconciliation_imports WHERE business_day = p_business_day AND source IN ('tap_api', 'tap_settlement_file'));
  v_has_settlements := EXISTS (SELECT 1 FROM public.tap_reconciliation_events WHERE business_day = p_business_day AND object_type = 'settlement');

  IF v_has_tap THEN
    -- Tap captured a charge the ledger does not have, or for a different amount.
    FOR r IN SELECT e.tap_object_id, e.amount, l.id AS ledger_id, l.total_captured
               FROM public.tap_reconciliation_events e
               LEFT JOIN public.transactional_ledger l ON l.payment_intent_id = e.tap_object_id
              WHERE e.business_day = p_business_day AND e.object_type = 'charge' AND e.status IN ('CAPTURED', 'SUCCEEDED', 'PAID') LOOP
      IF r.ledger_id IS NULL THEN
        v_seen := v_seen || ('charge_missing_in_ledger:' || r.tap_object_id);
        v_opened := v_opened + public.reconciliation_open_break(p_business_day, 'charge_missing_in_ledger', r.tap_object_id, r.tap_object_id, NULL, NULL, r.amount, NULL);
      ELSIF r.total_captured <> r.amount THEN
        v_seen := v_seen || ('charge_amount_mismatch:' || r.tap_object_id);
        v_opened := v_opened + public.reconciliation_open_break(p_business_day, 'charge_amount_mismatch', r.tap_object_id, r.tap_object_id, r.ledger_id, NULL, r.amount, r.total_captured);
      END IF;
    END LOOP;
    -- The ledger recorded a captured payment Tap does not show.
    FOR r IN SELECT l.id, l.payment_intent_id, l.total_captured FROM public.transactional_ledger l
              WHERE l.created_at >= v_start AND l.created_at < v_end AND l.total_captured > 0
                AND l.entry_type IN ('booking_payment', 'tip', 'package_sale', 'gift_card_sale', 'subscription')
                AND l.payment_intent_id LIKE 'chg\_%'
                AND NOT EXISTS (SELECT 1 FROM public.tap_reconciliation_events e WHERE e.object_type = 'charge' AND e.tap_object_id = l.payment_intent_id) LOOP
      v_seen := v_seen || ('ledger_missing_at_tap:' || r.payment_intent_id);
      v_opened := v_opened + public.reconciliation_open_break(p_business_day, 'ledger_missing_at_tap', r.payment_intent_id, r.payment_intent_id, r.id, NULL, NULL, r.total_captured);
    END LOOP;
    -- Refunds Tap completed that PRIMORA did not record, or for a different amount.
    FOR r IN SELECT e.tap_object_id, e.amount, rr.id AS refund_id, rr.amount AS recorded, rr.ledger_id
               FROM public.tap_reconciliation_events e
               LEFT JOIN public.refund_requests rr ON rr.gateway_refund_id = e.tap_object_id
              WHERE e.business_day = p_business_day AND e.object_type = 'refund' AND e.status IN ('REFUNDED', 'SUCCESS', 'SUCCEEDED') LOOP
      IF r.refund_id IS NULL THEN
        v_seen := v_seen || ('refund_missing_in_ledger:' || r.tap_object_id);
        v_opened := v_opened + public.reconciliation_open_break(p_business_day, 'refund_missing_in_ledger', r.tap_object_id, r.tap_object_id, NULL, NULL, r.amount, NULL);
      ELSIF r.recorded <> r.amount THEN
        v_seen := v_seen || ('refund_amount_mismatch:' || r.tap_object_id);
        v_opened := v_opened + public.reconciliation_open_break(p_business_day, 'refund_amount_mismatch', r.tap_object_id, r.tap_object_id, r.ledger_id, r.refund_id, r.amount, r.recorded);
      END IF;
    END LOOP;
    -- Refunds PRIMORA recorded as sent that Tap does not show.
    FOR r IN SELECT rr.id, rr.gateway_refund_id, rr.amount, rr.ledger_id FROM public.refund_requests rr
              WHERE rr.status = 'succeeded' AND rr.gateway_refund_id IS NOT NULL AND rr.processed_at >= v_start AND rr.processed_at < v_end
                AND NOT EXISTS (SELECT 1 FROM public.tap_reconciliation_events e WHERE e.object_type = 'refund' AND e.tap_object_id = rr.gateway_refund_id) LOOP
      v_seen := v_seen || ('refund_missing_at_tap:' || r.gateway_refund_id);
      v_opened := v_opened + public.reconciliation_open_break(p_business_day, 'refund_missing_at_tap', r.gateway_refund_id, r.gateway_refund_id, r.ledger_id, r.id, NULL, r.amount);
    END LOOP;
  END IF;

  -- Each Tap settlement must reach PRIMORA's settlement bank account for the same amount.
  IF v_has_settlements THEN
    FOR r IN SELECT s.tap_object_id, s.amount, b.amount AS banked
               FROM public.tap_reconciliation_events s
               LEFT JOIN LATERAL (SELECT SUM(x.amount) AS amount FROM public.tap_reconciliation_events x
                                   WHERE x.object_type = 'bank_credit' AND x.reference = s.tap_object_id) b ON TRUE
              WHERE s.business_day = p_business_day AND s.object_type = 'settlement' LOOP
      IF r.banked IS NULL THEN
        v_opened := v_opened + public.reconciliation_open_break(p_business_day, 'settlement_missing_in_bank', r.tap_object_id, r.tap_object_id, NULL, NULL, r.amount, NULL);
      ELSIF r.banked <> r.amount THEN
        v_opened := v_opened + public.reconciliation_open_break(p_business_day, 'settlement_amount_mismatch', r.tap_object_id, r.tap_object_id, NULL, NULL, r.amount, r.banked);
      END IF;
    END LOOP;
  END IF;

  -- A charge or refund break of this day that Tap's own data now matches was a timing difference: closed as auto-matched.
  -- Settlement breaks never auto-close: only an approved correction resolves them.
  IF v_has_tap THEN
    FOR r IN SELECT id FROM public.reconciliation_breaks
              WHERE business_day = p_business_day AND status IN ('open', 'escalated')
                AND kind NOT IN ('settlement_missing_in_bank', 'settlement_amount_mismatch', 'refund_failed_at_tap')
                AND NOT ((kind || ':' || subject) = ANY (v_seen)) LOOP
      UPDATE public.reconciliation_breaks SET status = 'auto_matched', resolved_at = now() WHERE id = r.id;
      v_auto := v_auto + 1;
    END LOOP;
  END IF;

  v_counts := jsonb_build_object(
    'tap_charges', (SELECT COUNT(*) FROM public.tap_reconciliation_events WHERE business_day = p_business_day AND object_type = 'charge'),
    'tap_refunds', (SELECT COUNT(*) FROM public.tap_reconciliation_events WHERE business_day = p_business_day AND object_type = 'refund'),
    'tap_settlements', (SELECT COUNT(*) FROM public.tap_reconciliation_events WHERE business_day = p_business_day AND object_type = 'settlement'),
    'opened', v_opened, 'auto_matched', v_auto,
    'open_breaks', (SELECT COUNT(*) FROM public.reconciliation_breaks WHERE business_day = p_business_day AND status IN ('open', 'escalated')));
  v_status := CASE WHEN NOT v_has_tap THEN 'no_tap_data' WHEN (v_counts->>'open_breaks')::int > 0 THEN 'breaks' ELSE 'matched' END;
  INSERT INTO public.tap_reconciliation_runs (business_day, status, counts, ran_by)
  VALUES (p_business_day, v_status, v_counts, auth.uid())
  ON CONFLICT (business_day) DO UPDATE SET status = EXCLUDED.status, counts = EXCLUDED.counts, ran_at = now(), ran_by = EXCLUDED.ran_by,
                                           run_count = public.tap_reconciliation_runs.run_count + 1;
  PERFORM public.escalate_reconciliation_breaks();
  PERFORM public.write_audit_log('reconciliation.run', 'tap_reconciliation_runs', NULL,
    jsonb_build_object('business_day', p_business_day, 'status', v_status) || v_counts);
  RETURN jsonb_build_object('business_day', p_business_day, 'status', v_status) || v_counts;
END;
$$;
REVOKE ALL ON FUNCTION public.run_tap_reconciliation(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_tap_reconciliation(DATE) TO authenticated, service_role;

-- GOV-1 review M-3: the totals-only run is a ledger action and needs a fresh MFA step-up too.
SELECT pg_temp.patch_function('public.run_daily_psp_reconciliation(date,numeric,numeric,integer)'::regprocedure,
$from$BEGIN
  IF NOT public.admin_can('money.ledger') AND COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN$from$,
$to$BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('money.ledger') AND COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Resolving a break: an approved correction that cites the Tap object
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_propose_break_resolution(p_break_id UUID, p_provider_share_delta NUMERIC, p_platform_share_delta NUMERIC,
  p_justification TEXT, p_idempotency_key TEXT, p_captured_delta NUMERIC DEFAULT 0)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_break public.reconciliation_breaks;
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('money.ledger') THEN
    RAISE EXCEPTION 'Your console role cannot resolve reconciliation breaks' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_break FROM public.reconciliation_breaks WHERE id = p_break_id;
  IF v_break.id IS NULL THEN
    RAISE EXCEPTION 'Reconciliation break not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_break.status NOT IN ('open', 'escalated') THEN
    RAISE EXCEPTION 'This break is already %', v_break.status USING ERRCODE = '22023';
  END IF;
  RETURN public.admin_propose_ledger_adjustment(v_break.ledger_id, 'adjustment', p_provider_share_delta, p_platform_share_delta,
    'reconciliation_break', p_justification, p_idempotency_key, v_break.tap_object_id, v_break.provider_id, p_captured_delta, v_break.id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_propose_break_resolution(UUID, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_propose_break_resolution(UUID, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Refund status at Tap, "Check with Tap" and the refund timelines
-- ---------------------------------------------------------------------------------------------------------------------

-- Maps Tap's refund status to PRIMORA's view of it (the Edge Function's pure module uses the same table).
CREATE OR REPLACE FUNCTION public.tap_refund_state(p_status TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN upper(COALESCE(p_status, '')) IN ('REFUNDED', 'SUCCESS', 'SUCCEEDED', 'CAPTURED') THEN 'succeeded'
    WHEN upper(COALESCE(p_status, '')) IN ('PENDING', 'IN_PROGRESS', 'INITIATED', 'PROCESSING') THEN 'processing'
    WHEN upper(COALESCE(p_status, '')) IN ('FAILED', 'DECLINED', 'CANCELLED', 'CANCELED', 'REJECTED', 'VOID', 'ABANDONED', 'TIMEDOUT', 'RESTRICTED') THEN 'failed'
    ELSE 'unknown'
  END;
$$;

-- Records Tap's status for a refund (from the create call or from "Check with Tap"). Money never moves here; a refund Tap
-- reports failed after PRIMORA booked it opens a reconciliation break.
CREATE OR REPLACE FUNCTION public.refund_apply_gateway_status(p_refund_id UUID, p_tap_status TEXT, p_tap_amount NUMERIC, p_source TEXT, p_actor UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.refund_requests;
  v_state TEXT := public.tap_refund_state(p_tap_status);
  v_before TEXT;
BEGIN
  SELECT * INTO v_refund FROM public.refund_requests WHERE id = p_refund_id FOR UPDATE;
  IF v_refund.id IS NULL THEN
    RAISE EXCEPTION 'Refund request not found' USING ERRCODE = 'P0002';
  END IF;
  v_before := v_refund.gateway_status;
  UPDATE public.refund_requests
     SET gateway_status = CASE WHEN v_state = 'unknown' THEN COALESCE(gateway_status, 'unknown') ELSE v_state END,
         gateway_status_raw = left(upper(COALESCE(p_tap_status, '')), 40), gateway_status_at = now(),
         gateway_succeeded_at = CASE WHEN v_state = 'succeeded' THEN COALESCE(gateway_succeeded_at, now()) ELSE gateway_succeeded_at END,
         tap_checks = tap_checks + CASE WHEN p_source = 'check_with_tap' THEN 1 ELSE 0 END,
         last_tap_check_at = CASE WHEN p_source = 'check_with_tap' THEN now() ELSE last_tap_check_at END
   WHERE id = v_refund.id;
  IF v_state = 'failed' AND v_refund.status = 'succeeded' THEN
    PERFORM public.reconciliation_open_break((now() AT TIME ZONE 'Asia/Riyadh')::date, 'refund_failed_at_tap', v_refund.gateway_refund_id,
      v_refund.gateway_refund_id, v_refund.ledger_id, v_refund.id, 0, v_refund.amount);
  END IF;
  IF p_tap_amount IS NOT NULL AND v_state = 'succeeded' AND p_tap_amount <> v_refund.amount AND v_refund.gateway_refund_id IS NOT NULL THEN
    PERFORM public.reconciliation_open_break((now() AT TIME ZONE 'Asia/Riyadh')::date, 'refund_amount_mismatch', v_refund.gateway_refund_id,
      v_refund.gateway_refund_id, v_refund.ledger_id, v_refund.id, p_tap_amount, v_refund.amount);
  END IF;
  PERFORM public.write_audit_log(CASE WHEN p_source = 'check_with_tap' THEN 'refund.checked_with_tap' ELSE 'refund.gateway_status' END,
    'refund_requests', v_refund.id,
    jsonb_build_object('tap_status', left(upper(COALESCE(p_tap_status, '')), 40), 'state', v_state, 'state_before', v_before,
                       'tap_amount', p_tap_amount, 'recorded_amount', v_refund.amount, 'gateway_refund_id', v_refund.gateway_refund_id,
                       'actor_id', p_actor, 'source', p_source));
  RETURN jsonb_build_object('refund_request_id', v_refund.id, 'state', v_state, 'state_before', v_before, 'tap_status', upper(COALESCE(p_tap_status, '')));
END;
$$;
REVOKE ALL ON FUNCTION public.refund_apply_gateway_status(UUID, TEXT, NUMERIC, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- process-refund (service role) records Tap's answer to the create call.
CREATE OR REPLACE FUNCTION public.record_refund_gateway_status(p_refund_id UUID, p_tap_status TEXT, p_tap_amount NUMERIC DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  RETURN public.refund_apply_gateway_status(p_refund_id, p_tap_status, p_tap_amount, 'refund_created', NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.record_refund_gateway_status(UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_refund_gateway_status(UUID, TEXT, NUMERIC) TO service_role;

-- Whether "Check with Tap" is open for this refund: sent to Tap, still processing there after 2 business days.
CREATE OR REPLACE FUNCTION public.refund_tap_check_due(p_refund public.refund_requests)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p_refund.gateway_refund_id IS NOT NULL
     AND COALESCE(p_refund.gateway_status, 'processing') IN ('processing', 'unknown')
     AND public.saudi_business_days_between(COALESCE(p_refund.processed_at, p_refund.created_at), now()) > 2;
$$;
REVOKE ALL ON FUNCTION public.refund_tap_check_due(public.refund_requests) FROM PUBLIC, anon, authenticated;

-- Step 1 of "Check with Tap", in the caller's session: the refund must be due; answers the Tap refund id to fetch.
CREATE OR REPLACE FUNCTION public.admin_begin_tap_refund_check(p_refund_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.refund_requests;
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('money.refund') THEN
    RAISE EXCEPTION 'Your console role cannot check refunds with Tap' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_refund FROM public.refund_requests WHERE id = p_refund_id;
  IF v_refund.id IS NULL THEN
    RAISE EXCEPTION 'Refund request not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.refund_tap_check_due(v_refund) THEN
    RAISE EXCEPTION 'Check with Tap opens for a refund still processing at Tap after 2 business days' USING ERRCODE = '22023', HINT = 'tap_check_not_due';
  END IF;
  PERFORM public.write_audit_log('refund.tap_check_requested', 'refund_requests', v_refund.id,
    jsonb_build_object('gateway_refund_id', v_refund.gateway_refund_id) || public.request_client_info());
  RETURN jsonb_build_object('refund_request_id', v_refund.id, 'gateway_refund_id', v_refund.gateway_refund_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_begin_tap_refund_check(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_begin_tap_refund_check(UUID) TO authenticated;

-- Step 2, by the Edge Function (service role) with Tap's answer and the administrator who asked.
CREATE OR REPLACE FUNCTION public.apply_tap_refund_status(p_refund_id UUID, p_actor UUID, p_tap_refund_id TEXT, p_tap_status TEXT, p_tap_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.refund_requests;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_refund FROM public.refund_requests WHERE id = p_refund_id;
  IF v_refund.id IS NULL THEN
    RAISE EXCEPTION 'Refund request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_refund.gateway_refund_id IS DISTINCT FROM p_tap_refund_id THEN
    RAISE EXCEPTION 'Tap answered for a different refund' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_role_assignments a JOIN public.admin_role_permissions rp ON rp.admin_role = a.admin_role
                  WHERE a.user_id = p_actor AND rp.permission = 'money.refund') THEN
    RAISE EXCEPTION 'The requesting administrator cannot check refunds' USING ERRCODE = '42501';
  END IF;
  RETURN public.refund_apply_gateway_status(p_refund_id, p_tap_status, p_tap_amount, 'check_with_tap', p_actor);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_tap_refund_status(UUID, UUID, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tap_refund_status(UUID, UUID, TEXT, TEXT, NUMERIC) TO service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. The console screen
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_reconciliation_overview(p_status TEXT DEFAULT 'open', p_limit INTEGER DEFAULT 25, p_offset INTEGER DEFAULT 0)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_breaks JSONB;
  v_refunds JSONB;
BEGIN
  IF NOT public.admin_can('money.ledger') THEN
    RAISE EXCEPTION 'Your console role cannot read reconciliation' USING ERRCODE = '42501';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('open', 'escalated', 'resolved', 'auto_matched') THEN
    RAISE EXCEPTION 'Unknown status' USING ERRCODE = '22023';
  END IF;
  PERFORM public.escalate_reconciliation_breaks();

  SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.opened_at DESC, b.id), '[]'::jsonb) INTO v_breaks
    FROM (SELECT b.id, b.business_day, b.kind, b.tap_object_id, b.ledger_id, b.refund_request_id, b.provider_id, b.tap_amount, b.ledger_amount,
                 b.difference, b.status, b.opened_at, b.escalate_after, b.escalated_at, b.resolved_at, b.resolution_entry_id, b.approval_request_id,
                 pr.business_name_en AS provider_name_en, pr.business_name_ar AS provider_name_ar,
                 public.saudi_business_days_between(b.opened_at, now()) AS business_days_open,
                 EXISTS (SELECT 1 FROM public.admin_approval_requests a WHERE a.kind = 'ledger_adjustment' AND a.status = 'pending'
                          AND a.payload->>'break_id' = b.id::text) AS correction_pending
            FROM public.reconciliation_breaks b LEFT JOIN public.providers pr ON pr.id = b.provider_id
           WHERE (v_status IS NULL AND b.status IN ('open', 'escalated')) OR b.status = v_status OR (v_status = 'open' AND b.status = 'escalated')
           ORDER BY b.opened_at DESC, b.id LIMIT v_limit OFFSET v_offset) b;

  -- Refund timelines: initiated at Tap within 3 business days of entitlement; succeeded at Tap within 14 days of the notice.
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.entitled_at), '[]'::jsonb) INTO v_refunds
    FROM (SELECT r.id, r.booking_id, r.amount, r.status, r.source, r.gateway_refund_id, r.gateway_status, r.gateway_status_raw, r.gateway_status_at,
                 r.gateway_succeeded_at, r.entitled_at, r.processed_at, r.tap_checks, r.last_tap_check_at,
                 COALESCE(bk.cancelled_at, r.entitled_at) AS notice_at,
                 public.saudi_add_business_days(r.entitled_at, 3) AS initiate_by,
                 COALESCE(bk.cancelled_at, r.entitled_at) + INTERVAL '14 days' AS succeed_by,
                 (r.gateway_refund_id IS NULL AND now() > public.saudi_add_business_days(r.entitled_at, 3))
                   OR (r.gateway_refund_id IS NOT NULL AND COALESCE(r.processed_at, now()) > public.saudi_add_business_days(r.entitled_at, 3)) AS initiation_late,
                 (r.gateway_succeeded_at IS NULL AND now() > COALESCE(bk.cancelled_at, r.entitled_at) + INTERVAL '14 days')
                   OR (r.gateway_succeeded_at > COALESCE(bk.cancelled_at, r.entitled_at) + INTERVAL '14 days') AS completion_late,
                 public.refund_tap_check_due(r) AS tap_check_due
            FROM public.refund_requests r LEFT JOIN public.bookings bk ON bk.id = r.booking_id
           WHERE r.gateway_succeeded_at IS NULL OR r.gateway_succeeded_at > now() - INTERVAL '30 days'
           ORDER BY r.entitled_at LIMIT 100) x;

  PERFORM public.write_audit_log('reconciliation.read', 'reconciliation_breaks', NULL,
    jsonb_build_object('status', v_status, 'limit', v_limit, 'offset', v_offset, 'rows', jsonb_array_length(v_breaks)));
  RETURN jsonb_build_object(
    'breaks', v_breaks,
    'counts', COALESCE((SELECT jsonb_object_agg(status, n) FROM (SELECT status, COUNT(*) n FROM public.reconciliation_breaks GROUP BY status) c), '{}'::jsonb),
    'runs', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.business_day DESC)
                        FROM (SELECT business_day, status, counts, ran_at, run_count FROM public.tap_reconciliation_runs ORDER BY business_day DESC LIMIT 30) r), '[]'::jsonb),
    'refunds', v_refunds,
    'can_refund', public.admin_can('money.refund'));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reconciliation_overview(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reconciliation_overview(TEXT, INTEGER, INTEGER) TO authenticated;
