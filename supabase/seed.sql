-- Supabase Database Seed File
-- Description: Seed data for categories, profiles, providers, branches, staff, services, resources, bookings, ledgers, and developer API registers in Riyadh and Jeddah.

-- 1. INSERT SYSTEM CATEGORIES
INSERT INTO public.categories (id, parent_id, name_en, name_ar, slug, is_active) VALUES
('c0000000-0000-0000-0000-000000000001', NULL, 'Grooming & Barbering', 'العناية والحلاقة', 'grooming-barbering', true),
('c0000000-0000-0000-0000-000000000002', NULL, 'Hair Styling & Color', 'صبغ وتصفيف الشعر', 'hair-styling', true),
('c0000000-0000-0000-0000-000000000003', NULL, 'Spa & Wellness', 'السبا والعناية الاستشفائية', 'spa-wellness', true),
('c0000000-0000-0000-0000-000000000004', NULL, 'Nails & Manicures', 'العناية بالأظافر', 'nails-manicures', true),
('c0000000-0000-0000-0000-000000000005', NULL, 'Makeup & Glam', 'المكياج والتجميل', 'makeup-glam', true),
('c0000000-0000-0000-0000-000000000006', NULL, 'Apothecary & Skincare', 'العناية بالبشرة والوجه', 'apothecary-skincare', true);

INSERT INTO public.categories (id, parent_id, name_en, name_ar, slug, is_active) VALUES
('c0000000-0000-0000-0000-000000000101', 'c0000000-0000-0000-0000-000000000001', 'Men''s Haircut', 'قص شعر رجالي', 'mens-haircut', true),
('c0000000-0000-0000-0000-000000000102', 'c0000000-0000-0000-0000-000000000001', 'Beard Grooming', 'تهذيب اللحية وتنعيمها', 'beard-grooming', true),
('c0000000-0000-0000-0000-000000000201', 'c0000000-0000-0000-0000-000000000002', 'Balayage & Highlights', 'صبغة بالياج وتلوين الشعر', 'balayage-highlights', true),
('c0000000-0000-0000-0000-000000000301', 'c0000000-0000-0000-0000-000000000003', 'Moroccan Bath', 'حمام مغربي ملكي', 'moroccan-bath', true),
('c0000000-0000-0000-0000-000000000302', 'c0000000-0000-0000-0000-000000000003', 'Swedish Massage', 'جلسة مساج سويدي', 'swedish-massage', true),
('c0000000-0000-0000-0000-000000000401', 'c0000000-0000-0000-0000-000000000004', 'Gel Manicure', 'جلسة جل مانيكير للأظافر', 'gel-manicure', true);


-- 2. INSERT PROFILES (Mock authenticated user IDs mapping to profiles)
-- In live Supabase, these correspond to auth.users records.
-- Generating UUIDs for sandbox testing:
-- Customers:
--   - Yousif Al-Saud (u0000000-0000-0000-0000-000000000001)
--   - Khalid M. (u0000000-0000-0000-0000-000000000002)
-- Provider Owners:
--   - Elite Owner (u0000000-0000-0000-0000-000000000101)
--   - Sara Owner (u0000000-0000-0000-0000-000000000102)
-- Employees:
--   - Ali Al-Harbi (u0000000-0000-0000-0000-000000000201)
--   - Elena Rostova (u0000000-0000-0000-0000-000000000202)

