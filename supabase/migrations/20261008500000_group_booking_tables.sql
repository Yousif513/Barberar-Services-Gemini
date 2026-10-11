-- G52 Group booking: one host books several guests (a wedding party, a family) at one provider on one day.
--
-- Every guest is an ordinary booking made through public.create_booking (see the next migration), so availability, holds, rules, payments,
-- notifications, ledger and audit are exactly what they are for any other booking. This migration adds only the bookkeeping around it:
-- the provider opt-in, the group, its members, who may read them, and a read-only payment summary. Nothing here redefines
-- create_booking, cancel_booking, reschedule_booking, booking_create_internal, get_available_slots or confirm_booking_payment.
--
-- Privacy: a guest is the host's saved client profile or a free-text label. No guest contact data or personal details are stored.
-- Read scope: the host, and the provider's owner or a delegate with the bookings operation. Another customer reads nothing. An
-- administrator reads counts only (admin_group_booking_counts), never the rows.

-- ---------------------------------------------------------------------------
-- 1. Types and tables
-- ---------------------------------------------------------------------------
DO $enum$
BEGIN
  CREATE TYPE public.group_occasion AS ENUM ('wedding', 'family', 'party', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$enum$;

-- Provider opt-in. Nothing is enabled by default and no size is invented: the owner chooses both.
-- payment_hold_hours is optional: unset means the platform's standard hold window applies to every guest booking of a group.
CREATE TABLE IF NOT EXISTS public.provider_group_settings (
  provider_id        UUID PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  enabled            BOOLEAN NOT NULL DEFAULT FALSE,
  max_group_size     SMALLINT,
  payment_hold_hours SMALLINT,
  updated_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT group_settings_max_range CHECK (max_group_size IS NULL OR max_group_size BETWEEN 2 AND 30),
  CONSTRAINT group_settings_enabled_needs_max CHECK (NOT enabled OR max_group_size IS NOT NULL),
  CONSTRAINT group_settings_hold_range CHECK (payment_hold_hours IS NULL OR payment_hold_hours BETWEEN 1 AND 168)
);

CREATE TABLE IF NOT EXISTS public.group_bookings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id             UUID NOT NULL REFERENCES public.profiles(id),
  provider_id         UUID NOT NULL REFERENCES public.providers(id),
  branch_id           UUID NOT NULL REFERENCES public.branches(id),
  event_date          DATE NOT NULL,
  occasion            public.group_occasion NOT NULL,
  headcount           SMALLINT NOT NULL CHECK (headcount BETWEEN 2 AND 30),
  notes               TEXT CHECK (notes IS NULL OR char_length(notes) <= 1000),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  payment_due_at      TIMESTAMPTZ,
  request_fingerprint TEXT NOT NULL,
  idempotency_key     TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  cancelled_at        TIMESTAMPTZ,
  cancel_reason       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (host_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS group_bookings_host_idx ON public.group_bookings (host_id, created_at DESC);
CREATE INDEX IF NOT EXISTS group_bookings_provider_idx ON public.group_bookings (provider_id, event_date DESC);

CREATE TABLE IF NOT EXISTS public.group_booking_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES public.group_bookings(id) ON DELETE CASCADE,
  booking_id  UUID NOT NULL UNIQUE REFERENCES public.bookings(id),
  guest_label TEXT NOT NULL CHECK (char_length(btrim(guest_label)) BETWEEN 1 AND 80),
  sequence    SMALLINT NOT NULL CHECK (sequence BETWEEN 1 AND 30),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, sequence)
);
CREATE INDEX IF NOT EXISTS group_booking_members_group_idx ON public.group_booking_members (group_id);

ALTER TABLE public.provider_group_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_booking_members ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Read scope. can_access_provider_wide() also answers true for an administrator, which a group must not (administrators
--    count groups, they do not read them), so the provider side is spelled out here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.group_booking_provider_access(p_provider_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.providers p WHERE p.id = p_provider_id AND p.owner_id = auth.uid())
    OR (NOT public.is_admin() AND public.can_access_provider_wide(p_provider_id, 'bookings'))
  );
