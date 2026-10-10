-- GOV-FIX H-2 and M-4 (docs/reviews/2026-10-10-security-gov1.md): no self-approval by proxy, and no self-review.
--
-- H-2. An owner could make an account they control finance (admin_set_console_role took effect at once) and approve their own
-- payouts, refunds and IBAN changes from it, or demote every other approver to unlock break-glass. The report's fix:
--   1. A role change that ADDS a privileged permission (money.*, iban.*, roles.manage, mfa.reset, settings.manage,
--      alerts.acknowledge, break_glass.*, rewards.approve, health.break_glass) is a governance request ('role_change') that a
--      different owner approves. Break-glass never applies to it, so a sole owner cannot add approvers alone.
--      Changes that add nothing privileged (to analyst or operations, owner -> finance, removal) still apply at once:
--      taking power away must stay fast.
--   2. A newly granted approver decides no request for 72 hours (admin_role_assignments.decisions_allowed_from).
--   3. A decision is refused when the decider's console role was assigned by the requester within the last 30 days.
--   4. Break-glass is refused for 7 days after any administrator who could have approved that kind of request was demoted
--      or removed (admin_role_history, written by a trigger on every assignment change, whoever makes it).
-- M-4. The owner who used break-glass cannot record its independent review, and nobody acknowledges a security alert about
--      themselves or about an action they took.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Role history, approval columns and the privileged-permission rule
-- ---------------------------------------------------------------------------------------------------------------------

ALTER TABLE public.admin_role_assignments
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS approval_request_id UUID,
  ADD COLUMN IF NOT EXISTS decisions_allowed_from TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.admin_role_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role_before TEXT,
  role_after TEXT,
  changed_by UUID,
  approval_request_id UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_role_history_changed ON public.admin_role_history (changed_at DESC);
ALTER TABLE public.admin_role_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Administrators read console role history" ON public.admin_role_history;
CREATE POLICY "Administrators read console role history" ON public.admin_role_history
  FOR SELECT TO authenticated USING (public.is_admin());
SELECT public.grant_data_api_access('public.admin_role_history');
SELECT public.attach_admin_audit_trigger('public.admin_role_history');
-- Append-only: clients never write it; the service role may add a row but never changes or removes one.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.admin_role_history FROM anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.admin_role_history FROM service_role;

CREATE OR REPLACE FUNCTION public.record_admin_role_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.admin_role IS NOT DISTINCT FROM NEW.admin_role THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.admin_role_history (user_id, role_before, role_after, changed_by, approval_request_id)
  VALUES (CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END,
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.admin_role END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.admin_role END,
          auth.uid(),
          NULLIF(current_setting('primora.governance_approval', true), '')::uuid);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.record_admin_role_history() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_record_admin_role_history ON public.admin_role_assignments;
CREATE TRIGGER trg_record_admin_role_history
  AFTER INSERT OR UPDATE OF admin_role OR DELETE ON public.admin_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.record_admin_role_history();

