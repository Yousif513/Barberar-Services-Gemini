-- G75 Professional identity: the commands, the public read, and the two additive triggers.
--
-- Every change to the six tables of the previous migration is a SECURITY DEFINER command that asks who is calling, checks the object
-- scope, validates the input and writes an audit row (ids and counts only, never personal text). Clients have no INSERT, UPDATE or
-- DELETE privilege on those tables.
--
-- Settings (platform_settings, both UNSET until the owner decides; nothing here invents a value):
--   pro.move_notice_min_days   minimum days between two "now works at" notices for one professional. UNSET sends nothing.
--   pro.max_portfolio_items    most portfolio links per professional. UNSET means no limit.

-- 1. Handle rules. Returns NULL when the handle is usable, otherwise 'invalid', 'reserved' or 'taken'.
CREATE OR REPLACE FUNCTION public.professional_handle_problem(p_handle TEXT, p_exclude UUID DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_handle IS NULL OR p_handle !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(p_handle) NOT BETWEEN 3 AND 30 THEN
    RETURN 'invalid';
  END IF;
  IF EXISTS (SELECT 1 FROM public.professional_reserved_handles WHERE handle = p_handle) THEN RETURN 'reserved'; END IF;
  IF EXISTS (SELECT 1 FROM public.professional_profiles WHERE handle = p_handle AND id IS DISTINCT FROM p_exclude)
     OR EXISTS (SELECT 1 FROM public.professional_handle_redirects WHERE old_handle = p_handle AND professional_id IS DISTINCT FROM p_exclude) THEN
    RETURN 'taken';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.professional_handle_problem(TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- Raises the right error for a handle problem; returns the cleaned handle otherwise.
CREATE OR REPLACE FUNCTION public.professional_require_handle(p_handle TEXT, p_exclude UUID DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_handle TEXT := lower(btrim(COALESCE(p_handle, '')));
  v_problem TEXT := public.professional_handle_problem(lower(btrim(COALESCE(p_handle, ''))), p_exclude);
BEGIN
  IF v_problem = 'invalid' THEN
    RAISE EXCEPTION 'A handle is 3 to 30 characters: lowercase English letters, digits and single hyphens' USING ERRCODE = '22023';
  ELSIF v_problem = 'reserved' THEN
    RAISE EXCEPTION 'That handle is reserved' USING ERRCODE = '22023';
  ELSIF v_problem = 'taken' THEN
    RAISE EXCEPTION 'That handle is already taken' USING ERRCODE = '23505';
  END IF;
  RETURN v_handle;
END $$;
REVOKE ALL ON FUNCTION public.professional_require_handle(TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- A trimmed, de-duplicated list of short strings; raises 22023 when an item or the list is out of shape.
CREATE OR REPLACE FUNCTION public.professional_clean_list(
  p_items TEXT[], p_label TEXT, p_min_len INTEGER, p_max_len INTEGER, p_max_count INTEGER, p_code BOOLEAN DEFAULT FALSE
) RETURNS TEXT[] LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v_clean TEXT[]; v_item TEXT;
BEGIN
  SELECT COALESCE(array_agg(d.v ORDER BY d.first_pos), '{}') INTO v_clean
    FROM (SELECT s.v, min(s.pos) AS first_pos
            FROM (SELECT CASE WHEN p_code THEN lower(btrim(x)) ELSE btrim(x) END AS v, pos
                    FROM unnest(COALESCE(p_items, '{}'::TEXT[])) WITH ORDINALITY AS u(x, pos)) s
           WHERE s.v <> '' GROUP BY s.v) d;
  IF cardinality(v_clean) > p_max_count THEN
    RAISE EXCEPTION '% accepts at most % entries', p_label, p_max_count USING ERRCODE = '22023';
  END IF;
  FOREACH v_item IN ARRAY v_clean LOOP
    IF char_length(v_item) < p_min_len OR char_length(v_item) > p_max_len OR (p_code AND v_item !~ '^[a-z]{2,3}$') THEN
      RAISE EXCEPTION '% has an entry that is not valid', p_label USING ERRCODE = '22023';
    END IF;
  END LOOP;
  RETURN v_clean;
END $$;
REVOKE ALL ON FUNCTION public.professional_clean_list(TEXT[], TEXT, INTEGER, INTEGER, INTEGER, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- Who may manage a salon's staff links: the owner, or a delegate holding the staff permission for that branch.
-- An administrator is not a salon: administrators act through the admin_* commands, which require a reason.
CREATE OR REPLACE FUNCTION public.professional_staff_authority(p_provider_id UUID, p_branch_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = auth.uid())
    OR (NOT public.is_admin() AND public.can_access_provider_operation(p_provider_id, p_branch_id, 'staff')));
$$;
REVOKE ALL ON FUNCTION public.professional_staff_authority(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- The active workplaces of one professional, in the shape the public page shows: salon public name, city, links. No phone, no
-- email, no street address, no internal id other than the salon id that already appears in the public /shop/<id> address.
CREATE OR REPLACE FUNCTION public.professional_public_workplaces(p_professional_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'name_en', pr.business_name_en, 'name_ar', pr.business_name_ar, 'city', b.city,
           'shop_url', '/shop/' || pr.id::text, 'book_url', '/shop/' || pr.id::text || '?source=link',
           'since', w.started_at) ORDER BY w.started_at), '[]'::jsonb)
    FROM public.professional_workplaces w
    JOIN public.providers pr ON pr.id = w.provider_id AND pr.status = 'active' AND pr.is_verified
    LEFT JOIN public.branches b ON b.id = w.branch_id
   WHERE w.professional_id = p_professional_id AND w.status = 'active';
$$;
REVOKE ALL ON FUNCTION public.professional_public_workplaces(UUID) FROM PUBLIC, anon, authenticated;

-- 2. Availability check for the form (a signed-in person asks before saving).
CREATE OR REPLACE FUNCTION public.professional_handle_available(p_handle TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_own UUID;
  v_problem TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT id INTO v_own FROM public.professional_profiles WHERE owner_id = auth.uid();
  v_problem := public.professional_handle_problem(lower(btrim(COALESCE(p_handle, ''))), v_own);
  RETURN jsonb_build_object('available', v_problem IS NULL, 'problem', v_problem);
END $$;
REVOKE ALL ON FUNCTION public.professional_handle_available(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.professional_handle_available(TEXT) TO authenticated, service_role;

-- 3. Create or edit your own profile. A published handle never changes by itself: an administrator changes it and the old one redirects.
CREATE OR REPLACE FUNCTION public.save_professional_profile(
  p_handle TEXT, p_display_name_en TEXT, p_display_name_ar TEXT, p_headline_en TEXT, p_headline_ar TEXT,
  p_bio_en TEXT, p_bio_ar TEXT, p_specialties TEXT[], p_languages TEXT[]
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_existing public.professional_profiles;
  v_name_en TEXT := NULLIF(btrim(COALESCE(p_display_name_en, '')), '');
  v_name_ar TEXT := NULLIF(btrim(COALESCE(p_display_name_ar, '')), '');
  v_head_en TEXT := NULLIF(btrim(COALESCE(p_headline_en, '')), '');
  v_head_ar TEXT := NULLIF(btrim(COALESCE(p_headline_ar, '')), '');
  v_bio_en TEXT := NULLIF(btrim(COALESCE(p_bio_en, '')), '');
  v_bio_ar TEXT := NULLIF(btrim(COALESCE(p_bio_ar, '')), '');
  v_specialties TEXT[];
  v_languages TEXT[];
  v_handle TEXT;
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF v_name_en IS NULL OR v_name_ar IS NULL OR char_length(v_name_en) > 80 OR char_length(v_name_ar) > 80 THEN
    RAISE EXCEPTION 'Display names are required in English and Arabic, up to 80 characters each' USING ERRCODE = '22023';
  END IF;
  IF char_length(COALESCE(v_head_en, '')) > 120 OR char_length(COALESCE(v_head_ar, '')) > 120 THEN
    RAISE EXCEPTION 'A headline is at most 120 characters' USING ERRCODE = '22023';
  END IF;
  IF char_length(COALESCE(v_bio_en, '')) > 1000 OR char_length(COALESCE(v_bio_ar, '')) > 1000 THEN
    RAISE EXCEPTION 'A bio is at most 1000 characters' USING ERRCODE = '22023';
  END IF;
  v_specialties := public.professional_clean_list(p_specialties, 'Specialties', 2, 40, 20);
  v_languages := public.professional_clean_list(p_languages, 'Languages', 2, 3, 10, TRUE);

  SELECT * INTO v_existing FROM public.professional_profiles WHERE owner_id = v_uid FOR UPDATE;

  IF NOT FOUND THEN
    -- Only a registered professional of a salon can claim a handle: it stops the namespace filling with strangers.
    IF NOT EXISTS (SELECT 1 FROM public.employees WHERE profile_id = v_uid) THEN
      RAISE EXCEPTION 'Only a registered professional of a salon can create a professional profile' USING ERRCODE = '42501';
    END IF;
    v_handle := public.professional_require_handle(p_handle);
    BEGIN
      INSERT INTO public.professional_profiles (owner_id, handle, display_name_en, display_name_ar, headline_en, headline_ar,
                                                bio_en, bio_ar, specialties, languages)
      VALUES (v_uid, v_handle, v_name_en, v_name_ar, v_head_en, v_head_ar, v_bio_en, v_bio_ar, v_specialties, v_languages)
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'That handle is already taken' USING ERRCODE = '23505';
    END;
    PERFORM public.write_audit_log('professional.profile_created', 'professional_profiles', v_id, '{}'::jsonb);
    RETURN jsonb_build_object('handle', v_handle, 'created', TRUE);
  END IF;

  v_handle := v_existing.handle;
  IF NULLIF(btrim(COALESCE(p_handle, '')), '') IS NOT NULL AND lower(btrim(p_handle)) <> v_existing.handle THEN
    IF v_existing.published_at IS NOT NULL THEN
      RAISE EXCEPTION 'A handle that has been published can only be changed by support' USING ERRCODE = '22023';
    END IF;
    v_handle := public.professional_require_handle(p_handle, v_existing.id);
  END IF;
  BEGIN
    UPDATE public.professional_profiles
       SET handle = v_handle, display_name_en = v_name_en, display_name_ar = v_name_ar, headline_en = v_head_en,
           headline_ar = v_head_ar, bio_en = v_bio_en, bio_ar = v_bio_ar, specialties = v_specialties,
           languages = v_languages, updated_at = now()
     WHERE id = v_existing.id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That handle is already taken' USING ERRCODE = '23505';
  END;
  PERFORM public.write_audit_log('professional.profile_updated', 'professional_profiles', v_existing.id,
    jsonb_build_object('handle_changed', v_handle <> v_existing.handle));
  RETURN jsonb_build_object('handle', v_handle, 'created', FALSE);
END $$;
REVOKE ALL ON FUNCTION public.save_professional_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_professional_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT[]) TO authenticated, service_role;

-- 4. Publish or unpublish. Publishing is the professional's choice; a profile an administrator hid cannot be published.
CREATE OR REPLACE FUNCTION public.publish_professional_profile(p_publish BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_p public.professional_profiles;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_publish IS NULL THEN RAISE EXCEPTION 'Publish or unpublish must be stated' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_p FROM public.professional_profiles WHERE owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Professional profile not found' USING ERRCODE = 'P0002'; END IF;
  IF p_publish AND v_p.hidden_by_admin_at IS NOT NULL THEN
    RAISE EXCEPTION 'This profile was hidden by an administrator and cannot be published' USING ERRCODE = '42501';
  END IF;
  IF v_p.is_published IS DISTINCT FROM p_publish THEN
    UPDATE public.professional_profiles
       SET is_published = p_publish, published_at = CASE WHEN p_publish THEN COALESCE(published_at, now()) ELSE published_at END,
           updated_at = now()
     WHERE id = v_p.id;
    PERFORM public.write_audit_log(CASE WHEN p_publish THEN 'professional.profile_published' ELSE 'professional.profile_unpublished' END,
      'professional_profiles', v_p.id, '{}'::jsonb);
  END IF;
  RETURN jsonb_build_object('handle', v_p.handle, 'is_published', p_publish);
END $$;
REVOKE ALL ON FUNCTION public.publish_professional_profile(BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_professional_profile(BOOLEAN) TO authenticated, service_role;

-- 5. Portfolio links.
CREATE OR REPLACE FUNCTION public.add_professional_portfolio_item(p_title_en TEXT, p_title_ar TEXT, p_url TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_pid UUID;
  v_title_en TEXT := NULLIF(btrim(COALESCE(p_title_en, '')), '');
  v_title_ar TEXT := NULLIF(btrim(COALESCE(p_title_ar, '')), '');
  v_url TEXT := btrim(COALESCE(p_url, ''));
  v_limit JSONB := public.platform_setting('pro.max_portfolio_items');
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT id INTO v_pid FROM public.professional_profiles WHERE owner_id = v_uid FOR UPDATE;
  IF v_pid IS NULL THEN RAISE EXCEPTION 'Professional profile not found' USING ERRCODE = 'P0002'; END IF;
  IF v_url !~ '^https://[^[:space:]]+$' OR char_length(v_url) > 500 THEN
    RAISE EXCEPTION 'A portfolio link must be an https address of at most 500 characters' USING ERRCODE = '22023';
  END IF;
  IF char_length(COALESCE(v_title_en, '')) > 100 OR char_length(COALESCE(v_title_ar, '')) > 100 THEN
    RAISE EXCEPTION 'A portfolio title is at most 100 characters' USING ERRCODE = '22023';
  END IF;
  IF v_limit IS NOT NULL AND jsonb_typeof(v_limit) = 'number'
     AND (SELECT count(*) FROM public.professional_portfolio_items WHERE professional_id = v_pid) >= (v_limit #>> '{}')::numeric THEN
    RAISE EXCEPTION 'The portfolio already has the most links allowed' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.professional_portfolio_items (professional_id, title_en, title_ar, url, display_order)
  VALUES (v_pid, v_title_en, v_title_ar, v_url,
          COALESCE((SELECT max(display_order) + 1 FROM public.professional_portfolio_items WHERE professional_id = v_pid), 0))
  RETURNING id INTO v_id;
  PERFORM public.write_audit_log('professional.portfolio_added', 'professional_portfolio_items', v_id, '{}'::jsonb);
  RETURN jsonb_build_object('id', v_id);
END $$;
REVOKE ALL ON FUNCTION public.add_professional_portfolio_item(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_professional_portfolio_item(TEXT, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.remove_professional_portfolio_item(p_item_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_deleted UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  DELETE FROM public.professional_portfolio_items i
   USING public.professional_profiles p
   WHERE i.id = p_item_id AND p.id = i.professional_id AND p.owner_id = v_uid
  RETURNING i.id INTO v_deleted;
  IF v_deleted IS NULL THEN RAISE EXCEPTION 'Portfolio link not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.write_audit_log('professional.portfolio_removed', 'professional_portfolio_items', v_deleted, '{}'::jsonb);
  RETURN jsonb_build_object('removed', TRUE);
END $$;
REVOKE ALL ON FUNCTION public.remove_professional_portfolio_item(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_professional_portfolio_item(UUID) TO authenticated, service_role;

-- 6. The handshake. The salon invites one of its employee rows; the professional accepts or declines; either side can end it.
CREATE OR REPLACE FUNCTION public.invite_professional_link(p_employee_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_emp RECORD;
  v_pid UUID;
  v_existing public.professional_workplaces;
  v_id UUID;
  v_name_en TEXT;
  v_name_ar TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT e.id, e.is_active, e.profile_id, e.branch_id, b.provider_id INTO v_emp
    FROM public.employees e JOIN public.branches b ON b.id = e.branch_id WHERE e.id = p_employee_id;
  IF NOT FOUND OR NOT public.professional_staff_authority(v_emp.provider_id, v_emp.branch_id) THEN
    RAISE EXCEPTION 'Employee not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_emp.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Only an active employee can be linked' USING ERRCODE = '22023';
  END IF;
  IF v_emp.profile_id IS NULL THEN
    RAISE EXCEPTION 'This employee has no login yet, so there is no professional profile to link' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_pid FROM public.professional_profiles WHERE owner_id = v_emp.profile_id;
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'This employee has not created a professional profile yet' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing FROM public.professional_workplaces
   WHERE professional_id = v_pid AND employee_id = p_employee_id AND status IN ('invited', 'active');
  IF FOUND THEN
    IF v_existing.status = 'active' THEN RAISE EXCEPTION 'This employee is already linked' USING ERRCODE = '23505'; END IF;
    RETURN jsonb_build_object('workplace_id', v_existing.id, 'status', 'invited', 'replayed', TRUE);
  END IF;

  INSERT INTO public.professional_workplaces (professional_id, employee_id, provider_id, branch_id, status, invited_by)
  VALUES (v_pid, p_employee_id, v_emp.provider_id, v_emp.branch_id, 'invited', v_uid)
  RETURNING id INTO v_id;

  SELECT business_name_en, business_name_ar INTO v_name_en, v_name_ar FROM public.providers WHERE id = v_emp.provider_id;
  INSERT INTO public.notifications (user_id, title_en, title_ar, body_en, body_ar, type, data)
  VALUES (v_emp.profile_id,
          'A salon asked to link your professional profile', 'صالون يطلب ربط ملفك المهني',
          v_name_en || ' invited you to show it as your workplace. You decide: accept or decline on your identity page.',
          v_name_ar || ' دعاك لإظهاره كمكان عملك. القرار لك: اقبل أو ارفض من صفحة هويتك المهنية.',
          'professional_link', jsonb_build_object('url', '/provider/identity'));

  PERFORM public.write_audit_log('professional.link_invited', 'professional_workplaces', v_id,
    jsonb_build_object('provider_id', v_emp.provider_id));
  RETURN jsonb_build_object('workplace_id', v_id, 'status', 'invited', 'replayed', FALSE);
END $$;
REVOKE ALL ON FUNCTION public.invite_professional_link(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invite_professional_link(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.respond_professional_invitation(p_workplace_id UUID, p_accept BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_w public.professional_workplaces;
  v_after public.professional_workplaces;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_accept IS NULL THEN RAISE EXCEPTION 'Accept or decline must be stated' USING ERRCODE = '22023'; END IF;
  SELECT w.* INTO v_w FROM public.professional_workplaces w
    JOIN public.professional_profiles p ON p.id = w.professional_id
   WHERE w.id = p_workplace_id AND p.owner_id = v_uid FOR UPDATE OF w;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002'; END IF;

  IF v_w.status <> 'invited' THEN
    IF (p_accept AND v_w.status = 'active') OR (NOT p_accept AND v_w.status = 'declined') THEN
      RETURN jsonb_build_object('workplace_id', v_w.id, 'status', v_w.status, 'replayed', TRUE);
    END IF;
    RAISE EXCEPTION 'This invitation is no longer open' USING ERRCODE = '22023';
  END IF;

  IF p_accept THEN
    IF NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = v_w.employee_id AND e.is_active AND e.profile_id = v_uid) THEN
      RAISE EXCEPTION 'This invitation is no longer valid: you are not an active employee there' USING ERRCODE = '22023';
    END IF;
    UPDATE public.professional_workplaces SET status = 'active', started_at = now(), responded_at = now()
     WHERE id = v_w.id RETURNING * INTO v_after;
    PERFORM public.write_audit_log('professional.link_accepted', 'professional_workplaces', v_w.id,
      jsonb_build_object('move_notice', v_after.move_notice_outcome));
  ELSE
    UPDATE public.professional_workplaces
       SET status = 'declined', ended_at = now(), responded_at = now(), closed_by = 'professional', closed_reason = 'ended_by_request'
     WHERE id = v_w.id RETURNING * INTO v_after;
    PERFORM public.write_audit_log('professional.link_declined', 'professional_workplaces', v_w.id, '{}'::jsonb);
  END IF;
  RETURN jsonb_build_object('workplace_id', v_after.id, 'status', v_after.status, 'replayed', FALSE,
                            'move_notice', v_after.move_notice_outcome);
END $$;
REVOKE ALL ON FUNCTION public.respond_professional_invitation(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_professional_invitation(UUID, BOOLEAN) TO authenticated, service_role;

-- Either side ends a link. A running link becomes 'former' with an end date; a pending one is withdrawn or declined. Never deleted.
CREATE OR REPLACE FUNCTION public.end_professional_link(p_workplace_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_w public.professional_workplaces;
  v_side TEXT;
  v_after public.professional_workplaces;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_w FROM public.professional_workplaces WHERE id = p_workplace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Link not found' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.professional_profiles p WHERE p.id = v_w.professional_id AND p.owner_id = v_uid) THEN
    v_side := 'professional';
  ELSIF public.professional_staff_authority(v_w.provider_id, v_w.branch_id) THEN
    v_side := 'provider';
  ELSE
    RAISE EXCEPTION 'Link not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_w.status IN ('former', 'declined') THEN
    RETURN jsonb_build_object('workplace_id', v_w.id, 'status', v_w.status, 'replayed', TRUE);
  END IF;
  UPDATE public.professional_workplaces
     SET status = CASE WHEN status = 'active' THEN 'former' ELSE 'declined' END,
         ended_at = now(), responded_at = COALESCE(responded_at, now()), closed_by = v_side, closed_reason = 'ended_by_request'
   WHERE id = v_w.id RETURNING * INTO v_after;
  PERFORM public.write_audit_log('professional.link_ended', 'professional_workplaces', v_w.id,
    jsonb_build_object('by', v_side, 'was', v_w.status));
  RETURN jsonb_build_object('workplace_id', v_after.id, 'status', v_after.status, 'replayed', FALSE);
END $$;
REVOKE ALL ON FUNCTION public.end_professional_link(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_professional_link(UUID) TO authenticated, service_role;

-- 7. Followers. The follower chooses notify_on_move; the professional only ever learns a count.
CREATE OR REPLACE FUNCTION public.follow_professional(p_handle TEXT, p_notify_on_move BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_p public.professional_profiles;
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_p FROM public.professional_profiles
   WHERE handle = lower(btrim(COALESCE(p_handle, ''))) AND is_published AND hidden_by_admin_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Professional not found' USING ERRCODE = 'P0002'; END IF;
  IF v_p.owner_id = v_uid THEN RAISE EXCEPTION 'You cannot follow your own profile' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.professional_follows (professional_id, follower_id, notify_on_move)
  VALUES (v_p.id, v_uid, COALESCE(p_notify_on_move, FALSE))
  ON CONFLICT (professional_id, follower_id) DO UPDATE SET notify_on_move = EXCLUDED.notify_on_move
  RETURNING id INTO v_id;
  PERFORM public.write_audit_log('professional.followed', 'professional_follows', v_id, '{}'::jsonb);
  RETURN jsonb_build_object('following', TRUE, 'notify_on_move', COALESCE(p_notify_on_move, FALSE));
END $$;
REVOKE ALL ON FUNCTION public.follow_professional(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.follow_professional(TEXT, BOOLEAN) TO authenticated, service_role;

-- Unfollowing works whatever the profile's visibility is, and answers the same whether or not the profile exists.
CREATE OR REPLACE FUNCTION public.unfollow_professional(p_handle TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_handle TEXT := lower(btrim(COALESCE(p_handle, '')));
  v_deleted UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  DELETE FROM public.professional_follows f
   USING public.professional_profiles p
   WHERE f.professional_id = p.id AND f.follower_id = v_uid
     AND (p.handle = v_handle OR p.id IN (SELECT r.professional_id FROM public.professional_handle_redirects r WHERE r.old_handle = v_handle))
  RETURNING f.id INTO v_deleted;
  IF v_deleted IS NOT NULL THEN
    PERFORM public.write_audit_log('professional.unfollowed', 'professional_follows', v_deleted, '{}'::jsonb);
  END IF;
  RETURN jsonb_build_object('following', FALSE);
END $$;
REVOKE ALL ON FUNCTION public.unfollow_professional(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unfollow_professional(TEXT) TO authenticated, service_role;

-- 8. Administrator commands. A reason of at least 3 characters is required and goes to the audit log.
CREATE OR REPLACE FUNCTION public.admin_set_professional_visibility(p_handle TEXT, p_hidden BOOLEAN, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p public.professional_profiles;
  v_reason TEXT := btrim(COALESCE(p_reason, ''));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501'; END IF;
  IF p_hidden IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'State whether to hide or restore, and give a reason of at least 3 characters' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_p FROM public.professional_profiles WHERE handle = lower(btrim(COALESCE(p_handle, ''))) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Professional not found' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.professional_profiles
     SET hidden_by_admin_at = CASE WHEN p_hidden THEN COALESCE(hidden_by_admin_at, now()) ELSE NULL END, updated_at = now()
   WHERE id = v_p.id;
  PERFORM public.write_audit_log(CASE WHEN p_hidden THEN 'admin.professional_hidden' ELSE 'admin.professional_restored' END,
    'professional_profiles', v_p.id, jsonb_build_object('reason', v_reason, 'handle', v_p.handle));
  RETURN jsonb_build_object('handle', v_p.handle, 'hidden', p_hidden);
END $$;
REVOKE ALL ON FUNCTION public.admin_set_professional_visibility(TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_professional_visibility(TEXT, BOOLEAN, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_change_professional_handle(p_handle TEXT, p_new_handle TEXT, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p public.professional_profiles;
  v_new TEXT;
  v_reason TEXT := btrim(COALESCE(p_reason, ''));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501'; END IF;
  IF char_length(v_reason) < 3 THEN RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_p FROM public.professional_profiles WHERE handle = lower(btrim(COALESCE(p_handle, ''))) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Professional not found' USING ERRCODE = 'P0002'; END IF;
  v_new := public.professional_require_handle(p_new_handle, v_p.id);
  IF v_new = v_p.handle THEN RAISE EXCEPTION 'The new handle is the current handle' USING ERRCODE = '22023'; END IF;
  -- Going back to a handle the person held before simply retires that redirect.
  DELETE FROM public.professional_handle_redirects WHERE old_handle = v_new AND professional_id = v_p.id;
  INSERT INTO public.professional_handle_redirects (old_handle, professional_id, changed_by) VALUES (v_p.handle, v_p.id, auth.uid());
  UPDATE public.professional_profiles SET handle = v_new, updated_at = now() WHERE id = v_p.id;
  PERFORM public.write_audit_log('admin.professional_handle_changed', 'professional_profiles', v_p.id,
    jsonb_build_object('reason', v_reason, 'from', v_p.handle, 'to', v_new));
  RETURN jsonb_build_object('handle', v_new, 'redirects_from', v_p.handle);
END $$;
REVOKE ALL ON FUNCTION public.admin_change_professional_handle(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_professional_handle(TEXT, TEXT, TEXT) TO authenticated;

-- 9. Reads.
-- The public page. The only door an anonymous visitor has: no table is readable. Hidden or unpublished profiles answer NULL (as if absent).
CREATE OR REPLACE FUNCTION public.public_professional_profile(p_handle TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_handle TEXT := lower(btrim(COALESCE(p_handle, '')));
  v_uid UUID := auth.uid();
  v_p public.professional_profiles;
  v_follow public.professional_follows;
BEGIN
  IF v_handle = '' OR char_length(v_handle) > 30 THEN RETURN NULL; END IF;
  SELECT * INTO v_p FROM public.professional_profiles WHERE handle = v_handle;
  IF NOT FOUND THEN
    SELECT p.* INTO v_p FROM public.professional_handle_redirects r
      JOIN public.professional_profiles p ON p.id = r.professional_id WHERE r.old_handle = v_handle;
    IF FOUND AND v_p.is_published AND v_p.hidden_by_admin_at IS NULL THEN
      RETURN jsonb_build_object('redirect_to', v_p.handle);
    END IF;
    RETURN NULL;
  END IF;
  IF NOT v_p.is_published OR v_p.hidden_by_admin_at IS NOT NULL THEN RETURN NULL; END IF;

  IF v_uid IS NOT NULL THEN
    SELECT * INTO v_follow FROM public.professional_follows WHERE professional_id = v_p.id AND follower_id = v_uid;
  END IF;
  RETURN jsonb_build_object(
    'handle', v_p.handle,
    'display_name_en', v_p.display_name_en, 'display_name_ar', v_p.display_name_ar,
    'headline_en', v_p.headline_en, 'headline_ar', v_p.headline_ar,
    'bio_en', v_p.bio_en, 'bio_ar', v_p.bio_ar,
    'specialties', to_jsonb(v_p.specialties), 'languages', to_jsonb(v_p.languages),
    'portfolio', (SELECT COALESCE(jsonb_agg(jsonb_build_object('title_en', i.title_en, 'title_ar', i.title_ar, 'url', i.url)
                                            ORDER BY i.display_order, i.created_at), '[]'::jsonb)
                    FROM public.professional_portfolio_items i WHERE i.professional_id = v_p.id),
    'workplaces', public.professional_public_workplaces(v_p.id),
    'viewer', jsonb_build_object('signed_in', v_uid IS NOT NULL, 'is_self', v_p.owner_id IS NOT DISTINCT FROM v_uid,
                                 'follows', v_follow.id IS NOT NULL, 'notify_on_move', COALESCE(v_follow.notify_on_move, FALSE))
  );
END $$;
REVOKE ALL ON FUNCTION public.public_professional_profile(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_professional_profile(TEXT) TO anon, authenticated, service_role;

-- The professional's own screen: profile, portfolio, running and past workplaces, pending invitations and a follower COUNT.
CREATE OR REPLACE FUNCTION public.my_professional_identity()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_p public.professional_profiles;
  v_emp RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_p FROM public.professional_profiles WHERE owner_id = v_uid;
  SELECT name_en, name_ar INTO v_emp FROM public.employees WHERE profile_id = v_uid;
  RETURN jsonb_build_object(
    'can_create', FOUND,
    'suggested_names', CASE WHEN v_emp.name_en IS NULL THEN NULL
                            ELSE jsonb_build_object('en', v_emp.name_en, 'ar', v_emp.name_ar) END,
    'profile', CASE WHEN v_p.id IS NULL THEN NULL ELSE jsonb_build_object(
      'handle', v_p.handle, 'display_name_en', v_p.display_name_en, 'display_name_ar', v_p.display_name_ar,
      'headline_en', v_p.headline_en, 'headline_ar', v_p.headline_ar, 'bio_en', v_p.bio_en, 'bio_ar', v_p.bio_ar,
      'specialties', to_jsonb(v_p.specialties), 'languages', to_jsonb(v_p.languages),
      'is_published', v_p.is_published, 'published_at', v_p.published_at, 'hidden', v_p.hidden_by_admin_at IS NOT NULL,
      'handle_locked', v_p.published_at IS NOT NULL) END,
    'portfolio', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'title_en', i.title_en, 'title_ar', i.title_ar, 'url', i.url)
                                            ORDER BY i.display_order, i.created_at), '[]'::jsonb)
                    FROM public.professional_portfolio_items i WHERE i.professional_id = v_p.id),
    'invitations', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'id', w.id, 'name_en', pr.business_name_en, 'name_ar', pr.business_name_ar, 'city', b.city,
                      'invited_at', w.invited_at) ORDER BY w.invited_at DESC), '[]'::jsonb)
                      FROM public.professional_workplaces w JOIN public.providers pr ON pr.id = w.provider_id
                      LEFT JOIN public.branches b ON b.id = w.branch_id
                     WHERE w.professional_id = v_p.id AND w.status = 'invited'),
    'workplaces', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'id', w.id, 'status', w.status, 'name_en', pr.business_name_en, 'name_ar', pr.business_name_ar, 'city', b.city,
                      'started_at', w.started_at, 'ended_at', w.ended_at, 'closed_by', w.closed_by)
                      ORDER BY (w.status = 'active') DESC, w.started_at DESC), '[]'::jsonb)
                      FROM public.professional_workplaces w JOIN public.providers pr ON pr.id = w.provider_id
                      LEFT JOIN public.branches b ON b.id = w.branch_id
                     WHERE w.professional_id = v_p.id AND w.status IN ('active', 'former')),
    'follower_count', (SELECT count(*)::int FROM public.professional_follows f WHERE f.professional_id = v_p.id)
  );
END $$;
REVOKE ALL ON FUNCTION public.my_professional_identity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_professional_identity() TO authenticated, service_role;

-- What a salon sees on its employee list: whether each active employee can be linked and the state of the link. The handle appears
-- only once the professional accepted (their consent to be shown at that salon) and published.
CREATE OR REPLACE FUNCTION public.provider_professional_links(p_provider_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF NOT public.professional_staff_authority(p_provider_id, NULL) THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'employee_id', e.id, 'has_login', e.profile_id IS NOT NULL, 'has_profile', pp.id IS NOT NULL,
            'link_id', w.id, 'link_status', w.status, 'invited_at', w.invited_at, 'started_at', w.started_at,
            'handle', CASE WHEN w.status = 'active' AND pp.is_published AND pp.hidden_by_admin_at IS NULL THEN pp.handle END)
            ORDER BY e.created_at, e.id), '[]'::jsonb)
            FROM public.employees e
            JOIN public.branches b ON b.id = e.branch_id AND b.provider_id = p_provider_id
            LEFT JOIN public.professional_profiles pp ON pp.owner_id = e.profile_id
            LEFT JOIN LATERAL (
              SELECT w2.* FROM public.professional_workplaces w2
               WHERE w2.employee_id = e.id AND w2.professional_id = pp.id AND w2.status IN ('invited', 'active')
               ORDER BY w2.invited_at DESC LIMIT 1) w ON TRUE
           WHERE e.is_active AND public.professional_staff_authority(p_provider_id, e.branch_id));
END $$;
REVOKE ALL ON FUNCTION public.provider_professional_links(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_professional_links(UUID) TO authenticated, service_role;

-- The professionals a signed-in person follows. One that is no longer public is listed by handle only, so it can be unfollowed.
CREATE OR REPLACE FUNCTION public.list_followed_professionals()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'handle', pp.handle, 'available', (pp.is_published AND pp.hidden_by_admin_at IS NULL),
            'display_name_en', CASE WHEN pp.is_published AND pp.hidden_by_admin_at IS NULL THEN pp.display_name_en END,
            'display_name_ar', CASE WHEN pp.is_published AND pp.hidden_by_admin_at IS NULL THEN pp.display_name_ar END,
            'headline_en', CASE WHEN pp.is_published AND pp.hidden_by_admin_at IS NULL THEN pp.headline_en END,
            'headline_ar', CASE WHEN pp.is_published AND pp.hidden_by_admin_at IS NULL THEN pp.headline_ar END,
            'workplaces', CASE WHEN pp.is_published AND pp.hidden_by_admin_at IS NULL
                               THEN public.professional_public_workplaces(pp.id) ELSE '[]'::jsonb END,
            'notify_on_move', f.notify_on_move, 'followed_at', f.created_at) ORDER BY f.created_at DESC), '[]'::jsonb)
            FROM public.professional_follows f JOIN public.professional_profiles pp ON pp.id = f.professional_id
           WHERE f.follower_id = auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.list_followed_professionals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_followed_professionals() TO authenticated, service_role;

-- 10. Additive trigger 1: a link lives only while the employee row is active and belongs to the same login.
-- Deactivating the row, removing it, or releasing its login ends every open link of that row. Nothing else about the employee changes.
CREATE OR REPLACE FUNCTION public.end_professional_links_of_departed_employee()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reason TEXT;
  r RECORD;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_active IS TRUE AND NEW.is_active IS NOT TRUE THEN
      v_reason := 'employee_deactivated';
    ELSIF OLD.profile_id IS DISTINCT FROM NEW.profile_id THEN
      v_reason := 'login_released';
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    v_reason := 'employee_removed';
  END IF;

  FOR r IN
    UPDATE public.professional_workplaces
       SET status = CASE WHEN status = 'active' THEN 'former' ELSE 'declined' END,
           ended_at = now(), responded_at = COALESCE(responded_at, now()), closed_by = 'system', closed_reason = v_reason
     WHERE employee_id = OLD.id AND status IN ('invited', 'active')
    RETURNING id, status
  LOOP
    PERFORM public.write_audit_log('professional.link_closed_by_system', 'professional_workplaces', r.id,
      jsonb_build_object('reason', v_reason, 'now', r.status));
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.end_professional_links_of_departed_employee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_end_professional_links_on_update ON public.employees;
CREATE TRIGGER trg_end_professional_links_on_update
  AFTER UPDATE OF is_active, profile_id ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.end_professional_links_of_departed_employee();
-- BEFORE DELETE: the foreign key then clears employee_id on the finished history row instead of an open one.
DROP TRIGGER IF EXISTS trg_end_professional_links_on_delete ON public.employees;
CREATE TRIGGER trg_end_professional_links_on_delete
  BEFORE DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.end_professional_links_of_departed_employee();

-- 11. Additive trigger 2: the state machine, and the move notice when a link starts after an earlier one ended.
-- invited -> active | declined, active -> former; former and declined are final. When a link becomes active and the same professional
-- had a link that ended, the followers who opted in get ONE in-app notification, unless pro.move_notice_min_days is unset (nothing is
-- sent) or the last notice for this professional is younger than that many days.
CREATE OR REPLACE FUNCTION public.professional_workplace_before_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_setting JSONB;
  v_days NUMERIC;
  v_p public.professional_profiles;
  v_name_en TEXT;
  v_name_ar TEXT;
  v_outcome TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NOT ((OLD.status = 'invited' AND NEW.status IN ('active', 'declined')) OR (OLD.status = 'active' AND NEW.status = 'former')) THEN
    RAISE EXCEPTION 'A workplace link cannot move from % to %', OLD.status, NEW.status USING ERRCODE = '22023';
  END IF;
  IF NOT (OLD.status = 'invited' AND NEW.status = 'active') THEN RETURN NEW; END IF;

  SELECT * INTO v_p FROM public.professional_profiles WHERE id = NEW.professional_id;
  IF NOT EXISTS (SELECT 1 FROM public.professional_workplaces w
                  WHERE w.professional_id = NEW.professional_id AND w.status = 'former' AND w.id <> NEW.id) THEN
    v_outcome := 'first_link';
  ELSE
    v_setting := public.platform_setting('pro.move_notice_min_days');
    IF v_setting IS NULL OR jsonb_typeof(v_setting) <> 'number' OR (v_setting #>> '{}')::numeric < 0 THEN
      v_outcome := 'not_configured';
    ELSE
      v_days := (v_setting #>> '{}')::numeric;
      IF v_p.last_move_notice_at IS NOT NULL AND now() < v_p.last_move_notice_at + (v_days * interval '1 day') THEN
        v_outcome := 'rate_limited';
      ELSE
        SELECT business_name_en, business_name_ar INTO v_name_en, v_name_ar FROM public.providers WHERE id = NEW.provider_id;
        INSERT INTO public.notifications (user_id, title_en, title_ar, body_en, body_ar, type, data)
        SELECT f.follower_id,
               v_p.display_name_en || ' can now be booked at ' || v_name_en,
               v_p.display_name_ar || ' متاح للحجز الآن في ' || v_name_ar,
               'You follow ' || v_p.display_name_en || '. Open the profile to see where to book them now.',
               'أنت تتابع ' || v_p.display_name_ar || '. افتح الملف لتعرف أين يمكنك الحجز معه الآن.',
               'professional_move',
               jsonb_build_object('url', '/pro/' || v_p.handle, 'handle', v_p.handle,
                                  'book_url', '/shop/' || NEW.provider_id::text || '?source=link')
          FROM public.professional_follows f
         WHERE f.professional_id = NEW.professional_id AND f.notify_on_move AND f.follower_id <> v_p.owner_id;
        UPDATE public.professional_profiles SET last_move_notice_at = now() WHERE id = v_p.id;
        NEW.move_notice_sent_at := now();
        v_outcome := 'sent';
      END IF;
    END IF;
  END IF;
  NEW.move_notice_outcome := v_outcome;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.professional_workplace_before_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_professional_workplace_before_update ON public.professional_workplaces;
CREATE TRIGGER trg_professional_workplace_before_update
  BEFORE UPDATE OF status ON public.professional_workplaces
  FOR EACH ROW EXECUTE FUNCTION public.professional_workplace_before_update();
