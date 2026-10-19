-- QAFIX (QA release gate, docs/reviews/2026-10-17-qa-release-gate.md, critical gap
-- direct-table-updates-report-success-when-the-row-policy-refuses).
--
-- The services, branches, packages, integrations and payment-method controls wrote their tables directly from the browser.
-- When the console role lacks the table permission, the restrictive row policy matches no row, PostgREST answers 200 with
-- nothing changed and the screen reported success. Three of the writes could not work for anyone:
--   * services.is_active is derived from services.status by sync_service_status_fields, so "Inactive" and "Archive" were
--     reverted by the trigger even for an owner;
--   * packages carry no administrator write policy at all, so every package toggle matched no row;
--   * the default payment method switch was two browser writes that cleared the default of every audience (customer and
--     provider) and could leave two defaults or none.
-- Each control now calls one command that checks the console permission and names it when it is missing, refuses a missing
-- or stale row instead of matching nothing, validates its values, records the operator's reason (required where the change
-- is high risk) and answers what it changed. The row-level audit trigger keeps recording before and after values; the
-- reason reaches it through primora.audit_reason. The direct-write policies stay as the boundary for anything else.
--
-- Also here:
--   * integration_audit_log is written by the integration commands only; the console no longer inserts its own rows
--     (gap integration-audit-log-accepts-client-written-rows), so client INSERT is withdrawn;
--   * a console account reads inactive packages too, so a switched-off package can be switched on again
--     (gap admin-packages-screen-controls-reach-no-rows).

