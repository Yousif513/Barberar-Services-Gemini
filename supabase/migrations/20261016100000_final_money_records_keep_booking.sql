-- FINAL-1: review M3 / N2 (docs/reviews/2026-10-11-security-priv-recheck.md). A tip, coupon, gift-card, wallet-credit, package or
-- loyalty record on a booking the deletion engine judged "unlinked" disappeared with the booking (ON DELETE CASCADE from bookings,
-- let through by the append-only guard's no_delete_allow_cascade mode). These are money records kept 10 years (Commercial Books
-- Law Art. 8; VAT Implementing Regulations Art. 66).
--   * A booking with any money record is linked: the engine pseudonymises it and never deletes it.
--   * Every money table's foreign key to bookings becomes RESTRICT, so no path (the engine, a console, a cascade) can delete a
--     booking that carries a money record, and no money row can follow a deleted booking out of the database.

CREATE OR REPLACE FUNCTION public.privacy_booking_is_linked(p_booking_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.transactional_ledger WHERE booking_id = p_booking_id)
      OR EXISTS (SELECT 1 FROM public.invoices WHERE booking_id = p_booking_id)
      OR EXISTS (SELECT 1 FROM public.refund_requests WHERE booking_id = p_booking_id)
      OR EXISTS (SELECT 1 FROM public.payment_disputes WHERE booking_id = p_booking_id)
      OR EXISTS (SELECT 1 FROM public.membership_redemptions WHERE booking_id = p_booking_id)
      OR EXISTS (SELECT 1 FROM public.sponsored_attributions WHERE booking_id = p_booking_id)
      -- Review N2: the money sub-records of a booking.
      OR EXISTS (SELECT 1 FROM public.booking_tips WHERE booking_id = p_booking_id)
      OR EXISTS (SELECT 1 FROM public.coupon_redemptions WHERE booking_id = p_booking_id)
      OR EXISTS (SELECT 1 FROM public.gift_card_redemptions WHERE booking_id = p_booking_id)
      OR EXISTS (SELECT 1 FROM public.wallet_credit_redemptions WHERE booking_id = p_booking_id)
      OR EXISTS (SELECT 1 FROM public.package_redemptions WHERE booking_id = p_booking_id)
      OR EXISTS (SELECT 1 FROM public.loyalty_points_ledger WHERE booking_id = p_booking_id)
      OR EXISTS (SELECT 1 FROM public.customer_referrals WHERE qualifying_booking_id = p_booking_id)
      OR EXISTS (SELECT 1 FROM public.bookings WHERE id = p_booking_id AND (fee_invoice_id IS NOT NULL OR user_package_id IS NOT NULL));
$$;
REVOKE ALL ON FUNCTION public.privacy_booking_is_linked(UUID) FROM PUBLIC, anon, authenticated;

-- Every money table (the ones carrying the append-only guard) that points at a booking: RESTRICT instead of CASCADE / SET NULL.
DO $restrict$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND c.confrelid = 'public.bookings'::regclass AND cardinality(c.conkey) = 1
       AND c.confdeltype <> 'r'
       AND EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = c.conrelid AND t.tgname = 'trg_money_append_only')
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.bookings(id) ON DELETE RESTRICT',
                   r.tbl, r.conname, r.col);
  END LOOP;
END $restrict$;
