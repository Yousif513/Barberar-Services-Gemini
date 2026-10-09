-- P-09 (privacy review 2026-10-08): platform_settings had a SELECT policy USING (true) for visitors, so every key was public and a future key holding
-- anything sensitive would have been public by default. A row is now readable by visitors and signed-in users only when is_public is true; the
-- column defaults to false, so a new key is private until someone decides otherwise. Administrators read every row. Functions that read settings
-- are SECURITY DEFINER and are not affected.
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

-- The keys the apps already read directly or that are shown to users anyway (loyalty tiers, limits shown at checkout, hold time, the developer
-- screen's documented API limits, the WhatsApp session window shown to providers, the public app URL used in links).
UPDATE public.platform_settings SET is_public = TRUE WHERE key IN (
  'loyalty_program', 'referral_program', 'booking_hold_minutes', 'tip_limits', 'gift_card_limits', 'minimum_online_deposit_percentage',
  'public_app_url', 'whatsapp.session_window_hours',
  'api.max_key_lifetime_days', 'api.max_requests_per_minute', 'api.webhook_disable_after_failures', 'api.webhook_max_attempts', 'api.webhook_retry_base_seconds'
);

DROP POLICY IF EXISTS "Anyone reads platform settings" ON public.platform_settings;
DROP POLICY IF EXISTS "Public reads public platform settings" ON public.platform_settings;
CREATE POLICY "Public reads public platform settings" ON public.platform_settings
  FOR SELECT TO anon, authenticated
  USING (is_public);
DROP POLICY IF EXISTS "Admins read all platform settings" ON public.platform_settings;
CREATE POLICY "Admins read all platform settings" ON public.platform_settings
  FOR SELECT TO authenticated
  USING (public.is_admin());