-- ---------------------------------------------------------------------------------------------------------------------
-- 0. The refusal every command below gives a console role without the permission
-- ---------------------------------------------------------------------------------------------------------------------
-- The hint lets the console say which permission is missing in the reader's language; DETAIL carries the permission key.
CREATE OR REPLACE FUNCTION public.console_require_permission(p_permission TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_can(p_permission) THEN
    RAISE EXCEPTION 'Your console role does not include the % permission, so nothing was changed', p_permission
      USING ERRCODE = '42501', HINT = 'missing_permission', DETAIL = p_permission;
  END IF;
END;
$$;
-- Called only inside the console commands (which run as the owner); no client calls it directly.
REVOKE ALL ON FUNCTION public.console_require_permission(TEXT) FROM PUBLIC, anon, authenticated;

-- A stale screen: the record changed after the operator loaded it.
CREATE OR REPLACE FUNCTION public.console_require_unchanged(p_current TIMESTAMPTZ, p_expected TIMESTAMPTZ, p_what TEXT)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_expected IS NOT NULL AND p_current IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'This % was changed by someone else after you opened it, so nothing was changed. Reload to see the current values', p_what
      USING ERRCODE = '40001', HINT = 'stale_write';
  END IF;
END;
$$;
-- Called only inside the console commands (which run as the owner); no client calls it directly.
REVOKE ALL ON FUNCTION public.console_require_unchanged(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Services: create, edit, price, status (active, inactive, archived) and featured flags through one command
-- ---------------------------------------------------------------------------------------------------------------------
-- p_service_id NULL creates; otherwise only the fields present in p_values change. Status is the stored state (is_active is
-- derived from it by sync_service_status_fields): 'active' is bookable, 'draft' is switched off, 'archived' is retired and
-- keeps its bookings and history. p_expected_updated_at, when given, refuses a write over a newer change.
CREATE OR REPLACE FUNCTION public.admin_save_service(
  p_service_id UUID,
  p_values JSONB,
  p_reason TEXT DEFAULT NULL,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed CONSTANT TEXT[] := ARRAY['name_en', 'name_ar', 'category_id', 'base_price', 'base_duration_minutes',
    'description_en', 'description_ar', 'images', 'provider_id', 'status', 'featured_on_landing', 'featured_in_services'];
  v_values JSONB := COALESCE(p_values, '{}'::jsonb);
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_key TEXT;
  v_old public.services;
  v_new public.services;
  v_after public.services;
  v_image TEXT;
BEGIN
  PERFORM public.console_require_permission('operations.write');
  IF jsonb_typeof(v_values) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'The service values must be an object' USING ERRCODE = '22023';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(v_values) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'The service field % cannot be set from the console', v_key USING ERRCODE = '22023', HINT = 'unknown_field';
    END IF;
  END LOOP;
  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'The reason is at most 500 characters' USING ERRCODE = '22023';
  END IF;

  IF p_service_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.services WHERE id = p_service_id FOR UPDATE;
    IF v_old.id IS NULL THEN
      RAISE EXCEPTION 'This service no longer exists, so nothing was changed' USING ERRCODE = 'P0002', HINT = 'not_found';
    END IF;
    PERFORM public.console_require_unchanged(v_old.updated_at, p_expected_updated_at, 'service');
  ELSE
    IF NOT (v_values ? 'status') THEN
      v_values := v_values || jsonb_build_object('status', 'active');
    END IF;
  END IF;

  BEGIN
    v_new := jsonb_populate_record(v_old, v_values);
  EXCEPTION WHEN invalid_text_representation OR datatype_mismatch OR numeric_value_out_of_range OR invalid_parameter_value THEN
    RAISE EXCEPTION 'A service field has a value of the wrong kind (names are text, price and duration are numbers)' USING ERRCODE = '22023';
  END;

  v_new.name_en := btrim(COALESCE(v_new.name_en, ''));
  v_new.name_ar := btrim(COALESCE(v_new.name_ar, ''));
  IF v_new.name_en = '' OR v_new.name_ar = '' THEN
    RAISE EXCEPTION 'A service needs an English and an Arabic name' USING ERRCODE = '22023', HINT = 'service_names_required';
  END IF;
  IF char_length(v_new.name_en) > 150 OR char_length(v_new.name_ar) > 150 THEN
    RAISE EXCEPTION 'A service name is at most 150 characters' USING ERRCODE = '22023';
  END IF;
  IF v_new.category_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = v_new.category_id) THEN
    RAISE EXCEPTION 'Choose an existing category for the service' USING ERRCODE = '22023', HINT = 'service_category_required';
  END IF;
  IF v_new.provider_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.providers p WHERE p.id = v_new.provider_id) THEN
    RAISE EXCEPTION 'The business chosen for the service does not exist' USING ERRCODE = '22023';
  END IF;
  IF v_new.base_price IS NULL OR v_new.base_price < 0 THEN
    RAISE EXCEPTION 'The price is a number of SAR, zero or more' USING ERRCODE = '22023', HINT = 'service_price_invalid';
  END IF;
  IF v_new.base_duration_minutes IS NULL OR v_new.base_duration_minutes < 5 OR v_new.base_duration_minutes > 1440 THEN
    RAISE EXCEPTION 'The duration is between 5 and 1440 minutes' USING ERRCODE = '22023', HINT = 'service_duration_invalid';
  END IF;
  IF v_new.status IS NULL OR v_new.status NOT IN ('active', 'draft', 'archived') THEN
    RAISE EXCEPTION 'The service status is active, draft or archived' USING ERRCODE = '22023';
  END IF;
  IF char_length(COALESCE(v_new.description_en, '')) > 2000 OR char_length(COALESCE(v_new.description_ar, '')) > 2000 THEN
    RAISE EXCEPTION 'A description is at most 2000 characters' USING ERRCODE = '22023';
  END IF;
  v_new.description_en := NULLIF(btrim(COALESCE(v_new.description_en, '')), '');
  v_new.description_ar := NULLIF(btrim(COALESCE(v_new.description_ar, '')), '');
  v_new.images := COALESCE(v_new.images, '{}'::text[]);
  IF cardinality(v_new.images) > 10 THEN
    RAISE EXCEPTION 'A service has at most 10 images' USING ERRCODE = '22023';
  END IF;
  FOREACH v_image IN ARRAY v_new.images LOOP
    IF v_image IS NULL OR char_length(v_image) > 2048 OR v_image !~ '^(https://|/)[^[:space:]]+$' THEN
      RAISE EXCEPTION 'An image is a web address starting with https:// or a site path starting with /' USING ERRCODE = '22023', HINT = 'service_image_invalid';
    END IF;
  END LOOP;
  v_new.featured_on_landing := COALESCE(v_new.featured_on_landing, FALSE);
  v_new.featured_in_services := COALESCE(v_new.featured_in_services, FALSE);

  IF v_reason IS NOT NULL THEN
    PERFORM set_config('primora.audit_reason', v_reason, true);
  END IF;

  IF p_service_id IS NULL THEN
    INSERT INTO public.services (name_en, name_ar, category_id, base_price, base_duration_minutes, description_en, description_ar,
                                 images, provider_id, status, featured_on_landing, featured_in_services)
    VALUES (v_new.name_en, v_new.name_ar, v_new.category_id, v_new.base_price, v_new.base_duration_minutes, v_new.description_en,
            v_new.description_ar, v_new.images, v_new.provider_id, v_new.status, v_new.featured_on_landing, v_new.featured_in_services)
    RETURNING * INTO v_after;
  ELSE
    IF v_new.name_en IS NOT DISTINCT FROM v_old.name_en AND v_new.name_ar IS NOT DISTINCT FROM v_old.name_ar
       AND v_new.category_id IS NOT DISTINCT FROM v_old.category_id AND v_new.base_price IS NOT DISTINCT FROM v_old.base_price
       AND v_new.base_duration_minutes IS NOT DISTINCT FROM v_old.base_duration_minutes
       AND v_new.description_en IS NOT DISTINCT FROM v_old.description_en AND v_new.description_ar IS NOT DISTINCT FROM v_old.description_ar
       AND v_new.images IS NOT DISTINCT FROM v_old.images AND v_new.provider_id IS NOT DISTINCT FROM v_old.provider_id
       AND v_new.status IS NOT DISTINCT FROM v_old.status AND v_new.featured_on_landing IS NOT DISTINCT FROM v_old.featured_on_landing
       AND v_new.featured_in_services IS NOT DISTINCT FROM v_old.featured_in_services THEN
      v_after := v_old;
      RETURN jsonb_build_object('success', TRUE, 'changed', FALSE, 'created', FALSE, 'service', jsonb_build_object(
        'id', v_after.id, 'name_en', v_after.name_en, 'name_ar', v_after.name_ar, 'category_id', v_after.category_id,
        'base_price', v_after.base_price, 'base_duration_minutes', v_after.base_duration_minutes,
        'description_en', v_after.description_en, 'description_ar', v_after.description_ar, 'images', to_jsonb(v_after.images),
        'provider_id', v_after.provider_id, 'status', v_after.status, 'is_active', v_after.is_active,
        'featured_on_landing', v_after.featured_on_landing, 'featured_in_services', v_after.featured_in_services,
        'updated_at', v_after.updated_at));
    END IF;
    UPDATE public.services
       SET name_en = v_new.name_en, name_ar = v_new.name_ar, category_id = v_new.category_id, base_price = v_new.base_price,
           base_duration_minutes = v_new.base_duration_minutes, description_en = v_new.description_en,
           description_ar = v_new.description_ar, images = v_new.images, provider_id = v_new.provider_id, status = v_new.status,
           featured_on_landing = v_new.featured_on_landing, featured_in_services = v_new.featured_in_services
     WHERE id = v_old.id
    RETURNING * INTO v_after;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'changed', TRUE, 'created', p_service_id IS NULL, 'service', jsonb_build_object(
    'id', v_after.id, 'name_en', v_after.name_en, 'name_ar', v_after.name_ar, 'category_id', v_after.category_id,
    'base_price', v_after.base_price, 'base_duration_minutes', v_after.base_duration_minutes,
    'description_en', v_after.description_en, 'description_ar', v_after.description_ar, 'images', to_jsonb(v_after.images),
    'provider_id', v_after.provider_id, 'status', v_after.status, 'is_active', v_after.is_active,
    'featured_on_landing', v_after.featured_on_landing, 'featured_in_services', v_after.featured_in_services,
    'updated_at', v_after.updated_at));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_save_service(UUID, JSONB, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_service(UUID, JSONB, TEXT, TIMESTAMPTZ) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Branches: take a venue offline or bring it back, with a reason
-- ---------------------------------------------------------------------------------------------------------------------
-- Existing bookings stay; the answer counts the upcoming ones so the operator knows who may need a call.
CREATE OR REPLACE FUNCTION public.admin_set_branch_active(p_branch_id UUID, p_active BOOLEAN, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_branch public.branches;
  v_upcoming INTEGER;
BEGIN
  PERFORM public.console_require_permission('operations.write');
  IF p_active IS NULL THEN
    RAISE EXCEPTION 'Say whether the branch is online or offline' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023', HINT = 'reason_required';
  END IF;
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'The reason is at most 500 characters' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id FOR UPDATE;
  IF v_branch.id IS NULL THEN
    RAISE EXCEPTION 'This branch no longer exists, so nothing was changed' USING ERRCODE = 'P0002', HINT = 'not_found';
  END IF;
  SELECT count(*)::int INTO v_upcoming FROM public.bookings b
   WHERE b.branch_id = v_branch.id AND b.status IN ('pending_payment', 'confirmed') AND b.scheduled_at > now();
  IF v_branch.is_active = p_active THEN
    RETURN jsonb_build_object('success', TRUE, 'changed', FALSE, 'branch_id', v_branch.id, 'is_active', v_branch.is_active,
                              'upcoming_bookings', v_upcoming);
  END IF;
  PERFORM set_config('primora.audit_reason', v_reason, true);
  UPDATE public.branches SET is_active = p_active WHERE id = v_branch.id;
  PERFORM public.write_audit_log(CASE WHEN p_active THEN 'branch.reactivated' ELSE 'branch.deactivated' END, 'branches', v_branch.id,
    jsonb_build_object('reason', v_reason, 'active_before', v_branch.is_active, 'active_after', p_active,
                       'upcoming_bookings', v_upcoming));
  RETURN jsonb_build_object('success', TRUE, 'changed', TRUE, 'branch_id', v_branch.id, 'is_active', p_active,
                            'upcoming_bookings', v_upcoming);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_branch_active(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_branch_active(UUID, BOOLEAN, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Packages: switch a package off or on, with a reason
-- ---------------------------------------------------------------------------------------------------------------------
-- Vouchers customers already bought keep working (the redemption rules read user_packages, not packages.is_active).
CREATE OR REPLACE FUNCTION public.admin_set_package_active(p_package_id UUID, p_active BOOLEAN, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_package public.packages;
BEGIN
  PERFORM public.console_require_permission('operations.write');
  IF p_active IS NULL THEN
    RAISE EXCEPTION 'Say whether the package is on sale or not' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023', HINT = 'reason_required';
  END IF;
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'The reason is at most 500 characters' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_package FROM public.packages WHERE id = p_package_id FOR UPDATE;
  IF v_package.id IS NULL THEN
    RAISE EXCEPTION 'This package no longer exists, so nothing was changed' USING ERRCODE = 'P0002', HINT = 'not_found';
  END IF;
  IF COALESCE(v_package.is_active, FALSE) = p_active THEN
    RETURN jsonb_build_object('success', TRUE, 'changed', FALSE, 'package_id', v_package.id, 'is_active', p_active);
  END IF;
  PERFORM set_config('primora.audit_reason', v_reason, true);
  UPDATE public.packages SET is_active = p_active WHERE id = v_package.id;
  PERFORM public.write_audit_log(CASE WHEN p_active THEN 'package.activated' ELSE 'package.deactivated' END, 'packages', v_package.id,
    jsonb_build_object('reason', v_reason, 'active_before', v_package.is_active, 'active_after', p_active));
  RETURN jsonb_build_object('success', TRUE, 'changed', TRUE, 'package_id', v_package.id, 'is_active', p_active);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_package_active(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_package_active(UUID, BOOLEAN, TEXT) TO authenticated;

-- The package list shows switched-off packages to a console account too (the public policy shows active ones only), so a
-- package switched off by mistake can be switched on again. Packages hold no personal data.
DROP POLICY IF EXISTS "Console accounts read every package" ON public.packages;
CREATE POLICY "Console accounts read every package" ON public.packages FOR SELECT TO authenticated USING (public.is_admin());

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Integrations: state (on/off, test/live, connected) and registry details, with a reason and a fresh code
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.integration_answer(p_row public.integrations)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object('id', p_row.id, 'key', p_row.key, 'name', p_row.name, 'category', p_row.category,
    'status', p_row.status, 'enabled', p_row.enabled, 'env', p_row.env, 'key_masked', p_row.key_masked,
    'webhook_url', p_row.webhook_url, 'last_checked_at', p_row.last_checked_at, 'updated_at', p_row.updated_at,
    'base_url', p_row.base_url, 'platform_area', p_row.platform_area, 'description', p_row.description,
    'created_at', p_row.created_at, 'supported_payment_method_keys', to_jsonb(p_row.supported_payment_method_keys));
$$;
-- Called only inside the console commands (which run as the owner); no client calls it directly.
REVOKE ALL ON FUNCTION public.integration_answer(public.integrations) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_integration_state(
  p_integration_id UUID,
  p_changes JSONB,
  p_reason TEXT,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes JSONB := COALESCE(p_changes, '{}'::jsonb);
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_key TEXT;
  v_row public.integrations;
  v_after public.integrations;
  v_enabled BOOLEAN;
  v_env TEXT;
  v_status TEXT;
  v_summary TEXT[] := ARRAY[]::text[];
BEGIN
  PERFORM public.require_recent_mfa();
  PERFORM public.console_require_permission('settings.manage');
  IF jsonb_typeof(v_changes) IS DISTINCT FROM 'object' OR v_changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'Say what to change: enabled, env or status' USING ERRCODE = '22023';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(v_changes) LOOP
    IF v_key NOT IN ('enabled', 'env', 'status') THEN
      RAISE EXCEPTION 'The integration field % is changed with the edit form, not here', v_key USING ERRCODE = '22023', HINT = 'unknown_field';
    END IF;
  END LOOP;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023', HINT = 'reason_required';
  END IF;
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'The reason is at most 500 characters' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.integrations WHERE id = p_integration_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'This integration no longer exists, so nothing was changed' USING ERRCODE = 'P0002', HINT = 'not_found';
  END IF;
  PERFORM public.console_require_unchanged(v_row.updated_at, p_expected_updated_at, 'integration');

  v_enabled := v_row.enabled;
  v_env := v_row.env;
  v_status := v_row.status;
  IF v_changes ? 'enabled' THEN
    IF jsonb_typeof(v_changes -> 'enabled') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'enabled is true or false' USING ERRCODE = '22023';
    END IF;
    v_enabled := (v_changes ->> 'enabled')::boolean;
  END IF;
  IF v_changes ? 'env' THEN
    v_env := v_changes ->> 'env';
    IF v_env IS NULL OR v_env NOT IN ('test', 'live') THEN
      RAISE EXCEPTION 'The environment is test or live' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_changes ? 'status' THEN
    v_status := v_changes ->> 'status';
    IF v_status IS NULL OR v_status NOT IN ('connected', 'disconnected') THEN
      RAISE EXCEPTION 'The connection status is connected or disconnected' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_enabled = v_row.enabled AND v_env = v_row.env AND v_status = v_row.status THEN
    RETURN jsonb_build_object('success', TRUE, 'changed', FALSE, 'integration', public.integration_answer(v_row));
  END IF;
  IF v_enabled IS DISTINCT FROM v_row.enabled THEN
    v_summary := v_summary || CASE WHEN v_enabled THEN 'enabled' ELSE 'disabled' END;
  END IF;
  IF v_env IS DISTINCT FROM v_row.env THEN
    v_summary := v_summary || ('environment ' || v_row.env || ' to ' || v_env);
  END IF;
  IF v_status IS DISTINCT FROM v_row.status THEN
    v_summary := v_summary || ('status ' || v_row.status || ' to ' || v_status);
  END IF;

  PERFORM set_config('primora.audit_reason', v_reason, true);
  UPDATE public.integrations SET enabled = v_enabled, env = v_env, status = v_status WHERE id = v_row.id RETURNING * INTO v_after;
  INSERT INTO public.integration_audit_log (integration_key, actor_id, change)
  VALUES (v_row.key, auth.uid(), array_to_string(v_summary, ', ') || ' (reason: ' || v_reason || ')');
  RETURN jsonb_build_object('success', TRUE, 'changed', TRUE, 'integration', public.integration_answer(v_after));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_integration_state(UUID, JSONB, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_integration_state(UUID, JSONB, TEXT, TIMESTAMPTZ) TO authenticated;

-- Registry details. p_integration_id NULL adds an integration. The key of an existing integration is fixed: payment
-- methods name their gateway by it.
CREATE OR REPLACE FUNCTION public.admin_save_integration(
  p_integration_id UUID,
  p_values JSONB,
  p_reason TEXT,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed CONSTANT TEXT[] := ARRAY['key', 'name', 'category', 'platform_area', 'base_url', 'key_masked', 'webhook_url', 'status',
    'enabled', 'env', 'description', 'supported_payment_method_keys'];
  v_sections CONSTANT TEXT[] := ARRAY['payments', 'maps', 'sms', 'push', 'email', 'whatsapp', 'calendar', 'analytics', 'ai', 'auth',
    'storage', 'logistics'];
  v_areas CONSTANT TEXT[] := ARRAY['all', 'customer', 'provider', 'admin', 'customer_provider', 'notifications', 'edge_functions', 'mobile'];
  v_values JSONB := COALESCE(p_values, '{}'::jsonb);
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_key TEXT;
  v_old public.integrations;
  v_new public.integrations;
  v_after public.integrations;
  v_method TEXT;
BEGIN
  PERFORM public.require_recent_mfa();
  PERFORM public.console_require_permission('settings.manage');
  IF jsonb_typeof(v_values) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'The integration values must be an object' USING ERRCODE = '22023';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(v_values) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'The integration field % cannot be set from the console', v_key USING ERRCODE = '22023', HINT = 'unknown_field';
    END IF;
  END LOOP;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023', HINT = 'reason_required';
  END IF;
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'The reason is at most 500 characters' USING ERRCODE = '22023';
  END IF;

  IF p_integration_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.integrations WHERE id = p_integration_id FOR UPDATE;
    IF v_old.id IS NULL THEN
      RAISE EXCEPTION 'This integration no longer exists, so nothing was changed' USING ERRCODE = 'P0002', HINT = 'not_found';
    END IF;
    PERFORM public.console_require_unchanged(v_old.updated_at, p_expected_updated_at, 'integration');
    IF v_values ? 'key' AND (v_values ->> 'key') IS DISTINCT FROM v_old.key THEN
      RAISE EXCEPTION 'The key of an existing integration cannot be changed: payment methods name their gateway by it'
        USING ERRCODE = '22023', HINT = 'integration_key_fixed';
    END IF;
  END IF;

  BEGIN
    v_new := jsonb_populate_record(v_old, v_values);
  EXCEPTION WHEN invalid_text_representation OR datatype_mismatch OR invalid_parameter_value THEN
    RAISE EXCEPTION 'An integration field has a value of the wrong kind' USING ERRCODE = '22023';
  END;

  v_new.key := btrim(COALESCE(v_new.key, ''));
  v_new.name := btrim(COALESCE(v_new.name, ''));
  IF v_new.key !~ '^[a-z0-9_]{2,48}$' THEN
    RAISE EXCEPTION 'The integration key is 2 to 48 lower-case letters, digits or underscores' USING ERRCODE = '22023', HINT = 'integration_key_invalid';
  END IF;
  IF v_new.name = '' OR char_length(v_new.name) > 120 THEN
    RAISE EXCEPTION 'The integration needs a name of at most 120 characters' USING ERRCODE = '22023', HINT = 'integration_name_required';
  END IF;
  IF v_new.category IS NULL OR NOT (v_new.category = ANY (v_sections)) THEN
    RAISE EXCEPTION 'Choose one of the listed integration sections' USING ERRCODE = '22023';
  END IF;
  v_new.platform_area := COALESCE(NULLIF(v_new.platform_area, ''), 'all');
  IF NOT (v_new.platform_area = ANY (v_areas)) THEN
    RAISE EXCEPTION 'Choose one of the listed platform sides' USING ERRCODE = '22023';
  END IF;
  v_new.base_url := NULLIF(btrim(COALESCE(v_new.base_url, '')), '');
  IF v_new.base_url IS NOT NULL AND (char_length(v_new.base_url) > 500 OR v_new.base_url !~ '^https://[^[:space:]]+$') THEN
    RAISE EXCEPTION 'The base URL starts with https://' USING ERRCODE = '22023', HINT = 'integration_url_invalid';
  END IF;
  v_new.webhook_url := NULLIF(btrim(COALESCE(v_new.webhook_url, '')), '');
  IF v_new.webhook_url IS NOT NULL AND (char_length(v_new.webhook_url) > 500 OR v_new.webhook_url !~ '^(https://|/functions/v1/)[^[:space:]]+$') THEN
    RAISE EXCEPTION 'The webhook is an https:// address or a /functions/v1/ path' USING ERRCODE = '22023', HINT = 'integration_url_invalid';
  END IF;
  v_new.key_masked := NULLIF(btrim(COALESCE(v_new.key_masked, '')), '');
  IF v_new.key_masked IS NOT NULL AND v_new.key_masked !~ '^[*•]{0,12}[A-Za-z0-9]{0,4}$' THEN
    RAISE EXCEPTION 'The key hint holds bullets and the last four characters of the key only; never a full key'
      USING ERRCODE = '22023', HINT = 'integration_key_hint_invalid';
  END IF;
  v_new.status := COALESCE(v_new.status, 'disconnected');
  IF v_new.status NOT IN ('connected', 'disconnected') THEN
    RAISE EXCEPTION 'The connection status is connected or disconnected' USING ERRCODE = '22023';
  END IF;
  v_new.env := COALESCE(v_new.env, 'test');
  IF v_new.env NOT IN ('test', 'live') THEN
    RAISE EXCEPTION 'The environment is test or live' USING ERRCODE = '22023';
  END IF;
  v_new.enabled := COALESCE(v_new.enabled, FALSE);
  v_new.description := NULLIF(btrim(COALESCE(v_new.description, '')), '');
  IF char_length(COALESCE(v_new.description, '')) > 1000 THEN
    RAISE EXCEPTION 'The notes are at most 1000 characters' USING ERRCODE = '22023';
  END IF;
  IF v_new.category <> 'payments' THEN
    v_new.supported_payment_method_keys := '{}'::text[];
  END IF;
  v_new.supported_payment_method_keys := COALESCE(v_new.supported_payment_method_keys, '{}'::text[]);
  FOREACH v_method IN ARRAY v_new.supported_payment_method_keys LOOP
    IF NOT EXISTS (SELECT 1 FROM public.payment_methods pm WHERE pm.key = v_method) THEN
      RAISE EXCEPTION 'Unknown payment method %', v_method USING ERRCODE = '22023';
    END IF;
  END LOOP;

  PERFORM set_config('primora.audit_reason', v_reason, true);
  IF p_integration_id IS NULL THEN
    BEGIN
      INSERT INTO public.integrations (key, name, category, platform_area, base_url, key_masked, webhook_url, status, enabled, env,
                                       description, supported_payment_method_keys)
      VALUES (v_new.key, v_new.name, v_new.category, v_new.platform_area, v_new.base_url, v_new.key_masked, v_new.webhook_url,
              v_new.status, v_new.enabled, v_new.env, v_new.description, v_new.supported_payment_method_keys)
      RETURNING * INTO v_after;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'An integration with the key % already exists', v_new.key USING ERRCODE = '23505', HINT = 'integration_key_taken';
    END;
    INSERT INTO public.integration_audit_log (integration_key, actor_id, change)
    VALUES (v_after.key, auth.uid(), 'created integration (reason: ' || v_reason || ')');
    RETURN jsonb_build_object('success', TRUE, 'changed', TRUE, 'created', TRUE, 'integration', public.integration_answer(v_after));
  END IF;

  IF v_new.name IS NOT DISTINCT FROM v_old.name AND v_new.category IS NOT DISTINCT FROM v_old.category
     AND v_new.platform_area IS NOT DISTINCT FROM v_old.platform_area AND v_new.base_url IS NOT DISTINCT FROM v_old.base_url
     AND v_new.key_masked IS NOT DISTINCT FROM v_old.key_masked AND v_new.webhook_url IS NOT DISTINCT FROM v_old.webhook_url
     AND v_new.status IS NOT DISTINCT FROM v_old.status AND v_new.enabled IS NOT DISTINCT FROM v_old.enabled
     AND v_new.env IS NOT DISTINCT FROM v_old.env AND v_new.description IS NOT DISTINCT FROM v_old.description
     AND v_new.supported_payment_method_keys IS NOT DISTINCT FROM v_old.supported_payment_method_keys THEN
    RETURN jsonb_build_object('success', TRUE, 'changed', FALSE, 'created', FALSE, 'integration', public.integration_answer(v_old));
  END IF;
  UPDATE public.integrations
     SET name = v_new.name, category = v_new.category, platform_area = v_new.platform_area, base_url = v_new.base_url,
         key_masked = v_new.key_masked, webhook_url = v_new.webhook_url, status = v_new.status, enabled = v_new.enabled,
         env = v_new.env, description = v_new.description, supported_payment_method_keys = v_new.supported_payment_method_keys
   WHERE id = v_old.id
  RETURNING * INTO v_after;
  INSERT INTO public.integration_audit_log (integration_key, actor_id, change)
  VALUES (v_after.key, auth.uid(), 'updated integration details (reason: ' || v_reason || ')');
  RETURN jsonb_build_object('success', TRUE, 'changed', TRUE, 'created', FALSE, 'integration', public.integration_answer(v_after));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_save_integration(UUID, JSONB, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_integration(UUID, JSONB, TEXT, TIMESTAMPTZ) TO authenticated;

-- The integration history is written by the commands above, never by a browser.
DROP POLICY IF EXISTS "Admins write integration audit log" ON public.integration_audit_log;
DROP POLICY IF EXISTS "Console role guards administrator inserts" ON public.integration_audit_log;
REVOKE INSERT, UPDATE, DELETE ON public.integration_audit_log FROM authenticated, anon;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Payment methods: on/off and gateway, and one atomic default per audience, with a reason and a fresh code
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_method_answer(p_row public.payment_methods)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object('id', p_row.id, 'key', p_row.key, 'label_en', p_row.label_en, 'label_ar', p_row.label_ar,
    'gateway_key', p_row.gateway_key, 'enabled', p_row.enabled, 'enabled_for_roles', to_jsonb(p_row.enabled_for_roles),
    'is_default', p_row.is_default, 'env', p_row.env, 'sort_order', p_row.sort_order, 'updated_at', p_row.updated_at,
    'requires_gateway', p_row.requires_gateway, 'gateway_priority', to_jsonb(p_row.gateway_priority));
$$;
-- Called only inside the console commands (which run as the owner); no client calls it directly.
REVOKE ALL ON FUNCTION public.payment_method_answer(public.payment_methods) FROM PUBLIC, anon, authenticated;

-- True when the method can take a payment through its gateway: no gateway needed, the internal one, or an enabled and
-- connected payments integration that supports the method in the method's environment (the rule the screen shows).
CREATE OR REPLACE FUNCTION public.payment_method_operational(p_row public.payment_methods)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT p_row.requires_gateway
      OR p_row.gateway_key = 'internal'
      OR EXISTS (SELECT 1 FROM public.integrations i
                  WHERE i.key = p_row.gateway_key AND i.category = 'payments' AND i.enabled AND i.status = 'connected'
                    AND i.env = p_row.env AND p_row.key = ANY (i.supported_payment_method_keys));
$$;
-- Called only inside the console commands (which run as the owner); no client calls it directly.
REVOKE ALL ON FUNCTION public.payment_method_operational(public.payment_methods) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_payment_method(p_method_id UUID, p_changes JSONB, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes JSONB := COALESCE(p_changes, '{}'::jsonb);
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_key TEXT;
  v_row public.payment_methods;
  v_after public.payment_methods;
  v_enabled BOOLEAN;
  v_gateway TEXT;
  v_env TEXT;
  v_integration public.integrations;
BEGIN
  PERFORM public.require_recent_mfa();
  PERFORM public.console_require_permission('settings.manage');
  IF jsonb_typeof(v_changes) IS DISTINCT FROM 'object' OR v_changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'Say what to change: enabled or gateway_key' USING ERRCODE = '22023';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(v_changes) LOOP
    IF v_key NOT IN ('enabled', 'gateway_key') THEN
      RAISE EXCEPTION 'The payment method field % cannot be set from the console', v_key USING ERRCODE = '22023', HINT = 'unknown_field';
    END IF;
  END LOOP;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023', HINT = 'reason_required';
  END IF;
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'The reason is at most 500 characters' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.payment_methods WHERE id = p_method_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'This payment method no longer exists, so nothing was changed' USING ERRCODE = 'P0002', HINT = 'not_found';
  END IF;

  v_enabled := v_row.enabled;
  v_gateway := v_row.gateway_key;
  v_env := v_row.env;
  IF v_changes ? 'enabled' THEN
    IF jsonb_typeof(v_changes -> 'enabled') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'enabled is true or false' USING ERRCODE = '22023';
    END IF;
    v_enabled := (v_changes ->> 'enabled')::boolean;
  END IF;
  IF v_changes ? 'gateway_key' THEN
    v_gateway := NULLIF(btrim(COALESCE(v_changes ->> 'gateway_key', '')), '');
    IF NOT v_row.requires_gateway THEN
      RAISE EXCEPTION 'This payment method needs no gateway' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_integration FROM public.integrations i
     WHERE i.key = v_gateway AND i.category = 'payments' AND i.enabled AND i.status = 'connected'
       AND v_row.key = ANY (i.supported_payment_method_keys);
    IF v_integration.id IS NULL THEN
      RAISE EXCEPTION 'Choose a connected, enabled payment integration that supports this method' USING ERRCODE = '22023',
        HINT = 'gateway_not_operational';
    END IF;
    -- The method runs in the environment of the gateway it is routed to.
    v_env := v_integration.env;
  END IF;

  IF v_enabled = v_row.enabled AND v_gateway IS NOT DISTINCT FROM v_row.gateway_key AND v_env = v_row.env THEN
    RETURN jsonb_build_object('success', TRUE, 'changed', FALSE, 'method', public.payment_method_answer(v_row));
  END IF;
  PERFORM set_config('primora.audit_reason', v_reason, true);
  UPDATE public.payment_methods SET enabled = v_enabled, gateway_key = v_gateway, env = v_env, updated_at = now()
   WHERE id = v_row.id RETURNING * INTO v_after;
  PERFORM public.write_audit_log('payment_method.changed', 'payment_methods', v_row.id,
    jsonb_build_object('key', v_row.key, 'reason', v_reason, 'enabled_before', v_row.enabled, 'enabled_after', v_enabled,
                       'gateway_before', v_row.gateway_key, 'gateway_after', v_gateway, 'env_before', v_row.env, 'env_after', v_env));
  RETURN jsonb_build_object('success', TRUE, 'changed', TRUE, 'method', public.payment_method_answer(v_after));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_payment_method(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_payment_method(UUID, JSONB, TEXT) TO authenticated;

-- One default per audience: the chosen method becomes the default (and is switched on) for the audiences it serves, and
-- only methods serving one of those audiences lose the mark. A customer default never removes the provider payout default.
CREATE OR REPLACE FUNCTION public.admin_set_default_payment_method(p_method_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_row public.payment_methods;
  v_after public.payment_methods;
  v_cleared TEXT[];
BEGIN
  PERFORM public.require_recent_mfa();
  PERFORM public.console_require_permission('settings.manage');
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023', HINT = 'reason_required';
  END IF;
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'The reason is at most 500 characters' USING ERRCODE = '22023';
  END IF;
  -- Every method is locked, in one order, so two defaults cannot be set at once.
  PERFORM 1 FROM public.payment_methods ORDER BY id FOR UPDATE;
  SELECT * INTO v_row FROM public.payment_methods WHERE id = p_method_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'This payment method no longer exists, so nothing was changed' USING ERRCODE = 'P0002', HINT = 'not_found';
  END IF;
  IF NOT public.payment_method_operational(v_row) THEN
    RAISE EXCEPTION 'This method has no connected payment integration in its environment, so it cannot be the default'
      USING ERRCODE = '22023', HINT = 'gateway_not_operational';
  END IF;
  IF v_row.is_default AND v_row.enabled
     AND NOT EXISTS (SELECT 1 FROM public.payment_methods o
                      WHERE o.id <> v_row.id AND o.is_default AND o.enabled_for_roles && v_row.enabled_for_roles) THEN
    RETURN jsonb_build_object('success', TRUE, 'changed', FALSE, 'method', public.payment_method_answer(v_row), 'cleared', '[]'::jsonb);
  END IF;
  PERFORM set_config('primora.audit_reason', v_reason, true);
  SELECT COALESCE(array_agg(o.key ORDER BY o.key), ARRAY[]::text[]) INTO v_cleared
    FROM public.payment_methods o
   WHERE o.id <> v_row.id AND o.is_default AND o.enabled_for_roles && v_row.enabled_for_roles;
  UPDATE public.payment_methods o SET is_default = FALSE, updated_at = now()
   WHERE o.id <> v_row.id AND o.is_default AND o.enabled_for_roles && v_row.enabled_for_roles;
  UPDATE public.payment_methods SET is_default = TRUE, enabled = TRUE, updated_at = now() WHERE id = v_row.id RETURNING * INTO v_after;
  PERFORM public.write_audit_log('payment_method.default_set', 'payment_methods', v_row.id,
    jsonb_build_object('key', v_row.key, 'reason', v_reason, 'audiences', to_jsonb(v_row.enabled_for_roles),
                       'previous_defaults', to_jsonb(v_cleared), 'enabled_before', v_row.enabled));
  RETURN jsonb_build_object('success', TRUE, 'changed', TRUE, 'method', public.payment_method_answer(v_after), 'cleared', to_jsonb(v_cleared));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_default_payment_method(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_default_payment_method(UUID, TEXT) TO authenticated;
