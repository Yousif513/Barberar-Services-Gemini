-- GOV-FIX M-2, M-3, L-1, L-4 (docs/reviews/2026-10-10-security-gov1.md).
--
-- M-2. admin_role() trusted the aal claim of a still-valid access token. admin_reset_mfa (the containment step) deletes the
--      account's sessions, but an access token issued before kept console power until it expired. The console role now also
--      requires the token's session (the session_id claim Supabase Auth puts in every access token) to still exist and not be
--      past its not_after time. supabase/config.toml cuts jwt_expiry to 900 seconds for the same reason.
-- M-3. Step-up (a TOTP code in the last 5 minutes) was missing on commands the Q6 list names: data-request decisions,
--      promotion-code configuration, sponsored attribution voids, payout request review, API settings and key revocation,
--      and the server export recorder. (admin_save_fee_rule no longer exists: fee changes go through
--      admin_propose_fee_rule_change, which has step-up. run_daily_psp_reconciliation gained step-up in MONEY-1.)
-- L-1. purge_expired_audit_logs compared current_user, which inside SECURITY DEFINER is always the owner, so the check passed
--      for every caller and only the EXECUTE grant protected it. It now checks session_user (the login role).
-- L-4. require_recent_login accepted any amr entry, including recovery and invite links and anything a refresh might add. It
--      now counts only methods where the person proved a credential: password, one-time code, TOTP, WebAuthn, SSO, OAuth.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- M-2: the session behind the token must still exist
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.session_is_live()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(auth.jwt()->>'session_id', '') !~ '^[0-9a-fA-F-]{36}$' THEN FALSE
    ELSE EXISTS (
      SELECT 1 FROM auth.sessions s
       WHERE s.id = (auth.jwt()->>'session_id')::uuid
         AND s.user_id = auth.uid()
         AND (s.not_after IS NULL OR s.not_after > now()))
  END;
$$;
REVOKE ALL ON FUNCTION public.session_is_live() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.session_is_live() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.admin_role
    FROM public.profiles p
    JOIN public.admin_role_assignments a ON a.user_id = p.id
   WHERE p.id = auth.uid()
     AND p.role = 'admin'
     AND COALESCE(auth.jwt()->>'aal', '') = 'aal2'
     AND NOT EXISTS (SELECT 1 FROM public.mfa_verification_failures l WHERE l.user_id = p.id AND l.locked_at IS NOT NULL)
     AND public.session_is_live();
$$;

-- The console explains a revoked session instead of showing an empty console.
SELECT pg_temp.patch_function('public.admin_session_state()'::regprocedure,
$q$    'locked', v_locked,$q$,
$q$    'locked', v_locked,
    'session_live', public.session_is_live(),$q$);

-- ---------------------------------------------------------------------------------------------------------------------
-- M-3: step-up on the remaining Q6 commands
-- ---------------------------------------------------------------------------------------------------------------------

DO $govfix$
DECLARE
  f RECORD;
  v_def TEXT;
  v_new TEXT;
  v_hits INTEGER := 0;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('admin_update_data_request', 'admin_save_promo_code', 'admin_set_promo_code_active',
                         'admin_void_sponsored_attribution', 'admin_review_payout_request', 'admin_set_api_setting',
                         'admin_revoke_api_key', 'admin_record_export')
  LOOP
    v_def := replace(pg_get_functiondef(f.oid), E'\r\n', E'\n');
    IF v_def ~ 'require_recent_mfa\(' THEN
      CONTINUE;
    END IF;
    IF position(E'\nBEGIN\n' IN v_def) = 0 THEN
      RAISE EXCEPTION 'GOV-FIX M-3: no body start found in %', f.oid::regprocedure;
    END IF;
    v_new := regexp_replace(v_def, E'\nBEGIN\n', E'\nBEGIN\n  PERFORM public.require_recent_mfa();\n');
    EXECUTE v_new;
    v_hits := v_hits + 1;
  END LOOP;
  IF v_hits < 8 THEN
    RAISE EXCEPTION 'GOV-FIX M-3: expected 8 commands to gain step-up, patched %', v_hits;
  END IF;
END
$govfix$;

-- ---------------------------------------------------------------------------------------------------------------------
-- L-1: the retention purge checks the login role, not the definer
-- ---------------------------------------------------------------------------------------------------------------------

SELECT pg_temp.patch_function('public.purge_expired_audit_logs()'::regprocedure,
$q$current_user NOT IN ('postgres', 'supabase_admin')$q$,
$q$session_user NOT IN ('postgres', 'supabase_admin')$q$);

-- ---------------------------------------------------------------------------------------------------------------------
-- L-4: re-authentication counts only methods that prove a credential
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.require_recent_login(p_window INTERVAL DEFAULT INTERVAL '10 minutes')
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest NUMERIC;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' OR auth.uid() IS NULL THEN
    RETURN;
  END IF;
  -- Not counted: recovery and invite links, magic links, email change and sign-up confirmations, anonymous sign-in, and
  -- token_refresh, none of which proves the person holds the account's credential now.
  v_latest := public.session_amr_latest(ARRAY['password', 'otp', 'totp', 'mfa/totp', 'phone', 'mfa/phone', 'webauthn', 'mfa/webauthn',
                                              'sso/saml', 'oauth']);
  IF v_latest IS NULL OR to_timestamp(v_latest) < now() - p_window THEN
    RAISE EXCEPTION 'Sign in again to confirm it is you, then repeat this change (re-authentication required within % minutes)',
      EXTRACT(EPOCH FROM p_window)::integer / 60
      USING ERRCODE = '42501', HINT = 'reauth_required';
  END IF;
END;
$$;
