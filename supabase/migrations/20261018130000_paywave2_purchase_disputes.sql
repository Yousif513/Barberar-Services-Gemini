-- PAY-WAVE2, red team RT-H2 fix 3 (docs/reviews/2026-10-17-redteam-whole-stack.md): a customer had no recourse on a membership or
-- package charge, because open_booking_dispute accepts only bookings with a booking payment.
--   * open_purchase_dispute: the customer who bought a membership or package disputes what is still captured on it (less refunds
--     already on their way), with a reason of 10 to 2,000 characters and up to 5 https evidence links; one open dispute per
--     purchase. While it is open the provider is paid nothing more from that sale (ledger_prepaid_earned_share).
--   * resolve_booking_dispute settles a purchase dispute the same way as a booking one (money.refund, step-up, a note, the refund
--     approval threshold, a second person above it); a refund goes through the refund queue to the original payment method, and a
--     refund of everything still captured ends the membership or package.
--   * The console's dispute list names the purchase; the customer's privacy copy lists the refunds of their purchases.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. The customer opens a dispute on a membership or package
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.open_purchase_dispute(p_purchase_type TEXT, p_purchase_id UUID, p_reason TEXT,
                                                        p_evidence_urls TEXT[] DEFAULT '{}'::TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_urls TEXT[] := COALESCE(p_evidence_urls, '{}'::TEXT[]);
  v_url TEXT;
  v_provider UUID;
  v_name_en TEXT;
  v_ledger public.transactional_ledger;
  v_open NUMERIC(10,2);
  v_amount NUMERIC(10,2);
  v_id UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_purchase_type IS NULL OR p_purchase_type NOT IN ('membership', 'package') THEN
    RAISE EXCEPTION 'A dispute is about a membership or a package' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 10 OR char_length(v_reason) > 2000 THEN
    RAISE EXCEPTION 'Please describe the problem in 10 to 2,000 characters' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_urls) > 5 THEN
    RAISE EXCEPTION 'Attach at most 5 evidence links' USING ERRCODE = '22023';
  END IF;
  FOREACH v_url IN ARRAY v_urls LOOP
    IF v_url IS NULL OR char_length(v_url) > 500 OR v_url !~* '^https://[^[:space:]<>"]+$' THEN
      RAISE EXCEPTION 'Evidence links must be https addresses of at most 500 characters' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- The same answer for a purchase that does not exist and one that belongs to someone else.
  IF p_purchase_type = 'membership' THEN
    SELECT m.provider_id, m.plan_name_en INTO v_provider, v_name_en FROM public.memberships m
     WHERE m.id = p_purchase_id AND m.customer_id = v_user FOR UPDATE;
  ELSE
    SELECT up.provider_id, up.package_name_en INTO v_provider, v_name_en FROM public.user_packages up
     WHERE up.id = p_purchase_id AND up.customer_id = v_user FOR UPDATE;
  END IF;
  IF v_provider IS NULL THEN
    RAISE EXCEPTION 'Purchase not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_ledger FROM public.transactional_ledger
   WHERE purchase_type = p_purchase_type AND purchase_id = p_purchase_id AND entry_type = 'package_sale';
  IF v_ledger.id IS NULL OR v_ledger.total_captured - v_ledger.refunded_amount <= 0 THEN
    RAISE EXCEPTION 'There is no payment on this purchase to dispute' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_disputes d
              WHERE d.purchase_type = p_purchase_type AND d.purchase_id = p_purchase_id AND d.status IN ('opened', 'under_review')) THEN
    RAISE EXCEPTION 'A dispute is already open for this purchase' USING ERRCODE = '23505';
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_open FROM public.refund_requests
   WHERE ledger_id = v_ledger.id AND status IN ('pending', 'processing', 'unknown', 'failed');
  v_amount := v_ledger.total_captured - v_ledger.refunded_amount - v_open;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Everything you paid is already being refunded' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.payment_disputes (booking_id, purchase_type, purchase_id, customer_id, provider_id, charge_id, disputed_amount_sar,
                                       reason, status, evidence_urls)
  VALUES (NULL, p_purchase_type, p_purchase_id, v_user, v_provider, v_ledger.payment_intent_id, v_amount, v_reason, 'opened', v_urls)
  RETURNING id INTO v_id;

  INSERT INTO public.notifications (user_id, title_en, title_ar, body_en, body_ar, type, data)
  SELECT p.owner_id, 'A customer opened a dispute', 'فتح عميل نزاعاً',
         'A customer disputes the payment for ' || CASE WHEN p_purchase_type = 'membership' THEN 'the membership ' ELSE 'the package ' END
           || COALESCE(v_name_en, '') || '. PRIMORA reviews it; payouts from this sale wait for the decision.',
         'يعترض عميل على الدفع مقابل ' || CASE WHEN p_purchase_type = 'membership' THEN 'العضوية' ELSE 'الباقة' END
           || '. تراجع PRIMORA النزاع، وتنتظر مستحقاتك من هذه العملية قرارها.',
         'dispute', jsonb_build_object('dispute_id', v_id, 'purchase_type', p_purchase_type, 'purchase_id', p_purchase_id)
    FROM public.providers p WHERE p.id = v_provider AND p.owner_id IS NOT NULL;

  PERFORM public.write_audit_log('dispute.opened', 'payment_disputes', v_id,
    jsonb_build_object('purchase_type', p_purchase_type, 'purchase_id', p_purchase_id, 'amount', v_amount));
  RETURN jsonb_build_object('success', TRUE, 'dispute_id', v_id, 'status', 'opened', 'disputed_amount_sar', v_amount);
