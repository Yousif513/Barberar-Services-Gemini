-- SECFIX-2 R2-H4 (docs/reviews/2026-10-11-security-round2.md; GOV-1 review H-3 remainder; D-Q5 and Q3 final decision texts).
--
-- governance_notifications rows were queued with a verified destination, but nothing ever read them: the provider was never
-- told their bank account changed, owners never heard about break-glass or a new MFA factor, and the 48-hour IBAN hold was a
-- control nobody could notice.
--   * The deliver-governance-notices Edge Function (scheduled, service role) claims due rows, sends them through the provider
--     configured only by environment variables, and records each outcome here. Nothing is ever marked sent without the
--     provider accepting the message. While no sender is configured for a channel, its rows are marked
--     'undeliverable: no sender configured' (visible in the console) and are picked up again once a sender is configured.
--   * Retries back off exponentially (2^attempts minutes, at most 6 hours); after 8 attempts a row is failed for good.
--   * A changed payout account is not paid until a change notice for it reached 'sent', or a second person (iban.approve,
--     not the requester and not the approver of the change) waived it with a written reason. Every payout and manual
--     settlement path checks this.
--   * The provider (email and SMS) is an owner decision: gap governance-notice-sender-not-chosen.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Delivery state on the outbox
-- ---------------------------------------------------------------------------------------------------------------------

ALTER TABLE public.governance_notifications
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS waived_by UUID,
  ADD COLUMN IF NOT EXISTS waived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS waive_reason TEXT;
ALTER TABLE public.governance_notifications DROP CONSTRAINT IF EXISTS governance_notifications_status_check;
ALTER TABLE public.governance_notifications ADD CONSTRAINT governance_notifications_status_check
  CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped', 'undeliverable', 'waived'));
ALTER TABLE public.governance_notifications DROP CONSTRAINT IF EXISTS governance_notifications_sent_check;
ALTER TABLE public.governance_notifications ADD CONSTRAINT governance_notifications_sent_check
  CHECK (status <> 'sent' OR (sent_at IS NOT NULL AND provider_message_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_governance_notifications_due ON public.governance_notifications (next_attempt_at, created_at)
  WHERE status IN ('pending', 'undeliverable');

-- The console sees delivery state, never the address (GOV-FIX H-3 column grant extended to the new columns).
GRANT SELECT (attempts, next_attempt_at, last_attempt_at, waived_by, waived_at, waive_reason) ON public.governance_notifications TO authenticated;

ALTER TABLE public.provider_payout_destinations
  ADD COLUMN IF NOT EXISTS notice_waived_by UUID,
  ADD COLUMN IF NOT EXISTS notice_waived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notice_waive_reason TEXT;

-- The change notice names the account it is about.
SELECT pg_temp.patch_function('public.gov_request_payout_destination(uuid,text,text,text)'::regprocedure,
$from$    jsonb_build_object('provider_id', p_provider_id, 'iban_masked', public.mask_iban(v_iban), 'bank_name', v_dest.bank_name));$from$,
$to$    jsonb_build_object('provider_id', p_provider_id, 'iban_masked', public.mask_iban(v_iban), 'bank_name', v_dest.bank_name,
                       'destination_id', v_dest.id));$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. The worker's side (service role only)
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.governance_notices_claim(p_configured_channels TEXT[], p_limit INTEGER DEFAULT 25)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channels TEXT[] := ARRAY(SELECT DISTINCT c FROM unnest(COALESCE(p_configured_channels, '{}'::text[])) c WHERE c IN ('email', 'sms'));
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  v_unconfigured INTEGER;
  v_rows JSONB;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  -- A worker that stopped mid-send leaves rows in 'sending'; after 15 minutes they are due again.
  UPDATE public.governance_notifications SET status = 'pending', error_message = 'The previous attempt did not report back'
   WHERE status = 'sending' AND last_attempt_at < now() - INTERVAL '15 minutes';
  -- No sender for the channel: say so on the row, never pretend.
  UPDATE public.governance_notifications SET status = 'undeliverable', error_message = 'undeliverable: no sender configured',
         last_attempt_at = now()
   WHERE status = 'pending' AND NOT (channel = ANY (v_channels));
  GET DIAGNOSTICS v_unconfigured = ROW_COUNT;

  WITH due AS (
    SELECT n.id FROM public.governance_notifications n
     WHERE n.channel = ANY (v_channels) AND n.destination IS NOT NULL
       AND (n.status = 'pending' OR (n.status = 'undeliverable' AND n.error_message = 'undeliverable: no sender configured'))
       AND (n.next_attempt_at IS NULL OR n.next_attempt_at <= now())
     ORDER BY n.created_at
     LIMIT v_limit
     FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.governance_notifications n
       SET status = 'sending', attempts = n.attempts + 1, last_attempt_at = now()
      FROM due WHERE n.id = due.id
    RETURNING n.id, n.channel, n.destination, n.template_key, n.payload, n.attempts, n.created_at
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at), '[]'::jsonb) INTO v_rows FROM claimed c;
  RETURN jsonb_build_object('claimed', v_rows, 'marked_undeliverable', v_unconfigured);
