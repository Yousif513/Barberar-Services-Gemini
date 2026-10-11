-- MONEY part 3: referral and loyalty programmes (D-Q7 final decision text, adopted 2026-10-10).
--
--   * Both programmes stay disabled. reward_programs holds their values, all unset: nothing here invents a reward value, cap,
--     budget, expiry or terms text. The invented loyalty rates and tiers left in platform_settings by earlier packages are removed.
--   * Enabling (or changing) a programme is a reward_program request: an owner or finance editor proposes, a different owner
--     approves (permission rewards.approve, owner only). It is refused while the reward value, the per-customer monthly cap, the
--     programme monthly budget, the credit expiry or a published terms version is unset. Break-glass never applies, so with one
--     administrator a programme cannot be enabled.
--   * Terms are published in Arabic and English, never edited, and a customer accepts them at enrolment (applying a referral
--     code, or before earning loyalty points). Credits are platform-funded, non-cash, non-transferable and expire as published.
--   * A referral reward vests only on the referee's first completed, paid booking with no refund, within each party's monthly
--     cap and the programme budget. A later refund of that booking reverses the unspent credit by a recorded reversal row.
--   * Platform-funded value is tagged funded_by = platform (wallet redemptions, settlement ledger rows); a loyalty discount is
--     settled to the provider by the platform, so a provider payout is never reduced by a reward.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Configuration, terms and acceptances
-- ---------------------------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reward_programs (
  program TEXT PRIMARY KEY CHECK (program IN ('referral', 'loyalty')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- referral: SAR credited to each party; loyalty: SAR value of one point.
  reward_value_sar NUMERIC(10,2) CHECK (reward_value_sar IS NULL OR reward_value_sar > 0),
  -- loyalty only: points earned per SAR paid, and the fewest points redeemable at once.
  points_per_sar NUMERIC(10,4) CHECK (points_per_sar IS NULL OR points_per_sar > 0),
  min_redeem_points INTEGER CHECK (min_redeem_points IS NULL OR min_redeem_points > 0),
  -- referral only (optional): the smallest booking total that qualifies.
  min_qualifying_sar NUMERIC(10,2) CHECK (min_qualifying_sar IS NULL OR min_qualifying_sar >= 0),
  customer_monthly_cap_sar NUMERIC(10,2) CHECK (customer_monthly_cap_sar IS NULL OR customer_monthly_cap_sar > 0),
  monthly_budget_sar NUMERIC(12,2) CHECK (monthly_budget_sar IS NULL OR monthly_budget_sar > 0),
  credit_expiry_days INTEGER CHECK (credit_expiry_days IS NULL OR credit_expiry_days BETWEEN 1 AND 3650),
  terms_version TEXT,
  proposed_by UUID,
  approved_by UUID,
  approval_request_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- D-Q7: an enabled programme has every value set, and a different person approved it.
  CONSTRAINT reward_programs_enabled_complete CHECK (NOT enabled OR (
    reward_value_sar IS NOT NULL AND customer_monthly_cap_sar IS NOT NULL AND monthly_budget_sar IS NOT NULL
    AND credit_expiry_days IS NOT NULL AND terms_version IS NOT NULL AND approved_by IS NOT NULL AND proposed_by IS NOT NULL
    AND approved_by <> proposed_by
    AND (program <> 'loyalty' OR (points_per_sar IS NOT NULL AND min_redeem_points IS NOT NULL))))
);
INSERT INTO public.reward_programs (program, enabled) VALUES ('referral', FALSE), ('loyalty', FALSE) ON CONFLICT (program) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.reward_terms (
  program TEXT NOT NULL CHECK (program IN ('referral', 'loyalty')),
  version TEXT NOT NULL CHECK (version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'),
  body_en TEXT NOT NULL CHECK (char_length(body_en) BETWEEN 200 AND 20000),
  body_ar TEXT NOT NULL CHECK (char_length(body_ar) BETWEEN 200 AND 20000),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID NOT NULL,
  PRIMARY KEY (program, version)
);

CREATE TABLE IF NOT EXISTS public.reward_terms_acceptances (
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  program TEXT NOT NULL,
  version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'ar')),
  PRIMARY KEY (customer_id, program, version),
  FOREIGN KEY (program, version) REFERENCES public.reward_terms(program, version) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.reward_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES public.customer_referrals(id) ON DELETE CASCADE,
  wallet_credit_id UUID NOT NULL REFERENCES public.wallet_credits(id) ON DELETE CASCADE,
  refund_request_id UUID NOT NULL REFERENCES public.refund_requests(id) ON DELETE RESTRICT,
  reversed_amount NUMERIC(10,2) NOT NULL CHECK (reversed_amount >= 0),
  already_spent_amount NUMERIC(10,2) NOT NULL CHECK (already_spent_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wallet_credit_id, refund_request_id)
);

ALTER TABLE public.customer_referrals
  ADD COLUMN IF NOT EXISTS referee_credit_id UUID REFERENCES public.wallet_credits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referrer_credit_id UUID REFERENCES public.wallet_credits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vest_notes JSONB,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
