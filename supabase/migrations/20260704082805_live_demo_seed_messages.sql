-- Live demo seed + messaging foundation.
-- Idempotent and intentionally avoids bookings / transactional_ledger rows.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS work_type TEXT NOT NULL DEFAULT 'in_shop'
    CHECK (work_type IN ('remote', 'in_shop', 'both'));

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS reply_comment TEXT,
  ADD COLUMN IF NOT EXISTS reply_created_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  subject TEXT,
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unread_for_customer BOOLEAN NOT NULL DEFAULT FALSE,
  unread_for_provider BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, provider_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'provider', 'system')),
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_customer_last
  ON public.conversations (customer_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_provider_last
  ON public.conversations (provider_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages (conversation_id, created_at ASC);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;

DROP POLICY IF EXISTS "Participants read conversations" ON public.conversations;
CREATE POLICY "Participants read conversations"
ON public.conversations
FOR SELECT
TO authenticated
USING (
  customer_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.providers p
    WHERE p.id = conversations.provider_id
      AND p.owner_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.branches b ON b.id = e.branch_id
    WHERE b.provider_id = conversations.provider_id
      AND e.profile_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Customers create conversations" ON public.conversations;
CREATE POLICY "Customers create conversations"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (customer_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Participants update conversations" ON public.conversations;
CREATE POLICY "Participants update conversations"
ON public.conversations
FOR UPDATE
TO authenticated
USING (
  customer_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.providers p
    WHERE p.id = conversations.provider_id
      AND p.owner_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.branches b ON b.id = e.branch_id
    WHERE b.provider_id = conversations.provider_id
      AND e.profile_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  customer_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.providers p
    WHERE p.id = conversations.provider_id
      AND p.owner_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.branches b ON b.id = e.branch_id
    WHERE b.provider_id = conversations.provider_id
      AND e.profile_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Participants read messages" ON public.messages;
CREATE POLICY "Participants read messages"
ON public.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (
        c.customer_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.providers p
          WHERE p.id = c.provider_id
            AND p.owner_id = (SELECT auth.uid())
        )
        OR EXISTS (
          SELECT 1
          FROM public.employees e
          JOIN public.branches b ON b.id = e.branch_id
          WHERE b.provider_id = c.provider_id
            AND e.profile_id = (SELECT auth.uid())
        )
      )
  )
);

DROP POLICY IF EXISTS "Participants send messages" ON public.messages;
CREATE POLICY "Participants send messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (
        (messages.sender_role = 'customer' AND c.customer_id = (SELECT auth.uid()))
        OR (
          messages.sender_role = 'provider'
          AND EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = c.provider_id
              AND p.owner_id = (SELECT auth.uid())
          )
        )
        OR (
          messages.sender_role = 'provider'
          AND EXISTS (
            SELECT 1
            FROM public.employees e
            JOIN public.branches b ON b.id = e.branch_id
            WHERE b.provider_id = c.provider_id
              AND e.profile_id = (SELECT auth.uid())
          )
        )
      )
  )
);

DROP POLICY IF EXISTS "Participants mark messages read" ON public.messages;
CREATE POLICY "Participants mark messages read"
ON public.messages
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (
        c.customer_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.providers p
          WHERE p.id = c.provider_id
            AND p.owner_id = (SELECT auth.uid())
        )
        OR EXISTS (
          SELECT 1
          FROM public.employees e
          JOIN public.branches b ON b.id = e.branch_id
          WHERE b.provider_id = c.provider_id
            AND e.profile_id = (SELECT auth.uid())
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (
        c.customer_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.providers p
          WHERE p.id = c.provider_id
            AND p.owner_id = (SELECT auth.uid())
        )
        OR EXISTS (
          SELECT 1
          FROM public.employees e
          JOIN public.branches b ON b.id = e.branch_id
          WHERE b.provider_id = c.provider_id
            AND e.profile_id = (SELECT auth.uid())
        )
      )
  )
);

CREATE OR REPLACE FUNCTION public.touch_conversation_from_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET
    last_message_preview = NEW.body,
    last_message_at = NEW.created_at,
    unread_for_customer = CASE WHEN NEW.sender_role = 'provider' THEN TRUE ELSE unread_for_customer END,
    unread_for_provider = CASE WHEN NEW.sender_role = 'customer' THEN TRUE ELSE unread_for_provider END,
    updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_conversation_after_message ON public.messages;
