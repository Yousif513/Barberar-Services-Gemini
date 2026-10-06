-- Migration: 20261005190000_audit_values_by_allow_list.sql
-- The audit trigger now sits on every table (20261005170000). QA (qa-claude-release-gate, round 3) showed what that
-- costs when values are logged by a deny-list of column names: an administrator completing a booking copied the
-- customer's name, address and links (message queue variables) into the permanent log, direct edits of customer
-- notes and staff leave reasons were copied whole, and one bulk statement wrote one log row per affected row.
--   * Values are now recorded by allow-list. Numbers, booleans and nulls are always recorded; a text value is recorded
--     only on the money and configuration tables listed below, or when the column's name says it is a status, key,
--     identifier, date or amount. Every other change is recorded as "changed" with no value, so free text, names,
--     addresses and structured payloads never enter the log. Bank accounts keep their last four digits.
--   * More than 5 audited row changes in one transaction are summarised: the first 5 are logged, then one summary
--     row says the rest were not itemised. The command that caused them still writes its own audit entry.

CREATE OR REPLACE FUNCTION public.audit_admin_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old JSONB := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_new JSONB := CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  -- Columns whose values never enter the log, even on the listed tables: personal and contact details, bank details,
  -- secrets, codes and free text.
  v_sensitive TEXT := '(iban|phone|email|first_name|last_name|full_name|national_id|gender|address|token|secret|api_key|wathq|recipient_|walk_in_|comment|details|admin_note|^code$|^name$|^message$|buyer|url|uri|webhook)';
  -- Columns whose text value is a state, key, identifier, date or amount and is safe to log on any table.
  v_safe_name TEXT := '(^|_)(status|state|role|type|kind|source|channel|currency|enabled|active|verified|default|priority|decision|resolution|stage|mode|env|locale|language|key|id|at|date|time|count|number|percent|percentage|rate|amount|price|fee|total|share|balance|quantity|order)($|_)';
  -- Money and configuration tables: the values are the point of the record.
  v_full_tables TEXT[] := ARRAY['platform_settings', 'fee_rules', 'payment_methods', 'transactional_ledger', 'refund_requests',
    'payout_requests', 'payout_allocations', 'provider_fee_invoices', 'psp_reconciliation_runs', 'invoices', 'wallet_credits',
    'gift_cards', 'customer_loyalty', 'loyalty_points_ledger', 'employee_commission_rules', 'platform_feature_flags',
    'legal_agreements', 'promotional_codes', 'providers', 'branches', 'services', 'packages', 'categories', 'integrations',
    'subscription_plans', 'provider_memberships'];
  v_changes JSONB := '{}'::jsonb;
  v_key TEXT;
  v_target TEXT;
  v_actor_is_admin BOOLEAN;
  v_count INTEGER;
  v_old_type TEXT;
  v_new_type TEXT;
BEGIN
  -- Operator actions only: provider, customer and system writes are covered by their own commands.
  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  v_actor_is_admin := public.is_admin()
    OR (TG_TABLE_NAME = 'profiles' AND TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL
        AND (v_old ->> 'id') = auth.uid()::text AND (v_old ->> 'role') = 'admin');
  IF NOT v_actor_is_admin THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- One statement can change thousands of rows; itemise the first five and say so once.
  v_count := COALESCE(NULLIF(current_setting('primora.audit_rows', true), '')::INTEGER, 0) + 1;
  PERFORM set_config('primora.audit_rows', v_count::TEXT, true);
  IF v_count > 6 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF v_count = 6 THEN
    INSERT INTO public.admin_audit_logs (actor_id, action, target_type, target_id, details)
    VALUES (auth.uid(), TG_TABLE_NAME || '.bulk_write', TG_TABLE_NAME, NULL,
            jsonb_build_object('note', 'More than 5 row changes in one transaction; the rest are not itemised.')
              || CASE WHEN NULLIF(current_setting('primora.audit_reason', true), '') IS NOT NULL
                   THEN jsonb_build_object('reason', current_setting('primora.audit_reason', true)) ELSE '{}'::jsonb END);
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(v_old || v_new) LOOP
    IF v_key = 'updated_at' THEN CONTINUE; END IF;
    IF (v_old -> v_key) IS DISTINCT FROM (v_new -> v_key) THEN
      v_old_type := COALESCE(jsonb_typeof(v_old -> v_key), 'null');
      v_new_type := COALESCE(jsonb_typeof(v_new -> v_key), 'null');
      v_changes := v_changes || jsonb_build_object(v_key,
        CASE
          WHEN v_key ~* 'iban' THEN jsonb_build_object('changed', TRUE,
            'before_last4', right(COALESCE(v_old ->> v_key, ''), 4), 'after_last4', right(COALESCE(v_new ->> v_key, ''), 4))
          WHEN v_key ~* v_sensitive AND v_key !~* '^phone_verified' THEN jsonb_build_object('changed', TRUE)
          WHEN v_old_type IN ('number', 'boolean', 'null') AND v_new_type IN ('number', 'boolean', 'null') THEN
            jsonb_build_object('before', v_old -> v_key, 'after', v_new -> v_key)
          WHEN TG_TABLE_NAME = ANY (v_full_tables) THEN jsonb_build_object('before', v_old -> v_key, 'after', v_new -> v_key)
          WHEN v_old_type IN ('number', 'boolean', 'null', 'string') AND v_new_type IN ('number', 'boolean', 'null', 'string')
               AND v_key ~* v_safe_name THEN jsonb_build_object('before', v_old -> v_key, 'after', v_new -> v_key)
          ELSE jsonb_build_object('changed', TRUE)
        END);
    END IF;
  END LOOP;
  IF TG_OP = 'UPDATE' AND v_changes = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  v_target := COALESCE(v_new ->> 'id', v_old ->> 'id');
  INSERT INTO public.admin_audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    CASE WHEN v_target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_target::uuid END,
    jsonb_build_object('changes', v_changes)
      || CASE WHEN v_new ? 'key' OR v_old ? 'key' THEN jsonb_build_object('key', COALESCE(v_new ->> 'key', v_old ->> 'key')) ELSE '{}'::jsonb END
      || CASE WHEN NULLIF(current_setting('primora.audit_reason', true), '') IS NOT NULL
           THEN jsonb_build_object('reason', current_setting('primora.audit_reason', true)) ELSE '{}'::jsonb END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.audit_admin_write() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Three more findings from the same round
