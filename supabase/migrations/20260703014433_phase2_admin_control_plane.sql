-- Phase 2: admin-driven catalog (featured flags, status, add-ons), KSA payment
-- methods registry, and integrations registry. The admin dashboard becomes the
-- single source of truth for everything customer-facing.

-- ── 1. Categories: presentation fields ─────────────────────────────────────
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS icon TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- ── 2. Services: platform catalog + merchandising ──────────────────────────
-- Catalog items are admin-owned (provider_id NULL) until assigned to providers;
-- they are not directly bookable (create_booking joins through the provider).
ALTER TABLE public.services ALTER COLUMN provider_id DROP NOT NULL;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS slug VARCHAR(150) UNIQUE,
  ADD COLUMN IF NOT EXISTS images TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS add_ons JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'archived')),
  ADD COLUMN IF NOT EXISTS featured_on_landing BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS featured_in_services BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.services SET status = 'archived' WHERE is_active = FALSE AND status = 'active';

-- Keep the legacy is_active flag (used by RLS and older readers) derived from status.
CREATE OR REPLACE FUNCTION public.sync_service_status_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.is_active := (NEW.status = 'active');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_service_status_fields_before_write ON public.services;
CREATE TRIGGER sync_service_status_fields_before_write
BEFORE INSERT OR UPDATE ON public.services
FOR EACH ROW
EXECUTE FUNCTION public.sync_service_status_fields();

-- Admins manage the whole catalog (incl. admin-owned rows with provider_id NULL).
DROP POLICY IF EXISTS "Admins manage services" ON public.services;
CREATE POLICY "Admins manage services"
ON public.services
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_services_featured_landing
  ON public.services (sort_order) WHERE featured_on_landing = TRUE AND status = 'active';

-- ── 3. Payment methods registry (KSA market) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  label_en TEXT NOT NULL,
  label_ar TEXT NOT NULL,
  gateway_key TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  enabled_for_roles TEXT[] NOT NULL DEFAULT '{customer}',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  env TEXT NOT NULL DEFAULT 'test' CHECK (env IN ('test', 'live')),
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read enabled payment methods"
ON public.payment_methods
FOR SELECT
TO anon, authenticated
USING (enabled = TRUE);

CREATE POLICY "Admins manage payment methods"
ON public.payment_methods
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

INSERT INTO public.payment_methods (key, label_en, label_ar, gateway_key, enabled, enabled_for_roles, is_default, sort_order) VALUES
  ('mada',       'mada',           'مدى',             'tap',      TRUE,  '{customer}',          TRUE,  1),
  ('apple_pay',  'Apple Pay',      'أبل باي',         'tap',      TRUE,  '{customer}',          FALSE, 2),
  ('visa',       'Visa',           'فيزا',            'tap',      TRUE,  '{customer}',          FALSE, 3),
  ('mastercard', 'Mastercard',     'ماستركارد',       'tap',      TRUE,  '{customer}',          FALSE, 4),
  ('stc_pay',    'STC Pay',        'إس تي سي باي',    'tap',      TRUE,  '{customer}',          FALSE, 5),
  ('tamara',     'Tamara (BNPL)',  'تمارا (قسّطها)',  'tamara',   FALSE, '{customer}',          FALSE, 6),
  ('tabby',      'Tabby (BNPL)',   'تابي (قسّطها)',   'tabby',    FALSE, '{customer}',          FALSE, 7),
  ('wallet',     'Wallet balance', 'رصيد المحفظة',    'internal', TRUE,  '{customer,provider}', FALSE, 8),
  ('bank_transfer', 'Bank transfer (payout)', 'تحويل بنكي (مستحقات)', 'internal', TRUE, '{provider}', TRUE, 9),
  ('cash',       'Cash on service','نقداً عند الخدمة','internal', TRUE,  '{customer}',          FALSE, 10)
ON CONFLICT (key) DO NOTHING;

-- ── 4. Integrations registry ────────────────────────────────────────────────
-- key_masked is a display-only masked hint; real secrets stay in server-side
-- env (edge function secrets) and are never written here.
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  env TEXT NOT NULL DEFAULT 'test' CHECK (env IN ('test', 'live')),
  key_masked TEXT,
  webhook_url TEXT,
  last_checked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage integrations"
ON public.integrations
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.integration_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  change TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read integration audit log"
ON public.integration_audit_log
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins write integration audit log"
ON public.integration_audit_log
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

