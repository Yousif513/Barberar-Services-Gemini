-- MONEY part 1: append-only money tables and corrections by linked entries (D-Q8 final decision text, adopted 2026-10-10 in
-- docs/legal/2026-10-10-adopted-decisions.md), and the GOV-1 security review findings C-1, C-2, H-4 and M-1
-- (docs/reviews/2026-10-10-security-gov1.md).
--
--   * C-1: no client role (anon, authenticated: customer, provider or any console role) inserts, updates or deletes a money
--     table directly any more. The administrator "manage" policies become read policies, the write privileges are revoked and
--     the money.write permission is removed. Every money change goes through a SECURITY DEFINER command.
--   * D-Q8: a blocking trigger makes transactional_ledger and its related money tables append-only for every role, the table
--     owner's own functions included. A ledger row's identity and captured amount never change and no money row is ever
--     deleted. The system paths that already settle a row (refund completion, settling an unperformed booking, payout
--     release, manual settlement) may still move its payout state and reduce its shares, never raise them, and only while
--     they run (primora.ledger_system_write). Every other correction is a new linked adjustment or reversal entry with a
--     reason code, a justification, the maker, a different checker (approvals framework) and an idempotency key.
--   * C-2: every money column of a booking is frozen for every writer except the command that owns it, and an administrator
--     can no longer write bookings directly. The wallet-credit settlement is computed from the wallet-credit redemption rows.
--   * H-4: settling a ledger row outside the payout flow needs a second administrator, a bank reference and an approved
--     payout account past its 48-hour hold.
--   * M-1: the daily cumulative refund threshold is checked under a per-administrator advisory lock.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. C-1: no direct client writes on money tables
-- ---------------------------------------------------------------------------------------------------------------------

-- money.write was "direct writes to money tables"; nobody holds it any more.
DELETE FROM public.admin_role_permissions WHERE permission = 'money.write';

DO $money$
DECLARE
  v_tables TEXT[] := ARRAY['transactional_ledger', 'payout_requests', 'payout_allocations', 'payment_refund_requests', 'refund_requests',
    'payment_disputes', 'provider_fee_invoices', 'psp_reconciliation_runs', 'invoices', 'wallet_credits', 'wallet_credit_redemptions',
    'gift_cards', 'gift_card_redemptions', 'customer_loyalty', 'loyalty_points_ledger', 'customer_referrals', 'coupon_redemptions',
    'package_redemptions', 'booking_tips', 'fee_rules', 'provider_receivables', 'bookings'];
  t TEXT;
  r RECORD;
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    -- "Admins manage ..." / "Admins update/delete ..." write policies become a read policy for console sessions (GOV-2's restrictive
    -- read policies still narrow what a console session sees).
    FOR r IN
      SELECT policyname, cmd FROM pg_policies
       WHERE schemaname = 'public' AND tablename = t AND permissive = 'PERMISSIVE' AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
         AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) ~ 'is_admin\(\)'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
      IF r.cmd = 'ALL' THEN
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Administrators read ' || replace(t, '_', ' '), t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_admin())',
                       'Administrators read ' || replace(t, '_', ' '), t);
      END IF;
    END LOOP;
    -- The restrictive console guards have nothing left to guard.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Console role guards administrator inserts', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Console role guards administrator updates', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Console role guards administrator deletes', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    -- Column-level grants survive a table-level REVOKE; remove them too.
    FOR r IN
      SELECT DISTINCT column_name, privilege_type FROM information_schema.column_privileges
       WHERE table_schema = 'public' AND table_name = t AND grantee IN ('anon', 'authenticated') AND privilege_type IN ('INSERT', 'UPDATE')
    LOOP
      EXECUTE format('REVOKE %s (%I) ON public.%I FROM anon, authenticated', r.privilege_type, r.column_name, t);
    END LOOP;
    -- Nobody truncates or deletes money rows, not even the server key (D-Q8: kept at least 10 years).
    IF t <> 'bookings' THEN
      EXECUTE format('REVOKE DELETE, TRUNCATE ON public.%I FROM service_role', t);
    END IF;
  END LOOP;
END
$money$;

-- payment_methods is the platform's catalogue of enabled payment methods (labels, order, gateway), not a money record; it stays
-- an owner setting (settings.manage) instead of money.write. employee_commission_rules is the provider's own payroll setting:
-- the provider keeps it, console sessions only read it.
DROP POLICY IF EXISTS "Console role guards administrator inserts" ON public.payment_methods;
DROP POLICY IF EXISTS "Console role guards administrator updates" ON public.payment_methods;
DROP POLICY IF EXISTS "Console role guards administrator deletes" ON public.payment_methods;
CREATE POLICY "Console role guards administrator inserts" ON public.payment_methods AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.admin_table_write_allowed('settings.manage'));
CREATE POLICY "Console role guards administrator updates" ON public.payment_methods AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.admin_table_write_allowed('settings.manage')) WITH CHECK (public.admin_table_write_allowed('settings.manage'));
CREATE POLICY "Console role guards administrator deletes" ON public.payment_methods AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.admin_table_write_allowed('settings.manage'));

