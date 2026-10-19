-- P-05 / RT-L1 (red team 2026-10-17): the first provider owner who typed a WhatsApp phone_number_id held it before any
-- verification, so the real business was told "already connected to another business" (denial of service and an existence
-- oracle). Platform promo-code names could be pre-registered by providers the same way.
--
-- 1. Only a VERIFIED channel claims its number: the unique index applies to verified rows only. An unverified save never
--    blocks anyone; a save is refused only when another business holds the number verified.
-- 2. Verifying a channel (operations, after checking ownership in Meta Business Manager) evicts every unverified claim on the
--    same number: those channels are switched off and their owners are told. Verifying a number another business already
--    holds verified is refused with a clear reason.
-- 3. Inbound routing picks the verified channel of a number (unverified channels are never routed, as before).
-- 4. Provider codes cannot take a reserved platform name or the platform prefix (platform_settings 'promo.reserved_codes',
--    owner-confirmable). The refusal is the same as for a taken code, so it says nothing about who holds what.

CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n'); -- a checkout with Windows line endings stores them in function bodies
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n'); -- the migration file itself may have been checked out with CRLF
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

ALTER TABLE public.whatsapp_channels DROP CONSTRAINT IF EXISTS whatsapp_channels_phone_number_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_channels_verified_number_unique
  ON public.whatsapp_channels (phone_number_id) WHERE verified_at IS NOT NULL;
-- Lookups by number (save check, eviction, inbound routing) still use an index.
CREATE INDEX IF NOT EXISTS idx_whatsapp_channels_phone_number_id ON public.whatsapp_channels (phone_number_id);

SELECT pg_temp.patch_function('public.provider_save_whatsapp_channel(uuid,text,text,boolean,boolean,boolean)'::regprocedure,
$from$  BEGIN
    INSERT INTO public.whatsapp_channels (provider_id, phone_number_id, display_number, enabled, ai_enabled, handoff_enabled)$from$,
$to$  -- P-05: only a verified channel holds its number; an unverified claim elsewhere never blocks this save.
  IF EXISTS (SELECT 1 FROM public.whatsapp_channels c
              WHERE c.phone_number_id = v_number AND c.provider_id <> p_provider_id AND c.verified_at IS NOT NULL) THEN
    RAISE EXCEPTION 'This WhatsApp number is already connected to another business' USING ERRCODE = '23505', HINT = 'whatsapp_number_verified_elsewhere';
  END IF;

  BEGIN
    INSERT INTO public.whatsapp_channels (provider_id, phone_number_id, display_number, enabled, ai_enabled, handoff_enabled)$to$);

SELECT pg_temp.patch_function('public.whatsapp_ingest_message(text,text,text,text,text,text,timestamp with time zone)'::regprocedure,
$from$WHERE phone_number_id = p_phone_number_id;$from$,
$to$WHERE phone_number_id = p_phone_number_id
    ORDER BY (verified_at IS NULL), created_at, id LIMIT 1;$to$);

SELECT pg_temp.patch_function('public.admin_set_whatsapp_channel_verified(uuid,boolean,text)'::regprocedure,
$from$  v_channel public.whatsapp_channels;
BEGIN$from$,
$to$  v_channel public.whatsapp_channels;
  v_evicted INTEGER;
BEGIN$to$);