INSERT INTO public.integrations (key, name, category, status, enabled, env, key_masked, webhook_url) VALUES
  ('tap',        'Tap Payments',          'payments',  'connected',    TRUE,  'test', 'sk_test_••••••••4Kx2', '/functions/v1/payment-webhook'),
  ('moyasar',    'Moyasar',               'payments',  'disconnected', FALSE, 'test', NULL, NULL),
  ('google_maps','Google Maps Platform',  'maps',      'disconnected', FALSE, 'test', NULL, NULL),
  ('unifonic',   'Unifonic SMS/OTP',      'sms',       'disconnected', FALSE, 'test', NULL, NULL),
  ('twilio',     'Twilio WhatsApp/SMS',   'sms',       'disconnected', FALSE, 'test', NULL, NULL),
  ('expo_push',  'Expo Push',             'push',      'connected',    TRUE,  'live', 'ExpoPush••••••7hQ', '/functions/v1/send-push'),
  ('resend',     'Resend Email',          'email',     'disconnected', FALSE, 'test', NULL, NULL),
  ('whatsapp',   'WhatsApp Business',     'whatsapp',  'disconnected', FALSE, 'test', NULL, NULL),
  ('gcal',       'Google Calendar Sync',  'calendar',  'disconnected', FALSE, 'test', NULL, NULL),
  ('analytics',  'Product Analytics',     'analytics', 'disconnected', FALSE, 'test', NULL, NULL),
  ('anthropic',  'Anthropic Claude (AI Concierge)', 'ai', 'disconnected', FALSE, 'test', NULL, NULL)
ON CONFLICT (key) DO NOTHING;

-- ── 5. Catalog seeds: §3 categories + sample services (admin-editable) ─────
INSERT INTO public.categories (name_en, name_ar, slug, icon, sort_order) VALUES
  ('Barber & Hair',       'الحلاقة والشعر',      'barber-hair',        'scissors', 1),
  ('Beard & Shave',       'اللحية والحلاقة',     'beard-shave',        'razor',    2),
  ('Skincare & Facials',  'العناية بالبشرة',     'skincare-facials',   'sparkles', 3),
  ('Spa & Wellness',      'السبا والعافية',      'spa-wellness',       'lotus',    4),
  ('Nails & Hands',       'الأظافر واليدين',     'nails-hands',        'hand',     5),
  ('Signature Packages',  'الباقات المميزة',     'signature-packages', 'crown',    6)
ON CONFLICT (slug) DO NOTHING;

WITH cat AS (SELECT id, slug FROM public.categories)
INSERT INTO public.services
  (category_id, slug, name_en, name_ar, description_en, description_ar,
   base_price, base_duration_minutes, is_home_service_eligible, status,
   featured_on_landing, featured_in_services, sort_order, tags, add_ons)
SELECT c.id, s.slug, s.name_en, s.name_ar, s.description_en, s.description_ar,
       s.price, s.duration, s.home, 'active', s.feat_landing, s.feat_services, s.ord,
       s.tags, s.add_ons::jsonb