DROP POLICY IF EXISTS "Admins manage employee commissions" ON public.employee_commission_rules;
DROP POLICY IF EXISTS "Administrators read employee commission rules" ON public.employee_commission_rules;
CREATE POLICY "Administrators read employee commission rules" ON public.employee_commission_rules FOR SELECT TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Ledger: adjustment and reversal entries
-- ---------------------------------------------------------------------------------------------------------------------

ALTER TABLE public.transactional_ledger
  ADD COLUMN IF NOT EXISTS adjusts_entry_id UUID REFERENCES public.transactional_ledger(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reverses_entry_id UUID REFERENCES public.transactional_ledger(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reason_code TEXT,
  ADD COLUMN IF NOT EXISTS justification TEXT,
  ADD COLUMN IF NOT EXISTS maker_id UUID,
  ADD COLUMN IF NOT EXISTS checker_id UUID,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_request_id UUID,
  ADD COLUMN IF NOT EXISTS break_glass BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tap_object_id TEXT,
  ADD COLUMN IF NOT EXISTS funded_by TEXT,
  ADD COLUMN IF NOT EXISTS settlement_bank_reference TEXT,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

ALTER TABLE public.transactional_ledger DROP CONSTRAINT IF EXISTS transactional_ledger_entry_type_check;
ALTER TABLE public.transactional_ledger ADD CONSTRAINT transactional_ledger_entry_type_check CHECK (entry_type = ANY (ARRAY[
  'wallet_credit_settlement', 'booking_payment', 'tip', 'package_sale', 'gift_card_sale', 'subscription', 'gift_card_settlement',
  'platform_discount_settlement', 'loyalty_settlement', 'adjustment', 'reversal']));
ALTER TABLE public.transactional_ledger DROP CONSTRAINT IF EXISTS transactional_ledger_booking_required;
ALTER TABLE public.transactional_ledger ADD CONSTRAINT transactional_ledger_booking_required CHECK (
  booking_id IS NOT NULL OR entry_type = ANY (ARRAY['package_sale', 'gift_card_sale', 'subscription', 'adjustment', 'reversal']));
ALTER TABLE public.transactional_ledger DROP CONSTRAINT IF EXISTS transactional_ledger_funded_by_check;
ALTER TABLE public.transactional_ledger ADD CONSTRAINT transactional_ledger_funded_by_check CHECK (funded_by IS NULL OR funded_by IN ('platform', 'customer'));
-- A correction names what it corrects, why, who made it and a different person who checked it (break-glass: D-Q5 owner alone,
-- within the cap, reviewed within 7 days).
ALTER TABLE public.transactional_ledger DROP CONSTRAINT IF EXISTS transactional_ledger_correction_complete;
ALTER TABLE public.transactional_ledger ADD CONSTRAINT transactional_ledger_correction_complete CHECK (
  entry_type NOT IN ('adjustment', 'reversal')
  OR (reason_code IS NOT NULL AND justification IS NOT NULL AND maker_id IS NOT NULL AND checker_id IS NOT NULL
      AND approved_at IS NOT NULL AND approval_request_id IS NOT NULL
      AND (maker_id <> checker_id OR break_glass)
      AND (entry_type <> 'reversal' OR reverses_entry_id IS NOT NULL)));
CREATE INDEX IF NOT EXISTS idx_ledger_adjusts ON public.transactional_ledger (adjusts_entry_id) WHERE adjusts_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_reverses ON public.transactional_ledger (reverses_entry_id) WHERE reverses_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_tap_object ON public.transactional_ledger (tap_object_id) WHERE tap_object_id IS NOT NULL;

-- Value the platform funds (wallet credit, platform coupon, loyalty) is tagged so a provider payout is never reduced by it.
UPDATE public.transactional_ledger SET funded_by = 'platform'
 WHERE entry_type IN ('wallet_credit_settlement', 'platform_discount_settlement') AND funded_by IS NULL;

-- A negative provider correction is recovered from the next payout like a refund paid after a payout.
ALTER TABLE public.provider_receivables ALTER COLUMN refund_request_id DROP NOT NULL;
ALTER TABLE public.provider_receivables ADD COLUMN IF NOT EXISTS adjustment_entry_id UUID UNIQUE REFERENCES public.transactional_ledger(id) ON DELETE RESTRICT;
ALTER TABLE public.provider_receivables DROP CONSTRAINT IF EXISTS provider_receivables_has_source;
ALTER TABLE public.provider_receivables ADD CONSTRAINT provider_receivables_has_source CHECK (refund_request_id IS NOT NULL OR adjustment_entry_id IS NOT NULL);

-- Correction reason codes (fixed vocabulary, bilingual).
CREATE TABLE IF NOT EXISTS public.ledger_adjustment_reasons (
  code TEXT PRIMARY KEY,
  label_en TEXT NOT NULL,
  label_ar TEXT NOT NULL
);
INSERT INTO public.ledger_adjustment_reasons (code, label_en, label_ar) VALUES
  ('reconciliation_break', 'Reconciliation break with Tap', 'فرق تسوية مع Tap'),
  ('posting_error', 'Posting error in the original entry', 'خطأ في قيد أصلي'),
  ('provider_dispute', 'Provider statement dispute upheld', 'قبول اعتراض المزود على الكشف'),
  ('duplicate_entry', 'Duplicate entry', 'قيد مكرر'),
  ('reward_reversal', 'Reward reversed after a refund', 'عكس مكافأة بعد الاسترداد')
ON CONFLICT (code) DO UPDATE SET label_en = EXCLUDED.label_en, label_ar = EXCLUDED.label_ar;
ALTER TABLE public.ledger_adjustment_reasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Console sessions read adjustment reasons" ON public.ledger_adjustment_reasons;
CREATE POLICY "Console sessions read adjustment reasons" ON public.ledger_adjustment_reasons FOR SELECT TO authenticated USING (public.is_admin());
SELECT public.grant_data_api_access('public.ledger_adjustment_reasons');
REVOKE INSERT, UPDATE, DELETE ON public.ledger_adjustment_reasons FROM anon, authenticated;
SELECT public.attach_admin_audit_trigger('public.ledger_adjustment_reasons');

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. D-Q8: the append-only trigger
-- ---------------------------------------------------------------------------------------------------------------------
-- TG_ARGV[0] = mode:  ledger | immutable | no_delete | no_delete_allow_cascade
-- TG_ARGV[1] = comma-separated columns that never change after insert.
-- no_delete_allow_cascade lets a foreign-key cascade (an erased customer account, a cancelled booking that is deleted) remove
-- customer-side promotional rows; a direct DELETE statement is still refused.

CREATE OR REPLACE FUNCTION public.guard_money_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_mode TEXT := TG_ARGV[0];
  v_frozen TEXT[] := CASE WHEN TG_NARGS > 1 AND TG_ARGV[1] <> '' THEN string_to_array(TG_ARGV[1], ',') ELSE ARRAY[]::TEXT[] END;
  v_old JSONB;
  v_new JSONB;
  v_col TEXT;
  v_system BOOLEAN := COALESCE(current_setting('primora.ledger_system_write', true), '') = 'on';
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION '% is append-only and is never truncated', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF v_mode = 'no_delete_allow_cascade' AND pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION '% is append-only: a row is never deleted; record a linked adjustment or reversal instead', TG_TABLE_NAME
      USING ERRCODE = '42501', HINT = 'append_only';
  END IF;
  IF v_mode = 'immutable' THEN
    RAISE EXCEPTION '% rows never change after they are recorded', TG_TABLE_NAME USING ERRCODE = '42501', HINT = 'append_only';
  END IF;

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);
  FOREACH v_col IN ARRAY v_frozen LOOP
    IF v_old->v_col IS DISTINCT FROM v_new->v_col THEN
      RAISE EXCEPTION '%.% cannot change after it is recorded; record a linked adjustment or reversal instead', TG_TABLE_NAME, v_col
        USING ERRCODE = '42501', HINT = 'append_only';
    END IF;
  END LOOP;

  IF v_mode = 'ledger' THEN
    -- Only the server paths that settle a row may touch it, and only its payout state and (downwards) its shares.
    IF NOT v_system THEN
      RAISE EXCEPTION 'transactional_ledger is append-only: corrections are new linked adjustment or reversal entries (admin_propose_ledger_adjustment)'
        USING ERRCODE = '42501', HINT = 'append_only';
    END IF;
    IF OLD.entry_type IN ('adjustment', 'reversal') AND (NEW.provider_share, NEW.platform_share, NEW.employee_share, NEW.refunded_amount)
         IS DISTINCT FROM (OLD.provider_share, OLD.platform_share, OLD.employee_share, OLD.refunded_amount) THEN
      RAISE EXCEPTION 'A correction entry never changes' USING ERRCODE = '42501', HINT = 'append_only';
    END IF;
    IF NEW.refunded_amount < OLD.refunded_amount THEN
      RAISE EXCEPTION 'A refunded amount never decreases' USING ERRCODE = '42501', HINT = 'append_only';
    END IF;
    -- Settling an unperformed booking may move the platform's share to the provider; nothing may add value to a recorded row.
    IF NEW.provider_share + NEW.platform_share + NEW.employee_share > OLD.provider_share + OLD.platform_share + OLD.employee_share THEN
      RAISE EXCEPTION 'The shares of a recorded entry never grow in place; record an adjustment entry' USING ERRCODE = '42501', HINT = 'append_only';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_money_append_only() FROM PUBLIC, anon, authenticated;

DO $money$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('transactional_ledger', 'ledger',
       'id,booking_id,payment_intent_id,total_captured,entry_type,provider_id,created_at,adjusts_entry_id,reverses_entry_id,reason_code,justification,maker_id,checker_id,approved_at,approval_request_id,break_glass,tap_object_id,funded_by'),
      ('payout_allocations', 'immutable', ''),
      ('payout_requests', 'no_delete', 'id,provider_id,amount,requested_at,requested_by'),
      ('refund_requests', 'no_delete', 'id,booking_id,ledger_id,payment_intent_id,amount,source,idempotency_key,created_at'),
      ('provider_receivables', 'no_delete', 'id,provider_id,ledger_id,refund_request_id,adjustment_entry_id,amount,created_at'),
      ('provider_fee_invoices', 'no_delete', ''),
      ('payment_disputes', 'no_delete', ''),
      ('payment_refund_requests', 'no_delete', ''),
      ('psp_reconciliation_runs', 'no_delete', ''),
      ('fee_rules', 'no_delete', ''),
      ('wallet_credits', 'no_delete_allow_cascade', 'id,customer_id,amount,source,created_at'),
      ('wallet_credit_redemptions', 'no_delete_allow_cascade', 'id,wallet_credit_id,booking_id,customer_id,amount,created_at'),
      ('gift_card_redemptions', 'no_delete_allow_cascade', ''),
      ('coupon_redemptions', 'no_delete_allow_cascade', ''),
      ('package_redemptions', 'no_delete_allow_cascade', ''),
      ('loyalty_points_ledger', 'no_delete_allow_cascade', ''),
      ('customer_loyalty', 'no_delete_allow_cascade', ''),
      ('customer_referrals', 'no_delete_allow_cascade', ''),
      ('booking_tips', 'no_delete_allow_cascade', 'id,amount,booking_id,provider_id')
    ) AS t(tbl, mode, frozen)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_money_append_only ON public.%I', r.tbl);
    EXECUTE format('CREATE TRIGGER trg_money_append_only BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_money_append_only(%L, %L)',
                   r.tbl, r.mode, r.frozen);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_money_no_truncate ON public.%I', r.tbl);
    EXECUTE format('CREATE TRIGGER trg_money_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_money_append_only(%L)',
                   r.tbl, r.mode);
  END LOOP;
