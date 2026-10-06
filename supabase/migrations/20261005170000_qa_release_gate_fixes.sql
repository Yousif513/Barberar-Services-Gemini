-- Migration: 20261005170000_qa_release_gate_fixes.sql
-- Fixes for the defects the independent QA pass (qa-claude-release-gate) reproduced against the migrated schema.
-- None of them needs a business decision; each is the database refusing something the console never asks for.
--   1. A provider owner or delegate could change a booking's status with a direct write: a paid booking was
--      cancelled with no refund, a future booking was completed or marked no-show, and the rewards trigger fired.
--      The direct UPDATE policies are removed; cancel_booking, mark_booking_no_show and
--      employee_update_booking_status (which enforce time, refund and reason rules) are the only path.
--   2. The audit trigger covered only tables whose policy text mentioned is_admin(). It is now attached to every
--      base table in the public schema (except the audit logs themselves), so an administrator's direct write to
--      invoices, reconciliation runs, fee invoices or message templates is recorded; demoting yourself is
--      recorded too.
--   3. Issued ZATCA tax invoices could be edited or deleted by an administrator. Administrators now only read
--      them, and nobody can change an issued invoice's figures, hash, QR value or seller, or delete it.
--   4. An administrator could insert a payout request with a bank account the provider never supplied and then
--      release it. Payout requests can now only come from request_provider_payout, which only the provider's
--      owner may call and which checks the balance and the IBAN.
--   5. admin_create_refund_request built its idempotency key from a value generated anew on every call, so a replay created a
--      second refund. The key is now derived from the booking, amount and reason (or supplied by the caller).
--   6. admin_release_ledger_item and admin_release_payout took no reason: both now require one and record it.
--   7. set_user_role took no reason, could demote the last administrator or the caller, and was not recorded
--      when the caller demoted themselves. It now needs a reason, refuses to change the caller's own role or to
--      remove the last administrator, serializes concurrent role changes and writes an audit entry.
--   8. Every signed-in account could read every approved staff leave row including its free-text reason (health
--      and family details). Only the staff member, the provider's owner and administrators read the table now;
--      the availability function reads it on the caller's behalf.
--   9. get_booking_address_secure raised on every call (it read columns that do not exist).
--  10. The booking commands accepted a blank reason from an administrator and answered a foreign booking
--      differently from a missing one (revealing which booking ids exist).

-- ---------------------------------------------------------------------------
-- 1. Bookings change status only through the commands
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Providers update branch bookings" ON public.bookings;
DROP POLICY IF EXISTS "Delegated booking updates" ON public.bookings;

-- ---------------------------------------------------------------------------
-- 2. Audit by behaviour: every base table in public
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_admin_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old JSONB := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_new JSONB := CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  -- Columns whose values never enter the log: personal and contact details, bank details, secrets, codes
  -- and free text. The log records that they changed, and for bank accounts the last four digits.
  v_sensitive TEXT := '(iban|phone|email|first_name|last_name|full_name|national_id|gender|address|token|secret|api_key|wathq|recipient_|walk_in_|comment|details|admin_note|^code$|^name$|^message$)';
  v_changes JSONB := '{}'::jsonb;
  v_key TEXT;
  v_target TEXT;
  v_actor_is_admin BOOLEAN;
