-- FIX-BOOKING item 7b (D19 / C-D19): packages are connected to bookings.
--
-- Defect: redeem_package_session neither checked the booking's service against packages.service_id nor changed what the booking costs; a customer who had
-- bought a package still paid a deposit to book, and the session was only counted by a provider afterwards.
--
-- Rules implemented:
--   * create_booking / create_multi_service_booking / booking_create_internal accept the customer's own user_packages id (request_user_package_id /
--     p_user_package_id). The package must be active, unexpired at the appointment, have a session left, belong to the same provider and cover a service of
--     the visit. packages.service_id names the covered service; NULL (a package for any service) covers the FIRST service of the visit.
--   * One session is reserved in the same transaction (remaining_sessions - 1, a package_redemptions row tied to the booking). The covered service's price is
--     taken off the booking like any discount (bookings.discount_amount, plus bookings.package_covered_amount and bookings.user_package_id for display); coupons
--     and loyalty points apply only to what is still payable; VAT is charged on the remainder only (the package sale already carried its own VAT). A visit
--     fully covered by a package has nothing to collect online and is confirmed at once.
--   * booking_release_discounts (cancellation, hold expiry) gives the session back and marks the redemption reversed, once.
--   * redeem_package_session (a provider recording a session for a booking made without a package) now requires the booking to contain the package's service
--     and ignores reversed redemptions when it checks for a double record.

ALTER TABLE public.package_redemptions ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS user_package_id UUID REFERENCES public.user_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_covered_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (package_covered_amount >= 0);

DROP FUNCTION IF EXISTS pg_temp.evolve_function(regprocedure, text, text[], text[]);
CREATE FUNCTION pg_temp.evolve_function(p_old regprocedure, p_new_signature text, p_from text[], p_to text[])
RETURNS void LANGUAGE plpgsql AS $helper$
DECLARE
  v_def text := replace(pg_get_functiondef(p_old), E'\r\n', E'\n');
  v_new regprocedure;
  v_grantee text;
  i int;
BEGIN
  FOR i IN 1 .. COALESCE(array_length(p_from, 1), 0) LOOP
    IF position(replace(p_from[i], E'\r\n', E'\n') IN v_def) = 0 THEN
      RAISE EXCEPTION 'evolve_function: pattern % not found in %', i, p_old;
    END IF;
    v_def := replace(v_def, replace(p_from[i], E'\r\n', E'\n'), p_to[i]);
  END LOOP;
  EXECUTE v_def;
  v_new := to_regprocedure(p_new_signature);
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'evolve_function: % was not created', p_new_signature;
  END IF;
  IF v_new <> p_old THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_new);
    FOR v_grantee IN
      SELECT DISTINCT r.rolname
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      JOIN pg_roles r ON r.oid = a.grantee
      WHERE p.oid = p_old::oid AND a.privilege_type = 'EXECUTE'
        AND r.rolname IN ('anon', 'authenticated', 'service_role')
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', v_new, v_grantee);
    END LOOP;
    EXECUTE format('DROP FUNCTION %s', p_old);
  END IF;
END
$helper$;

-- Release: give the reserved session back
SELECT pg_temp.evolve_function(
  'public.booking_release_discounts(uuid)'::regprocedure,
  'public.booking_release_discounts(uuid)',
  ARRAY[
    E'  UPDATE public.bookings SET discounts_released_at = now() WHERE id = p_booking_id;'
  ],
  ARRAY[
    E'  FOR v_redemption IN\n    SELECT * FROM public.package_redemptions\n    WHERE booking_id = p_booking_id AND reversed_at IS NULL\n    FOR UPDATE\n  LOOP\n    UPDATE public.user_packages SET remaining_sessions = remaining_sessions + 1 WHERE id = v_redemption.user_package_id;\n    UPDATE public.package_redemptions SET reversed_at = now() WHERE id = v_redemption.id;\n  END LOOP;\n\n  UPDATE public.bookings SET discounts_released_at = now() WHERE id = p_booking_id;'
  ]);