END
$money$;

-- The server paths that settle an existing ledger row announce themselves for the rest of their transaction.
DO $money$
DECLARE
  f RECORD;
  v_def TEXT;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('complete_refund_request', 'ledger_settle_unperformed_booking', 'admin_release_payout')
  LOOP
    v_def := replace(pg_get_functiondef(f.oid), E'\r\n', E'\n');
    IF position('primora.ledger_system_write' IN v_def) > 0 THEN
      CONTINUE;
    END IF;
    IF position(E'\nBEGIN\n' IN v_def) = 0 THEN
      RAISE EXCEPTION 'MONEY: no body start found in %', f.proname;
    END IF;
    EXECUTE regexp_replace(v_def, E'\nBEGIN\n', E'\nBEGIN\n  PERFORM set_config(''primora.ledger_system_write'', ''on'', true);\n');
  END LOOP;
END
$money$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. C-2: booking money columns
-- ---------------------------------------------------------------------------------------------------------------------

-- Console sessions read bookings; they change them only through the booking commands (cancel_booking, reschedule_booking, ...).
DROP POLICY IF EXISTS "Admins manage bookings" ON public.bookings;
DROP POLICY IF EXISTS "Administrators read bookings" ON public.bookings;
CREATE POLICY "Administrators read bookings" ON public.bookings FOR SELECT TO authenticated USING (public.is_admin());

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS fee_rule_id UUID,
  ADD COLUMN IF NOT EXISTS fee_rule_snapshot JSONB;