CREATE TRIGGER touch_conversation_after_message
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.touch_conversation_from_message();

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'demo.owner.elite@primora.local', '$2a$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Omar","last_name":"Khaled"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'demo.owner.lumi@primora.local', '$2a$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Sara","last_name":"Nasser"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'demo.owner.royal@primora.local', '$2a$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Faisal","last_name":"Hamad"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'demo.customer.yousif@primora.local', '$2a$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Yousif","last_name":"Alqahtani"}', now(), now(), '', '', '', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, first_name, last_name, email, phone_number, language_preference)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'provider_owner', 'Omar', 'Khaled', 'demo.owner.elite@primora.local', '+966500000111', 'en'),
  ('22222222-2222-4222-8222-222222222222', 'provider_owner', 'Sara', 'Nasser', 'demo.owner.lumi@primora.local', '+966500000222', 'ar'),
  ('33333333-3333-4333-8333-333333333333', 'provider_owner', 'Faisal', 'Hamad', 'demo.owner.royal@primora.local', '+966500000333', 'en'),
  ('44444444-4444-4444-8444-444444444444', 'customer', 'Yousif', 'Alqahtani', 'demo.customer.yousif@primora.local', '+966500000444', 'en')
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles
SET role = 'provider_owner'
WHERE id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
);

INSERT INTO public.providers (
  id, owner_id, type, business_name_en, business_name_ar, description_en, description_ar,
  logo_url, cover_image_url, is_verified, commission_percentage, status,
  contact_email, contact_phone, last_activity_at
)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'salon_barber_shop', 'Elite Barbershop Riyadh', 'إليت باربرشوب الرياض', 'Premium men grooming, beard sculpting, and executive hair services.', 'خدمات حلاقة رجالية فاخرة وتشكيل لحية وتجهيز تنفيذي.', 'https://images.unsplash.com/photo-1622287162716-f311baa1a2b8?q=80&w=400&auto=format&fit=crop', 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=1200&auto=format&fit=crop', TRUE, 15.00, 'active', 'elite@primora.local', '+966500000111', now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '22222222-2222-4222-8222-222222222222', 'salon_barber_shop', 'Lumi Skin & Spa Studio', 'لومي للعناية بالبشرة والسبا', 'Luxury skincare, facials, nails, and wellness treatments for women.', 'عناية فاخرة بالبشرة والفيشل والأظافر والسبا للسيدات.', 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=400&auto=format&fit=crop', 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=1200&auto=format&fit=crop', TRUE, 15.00, 'active', 'lumi@primora.local', '+966500000222', now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '33333333-3333-4333-8333-333333333333', 'salon_barber_shop', 'Royal Grooming House', 'رويال هاوس للعناية', 'Mixed premium grooming, spa recovery, and signature packages.', 'خدمات مختلطة للحلاقة الفاخرة والسبا والباقات المميزة.', 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=400&auto=format&fit=crop', 'https://images.unsplash.com/photo-1600334129128-685c5582fd35?q=80&w=1200&auto=format&fit=crop', TRUE, 15.00, 'active', 'royal@primora.local', '+966500000333', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.branches (
  id, provider_id, name_en, name_ar, address_text_en, address_text_ar,
  latitude, longitude, geofence_radius_km
)
VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Riyadh Central Branch', 'فرع الرياض المركزي', 'King Fahd Road, Al Olaya, Riyadh', 'طريق الملك فهد، العليا، الرياض', 24.713600, 46.675300, 8.00),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Al Malqa Beauty Lounge', 'لاونج الملقا للتجميل', 'Anas Ibn Malik Road, Al Malqa, Riyadh', 'طريق أنس بن مالك، الملقا، الرياض', 24.792600, 46.615100, 10.00),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'Diplomatic Quarter Studio', 'استوديو الحي الدبلوماسي', 'Takhassusi Street, Riyadh', 'شارع التخصصي، الرياض', 24.686900, 46.625200, 12.00)
ON CONFLICT (id) DO NOTHING;