END;
$$;
REVOKE ALL ON FUNCTION public.governance_notices_claim(TEXT[], INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.governance_notices_claim(TEXT[], INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.governance_notice_record_result(p_id UUID, p_outcome TEXT, p_error TEXT DEFAULT NULL,
                                                                  p_provider_message_id TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.governance_notifications;
  v_error TEXT := left(NULLIF(btrim(COALESCE(p_error, '')), ''), 500);
  v_message TEXT := left(NULLIF(btrim(COALESCE(p_provider_message_id, '')), ''), 200);
  v_status TEXT;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.governance_notifications WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Notice not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status <> 'sending' THEN
    RAISE EXCEPTION 'This notice is not being sent (status %)', v_row.status USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'sent' THEN
    IF v_message IS NULL THEN
      RAISE EXCEPTION 'A sent notice records the provider''s message id' USING ERRCODE = '22023';
    END IF;
    UPDATE public.governance_notifications SET status = 'sent', sent_at = now(), provider_message_id = v_message, error_message = NULL,
           next_attempt_at = NULL WHERE id = p_id;
    v_status := 'sent';
  ELSIF p_outcome = 'retry' AND v_row.attempts < 8 THEN
    UPDATE public.governance_notifications SET status = 'pending', error_message = COALESCE(v_error, 'The provider did not accept the message'),
           next_attempt_at = now() + LEAST(make_interval(mins => (2 ^ v_row.attempts)::int), INTERVAL '6 hours') WHERE id = p_id;
    v_status := 'pending';
  ELSIF p_outcome IN ('retry', 'failed') THEN
    UPDATE public.governance_notifications SET status = 'failed', error_message = COALESCE(v_error, 'The provider did not accept the message'),
           next_attempt_at = NULL WHERE id = p_id;
    v_status := 'failed';
  ELSE
    RAISE EXCEPTION 'The outcome is sent, retry or failed' USING ERRCODE = '22023';
  END IF;
  PERFORM public.write_audit_log('governance_notice.' || v_status, 'governance_notifications', p_id,
    jsonb_build_object('template', v_row.template_key, 'channel', v_row.channel, 'attempt', v_row.attempts, 'error', v_error,
                       'provider_message_id', v_message));
  RETURN jsonb_build_object('id', p_id, 'status', v_status, 'attempts', v_row.attempts);
END;
$$;
REVOKE ALL ON FUNCTION public.governance_notice_record_result(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.governance_notice_record_result(UUID, TEXT, TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. A changed bank account is paid only once the provider has been told (or a second person waived it)
-- ---------------------------------------------------------------------------------------------------------------------

-- The change notices for an account: those naming it, and (for accounts requested before notices named them) the provider's
-- change notices queued within two minutes of the request.
CREATE OR REPLACE FUNCTION public.payout_destination_notice_state(p_destination_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH d AS (SELECT * FROM public.provider_payout_destinations WHERE id = p_destination_id),
  n AS (
    SELECT g.status FROM public.governance_notifications g, d
     WHERE g.template_key = 'payout_account_change_requested'
       AND (g.payload->>'destination_id' = d.id::text
            OR (g.payload->>'destination_id' IS NULL AND g.payload->>'provider_id' = d.provider_id::text
                AND g.created_at BETWEEN d.requested_at - INTERVAL '2 minutes' AND d.requested_at + INTERVAL '2 minutes'))
  )
  SELECT CASE
    WHEN (SELECT notice_waived_at FROM d) IS NOT NULL THEN 'waived'
    WHEN NOT EXISTS (SELECT 1 FROM n) THEN 'none'
    WHEN EXISTS (SELECT 1 FROM n WHERE status = 'sent') THEN 'delivered'
    ELSE 'undelivered' END;
$$;
REVOKE ALL ON FUNCTION public.payout_destination_notice_state(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refuse_payout_while_notice_undelivered(p_destination_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_destination_id IS NOT NULL AND public.payout_destination_notice_state(p_destination_id) = 'undelivered' THEN
    RAISE EXCEPTION 'The provider has not yet been told about this bank account change (no notice was delivered); pay after a notice is sent or a second person waives it'
      USING ERRCODE = '22023', HINT = 'change_notice_undelivered';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.refuse_payout_while_notice_undelivered(UUID) FROM PUBLIC, anon, authenticated;

SELECT pg_temp.patch_function('public.admin_release_payout(uuid,text,text,text)'::regprocedure,
$from$  PERFORM public.refuse_payout_while_reconciliation_open(v_request.provider_id);$from$,
$to$  PERFORM public.refuse_payout_while_reconciliation_open(v_request.provider_id);
  PERFORM public.refuse_payout_while_notice_undelivered(v_request.destination_id);$to$);

SELECT pg_temp.patch_function('public.admin_release_ledger_item(uuid,text,text,text)'::regprocedure,
$from$  PERFORM public.refuse_payout_while_reconciliation_open(v_row.provider_id);$from$,
$to$  PERFORM public.refuse_payout_while_reconciliation_open(v_row.provider_id);
  PERFORM public.refuse_payout_while_notice_undelivered(
    (SELECT d.id FROM public.provider_payout_destinations d WHERE d.provider_id = v_row.provider_id AND d.status = 'active'));$to$);

-- A second person waives an undelivered change notice: iban.approve, step-up, a written reason, never the requester or the
-- approver of the change.
CREATE OR REPLACE FUNCTION public.admin_waive_payout_account_notice(p_destination_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_dest public.provider_payout_destinations;
  v_waived INTEGER;
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('iban.approve') THEN
    RAISE EXCEPTION 'Your console role cannot waive bank account notices' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 20 THEN
    RAISE EXCEPTION 'A written reason of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_dest FROM public.provider_payout_destinations WHERE id = p_destination_id FOR UPDATE;
  IF v_dest.id IS NULL THEN
    RAISE EXCEPTION 'Bank account not found' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IN (v_dest.requested_by, v_dest.approved_by) THEN
    RAISE EXCEPTION 'A second person waives the notice: not the person who requested or approved the change' USING ERRCODE = '42501';
  END IF;
  IF public.payout_destination_notice_state(v_dest.id) <> 'undelivered' THEN
    RAISE EXCEPTION 'There is no undelivered change notice for this account' USING ERRCODE = '22023';
  END IF;
  UPDATE public.provider_payout_destinations SET notice_waived_by = auth.uid(), notice_waived_at = now(), notice_waive_reason = v_reason
   WHERE id = v_dest.id;
  UPDATE public.governance_notifications SET status = 'waived', waived_by = auth.uid(), waived_at = now(), waive_reason = v_reason
   WHERE template_key = 'payout_account_change_requested' AND status <> 'sent'
     AND (payload->>'destination_id' = v_dest.id::text
          OR (payload->>'destination_id' IS NULL AND payload->>'provider_id' = v_dest.provider_id::text
              AND created_at BETWEEN v_dest.requested_at - INTERVAL '2 minutes' AND v_dest.requested_at + INTERVAL '2 minutes'));
  GET DIAGNOSTICS v_waived = ROW_COUNT;
  PERFORM public.write_audit_log('payout_destination.notice_waived', 'provider_payout_destinations', v_dest.id,
    jsonb_build_object('provider_id', v_dest.provider_id, 'reason', v_reason, 'notices', v_waived, 'requested_by', v_dest.requested_by,
                       'approved_by', v_dest.approved_by) || public.request_client_info());
  RETURN jsonb_build_object('destination_id', v_dest.id, 'notices_waived', v_waived);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_waive_payout_account_notice(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_waive_payout_account_notice(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. The console view of the outbox (no addresses)
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_list_governance_notices(p_status TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 25, p_offset INTEGER DEFAULT 0)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_status TEXT := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_rows JSONB;
  v_ids UUID[];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('pending', 'sending', 'sent', 'failed', 'skipped', 'undeliverable', 'waived') THEN
    RAISE EXCEPTION 'Unknown status' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id), '[]'::jsonb), COALESCE(array_agg(x.recipient_user_id), '{}'::uuid[])
    INTO v_rows, v_ids
    FROM (
      SELECT n.id, n.recipient_user_id, n.channel, n.template_key, n.status, n.created_at, n.sent_at, n.attempts, n.next_attempt_at,
             n.last_attempt_at, n.error_message, n.contact_source, n.waived_at,
             CASE WHEN n.template_key = 'payout_account_change_requested' THEN n.payload->>'destination_id' END AS destination_id,
             CASE WHEN n.template_key = 'payout_account_change_requested' THEN n.payload->>'provider_id' END AS provider_id
        FROM public.governance_notifications n
       WHERE v_status IS NULL OR n.status = v_status
       ORDER BY n.created_at DESC, n.id
       LIMIT v_limit OFFSET v_offset
    ) x;
  PERFORM public.gov2_log_read('governance_notices.listed', 'governance_notifications', v_ids,
    ARRAY['channel', 'template_key', 'status', 'error_message'], 'audit_review',
    jsonb_build_object('status', v_status, 'limit', v_limit, 'offset', v_offset), jsonb_array_length(v_rows));
  RETURN jsonb_build_object(
    'rows', v_rows,
    'counts', COALESCE((SELECT jsonb_object_agg(status, n) FROM (SELECT status, COUNT(*) n FROM public.governance_notifications GROUP BY status) c), '{}'::jsonb),
    'no_sender', EXISTS (SELECT 1 FROM public.governance_notifications WHERE status = 'undeliverable' AND error_message = 'undeliverable: no sender configured'),
    'can_waive', public.admin_can('iban.approve'));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_governance_notices(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_governance_notices(TEXT, INTEGER, INTEGER) TO authenticated;
