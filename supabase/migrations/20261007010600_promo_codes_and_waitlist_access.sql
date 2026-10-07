-- C-D6 + C-D10b: promotional codes are not enumerable, and a waitlist row changes only through a command.
--
-- C-D6: the policy "Promotional codes readable by admins or when active" let every signed-in user list every active code with its
--       value and redemption count (a stranger listed an active 50 percent code). validate_and_apply_coupon and
--       booking_create_internal are SECURITY DEFINER and need no table access, so only administrators read the table.
-- C-D10b: the UPDATE policy on waitlists had no WITH CHECK and no column limit, and clients held UPDATE on the table: a customer
--       could turn their own row into a 'notified' claim with a 100-year window, and the owner of the branch could hand a
--       customer's entry to someone else. The policy and the privilege are gone; cancel_waitlist_entry is the one client command
--       (join_waitlist, claim_waitlist_slot and the backfill job are already SECURITY DEFINER).

DROP POLICY IF EXISTS "Promotional codes readable by admins or when active" ON public.promotional_codes;
DROP POLICY IF EXISTS "Admins read promotional codes" ON public.promotional_codes;
CREATE POLICY "Admins read promotional codes"
  ON public.promotional_codes FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Customers and providers cancel waitlist entries" ON public.waitlists;
REVOKE UPDATE, DELETE ON public.waitlists FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.cancel_waitlist_entry(p_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.waitlists;
  v_provider_id UUID;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_actor TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_row FROM public.waitlists WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NOT NULL THEN
    SELECT provider_id INTO v_provider_id FROM public.branches WHERE id = v_row.branch_id;
  END IF;

  IF v_row.id IS NOT NULL AND v_row.customer_id = v_uid THEN
    v_actor := 'customer';
  ELSIF v_row.id IS NOT NULL AND public.can_access_provider_operation(v_provider_id, v_row.branch_id, 'bookings') THEN
    v_actor := CASE WHEN public.is_admin() AND NOT EXISTS (SELECT 1 FROM public.providers WHERE id = v_provider_id AND owner_id = v_uid)
                    THEN 'admin' ELSE 'provider' END;
  ELSE
    -- Another person's entry is answered like one that does not exist.
    RAISE EXCEPTION 'Waitlist entry not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_actor = 'admin' AND (v_reason IS NULL OR char_length(v_reason) < 3) THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;

  IF v_row.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', TRUE, 'id', v_row.id, 'status', 'cancelled', 'changed', FALSE);
  END IF;
  IF v_row.status NOT IN ('active', 'notified') THEN
    RAISE EXCEPTION 'A % waitlist entry can no longer be cancelled', v_row.status USING ERRCODE = '22023';
  END IF;

  UPDATE public.waitlists SET status = 'cancelled' WHERE id = v_row.id;
  PERFORM public.write_audit_log('waitlist.cancelled', 'waitlists', v_row.id,
    jsonb_build_object('by', v_actor, 'previous_status', v_row.status, 'reason', CASE WHEN v_actor = 'customer' THEN NULL ELSE v_reason END));
  RETURN jsonb_build_object('success', TRUE, 'id', v_row.id, 'status', 'cancelled', 'changed', TRUE);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_waitlist_entry(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_waitlist_entry(UUID, TEXT) TO authenticated;
