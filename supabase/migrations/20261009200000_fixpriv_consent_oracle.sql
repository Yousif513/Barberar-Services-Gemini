-- P-02 (privacy review 2026-10-08): has_active_consent(uuid, text) is SECURITY DEFINER and executable by every signed-in user, so any
-- user could ask whether ANY other person had granted marketing, whatsapp or health_data consent. Only the person themself, an
-- administrator, or a trusted context without a signed-in user (service role, cron, definer-internal calls made by the platform) may ask.
-- A signed-in caller always has auth.uid() set, so the platform's own internal callers (service role / jobs) are unaffected.
CREATE OR REPLACE FUNCTION public.has_active_consent(p_user_id UUID, p_purpose TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NOT NULL AND p_user_id IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM (
      SELECT status
      FROM public.consents
      WHERE user_id = p_user_id
        AND purpose = p_purpose
      ORDER BY created_at DESC
      LIMIT 1
    ) latest
    WHERE latest.status = 'granted'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.has_active_consent(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_consent(UUID, TEXT) TO authenticated, service_role;
