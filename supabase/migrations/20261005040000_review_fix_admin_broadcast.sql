-- Migration: 20261005040000_review_fix_admin_broadcast.sql
-- Review fix: the admin broadcast form queued one WhatsApp message to the placeholder number
-- +966500000000, then called send-notification with "simulate: true", and reported success either
-- way. Broadcasts are now one server command that writes in-app notifications for the audience and
-- queues WhatsApp only for recipients who granted both WhatsApp and marketing consent. Dispatch
-- (claim_message_batch) still enforces verified phones and quiet hours.

-- Marketing template for broadcasts. The Meta template "primora_broadcast_notice" must be approved
-- in WhatsApp Manager before these messages can be delivered; until then sends fail and are logged.
INSERT INTO public.message_templates (name, locale, category, template_body, variables, provider_template_name, body_param_keys, is_transactional)
VALUES
  ('broadcast_notice', 'ar', 'marketing', '{{message}}', '["message"]'::jsonb, 'primora_broadcast_notice', ARRAY['message'], FALSE),
  ('broadcast_notice', 'en', 'marketing', '{{message}}', '["message"]'::jsonb, 'primora_broadcast_notice', ARRAY['message'], FALSE)
ON CONFLICT (name, locale) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(
  p_audience TEXT,
  p_title_en TEXT,
  p_title_ar TEXT,
  p_body_en TEXT,
  p_body_ar TEXT,
  p_in_app BOOLEAN DEFAULT TRUE,
  p_whatsapp BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_roles public.user_role[];
  v_in_app INT := 0;
  v_whatsapp INT := 0;
  v_audience_size INT := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Only administrators can send broadcasts' USING ERRCODE = '42501';
  END IF;
  IF length(trim(COALESCE(p_title_en, ''))) = 0 OR length(trim(COALESCE(p_title_ar, ''))) = 0
     OR length(trim(COALESCE(p_body_en, ''))) = 0 OR length(trim(COALESCE(p_body_ar, ''))) = 0 THEN
    RAISE EXCEPTION 'Title and message are required in Arabic and English.';
  END IF;
  IF NOT COALESCE(p_in_app, FALSE) AND NOT COALESCE(p_whatsapp, FALSE) THEN
    RAISE EXCEPTION 'Choose at least one channel.';
  END IF;

  v_roles := CASE p_audience
    WHEN 'customers' THEN ARRAY['customer']::public.user_role[]
    WHEN 'providers' THEN ARRAY['provider_owner']::public.user_role[]
    WHEN 'all' THEN ARRAY['customer', 'provider_owner']::public.user_role[]
  END;
  IF v_roles IS NULL THEN
    RAISE EXCEPTION 'Unknown audience: %', p_audience;
  END IF;

  SELECT COUNT(*) INTO v_audience_size FROM public.profiles WHERE role = ANY (v_roles);

  IF COALESCE(p_in_app, FALSE) THEN
    INSERT INTO public.notifications (user_id, title_en, title_ar, body_en, body_ar, type, data)
    SELECT p.id, trim(p_title_en), trim(p_title_ar), trim(p_body_en), trim(p_body_ar), 'broadcast',
           jsonb_build_object('audience', p_audience)
    FROM public.profiles p
    WHERE p.role = ANY (v_roles);
    GET DIAGNOSTICS v_in_app = ROW_COUNT;
  END IF;

  IF COALESCE(p_whatsapp, FALSE) THEN
    INSERT INTO public.message_queue (recipient_phone, recipient_id, channel, template_name, locale, variables, scheduled_for, status)
    SELECT p.phone_number, p.id, 'whatsapp', 'broadcast_notice',
           CASE WHEN p.language_preference = 'en' THEN 'en' ELSE 'ar' END,
           jsonb_build_object('message', CASE WHEN p.language_preference = 'en' THEN trim(p_body_en) ELSE trim(p_body_ar) END),
           now(), 'pending'
    FROM public.profiles p
    WHERE p.role = ANY (v_roles)
      AND COALESCE(p.phone_verified, FALSE)
      AND p.phone_number IS NOT NULL
      AND public.has_active_consent(p.id, 'whatsapp')
      AND public.has_active_consent(p.id, 'marketing');
    GET DIAGNOSTICS v_whatsapp = ROW_COUNT;
  END IF;

  PERFORM public.write_audit_log('notification.broadcast', 'notifications', NULL,
    jsonb_build_object('audience', p_audience, 'audience_size', v_audience_size,
                       'in_app_created', v_in_app, 'whatsapp_queued', v_whatsapp,
                       'title_en', trim(p_title_en)));

  RETURN jsonb_build_object('success', TRUE, 'audience_size', v_audience_size,
                            'in_app_created', v_in_app, 'whatsapp_queued', v_whatsapp,
                            'whatsapp_skipped_no_consent',
                              CASE WHEN COALESCE(p_whatsapp, FALSE) THEN v_audience_size - v_whatsapp ELSE 0 END);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_broadcast_notification(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;