-- Provider-recorded sessions: the booking must contain the package's service; reversed redemptions do not count
SELECT pg_temp.evolve_function(
  'public.redeem_package_session(uuid, uuid, text)'::regprocedure,
  'public.redeem_package_session(uuid, uuid, text)',
  ARRAY[
    E'    IF EXISTS (SELECT 1 FROM public.package_redemptions WHERE booking_id = p_booking_id) THEN'
  ],
  ARRAY[
    E'    IF v_package.service_id IS NOT NULL AND NOT EXISTS (\n      SELECT 1 FROM public.booking_services bs WHERE bs.booking_id = p_booking_id AND bs.service_id = v_package.service_id\n    ) THEN\n      RAISE EXCEPTION ''This package does not cover the services of the booking'' USING ERRCODE = ''22023'';\n    END IF;\n    IF EXISTS (SELECT 1 FROM public.package_redemptions WHERE booking_id = p_booking_id AND reversed_at IS NULL) THEN'
  ]);

-- The booking core
SELECT pg_temp.evolve_function(
  'public.booking_create_internal(uuid, uuid, uuid, uuid[], timestamptz, boolean, numeric, numeric, text, uuid, text, text, text, integer, timestamptz[], timestamptz[], text, uuid[], uuid)'::regprocedure,
  'public.booking_create_internal(uuid, uuid, uuid, uuid[], timestamptz, boolean, numeric, numeric, text, uuid, text, text, text, integer, timestamptz[], timestamptz[], text, uuid[], uuid, uuid)',
  ARRAY[
    E'p_waitlist_claim_id uuid DEFAULT NULL::uuid)\n RETURNS bookings',
    E'  v_claim public.waitlists;\nBEGIN',
    E'  -- Resolve the professional. A specific professional must offer every service;',
    E'    v_subtotal := v_subtotal + v_item.price;\n',
    E'v_coupon_discount := ROUND(v_subtotal * LEAST(v_coupon.discount_value, 100) / 100.0, 2);',
    E'v_coupon_discount := LEAST(v_coupon.discount_value, v_subtotal);',
    E'      v_subtotal - v_coupon_discount\n    );',
    E'  v_taxable := GREATEST(v_subtotal - v_coupon_discount - v_loyalty_discount, 0);',
    E'      client_profile_id, source, is_first_visit, source_token_id, blocked_before_minutes, blocked_after_minutes\n    ) VALUES (',
    E'v_subtotal, v_coupon_discount + v_loyalty_discount, v_coupon.id,',
    E'p_client_profile_id, v_source, v_first_visit, v_source_token_id, v_blocked_before, v_blocked_after\n    )',
    E'  -- A waitlist offer held for this customer is used up by the booking of its slot'
  ],
  ARRAY[
    E'p_waitlist_claim_id uuid DEFAULT NULL::uuid, p_user_package_id uuid DEFAULT NULL::uuid)\n RETURNS bookings',
    E'  v_claim public.waitlists;\n  v_pack public.user_packages;\n  v_package public.packages;\n  v_covered_service UUID;\n  v_package_discount NUMERIC(10,2) := 0;\nBEGIN',
    E'  -- A package: the customer''s own, active, unexpired at the appointment, with a session left, of this provider, covering a service of the visit.\n  IF p_user_package_id IS NOT NULL THEN\n    SELECT up.* INTO v_pack FROM public.user_packages up WHERE up.id = p_user_package_id AND up.customer_id = p_customer_id FOR UPDATE;\n    IF v_pack.id IS NULL THEN\n      RAISE EXCEPTION ''Package not found'' USING ERRCODE = ''P0002'';\n    END IF;\n    SELECT * INTO v_package FROM public.packages WHERE id = v_pack.package_id;\n    IF v_package.provider_id <> v_provider_id THEN\n      RAISE EXCEPTION ''This package belongs to another provider'' USING ERRCODE = ''22023'';\n    END IF;\n    IF v_pack.status <> ''active'' OR v_pack.remaining_sessions <= 0 THEN\n      RAISE EXCEPTION ''This package has no session left'' USING ERRCODE = ''22023'';\n    END IF;\n    IF v_pack.expires_at IS NOT NULL AND v_pack.expires_at < p_scheduled_at THEN\n      RAISE EXCEPTION ''This package expires before the appointment'' USING ERRCODE = ''22023'';\n    END IF;\n    v_covered_service := COALESCE(v_package.service_id, p_service_ids[1]);\n    IF NOT (v_covered_service = ANY(p_service_ids)) THEN\n      RAISE EXCEPTION ''This package does not cover the selected service'' USING ERRCODE = ''22023'';\n    END IF;\n  END IF;\n\n  -- Resolve the professional. A specific professional must offer every service;',
    E'    v_subtotal := v_subtotal + v_item.price;\n    IF p_user_package_id IS NOT NULL AND v_item.id = v_covered_service THEN\n      v_package_discount := v_item.price;\n    END IF;\n',
    E'v_coupon_discount := ROUND((v_subtotal - v_package_discount) * LEAST(v_coupon.discount_value, 100) / 100.0, 2);',
    E'v_coupon_discount := LEAST(v_coupon.discount_value, v_subtotal - v_package_discount);',
    E'      v_subtotal - v_package_discount - v_coupon_discount\n    );',
    E'  v_taxable := GREATEST(v_subtotal - v_package_discount - v_coupon_discount - v_loyalty_discount, 0);',
    E'      client_profile_id, source, is_first_visit, source_token_id, blocked_before_minutes, blocked_after_minutes,\n      user_package_id, package_covered_amount\n    ) VALUES (',
    E'v_subtotal, v_coupon_discount + v_loyalty_discount + v_package_discount, v_coupon.id,',
    E'p_client_profile_id, v_source, v_first_visit, v_source_token_id, v_blocked_before, v_blocked_after,\n      v_pack.id, v_package_discount\n    )',
    E'  -- The package session is reserved with the booking (given back by booking_release_discounts if the booking is cancelled or expires).\n  IF v_pack.id IS NOT NULL THEN\n    UPDATE public.user_packages SET remaining_sessions = remaining_sessions - 1 WHERE id = v_pack.id;\n    INSERT INTO public.package_redemptions (user_package_id, booking_id, customer_id, notes)\n    VALUES (v_pack.id, v_booking.id, p_customer_id, ''Reserved with the booking'');\n  END IF;\n\n  -- A waitlist offer held for this customer is used up by the booking of its slot'
  ]);

