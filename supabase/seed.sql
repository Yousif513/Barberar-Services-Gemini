-- Supabase Database Seed File
-- Description: Seed data for categories, profiles, providers, branches, staff, services, resources, bookings, ledgers, and developer API registers in Riyadh and Jeddah.

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);

-- 1. INSERT SYSTEM CATEGORIES
-- Missing top-level categories first, then the sub-categories under them. Existing slugs are left untouched.
INSERT INTO public.categories (name_en, name_ar, slug, is_active) VALUES
('Grooming & Barbering', 'العناية والحلاقة', 'grooming-barbering', true),
('Hair Styling & Color', 'صبغ وتصفيف الشعر', 'hair-styling', true),
('Spa & Wellness', 'السبا والعناية الاستشفائية', 'spa-wellness', true),
('Nails & Manicures', 'العناية بالأظافر', 'nails-manicures', true),
('Makeup & Glam', 'المكياج والتجميل', 'makeup-glam', true),
('Apothecary & Skincare', 'العناية بالبشرة والوجه', 'apothecary-skincare', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (parent_id, name_en, name_ar, slug, is_active)
SELECT parent.id, v.name_en, v.name_ar, v.slug, true
FROM (VALUES
  ('grooming-barbering', 'Men''s Haircut', 'قص شعر رجالي', 'mens-haircut'),
  ('grooming-barbering', 'Beard Grooming', 'تهذيب اللحية وتنعيمها', 'beard-grooming'),
  ('hair-styling', 'Balayage & Highlights', 'صبغة بالياج وتلوين الشعر', 'balayage-highlights'),
  ('spa-wellness', 'Moroccan Bath', 'حمام مغربي ملكي', 'moroccan-bath'),
  ('spa-wellness', 'Swedish Massage', 'جلسة مساج سويدي', 'swedish-massage'),
  ('nails-manicures', 'Gel Manicure', 'جلسة جل مانيكير للأظافر', 'gel-manicure')
) AS v(parent_slug, name_en, name_ar, slug)
JOIN public.categories parent ON parent.slug = v.parent_slug
ON CONFLICT (slug) DO NOTHING;


-- 2. INSERT PROFILES
-- Local development accounts. Each one is an auth.users row (the sign-up trigger creates the profile) and then the
-- profile is completed below. No password is set: sign in with the phone test code from supabase/config.toml, or create
-- a password for a local account through the Studio.
INSERT INTO auth.users (instance_id, id, aud, role, email, phone, email_confirmed_at, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
SELECT '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, u.phone, NOW(), NOW(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW(), '', '', '', ''
FROM (VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'yousif@primora.com', '966501234567'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'khalid@primora.com', '966502345678'),
  ('00000000-0000-0000-0000-000000000101'::uuid, 'faisal@elitebarber.sa', '966503456789'),
  ('00000000-0000-0000-0000-000000000102'::uuid, 'sara@sarabeauty.sa', '966504567890'),
  ('00000000-0000-0000-0000-000000000201'::uuid, 'ali@elitebarber.sa', '966505678901'),
  ('00000000-0000-0000-0000-000000000202'::uuid, 'elena@sarabeauty.sa', '966506789012')
) AS u(id, email, phone)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, first_name, last_name, email, phone_number, language_preference) VALUES
('00000000-0000-0000-0000-000000000001', 'customer', 'Yousif', 'Al-Saud', 'yousif@primora.com', '+966501234567', 'ar'),
('00000000-0000-0000-0000-000000000002', 'customer', 'Khalid', 'M.', 'khalid@primora.com', '+966502345678', 'ar'),
('00000000-0000-0000-0000-000000000101', 'provider_owner', 'Faisal', 'Owner', 'faisal@elitebarber.sa', '+966503456789', 'ar'),
('00000000-0000-0000-0000-000000000102', 'provider_owner', 'Sara', 'Owner', 'sara@sarabeauty.sa', '+966504567890', 'ar'),
('00000000-0000-0000-0000-000000000201', 'provider_employee', 'Ali', 'Al-Harbi', 'ali@elitebarber.sa', '+966505678901', 'ar'),
('00000000-0000-0000-0000-000000000202', 'provider_employee', 'Elena', 'Rostova', 'elena@sarabeauty.sa', '+966506789012', 'ar')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
  email = EXCLUDED.email, phone_number = EXCLUDED.phone_number, language_preference = EXCLUDED.language_preference;

