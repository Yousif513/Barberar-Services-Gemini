-- FIX-PROV R36: import_provider_clients understands the phone forms people paste and refuses a row without a usable number.
--
-- It removed everything that was not 0-9 or + (an Arabic-Indic number became empty and was stored with no phone), only converted the
-- 05 form, and let a row with no phone through, so the unique key (provider, phone) could not de-duplicate it. The function is patched in
-- place from its current definition: Arabic-Indic digits are translated, 00966 / 966 / 5xxxxxxxx / 05xxxxxxxx become +9665xxxxxxxx, and a
-- row whose phone is missing or not a Saudi mobile is skipped (and counted as skipped, as before).

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_def text := replace(pg_get_functiondef(p_sig), chr(13) || chr(10), chr(10));
  v_from text := replace(p_from, chr(13) || chr(10), chr(10));
  v_to text := replace(p_to, chr(13) || chr(10), chr(10));
BEGIN
  IF position(v_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, v_from, v_to);
END $$;

SELECT pg_temp.patch_function('public.import_provider_clients(uuid, jsonb, boolean)'::regprocedure,
  $from$    v_phone := NULLIF(regexp_replace(COALESCE(v_row->>'phone', ''), '[^0-9+]', '', 'g'), '');$from$,
  $to$    v_phone := NULLIF(regexp_replace(translate(COALESCE(v_row->>'phone', ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9+]', '', 'g'), '');$to$);

SELECT pg_temp.patch_function('public.import_provider_clients(uuid, jsonb, boolean)'::regprocedure,
  $from$    IF v_phone ~ '^05[0-9]{8}$' THEN$from$,
  $to$    IF v_phone ~ '^(\+|00)966[0-9]{9}$' THEN
      v_phone := '+966' || right(v_phone, 9);
    ELSIF v_phone ~ '^966[0-9]{9}$' THEN
      v_phone := '+' || v_phone;
    ELSIF v_phone ~ '^5[0-9]{8}$' THEN
      v_phone := '+966' || v_phone;
    ELSIF v_phone ~ '^05[0-9]{8}$' THEN$to$);

SELECT pg_temp.patch_function('public.import_provider_clients(uuid, jsonb, boolean)'::regprocedure,
  $from$    IF v_name IS NULL OR (v_phone IS NOT NULL AND v_phone !~ '^\+9665[0-9]{8}$') THEN$from$,
  $to$    IF v_name IS NULL OR v_phone IS NULL OR v_phone !~ '^\+9665[0-9]{8}$' THEN$to$);

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