SELECT pg_temp.patch_function('public.admin_set_whatsapp_channel_verified(uuid,boolean,text)'::regprocedure,
$from$  PERFORM set_config('primora.audit_reason', btrim(p_reason), true);
  UPDATE public.whatsapp_channels$from$,
$to$  IF p_verified AND EXISTS (SELECT 1 FROM public.whatsapp_channels c
                             WHERE c.phone_number_id = v_channel.phone_number_id AND c.id <> v_channel.id AND c.verified_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Another business already holds this number verified; check ownership before changing it'
      USING ERRCODE = '23505', HINT = 'whatsapp_number_verified_elsewhere';
  END IF;
  PERFORM set_config('primora.audit_reason', btrim(p_reason), true);
  UPDATE public.whatsapp_channels$to$);

SELECT pg_temp.patch_function('public.admin_set_whatsapp_channel_verified(uuid,boolean,text)'::regprocedure,
$from$  PERFORM set_config('primora.audit_reason', '', true);
  PERFORM public.write_audit_log('whatsapp.channel_verification', 'whatsapp_channels', p_channel_id,
    jsonb_build_object('verified', p_verified, 'reason', btrim(p_reason)));$from$,
$to$  -- P-05: the verified owner evicts every unverified claim on the same number; their owners are told.
  IF p_verified THEN
    WITH evicted AS (
      UPDATE public.whatsapp_channels c SET enabled = FALSE, ai_enabled = FALSE, updated_at = now()
       WHERE c.phone_number_id = v_channel.phone_number_id AND c.id <> v_channel.id AND c.verified_at IS NULL
      RETURNING c.provider_id
    ), told AS (
      INSERT INTO public.notifications (user_id, title_en, title_ar, body_en, body_ar, type, data)
      SELECT p.owner_id, 'WhatsApp number confirmed for another business', 'تم تأكيد رقم واتساب لنشاط آخر',
             'The WhatsApp number you entered was confirmed as belonging to another business, so your WhatsApp channel was switched off. Enter your own business number to connect again.',
             'تم تأكيد أن رقم واتساب الذي أدخلته يعود لنشاط آخر، لذا أُوقفت قناة واتساب لديك. أدخل رقم نشاطك لإعادة الربط.',
             'system', jsonb_build_object('reason', 'whatsapp_number_verified_elsewhere')
        FROM evicted e JOIN public.providers p ON p.id = e.provider_id WHERE p.owner_id IS NOT NULL
      RETURNING 1
    ) SELECT count(*)::int INTO v_evicted FROM evicted;
  END IF;
  PERFORM set_config('primora.audit_reason', '', true);
  PERFORM public.write_audit_log('whatsapp.channel_verification', 'whatsapp_channels', p_channel_id,
    jsonb_build_object('verified', p_verified, 'reason', btrim(p_reason), 'unverified_claims_evicted', COALESCE(v_evicted, 0)));$to$);

INSERT INTO public.platform_settings (key, value, description, requires_owner_approval)
VALUES ('promo.reserved_codes',
        '{"prefixes": ["PRIMORA"], "codes": ["RAMADAN", "RAMADAN2026", "RAMADAN2027", "EID", "EID2026", "EID2027", "EIDALFITR", "EIDALADHA", "EIDMUBARAK", "NATIONALDAY", "SAUDINATIONALDAY", "FOUNDINGDAY", "SAUDI", "KSA", "WELCOME", "WELCOME10", "FIRSTVISIT", "BLACKFRIDAY", "WHITEFRIDAY", "NEWYEAR"]}'::jsonb,
        'Promo-code names providers cannot register (P-05 / RT-L1): platform campaign names and any code starting with a reserved prefix. Conservative starting list; the owner confirms and extends it.',
        TRUE)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.promo_code_reserved_for_platform(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (SELECT value FROM public.platform_settings WHERE key = 'promo.reserved_codes'),
       c AS (SELECT upper(btrim(COALESCE(p_code, ''))) AS code)
  SELECT EXISTS (SELECT 1 FROM s, c, jsonb_array_elements_text(COALESCE(s.value -> 'codes', '[]'::jsonb)) r WHERE upper(r) = c.code)
      OR EXISTS (SELECT 1 FROM s, c, jsonb_array_elements_text(COALESCE(s.value -> 'prefixes', '[]'::jsonb)) r
                  WHERE r <> '' AND left(c.code, char_length(r)) = upper(r));
$$;
REVOKE ALL ON FUNCTION public.promo_code_reserved_for_platform(TEXT) FROM PUBLIC, anon, authenticated;

SELECT pg_temp.patch_function('public.create_provider_promo_code(uuid,text,text,numeric,timestamp with time zone,integer,numeric,numeric)'::regprocedure,
$from$  IF p_discount_type NOT IN ('percentage', 'flat') THEN$from$,
$to$  IF public.promo_code_reserved_for_platform(v_code) THEN
    -- The same answer as for a taken code: it names nobody and reveals nothing about the platform's plans.
    RAISE EXCEPTION 'This code cannot be used. Choose another' USING ERRCODE = '23505';
  END IF;
  IF p_discount_type NOT IN ('percentage', 'flat') THEN$to$);
