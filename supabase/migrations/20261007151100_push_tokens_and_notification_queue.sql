-- Migration: 20261007151100_push_tokens_and_notification_queue.sql
-- FIX-DBB / R33 (SQL part): push notifications were not wired. Nothing wrote expo_push_tokens, notifications was written only by admin
-- broadcasts, send-push had no caller, and the Expo integration was shown as "connected" with an invented key mask.
--   * register_push_token / unregister_push_token: the signed-in user's device registration (idempotent, format checked).
--   * booking events create an in-app notification (bilingual, no personal text) for the customer, and for the salon owner on a new booking.
--   * when the Expo integration is enabled and the user has an active token, the notification is also queued in push_notification_queue;
--     claim_push_batch / complete_push_delivery are the service-role entry points for the sender (send-push must call them: Deno change).
--   * the integration row is set back to disconnected and disabled, and the invented key mask removed, until the mobile app registers
--     tokens and send-push drains the queue. The owner switches it on in the console.

CREATE TABLE IF NOT EXISTS public.push_notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL UNIQUE REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'sent', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  claimed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_queue_pending ON public.push_notification_queue (status, created_at);
ALTER TABLE public.push_notification_queue ENABLE ROW LEVEL SECURITY;
-- no policy: the table is reached only through the service-role functions below