SELECT pg_temp.evolve_function(
  'public.create_booking(uuid, uuid, timestamptz, boolean, numeric, numeric, uuid, text, text, text, integer, uuid, text, timestamptz[], timestamptz[], text, uuid, uuid)'::regprocedure,
  'public.create_booking(uuid, uuid, timestamptz, boolean, numeric, numeric, uuid, text, text, text, integer, uuid, text, timestamptz[], timestamptz[], text, uuid, uuid, uuid)',
  ARRAY[
    E'request_waitlist_claim_id uuid DEFAULT NULL::uuid)\n RETURNS bookings',
    E'    request_waitlist_claim_id\n  );'
  ],
  ARRAY[
    E'request_waitlist_claim_id uuid DEFAULT NULL::uuid, request_user_package_id uuid DEFAULT NULL::uuid)\n RETURNS bookings',
    E'    request_waitlist_claim_id, request_user_package_id\n  );'
  ]);

SELECT pg_temp.evolve_function(
  'public.create_multi_service_booking(uuid, uuid, timestamptz, jsonb, boolean, text, text, text, text, integer, numeric, numeric, uuid, timestamptz[], timestamptz[], text, uuid)'::regprocedure,
  'public.create_multi_service_booking(uuid, uuid, timestamptz, jsonb, boolean, text, text, text, text, integer, numeric, numeric, uuid, timestamptz[], timestamptz[], text, uuid, uuid)',
  ARRAY[
    E'request_waitlist_claim_id uuid DEFAULT NULL::uuid)\n RETURNS jsonb',
    E'    request_waitlist_claim_id\n  );'
  ],
  ARRAY[
    E'request_waitlist_claim_id uuid DEFAULT NULL::uuid, request_user_package_id uuid DEFAULT NULL::uuid)\n RETURNS jsonb',
    E'    request_waitlist_claim_id, request_user_package_id\n  );'
  ]);

DROP FUNCTION IF EXISTS pg_temp.evolve_function(regprocedure, text, text[], text[]);
