-- P-04 (privacy review 2026-10-08): employees.profile_id (the staff member's auth uuid) was readable by visitors, and a salon owner could INSERT or
-- UPDATE it to any user id, binding an unrelated person to the salon (salon context, link invitations) without that person's consent.
-- Visitors lose profile_id. Owners and delegates keep every other column but can no longer write profile_id from the Data API: a staff
-- member's login is linked by the service role / support tooling only. No screen writes this column today (the staff form saves name, title,
-- contact, bio and similar columns), so nothing in the apps changes. Signed-in users still read profile_id of active staff because the owner's
-- staff screen selects it; removing that needs the screen to use a has_login flag first (see docs/work-packages/fixpriv-report.md).
REVOKE SELECT (profile_id) ON public.employees FROM anon;
REVOKE INSERT, UPDATE ON public.employees FROM authenticated;
GRANT INSERT (branch_id, name_en, name_ar, title_en, title_ar, is_active, photo_url, phone, email, work_type, bio_en, bio_ar, years_of_experience, specialties, instagram_handle)
  ON public.employees TO authenticated;
GRANT UPDATE (branch_id, name_en, name_ar, title_en, title_ar, is_active, photo_url, phone, email, work_type, bio_en, bio_ar, years_of_experience, specialties, instagram_handle)
  ON public.employees TO authenticated;
