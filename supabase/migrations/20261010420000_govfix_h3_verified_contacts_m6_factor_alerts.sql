-- GOV-FIX H-3 and M-6 (docs/reviews/2026-10-10-security-gov1.md).
--
-- H-3. Out-of-band governance notices (IBAN change requested/approved/rejected, break-glass, MFA lockout/reset, console role
-- changes) were addressed to profiles.email and profiles.phone_number, which the account holder edits freely. Someone who took
-- over a provider account set their own contacts first, so the "your bank account is changing" notice reached the attacker.
--   * Recipients now come from auth.users only: the email when email_confirmed_at is set, the phone when phone_confirmed_at is
--     set. The address is snapshotted into the notice row when the notice is queued (governance_notifications.destination).
--   * A verified email or phone that was replaced in the last 30 days is notified too ("previous_verified"), so a change of
--     IBAN (or anything else) reaches both the old and the new channel (Q3).
--   * Every change of a verified contact is recorded (account_contact_changes, written by a trigger on auth.users), and a
--     provider bank-account change is refused for 48 hours after the owner's verified email or phone changed.
--   * An account with no verified contact gets a 'skipped' row that says so, instead of silence.
--   * No sender reads governance_notifications yet: that remains gap governance-notifications-have-no-delivery-worker (the
--     email/SMS provider and its credentials are an owner decision).
--   * Console sessions no longer read the address column: notices hold personal contact data.
-- M-6. A verified MFA factor added to an administrator account raises a security alert (mfa_factor_added), writes an audit
--   event and notifies the account's verified contacts, so a factor planted from a stolen session is visible. The number of
--   factors per account drops to 2 in supabase/config.toml (hosted setting: gap hosted-auth-settings-must-match-gov1).

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Verified contact changes
-- ---------------------------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.account_contact_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  -- The previously verified address, kept so the old channel is told about later sensitive changes; NULL when the old one was
  -- never verified.
  old_value TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_account_contact_changes_user ON public.account_contact_changes (user_id, changed_at DESC);
ALTER TABLE public.account_contact_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_contact_changes FROM anon, authenticated;
GRANT SELECT, INSERT ON public.account_contact_changes TO service_role;

CREATE OR REPLACE FUNCTION public.record_account_contact_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.email IS DISTINCT FROM NEW.email
     OR (OLD.email_confirmed_at IS NOT NULL AND NEW.email_confirmed_at IS NULL) THEN
    INSERT INTO public.account_contact_changes (user_id, channel, old_value)
    VALUES (NEW.id, 'email', CASE WHEN OLD.email_confirmed_at IS NOT NULL THEN NULLIF(lower(btrim(COALESCE(OLD.email, ''))), '') END);
  END IF;
  IF OLD.phone IS DISTINCT FROM NEW.phone
     OR (OLD.phone_confirmed_at IS NOT NULL AND NEW.phone_confirmed_at IS NULL) THEN
    INSERT INTO public.account_contact_changes (user_id, channel, old_value)
    VALUES (NEW.id, 'sms', CASE WHEN OLD.phone_confirmed_at IS NOT NULL THEN NULLIF(btrim(COALESCE(OLD.phone, '')), '') END);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_account_contact_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_record_account_contact_change ON auth.users;
CREATE TRIGGER trg_record_account_contact_change
  AFTER UPDATE OF email, phone, email_confirmed_at, phone_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.record_account_contact_change();

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. The outbox snapshots the verified address
-- ---------------------------------------------------------------------------------------------------------------------

ALTER TABLE public.governance_notifications
  ADD COLUMN IF NOT EXISTS destination TEXT,
  ADD COLUMN IF NOT EXISTS contact_source TEXT;
ALTER TABLE public.governance_notifications DROP CONSTRAINT IF EXISTS governance_notifications_contact_source_check;
ALTER TABLE public.governance_notifications ADD CONSTRAINT governance_notifications_contact_source_check
  CHECK (contact_source IS NULL OR contact_source IN ('current_verified', 'previous_verified'));

-- Console sessions see that a notice exists and its state, never the address it goes to.
REVOKE SELECT ON public.governance_notifications FROM authenticated;
GRANT SELECT (id, recipient_user_id, channel, template_key, payload, status, created_at, sent_at, error_message, contact_source)
  ON public.governance_notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.queue_governance_notice(p_user_id UUID, p_template TEXT, p_payload JSONB DEFAULT '{}'::jsonb)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_email_ok BOOLEAN;
  v_phone TEXT;
  v_phone_ok BOOLEAN;
  v_found BOOLEAN;
  v_count INTEGER := 0;
  r RECORD;
