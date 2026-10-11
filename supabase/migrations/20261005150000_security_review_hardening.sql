-- Migration: 20261005150000_security_review_hardening.sql
-- Fixes from the independent security review of the admin console (sec-claude-release-review) that need no
-- business decision:
--   * an administrator could change the ledger, fee rules, wallet credits, gift cards and loyalty balances
--     with one direct write that left no audit entry: the audit trigger now covers every table an
--     administrator policy can write;
--   * the audit trigger copied a cleared customer's name, gender and push token, gift-card codes and free
--     text into the permanent log: sensitive columns are now recognised by name pattern, and a bank
--     account change records only the last four digits before and after;
--   * a payout request's amount and bank details could be rewritten by an administrator between the
--     provider's request and the release: they are now fixed once the request exists;
--   * anonymous visitors could read provider admin notes, registry responses, commission and staff phone
--     numbers and emails: those columns are no longer readable by the anonymous role;
--   * a refund stuck "in progress" had no way out: the claim time is recorded and an audited command
--     reopens one that has been stuck for 15 minutes.
-- Left for an owner decision and recorded as open gaps: multi-factor authentication, who may read bank
-- details and personal data directly, second approvers, and limits on loyalty and referral values.

-- ---------------------------------------------------------------------------
-- 1. Audit trigger: sensitive columns by name, bank account last four
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_admin_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old JSONB := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_new JSONB := CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  -- Columns whose values never enter the log: personal and contact details, bank details, secrets, codes
  -- and free text. The log records that they changed, and for bank accounts the last four digits.
  v_sensitive TEXT := '(iban|phone|email|first_name|last_name|full_name|national_id|gender|address|token|secret|api_key|wathq|recipient_|walk_in_|comment|details|admin_note|^code$|^name$|^message$)';
  v_changes JSONB := '{}'::jsonb;
  v_key TEXT;
  v_target TEXT;
BEGIN
  -- Operator actions only: provider, customer and system writes are covered by their own commands.
  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' OR NOT public.is_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(v_old || v_new) LOOP
    IF v_key = 'updated_at' THEN CONTINUE; END IF;
    IF (v_old -> v_key) IS DISTINCT FROM (v_new -> v_key) THEN
      v_changes := v_changes || jsonb_build_object(v_key,
        CASE
          WHEN v_key ~* 'iban' THEN jsonb_build_object('changed', TRUE,
            'before_last4', right(COALESCE(v_old ->> v_key, ''), 4), 'after_last4', right(COALESCE(v_new ->> v_key, ''), 4))
          WHEN v_key ~* v_sensitive AND v_key !~* '^phone_verified' THEN jsonb_build_object('changed', TRUE)
          ELSE jsonb_build_object('before', v_old -> v_key, 'after', v_new -> v_key)
        END);
    END IF;
  END LOOP;
  IF TG_OP = 'UPDATE' AND v_changes = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  v_target := COALESCE(v_new ->> 'id', v_old ->> 'id');
  INSERT INTO public.admin_audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    CASE WHEN v_target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_target::uuid END,
    jsonb_build_object('changes', v_changes)
      || CASE WHEN v_new ? 'key' OR v_old ? 'key' THEN jsonb_build_object('key', COALESCE(v_new ->> 'key', v_old ->> 'key')) ELSE '{}'::jsonb END
      || CASE WHEN NULLIF(current_setting('primora.audit_reason', true), '') IS NOT NULL
           THEN jsonb_build_object('reason', current_setting('primora.audit_reason', true)) ELSE '{}'::jsonb END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.audit_admin_write() FROM PUBLIC, anon, authenticated;

-- Every table an administrator policy can write is audited (derived from the policies, not typed from memory,
-- so a table added later with an admin write policy is picked up the next time this block is re-run and is
-- caught by the security matrix test until then).
DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOR v_table IN
    SELECT DISTINCT p.tablename
      FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND p.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
       AND (p.qual ILIKE '%is_admin()%' OR p.with_check ILIKE '%is_admin()%')
       AND p.tablename NOT IN ('admin_audit_logs', 'integration_audit_log', 'customer_favorites')
       AND to_regclass('public.' || p.tablename) IS NOT NULL
       AND (SELECT c.relkind FROM pg_class c WHERE c.oid = to_regclass('public.' || p.tablename)) = 'r'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_admin_write ON public.%I', v_table);
    EXECUTE format('CREATE TRIGGER trg_audit_admin_write AFTER INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.audit_admin_write()', v_table);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. A payout request's destination and amount are fixed once it exists
-- ---------------------------------------------------------------------------
-- The request is the instruction for a manual bank transfer. Changing the account or the amount after the
-- provider asked for it is how money would be redirected, so the only way to change either is to reject the
-- request and let the provider make a new one. The payout function (service role) is not restricted.
CREATE OR REPLACE FUNCTION public.protect_payout_request_destination()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.iban IS DISTINCT FROM OLD.iban
     OR NEW.bank_name IS DISTINCT FROM OLD.bank_name
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id THEN
    RAISE EXCEPTION 'The amount and bank details of a payout request cannot be changed; reject it and ask the provider to request again'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_payout_request_destination() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_payout_request_destination ON public.payout_requests;
