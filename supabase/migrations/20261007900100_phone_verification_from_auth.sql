-- A phone number becomes "verified" on the profile when the sign-in service confirms it.
--
-- Review finding D-01 (critical). The profile took its verification flag only when the auth row was INSERTED. A phone
-- sign-up inserts the row first (unconfirmed) and sets phone_confirmed_at later, when the one-time code is entered, so
-- profiles.phone_verified stayed false for every customer and no WhatsApp message could ever be sent: the messaging queue
-- requires a verified phone. The tests hid it because the test helper set the flag by hand.
--
-- This trigger follows the auth row: whenever its phone or its confirmation time changes the profile is brought in line.
-- GoTrue stores the number without the leading "+", the profile keeps it in international form (+9665XXXXXXXX).
--
-- Review finding D-06. Phone numbers were globally UNIQUE and writable by their owner, so anyone could claim a stranger's
-- number as their own (unverified) and make that person's sign-up fail. Only a VERIFIED number is unique now: you can
-- type any number into your profile, but the number belongs to whoever proves they control it.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_number_key;
DROP INDEX IF EXISTS public.profiles_phone_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_verified_phone_key
  ON public.profiles (phone_number)
  WHERE phone_verified AND phone_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_profile_phone_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_e164 TEXT := CASE WHEN regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g') = '' THEN NULL ELSE '+' || regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g') END;
  v_verified BOOLEAN := (regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g') <> '' AND NEW.phone_confirmed_at IS NOT NULL);
  v_claims TEXT := current_setting('request.jwt.claims', true);
BEGIN
  IF v_e164 IS NULL THEN
    RETURN NEW;
  END IF;

  -- The profile guard that clears the verification flag when a phone number is edited lets the service role through.
  -- This is the service writing: say so for the length of the statement, then put the caller's claims back.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  UPDATE public.profiles p
     SET phone_number = v_e164,
         phone_verified = v_verified,
         phone_verified_at = CASE
           WHEN v_verified AND (p.phone_verified IS NOT TRUE OR p.phone_number IS DISTINCT FROM v_e164) THEN NEW.phone_confirmed_at
           WHEN v_verified THEN p.phone_verified_at
           ELSE NULL
         END
   WHERE p.id = NEW.id
     AND (p.phone_number IS DISTINCT FROM v_e164 OR p.phone_verified IS DISTINCT FROM v_verified);
  PERFORM set_config('request.jwt.claims', COALESCE(v_claims, ''), true);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_phone_from_auth() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_profile_phone_from_auth ON auth.users;
CREATE TRIGGER trg_sync_profile_phone_from_auth
  AFTER UPDATE OF phone, phone_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_phone_from_auth();

-- A sign-up that arrives already confirmed (an administrator-created user, or a provider that confirms at insert) takes the
-- same international form. Patched in place so the rest of handle_new_user stays as the latest migration left it.
DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n'); -- a checkout with Windows line endings stores them in function bodies
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n'); -- the migration file itself may have been checked out with CRLF
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

SELECT pg_temp.patch_function(
  'public.handle_new_user()'::regprocedure,
  $from$    NEW.phone,
    (NEW.phone IS NOT NULL$from$,
  $to$    CASE WHEN COALESCE(NEW.phone, '') = '' THEN NULL ELSE '+' || regexp_replace(NEW.phone, '\D', '', 'g') END,
    (NEW.phone IS NOT NULL$to$
);
