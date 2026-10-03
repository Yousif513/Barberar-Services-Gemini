-- ============================================================================
-- PRIMORA P1-A MIGRATION: PLATFORM HYGIENE & DATA INTEGRITY (G31, G32)
-- 1. public.notifications (In-app notifications for users)
-- 2. public.expo_push_tokens (Multi-device push notification tokens)
-- 3. public.provider_customer_notes (Salon CRM internal notes per customer)
-- 4. public.provider_promos (Provider custom campaigns and discount codes)
-- ============================================================================

-- 1. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title_en TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  body_en TEXT NOT NULL,
  body_ar TEXT NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'booking',
  data JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notification read status" ON public.notifications;
CREATE POLICY "Users can update own notification read status"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins and service role manage notifications" ON public.notifications;
CREATE POLICY "Admins and service role manage notifications"
  ON public.notifications
  FOR ALL
  TO authenticated
  USING (
    COALESCE(auth.jwt()->>'role', '') = 'service_role' OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- 2. EXPO PUSH TOKENS TABLE (Multi-device support)
CREATE TABLE IF NOT EXISTS public.expo_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  device_platform VARCHAR(20) DEFAULT 'mobile',
  device_name VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expo_push_tokens_user ON public.expo_push_tokens (user_id);

ALTER TABLE public.expo_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own push tokens" ON public.expo_push_tokens;
CREATE POLICY "Users manage own push tokens"
  ON public.expo_push_tokens
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role reads push tokens" ON public.expo_push_tokens;
CREATE POLICY "Service role reads push tokens"
  ON public.expo_push_tokens
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(auth.jwt()->>'role', '') = 'service_role' OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- 3. PROVIDER CUSTOMER NOTES (Salon CRM Internal Notes)
CREATE TABLE IF NOT EXISTS public.provider_customer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_provider_customer_notes UNIQUE (provider_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_cust_notes ON public.provider_customer_notes (provider_id, customer_id);

ALTER TABLE public.provider_customer_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers manage own customer notes" ON public.provider_customer_notes;
CREATE POLICY "Providers manage own customer notes"
  ON public.provider_customer_notes
  FOR ALL
  TO authenticated
  USING (
    COALESCE(auth.jwt()->>'role', '') = 'service_role' OR
    EXISTS (SELECT 1 FROM public.providers WHERE id = provider_customer_notes.provider_id AND owner_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    COALESCE(auth.jwt()->>'role', '') = 'service_role' OR
    EXISTS (SELECT 1 FROM public.providers WHERE id = provider_customer_notes.provider_id AND owner_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- 4. PROVIDER PROMOS (Provider Custom Discount Codes & Campaigns)
CREATE TABLE IF NOT EXISTS public.provider_promos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  promo_code VARCHAR(50) NOT NULL,
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
  expires_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'disabled')),
  target_segment VARCHAR(50) DEFAULT 'all',
  usage_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_provider_promos UNIQUE (provider_id, promo_code)
);

CREATE INDEX IF NOT EXISTS idx_provider_promos_code ON public.provider_promos (provider_id, promo_code, status);

ALTER TABLE public.provider_promos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers manage own promos" ON public.provider_promos;
CREATE POLICY "Providers manage own promos"
  ON public.provider_promos
  FOR ALL
  TO authenticated
  USING (
    COALESCE(auth.jwt()->>'role', '') = 'service_role' OR
    EXISTS (SELECT 1 FROM public.providers WHERE id = provider_promos.provider_id AND owner_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    COALESCE(auth.jwt()->>'role', '') = 'service_role' OR
    EXISTS (SELECT 1 FROM public.providers WHERE id = provider_promos.provider_id AND owner_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Public can check active promos" ON public.provider_promos;
CREATE POLICY "Public can check active promos"
  ON public.provider_promos
  FOR SELECT
  TO authenticated, anon
  USING (status = 'active' AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP));