CREATE TRIGGER trg_protect_payout_request_destination
  BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.protect_payout_request_destination();

-- ---------------------------------------------------------------------------
-- 3. Internal columns are not readable by the anonymous role
-- ---------------------------------------------------------------------------
-- Row policies make verified providers and active staff public, but they do not say which columns. The
-- anonymous role keeps every column the public pages use and loses the internal ones. Signed-in users still
-- read them (an administrator and a provider owner use the same database role), which is why splitting these
-- columns into an administrator-only table remains an open gap.
DO $$
DECLARE
  v_spec TEXT[];
  v_table TEXT;
  v_hidden TEXT[];
  v_visible TEXT;
BEGIN
  FOREACH v_spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['providers', 'admin_notes,cr_wathq_data,commission_percentage,last_activity_at,cr_number,vat_number,trade_license_url,contact_email,contact_phone'],
    -- profile_id stays: row policies on other tables (a staff member's own bookings) reference it.
    ARRAY['employees', 'phone,email'],
    ARRAY['payment_methods', 'admin_note,gateway_key']
  ]
  LOOP
    v_table := v_spec[1];
    v_hidden := string_to_array(v_spec[2], ',');
    SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
      INTO v_visible
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = v_table AND NOT (column_name = ANY (v_hidden));
    EXECUTE format('REVOKE SELECT ON TABLE public.%I FROM anon', v_table);
    EXECUTE format('GRANT SELECT (%s) ON TABLE public.%I TO anon', v_visible, v_table);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Refunds that stay "in progress"
-- ---------------------------------------------------------------------------
ALTER TABLE public.refund_requests ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.claim_refund_request(p_refund_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.refund_requests;
  v_ledger public.transactional_ledger;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_refund FROM public.refund_requests WHERE id = p_refund_id FOR UPDATE SKIP LOCKED;
  IF v_refund.id IS NULL OR v_refund.status NOT IN ('pending', 'failed') OR v_refund.attempts >= 5 THEN
    RETURN jsonb_build_object('claimed', FALSE);
  END IF;

  SELECT * INTO v_ledger FROM public.transactional_ledger WHERE id = v_refund.ledger_id;
  IF v_ledger.payout_status IN ('released', 'paid') THEN
    UPDATE public.refund_requests
    SET status = 'failed', error_message = 'Funds were already paid out to the provider; recover manually before refunding'
    WHERE id = v_refund.id;
    RETURN jsonb_build_object('claimed', FALSE, 'reason', 'already_paid_out');
  END IF;

  UPDATE public.refund_requests SET status = 'processing', attempts = attempts + 1, claimed_at = now() WHERE id = v_refund.id;
  RETURN jsonb_build_object('claimed', TRUE, 'refund_id', v_refund.id, 'payment_intent_id', v_refund.payment_intent_id,
                            'amount', v_refund.amount, 'idempotency_key', v_refund.idempotency_key,
                            'booking_id', v_refund.booking_id, 'reason', v_refund.reason);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_refund_request(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_refund_request(UUID) TO service_role;

-- A refund the payment gateway may or may not have executed cannot be told apart from one that never left
-- the building, so reopening it is an operator's decision. The same idempotency key goes to the gateway on the
-- next attempt, which is what stops it being sent twice; the operator is asked to check the gateway first.
CREATE OR REPLACE FUNCTION public.admin_reopen_stuck_refund(p_refund_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.refund_requests;
  v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_refund FROM public.refund_requests WHERE id = p_refund_id FOR UPDATE;
  IF v_refund.id IS NULL THEN
    RAISE EXCEPTION 'Refund request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_refund.status <> 'processing' THEN
    RAISE EXCEPTION 'Only a refund stuck in progress can be reopened; this one is %', v_refund.status USING ERRCODE = '22023';
  END IF;
  IF v_refund.claimed_at IS NOT NULL AND v_refund.claimed_at > now() - interval '15 minutes' THEN
    RAISE EXCEPTION 'This refund is still in progress; wait 15 minutes before reopening it' USING ERRCODE = '22023';
  END IF;

  UPDATE public.refund_requests
     SET status = 'failed',
         error_message = 'Reopened by an operator after it stayed in progress; the gateway outcome was not recorded'
   WHERE id = v_refund.id;

  PERFORM public.write_audit_log('refund.reopened', 'refund_requests', v_refund.id,
    jsonb_build_object('reason', v_reason, 'amount', v_refund.amount, 'attempts', v_refund.attempts, 'claimed_at', v_refund.claimed_at));

  RETURN jsonb_build_object('refund_id', v_refund.id, 'status', 'failed');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reopen_stuck_refund(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reopen_stuck_refund(UUID, TEXT) TO authenticated;