SELECT pg_temp.patch_function('public.protect_booking_immutable_fields()'::regprocedure,
$from$  IF (NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at OR NEW.employee_id IS DISTINCT FROM OLD.employee_id)$from$,
$to$  -- GOV-1 review C-2: money columns. Set at creation only, or by the one command that owns them (cancellation and no-show set
  -- the refund and fee, the monthly fee invoice stamps itself, releasing discounts stamps the time).
  IF ROW(NEW.wallet_credit_amount, NEW.package_covered_amount, NEW.user_package_id, NEW.invoice_number, NEW.fee_rule_id, NEW.fee_rule_snapshot)
     IS DISTINCT FROM ROW(OLD.wallet_credit_amount, OLD.package_covered_amount, OLD.user_package_id, OLD.invoice_number, OLD.fee_rule_id, OLD.fee_rule_snapshot) THEN
    RAISE EXCEPTION 'Booking money fields are immutable after creation' USING ERRCODE = '22000';
  END IF;
  IF ROW(NEW.refund_amount, NEW.cancellation_fee, NEW.fee_invoice_id, NEW.discounts_released_at)
       IS DISTINCT FROM ROW(OLD.refund_amount, OLD.cancellation_fee, OLD.fee_invoice_id, OLD.discounts_released_at)
     AND COALESCE(current_setting('primora.booking_money_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Booking refund, fee and invoice fields change only through the command that owns them' USING ERRCODE = '22000';
  END IF;

  IF (NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at OR NEW.employee_id IS DISTINCT FROM OLD.employee_id)$to$);

DO $money$
DECLARE
  f RECORD;
  v_def TEXT;
  v_hits INTEGER := 0;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('cancel_booking', 'mark_booking_no_show', 'generate_provider_monthly_fee_invoice', 'booking_release_discounts')
       AND p.prosrc ~* 'UPDATE\s+public\.bookings'
  LOOP
    v_def := replace(pg_get_functiondef(f.oid), E'\r\n', E'\n');
    IF position('primora.booking_money_write' IN v_def) > 0 THEN
      CONTINUE;
    END IF;
    EXECUTE regexp_replace(v_def, E'\nBEGIN\n', E'\nBEGIN\n  PERFORM set_config(''primora.booking_money_write'', ''on'', true);\n');
    v_hits := v_hits + 1;
  END LOOP;
  IF v_hits < 4 THEN
    RAISE EXCEPTION 'MONEY: expected the four booking money commands, patched %', v_hits;
  END IF;
END
$money$;

-- The platform pays the provider the wallet credit actually redeemed on the booking, never a number on the booking row.
SELECT pg_temp.patch_function('public.trigger_on_booking_completed_rewards()'::regprocedure,
$from$  IF NEW.wallet_credit_amount > 0 THEN
    INSERT INTO public.transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id,
                                             total_captured, platform_share, provider_share, payout_status)
    VALUES (NEW.id, v_provider_id, 'wallet_credit_settlement', 'wallet-settlement:' || NEW.id::text,
            0, 0, NEW.wallet_credit_amount, 'pending')
    ON CONFLICT (payment_intent_id) DO NOTHING;
  END IF;$from$,
$to$  -- GOV-1 review C-2: from the redemption rows (not the booking column), never more than the booking recorded; funded by the platform.
  SELECT LEAST(COALESCE(SUM(wr.amount), 0), COALESCE(NEW.wallet_credit_amount, 0)) INTO v_platform_discount
    FROM public.wallet_credit_redemptions wr
   WHERE wr.booking_id = NEW.id AND wr.reversed_at IS NULL;
  IF v_platform_discount > 0 THEN
    INSERT INTO public.transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id,
                                             total_captured, platform_share, provider_share, payout_status, funded_by)
    VALUES (NEW.id, v_provider_id, 'wallet_credit_settlement', 'wallet-settlement:' || NEW.id::text,
            0, 0, v_platform_discount, 'pending', 'platform')
    ON CONFLICT (payment_intent_id) DO NOTHING;
  END IF;$to$);

