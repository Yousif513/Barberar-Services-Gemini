-- PAY-WAVE2, red team RT-M3 (docs/reviews/2026-10-17-redteam-whole-stack.md).
--
-- Package terms were read at payment time: purchase_service_package kept only the price, and confirm_purchase_payment set the
-- sessions and the validity from the live package row, which the owner can change between purchase and payment (bought as 10
-- sessions, paid, received 1 session valid 1 day). A suspended or unverified provider's packages stayed public and could be bought,
-- and a provider deleting a package deleted the customers' paid packages with it (ON DELETE CASCADE).
--   * user_packages snapshots the terms at purchase: provider, service, sessions, validity in days and both names. Payment, the
--     session redemption and the customer screens use only the snapshot; the snapshot never changes afterwards.
--   * A package that has been sold keeps its price, sessions, validity, service and provider (create a new package instead), and
--     cannot be deleted (switch it off). user_packages.package_id no longer cascades.
--   * Only an active, verified provider sells: purchase_service_package and membership_open_purchase refuse otherwise, the public
--     package policy hides the packages of other providers, and a payment that arrives after the provider stopped selling is
--     recorded and refunded (the purchase is cancelled), for packages and memberships alike.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Who may sell
-- ---------------------------------------------------------------------------------------------------------------------

-- An active, verified provider. Definer so that the public policies can ask it without reading the providers table themselves.
CREATE OR REPLACE FUNCTION public.provider_is_selling(p_provider_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.providers p WHERE p.id = p_provider_id AND p.status = 'active' AND p.is_verified);
$$;
REVOKE ALL ON FUNCTION public.provider_is_selling(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_is_selling(UUID) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public read on packages" ON public.packages;
CREATE POLICY "Public read on packages" ON public.packages FOR SELECT
  USING (is_active = true AND public.provider_is_selling(provider_id));

SELECT pg_temp.patch_function('public.membership_open_purchase(uuid,uuid,text,uuid)'::regprocedure,
$from$   WHERE mp.id = p_plan_id AND mp.is_active AND p.status = 'active';$from$,
$to$   WHERE mp.id = p_plan_id AND mp.is_active AND p.status = 'active' AND p.is_verified;$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. The terms of a package are those at purchase
-- ---------------------------------------------------------------------------------------------------------------------

ALTER TABLE public.user_packages
  ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES public.providers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS service_id UUID,
  ADD COLUMN IF NOT EXISTS session_count INTEGER,
  ADD COLUMN IF NOT EXISTS expires_in_days INTEGER,
  ADD COLUMN IF NOT EXISTS package_name_en TEXT,
  ADD COLUMN IF NOT EXISTS package_name_ar TEXT;

-- Existing rows: the provider, service and names of their package; the sessions the customer actually received (what is left plus
-- what was used) once paid, the package's count while still unpaid.
UPDATE public.user_packages up
   SET provider_id = pk.provider_id,
       service_id = pk.service_id,
       expires_in_days = pk.expires_in_days,
       package_name_en = pk.name_en,
       package_name_ar = pk.name_ar,
       session_count = CASE
         WHEN up.status = 'pending_payment' THEN pk.session_count
         ELSE GREATEST(COALESCE(up.remaining_sessions, 0)
                       + (SELECT count(*)::int FROM public.package_redemptions pr WHERE pr.user_package_id = up.id AND pr.reversed_at IS NULL),
                       1)
       END
  FROM public.packages pk
 WHERE pk.id = up.package_id AND up.provider_id IS NULL;

-- A row written without the snapshot (a fixture or a server path) takes the package's terms at that moment, which is its purchase.
CREATE OR REPLACE FUNCTION public.user_packages_snapshot_terms()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_package public.packages;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v_package FROM public.packages WHERE id = NEW.package_id;
    NEW.provider_id := COALESCE(NEW.provider_id, v_package.provider_id);
    NEW.service_id := COALESCE(NEW.service_id, v_package.service_id);
    NEW.session_count := COALESCE(NEW.session_count, GREATEST(v_package.session_count, COALESCE(NEW.remaining_sessions, 0)));
    NEW.expires_in_days := COALESCE(NEW.expires_in_days, v_package.expires_in_days);
    NEW.package_name_en := COALESCE(NEW.package_name_en, v_package.name_en);
    NEW.package_name_ar := COALESCE(NEW.package_name_ar, v_package.name_ar);
    RETURN NEW;
  END IF;
  IF (NEW.package_id, NEW.provider_id, NEW.service_id, NEW.session_count, NEW.expires_in_days, NEW.package_name_en, NEW.package_name_ar, NEW.amount_paid)
     IS DISTINCT FROM (OLD.package_id, OLD.provider_id, OLD.service_id, OLD.session_count, OLD.expires_in_days, OLD.package_name_en, OLD.package_name_ar, OLD.amount_paid) THEN
    RAISE EXCEPTION 'The terms of a bought package never change' USING ERRCODE = '42501', HINT = 'package_terms_frozen';
  END IF;
  IF NEW.remaining_sessions > NEW.session_count THEN
    RAISE EXCEPTION 'A package cannot hold more sessions than it was bought with' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.user_packages_snapshot_terms() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_user_packages_snapshot_terms ON public.user_packages;
CREATE TRIGGER trg_user_packages_snapshot_terms BEFORE INSERT OR UPDATE ON public.user_packages
  FOR EACH ROW EXECUTE FUNCTION public.user_packages_snapshot_terms();

ALTER TABLE public.user_packages
  ALTER COLUMN provider_id SET NOT NULL,
  ALTER COLUMN session_count SET NOT NULL,
  ALTER COLUMN package_name_en SET NOT NULL,
  ALTER COLUMN package_name_ar SET NOT NULL;
ALTER TABLE public.user_packages DROP CONSTRAINT IF EXISTS user_packages_session_count_not_negative;
-- purchase_service_package sells only packages with sessions; a spent row may still record zero.
ALTER TABLE public.user_packages ADD CONSTRAINT user_packages_session_count_not_negative CHECK (session_count >= 0);
CREATE INDEX IF NOT EXISTS idx_user_packages_provider ON public.user_packages (provider_id, status);

-- A paid package is a money record: deleting its package no longer deletes it.
ALTER TABLE public.user_packages DROP CONSTRAINT IF EXISTS user_packages_package_id_fkey;
ALTER TABLE public.user_packages ADD CONSTRAINT user_packages_package_id_fkey
  FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE RESTRICT;

-- A sold package keeps its commercial terms and is switched off rather than deleted.
CREATE OR REPLACE FUNCTION public.packages_freeze_sold_terms()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_packages up WHERE up.package_id = OLD.id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'This package has been sold, so it cannot be deleted; switch it off instead' USING ERRCODE = '42501', HINT = 'package_sold';
  END IF;
  IF (NEW.price, NEW.session_count, NEW.expires_in_days, NEW.service_id, NEW.provider_id)
     IS DISTINCT FROM (OLD.price, OLD.session_count, OLD.expires_in_days, OLD.service_id, OLD.provider_id) THEN
    RAISE EXCEPTION 'This package has been sold, so its price, sessions, validity and service cannot change; switch it off and create a new package'
      USING ERRCODE = '42501', HINT = 'package_sold';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.packages_freeze_sold_terms() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_packages_freeze_sold_terms ON public.packages;
CREATE TRIGGER trg_packages_freeze_sold_terms BEFORE UPDATE OR DELETE ON public.packages
  FOR EACH ROW EXECUTE FUNCTION public.packages_freeze_sold_terms();

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Buying, paying and redeeming use the snapshot
-- ---------------------------------------------------------------------------------------------------------------------

SELECT pg_temp.patch_function('public.purchase_service_package(uuid,text)'::regprocedure,
$from$  SELECT * INTO v_package FROM public.packages WHERE id = p_package_id AND COALESCE(is_active, TRUE);
  IF v_package.id IS NULL THEN
    RAISE EXCEPTION 'Package not found or inactive' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.user_packages (customer_id, package_id, remaining_sessions, expires_at, status, amount_paid)
  VALUES (v_user_id, v_package.id, 0, NULL, 'pending_payment', v_package.price)
  RETURNING * INTO v_row;$from$,
$to$  -- RT-M3: only an active, verified provider sells, and the customer buys the terms shown now.
  SELECT pk.* INTO v_package FROM public.packages pk
   WHERE pk.id = p_package_id AND COALESCE(pk.is_active, TRUE) AND public.provider_is_selling(pk.provider_id);
  IF v_package.id IS NULL THEN
    RAISE EXCEPTION 'Package not found or inactive' USING ERRCODE = 'P0002';
  END IF;
  IF COALESCE(v_package.session_count, 0) <= 0 OR COALESCE(v_package.price, 0) <= 0 THEN
    RAISE EXCEPTION 'This package cannot be bought' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.user_packages (customer_id, package_id, remaining_sessions, expires_at, status, amount_paid,
                                    provider_id, service_id, session_count, expires_in_days, package_name_en, package_name_ar)
  VALUES (v_user_id, v_package.id, 0, NULL, 'pending_payment', v_package.price,
          v_package.provider_id, v_package.service_id, v_package.session_count, v_package.expires_in_days, v_package.name_en, v_package.name_ar)
  RETURNING * INTO v_row;$to$);
SELECT pg_temp.patch_function('public.purchase_service_package(uuid,text)'::regprocedure,
$from$                            'amount_sar', v_package.price, 'status', 'pending_payment');$from$,
$to$                            'amount_sar', v_package.price, 'status', 'pending_payment',
                            'session_count', v_row.session_count, 'expires_in_days', v_row.expires_in_days);$to$);

