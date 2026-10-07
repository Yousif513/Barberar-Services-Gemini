-- R12: a customer's home address is revealed to the provider only once the booking is confirmed, and only through the reveal command.
--
-- bookings.home_address_text / home_address_lat / home_address_lng were readable by the owner of the branch through the bookings
-- policy from the moment the booking existed (even unpaid), and get_booking_address_secure only masked the text when somebody
-- happened to call it. The address now lives in booking_home_addresses:
--   * a BEFORE INSERT trigger on bookings moves whatever booking_create_internal writes into the vault and leaves the three
--     bookings columns empty, so booking_create_internal itself is untouched;
--   * the customer reads their own address at any time;
--   * staff of the business read it directly only after get_booking_address_secure revealed it (which needs a confirmed or
--     completed booking and stamps revealed_at), and not any more once the booking is cancelled;
--   * administrators have no direct read: they use get_booking_address_secure, which records the view in the audit log;
--   * nobody writes the table from a client.
-- The three legacy columns on bookings stay (booking_create_internal, the immutability guard and the history trigger still name
-- them) but are always empty; they can be dropped when booking_create_internal is next rewritten by its owner.

CREATE TABLE IF NOT EXISTS public.booking_home_addresses (
  booking_id UUID PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  address_text TEXT,
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6),
  revealed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT booking_home_addresses_has_a_place CHECK (address_text IS NOT NULL OR (latitude IS NOT NULL AND longitude IS NOT NULL)),
  CONSTRAINT booking_home_addresses_coordinates_together CHECK ((latitude IS NULL) = (longitude IS NULL))
);
ALTER TABLE public.booking_home_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers read own home addresses" ON public.booking_home_addresses;
CREATE POLICY "Customers read own home addresses"
  ON public.booking_home_addresses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b
                  WHERE b.id = booking_home_addresses.booking_id AND b.customer_id = (SELECT auth.uid())));

-- Visible bookings are already limited by the bookings policies (owner, assigned staff, delegated staff); this adds the reveal rule.
DROP POLICY IF EXISTS "Staff read revealed home addresses" ON public.booking_home_addresses;
CREATE POLICY "Staff read revealed home addresses"
  ON public.booking_home_addresses FOR SELECT TO authenticated
  USING (
    revealed_at IS NOT NULL
    AND NOT public.is_admin()
    AND EXISTS (SELECT 1 FROM public.bookings b
                 WHERE b.id = booking_home_addresses.booking_id AND b.status IN ('confirmed', 'completed'))
  );

CREATE OR REPLACE FUNCTION public.move_home_address_to_vault()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_text TEXT := NULLIF(btrim(COALESCE(NEW.home_address_text, '')), '');
BEGIN
  IF NEW.home_address_text IS NOT NULL OR NEW.home_address_lat IS NOT NULL OR NEW.home_address_lng IS NOT NULL THEN
    IF v_text IS NOT NULL OR (NEW.home_address_lat IS NOT NULL AND NEW.home_address_lng IS NOT NULL) THEN
      INSERT INTO public.booking_home_addresses (booking_id, address_text, latitude, longitude)
      VALUES (NEW.id, v_text,
              CASE WHEN NEW.home_address_lng IS NOT NULL THEN NEW.home_address_lat END,
              CASE WHEN NEW.home_address_lat IS NOT NULL THEN NEW.home_address_lng END)
      ON CONFLICT (booking_id) DO NOTHING;
    END IF;
    NEW.home_address_text := NULL;
    NEW.home_address_lat := NULL;
    NEW.home_address_lng := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.move_home_address_to_vault() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_zz_home_address_to_vault ON public.bookings;
CREATE TRIGGER trg_zz_home_address_to_vault
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.move_home_address_to_vault();

