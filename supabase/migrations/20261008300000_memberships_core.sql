-- G65 Memberships, part 1: provider plans, customer memberships (state machine with a snapshot of the sold terms), the payment record,
-- the redemption ledger of visits, and the money path.
--
-- Decisions (see docs/work-packages/member-report.md):
--   * v1 benefit is INCLUDED VISITS only. Percentage discounts are deferred.
--   * A membership is bought through the hosted payment flow and becomes active ONLY in confirm_membership_payment, which only the
--     service role (the payment webhook) can call. The customer cannot activate, extend or top up a membership.
--   * Renewal is customer-initiated: a new pending membership for the next period (it starts when the current period ends).
--   * Terms (price, visits, period, covered services) are copied onto the membership row when it is bought. Editing a plan never
--     changes a membership that was already sold.
--   * Money mirrors a package purchase exactly: one ledger row of entry type package_sale, platform_share 0, provider_share = amount,
--     payout pending (confirm_purchase_payment, package branch). Revenue is recognised at purchase; a redemption records delivery only.
--   * Plans start INACTIVE and have no default price, visits or period: those are the provider's own.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.membership_plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id       UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  name_en           TEXT NOT NULL CHECK (length(btrim(name_en)) BETWEEN 1 AND 120),
  name_ar           TEXT NOT NULL CHECK (length(btrim(name_ar)) BETWEEN 1 AND 120),
  description_en    TEXT CHECK (description_en IS NULL OR length(description_en) <= 1000),
  description_ar    TEXT CHECK (description_ar IS NULL OR length(description_ar) <= 1000),
  price             NUMERIC(10,2) NOT NULL CHECK (price > 0 AND price <= 100000),
  period_days       INTEGER NOT NULL CHECK (period_days BETWEEN 1 AND 3660),
  visits_per_period INTEGER NOT NULL CHECK (visits_per_period BETWEEN 1 AND 1000),
  covers_all_services BOOLEAN NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT FALSE,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_membership_plans_provider ON public.membership_plans (provider_id, is_active);

