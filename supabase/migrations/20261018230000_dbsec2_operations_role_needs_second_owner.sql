-- E2E observation (docs/reviews/2026-10-17-e2e-suite.md): granting the operations console role applied at once on one owner's
-- word, although operations holds personal.read (audited reads of customer personal data) and privacy.manage (the PDPL
-- request queue). H-2 (20261010410000) made a grant wait for a different owner only when it added a money, IBAN, role,
-- MFA, settings, alert, break-glass or rewards permission.
--
-- Personal-data and privacy permissions are now privileged too, so a grant that adds personal.read, privacy.manage or
-- privacy.approve follows the same different-owner approval (never break-glass) as finance or owner. Analyst holds no
-- permission and still applies at once (decision dbsec2-analyst-grant-immediate: read-only aggregates, no personal data).
-- Taking power away still applies at once.
CREATE OR REPLACE FUNCTION public.console_permission_is_privileged(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_permission LIKE 'money.%'
      OR p_permission IN ('iban.approve', 'iban.reveal', 'roles.manage', 'mfa.reset', 'settings.manage', 'alerts.acknowledge',
                          'break_glass.use', 'break_glass.review', 'rewards.approve', 'health.break_glass',
                          'personal.read', 'privacy.manage', 'privacy.approve');
$$;
REVOKE ALL ON FUNCTION public.console_permission_is_privileged(TEXT) FROM PUBLIC, anon, authenticated;