CREATE OR REPLACE FUNCTION public.register_push_token(p_token TEXT, p_platform TEXT DEFAULT 'mobile', p_device_name TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token TEXT := trim(COALESCE(p_token, '')); v_row public.expo_push_tokens;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF v_token !~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]{10,200}\]$' THEN
    RAISE EXCEPTION 'Not an Expo push token' USING ERRCODE = '22023'; END IF;
  IF p_platform IS NULL OR p_platform NOT IN ('ios', 'android', 'mobile') THEN
    RAISE EXCEPTION 'Platform must be ios, android or mobile' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.expo_push_tokens (user_id, token, device_platform, device_name, is_active)
  VALUES (auth.uid(), v_token, p_platform, left(NULLIF(trim(COALESCE(p_device_name, '')), ''), 100), TRUE)
  ON CONFLICT (token) DO UPDATE
  SET user_id = auth.uid(), device_platform = EXCLUDED.device_platform, device_name = EXCLUDED.device_name,
      is_active = TRUE, updated_at = now()
  RETURNING * INTO v_row;
  PERFORM public.write_audit_log('push_token.registered', 'expo_push_tokens', v_row.id, jsonb_build_object('platform', p_platform));
  RETURN jsonb_build_object('id', v_row.id, 'is_active', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.unregister_push_token(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  UPDATE public.expo_push_tokens SET is_active = FALSE, updated_at = now() WHERE token = trim(COALESCE(p_token, '')) AND user_id = auth.uid();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('deactivated', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.register_push_token(TEXT, TEXT, TEXT), public.unregister_push_token(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_push_token(TEXT, TEXT, TEXT), public.unregister_push_token(TEXT) TO authenticated, service_role;

-- One notification, and its queue row when push can really be delivered.
CREATE OR REPLACE FUNCTION public.notify_user_internal(p_user UUID, p_type TEXT, p_title_en TEXT, p_title_ar TEXT, p_body_en TEXT, p_body_ar TEXT, p_data JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_notification UUID;
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, title_en, title_ar, body_en, body_ar, type, data)
  VALUES (p_user, p_title_en, p_title_ar, p_body_en, p_body_ar, p_type, COALESCE(p_data, '{}'::jsonb))
  RETURNING id INTO v_notification;
  IF EXISTS (SELECT 1 FROM public.integrations WHERE key = 'expo_push' AND enabled AND status = 'connected')
     AND EXISTS (SELECT 1 FROM public.expo_push_tokens WHERE user_id = p_user AND is_active) THEN
    INSERT INTO public.push_notification_queue (notification_id, user_id) VALUES (v_notification, p_user);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_user_internal(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_booking_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner UUID; v_data JSONB := jsonb_build_object('booking_id', NEW.id, 'status', NEW.status);
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  BEGIN
    IF NEW.status::text = 'confirmed' THEN
      PERFORM public.notify_user_internal(NEW.customer_id, 'booking', 'Booking confirmed', 'تم تأكيد حجزك',
        'Your booking is confirmed. Open the app for the details.', 'تم تأكيد حجزك. افتح التطبيق لمعرفة التفاصيل.', v_data);
      SELECT p.owner_id INTO v_owner FROM public.branches br JOIN public.providers p ON p.id = br.provider_id WHERE br.id = NEW.branch_id;
      IF v_owner IS DISTINCT FROM NEW.customer_id THEN
        PERFORM public.notify_user_internal(v_owner, 'booking', 'New booking', 'حجز جديد',
          'A new booking was confirmed at your salon.', 'تم تأكيد حجز جديد في صالونك.', v_data);
      END IF;
    ELSIF NEW.status::text = 'cancelled' THEN
      PERFORM public.notify_user_internal(NEW.customer_id, 'booking', 'Booking cancelled', 'تم إلغاء الحجز',
        'Your booking was cancelled. Open the app for the details.', 'تم إلغاء حجزك. افتح التطبيق لمعرفة التفاصيل.', v_data);
    ELSIF NEW.status::text = 'completed' THEN
      PERFORM public.notify_user_internal(NEW.customer_id, 'booking', 'Visit completed', 'اكتملت الزيارة',
        'Thank you for visiting. You can now rate your visit.', 'شكرا لزيارتك. يمكنك الآن تقييم زيارتك.', v_data);
    ELSIF NEW.status::text = 'no_show' THEN
      PERFORM public.notify_user_internal(NEW.customer_id, 'booking', 'Missed booking', 'حجز لم يتم حضوره',
        'Your booking was marked as missed. Open the app if this is a mistake.', 'تم تسجيل حجزك كغياب. افتح التطبيق إذا كان هذا خطأ.', v_data);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'booking notification was not created: %', SQLERRM;  -- a notification must never fail a booking
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_booking_event() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notify_booking_event ON public.bookings;
CREATE TRIGGER notify_booking_event AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_booking_event();

-- The sender's side: claim a batch (with the user's active tokens), then report the outcome.
CREATE OR REPLACE FUNCTION public.claim_push_batch(p_limit INT DEFAULT 50)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result JSONB;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN RAISE EXCEPTION 'Batch size must be 1 to 200' USING ERRCODE = '22023'; END IF;
  WITH picked AS (
    SELECT q.id FROM public.push_notification_queue q
    WHERE (q.status = 'pending' OR (q.status = 'claimed' AND q.claimed_at < now() - interval '10 minutes')) AND q.attempts < 5
    ORDER BY q.created_at LIMIT p_limit FOR UPDATE SKIP LOCKED),
  marked AS (
    UPDATE public.push_notification_queue q SET status = 'claimed', claimed_at = now(), attempts = q.attempts + 1
    FROM picked WHERE q.id = picked.id RETURNING q.*)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('queue_id', m.id, 'user_id', m.user_id, 'title_en', n.title_en, 'title_ar', n.title_ar,
      'body_en', n.body_en, 'body_ar', n.body_ar, 'data', n.data,
      'tokens', (SELECT COALESCE(jsonb_agg(t.token), '[]'::jsonb) FROM public.expo_push_tokens t WHERE t.user_id = m.user_id AND t.is_active))), '[]'::jsonb)
  INTO v_result FROM marked m JOIN public.notifications n ON n.id = m.notification_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_push_delivery(p_queue_id UUID, p_ok BOOLEAN, p_error TEXT DEFAULT NULL, p_invalid_tokens TEXT[] DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.push_notification_queue;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_row FROM public.push_notification_queue WHERE id = p_queue_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Queue entry not found' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.expo_push_tokens SET is_active = FALSE, updated_at = now()
  WHERE user_id = v_row.user_id AND token = ANY (COALESCE(p_invalid_tokens, ARRAY[]::TEXT[]));
  UPDATE public.push_notification_queue
  SET status = CASE WHEN p_ok THEN 'sent' WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
      sent_at = CASE WHEN p_ok THEN now() ELSE sent_at END, last_error = CASE WHEN p_ok THEN NULL ELSE left(p_error, 500) END
  WHERE id = p_queue_id RETURNING * INTO v_row;
  RETURN jsonb_build_object('queue_id', v_row.id, 'status', v_row.status, 'attempts', v_row.attempts);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_push_batch(INT), public.complete_push_delivery(UUID, BOOLEAN, TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_batch(INT), public.complete_push_delivery(UUID, BOOLEAN, TEXT, TEXT[]) TO service_role;

-- The integration was shown as connected with an invented key mask; nothing sends push yet.
UPDATE public.integrations SET status = 'disconnected', enabled = FALSE, key_masked = NULL, updated_at = now() WHERE key = 'expo_push';

SELECT public.grant_data_api_access('public.push_notification_queue');
SELECT public.attach_admin_audit_trigger('public.push_notification_queue');
