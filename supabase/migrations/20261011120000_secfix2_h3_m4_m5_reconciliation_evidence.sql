-- SECFIX-2 R2-H3, R2-M4, R2-M5 and R2-L6 (docs/reviews/2026-10-11-security-round2.md; D-Q9 and D-Q8 final decision texts).
--
-- R2-H3: one finance user could import typed "Tap" charge and refund objects through the console file import. They carried
-- the same weight as the Tap API import, auto-closed reconciliation breaks with no approval, and (unique on object type and
-- id, ON CONFLICT DO NOTHING) permanently shadowed the authoritative Tap record that arrived later.
--   * A console file import carries only settlement objects (Tap settlement file) and bank_credit lines (bank statement).
--     Charges and refunds come only from the Tap API import (service role).
--   * Every console import is maker-checker: it is staged as a 'reconciliation_import' request with the file's SHA-256 and is
--     applied only when a different money.ledger holder approves it. The same file cannot be staged twice. Imported events
--     carry their source, so the console shows which evidence came from a file.
--   * Uniqueness is per source. A Tap API object never collides with file evidence; an object that arrives again with a
--     different amount or status opens an 'evidence_conflict' break (the other source's version is stored beside it) instead
--     of being dropped silently.
--   * Charge and refund matching, and therefore auto-matching, use Tap API evidence only. Settlement and evidence-conflict
--     breaks never auto-close.
-- R2-M4: a break closed with any approved correction of any size. A correction cites a break only through
--   admin_propose_break_resolution (reason reconciliation_break, the break's Tap object). Its amount (the captured change, or
--   the net share change when nothing captured changes) counts towards the break's difference: corrections never exceed it,
--   a smaller one is recorded as partial and the break stays open until the cumulative corrections equal it.
-- R2-L6 (assumed, owner to confirm): break-glass is not available for a correction that resolves a reconciliation break.
-- R2-M5: payouts ignore open breaks. A provider with an open or escalated break cannot request a payout, and no payout or
--   manual settlement is released for it until the break is resolved; finance sees the held breaks in the payout list.

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

ALTER TABLE public.tap_reconciliation_imports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'applied',
  ADD COLUMN IF NOT EXISTS file_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS approval_request_id UUID,
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.tap_reconciliation_imports DROP CONSTRAINT IF EXISTS tap_reconciliation_imports_status_check;
ALTER TABLE public.tap_reconciliation_imports ADD CONSTRAINT tap_reconciliation_imports_status_check
  CHECK (status IN ('pending_approval', 'applied', 'rejected', 'withdrawn'));
ALTER TABLE public.tap_reconciliation_imports DROP CONSTRAINT IF EXISTS tap_reconciliation_imports_sha_check;
ALTER TABLE public.tap_reconciliation_imports ADD CONSTRAINT tap_reconciliation_imports_sha_check
  CHECK (file_sha256 IS NULL OR file_sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE public.tap_reconciliation_imports DROP CONSTRAINT IF EXISTS tap_reconciliation_imports_console_checked;
ALTER TABLE public.tap_reconciliation_imports ADD CONSTRAINT tap_reconciliation_imports_console_checked
  CHECK (source = 'tap_api' OR status <> 'applied' OR approved_by IS NULL OR approved_by IS DISTINCT FROM imported_by);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tap_imports_file ON public.tap_reconciliation_imports (source, business_day, file_sha256)
  WHERE file_sha256 IS NOT NULL AND status IN ('pending_approval', 'applied');

ALTER TABLE public.tap_reconciliation_events ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.tap_reconciliation_events DISABLE TRIGGER trg_money_append_only;
UPDATE public.tap_reconciliation_events e SET source = i.source FROM public.tap_reconciliation_imports i WHERE i.id = e.import_id AND e.source IS NULL;
ALTER TABLE public.tap_reconciliation_events ENABLE TRIGGER trg_money_append_only;
ALTER TABLE public.tap_reconciliation_events ALTER COLUMN source SET NOT NULL;
ALTER TABLE public.tap_reconciliation_events DROP CONSTRAINT IF EXISTS tap_reconciliation_events_source_check;
ALTER TABLE public.tap_reconciliation_events ADD CONSTRAINT tap_reconciliation_events_source_check
  CHECK (source IN ('tap_api', 'tap_settlement_file', 'bank_statement'));
ALTER TABLE public.tap_reconciliation_events DROP CONSTRAINT IF EXISTS tap_reconciliation_events_object_type_tap_object_id_key;
ALTER TABLE public.tap_reconciliation_events DROP CONSTRAINT IF EXISTS tap_reconciliation_events_source_object_key;
ALTER TABLE public.tap_reconciliation_events ADD CONSTRAINT tap_reconciliation_events_source_object_key UNIQUE (source, object_type, tap_object_id);
CREATE INDEX IF NOT EXISTS idx_tap_events_object ON public.tap_reconciliation_events (object_type, tap_object_id);

ALTER TABLE public.reconciliation_breaks DROP CONSTRAINT IF EXISTS reconciliation_breaks_kind_check;
ALTER TABLE public.reconciliation_breaks ADD CONSTRAINT reconciliation_breaks_kind_check CHECK (kind IN (
  'charge_missing_in_ledger', 'ledger_missing_at_tap', 'charge_amount_mismatch', 'refund_missing_in_ledger', 'refund_missing_at_tap',
  'refund_amount_mismatch', 'refund_failed_at_tap', 'settlement_missing_in_bank', 'settlement_amount_mismatch', 'evidence_conflict'));
ALTER TABLE public.reconciliation_breaks ADD COLUMN IF NOT EXISTS corrected_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.reconciliation_breaks DROP CONSTRAINT IF EXISTS reconciliation_breaks_corrected_check;
ALTER TABLE public.reconciliation_breaks ADD CONSTRAINT reconciliation_breaks_corrected_check
  CHECK (corrected_amount >= 0 AND corrected_amount <= abs(COALESCE(difference, 0)));

ALTER TABLE public.admin_approval_requests DROP CONSTRAINT IF EXISTS admin_approval_requests_kind_check;
ALTER TABLE public.admin_approval_requests ADD CONSTRAINT admin_approval_requests_kind_check CHECK (kind IN (
  'payout_release', 'refund', 'iban_change', 'setting_change', 'ledger_settlement', 'ledger_adjustment', 'fee_rule_change',
  'payout_hold', 'reward_program', 'role_change', 'booking_cancellation', 'reconciliation_import'));

CREATE OR REPLACE FUNCTION public.governance_approver_permission(p_kind TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_kind
    WHEN 'payout_release' THEN 'money.payout'
    WHEN 'refund' THEN 'money.refund'
    WHEN 'booking_cancellation' THEN 'money.refund'
    WHEN 'iban_change' THEN 'iban.approve'
    WHEN 'setting_change' THEN 'money.config'
    WHEN 'ledger_settlement' THEN 'money.payout'
    WHEN 'ledger_adjustment' THEN 'money.ledger'
    WHEN 'reconciliation_import' THEN 'money.ledger'
    WHEN 'fee_rule_change' THEN 'money.config'
    WHEN 'payout_hold' THEN 'money.payout'
    WHEN 'reward_program' THEN 'rewards.approve'
    WHEN 'role_change' THEN 'roles.manage'
  END;
$$;

SELECT pg_temp.patch_function('public.governance_execute(uuid)'::regprocedure,
$from$                       'booking_cancellation') THEN$from$,
$to$                       'booking_cancellation', 'reconciliation_import') THEN$to$);

-- A rejected or withdrawn import is marked as such.
SELECT pg_temp.patch_function('public.admin_decide_approval(uuid,text,text)'::regprocedure,
$from$    IF v_req.kind = 'iban_change' THEN
      PERFORM public.gov_reject_payout_destination(v_req.target_id);
    END IF;$from$,
$to$    IF v_req.kind = 'iban_change' THEN
      PERFORM public.gov_reject_payout_destination(v_req.target_id);
    END IF;
    IF v_req.kind = 'reconciliation_import' THEN
      UPDATE public.tap_reconciliation_imports SET status = 'rejected' WHERE id = v_req.target_id AND status = 'pending_approval';
    END IF;$to$);
SELECT pg_temp.patch_function('public.admin_cancel_approval(uuid,text)'::regprocedure,
$from$  UPDATE public.admin_approval_requests SET status = 'cancelled', decided_by = auth.uid(), decided_at = now(), decision_reason = v_reason
   WHERE id = v_req.id;$from$,
$to$  UPDATE public.admin_approval_requests SET status = 'cancelled', decided_by = auth.uid(), decided_at = now(), decision_reason = v_reason
   WHERE id = v_req.id;
  IF v_req.kind = 'reconciliation_import' THEN
    UPDATE public.tap_reconciliation_imports SET status = 'withdrawn' WHERE id = v_req.target_id AND status = 'pending_approval';
  END IF;$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Evidence: validation, storage per source, conflicts
-- ---------------------------------------------------------------------------------------------------------------------

-- Checks a batch for a source without storing anything. Charges and refunds come only from the Tap API.
CREATE OR REPLACE FUNCTION public.reconciliation_validate_events(p_source TEXT, p_business_day DATE, p_events JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event JSONB;
  v_type TEXT;
  v_allowed TEXT[] := CASE p_source
    WHEN 'tap_api' THEN ARRAY['charge', 'refund', 'settlement']
    WHEN 'tap_settlement_file' THEN ARRAY['settlement']
    WHEN 'bank_statement' THEN ARRAY['bank_credit'] END;
BEGIN
  IF v_allowed IS NULL THEN
    RAISE EXCEPTION 'Unknown evidence source' USING ERRCODE = '22023';
  END IF;
  IF p_business_day IS NULL OR p_business_day > (now() AT TIME ZONE 'Asia/Riyadh')::date THEN
    RAISE EXCEPTION 'The business day is a date up to today' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_events) IS DISTINCT FROM 'array' OR jsonb_array_length(p_events) > 5000 THEN
    RAISE EXCEPTION 'The events are a list of at most 5000 objects' USING ERRCODE = '22023';
  END IF;
  FOR v_event IN SELECT * FROM jsonb_array_elements(p_events) LOOP
    v_type := v_event->>'object_type';
    IF v_type IS NULL OR NOT (v_type = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Object % is a % and this source (%) may carry only %: charges and refunds come only from the Tap API',
        COALESCE(v_event->>'tap_object_id', '?'), COALESCE(v_type, 'object of no type'), p_source, array_to_string(v_allowed, ', ')
        USING ERRCODE = '22023', HINT = 'object_type_not_allowed_for_source';
    END IF;
    IF NULLIF(btrim(COALESCE(v_event->>'tap_object_id', '')), '') IS NULL OR (v_event->>'amount') IS NULL
       OR (v_event->>'amount') !~ '^-?[0-9]+(\.[0-9]{1,2})?$' OR upper(COALESCE(v_event->>'currency', '')) <> 'SAR' THEN
      RAISE EXCEPTION 'Every object needs an id, an amount with at most 2 decimals and currency SAR' USING ERRCODE = '22023';
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.reconciliation_validate_events(TEXT, DATE, JSONB) FROM PUBLIC, anon, authenticated;

-- Stores a validated batch under an import. An object already known with a different amount or status opens an
-- evidence_conflict break naming both versions; a version from another source is still stored next to it (each source keeps
-- its own row), a second version from the same source is not. Nothing is dropped silently.
CREATE OR REPLACE FUNCTION public.reconciliation_store_events(p_import_id UUID, p_source TEXT, p_business_day DATE, p_events JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event JSONB;
  v_type TEXT;
  v_id TEXT;
  v_amount NUMERIC(12,2);
  v_status TEXT;
  v_other public.tap_reconciliation_events;
  v_new INTEGER := 0;
  v_same INTEGER := 0;
  v_conflicts INTEGER := 0;
BEGIN
  FOR v_event IN SELECT * FROM jsonb_array_elements(p_events) LOOP
    v_type := v_event->>'object_type';
    v_id := btrim(v_event->>'tap_object_id');
    v_amount := (v_event->>'amount')::numeric;
    v_status := upper(COALESCE(NULLIF(v_event->>'status', ''), 'RECORDED'));
    SELECT * INTO v_other FROM public.tap_reconciliation_events
     WHERE object_type = v_type AND tap_object_id = v_id AND (amount <> v_amount OR status <> v_status)
     ORDER BY (source = 'tap_api') DESC, created_at LIMIT 1;
    IF v_other.id IS NOT NULL THEN
      v_conflicts := v_conflicts + public.reconciliation_open_break(p_business_day, 'evidence_conflict',
        v_type || ':' || v_id || ':' || p_source, v_id, NULL, NULL, v_amount, v_other.amount);
      PERFORM public.write_audit_log('reconciliation.evidence_conflict', 'tap_reconciliation_events', v_other.id,
        jsonb_build_object('object_type', v_type, 'tap_object_id', v_id, 'incoming_source', p_source, 'incoming_amount', v_amount,
                           'incoming_status', v_status, 'recorded_source', v_other.source, 'recorded_amount', v_other.amount,
                           'recorded_status', v_other.status, 'import_id', p_import_id));
      -- The same source cannot hold two versions of an object; another source's version is kept next to it.
      CONTINUE WHEN v_other.source = p_source;
    END IF;
    INSERT INTO public.tap_reconciliation_events (import_id, source, object_type, tap_object_id, charge_id, reference, amount, currency, status,
                                                  occurred_at, business_day)
    VALUES (p_import_id, p_source, v_type, v_id, NULLIF(btrim(COALESCE(v_event->>'charge_id', '')), ''),
            NULLIF(btrim(COALESCE(v_event->>'reference', '')), ''), v_amount, 'SAR', v_status,
            COALESCE((v_event->>'occurred_at')::timestamptz, now()), p_business_day)
    ON CONFLICT (source, object_type, tap_object_id) DO NOTHING;
    IF FOUND THEN v_new := v_new + 1; ELSE v_same := v_same + 1; END IF;
  END LOOP;
  UPDATE public.tap_reconciliation_imports SET object_count = v_new WHERE id = p_import_id;
  RETURN jsonb_build_object('import_id', p_import_id, 'received', jsonb_array_length(p_events), 'new', v_new, 'already_recorded', v_same,
                            'conflicts', v_conflicts);
END;
$$;
REVOKE ALL ON FUNCTION public.reconciliation_store_events(UUID, TEXT, DATE, JSONB) FROM PUBLIC, anon, authenticated;

-- The Tap API path (service role) keeps its name and contract.
CREATE OR REPLACE FUNCTION public.reconciliation_insert_events(p_source TEXT, p_business_day DATE, p_events JSONB, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_import UUID;
  v_result JSONB;
BEGIN
  IF p_source <> 'tap_api' THEN
    RAISE EXCEPTION 'A console file is imported only through an approved reconciliation_import request' USING ERRCODE = '42501';
  END IF;
  PERFORM public.reconciliation_validate_events(p_source, p_business_day, p_events);
  INSERT INTO public.tap_reconciliation_imports (source, business_day, imported_by, reason, status)
  VALUES (p_source, p_business_day, auth.uid(), p_reason, 'applied') RETURNING id INTO v_import;
  v_result := public.reconciliation_store_events(v_import, p_source, p_business_day, p_events);
  PERFORM public.write_audit_log('reconciliation.imported', 'tap_reconciliation_imports', v_import,
    jsonb_build_object('source', p_source, 'business_day', p_business_day, 'reason', p_reason) || v_result);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.reconciliation_insert_events(TEXT, DATE, JSONB, TEXT) FROM PUBLIC, anon, authenticated;

-- Finance stages a Tap settlement file or the settlement bank statement; a different money.ledger holder applies it.
CREATE OR REPLACE FUNCTION public.admin_import_reconciliation_file(p_source TEXT, p_business_day DATE, p_rows JSONB, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_sha TEXT;
  v_import UUID;
  v_total NUMERIC;
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
  PERFORM public.reconciliation_validate_events(p_source, p_business_day, p_rows);
  IF jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'The file has no rows' USING ERRCODE = '22023';
  END IF;
  v_sha := encode(extensions.digest(convert_to(p_rows::text, 'UTF8'), 'sha256'), 'hex');
  IF EXISTS (SELECT 1 FROM public.tap_reconciliation_imports WHERE source = p_source AND business_day = p_business_day
                AND file_sha256 = v_sha AND status IN ('pending_approval', 'applied')) THEN
    RAISE EXCEPTION 'This file was already imported or is waiting for approval for that day' USING ERRCODE = '23505', HINT = 'duplicate_file';
  END IF;
  SELECT COALESCE(SUM((r->>'amount')::numeric), 0) INTO v_total FROM jsonb_array_elements(p_rows) r;
  INSERT INTO public.tap_reconciliation_imports (source, business_day, imported_by, reason, status, file_sha256, object_count)
  VALUES (p_source, p_business_day, auth.uid(), v_reason, 'pending_approval', v_sha, 0) RETURNING id INTO v_import;
  RETURN public.governance_request('reconciliation_import', 'tap_reconciliation_imports', v_import, abs(v_total),
      jsonb_build_object('source', p_source, 'business_day', p_business_day, 'rows', p_rows, 'file_sha256', v_sha),
      v_reason,
      jsonb_build_object('source', p_source, 'business_day', p_business_day, 'row_count', jsonb_array_length(p_rows), 'total_sar', v_total,
                         'file_sha256', v_sha))
    || jsonb_build_object('import_id', v_import, 'file_sha256', v_sha);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_import_reconciliation_file(TEXT, DATE, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_import_reconciliation_file(TEXT, DATE, JSONB, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.gov_exec_reconciliation_import(p_req public.admin_approval_requests)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_import public.tap_reconciliation_imports;
  v_result JSONB;
BEGIN
  IF NOT public.governance_execution_active('reconciliation_import', p_req.target_id) THEN
    RAISE EXCEPTION 'A reconciliation file is applied only as an approved request' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_import FROM public.tap_reconciliation_imports WHERE id = p_req.target_id FOR UPDATE;
  IF v_import.id IS NULL OR v_import.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'This import is no longer waiting for approval' USING ERRCODE = '22023';
  END IF;
  IF encode(extensions.digest(convert_to((p_req.payload->'rows')::text, 'UTF8'), 'sha256'), 'hex') IS DISTINCT FROM v_import.file_sha256 THEN
    RAISE EXCEPTION 'The staged rows do not match the file that was submitted' USING ERRCODE = '22023';
  END IF;
  PERFORM public.reconciliation_validate_events(v_import.source, v_import.business_day, p_req.payload->'rows');
  v_result := public.reconciliation_store_events(v_import.id, v_import.source, v_import.business_day, p_req.payload->'rows');
  UPDATE public.tap_reconciliation_imports
     SET status = 'applied', approved_by = auth.uid(), approved_at = now(), approval_request_id = p_req.id
   WHERE id = v_import.id;
  PERFORM public.write_audit_log('reconciliation.imported', 'tap_reconciliation_imports', v_import.id,
    jsonb_build_object('source', v_import.source, 'business_day', v_import.business_day, 'reason', v_import.reason,
                       'file_sha256', v_import.file_sha256, 'maker', v_import.imported_by, 'checker', auth.uid(),
                       'approval_request_id', p_req.id) || v_result);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.gov_exec_reconciliation_import(public.admin_approval_requests) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. The daily run matches charges and refunds on Tap API evidence only
-- ---------------------------------------------------------------------------------------------------------------------

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
  -- Charges and refunds are matched only against what Tap's API returned (R2-H3).
  v_has_tap := EXISTS (SELECT 1 FROM public.tap_reconciliation_imports WHERE business_day = p_business_day AND source = 'tap_api' AND status = 'applied');
  v_has_settlements := EXISTS (SELECT 1 FROM public.tap_reconciliation_events WHERE business_day = p_business_day AND object_type = 'settlement');

  IF v_has_tap THEN
    FOR r IN SELECT e.tap_object_id, e.amount, l.id AS ledger_id, l.total_captured
               FROM public.tap_reconciliation_events e
               LEFT JOIN public.transactional_ledger l ON l.payment_intent_id = e.tap_object_id
              WHERE e.business_day = p_business_day AND e.source = 'tap_api' AND e.object_type = 'charge'
                AND e.status IN ('CAPTURED', 'SUCCEEDED', 'PAID') LOOP
      IF r.ledger_id IS NULL THEN
        v_seen := v_seen || ('charge_missing_in_ledger:' || r.tap_object_id);
        v_opened := v_opened + public.reconciliation_open_break(p_business_day, 'charge_missing_in_ledger', r.tap_object_id, r.tap_object_id, NULL, NULL, r.amount, NULL);
      ELSIF r.total_captured <> r.amount THEN
        v_seen := v_seen || ('charge_amount_mismatch:' || r.tap_object_id);
        v_opened := v_opened + public.reconciliation_open_break(p_business_day, 'charge_amount_mismatch', r.tap_object_id, r.tap_object_id, r.ledger_id, NULL, r.amount, r.total_captured);
      END IF;
    END LOOP;
    FOR r IN SELECT l.id, l.payment_intent_id, l.total_captured FROM public.transactional_ledger l
              WHERE l.created_at >= v_start AND l.created_at < v_end AND l.total_captured > 0
                AND l.entry_type IN ('booking_payment', 'tip', 'package_sale', 'gift_card_sale', 'subscription')
                AND l.payment_intent_id LIKE 'chg\_%'
                AND NOT EXISTS (SELECT 1 FROM public.tap_reconciliation_events e
                                 WHERE e.source = 'tap_api' AND e.object_type = 'charge' AND e.tap_object_id = l.payment_intent_id) LOOP
      v_seen := v_seen || ('ledger_missing_at_tap:' || r.payment_intent_id);
      v_opened := v_opened + public.reconciliation_open_break(p_business_day, 'ledger_missing_at_tap', r.payment_intent_id, r.payment_intent_id, r.id, NULL, NULL, r.total_captured);
    END LOOP;
    FOR r IN SELECT e.tap_object_id, e.amount, rr.id AS refund_id, rr.amount AS recorded, rr.ledger_id
               FROM public.tap_reconciliation_events e
               LEFT JOIN public.refund_requests rr ON rr.gateway_refund_id = e.tap_object_id
              WHERE e.business_day = p_business_day AND e.source = 'tap_api' AND e.object_type = 'refund'
                AND e.status IN ('REFUNDED', 'SUCCESS', 'SUCCEEDED') LOOP
      IF r.refund_id IS NULL THEN
        v_seen := v_seen || ('refund_missing_in_ledger:' || r.tap_object_id);
        v_opened := v_opened + public.reconciliation_open_break(p_business_day, 'refund_missing_in_ledger', r.tap_object_id, r.tap_object_id, NULL, NULL, r.amount, NULL);
      ELSIF r.recorded <> r.amount THEN
        v_seen := v_seen || ('refund_amount_mismatch:' || r.tap_object_id);
        v_opened := v_opened + public.reconciliation_open_break(p_business_day, 'refund_amount_mismatch', r.tap_object_id, r.tap_object_id, r.ledger_id, r.refund_id, r.amount, r.recorded);
      END IF;
    END LOOP;
    FOR r IN SELECT rr.id, rr.gateway_refund_id, rr.amount, rr.ledger_id FROM public.refund_requests rr
              WHERE rr.status = 'succeeded' AND rr.gateway_refund_id IS NOT NULL AND rr.processed_at >= v_start AND rr.processed_at < v_end
                AND NOT EXISTS (SELECT 1 FROM public.tap_reconciliation_events e
                                 WHERE e.source = 'tap_api' AND e.object_type = 'refund' AND e.tap_object_id = rr.gateway_refund_id) LOOP
      v_seen := v_seen || ('refund_missing_at_tap:' || r.gateway_refund_id);
      v_opened := v_opened + public.reconciliation_open_break(p_business_day, 'refund_missing_at_tap', r.gateway_refund_id, r.gateway_refund_id, r.ledger_id, r.id, NULL, r.amount);
    END LOOP;
  END IF;

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

  -- A charge or refund break that Tap's API data now matches was a timing difference: closed as auto-matched. File evidence never
  -- closes a break; settlement, failed-refund and evidence-conflict breaks close only through an approved correction.
  IF v_has_tap THEN
    FOR r IN SELECT id FROM public.reconciliation_breaks
              WHERE business_day = p_business_day AND status IN ('open', 'escalated')
                AND kind IN ('charge_missing_in_ledger', 'ledger_missing_at_tap', 'charge_amount_mismatch', 'refund_missing_in_ledger',
                             'refund_missing_at_tap', 'refund_amount_mismatch')
                AND corrected_amount = 0
                AND NOT ((kind || ':' || subject) = ANY (v_seen)) LOOP
      UPDATE public.reconciliation_breaks SET status = 'auto_matched', resolved_at = now() WHERE id = r.id;
      v_auto := v_auto + 1;
    END LOOP;
  END IF;

  v_counts := jsonb_build_object(
    'tap_charges', (SELECT COUNT(*) FROM public.tap_reconciliation_events WHERE business_day = p_business_day AND source = 'tap_api' AND object_type = 'charge'),
    'tap_refunds', (SELECT COUNT(*) FROM public.tap_reconciliation_events WHERE business_day = p_business_day AND source = 'tap_api' AND object_type = 'refund'),
    'tap_settlements', (SELECT COUNT(*) FROM public.tap_reconciliation_events WHERE business_day = p_business_day AND object_type = 'settlement'),
    'file_events', (SELECT COUNT(*) FROM public.tap_reconciliation_events WHERE business_day = p_business_day AND source <> 'tap_api'),
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

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. R2-M4: a break is corrected only through admin_propose_break_resolution, by the amount it is short
-- ---------------------------------------------------------------------------------------------------------------------

-- How much of a break a correction covers: the captured change, or the net share change when nothing captured changes.
CREATE OR REPLACE FUNCTION public.reconciliation_correction_amount(p_captured NUMERIC, p_provider NUMERIC, p_platform NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN COALESCE(p_captured, 0) <> 0 THEN abs(p_captured) ELSE abs(COALESCE(p_provider, 0) + COALESCE(p_platform, 0)) END;
$$;
REVOKE ALL ON FUNCTION public.reconciliation_correction_amount(NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;

SELECT pg_temp.patch_function(
  'public.admin_propose_ledger_adjustment(uuid,text,numeric,numeric,text,text,text,text,uuid,numeric,uuid)'::regprocedure,
$from$  IF p_reason_code = 'reconciliation_break' AND v_tap IS NULL THEN$from$,
$to$  -- SECFIX-2 R2-M4: a correction cites a reconciliation break only through admin_propose_break_resolution.
  IF p_break_id IS NOT NULL AND COALESCE(current_setting('primora.break_resolution', true), '') IS DISTINCT FROM p_break_id::text THEN
    RAISE EXCEPTION 'A correction that resolves a reconciliation break is proposed with admin_propose_break_resolution'
      USING ERRCODE = '22023', HINT = 'use_admin_propose_break_resolution';
  END IF;
  IF p_reason_code = 'reconciliation_break' AND v_tap IS NULL THEN$to$);

CREATE OR REPLACE FUNCTION public.admin_propose_break_resolution(p_break_id UUID, p_provider_share_delta NUMERIC, p_platform_share_delta NUMERIC,
  p_justification TEXT, p_idempotency_key TEXT, p_captured_delta NUMERIC DEFAULT 0)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_break public.reconciliation_breaks;
  v_amount NUMERIC(12,2);
  v_pending NUMERIC(12,2);
  v_target NUMERIC(12,2);
  v_result JSONB;
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('money.ledger') THEN
    RAISE EXCEPTION 'Your console role cannot resolve reconciliation breaks' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_break FROM public.reconciliation_breaks WHERE id = p_break_id FOR UPDATE;
  IF v_break.id IS NULL THEN
    RAISE EXCEPTION 'Reconciliation break not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_break.status NOT IN ('open', 'escalated') THEN
    RAISE EXCEPTION 'This break is already %', v_break.status USING ERRCODE = '22023';
  END IF;
  IF v_break.tap_object_id IS NULL THEN
    RAISE EXCEPTION 'This break names no Tap object to cite' USING ERRCODE = '22023';
  END IF;
  v_target := abs(COALESCE(v_break.difference, 0));
  v_amount := public.reconciliation_correction_amount(p_captured_delta, p_provider_share_delta, p_platform_share_delta);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'The correction does not change the amount the break is about' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(SUM(public.reconciliation_correction_amount((a.payload->>'captured_delta')::numeric, (a.payload->>'provider_share_delta')::numeric,
                                                              (a.payload->>'platform_share_delta')::numeric)), 0)
    INTO v_pending FROM public.admin_approval_requests a
   WHERE a.kind = 'ledger_adjustment' AND a.status IN ('pending', 'executing') AND a.payload->>'break_id' = v_break.id::text;
  IF v_break.corrected_amount + v_pending + v_amount > v_target THEN
    RAISE EXCEPTION 'The break is SAR %; SAR % is corrected and SAR % is waiting for approval, so at most SAR % can still be proposed',
      v_target, v_break.corrected_amount, v_pending, GREATEST(v_target - v_break.corrected_amount - v_pending, 0)
      USING ERRCODE = '22023', HINT = 'correction_exceeds_break';
  END IF;
  PERFORM set_config('primora.break_resolution', v_break.id::text, true);
  v_result := public.admin_propose_ledger_adjustment(v_break.ledger_id, 'adjustment', p_provider_share_delta, p_platform_share_delta,
    'reconciliation_break', p_justification, p_idempotency_key, v_break.tap_object_id, v_break.provider_id, p_captured_delta, v_break.id);
  PERFORM set_config('primora.break_resolution', '', true);
  -- The approver sees the break next to the correction.
  UPDATE public.admin_approval_requests
     SET summary = summary || jsonb_build_object('break_kind', v_break.kind, 'break_difference', v_break.difference,
                                                'break_corrected_before', v_break.corrected_amount, 'correction_amount', v_amount,
                                                'partial', v_break.corrected_amount + v_amount < v_target)
   WHERE id = (v_result->>'approval_id')::uuid AND status = 'pending';
  RETURN v_result || jsonb_build_object('break_difference', v_break.difference, 'correction_amount', v_amount,
                                        'partial', v_break.corrected_amount + v_amount < v_target);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_propose_break_resolution(UUID, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_propose_break_resolution(UUID, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC) TO authenticated;

-- An approved correction counts towards the break; the break resolves when the corrections equal it.
SELECT pg_temp.patch_function('public.gov_exec_ledger_adjustment(admin_approval_requests)'::regprocedure,
$from$  IF (v_p->>'break_id') IS NOT NULL AND to_regclass('public.reconciliation_breaks') IS NOT NULL THEN
    EXECUTE 'UPDATE public.reconciliation_breaks SET status = ''resolved'', resolved_at = now(), resolved_by = auth.uid(),
               resolution_entry_id = $1, approval_request_id = $2 WHERE id = $3 AND status IN (''open'', ''escalated'')'
      USING v_id, p_req.id, (v_p->>'break_id')::uuid;
  END IF;$from$,
$to$  IF (v_p->>'break_id') IS NOT NULL THEN
    PERFORM public.reconciliation_apply_correction((v_p->>'break_id')::uuid, v_id, p_req.id,
      public.reconciliation_correction_amount(v_cap, v_prov, v_plat));
  END IF;$to$);

CREATE OR REPLACE FUNCTION public.reconciliation_apply_correction(p_break_id UUID, p_entry_id UUID, p_request_id UUID, p_amount NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_break public.reconciliation_breaks;
  v_total NUMERIC(12,2);
BEGIN
  SELECT * INTO v_break FROM public.reconciliation_breaks WHERE id = p_break_id FOR UPDATE;
  IF v_break.id IS NULL OR v_break.status NOT IN ('open', 'escalated') THEN
    RAISE EXCEPTION 'The reconciliation break this correction cites is no longer open' USING ERRCODE = '22023';
  END IF;
  v_total := v_break.corrected_amount + COALESCE(p_amount, 0);
  IF v_total > abs(COALESCE(v_break.difference, 0)) THEN
    RAISE EXCEPTION 'The correction would exceed the break (SAR % of SAR %)', v_total, abs(COALESCE(v_break.difference, 0)) USING ERRCODE = '22023';
  END IF;
  IF v_total = abs(COALESCE(v_break.difference, 0)) THEN
    UPDATE public.reconciliation_breaks SET corrected_amount = v_total, status = 'resolved', resolved_at = now(), resolved_by = auth.uid(),
           resolution_entry_id = p_entry_id, approval_request_id = p_request_id
     WHERE id = v_break.id;
  ELSE
    UPDATE public.reconciliation_breaks SET corrected_amount = v_total WHERE id = v_break.id;
  END IF;
  PERFORM public.write_audit_log(CASE WHEN v_total = abs(COALESCE(v_break.difference, 0)) THEN 'reconciliation.break_resolved' ELSE 'reconciliation.break_partly_corrected' END,
    'reconciliation_breaks', v_break.id,
    jsonb_build_object('kind', v_break.kind, 'difference', v_break.difference, 'correction', p_amount, 'corrected_total', v_total,
                       'entry_id', p_entry_id, 'approval_request_id', p_request_id));
END;
$$;
REVOKE ALL ON FUNCTION public.reconciliation_apply_correction(UUID, UUID, UUID, NUMERIC) FROM PUBLIC, anon, authenticated;

-- R2-L6: break-glass never resolves a reconciliation break (D-Q9 "approved adjustments"); recorded as an assumed decision.
SELECT pg_temp.patch_function('public.admin_break_glass_execute(uuid,text)'::regprocedure,
$from$  IF v_req.requested_by <> auth.uid() THEN$from$,
$to$  IF v_req.kind = 'ledger_adjustment' AND (v_req.payload->>'break_id') IS NOT NULL THEN
    RAISE EXCEPTION 'A correction that resolves a reconciliation break always waits for a second person; break-glass is not available'
      USING ERRCODE = '42501', HINT = 'break_resolution_needs_second_person';
  END IF;
  IF v_req.requested_by <> auth.uid() THEN$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. R2-M5: payouts wait while the provider has an open reconciliation break
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.provider_reconciliation_hold(p_provider_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN COUNT(*) = 0 THEN NULL
              ELSE jsonb_build_object('open_breaks', COUNT(*), 'amount_sar', COALESCE(SUM(abs(COALESCE(b.difference, 0)) - b.corrected_amount), 0),
                                      'oldest_business_day', MIN(b.business_day)) END
    FROM public.reconciliation_breaks b
   WHERE b.provider_id = p_provider_id AND b.status IN ('open', 'escalated');
$$;
REVOKE ALL ON FUNCTION public.provider_reconciliation_hold(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refuse_payout_while_reconciliation_open(p_provider_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold JSONB := public.provider_reconciliation_hold(p_provider_id);
BEGIN
  IF v_hold IS NOT NULL THEN
    RAISE EXCEPTION 'Payouts wait until % open reconciliation break(s) for SAR % are resolved with Tap (since %)',
      v_hold->>'open_breaks', v_hold->>'amount_sar', v_hold->>'oldest_business_day'
      USING ERRCODE = '22023', HINT = 'reconciliation_break_open';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.refuse_payout_while_reconciliation_open(UUID) FROM PUBLIC, anon, authenticated;

SELECT pg_temp.patch_function('public.request_provider_payout(uuid,numeric,text,text)'::regprocedure,
$from$  PERFORM 1 FROM public.providers WHERE id = p_provider_id FOR UPDATE;$from$,
$to$  PERFORM 1 FROM public.providers WHERE id = p_provider_id FOR UPDATE;
  PERFORM public.refuse_payout_while_reconciliation_open(p_provider_id);$to$);

SELECT pg_temp.patch_function('public.admin_release_payout(uuid,text,text,text)'::regprocedure,
$from$  -- Maker-checker (D-Q5): without an approved request being executed, this records the request for a second administrator.$from$,
$to$  PERFORM public.refuse_payout_while_reconciliation_open(v_request.provider_id);
  -- Maker-checker (D-Q5): without an approved request being executed, this records the request for a second administrator.$to$);

SELECT pg_temp.patch_function('public.admin_release_ledger_item(uuid,text,text,text)'::regprocedure,
$from$  v_open := v_row.provider_share;$from$,
$to$  PERFORM public.refuse_payout_while_reconciliation_open(v_row.provider_id);
  v_open := v_row.provider_share;$to$);

-- Finance sees the held breaks next to each payout request.
SELECT pg_temp.patch_function('public.admin_list_payout_requests(text,uuid,integer,integer,text)'::regprocedure,
$from$             jsonb_build_object('business_name_en', pr.business_name_en, 'business_name_ar', pr.business_name_ar) AS providers$from$,
$to$             jsonb_build_object('business_name_en', pr.business_name_en, 'business_name_ar', pr.business_name_ar) AS providers,
             public.provider_reconciliation_hold(r.provider_id) AS reconciliation_hold$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. The console screen shows where evidence came from and the staged imports
-- ---------------------------------------------------------------------------------------------------------------------

SELECT pg_temp.patch_function('public.admin_reconciliation_overview(text,integer,integer)'::regprocedure,
$from$    'refunds', v_refunds,$from$,
$to$    'refunds', v_refunds,
    'imports', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.imported_at DESC)
                           FROM (SELECT i.id, i.source, i.business_day, i.imported_at, i.imported_by, i.object_count, i.status, i.file_sha256,
                                        i.approval_request_id, i.approved_by, i.approved_at, i.reason
                                   FROM public.tap_reconciliation_imports i ORDER BY i.imported_at DESC LIMIT 30) i), '[]'::jsonb),$to$);
SELECT pg_temp.patch_function('public.admin_reconciliation_overview(text,integer,integer)'::regprocedure,
$from$                 b.difference, b.status,$from$,
$to$                 b.difference, b.corrected_amount, b.status,$to$);