BEGIN
  -- Operator actions only: provider, customer and system writes are covered by their own commands.
  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  -- An administrator who removes their own role is still an operator action: the role is read from the row as it
  -- was, because after the write is_admin() no longer says so.
  v_actor_is_admin := public.is_admin()
    OR (TG_TABLE_NAME = 'profiles' AND TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL
        AND (v_old ->> 'id') = auth.uid()::text AND (v_old ->> 'role') = 'admin');
  IF NOT v_actor_is_admin THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(v_old || v_new) LOOP
    IF v_key = 'updated_at' THEN CONTINUE; END IF;
    IF (v_old -> v_key) IS DISTINCT FROM (v_new -> v_key) THEN
      v_changes := v_changes || jsonb_build_object(v_key,
        CASE
          WHEN v_key ~* 'iban' THEN jsonb_build_object('changed', TRUE,
            'before_last4', right(COALESCE(v_old ->> v_key, ''), 4), 'after_last4', right(COALESCE(v_new ->> v_key, ''), 4))
          WHEN v_key ~* v_sensitive AND v_key !~* '^phone_verified' THEN jsonb_build_object('changed', TRUE)
          ELSE jsonb_build_object('before', v_old -> v_key, 'after', v_new -> v_key)
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

-- Attached to every base table, not to the tables whose policy text happens to mention is_admin(): an
-- administrator reaches a table through whatever policy it has (including an inline role check), and the trigger
-- only records writes made by an administrator session. Only the audit logs themselves are left out (the trigger
-- writes to the first, and the second is itself a log). Tables owned by an extension are skipped.
DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOR v_table IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND NOT c.relispartition
       AND c.relname NOT IN ('admin_audit_logs', 'integration_audit_log')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    BEGIN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_admin_write ON public.%I', v_table);
      EXECUTE format('CREATE TRIGGER trg_audit_admin_write AFTER INSERT OR UPDATE OR DELETE ON public.%I
                      FOR EACH ROW EXECUTE FUNCTION public.audit_admin_write()', v_table);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'audit trigger not attached to %: not the owner', v_table;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Issued tax invoices are append-only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins view and manage all tax invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins view all tax invoices" ON public.invoices;
CREATE POLICY "Admins view all tax invoices" ON public.invoices FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.protect_issued_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'An issued tax invoice cannot be deleted; correct it with a credit note' USING ERRCODE = '22023';
  END IF;
  -- The reporting status may advance, and the links to a booking or customer may be cleared when that record
  -- is removed; nothing else about an issued invoice may change.
  IF (to_jsonb(NEW) - 'zatca_status' - 'booking_id' - 'customer_id') IS DISTINCT FROM (to_jsonb(OLD) - 'zatca_status' - 'booking_id' - 'customer_id')
     OR (NEW.booking_id IS DISTINCT FROM OLD.booking_id AND NEW.booking_id IS NOT NULL)
     OR (NEW.customer_id IS DISTINCT FROM OLD.customer_id AND NEW.customer_id IS NOT NULL) THEN
    RAISE EXCEPTION 'An issued tax invoice cannot be changed; correct it with a credit note' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_issued_invoice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_issued_invoice ON public.invoices;
CREATE TRIGGER trg_protect_issued_invoice
  BEFORE UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.protect_issued_invoice();

-- ---------------------------------------------------------------------------
-- 4. Payout requests come only from the provider's own request
-- ---------------------------------------------------------------------------
-- No INSERT policy at all: request_provider_payout (SECURITY DEFINER) is the only way to create one, so the
-- balance and IBAN checks cannot be skipped by a direct insert, by the owner or by an administrator.
DROP POLICY IF EXISTS "Authenticated create authorized payout requests" ON public.payout_requests;

CREATE OR REPLACE FUNCTION public.request_provider_payout(
  p_provider_id UUID,
  p_amount NUMERIC,
  p_bank_name TEXT,
  p_iban TEXT
)
RETURNS public.payout_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_iban TEXT := UPPER(regexp_replace(COALESCE(p_iban, ''), '\s+', '', 'g'));
  v_available NUMERIC(10,2);
  v_request public.payout_requests;
BEGIN
  -- Only the provider's owner supplies bank details for the provider's earnings; an administrator reviews and
  -- releases the request the owner made, never originates one.
  IF v_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = v_user_id) THEN
    RAISE EXCEPTION 'Not authorized to request payouts for this provider' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payout amount must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF v_iban !~ '^SA[0-9]{22}$' THEN
    RAISE EXCEPTION 'Invalid Saudi IBAN: SA followed by 22 digits' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(TRIM(COALESCE(p_bank_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Bank name is required' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.providers WHERE id = p_provider_id FOR UPDATE;
  v_available := public.provider_available_balance(p_provider_id);
  IF p_amount > v_available THEN
    RAISE EXCEPTION 'Requested amount (% SAR) exceeds the available balance (% SAR)', p_amount, v_available
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.payout_requests (provider_id, requested_by, amount, bank_name, iban, status)
  VALUES (p_provider_id, v_user_id, ROUND(p_amount, 2), TRIM(p_bank_name), v_iban, 'requested')
  RETURNING * INTO v_request;

  PERFORM public.write_audit_log('payout.requested', 'payout_requests', v_request.id,
    jsonb_build_object('provider_id', p_provider_id, 'amount', v_request.amount));
  RETURN v_request;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. A replayed administrator refund creates one refund
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_create_refund_request(UUID, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION public.admin_create_refund_request(
  p_booking_id UUID,
  p_amount NUMERIC,
  p_reason TEXT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
  v_key TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator role required' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'The refund amount must be greater than zero' USING ERRCODE = '22023';
  END IF;
  -- The same booking, amount and reason is the same refund; a second, separate refund of the same size needs
  -- its own idempotency key.
  v_key := 'admin:' || p_booking_id::text || ':'
        || COALESCE(NULLIF(TRIM(COALESCE(p_idempotency_key, '')), ''), md5(ROUND(p_amount, 2)::text || '|' || lower(v_reason)));
  PERFORM set_config('primora.audit_reason', v_reason, true);
  v_id := public.create_refund_request_internal(p_booking_id, p_amount, 'admin', v_reason, v_key);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Nothing refundable remains on this booking' USING ERRCODE = '22023';
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_create_refund_request(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_refund_request(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Settling provider money takes a reason
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_release_ledger_item(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.admin_release_ledger_item(
  p_ledger_id UUID,
  p_reason TEXT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.transactional_ledger;
  v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can settle ledger rows' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.transactional_ledger WHERE id = p_ledger_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Ledger row not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.payout_status <> 'pending' THEN
    RETURN jsonb_build_object('status', 'already_' || v_row.payout_status, 'idempotent', TRUE);
  END IF;
  IF EXISTS (SELECT 1 FROM public.payout_allocations WHERE ledger_id = p_ledger_id) THEN
    RAISE EXCEPTION 'This row is partly allocated to a payout; release it through the payout request' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('primora.audit_reason', v_reason, true);
  UPDATE public.transactional_ledger SET payout_status = 'released' WHERE id = p_ledger_id;
  PERFORM public.write_audit_log('ledger.manually_settled', 'transactional_ledger', p_ledger_id,
    jsonb_build_object('provider_share', v_row.provider_share, 'idempotency_key', p_idempotency_key, 'reason', v_reason));
  RETURN jsonb_build_object('status', 'released', 'ledger_id', p_ledger_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_release_ledger_item(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_release_ledger_item(UUID, TEXT, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_release_payout(UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.admin_release_payout(
  p_payout_request_id UUID,
  p_idempotency_key TEXT,
  p_reason TEXT,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.payout_requests;
  v_remaining NUMERIC(10,2);
  v_row RECORD;
  v_take NUMERIC(10,2);
  v_rows INT := 0;
  v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can release payouts' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Idempotency key is required for payout release' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admin_audit_logs
             WHERE action = 'payout.released' AND details->>'idempotency_key' = p_idempotency_key) THEN
    RETURN jsonb_build_object('status', 'already_processed', 'idempotent', TRUE);
  END IF;

  SELECT * INTO v_request FROM public.payout_requests WHERE id = p_payout_request_id FOR UPDATE;
  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Payout request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_request.status NOT IN ('requested', 'processing') THEN
    RAISE EXCEPTION 'Payout request is %', v_request.status USING ERRCODE = '23505';
  END IF;

  PERFORM set_config('primora.audit_reason', v_reason, true);
  v_remaining := v_request.amount;
  FOR v_row IN
    SELECT tl.id, tl.provider_share - COALESCE((SELECT SUM(pa.amount) FROM public.payout_allocations pa WHERE pa.ledger_id = tl.id), 0) AS open_amount
    FROM public.transactional_ledger tl
    WHERE tl.provider_id = v_request.provider_id AND tl.payout_status = 'pending'
    ORDER BY tl.created_at, tl.id
    FOR UPDATE OF tl
  LOOP
    EXIT WHEN v_remaining <= 0;
    CONTINUE WHEN v_row.open_amount <= 0;
    v_take := LEAST(v_row.open_amount, v_remaining);
    INSERT INTO public.payout_allocations (payout_request_id, ledger_id, amount) VALUES (v_request.id, v_row.id, v_take);
    IF v_take = v_row.open_amount THEN
      UPDATE public.transactional_ledger SET payout_status = 'released', payout_request_id = v_request.id WHERE id = v_row.id;
    END IF;
    v_remaining := v_remaining - v_take;
    v_rows := v_rows + 1;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Ledger balance (% SAR short) does not cover this payout', v_remaining USING ERRCODE = '22023';
  END IF;

  UPDATE public.payout_requests
  SET status = 'paid', processed_at = now(), processed_by = auth.uid(),
      admin_note = COALESCE(p_admin_note, admin_note)
  WHERE id = v_request.id;

  PERFORM public.write_audit_log('payout.released', 'payout_requests', v_request.id,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'provider_id', v_request.provider_id,
                       'amount', v_request.amount, 'ledger_rows', v_rows, 'note', p_admin_note, 'reason', v_reason));

  RETURN jsonb_build_object('status', 'success', 'payout_request_id', v_request.id,
                            'released_amount', v_request.amount, 'ledger_rows_count', v_rows);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_release_payout(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_release_payout(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Changing a role: reason, never your own, never the last administrator, always recorded
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.set_user_role(UUID, public.user_role);
CREATE OR REPLACE FUNCTION public.set_user_role(
  target_user_id UUID,
  target_role public.user_role,
  p_reason TEXT
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
  v_before public.profiles;
  v_profile public.profiles;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator role required' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  IF target_user_id = v_actor THEN
    RAISE EXCEPTION 'You cannot change your own role; ask another administrator' USING ERRCODE = '22023';
  END IF;

  -- One role change at a time, so two administrators cannot remove each other in the same instant.
  PERFORM pg_advisory_xact_lock(hashtext('primora.set_user_role'));

  SELECT * INTO v_before FROM public.profiles WHERE id = target_user_id FOR UPDATE;
  IF v_before.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_before.role = 'admin' AND target_role <> 'admin'
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin' AND id <> target_user_id) THEN
    RAISE EXCEPTION 'The last administrator cannot be removed' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('primora.audit_reason', v_reason, true);
  UPDATE public.profiles SET role = target_role WHERE id = target_user_id RETURNING * INTO v_profile;

  PERFORM public.write_audit_log('profile.role_changed', 'profiles', target_user_id,
    jsonb_build_object('role_before', v_before.role, 'role_after', target_role, 'reason', v_reason));
  RETURN v_profile;
END;
$$;
REVOKE ALL ON FUNCTION public.set_user_role(UUID, public.user_role, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, public.user_role, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Staff leave reasons are private; availability is read on the caller's behalf
-- ---------------------------------------------------------------------------
-- The remaining policy ("Employees request own time off and owners manage", FOR ALL) lets the staff member, the
-- provider's owner and administrators read and manage their rows. Customers and other providers read nothing;
-- get_available_slots runs with the definer's rights, so a day off still removes the slots.
DROP POLICY IF EXISTS "Authenticated can view approved employee time off" ON public.employee_time_off;
ALTER FUNCTION public.get_available_slots(UUID, DATE, INTEGER, TIMESTAMPTZ[], TIMESTAMPTZ[]) SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 9. The address of a booking, for the people it is meant for
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_booking_address_secure(
  p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_booking public.bookings;
  v_branch public.branches;
  v_provider public.providers;
  v_revealed_address TEXT;
BEGIN
  IF v_user_id IS NULL AND COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  SELECT * INTO v_branch FROM public.branches WHERE id = v_booking.branch_id;
  SELECT * INTO v_provider FROM public.providers WHERE id = v_branch.provider_id;

  -- A booking the caller has no part in is answered like one that does not exist.
  IF v_booking.id IS NULL OR NOT (
       v_booking.customer_id = v_user_id
    OR public.is_booking_staff(v_booking.id, v_user_id)
    OR v_provider.owner_id = v_user_id
    OR public.is_admin()
    OR COALESCE(auth.jwt()->>'role', '') = 'service_role'
  ) THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  -- Address privacy rule: a home address is revealed only once the booking is confirmed.
  IF v_booking.is_home_service THEN
    IF v_booking.status IN ('confirmed', 'completed') THEN
      v_revealed_address := v_booking.home_address_text;
      IF v_booking.address_revealed_at IS NULL THEN
        UPDATE public.bookings SET address_revealed_at = NOW() WHERE id = p_booking_id;
      END IF;
    ELSE
      v_revealed_address := 'Address hidden until booking confirmation (محجوب حتى تأكيد الحجز)';
    END IF;
  ELSE
    v_revealed_address := COALESCE(v_branch.address_text_ar, v_branch.address_text_en, 'Salon location');
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'booking_id', p_booking_id,
    'is_home_service', v_booking.is_home_service,
    'status', v_booking.status,
    'address', v_revealed_address
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Booking commands: a reason from administrators, and no hint about which bookings exist
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_booking(
  target_booking_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_booking public.bookings;
  v_provider public.providers;
  v_actor TEXT;
  v_captured NUMERIC(10,2);
  v_hours NUMERIC;
  v_fee NUMERIC(10,2) := 0;
  v_refund NUMERIC(10,2) := 0;
BEGIN
  IF v_user_id IS NULL AND COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = target_booking_id FOR UPDATE;

  IF v_booking.id IS NOT NULL AND (public.is_admin() OR COALESCE(auth.jwt()->>'role', '') = 'service_role') THEN
    v_actor := 'admin';
  ELSIF v_booking.id IS NOT NULL AND v_booking.customer_id = v_user_id THEN
    v_actor := 'customer';
  ELSIF v_booking.id IS NOT NULL AND public.is_booking_staff(v_booking.id, v_user_id) THEN
    v_actor := 'provider';
  ELSE
    -- A booking that does not exist and one the caller has no part in are answered the same way.
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_actor = 'admin' AND COALESCE(auth.jwt()->>'role', '') <> 'service_role'
     AND char_length(TRIM(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;

  IF v_booking.status NOT IN ('pending_payment', 'confirmed') THEN
    RAISE EXCEPTION 'A % booking cannot be cancelled', v_booking.status USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO v_provider
  FROM public.branches br JOIN public.providers p ON p.id = br.provider_id
  WHERE br.id = v_booking.branch_id;

  v_captured := public.booking_captured_amount(v_booking.id);
  v_hours := EXTRACT(EPOCH FROM (v_booking.scheduled_at - now())) / 3600.0;

  IF v_captured > 0 THEN
    IF v_actor = 'customer' AND v_hours < COALESCE(v_provider.free_cancellation_hours, 24) THEN
      v_fee := LEAST(ROUND(v_captured * COALESCE(v_provider.late_cancellation_fee_percent, 0) / 100.0, 2), v_captured);
    END IF;
    -- Provider- or admin-initiated cancellations always refund the customer in full.
    v_refund := v_captured - v_fee;
  END IF;

  UPDATE public.bookings
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor,
      cancellation_reason = COALESCE(NULLIF(TRIM(p_reason), ''), 'Cancelled by ' || v_actor),
      cancellation_fee = v_fee,
      refund_amount = v_refund
  WHERE id = v_booking.id
  RETURNING * INTO v_booking;

  PERFORM public.booking_release_discounts(v_booking.id);

  IF v_refund > 0 THEN
    PERFORM public.create_refund_request_internal(
      v_booking.id, v_refund,
      CASE WHEN v_actor = 'customer' THEN 'customer_cancellation' ELSE 'provider_cancellation' END,
      COALESCE(NULLIF(TRIM(p_reason), ''), 'Booking cancelled by ' || v_actor),
      'cancel:' || v_booking.id::text
    );
  END IF;
  PERFORM public.ledger_settle_unperformed_booking(v_booking.id);

  PERFORM public.write_audit_log('booking.cancelled', 'bookings', v_booking.id,
    jsonb_build_object('cancelled_by', v_actor, 'hours_before_start', ROUND(v_hours, 2),
                       'captured', v_captured, 'fee', v_fee, 'refund', v_refund, 'reason', p_reason));

  RETURN v_booking;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_booking_no_show(
  target_booking_id UUID,
  p_reason TEXT DEFAULT 'Customer did not show up'
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_booking public.bookings;
  v_provider public.providers;
  v_captured NUMERIC(10,2);
  v_fee NUMERIC(10,2);
  v_refund NUMERIC(10,2);
  v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = target_booking_id FOR UPDATE;
  IF v_booking.id IS NULL OR NOT (public.is_booking_staff(v_booking.id, v_user_id) OR public.is_admin()) THEN
    -- A booking that does not exist and one the caller has no part in are answered the same way.
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  IF public.is_admin() AND COALESCE(auth.jwt()->>'role', '') <> 'service_role'
     AND (v_reason IS NULL OR char_length(v_reason) < 3) THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  v_reason := COALESCE(v_reason, 'Customer did not show up');
  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed bookings can be marked as no-show' USING ERRCODE = '22023';
  END IF;
  IF v_booking.scheduled_at > now() THEN
    RAISE EXCEPTION 'A booking cannot be marked as a no-show before its start time' USING ERRCODE = '22023';
  END IF;
  IF v_booking.checked_in_at IS NOT NULL THEN
    RAISE EXCEPTION 'The customer was checked in; complete the booking instead' USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO v_provider
  FROM public.branches br JOIN public.providers p ON p.id = br.provider_id
  WHERE br.id = v_booking.branch_id;

  v_captured := public.booking_captured_amount(v_booking.id);
  v_fee := LEAST(ROUND(v_captured * COALESCE(v_provider.no_show_fee_percent, 0) / 100.0, 2), v_captured);
  v_refund := v_captured - v_fee;

  UPDATE public.bookings
  SET status = 'no_show',
      no_show_at = now(),
      cancellation_reason = v_reason,
      cancellation_fee = v_fee,
      refund_amount = v_refund
  WHERE id = v_booking.id
  RETURNING * INTO v_booking;

  PERFORM public.booking_release_discounts(v_booking.id);

  IF v_refund > 0 THEN
    PERFORM public.create_refund_request_internal(v_booking.id, v_refund, 'no_show_remainder',
      'Deposit above the provider''s no-show fee', 'noshow:' || v_booking.id::text);
  END IF;
  PERFORM public.ledger_settle_unperformed_booking(v_booking.id);

  PERFORM public.write_audit_log('booking.no_show', 'bookings', v_booking.id,
    jsonb_build_object('captured', v_captured, 'fee', v_fee, 'refund', v_refund, 'reason', v_reason));

  RETURN v_booking;
END;
$$;

CREATE OR REPLACE FUNCTION public.employee_update_booking_status(
  p_booking_id UUID,
  p_new_status VARCHAR,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_booking public.bookings;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL OR NOT (public.is_booking_staff(p_booking_id, v_user_id) OR public.is_admin()) THEN
    -- A booking that does not exist and one the caller has no part in are answered the same way.
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_new_status = 'in_service' THEN
    IF v_booking.status <> 'confirmed' THEN
      RAISE EXCEPTION 'Only confirmed bookings can be checked in' USING ERRCODE = '22023';
    END IF;
    UPDATE public.bookings SET checked_in_at = COALESCE(checked_in_at, now()) WHERE id = p_booking_id;
    PERFORM public.write_audit_log('booking.checked_in', 'bookings', p_booking_id, jsonb_build_object('notes', p_notes));
  ELSIF p_new_status = 'completed' THEN
    IF public.is_admin() AND char_length(TRIM(COALESCE(p_notes, ''))) < 3 THEN
      RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
    END IF;
    IF v_booking.status <> 'confirmed' THEN
      RAISE EXCEPTION 'Only confirmed bookings can be completed' USING ERRCODE = '22023';
    END IF;
    IF v_booking.scheduled_at > now() THEN
      RAISE EXCEPTION 'A booking cannot be completed before its start time' USING ERRCODE = '22023';
    END IF;
    UPDATE public.bookings SET status = 'completed' WHERE id = p_booking_id;
    PERFORM public.write_audit_log('booking.completed', 'bookings', p_booking_id, jsonb_build_object('notes', p_notes));
  ELSIF p_new_status = 'no_show' THEN
    PERFORM public.mark_booking_no_show(p_booking_id, p_notes);
  ELSIF p_new_status = 'cancelled' THEN
    PERFORM public.cancel_booking(p_booking_id, COALESCE(NULLIF(TRIM(COALESCE(p_notes, '')), ''), CASE WHEN public.is_admin() THEN NULL ELSE 'Cancelled by provider' END));
  ELSE
    RAISE EXCEPTION 'Unsupported status: %', p_new_status USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  RETURN jsonb_build_object('success', TRUE, 'booking_id', p_booking_id, 'status', v_booking.status,
                            'checked_in_at', v_booking.checked_in_at);
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Approving a provider application takes a reason
-- ---------------------------------------------------------------------------
-- Approval creates a provider and its first branch and upgrades the applicant's role, so like every other
-- privileged command it records why. The commission argument keeps its default (fees follow the fee rules).
DROP FUNCTION IF EXISTS public.approve_provider_application(UUID, NUMERIC);
CREATE OR REPLACE FUNCTION public.approve_provider_application(
  p_application_id UUID,
  p_reason TEXT,
  p_commission_percentage NUMERIC DEFAULT 15.00
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.provider_applications;
  v_provider_id UUID;
  v_branch_id UUID;
  v_vat TEXT;
  v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator role required to approve provider applications.' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_app FROM public.provider_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'Provider application not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_app.status <> 'pending' THEN
    RAISE EXCEPTION 'Application is already %.', v_app.status USING ERRCODE = '23505';
  END IF;
  IF v_app.latitude IS NULL OR v_app.longitude IS NULL THEN
    RAISE EXCEPTION 'The branch location (latitude/longitude) is required before approval.' USING ERRCODE = '22023';
  END IF;

  v_vat := CASE WHEN COALESCE(v_app.tax_number, '') ~ '^3[0-9]{13}3$' THEN v_app.tax_number ELSE NULL END;
  PERFORM set_config('primora.audit_reason', v_reason, true);

  INSERT INTO public.providers (owner_id, type, business_name_en, business_name_ar, trade_license_url,
                                commission_percentage, status, contact_email, contact_phone, cr_number, vat_number)
  VALUES (v_app.user_id, v_app.business_type, v_app.business_name_en, v_app.business_name_ar, v_app.trade_license_url,
          COALESCE(p_commission_percentage, 15.00), 'active', v_app.contact_email, v_app.contact_phone,
          NULLIF(v_app.cr_number, ''), v_vat)
  RETURNING id INTO v_provider_id;

  INSERT INTO public.branches (provider_id, name_en, name_ar, address_text_en, address_text_ar, latitude, longitude,
                               city, district)
  VALUES (v_provider_id, v_app.business_name_en, v_app.business_name_ar, v_app.address_text, v_app.address_text,
          v_app.latitude, v_app.longitude, COALESCE(NULLIF(v_app.city, ''), 'Riyadh'), v_app.district)
  RETURNING id INTO v_branch_id;

  UPDATE public.profiles SET role = 'provider_owner'::public.user_role
  WHERE id = v_app.user_id AND role = 'customer';

  UPDATE public.provider_applications
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = v_app.id;

  PERFORM public.write_audit_log('provider_application.approved', 'provider_applications', v_app.id,
    jsonb_build_object('provider_id', v_provider_id, 'branch_id', v_branch_id, 'owner_id', v_app.user_id, 'reason', v_reason));

  RETURN jsonb_build_object('success', TRUE, 'provider_id', v_provider_id, 'branch_id', v_branch_id,
                            'application_id', v_app.id, 'status', 'approved');
END;
$$;
REVOKE ALL ON FUNCTION public.approve_provider_application(UUID, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_provider_application(UUID, TEXT, NUMERIC) TO authenticated;
