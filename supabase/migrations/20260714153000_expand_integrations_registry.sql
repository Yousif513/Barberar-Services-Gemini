-- Expand the admin integrations registry into a dynamic API management surface.
-- API keys are restricted by admin RLS; production integrations should still
-- move operational secrets into Edge Function / server environment variables.

ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS base_url TEXT,
  ADD COLUMN IF NOT EXISTS api_key TEXT,
  ADD COLUMN IF NOT EXISTS platform_area TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN public.integrations.api_key IS
  'Admin-managed integration key. Do not expose this column to anon clients; prefer server-side secrets for production execution.';

CREATE OR REPLACE FUNCTION public.touch_integrations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_integrations_updated_at_before_write ON public.integrations;
CREATE TRIGGER touch_integrations_updated_at_before_write
BEFORE INSERT OR UPDATE ON public.integrations
FOR EACH ROW
EXECUTE FUNCTION public.touch_integrations_updated_at();

UPDATE public.integrations
SET
  platform_area = CASE
    WHEN category IN ('payments', 'maps', 'calendar') THEN 'customer_provider'
    WHEN category IN ('sms', 'push', 'email', 'whatsapp') THEN 'notifications'
    WHEN category = 'analytics' THEN 'admin'
    WHEN category = 'ai' THEN 'all'
    ELSE platform_area
  END,
  base_url = CASE key
    WHEN 'tap' THEN 'https://api.tap.company'
    WHEN 'moyasar' THEN 'https://api.moyasar.com'
    WHEN 'google_maps' THEN 'https://maps.googleapis.com'
    WHEN 'unifonic' THEN 'https://api.unifonic.com'
    WHEN 'twilio' THEN 'https://api.twilio.com'
    WHEN 'resend' THEN 'https://api.resend.com'
    ELSE base_url
  END,
  description = COALESCE(description, 'Managed from Admin API & Integrations.')
WHERE base_url IS NULL OR description IS NULL;

REVOKE ALL ON TABLE public.integrations FROM anon;
REVOKE ALL ON TABLE public.integration_audit_log FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.integrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.integrations TO service_role;
GRANT SELECT, INSERT ON TABLE public.integration_audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.integration_audit_log TO service_role;
