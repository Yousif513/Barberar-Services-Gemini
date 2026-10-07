-- Migration: 20261007150800_platform_setting_constants.sql
-- FIX-DBB / C-D30 and D-03: business constants and the public base URL move out of function bodies into platform_settings.
--   no_show_strike_policy {"strikes": 3, "window_days": 60}      read by check_customer_booking_eligibility
--   gift_card_limits      {"min_sar": 50, "max_sar": 5000, "valid_days": 365}   read by purchase_gift_card
--   tip_limits            {"min_sar": 5, "max_sar": 1000}        read by add_booking_tip
--   public_app_url        a string "https://..." or null (unset)  read by booking_message_variables
-- The first three are seeded with the values the functions already enforced, so behaviour does not change, and are flagged
-- requires_owner_approval: the owner confirms or edits them in the console (admin_update_platform_setting stamps the approval).
-- If a key is missing or incomplete the function does NOT fall back to a number: strikes are not counted, gift cards and tips are refused as
-- "not configured". public_app_url is UNSET (null) until the owner sets it: message links are then null (no link) instead of a hard-coded domain.
-- Not changed here, only reported: the VAT rate inside booking_create_internal (FIX-BOOKING owns it), the wallet value points / 10 in
-- customer/wallet/page.tsx, claim_url / share_url in the waitlist and referral functions (still https://primora.sa/...).

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

INSERT INTO public.platform_settings (key, value, description, requires_owner_approval) VALUES
  ('no_show_strike_policy', '{"strikes": 3, "window_days": 60}'::jsonb,
   'Number of no-shows inside the window that force full prepayment for a customer. Moved from the function body; the owner confirms the values.', TRUE),
  ('gift_card_limits', '{"min_sar": 50, "max_sar": 5000, "valid_days": 365}'::jsonb,
   'Gift card amount limits (SAR) and validity in days. Moved from the function body; the owner confirms the values.', TRUE),
  ('tip_limits', '{"min_sar": 5, "max_sar": 1000}'::jsonb,
   'Smallest and largest tip (SAR). Moved from the function body; the owner confirms the values.', TRUE),
  ('public_app_url', 'null'::jsonb,
   'Public base URL of the customer app (https://host, no trailing slash) used in message links. Unset until the owner enters it: messages then carry no link.', TRUE)
ON CONFLICT (key) DO NOTHING;

-- A number inside a setting, or NULL when the setting, the field or its type is missing (platform_settings is readable by everyone, so no
-- elevated rights are needed).
CREATE OR REPLACE FUNCTION public.setting_number(p_key TEXT, p_field TEXT)
RETURNS NUMERIC LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN jsonb_typeof(value -> p_field) = 'number' THEN (value ->> p_field)::numeric END
  FROM public.platform_settings WHERE key = p_key;
$$;
REVOKE ALL ON FUNCTION public.setting_number(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.setting_number(TEXT, TEXT) TO authenticated, service_role;

-- The console command learns the four keys.
SELECT pg_temp.patch_function('public.admin_update_platform_setting(text, jsonb, text)'::regprocedure,
  $q$  ELSIF p_key = 'referral_program' THEN$q$,
  $q$  ELSIF p_key = 'no_show_strike_policy' THEN
    IF jsonb_typeof(p_value -> 'strikes') IS DISTINCT FROM 'number' OR jsonb_typeof(p_value -> 'window_days') IS DISTINCT FROM 'number'
       OR (p_value ->> 'strikes')::numeric < 1 OR (p_value ->> 'strikes')::numeric <> trunc((p_value ->> 'strikes')::numeric)
       OR (p_value ->> 'window_days')::numeric < 1 OR (p_value ->> 'window_days')::numeric > 3650
       OR (p_value ->> 'window_days')::numeric <> trunc((p_value ->> 'window_days')::numeric) THEN
      RAISE EXCEPTION 'The strike policy needs a whole number of strikes (1 or more) and a window of 1 to 3650 days' USING ERRCODE = '22023';
    END IF;
    p_value := jsonb_build_object('strikes', p_value -> 'strikes', 'window_days', p_value -> 'window_days');
  ELSIF p_key = 'gift_card_limits' THEN
    IF jsonb_typeof(p_value -> 'min_sar') IS DISTINCT FROM 'number' OR jsonb_typeof(p_value -> 'max_sar') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_value -> 'valid_days') IS DISTINCT FROM 'number'
       OR (p_value ->> 'min_sar')::numeric <= 0 OR (p_value ->> 'max_sar')::numeric < (p_value ->> 'min_sar')::numeric
       OR (p_value ->> 'valid_days')::numeric < 1 OR (p_value ->> 'valid_days')::numeric > 3650
       OR (p_value ->> 'valid_days')::numeric <> trunc((p_value ->> 'valid_days')::numeric) THEN
      RAISE EXCEPTION 'Gift card limits need min_sar above 0, max_sar not below min_sar and valid_days of 1 to 3650' USING ERRCODE = '22023';
    END IF;
    p_value := jsonb_build_object('min_sar', p_value -> 'min_sar', 'max_sar', p_value -> 'max_sar', 'valid_days', p_value -> 'valid_days');
  ELSIF p_key = 'tip_limits' THEN
    IF jsonb_typeof(p_value -> 'min_sar') IS DISTINCT FROM 'number' OR jsonb_typeof(p_value -> 'max_sar') IS DISTINCT FROM 'number'
       OR (p_value ->> 'min_sar')::numeric <= 0 OR (p_value ->> 'max_sar')::numeric < (p_value ->> 'min_sar')::numeric THEN
      RAISE EXCEPTION 'Tip limits need min_sar above 0 and max_sar not below min_sar' USING ERRCODE = '22023';
    END IF;
    p_value := jsonb_build_object('min_sar', p_value -> 'min_sar', 'max_sar', p_value -> 'max_sar');
  ELSIF p_key = 'public_app_url' THEN
    IF jsonb_typeof(p_value) NOT IN ('string', 'null')
       OR (jsonb_typeof(p_value) = 'string' AND (p_value #>> '{}') !~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{2,5})?(/[A-Za-z0-9._~/-]*)?$') THEN
      RAISE EXCEPTION 'The public URL must be https://host (optionally with a path, no query) or null to remove it' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_value) = 'string' THEN p_value := to_jsonb(rtrim(p_value #>> '{}', '/')); END IF;
  ELSIF p_key = 'referral_program' THEN$q$);

-- Strike policy
SELECT pg_temp.patch_function('public.check_customer_booking_eligibility(uuid, uuid)'::regprocedure,
  $q$  v_strikes INT := 0;$q$,
  $q$  v_strikes INT := 0;
  v_threshold INT := public.setting_number('no_show_strike_policy', 'strikes')::int;
  v_window INT := public.setting_number('no_show_strike_policy', 'window_days')::int;$q$);
SELECT pg_temp.patch_function('public.check_customer_booking_eligibility(uuid, uuid)'::regprocedure,
  $q$    AND no_show_at >= now() - interval '60 days'$q$,
  $q$    AND no_show_at >= now() - make_interval(days => v_window)$q$);
SELECT pg_temp.patch_function('public.check_customer_booking_eligibility(uuid, uuid)'::regprocedure,
  $q$'requires_full_prepayment', v_strikes >= 3$q$,
  $q$'requires_full_prepayment', (v_threshold IS NOT NULL AND v_strikes >= v_threshold)$q$);

-- Tip bounds
SELECT pg_temp.patch_function('public.add_booking_tip(uuid, numeric, text)'::regprocedure,
  $q$  IF p_amount IS NULL OR p_amount < 5 OR p_amount > 1000 THEN
    RAISE EXCEPTION 'Tip amount must be between 5 and 1000 SAR' USING ERRCODE = '22023';$q$,
  $q$  IF public.setting_number('tip_limits', 'min_sar') IS NULL OR public.setting_number('tip_limits', 'max_sar') IS NULL THEN
    RAISE EXCEPTION 'Tips are not configured yet' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount < public.setting_number('tip_limits', 'min_sar') OR p_amount > public.setting_number('tip_limits', 'max_sar') THEN
    RAISE EXCEPTION 'Tip amount must be between % and % SAR', public.setting_number('tip_limits', 'min_sar'),
      public.setting_number('tip_limits', 'max_sar') USING ERRCODE = '22023';$q$);

-- Gift card bounds and validity
SELECT pg_temp.patch_function('public.purchase_gift_card(text, text, text, numeric, text)'::regprocedure,
  $q$  IF p_amount IS NULL OR p_amount < 50 OR p_amount > 5000 THEN
    RAISE EXCEPTION 'Gift card amount must be between 50 and 5000 SAR' USING ERRCODE = '22023';$q$,
  $q$  IF public.setting_number('gift_card_limits', 'min_sar') IS NULL OR public.setting_number('gift_card_limits', 'max_sar') IS NULL
     OR public.setting_number('gift_card_limits', 'valid_days') IS NULL THEN
    RAISE EXCEPTION 'Gift cards are not configured yet' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount < public.setting_number('gift_card_limits', 'min_sar') OR p_amount > public.setting_number('gift_card_limits', 'max_sar') THEN
    RAISE EXCEPTION 'Gift card amount must be between % and % SAR', public.setting_number('gift_card_limits', 'min_sar'),
      public.setting_number('gift_card_limits', 'max_sar') USING ERRCODE = '22023';$q$);
SELECT pg_temp.patch_function('public.purchase_gift_card(text, text, text, numeric, text)'::regprocedure,
  $q$now() + interval '365 days'$q$,
  $q$now() + make_interval(days => public.setting_number('gift_card_limits', 'valid_days')::int)$q$);

-- Message links: the base comes from public_app_url; unset gives null (no link). Paths follow the screens that exist.
SELECT pg_temp.patch_function('public.booking_message_variables(uuid, text)'::regprocedure,
  $q$  JOIN public.services s ON s.id = b.service_id$q$,
  $q$  JOIN public.services s ON s.id = b.service_id
  LEFT JOIN (SELECT CASE WHEN jsonb_typeof(value) = 'string' THEN rtrim(value #>> '{}', '/') END AS base
             FROM public.platform_settings WHERE key = 'public_app_url') u ON TRUE$q$);

SELECT pg_temp.patch_function('public.booking_message_variables(uuid, text)'::regprocedure,
  $q$    'action_url', 'https://primora.sa/customer/bookings/' || b.id::text,
    'dashboard_url', 'https://primora.sa/provider/bookings',
    'review_url', 'https://primora.sa/customer/reviews?booking=' || b.id::text,
    'rebook_url', 'https://primora.sa/shop/' || p.id::text || '?source=whatsapp'$q$,
  $q$    'action_url', u.base || '/customer/bookings?booking=' || b.id::text,
    'confirm_url', u.base || '/customer/bookings?booking=' || b.id::text || '&action=confirm_attendance',
    'dashboard_url', u.base || '/provider/bookings',
    'review_url', u.base || '/customer/reviews?booking=' || b.id::text,
    'rebook_url', u.base || '/shop/' || p.id::text || '?source=whatsapp'$q$);
DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