-- Addresses already stored on bookings move into the vault, and the columns are emptied. The immutability guard (which compares
-- the coordinates) is switched off for that one statement only.
INSERT INTO public.booking_home_addresses (booking_id, address_text, latitude, longitude, revealed_at)
SELECT b.id, NULLIF(btrim(COALESCE(b.home_address_text, '')), ''),
       CASE WHEN b.home_address_lng IS NOT NULL THEN b.home_address_lat END,
       CASE WHEN b.home_address_lat IS NOT NULL THEN b.home_address_lng END,
       b.address_revealed_at
  FROM public.bookings b
 WHERE (NULLIF(btrim(COALESCE(b.home_address_text, '')), '') IS NOT NULL OR (b.home_address_lat IS NOT NULL AND b.home_address_lng IS NOT NULL))
ON CONFLICT (booking_id) DO NOTHING;

DO $$
DECLARE
  v_trigger TEXT;
BEGIN
  SELECT t.tgname INTO v_trigger FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE t.tgrelid = 'public.bookings'::regclass AND NOT t.tgisinternal AND p.proname = 'protect_booking_immutable_fields' LIMIT 1;
  IF v_trigger IS NOT NULL THEN EXECUTE format('ALTER TABLE public.bookings DISABLE TRIGGER %I', v_trigger); END IF;
  UPDATE public.bookings SET home_address_text = NULL, home_address_lat = NULL, home_address_lng = NULL
   WHERE home_address_text IS NOT NULL OR home_address_lat IS NOT NULL OR home_address_lng IS NOT NULL;
  IF v_trigger IS NOT NULL THEN EXECUTE format('ALTER TABLE public.bookings ENABLE TRIGGER %I', v_trigger); END IF;
END $$;

-- The reveal command reads the vault (patched in place): the customer always sees their own address, staff only once the booking is
-- confirmed or completed (revealing stamps revealed_at), coordinates come with it, and an administrator's view is audited.
DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_def text := replace(pg_get_functiondef(p_sig), chr(13) || chr(10), chr(10));
  v_from text := replace(p_from, chr(13) || chr(10), chr(10));
  v_to text := replace(p_to, chr(13) || chr(10), chr(10));
BEGIN
  IF position(v_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, v_from, v_to);
END $$;

SELECT pg_temp.patch_function('public.get_booking_address_secure(uuid)'::regprocedure,
  $from$  v_revealed_address TEXT;$from$,
  $to$  v_revealed_address TEXT;
  v_home public.booking_home_addresses;$to$);
SELECT pg_temp.patch_function('public.get_booking_address_secure(uuid)'::regprocedure,
  $from$  IF v_booking.is_home_service THEN
    IF v_booking.status IN ('confirmed', 'completed') THEN
      v_revealed_address := v_booking.home_address_text;$from$,
  $to$  IF v_booking.is_home_service AND public.is_admin() AND v_booking.customer_id IS DISTINCT FROM v_user_id
     AND v_provider.owner_id IS DISTINCT FROM v_user_id AND v_booking.status IN ('confirmed', 'completed') THEN
    PERFORM public.write_audit_log('booking.home_address_viewed', 'bookings', v_booking.id, '{}'::jsonb);
  END IF;

  IF v_booking.is_home_service THEN
    IF v_booking.status IN ('confirmed', 'completed') OR v_booking.customer_id = v_user_id THEN
      SELECT * INTO v_home FROM public.booking_home_addresses WHERE booking_id = p_booking_id;
      v_revealed_address := v_home.address_text;
      IF v_home.booking_id IS NOT NULL AND v_home.revealed_at IS NULL AND v_booking.customer_id IS DISTINCT FROM v_user_id THEN
        UPDATE public.booking_home_addresses SET revealed_at = now() WHERE booking_id = p_booking_id;
      END IF;$to$);
SELECT pg_temp.patch_function('public.get_booking_address_secure(uuid)'::regprocedure,
  $from$    'address', v_revealed_address$from$,
  $to$    'address', v_revealed_address,
    'latitude', v_home.latitude,
    'longitude', v_home.longitude$to$);

SELECT public.attach_admin_audit_trigger('public.booking_home_addresses');
SELECT public.grant_data_api_access('public.booking_home_addresses');