SELECT pg_temp.patch_function('public.trigger_on_booking_completed_rewards()'::regprocedure,
$from$                                             total_captured, platform_share, provider_share, payout_status)
    VALUES (NEW.id, v_provider_id, 'platform_discount_settlement', 'coupon-settlement:' || NEW.id::text,
            0, 0, v_platform_discount, 'pending')$from$,
$to$                                             total_captured, platform_share, provider_share, payout_status, funded_by)
    VALUES (NEW.id, v_provider_id, 'platform_discount_settlement', 'coupon-settlement:' || NEW.id::text,
            0, 0, v_platform_discount, 'pending', 'platform')$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Approvals framework: new kinds
-- ---------------------------------------------------------------------------------------------------------------------

ALTER TABLE public.admin_approval_requests DROP CONSTRAINT IF EXISTS admin_approval_requests_kind_check;
ALTER TABLE public.admin_approval_requests ADD CONSTRAINT admin_approval_requests_kind_check CHECK (kind IN (
  'payout_release', 'refund', 'iban_change', 'setting_change',
  'ledger_settlement', 'ledger_adjustment', 'fee_rule_change', 'payout_hold', 'reward_program'));

INSERT INTO public.admin_role_permissions (admin_role, permission, description_en, description_ar) VALUES
  ('owner', 'rewards.approve', 'Approve enabling or changing a referral or loyalty programme', 'اعتماد تفعيل برنامج الإحالة أو الولاء أو تعديله')
ON CONFLICT (admin_role, permission) DO UPDATE SET description_en = EXCLUDED.description_en, description_ar = EXCLUDED.description_ar;

SELECT pg_temp.patch_function('public.governance_approver_permission(text)'::regprocedure,
$from$    WHEN 'setting_change' THEN 'money.config'$from$,
$to$    WHEN 'setting_change' THEN 'money.config'
    WHEN 'ledger_settlement' THEN 'money.payout'
    WHEN 'ledger_adjustment' THEN 'money.ledger'
    WHEN 'fee_rule_change' THEN 'money.config'
    WHEN 'payout_hold' THEN 'money.payout'
    WHEN 'reward_program' THEN 'rewards.approve'$to$);

-- Each new kind runs through public.gov_exec_<kind>(request) in the approver's session under the one-time token.
SELECT pg_temp.patch_function('public.governance_execute(uuid)'::regprocedure,
$from$  ELSE
    RAISE EXCEPTION 'Unknown approval kind %', v_req.kind USING ERRCODE = '22023';$from$,
$to$  ELSIF v_req.kind IN ('ledger_settlement', 'ledger_adjustment', 'fee_rule_change', 'payout_hold', 'reward_program') THEN
    EXECUTE format('SELECT public.%I($1)', 'gov_exec_' || v_req.kind) INTO v_result USING v_req;
  ELSE
    RAISE EXCEPTION 'Unknown approval kind %', v_req.kind USING ERRCODE = '22023';$to$);