WITH service_seed(provider_id, category_slug, id, slug, name_en, name_ar, description_en, description_ar, price, duration, home, featured, ord, images, tags) AS (
  VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid, 'barber-hair', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid, 'elite-signature-fade', 'Signature Fade & Finish', 'قصة فيد مميزة', 'Precision fade with wash, finish styling, and consultation.', 'قصة فيد دقيقة مع غسيل وتصفيف واستشارة.', 85.00, 55, TRUE, TRUE, 101, ARRAY['https://images.unsplash.com/photo-1622287162716-f311baa1a2b8?q=80&w=1200&auto=format&fit=crop'], ARRAY['male','haircut','fade']),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid, 'beard-shave', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'::uuid, 'elite-royal-beard-sculpt', 'Royal Beard Sculpt', 'نحت اللحية الملكي', 'Beard design, line-up, hot towel, and premium oil finish.', 'تصميم وتحديد اللحية مع منشفة ساخنة وزيت فاخر.', 70.00, 45, TRUE, TRUE, 102, ARRAY['https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=1200&auto=format&fit=crop'], ARRAY['male','beard','shave']),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid, 'skincare-facials', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'::uuid, 'elite-mens-scalp-facial', 'Men''s Scalp & Facial Reset', 'علاج فروة ووجه للرجال', 'Anti-fatigue facial with scalp detox and steam.', 'فيشل مضاد للإجهاد مع تنظيف فروة الرأس والبخار.', 130.00, 70, FALSE, FALSE, 103, ARRAY['https://images.unsplash.com/photo-1620916566398-39f1143ab7be?q=80&w=1200&auto=format&fit=crop'], ARRAY['male','skincare','scalp']),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid, 'skincare-facials', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc4'::uuid, 'lumi-hydra-glow-facial', 'Hydra Glow Facial', 'فيشل هايدرا جلو', 'Deep hydration facial with extraction and cooling mask.', 'فيشل ترطيب عميق مع تنظيف وقناع تبريد.', 185.00, 75, FALSE, TRUE, 201, ARRAY['https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=1200&auto=format&fit=crop'], ARRAY['female','facial','skincare']),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid, 'nails-hands', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc5'::uuid, 'lumi-gel-manicure', 'Gel Manicure Ritual', 'جلسة جل مانيكير', 'Cuticle care, gel polish, and hand spa finish.', 'عناية بالجلد المحيط وجل بوليش ولمسة سبا لليدين.', 115.00, 60, TRUE, FALSE, 202, ARRAY['https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=1200&auto=format&fit=crop'], ARRAY['female','nails','hands']),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid, 'spa-wellness', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc6'::uuid, 'lumi-aroma-spa', 'Aroma Spa Recovery', 'جلسة سبا عطرية', 'Full-body relaxation with warm oils and quiet recovery time.', 'استرخاء كامل للجسم بالزيوت الدافئة ووقت تعافٍ هادئ.', 220.00, 90, TRUE, TRUE, 203, ARRAY['https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=1200&auto=format&fit=crop'], ARRAY['female','spa','massage']),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid, 'signature-packages', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc7'::uuid, 'royal-couple-reset', 'Royal Reset Package', 'باقة رويال ريسيت', 'A mixed premium package for hair, skin, spa, and recovery.', 'باقة مختلطة فاخرة للشعر والبشرة والسبا والتعافي.', 420.00, 150, FALSE, TRUE, 301, ARRAY['https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=1200&auto=format&fit=crop'], ARRAY['unisex','signature','package']),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid, 'spa-wellness', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc8'::uuid, 'royal-recovery-massage', 'Recovery Massage', 'مساج استشفائي', 'Deep recovery massage for active lifestyles.', 'مساج عميق للتعافي بعد النشاط.', 210.00, 80, TRUE, FALSE, 302, ARRAY['https://images.unsplash.com/photo-1600334129128-685c5582fd35?q=80&w=1200&auto=format&fit=crop'], ARRAY['unisex','massage','spa'])
)
INSERT INTO public.services (
  id, provider_id, category_id, slug, name_en, name_ar, description_en, description_ar,
  base_price, base_duration_minutes, is_home_service_eligible, status,
  featured_in_services, featured_on_landing, sort_order, images, tags, add_ons
)
SELECT s.id, s.provider_id, c.id, s.slug, s.name_en, s.name_ar, s.description_en, s.description_ar,
       s.price, s.duration, s.home, 'active', s.featured, s.featured, s.ord, s.images, s.tags, '[]'::jsonb