-- 2b. LOCAL ADMINISTRATORS (GOV-1): one owner and one finance account, so maker-checker (a different person approves) can be
-- exercised locally. No password is seeded; set one through the Auth admin API or Studio. Each must enrol an authenticator
-- app (TOTP) at first sign-in: the database refuses administrator sessions below aal2.
INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
SELECT '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, NOW(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW(), '', '', '', ''
FROM (VALUES
  ('00000000-0000-0000-0000-000000000901'::uuid, 'admin.owner@primora.local'),
  ('00000000-0000-0000-0000-000000000902'::uuid, 'admin.finance@primora.local')
) AS u(id, email)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, first_name, last_name, email, language_preference) VALUES
('00000000-0000-0000-0000-000000000901', 'admin', 'Local', 'Owner', 'admin.owner@primora.local', 'ar'),
('00000000-0000-0000-0000-000000000902', 'admin', 'Local', 'Finance', 'admin.finance@primora.local', 'ar')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, email = EXCLUDED.email;

INSERT INTO public.admin_role_assignments (user_id, admin_role, reason) VALUES
('00000000-0000-0000-0000-000000000901', 'owner', 'Local development owner account'),
('00000000-0000-0000-0000-000000000902', 'finance', 'Local development finance account')
ON CONFLICT (user_id) DO UPDATE SET admin_role = EXCLUDED.admin_role, reason = EXCLUDED.reason;