-- Normally triggers handle this, but seeding directly for standalone DB resets.
-- First, disable any conflicting triggers or insert with safety:
-- (We'll assume database RLS or triggers are configured, writing standard inserts)

-- Seeding profiles directly (since profiles references auth.users(id), we should seed this safely.
-- Note: In local supabase testing, users might run this without auth.users existing.
-- To bypass foreign keys checking during seeding in postgres:
-- SET session_replication_role = 'replica';
-- We will write standard inserts that work in staging.

-- We assume profiles table matches. Let's write them:
INSERT INTO public.profiles (id, role, first_name, last_name, email, phone_number, language_preference) VALUES
('00000000-0000-0000-0000-000000000001', 'customer', 'Yousif', 'Al-Saud', 'yousif@primora.com', '+966501234567', 'ar'),
('00000000-0000-0000-0000-000000000002', 'customer', 'Khalid', 'M.', 'khalid@primora.com', '+966502345678', 'ar'),
('00000000-0000-0000-0000-000000000101', 'provider_owner', 'Faisal', 'Owner', 'faisal@elitebarber.sa', '+966503456789', 'ar'),
('00000000-0000-0000-0000-000000000102', 'provider_owner', 'Sara', 'Owner', 'sara@sarabeauty.sa', '+966504567890', 'ar'),
('00000000-0000-0000-0000-000000000201', 'provider_employee', 'Ali', 'Al-Harbi', 'ali@elitebarber.sa', '+966505678901', 'ar'),
('00000000-0000-0000-0000-000000000202', 'provider_employee', 'Elena', 'Rostova', 'elena@sarabeauty.sa', '+966506789012', 'ar');


-- 3. INSERT PROVIDER PROFILES
INSERT INTO public.providers (id, owner_id, type, business_name_en, business_name_ar, description_en, description_ar, logo_url, cover_image_url, is_verified, commission_percentage) VALUES
('p0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'salon_barber_shop', 'Elite Grooming Lounge', 'صالون إيليت الرجالي', 'Premier luxury grooming salon for gentlemen in Riyadh.', 'صالون الحلاقة الفاخر الأول للرجال بالرياض.', 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=150', 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=600', true, 15.00),
('p0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000102', 'salon_barber_shop', 'Sara Beauty Salon & Spa', 'صالون وسبا سارة للتجميل', 'Exclusive women-only luxury salon offering event makeup and hair styling.', 'صالون تجميل فاخر وحصري للسيدات بالرياض.', 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=150', 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=600', true, 15.00);


-- 4. INSERT BRANCHES (Riyadh districts)
INSERT INTO public.branches (id, provider_id, name_en, name_ar, address_text_en, address_text_ar, latitude, longitude, geofence_radius_km) VALUES
('b0000000-0000-0000-0000-000000000001', 'p0000000-0000-0000-0000-000000000001', 'Al-Malqa Branch', 'فرع الملقا', 'Anas Bin Malik Road, Al-Malqa, Riyadh', 'طريق أنس بن مالك، حي الملقا، الرياض', 24.796300, 46.611100, 5.00),
('b0000000-0000-0000-0000-000000000002', 'p0000000-0000-0000-0000-000000000002', 'Olaya Branch', 'فرع العليا', 'Tahlia Street, Olaya, Riyadh', 'شارع التحلية، حي العليا، الرياض', 24.711200, 46.674400, 5.00);


-- 5. INSERT STAFF EMPLOYEES
INSERT INTO public.employees (id, branch_id, profile_id, name_en, name_ar, title_en, title_ar, is_active) VALUES
('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', 'Ali Al-Harbi', 'علي الحربي', 'Master Barber', 'حلاق رئيسي', true),
('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000202', 'Elena Rostova', 'إيلينا روستوفا', 'Lead Hairstylist', 'مصففة شعر رئيسية', true);


-- 6. INSERT SERVICES
INSERT INTO public.services (id, provider_id, category_id, name_en, name_ar, description_en, description_ar, base_price, base_duration_minutes, is_home_service_eligible, is_active) VALUES
('s0000000-0000-0000-0000-000000000001', 'p0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000102', 'Luxury Beard Grooming', 'حلاقة اللحية الفاخرة بالمنشفة الساخنة', 'Sculpting, shaping, and steam towels.', 'تهذيب وتحديد اللحية واستخدام بخار المناشف.', 150.00, 45, true, true),
('s0000000-0000-0000-0000-000000000002', 'p0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000101', 'Master Haircut', 'قص الشعر الاحترافي', 'Elite master hair wash and styling.', 'غسيل شعر احترافي وتصفيف عصري.', 120.00, 45, false, true),
('s0000000-0000-0000-0000-000000000003', 'p0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000201', 'Balayage Color', 'صبغة بالياج وتصفيف شعر حرير', 'Couture hand-painted color highlights.', 'تلوين خصلات شعر يدوي وتجفيف الحرير.', 650.00, 150, false, true),
('s0000000-0000-0000-0000-000000000004', 'p0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000401', 'French Gel Manicure', 'جلسة جل مانيكير فرنسي', 'Nail files and organic gel polish.', 'جلسة العناية بالأظافر وطلاء جل فرنسي.', 180.00, 45, true, true);


-- 7. MAP EMPLOYEE SERVICES
INSERT INTO public.employee_services (employee_id, service_id, custom_price, custom_duration_minutes) VALUES
('e0000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000001', NULL, NULL),
('e0000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000002', NULL, NULL),
('e0000000-0000-0000-0000-000000000002', 's0000000-0000-0000-0000-000000000003', NULL, NULL),
('e0000000-0000-0000-0000-000000000002', 's0000000-0000-0000-0000-000000000004', NULL, NULL);


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
('r0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Zen Spa Room A', 'Massage Room', 1, true),
('r0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Lumiere Sauna Room', 'Sauna', 4, true);


-- 11. MOCK BOOKINGS (Scheduled in future dates)
INSERT INTO public.bookings (id, customer_id, branch_id, employee_id, service_id, status, is_home_service, scheduled_at, duration_minutes, total_price, deposit_required, platform_commission, client_profile_id) VALUES
('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000001', 'confirmed', false, CURRENT_DATE + INTERVAL '2 days' + TIME '14:00:00', 45, 150.00, 22.50, 22.50, 'd0000000-0000-0000-0000-000000000001'),
('b0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 's0000000-0000-0000-0000-000000000003', 'pending_payment', false, CURRENT_DATE + INTERVAL '3 days' + TIME '16:00:00', 150, 650.00, 97.50, 97.50, NULL);


-- 12. TRANSACTIONAL LEDGER
INSERT INTO public.transactional_ledger (id, booking_id, payment_intent_id, total_captured, platform_share, provider_share, payout_status) VALUES
('l0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'ch_mada_mock_99182', 150.00, 22.50, 127.50, 'pending');


-- 13. COURIER DELIVERY JOBS
INSERT INTO public.delivery_jobs (id, booking_id, pickup_address, delivery_address, pickup_latitude, pickup_longitude, delivery_latitude, delivery_longitude, carrier_id, status, estimated_delivery_time, delivery_metadata) VALUES
('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'صالون إيليت - حي الملقا، طريق أنس بن مالك، الرياض', 'حي العليا، شارع التحلية، فيلا 14، الرياض', 24.796300, 46.611100, 24.711200, 46.674400, NULL, 'pending', NOW() + INTERVAL '1 hour', '{"distance": "8.4 km", "item": "Beard Sculpting Balm & Premium Aftershave"}');


-- 14. DEVELOPER API CONSOLE DATA
INSERT INTO public.developer_profiles (id, developer_id, app_name, is_approved) VALUES
('d0000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Primora App Integrator', true);

INSERT INTO public.api_tokens (id, developer_profile_id, token_hash, scopes, status, expires_at) VALUES
('t0000000-0000-0000-0000-000000000101', 'd0000000-0000-0000-0000-000000000101', 'pk_live_8a38a7c29e1f4c76b92a34419cb7d100', '{"bookings:read", "bookings:write"}', 'active', NOW() + INTERVAL '1 year');

INSERT INTO public.webhook_subscriptions (id, developer_profile_id, target_url, subscribed_events, signing_secret, status) VALUES
('w0000000-0000-0000-0000-000000000101', 'd0000000-0000-0000-0000-000000000101', 'https://api.myclientapp.com/webhooks/primora', '{"booking.created", "booking.completed"}', 'whsec_7d2f9a1c8e0b4d6f9a0b2c3d4e5f6a7b', 'active');
