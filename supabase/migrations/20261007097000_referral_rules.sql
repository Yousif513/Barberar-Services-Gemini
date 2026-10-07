-- FIX-BOOKING item 7e-2 (D4 parts a/c, D4b / C-D4, C-D4b): referral amounts come from platform_settings, abuse rules, collision-free codes.
--
-- Defects:
--   * the reward (SAR 25) was hard-coded in apply_referral_code, get_or_create_referral_code, the customer_referrals default and the wallet copy instead of
--     being read from platform_settings.referral_program, which the reward trigger already used;
--   * the completion trigger paid both users on the referee's next completed booking of ANY value and source (a staff-created walk-in linked by phone counted),
--     the referee could already have history, mutual referrals (A uses B's code, B uses A's) paid twice, and there was no per-referrer cap;
--   * codes were 'REF-' + 6 hex characters of an MD5 of the user id: about a 50 percent chance of a collision near 4,800 users, and profiles.referral_code is
--     UNIQUE, so the colliding user's get_or_create_referral_code failed for ever.
--
-- Rules implemented (settings keys in platform_settings.referral_program; the owner sets them in the console):
--   enabled (boolean)                    the programme is off unless true
--   reward_sar (number)                  the credit each side receives. UNSET OR 0 = NO PAYOUT and codes cannot be applied. The invented 25 that the
--                                        original migration seeded is removed (when the row is still the untouched seed) and the table default is dropped.
--   min_qualifying_sar (number, optional) minimum total_price of the referee's completing booking; unset = no minimum
--   max_rewards_per_referrer_30d (integer, optional) rewards one referrer may collect in 30 days; unset = no cap; a referral over the cap is `disqualified`
--                                        (nobody is paid). DECISION FOR THE OWNER: set a cap before enabling the programme.
--   * apply_referral_code: only for a customer with no confirmed or completed booking, never reverse (A used B's code, so B cannot use A's), and the reward
--     is read from the setting at that moment.
--   * the completion trigger pays only for a booking whose source is not walk_in and whose total_price reaches the minimum, once, and respects the cap.
--   * codes are 'REF-' + 8 random hexadecimal characters, retried on a unique violation. Existing codes are kept.

ALTER TABLE public.customer_referrals ALTER COLUMN reward_amount DROP DEFAULT;

UPDATE public.platform_settings
SET value = value - 'reward_sar',
    description = 'Platform-funded referral wallet credit for referrer and referee after the referee''s first completed visit. Keys: enabled, reward_sar (SAR each side; unset = no payout), min_qualifying_sar (optional minimum booking total), max_rewards_per_referrer_30d (optional cap). Disabled until the owner approves the amounts.'
WHERE key = 'referral_program' AND value = '{"enabled": false, "reward_sar": 25}'::jsonb;

CREATE OR REPLACE FUNCTION public.get_or_create_referral_code()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_code TEXT;
  v_attempt INT := 0;
  v_settings JSONB := public.platform_setting('referral_program');
  v_reward NUMERIC := COALESCE((v_settings->>'reward_sar')::numeric, 0);
  v_active BOOLEAN := COALESCE((v_settings->>'enabled')::boolean, FALSE) AND COALESCE((v_settings->>'reward_sar')::numeric, 0) > 0;
  v_invited_count INT;
  v_earned_sar NUMERIC(10,2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT referral_code INTO v_code FROM public.profiles WHERE id = v_user_id;

  IF v_code IS NULL OR TRIM(v_code) = '' THEN
    LOOP
      v_attempt := v_attempt + 1;
      v_code := 'REF-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 8));
      BEGIN
        UPDATE public.profiles SET referral_code = v_code WHERE id = v_user_id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF v_attempt >= 10 THEN
          RAISE EXCEPTION 'Could not create a referral code, please try again' USING ERRCODE = '55000';
        END IF;
      END;
    END LOOP;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(CASE WHEN status = 'rewarded' THEN reward_amount ELSE 0 END), 0.00)
  INTO v_invited_count, v_earned_sar
  FROM public.customer_referrals
  WHERE referrer_id = v_user_id;

  RETURN jsonb_build_object(
    'referral_code', v_code,
    'share_url', format('https://primora.sa/login?ref=%s', v_code),
    'programme_active', v_active,
    'reward_per_friend_sar', CASE WHEN v_active THEN v_reward ELSE NULL END,
    'min_qualifying_sar', CASE WHEN v_active THEN (v_settings->>'min_qualifying_sar')::numeric ELSE NULL END,
    'invited_friends_count', v_invited_count,
    'total_earned_credits_sar', v_earned_sar
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_referral_code(p_referral_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_referrer_id UUID;
  v_clean_code TEXT := UPPER(TRIM(COALESCE(p_referral_code, '')));
  v_settings JSONB := public.platform_setting('referral_program');
  v_reward NUMERIC := COALESCE((v_settings->>'reward_sar')::numeric, 0);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF v_clean_code = '' THEN
    RAISE EXCEPTION 'Referral code is required' USING ERRCODE = '22023';
  END IF;
  IF NOT COALESCE((v_settings->>'enabled')::boolean, FALSE) OR v_reward <= 0 THEN
    RAISE EXCEPTION 'The referral programme is not active' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_referrer_id FROM public.profiles WHERE UPPER(referral_code) = v_clean_code;
  IF v_referrer_id IS NULL THEN
    RAISE EXCEPTION 'Invalid referral code' USING ERRCODE = 'P0002';
  END IF;
  IF v_referrer_id = v_user_id THEN
    RAISE EXCEPTION 'You cannot refer yourself' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.customer_referrals WHERE referee_id = v_user_id) THEN
    RAISE EXCEPTION 'A referral code has already been applied for your account' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE customer_id = v_user_id AND status IN ('confirmed', 'completed')) THEN
    RAISE EXCEPTION 'Referral codes are for new customers only' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.customer_referrals WHERE referrer_id = v_user_id AND referee_id = v_referrer_id) THEN
    RAISE EXCEPTION 'This friend already used your referral code' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.customer_referrals (referrer_id, referee_id, referral_code, reward_amount, status)
  VALUES (v_referrer_id, v_user_id, v_clean_code, v_reward, 'pending');

  RETURN jsonb_build_object(
    'success', TRUE,
    'reward_amount_sar', v_reward,
    'min_qualifying_sar', (v_settings->>'min_qualifying_sar')::numeric,
    'message', format('Referral code activated! Both you and your friend will receive %s SAR wallet credit after your first completed booking.', v_reward)
  );
