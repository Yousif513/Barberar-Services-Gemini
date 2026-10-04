-- Migration: 20261005010000_review_fix_money.sql
-- Corrective pass for P1-D / P2-B money flows (review 2026-10-04):
--   * nothing with monetary value (gift card, package, tip, subscription) becomes active
--     without a captured payment confirmed by the payment webhook
--   * refunds leave only through recorded refund_requests processed by process-refund
--   * payouts use allocations so the same balance cannot be requested or released twice
--   * provider fee invoices, PSP reconciliation, disputes and tax receipts use real data
--   * returning marketplace clients are free (approved strategy; the 10% repeat fee was never approved)

-- ---------------------------------------------------------------------------
-- 0. Fee rules: returning marketplace clients pay no platform fee
-- ---------------------------------------------------------------------------
UPDATE public.fee_rules
SET fee_percentage = 0, min_fee_sar = 0, max_fee_sar = 0,
    description = 'Marketplace returning client - no platform fee (approved strategy, report 14). Changing this requires owner approval.'
WHERE channel = 'marketplace' AND is_first_visit = FALSE;

-- ---------------------------------------------------------------------------
-- 1. Pending-payment states for purchasable items
-- ---------------------------------------------------------------------------
ALTER TABLE public.gift_cards
  ADD COLUMN IF NOT EXISTS payment_intent_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE public.gift_cards DROP CONSTRAINT IF EXISTS gift_cards_status_check;
ALTER TABLE public.gift_cards ADD CONSTRAINT gift_cards_status_check
  CHECK (status IN ('pending_payment', 'active', 'partially_redeemed', 'redeemed', 'expired', 'cancelled'));

ALTER TABLE public.user_packages
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS payment_intent_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE public.user_packages DROP CONSTRAINT IF EXISTS user_packages_status_check;
ALTER TABLE public.user_packages ADD CONSTRAINT user_packages_status_check
  CHECK (status IN ('pending_payment', 'active', 'expired', 'cancelled'));

ALTER TABLE public.booking_tips
  ADD COLUMN IF NOT EXISTS payment_intent_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  plan_id VARCHAR NOT NULL REFERENCES public.subscription_plans(id),
  billing_interval VARCHAR NOT NULL CHECK (billing_interval IN ('monthly', 'yearly')),
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'paid', 'cancelled')),
  requested_by UUID NOT NULL REFERENCES public.profiles(id),
  payment_intent_id TEXT UNIQUE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners read own subscription payments" ON public.subscription_payments;
CREATE POLICY "Owners read own subscription payments"
  ON public.subscription_payments FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id = subscription_payments.provider_id AND p.owner_id = auth.uid()));

ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS vat_number VARCHAR(15);
ALTER TABLE public.providers DROP CONSTRAINT IF EXISTS providers_vat_number_format;
ALTER TABLE public.providers ADD CONSTRAINT providers_vat_number_format
  CHECK (vat_number IS NULL OR vat_number ~ '^3[0-9]{13}3$');

ALTER TABLE public.invoices ALTER COLUMN zatca_status SET DEFAULT 'not_submitted';

-- PSP totals are unknown until Tap data is fetched; NULL means "not supplied", never zero.
ALTER TABLE public.psp_reconciliation_runs ALTER COLUMN total_captured_sar DROP NOT NULL;
ALTER TABLE public.psp_reconciliation_runs ALTER COLUMN total_refunded_sar DROP NOT NULL;
ALTER TABLE public.psp_reconciliation_runs ALTER COLUMN discrepancy_count DROP NOT NULL;
UPDATE public.invoices SET zatca_status = 'not_submitted' WHERE zatca_status = 'reported';

CREATE TABLE IF NOT EXISTS public.payout_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_request_id UUID NOT NULL REFERENCES public.payout_requests(id) ON DELETE RESTRICT,
  ledger_id UUID NOT NULL REFERENCES public.transactional_ledger(id) ON DELETE RESTRICT,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payout_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read payout allocations" ON public.payout_allocations;
CREATE POLICY "Admins read payout allocations"
  ON public.payout_allocations FOR SELECT TO authenticated USING (public.is_admin());

ALTER TABLE public.payment_disputes ADD COLUMN IF NOT EXISTS refund_request_id UUID REFERENCES public.refund_requests(id);

-- Gift-card codes are bearer credentials: long and unguessable.
CREATE OR REPLACE FUNCTION public.generate_gift_card_code()
RETURNS TEXT
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'PRM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
$$;

