-- M-10 of docs/reviews/2026-10-08-security-money.md.
--
-- request_source = 'import' (0 percent commission, "the provider's own client") was self-attested: the provider owner could insert a row into
-- provider_client_contacts directly (RLS allowed it) with a consent timestamp it supplied itself, and the customer's booking was then fee-free.
-- Now:
--   * contacts are created only by import_provider_clients (no INSERT policy or privilege for any client role; a provider can still read its
--     contacts, edit name, notes and the VIP flag, and delete a contact; it can no longer change the phone, the owner, the link to an
--     import or the consent evidence);
--   * 'import' is honoured only for a contact that came from an import an administrator reviewed (admin_review_client_import records who and
--     when, with a reason), and not for a customer who already had a marketplace booking at that provider before the review.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

ALTER TABLE public.provider_client_imports
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_reason TEXT;

CREATE OR REPLACE FUNCTION public.admin_review_client_import(p_import_id UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_import public.provider_client_imports;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_import FROM public.provider_client_imports WHERE id = p_import_id FOR UPDATE;
  IF v_import.id IS NULL THEN
    RAISE EXCEPTION 'Import not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_import.consent_confirmed THEN
    RAISE EXCEPTION 'The provider did not confirm client consent for this import' USING ERRCODE = '22023';
  END IF;
  IF v_import.reviewed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', TRUE, 'already_reviewed', TRUE, 'import_id', v_import.id, 'reviewed_at', v_import.reviewed_at);
  END IF;
  UPDATE public.provider_client_imports
     SET reviewed_by = auth.uid(), reviewed_at = now(), review_reason = btrim(p_reason)
   WHERE id = v_import.id;
  PERFORM public.write_audit_log('provider.client_import_reviewed', 'provider_client_imports', v_import.id,
    jsonb_build_object('provider_id', v_import.provider_id, 'rows', v_import.successful_rows, 'reason', btrim(p_reason)));
  RETURN jsonb_build_object('success', TRUE, 'import_id', v_import.id, 'provider_id', v_import.provider_id, 'reviewed_at', now());
END $fn$;
REVOKE ALL ON FUNCTION public.admin_review_client_import(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_client_import(UUID, TEXT) TO authenticated;

-- 'import' counts only for a contact that came from a reviewed import.
SELECT pg_temp.patch_function('public.resolve_booking_source(uuid, uuid, text, text)'::regprocedure,
$from$    FROM public.provider_client_contacts c
    LEFT JOIN public.profiles pr ON pr.id = p_customer_id
    WHERE c.provider_id = p_provider_id$from$,
$to$    FROM public.provider_client_contacts c
    JOIN public.provider_client_imports i ON i.id = c.import_id AND i.provider_id = c.provider_id
         AND i.reviewed_at IS NOT NULL AND i.consent_confirmed
    LEFT JOIN public.profiles pr ON pr.id = p_customer_id
    WHERE c.provider_id = p_provider_id
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings pb JOIN public.branches pbr ON pbr.id = pb.branch_id
        WHERE pb.customer_id = p_customer_id AND pbr.provider_id = p_provider_id
          AND pb.source = 'marketplace' AND pb.status IN ('confirmed', 'completed') AND pb.created_at < i.reviewed_at)$to$);

-- Contacts are written only by the import command. A provider reads, annotates and deletes its own contacts; an administrator the same.
DROP POLICY IF EXISTS "Provider staff manage client contacts" ON public.provider_client_contacts;
DROP POLICY IF EXISTS "Provider owners read client contacts" ON public.provider_client_contacts;
DROP POLICY IF EXISTS "Provider owners annotate client contacts" ON public.provider_client_contacts;
DROP POLICY IF EXISTS "Provider owners delete client contacts" ON public.provider_client_contacts;
CREATE POLICY "Provider owners read client contacts" ON public.provider_client_contacts FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_client_contacts.provider_id AND p.owner_id = auth.uid()));
CREATE POLICY "Provider owners annotate client contacts" ON public.provider_client_contacts FOR UPDATE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_client_contacts.provider_id AND p.owner_id = auth.uid()))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_client_contacts.provider_id AND p.owner_id = auth.uid()));
CREATE POLICY "Provider owners delete client contacts" ON public.provider_client_contacts FOR DELETE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_client_contacts.provider_id AND p.owner_id = auth.uid()));

REVOKE INSERT, UPDATE ON public.provider_client_contacts FROM authenticated;
GRANT UPDATE (full_name, notes, is_vip) ON public.provider_client_contacts TO authenticated;
