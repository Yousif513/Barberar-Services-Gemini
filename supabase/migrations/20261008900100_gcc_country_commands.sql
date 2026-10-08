-- G70: the administrator commands that manage countries and place a branch in one.
-- Saudi Arabia is the only country seeded. Opening another GCC country is an owner and legal decision (its VAT rate, its
-- licensing, its tax-invoice regime); an administrator then enters it here, with a reason, and the change is audited.

CREATE OR REPLACE FUNCTION public.admin_upsert_country(
  p_code TEXT, p_name_en TEXT, p_name_ar TEXT, p_currency_code TEXT, p_currency_minor_units INTEGER, p_timezone TEXT,
  p_vat_rate_percent NUMERIC, p_phone_dial_code TEXT, p_active BOOLEAN, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_code TEXT := upper(btrim(COALESCE(p_code, '')));
  v_before public.countries;
  v_after public.countries;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  IF v_code !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'The country code is the two-letter ISO 3166 code' USING ERRCODE = '22023';
  END IF;
  IF p_active IS NULL OR p_name_en IS NULL OR p_name_ar IS NULL OR p_currency_code IS NULL OR p_currency_minor_units IS NULL
     OR p_timezone IS NULL OR p_vat_rate_percent IS NULL OR p_phone_dial_code IS NULL THEN
    RAISE EXCEPTION 'Name in both languages, currency, time zone, VAT rate, dial code and the active flag are all required' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(p_name_en)) NOT BETWEEN 2 AND 80 OR char_length(btrim(p_name_ar)) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'The country name is 2 to 80 characters in each language' USING ERRCODE = '22023';
  END IF;
  IF upper(btrim(p_currency_code)) !~ '^[A-Z]{3}$' OR p_currency_minor_units NOT BETWEEN 0 AND 4 THEN
    RAISE EXCEPTION 'The currency is a three-letter ISO 4217 code with 0 to 4 minor units' USING ERRCODE = '22023';
  END IF;
  IF p_vat_rate_percent < 0 OR p_vat_rate_percent > 100 THEN
    RAISE EXCEPTION 'The VAT rate is a percentage between 0 and 100' USING ERRCODE = '22023';
  END IF;
  IF btrim(p_phone_dial_code) !~ '^[+][0-9]{1,4}$' THEN
    RAISE EXCEPTION 'The dial code starts with + and has 1 to 4 digits' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names n WHERE n.name = btrim(p_timezone)) THEN
    RAISE EXCEPTION 'Unknown time zone %', p_timezone USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('countries'));
  SELECT * INTO v_before FROM public.countries WHERE code = v_code FOR UPDATE;
  -- The platform always keeps one open country: closing the last one would stop every booking.
  IF NOT p_active AND COALESCE(v_before.active, FALSE)
     AND NOT EXISTS (SELECT 1 FROM public.countries c WHERE c.active AND c.code <> v_code) THEN
    RAISE EXCEPTION 'At least one country must stay active' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('primora.audit_reason', v_reason, true);
  INSERT INTO public.countries AS c (code, name_en, name_ar, currency_code, currency_minor_units, timezone, vat_rate_percent, phone_dial_code, active)
  VALUES (v_code, btrim(p_name_en), btrim(p_name_ar), upper(btrim(p_currency_code)), p_currency_minor_units, btrim(p_timezone),
          p_vat_rate_percent, btrim(p_phone_dial_code), p_active)
  ON CONFLICT (code) DO UPDATE SET
    name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, currency_code = EXCLUDED.currency_code,
    currency_minor_units = EXCLUDED.currency_minor_units, timezone = EXCLUDED.timezone,
    vat_rate_percent = EXCLUDED.vat_rate_percent, phone_dial_code = EXCLUDED.phone_dial_code,
    active = EXCLUDED.active, updated_at = now()
  RETURNING * INTO v_after;

  PERFORM public.write_audit_log(CASE WHEN v_before.code IS NULL THEN 'country.created' ELSE 'country.updated' END, 'countries', NULL,
    jsonb_build_object('code', v_code, 'reason', v_reason,
      'before', CASE WHEN v_before.code IS NULL THEN NULL ELSE to_jsonb(v_before) - 'created_at' - 'updated_at' END,
      'after', to_jsonb(v_after) - 'created_at' - 'updated_at'));
  RETURN jsonb_build_object('success', TRUE, 'code', v_code, 'created', v_before.code IS NULL, 'active', v_after.active,
    'vat_rate_percent', v_after.vat_rate_percent, 'timezone', v_after.timezone);
END $$;

-- Places a branch in a country (and optionally gives it a time zone of its own). Refused while the branch has upcoming
-- bookings: their local day and tax were decided under the old country.
CREATE OR REPLACE FUNCTION public.admin_set_branch_country(p_branch_id UUID, p_country_code TEXT, p_timezone TEXT, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_code TEXT := upper(btrim(COALESCE(p_country_code, '')));
  v_tz TEXT := NULLIF(btrim(COALESCE(p_timezone, '')), '');
  v_branch public.branches;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id FOR UPDATE;
  IF v_branch.id IS NULL THEN
    RAISE EXCEPTION 'Branch not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.countries WHERE code = v_code) THEN
    RAISE EXCEPTION 'Country not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_tz IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_timezone_names n WHERE n.name = v_tz) THEN
    RAISE EXCEPTION 'Unknown time zone %', v_tz USING ERRCODE = '22023';
  END IF;
  IF v_branch.country_code = v_code AND v_branch.timezone IS NOT DISTINCT FROM v_tz THEN
    RETURN jsonb_build_object('success', TRUE, 'branch_id', v_branch.id, 'country_code', v_code, 'timezone', v_tz, 'changed', FALSE);
  END IF;
  IF EXISTS (SELECT 1 FROM public.bookings b WHERE b.branch_id = v_branch.id AND b.status IN ('pending_payment', 'confirmed') AND b.scheduled_at > now()) THEN
    RAISE EXCEPTION 'This branch has upcoming bookings. Move or cancel them before changing its country or time zone' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('primora.audit_reason', v_reason, true);
  UPDATE public.branches SET country_code = v_code, timezone = v_tz WHERE id = v_branch.id;
  PERFORM public.write_audit_log('branch.country_changed', 'branches', v_branch.id,
    jsonb_build_object('reason', v_reason, 'country_before', v_branch.country_code, 'country_after', v_code,
                       'timezone_before', v_branch.timezone, 'timezone_after', v_tz));
  RETURN jsonb_build_object('success', TRUE, 'branch_id', v_branch.id, 'country_code', v_code, 'timezone', v_tz, 'changed', TRUE);
END $$;

REVOKE ALL ON FUNCTION public.admin_upsert_country(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, NUMERIC, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_country(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, NUMERIC, TEXT, BOOLEAN, TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_branch_country(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_branch_country(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;