-- ---------------------------------------------------------------------------
-- 2. Purchases: each function creates a pending record; payment-checkout charges it;
--    the payment webhook calls confirm_purchase_payment after verifying the charge with Tap.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.purchase_gift_card(TEXT, TEXT, TEXT, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION public.purchase_gift_card(
  p_recipient_name TEXT,
  p_recipient_phone TEXT,
  p_recipient_email TEXT,
  p_amount NUMERIC,
  p_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_card public.gift_cards;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to purchase gift cards' USING ERRCODE = '28000';
  END IF;
  IF p_amount IS NULL OR p_amount < 50 OR p_amount > 5000 THEN
    RAISE EXCEPTION 'Gift card amount must be between 50 and 5000 SAR' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(TRIM(COALESCE(p_recipient_name, '')), '') IS NULL OR NULLIF(TRIM(COALESCE(p_recipient_phone, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Recipient name and phone are required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.gift_cards (code, purchaser_id, recipient_name, recipient_phone, recipient_email, message,
                                 original_amount, remaining_balance, status, expires_at)
  VALUES (public.generate_gift_card_code(), v_user_id, TRIM(p_recipient_name), TRIM(p_recipient_phone),
          NULLIF(TRIM(COALESCE(p_recipient_email, '')), ''), p_message, ROUND(p_amount, 2), ROUND(p_amount, 2),
          'pending_payment', now() + interval '365 days')
  RETURNING * INTO v_card;

  RETURN jsonb_build_object('success', TRUE, 'purchase_type', 'gift_card', 'purchase_id', v_card.id,
                            'gift_card_id', v_card.id, 'amount_sar', v_card.original_amount,
                            'status', 'pending_payment');
END;
$$;

DROP FUNCTION IF EXISTS public.purchase_service_package(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.purchase_service_package(
  p_package_id UUID,
  p_payment_method TEXT DEFAULT 'card'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_package public.packages;
  v_row public.user_packages;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to purchase packages' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_package FROM public.packages WHERE id = p_package_id AND COALESCE(is_active, TRUE);
  IF v_package.id IS NULL THEN
    RAISE EXCEPTION 'Package not found or inactive' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.user_packages (customer_id, package_id, remaining_sessions, expires_at, status, amount_paid)
  VALUES (v_user_id, v_package.id, 0, NULL, 'pending_payment', v_package.price)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('success', TRUE, 'purchase_type', 'package', 'purchase_id', v_row.id,
                            'user_package_id', v_row.id, 'package_id', v_package.id,
                            'amount_sar', v_package.price, 'status', 'pending_payment');
END;
$$;

DROP FUNCTION IF EXISTS public.add_booking_tip(UUID, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION public.add_booking_tip(
  p_booking_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'card'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_booking public.bookings;
  v_provider_id UUID;
  v_tip public.booking_tips;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to send tips' USING ERRCODE = '28000';
  END IF;
  IF p_amount IS NULL OR p_amount < 5 OR p_amount > 1000 THEN
    RAISE EXCEPTION 'Tip amount must be between 5 and 1000 SAR' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL OR v_booking.customer_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Only the booking customer can send a tip' USING ERRCODE = '42501';
  END IF;
  IF v_booking.status <> 'completed' THEN
    RAISE EXCEPTION 'Tips can be sent after a completed visit' USING ERRCODE = '22023';
  END IF;
  SELECT provider_id INTO v_provider_id FROM public.branches WHERE id = v_booking.branch_id;

  SELECT * INTO v_tip FROM public.booking_tips WHERE booking_id = p_booking_id;
  IF v_tip.id IS NOT NULL THEN
    IF v_tip.status <> 'pending' THEN
      RAISE EXCEPTION 'A tip was already sent for this visit' USING ERRCODE = '23505';
    END IF;
    UPDATE public.booking_tips SET amount = ROUND(p_amount, 2),
      payment_method = CASE WHEN p_payment_method IN ('card', 'apple_pay', 'mada') THEN p_payment_method ELSE 'card' END
    WHERE id = v_tip.id RETURNING * INTO v_tip;
  ELSE
    INSERT INTO public.booking_tips (booking_id, customer_id, employee_id, provider_id, amount, payment_method, status)
    VALUES (p_booking_id, v_user_id, v_booking.employee_id, v_provider_id, ROUND(p_amount, 2),
            CASE WHEN p_payment_method IN ('card', 'apple_pay', 'mada') THEN p_payment_method ELSE 'card' END, 'pending')
    RETURNING * INTO v_tip;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'purchase_type', 'tip', 'purchase_id', v_tip.id,
                            'tip_id', v_tip.id, 'amount_sar', v_tip.amount, 'status', 'pending_payment');
END;
$$;

DROP FUNCTION IF EXISTS public.subscribe_provider_plan(UUID, CHARACTER VARYING, CHARACTER VARYING, TEXT);
CREATE OR REPLACE FUNCTION public.subscribe_provider_plan(
  p_provider_id UUID,
  p_plan_id VARCHAR,
  p_billing_interval VARCHAR DEFAULT 'monthly'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_plan public.subscription_plans;
  v_amount NUMERIC(10,2);
  v_payment public.subscription_payments;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = v_user_id) THEN
    RAISE EXCEPTION 'Only the provider owner can change the subscription' USING ERRCODE = '42501';
  END IF;
  IF p_billing_interval NOT IN ('monthly', 'yearly') THEN
    RAISE EXCEPTION 'Billing interval must be monthly or yearly' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id AND COALESCE(is_active, TRUE);
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'P0002';
  END IF;
  v_amount := CASE WHEN p_billing_interval = 'yearly' THEN v_plan.price_yearly_sar ELSE v_plan.price_monthly_sar END;

  UPDATE public.subscription_payments SET status = 'cancelled'
  WHERE provider_id = p_provider_id AND status = 'pending_payment';

  INSERT INTO public.subscription_payments (provider_id, plan_id, billing_interval, amount, requested_by, status)
  VALUES (p_provider_id, v_plan.id, p_billing_interval, v_amount, v_user_id,
          CASE WHEN v_amount = 0 THEN 'paid' ELSE 'pending_payment' END)
  RETURNING * INTO v_payment;

  -- Free plans need no payment and activate immediately.
  IF v_amount = 0 THEN
    INSERT INTO public.provider_subscriptions (provider_id, plan_id, billing_interval, status,
                                               current_period_start, current_period_end)
    VALUES (p_provider_id, v_plan.id, p_billing_interval, 'active', now(),
            now() + CASE WHEN p_billing_interval = 'yearly' THEN interval '1 year' ELSE interval '1 month' END)
    ON CONFLICT (provider_id) DO UPDATE
    SET plan_id = EXCLUDED.plan_id, billing_interval = EXCLUDED.billing_interval, status = 'active',
        current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end;
    PERFORM public.write_audit_log('subscription.activated', 'providers', p_provider_id,
      jsonb_build_object('plan_id', v_plan.id, 'amount', 0));
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'purchase_type', 'subscription', 'purchase_id', v_payment.id,
                            'plan_id', v_plan.id, 'billing_interval', p_billing_interval,
                            'amount_sar', v_amount, 'status', v_payment.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_purchase_payment(
  p_purchase_type TEXT,
  p_purchase_id UUID,
  p_payment_intent_id TEXT,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card public.gift_cards;
  v_pack public.user_packages;
  v_package public.packages;
  v_tip public.booking_tips;
  v_sub public.subscription_payments;
  v_current public.provider_subscriptions;
  v_start TIMESTAMPTZ;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.transactional_ledger WHERE payment_intent_id = p_payment_intent_id) THEN
    RETURN jsonb_build_object('success', TRUE, 'status', 'already_recorded');
  END IF;

  IF p_purchase_type = 'gift_card' THEN
    SELECT * INTO v_card FROM public.gift_cards WHERE id = p_purchase_id FOR UPDATE;
    IF v_card.id IS NULL OR v_card.status <> 'pending_payment' THEN
      RAISE EXCEPTION 'Gift card is not awaiting payment' USING ERRCODE = '22023';
    END IF;
    IF p_amount <> v_card.original_amount THEN
      RAISE EXCEPTION 'Captured amount does not match the gift card amount' USING ERRCODE = '22003';
    END IF;
    UPDATE public.gift_cards
    SET status = 'active', paid_at = now(), payment_intent_id = p_payment_intent_id,
        expires_at = now() + interval '365 days'
    WHERE id = v_card.id;
    -- Prepaid value is a platform liability until it is spent at a provider.
    INSERT INTO public.transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id,
                                             total_captured, platform_share, provider_share, payout_status)
    VALUES (NULL, NULL, 'gift_card_sale', p_payment_intent_id, p_amount, p_amount, 0, 'not_applicable');

  ELSIF p_purchase_type = 'package' THEN
    SELECT * INTO v_pack FROM public.user_packages WHERE id = p_purchase_id FOR UPDATE;
    IF v_pack.id IS NULL OR v_pack.status <> 'pending_payment' THEN
      RAISE EXCEPTION 'Package is not awaiting payment' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_package FROM public.packages WHERE id = v_pack.package_id;
    IF p_amount <> v_pack.amount_paid THEN
      RAISE EXCEPTION 'Captured amount does not match the package price' USING ERRCODE = '22003';
    END IF;
    UPDATE public.user_packages
    SET status = 'active', paid_at = now(), payment_intent_id = p_payment_intent_id,
        remaining_sessions = v_package.session_count,
        expires_at = CASE WHEN v_package.expires_in_days IS NULL THEN NULL
                          ELSE now() + make_interval(days => v_package.expires_in_days) END
    WHERE id = v_pack.id;
    INSERT INTO public.transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id,
                                             total_captured, platform_share, provider_share, payout_status)
    VALUES (NULL, v_package.provider_id, 'package_sale', p_payment_intent_id, p_amount, 0, p_amount, 'pending');

  ELSIF p_purchase_type = 'tip' THEN
    SELECT * INTO v_tip FROM public.booking_tips WHERE id = p_purchase_id FOR UPDATE;
    IF v_tip.id IS NULL OR v_tip.status <> 'pending' THEN
      RAISE EXCEPTION 'Tip is not awaiting payment' USING ERRCODE = '22023';
    END IF;
    IF p_amount <> v_tip.amount THEN
      RAISE EXCEPTION 'Captured amount does not match the tip' USING ERRCODE = '22003';
    END IF;
    UPDATE public.booking_tips SET status = 'completed', paid_at = now(), payment_intent_id = p_payment_intent_id
    WHERE id = v_tip.id;
    -- 100% of the tip is owed to the provider for the professional; no platform share.
    INSERT INTO public.transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id,
                                             total_captured, platform_share, provider_share, employee_share, payout_status)
    VALUES (v_tip.booking_id, v_tip.provider_id, 'tip', p_payment_intent_id, p_amount, 0, p_amount, p_amount, 'pending');

  ELSIF p_purchase_type = 'subscription' THEN
    SELECT * INTO v_sub FROM public.subscription_payments WHERE id = p_purchase_id FOR UPDATE;
    IF v_sub.id IS NULL OR v_sub.status <> 'pending_payment' THEN
      RAISE EXCEPTION 'Subscription payment is not awaiting payment' USING ERRCODE = '22023';
    END IF;
    IF p_amount <> v_sub.amount THEN
      RAISE EXCEPTION 'Captured amount does not match the plan price' USING ERRCODE = '22003';
    END IF;
    UPDATE public.subscription_payments SET status = 'paid', paid_at = now(), payment_intent_id = p_payment_intent_id
    WHERE id = v_sub.id;

    SELECT * INTO v_current FROM public.provider_subscriptions WHERE provider_id = v_sub.provider_id FOR UPDATE;
    v_start := CASE WHEN v_current.id IS NOT NULL AND v_current.status = 'active'
                         AND v_current.plan_id = v_sub.plan_id AND v_current.current_period_end > now()
                    THEN v_current.current_period_end ELSE now() END;

    INSERT INTO public.provider_subscriptions (provider_id, plan_id, billing_interval, status,
                                               current_period_start, current_period_end, tap_subscription_id)
    VALUES (v_sub.provider_id, v_sub.plan_id, v_sub.billing_interval, 'active', v_start,
            v_start + CASE WHEN v_sub.billing_interval = 'yearly' THEN interval '1 year' ELSE interval '1 month' END,
            p_payment_intent_id)
    ON CONFLICT (provider_id) DO UPDATE
    SET plan_id = EXCLUDED.plan_id, billing_interval = EXCLUDED.billing_interval, status = 'active',
        current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end,
        tap_subscription_id = EXCLUDED.tap_subscription_id;

    INSERT INTO public.transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id,
                                             total_captured, platform_share, provider_share, payout_status)
    VALUES (NULL, v_sub.provider_id, 'subscription', p_payment_intent_id, p_amount, p_amount, 0, 'not_applicable');
  ELSE
    RAISE EXCEPTION 'Unknown purchase type %', p_purchase_type USING ERRCODE = '22023';
  END IF;

  PERFORM public.write_audit_log('purchase.paid', p_purchase_type, p_purchase_id,
    jsonb_build_object('payment_intent_id', p_payment_intent_id, 'amount', p_amount));

  RETURN jsonb_build_object('success', TRUE, 'status', 'activated', 'purchase_type', p_purchase_type,
                            'purchase_id', p_purchase_id);
END;
$$;

-- Read-only checkout previews (no balances change until the booking is created)
DROP FUNCTION IF EXISTS public.validate_and_apply_coupon(TEXT, UUID, NUMERIC);
CREATE OR REPLACE FUNCTION public.validate_and_apply_coupon(
  p_code TEXT,
  p_provider_id UUID,
  p_order_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon public.promotional_codes;
  v_discount NUMERIC(10,2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_coupon FROM public.promotional_codes WHERE UPPER(code) = UPPER(TRIM(COALESCE(p_code, '')));
  IF v_coupon.id IS NULL OR NOT COALESCE(v_coupon.is_active, FALSE)
     OR (v_coupon.starts_at IS NOT NULL AND v_coupon.starts_at > now())
     OR (v_coupon.ends_at IS NOT NULL AND v_coupon.ends_at < now())
     OR (v_coupon.max_redemptions IS NOT NULL AND v_coupon.redeemed_count >= v_coupon.max_redemptions)
     OR (v_coupon.provider_id IS NOT NULL AND v_coupon.provider_id <> p_provider_id)
     OR COALESCE(p_order_amount, 0) < COALESCE(v_coupon.min_order_amount, 0) THEN
    RETURN jsonb_build_object('valid', FALSE, 'code', UPPER(TRIM(COALESCE(p_code, ''))));
  END IF;

  IF v_coupon.discount_type = 'percentage' THEN
    v_discount := ROUND(p_order_amount * LEAST(v_coupon.discount_value, 100) / 100.0, 2);
    IF v_coupon.max_discount_cap IS NOT NULL THEN
      v_discount := LEAST(v_discount, v_coupon.max_discount_cap);
    END IF;
  ELSE
    v_discount := LEAST(v_coupon.discount_value, p_order_amount);
  END IF;

  RETURN jsonb_build_object('valid', TRUE, 'code', v_coupon.code, 'coupon_id', v_coupon.id,
                            'discount_type', v_coupon.discount_type, 'discount_value', v_coupon.discount_value,
                            'discount_amount', v_discount, 'original_amount', p_order_amount,
                            'final_amount', p_order_amount - v_discount, 'funding_source', v_coupon.funding_source);
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_gift_card(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card public.gift_cards;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_card FROM public.gift_cards WHERE UPPER(code) = UPPER(TRIM(COALESCE(p_code, '')));
  IF v_card.id IS NULL OR v_card.status NOT IN ('active', 'partially_redeemed') OR v_card.remaining_balance <= 0
     OR (v_card.expires_at IS NOT NULL AND v_card.expires_at < now()) THEN
    RETURN jsonb_build_object('valid', FALSE);
  END IF;
  RETURN jsonb_build_object('valid', TRUE, 'code', v_card.code, 'remaining_balance', v_card.remaining_balance,
                            'expires_at', v_card.expires_at);
END;
$$;

-- These applied discounts after the booking was priced (and were never charged). Discounts
-- are now applied inside create_booking.
DROP FUNCTION IF EXISTS public.apply_coupon_to_booking(UUID, TEXT);
DROP FUNCTION IF EXISTS public.redeem_gift_card(TEXT, UUID, NUMERIC);
DROP FUNCTION IF EXISTS public.redeem_loyalty_points(UUID, INTEGER);

DROP FUNCTION IF EXISTS public.redeem_package_session(UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.redeem_package_session(
  p_user_package_id UUID,
  p_booking_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_pack public.user_packages;
  v_package public.packages;
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_pack FROM public.user_packages WHERE id = p_user_package_id FOR UPDATE;
  IF v_pack.id IS NULL THEN
    RAISE EXCEPTION 'Package not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_package FROM public.packages WHERE id = v_pack.package_id;

  IF NOT (public.is_provider_staff(v_package.provider_id, v_user_id) OR public.is_admin()) THEN
    RAISE EXCEPTION 'Only the provider''s staff can record a package session' USING ERRCODE = '42501';
  END IF;
  IF v_pack.status <> 'active' THEN
    RAISE EXCEPTION 'This package is not active' USING ERRCODE = '22023';
  END IF;
  IF v_pack.expires_at IS NOT NULL AND v_pack.expires_at < now() THEN
    UPDATE public.user_packages SET status = 'expired' WHERE id = v_pack.id;
    RAISE EXCEPTION 'This package has expired' USING ERRCODE = '22023';
  END IF;
  IF v_pack.remaining_sessions <= 0 THEN
    RAISE EXCEPTION 'No sessions remain on this package' USING ERRCODE = '22023';
  END IF;

  IF p_booking_id IS NOT NULL THEN
    SELECT b.* INTO v_booking FROM public.bookings b
    JOIN public.branches br ON br.id = b.branch_id
    WHERE b.id = p_booking_id AND br.provider_id = v_package.provider_id;
    IF v_booking.id IS NULL OR v_booking.customer_id IS DISTINCT FROM v_pack.customer_id THEN
      RAISE EXCEPTION 'The booking does not belong to this package holder at this provider' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.package_redemptions WHERE booking_id = p_booking_id) THEN
      RAISE EXCEPTION 'A package session was already recorded for this booking' USING ERRCODE = '23505';
    END IF;
  END IF;

  UPDATE public.user_packages SET remaining_sessions = remaining_sessions - 1 WHERE id = v_pack.id;
  INSERT INTO public.package_redemptions (user_package_id, booking_id, customer_id, notes)
  VALUES (v_pack.id, p_booking_id, v_pack.customer_id, p_notes);
  PERFORM public.write_audit_log('package.session_redeemed', 'user_packages', v_pack.id,
    jsonb_build_object('booking_id', p_booking_id, 'remaining', v_pack.remaining_sessions - 1));

  RETURN jsonb_build_object('success', TRUE, 'user_package_id', v_pack.id, 'remaining_sessions', v_pack.remaining_sessions - 1);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Refund processing (called only by the process-refund Edge Function with the service key)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_refund_request(
  p_booking_id UUID,
  p_amount NUMERIC,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator role required' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;
  v_id := public.create_refund_request_internal(p_booking_id, p_amount, 'admin', TRIM(p_reason),
                                                'admin:' || p_booking_id::text || ':' || gen_random_uuid()::text);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Nothing refundable remains on this booking' USING ERRCODE = '22023';
  END IF;
  RETURN v_id;
END;
$$;

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

  UPDATE public.refund_requests SET status = 'processing', attempts = attempts + 1 WHERE id = v_refund.id;
  RETURN jsonb_build_object('claimed', TRUE, 'refund_id', v_refund.id, 'payment_intent_id', v_refund.payment_intent_id,
                            'amount', v_refund.amount, 'idempotency_key', v_refund.idempotency_key,
                            'booking_id', v_refund.booking_id, 'reason', v_refund.reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_refund_request(
  p_refund_id UUID,
  p_succeeded BOOLEAN,
  p_gateway_refund_id TEXT,
  p_error TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.refund_requests;
  v_booking_status public.booking_status;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_refund FROM public.refund_requests WHERE id = p_refund_id FOR UPDATE;
  IF v_refund.id IS NULL OR v_refund.status <> 'processing' THEN
    RAISE EXCEPTION 'Refund request is not being processed' USING ERRCODE = '22023';
  END IF;

  IF NOT p_succeeded THEN
    UPDATE public.refund_requests SET status = 'failed', error_message = LEFT(COALESCE(p_error, 'Gateway refused the refund'), 1000)
    WHERE id = v_refund.id;
    PERFORM public.write_audit_log('refund.failed', 'refund_requests', v_refund.id, jsonb_build_object('error', p_error));
    RETURN jsonb_build_object('success', FALSE, 'status', 'failed');
  END IF;

  UPDATE public.refund_requests
  SET status = 'succeeded', gateway_refund_id = p_gateway_refund_id, processed_at = now(), error_message = NULL
  WHERE id = v_refund.id;

  UPDATE public.transactional_ledger SET refunded_amount = refunded_amount + v_refund.amount WHERE id = v_refund.ledger_id;

  SELECT status INTO v_booking_status FROM public.bookings WHERE id = v_refund.booking_id;
  IF v_booking_status IN ('cancelled', 'no_show') THEN
    PERFORM public.ledger_settle_unperformed_booking(v_refund.booking_id);
  ELSE
    -- Refund on a performed visit (dispute / admin): reduce what the provider is owed first.
    UPDATE public.transactional_ledger
    SET provider_share = GREATEST(provider_share - v_refund.amount, 0),
        platform_share = GREATEST(platform_share - GREATEST(v_refund.amount - provider_share, 0), 0)
    WHERE id = v_refund.ledger_id;
  END IF;

  UPDATE public.transactional_ledger
  SET payout_status = 'refunded'
  WHERE id = v_refund.ledger_id AND total_captured - refunded_amount <= 0;

  PERFORM public.write_audit_log('refund.succeeded', 'refund_requests', v_refund.id,
    jsonb_build_object('amount', v_refund.amount, 'gateway_refund_id', p_gateway_refund_id, 'booking_id', v_refund.booking_id));

  RETURN jsonb_build_object('success', TRUE, 'status', 'succeeded');
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Payouts: allocations make every riyal payable exactly once
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_available_balance(p_provider_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((
      SELECT SUM(tl.provider_share - COALESCE((SELECT SUM(pa.amount) FROM public.payout_allocations pa WHERE pa.ledger_id = tl.id), 0))
      FROM public.transactional_ledger tl
      WHERE tl.provider_id = p_provider_id AND tl.payout_status = 'pending'
    ), 0)
    - COALESCE((
      SELECT SUM(pr.amount) FROM public.payout_requests pr
      WHERE pr.provider_id = p_provider_id AND pr.status IN ('requested', 'processing')
    ), 0);
$$;

CREATE OR REPLACE FUNCTION public.request_provider_payout(
  p_provider_id UUID,
  p_amount NUMERIC,
  p_bank_name TEXT,
  p_iban TEXT
)
RETURNS public.payout_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_iban TEXT := UPPER(regexp_replace(COALESCE(p_iban, ''), '\s+', '', 'g'));
  v_available NUMERIC(10,2);
  v_request public.payout_requests;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = v_user_id) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to request payouts for this provider' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payout amount must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF v_iban !~ '^SA[0-9]{22}$' THEN
    RAISE EXCEPTION 'Invalid Saudi IBAN: SA followed by 22 digits' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(TRIM(COALESCE(p_bank_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Bank name is required' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.providers WHERE id = p_provider_id FOR UPDATE;
  v_available := public.provider_available_balance(p_provider_id);
  IF p_amount > v_available THEN
    RAISE EXCEPTION 'Requested amount (% SAR) exceeds the available balance (% SAR)', p_amount, v_available
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.payout_requests (provider_id, requested_by, amount, bank_name, iban, status)
  VALUES (p_provider_id, v_user_id, ROUND(p_amount, 2), TRIM(p_bank_name), v_iban, 'requested')
  RETURNING * INTO v_request;

  PERFORM public.write_audit_log('payout.requested', 'payout_requests', v_request.id,
    jsonb_build_object('provider_id', p_provider_id, 'amount', v_request.amount));
  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_release_payout(
  p_payout_request_id UUID,
  p_idempotency_key TEXT,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.payout_requests;
  v_remaining NUMERIC(10,2);
  v_row RECORD;
  v_take NUMERIC(10,2);
  v_rows INT := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can release payouts' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Idempotency key is required for payout release' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admin_audit_logs
             WHERE action = 'payout.released' AND details->>'idempotency_key' = p_idempotency_key) THEN
    RETURN jsonb_build_object('status', 'already_processed', 'idempotent', TRUE);
  END IF;

  SELECT * INTO v_request FROM public.payout_requests WHERE id = p_payout_request_id FOR UPDATE;
  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Payout request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_request.status NOT IN ('requested', 'processing') THEN
    RAISE EXCEPTION 'Payout request is %', v_request.status USING ERRCODE = '23505';
  END IF;

  v_remaining := v_request.amount;
  FOR v_row IN
    SELECT tl.id, tl.provider_share - COALESCE((SELECT SUM(pa.amount) FROM public.payout_allocations pa WHERE pa.ledger_id = tl.id), 0) AS open_amount
    FROM public.transactional_ledger tl
    WHERE tl.provider_id = v_request.provider_id AND tl.payout_status = 'pending'
    ORDER BY tl.created_at, tl.id
    FOR UPDATE OF tl
  LOOP
    EXIT WHEN v_remaining <= 0;
    CONTINUE WHEN v_row.open_amount <= 0;
    v_take := LEAST(v_row.open_amount, v_remaining);
    INSERT INTO public.payout_allocations (payout_request_id, ledger_id, amount) VALUES (v_request.id, v_row.id, v_take);
    IF v_take = v_row.open_amount THEN
      UPDATE public.transactional_ledger SET payout_status = 'released', payout_request_id = v_request.id WHERE id = v_row.id;
    END IF;
    v_remaining := v_remaining - v_take;
    v_rows := v_rows + 1;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Ledger balance (% SAR short) does not cover this payout', v_remaining USING ERRCODE = '22023';
  END IF;

  UPDATE public.payout_requests
  SET status = 'paid', processed_at = now(), processed_by = auth.uid(),
      admin_note = COALESCE(p_admin_note, admin_note)
  WHERE id = v_request.id;

  PERFORM public.write_audit_log('payout.released', 'payout_requests', v_request.id,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'provider_id', v_request.provider_id,
                       'amount', v_request.amount, 'ledger_rows', v_rows, 'note', p_admin_note));

  RETURN jsonb_build_object('status', 'success', 'payout_request_id', v_request.id,
                            'released_amount', v_request.amount, 'ledger_rows_count', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_release_ledger_item(
  p_ledger_id UUID,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.transactional_ledger;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can settle ledger rows' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.transactional_ledger WHERE id = p_ledger_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Ledger row not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.payout_status <> 'pending' THEN
    RETURN jsonb_build_object('status', 'already_' || v_row.payout_status, 'idempotent', TRUE);
  END IF;
  IF EXISTS (SELECT 1 FROM public.payout_allocations WHERE ledger_id = p_ledger_id) THEN
    RAISE EXCEPTION 'This row is partly allocated to a payout; release it through the payout request' USING ERRCODE = '22023';
  END IF;
  UPDATE public.transactional_ledger SET payout_status = 'released' WHERE id = p_ledger_id;
  PERFORM public.write_audit_log('ledger.manually_settled', 'transactional_ledger', p_ledger_id,
    jsonb_build_object('provider_share', v_row.provider_share, 'idempotency_key', p_idempotency_key));
  RETURN jsonb_build_object('status', 'released', 'ledger_id', p_ledger_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Provider fee invoice: commission per fee_rules on completed visits, minus what was
--    already withheld from online deposits.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_provider_monthly_fee_invoice(
  p_provider_id UUID,
  p_month_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start DATE := date_trunc('month', p_month_date)::date;
  v_end DATE := (date_trunc('month', p_month_date) + interval '1 month - 1 day')::date;
  v_count INT;
  v_gmv NUMERIC(12,2);
  v_commission NUMERIC(12,2);
  v_collected NUMERIC(12,2);
  v_receivable NUMERIC(12,2);
  v_vat NUMERIC(12,2);
  v_number TEXT := 'FEE-' || to_char(v_start, 'YYYYMM') || '-' || left(p_provider_id::text, 8);
  v_id UUID;
BEGIN
  IF NOT public.is_admin() AND COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only administrators can issue provider fee invoices' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(b.total_price), 0), COALESCE(SUM(b.platform_commission), 0)
  INTO v_count, v_gmv, v_commission
  FROM public.bookings b
  JOIN public.branches br ON br.id = b.branch_id
  WHERE br.provider_id = p_provider_id
    AND b.status = 'completed'
    AND (b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN v_start AND v_end;

  SELECT COALESCE(SUM(tl.platform_share), 0) INTO v_collected
  FROM public.transactional_ledger tl
  JOIN public.bookings b ON b.id = tl.booking_id
  JOIN public.branches br ON br.id = b.branch_id
  WHERE br.provider_id = p_provider_id
    AND tl.entry_type = 'booking_payment'
    AND b.status = 'completed'
    AND (b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN v_start AND v_end;

  v_receivable := GREATEST(v_commission - v_collected, 0);
  v_vat := ROUND(v_receivable * 0.15, 2);

  INSERT INTO public.provider_fee_invoices (provider_id, invoice_number, period_start, period_end, total_bookings_count,
    gross_gmv_sar, deposit_captured_sar, platform_commission_sar, net_fee_receivable_sar, vat_on_commission_sar,
    total_invoice_due_sar, status)
  VALUES (p_provider_id, v_number, v_start, v_end, v_count, v_gmv, v_collected, v_commission, v_receivable, v_vat,
          v_receivable + v_vat, CASE WHEN v_receivable = 0 THEN 'settled' ELSE 'issued' END)
  ON CONFLICT (invoice_number) DO UPDATE
  SET total_bookings_count = EXCLUDED.total_bookings_count, gross_gmv_sar = EXCLUDED.gross_gmv_sar,
      deposit_captured_sar = EXCLUDED.deposit_captured_sar, platform_commission_sar = EXCLUDED.platform_commission_sar,
      net_fee_receivable_sar = EXCLUDED.net_fee_receivable_sar, vat_on_commission_sar = EXCLUDED.vat_on_commission_sar,
      total_invoice_due_sar = EXCLUDED.total_invoice_due_sar, status = EXCLUDED.status
  RETURNING id INTO v_id;

  PERFORM public.write_audit_log('fee_invoice.generated', 'provider_fee_invoices', v_id,
    jsonb_build_object('provider_id', p_provider_id, 'month', to_char(v_start, 'YYYY-MM'), 'due', v_receivable + v_vat));

  RETURN jsonb_build_object('success', TRUE, 'invoice_id', v_id, 'invoice_number', v_number,
                            'completed_bookings', v_count, 'commission_sar', v_commission,
                            'already_collected_sar', v_collected, 'receivable_sar', v_receivable,
                            'vat_sar', v_vat, 'total_due_sar', v_receivable + v_vat);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. PSP reconciliation: compares the ledger with totals reported by Tap (fetched by the
--    reconcile-psp Edge Function). Without PSP figures the run is recorded as awaiting data,
--    never as "matched".
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.run_daily_psp_reconciliation(DATE);
CREATE OR REPLACE FUNCTION public.run_daily_psp_reconciliation(
  p_date DATE DEFAULT CURRENT_DATE,
  p_psp_captured NUMERIC DEFAULT NULL,
  p_psp_refunded NUMERIC DEFAULT NULL,
  p_psp_count INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger_captured NUMERIC(12,2);
  v_ledger_count INT;
  v_ledger_refunded NUMERIC(12,2);
  v_diff NUMERIC(12,2) := 0;
  v_status TEXT;
  v_id UUID;
BEGIN
  IF NOT public.is_admin() AND COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only administrators can run PSP reconciliation' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(total_captured), 0), COUNT(*)
  INTO v_ledger_captured, v_ledger_count
  FROM public.transactional_ledger
  WHERE entry_type IN ('booking_payment', 'tip', 'package_sale', 'gift_card_sale', 'subscription')
    AND (created_at AT TIME ZONE 'Asia/Riyadh')::date = p_date;

  SELECT COALESCE(SUM(amount), 0) INTO v_ledger_refunded
  FROM public.refund_requests
  WHERE status = 'succeeded' AND (processed_at AT TIME ZONE 'Asia/Riyadh')::date = p_date;

  IF p_psp_captured IS NULL THEN
    v_status := 'awaiting_psp_data';
  ELSE
    v_diff := ABS(p_psp_captured - v_ledger_captured) + ABS(COALESCE(p_psp_refunded, 0) - v_ledger_refunded);
    v_status := CASE WHEN v_diff = 0 AND (p_psp_count IS NULL OR p_psp_count = v_ledger_count) THEN 'matched' ELSE 'discrepancy' END;
  END IF;

  INSERT INTO public.psp_reconciliation_runs (run_date, gateway, total_captured_sar, total_refunded_sar,
    total_ledger_gross_sar, discrepancy_amount_sar, discrepancy_count, status, notes)
  VALUES (p_date, 'tap', p_psp_captured, p_psp_refunded, v_ledger_captured, v_diff,
          CASE WHEN p_psp_count IS NULL THEN NULL ELSE ABS(p_psp_count - v_ledger_count) END, v_status,
          CASE v_status
            WHEN 'awaiting_psp_data' THEN 'Ledger totals recorded; Tap totals not supplied yet (run the reconcile-psp function).'
            WHEN 'matched' THEN 'Tap totals match the ledger.'
            ELSE 'Tap totals differ from the ledger; investigate before releasing payouts.' END)
  ON CONFLICT (run_date) DO UPDATE
  SET total_captured_sar = EXCLUDED.total_captured_sar, total_refunded_sar = EXCLUDED.total_refunded_sar,
      total_ledger_gross_sar = EXCLUDED.total_ledger_gross_sar, discrepancy_amount_sar = EXCLUDED.discrepancy_amount_sar,
      discrepancy_count = EXCLUDED.discrepancy_count, status = EXCLUDED.status, notes = EXCLUDED.notes
  RETURNING id INTO v_id;

  PERFORM public.write_audit_log('psp.reconciliation_run', 'psp_reconciliation_runs', v_id,
    jsonb_build_object('date', p_date, 'status', v_status, 'difference', v_diff));

  RETURN jsonb_build_object('success', TRUE, 'reconciliation_id', v_id, 'date', p_date, 'status', v_status,
                            'ledger_captured_sar', v_ledger_captured, 'ledger_refunded_sar', v_ledger_refunded,
                            'psp_captured_sar', p_psp_captured, 'psp_refunded_sar', p_psp_refunded,
                            'difference_sar', v_diff);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Disputes: a refund decision creates a refund request (money moves only via process-refund)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_booking_dispute(
  p_booking_id UUID,
  p_reason TEXT,
  p_evidence_urls TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_booking public.bookings;
  v_ledger public.transactional_ledger;
  v_provider_id UUID;
  v_id UUID;
BEGIN
  IF NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Please describe the problem' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL OR v_booking.customer_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Only the booking customer can open a dispute' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_ledger FROM public.transactional_ledger
  WHERE booking_id = p_booking_id AND entry_type = 'booking_payment' ORDER BY created_at LIMIT 1;
  IF v_ledger.id IS NULL OR v_ledger.total_captured - v_ledger.refunded_amount <= 0 THEN
    RAISE EXCEPTION 'There is no online payment on this booking to dispute' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_disputes WHERE booking_id = p_booking_id AND status IN ('opened', 'under_review')) THEN
    RAISE EXCEPTION 'A dispute is already open for this booking' USING ERRCODE = '23505';
  END IF;
  SELECT provider_id INTO v_provider_id FROM public.branches WHERE id = v_booking.branch_id;

  INSERT INTO public.payment_disputes (booking_id, customer_id, provider_id, charge_id, disputed_amount_sar,
                                       reason, status, evidence_urls)
  VALUES (p_booking_id, v_user_id, v_provider_id, v_ledger.payment_intent_id,
          v_ledger.total_captured - v_ledger.refunded_amount, TRIM(p_reason), 'opened', COALESCE(p_evidence_urls, '{}'))
  RETURNING id INTO v_id;

  PERFORM public.write_audit_log('dispute.opened', 'payment_disputes', v_id,
    jsonb_build_object('booking_id', p_booking_id, 'amount', v_ledger.total_captured - v_ledger.refunded_amount));
  RETURN jsonb_build_object('success', TRUE, 'dispute_id', v_id, 'status', 'opened');
END;
$$;

DROP FUNCTION IF EXISTS public.resolve_booking_dispute(UUID, CHARACTER VARYING, TEXT);
CREATE OR REPLACE FUNCTION public.resolve_booking_dispute(
  p_dispute_id UUID,
  p_resolution VARCHAR,
  p_admin_notes TEXT DEFAULT NULL,
  p_refund_amount NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dispute public.payment_disputes;
  v_refund_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can resolve disputes' USING ERRCODE = '42501';
  END IF;
  IF p_resolution NOT IN ('resolved_refund', 'resolved_rejected') THEN
    RAISE EXCEPTION 'Resolution must be resolved_refund or resolved_rejected' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(TRIM(COALESCE(p_admin_notes, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A resolution note is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_dispute FROM public.payment_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_dispute.id IS NULL THEN
    RAISE EXCEPTION 'Dispute not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_dispute.status NOT IN ('opened', 'under_review') THEN
    RAISE EXCEPTION 'Dispute is already %', v_dispute.status USING ERRCODE = '22023';
  END IF;

  IF p_resolution = 'resolved_refund' THEN
    v_refund_id := public.create_refund_request_internal(v_dispute.booking_id,
      COALESCE(p_refund_amount, v_dispute.disputed_amount_sar), 'dispute', TRIM(p_admin_notes),
      'dispute:' || v_dispute.id::text);
    IF v_refund_id IS NULL THEN
      RAISE EXCEPTION 'Nothing refundable remains on this booking' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.payment_disputes
  SET status = p_resolution, admin_notes = TRIM(p_admin_notes), resolved_by = auth.uid(), resolved_at = now(),
      refund_request_id = v_refund_id
  WHERE id = v_dispute.id;

  PERFORM public.write_audit_log('dispute.resolved', 'payment_disputes', v_dispute.id,
    jsonb_build_object('resolution', p_resolution, 'refund_request_id', v_refund_id, 'notes', TRIM(p_admin_notes)));

  RETURN jsonb_build_object('success', TRUE, 'dispute_id', v_dispute.id, 'status', p_resolution,
                            'refund_request_id', v_refund_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Simplified tax invoice with a ZATCA Phase 1 QR (TLV). This is NOT a Phase 2 (FATOORA)
--    cleared invoice: zatca_status stays 'not_submitted' until a certified integration exists.
--    The seller VAT number is the provider's own; no invoice is issued without it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_zatca_tax_invoice(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_booking public.bookings;
  v_provider public.providers;
  v_existing public.invoices;
  v_prev TEXT;
  v_number TEXT;
  v_total NUMERIC(10,2);
  v_iso TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_hash TEXT;
  v_qr TEXT;
  v_buyer TEXT;
  v_id UUID;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (v_booking.customer_id = v_user_id OR public.is_booking_staff(p_booking_id, v_user_id) OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized to view this invoice' USING ERRCODE = '42501';
  END IF;
  IF v_booking.status <> 'completed' THEN
    RAISE EXCEPTION 'An invoice is issued after the visit is completed' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing FROM public.invoices WHERE booking_id = p_booking_id;
  IF v_existing.id IS NOT NULL THEN
    RETURN to_jsonb(v_existing) || jsonb_build_object('success', TRUE, 'idempotent', TRUE);
  END IF;

  SELECT p.* INTO v_provider FROM public.branches br JOIN public.providers p ON p.id = br.provider_id
  WHERE br.id = v_booking.branch_id;
  IF v_provider.vat_number IS NULL THEN
    RAISE EXCEPTION 'This provider has not registered a VAT number, so a tax invoice cannot be issued. Ask the provider for a receipt.'
      USING ERRCODE = '22023';
  END IF;

  v_total := v_booking.total_price + v_booking.tax_amount;
  v_number := 'INV-' || nextval('public.zatca_invoice_seq')::text;
  SELECT invoice_hash INTO v_prev FROM public.invoices WHERE provider_id = v_provider.id ORDER BY created_at DESC LIMIT 1;
  v_prev := COALESCE(v_prev, encode(extensions.digest('0', 'sha256'), 'base64'));
  v_hash := encode(extensions.digest(v_prev || v_number || v_total::text || v_booking.tax_amount::text || v_iso, 'sha256'), 'base64');
  v_qr := encode(
    public.zatca_tlv_tag(1, COALESCE(v_provider.business_name_ar, v_provider.business_name_en))
    || public.zatca_tlv_tag(2, v_provider.vat_number)
    || public.zatca_tlv_tag(3, v_iso)
    || public.zatca_tlv_tag(4, to_char(v_total, 'FM999999990.00'))
    || public.zatca_tlv_tag(5, to_char(v_booking.tax_amount, 'FM999999990.00')),
    'base64');

  SELECT NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), '') INTO v_buyer
  FROM public.profiles WHERE id = v_booking.customer_id;

  INSERT INTO public.invoices (booking_id, provider_id, customer_id, invoice_number, subtotal_sar, vat_rate_percent,
    vat_amount_sar, total_amount_sar, seller_name, seller_vat_number, buyer_name, previous_invoice_hash,
    invoice_hash, zatca_qr_code, zatca_status)
  VALUES (p_booking_id, v_provider.id, v_booking.customer_id, v_number, v_booking.total_price, 15,
          v_booking.tax_amount, v_total, COALESCE(v_provider.business_name_ar, v_provider.business_name_en),
          v_provider.vat_number, COALESCE(v_buyer, v_booking.walk_in_name), v_prev, v_hash, v_qr, 'not_submitted')
  RETURNING id INTO v_id;

  RETURN (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = v_id) || jsonb_build_object('success', TRUE);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.generate_gift_card_code()',
    'public.provider_available_balance(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'public.confirm_purchase_payment(text, uuid, text, numeric)',
    'public.claim_refund_request(uuid)',
    'public.complete_refund_request(uuid, boolean, text, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'public.purchase_gift_card(text, text, text, numeric, text)',
    'public.purchase_service_package(uuid, text)',
    'public.add_booking_tip(uuid, numeric, text)',
    'public.subscribe_provider_plan(uuid, character varying, character varying)',
    'public.validate_and_apply_coupon(text, uuid, numeric)',
    'public.preview_gift_card(text)',
    'public.redeem_package_session(uuid, uuid, text)',
    'public.admin_create_refund_request(uuid, numeric, text)',
    'public.request_provider_payout(uuid, numeric, text, text)',
    'public.admin_release_payout(uuid, text, text)',
    'public.admin_release_ledger_item(uuid, text)',
    'public.generate_provider_monthly_fee_invoice(uuid, date)',
    'public.run_daily_psp_reconciliation(date, numeric, numeric, integer)',
    'public.open_booking_dispute(uuid, text, text[])',
    'public.resolve_booking_dispute(uuid, character varying, text, numeric)',
    'public.generate_zatca_tax_invoice(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;