SELECT pg_temp.patch_function('public.confirm_purchase_payment(text,uuid,text,numeric)'::regprocedure,
$from$    IF v_pack.status <> 'pending_payment' THEN
      RETURN public.queue_purchase_conflict_refund('package', v_pack.id, v_package.provider_id, NULL, 'package_sale', p_payment_intent_id, p_amount, 0, p_amount);
    END IF;$from$,
$to$    -- RT-M3: a payment for a provider that stopped selling after the purchase started is recorded and refunded.
    IF v_pack.status = 'pending_payment' AND NOT public.provider_is_selling(v_pack.provider_id) THEN
      UPDATE public.user_packages SET status = 'cancelled' WHERE id = v_pack.id;
      PERFORM public.write_audit_log('purchase.seller_not_selling', 'package', v_pack.id,
        jsonb_build_object('payment_intent_id', p_payment_intent_id, 'amount', p_amount, 'provider_id', v_pack.provider_id));
      v_pack.status := 'cancelled';
    END IF;
    IF v_pack.status <> 'pending_payment' THEN
      RETURN public.queue_purchase_conflict_refund('package', v_pack.id, v_pack.provider_id, NULL, 'package_sale', p_payment_intent_id, p_amount, 0, p_amount);
    END IF;$to$);
SELECT pg_temp.patch_function('public.confirm_purchase_payment(text,uuid,text,numeric)'::regprocedure,
$from$        remaining_sessions = v_package.session_count,
        expires_at = CASE WHEN v_package.expires_in_days IS NULL THEN NULL
                          ELSE now() + make_interval(days => v_package.expires_in_days) END$from$,
$to$        remaining_sessions = v_pack.session_count,
        expires_at = CASE WHEN v_pack.expires_in_days IS NULL THEN NULL
                          ELSE now() + make_interval(days => v_pack.expires_in_days) END$to$);
