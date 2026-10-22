-- Durable, one-dispatch checkout receipts. Gateway HTTP remains outside database transactions.
-- Private request bytes can contain payment contact details; never copy them to audit details.
CREATE TABLE public.payment_checkout_attempts (
  id UUID PRIMARY KEY,
  actor_id UUID NOT NULL,
  purchase_type TEXT NOT NULL CHECK (purchase_type IN ('booking','gift_card','package','membership','tip','subscription')),
  target_id UUID NOT NULL,
  provider_id UUID,
  amount_sar NUMERIC(12,2) NOT NULL CHECK (amount_sar > 0 AND amount_sar <> 'NaN'::numeric),
  currency TEXT NOT NULL DEFAULT 'SAR' CHECK (currency = 'SAR'),
  status TEXT NOT NULL DEFAULT 'submitting' CHECK (status IN ('submitting','ready','unknown','captured','failed')),
  request_text TEXT NOT NULL CHECK (octet_length(request_text) BETWEEN 2 AND 65536),
  request_sha256 TEXT NOT NULL CHECK (request_sha256 ~ '^[a-f0-9]{64}$'),
  gateway_context TEXT NOT NULL CHECK (gateway_context ~ '^[a-f0-9]{64}$'),
  charge_id TEXT UNIQUE,
  checkout_url TEXT,
  gateway_status TEXT,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  reconciliation_required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unknown_at TIMESTAMPTZ,
  CHECK (status NOT IN ('ready','captured','failed') OR charge_id IS NOT NULL),
  CHECK (status <> 'ready' OR (checkout_url IS NOT NULL AND NOT reconciliation_required)),
  CHECK (status <> 'unknown' OR unknown_at IS NOT NULL)
);
ALTER TABLE public.payment_checkout_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payment_checkout_attempts FROM PUBLIC, anon, authenticated, service_role;
CREATE UNIQUE INDEX checkout_one_current_unresolved
  ON public.payment_checkout_attempts(purchase_type,target_id)
  WHERE is_current AND status IN ('submitting','ready','unknown','captured');
CREATE INDEX checkout_attempt_target_history ON public.payment_checkout_attempts(purchase_type,target_id,created_at DESC,id);

CREATE FUNCTION public.protect_checkout_attempt_identity()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Checkout dispatch identity is immutable' USING ERRCODE='22000';
  END IF;
  IF ROW(NEW.id,NEW.actor_id,NEW.purchase_type,NEW.target_id,NEW.provider_id,NEW.amount_sar,NEW.currency,
         NEW.request_text,NEW.request_sha256,NEW.gateway_context)
     IS DISTINCT FROM
     ROW(OLD.id,OLD.actor_id,OLD.purchase_type,OLD.target_id,OLD.provider_id,OLD.amount_sar,OLD.currency,
         OLD.request_text,OLD.request_sha256,OLD.gateway_context) THEN
    RAISE EXCEPTION 'Checkout dispatch identity and request are immutable' USING ERRCODE='22000';
  END IF;
  IF OLD.charge_id IS NOT NULL AND NEW.charge_id IS DISTINCT FROM OLD.charge_id THEN
    RAISE EXCEPTION 'Checkout charge identity is immutable' USING ERRCODE='22000';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.protect_checkout_attempt_identity() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER checkout_attempt_identity BEFORE UPDATE OR DELETE ON public.payment_checkout_attempts
  FOR EACH ROW EXECUTE FUNCTION public.protect_checkout_attempt_identity();

