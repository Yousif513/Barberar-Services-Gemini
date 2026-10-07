-- FIX-BOOKING item 7e-1 (D4 part b / C-D4): wallet credit can be spent.
--
-- Defect: referral rewards write wallet_credits, and the wallet screen says "Auto-applied as discount during checkout", but no function ever spent a credit or
-- marked it is_spent: the credit was a number that could never be used.
--
-- Rules implemented:
--   * create_booking / create_multi_service_booking / booking_create_internal take a wallet credit amount (request_wallet_credit_amount / p_wallet_credit_amount,
--     SAR, two decimals, NULL or 0 = none). It must not exceed the caller's usable credit (not spent, not expired, remaining > 0): "Not enough wallet credit".
--   * The credit is a payment instrument like a gift card: it reduces what is still due (taxable + VAT - gift card) and never exceeds it, and the deposit shrinks
--     with it, so a visit fully covered by credit, gift card and package is confirmed at once.
--   * Credits are consumed oldest first under row locks, with a partial-use column (wallet_credits.remaining_amount); every use is a wallet_credit_redemptions
--     row tied to the booking. is_spent becomes true only when nothing remains.
--   * booking_release_discounts (cancellation, hold expiry) puts the amount back exactly once.
--   * The credit is platform-funded marketing money, so when the booking is completed the platform owes the provider that part (a 'wallet_credit_settlement'
--     ledger entry, the same mechanism as the gift-card and platform-funded coupon settlements). DECISION FOR THE OWNER: confirm that the platform funds wallet credit.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
ALTER TABLE public.wallet_credits ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(10,2);
UPDATE public.wallet_credits SET remaining_amount = CASE WHEN is_spent THEN 0 ELSE amount END WHERE remaining_amount IS NULL;

CREATE OR REPLACE FUNCTION public.set_wallet_credit_remaining()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.remaining_amount IS NULL THEN
    NEW.remaining_amount := CASE WHEN NEW.is_spent THEN 0 ELSE NEW.amount END;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_wallet_credit_remaining() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS set_wallet_credit_remaining_before_insert ON public.wallet_credits;
CREATE TRIGGER set_wallet_credit_remaining_before_insert
  BEFORE INSERT ON public.wallet_credits
  FOR EACH ROW EXECUTE FUNCTION public.set_wallet_credit_remaining();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_credits_remaining_within_amount' AND conrelid = 'public.wallet_credits'::regclass) THEN
    ALTER TABLE public.wallet_credits ADD CONSTRAINT wallet_credits_remaining_within_amount
      CHECK (remaining_amount IS NULL OR (remaining_amount >= 0 AND remaining_amount <= amount));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.wallet_credit_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_credit_id UUID NOT NULL REFERENCES public.wallet_credits(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  reversed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_credit_redemptions_booking ON public.wallet_credit_redemptions(booking_id);
CREATE INDEX IF NOT EXISTS idx_wallet_credit_redemptions_credit ON public.wallet_credit_redemptions(wallet_credit_id);
ALTER TABLE public.wallet_credit_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers and admins read wallet credit redemptions" ON public.wallet_credit_redemptions;
CREATE POLICY "Customers and admins read wallet credit redemptions"
  ON public.wallet_credit_redemptions FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.is_admin());
SELECT public.grant_data_api_access('public.wallet_credit_redemptions');
SELECT public.attach_admin_audit_trigger('public.wallet_credit_redemptions');

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS wallet_credit_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (wallet_credit_amount >= 0);

