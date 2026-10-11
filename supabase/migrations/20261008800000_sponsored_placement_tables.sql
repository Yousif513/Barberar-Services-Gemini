-- Migration: 20261008800000_sponsored_placement_tables.sql
-- G63 Sponsored placement (labelled). Providers pay per NEW client a sponsored placement brings; the owner sets the price; off until configured.
--
--   * Four platform settings, all UNSET by default: sponsored.enabled (false), sponsored.price_per_new_client_sar, sponsored.max_slots_per_search,
--     sponsored.attribution_window_days. The mechanism does nothing while any of them is unset (sponsored_config().configured = false).
--     There is no fallback number anywhere. admin_update_platform_setting learns the four keys (patched in place).
--   * sponsored_campaigns / sponsored_clicks / sponsored_attributions. Clients never write them: every change is a SECURITY DEFINER command
--     (next migration). Operators (owner, delegate holding the reports permission, administrator) read their own rows through RLS; customers and
--     strangers read nothing.
--   * An ADDITIVE AFTER UPDATE trigger on bookings accrues the fee when a booking becomes completed: the customer clicked a campaign of that
--     provider inside the attribution window (before the booking was created) and has no other completed booking at that provider. The fee is the
--     price at the time, never more than the price the provider accepted when the campaign was activated; once the campaign's monthly cap would be
--     exceeded the attribution is waived with reason 'cap'. One attribution per booking (unique booking_id), so a replay changes nothing.
--   * Billing: provider_fee_invoices gets a sponsored_fees_sar column and an AFTER INSERT trigger. When the monthly batch inserts a provider's
--     invoice the trigger attaches every accrued, not yet billed attribution of that provider up to the invoice month and adds the sum to
--     total_invoice_due_sar. No money function is redefined; the invoice that exists is never rewritten afterwards (a late accrual rolls into the next
--     invoice). No VAT is added or extracted here: whether the owner's price includes VAT is a tax question recorded in the report.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $helper$
DECLARE
  v_crlf text := chr(13) || chr(10);
  v_def text := replace(pg_get_functiondef(p_sig), v_crlf, chr(10));
  v_from text := replace(p_from, v_crlf, chr(10));
BEGIN
  IF position(v_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, v_from, replace(p_to, v_crlf, chr(10)));
END $helper$;

-- ---------------------------------------------------------------------------
-- 1. Settings (owner decisions, unset)
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_settings (key, value, description, requires_owner_approval) VALUES
  ('sponsored.enabled', 'false'::jsonb,
   'Master switch for labelled sponsored placement. Stays false until the owner switches it on; it also needs the three values below.', TRUE),
  ('sponsored.price_per_new_client_sar', 'null'::jsonb,
   'Price in SAR a provider pays for each NEW client a sponsored placement brings (at most two decimals). Unset until the owner decides: sponsored placement does not run while it is unset.', TRUE),
  ('sponsored.max_slots_per_search', 'null'::jsonb,
   'Largest number of sponsored places shown above one search result (a whole number). Unset until the owner decides.', TRUE),
  ('sponsored.attribution_window_days', 'null'::jsonb,
   'Days a click on a sponsored place stays attributable to a booking made afterwards (a whole number). Unset until the owner decides.', TRUE)
ON CONFLICT (key) DO NOTHING;

SELECT pg_temp.patch_function('public.admin_update_platform_setting(text, jsonb, text)'::regprocedure,
  $q$  ELSIF p_key = 'referral_program' THEN$q$,
  $q$  ELSIF p_key = 'sponsored.enabled' THEN
    IF jsonb_typeof(p_value) IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Sponsored placement is switched on or off with true or false' USING ERRCODE = '22023';
    END IF;
  ELSIF p_key = 'sponsored.price_per_new_client_sar' THEN
    IF jsonb_typeof(p_value) NOT IN ('number', 'null') THEN
      RAISE EXCEPTION 'The sponsored price is an amount in SAR, or null to remove it' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_value) = 'number' THEN
      v_num := (p_value #>> '{}')::numeric;
      IF v_num <= 0 OR v_num > 100000 OR v_num <> round(v_num, 2) THEN
        RAISE EXCEPTION 'The sponsored price must be above 0 SAR with at most two decimals' USING ERRCODE = '22023';
      END IF;
    END IF;
  ELSIF p_key = 'sponsored.max_slots_per_search' THEN
    IF jsonb_typeof(p_value) NOT IN ('number', 'null') THEN
      RAISE EXCEPTION 'The number of sponsored places is a whole number from 1 to 10, or null to remove it' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_value) = 'number' THEN
      v_num := (p_value #>> '{}')::numeric;
      IF v_num <> trunc(v_num) OR v_num < 1 OR v_num > 10 THEN
        RAISE EXCEPTION 'The number of sponsored places must be a whole number from 1 to 10' USING ERRCODE = '22023';
      END IF;
    END IF;
  ELSIF p_key = 'sponsored.attribution_window_days' THEN
    IF jsonb_typeof(p_value) NOT IN ('number', 'null') THEN
      RAISE EXCEPTION 'The attribution window is a whole number of days from 1 to 365, or null to remove it' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_value) = 'number' THEN
      v_num := (p_value #>> '{}')::numeric;
      IF v_num <> trunc(v_num) OR v_num < 1 OR v_num > 365 THEN
        RAISE EXCEPTION 'The attribution window must be a whole number of days from 1 to 365' USING ERRCODE = '22023';
      END IF;
    END IF;
  ELSIF p_key = 'referral_program' THEN$q$);