ALTER TABLE public.wallet_credits ADD COLUMN IF NOT EXISTS reward_referral_id UUID;
-- Credits are a platform-funded promotional instrument: never bought, topped up, withdrawn or moved to another person.
COMMENT ON TABLE public.wallet_credits IS 'Platform-funded promotional credits (D-Q7): non-cash, non-transferable, never purchasable or withdrawable, usable only on PRIMORA, expire as published.';
ALTER TABLE public.wallet_credit_redemptions ADD COLUMN IF NOT EXISTS funded_by TEXT NOT NULL DEFAULT 'platform';
ALTER TABLE public.wallet_credit_redemptions DROP CONSTRAINT IF EXISTS wallet_credit_redemptions_funded_by_check;
ALTER TABLE public.wallet_credit_redemptions ADD CONSTRAINT wallet_credit_redemptions_funded_by_check CHECK (funded_by = 'platform');
ALTER TABLE public.loyalty_points_ledger ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.loyalty_points_ledger DROP CONSTRAINT IF EXISTS loyalty_points_ledger_event_type_check;
ALTER TABLE public.loyalty_points_ledger ADD CONSTRAINT loyalty_points_ledger_event_type_check CHECK (event_type IN
  ('booking_completed', 'manual_adjustment', 'redemption', 'tier_bonus', 'referral_bonus', 'expiry'));

ALTER TABLE public.reward_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_terms_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_reversals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Console sessions read reward programmes" ON public.reward_programs;
CREATE POLICY "Console sessions read reward programmes" ON public.reward_programs FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Signed-in users read published reward terms" ON public.reward_terms;
CREATE POLICY "Signed-in users read published reward terms" ON public.reward_terms FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "Customers read their own acceptances" ON public.reward_terms_acceptances;
CREATE POLICY "Customers read their own acceptances" ON public.reward_terms_acceptances FOR SELECT TO authenticated
  USING (customer_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Customers and console sessions read reward reversals" ON public.reward_reversals;
CREATE POLICY "Customers and console sessions read reward reversals" ON public.reward_reversals FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.wallet_credits c WHERE c.id = wallet_credit_id AND c.customer_id = (SELECT auth.uid())));
SELECT public.grant_data_api_access('public.reward_programs');
SELECT public.grant_data_api_access('public.reward_terms');
SELECT public.grant_data_api_access('public.reward_terms_acceptances');
SELECT public.grant_data_api_access('public.reward_reversals');
REVOKE INSERT, UPDATE, DELETE ON public.reward_programs, public.reward_terms, public.reward_terms_acceptances, public.reward_reversals FROM anon, authenticated;
SELECT public.attach_admin_audit_trigger('public.reward_programs');
SELECT public.attach_admin_audit_trigger('public.reward_terms');
SELECT public.attach_admin_audit_trigger('public.reward_terms_acceptances');
SELECT public.attach_admin_audit_trigger('public.reward_reversals');
DROP TRIGGER IF EXISTS trg_money_append_only ON public.reward_terms;
CREATE TRIGGER trg_money_append_only BEFORE UPDATE OR DELETE ON public.reward_terms FOR EACH ROW
  EXECUTE FUNCTION public.guard_money_append_only('immutable', '');
DROP TRIGGER IF EXISTS trg_money_append_only ON public.reward_reversals;
CREATE TRIGGER trg_money_append_only BEFORE UPDATE OR DELETE ON public.reward_reversals FOR EACH ROW
  EXECUTE FUNCTION public.guard_money_append_only('no_delete_allow_cascade', 'id,referral_id,wallet_credit_id,refund_request_id,reversed_amount,already_spent_amount,created_at');
