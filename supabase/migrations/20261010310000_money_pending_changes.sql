-- MONEY part 2: pending changes approved by a different administrator (D-Q8 final decision text, adopted 2026-10-10).
--
--   * Fee rules are versioned and effective-dated. A change never edits a rule: it is a pending fee_rule_change that a different
--     administrator with money.config approves, which adds a new version from effective_from and closes the previous one there.
--     Changes are prospective only. An increase must start at least 30 days after the approval and queues an in-app notice to
--     every provider (provider_fee_change_notices plus a notification). Each booking stores the rule it was priced with.
--   * Payout holds: placing or lifting a hold on a provider's payouts is a pending payout_hold request; a held provider is not
--     paid (admin_release_payout and admin_release_ledger_item refuse).
--   * Provider balances change only through approved ledger corrections (part 1); refund thresholds only through the approved
--     setting_change of GOV-1.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Versioned, effective-dated fee rules
-- ---------------------------------------------------------------------------------------------------------------------

ALTER TABLE public.fee_rules
  ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS effective_to TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS supersedes_id UUID REFERENCES public.fee_rules(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS approval_request_id UUID,
  ADD COLUMN IF NOT EXISTS proposed_by UUID,
  ADD COLUMN IF NOT EXISTS approved_by UUID;
-- The rules that exist were in force from the day they were written.
UPDATE public.fee_rules SET effective_from = created_at WHERE effective_from IS NULL;
ALTER TABLE public.fee_rules ALTER COLUMN effective_from SET NOT NULL;
ALTER TABLE public.fee_rules ALTER COLUMN effective_from SET DEFAULT now();
ALTER TABLE public.fee_rules DROP CONSTRAINT IF EXISTS fee_rules_channel_is_first_visit_key;
ALTER TABLE public.fee_rules DROP CONSTRAINT IF EXISTS fee_rules_version_key;
ALTER TABLE public.fee_rules ADD CONSTRAINT fee_rules_version_key UNIQUE NULLS NOT DISTINCT (channel, is_first_visit, effective_from);
ALTER TABLE public.fee_rules DROP CONSTRAINT IF EXISTS fee_rules_effective_window;
ALTER TABLE public.fee_rules ADD CONSTRAINT fee_rules_effective_window CHECK (effective_to IS NULL OR effective_to >= effective_from);
CREATE INDEX IF NOT EXISTS idx_fee_rules_in_force ON public.fee_rules (channel, is_first_visit, effective_from DESC);

-- A version never changes once written: only its end (effective_to) is set, once, when the next version is approved.
DROP TRIGGER IF EXISTS trg_money_append_only ON public.fee_rules;
CREATE TRIGGER trg_money_append_only BEFORE UPDATE OR DELETE ON public.fee_rules FOR EACH ROW
  EXECUTE FUNCTION public.guard_money_append_only('no_delete',
    'id,channel,is_first_visit,fee_percentage,min_fee_sar,max_fee_sar,is_active,description,effective_from,supersedes_id,approval_request_id,proposed_by,approved_by,created_at');

CREATE OR REPLACE FUNCTION public.guard_fee_rule_end()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.effective_to IS DISTINCT FROM OLD.effective_to THEN
    IF COALESCE(current_setting('primora.fee_rule_write', true), '') <> 'on' THEN
      RAISE EXCEPTION 'A fee rule changes only through an approved fee change (admin_propose_fee_rule_change)' USING ERRCODE = '42501';
    END IF;
    IF OLD.effective_to IS NOT NULL AND OLD.effective_to <= now() THEN
      RAISE EXCEPTION 'A fee rule that has ended is history and never changes' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_fee_rule_end() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_fee_rule_end ON public.fee_rules;
CREATE TRIGGER trg_fee_rule_end BEFORE UPDATE ON public.fee_rules FOR EACH ROW EXECUTE FUNCTION public.guard_fee_rule_end();

-- The rule in force for a channel and visit type at a moment.
CREATE OR REPLACE FUNCTION public.fee_rule_in_force(p_channel TEXT, p_is_first_visit BOOLEAN, p_at TIMESTAMPTZ DEFAULT now())
RETURNS public.fee_rules
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.* FROM public.fee_rules r
   WHERE r.channel = p_channel AND r.is_active
     AND (r.is_first_visit = p_is_first_visit OR r.is_first_visit IS NULL)
     AND r.effective_from <= p_at AND (r.effective_to IS NULL OR r.effective_to > p_at)
   ORDER BY r.is_first_visit NULLS LAST, r.effective_from DESC
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.fee_rule_in_force(TEXT, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fee_rule_in_force(TEXT, BOOLEAN, TIMESTAMPTZ) TO service_role;

-- Pricing uses the version in force now; a scheduled version is not charged before its date.
SELECT pg_temp.patch_function('public.calculate_booking_platform_commission(character varying,boolean,numeric,uuid)'::regprocedure,
$from$      AND (is_first_visit = p_is_first_visit OR is_first_visit IS NULL)
    ORDER BY is_first_visit NULLS LAST$from$,
$to$      AND (is_first_visit = p_is_first_visit OR is_first_visit IS NULL)
      AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now())
    ORDER BY is_first_visit NULLS LAST, effective_from DESC$to$);

-- Each booking keeps the rule it was priced with (D-Q8 "snapshotted on each booking").
CREATE OR REPLACE FUNCTION public.snapshot_booking_fee_rule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule public.fee_rules;
BEGIN
  IF NEW.source IN ('link', 'qr', 'whatsapp', 'instagram', 'walk_in', 'import') THEN
    NEW.fee_rule_id := NULL;
    NEW.fee_rule_snapshot := jsonb_build_object('channel', NEW.source, 'rule_id', NULL, 'own_channel', TRUE,
                                                'platform_commission', NEW.platform_commission, 'taken_at', now());
    RETURN NEW;
  END IF;
  v_rule := public.fee_rule_in_force(NEW.source, COALESCE(NEW.is_first_visit, FALSE), now());
  NEW.fee_rule_id := v_rule.id;
  NEW.fee_rule_snapshot := jsonb_build_object('channel', NEW.source, 'rule_id', v_rule.id, 'is_first_visit', NEW.is_first_visit,
    'fee_percentage', v_rule.fee_percentage, 'min_fee_sar', v_rule.min_fee_sar, 'max_fee_sar', v_rule.max_fee_sar,
    'effective_from', v_rule.effective_from, 'platform_commission', NEW.platform_commission, 'taken_at', now());
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_booking_fee_rule() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_zzz_booking_fee_rule_snapshot ON public.bookings;
CREATE TRIGGER trg_zzz_booking_fee_rule_snapshot BEFORE INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.snapshot_booking_fee_rule();

-- Notices to providers of a fee increase (30 days ahead).
CREATE TABLE IF NOT EXISTS public.provider_fee_change_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  fee_rule_id UUID NOT NULL REFERENCES public.fee_rules(id) ON DELETE RESTRICT,
  approval_request_id UUID NOT NULL,
  channel TEXT NOT NULL,
  is_first_visit BOOLEAN,
  before_terms JSONB NOT NULL,
  after_terms JSONB NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_id, fee_rule_id)
);
CREATE INDEX IF NOT EXISTS idx_fee_change_notices_provider ON public.provider_fee_change_notices (provider_id, notified_at DESC);
ALTER TABLE public.provider_fee_change_notices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Providers read their fee change notices" ON public.provider_fee_change_notices;
CREATE POLICY "Providers read their fee change notices" ON public.provider_fee_change_notices FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_id AND p.owner_id = (SELECT auth.uid())));
SELECT public.grant_data_api_access('public.provider_fee_change_notices');
REVOKE INSERT, UPDATE, DELETE ON public.provider_fee_change_notices FROM anon, authenticated;
SELECT public.attach_admin_audit_trigger('public.provider_fee_change_notices');
DROP TRIGGER IF EXISTS trg_money_append_only ON public.provider_fee_change_notices;
CREATE TRIGGER trg_money_append_only BEFORE UPDATE OR DELETE ON public.provider_fee_change_notices FOR EACH ROW
  EXECUTE FUNCTION public.guard_money_append_only('no_delete_allow_cascade', 'id,provider_id,fee_rule_id,approval_request_id,before_terms,after_terms,effective_from,notified_at');

