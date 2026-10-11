-- D-07 + D-25 + D-12 (application side): a provider application records where the branch is, who is applying once, and which
-- agreement version it was submitted under.
--
--   D-07  latitude/longitude/city defaulted to the centre of Riyadh, so a Jeddah salon was approved at the Riyadh centre and the
--         "location is required" guard in approve_provider_application could never fire. The defaults are gone: an application
--         carries a location only when the applicant (or the reviewing administrator) supplied one. Pending applications that still
--         hold exactly the old default centre are cleared, so approval asks for a real location.
--   D-25  one open application per applicant (partial unique index) and only https addresses for the trade licence link.
--   D-12  an application cannot be submitted while no provider agreement is published; the version shown is stamped by the server.
--         Acceptance itself is evidence in agreement_acceptances (see 20261007010300_agreement_evidence.sql).

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- D-07
ALTER TABLE public.provider_applications ALTER COLUMN latitude DROP DEFAULT;
ALTER TABLE public.provider_applications ALTER COLUMN longitude DROP DEFAULT;
ALTER TABLE public.provider_applications ALTER COLUMN city DROP DEFAULT;
UPDATE public.provider_applications SET latitude = NULL, longitude = NULL
 WHERE status IN ('pending', 'under_review') AND latitude = 24.7136 AND longitude = 46.6753;
ALTER TABLE public.provider_applications DROP CONSTRAINT IF EXISTS provider_applications_coordinates_range;
ALTER TABLE public.provider_applications ADD CONSTRAINT provider_applications_coordinates_range CHECK (
  (latitude IS NULL) = (longitude IS NULL)
  AND (latitude IS NULL OR latitude BETWEEN -90 AND 90)
  AND (longitude IS NULL OR longitude BETWEEN -180 AND 180));

-- D-25: one open application per applicant. Older open duplicates are closed as superseded (the newest one stays open).
UPDATE public.provider_applications a
   SET status = 'rejected', rejection_reason = 'Superseded by a newer application from the same applicant',
       reviewed_at = now(), updated_at = now()
 WHERE a.status IN ('pending', 'under_review')
   AND EXISTS (SELECT 1 FROM public.provider_applications n
                WHERE n.user_id = a.user_id AND n.status IN ('pending', 'under_review')
                  AND (n.created_at, n.id) > (a.created_at, a.id));
CREATE UNIQUE INDEX IF NOT EXISTS provider_applications_one_open_per_applicant
  ON public.provider_applications (user_id) WHERE status IN ('pending', 'under_review');

-- D-25: the trade licence link is shown to administrators as a link, so it is an https address or nothing. A stored link that is
-- not (written before this check) is moved into the review notes as plain text and cleared.
UPDATE public.provider_applications
   SET admin_notes = concat_ws(E'\n', admin_notes, 'Original trade licence link removed (not an https address): ' || left(trade_license_url, 300)),
       trade_license_url = NULL
 WHERE trade_license_url IS NOT NULL
   AND NOT (char_length(trade_license_url) <= 2048 AND trade_license_url ~* '^https://[^[:space:]<>"]+$');
ALTER TABLE public.provider_applications DROP CONSTRAINT IF EXISTS provider_applications_trade_license_https;
ALTER TABLE public.provider_applications ADD CONSTRAINT provider_applications_trade_license_https CHECK (
  trade_license_url IS NULL OR (char_length(trade_license_url) <= 2048 AND trade_license_url ~* '^https://[^[:space:]<>"]+$'));

UPDATE public.providers
   SET admin_notes = concat_ws(E'\n', admin_notes, 'Original trade licence link removed (not an https address): ' || left(trade_license_url, 300)),
       trade_license_url = NULL
 WHERE trade_license_url IS NOT NULL
   AND NOT (char_length(trade_license_url) <= 2048 AND trade_license_url ~* '^https://[^[:space:]<>"]+$');
ALTER TABLE public.providers DROP CONSTRAINT IF EXISTS providers_trade_license_https;
ALTER TABLE public.providers ADD CONSTRAINT providers_trade_license_https CHECK (
  trade_license_url IS NULL OR (char_length(trade_license_url) <= 2048 AND trade_license_url ~* '^https://[^[:space:]<>"]+$'));

-- D-12: which agreement version the application was submitted under, and when the applicant accepted it.
ALTER TABLE public.provider_applications
  ADD COLUMN IF NOT EXISTS agreement_id UUID REFERENCES public.legal_agreements(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS agreement_version VARCHAR(20),
  ADD COLUMN IF NOT EXISTS agreed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.stamp_provider_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agreement public.legal_agreements;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_agreement FROM public.legal_agreements
   WHERE agreement_key = 'provider_agreement' AND status = 'published'
   ORDER BY published_at DESC NULLS LAST LIMIT 1;
  IF v_agreement.id IS NULL THEN
    RAISE EXCEPTION 'The provider agreement has not been published yet, so applications are closed' USING ERRCODE = '22023';
  END IF;
  -- Evidence and review fields are written by the server, never by the applicant.
  NEW.status := 'pending';
  NEW.agreement_id := v_agreement.id;
  NEW.agreement_version := v_agreement.version;
  NEW.agreed_at := (SELECT min(a.accepted_at) FROM public.agreement_acceptances a
                     WHERE a.user_id = NEW.user_id AND a.agreement_id = v_agreement.id);
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.admin_notes := NULL;
  NEW.rejection_reason := NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.stamp_provider_application() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS provider_application_stamp_before_insert ON public.provider_applications;
CREATE TRIGGER provider_application_stamp_before_insert
  BEFORE INSERT ON public.provider_applications
  FOR EACH ROW EXECUTE FUNCTION public.stamp_provider_application();

SELECT set_config('request.jwt.claims', '', true);