DROP TRIGGER IF EXISTS trg_money_append_only ON public.reward_terms_acceptances;
CREATE TRIGGER trg_money_append_only BEFORE UPDATE OR DELETE ON public.reward_terms_acceptances FOR EACH ROW
  EXECUTE FUNCTION public.guard_money_append_only('no_delete_allow_cascade', 'customer_id,program,version,accepted_at,locale');

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. The runtime settings follow the approved configuration only
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_reward_program_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.key, OLD.key) IN ('loyalty_program', 'referral_program')
     AND COALESCE(current_setting('primora.reward_program_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Referral and loyalty settings change only through an approved programme change (admin_propose_reward_program)'
      USING ERRCODE = '42501', HINT = 'reward_program_approval';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.guard_reward_program_settings() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_reward_program_settings ON public.platform_settings;
CREATE TRIGGER trg_guard_reward_program_settings BEFORE INSERT OR UPDATE OR DELETE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_reward_program_settings();

-- The runtime JSON the booking engine reads, built from the approved configuration (disabled: nothing but enabled = false).
CREATE OR REPLACE FUNCTION public.sync_reward_program_setting(p_program TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.reward_programs;
  v_json JSONB;
BEGIN
  SELECT * INTO v FROM public.reward_programs WHERE program = p_program;
  IF NOT v.enabled THEN
    v_json := jsonb_build_object('enabled', FALSE);
  ELSIF p_program = 'loyalty' THEN
    v_json := jsonb_build_object('enabled', TRUE, 'points_per_sar', v.points_per_sar, 'sar_per_point', v.reward_value_sar,
                                 'min_redeem_points', v.min_redeem_points, 'expiry_days', v.credit_expiry_days, 'terms_version', v.terms_version);
  ELSE
    v_json := jsonb_build_object('enabled', TRUE, 'reward_sar', v.reward_value_sar, 'min_qualifying_sar', v.min_qualifying_sar,
                                 'expiry_days', v.credit_expiry_days, 'terms_version', v.terms_version);
  END IF;
  PERFORM set_config('primora.reward_program_write', 'on', true);
  UPDATE public.platform_settings SET value = v_json, updated_at = now() WHERE key = p_program || '_program';
  PERFORM set_config('primora.reward_program_write', '', true);
END;
$$;
REVOKE ALL ON FUNCTION public.sync_reward_program_setting(TEXT) FROM PUBLIC, anon, authenticated;

-- Remove the invented loyalty rates and tiers (D-Q7: every value is the owner's, none is a default).
SELECT public.sync_reward_program_setting('loyalty');
SELECT public.sync_reward_program_setting('referral');

SELECT pg_temp.patch_function('public.admin_update_platform_setting(text,jsonb,text)'::regprocedure,
$from$  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown setting %', p_key USING ERRCODE = 'P0002';
  END IF;$from$,
$to$  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown setting %', p_key USING ERRCODE = 'P0002';
  END IF;
  IF p_key IN ('loyalty_program', 'referral_program') THEN
    RAISE EXCEPTION 'Referral and loyalty change only through an approved programme change (admin_propose_reward_program, D-Q7)'
      USING ERRCODE = '42501', HINT = 'reward_program_approval';
  END IF;$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Helpers: acceptance, monthly cap and budget
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reward_terms_accepted(p_customer UUID, p_program TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.reward_programs rp
      JOIN public.reward_terms_acceptances a ON a.program = rp.program AND a.version = rp.terms_version
     WHERE rp.program = p_program AND a.customer_id = p_customer);
$$;

CREATE OR REPLACE FUNCTION public.riyadh_month_start(p_at TIMESTAMPTZ DEFAULT now())
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT date_trunc('month', p_at AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh';
$$;

-- SAR value of rewards issued this Riyadh month, to one customer (p_customer) or to everyone (NULL).
CREATE OR REPLACE FUNCTION public.reward_issued_this_month_sar(p_program TEXT, p_customer UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_program
    WHEN 'referral' THEN COALESCE((SELECT SUM(c.amount) FROM public.wallet_credits c
                                    WHERE c.source = 'referral' AND c.created_at >= public.riyadh_month_start()
                                      AND (p_customer IS NULL OR c.customer_id = p_customer)), 0)
    ELSE COALESCE((SELECT SUM(l.points_change) FROM public.loyalty_points_ledger l JOIN public.customer_loyalty cl ON cl.id = l.loyalty_id
                    WHERE l.event_type = 'booking_completed' AND l.created_at >= public.riyadh_month_start()
                      AND (p_customer IS NULL OR cl.customer_id = p_customer)), 0)
         * COALESCE((SELECT reward_value_sar FROM public.reward_programs WHERE program = 'loyalty'), 0)
  END;
$$;

-- What can still be issued to this customer this month: the lower of their cap left and the programme budget left.
CREATE OR REPLACE FUNCTION public.reward_capacity_sar(p_program TEXT, p_customer UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.reward_programs;
BEGIN
  SELECT * INTO v FROM public.reward_programs WHERE program = p_program;
  IF v.program IS NULL OR NOT v.enabled THEN
    RETURN 0;
  END IF;
  RETURN GREATEST(LEAST(v.customer_monthly_cap_sar - public.reward_issued_this_month_sar(p_program, p_customer),
                        v.monthly_budget_sar - public.reward_issued_this_month_sar(p_program, NULL)), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.reward_cap_loyalty_points(p_customer UUID, p_points INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value NUMERIC := (SELECT reward_value_sar FROM public.reward_programs WHERE program = 'loyalty');
BEGIN
  IF COALESCE(p_points, 0) <= 0 OR v_value IS NULL OR v_value <= 0 THEN
    RETURN 0;
  END IF;
  RETURN LEAST(p_points, FLOOR(public.reward_capacity_sar('loyalty', p_customer) / v_value)::int);
END;
$$;
REVOKE ALL ON FUNCTION public.reward_terms_accepted(UUID, TEXT), public.riyadh_month_start(TIMESTAMPTZ), public.reward_issued_this_month_sar(TEXT, UUID),
  public.reward_capacity_sar(TEXT, UUID), public.reward_cap_loyalty_points(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.riyadh_month_start(TIMESTAMPTZ) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Vesting and reversal
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reward_vest_referral(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_prog public.reward_programs;
  v_ref public.customer_referrals;
  v_party UUID;
  v_role TEXT;
  v_credit UUID;
  v_notes JSONB := '{}'::jsonb;
  v_referee_credit UUID;
  v_referrer_credit UUID;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL OR v_booking.customer_id IS NULL OR v_booking.status <> 'completed' OR v_booking.source = 'walk_in' THEN
    RETURN jsonb_build_object('vested', FALSE, 'why', 'not_eligible_booking');
  END IF;
  SELECT * INTO v_prog FROM public.reward_programs WHERE program = 'referral';
  IF NOT COALESCE(v_prog.enabled, FALSE) THEN
    RETURN jsonb_build_object('vested', FALSE, 'why', 'programme_disabled');
  END IF;
  SELECT * INTO v_ref FROM public.customer_referrals WHERE referee_id = v_booking.customer_id AND status = 'pending' ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF v_ref.id IS NULL THEN
    RETURN jsonb_build_object('vested', FALSE, 'why', 'no_pending_referral');
  END IF;
  -- Paid: money was captured for this visit (not a cash walk-in, not fully covered by credit).
  IF NOT EXISTS (SELECT 1 FROM public.transactional_ledger tl WHERE tl.booking_id = v_booking.id AND tl.entry_type = 'booking_payment' AND tl.total_captured > 0) THEN
    RETURN jsonb_build_object('vested', FALSE, 'why', 'not_paid');
  END IF;
  -- Not refunded (pending, in progress or done).
  IF EXISTS (SELECT 1 FROM public.refund_requests r WHERE r.booking_id = v_booking.id AND r.status IN ('pending', 'processing', 'succeeded')) THEN
    RETURN jsonb_build_object('vested', FALSE, 'why', 'refunded');
  END IF;
  IF v_prog.min_qualifying_sar IS NOT NULL AND v_booking.total_price < v_prog.min_qualifying_sar THEN
    RETURN jsonb_build_object('vested', FALSE, 'why', 'below_minimum');
  END IF;

  FOR v_role, v_party IN SELECT * FROM (VALUES ('referee', v_ref.referee_id), ('referrer', v_ref.referrer_id)) AS t(role, party) LOOP
    v_credit := NULL;
    IF NOT public.reward_terms_accepted(v_party, 'referral') THEN
      v_notes := v_notes || jsonb_build_object(v_role, 'terms_not_accepted');
    ELSIF public.reward_capacity_sar('referral', v_party) < v_prog.reward_value_sar THEN
      v_notes := v_notes || jsonb_build_object(v_role, 'monthly_cap_or_budget_reached');
    ELSE
      INSERT INTO public.wallet_credits (customer_id, amount, reason, source, expires_at, reward_referral_id)
      VALUES (v_party, v_prog.reward_value_sar,
              CASE v_role WHEN 'referee' THEN 'Referral bonus: first paid visit completed' ELSE 'Referral reward: invited friend completed a paid visit' END,
              'referral', now() + make_interval(days => v_prog.credit_expiry_days), v_ref.id)
      RETURNING id INTO v_credit;
      v_notes := v_notes || jsonb_build_object(v_role, 'credited');
    END IF;
    IF v_role = 'referee' THEN v_referee_credit := v_credit; ELSE v_referrer_credit := v_credit; END IF;
  END LOOP;

  UPDATE public.customer_referrals
     SET status = 'rewarded', qualifying_booking_id = v_booking.id, rewarded_at = now(), reward_amount = v_prog.reward_value_sar,
         referee_credit_id = v_referee_credit, referrer_credit_id = v_referrer_credit,
         vest_notes = v_notes || jsonb_build_object('terms_version', v_prog.terms_version)
   WHERE id = v_ref.id;
  RETURN jsonb_build_object('vested', TRUE, 'referral_id', v_ref.id, 'notes', v_notes);
END;
$$;
REVOKE ALL ON FUNCTION public.reward_vest_referral(UUID) FROM PUBLIC, anon, authenticated;

-- A refund of the qualifying booking reverses what is still unspent of both credits (credits are non-cash: a spent part is
-- recorded, never charged back to the customer).
CREATE OR REPLACE FUNCTION public.reverse_referral_on_refund()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref public.customer_referrals;
  v_credit public.wallet_credits;
  v_remaining NUMERIC(10,2);
BEGIN
  IF NOT (NEW.status = 'succeeded' AND OLD.status IS DISTINCT FROM 'succeeded') OR NEW.booking_id IS NULL THEN
    RETURN NEW;
  END IF;
  FOR v_ref IN SELECT * FROM public.customer_referrals WHERE qualifying_booking_id = NEW.booking_id AND status = 'rewarded' AND reversed_at IS NULL FOR UPDATE LOOP
    FOR v_credit IN SELECT * FROM public.wallet_credits WHERE id IN (v_ref.referee_credit_id, v_ref.referrer_credit_id) FOR UPDATE LOOP
      v_remaining := COALESCE(v_credit.remaining_amount, v_credit.amount);
      INSERT INTO public.reward_reversals (referral_id, wallet_credit_id, refund_request_id, reversed_amount, already_spent_amount)
      VALUES (v_ref.id, v_credit.id, NEW.id, v_remaining, v_credit.amount - v_remaining)
      ON CONFLICT (wallet_credit_id, refund_request_id) DO NOTHING;
      UPDATE public.wallet_credits SET remaining_amount = 0, is_spent = TRUE WHERE id = v_credit.id;
    END LOOP;
    UPDATE public.customer_referrals SET reversed_at = now() WHERE id = v_ref.id;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.reverse_referral_on_refund() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_reverse_referral_on_refund ON public.refund_requests;
CREATE TRIGGER trg_reverse_referral_on_refund AFTER UPDATE OF status ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.reverse_referral_on_refund();

-- Loyalty points expire as published (oldest earned first); a service job runs this.
CREATE OR REPLACE FUNCTION public.expire_loyalty_points()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_due INTEGER;
  v_count INTEGER := 0;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  FOR r IN
    SELECT cl.id, cl.points_balance,
           COALESCE(SUM(l.points_change) FILTER (WHERE l.points_change > 0 AND l.event_type = 'booking_completed' AND l.expires_at <= now()), 0) AS earned_expired,
           -COALESCE(SUM(l.points_change) FILTER (WHERE l.points_change < 0), 0)
             - COALESCE(SUM(l.points_change) FILTER (WHERE l.points_change > 0 AND l.event_type = 'manual_adjustment'), 0) AS used
      FROM public.customer_loyalty cl JOIN public.loyalty_points_ledger l ON l.loyalty_id = cl.id
     GROUP BY cl.id, cl.points_balance
  LOOP
    PERFORM 1 FROM public.customer_loyalty WHERE id = r.id FOR UPDATE;
    v_due := LEAST(GREATEST(r.earned_expired - GREATEST(r.used, 0), 0), r.points_balance)::int;
    IF v_due > 0 THEN
      UPDATE public.customer_loyalty SET points_balance = points_balance - v_due, updated_at = now() WHERE id = r.id;
      INSERT INTO public.loyalty_points_ledger (loyalty_id, points_change, event_type, description)
      VALUES (r.id, -v_due, 'expiry', format('%s points expired', v_due));
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_loyalty_points() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_loyalty_points() TO service_role;

-- The completion trigger: loyalty needs accepted terms and stays within the cap and budget; points carry their expiry; a
-- loyalty discount is settled to the provider by the platform; referral vesting follows the rules above.
SELECT pg_temp.patch_function('public.trigger_on_booking_completed_rewards()'::regprocedure,
$from$  IF COALESCE((v_loyalty->>'enabled')::boolean, FALSE) THEN
    SELECT * INTO v_row FROM public.customer_loyalty$from$,
$to$  IF COALESCE((v_loyalty->>'enabled')::boolean, FALSE) AND public.reward_terms_accepted(NEW.customer_id, 'loyalty') THEN
    SELECT * INTO v_row FROM public.customer_loyalty$to$);
SELECT pg_temp.patch_function('public.trigger_on_booking_completed_rewards()'::regprocedure,
$from$                               * COALESCE((v_loyalty->'multipliers'->>v_tier)::numeric, 1))::int, 0);$from$,
$to$                               * COALESCE((v_loyalty->'multipliers'->>v_tier)::numeric, 1))::int, 0);
    v_points := public.reward_cap_loyalty_points(NEW.customer_id, v_points);$to$);
SELECT pg_temp.patch_function('public.trigger_on_booking_completed_rewards()'::regprocedure,
$from$      INSERT INTO public.loyalty_points_ledger (loyalty_id, booking_id, points_change, event_type, description)
      VALUES (v_row.id, NEW.id, v_points, 'booking_completed', format('Earned %s points', v_points));$from$,
$to$      INSERT INTO public.loyalty_points_ledger (loyalty_id, booking_id, points_change, event_type, description, expires_at)
      VALUES (v_row.id, NEW.id, v_points, 'booking_completed', format('Earned %s points', v_points),
              now() + make_interval(days => (v_loyalty->>'expiry_days')::int));$to$);
SELECT pg_temp.patch_function('public.trigger_on_booking_completed_rewards()'::regprocedure,
$from$  IF COALESCE((v_referral->>'enabled')::boolean, FALSE)
     AND COALESCE((v_referral->>'reward_sar')::numeric, 0) > 0
     AND NEW.source IS DISTINCT FROM 'walk_in'
     AND NEW.total_price >= COALESCE((v_referral->>'min_qualifying_sar')::numeric, 0) THEN
    SELECT * INTO v_ref FROM public.customer_referrals
    WHERE referee_id = NEW.customer_id AND status = 'pending'
    ORDER BY created_at LIMIT 1 FOR UPDATE;

    -- A referrer who already collected the maximum number of rewards in the last 30 days earns nothing more: the referral is closed, nobody is paid.
    IF v_ref.id IS NOT NULL AND (v_referral->>'max_rewards_per_referrer_30d') IS NOT NULL AND (
      SELECT COUNT(*) FROM public.customer_referrals r
      WHERE r.referrer_id = v_ref.referrer_id AND r.status = 'rewarded' AND r.rewarded_at > now() - interval '30 days'
    ) >= (v_referral->>'max_rewards_per_referrer_30d')::int THEN
      UPDATE public.customer_referrals SET status = 'disqualified', qualifying_booking_id = NEW.id WHERE id = v_ref.id;
      v_ref.id := NULL;
    END IF;

    IF v_ref.id IS NOT NULL THEN
      UPDATE public.customer_referrals
      SET status = 'rewarded', qualifying_booking_id = NEW.id, rewarded_at = now(),
          reward_amount = COALESCE((v_referral->>'reward_sar')::numeric, reward_amount)
      WHERE id = v_ref.id;
      INSERT INTO public.wallet_credits (customer_id, amount, reason, source)
      VALUES (v_ref.referee_id, COALESCE((v_referral->>'reward_sar')::numeric, v_ref.reward_amount),
              'Referral bonus — first completed visit', 'referral'),
             (v_ref.referrer_id, COALESCE((v_referral->>'reward_sar')::numeric, v_ref.reward_amount),
              'Referral reward — invited friend completed a visit', 'referral');
    END IF;
  END IF;$from$,
$to$  -- D-Q7: vests only on the first completed, paid, unrefunded booking, within caps and budget, for parties who accepted the terms.
  IF COALESCE((v_referral->>'enabled')::boolean, FALSE) THEN
    PERFORM public.reward_vest_referral(NEW.id);
  END IF;$to$);
-- The loyalty discount on this booking (what remains of the discount after coupons and package cover) is paid to the
-- provider by the platform.
SELECT pg_temp.patch_function('public.trigger_on_booking_completed_rewards()'::regprocedure,
$from$  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;$from$,
$to$  IF COALESCE(NEW.loyalty_points_redeemed, 0) > 0 THEN
    v_platform_discount := GREATEST(COALESCE(NEW.discount_amount, 0) - COALESCE(NEW.package_covered_amount, 0)
      - COALESCE((SELECT SUM(cr.discount_amount) FROM public.coupon_redemptions cr WHERE cr.booking_id = NEW.id AND cr.reversed_at IS NULL), 0), 0);
    IF v_platform_discount > 0 THEN
      INSERT INTO public.transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id,
                                               total_captured, platform_share, provider_share, payout_status, funded_by)
      VALUES (NEW.id, v_provider_id, 'loyalty_settlement', 'loyalty-settlement:' || NEW.id::text,
              0, 0, v_platform_discount, 'pending', 'platform')
      ON CONFLICT (payment_intent_id) DO NOTHING;
    END IF;
  END IF;

  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;$to$);

-- Enrolment in the referral programme needs the published terms accepted first.
SELECT pg_temp.patch_function('public.apply_referral_code(text)'::regprocedure,
$from$    RAISE EXCEPTION 'The referral programme is not active' USING ERRCODE = '22023';
  END IF;$from$,
$to$    RAISE EXCEPTION 'The referral programme is not active' USING ERRCODE = '22023';
  END IF;
  IF NOT public.reward_terms_accepted(v_user_id, 'referral') THEN
    RAISE EXCEPTION 'Read and accept the referral programme terms first' USING ERRCODE = '22023', HINT = 'terms_required';
  END IF;$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Commands
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_publish_reward_terms(p_program TEXT, p_version TEXT, p_body_en TEXT, p_body_ar TEXT, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_version TEXT := btrim(COALESCE(p_version, ''));
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('money.config') THEN
    RAISE EXCEPTION 'Your console role cannot publish programme terms' USING ERRCODE = '42501';
  END IF;
  IF p_program IS NULL OR p_program NOT IN ('referral', 'loyalty') THEN
    RAISE EXCEPTION 'The programme is referral or loyalty' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF v_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$' THEN
    RAISE EXCEPTION 'A version is 1 to 32 letters, digits, dots, dashes or underscores' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(p_body_en, ''))) < 200 OR char_length(btrim(COALESCE(p_body_ar, ''))) < 200 THEN
    RAISE EXCEPTION 'Publish the full terms in English and Arabic (at least 200 characters each)' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reward_terms WHERE program = p_program AND version = v_version) THEN
    RAISE EXCEPTION 'This version is already published; terms never change, publish a new version' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.reward_terms (program, version, body_en, body_ar, published_by)
  VALUES (p_program, v_version, btrim(p_body_en), btrim(p_body_ar), auth.uid());
  PERFORM public.write_audit_log('reward_terms.published', 'reward_terms', NULL,
    jsonb_build_object('program', p_program, 'version', v_version, 'reason', v_reason,
                       'body_en_md5', md5(btrim(p_body_en)), 'body_ar_md5', md5(btrim(p_body_ar))));
  RETURN jsonb_build_object('status', 'published', 'program', p_program, 'version', v_version);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_publish_reward_terms(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_publish_reward_terms(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_propose_reward_program(
  p_program TEXT,
  p_enabled BOOLEAN,
  p_reward_value_sar NUMERIC,
  p_customer_monthly_cap_sar NUMERIC,
  p_monthly_budget_sar NUMERIC,
  p_credit_expiry_days INTEGER,
  p_terms_version TEXT,
  p_reason TEXT,
  p_points_per_sar NUMERIC DEFAULT NULL,
  p_min_redeem_points INTEGER DEFAULT NULL,
  p_min_qualifying_sar NUMERIC DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_current public.reward_programs;
  v_missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('money.config') THEN
    RAISE EXCEPTION 'Your console role cannot propose programme changes' USING ERRCODE = '42501';
  END IF;
  IF p_program IS NULL OR p_program NOT IN ('referral', 'loyalty') THEN
    RAISE EXCEPTION 'The programme is referral or loyalty' USING ERRCODE = '22023';
  END IF;
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'Say whether the programme is enabled' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_current FROM public.reward_programs WHERE program = p_program;
  IF p_enabled THEN
    IF p_reward_value_sar IS NULL THEN v_missing := array_append(v_missing, 'reward value'); END IF;
    IF p_customer_monthly_cap_sar IS NULL THEN v_missing := array_append(v_missing, 'per-customer monthly cap'); END IF;
    IF p_monthly_budget_sar IS NULL THEN v_missing := array_append(v_missing, 'programme monthly budget'); END IF;
    IF p_credit_expiry_days IS NULL THEN v_missing := array_append(v_missing, 'credit expiry'); END IF;
    IF NULLIF(btrim(COALESCE(p_terms_version, '')), '') IS NULL THEN v_missing := array_append(v_missing, 'published terms version'); END IF;
    IF p_program = 'loyalty' AND p_points_per_sar IS NULL THEN v_missing := array_append(v_missing, 'points per SAR'); END IF;
    IF p_program = 'loyalty' AND p_min_redeem_points IS NULL THEN v_missing := array_append(v_missing, 'minimum points to redeem'); END IF;
    IF cardinality(v_missing) > 0 THEN
      RAISE EXCEPTION 'The programme cannot be enabled while these are unset: %', array_to_string(v_missing, ', ')
        USING ERRCODE = '22023', HINT = 'reward_values_required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.reward_terms WHERE program = p_program AND version = btrim(p_terms_version)) THEN
      RAISE EXCEPTION 'Terms version % is not published for this programme', btrim(p_terms_version) USING ERRCODE = '22023';
    END IF;
  END IF;
  IF (p_reward_value_sar IS NOT NULL AND (p_reward_value_sar <= 0 OR p_reward_value_sar > 10000))
     OR (p_customer_monthly_cap_sar IS NOT NULL AND (p_customer_monthly_cap_sar <= 0 OR p_customer_monthly_cap_sar > 100000))
     OR (p_monthly_budget_sar IS NOT NULL AND (p_monthly_budget_sar <= 0 OR p_monthly_budget_sar > 100000000))
     OR (p_credit_expiry_days IS NOT NULL AND (p_credit_expiry_days < 1 OR p_credit_expiry_days > 3650))
     OR (p_points_per_sar IS NOT NULL AND (p_points_per_sar <= 0 OR p_points_per_sar > 1000))
     OR (p_min_redeem_points IS NOT NULL AND (p_min_redeem_points < 1 OR p_min_redeem_points > 1000000))
     OR (p_min_qualifying_sar IS NOT NULL AND (p_min_qualifying_sar < 0 OR p_min_qualifying_sar > 100000)) THEN
    RAISE EXCEPTION 'A value is outside its allowed range' USING ERRCODE = '22023';
  END IF;
  IF p_enabled AND p_customer_monthly_cap_sar > p_monthly_budget_sar THEN
    RAISE EXCEPTION 'The per-customer monthly cap cannot exceed the programme monthly budget' USING ERRCODE = '22023';
  END IF;
  IF p_program = 'referral' AND (p_points_per_sar IS NOT NULL OR p_min_redeem_points IS NOT NULL) THEN
    RAISE EXCEPTION 'Points apply to the loyalty programme only' USING ERRCODE = '22023';
  END IF;

  RETURN public.governance_request('reward_program', 'reward_programs', md5('reward_program:' || p_program)::uuid, NULL,
    jsonb_build_object('program', p_program, 'enabled', p_enabled, 'reward_value_sar', p_reward_value_sar,
                       'customer_monthly_cap_sar', p_customer_monthly_cap_sar, 'monthly_budget_sar', p_monthly_budget_sar,
                       'credit_expiry_days', p_credit_expiry_days, 'terms_version', NULLIF(btrim(COALESCE(p_terms_version, '')), ''),
                       'points_per_sar', p_points_per_sar, 'min_redeem_points', p_min_redeem_points, 'min_qualifying_sar', p_min_qualifying_sar,
                       'reason', v_reason),
    v_reason,
    jsonb_build_object('program', p_program, 'enabled', p_enabled, 'was_enabled', v_current.enabled, 'reward_value_sar', p_reward_value_sar,
                       'customer_monthly_cap_sar', p_customer_monthly_cap_sar, 'monthly_budget_sar', p_monthly_budget_sar,
                       'credit_expiry_days', p_credit_expiry_days, 'terms_version', p_terms_version));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_propose_reward_program(TEXT, BOOLEAN, NUMERIC, NUMERIC, NUMERIC, INTEGER, TEXT, TEXT, NUMERIC, INTEGER, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_propose_reward_program(TEXT, BOOLEAN, NUMERIC, NUMERIC, NUMERIC, INTEGER, TEXT, TEXT, NUMERIC, INTEGER, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.gov_exec_reward_program(p_req public.admin_approval_requests)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p JSONB := p_req.payload;
  v_program TEXT := v_p->>'program';
BEGIN
  IF NOT public.governance_execution_active('reward_program', p_req.target_id) THEN
    RAISE EXCEPTION 'A programme changes only as an approved request' USING ERRCODE = '42501';
  END IF;
  IF (v_p->>'enabled')::boolean AND p_req.break_glass THEN
    RAISE EXCEPTION 'A programme is never enabled through break-glass' USING ERRCODE = '42501';
  END IF;
  IF (v_p->>'enabled')::boolean AND NOT EXISTS (SELECT 1 FROM public.reward_terms WHERE program = v_program AND version = v_p->>'terms_version') THEN
    RAISE EXCEPTION 'The terms version is not published' USING ERRCODE = '22023';
  END IF;
  -- The table constraint re-checks every value, the two people and the terms.
  UPDATE public.reward_programs
     SET enabled = (v_p->>'enabled')::boolean, reward_value_sar = (v_p->>'reward_value_sar')::numeric,
         customer_monthly_cap_sar = (v_p->>'customer_monthly_cap_sar')::numeric, monthly_budget_sar = (v_p->>'monthly_budget_sar')::numeric,
         credit_expiry_days = (v_p->>'credit_expiry_days')::int, terms_version = v_p->>'terms_version',
         points_per_sar = (v_p->>'points_per_sar')::numeric, min_redeem_points = (v_p->>'min_redeem_points')::int,
         min_qualifying_sar = (v_p->>'min_qualifying_sar')::numeric,
         proposed_by = p_req.requested_by, approved_by = auth.uid(), approval_request_id = p_req.id, updated_at = now()
   WHERE program = v_program;
  PERFORM public.sync_reward_program_setting(v_program);
  PERFORM public.write_audit_log('reward_program.changed', 'reward_programs', NULL,
    v_p || jsonb_build_object('maker', p_req.requested_by, 'checker', auth.uid(), 'approval_request_id', p_req.id));
  RETURN jsonb_build_object('status', CASE WHEN (v_p->>'enabled')::boolean THEN 'enabled' ELSE 'disabled' END, 'program', v_program);
END;
$$;
REVOKE ALL ON FUNCTION public.gov_exec_reward_program(public.admin_approval_requests) FROM PUBLIC, anon, authenticated;

-- What a signed-in customer sees: whether the programme runs, its current terms, and whether they accepted them.
CREATE OR REPLACE FUNCTION public.reward_program_status(p_program TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.reward_programs;
  v_terms public.reward_terms;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_program IS NULL OR p_program NOT IN ('referral', 'loyalty') THEN
    RAISE EXCEPTION 'The programme is referral or loyalty' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM public.reward_programs WHERE program = p_program;
  IF NOT v.enabled THEN
    RETURN jsonb_build_object('program', p_program, 'enabled', FALSE);
  END IF;
  SELECT * INTO v_terms FROM public.reward_terms WHERE program = p_program AND version = v.terms_version;
  RETURN jsonb_build_object('program', p_program, 'enabled', TRUE, 'reward_value_sar', v.reward_value_sar,
    'customer_monthly_cap_sar', v.customer_monthly_cap_sar, 'credit_expiry_days', v.credit_expiry_days,
    'points_per_sar', v.points_per_sar, 'min_redeem_points', v.min_redeem_points,
    'terms_version', v.terms_version, 'terms_en', v_terms.body_en, 'terms_ar', v_terms.body_ar,
    'accepted', public.reward_terms_accepted(auth.uid(), p_program));
END;
$$;
REVOKE ALL ON FUNCTION public.reward_program_status(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reward_program_status(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_reward_terms(p_program TEXT, p_version TEXT, p_locale TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.reward_programs;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'customer') THEN
    RAISE EXCEPTION 'Only customers enrol in reward programmes' USING ERRCODE = '42501';
  END IF;
  IF p_locale IS NULL OR p_locale NOT IN ('en', 'ar') THEN
    RAISE EXCEPTION 'The language is en or ar' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM public.reward_programs WHERE program = p_program;
  IF v.program IS NULL OR NOT v.enabled THEN
    RAISE EXCEPTION 'This programme is not running' USING ERRCODE = '22023';
  END IF;
  IF v.terms_version IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION 'These are not the current terms; reload the page' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.reward_terms_acceptances (customer_id, program, version, locale)
  VALUES (auth.uid(), p_program, p_version, p_locale)
  ON CONFLICT (customer_id, program, version) DO NOTHING;
  RETURN jsonb_build_object('accepted', TRUE, 'program', p_program, 'version', p_version);
END;
$$;
REVOKE ALL ON FUNCTION public.accept_reward_terms(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_reward_terms(TEXT, TEXT, TEXT) TO authenticated;

-- The console view of both programmes, their published terms and the pending changes.
CREATE OR REPLACE FUNCTION public.admin_reward_programs()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'programs', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.program) FROM public.reward_programs p), '[]'::jsonb),
    'terms', COALESCE((SELECT jsonb_agg(jsonb_build_object('program', t.program, 'version', t.version, 'published_at', t.published_at,
                                                          'body_en', t.body_en, 'body_ar', t.body_ar) ORDER BY t.program, t.published_at DESC)
                         FROM public.reward_terms t), '[]'::jsonb),
    'pending', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'summary', a.summary, 'requested_by', a.requested_by,
                                                            'requested_at', a.requested_at, 'reason', a.request_reason) ORDER BY a.requested_at DESC)
                           FROM public.admin_approval_requests a WHERE a.kind = 'reward_program' AND a.status = 'pending'), '[]'::jsonb),
    'issued_this_month_sar', jsonb_build_object('referral', public.reward_issued_this_month_sar('referral', NULL),
                                                'loyalty', public.reward_issued_this_month_sar('loyalty', NULL)),
    'second_owner_exists', (SELECT COUNT(*) >= 2 FROM public.admin_role_assignments a JOIN public.profiles pr ON pr.id = a.user_id AND pr.role = 'admin'
                             WHERE a.admin_role = 'owner'),
    'can_propose', public.admin_can('money.config'),
    'can_approve', public.admin_can('rewards.approve'));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reward_programs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reward_programs() TO authenticated;