END;
$$;
REVOKE ALL ON FUNCTION public.open_purchase_dispute(TEXT, UUID, TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_purchase_dispute(TEXT, UUID, TEXT, TEXT[]) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Resolving a purchase dispute
-- ---------------------------------------------------------------------------------------------------------------------

SELECT pg_temp.patch_function('public.resolve_booking_dispute(uuid,character varying,text,numeric)'::regprocedure,
$from$      TRIM(p_admin_notes), jsonb_build_object('booking_id', v_dispute.booking_id, 'dispute_id', v_dispute.id));$from$,
$to$      TRIM(p_admin_notes), jsonb_build_object('booking_id', v_dispute.booking_id, 'dispute_id', v_dispute.id,
                                              'purchase_type', v_dispute.purchase_type, 'purchase_id', v_dispute.purchase_id,
                                              'provider_id', v_dispute.provider_id));$to$);
SELECT pg_temp.patch_function('public.resolve_booking_dispute(uuid,character varying,text,numeric)'::regprocedure,
$from$    v_refund_id := public.create_refund_request_internal(v_dispute.booking_id,
      COALESCE(p_refund_amount, v_dispute.disputed_amount_sar), 'dispute', TRIM(p_admin_notes),
      'dispute:' || v_dispute.id::text);$from$,
$to$    IF v_dispute.booking_id IS NOT NULL THEN
      v_refund_id := public.create_refund_request_internal(v_dispute.booking_id,
        COALESCE(p_refund_amount, v_dispute.disputed_amount_sar), 'dispute', TRIM(p_admin_notes),
        'dispute:' || v_dispute.id::text);
    ELSE
      -- PAY-WAVE2: a membership or package dispute refunds through the same queue; a refund of everything still captured ends it.
      v_refund_id := public.create_purchase_refund_request_internal(v_dispute.purchase_type, v_dispute.purchase_id,
        COALESCE(p_refund_amount, v_dispute.disputed_amount_sar), 'dispute', TRIM(p_admin_notes),
        'dispute:' || v_dispute.id::text);
      IF v_refund_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.transactional_ledger tl
            WHERE tl.purchase_type = v_dispute.purchase_type AND tl.purchase_id = v_dispute.purchase_id AND tl.entry_type = 'package_sale'
              AND tl.total_captured - tl.refunded_amount
                  - COALESCE((SELECT SUM(r.amount) FROM public.refund_requests r
                               WHERE r.ledger_id = tl.id AND r.status IN ('pending', 'processing', 'unknown', 'failed')), 0) > 0) THEN
        IF v_dispute.purchase_type = 'membership' THEN
          UPDATE public.memberships
             SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), refund_request_id = COALESCE(refund_request_id, v_refund_id),
                 cancel_reason = 'Ended by a dispute resolved with a full refund', updated_at = now()
           WHERE id = v_dispute.purchase_id AND status IN ('active', 'pending_payment');
        ELSE
          UPDATE public.user_packages SET status = 'cancelled' WHERE id = v_dispute.purchase_id AND status IN ('active', 'pending_payment');
        END IF;
      END IF;
    END IF;$to$);