END;
$$;

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text[], text[]);
CREATE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text[], p_to text[]) RETURNS void LANGUAGE plpgsql AS $helper$
DECLARE
  v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
  i int;
BEGIN
  FOR i IN 1 .. COALESCE(array_length(p_from, 1), 0) LOOP
    IF position(replace(p_from[i], E'\r\n', E'\n') IN v_def) = 0 THEN
      RAISE EXCEPTION 'patch_function: pattern % not found in %', i, p_sig;
    END IF;
    v_def := replace(v_def, replace(p_from[i], E'\r\n', E'\n'), p_to[i]);
  END LOOP;
  EXECUTE v_def;
END
$helper$;

-- Completion rewards: real bookings only, minimum, reward amount set, cap
SELECT pg_temp.patch_function(
  'public.trigger_on_booking_completed_rewards()'::regprocedure,
  ARRAY[
    E'  IF COALESCE((v_referral->>''enabled'')::boolean, FALSE) THEN\n    SELECT * INTO v_ref FROM public.customer_referrals\n    WHERE referee_id = NEW.customer_id AND status = ''pending''\n    ORDER BY created_at LIMIT 1 FOR UPDATE;\n\n    IF v_ref.id IS NOT NULL THEN\n',
    E'      UPDATE public.customer_referrals\n      SET status = ''rewarded'''
  ],
  ARRAY[
    E'  IF COALESCE((v_referral->>''enabled'')::boolean, FALSE)\n     AND COALESCE((v_referral->>''reward_sar'')::numeric, 0) > 0\n     AND NEW.source IS DISTINCT FROM ''walk_in''\n     AND NEW.total_price >= COALESCE((v_referral->>''min_qualifying_sar'')::numeric, 0) THEN\n    SELECT * INTO v_ref FROM public.customer_referrals\n    WHERE referee_id = NEW.customer_id AND status = ''pending''\n    ORDER BY created_at LIMIT 1 FOR UPDATE;\n\n    -- A referrer who already collected the maximum number of rewards in the last 30 days earns nothing more: the referral is closed, nobody is paid.\n    IF v_ref.id IS NOT NULL AND (v_referral->>''max_rewards_per_referrer_30d'') IS NOT NULL AND (\n      SELECT COUNT(*) FROM public.customer_referrals r\n      WHERE r.referrer_id = v_ref.referrer_id AND r.status = ''rewarded'' AND r.rewarded_at > now() - interval ''30 days''\n    ) >= (v_referral->>''max_rewards_per_referrer_30d'')::int THEN\n      UPDATE public.customer_referrals SET status = ''disqualified'', qualifying_booking_id = NEW.id WHERE id = v_ref.id;\n      v_ref.id := NULL;\n    END IF;\n\n    IF v_ref.id IS NOT NULL THEN\n',
    E'      UPDATE public.customer_referrals\n      SET status = ''rewarded'''
  ]);

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text[], text[]);
