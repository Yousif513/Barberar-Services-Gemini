-- G72 Intake forms and patch tests: validation, the status function and view, and every command.
-- Nothing here redefines an existing function. Error codes: 28000 unauthenticated, 42501 forbidden, P0002 not found,
-- 22023 invalid input.

-- ---------------------------------------------------------------------------------------------------------------------
-- A. Validation of a template (the provider's field list) and of a customer's answers.
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intake_normalise_fields(p_fields JSONB) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_f JSONB;
  v_o JSONB;
  v_out JSONB := '[]'::jsonb;
  v_keys TEXT[] := ARRAY[]::TEXT[];
  v_vals TEXT[];
  v_key TEXT;
  v_type TEXT;
  v_opts JSONB;
  v_item JSONB;
  v_max INTEGER;
BEGIN
  IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'array' OR jsonb_array_length(p_fields) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'A form needs between 1 and 60 fields' USING ERRCODE = '22023';
  END IF;
  FOR v_f IN SELECT value FROM jsonb_array_elements(p_fields) LOOP
    IF jsonb_typeof(v_f) <> 'object' THEN
      RAISE EXCEPTION 'Every field must be an object' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_f -> 'key') IS DISTINCT FROM 'string' OR (v_f ->> 'key') !~ '^[a-z][a-z0-9_]{0,39}$' THEN
      RAISE EXCEPTION 'A field key must be 1 to 40 characters: a lowercase letter, then lowercase letters, digits or underscores' USING ERRCODE = '22023';
    END IF;
    v_key := v_f ->> 'key';
    IF v_key = ANY (v_keys) THEN
      RAISE EXCEPTION 'The field key % is used twice', v_key USING ERRCODE = '22023';
    END IF;
    v_keys := v_keys || v_key;
    v_type := v_f ->> 'type';
    IF jsonb_typeof(v_f -> 'type') IS DISTINCT FROM 'string'
       OR v_type NOT IN ('short_text', 'long_text', 'yes_no', 'single_choice', 'multi_choice', 'date', 'acknowledge') THEN
      RAISE EXCEPTION 'Field %: the type is not supported', v_key USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_f -> 'label_en') IS DISTINCT FROM 'string' OR jsonb_typeof(v_f -> 'label_ar') IS DISTINCT FROM 'string'
       OR char_length(btrim(v_f ->> 'label_en')) NOT BETWEEN 1 AND 300 OR char_length(btrim(v_f ->> 'label_ar')) NOT BETWEEN 1 AND 300 THEN
      RAISE EXCEPTION 'Field %: an English and an Arabic label of 1 to 300 characters are required', v_key USING ERRCODE = '22023';
    END IF;
    IF v_f ? 'required' AND jsonb_typeof(v_f -> 'required') NOT IN ('boolean', 'null') THEN
      RAISE EXCEPTION 'Field %: required must be true or false', v_key USING ERRCODE = '22023';
    END IF;
    v_item := jsonb_build_object('key', v_key, 'type', v_type, 'label_en', btrim(v_f ->> 'label_en'), 'label_ar', btrim(v_f ->> 'label_ar'),
                                 'required', COALESCE((v_f ->> 'required')::boolean, FALSE));
    IF v_type IN ('short_text', 'long_text') AND jsonb_typeof(v_f -> 'max_length') IS NOT NULL AND jsonb_typeof(v_f -> 'max_length') <> 'null' THEN
      IF jsonb_typeof(v_f -> 'max_length') <> 'number' OR (v_f ->> 'max_length') !~ '^[0-9]{1,4}$' THEN
        RAISE EXCEPTION 'Field %: the maximum length must be a whole number from 1 to 2000', v_key USING ERRCODE = '22023';
      END IF;
      v_max := (v_f ->> 'max_length')::integer;
      IF v_max NOT BETWEEN 1 AND 2000 THEN
        RAISE EXCEPTION 'Field %: the maximum length must be a whole number from 1 to 2000', v_key USING ERRCODE = '22023';
      END IF;
      v_item := v_item || jsonb_build_object('max_length', v_max);
    END IF;
    IF v_type IN ('single_choice', 'multi_choice') THEN
      v_opts := v_f -> 'options';
      IF jsonb_typeof(v_opts) IS DISTINCT FROM 'array' OR jsonb_array_length(v_opts) NOT BETWEEN 2 AND 30 THEN
        RAISE EXCEPTION 'Field %: a choice needs between 2 and 30 options', v_key USING ERRCODE = '22023';
      END IF;
      v_vals := ARRAY[]::TEXT[];
      v_item := v_item || jsonb_build_object('options', '[]'::jsonb);
      FOR v_o IN SELECT value FROM jsonb_array_elements(v_opts) LOOP
        IF jsonb_typeof(v_o) <> 'object' OR jsonb_typeof(v_o -> 'value') IS DISTINCT FROM 'string' OR (v_o ->> 'value') !~ '^[a-z0-9_]{1,40}$'
           OR jsonb_typeof(v_o -> 'label_en') IS DISTINCT FROM 'string' OR jsonb_typeof(v_o -> 'label_ar') IS DISTINCT FROM 'string'
           OR char_length(btrim(v_o ->> 'label_en')) NOT BETWEEN 1 AND 200 OR char_length(btrim(v_o ->> 'label_ar')) NOT BETWEEN 1 AND 200 THEN
          RAISE EXCEPTION 'Field %: every option needs a value and an English and an Arabic label', v_key USING ERRCODE = '22023';
        END IF;
        IF (v_o ->> 'value') = ANY (v_vals) THEN
          RAISE EXCEPTION 'Field %: an option value is used twice', v_key USING ERRCODE = '22023';
        END IF;
        v_vals := v_vals || (v_o ->> 'value');
        v_item := jsonb_set(v_item, '{options}', (v_item -> 'options') || jsonb_build_object(
          'value', v_o ->> 'value', 'label_en', btrim(v_o ->> 'label_en'), 'label_ar', btrim(v_o ->> 'label_ar')));
      END LOOP;
    END IF;
    v_out := v_out || jsonb_build_array(v_item);
  END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.intake_normalise_fields(JSONB) FROM PUBLIC, anon, authenticated;

