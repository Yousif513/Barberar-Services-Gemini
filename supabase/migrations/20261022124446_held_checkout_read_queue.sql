-- Minimized operator observation only. Direct checkout table grants and dispatch authority stay unchanged.
CREATE INDEX IF NOT EXISTS checkout_attempt_held_queue
  ON public.payment_checkout_attempts(created_at ASC,id ASC)
  WHERE status IN ('submitting','unknown') OR reconciliation_required;

CREATE OR REPLACE FUNCTION public.admin_list_held_checkout_attempts(
  p_status TEXT DEFAULT NULL,p_purchase_type TEXT DEFAULT NULL,p_attempt_id UUID DEFAULT NULL,
  p_target_id UUID DEFAULT NULL,p_limit INTEGER DEFAULT 25,p_offset INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_result JSONB;
  v_ids UUID[];
  v_fields TEXT[] := ARRAY['id','purchase_type','target_id','amount_sar','currency','status','is_current',
    'reconciliation_required','created_at','updated_at','unknown_at'];
BEGIN
  IF auth.uid() IS NULL OR COALESCE(auth.jwt()->>'role','') <> 'authenticated' THEN
    RAISE EXCEPTION 'Authenticated console session required' USING ERRCODE='42501';
  END IF;
  PERFORM public.gov2_require_read(ARRAY['money.ledger'],'held checkout attempts');
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 OR p_offset IS NULL OR p_offset < 0 OR p_offset > 100000
     OR (p_status IS NOT NULL AND p_status NOT IN ('submitting','unknown','captured','failed'))
     OR (p_purchase_type IS NOT NULL AND p_purchase_type NOT IN ('booking','gift_card','package','membership','tip','subscription')) THEN
    RAISE EXCEPTION 'Invalid held-checkout filter or pagination' USING ERRCODE='22023';
  END IF;
  WITH eligible AS MATERIALIZED (
    SELECT a.id,a.purchase_type,a.target_id,a.amount_sar,a.currency,a.status,a.is_current,
      a.reconciliation_required,a.created_at,a.updated_at,a.unknown_at
    FROM public.payment_checkout_attempts a
    WHERE (a.status IN ('submitting','unknown') OR a.reconciliation_required)
      AND (p_status IS NULL OR a.status=p_status)
      AND (p_purchase_type IS NULL OR a.purchase_type=p_purchase_type)
      AND (p_attempt_id IS NULL OR a.id=p_attempt_id)
      AND (p_target_id IS NULL OR a.target_id=p_target_id)
  ), page AS (
    SELECT * FROM eligible ORDER BY created_at ASC,id ASC LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at,p.id) FROM page p),'[]'::jsonb),
    'total',(SELECT count(*) FROM eligible),'as_of',statement_timestamp(),'limit',p_limit,'offset',p_offset)
  INTO v_result;
  SELECT COALESCE(array_agg((x->>'id')::uuid),'{}'::uuid[]) INTO v_ids FROM jsonb_array_elements(v_result->'items') x;
  PERFORM public.gov2_log_read('checkout.operator.list','payment_checkout_attempts',v_ids,v_fields,'reconciliation',
    jsonb_build_object('status',p_status,'purchase_type',p_purchase_type,'attempt_id',p_attempt_id,'target_id',p_target_id,
      'limit',p_limit,'offset',p_offset),jsonb_array_length(v_result->'items'));
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_list_held_checkout_attempts(TEXT,TEXT,UUID,UUID,INTEGER,INTEGER) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_held_checkout_attempts(TEXT,TEXT,UUID,UUID,INTEGER,INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_held_checkout_attempt(p_attempt_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_attempt JSONB;
  v_fields TEXT[] := ARRAY['id','purchase_type','target_id','amount_sar','currency','status','is_current',
    'reconciliation_required','created_at','updated_at','unknown_at'];
BEGIN
  IF auth.uid() IS NULL OR COALESCE(auth.jwt()->>'role','') <> 'authenticated' THEN
    RAISE EXCEPTION 'Authenticated console session required' USING ERRCODE='42501';
  END IF;
  PERFORM public.gov2_require_read(ARRAY['money.ledger'],'held checkout attempts');
  IF p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'Invalid held-checkout attempt ID' USING ERRCODE='22023';
  END IF;
  SELECT jsonb_build_object('id',a.id,'purchase_type',a.purchase_type,'target_id',a.target_id,
    'amount_sar',a.amount_sar,'currency',a.currency,'status',a.status,'is_current',a.is_current,
    'reconciliation_required',a.reconciliation_required,'created_at',a.created_at,'updated_at',a.updated_at,'unknown_at',a.unknown_at)
  INTO v_attempt FROM public.payment_checkout_attempts a
  WHERE a.id=p_attempt_id AND (a.status IN ('submitting','unknown') OR a.reconciliation_required);
  PERFORM public.gov2_log_read('checkout.operator.detail','payment_checkout_attempts',
    CASE WHEN v_attempt IS NULL THEN '{}'::uuid[] ELSE ARRAY[p_attempt_id] END,v_fields,'reconciliation',
    jsonb_build_object('attempt_id',p_attempt_id),CASE WHEN v_attempt IS NULL THEN 0 ELSE 1 END);
  RETURN jsonb_build_object('attempt',v_attempt,'as_of',statement_timestamp());
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_get_held_checkout_attempt(UUID) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_held_checkout_attempt(UUID) TO authenticated;