-- The new settlement entry type is added to whatever list the constraint holds now (other changes to that list survive).
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
  WHERE conname = 'transactional_ledger_entry_type_check' AND conrelid = 'public.transactional_ledger'::regclass;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'transactional_ledger_entry_type_check not found';
  END IF;
  IF position('wallet_credit_settlement' IN v_def) = 0 THEN
    IF position('ARRAY[' IN v_def) = 0 THEN
      RAISE EXCEPTION 'unexpected shape of transactional_ledger_entry_type_check: %', v_def;
    END IF;
    ALTER TABLE public.transactional_ledger DROP CONSTRAINT transactional_ledger_entry_type_check;
    EXECUTE 'ALTER TABLE public.transactional_ledger ADD CONSTRAINT transactional_ledger_entry_type_check '
      || replace(v_def, 'ARRAY[', 'ARRAY[''wallet_credit_settlement''::text, ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Function evolution helper (session scoped)
-- ---------------------------------------------------------------------------
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

-- Release: put the credit back
SELECT pg_temp.evolve_function(
  'public.booking_release_discounts(uuid)'::regprocedure,
  'public.booking_release_discounts(uuid)',
  ARRAY[
    E'  FOR v_redemption IN\n    SELECT * FROM public.package_redemptions'
  ],
  ARRAY[
    E'  FOR v_redemption IN\n    SELECT * FROM public.wallet_credit_redemptions\n    WHERE booking_id = p_booking_id AND reversed_at IS NULL\n    FOR UPDATE\n  LOOP\n    UPDATE public.wallet_credits\n    SET remaining_amount = LEAST(COALESCE(remaining_amount, 0) + v_redemption.amount, amount), is_spent = FALSE\n    WHERE id = v_redemption.wallet_credit_id;\n    UPDATE public.wallet_credit_redemptions SET reversed_at = now() WHERE id = v_redemption.id;\n  END LOOP;\n\n  FOR v_redemption IN\n    SELECT * FROM public.package_redemptions'
  ]);

-- Completion: the platform owes the provider the part of the visit paid with wallet credit
SELECT pg_temp.evolve_function(
  'public.trigger_on_booking_completed_rewards()'::regprocedure,
  'public.trigger_on_booking_completed_rewards()',
  ARRAY[
    E'  IF NEW.customer_id IS NULL THEN\n    RETURN NEW;\n  END IF;'
  ],
  ARRAY[
    E'  IF NEW.wallet_credit_amount > 0 THEN\n    INSERT INTO public.transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id,\n                                             total_captured, platform_share, provider_share, payout_status)\n    VALUES (NEW.id, v_provider_id, ''wallet_credit_settlement'', ''wallet-settlement:'' || NEW.id::text,\n            0, 0, NEW.wallet_credit_amount, ''pending'')\n    ON CONFLICT (payment_intent_id) DO NOTHING;\n  END IF;\n\n  IF NEW.customer_id IS NULL THEN\n    RETURN NEW;\n  END IF;'
  ]);

-- The booking core
SELECT pg_temp.evolve_function(
  'public.booking_create_internal(uuid, uuid, uuid, uuid[], timestamptz, boolean, numeric, numeric, text, uuid, text, text, text, integer, timestamptz[], timestamptz[], text, uuid[], uuid, uuid)'::regprocedure,
  'public.booking_create_internal(uuid, uuid, uuid, uuid[], timestamptz, boolean, numeric, numeric, text, uuid, text, text, text, integer, timestamptz[], timestamptz[], text, uuid[], uuid, uuid, numeric)',
  ARRAY[
    E'p_user_package_id uuid DEFAULT NULL::uuid)\n RETURNS bookings',
    E'  v_package_discount NUMERIC(10,2) := 0;\nBEGIN',
    E'  IF v_full_prepayment THEN\n    v_deposit := v_taxable + v_tax - v_gift_amount;\n  ELSE\n    v_deposit := LEAST(\n      ROUND(v_taxable * COALESCE(v_provider.deposit_percentage, 20) / 100.0, 2),\n      v_taxable + v_tax - v_gift_amount\n    );\n  END IF;',
    E'      user_package_id, package_covered_amount\n    ) VALUES (',
    E'      v_pack.id, v_package_discount\n    )',
    E'  -- The package session is reserved with the booking'
  ],
  ARRAY[
    E'p_user_package_id uuid DEFAULT NULL::uuid, p_wallet_credit_amount numeric DEFAULT NULL::numeric)\n RETURNS bookings',
    E'  v_package_discount NUMERIC(10,2) := 0;\n  v_wallet_amount NUMERIC(10,2) := 0;\n  v_wallet_available NUMERIC(10,2) := 0;\n  v_wallet_left NUMERIC(10,2);\n  v_take NUMERIC(10,2);\n  v_credit RECORD;\nBEGIN',
    E'  -- Wallet credit is a payment instrument like a gift card: oldest credits first, never more than is still due.\n  IF COALESCE(p_wallet_credit_amount, 0) <> 0 THEN\n    IF p_wallet_credit_amount < 0 OR p_wallet_credit_amount <> ROUND(p_wallet_credit_amount, 2) THEN\n      RAISE EXCEPTION ''The wallet credit amount is not valid'' USING ERRCODE = ''22023'';\n    END IF;\n    SELECT COALESCE(SUM(wc.remaining), 0) INTO v_wallet_available\n    FROM (\n      SELECT COALESCE(c.remaining_amount, c.amount) AS remaining\n      FROM public.wallet_credits c\n      WHERE c.customer_id = p_customer_id AND NOT c.is_spent AND COALESCE(c.remaining_amount, c.amount) > 0\n        AND (c.expires_at IS NULL OR c.expires_at > now())\n      ORDER BY c.created_at, c.id\n      FOR UPDATE\n    ) wc;\n    IF p_wallet_credit_amount > v_wallet_available THEN\n      RAISE EXCEPTION ''Not enough wallet credit'' USING ERRCODE = ''22023'';\n    END IF;\n    v_wallet_amount := LEAST(p_wallet_credit_amount, GREATEST(v_taxable + v_tax - v_gift_amount, 0));\n  END IF;\n\n  IF v_full_prepayment THEN\n    v_deposit := v_taxable + v_tax - v_gift_amount - v_wallet_amount;\n  ELSE\n    v_deposit := LEAST(\n      ROUND(v_taxable * COALESCE(v_provider.deposit_percentage, 20) / 100.0, 2),\n      v_taxable + v_tax - v_gift_amount - v_wallet_amount\n    );\n  END IF;',
    E'      user_package_id, package_covered_amount, wallet_credit_amount\n    ) VALUES (',
    E'      v_pack.id, v_package_discount, v_wallet_amount\n    )',
    E'  -- The wallet credit is consumed oldest first (the rows were locked above), one redemption row per credit used.\n  IF v_wallet_amount > 0 THEN\n    v_wallet_left := v_wallet_amount;\n    FOR v_credit IN\n      SELECT c.id, COALESCE(c.remaining_amount, c.amount) AS remaining\n      FROM public.wallet_credits c\n      WHERE c.customer_id = p_customer_id AND NOT c.is_spent AND COALESCE(c.remaining_amount, c.amount) > 0\n        AND (c.expires_at IS NULL OR c.expires_at > now())\n      ORDER BY c.created_at, c.id\n      FOR UPDATE\n    LOOP\n      EXIT WHEN v_wallet_left <= 0;\n      v_take := LEAST(v_credit.remaining, v_wallet_left);\n      UPDATE public.wallet_credits\n      SET remaining_amount = v_credit.remaining - v_take, is_spent = (v_credit.remaining - v_take) <= 0\n      WHERE id = v_credit.id;\n      INSERT INTO public.wallet_credit_redemptions (wallet_credit_id, booking_id, customer_id, amount)\n      VALUES (v_credit.id, v_booking.id, p_customer_id, v_take);\n      v_wallet_left := v_wallet_left - v_take;\n    END LOOP;\n  END IF;\n\n  -- The package session is reserved with the booking'
  ]);

SELECT pg_temp.evolve_function(
  'public.create_booking(uuid, uuid, timestamptz, boolean, numeric, numeric, uuid, text, text, text, integer, uuid, text, timestamptz[], timestamptz[], text, uuid, uuid, uuid)'::regprocedure,
  'public.create_booking(uuid, uuid, timestamptz, boolean, numeric, numeric, uuid, text, text, text, integer, uuid, text, timestamptz[], timestamptz[], text, uuid, uuid, uuid, numeric)',
  ARRAY[
    E'request_user_package_id uuid DEFAULT NULL::uuid)\n RETURNS bookings',
    E'    request_waitlist_claim_id, request_user_package_id\n  );'
  ],
  ARRAY[
    E'request_user_package_id uuid DEFAULT NULL::uuid, request_wallet_credit_amount numeric DEFAULT NULL::numeric)\n RETURNS bookings',
    E'    request_waitlist_claim_id, request_user_package_id, request_wallet_credit_amount\n  );'
  ]);

SELECT pg_temp.evolve_function(
  'public.create_multi_service_booking(uuid, uuid, timestamptz, jsonb, boolean, text, text, text, text, integer, numeric, numeric, uuid, timestamptz[], timestamptz[], text, uuid, uuid)'::regprocedure,
  'public.create_multi_service_booking(uuid, uuid, timestamptz, jsonb, boolean, text, text, text, text, integer, numeric, numeric, uuid, timestamptz[], timestamptz[], text, uuid, uuid, numeric)',
  ARRAY[
    E'request_user_package_id uuid DEFAULT NULL::uuid)\n RETURNS jsonb',
    E'    request_waitlist_claim_id, request_user_package_id\n  );'
  ],
  ARRAY[
    E'request_user_package_id uuid DEFAULT NULL::uuid, request_wallet_credit_amount numeric DEFAULT NULL::numeric)\n RETURNS jsonb',
    E'    request_waitlist_claim_id, request_user_package_id, request_wallet_credit_amount\n  );'
  ]);

DROP FUNCTION IF EXISTS pg_temp.evolve_function(regprocedure, text, text[], text[]);
