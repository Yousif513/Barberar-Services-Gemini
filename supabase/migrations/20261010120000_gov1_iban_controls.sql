-- GOV-1 part 3: provider IBANs (Q3 and D-Q5, final decision texts).
--
--   * A provider's payout bank account is a provider_payout_destinations row. No client role can select the table: the IBAN
--     is stored server-side only. Every client gets the masked form SA** **** **** **** **** 1234.
--   * payout_requests.iban is no longer selectable by any client; iban_masked replaces it.
--   * reveal_provider_iban(provider_id, reason): finance or owner, AAL2 with step-up in the last 5 minutes, a reason of at
--     least 15 characters including a ticket or payout reference. The value is returned once with a 60-second expiry for the
--     console; it is never written to the audit log. More than 10 reveals by one person in 24 hours raises a security alert.
--   * A provider adds or changes the account itself after re-authenticating (sign-in within 10 minutes). A second person with
--     the iban.approve permission (finance or owner) approves it; break-glass never applies. Payouts to a new or changed
--     account are held for 48 hours after approval. The provider is notified on its existing verified channels at request
--     and at approval.
--   * A payout is released only to the approved account named on the request, after the hold.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

CREATE OR REPLACE FUNCTION public.mask_iban(p_iban TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN p_iban IS NULL OR btrim(p_iban) = '' THEN NULL
              ELSE 'SA** **** **** **** **** ' || right(upper(regexp_replace(p_iban, '\s+', '', 'g')), 4) END;
$$;
REVOKE ALL ON FUNCTION public.mask_iban(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mask_iban(TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Payout destinations
-- ---------------------------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.provider_payout_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  -- As registered at the bank; finance compares it with the CR or national ID before approving. NULL when the request came
  -- from a payout request that named a new IBAN without it.
  account_holder_name TEXT,
  iban TEXT NOT NULL CHECK (iban ~ '^SA[0-9]{22}$'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'superseded', 'rejected', 'cancelled')),
  requested_by UUID NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approval_request_id UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  hold_until TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_payout_destination_active ON public.provider_payout_destinations (provider_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_payout_destination_pending ON public.provider_payout_destinations (provider_id) WHERE status = 'pending';
ALTER TABLE public.provider_payout_destinations ENABLE ROW LEVEL SECURITY;
-- Deliberately no client policy: the IBAN never leaves the database except through reveal_provider_iban.
SELECT public.grant_data_api_access('public.provider_payout_destinations');
SELECT public.attach_admin_audit_trigger('public.provider_payout_destinations');

ALTER TABLE public.payout_requests ADD COLUMN IF NOT EXISTS destination_id UUID REFERENCES public.provider_payout_destinations(id);
ALTER TABLE public.payout_requests ADD COLUMN IF NOT EXISTS iban_masked TEXT;
UPDATE public.payout_requests SET iban_masked = public.mask_iban(iban) WHERE iban_masked IS NULL;

-- A request keeps its masked IBAN in step with the stored one, and links to the provider's account with that IBAN.
CREATE OR REPLACE FUNCTION public.fill_payout_request_destination()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.iban_masked := public.mask_iban(NEW.iban);
  IF NEW.destination_id IS NULL THEN
    SELECT d.id INTO NEW.destination_id
      FROM public.provider_payout_destinations d
     WHERE d.provider_id = NEW.provider_id AND d.iban = upper(regexp_replace(NEW.iban, '\s+', '', 'g')) AND d.status IN ('active', 'pending')
     ORDER BY (d.status = 'active') DESC, d.requested_at DESC
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fill_payout_request_destination() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_fill_payout_request_destination ON public.payout_requests;
CREATE TRIGGER trg_fill_payout_request_destination BEFORE INSERT ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.fill_payout_request_destination();

-- No client receives the full IBAN of a payout request any more.
REVOKE SELECT ON public.payout_requests FROM authenticated;
REVOKE UPDATE ON public.payout_requests FROM authenticated;
GRANT SELECT (id, provider_id, requested_by, amount, bank_name, iban_masked, destination_id, status, admin_note, requested_at,
              processed_at, bank_reference, processed_by) ON public.payout_requests TO authenticated;
GRANT UPDATE (status, admin_note, bank_reference, processed_at, processed_by) ON public.payout_requests TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Provider requests a new or changed account
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gov_request_payout_destination(p_provider_id UUID, p_bank_name TEXT, p_holder TEXT, p_iban TEXT)
RETURNS public.provider_payout_destinations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_iban TEXT := upper(regexp_replace(COALESCE(p_iban, ''), '\s+', '', 'g'));
  v_dest public.provider_payout_destinations;
  v_old public.provider_payout_destinations;
  v_provider public.providers;
  v_approval JSONB;
BEGIN
  SELECT * INTO v_provider FROM public.providers WHERE id = p_provider_id;
  SELECT * INTO v_old FROM public.provider_payout_destinations WHERE provider_id = p_provider_id AND status = 'pending' FOR UPDATE;
  IF v_old.id IS NOT NULL THEN
    UPDATE public.provider_payout_destinations SET status = 'cancelled', closed_at = now() WHERE id = v_old.id;
    UPDATE public.admin_approval_requests SET status = 'cancelled', decided_at = now(), decision_reason = 'Replaced by a newer bank account request'
     WHERE id = v_old.approval_request_id AND status = 'pending';
  END IF;

  INSERT INTO public.provider_payout_destinations (provider_id, bank_name, account_holder_name, iban, requested_by)
  VALUES (p_provider_id, btrim(p_bank_name), NULLIF(btrim(COALESCE(p_holder, '')), ''), v_iban, auth.uid())
  RETURNING * INTO v_dest;

  v_approval := public.governance_request('iban_change', 'provider_payout_destinations', v_dest.id, NULL,
    jsonb_build_object('provider_id', p_provider_id),
    'Provider bank account ' || CASE WHEN EXISTS (SELECT 1 FROM public.provider_payout_destinations WHERE provider_id = p_provider_id AND status = 'active') THEN 'change' ELSE 'creation' END,
    jsonb_build_object('provider_id', p_provider_id, 'bank_name', v_dest.bank_name, 'account_holder_name', v_dest.account_holder_name,
                       'iban_masked', public.mask_iban(v_iban),
                       'previous_iban_masked', (SELECT public.mask_iban(iban) FROM public.provider_payout_destinations WHERE provider_id = p_provider_id AND status = 'active')));
  UPDATE public.provider_payout_destinations SET approval_request_id = (v_approval->>'approval_id')::uuid WHERE id = v_dest.id RETURNING * INTO v_dest;

  INSERT INTO public.security_alerts (kind, user_id, details)
  VALUES ('iban_change_requested', auth.uid(), jsonb_build_object('provider_id', p_provider_id, 'destination_id', v_dest.id, 'iban_last4', right(v_iban, 4)));
  -- The provider hears about it on its existing verified channels, so a takeover of the account is visible.
  PERFORM public.queue_governance_notice(v_provider.owner_id, 'payout_account_change_requested',
    jsonb_build_object('provider_id', p_provider_id, 'iban_masked', public.mask_iban(v_iban), 'bank_name', v_dest.bank_name));
  PERFORM public.write_audit_log('payout_destination.requested', 'provider_payout_destinations', v_dest.id,
    jsonb_build_object('provider_id', p_provider_id, 'iban_last4', right(v_iban, 4), 'approval_request_id', v_dest.approval_request_id)
      || public.request_client_info());
  RETURN v_dest;
END;
$$;
REVOKE ALL ON FUNCTION public.gov_request_payout_destination(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.provider_request_payout_destination(p_provider_id UUID, p_bank_name TEXT, p_account_holder_name TEXT, p_iban TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_iban TEXT := upper(regexp_replace(COALESCE(p_iban, ''), '\s+', '', 'g'));
  v_dest public.provider_payout_destinations;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only the provider''s owner can change its payout bank account' USING ERRCODE = '42501';
  END IF;
  PERFORM public.require_recent_login(INTERVAL '10 minutes');
  IF v_iban !~ '^SA[0-9]{22}$' THEN
    RAISE EXCEPTION 'Invalid Saudi IBAN: SA followed by 22 digits' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(COALESCE(p_bank_name, '')), '') IS NULL OR char_length(btrim(p_bank_name)) > 120 THEN
    RAISE EXCEPTION 'Bank name is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(COALESCE(p_account_holder_name, '')), '') IS NULL OR char_length(btrim(p_account_holder_name)) < 3 OR char_length(btrim(p_account_holder_name)) > 150 THEN
    RAISE EXCEPTION 'The account holder name as registered at the bank is required' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.provider_payout_destinations WHERE provider_id = p_provider_id AND status = 'active' AND iban = v_iban) THEN
    RAISE EXCEPTION 'This IBAN is already the approved payout account' USING ERRCODE = '22023';
  END IF;
  v_dest := public.gov_request_payout_destination(p_provider_id, p_bank_name, p_account_holder_name, v_iban);
  RETURN public.provider_payout_destination_summary(p_provider_id);
END;
$$;
REVOKE ALL ON FUNCTION public.provider_request_payout_destination(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_request_payout_destination(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Masked view of a provider's accounts for its owner and for administrators.
CREATE OR REPLACE FUNCTION public.provider_payout_destination_summary(p_provider_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active JSONB;
  v_pending JSONB;
BEGIN
  IF NOT (public.is_admin() OR EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized for this provider' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object('id', d.id, 'bank_name', d.bank_name, 'account_holder_name', d.account_holder_name, 'iban_masked', public.mask_iban(d.iban),
                            'approved_at', d.approved_at, 'hold_until', d.hold_until, 'on_hold', d.hold_until > now())
    INTO v_active FROM public.provider_payout_destinations d WHERE d.provider_id = p_provider_id AND d.status = 'active';
  SELECT jsonb_build_object('id', d.id, 'bank_name', d.bank_name, 'account_holder_name', d.account_holder_name, 'iban_masked', public.mask_iban(d.iban),
                            'requested_at', d.requested_at, 'approval_request_id', d.approval_request_id)
    INTO v_pending FROM public.provider_payout_destinations d WHERE d.provider_id = p_provider_id AND d.status = 'pending';
  RETURN jsonb_build_object('provider_id', p_provider_id, 'active', v_active, 'pending', v_pending,
    'last_rejected_at', (SELECT MAX(d.closed_at) FROM public.provider_payout_destinations d WHERE d.provider_id = p_provider_id AND d.status = 'rejected'));
END;
$$;
REVOKE ALL ON FUNCTION public.provider_payout_destination_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_payout_destination_summary(UUID) TO authenticated;

-- Executed by an approved iban_change request (admin_decide_approval, never break-glass).
CREATE OR REPLACE FUNCTION public.gov_activate_payout_destination(p_destination_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dest public.provider_payout_destinations;
  v_previous UUID;
  v_owner UUID;
BEGIN
  IF NOT public.governance_execution_active('iban_change', p_destination_id) THEN
    RAISE EXCEPTION 'A payout account is activated only by an approved request' USING ERRCODE = '42501';
  END IF;
  IF NOT public.admin_can('iban.approve') THEN
    RAISE EXCEPTION 'Your console role cannot approve payout accounts' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_dest FROM public.provider_payout_destinations WHERE id = p_destination_id FOR UPDATE;
  IF v_dest.id IS NULL OR v_dest.status <> 'pending' THEN
    RAISE EXCEPTION 'This bank account request is no longer pending' USING ERRCODE = '22023';
  END IF;
  -- The provider's owner may not approve its own account even if it also held an administrator account.
  IF v_dest.requested_by = auth.uid() THEN
    RAISE EXCEPTION 'You cannot approve a bank account you entered' USING ERRCODE = '42501';
  END IF;

  UPDATE public.provider_payout_destinations SET status = 'superseded', closed_at = now()
   WHERE provider_id = v_dest.provider_id AND status = 'active'
  RETURNING id INTO v_previous;
  UPDATE public.provider_payout_destinations
     SET status = 'active', approved_by = auth.uid(), approved_at = now(), hold_until = now() + INTERVAL '48 hours'
   WHERE id = v_dest.id
  RETURNING * INTO v_dest;

  SELECT owner_id INTO v_owner FROM public.providers WHERE id = v_dest.provider_id;
  PERFORM public.queue_governance_notice(v_owner, 'payout_account_change_approved',
    jsonb_build_object('provider_id', v_dest.provider_id, 'iban_masked', public.mask_iban(v_dest.iban), 'hold_until', v_dest.hold_until));
  PERFORM public.write_audit_log('payout_destination.approved', 'provider_payout_destinations', v_dest.id,
    jsonb_build_object('provider_id', v_dest.provider_id, 'iban_last4', right(v_dest.iban, 4), 'previous_destination_id', v_previous,
                       'hold_until', v_dest.hold_until));
  RETURN jsonb_build_object('destination_id', v_dest.id, 'provider_id', v_dest.provider_id, 'hold_until', v_dest.hold_until,
                            'previous_destination_id', v_previous);
END;
$$;
REVOKE ALL ON FUNCTION public.gov_activate_payout_destination(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gov_reject_payout_destination(p_destination_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dest public.provider_payout_destinations;
  v_owner UUID;
BEGIN
  UPDATE public.provider_payout_destinations SET status = 'rejected', closed_at = now()
   WHERE id = p_destination_id AND status = 'pending'
  RETURNING * INTO v_dest;
  IF v_dest.id IS NULL THEN
    RETURN;
  END IF;
  SELECT owner_id INTO v_owner FROM public.providers WHERE id = v_dest.provider_id;
  PERFORM public.queue_governance_notice(v_owner, 'payout_account_change_rejected',
    jsonb_build_object('provider_id', v_dest.provider_id, 'iban_masked', public.mask_iban(v_dest.iban)));
END;
$$;
REVOKE ALL ON FUNCTION public.gov_reject_payout_destination(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Payout requests use the approved account
-- ---------------------------------------------------------------------------------------------------------------------

SELECT pg_temp.patch_function('public.request_provider_payout(uuid,numeric,text,text)'::regprocedure,
$from$  v_request public.payout_requests;
BEGIN$from$,
$to$  v_request public.payout_requests;
  v_destination public.provider_payout_destinations;
BEGIN$to$);

-- The owner no longer types an IBAN per payout: the approved account is used. An IBAN that differs from the approved one (or
-- the first IBAN of a provider without one) becomes a bank account request that a second person approves; the payout
-- request names it and waits for the approval and the 48-hour hold.
SELECT pg_temp.patch_function('public.request_provider_payout(uuid,numeric,text,text)'::regprocedure,
$from$  IF v_iban !~ '^SA[0-9]{22}$' THEN
    RAISE EXCEPTION 'Invalid Saudi IBAN: SA followed by 22 digits' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(TRIM(COALESCE(p_bank_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Bank name is required' USING ERRCODE = '22023';
  END IF;$from$,
$to$  SELECT * INTO v_destination FROM public.provider_payout_destinations WHERE provider_id = p_provider_id AND status = 'active';
  IF v_iban = '' AND v_destination.id IS NOT NULL THEN
    v_iban := v_destination.iban;
  END IF;
  IF v_iban !~ '^SA[0-9]{22}$' THEN
    RAISE EXCEPTION 'Invalid Saudi IBAN: SA followed by 22 digits' USING ERRCODE = '22023';
  END IF;
  IF v_destination.id IS NOT NULL AND v_destination.iban = v_iban THEN
    p_bank_name := v_destination.bank_name;
  ELSIF NULLIF(TRIM(COALESCE(p_bank_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Bank name is required' USING ERRCODE = '22023';
  ELSE
    SELECT * INTO v_destination FROM public.provider_payout_destinations WHERE provider_id = p_provider_id AND status = 'pending' AND iban = v_iban;
    IF v_destination.id IS NULL THEN
      PERFORM public.require_recent_login(INTERVAL '10 minutes');
      v_destination := public.gov_request_payout_destination(p_provider_id, p_bank_name, NULL, v_iban);
    END IF;
  END IF;$to$);

SELECT pg_temp.patch_function('public.request_provider_payout(uuid,numeric,text,text)'::regprocedure,
$from$  INSERT INTO public.payout_requests (provider_id, requested_by, amount, bank_name, iban, status)
  VALUES (p_provider_id, v_user_id, ROUND(p_amount, 2), TRIM(p_bank_name), v_iban, 'requested')
  RETURNING * INTO v_request;$from$,
$to$  INSERT INTO public.payout_requests (provider_id, requested_by, amount, bank_name, iban, status, destination_id)
  VALUES (p_provider_id, v_user_id, ROUND(p_amount, 2), TRIM(p_bank_name), v_iban, 'requested', v_destination.id)
  RETURNING * INTO v_request;
  -- The caller gets the masked form only.
  v_request.iban := v_request.iban_masked;$to$);

-- Release only to the approved account on the request, after its hold.
SELECT pg_temp.patch_function('public.admin_release_payout(uuid,text,text,text)'::regprocedure,
$from$  -- Maker-checker (D-Q5): without an approved request being executed, this records the request for a second administrator.$from$,
$to$  IF v_request.destination_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.provider_payout_destinations d
        WHERE d.id = v_request.destination_id AND d.status = 'active') THEN
    RAISE EXCEPTION 'This payout names a bank account that is not approved; the provider''s account must be approved by finance first'
      USING ERRCODE = '22023', HINT = 'destination_not_approved';
  END IF;
  IF EXISTS (SELECT 1 FROM public.provider_payout_destinations d WHERE d.id = v_request.destination_id AND d.hold_until > now()) THEN
    RAISE EXCEPTION 'Payouts to this new bank account are on hold until % (48 hours after approval)',
      (SELECT to_char(d.hold_until AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') FROM public.provider_payout_destinations d WHERE d.id = v_request.destination_id)
      USING ERRCODE = '22023', HINT = 'destination_on_hold';
  END IF;
  -- Maker-checker (D-Q5): without an approved request being executed, this records the request for a second administrator.$to$);

-- The inbox shows the account behind each payout, and whether it changed in the last 30 days (the D-Q5 batch review).
SELECT pg_temp.patch_function('public.admin_release_payout(uuid,text,text,text)'::regprocedure,
$from$jsonb_build_object('provider_id', v_request.provider_id, 'amount', v_request.amount, 'requested_at', v_request.requested_at)$from$,
$to$jsonb_build_object('provider_id', v_request.provider_id, 'amount', v_request.amount, 'requested_at', v_request.requested_at,
        'iban_masked', v_request.iban_masked,
        'destination_changed_recently', EXISTS (SELECT 1 FROM public.provider_payout_destinations d
                                                 WHERE d.id = v_request.destination_id AND d.approved_at > now() - INTERVAL '30 days'
                                                   AND EXISTS (SELECT 1 FROM public.provider_payout_destinations o
                                                                WHERE o.provider_id = d.provider_id AND o.status = 'superseded')))$to$);

-- Requests made before this migration name an IBAN; an existing approved account with the same IBAN is linked to them.
-- Nothing is created here: an administrator-approved account cannot be invented by a migration.

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Reveal
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reveal_provider_iban(p_provider_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_active public.provider_payout_destinations;
  v_pending public.provider_payout_destinations;
  v_count INTEGER;
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('iban.reveal') THEN
    RAISE EXCEPTION 'Only finance or an owner can reveal an IBAN' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 15 THEN
    RAISE EXCEPTION 'A reason of at least 15 characters is required' USING ERRCODE = '22023';
  END IF;
  -- A ticket or payout reference: letters with a number (PAY-1042, TCK 77), a #number, or the first 8 characters of an id.
  IF v_reason !~* '([a-z]{2,}[- ]?[0-9]{2,}|#[0-9]{2,}|[0-9a-f]{8}(-[0-9a-f]{4})?)' THEN
    RAISE EXCEPTION 'Include a ticket or payout reference in the reason (for example PAY-1042, #5521 or the payout request id)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_active FROM public.provider_payout_destinations WHERE provider_id = p_provider_id AND status = 'active';
  SELECT * INTO v_pending FROM public.provider_payout_destinations WHERE provider_id = p_provider_id AND status = 'pending';
  IF v_active.id IS NULL AND v_pending.id IS NULL THEN
    RAISE EXCEPTION 'This provider has no bank account on file' USING ERRCODE = 'P0002';
  END IF;

  -- The audit event never contains the IBAN.
  PERFORM public.write_audit_log('iban.revealed', 'providers', p_provider_id,
    jsonb_build_object('reason', v_reason, 'active_destination_id', v_active.id, 'pending_destination_id', v_pending.id)
      || public.request_client_info());
  SELECT COUNT(*) INTO v_count FROM public.admin_audit_logs
   WHERE action = 'iban.revealed' AND actor_id = auth.uid() AND created_at > now() - INTERVAL '24 hours';
  IF v_count > 10 AND NOT EXISTS (SELECT 1 FROM public.security_alerts WHERE kind = 'iban_reveal_volume' AND user_id = auth.uid()
                                     AND created_at > now() - INTERVAL '24 hours') THEN
    INSERT INTO public.security_alerts (kind, user_id, details)
    VALUES ('iban_reveal_volume', auth.uid(), jsonb_build_object('reveals_in_24h', v_count));
  END IF;

  RETURN jsonb_build_object(
    'provider_id', p_provider_id,
    'expires_at', now() + INTERVAL '60 seconds',
    'active', CASE WHEN v_active.id IS NOT NULL THEN jsonb_build_object('destination_id', v_active.id, 'iban', v_active.iban,
                'bank_name', v_active.bank_name, 'account_holder_name', v_active.account_holder_name) END,
    'pending', CASE WHEN v_pending.id IS NOT NULL THEN jsonb_build_object('destination_id', v_pending.id, 'iban', v_pending.iban,
                'bank_name', v_pending.bank_name, 'account_holder_name', v_pending.account_holder_name) END);
END;
$$;
REVOKE ALL ON FUNCTION public.reveal_provider_iban(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_provider_iban(UUID, TEXT) TO authenticated;

-- The audit trigger must not copy an IBAN from the new table either: it already keeps only the last four characters of any
-- column named like iban, which is the masked form.