$$;
REVOKE ALL ON FUNCTION public.group_booking_provider_access(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_booking_provider_access(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_view_group_booking(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.group_bookings g
    WHERE g.id = p_group_id
      AND (g.host_id = auth.uid() OR public.group_booking_provider_access(g.provider_id))
  );
$$;
REVOKE ALL ON FUNCTION public.can_view_group_booking(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_group_booking(UUID) TO authenticated, service_role;

-- A provider's own settings are readable by the provider side and by administrators (configuration, not personal data).
DROP POLICY IF EXISTS provider_group_settings_read ON public.provider_group_settings;
CREATE POLICY provider_group_settings_read ON public.provider_group_settings FOR SELECT TO authenticated
  USING (public.is_admin() OR public.group_booking_provider_access(provider_id));

DROP POLICY IF EXISTS group_bookings_read ON public.group_bookings;
CREATE POLICY group_bookings_read ON public.group_bookings FOR SELECT TO authenticated
  USING (host_id = auth.uid() OR public.group_booking_provider_access(provider_id));

DROP POLICY IF EXISTS group_booking_members_read ON public.group_booking_members;
CREATE POLICY group_booking_members_read ON public.group_booking_members FOR SELECT TO authenticated
  USING (public.can_view_group_booking(group_id));

-- ---------------------------------------------------------------------------
-- 3. Read-only payment summary per group. It runs with the caller's rights (security_invoker), so it shows a group only to
--    someone who can read the group, its members and its bookings. Payment itself stays per booking, through the existing flow.
--    deposit_due is what the still-unpaid guest bookings will ask for; a confirmed booking has nothing left to collect online.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.group_booking_payment_summary WITH (security_invoker = true) AS
SELECT g.id AS group_id,
       COUNT(m.id)::integer AS member_count,
       COUNT(*) FILTER (WHERE b.status = 'pending_payment')::integer AS awaiting_payment_count,
       COUNT(*) FILTER (WHERE b.status IN ('confirmed', 'completed'))::integer AS confirmed_count,
       COUNT(*) FILTER (WHERE b.status = 'cancelled')::integer AS cancelled_count,
       COALESCE(SUM(b.deposit_required) FILTER (WHERE b.status = 'pending_payment'), 0)::numeric(10,2) AS deposit_due,
       COALESCE(SUM(b.total_price + b.tax_amount) FILTER (WHERE b.status <> 'cancelled'), 0)::numeric(10,2) AS total_with_vat,
       CASE WHEN g.status = 'cancelled' OR COUNT(*) FILTER (WHERE b.status = 'cancelled') = COUNT(m.id)
            THEN 'cancelled' ELSE 'active' END AS effective_status
FROM public.group_bookings g
JOIN public.group_booking_members m ON m.group_id = g.id
JOIN public.bookings b ON b.id = m.booking_id
GROUP BY g.id, g.status;

-- ---------------------------------------------------------------------------
-- 4. Provider opt-in command (the owner, or an administrator with a reason). Nothing is enabled by default.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_provider_group_settings(
  p_provider_id UUID, p_enabled BOOLEAN, p_max_group_size INTEGER DEFAULT NULL,
  p_payment_hold_hours INTEGER DEFAULT NULL, p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_owner UUID;
  v_is_owner BOOLEAN;
  v_row public.provider_group_settings;
  v_max SMALLINT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT owner_id INTO v_owner FROM public.providers WHERE id = p_provider_id;
  v_is_owner := v_owner IS NOT NULL AND v_owner = v_uid;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_is_owner AND NOT public.is_admin() THEN
    IF public.can_access_provider_wide(p_provider_id, 'bookings') THEN
      RAISE EXCEPTION 'Only the provider owner can change group booking settings' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_is_owner AND char_length(TRIM(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'The enabled flag is required' USING ERRCODE = '22023';
  END IF;
  IF p_max_group_size IS NOT NULL AND p_max_group_size NOT BETWEEN 2 AND 30 THEN
    RAISE EXCEPTION 'The maximum group size must be between 2 and 30' USING ERRCODE = '22023';
  END IF;
  IF p_payment_hold_hours IS NOT NULL AND p_payment_hold_hours NOT BETWEEN 1 AND 168 THEN
    RAISE EXCEPTION 'The payment hold must be between 1 and 168 hours' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.provider_group_settings WHERE provider_id = p_provider_id;
  v_max := COALESCE(p_max_group_size, v_row.max_group_size);
  IF p_enabled AND v_max IS NULL THEN
    RAISE EXCEPTION 'The maximum group size is required to enable group bookings' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.provider_group_settings (provider_id, enabled, max_group_size, payment_hold_hours, updated_by, updated_at)
  VALUES (p_provider_id, p_enabled, v_max, p_payment_hold_hours, v_uid, now())
  ON CONFLICT (provider_id) DO UPDATE
    SET enabled = EXCLUDED.enabled, max_group_size = EXCLUDED.max_group_size,
        payment_hold_hours = EXCLUDED.payment_hold_hours, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
  RETURNING * INTO v_row;

  PERFORM public.write_audit_log('group_settings.updated', 'provider_group_settings', p_provider_id,
    jsonb_build_object('enabled', v_row.enabled, 'max_group_size', v_row.max_group_size,
                       'payment_hold_hours', v_row.payment_hold_hours, 'by_admin', NOT v_is_owner, 'reason', p_reason));
  RETURN jsonb_build_object('provider_id', v_row.provider_id, 'enabled', v_row.enabled,
                            'max_group_size', v_row.max_group_size, 'payment_hold_hours', v_row.payment_hold_hours);
END;
$$;
REVOKE ALL ON FUNCTION public.set_provider_group_settings(UUID, BOOLEAN, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_provider_group_settings(UUID, BOOLEAN, INTEGER, INTEGER, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Which providers take group bookings (a customer cannot read the settings table, so this answers for the catalogue).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_group_booking_providers()
RETURNS TABLE (provider_id UUID, business_name_en TEXT, business_name_ar TEXT, max_group_size INTEGER, payment_hold_hours INTEGER)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  RETURN QUERY
  SELECT p.id, p.business_name_en::text, p.business_name_ar::text, s.max_group_size::integer, s.payment_hold_hours::integer
  FROM public.provider_group_settings s
  JOIN public.providers p ON p.id = s.provider_id
  WHERE s.enabled AND COALESCE(p.is_verified, FALSE) AND p.status = 'active'
  ORDER BY p.business_name_en, p.id
  LIMIT 200;
END;
$$;
REVOKE ALL ON FUNCTION public.list_group_booking_providers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_group_booking_providers() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Data API privileges and the administrator audit trigger
-- ---------------------------------------------------------------------------
SELECT public.grant_data_api_access('public.provider_group_settings');
SELECT public.grant_data_api_access('public.group_bookings');
SELECT public.grant_data_api_access('public.group_booking_members');
SELECT public.grant_data_api_access('public.group_booking_payment_summary');
SELECT public.attach_admin_audit_trigger('public.provider_group_settings');
SELECT public.attach_admin_audit_trigger('public.group_bookings');
SELECT public.attach_admin_audit_trigger('public.group_booking_members');