-- Validates answers against one form version. Messages name the field, never the value (the value is health data).
CREATE OR REPLACE FUNCTION public.intake_validate_answers(p_fields JSONB, p_answers JSONB) RETURNS VOID
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_f JSONB;
  v_a JSONB;
  v_k TEXT;
  v_key TEXT;
  v_type TEXT;
  v_text TEXT;
  v_el JSONB;
  v_seen TEXT[];
  v_allowed TEXT[];
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'The answers must be an object' USING ERRCODE = '22023';
  END IF;
  FOR v_k IN SELECT jsonb_object_keys(p_answers) LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_fields) f WHERE f ->> 'key' = v_k) THEN
      RAISE EXCEPTION 'The form has no field named %', left(v_k, 40) USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR v_f IN SELECT value FROM jsonb_array_elements(p_fields) LOOP
    v_key := v_f ->> 'key';
    v_type := v_f ->> 'type';
    v_a := p_answers -> v_key;
    IF v_a IS NULL OR jsonb_typeof(v_a) = 'null'
       OR (jsonb_typeof(v_a) = 'string' AND btrim(v_a #>> '{}') = '')
       OR (jsonb_typeof(v_a) = 'array' AND jsonb_array_length(v_a) = 0) THEN
      IF COALESCE((v_f ->> 'required')::boolean, FALSE) THEN
        RAISE EXCEPTION 'Answer required: %', v_key USING ERRCODE = '22023';
      END IF;
      CONTINUE;
    END IF;
    IF v_type IN ('short_text', 'long_text') THEN
      IF jsonb_typeof(v_a) <> 'string' OR char_length(v_a #>> '{}') > COALESCE((v_f ->> 'max_length')::integer, 2000) THEN
        RAISE EXCEPTION 'Answer too long or not text: %', v_key USING ERRCODE = '22023';
      END IF;
    ELSIF v_type = 'yes_no' THEN
      IF jsonb_typeof(v_a) <> 'boolean' THEN
        RAISE EXCEPTION 'Answer must be yes or no: %', v_key USING ERRCODE = '22023';
      END IF;
    ELSIF v_type = 'acknowledge' THEN
      IF jsonb_typeof(v_a) <> 'boolean' OR (COALESCE((v_f ->> 'required')::boolean, FALSE) AND NOT (v_a)::text::boolean) THEN
        RAISE EXCEPTION 'Acknowledgement required: %', v_key USING ERRCODE = '22023';
      END IF;
    ELSIF v_type = 'date' THEN
      IF jsonb_typeof(v_a) <> 'string' OR (v_a #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION 'Answer must be a date (YYYY-MM-DD): %', v_key USING ERRCODE = '22023';
      END IF;
      BEGIN
        PERFORM (v_a #>> '{}')::date;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Answer must be a real date: %', v_key USING ERRCODE = '22023';
      END;
    ELSE
      SELECT array_agg(o ->> 'value') INTO v_allowed FROM jsonb_array_elements(v_f -> 'options') o;
      IF v_type = 'single_choice' THEN
        IF jsonb_typeof(v_a) <> 'string' OR NOT ((v_a #>> '{}') = ANY (v_allowed)) THEN
          RAISE EXCEPTION 'Answer is not one of the choices: %', v_key USING ERRCODE = '22023';
        END IF;
      ELSE
        IF jsonb_typeof(v_a) <> 'array' THEN
          RAISE EXCEPTION 'Answer must be a list of choices: %', v_key USING ERRCODE = '22023';
        END IF;
        v_seen := ARRAY[]::TEXT[];
        FOR v_el IN SELECT value FROM jsonb_array_elements(v_a) LOOP
          IF jsonb_typeof(v_el) <> 'string' OR NOT ((v_el #>> '{}') = ANY (v_allowed)) OR (v_el #>> '{}') = ANY (v_seen) THEN
            RAISE EXCEPTION 'Answer is not a valid set of choices: %', v_key USING ERRCODE = '22023';
          END IF;
          v_seen := v_seen || (v_el #>> '{}');
        END LOOP;
      END IF;
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.intake_validate_answers(JSONB, JSONB) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- B. What a booking still needs (statuses only, never an answer).
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intake_state_internal(p_booking_id UUID)
RETURNS TABLE (form_required BOOLEAN, form_status TEXT, patch_required BOOLEAN, patch_status TEXT, blocked BOOLEAN, met BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_b RECORD;
  r public.intake_service_requirements;
  v_sub RECORD;
  v_form TEXT := 'not_required';
  v_patch TEXT := 'not_required';
  v_blocked BOOLEAN;
  v_cutoff TIMESTAMPTZ;
  v_valid BOOLEAN;
BEGIN
  SELECT b.service_id, b.customer_id, b.client_profile_id, b.scheduled_at, br.provider_id INTO v_b
    FROM public.bookings b JOIN public.branches br ON br.id = b.branch_id WHERE b.id = p_booking_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_b.customer_id IS NULL THEN
    -- A walk-in client has no account to complete a form with: nothing is required of the booking.
    RETURN QUERY SELECT FALSE, 'not_required'::text, FALSE, 'not_required'::text, FALSE, TRUE;
    RETURN;
  END IF;
  SELECT * INTO r FROM public.intake_service_requirements WHERE service_id = v_b.service_id;

  SELECT EXISTS (SELECT 1 FROM public.patch_test_results p
                  WHERE p.provider_id = v_b.provider_id AND p.customer_id = v_b.customer_id AND p.service_id = v_b.service_id
                    AND p.client_profile_id IS NOT DISTINCT FROM v_b.client_profile_id AND p.result = 'positive' AND p.cleared_at IS NULL)
    INTO v_blocked;

  IF r.service_id IS NOT NULL AND r.form_required THEN
    SELECT s.status, s.template_id INTO v_sub FROM public.intake_submissions s WHERE s.booking_id = p_booking_id;
    v_form := CASE WHEN v_sub.status IS NULL OR v_sub.template_id IS DISTINCT FROM r.template_id THEN 'missing' ELSE v_sub.status END;
  END IF;

  IF r.service_id IS NOT NULL AND r.patch_test_required THEN
    v_cutoff := v_b.scheduled_at - make_interval(hours => COALESCE(r.patch_min_hours_before, 0));
    SELECT EXISTS (SELECT 1 FROM public.patch_test_results p
                    WHERE p.provider_id = v_b.provider_id AND p.customer_id = v_b.customer_id AND p.service_id = v_b.service_id
                      AND p.client_profile_id IS NOT DISTINCT FROM v_b.client_profile_id AND p.result = 'negative'
                      AND p.tested_at <= v_cutoff AND v_b.scheduled_at <= p.tested_at + make_interval(days => r.patch_validity_days))
      INTO v_valid;
    IF v_valid THEN v_patch := 'valid';
    ELSIF EXISTS (SELECT 1 FROM public.patch_test_results p
                   WHERE p.provider_id = v_b.provider_id AND p.customer_id = v_b.customer_id AND p.service_id = v_b.service_id
                     AND p.client_profile_id IS NOT DISTINCT FROM v_b.client_profile_id AND p.result = 'negative' AND p.tested_at <= v_cutoff) THEN
      v_patch := 'expired';
    ELSIF EXISTS (SELECT 1 FROM public.patch_test_results p
                   WHERE p.provider_id = v_b.provider_id AND p.customer_id = v_b.customer_id AND p.service_id = v_b.service_id
                     AND p.client_profile_id IS NOT DISTINCT FROM v_b.client_profile_id AND p.result = 'negative') THEN
      v_patch := 'too_late';
    ELSE v_patch := 'missing';
    END IF;
  END IF;
  IF v_blocked THEN v_patch := 'blocked'; END IF;

  RETURN QUERY SELECT COALESCE(r.form_required, FALSE), v_form, COALESCE(r.patch_test_required, FALSE), v_patch, v_blocked,
    ((v_form IN ('not_required', 'submitted')) AND (v_patch IN ('not_required', 'valid')) AND NOT v_blocked);
END $$;
REVOKE ALL ON FUNCTION public.intake_state_internal(UUID) FROM PUBLIC, anon, authenticated;

-- The guarded form of the same answer: the client of the booking and the people who serve it (and the service role).
CREATE OR REPLACE FUNCTION public.intake_booking_state(p_booking_id UUID)
RETURNS TABLE (form_required BOOLEAN, form_status TEXT, patch_required BOOLEAN, patch_status TEXT, blocked BOOLEAN, met BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.form_required, s.form_status, s.patch_required, s.patch_status, s.blocked, s.met
    FROM public.intake_state_internal(p_booking_id) s
   WHERE COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
      OR (auth.uid() IS NOT NULL AND (
            EXISTS (SELECT 1 FROM public.bookings WHERE id = p_booking_id AND customer_id = auth.uid())
            OR public.is_booking_staff(p_booking_id, auth.uid())));
$$;
REVOKE ALL ON FUNCTION public.intake_booking_state(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intake_booking_state(UUID) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.provider_booking_intake_status WITH (security_invoker = true) AS
SELECT b.id AS booking_id, br.provider_id, b.branch_id, b.employee_id, b.service_id, b.customer_id, b.client_profile_id,
       b.scheduled_at, b.status AS booking_status,
       s.name_en AS service_name_en, s.name_ar AS service_name_ar,
       pr.first_name AS customer_first_name, pr.last_name AS customer_last_name,
       st.form_required, st.form_status, st.patch_required, st.patch_status, st.blocked, st.met
  FROM public.bookings b
  JOIN public.branches br ON br.id = b.branch_id
  JOIN public.services s ON s.id = b.service_id
  LEFT JOIN public.profiles pr ON pr.id = b.customer_id
  CROSS JOIN LATERAL public.intake_booking_state(b.id) st
 WHERE b.customer_id IS NOT NULL;
GRANT SELECT ON public.provider_booking_intake_status TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- C. Provider commands (the owner configures; delegates and employees record patch tests and read answers).
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intake_assert_owner(p_provider_id UUID) RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT owner_id INTO v_owner FROM public.providers WHERE id = p_provider_id;
  IF v_owner IS NOT NULL AND v_owner = auth.uid() THEN RETURN; END IF;
  IF v_owner IS NOT NULL AND NOT public.is_admin() AND public.can_access_provider_wide(p_provider_id, 'bookings') THEN
    RAISE EXCEPTION 'Only the provider owner can change intake forms and requirements' USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
END $$;
REVOKE ALL ON FUNCTION public.intake_assert_owner(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_intake_template(
  p_provider_id UUID, p_template_id UUID, p_name_en TEXT, p_name_ar TEXT, p_fields JSONB, p_is_active BOOLEAN DEFAULT TRUE
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_fields JSONB;
  t public.intake_form_templates;
  v_current JSONB;
  v_version INTEGER;
BEGIN
  PERFORM public.intake_assert_owner(p_provider_id);
  IF char_length(btrim(COALESCE(p_name_en, ''))) NOT BETWEEN 1 AND 120 OR char_length(btrim(COALESCE(p_name_ar, ''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'An English and an Arabic name of 1 to 120 characters are required' USING ERRCODE = '22023';
  END IF;
  IF p_is_active IS NULL THEN
    RAISE EXCEPTION 'The active flag is required' USING ERRCODE = '22023';
  END IF;
  v_fields := public.intake_normalise_fields(p_fields);

  IF p_template_id IS NULL THEN
    INSERT INTO public.intake_form_templates (provider_id, name_en, name_ar, is_active, created_by)
    VALUES (p_provider_id, btrim(p_name_en), btrim(p_name_ar), p_is_active, v_uid) RETURNING * INTO t;
    INSERT INTO public.intake_form_template_versions (template_id, provider_id, version, fields, published_by)
    VALUES (t.id, p_provider_id, 1, v_fields, v_uid);
    v_version := 1;
  ELSE
    SELECT * INTO t FROM public.intake_form_templates WHERE id = p_template_id AND provider_id = p_provider_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Template not found' USING ERRCODE = 'P0002';
    END IF;
    IF NOT p_is_active AND EXISTS (SELECT 1 FROM public.intake_service_requirements WHERE template_id = t.id) THEN
      RAISE EXCEPTION 'This form is still used by a service requirement; change the requirement first' USING ERRCODE = '22023';
    END IF;
    SELECT fields INTO v_current FROM public.intake_form_template_versions WHERE template_id = t.id AND version = t.current_version;
    v_version := t.current_version;
    IF v_current IS DISTINCT FROM v_fields THEN
      v_version := t.current_version + 1;
      INSERT INTO public.intake_form_template_versions (template_id, provider_id, version, fields, published_by)
      VALUES (t.id, p_provider_id, v_version, v_fields, v_uid);
    END IF;
    UPDATE public.intake_form_templates
       SET name_en = btrim(p_name_en), name_ar = btrim(p_name_ar), is_active = p_is_active, current_version = v_version, updated_at = now()
     WHERE id = t.id RETURNING * INTO t;
  END IF;
  PERFORM public.write_audit_log('intake.template_saved', 'intake_form_templates', t.id,
    jsonb_build_object('provider_id', p_provider_id, 'version', v_version, 'field_count', jsonb_array_length(v_fields), 'is_active', p_is_active));
  RETURN jsonb_build_object('id', t.id, 'version', v_version, 'is_active', t.is_active);
END $$;
REVOKE ALL ON FUNCTION public.save_intake_template(UUID, UUID, TEXT, TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_intake_template(UUID, UUID, TEXT, TEXT, JSONB, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_service_intake_requirement(
  p_service_id UUID, p_template_id UUID, p_form_required BOOLEAN, p_patch_test_required BOOLEAN,
  p_patch_validity_days INTEGER DEFAULT NULL, p_patch_min_hours_before INTEGER DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_provider UUID;
  r public.intake_service_requirements;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT provider_id INTO v_provider FROM public.services WHERE id = p_service_id;
  IF v_provider IS NULL THEN
    RAISE EXCEPTION 'Service not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.intake_assert_owner(v_provider);
  IF p_form_required IS NULL OR p_patch_test_required IS NULL THEN
    RAISE EXCEPTION 'State whether a form and a patch test are required' USING ERRCODE = '22023';
  END IF;
  IF p_form_required THEN
    IF p_template_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.intake_form_templates WHERE id = p_template_id AND provider_id = v_provider AND is_active) THEN
      RAISE EXCEPTION 'Choose an active form of this provider' USING ERRCODE = '22023';
    END IF;
  ELSIF p_template_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.intake_form_templates WHERE id = p_template_id AND provider_id = v_provider) THEN
    RAISE EXCEPTION 'Choose a form of this provider' USING ERRCODE = '22023';
  END IF;
  IF p_patch_test_required THEN
    IF p_patch_validity_days IS NULL OR p_patch_validity_days NOT BETWEEN 1 AND 3650 THEN
      RAISE EXCEPTION 'Set how many days a patch test stays valid (1 to 3650)' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_patch_min_hours_before IS NOT NULL AND p_patch_min_hours_before NOT BETWEEN 0 AND 720 THEN
    RAISE EXCEPTION 'The minimum hours before the appointment must be between 0 and 720' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.intake_service_requirements AS t
    (service_id, provider_id, template_id, form_required, patch_test_required, patch_validity_days, patch_min_hours_before, updated_by, updated_at)
  VALUES (p_service_id, v_provider, p_template_id, p_form_required, p_patch_test_required,
          CASE WHEN p_patch_test_required THEN p_patch_validity_days END,
          CASE WHEN p_patch_test_required THEN p_patch_min_hours_before END, auth.uid(), now())
  ON CONFLICT (service_id) DO UPDATE SET template_id = EXCLUDED.template_id, form_required = EXCLUDED.form_required,
    patch_test_required = EXCLUDED.patch_test_required, patch_validity_days = EXCLUDED.patch_validity_days,
    patch_min_hours_before = EXCLUDED.patch_min_hours_before, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
  RETURNING * INTO r;
  PERFORM public.write_audit_log('intake.requirement_set', 'intake_service_requirements', p_service_id,
    jsonb_build_object('provider_id', v_provider, 'form_required', r.form_required, 'patch_test_required', r.patch_test_required,
                       'patch_validity_days', r.patch_validity_days, 'patch_min_hours_before', r.patch_min_hours_before));
  RETURN jsonb_build_object('service_id', r.service_id, 'template_id', r.template_id, 'form_required', r.form_required,
    'patch_test_required', r.patch_test_required, 'patch_validity_days', r.patch_validity_days, 'patch_min_hours_before', r.patch_min_hours_before);
END $$;
REVOKE ALL ON FUNCTION public.set_service_intake_requirement(UUID, UUID, BOOLEAN, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_service_intake_requirement(UUID, UUID, BOOLEAN, BOOLEAN, INTEGER, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_service_intake_requirement(p_service_id UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_provider UUID; v_n INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT provider_id INTO v_provider FROM public.services WHERE id = p_service_id;
  IF v_provider IS NULL THEN
    RAISE EXCEPTION 'Service not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.intake_assert_owner(v_provider);
  DELETE FROM public.intake_service_requirements WHERE service_id = p_service_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    PERFORM public.write_audit_log('intake.requirement_removed', 'intake_service_requirements', p_service_id, jsonb_build_object('provider_id', v_provider));
  END IF;
  RETURN jsonb_build_object('service_id', p_service_id, 'removed', v_n > 0);
END $$;
REVOKE ALL ON FUNCTION public.remove_service_intake_requirement(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_service_intake_requirement(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_provider_intake_enforcement(p_provider_id UUID, p_enabled BOOLEAN) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.intake_assert_owner(p_provider_id);
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'The enabled flag is required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.provider_intake_settings (provider_id, enforce_requirements, updated_by, updated_at)
  VALUES (p_provider_id, p_enabled, auth.uid(), now())
  ON CONFLICT (provider_id) DO UPDATE SET enforce_requirements = EXCLUDED.enforce_requirements, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;
  PERFORM public.write_audit_log('intake.enforcement_set', 'provider_intake_settings', p_provider_id, jsonb_build_object('enforce_requirements', p_enabled));
  RETURN jsonb_build_object('provider_id', p_provider_id, 'enforce_requirements', p_enabled);
END $$;
REVOKE ALL ON FUNCTION public.set_provider_intake_enforcement(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_provider_intake_enforcement(UUID, BOOLEAN) TO authenticated;

-- Staff of the booking, administrators excluded: an administrator never reads a client's health data.
CREATE OR REPLACE FUNCTION public.intake_is_serving_staff(p_booking_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND NOT public.is_admin() AND public.is_booking_staff(p_booking_id, auth.uid());
$$;
REVOKE ALL ON FUNCTION public.intake_is_serving_staff(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.read_booking_intake_answers(p_booking_id UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b RECORD;
  s public.intake_submissions;
  v_answers JSONB;
  v_fields JSONB;
  v_name_en TEXT;
  v_name_ar TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT status, customer_id INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND OR NOT public.intake_is_serving_staff(p_booking_id) THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  IF b.status NOT IN ('pending_payment', 'confirmed', 'completed') THEN
    RAISE EXCEPTION 'Answers are not available for a cancelled or missed booking' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM public.intake_submissions WHERE booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('booking_id', p_booking_id, 'status', 'missing', 'answers', NULL);
  END IF;
  IF s.status <> 'submitted' THEN
    RETURN jsonb_build_object('booking_id', p_booking_id, 'status', s.status, 'answers', NULL, 'removed_at', s.answers_removed_at);
  END IF;
  SELECT a.answers INTO v_answers FROM public.intake_answers a WHERE a.submission_id = s.id;
  SELECT v.fields, t.name_en, t.name_ar INTO v_fields, v_name_en, v_name_ar
    FROM public.intake_form_template_versions v JOIN public.intake_form_templates t ON t.id = v.template_id WHERE v.id = s.template_version_id;
  UPDATE public.intake_submissions SET read_count = read_count + 1, last_read_at = now() WHERE id = s.id;
  -- The audit row names who read which booking's answers; it never carries an answer.
  PERFORM public.write_audit_log('intake.answers_read', 'intake_submissions', s.id,
    jsonb_build_object('booking_id', p_booking_id, 'provider_id', s.provider_id, 'template_version', s.template_version));
  RETURN jsonb_build_object('booking_id', p_booking_id, 'status', 'submitted', 'submission_id', s.id, 'submitted_at', s.submitted_at,
    'template_version', s.template_version, 'name_en', v_name_en, 'name_ar', v_name_ar, 'fields', v_fields, 'answers', v_answers);
END $$;
REVOKE ALL ON FUNCTION public.read_booking_intake_answers(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_booking_intake_answers(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_patch_test(
  p_booking_id UUID, p_service_id UUID, p_result TEXT, p_tested_at TIMESTAMPTZ DEFAULT NULL, p_request_key UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b RECORD;
  v_provider UUID;
  v_tested TIMESTAMPTZ := COALESCE(p_tested_at, now());
  v_existing public.patch_test_results;
  v_row public.patch_test_results;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT bk.status, bk.customer_id, bk.client_profile_id, br.provider_id INTO b
    FROM public.bookings bk JOIN public.branches br ON br.id = bk.branch_id WHERE bk.id = p_booking_id;
  IF NOT FOUND OR NOT public.intake_is_serving_staff(p_booking_id) THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_result IS NULL OR p_result NOT IN ('negative', 'positive') THEN
    RAISE EXCEPTION 'The result must be negative or positive' USING ERRCODE = '22023';
  END IF;
  IF b.customer_id IS NULL THEN
    RAISE EXCEPTION 'A walk-in client has no account to record a patch test against' USING ERRCODE = '22023';
  END IF;
  IF b.status NOT IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION 'A patch test is recorded for a confirmed or completed booking' USING ERRCODE = '22023';
  END IF;
  IF v_tested > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'A patch test cannot be dated in the future' USING ERRCODE = '22023';
  END IF;
  SELECT provider_id INTO v_provider FROM public.services WHERE id = p_service_id;
  IF v_provider IS DISTINCT FROM b.provider_id OR NOT EXISTS (
       SELECT 1 FROM public.intake_service_requirements WHERE service_id = p_service_id AND patch_test_required) THEN
    RAISE EXCEPTION 'This service does not require a patch test' USING ERRCODE = '22023';
  END IF;
  IF p_request_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.patch_test_results WHERE request_key = p_request_key;
    IF FOUND THEN
      IF v_existing.recorded_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'That request key belongs to another request' USING ERRCODE = '23505';
      END IF;
      RETURN jsonb_build_object('id', v_existing.id, 'result', v_existing.result, 'tested_at', v_existing.tested_at, 'replayed', TRUE);
    END IF;
  END IF;
  INSERT INTO public.patch_test_results (provider_id, service_id, customer_id, client_profile_id, booking_id, result, tested_at, recorded_by, request_key)
  VALUES (b.provider_id, p_service_id, b.customer_id, b.client_profile_id, p_booking_id, p_result, v_tested, auth.uid(), p_request_key)
  RETURNING * INTO v_row;
  PERFORM public.write_audit_log('intake.patch_test_recorded', 'patch_test_results', v_row.id,
    jsonb_build_object('booking_id', p_booking_id, 'service_id', p_service_id, 'provider_id', b.provider_id, 'result', p_result));
  RETURN jsonb_build_object('id', v_row.id, 'result', v_row.result, 'tested_at', v_row.tested_at, 'replayed', FALSE);
END $$;
REVOKE ALL ON FUNCTION public.record_patch_test(UUID, UUID, TEXT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_patch_test(UUID, UUID, TEXT, TIMESTAMPTZ, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_patch_test_block(p_result_id UUID, p_reason TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.patch_test_results;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO r FROM public.patch_test_results WHERE id = p_result_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patch test not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.intake_assert_owner(r.provider_id);
  IF char_length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  IF r.result <> 'positive' THEN
    RAISE EXCEPTION 'Only a positive result carries a block' USING ERRCODE = '22023';
  END IF;
  IF r.cleared_at IS NOT NULL THEN
    RETURN jsonb_build_object('id', r.id, 'cleared_at', r.cleared_at, 'replayed', TRUE);
  END IF;
  UPDATE public.patch_test_results SET cleared_at = now(), cleared_by = auth.uid(), clear_reason = btrim(p_reason)
   WHERE id = r.id RETURNING * INTO r;
  PERFORM public.write_audit_log('intake.patch_block_cleared', 'patch_test_results', r.id,
    jsonb_build_object('provider_id', r.provider_id, 'service_id', r.service_id, 'reason', btrim(p_reason)));
  RETURN jsonb_build_object('id', r.id, 'cleared_at', r.cleared_at, 'replayed', FALSE);
END $$;
REVOKE ALL ON FUNCTION public.clear_patch_test_block(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_patch_test_block(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- D. Customer commands.
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_booking_intake(p_booking_id UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  b RECORD;
  r public.intake_service_requirements;
  t public.intake_form_templates;
  v_fields JSONB;
  s public.intake_submissions;
  v_answers JSONB;
  v_state RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT bk.id, bk.status, bk.scheduled_at, bk.service_id, bk.client_profile_id, br.provider_id INTO b
    FROM public.bookings bk JOIN public.branches br ON br.id = bk.branch_id WHERE bk.id = p_booking_id AND bk.customer_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO r FROM public.intake_service_requirements WHERE service_id = b.service_id;
  IF r.template_id IS NOT NULL AND r.form_required THEN
    SELECT * INTO t FROM public.intake_form_templates WHERE id = r.template_id;
    SELECT fields INTO v_fields FROM public.intake_form_template_versions WHERE template_id = t.id AND version = t.current_version;
  END IF;
  SELECT * INTO s FROM public.intake_submissions WHERE booking_id = p_booking_id;
  IF s.id IS NOT NULL AND s.status = 'submitted' THEN
    SELECT a.answers INTO v_answers FROM public.intake_answers a WHERE a.submission_id = s.id;
  END IF;
  SELECT * INTO v_state FROM public.intake_state_internal(p_booking_id);
  RETURN jsonb_build_object(
    'booking_id', b.id, 'booking_status', b.status, 'scheduled_at', b.scheduled_at, 'service_id', b.service_id,
    'provider_id', b.provider_id, 'client_profile_id', b.client_profile_id,
    'consent_active', public.has_active_consent(v_uid, 'health_data'),
    'requirement', CASE WHEN r.service_id IS NULL THEN NULL ELSE jsonb_build_object(
      'form_required', r.form_required, 'patch_test_required', r.patch_test_required,
      'patch_validity_days', r.patch_validity_days, 'patch_min_hours_before', r.patch_min_hours_before) END,
    'form', CASE WHEN v_fields IS NULL THEN NULL ELSE jsonb_build_object(
      'template_id', t.id, 'version', t.current_version, 'name_en', t.name_en, 'name_ar', t.name_ar, 'is_active', t.is_active, 'fields', v_fields) END,
    'submission', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
      'status', s.status, 'submitted_at', s.submitted_at, 'template_version', s.template_version, 'answers_removed_at', s.answers_removed_at,
      'removal_reason', s.removal_reason, 'read_count', s.read_count, 'last_read_at', s.last_read_at, 'answers', v_answers) END,
    'state', jsonb_build_object('form_status', v_state.form_status, 'patch_status', v_state.patch_status, 'blocked', v_state.blocked, 'met', v_state.met),
    'patch_tests', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'result', p.result, 'tested_at', p.tested_at,
        'cleared_at', p.cleared_at) ORDER BY p.tested_at DESC)
      FROM public.patch_test_results p
      WHERE p.provider_id = b.provider_id AND p.customer_id = v_uid AND p.service_id = b.service_id
        AND p.client_profile_id IS NOT DISTINCT FROM b.client_profile_id), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.get_booking_intake(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_booking_intake(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_booking_intake(p_booking_id UUID, p_answers JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  b RECORD;
  r public.intake_service_requirements;
  t public.intake_form_templates;
  v public.intake_form_template_versions;
  v_consent UUID;
  s public.intake_submissions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT bk.status, bk.scheduled_at, bk.service_id, bk.client_profile_id, br.provider_id INTO b
    FROM public.bookings bk JOIN public.branches br ON br.id = bk.branch_id WHERE bk.id = p_booking_id AND bk.customer_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  IF b.status NOT IN ('pending_payment', 'confirmed') THEN
    RAISE EXCEPTION 'The form can only be completed for an upcoming booking' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM public.intake_service_requirements WHERE service_id = b.service_id AND form_required;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This service has no form' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO t FROM public.intake_form_templates WHERE id = r.template_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This form is no longer available' USING ERRCODE = '22023';
  END IF;
  -- Explicit consent first: the latest health-data consent row must be a grant.
  IF NOT public.has_active_consent(v_uid, 'health_data') THEN
    RAISE EXCEPTION 'Explicit consent to share health information is required before answers are saved' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM public.intake_form_template_versions WHERE template_id = t.id AND version = t.current_version;
  PERFORM public.intake_validate_answers(v.fields, p_answers);
  SELECT id INTO v_consent FROM public.consents WHERE user_id = v_uid AND purpose = 'health_data' AND status = 'granted'
   ORDER BY created_at DESC, id DESC LIMIT 1;

  INSERT INTO public.intake_submissions AS x
    (booking_id, provider_id, customer_id, client_profile_id, template_id, template_version_id, template_version, status, consent_id, submitted_at, updated_at)
  VALUES (p_booking_id, b.provider_id, v_uid, b.client_profile_id, t.id, v.id, v.version, 'submitted', v_consent, now(), now())
  ON CONFLICT (booking_id) DO UPDATE SET template_id = EXCLUDED.template_id, template_version_id = EXCLUDED.template_version_id,
    template_version = EXCLUDED.template_version, status = 'submitted', consent_id = EXCLUDED.consent_id, submitted_at = EXCLUDED.submitted_at,
    answers_removed_at = NULL, removal_reason = NULL, updated_at = EXCLUDED.updated_at
  RETURNING * INTO s;
  INSERT INTO public.intake_answers (submission_id, customer_id, answers) VALUES (s.id, v_uid, p_answers)
  ON CONFLICT (submission_id) DO UPDATE SET answers = EXCLUDED.answers;
  PERFORM public.write_audit_log('intake.submitted', 'intake_submissions', s.id,
    jsonb_build_object('booking_id', p_booking_id, 'provider_id', b.provider_id, 'template_version', v.version));
  RETURN jsonb_build_object('submission_id', s.id, 'status', s.status, 'template_version', s.template_version, 'submitted_at', s.submitted_at);
END $$;
REVOKE ALL ON FUNCTION public.submit_booking_intake(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_booking_intake(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_booking_intake(p_booking_id UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  s public.intake_submissions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE id = p_booking_id AND customer_id = v_uid) THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO s FROM public.intake_submissions WHERE booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR s.status <> 'submitted' THEN
    RETURN jsonb_build_object('booking_id', p_booking_id, 'removed', FALSE);
  END IF;
  DELETE FROM public.intake_answers WHERE submission_id = s.id;
  UPDATE public.intake_submissions SET status = 'deleted', answers_removed_at = now(), removal_reason = 'customer_deleted', updated_at = now() WHERE id = s.id;
  PERFORM public.write_audit_log('intake.deleted_by_customer', 'intake_submissions', s.id, jsonb_build_object('booking_id', p_booking_id, 'provider_id', s.provider_id));
  RETURN jsonb_build_object('booking_id', p_booking_id, 'removed', TRUE);
END $$;
REVOKE ALL ON FUNCTION public.delete_booking_intake(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_booking_intake(UUID) TO authenticated;

-- Withdrawing the consent is a normal consent row (record_consent); a trigger (next migration) blanks future-dated answers.
CREATE OR REPLACE FUNCTION public.withdraw_health_data_consent() RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_before INTEGER;
  v_n INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT count(*)::integer INTO v_before FROM public.intake_submissions WHERE customer_id = v_uid AND status = 'submitted';
  PERFORM public.record_consent('health_data', 'withdrawn', 'v1.0', 'web_form');
  SELECT v_before - count(*)::integer INTO v_n FROM public.intake_submissions WHERE customer_id = v_uid AND status = 'submitted';
  RETURN jsonb_build_object('withdrawn', TRUE, 'answers_removed', v_n);
END $$;
REVOKE ALL ON FUNCTION public.withdraw_health_data_consent() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_health_data_consent() TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- E. Administrators: counts and statuses only. There is deliberately no way for an administrator to read an answer.
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_intake_overview() RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'templates', (SELECT count(*) FROM public.intake_form_templates),
    'requirements', (SELECT count(*) FROM public.intake_service_requirements),
    'providers_enforcing', (SELECT count(*) FROM public.provider_intake_settings WHERE enforce_requirements),
    'submissions_by_status', COALESCE((SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) n FROM public.intake_submissions GROUP BY status) q), '{}'::jsonb),
    'patch_tests_by_result', COALESCE((SELECT jsonb_object_agg(result, n) FROM (SELECT result, count(*) n FROM public.patch_test_results GROUP BY result) q), '{}'::jsonb),
    'active_patch_blocks', (SELECT count(*) FROM public.patch_test_results WHERE result = 'positive' AND cleared_at IS NULL),
    'retention_days', public.platform_setting('intake.retention_days')) INTO v_result;
  PERFORM public.write_audit_log('intake.overview_viewed', 'intake_submissions', NULL, '{}'::jsonb);
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.admin_intake_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_intake_overview() TO authenticated;