-- Permissions that let a person approve, settle, reveal, configure or govern. A role that gains one needs a second owner.
CREATE OR REPLACE FUNCTION public.console_permission_is_privileged(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_permission LIKE 'money.%'
      OR p_permission IN ('iban.approve', 'iban.reveal', 'roles.manage', 'mfa.reset', 'settings.manage', 'alerts.acknowledge',
                          'break_glass.use', 'break_glass.review', 'rewards.approve', 'health.break_glass');
$$;

CREATE OR REPLACE FUNCTION public.console_role_change_adds_privilege(p_from TEXT, p_to TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_to IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.admin_role_permissions rp
     WHERE rp.admin_role = p_to AND public.console_permission_is_privileged(rp.permission)
       AND NOT EXISTS (SELECT 1 FROM public.admin_role_permissions o WHERE o.admin_role = p_from AND o.permission = rp.permission));
$$;

REVOKE ALL ON FUNCTION public.console_permission_is_privileged(TEXT), public.console_role_change_adds_privilege(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. The role_change approval kind
-- ---------------------------------------------------------------------------------------------------------------------

ALTER TABLE public.admin_approval_requests DROP CONSTRAINT IF EXISTS admin_approval_requests_kind_check;
ALTER TABLE public.admin_approval_requests ADD CONSTRAINT admin_approval_requests_kind_check CHECK (kind IN (
  'payout_release', 'refund', 'iban_change', 'setting_change', 'ledger_settlement', 'ledger_adjustment', 'fee_rule_change',
  'payout_hold', 'reward_program', 'role_change'));

CREATE OR REPLACE FUNCTION public.governance_approver_permission(p_kind TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_kind
    WHEN 'payout_release' THEN 'money.payout'
    WHEN 'refund' THEN 'money.refund'
    WHEN 'iban_change' THEN 'iban.approve'
    WHEN 'setting_change' THEN 'money.config'
    WHEN 'ledger_settlement' THEN 'money.payout'
    WHEN 'ledger_adjustment' THEN 'money.ledger'
    WHEN 'fee_rule_change' THEN 'money.config'
    WHEN 'payout_hold' THEN 'money.payout'
    WHEN 'reward_program' THEN 'rewards.approve'
    WHEN 'role_change' THEN 'roles.manage'
  END;
$$;

SELECT pg_temp.patch_function('public.governance_execute(uuid)'::regprocedure,
  $q$'payout_hold', 'reward_program') THEN$q$, $q$'payout_hold', 'reward_program', 'role_change') THEN$q$);

-- Applies an approved privileged role grant in the approving owner's session.
CREATE OR REPLACE FUNCTION public.gov_exec_role_change(p_req public.admin_approval_requests)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target UUID := p_req.target_id;
  v_role TEXT := p_req.payload->>'admin_role';
  v_profile public.profiles;
  v_before TEXT;
  v_allowed_from TIMESTAMPTZ := now() + INTERVAL '72 hours';
BEGIN
  IF NOT public.governance_execution_active('role_change', v_target) THEN
    RAISE EXCEPTION 'A privileged console role is granted only by an approved request' USING ERRCODE = '42501';
  END IF;
  IF p_req.break_glass THEN
    RAISE EXCEPTION 'A console role is never granted through break-glass' USING ERRCODE = '42501';
  END IF;
  IF NOT public.admin_can('roles.manage') THEN
    RAISE EXCEPTION 'Only a different owner can approve a console role' USING ERRCODE = '42501';
  END IF;
  IF v_target = auth.uid() THEN
    RAISE EXCEPTION 'You cannot approve a console role for your own account' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_target FOR UPDATE;
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_profile.role IN ('provider_owner', 'provider_employee') THEN
    RAISE EXCEPTION 'A provider account cannot also be an administrator; use a separate account' USING ERRCODE = '22023';
  END IF;
  SELECT admin_role INTO v_before FROM public.admin_role_assignments WHERE user_id = v_target;
  IF v_profile.role <> 'admin' THEN
    v_before := NULL;
  END IF;
  IF v_before IS DISTINCT FROM NULLIF(p_req.payload->>'role_before', '') THEN
    RAISE EXCEPTION 'The person''s console role changed after this request was made; reject it and request again' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('primora.audit_reason', p_req.request_reason, true);
  -- The assignment is written before the profile becomes an administrator, so the default read-only role is never inserted.
  INSERT INTO public.admin_role_assignments (user_id, admin_role, assigned_by, assigned_at, reason, approved_by, approval_request_id, decisions_allowed_from)
  VALUES (v_target, v_role, p_req.requested_by, now(), p_req.request_reason, auth.uid(), p_req.id, v_allowed_from)
  ON CONFLICT (user_id) DO UPDATE SET admin_role = EXCLUDED.admin_role, assigned_by = EXCLUDED.assigned_by, assigned_at = EXCLUDED.assigned_at,
    reason = EXCLUDED.reason, approved_by = EXCLUDED.approved_by, approval_request_id = EXCLUDED.approval_request_id,
    decisions_allowed_from = EXCLUDED.decisions_allowed_from;
  IF v_profile.role <> 'admin' THEN
    UPDATE public.profiles SET role = 'admin' WHERE id = v_target;
  END IF;

  PERFORM public.write_audit_log('admin.console_role_changed', 'profiles', v_target,
    jsonb_build_object('role_before', v_before, 'role_after', v_role, 'reason', p_req.request_reason, 'requested_by', p_req.requested_by,
                       'approved_by', auth.uid(), 'approval_request_id', p_req.id, 'decisions_allowed_from', v_allowed_from)
      || public.request_client_info());
  INSERT INTO public.security_alerts (kind, user_id, details)
  VALUES ('console_role_changed', v_target, jsonb_build_object('role_before', v_before, 'role_after', v_role,
          'changed_by', p_req.requested_by, 'approved_by', auth.uid(), 'approval_request_id', p_req.id));
  PERFORM public.queue_governance_notice(v_target, 'console_role_changed',
    jsonb_build_object('role_before', v_before, 'role_after', v_role, 'decisions_allowed_from', v_allowed_from));
  RETURN jsonb_build_object('user_id', v_target, 'admin_role', v_role, 'role_before', v_before, 'decisions_allowed_from', v_allowed_from);
END;
$$;
REVOKE ALL ON FUNCTION public.gov_exec_role_change(public.admin_approval_requests) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. admin_set_console_role: privileged grants wait for a different owner
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_console_role(p_user_id UUID, p_admin_role TEXT, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_role TEXT := NULLIF(btrim(COALESCE(p_admin_role, '')), '');
  v_profile public.profiles;
  v_before TEXT;
  v_pending public.admin_approval_requests;
  v_request JSONB;
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('roles.manage') THEN
    RAISE EXCEPTION 'Only an owner can change console roles' USING ERRCODE = '42501';
  END IF;
  IF v_role IS NOT NULL AND v_role NOT IN ('owner', 'finance', 'operations', 'analyst') THEN
    RAISE EXCEPTION 'Unknown console role' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF p_user_id = v_actor THEN
    RAISE EXCEPTION 'You cannot change your own role; ask another owner' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('primora.set_user_role'));

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_role IS NOT NULL AND v_profile.role IN ('provider_owner', 'provider_employee') THEN
    RAISE EXCEPTION 'A provider account cannot also be an administrator; use a separate account' USING ERRCODE = '22023';
  END IF;
  SELECT admin_role INTO v_before FROM public.admin_role_assignments WHERE user_id = p_user_id;
  IF v_profile.role <> 'admin' THEN
    v_before := NULL;
  END IF;
  IF v_before IS NOT DISTINCT FROM v_role THEN
    RETURN jsonb_build_object('user_id', p_user_id, 'admin_role', v_role, 'changed', FALSE);
  END IF;
  IF v_before = 'owner' AND v_role IS DISTINCT FROM 'owner'
     AND NOT EXISTS (SELECT 1 FROM public.admin_role_assignments a JOIN public.profiles p ON p.id = a.user_id
                      WHERE a.admin_role = 'owner' AND p.role = 'admin' AND a.user_id <> p_user_id) THEN
    RAISE EXCEPTION 'The last owner cannot be removed; make another administrator owner first' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pending FROM public.admin_approval_requests
   WHERE kind = 'role_change' AND target_id = p_user_id AND status = 'pending';

  -- H-2: a grant that adds a privileged permission waits for a different owner; never break-glass.
  IF public.console_role_change_adds_privilege(v_before, v_role) THEN
    IF v_pending.id IS NOT NULL AND v_pending.payload->>'admin_role' IS DISTINCT FROM v_role THEN
      RAISE EXCEPTION 'A different console role for this person is already waiting for approval; withdraw it first' USING ERRCODE = '22023';
    END IF;
    v_request := public.governance_request('role_change', 'profiles', p_user_id, NULL,
      jsonb_build_object('admin_role', v_role, 'role_before', v_before),
      v_reason, jsonb_build_object('user_id', p_user_id, 'role_before', v_before, 'role_after', v_role));
    PERFORM public.queue_governance_notice(p_user_id, 'console_role_change_requested',
      jsonb_build_object('role_before', v_before, 'role_after', v_role, 'approval_id', v_request->>'approval_id'));
    RETURN v_request || jsonb_build_object('user_id', p_user_id, 'admin_role', v_before, 'requested_role', v_role, 'changed', FALSE);
  END IF;

  -- Taking power away (or granting nothing privileged) applies at once; a waiting grant for the person is withdrawn.
  IF v_pending.id IS NOT NULL THEN
    UPDATE public.admin_approval_requests
       SET status = 'cancelled', decided_by = v_actor, decided_at = now(),
           decision_reason = 'Superseded by a direct console role change: ' || v_reason
     WHERE id = v_pending.id;
  END IF;

  PERFORM set_config('primora.audit_reason', v_reason, true);
  IF v_role IS NULL THEN
    UPDATE public.profiles SET role = 'customer' WHERE id = p_user_id;
  ELSE
    INSERT INTO public.admin_role_assignments (user_id, admin_role, assigned_by, assigned_at, reason, approved_by, approval_request_id)
    VALUES (p_user_id, v_role, v_actor, now(), v_reason, NULL, NULL)
    ON CONFLICT (user_id) DO UPDATE SET admin_role = EXCLUDED.admin_role, assigned_by = EXCLUDED.assigned_by,
      assigned_at = EXCLUDED.assigned_at, reason = EXCLUDED.reason, approved_by = NULL, approval_request_id = NULL;
    IF v_profile.role <> 'admin' THEN
      UPDATE public.profiles SET role = 'admin' WHERE id = p_user_id;
    END IF;
  END IF;

  PERFORM public.write_audit_log('admin.console_role_changed', 'profiles', p_user_id,
    jsonb_build_object('role_before', v_before, 'role_after', v_role, 'reason', v_reason) || public.request_client_info());
  INSERT INTO public.security_alerts (kind, user_id, details)
  VALUES ('console_role_changed', p_user_id, jsonb_build_object('role_before', v_before, 'role_after', v_role, 'changed_by', v_actor));
  PERFORM public.queue_governance_notice(p_user_id, 'console_role_changed', jsonb_build_object('role_before', v_before, 'role_after', v_role));
  RETURN jsonb_build_object('status', 'executed', 'user_id', p_user_id, 'admin_role', v_role, 'role_before', v_before, 'changed', TRUE);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_console_role(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_console_role(UUID, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Who may decide: cooling-off and independence from the requester
-- ---------------------------------------------------------------------------------------------------------------------

-- NULL when the caller may decide a request made by p_requested_by; otherwise the reason, for the error and the inbox.
CREATE OR REPLACE FUNCTION public.governance_decider_refusal(p_requested_by UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN a.decisions_allowed_from IS NOT NULL AND a.decisions_allowed_from > now()
      THEN 'Your console role was granted less than 72 hours ago; you can decide requests from '
           || to_char(a.decisions_allowed_from AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || ' (Riyadh)'
    WHEN a.assigned_by IS NOT NULL AND a.assigned_by = p_requested_by AND a.assigned_at > now() - INTERVAL '30 days'
      THEN 'Your console role was assigned by the person who made this request less than 30 days ago; another administrator decides it'
  END
    FROM public.admin_role_assignments a
   WHERE a.user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.governance_decider_refusal(UUID) FROM PUBLIC, anon, authenticated;

-- The time until which break-glass stays closed for this kind: 7 days after an administrator who could approve it was
-- demoted or removed. NULL when nothing blocks it.
CREATE OR REPLACE FUNCTION public.governance_break_glass_blocked_until(p_kind TEXT, p_requester UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT MAX(h.changed_at) + INTERVAL '7 days'
    FROM public.admin_role_history h
   WHERE h.changed_at > now() - INTERVAL '7 days'
     AND h.user_id <> p_requester
     AND h.role_before IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.admin_role_permissions rp
                  WHERE rp.admin_role = h.role_before AND rp.permission = public.governance_approver_permission(p_kind))
     AND NOT EXISTS (SELECT 1 FROM public.admin_role_permissions rp
                      WHERE rp.admin_role = h.role_after AND rp.permission = public.governance_approver_permission(p_kind));
$$;
REVOKE ALL ON FUNCTION public.governance_break_glass_blocked_until(TEXT, UUID) FROM PUBLIC, anon, authenticated;

SELECT pg_temp.patch_function('public.admin_decide_approval(uuid,text,text)'::regprocedure,
$q$  IF NOT public.admin_can(public.governance_approver_permission(v_req.kind)) THEN
    RAISE EXCEPTION 'Your console role cannot decide % requests', v_req.kind USING ERRCODE = '42501';
  END IF;$q$,
$q$  IF NOT public.admin_can(public.governance_approver_permission(v_req.kind)) THEN
    RAISE EXCEPTION 'Your console role cannot decide % requests', v_req.kind USING ERRCODE = '42501';
  END IF;
  -- GOV-FIX H-2: a fresh approver waits 72 hours, and nobody decides for the person who gave them their role in the last 30 days.
  IF public.governance_decider_refusal(v_req.requested_by) IS NOT NULL THEN
    RAISE EXCEPTION '%', public.governance_decider_refusal(v_req.requested_by) USING ERRCODE = '42501', HINT = 'decider_not_independent';
  END IF;$q$);

SELECT pg_temp.patch_function('public.admin_break_glass_execute(uuid,text)'::regprocedure,
$q$  IF public.governance_second_approver_exists(v_req.kind, v_req.requested_by) THEN
    RAISE EXCEPTION 'Another eligible administrator exists; this request waits for their approval' USING ERRCODE = '42501';
  END IF;$q$,
$q$  IF public.governance_second_approver_exists(v_req.kind, v_req.requested_by) THEN
    RAISE EXCEPTION 'Another eligible administrator exists; this request waits for their approval' USING ERRCODE = '42501';
  END IF;
  -- GOV-FIX H-2: demoting or removing the other approvers does not open break-glass for 7 days, and a fresh owner waits 72 hours.
  IF public.governance_break_glass_blocked_until(v_req.kind, v_req.requested_by) IS NOT NULL THEN
    RAISE EXCEPTION 'An administrator who could approve this was demoted or removed recently; break-glass is closed until % (Riyadh)',
      to_char(public.governance_break_glass_blocked_until(v_req.kind, v_req.requested_by) AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI')
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admin_role_assignments WHERE user_id = auth.uid() AND decisions_allowed_from > now()) THEN
    RAISE EXCEPTION 'Your console role was granted less than 72 hours ago; break-glass is not available to you yet' USING ERRCODE = '42501';
  END IF;$q$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. M-4: independent review and alert acknowledgement
-- ---------------------------------------------------------------------------------------------------------------------

-- Whether the caller is the subject of, or took the action behind, an alert.
CREATE OR REPLACE FUNCTION public.security_alert_involves_caller(p_alert public.security_alerts)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    p_alert.user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM unnest(ARRAY['changed_by', 'reset_by', 'actor_id', 'requested_by', 'approved_by', 'added_by']) k
                WHERE p_alert.details->>k = auth.uid()::text));
$$;
REVOKE ALL ON FUNCTION public.security_alert_involves_caller(public.security_alerts) FROM PUBLIC, anon, authenticated;

SELECT pg_temp.patch_function('public.admin_acknowledge_security_alert(uuid,text)'::regprocedure,
$q$  IF v_alert.acknowledged_at IS NOT NULL THEN$q$,
$q$  IF public.security_alert_involves_caller(v_alert) THEN
    RAISE EXCEPTION 'This alert is about you or an action you took; another owner acknowledges it' USING ERRCODE = '42501';
  END IF;
  IF v_alert.acknowledged_at IS NOT NULL THEN$q$);

SELECT pg_temp.patch_function('public.admin_sign_off_break_glass(uuid,text,text,text)'::regprocedure,
$q$  IF v_review.signed_off_at IS NOT NULL THEN$q$,
$q$  IF v_review.actor_id = auth.uid() THEN
    RAISE EXCEPTION 'You used this break-glass; another administrator records its independent review' USING ERRCODE = '42501';
  END IF;
  IF v_review.signed_off_at IS NOT NULL THEN$q$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. The inbox mirrors every rule (the buttons follow the server, they never decide)
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_approval_inbox(p_status TEXT DEFAULT 'pending', p_limit INTEGER DEFAULT 25, p_offset INTEGER DEFAULT 0)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_me UUID := auth.uid();
  v_rows JSONB;
  v_counts JSONB;
  v_matching BIGINT;
  v_reviews JSONB;
  v_settings JSONB;
  v_alerts JSONB;
  v_used NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('pending', 'approved', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Unknown status' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb) INTO v_counts
    FROM (SELECT status, COUNT(*) AS n FROM public.admin_approval_requests GROUP BY status) c;
  SELECT COUNT(*) INTO v_matching FROM public.admin_approval_requests WHERE v_status IS NULL OR status = v_status;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.requested_at DESC, x.id), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT r.id, r.kind, r.status, r.target_type, r.target_id, r.amount_sar, r.summary, r.requested_by, r.requested_role,
             r.requested_at, r.request_reason, r.decided_by, r.decided_at, r.decision_reason, r.break_glass, r.execution_result,
             NULLIF(btrim(COALESCE(rp.first_name, '') || ' ' || COALESCE(rp.last_name, '')), '') AS requested_by_name,
             NULLIF(btrim(COALESCE(dp.first_name, '') || ' ' || COALESCE(dp.last_name, '')), '') AS decided_by_name,
             (SELECT pr.business_name_en FROM public.providers pr WHERE pr.id = (r.summary->>'provider_id')::uuid) AS provider_name_en,
             (SELECT pr.business_name_ar FROM public.providers pr WHERE pr.id = (r.summary->>'provider_id')::uuid) AS provider_name_ar,
             CASE WHEN r.kind = 'role_change' THEN
               (SELECT NULLIF(btrim(COALESCE(tp.first_name, '') || ' ' || COALESCE(tp.last_name, '')), '') FROM public.profiles tp WHERE tp.id = r.target_id)
             END AS target_name,
             (r.status = 'pending' AND r.requested_by <> v_me AND public.admin_can(public.governance_approver_permission(r.kind))
              AND public.governance_decider_refusal(r.requested_by) IS NULL
              AND NOT (r.kind = 'role_change' AND r.target_id = v_me)) AS can_decide,
             CASE WHEN r.status = 'pending' AND r.requested_by <> v_me THEN public.governance_decider_refusal(r.requested_by) END AS decide_blocked_reason,
             (r.status = 'pending' AND r.requested_by = v_me) AS can_cancel,
             (r.status = 'pending' AND r.requested_by = v_me AND r.kind IN ('payout_release', 'refund', 'ledger_adjustment') AND public.admin_can('break_glass.use')
              AND NOT public.governance_second_approver_exists(r.kind, r.requested_by)
              AND public.governance_break_glass_blocked_until(r.kind, r.requested_by) IS NULL
              AND NOT EXISTS (SELECT 1 FROM public.admin_role_assignments a WHERE a.user_id = v_me AND a.decisions_allowed_from > now())) AS can_break_glass,
             CASE WHEN r.status = 'pending' AND r.requested_by = v_me THEN public.governance_break_glass_blocked_until(r.kind, r.requested_by) END AS break_glass_blocked_until
        FROM public.admin_approval_requests r
        LEFT JOIN public.profiles rp ON rp.id = r.requested_by
        LEFT JOIN public.profiles dp ON dp.id = r.decided_by
       WHERE v_status IS NULL OR r.status = v_status
       ORDER BY r.requested_at DESC, r.id
       LIMIT v_limit OFFSET v_offset
    ) x;

  SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.due_at), '[]'::jsonb) INTO v_reviews
    FROM (SELECT g.id, g.approval_request_id, g.actor_id, g.amount_sar, g.justification, g.executed_at, g.due_at, g.signed_off_at,
                 g.reviewer_name, g.document_reference, now() > g.due_at AS overdue,
                 (g.signed_off_at IS NULL AND g.actor_id <> v_me AND public.admin_can('break_glass.review')) AS can_sign_off
            FROM public.break_glass_reviews g WHERE g.signed_off_at IS NULL OR g.signed_off_at > now() - INTERVAL '30 days'
            ORDER BY g.due_at LIMIT 50) b;
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.key), '[]'::jsonb) INTO v_settings
    FROM (SELECT key, value, description_en, description_ar, updated_at FROM public.governance_settings) s;
  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb) INTO v_alerts
    FROM (SELECT sa.id, sa.kind, sa.user_id, sa.details, sa.created_at,
                 (public.admin_can('alerts.acknowledge') AND NOT public.security_alert_involves_caller(sa)) AS can_acknowledge
            FROM public.security_alerts sa WHERE sa.acknowledged_at IS NULL ORDER BY sa.created_at DESC LIMIT 50) a;
  SELECT COALESCE(SUM(amount_sar), 0) INTO v_used FROM public.admin_approval_requests
   WHERE break_glass AND status = 'approved' AND decided_at >= public.riyadh_day_start();

  PERFORM public.write_audit_log('approvals.inbox_read', 'admin_approval_requests', NULL,
    jsonb_build_object('status', v_status, 'limit', v_limit, 'offset', v_offset, 'rows', jsonb_array_length(v_rows)));

  RETURN jsonb_build_object('counts', v_counts, 'matching', v_matching, 'rows', v_rows, 'break_glass_reviews', v_reviews,
                            'settings', v_settings, 'open_alerts', v_alerts, 'break_glass_used_today', v_used,
                            'can_acknowledge_alerts', public.admin_can('alerts.acknowledge'),
                            'can_review_break_glass', public.admin_can('break_glass.review'),
                            'can_propose_settings', public.admin_can('settings.manage'));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_approval_inbox(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approval_inbox(TEXT, INTEGER, INTEGER) TO authenticated;