FROM service_seed s
JOIN public.categories c ON c.slug = s.category_slug
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employees (
  id, branch_id, name_en, name_ar, title_en, title_ar, is_active,
  photo_url, phone, email, work_type
)
VALUES
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Omar Khaled', 'عمر خالد', 'Master Barber', 'حلاق محترف', TRUE, 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=400&auto=format&fit=crop', '+966511111111', 'omar.khaled@primora.local', 'both'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Yousef Adel', 'يوسف عادل', 'Beard Specialist', 'أخصائي لحية', TRUE, 'https://images.unsplash.com/photo-1580518337843-f959e992563b?q=80&w=400&auto=format&fit=crop', '+966522222222', 'yousef.adel@primora.local', 'in_shop'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd3', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Karim Saad', 'كريم سعد', 'Grooming Expert', 'خبير عناية', TRUE, 'https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=400&auto=format&fit=crop', '+966533333333', 'karim.saad@primora.local', 'remote'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Maha Salem', 'مها سالم', 'Skin Therapist', 'أخصائية بشرة', TRUE, 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=400&auto=format&fit=crop', '+966544444444', 'maha.salem@primora.local', 'both'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd5', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Leen Faris', 'لين فارس', 'Nail Artist', 'فنانة أظافر', TRUE, 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=400&auto=format&fit=crop', '+966555555555', 'leen.faris@primora.local', 'in_shop'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd6', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'Noura Majed', 'نورة ماجد', 'Wellness Lead', 'قائدة العافية', TRUE, 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=400&auto=format&fit=crop', '+966566666666', 'noura.majed@primora.local', 'both'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd7', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'Fahad Nasser', 'فهد ناصر', 'Massage Specialist', 'أخصائي مساج', TRUE, 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&auto=format&fit=crop', '+966577777777', 'fahad.nasser@primora.local', 'remote'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd8', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'Rana Saleh', 'رنا صالح', 'Signature Stylist', 'أخصائية باقات', FALSE, 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=400&auto=format&fit=crop', '+966588888888', 'rana.saleh@primora.local', 'in_shop')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employee_services (employee_id, service_id)
VALUES
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd3', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc4'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd5', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc5'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc6'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd6', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc7'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd6', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc8'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd7', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc8'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd8', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc7')
ON CONFLICT DO NOTHING;

WITH seeded_employees AS (
  SELECT id FROM public.employees
  WHERE id IN (
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd3',
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd4',
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd5',
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd6',
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd7',
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd8'
  )
),
days AS (
  SELECT generate_series(0, 6) AS day_of_week
)
INSERT INTO public.employee_availability (employee_id, day_of_week, start_time, end_time, is_working_day)
SELECT e.id, d.day_of_week,
       CASE WHEN d.day_of_week IN (5) THEN '14:00'::time ELSE '09:00'::time END,
       CASE WHEN d.day_of_week IN (5) THEN '20:00'::time ELSE '18:00'::time END,
       d.day_of_week <> 6
FROM seeded_employees e
CROSS JOIN days d
ON CONFLICT (employee_id, day_of_week) DO NOTHING;

INSERT INTO public.conversations (
  id, customer_id, provider_id, subject, last_message_preview,
  last_message_at, unread_for_customer, unread_for_provider
)
VALUES
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', '44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Upcoming beard sculpt booking', 'Yes, we can prepare a quieter chair near the window.', now() - interval '45 minutes', FALSE, TRUE),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', '44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Skin care consultation', 'Your skin care specialist recommends arriving 10 minutes early.', now() - interval '2 hours', TRUE, FALSE),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3', '44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'Royal reset package', 'The mixed wellness room is reserved for your preferred time.', now() - interval '1 day', FALSE, FALSE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.messages (id, conversation_id, sender_id, sender_role, body, created_at)
VALUES
  ('ffffffff-ffff-4fff-8fff-fffffffffff1', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', '44444444-4444-4444-8444-444444444444', 'customer', 'Hi, can I choose a quieter chair for the beard sculpt appointment?', now() - interval '55 minutes'),
  ('ffffffff-ffff-4fff-8fff-fffffffffff2', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', '11111111-1111-4111-8111-111111111111', 'provider', 'Yes, we can prepare a quieter chair near the window.', now() - interval '45 minutes'),
  ('ffffffff-ffff-4fff-8fff-fffffffffff3', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', '22222222-2222-4222-8222-222222222222', 'provider', 'Your skin care specialist recommends arriving 10 minutes early.', now() - interval '2 hours'),
  ('ffffffff-ffff-4fff-8fff-fffffffffff4', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3', '44444444-4444-4444-8444-444444444444', 'customer', 'Can I book the Royal Reset for two people next week?', now() - interval '1 day 1 hour'),
  ('ffffffff-ffff-4fff-8fff-fffffffffff5', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3', '33333333-3333-4333-8333-333333333333', 'provider', 'The mixed wellness room is reserved for your preferred time.', now() - interval '1 day')
ON CONFLICT (id) DO NOTHING;