CREATE TABLE IF NOT EXISTS public.membership_plan_services (
  plan_id    UUID NOT NULL REFERENCES public.membership_plans(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  PRIMARY KEY (plan_id, service_id)
);
CREATE INDEX IF NOT EXISTS idx_membership_plan_services_service ON public.membership_plan_services (service_id);

CREATE TABLE IF NOT EXISTS public.memberships (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  plan_id             UUID REFERENCES public.membership_plans(id) ON DELETE SET NULL,
  provider_id         UUID NOT NULL REFERENCES public.providers(id) ON DELETE RESTRICT,
  status              TEXT NOT NULL DEFAULT 'pending_payment'
                        CHECK (status IN ('pending_payment', 'active', 'expired', 'cancelled')),
  -- Snapshot of the terms at the moment of purchase.
  plan_name_en        TEXT NOT NULL,
  plan_name_ar        TEXT NOT NULL,
  amount_due          NUMERIC(10,2) NOT NULL CHECK (amount_due > 0),
  period_days         INTEGER NOT NULL CHECK (period_days > 0),
  visits_per_period   INTEGER NOT NULL CHECK (visits_per_period > 0),
  covers_all_services BOOLEAN NOT NULL,
  covered_service_ids UUID[] NOT NULL DEFAULT '{}',
  -- State.
  visits_remaining    INTEGER NOT NULL DEFAULT 0 CHECK (visits_remaining >= 0),
  period_start        TIMESTAMPTZ,
  period_end          TIMESTAMPTZ,
  renewal_of          UUID REFERENCES public.memberships(id) ON DELETE SET NULL,
  idempotency_key     TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  payment_intent_id   TEXT,
  paid_at             TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  cancelled_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cancel_reason       TEXT,
  reminder_sent_at    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT memberships_active_has_period CHECK (status NOT IN ('active', 'expired') OR (period_start IS NOT NULL AND period_end IS NOT NULL AND paid_at IS NOT NULL)),
  CONSTRAINT memberships_visits_within_terms CHECK (visits_remaining <= visits_per_period)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_memberships_idempotency ON public.memberships (customer_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_memberships_payment_intent ON public.memberships (payment_intent_id) WHERE payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_memberships_one_pending_renewal ON public.memberships (renewal_of) WHERE renewal_of IS NOT NULL AND status = 'pending_payment';
CREATE INDEX IF NOT EXISTS idx_memberships_customer ON public.memberships (customer_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_provider ON public.memberships (provider_id, status, period_end);

CREATE TABLE IF NOT EXISTS public.membership_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id     UUID NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
  customer_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  provider_id       UUID NOT NULL REFERENCES public.providers(id) ON DELETE RESTRICT,
  amount            NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  payment_intent_id TEXT,
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT membership_payments_paid_has_intent CHECK (status <> 'paid' OR (payment_intent_id IS NOT NULL AND paid_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_membership_payments_one_per_membership ON public.membership_payments (membership_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_membership_payments_intent ON public.membership_payments (payment_intent_id) WHERE payment_intent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.membership_redemptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
  booking_id    UUID NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  customer_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  provider_id   UUID NOT NULL REFERENCES public.providers(id) ON DELETE RESTRICT,
  redeemed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes         TEXT CHECK (notes IS NULL OR length(notes) <= 500),
  voided_at     TIMESTAMPTZ,
  voided_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  void_reason   TEXT,
  CONSTRAINT membership_redemptions_void_has_reason CHECK (voided_at IS NULL OR (void_reason IS NOT NULL AND length(btrim(void_reason)) >= 3))
);
-- One live redemption per booking, enforced by the database so two concurrent redemptions of the same booking cannot both win.
CREATE UNIQUE INDEX IF NOT EXISTS uq_membership_redemptions_booking ON public.membership_redemptions (booking_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_membership_redemptions_membership ON public.membership_redemptions (membership_id, redeemed_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Row level security: clients read only; every change goes through a command below
-- ---------------------------------------------------------------------------
ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_plan_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_redemptions ENABLE ROW LEVEL SECURITY;

-- is_provider_staff is deliberately not executable by clients; policies ask about the signed-in user only through this wrapper.
CREATE OR REPLACE FUNCTION public.is_membership_staff(p_provider_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_admin()
    OR public.is_provider_staff(p_provider_id, auth.uid())
    OR public.can_access_provider_operation(p_provider_id, NULL, 'bookings')
  );
$fn$;

DROP POLICY IF EXISTS membership_plans_read ON public.membership_plans;
CREATE POLICY membership_plans_read ON public.membership_plans FOR SELECT TO authenticated
  USING (
    is_active
    OR public.is_admin()
    OR public.is_membership_staff(provider_id)
  );

DROP POLICY IF EXISTS membership_plan_services_read ON public.membership_plan_services;
CREATE POLICY membership_plan_services_read ON public.membership_plan_services FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.membership_plans mp WHERE mp.id = membership_plan_services.plan_id));

DROP POLICY IF EXISTS memberships_read ON public.memberships;
CREATE POLICY memberships_read ON public.memberships FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR public.is_membership_staff(provider_id)
  );

DROP POLICY IF EXISTS membership_payments_read ON public.membership_payments;
CREATE POLICY membership_payments_read ON public.membership_payments FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id = membership_payments.provider_id AND p.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS membership_redemptions_read ON public.membership_redemptions;
CREATE POLICY membership_redemptions_read ON public.membership_redemptions FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR public.is_membership_staff(provider_id)
  );

-- ---------------------------------------------------------------------------
-- 3. Plan commands (provider owner or administrator)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.membership_validate_plan_terms(
  p_provider_id UUID, p_name_en TEXT, p_name_ar TEXT, p_price NUMERIC, p_period_days INTEGER, p_visits INTEGER,
  p_covers_all BOOLEAN, p_service_ids UUID[]
) RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF p_name_en IS NULL OR length(btrim(p_name_en)) NOT BETWEEN 1 AND 120 OR p_name_ar IS NULL OR length(btrim(p_name_ar)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Both an English and an Arabic plan name are required (up to 120 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_price IS NULL OR p_price <= 0 OR p_price > 100000 OR round(p_price, 2) <> p_price THEN
    RAISE EXCEPTION 'The price must be a positive SAR amount with at most two decimals' USING ERRCODE = '22023';
  END IF;
  IF p_period_days IS NULL OR p_period_days NOT BETWEEN 1 AND 3660 THEN
    RAISE EXCEPTION 'The period must be between 1 and 3660 days' USING ERRCODE = '22023';
  END IF;
  IF p_visits IS NULL OR p_visits NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Included visits must be between 1 and 1000' USING ERRCODE = '22023';
  END IF;
  IF p_covers_all IS NULL THEN
    RAISE EXCEPTION 'State whether the plan covers every service or only chosen ones' USING ERRCODE = '22023';
  END IF;
  IF p_covers_all AND COALESCE(cardinality(p_service_ids), 0) > 0 THEN
    RAISE EXCEPTION 'A plan that covers every service cannot also list services' USING ERRCODE = '22023';
  END IF;
  IF NOT p_covers_all THEN
    IF COALESCE(cardinality(p_service_ids), 0) = 0 THEN
      RAISE EXCEPTION 'Choose at least one covered service' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(p_service_ids) sid
      WHERE NOT EXISTS (SELECT 1 FROM public.services s WHERE s.id = sid AND s.provider_id = p_provider_id)
    ) THEN
      RAISE EXCEPTION 'Every covered service must belong to this provider' USING ERRCODE = '22023';
    END IF;
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.provider_create_membership_plan(
  p_provider_id UUID, p_name_en TEXT, p_name_ar TEXT, p_description_en TEXT, p_description_ar TEXT,
  p_price NUMERIC, p_period_days INTEGER, p_visits_per_period INTEGER, p_covers_all_services BOOLEAN, p_service_ids UUID[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user UUID := auth.uid();
  v_plan_id UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id) THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (public.is_admin() OR EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = v_user)) THEN
    RAISE EXCEPTION 'Only the provider owner can define membership plans' USING ERRCODE = '42501';
  END IF;
  PERFORM public.membership_validate_plan_terms(p_provider_id, p_name_en, p_name_ar, p_price, p_period_days, p_visits_per_period,
                                                p_covers_all_services, p_service_ids);
  INSERT INTO public.membership_plans (provider_id, name_en, name_ar, description_en, description_ar, price, period_days,
                                       visits_per_period, covers_all_services, is_active, created_by)
  VALUES (p_provider_id, btrim(p_name_en), btrim(p_name_ar), NULLIF(btrim(COALESCE(p_description_en, '')), ''),
          NULLIF(btrim(COALESCE(p_description_ar, '')), ''), p_price, p_period_days, p_visits_per_period,
          p_covers_all_services, FALSE, v_user)
  RETURNING id INTO v_plan_id;
  IF NOT p_covers_all_services THEN
    INSERT INTO public.membership_plan_services (plan_id, service_id)
    SELECT v_plan_id, sid FROM (SELECT DISTINCT unnest(p_service_ids) AS sid) x;
  END IF;
  PERFORM public.write_audit_log('membership.plan_created', 'membership_plans', v_plan_id,
    jsonb_build_object('provider_id', p_provider_id, 'price', p_price, 'period_days', p_period_days, 'visits', p_visits_per_period));
  RETURN jsonb_build_object('success', TRUE, 'plan_id', v_plan_id, 'is_active', FALSE);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.provider_update_membership_plan(
  p_plan_id UUID, p_name_en TEXT, p_name_ar TEXT, p_description_en TEXT, p_description_ar TEXT,
  p_price NUMERIC, p_period_days INTEGER, p_visits_per_period INTEGER, p_covers_all_services BOOLEAN, p_service_ids UUID[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user UUID := auth.uid();
  v_plan public.membership_plans;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_plan FROM public.membership_plans WHERE id = p_plan_id FOR UPDATE;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (public.is_admin() OR EXISTS (SELECT 1 FROM public.providers WHERE id = v_plan.provider_id AND owner_id = v_user)) THEN
    -- Another provider's plan is answered as not found; only a staff member of this provider learns it exists.
    IF public.is_provider_staff(v_plan.provider_id, v_user) THEN
      RAISE EXCEPTION 'Only the provider owner can edit membership plans' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.membership_validate_plan_terms(v_plan.provider_id, p_name_en, p_name_ar, p_price, p_period_days, p_visits_per_period,
                                                p_covers_all_services, p_service_ids);
  -- Memberships already sold keep the terms they were sold with (snapshot on the membership row).
  UPDATE public.membership_plans
     SET name_en = btrim(p_name_en), name_ar = btrim(p_name_ar),
         description_en = NULLIF(btrim(COALESCE(p_description_en, '')), ''),
         description_ar = NULLIF(btrim(COALESCE(p_description_ar, '')), ''),
         price = p_price, period_days = p_period_days, visits_per_period = p_visits_per_period,
         covers_all_services = p_covers_all_services, updated_at = now()
   WHERE id = v_plan.id;
  DELETE FROM public.membership_plan_services WHERE plan_id = v_plan.id;
  IF NOT p_covers_all_services THEN
    INSERT INTO public.membership_plan_services (plan_id, service_id)
    SELECT v_plan.id, sid FROM (SELECT DISTINCT unnest(p_service_ids) AS sid) x;
  END IF;
  PERFORM public.write_audit_log('membership.plan_updated', 'membership_plans', v_plan.id,
    jsonb_build_object('provider_id', v_plan.provider_id, 'old_price', v_plan.price, 'price', p_price,
                       'old_visits', v_plan.visits_per_period, 'visits', p_visits_per_period,
                       'old_period_days', v_plan.period_days, 'period_days', p_period_days));
  RETURN jsonb_build_object('success', TRUE, 'plan_id', v_plan.id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.provider_set_membership_plan_active(p_plan_id UUID, p_active BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user UUID := auth.uid();
  v_plan public.membership_plans;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_active IS NULL THEN RAISE EXCEPTION 'State whether the plan is on sale' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_plan FROM public.membership_plans WHERE id = p_plan_id FOR UPDATE;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (public.is_admin() OR EXISTS (SELECT 1 FROM public.providers WHERE id = v_plan.provider_id AND owner_id = v_user)) THEN
    IF public.is_provider_staff(v_plan.provider_id, v_user) THEN
      RAISE EXCEPTION 'Only the provider owner can put a plan on or off sale' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.membership_plans SET is_active = p_active, updated_at = now() WHERE id = v_plan.id;
  PERFORM public.write_audit_log(CASE WHEN p_active THEN 'membership.plan_activated' ELSE 'membership.plan_deactivated' END,
    'membership_plans', v_plan.id, jsonb_build_object('provider_id', v_plan.provider_id));
  RETURN jsonb_build_object('success', TRUE, 'plan_id', v_plan.id, 'is_active', p_active);
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Customer commands: purchase, renew, cancel
-- ---------------------------------------------------------------------------
-- Shared by purchase and renewal: snapshot the plan onto a new pending membership and its pending payment record.
CREATE OR REPLACE FUNCTION public.membership_open_purchase(p_customer UUID, p_plan_id UUID, p_key TEXT, p_renewal_of UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_plan public.membership_plans;
  v_row public.memberships;
  v_services UUID[];
BEGIN
  IF p_key IS NULL OR length(btrim(p_key)) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'An idempotency key of 8 to 128 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.memberships WHERE customer_id = p_customer AND idempotency_key = p_key;
  IF v_row.id IS NOT NULL THEN
    IF v_row.plan_id IS DISTINCT FROM p_plan_id OR v_row.renewal_of IS DISTINCT FROM p_renewal_of THEN
      RAISE EXCEPTION 'This idempotency key was already used for a different purchase' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', TRUE, 'purchase_type', 'membership', 'purchase_id', v_row.id, 'membership_id', v_row.id,
                              'plan_id', v_row.plan_id, 'amount_sar', v_row.amount_due, 'status', v_row.status, 'replayed', TRUE);
  END IF;

  SELECT mp.* INTO v_plan FROM public.membership_plans mp
   JOIN public.providers p ON p.id = mp.provider_id
   WHERE mp.id = p_plan_id AND mp.is_active AND p.status = 'active';
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'Membership plan not found or not on sale' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(array_agg(service_id ORDER BY service_id), '{}') INTO v_services
    FROM public.membership_plan_services WHERE plan_id = v_plan.id;

  BEGIN
  INSERT INTO public.memberships (customer_id, plan_id, provider_id, status, plan_name_en, plan_name_ar, amount_due, period_days,
                                  visits_per_period, covers_all_services, covered_service_ids, renewal_of, idempotency_key)
  VALUES (p_customer, v_plan.id, v_plan.provider_id, 'pending_payment', v_plan.name_en, v_plan.name_ar, v_plan.price, v_plan.period_days,
          v_plan.visits_per_period, v_plan.covers_all_services, v_services, p_renewal_of, p_key)
  RETURNING * INTO v_row;
  INSERT INTO public.membership_payments (membership_id, customer_id, provider_id, amount)
  VALUES (v_row.id, p_customer, v_row.provider_id, v_row.amount_due);
  EXCEPTION WHEN unique_violation THEN
    -- A concurrent retry with the same key (or a second open renewal) won the race: answer with the winner.
    SELECT * INTO v_row FROM public.memberships
     WHERE (customer_id = p_customer AND idempotency_key = p_key)
        OR (p_renewal_of IS NOT NULL AND renewal_of = p_renewal_of AND status = 'pending_payment')
     ORDER BY created_at LIMIT 1;
    IF v_row.id IS NULL THEN RAISE; END IF;
    RETURN jsonb_build_object('success', TRUE, 'purchase_type', 'membership', 'purchase_id', v_row.id, 'membership_id', v_row.id,
                              'plan_id', v_row.plan_id, 'amount_sar', v_row.amount_due, 'status', v_row.status, 'replayed', TRUE);
  END;
  PERFORM public.write_audit_log(CASE WHEN p_renewal_of IS NULL THEN 'membership.purchase_started' ELSE 'membership.renewal_started' END,
    'memberships', v_row.id, jsonb_build_object('plan_id', v_plan.id, 'amount', v_row.amount_due));

  RETURN jsonb_build_object('success', TRUE, 'purchase_type', 'membership', 'purchase_id', v_row.id, 'membership_id', v_row.id,
                            'plan_id', v_plan.id, 'amount_sar', v_row.amount_due, 'status', 'pending_payment', 'replayed', FALSE);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.purchase_membership(p_plan_id UUID, p_idempotency_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to buy a membership' USING ERRCODE = '28000';
  END IF;
  RETURN public.membership_open_purchase(auth.uid(), p_plan_id, p_idempotency_key, NULL);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.renew_membership(p_membership_id UUID, p_idempotency_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user UUID := auth.uid();
  v_prev public.memberships;
  v_open public.memberships;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_prev FROM public.memberships WHERE id = p_membership_id AND customer_id = v_user;
  IF v_prev.id IS NULL THEN RAISE EXCEPTION 'Membership not found' USING ERRCODE = 'P0002'; END IF;
  IF v_prev.status NOT IN ('active', 'expired') OR v_prev.plan_id IS NULL THEN
    RAISE EXCEPTION 'Only a paid membership can be renewed' USING ERRCODE = '22023';
  END IF;
  -- Retrying the same renewal returns the open one rather than creating a second charge.
  SELECT * INTO v_open FROM public.memberships WHERE renewal_of = v_prev.id AND status = 'pending_payment';
  IF v_open.id IS NOT NULL AND v_open.idempotency_key <> p_idempotency_key THEN
    RETURN jsonb_build_object('success', TRUE, 'purchase_type', 'membership', 'purchase_id', v_open.id, 'membership_id', v_open.id,
                              'plan_id', v_open.plan_id, 'amount_sar', v_open.amount_due, 'status', v_open.status, 'replayed', TRUE);
  END IF;
  RETURN public.membership_open_purchase(v_user, v_prev.plan_id, p_idempotency_key, v_prev.id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.cancel_membership(p_membership_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user UUID := auth.uid();
  v_row public.memberships;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.memberships WHERE id = p_membership_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Membership not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (v_row.customer_id = v_user OR public.is_admin()
          OR EXISTS (SELECT 1 FROM public.providers WHERE id = v_row.provider_id AND owner_id = v_user)) THEN
    IF public.is_provider_staff(v_row.provider_id, v_user) THEN
      RAISE EXCEPTION 'Only the provider owner can cancel a membership' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Membership not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', TRUE, 'membership_id', v_row.id, 'status', 'cancelled', 'replayed', TRUE);
  END IF;
  IF v_row.status NOT IN ('pending_payment', 'active') THEN
    RAISE EXCEPTION 'This membership has already ended' USING ERRCODE = '22023';
  END IF;
  -- Cancelling never moves money: a refund of a paid membership goes through the existing refund process.
  UPDATE public.memberships
     SET status = 'cancelled', cancelled_at = now(), cancelled_by = v_user, cancel_reason = btrim(p_reason), updated_at = now()
   WHERE id = v_row.id;
  PERFORM public.write_audit_log('membership.cancelled', 'memberships', v_row.id,
    jsonb_build_object('previous_status', v_row.status, 'visits_forfeited', v_row.visits_remaining, 'by_customer', v_row.customer_id = v_user));
  RETURN jsonb_build_object('success', TRUE, 'membership_id', v_row.id, 'status', 'cancelled', 'previous_status', v_row.status);
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. confirm_membership_payment: service role only (the payment webhook). Mirrors the package branch of confirm_purchase_payment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_membership_payment(p_membership_id UUID, p_payment_intent_id TEXT, p_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.memberships;
  v_pay public.membership_payments;
  v_prev public.memberships;
  v_start TIMESTAMPTZ;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_payment_intent_id IS NULL OR length(btrim(p_payment_intent_id)) = 0 THEN
    RAISE EXCEPTION 'A payment intent id is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.memberships WHERE id = p_membership_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Membership is not awaiting payment' USING ERRCODE = '22023';
  END IF;

  -- Replay: the same capture for the same membership changes nothing; the same capture for another purchase is refused.
  IF EXISTS (SELECT 1 FROM public.transactional_ledger WHERE payment_intent_id = p_payment_intent_id)
     OR EXISTS (SELECT 1 FROM public.membership_payments WHERE payment_intent_id = p_payment_intent_id) THEN
    IF v_row.payment_intent_id = p_payment_intent_id THEN
      RETURN jsonb_build_object('success', TRUE, 'status', 'already_recorded');
    END IF;
    RAISE EXCEPTION 'This payment was already used for another purchase' USING ERRCODE = '23505';
  END IF;

  IF v_row.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'Membership is not awaiting payment' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_pay FROM public.membership_payments WHERE membership_id = v_row.id FOR UPDATE;
  IF v_pay.id IS NULL OR v_pay.status <> 'pending' THEN
    RAISE EXCEPTION 'Membership is not awaiting payment' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <> v_row.amount_due OR p_amount <> v_pay.amount THEN
    RAISE EXCEPTION 'Captured amount does not match the membership price' USING ERRCODE = '22003';
  END IF;

  -- A renewal starts when the membership it renews ends, so the customer loses no days by renewing early.
  v_start := now();
  IF v_row.renewal_of IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.memberships WHERE id = v_row.renewal_of;
    IF v_prev.id IS NOT NULL AND v_prev.status = 'active' AND v_prev.period_end > v_start THEN
      v_start := v_prev.period_end;
    END IF;
  END IF;

  UPDATE public.membership_payments SET status = 'paid', payment_intent_id = p_payment_intent_id, paid_at = now() WHERE id = v_pay.id;
  UPDATE public.memberships
     SET status = 'active', paid_at = now(), payment_intent_id = p_payment_intent_id,
         period_start = v_start, period_end = v_start + make_interval(days => v_row.period_days),
         visits_remaining = v_row.visits_per_period, updated_at = now()
   WHERE id = v_row.id;

  -- Same money row as a package sale: revenue is recognised now, the provider is owed the full amount, payout pending.
  INSERT INTO public.transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id,
                                           total_captured, platform_share, provider_share, payout_status)
  VALUES (NULL, v_row.provider_id, 'package_sale', p_payment_intent_id, p_amount, 0, p_amount, 'pending');

  INSERT INTO public.notifications (user_id, title_en, title_ar, body_en, body_ar, type, data)
  VALUES (v_row.customer_id, 'Membership active', 'تم تفعيل العضوية',
          'Your membership ' || v_row.plan_name_en || ' is active with ' || v_row.visits_per_period || ' included visits.',
          'عضويتك ' || v_row.plan_name_ar || ' مفعلة مع ' || v_row.visits_per_period || ' زيارات مشمولة.',
          'membership', jsonb_build_object('membership_id', v_row.id));

  PERFORM public.write_audit_log('purchase.paid', 'membership', v_row.id,
    jsonb_build_object('payment_intent_id', p_payment_intent_id, 'amount', p_amount));

  RETURN jsonb_build_object('success', TRUE, 'status', 'activated', 'purchase_type', 'membership', 'purchase_id', v_row.id);
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 6. Privileges and the administrator audit trigger
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.membership_validate_plan_terms(UUID, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, BOOLEAN, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_membership_staff(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_membership_staff(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.membership_open_purchase(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provider_create_membership_plan(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, BOOLEAN, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provider_update_membership_plan(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, BOOLEAN, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provider_set_membership_plan_active(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purchase_membership(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_membership(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_membership(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_membership_payment(UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_create_membership_plan(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, BOOLEAN, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provider_update_membership_plan(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, BOOLEAN, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provider_set_membership_plan_active(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_membership(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.renew_membership(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_membership(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_membership_payment(UUID, TEXT, NUMERIC) TO service_role;

SELECT public.grant_data_api_access('public.membership_plans');
SELECT public.grant_data_api_access('public.membership_plan_services');
SELECT public.grant_data_api_access('public.memberships');
SELECT public.grant_data_api_access('public.membership_payments');
SELECT public.grant_data_api_access('public.membership_redemptions');
SELECT public.attach_admin_audit_trigger('public.membership_plans');
SELECT public.attach_admin_audit_trigger('public.membership_plan_services');
SELECT public.attach_admin_audit_trigger('public.memberships');
SELECT public.attach_admin_audit_trigger('public.membership_payments');
SELECT public.attach_admin_audit_trigger('public.membership_redemptions');
