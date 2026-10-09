-- M-22 and M-23 of docs/reviews/2026-10-08-security-money.md.
--
-- M-22. confirm_booking_payment is the money-confirming command of the payment webhook (service role). It rejects other callers itself, but
-- it was still executable by `authenticated`, unlike confirm_purchase_payment and confirm_membership_payment. EXECUTE is now service_role only.
--
-- M-23. `authenticated` held table-level INSERT, UPDATE and DELETE on tables (wallet credits, the ledger, fee invoices, payout requests, money
-- columns of bookings, ...) that have no policy permitting that write to a signed-in user: row level security stopped it, but one permissive
-- policy added later would have exposed money columns. The grants are now derived from the policies, as the explicit grants migration does:
-- a privilege stays only where a permissive policy for that command applies to authenticated (or to everyone). A privilege held only on some
-- columns is judged the same way. Reads are untouched.

REVOKE ALL ON FUNCTION public.confirm_booking_payment(UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(UUID, TEXT, NUMERIC) TO service_role;

DO $revoke$
DECLARE
  r RECORD;
  v_auth OID := (SELECT oid FROM pg_roles WHERE rolname = 'authenticated');
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS rel,
           COALESCE(bool_or(pol.polcmd IN ('a', '*')), FALSE) AS wants_insert,
           COALESCE(bool_or(pol.polcmd IN ('w', '*')), FALSE) AS wants_update,
           COALESCE(bool_or(pol.polcmd IN ('d', '*')), FALSE) AS wants_delete
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_policy pol ON pol.polrelid = c.oid AND pol.polpermissive
           AND (pol.polroles = '{0}'::oid[] OR v_auth = ANY (pol.polroles))
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
     GROUP BY c.oid
  LOOP
    IF NOT r.wants_insert AND has_any_column_privilege('authenticated', r.rel, 'INSERT') THEN
      EXECUTE format('REVOKE INSERT ON %s FROM authenticated', r.rel);
    END IF;
    IF NOT r.wants_update AND has_any_column_privilege('authenticated', r.rel, 'UPDATE') THEN
      EXECUTE format('REVOKE UPDATE ON %s FROM authenticated', r.rel);
    END IF;
    IF NOT r.wants_delete AND has_table_privilege('authenticated', r.rel, 'DELETE') THEN
      EXECUTE format('REVOKE DELETE ON %s FROM authenticated', r.rel);
    END IF;
  END LOOP;
END
$revoke$;