FROM (VALUES
  ('barber-hair', 'classic-haircut',  'Classic Haircut', 'قصة شعر كلاسيكية', 'Precision cut with consultation and finish styling.', 'قصة دقيقة مع استشارة وتصفيف نهائي.', 45.00, 40, TRUE,  TRUE,  TRUE,  1, '{haircut,classic}'::text[], '[{"key":"hair-wash","label_en":"+ Hair wash","label_ar":"+ غسيل الشعر","priceSAR":15},{"key":"styling","label_en":"+ Styling","label_ar":"+ تصفيف","priceSAR":20}]'),
  ('barber-hair', 'skin-fade',        'Skin Fade', 'قصة فيد', 'Sharp zero fade blended to your length on top.', 'تدريج حاد يبدأ من الصفر مع دمج احترافي.', 55.00, 45, TRUE,  TRUE,  TRUE,  2, '{haircut,fade}'::text[], '[{"key":"beard-lineup","label_en":"+ Beard line-up","label_ar":"+ تحديد اللحية","priceSAR":15}]'),
  ('barber-hair', 'kids-cut',         'Kids Cut', 'قصة أطفال', 'Gentle, patient cuts for the young gentlemen.', 'قصات لطيفة وصبورة لصغار السادة.', 35.00, 30, TRUE,  FALSE, FALSE, 3, '{haircut,kids}'::text[], '[]'),
  ('barber-hair', 'hair-coloring',    'Hair Coloring', 'صبغ الشعر', 'Full color or camouflage greys with premium dyes.', 'صبغة كاملة أو تمويه الشيب بأصباغ فاخرة.', 90.00, 60, FALSE, FALSE, TRUE,  4, '{color}'::text[], '[]'),
  ('barber-hair', 'scalp-therapy',    'Scalp Therapy', 'علاج فروة الرأس', 'Detox scalp treatment with massage and steam.', 'علاج منقٍ لفروة الرأس مع مساج وبخار.', 55.00, 35, FALSE, FALSE, FALSE, 5, '{treatment}'::text[], '[]'),
  ('beard-shave', 'beard-sculpt',     'Beard Sculpt', 'نحت اللحية', 'Shape and line-up with hot towel finish.', 'تشكيل وتحديد مع لمسة المنشفة الساخنة.', 30.00, 25, TRUE,  FALSE, TRUE,  1, '{beard}'::text[], '[{"key":"beard-oil","label_en":"+ Beard oil ritual","label_ar":"+ عناية بزيت اللحية","priceSAR":10}]'),
  ('beard-shave', 'hot-towel-shave',  'Hot Towel Shave', 'حلاقة بالمنشفة الساخنة', 'Classic straight-razor shave, hot towels and balm.', 'حلاقة كلاسيكية بالموس مع مناشف ساخنة وبلسم.', 40.00, 30, TRUE,  FALSE, FALSE, 2, '{shave}'::text[], '[]'),
  ('beard-shave', 'beard-color',      'Beard Color', 'صبغ اللحية', 'Natural-look beard coloring, ammonia-free.', 'صبغ لحية بمظهر طبيعي خالٍ من الأمونيا.', 45.00, 30, FALSE, FALSE, FALSE, 3, '{beard,color}'::text[], '[]'),
  ('beard-shave', 'royal-shave-ritual','Royal Shave Ritual', 'طقس الحلاقة الملكي', 'Our signature 5-step shave with facial massage.', 'طقسنا المميز من خمس خطوات مع مساج للوجه.', 70.00, 50, FALSE, TRUE,  TRUE,  4, '{shave,signature}'::text[], '[]'),
  ('skincare-facials', 'express-facial', 'Express Facial', 'فيشل سريع', '30-minute glow-up cleanse and hydration.', 'تنظيف وترطيب لإشراقة سريعة خلال ٣٠ دقيقة.', 80.00, 30, TRUE,  FALSE, FALSE, 1, '{facial}'::text[], '[]'),
  ('skincare-facials', 'deep-cleanse',   'Deep Cleanse', 'تنظيف عميق', 'Deep-pore cleansing facial with extraction.', 'تنظيف عميق للمسام مع إزالة الشوائب.', 120.00, 60, FALSE, FALSE, TRUE,  2, '{facial}'::text[], '[]'),
  ('skincare-facials', 'anti-fatigue',   'Anti-fatigue Treatment', 'علاج مضاد للإجهاد', 'Revitalizing treatment for tired skin.', 'علاج منشّط للبشرة المجهدة.', 140.00, 60, FALSE, FALSE, FALSE, 3, '{treatment}'::text[], '[]'),
  ('spa-wellness', 'moroccan-bath',      'Moroccan Bath', 'حمام مغربي', 'Traditional hammam with black soap and kessa.', 'حمام تقليدي بالصابون المغربي والكيس.', 90.00, 60, FALSE, TRUE,  TRUE,  1, '{spa,signature}'::text[], '[]'),
  ('spa-wellness', 'aromatherapy-massage','Aromatherapy Massage', 'مساج بالزيوت العطرية', 'Full-body relaxation with essential oil blends.', 'استرخاء كامل للجسم بخلطات الزيوت العطرية.', 160.00, 60, TRUE,  FALSE, FALSE, 2, '{massage}'::text[], '[]'),
  ('spa-wellness', 'recovery-massage',   'Recovery Massage', 'مساج استشفائي', 'Deep-tissue recovery for active lifestyles.', 'مساج عميق للاستشفاء العضلي.', 180.00, 75, TRUE,  FALSE, FALSE, 3, '{massage,sport}'::text[], '[]'),
  ('nails-hands', 'manicure',  'Manicure', 'مانيكير', 'Clean, shape and finish for hands and nails.', 'تنظيف وتشكيل وعناية كاملة لليدين والأظافر.', 60.00, 40, TRUE,  FALSE, FALSE, 1, '{nails}'::text[], '[]'),
  ('nails-hands', 'pedicure',  'Pedicure', 'باديكير', 'Full pedicure with exfoliation and massage.', 'باديكير كامل مع تقشير ومساج.', 70.00, 50, TRUE,  FALSE, FALSE, 2, '{nails}'::text[], '[]'),
  ('nails-hands', 'hand-spa',  'Hand Spa', 'سبا اليدين', 'Paraffin hand spa with cuticle care.', 'سبا بارافين لليدين مع عناية بالجليدة.', 50.00, 30, TRUE,  FALSE, FALSE, 3, '{nails,spa}'::text[], '[]'),
  ('signature-packages', 'grooms-prep',       'Groom''s Prep', 'تجهيز العريس', 'Complete pre-wedding grooming: cut, shave, facial, hands.', 'تجهيز متكامل قبل الزفاف: قصة، حلاقة، فيشل، وعناية باليدين.', 350.00, 180, FALSE, TRUE,  TRUE,  1, '{package,wedding}'::text[], '[]'),
  ('signature-packages', 'executive-refresh', 'Executive Refresh', 'انتعاشة المدير', 'Cut, beard sculpt and express facial in one sitting.', 'قصة ونحت لحية وفيشل سريع في جلسة واحدة.', 220.00, 100, FALSE, FALSE, TRUE,  2, '{package}'::text[], '[]'),
  ('signature-packages', 'full-reset',        'Full Reset', 'استعادة كاملة', 'The complete PRIMORA experience, head to toe.', 'تجربة بريمورا الكاملة من الرأس إلى القدمين.', 480.00, 240, FALSE, FALSE, TRUE,  3, '{package,signature}'::text[], '[]')
) AS s(cat_slug, slug, name_en, name_ar, description_en, description_ar, price, duration, home, feat_landing, feat_services, ord, tags, add_ons)
JOIN cat c ON c.slug = s.cat_slug
ON CONFLICT (slug) DO NOTHING;