-- D-Q8: break-glass (owner alone, no second eligible administrator, within the daily cap) also covers balance adjustments.
SELECT pg_temp.patch_function('public.admin_break_glass_execute(uuid,text)'::regprocedure,
$from$  IF v_req.kind NOT IN ('payout_release', 'refund') THEN$from$,
$to$  IF v_req.kind NOT IN ('payout_release', 'refund', 'ledger_adjustment') THEN$to$);
SELECT pg_temp.patch_function('public.admin_approval_inbox(text,integer,integer)'::regprocedure,
$from$r.kind IN ('payout_release', 'refund') AND public.admin_can('break_glass.use')$from$,
$to$r.kind IN ('payout_release', 'refund', 'ledger_adjustment') AND public.admin_can('break_glass.use')$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Corrections: propose and apply a linked adjustment or reversal
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_propose_ledger_adjustment(
  p_entry_id UUID,
  p_kind TEXT,
  p_provider_share_delta NUMERIC,
  p_platform_share_delta NUMERIC,
  p_reason_code TEXT,
  p_justification TEXT,
  p_idempotency_key TEXT,
  p_tap_object_id TEXT DEFAULT NULL,
  p_provider_id UUID DEFAULT NULL,
  p_captured_delta NUMERIC DEFAULT 0,
  p_break_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.transactional_ledger;
  v_kind TEXT := lower(btrim(COALESCE(p_kind, '')));
  v_reason TEXT := NULLIF(btrim(COALESCE(p_justification, '')), '');
  v_key TEXT := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_tap TEXT := NULLIF(btrim(COALESCE(p_tap_object_id, '')), '');
  v_provider UUID;
  v_prov NUMERIC(10,2);
  v_plat NUMERIC(10,2);
  v_cap NUMERIC(10,2) := ROUND(COALESCE(p_captured_delta, 0), 2);
  v_existing UUID;
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('money.ledger') THEN
    RAISE EXCEPTION 'Your console role cannot propose ledger corrections' USING ERRCODE = '42501';
  END IF;
  IF v_kind NOT IN ('adjustment', 'reversal') THEN
    RAISE EXCEPTION 'A correction is an adjustment or a reversal' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'A justification of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF v_key IS NULL OR char_length(v_key) < 8 THEN
    RAISE EXCEPTION 'An idempotency key is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ledger_adjustment_reasons WHERE code = p_reason_code) THEN
    RAISE EXCEPTION 'Unknown reason code' USING ERRCODE = '22023';
  END IF;
  IF p_reason_code = 'reconciliation_break' AND v_tap IS NULL THEN
    RAISE EXCEPTION 'A reconciliation correction cites the Tap object id' USING ERRCODE = '22023';
  END IF;
  -- Replaying the same key answers with what it already did.
  SELECT id INTO v_existing FROM public.transactional_ledger WHERE payment_intent_id = 'adj:' || v_key;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_applied', 'entry_id', v_existing, 'idempotent', TRUE);
  END IF;

  IF p_entry_id IS NOT NULL THEN
    SELECT * INTO v_entry FROM public.transactional_ledger WHERE id = p_entry_id;
    IF v_entry.id IS NULL THEN
      RAISE EXCEPTION 'Ledger entry not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_entry.entry_type IN ('adjustment', 'reversal') AND v_kind = 'reversal' THEN
      RAISE EXCEPTION 'A correction is corrected by a new adjustment, not reversed' USING ERRCODE = '22023';
    END IF;
    v_provider := v_entry.provider_id;
  ELSE
    IF v_kind = 'reversal' THEN
      RAISE EXCEPTION 'A reversal names the entry it reverses' USING ERRCODE = '22023';
    END IF;
    IF p_break_id IS NULL AND p_provider_id IS NULL THEN
      RAISE EXCEPTION 'An adjustment names the entry, the reconciliation break or the provider it corrects' USING ERRCODE = '22023';
    END IF;
    v_provider := p_provider_id;
    IF v_provider IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.providers WHERE id = v_provider) THEN
      RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF v_kind = 'reversal' THEN
    IF EXISTS (SELECT 1 FROM public.transactional_ledger WHERE reverses_entry_id = v_entry.id) THEN
      RAISE EXCEPTION 'This entry is already reversed' USING ERRCODE = '23505';
    END IF;
    v_prov := -v_entry.provider_share;
    v_plat := -v_entry.platform_share;
    v_cap := 0;
  ELSE
    v_prov := ROUND(COALESCE(p_provider_share_delta, 0), 2);
    v_plat := ROUND(COALESCE(p_platform_share_delta, 0), 2);
  END IF;
  IF v_prov = 0 AND v_plat = 0 AND v_cap = 0 THEN
    RAISE EXCEPTION 'A correction changes at least one amount' USING ERRCODE = '22023';
  END IF;
  IF abs(v_prov) > 1000000 OR abs(v_plat) > 1000000 OR abs(v_cap) > 1000000 THEN
    RAISE EXCEPTION 'The correction is outside the allowed range' USING ERRCODE = '22023';
  END IF;
  IF v_prov <> 0 AND v_provider IS NULL THEN
    RAISE EXCEPTION 'A provider share correction names the provider' USING ERRCODE = '22023';
  END IF;

  RETURN public.governance_request('ledger_adjustment', 'transactional_ledger', md5('ledger_adjustment:' || v_key)::uuid,
    abs(v_prov) + abs(v_plat),
    jsonb_build_object('kind', v_kind, 'entry_id', p_entry_id, 'provider_id', v_provider, 'provider_share_delta', v_prov,
                       'platform_share_delta', v_plat, 'captured_delta', v_cap, 'reason_code', p_reason_code, 'justification', v_reason,
                       'idempotency_key', v_key, 'tap_object_id', v_tap, 'break_id', p_break_id),
    v_reason,
    jsonb_build_object('provider_id', v_provider, 'entry_id', p_entry_id, 'correction', v_kind, 'provider_share_delta', v_prov,
                       'platform_share_delta', v_plat, 'captured_delta', v_cap, 'reason_code', p_reason_code, 'tap_object_id', v_tap,
                       'break_id', p_break_id));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_propose_ledger_adjustment(UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, NUMERIC, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_propose_ledger_adjustment(UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, NUMERIC, UUID) TO authenticated;

-- Runs in the approver's session (or the owner's, through break-glass) once the request is approved.
CREATE OR REPLACE FUNCTION public.gov_exec_ledger_adjustment(p_req public.admin_approval_requests)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p JSONB := p_req.payload;
  v_entry public.transactional_ledger;
  v_id UUID;
  v_prov NUMERIC(10,2) := (v_p->>'provider_share_delta')::numeric;
  v_plat NUMERIC(10,2) := (v_p->>'platform_share_delta')::numeric;
  v_cap NUMERIC(10,2) := COALESCE((v_p->>'captured_delta')::numeric, 0);
  v_kind TEXT := v_p->>'kind';
BEGIN
  IF NOT public.governance_execution_active('ledger_adjustment', p_req.target_id) THEN
    RAISE EXCEPTION 'A ledger correction runs only as an approved request' USING ERRCODE = '42501';
  END IF;
  IF (v_p->>'entry_id') IS NOT NULL THEN
    SELECT * INTO v_entry FROM public.transactional_ledger WHERE id = (v_p->>'entry_id')::uuid;
    IF v_kind = 'reversal' AND EXISTS (SELECT 1 FROM public.transactional_ledger WHERE reverses_entry_id = v_entry.id) THEN
      RAISE EXCEPTION 'This entry is already reversed' USING ERRCODE = '23505';
    END IF;
  END IF;

  INSERT INTO public.transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share,
      provider_share, payout_status, adjusts_entry_id, reverses_entry_id, reason_code, justification, maker_id, checker_id,
      approved_at, approval_request_id, break_glass, tap_object_id)
  VALUES (v_entry.booking_id, (v_p->>'provider_id')::uuid, v_kind, 'adj:' || (v_p->>'idempotency_key'), v_cap, v_plat,
      v_prov,
      CASE WHEN v_prov > 0 THEN 'pending' WHEN v_prov < 0 THEN 'receivable' ELSE 'recorded' END,
      CASE WHEN v_kind = 'adjustment' THEN v_entry.id END, CASE WHEN v_kind = 'reversal' THEN v_entry.id END,
      v_p->>'reason_code', v_p->>'justification', p_req.requested_by, auth.uid(), now(), p_req.id, p_req.break_glass,
      v_p->>'tap_object_id')
  RETURNING id INTO v_id;

  -- What the provider now owes is recovered from the next payout.
  IF v_prov < 0 THEN
    INSERT INTO public.provider_receivables (provider_id, ledger_id, adjustment_entry_id, amount, reason)
    VALUES ((v_p->>'provider_id')::uuid, v_id, v_id, -v_prov, 'Approved ledger correction: ' || left(v_p->>'justification', 200));
  END IF;

  IF (v_p->>'break_id') IS NOT NULL AND to_regclass('public.reconciliation_breaks') IS NOT NULL THEN
    EXECUTE 'UPDATE public.reconciliation_breaks SET status = ''resolved'', resolved_at = now(), resolved_by = auth.uid(),
               resolution_entry_id = $1, approval_request_id = $2 WHERE id = $3 AND status IN (''open'', ''escalated'')'
      USING v_id, p_req.id, (v_p->>'break_id')::uuid;
  END IF;

  PERFORM public.write_audit_log('ledger.correction_posted', 'transactional_ledger', v_id,
    jsonb_build_object('kind', v_kind, 'entry_id', v_p->>'entry_id', 'provider_id', v_p->>'provider_id',
                       'provider_share_delta', v_prov, 'platform_share_delta', v_plat, 'captured_delta', v_cap,
                       'reason_code', v_p->>'reason_code', 'reason', v_p->>'justification', 'maker', p_req.requested_by,
                       'checker', auth.uid(), 'approval_request_id', p_req.id, 'break_glass', p_req.break_glass,
                       'tap_object_id', v_p->>'tap_object_id', 'break_id', v_p->>'break_id', 'idempotency_key', v_p->>'idempotency_key'));
  RETURN jsonb_build_object('status', 'posted', 'entry_id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.gov_exec_ledger_adjustment(public.admin_approval_requests) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. H-4: settling a ledger row outside the payout flow needs a second person, a bank reference and an approved account
-- ---------------------------------------------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_release_ledger_item(UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.admin_release_ledger_item(p_ledger_id UUID, p_reason TEXT, p_bank_reference TEXT, p_idempotency_key TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.transactional_ledger;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_ref TEXT := NULLIF(btrim(COALESCE(p_bank_reference, '')), '');
  v_open NUMERIC(10,2);
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('money.payout') THEN
    RAISE EXCEPTION 'Your console role cannot settle ledger rows' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  IF v_ref IS NULL OR char_length(v_ref) < 4 OR char_length(v_ref) > 64 THEN
    RAISE EXCEPTION 'The bank transfer reference (4 to 64 characters) is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.transactional_ledger WHERE id = p_ledger_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Ledger row not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.payout_status <> 'pending' THEN
    RETURN jsonb_build_object('status', 'already_' || v_row.payout_status, 'idempotent', TRUE);
  END IF;
  IF v_row.provider_id IS NULL OR v_row.provider_share <= 0 THEN
    RAISE EXCEPTION 'Only a payable provider entry can be settled' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payout_allocations WHERE ledger_id = p_ledger_id) THEN
    RAISE EXCEPTION 'This row is partly allocated to a payout; release it through the payout request' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.provider_payout_destinations d WHERE d.provider_id = v_row.provider_id AND d.status = 'pending') THEN
    RAISE EXCEPTION 'The provider has a bank account change waiting for approval; settle after it is decided' USING ERRCODE = '22023', HINT = 'destination_pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.provider_payout_destinations d
                  WHERE d.provider_id = v_row.provider_id AND d.status = 'active' AND (d.hold_until IS NULL OR d.hold_until <= now())) THEN
    RAISE EXCEPTION 'The provider has no approved bank account past its 48-hour hold' USING ERRCODE = '22023', HINT = 'destination_on_hold';
  END IF;
  v_open := v_row.provider_share;

  IF NOT public.governance_execution_active('ledger_settlement', v_row.id) THEN
    RETURN public.governance_request('ledger_settlement', 'transactional_ledger', v_row.id, v_open,
      jsonb_build_object('reason', v_reason, 'bank_reference', v_ref, 'idempotency_key', p_idempotency_key),
      v_reason, jsonb_build_object('provider_id', v_row.provider_id, 'amount', v_open, 'bank_reference', v_ref, 'entry_type', v_row.entry_type));
  END IF;

  PERFORM set_config('primora.ledger_system_write', 'on', true);
  PERFORM set_config('primora.audit_reason', v_reason, true);
  UPDATE public.transactional_ledger SET payout_status = 'released', settlement_bank_reference = v_ref, settled_at = now() WHERE id = p_ledger_id;
  PERFORM public.write_audit_log('ledger.manually_settled', 'transactional_ledger', p_ledger_id,
    jsonb_build_object('provider_id', v_row.provider_id, 'provider_share', v_open, 'bank_reference', v_ref, 'idempotency_key', p_idempotency_key,
                       'reason', v_reason, 'approval_request_id', NULLIF(current_setting('primora.governance_approval', true), '')));
  RETURN jsonb_build_object('status', 'released', 'ledger_id', p_ledger_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_release_ledger_item(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_release_ledger_item(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- settlement_bank_reference and settled_at change with the payout state (they are not in the frozen list).

CREATE OR REPLACE FUNCTION public.gov_exec_ledger_settlement(p_req public.admin_approval_requests)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.admin_release_ledger_item(p_req.target_id, p_req.payload->>'reason', p_req.payload->>'bank_reference', p_req.payload->>'idempotency_key');
END;
$$;
REVOKE ALL ON FUNCTION public.gov_exec_ledger_settlement(public.admin_approval_requests) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 8. M-1: the daily cumulative refund threshold is decided under a lock per administrator
-- ---------------------------------------------------------------------------------------------------------------------

ALTER FUNCTION public.refund_needs_approval(NUMERIC) VOLATILE;
SELECT pg_temp.patch_function('public.refund_needs_approval(numeric)'::regprocedure,
$from$  IF COALESCE(p_amount, 0) >= public.governance_setting('refund_single_approval_sar') THEN$from$,
$to$  -- GOV-1 review M-1: concurrent refunds by one administrator are counted one after the other (held to the end of the transaction).
  PERFORM pg_advisory_xact_lock(hashtext('primora.refund_daily:' || COALESCE(auth.uid()::text, 'system')));
  IF COALESCE(p_amount, 0) >= public.governance_setting('refund_single_approval_sar') THEN$to$);