-- All target access is fixed SQL. The service caller supplies only the actor authenticated by auth.getUser.
-- Snapshot identifiers deliberately do not cascade when a profile or polymorphic target is removed.
CREATE FUNCTION public.checkout_payable_snapshot(p_actor_id UUID,p_purchase_type TEXT,p_target_id UUID,p_require_pending BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_amount NUMERIC;
  v_provider UUID;
  v_status TEXT;
  v_payer UUID;
BEGIN
  IF COALESCE(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE='42501';
  END IF;
  IF p_actor_id IS NULL OR p_target_id IS NULL THEN
    RAISE EXCEPTION 'Payable not found' USING ERRCODE='P0002';
  END IF;
  CASE p_purchase_type
    WHEN 'booking' THEN
      SELECT b.deposit_required,br.provider_id,b.status::text,b.customer_id INTO v_amount,v_provider,v_status,v_payer
      FROM public.bookings b JOIN public.branches br ON br.id=b.branch_id
      WHERE b.id=p_target_id AND b.customer_id=p_actor_id FOR UPDATE OF b;
    WHEN 'gift_card' THEN
      SELECT g.original_amount,NULL::uuid,g.status,g.purchaser_id INTO v_amount,v_provider,v_status,v_payer
      FROM public.gift_cards g WHERE g.id=p_target_id AND g.purchaser_id=p_actor_id FOR UPDATE OF g;
    WHEN 'package' THEN
      SELECT p.amount_paid,p.provider_id,p.status,p.customer_id INTO v_amount,v_provider,v_status,v_payer
      FROM public.user_packages p WHERE p.id=p_target_id AND p.customer_id=p_actor_id FOR UPDATE OF p;
    WHEN 'membership' THEN
      SELECT m.amount_due,m.provider_id,m.status,m.customer_id INTO v_amount,v_provider,v_status,v_payer
      FROM public.memberships m WHERE m.id=p_target_id AND m.customer_id=p_actor_id FOR UPDATE OF m;
    WHEN 'tip' THEN
      SELECT t.amount,t.provider_id,t.status,t.customer_id INTO v_amount,v_provider,v_status,v_payer
      FROM public.booking_tips t WHERE t.id=p_target_id AND t.customer_id=p_actor_id FOR UPDATE OF t;
    WHEN 'subscription' THEN
      SELECT s.amount,s.provider_id,s.status,p.owner_id INTO v_amount,v_provider,v_status,v_payer
      FROM public.subscription_payments s JOIN public.providers p ON p.id=s.provider_id
      WHERE s.id=p_target_id AND p.owner_id=p_actor_id FOR UPDATE OF s;
    ELSE
      RAISE EXCEPTION 'Unknown purchase type' USING ERRCODE='22023';
  END CASE;
  IF v_payer IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Payable not found' USING ERRCODE='P0002';
  END IF;
  IF p_require_pending THEN
    IF v_status IS DISTINCT FROM (CASE WHEN p_purchase_type='tip' THEN 'pending' ELSE 'pending_payment' END) THEN
      RAISE EXCEPTION 'Target is not awaiting payment' USING ERRCODE='22023';
    END IF;
    IF v_amount IS NULL OR v_amount <= 0 OR v_amount::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'Payable amount must be finite and positive' USING ERRCODE='22023';
    END IF;
    IF p_purchase_type IN ('booking','package','membership') AND public.provider_is_selling(v_provider) IS NOT TRUE THEN
      RAISE EXCEPTION 'This salon is not taking payments' USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN jsonb_build_object('amount_sar',v_amount,'provider_id',v_provider,'status',v_status);
END;
$fn$;
REVOKE ALL ON FUNCTION public.checkout_payable_snapshot(UUID,TEXT,UUID,BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.read_checkout_attempt(p_actor_id UUID,p_purchase_type TEXT,p_target_id UUID,p_gateway_context TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_attempt public.payment_checkout_attempts;
BEGIN
  IF COALESCE(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE='42501';
  END IF;
  IF p_gateway_context IS NULL OR p_gateway_context !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid gateway context' USING ERRCODE='22023';
  END IF;
  PERFORM public.checkout_payable_snapshot(p_actor_id,p_purchase_type,p_target_id,FALSE);
  SELECT * INTO v_attempt FROM public.payment_checkout_attempts
  WHERE purchase_type=p_purchase_type AND target_id=p_target_id
  ORDER BY created_at DESC,id DESC LIMIT 1;
  IF v_attempt.id IS NULL THEN RETURN NULL; END IF;
  IF v_attempt.actor_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Checkout payer changed; reconciliation is required' USING ERRCODE='42501';
  END IF;
  IF v_attempt.gateway_context IS DISTINCT FROM p_gateway_context THEN
    RAISE EXCEPTION 'Checkout gateway context changed; reconciliation is required' USING ERRCODE='22023';
  END IF;
  PERFORM public.write_audit_log('checkout.read','payment_checkout_attempts',v_attempt.id,
    jsonb_build_object('actor_id',v_attempt.actor_id,'status',v_attempt.status,'purchase_type',v_attempt.purchase_type));
  RETURN to_jsonb(v_attempt);
END;
$fn$;

CREATE FUNCTION public.claim_checkout_attempt(p_actor_id UUID,p_purchase_type TEXT,p_target_id UUID,p_attempt_id UUID,p_request TEXT,p_gateway_context TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_attempt public.payment_checkout_attempts;
  v_reused public.payment_checkout_attempts;
  v_payable JSONB;
  v_request JSONB;
  v_hash TEXT;
  v_flag BOOLEAN;
  v_previous UUID;
BEGIN
  IF COALESCE(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE='42501';
  END IF;
  IF p_attempt_id IS NULL OR p_gateway_context IS NULL OR p_gateway_context !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid checkout attempt or gateway context' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('checkout:'||p_purchase_type||':'||p_target_id::text,0));
  v_payable := public.checkout_payable_snapshot(p_actor_id,p_purchase_type,p_target_id,FALSE);
  SELECT * INTO v_reused FROM public.payment_checkout_attempts WHERE id=p_attempt_id;
  IF v_reused.id IS NOT NULL AND
     (v_reused.actor_id IS DISTINCT FROM p_actor_id OR v_reused.purchase_type IS DISTINCT FROM p_purchase_type
      OR v_reused.target_id IS DISTINCT FROM p_target_id OR v_reused.request_text IS DISTINCT FROM p_request
      OR v_reused.gateway_context IS DISTINCT FROM p_gateway_context) THEN
    RAISE EXCEPTION 'Checkout attempt already has a different immutable request or target' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_attempt FROM public.payment_checkout_attempts
  WHERE purchase_type=p_purchase_type AND target_id=p_target_id AND status IN ('submitting','ready','unknown','captured')
  ORDER BY (status='captured') DESC,is_current DESC,created_at DESC,id DESC LIMIT 1 FOR UPDATE;
  IF v_attempt.id IS NOT NULL THEN
    IF v_attempt.actor_id IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'Checkout payer changed; reconciliation is required' USING ERRCODE='42501';
    END IF;
    IF v_attempt.gateway_context IS DISTINCT FROM p_gateway_context THEN
      RAISE EXCEPTION 'Checkout gateway context changed; reconciliation is required' USING ERRCODE='22023';
    END IF;
    IF v_attempt.amount_sar IS DISTINCT FROM (v_payable->>'amount_sar')::numeric
       OR v_attempt.provider_id IS DISTINCT FROM (v_payable->>'provider_id')::uuid THEN
      RAISE EXCEPTION 'Checkout payable amount or provider changed; reconciliation is required' USING ERRCODE='22023';
    END IF;
    IF v_attempt.status='ready' THEN
      PERFORM public.checkout_payable_snapshot(p_actor_id,p_purchase_type,p_target_id,TRUE);
      SELECT is_enabled INTO v_flag FROM public.platform_feature_flags WHERE flag_key='payments_marketplace_split';
      IF v_flag IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION 'Payment split routing configuration is unavailable' USING ERRCODE='22023';
      END IF;
    END IF;
    RETURN to_jsonb(v_attempt)||jsonb_build_object('dispatch',FALSE);
  END IF;
  -- A failed attempt UUID is history, not a key that can ever dispatch again.
  IF v_reused.id IS NOT NULL THEN
    RETURN to_jsonb(v_reused)||jsonb_build_object('dispatch',FALSE);
  END IF;
  v_payable := public.checkout_payable_snapshot(p_actor_id,p_purchase_type,p_target_id,TRUE);
  SELECT is_enabled INTO v_flag FROM public.platform_feature_flags WHERE flag_key='payments_marketplace_split';
  IF v_flag IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'Payment split routing configuration is unavailable' USING ERRCODE='22023';
  END IF;
  IF p_request IS NULL OR octet_length(p_request) NOT BETWEEN 2 AND 65536 THEN
    RAISE EXCEPTION 'Invalid checkout request size' USING ERRCODE='22023';
  END IF;
  BEGIN
    v_request := p_request::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Checkout request must be valid JSON' USING ERRCODE='22023';
  END;
  IF jsonb_typeof(v_request) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_request->'amount') IS DISTINCT FROM 'number'
     OR (v_request->>'amount')::numeric IS DISTINCT FROM (v_payable->>'amount_sar')::numeric
     OR v_request->>'currency' IS DISTINCT FROM 'SAR' THEN
    RAISE EXCEPTION 'Checkout request amount or currency does not match payable' USING ERRCODE='22023';
  END IF;
  IF v_request#>>'{metadata,checkout_attempt_id}' IS DISTINCT FROM p_attempt_id::text
     OR v_request#>>'{metadata,purchase_type}' IS DISTINCT FROM p_purchase_type
     OR v_request#>>ARRAY['metadata',CASE WHEN p_purchase_type='booking' THEN 'booking_id' ELSE 'purchase_id' END] IS DISTINCT FROM p_target_id::text THEN
    RAISE EXCEPTION 'Checkout request metadata does not match attempt target' USING ERRCODE='22023';
  END IF;
  IF v_request#>>'{reference,transaction}' IS DISTINCT FROM p_attempt_id::text
     OR v_request#>>'{reference,idempotent}' IS DISTINCT FROM p_attempt_id::text
     OR v_request#>>'{reference,order}' IS DISTINCT FROM p_target_id::text THEN
    RAISE EXCEPTION 'Checkout request reference does not match attempt target' USING ERRCODE='22023';
  END IF;
  v_hash := encode(extensions.digest(convert_to(p_request,'UTF8'),'sha256'),'hex');
  UPDATE public.payment_checkout_attempts SET is_current=FALSE,updated_at=now()
    WHERE purchase_type=p_purchase_type AND target_id=p_target_id AND is_current AND status='failed'
    RETURNING id INTO v_previous;
  IF v_previous IS NOT NULL THEN
    PERFORM public.write_audit_log('checkout.superseded','payment_checkout_attempts',v_previous,
      jsonb_build_object('actor_id',p_actor_id,'replacement_attempt_id',p_attempt_id));
  END IF;
  INSERT INTO public.payment_checkout_attempts(id,actor_id,purchase_type,target_id,provider_id,amount_sar,request_text,request_sha256,gateway_context)
  VALUES(p_attempt_id,p_actor_id,p_purchase_type,p_target_id,(v_payable->>'provider_id')::uuid,
    (v_payable->>'amount_sar')::numeric,p_request,v_hash,p_gateway_context)
  RETURNING * INTO v_attempt;
  PERFORM public.write_audit_log('checkout.claimed','payment_checkout_attempts',v_attempt.id,
    jsonb_build_object('actor_id',v_attempt.actor_id,'purchase_type',v_attempt.purchase_type,'target_id',v_attempt.target_id,'amount_sar',v_attempt.amount_sar,'request_sha256',v_hash));
  RETURN to_jsonb(v_attempt)||jsonb_build_object('dispatch',TRUE);
END;
$fn$;

CREATE FUNCTION public.mark_checkout_attempt_unknown(p_attempt_id UUID,p_gateway_context TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_attempt public.payment_checkout_attempts;
BEGIN
  IF COALESCE(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_attempt FROM public.payment_checkout_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF v_attempt.id IS NULL THEN RAISE EXCEPTION 'Checkout attempt not found' USING ERRCODE='P0002'; END IF;
  IF v_attempt.gateway_context IS DISTINCT FROM p_gateway_context THEN
    RAISE EXCEPTION 'Checkout gateway context does not match' USING ERRCODE='22023';
  END IF;
  IF v_attempt.status='submitting' THEN
    UPDATE public.payment_checkout_attempts SET status='unknown',unknown_at=COALESCE(unknown_at,now()),updated_at=now()
    WHERE id=v_attempt.id RETURNING * INTO v_attempt;
    PERFORM public.write_audit_log('checkout.unknown','payment_checkout_attempts',v_attempt.id,
      jsonb_build_object('actor_id',v_attempt.actor_id,'purchase_type',v_attempt.purchase_type,'status',v_attempt.status));
  END IF;
  RETURN to_jsonb(v_attempt);
END;
$fn$;

-- An authenticated creation response may establish a ready checkout. Terminal/captured states
-- require a verified charge GET at the Edge boundary; transport errors never reach this command.
CREATE FUNCTION public.record_checkout_attempt(p_attempt_id UUID,p_gateway_context TEXT,p_charge JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_attempt public.payment_checkout_attempts;
  v_status TEXT;
  v_gateway_status TEXT;
  v_charge_id TEXT;
  v_url TEXT;
  v_other_capture BOOLEAN;
  v_quarantined BOOLEAN;
BEGIN
  IF COALESCE(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE='42501';
  END IF;
  -- Same lock order as claim: target lock first, then attempt row. Unknown marking only locks one row.
  SELECT * INTO v_attempt FROM public.payment_checkout_attempts WHERE id=p_attempt_id;
  IF v_attempt.id IS NULL THEN RAISE EXCEPTION 'Checkout attempt not found' USING ERRCODE='P0002'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('checkout:'||v_attempt.purchase_type||':'||v_attempt.target_id::text,0));
  SELECT * INTO v_attempt FROM public.payment_checkout_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF v_attempt.gateway_context IS DISTINCT FROM p_gateway_context THEN
    RAISE EXCEPTION 'Checkout gateway context does not match' USING ERRCODE='22023';
  END IF;
  v_charge_id := p_charge->>'id';
  IF jsonb_typeof(p_charge) IS DISTINCT FROM 'object' OR v_charge_id IS NULL OR v_charge_id !~ '^chg_[A-Za-z0-9_-]{1,120}$'
     OR jsonb_typeof(p_charge->'amount') IS DISTINCT FROM 'number'
     OR (p_charge->>'amount')::numeric IS DISTINCT FROM v_attempt.amount_sar
     OR p_charge->>'currency' IS DISTINCT FROM 'SAR' THEN
    RAISE EXCEPTION 'Charge receipt amount, currency or identity is invalid' USING ERRCODE='22023';
  END IF;
  IF p_charge#>>'{metadata,checkout_attempt_id}' IS DISTINCT FROM v_attempt.id::text
     OR p_charge#>>'{metadata,purchase_type}' IS DISTINCT FROM v_attempt.purchase_type
     OR p_charge#>>ARRAY['metadata',CASE WHEN v_attempt.purchase_type='booking' THEN 'booking_id' ELSE 'purchase_id' END] IS DISTINCT FROM v_attempt.target_id::text THEN
    RAISE EXCEPTION 'Charge receipt metadata does not match attempt' USING ERRCODE='22023';
  END IF;
  IF p_charge#>>'{reference,transaction}' IS DISTINCT FROM v_attempt.id::text
     OR p_charge#>>'{reference,order}' IS DISTINCT FROM v_attempt.target_id::text
     OR ((p_charge->'reference') ? 'idempotent' AND p_charge#>>'{reference,idempotent}' IS DISTINCT FROM v_attempt.id::text) THEN
    RAISE EXCEPTION 'Charge receipt reference does not match attempt' USING ERRCODE='22023';
  END IF;
  IF v_attempt.charge_id IS NOT NULL AND v_attempt.charge_id IS DISTINCT FROM v_charge_id THEN
    RAISE EXCEPTION 'Checkout attempt is already bound to another charge' USING ERRCODE='23505';
  END IF;
  IF EXISTS(SELECT 1 FROM public.payment_checkout_attempts WHERE charge_id=v_charge_id AND id<>v_attempt.id) THEN
    RAISE EXCEPTION 'Charge is already bound to another checkout attempt' USING ERRCODE='23505';
  END IF;
  v_gateway_status := upper(COALESCE(p_charge->>'status','UNKNOWN'));
  v_url := p_charge#>>'{transaction,url}';
  v_status := CASE
    WHEN v_gateway_status='CAPTURED' THEN 'captured'
    WHEN v_gateway_status IN ('FAILED','DECLINED','CANCELLED','ABANDONED','RESTRICTED','VOID') THEN 'failed'
    WHEN v_gateway_status IN ('INITIATED','IN_PROGRESS','AUTHORIZED') AND v_url ~ '^https://[^[:space:]]+$' THEN 'ready'
    ELSE 'unknown' END;
  IF v_attempt.status='captured' THEN
    v_status := 'captured';
    v_gateway_status := v_attempt.gateway_status;
  ELSIF v_attempt.status='failed' AND v_status<>'captured' THEN
    v_status := 'failed';
    v_gateway_status := v_attempt.gateway_status;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.payment_checkout_attempts
    WHERE purchase_type=v_attempt.purchase_type AND target_id=v_attempt.target_id AND id<>v_attempt.id AND status='captured')
    INTO v_other_capture;
  v_quarantined := v_attempt.reconciliation_required OR v_other_capture;
  IF v_other_capture AND v_status NOT IN ('captured','failed') THEN
    v_status := 'unknown';
  END IF;
  IF v_status='captured' THEN
    -- A late capture of an older terminal attempt is financial evidence, not an index conflict.
    -- Preserve both captures if they really happened and quarantine any newer in-flight checkout.
    IF EXISTS(SELECT 1 FROM public.payment_checkout_attempts
      WHERE purchase_type=v_attempt.purchase_type AND target_id=v_attempt.target_id AND id<>v_attempt.id
        AND created_at>v_attempt.created_at AND status IN ('submitting','ready','unknown','captured')) THEN
      v_quarantined := TRUE;
    END IF;
    UPDATE public.payment_checkout_attempts
      SET status=CASE WHEN status='captured' THEN status ELSE 'unknown' END,
          reconciliation_required=TRUE,checkout_url=NULL,
          unknown_at=CASE WHEN status='captured' THEN unknown_at ELSE COALESCE(unknown_at,now()) END,updated_at=now()
      WHERE purchase_type=v_attempt.purchase_type AND target_id=v_attempt.target_id AND id<>v_attempt.id
        AND status IN ('submitting','ready','unknown','captured');
    IF FOUND THEN
      PERFORM public.write_audit_log('checkout.target_quarantined','payment_checkout_attempts',v_attempt.id,
        jsonb_build_object('actor_id',v_attempt.actor_id,'purchase_type',v_attempt.purchase_type,'target_id',v_attempt.target_id));
    END IF;
  END IF;
  UPDATE public.payment_checkout_attempts
    SET charge_id=v_charge_id,status=v_status,gateway_status=v_gateway_status,
        checkout_url=CASE WHEN v_status='ready' AND NOT v_quarantined THEN v_url ELSE NULL END,
        reconciliation_required=v_quarantined,
        unknown_at=CASE WHEN v_status='unknown' THEN COALESCE(unknown_at,now()) ELSE unknown_at END,updated_at=now()
    WHERE id=v_attempt.id RETURNING * INTO v_attempt;
  PERFORM public.write_audit_log('checkout.recorded','payment_checkout_attempts',v_attempt.id,
    jsonb_build_object('actor_id',v_attempt.actor_id,'status',v_attempt.status,'gateway_status',CASE WHEN v_attempt.gateway_status IN
      ('INITIATED','IN_PROGRESS','ABANDONED','CANCELLED','FAILED','DECLINED','RESTRICTED','CAPTURED','VOID','TIMEDOUT','UNKNOWN')
      THEN v_attempt.gateway_status ELSE 'UNRECOGNIZED' END,'charge_id',v_attempt.charge_id,
      'reconciliation_required',v_attempt.reconciliation_required));
  RETURN to_jsonb(v_attempt);
END;
$fn$;

REVOKE ALL ON FUNCTION public.claim_checkout_attempt(UUID,TEXT,UUID,UUID,TEXT,TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.read_checkout_attempt(UUID,TEXT,UUID,TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_checkout_attempt(UUID,TEXT,JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_checkout_attempt_unknown(UUID,TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_checkout_attempt(UUID,TEXT,UUID,UUID,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_checkout_attempt(UUID,TEXT,UUID,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_checkout_attempt(UUID,TEXT,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_checkout_attempt_unknown(UUID,TEXT) TO service_role;


-- Keep the repository-wide administrator audit-trigger invariant without logging payment wire bytes.
-- Service operations already emit their minimized command receipts; this hook covers authorized
-- administrator maintenance through a future definer command, without granting direct table access.
CREATE FUNCTION public.audit_checkout_admin_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_old JSONB := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_new JSONB := CASE WHEN TG_OP IN ('UPDATE','INSERT') THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  v_row JSONB := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_changed JSONB;
BEGIN
  IF COALESCE(auth.jwt()->>'role','')='service_role' OR public.is_admin() IS NOT TRUE THEN
    RETURN COALESCE(NEW,OLD);
  END IF;
  -- Compare values only in memory; persist field names and strictly typed structural evidence.
  SELECT COALESCE(jsonb_agg(k ORDER BY k),'[]'::jsonb) INTO v_changed
  FROM jsonb_object_keys(v_old||v_new) AS fields(k)
  WHERE k<>'updated_at' AND (v_old->k) IS DISTINCT FROM (v_new->k);
  IF TG_OP='UPDATE' AND v_changed='[]'::jsonb THEN RETURN NEW; END IF;
  PERFORM public.write_audit_log('payment_checkout_attempts.'||lower(TG_OP),'payment_checkout_attempts',
    (v_row->>'id')::uuid,
    jsonb_build_object('actor_id',(v_row->>'actor_id')::uuid,'status',v_row->>'status',
      'request_sha256',v_row->>'request_sha256','changed_fields',v_changed));
  RETURN COALESCE(NEW,OLD);
END;
$fn$;
REVOKE ALL ON FUNCTION public.audit_checkout_admin_write() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_audit_admin_write ON public.payment_checkout_attempts;
CREATE TRIGGER trg_audit_admin_write AFTER INSERT OR UPDATE OR DELETE ON public.payment_checkout_attempts
  FOR EACH ROW EXECUTE FUNCTION public.audit_checkout_admin_write();