SELECT pg_temp.patch_function('public.resolve_booking_dispute(uuid,character varying,text,numeric)'::regprocedure,
$from$      RAISE EXCEPTION 'Nothing refundable remains on this booking' USING ERRCODE = '22023';$from$,
$to$      RAISE EXCEPTION 'Nothing refundable remains on this booking or purchase' USING ERRCODE = '22023';$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. The console's dispute list names the purchase
-- ---------------------------------------------------------------------------------------------------------------------

SELECT pg_temp.patch_function('public.admin_list_disputes(text,integer,integer,text)'::regprocedure,
$from$             jsonb_build_object('id', b.id, 'status', b.status, 'scheduled_at', b.scheduled_at) AS booking$from$,
$to$             CASE WHEN d.booking_id IS NOT NULL THEN jsonb_build_object('id', b.id, 'status', b.status, 'scheduled_at', b.scheduled_at) END AS booking,
             CASE WHEN d.purchase_id IS NOT NULL THEN jsonb_build_object('type', d.purchase_type, 'id', d.purchase_id,
               'name_en', COALESCE(pm.plan_name_en, pp.package_name_en), 'name_ar', COALESCE(pm.plan_name_ar, pp.package_name_ar)) END AS purchase$to$);
SELECT pg_temp.patch_function('public.admin_list_disputes(text,integer,integer,text)'::regprocedure,
$from$        LEFT JOIN public.bookings b ON b.id = d.booking_id$from$,
$to$        LEFT JOIN public.bookings b ON b.id = d.booking_id
        LEFT JOIN public.memberships pm ON d.purchase_type = 'membership' AND pm.id = d.purchase_id
        LEFT JOIN public.user_packages pp ON d.purchase_type = 'package' AND pp.id = d.purchase_id$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. The customer's privacy copy lists the refunds of their purchases too
-- ---------------------------------------------------------------------------------------------------------------------

SELECT pg_temp.patch_function('public.privacy_export_payload(uuid)'::regprocedure,
$from$      'refunds', COALESCE((SELECT jsonb_agg(jsonb_build_object('booking_id', rr.booking_id, 'amount_sar', rr.amount, 'status', rr.status, 'at', rr.created_at)
                    ORDER BY rr.created_at)
                  FROM public.refund_requests rr JOIN public.bookings b ON b.id = rr.booking_id WHERE b.customer_id = s), '[]'::jsonb),$from$,
$to$      'refunds', COALESCE((SELECT jsonb_agg(jsonb_build_object('booking_id', rr.booking_id, 'purchase_type', rr.purchase_type,
                                                'amount_sar', rr.amount, 'status', rr.status, 'at', rr.created_at)
                    ORDER BY rr.created_at)
                  FROM public.refund_requests rr LEFT JOIN public.bookings b ON b.id = rr.booking_id
                  LEFT JOIN public.memberships pm ON rr.purchase_type = 'membership' AND pm.id = rr.purchase_id
                  LEFT JOIN public.user_packages pp ON rr.purchase_type = 'package' AND pp.id = rr.purchase_id
                  WHERE b.customer_id = s OR pm.customer_id = s OR pp.customer_id = s), '[]'::jsonb),$to$);