SELECT pg_temp.patch_function('public.confirm_purchase_payment(text,uuid,text,numeric)'::regprocedure,
$from$    VALUES (NULL, v_package.provider_id, 'package_sale', p_payment_intent_id, p_amount, 0, p_amount, 'pending');$from$,
$to$    VALUES (NULL, v_pack.provider_id, 'package_sale', p_payment_intent_id, p_amount, 0, p_amount, 'pending');$to$);

SELECT pg_temp.patch_function('public.confirm_membership_payment(uuid,text,numeric)'::regprocedure,
$from$  IF v_row.status <> 'pending_payment' THEN
    INSERT INTO public.transactional_ledger$from$,
$to$  -- RT-M3: a payment for a provider that stopped selling after the purchase started is recorded and refunded.
  IF v_row.status = 'pending_payment' AND NOT public.provider_is_selling(v_row.provider_id) THEN
    UPDATE public.memberships
       SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'The salon stopped taking payments before this one arrived', updated_at = now()
     WHERE id = v_row.id;
    PERFORM public.write_audit_log('purchase.seller_not_selling', 'membership', v_row.id,
      jsonb_build_object('payment_intent_id', p_payment_intent_id, 'amount', p_amount, 'provider_id', v_row.provider_id));
    v_row.status := 'cancelled';
  END IF;
  IF v_row.status <> 'pending_payment' THEN
    INSERT INTO public.transactional_ledger$to$);

-- The session's provider and covered service are those of the purchase.
SELECT pg_temp.patch_function('public.redeem_package_session(uuid,uuid,text)'::regprocedure,
$from$  IF NOT (public.is_provider_staff(v_package.provider_id, v_user_id) OR public.admin_can('operations.write') OR public.can_access_provider_operation(v_package.provider_id, NULL, 'bookings')) THEN$from$,
$to$  IF NOT (public.is_provider_staff(v_pack.provider_id, v_user_id) OR public.admin_can('operations.write') OR public.can_access_provider_operation(v_pack.provider_id, NULL, 'bookings')) THEN$to$);
SELECT pg_temp.patch_function('public.redeem_package_session(uuid,uuid,text)'::regprocedure,
$from$    WHERE b.id = p_booking_id AND br.provider_id = v_package.provider_id;$from$,
$to$    WHERE b.id = p_booking_id AND br.provider_id = v_pack.provider_id;$to$);
SELECT pg_temp.patch_function('public.redeem_package_session(uuid,uuid,text)'::regprocedure,
$from$    IF v_package.service_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.booking_services bs WHERE bs.booking_id = p_booking_id AND bs.service_id = v_package.service_id
    ) THEN$from$,
$to$    IF v_pack.service_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.booking_services bs WHERE bs.booking_id = p_booking_id AND bs.service_id = v_pack.service_id
    ) THEN$to$);
