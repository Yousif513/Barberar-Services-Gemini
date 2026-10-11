-- ADM1 / item 1: the approval screen must show whether an application's commercial registration is cleared.
-- approve_provider_application refuses an application that states a CR number until it is verified or manually reviewed, so the
-- administrator's list needs the check state (and the registered name Wathq returned) next to the application.
-- New columns are appended at the end, which CREATE OR REPLACE VIEW allows; the view stays security_invoker.
CREATE OR REPLACE VIEW public.admin_provider_applications_view
WITH (security_invoker = true)
AS
SELECT
  pa.id,
  pa.user_id,
  p.first_name,
  p.last_name,
  pa.business_name_en,
  pa.business_name_ar,
  pa.business_type,
  pa.cr_number,
  pa.tax_number,
  pa.contact_email,
  pa.contact_phone,
  pa.city,
  pa.district,
  pa.address_text,
  pa.trade_license_url,
  pa.status,
  pa.rejection_reason,
  pa.admin_notes,
  pa.reviewed_by,
  pa.reviewed_at,
  pa.created_at,
  pa.updated_at,
  pa.cr_verification_status,
  pa.cr_check_data
FROM public.provider_applications pa
JOIN public.profiles p ON p.id = pa.user_id;