BEGIN
  SELECT TRUE, NULLIF(lower(btrim(COALESCE(u.email, ''))), ''), u.email_confirmed_at IS NOT NULL,
         NULLIF(btrim(COALESCE(u.phone, '')), ''), u.phone_confirmed_at IS NOT NULL
    INTO v_found, v_email, v_email_ok, v_phone, v_phone_ok
    FROM auth.users u WHERE u.id = p_user_id;
  IF v_found IS NULL THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT DISTINCT ON (x.channel, x.destination) x.channel, x.destination, x.source
      FROM (
        SELECT 'email'::text AS channel, v_email AS destination, 'current_verified'::text AS source, 1 AS rank
         WHERE v_email_ok AND v_email IS NOT NULL
        UNION ALL
        SELECT 'sms', v_phone, 'current_verified', 1
         WHERE v_phone_ok AND v_phone IS NOT NULL
        UNION ALL
        SELECT c.channel, c.old_value, 'previous_verified', 2
          FROM public.account_contact_changes c
         WHERE c.user_id = p_user_id AND c.old_value IS NOT NULL AND c.changed_at > now() - INTERVAL '30 days'
      ) x
     ORDER BY x.channel, x.destination, x.rank
  LOOP
    INSERT INTO public.governance_notifications (recipient_user_id, channel, template_key, payload, destination, contact_source)
    VALUES (p_user_id, r.channel, p_template, COALESCE(p_payload, '{}'::jsonb), r.destination, r.source);
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    INSERT INTO public.governance_notifications (recipient_user_id, channel, template_key, payload, status, error_message)
    VALUES (p_user_id, 'email', p_template, COALESCE(p_payload, '{}'::jsonb), 'skipped',
            'No verified email or phone on the account; nothing can be sent out of band');
  END IF;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_governance_notice(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. No bank-account change within 48 hours of a verified contact change
-- ---------------------------------------------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

SELECT pg_temp.patch_function('public.gov_request_payout_destination(uuid,text,text,text)'::regprocedure,
$q$  SELECT * INTO v_provider FROM public.providers WHERE id = p_provider_id;$q$,
$q$  SELECT * INTO v_provider FROM public.providers WHERE id = p_provider_id;
  -- GOV-FIX H-3: a takeover usually changes the contact first. No bank-account change for 48 hours after the owner's
  -- verified email or phone changed, so the notice reaches the old channel while the change can still be stopped.
  IF EXISTS (SELECT 1 FROM public.account_contact_changes c
              WHERE c.user_id = v_provider.owner_id AND c.changed_at > now() - INTERVAL '48 hours') THEN
    RAISE EXCEPTION 'The account''s verified email or phone changed in the last 48 hours; bank account changes are paused until %',
      to_char(((SELECT MAX(c.changed_at) FROM public.account_contact_changes c WHERE c.user_id = v_provider.owner_id) + INTERVAL '48 hours')
              AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || ' (Riyadh)'
      USING ERRCODE = '42501', HINT = 'contact_recently_changed';
  END IF;$q$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. M-6: an MFA factor added to an administrator account is an alert
-- ---------------------------------------------------------------------------------------------------------------------

ALTER TABLE public.security_alerts DROP CONSTRAINT IF EXISTS security_alerts_kind_check;
ALTER TABLE public.security_alerts ADD CONSTRAINT security_alerts_kind_check CHECK (kind IN (
  'mfa_lockout', 'mfa_reset', 'iban_reveal_volume', 'break_glass_used', 'console_role_changed', 'iban_change_requested',
  'health_break_glass', 'mfa_factor_added'));

CREATE OR REPLACE FUNCTION public.alert_admin_mfa_factor_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verified INTEGER;
BEGIN
  IF NEW.status::text <> 'verified' OR (TG_OP = 'UPDATE' AND OLD.status::text = 'verified') THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.user_id AND p.role = 'admin') THEN
    RETURN NEW;
  END IF;
  SELECT COUNT(*) INTO v_verified FROM auth.mfa_factors f WHERE f.user_id = NEW.user_id AND f.status::text = 'verified';
  INSERT INTO public.security_alerts (kind, user_id, details)
  VALUES ('mfa_factor_added', NEW.user_id, jsonb_build_object('factor_id', NEW.id, 'factor_type', NEW.factor_type::text,
          'verified_factors', v_verified, 'added_by', auth.uid()));
  INSERT INTO public.admin_audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (NEW.user_id, 'mfa.factor_added', 'profiles', NEW.user_id,
          jsonb_build_object('factor_id', NEW.id, 'factor_type', NEW.factor_type::text, 'verified_factors', v_verified, 'actor_role', 'supabase_auth'));
  PERFORM public.queue_governance_notice(NEW.user_id, 'mfa_factor_added',
    jsonb_build_object('factor_type', NEW.factor_type::text, 'verified_factors', v_verified));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.alert_admin_mfa_factor_added() FROM PUBLIC, anon, authenticated;

DO $govfix$
BEGIN
  IF to_regclass('auth.mfa_factors') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_alert_admin_mfa_factor_added ON auth.mfa_factors';
    EXECUTE 'CREATE TRIGGER trg_alert_admin_mfa_factor_added AFTER INSERT OR UPDATE OF status ON auth.mfa_factors
             FOR EACH ROW EXECUTE FUNCTION public.alert_admin_mfa_factor_added()';
  END IF;
END
$govfix$;