-- 3. INSERT PROVIDER PROFILES
INSERT INTO public.providers (id, owner_id, type, business_name_en, business_name_ar, description_en, description_ar, logo_url, cover_image_url, is_verified, commission_percentage, status) VALUES
('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'salon_barber_shop', 'Elite Grooming Lounge', 'صالون إيليت الرجالي', 'Premier luxury grooming salon for gentlemen in Riyadh.', 'صالون الحلاقة الفاخر الأول للرجال بالرياض.', 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=150', 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=600', true, 15.00, 'active'),
('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000102', 'salon_barber_shop', 'Sara Beauty Salon & Spa', 'صالون وسبا سارة للتجميل', 'Exclusive women-only luxury salon offering event makeup and hair styling.', 'صالون تجميل فاخر وحصري للسيدات بالرياض.', 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=150', 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=600', true, 15.00, 'active');


-- 4. INSERT BRANCHES (Riyadh districts)
INSERT INTO public.branches (id, provider_id, name_en, name_ar, address_text_en, address_text_ar, latitude, longitude, geofence_radius_km, city, district) VALUES
('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Al-Malqa Branch', 'فرع الملقا', 'Anas Bin Malik Road, Al-Malqa, Riyadh', 'طريق أنس بن مالك، حي الملقا، الرياض', 24.796300, 46.611100, 5.00, 'Riyadh', 'Al-Malqa'),
('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Olaya Branch', 'فرع العليا', 'Tahlia Street, Olaya, Riyadh', 'شارع التحلية، حي العليا، الرياض', 24.711200, 46.674400, 5.00, 'Riyadh', 'Olaya');


-- 5. INSERT STAFF EMPLOYEES
INSERT INTO public.employees (id, branch_id, profile_id, name_en, name_ar, title_en, title_ar, is_active) VALUES
('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', 'Ali Al-Harbi', 'علي الحربي', 'Master Barber', 'حلاق رئيسي', true),
('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000202', 'Elena Rostova', 'إيلينا روستوفا', 'Lead Hairstylist', 'مصففة شعر رئيسية', true);


-- 6. INSERT SERVICES
INSERT INTO public.services (id, provider_id, category_id, name_en, name_ar, description_en, description_ar, base_price, base_duration_minutes, is_home_service_eligible, is_active) VALUES
('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', (SELECT id FROM public.categories WHERE slug = 'beard-grooming'), 'Luxury Beard Grooming', 'حلاقة اللحية الفاخرة بالمنشفة الساخنة', 'Sculpting, shaping, and steam towels.', 'تهذيب وتحديد اللحية واستخدام بخار المناشف.', 150.00, 45, true, true),
('50000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', (SELECT id FROM public.categories WHERE slug = 'mens-haircut'), 'Master Haircut', 'قص الشعر الاحترافي', 'Elite master hair wash and styling.', 'غسيل شعر احترافي وتصفيف عصري.', 120.00, 45, false, true),
('50000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', (SELECT id FROM public.categories WHERE slug = 'balayage-highlights'), 'Balayage Color', 'صبغة بالياج وتصفيف شعر حرير', 'Couture hand-painted color highlights.', 'تلوين خصلات شعر يدوي وتجفيف الحرير.', 650.00, 150, false, true),
('50000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', (SELECT id FROM public.categories WHERE slug = 'gel-manicure'), 'French Gel Manicure', 'جلسة جل مانيكير فرنسي', 'Nail files and organic gel polish.', 'جلسة العناية بالأظافر وطلاء جل فرنسي.', 180.00, 45, true, true);


-- 7. MAP EMPLOYEE SERVICES
INSERT INTO public.employee_services (employee_id, service_id, custom_price, custom_duration_minutes) VALUES
('e0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', NULL, NULL),
('e0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', NULL, NULL),
('e0000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003', NULL, NULL),
('e0000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000004', NULL, NULL);


-- 8. SET WEEKLY SHIFTS (Day 0 to 6)
-- Ali Al-Harbi shifts (b0000000-0000-0000-0000-000000000001)
INSERT INTO public.employee_availability (employee_id, day_of_week, start_time, end_time, is_working_day) VALUES
('e0000000-0000-0000-0000-000000000001', 0, '09:00:00', '21:00:00', true),
('e0000000-0000-0000-0000-000000000001', 1, '09:00:00', '21:00:00', true),
('e0000000-0000-0000-0000-000000000001', 2, '09:00:00', '21:00:00', true),
('e0000000-0000-0000-0000-000000000001', 3, '09:00:00', '21:00:00', true),
('e0000000-0000-0000-0000-000000000001', 4, '09:00:00', '21:00:00', true),
('e0000000-0000-0000-0000-000000000001', 5, '13:00:00', '22:00:00', true),
('e0000000-0000-0000-0000-000000000001', 6, '00:00:00', '00:00:00', false);

-- Elena Rostova shifts
INSERT INTO public.employee_availability (employee_id, day_of_week, start_time, end_time, is_working_day) VALUES
('e0000000-0000-0000-0000-000000000002', 0, '10:00:00', '20:00:00', true),
('e0000000-0000-0000-0000-000000000002', 1, '10:00:00', '20:00:00', true),
('e0000000-0000-0000-0000-000000000002', 2, '10:00:00', '20:00:00', true),
('e0000000-0000-0000-0000-000000000002', 3, '10:00:00', '20:00:00', true),
('e0000000-0000-0000-0000-000000000002', 4, '10:00:00', '22:00:00', true),
('e0000000-0000-0000-0000-000000000002', 5, '00:00:00', '00:00:00', false),
('e0000000-0000-0000-0000-000000000002', 6, '10:00:00', '20:00:00', true);


-- 9. CLIENT PROFILES (Dependents & Pets)
INSERT INTO public.client_profiles (id, client_id, name, type, dob, gender, medical_info) VALUES
('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Faisal Al-Saud', 'dependent', '2014-05-12', 'male', 'حساسية من المكسرات / Nut allergy'),
('d0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Rex', 'pet', '2022-09-01', 'male', 'تطعيمات كاملة / Fully vaccinated');


-- 10. SPA ROOMS & RESOURCES
INSERT INTO public.resources (id, branch_id, name, category, capacity, is_active) VALUES
('f0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Zen Spa Room A', 'Massage Room', 1, true),
('f0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Lumiere Sauna Room', 'Sauna', 4, true);


-- 11. MOCK BOOKINGS (Scheduled in future dates)
INSERT INTO public.bookings (id, customer_id, branch_id, employee_id, service_id, status, is_home_service, scheduled_at, duration_minutes, total_price, deposit_required, platform_commission, client_profile_id) VALUES
('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'confirmed', false, CURRENT_DATE + INTERVAL '2 days' + TIME '14:00:00', 45, 150.00, 22.50, 22.50, 'd0000000-0000-0000-0000-000000000001'),
('b0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003', 'pending_payment', false, CURRENT_DATE + INTERVAL '3 days' + TIME '16:00:00', 150, 650.00, 97.50, 97.50, NULL);


-- 12. TRANSACTIONAL LEDGER
INSERT INTO public.transactional_ledger (id, booking_id, payment_intent_id, total_captured, platform_share, provider_share, payout_status) VALUES
('10000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'ch_mada_mock_99182', 150.00, 22.50, 127.50, 'pending');


-- 13. COURIER DELIVERY JOBS
INSERT INTO public.delivery_jobs (id, booking_id, pickup_address, delivery_address, pickup_latitude, pickup_longitude, delivery_latitude, delivery_longitude, carrier_id, status, estimated_delivery_time, delivery_metadata) VALUES
('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'صالون إيليت - حي الملقا، طريق أنس بن مالك، الرياض', 'حي العليا، شارع التحلية، فيلا 14، الرياض', 24.796300, 46.611100, 24.711200, 46.674400, NULL, 'pending', NOW() + INTERVAL '1 hour', '{"distance": "8.4 km", "item": "Beard Sculpting Balm & Premium Aftershave"}');


-- 14. DEVELOPER API: no seed data on purpose.
-- API keys (api_keys) and webhook endpoints are created by a provider owner through the console, and their
-- credentials exist in plaintext only in the create response. A seeded key or signing secret would be a
-- plaintext credential in the repository, and the old rows here could not apply anyway (invalid UUID
-- literals, columns that do not exist).

SELECT set_config('request.jwt.claims', '', false);