-- ---------------------------------------------------------------------------
-- A. A booking command answers a booking the caller has no part in exactly as it answers a missing one (the
--    reschedule command also checked the booking's status first, which would have told a stranger it was completed).
--    The functions are patched in place by text so their long bodies are not copied; a patch that finds nothing to
--    change fails the migration instead of passing silently.
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_signature REGPROCEDURE, p_from TEXT, p_to TEXT)
RETURNS VOID LANGUAGE plpgsql AS $patch$
DECLARE
  v_def TEXT := pg_get_functiondef(p_signature);
  v_new TEXT := replace(v_def, p_from, p_to);
BEGIN
  IF v_new = v_def THEN
    RAISE EXCEPTION 'patch target not found in %', p_signature;
  END IF;
  EXECUTE v_new;
END;
$patch$;

SELECT pg_temp.patch_function('public.reschedule_booking(uuid, timestamptz, uuid, text)'::regprocedure,
  $f$  IF v_booking.status NOT IN ('confirmed', 'pending_payment') THEN$f$,
  $t$  IF NOT (public.is_admin() OR public.is_booking_staff(v_booking.id, v_user_id) OR v_booking.customer_id = v_user_id) THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_booking.status NOT IN ('confirmed', 'pending_payment') THEN$t$);
SELECT pg_temp.patch_function('public.customer_confirm_attendance(uuid)'::regprocedure,
  $f$'Not authorized to confirm this booking' USING ERRCODE = '42501'$f$, $t$'Booking not found' USING ERRCODE = 'P0002'$t$);
SELECT pg_temp.patch_function('public.generate_zatca_tax_invoice(uuid)'::regprocedure,
  $f$'Not authorized to view this invoice' USING ERRCODE = '42501'$f$, $t$'Booking not found' USING ERRCODE = 'P0002'$t$);

-- B. Every administrator command that takes a reason asks for the same thing: three characters.
SELECT pg_temp.patch_function('public.moderate_review(uuid, varchar, text)'::regprocedure,
  $f$IF p_status = 'hidden' AND NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN$f$,
  $t$IF p_status IN ('hidden', 'flagged') AND char_length(TRIM(COALESCE(p_reason, ''))) < 3 THEN$t$);
SELECT pg_temp.patch_function('public.reject_provider_application(uuid, text)'::regprocedure,
  $f$IF NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN$f$,
  $t$IF char_length(TRIM(COALESCE(p_reason, ''))) < 3 THEN$t$);
SELECT pg_temp.patch_function('public.resolve_booking_dispute(uuid, varchar, text, numeric)'::regprocedure,
  $f$IF NULLIF(TRIM(COALESCE(p_admin_notes, '')), '') IS NULL THEN$f$,
  $t$IF char_length(TRIM(COALESCE(p_admin_notes, ''))) < 3 THEN$t$);

-- C. A staff member cannot approve their own leave: only the provider's owner, a delegate with the staff permission,
--    an administrator or the system moves a leave row to approved.
CREATE OR REPLACE FUNCTION public.enforce_leave_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes_approval BOOLEAN;
BEGIN
  -- Two things need an approver: becoming approved, and changing the dates or the person of leave that is already
  -- approved (otherwise a staff member could widen leave the owner approved).
  v_changes_approval := (NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved'))
    OR (TG_OP = 'UPDATE' AND OLD.status = 'approved'
        AND (NEW.start_date IS DISTINCT FROM OLD.start_date OR NEW.end_date IS DISTINCT FROM OLD.end_date
             OR NEW.employee_id IS DISTINCT FROM OLD.employee_id));
  IF v_changes_approval THEN
    IF COALESCE(auth.jwt()->>'role', '') = 'service_role' OR auth.uid() IS NULL OR public.is_admin() THEN
      RETURN NEW;
    END IF;
    IF NOT EXISTS (
      SELECT 1
        FROM public.employees e
        JOIN public.branches b ON b.id = e.branch_id
        JOIN public.providers p ON p.id = b.provider_id
       WHERE e.id = NEW.employee_id
         AND (p.owner_id = auth.uid() OR public.can_access_provider_operation(p.id, b.id, 'staff'))
    ) THEN
      RAISE EXCEPTION 'Leave is approved and changed by the provider, not by the staff member who asked for it' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_leave_approval() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_enforce_leave_approval ON public.employee_time_off;
CREATE TRIGGER trg_enforce_leave_approval
  BEFORE INSERT OR UPDATE ON public.employee_time_off
  FOR EACH ROW EXECUTE FUNCTION public.enforce_leave_approval();
