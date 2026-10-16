-- F1 and F4 (docs/reviews/2026-10-16-security-final-recheck.md).
--   F1  A profile clear erased the name, e-mail and phone of a customer whose account a court hold keeps (the erasure engine
--       respects the hold; this path did not). admin_clear_customer_profile now refuses, both when it is asked for and again
--       inside the approved execution, while an active hold covers 'account' for the customer. The approvals inbox shows the
--       approver the active hold on a pending profile clear (basis, case reference, review date), so a hold placed after the
--       request was made is visible before anyone decides.
--   F4  The approved execution re-entered admin_clear_customer_profile, which checked operations.write in the approver's session.
--       The requester still needs operations.write; the approver's authority is the approval itself (admin_decide_approval
--       already checked privacy.approve, step-up and that the approver is not the requester), so the executor no longer asks the
--       approver for operations.write.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- The active hold that keeps a customer's account, if any: what an approver may see (never the pseudonym or contact details).
CREATE OR REPLACE FUNCTION public.privacy_account_hold_summary(p_subject UUID) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('hold_id', h.id, 'basis', h.basis, 'case_reference', h.case_reference,
                            'categories', to_jsonb(h.categories), 'review_due_at', h.review_due_at)
    FROM public.privacy_legal_holds h
   WHERE p_subject IS NOT NULL AND h.subject_id = p_subject AND h.status = 'active' AND 'account' = ANY (h.categories)
   ORDER BY h.approved_at DESC NULLS LAST, h.id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.privacy_account_hold_summary(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_clear_customer_profile(p_customer_id UUID, p_reason TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
  v_approved BOOLEAN;
  v_hold JSONB;
BEGIN
  PERFORM public.require_recent_mfa();
  -- F4: inside an approved execution the approval is the authority (privacy.approve, checked by admin_decide_approval);
  -- asking for the clear needs operations.write.
  v_approved := p_customer_id IS NOT NULL AND public.governance_execution_active('customer_profile_clear', p_customer_id);
  IF NOT v_approved AND NOT public.admin_can('operations.write') THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_customer_id FOR UPDATE;
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Customer not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_profile.role <> 'customer' THEN
    RAISE EXCEPTION 'Only customer profiles can be cleared here' USING ERRCODE = '22023';
  END IF;

  -- F1: a court hold on the account keeps the profile as it is, at the request and again at the approval.
  v_hold := public.privacy_account_hold_summary(v_profile.id);
  IF v_hold IS NOT NULL THEN
    RAISE EXCEPTION 'An active legal hold (%) keeps this customer''s account; the profile cannot be cleared until the hold is released',
      v_hold->>'case_reference' USING ERRCODE = '42501', HINT = 'legal_hold_active';
  END IF;

  IF NOT v_approved THEN
    RETURN public.governance_request('customer_profile_clear', 'profiles', v_profile.id, NULL,
      jsonb_build_object('reason', v_reason),
      v_reason,
      jsonb_build_object('cleared', jsonb_build_array('first_name', 'last_name', 'email', 'phone_number', 'gender', 'expo_push_token'),
                         'kept', jsonb_build_array('sign_in_identity', 'bookings', 'invoices', 'messages'),
                         'legal_hold', NULL));
  END IF;

  -- The row-level audit trigger picks the reason up for the profiles.update entry.
  PERFORM set_config('primora.audit_reason', v_reason, true);

  UPDATE public.profiles
  SET first_name = NULL,
      last_name = NULL,
      email = NULL,
      phone_number = NULL,
      phone_verified = FALSE,
      phone_verified_at = NULL,
      gender = NULL,
      expo_push_token = NULL
  WHERE id = v_profile.id;

  PERFORM public.write_audit_log('customer.profile_cleared', 'profiles', v_profile.id,
    jsonb_build_object('reason', v_reason,
                       'approval_request_id', NULLIF(current_setting('primora.governance_approval', true), ''),
                       'cleared', jsonb_build_array('first_name', 'last_name', 'email', 'phone_number', 'gender', 'expo_push_token'),
                       'kept', jsonb_build_array('sign_in_identity', 'bookings', 'invoices', 'messages')));

  RETURN jsonb_build_object('customer_id', v_profile.id, 'cleared', TRUE);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_clear_customer_profile(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_clear_customer_profile(UUID, TEXT) TO authenticated;

-- The executor stays callable only inside an approved execution, and the approver is never the requester.
CREATE OR REPLACE FUNCTION public.gov_exec_customer_profile_clear(p_req public.admin_approval_requests)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.governance_execution_active('customer_profile_clear', p_req.target_id) THEN
    RAISE EXCEPTION 'A customer profile is cleared only as an approved request' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NULL OR auth.uid() = p_req.requested_by THEN
    RAISE EXCEPTION 'A different person approves the profile clear' USING ERRCODE = '42501';
  END IF;
  RETURN public.admin_clear_customer_profile(p_req.target_id, p_req.payload->>'reason');
END;
$$;
REVOKE ALL ON FUNCTION public.gov_exec_customer_profile_clear(public.admin_approval_requests) FROM PUBLIC, anon, authenticated;

-- The inbox shows the approver the hold that would refuse a pending profile clear.
SELECT pg_temp.patch_function('public.admin_approval_inbox(text,integer,integer)'::regprocedure,
$from$             END AS target_name,$from$,
$to$             END AS target_name,
             CASE WHEN r.kind = 'customer_profile_clear' AND r.status = 'pending' THEN public.privacy_account_hold_summary(r.target_id) END AS legal_hold,$to$);