-- The settings read as one validated object. configured is true only when the master switch is on AND all three values are valid.
-- SECURITY INVOKER on purpose: platform_settings is readable by everyone, so this needs no elevated rights (and no identity check).
CREATE OR REPLACE FUNCTION public.sponsored_config() RETURNS JSONB
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_enabled JSONB;
  v_price JSONB;
  v_slots JSONB;
  v_window JSONB;
  v_p NUMERIC;
  v_s NUMERIC;
  v_w NUMERIC;
  v_missing JSONB := '[]'::jsonb;
  v_price_ok BOOLEAN := FALSE;
  v_slots_ok BOOLEAN := FALSE;
  v_window_ok BOOLEAN := FALSE;
BEGIN
  SELECT value INTO v_enabled FROM public.platform_settings WHERE key = 'sponsored.enabled';
  SELECT value INTO v_price FROM public.platform_settings WHERE key = 'sponsored.price_per_new_client_sar';
  SELECT value INTO v_slots FROM public.platform_settings WHERE key = 'sponsored.max_slots_per_search';
  SELECT value INTO v_window FROM public.platform_settings WHERE key = 'sponsored.attribution_window_days';

  IF jsonb_typeof(v_price) = 'number' THEN
    v_p := (v_price #>> '{}')::numeric;
    v_price_ok := v_p > 0;
  END IF;
  IF jsonb_typeof(v_slots) = 'number' THEN
    v_s := (v_slots #>> '{}')::numeric;
    v_slots_ok := v_s >= 1 AND v_s = trunc(v_s);
  END IF;
  IF jsonb_typeof(v_window) = 'number' THEN
    v_w := (v_window #>> '{}')::numeric;
    v_window_ok := v_w >= 1 AND v_w = trunc(v_w);
  END IF;

  IF NOT v_price_ok THEN v_missing := v_missing || to_jsonb('sponsored.price_per_new_client_sar'::text); END IF;
  IF NOT v_slots_ok THEN v_missing := v_missing || to_jsonb('sponsored.max_slots_per_search'::text); END IF;
  IF NOT v_window_ok THEN v_missing := v_missing || to_jsonb('sponsored.attribution_window_days'::text); END IF;

  RETURN jsonb_build_object(
    'enabled', COALESCE(v_enabled = 'true'::jsonb, FALSE),
    'configured', COALESCE(v_enabled = 'true'::jsonb, FALSE) AND v_price_ok AND v_slots_ok AND v_window_ok,
    'missing', v_missing,
    'price_per_new_client_sar', CASE WHEN v_price_ok THEN v_p END,
    'max_slots_per_search', CASE WHEN v_slots_ok THEN v_s::integer END,
    'attribution_window_days', CASE WHEN v_window_ok THEN v_w::integer END);
END $$;
REVOKE ALL ON FUNCTION public.sponsored_config() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sponsored_config() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sponsored_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  city TEXT,
  category_slug TEXT,
  monthly_budget_cap_sar NUMERIC(12,2) NOT NULL CHECK (monthly_budget_cap_sar > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  starts_on DATE NOT NULL,
  ends_on DATE,
  accepted_price_sar NUMERIC(12,2) CHECK (accepted_price_sar IS NULL OR accepted_price_sar > 0),
  accepted_at TIMESTAMPTZ,
  last_shown_at TIMESTAMPTZ,
  status_reason TEXT,
  ended_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sponsored_campaigns_dates CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS idx_sponsored_campaigns_provider ON public.sponsored_campaigns (provider_id, status);
CREATE INDEX IF NOT EXISTS idx_sponsored_campaigns_rotation ON public.sponsored_campaigns (last_shown_at NULLS FIRST, created_at, id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.sponsored_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.sponsored_campaigns(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  click_day DATE NOT NULL
);
-- One click per campaign, customer and Riyadh day. Anonymous visitors share the nil identity: an anonymous campaign click counts once a day.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sponsored_clicks_day
  ON public.sponsored_clicks (campaign_id, (COALESCE(customer_id, '00000000-0000-0000-0000-000000000000'::uuid)), click_day);
CREATE INDEX IF NOT EXISTS idx_sponsored_clicks_attribution ON public.sponsored_clicks (customer_id, provider_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_sponsored_clicks_campaign ON public.sponsored_clicks (campaign_id, clicked_at);

CREATE TABLE IF NOT EXISTS public.sponsored_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.sponsored_campaigns(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id),
  customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_new_client BOOLEAN NOT NULL,
  fee_amount_sar NUMERIC(12,2) NOT NULL CHECK (fee_amount_sar >= 0),
  status TEXT NOT NULL CHECK (status IN ('accrued', 'waived', 'void')),
  status_reason TEXT,
  period_month DATE NOT NULL,
  accrued_at TIMESTAMPTZ,
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  billed_invoice_id UUID REFERENCES public.provider_fee_invoices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sponsored_attributions_month_start CHECK (period_month = date_trunc('month', period_month)::date),
  CONSTRAINT sponsored_attributions_billed_only_accrued CHECK (billed_invoice_id IS NULL OR status = 'accrued')
);
CREATE INDEX IF NOT EXISTS idx_sponsored_attributions_campaign ON public.sponsored_attributions (campaign_id, period_month, status);
CREATE INDEX IF NOT EXISTS idx_sponsored_attributions_billing ON public.sponsored_attributions (provider_id, period_month)
  WHERE status = 'accrued' AND billed_invoice_id IS NULL;

ALTER TABLE public.provider_fee_invoices
  ADD COLUMN IF NOT EXISTS sponsored_fees_sar NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (sponsored_fees_sar >= 0);

ALTER TABLE public.sponsored_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsored_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsored_attributions ENABLE ROW LEVEL SECURITY;

-- Read only, for the people who run the business and for the platform. No INSERT/UPDATE/DELETE policy exists: every write is a command.
DROP POLICY IF EXISTS "Operators read their sponsored campaigns" ON public.sponsored_campaigns;
CREATE POLICY "Operators read their sponsored campaigns" ON public.sponsored_campaigns
  FOR SELECT TO authenticated USING (public.can_access_provider_wide(provider_id, 'reports'));
DROP POLICY IF EXISTS "Operators read their sponsored clicks" ON public.sponsored_clicks;
CREATE POLICY "Operators read their sponsored clicks" ON public.sponsored_clicks
  FOR SELECT TO authenticated USING (public.can_access_provider_wide(provider_id, 'reports'));
DROP POLICY IF EXISTS "Operators read their sponsored attributions" ON public.sponsored_attributions;
CREATE POLICY "Operators read their sponsored attributions" ON public.sponsored_attributions
  FOR SELECT TO authenticated USING (public.can_access_provider_wide(provider_id, 'reports'));

-- ---------------------------------------------------------------------------
-- 3. Attribution: additive trigger on bookings (never touches the booking commands)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sponsored_attribute_completed_booking() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg JSONB := public.sponsored_config();
  v_provider UUID;
  v_owner UUID;
  v_campaign public.sponsored_campaigns;
  v_new BOOLEAN;
  v_price NUMERIC(12,2);
  v_fee NUMERIC(12,2);
  v_month DATE := date_trunc('month', NEW.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date;
  v_spent NUMERIC(12,2);
  v_status TEXT;
  v_reason TEXT;
  v_id UUID;
BEGIN
  IF NEW.customer_id IS NULL OR NOT COALESCE((v_cfg ->> 'configured')::boolean, FALSE) THEN
    RETURN NULL;
  END IF;
  SELECT br.provider_id, p.owner_id INTO v_provider, v_owner
    FROM public.branches br JOIN public.providers p ON p.id = br.provider_id WHERE br.id = NEW.branch_id;
  IF v_provider IS NULL OR v_owner = NEW.customer_id THEN
    RETURN NULL; -- a business does not pay for its own visit
  END IF;

  -- The most recent click on a campaign of this provider by this customer, before the booking was made and inside the window.
  SELECT c.* INTO v_campaign
    FROM public.sponsored_clicks k JOIN public.sponsored_campaigns c ON c.id = k.campaign_id
   WHERE k.provider_id = v_provider AND k.customer_id = NEW.customer_id
     AND k.clicked_at <= NEW.created_at
     AND k.clicked_at >= NEW.created_at - make_interval(days => (v_cfg ->> 'attribution_window_days')::integer)
   ORDER BY k.clicked_at DESC, k.id
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  -- Serialise accruals on one campaign so the monthly cap cannot be passed by two bookings completing together.
  PERFORM 1 FROM public.sponsored_campaigns WHERE id = v_campaign.id FOR UPDATE;

  v_new := NOT EXISTS (
    SELECT 1 FROM public.bookings b2 JOIN public.branches br2 ON br2.id = b2.branch_id
     WHERE br2.provider_id = v_provider AND b2.customer_id = NEW.customer_id AND b2.status = 'completed' AND b2.id <> NEW.id);

  v_price := (v_cfg ->> 'price_per_new_client_sar')::numeric;
  IF v_campaign.accepted_price_sar IS NOT NULL THEN
    v_price := LEAST(v_price, v_campaign.accepted_price_sar); -- never more than the price the provider accepted when activating
  END IF;

  IF NOT v_new THEN
    v_fee := 0; v_status := 'waived'; v_reason := 'not_new_client';
  ELSE
    v_fee := v_price;
    SELECT COALESCE(SUM(a.fee_amount_sar), 0) INTO v_spent
      FROM public.sponsored_attributions a
     WHERE a.campaign_id = v_campaign.id AND a.period_month = v_month AND a.status = 'accrued';
    IF v_spent + v_fee > v_campaign.monthly_budget_cap_sar THEN
      v_status := 'waived'; v_reason := 'cap';
    ELSE
      v_status := 'accrued'; v_reason := NULL;
    END IF;
  END IF;

  INSERT INTO public.sponsored_attributions (campaign_id, provider_id, booking_id, customer_id, is_new_client, fee_amount_sar, status,
                                             status_reason, period_month, accrued_at)
  VALUES (v_campaign.id, v_provider, NEW.id, NEW.customer_id, v_new, v_fee, v_status, v_reason, v_month,
          CASE WHEN v_status = 'accrued' THEN now() END)
  ON CONFLICT (booking_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    PERFORM public.write_audit_log('sponsored.attributed', 'sponsored_attributions', v_id,
      jsonb_build_object('campaign_id', v_campaign.id, 'provider_id', v_provider, 'booking_id', NEW.id, 'status', v_status,
                         'reason', v_reason, 'fee_sar', v_fee, 'month', to_char(v_month, 'YYYY-MM')));
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.sponsored_attribute_completed_booking() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_bookings_sponsored_attribution ON public.bookings;
CREATE TRIGGER trg_bookings_sponsored_attribution AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.sponsored_attribute_completed_booking();

-- ---------------------------------------------------------------------------
-- 4. Billing: the monthly batch inserts the provider's invoice; the sponsored fees ride on it
-- ---------------------------------------------------------------------------
-- AFTER INSERT fires only for a row that was really inserted (the batch uses ON CONFLICT DO NOTHING), so a repeat run bills nothing twice.
CREATE OR REPLACE FUNCTION public.sponsored_bill_fee_invoice() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total NUMERIC(12,2);
  v_lines INTEGER;
BEGIN
  WITH billed AS (
    UPDATE public.sponsored_attributions a SET billed_invoice_id = NEW.id
     WHERE a.provider_id = NEW.provider_id AND a.status = 'accrued' AND a.billed_invoice_id IS NULL
       AND a.period_month <= date_trunc('month', NEW.period_start)::date
    RETURNING a.fee_amount_sar)
  SELECT COALESCE(SUM(fee_amount_sar), 0), COUNT(*)::integer INTO v_total, v_lines FROM billed;

  IF v_lines > 0 THEN
    UPDATE public.provider_fee_invoices
       SET sponsored_fees_sar = v_total,
           total_invoice_due_sar = total_invoice_due_sar + v_total,
           status = CASE WHEN status = 'settled' THEN 'issued' ELSE status END
     WHERE id = NEW.id;
    PERFORM public.write_audit_log('sponsored.billed', 'provider_fee_invoices', NEW.id,
      jsonb_build_object('provider_id', NEW.provider_id, 'lines', v_lines, 'sponsored_fees_sar', v_total,
                         'month', to_char(NEW.period_start, 'YYYY-MM')));
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.sponsored_bill_fee_invoice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fee_invoices_sponsored_lines ON public.provider_fee_invoices;
CREATE TRIGGER trg_fee_invoices_sponsored_lines AFTER INSERT ON public.provider_fee_invoices
  FOR EACH ROW EXECUTE FUNCTION public.sponsored_bill_fee_invoice();

-- ---------------------------------------------------------------------------
-- 5. Data API privileges and the administrator audit trigger on every new table
-- ---------------------------------------------------------------------------
SELECT public.grant_data_api_access('public.sponsored_campaigns');
SELECT public.grant_data_api_access('public.sponsored_clicks');
SELECT public.grant_data_api_access('public.sponsored_attributions');
SELECT public.attach_admin_audit_trigger('public.sponsored_campaigns');
SELECT public.attach_admin_audit_trigger('public.sponsored_clicks');
SELECT public.attach_admin_audit_trigger('public.sponsored_attributions');

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