-- Whether new terms raise what a provider pays: a higher percentage, minimum or maximum (no maximum is the highest).
CREATE OR REPLACE FUNCTION public.fee_terms_increase(p_old public.fee_rules, p_pct NUMERIC, p_min NUMERIC, p_max NUMERIC)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_old.id IS NULL THEN COALESCE(p_pct, 0) > 0 OR COALESCE(p_min, 0) > 0
    ELSE p_pct > p_old.fee_percentage OR p_min > p_old.min_fee_sar
         OR (p_old.max_fee_sar IS NOT NULL AND (p_max IS NULL OR p_max > p_old.max_fee_sar))
  END;
$$;
REVOKE ALL ON FUNCTION public.fee_terms_increase(public.fee_rules, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;

-- The direct command is replaced by the two-person change.
DROP FUNCTION IF EXISTS public.admin_save_fee_rule(TEXT, BOOLEAN, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.admin_propose_fee_rule_change(
  p_channel TEXT,
  p_is_first_visit BOOLEAN,
  p_fee_percentage NUMERIC,
  p_min_fee_sar NUMERIC,
  p_max_fee_sar NUMERIC,
  p_effective_from TIMESTAMPTZ,
  p_reason TEXT,
  p_description TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_description TEXT := NULLIF(btrim(COALESCE(p_description, '')), '');
  v_current public.fee_rules;
  v_increase BOOLEAN;
  v_from TIMESTAMPTZ;
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('money.config') THEN
    RAISE EXCEPTION 'Your console role cannot propose fee changes' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF p_channel IS NULL OR p_channel NOT IN ('marketplace', 'link', 'qr', 'whatsapp', 'instagram', 'walk_in', 'import') THEN
    RAISE EXCEPTION 'Unknown booking channel' USING ERRCODE = '22023';
  END IF;
  IF p_channel <> 'marketplace' THEN
    RAISE EXCEPTION 'Bookings that come through the own channels of a provider carry no platform fee; only marketplace rules can be changed' USING ERRCODE = '22023';
  END IF;
  IF p_fee_percentage IS NULL OR p_fee_percentage < 0 OR p_fee_percentage > 50 THEN
    RAISE EXCEPTION 'The fee percentage is between 0 and 50' USING ERRCODE = '22023';
  END IF;
  IF p_min_fee_sar IS NULL OR p_min_fee_sar < 0 OR p_min_fee_sar > 1000 THEN
    RAISE EXCEPTION 'The minimum fee is between 0 and 1000 SAR' USING ERRCODE = '22023';
  END IF;
  IF p_max_fee_sar IS NOT NULL AND (p_max_fee_sar < p_min_fee_sar OR p_max_fee_sar > 1000) THEN
    RAISE EXCEPTION 'The maximum fee is between the minimum and 1000 SAR, or empty for none' USING ERRCODE = '22023';
  END IF;
  IF v_description IS NOT NULL AND char_length(v_description) > 300 THEN
    RAISE EXCEPTION 'The description is at most 300 characters' USING ERRCODE = '22023';
  END IF;
  IF p_effective_from IS NULL OR p_effective_from < now() - INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'A fee change applies to future bookings only: choose a start date from now on' USING ERRCODE = '22023', HINT = 'prospective_only';
  END IF;
  IF p_effective_from > now() + INTERVAL '366 days' THEN
    RAISE EXCEPTION 'A fee change starts within a year' USING ERRCODE = '22023';
  END IF;

  -- The latest version of this rule (in force or already scheduled).
  SELECT * INTO v_current FROM public.fee_rules
   WHERE channel = p_channel AND is_first_visit IS NOT DISTINCT FROM p_is_first_visit
   ORDER BY effective_from DESC LIMIT 1;
  IF v_current.id IS NOT NULL AND v_current.effective_from > now() THEN
    RAISE EXCEPTION 'A change to this rule is already scheduled from %; it must take effect first', v_current.effective_from USING ERRCODE = '23505';
  END IF;
  IF v_current.id IS NOT NULL AND (ROUND(p_fee_percentage, 2), ROUND(p_min_fee_sar, 2), ROUND(p_max_fee_sar, 2))
       IS NOT DISTINCT FROM (v_current.fee_percentage, v_current.min_fee_sar, v_current.max_fee_sar) THEN
    RAISE EXCEPTION 'These are already the terms of this rule' USING ERRCODE = '22023';
  END IF;
  v_increase := public.fee_terms_increase(v_current, ROUND(p_fee_percentage, 2), ROUND(p_min_fee_sar, 2), ROUND(p_max_fee_sar, 2));
  IF v_increase AND p_effective_from < now() + INTERVAL '30 days' THEN
    RAISE EXCEPTION 'A fee increase gives providers 30 days of notice: start it on or after %',
      to_char((now() + INTERVAL '30 days') AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD')
      USING ERRCODE = '22023', HINT = 'fee_increase_notice';
  END IF;
  v_from := GREATEST(p_effective_from, now());

  RETURN public.governance_request('fee_rule_change', 'fee_rules',
    md5('fee_rule_change:' || p_channel || ':' || COALESCE(p_is_first_visit::text, 'any'))::uuid, NULL,
    jsonb_build_object('channel', p_channel, 'is_first_visit', p_is_first_visit, 'fee_percentage', ROUND(p_fee_percentage, 2),
                       'min_fee_sar', ROUND(p_min_fee_sar, 2), 'max_fee_sar', ROUND(p_max_fee_sar, 2), 'effective_from', v_from,
                       'description', COALESCE(v_description, v_current.description), 'supersedes_id', v_current.id,
                       'increase', v_increase, 'reason', v_reason),
    v_reason,
    jsonb_build_object('channel', p_channel, 'is_first_visit', p_is_first_visit, 'increase', v_increase, 'effective_from', v_from,
                       'before', CASE WHEN v_current.id IS NULL THEN NULL ELSE jsonb_build_object('fee_percentage', v_current.fee_percentage,
                                   'min_fee_sar', v_current.min_fee_sar, 'max_fee_sar', v_current.max_fee_sar) END,
                       'after', jsonb_build_object('fee_percentage', ROUND(p_fee_percentage, 2), 'min_fee_sar', ROUND(p_min_fee_sar, 2),
                                   'max_fee_sar', ROUND(p_max_fee_sar, 2))));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_propose_fee_rule_change(TEXT, BOOLEAN, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_propose_fee_rule_change(TEXT, BOOLEAN, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.gov_exec_fee_rule_change(p_req public.admin_approval_requests)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p JSONB := p_req.payload;
  v_current public.fee_rules;
  v_from TIMESTAMPTZ := (v_p->>'effective_from')::timestamptz;
  v_increase BOOLEAN;
  v_id UUID;
  v_notices INTEGER := 0;
  v_provider RECORD;
BEGIN
  IF NOT public.governance_execution_active('fee_rule_change', p_req.target_id) THEN
    RAISE EXCEPTION 'A fee change runs only as an approved request' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_current FROM public.fee_rules
   WHERE channel = v_p->>'channel' AND is_first_visit IS NOT DISTINCT FROM (v_p->>'is_first_visit')::boolean
   ORDER BY effective_from DESC LIMIT 1 FOR UPDATE;
  IF v_current.id IS DISTINCT FROM (v_p->>'supersedes_id')::uuid THEN
    RAISE EXCEPTION 'The rule changed after this request was made; ask for a new change' USING ERRCODE = '23505';
  END IF;
  v_increase := public.fee_terms_increase(v_current, (v_p->>'fee_percentage')::numeric, (v_p->>'min_fee_sar')::numeric,
                                          (v_p->>'max_fee_sar')::numeric);
  -- Notice runs from the approval, when providers are told.
  IF v_increase AND v_from < now() + INTERVAL '30 days' THEN
    RAISE EXCEPTION 'This increase would start less than 30 days after approval; providers must have 30 days of notice. Reject it and propose a later date'
      USING ERRCODE = '22023', HINT = 'fee_increase_notice';
  END IF;
  v_from := GREATEST(v_from, now());

  PERFORM set_config('primora.fee_rule_write', 'on', true);
  IF v_current.id IS NOT NULL THEN
    UPDATE public.fee_rules SET effective_to = v_from, updated_at = now() WHERE id = v_current.id;
  END IF;
  INSERT INTO public.fee_rules (channel, is_first_visit, fee_percentage, min_fee_sar, max_fee_sar, is_active, description,
                                effective_from, supersedes_id, approval_request_id, proposed_by, approved_by)
  VALUES (v_p->>'channel', (v_p->>'is_first_visit')::boolean, (v_p->>'fee_percentage')::numeric, (v_p->>'min_fee_sar')::numeric,
          (v_p->>'max_fee_sar')::numeric, TRUE, v_p->>'description', v_from, v_current.id, p_req.id, p_req.requested_by, auth.uid())
  RETURNING id INTO v_id;

  IF v_increase THEN
    FOR v_provider IN SELECT p.id, p.owner_id FROM public.providers p WHERE p.status IN ('active', 'approved', 'pending', 'suspended') LOOP
      INSERT INTO public.provider_fee_change_notices (provider_id, fee_rule_id, approval_request_id, channel, is_first_visit, before_terms, after_terms, effective_from)
      VALUES (v_provider.id, v_id, p_req.id, v_p->>'channel', (v_p->>'is_first_visit')::boolean,
              CASE WHEN v_current.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('fee_percentage', v_current.fee_percentage,
                'min_fee_sar', v_current.min_fee_sar, 'max_fee_sar', v_current.max_fee_sar) END,
              jsonb_build_object('fee_percentage', (v_p->>'fee_percentage')::numeric, 'min_fee_sar', (v_p->>'min_fee_sar')::numeric,
                'max_fee_sar', (v_p->>'max_fee_sar')::numeric),
              v_from)
      ON CONFLICT (provider_id, fee_rule_id) DO NOTHING;
      IF v_provider.owner_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title_en, title_ar, body_en, body_ar, type, data)
        VALUES (v_provider.owner_id, 'Platform fee change', 'تغيير في رسوم المنصة',
                'The platform fee on marketplace bookings changes from ' || to_char(v_from AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD')
                  || '. Open Pricing to see the new terms and a worked example.',
                'تتغير رسوم المنصة على حجوزات السوق ابتداءً من ' || to_char(v_from AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD')
                  || '. افتح صفحة الأسعار لمعرفة الشروط الجديدة ومثال محسوب.',
                'fee_change', jsonb_build_object('fee_rule_id', v_id, 'effective_from', v_from));
      END IF;
      v_notices := v_notices + 1;
    END LOOP;
  END IF;

  PERFORM public.write_audit_log('fee_rule.version_approved', 'fee_rules', v_id,
    jsonb_build_object('channel', v_p->>'channel', 'is_first_visit', v_p->'is_first_visit', 'supersedes_id', v_current.id,
                       'before', CASE WHEN v_current.id IS NULL THEN NULL ELSE jsonb_build_object('fee_percentage', v_current.fee_percentage,
                                   'min_fee_sar', v_current.min_fee_sar, 'max_fee_sar', v_current.max_fee_sar) END,
                       'after', jsonb_build_object('fee_percentage', v_p->'fee_percentage', 'min_fee_sar', v_p->'min_fee_sar', 'max_fee_sar', v_p->'max_fee_sar'),
                       'effective_from', v_from, 'increase', v_increase, 'provider_notices', v_notices, 'reason', v_p->>'reason',
                       'maker', p_req.requested_by, 'checker', auth.uid(), 'approval_request_id', p_req.id));
  RETURN jsonb_build_object('status', 'scheduled', 'fee_rule_id', v_id, 'effective_from', v_from, 'increase', v_increase, 'provider_notices', v_notices);
END;
$$;
REVOKE ALL ON FUNCTION public.gov_exec_fee_rule_change(public.admin_approval_requests) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Payout holds
-- ---------------------------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.provider_payout_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'lifted')),
  reason TEXT NOT NULL,
  requested_by UUID NOT NULL,
  approved_by UUID NOT NULL,
  approval_request_id UUID NOT NULL,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lift_reason TEXT,
  lift_requested_by UUID,
  lifted_by UUID,
  lift_approval_request_id UUID,
  lifted_at TIMESTAMPTZ,
  CHECK (requested_by <> approved_by),
  CHECK (status = 'active' OR (lifted_at IS NOT NULL AND lifted_by IS NOT NULL AND lift_requested_by IS NOT NULL AND lift_requested_by <> lifted_by))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_payout_hold_active ON public.provider_payout_holds (provider_id) WHERE status = 'active';
ALTER TABLE public.provider_payout_holds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Console sessions read payout holds" ON public.provider_payout_holds;
CREATE POLICY "Console sessions read payout holds" ON public.provider_payout_holds FOR SELECT TO authenticated USING (public.is_admin());
SELECT public.grant_data_api_access('public.provider_payout_holds');
REVOKE INSERT, UPDATE, DELETE ON public.provider_payout_holds FROM anon, authenticated;
SELECT public.attach_admin_audit_trigger('public.provider_payout_holds');
DROP TRIGGER IF EXISTS trg_money_append_only ON public.provider_payout_holds;
CREATE TRIGGER trg_money_append_only BEFORE UPDATE OR DELETE ON public.provider_payout_holds FOR EACH ROW
  EXECUTE FUNCTION public.guard_money_append_only('no_delete', 'id,provider_id,reason,requested_by,approved_by,approval_request_id,placed_at');

CREATE OR REPLACE FUNCTION public.provider_payout_hold_active(p_provider_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.provider_payout_holds h WHERE h.provider_id = p_provider_id AND h.status = 'active');
$$;
REVOKE ALL ON FUNCTION public.provider_payout_hold_active(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_request_payout_hold(p_provider_id UUID, p_action TEXT, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_active BOOLEAN;
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('money.payout') THEN
    RAISE EXCEPTION 'Your console role cannot hold payouts' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('place', 'lift') THEN
    RAISE EXCEPTION 'The action is place or lift' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id) THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  v_active := public.provider_payout_hold_active(p_provider_id);
  IF p_action = 'place' AND v_active THEN
    RAISE EXCEPTION 'Payouts to this provider are already on hold' USING ERRCODE = '23505';
  END IF;
  IF p_action = 'lift' AND NOT v_active THEN
    RAISE EXCEPTION 'Payouts to this provider are not on hold' USING ERRCODE = '22023';
  END IF;
  RETURN public.governance_request('payout_hold', 'providers', md5('payout_hold:' || p_provider_id::text)::uuid, NULL,
    jsonb_build_object('provider_id', p_provider_id, 'action', p_action, 'reason', v_reason), v_reason,
    jsonb_build_object('provider_id', p_provider_id, 'action', p_action));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_request_payout_hold(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_request_payout_hold(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.gov_exec_payout_hold(p_req public.admin_approval_requests)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider UUID := (p_req.payload->>'provider_id')::uuid;
  v_id UUID;
BEGIN
  IF NOT public.governance_execution_active('payout_hold', p_req.target_id) THEN
    RAISE EXCEPTION 'A payout hold changes only as an approved request' USING ERRCODE = '42501';
  END IF;
  IF p_req.payload->>'action' = 'place' THEN
    INSERT INTO public.provider_payout_holds (provider_id, reason, requested_by, approved_by, approval_request_id)
    VALUES (v_provider, p_req.payload->>'reason', p_req.requested_by, auth.uid(), p_req.id)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.provider_payout_holds
       SET status = 'lifted', lift_reason = p_req.payload->>'reason', lift_requested_by = p_req.requested_by, lifted_by = auth.uid(),
           lift_approval_request_id = p_req.id, lifted_at = now()
     WHERE provider_id = v_provider AND status = 'active'
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Payouts to this provider are not on hold' USING ERRCODE = '22023';
    END IF;
  END IF;
  PERFORM public.write_audit_log('payout_hold.' || CASE WHEN p_req.payload->>'action' = 'place' THEN 'placed' ELSE 'lifted' END,
    'provider_payout_holds', v_id,
    jsonb_build_object('provider_id', v_provider, 'reason', p_req.payload->>'reason', 'maker', p_req.requested_by, 'checker', auth.uid(),
                       'approval_request_id', p_req.id));
  RETURN jsonb_build_object('status', CASE WHEN p_req.payload->>'action' = 'place' THEN 'held' ELSE 'lifted' END, 'hold_id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.gov_exec_payout_hold(public.admin_approval_requests) FROM PUBLIC, anon, authenticated;

-- A held provider is not paid.
SELECT pg_temp.patch_function('public.admin_release_payout(uuid,text,text,text)'::regprocedure,
$from$  -- Maker-checker (D-Q5): without an approved request being executed, this records the request for a second administrator.$from$,
$to$  IF public.provider_payout_hold_active(v_request.provider_id) THEN
    RAISE EXCEPTION 'Payouts to this provider are on hold (D-Q8); lift the hold first' USING ERRCODE = '22023', HINT = 'payout_hold';
  END IF;
  -- Maker-checker (D-Q5): without an approved request being executed, this records the request for a second administrator.$to$);
SELECT pg_temp.patch_function('public.admin_release_ledger_item(uuid,text,text,text)'::regprocedure,
$from$  v_open := v_row.provider_share;$from$,
$to$  IF public.provider_payout_hold_active(v_row.provider_id) THEN
    RAISE EXCEPTION 'Payouts to this provider are on hold (D-Q8); lift the hold first' USING ERRCODE = '22023', HINT = 'payout_hold';
  END IF;
  v_open := v_row.provider_share;$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. The console's list of fee rule versions and pending changes
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_fee_rule_versions()
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
    'versions', COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.channel, v.is_first_visit DESC NULLS LAST, v.effective_from DESC)
      FROM (SELECT r.id, r.channel, r.is_first_visit, r.fee_percentage, r.min_fee_sar, r.max_fee_sar, r.is_active, r.description,
                   r.effective_from, r.effective_to, r.supersedes_id, r.approval_request_id, r.proposed_by, r.approved_by,
                   (r.effective_from <= now() AND (r.effective_to IS NULL OR r.effective_to > now())) AS in_force,
                   (r.effective_from > now()) AS scheduled
              FROM public.fee_rules r) v), '[]'::jsonb),
    'pending', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'summary', a.summary, 'requested_by', a.requested_by,
                         'requested_at', a.requested_at, 'reason', a.request_reason) ORDER BY a.requested_at DESC)
      FROM public.admin_approval_requests a WHERE a.kind = 'fee_rule_change' AND a.status = 'pending'), '[]'::jsonb),
    'vat_rate_percent', public.country_vat_rate('SA'),
    'can_propose', public.admin_can('money.config'));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_fee_rule_versions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_fee_rule_versions() TO authenticated;
