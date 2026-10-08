-- G70: GCC multi-country configuration.
--
-- Country, currency, tax and time zone move out of constants into configuration. Saudi Arabia is the only country seeded and
-- reproduces today's behaviour exactly (SAR, Asia/Riyadh, VAT 15 %, +966). The other GCC countries are NOT seeded: their VAT
-- rates, licensing and tax-invoice regimes are an owner and legal decision made per country, then entered with
-- admin_upsert_country(). A country that is not active cannot take bookings.
--
-- This migration holds the data model, the resolvers and the administrator commands. The functions that carried the Saudi
-- constants are patched in place by the next migration.

CREATE TABLE IF NOT EXISTS public.countries (
  code TEXT PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),
  name_en TEXT NOT NULL CHECK (char_length(btrim(name_en)) BETWEEN 2 AND 80),
  name_ar TEXT NOT NULL CHECK (char_length(btrim(name_ar)) BETWEEN 2 AND 80),
  currency_code TEXT NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  currency_minor_units SMALLINT NOT NULL CHECK (currency_minor_units BETWEEN 0 AND 4),
  timezone TEXT NOT NULL CHECK (char_length(btrim(timezone)) BETWEEN 3 AND 64),
  vat_rate_percent NUMERIC(5,2) NOT NULL CHECK (vat_rate_percent >= 0 AND vat_rate_percent <= 100),
  phone_dial_code TEXT NOT NULL CHECK (phone_dial_code ~ '^\+[0-9]{1,4}$'),
  active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

-- Signed-in users read the countries that are open; an administrator reads all. Nobody writes the table directly:
-- admin_upsert_country() is the only way in (default deny).
DROP POLICY IF EXISTS "countries_read" ON public.countries;
CREATE POLICY "countries_read" ON public.countries FOR SELECT TO authenticated
  USING (active OR public.is_admin());

INSERT INTO public.countries (code, name_en, name_ar, currency_code, currency_minor_units, timezone, vat_rate_percent, phone_dial_code, active)
VALUES ('SA', 'Saudi Arabia', $ar$المملكة العربية السعودية$ar$, 'SAR', 2, 'Asia/Riyadh', 15, '+966', TRUE)
ON CONFLICT (code) DO NOTHING;

-- A branch belongs to a country, and takes the country's time zone unless it overrides it.
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'SA' REFERENCES public.countries(code);
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS timezone TEXT;
CREATE INDEX IF NOT EXISTS idx_branches_country ON public.branches (country_code);

-- ---------------------------------------------------------------------------------------------------------------------
-- Resolvers. STABLE SQL, SECURITY INVOKER: a signed-in caller resolves what it may read (an open country), while the SECURITY
-- DEFINER commands that call them run as the owner and resolve every country.
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.country_vat_rate(p_country TEXT)
RETURNS NUMERIC LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT c.vat_rate_percent FROM public.countries c WHERE c.code = upper(btrim(p_country))
$$;

CREATE OR REPLACE FUNCTION public.country_timezone(p_country TEXT)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT c.timezone FROM public.countries c WHERE c.code = upper(btrim(p_country))
$$;

CREATE OR REPLACE FUNCTION public.country_is_active(p_country TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE((SELECT c.active FROM public.countries c WHERE c.code = upper(btrim(p_country))), FALSE)
$$;

CREATE OR REPLACE FUNCTION public.branch_country(p_branch_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT b.country_code FROM public.branches b WHERE b.id = p_branch_id
$$;

CREATE OR REPLACE FUNCTION public.branch_timezone(p_branch_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(NULLIF(btrim(b.timezone), ''), c.timezone)
  FROM public.branches b JOIN public.countries c ON c.code = b.country_code
  WHERE b.id = p_branch_id
$$;

-- A provider's country is the country of its oldest branch (its head office). A provider that has no branch yet is in the
-- platform's home market, Saudi Arabia: the same value the branches.country_code column defaults to.
CREATE OR REPLACE FUNCTION public.provider_country(p_provider_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE((SELECT b.country_code FROM public.branches b WHERE b.provider_id = p_provider_id ORDER BY b.created_at, b.id LIMIT 1), 'SA')
$$;

-- The time zone of a provider: its country's (a provider with branches in several zones uses its head office's).
CREATE OR REPLACE FUNCTION public.provider_timezone(p_provider_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.country_timezone(public.provider_country(p_provider_id))
$$;

DO $grants$
DECLARE v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.country_vat_rate(text)', 'public.country_timezone(text)', 'public.country_is_active(text)',
    'public.branch_country(uuid)', 'public.branch_timezone(uuid)', 'public.provider_country(uuid)', 'public.provider_timezone(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_fn);
  END LOOP;
END $grants$;

-- A branch's country and time zone are decided by an administrator: they decide which tax and which clock apply to money.
-- A provider that adds a branch gets the country of its other branches; it cannot move a branch to another country.
CREATE OR REPLACE FUNCTION public.guard_branch_country()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND NOT public.is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.country_code := public.provider_country(NEW.provider_id);
      NEW.timezone := NULL;
    ELSIF NEW.country_code IS DISTINCT FROM OLD.country_code OR NEW.timezone IS DISTINCT FROM OLD.timezone THEN
      RAISE EXCEPTION 'The country and time zone of a branch are changed by an administrator' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.timezone IS NOT NULL AND btrim(NEW.timezone) <> '' AND NOT EXISTS (SELECT 1 FROM pg_timezone_names n WHERE n.name = NEW.timezone) THEN
    RAISE EXCEPTION 'Unknown time zone %', NEW.timezone USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_branch_country ON public.branches;
CREATE TRIGGER trg_guard_branch_country BEFORE INSERT OR UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.guard_branch_country();

SELECT public.grant_data_api_access('public.countries');
SELECT public.attach_admin_audit_trigger('public.countries');
