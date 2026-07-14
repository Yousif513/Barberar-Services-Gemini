-- Link payment rails to connected payment API integrations.
-- Checkout should only expose methods whose selected gateway is connected,
-- enabled, in the same environment, and declares support for that method.

ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS supported_payment_method_keys TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS requires_gateway BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS gateway_priority TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

UPDATE public.payment_methods
SET requires_gateway = FALSE
WHERE gateway_key IS NULL OR gateway_key = 'internal';

INSERT INTO public.integrations
  (key, name, category, status, enabled, env, key_masked, webhook_url, base_url, platform_area, description, supported_payment_method_keys)
VALUES
  ('paytabs', 'PayTabs', 'payments', 'disconnected', FALSE, 'test', NULL, NULL, 'https://secure.paytabs.sa/payment', 'customer_provider', 'Payment gateway supporting cards, Mada, Apple Pay, and STC Pay.', '{mada,apple_pay,visa,mastercard,stc_pay}'),
  ('myfatoorah', 'MyFatoorah', 'payments', 'disconnected', FALSE, 'test', NULL, NULL, 'https://api.myfatoorah.com', 'customer_provider', 'Payment gateway supporting cards, Mada, Apple Pay, and STC Pay.', '{mada,apple_pay,visa,mastercard,stc_pay}'),
  ('tamara', 'Tamara', 'payments', 'disconnected', FALSE, 'test', NULL, NULL, 'https://api.tamara.co', 'customer_provider', 'Buy-now-pay-later payment provider.', '{tamara}'),
  ('tabby', 'Tabby', 'payments', 'disconnected', FALSE, 'test', NULL, NULL, 'https://api.tabby.ai', 'customer_provider', 'Buy-now-pay-later payment provider.', '{tabby}')
ON CONFLICT (key) DO UPDATE
SET
  category = EXCLUDED.category,
  base_url = COALESCE(public.integrations.base_url, EXCLUDED.base_url),
  platform_area = COALESCE(public.integrations.platform_area, EXCLUDED.platform_area),
  description = COALESCE(public.integrations.description, EXCLUDED.description),
  supported_payment_method_keys = CASE
    WHEN public.integrations.supported_payment_method_keys = '{}' THEN EXCLUDED.supported_payment_method_keys
    ELSE public.integrations.supported_payment_method_keys
  END;

UPDATE public.integrations
SET supported_payment_method_keys = CASE key
  WHEN 'tap' THEN '{mada,apple_pay,visa,mastercard,stc_pay}'::TEXT[]
  WHEN 'moyasar' THEN '{mada,apple_pay,visa,mastercard,stc_pay}'::TEXT[]
  WHEN 'paytabs' THEN '{mada,apple_pay,visa,mastercard,stc_pay}'::TEXT[]
  WHEN 'myfatoorah' THEN '{mada,apple_pay,visa,mastercard,stc_pay}'::TEXT[]
  WHEN 'tamara' THEN '{tamara}'::TEXT[]
  WHEN 'tabby' THEN '{tabby}'::TEXT[]
  ELSE supported_payment_method_keys
END
WHERE category = 'payments';

UPDATE public.payment_methods
SET gateway_priority = CASE key
  WHEN 'mada' THEN '{tap,moyasar,paytabs,myfatoorah}'::TEXT[]
  WHEN 'apple_pay' THEN '{tap,moyasar,paytabs,myfatoorah}'::TEXT[]
  WHEN 'visa' THEN '{tap,moyasar,paytabs,myfatoorah}'::TEXT[]
  WHEN 'mastercard' THEN '{tap,moyasar,paytabs,myfatoorah}'::TEXT[]
  WHEN 'stc_pay' THEN '{tap,moyasar,paytabs,myfatoorah}'::TEXT[]
  WHEN 'tamara' THEN '{tamara}'::TEXT[]
  WHEN 'tabby' THEN '{tabby}'::TEXT[]
  ELSE gateway_priority
END,
admin_note = COALESCE(admin_note, 'Availability is controlled by the linked payment API integration.')
WHERE requires_gateway = TRUE;

CREATE OR REPLACE VIEW public.accepted_payment_methods AS
SELECT
  pm.id,
  pm.key,
  pm.label_en,
  pm.label_ar,
  pm.gateway_key,
  pm.enabled,
  pm.enabled_for_roles,
  pm.is_default,
  pm.env,
  pm.sort_order,
  pm.requires_gateway,
  i.name AS gateway_name,
  i.status AS gateway_status,
  i.enabled AS gateway_enabled,
  i.env AS gateway_env
FROM public.payment_methods pm
LEFT JOIN public.integrations i ON i.key = pm.gateway_key
WHERE
  pm.enabled = TRUE
  AND 'customer' = ANY(pm.enabled_for_roles)
  AND (
    pm.requires_gateway = FALSE
    OR pm.gateway_key = 'internal'
    OR (
      i.category = 'payments'
      AND i.enabled = TRUE
      AND i.status = 'connected'
      AND i.env = pm.env
      AND pm.key = ANY(i.supported_payment_method_keys)
    )
  );

REVOKE ALL ON TABLE public.accepted_payment_methods FROM PUBLIC;
GRANT SELECT ON TABLE public.accepted_payment_methods TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payment_methods TO authenticated, service_role;
