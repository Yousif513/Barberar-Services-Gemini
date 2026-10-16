-- FINAL-6: review N6 (docs/reviews/2026-10-11-security-priv-recheck.md). The contact scrub and the WhatsApp erasure matched every
-- phone number the erased person had ever held, at any time, and the walk-in phone typed on their bookings. When a number had since
-- been given to someone else, that person's pending messages, message log and WhatsApp threads were erased too.
--   * A phone counts as the erased person's only for its tenure: an earlier number from the account's creation (or the change
--     before it) until the change that replaced it; the current number from the last change until now (privacy_phone_tenures).
--   * Queue and log rows are matched by phone only when they name no other recipient and were created (queue) or sent (log)
--     inside that tenure. Rows of the person's own bookings and rows addressed to the person's account are scrubbed as before.
--   * A walk-in phone is a booking's detail, not the account's number: its traces go with the booking, never by number.
--   * The worker erases WhatsApp messages under a number only inside its tenure, and a thread only when it began inside the tenure
--     and nothing outside it remains (privacy_erase_whatsapp now takes {hash, from, until} windows).

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- [{phone, from, until}] for every number the account held; until is NULL for the number it holds now.
CREATE OR REPLACE FUNCTION public.privacy_phone_tenures(p_subject UUID) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH start AS (
    SELECT COALESCE((SELECT u.created_at FROM auth.users u WHERE u.id = p_subject),
                    (SELECT pr.created_at FROM public.profiles pr WHERE pr.id = p_subject)) AS at
  ), ch AS (
    SELECT btrim(c.old_value) AS phone, c.changed_at, lag(c.changed_at) OVER (ORDER BY c.changed_at, c.id) AS prev
      FROM public.account_contact_changes c WHERE c.user_id = p_subject AND c.channel = 'sms'
  ), last_change AS (
    SELECT max(changed_at) AS at FROM ch
  ), t AS (
    SELECT ch.phone, COALESCE(ch.prev, (SELECT at FROM start)) AS from_at, ch.changed_at AS until_at FROM ch
     WHERE ch.phone IS NOT NULL AND ch.phone <> ''
    UNION
    SELECT btrim(u.phone), COALESCE((SELECT at FROM last_change), (SELECT at FROM start)), NULL::timestamptz
      FROM auth.users u WHERE u.id = p_subject AND NULLIF(btrim(COALESCE(u.phone, '')), '') IS NOT NULL
    UNION
    SELECT btrim(pr.phone_number), COALESCE((SELECT at FROM last_change), (SELECT at FROM start)), NULL::timestamptz
      FROM public.profiles pr WHERE pr.id = p_subject AND NULLIF(btrim(COALESCE(pr.phone_number, '')), '') IS NOT NULL
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('phone', phone, 'from', from_at, 'until', until_at) ORDER BY from_at NULLS FIRST, phone), '[]'::jsonb)
    FROM t;
$$;
REVOKE ALL ON FUNCTION public.privacy_phone_tenures(UUID) FROM PUBLIC, anon, authenticated;

-- Was this number the person's at that moment? The digits are compared, so "+966 50…" and "96650…" are the same number.
CREATE OR REPLACE FUNCTION public.privacy_phone_in_tenure(p_phone TEXT, p_at TIMESTAMPTZ, p_tenures JSONB) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT p_phone IS NOT NULL AND p_at IS NOT NULL AND regexp_replace(p_phone, '[^0-9]', '', 'g') <> '' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_tenures, '[]'::jsonb)) t
     WHERE regexp_replace(COALESCE(t->>'phone', ''), '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g')
       AND (t->>'from' IS NULL OR p_at >= (t->>'from')::timestamptz)
       AND (t->>'until' IS NULL OR p_at <= (t->>'until')::timestamptz));
$$;
REVOKE ALL ON FUNCTION public.privacy_phone_in_tenure(TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.privacy_scrub_contact_traces(UUID, UUID[], TEXT[]);
CREATE OR REPLACE FUNCTION public.privacy_scrub_contact_traces(p_subject UUID, p_bookings UUID[], p_tenures JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_queue_deleted INTEGER;
  v_queue INTEGER;
  v_log INTEGER;
  v_notices INTEGER;
  v_skipped INTEGER;
  v_changes INTEGER := 0;
BEGIN
  DELETE FROM public.message_queue
   WHERE status IN ('pending', 'processing', 'deferred_quiet_hours')
     AND ((p_subject IS NOT NULL AND recipient_id = p_subject) OR booking_id = ANY (COALESCE(p_bookings, '{}'))
          OR ((recipient_id IS NULL OR recipient_id = p_subject) AND public.privacy_phone_in_tenure(recipient_phone, created_at, p_tenures)));
  GET DIAGNOSTICS v_queue_deleted = ROW_COUNT;
  UPDATE public.message_queue SET recipient_phone = NULL, variables = '{}'::jsonb, recipient_id = NULL, updated_at = now()
   WHERE (p_subject IS NOT NULL AND recipient_id = p_subject) OR booking_id = ANY (COALESCE(p_bookings, '{}'))
      OR ((recipient_id IS NULL OR recipient_id = p_subject) AND public.privacy_phone_in_tenure(recipient_phone, created_at, p_tenures));
  GET DIAGNOSTICS v_queue = ROW_COUNT;
  UPDATE public.message_log SET recipient_phone = NULL, message_body = NULL, recipient_id = NULL
   WHERE (p_subject IS NOT NULL AND recipient_id = p_subject) OR booking_id = ANY (COALESCE(p_bookings, '{}'))
      OR ((recipient_id IS NULL OR recipient_id = p_subject) AND public.privacy_phone_in_tenure(recipient_phone, sent_at, p_tenures));
  GET DIAGNOSTICS v_log = ROW_COUNT;
  IF p_subject IS NOT NULL THEN
    UPDATE public.governance_notifications SET status = 'skipped', error_message = 'The recipient''s account was erased',
           destination = NULL, payload = '{}'::jsonb, next_attempt_at = NULL
     WHERE recipient_user_id = p_subject AND status IN ('pending', 'undeliverable');
    GET DIAGNOSTICS v_skipped = ROW_COUNT;
    UPDATE public.governance_notifications SET destination = NULL, payload = '{}'::jsonb
     WHERE recipient_user_id = p_subject AND status <> 'sending' AND (destination IS NOT NULL OR payload <> '{}'::jsonb);
    GET DIAGNOSTICS v_notices = ROW_COUNT;
    DELETE FROM public.account_contact_changes WHERE user_id = p_subject;
    GET DIAGNOSTICS v_changes = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('message_queue_deleted', v_queue_deleted, 'message_queue_cleared', v_queue, 'message_log_cleared', v_log,
    'notices_cleared', COALESCE(v_notices, 0) + COALESCE(v_skipped, 0), 'previous_contacts', v_changes);
END $$;
REVOKE ALL ON FUNCTION public.privacy_scrub_contact_traces(UUID, UUID[], JSONB) FROM PUBLIC, anon, authenticated;

-- What the worker keeps until the WhatsApp threads are erased: each number with its tenure.
ALTER TABLE public.privacy_erasure_pending ADD COLUMN IF NOT EXISTS phone_tenures JSONB NOT NULL DEFAULT '[]'::jsonb;

-- The engine: tenures are read before the record of earlier contacts is destroyed; the walk-in phone is no longer an account number.
SELECT pg_temp.patch_function('public.privacy_erase_subject_internal(uuid,uuid,text,text)'::regprocedure,
$from$  v_phones TEXT[];
$from$,
$to$  v_phones TEXT[];
  v_tenures JSONB;
$to$);
SELECT pg_temp.patch_function('public.privacy_erase_subject_internal(uuid,uuid,text,text)'::regprocedure,
$from$    UNION ALL SELECT btrim(c2.old_value) FROM public.account_contact_changes c2 WHERE c2.user_id = p_subject AND c2.channel = 'sms'
    UNION ALL SELECT btrim(bk.walk_in_phone) FROM public.bookings bk WHERE bk.customer_id = p_subject) x;$from$,
$to$    UNION ALL SELECT btrim(c2.old_value) FROM public.account_contact_changes c2 WHERE c2.user_id = p_subject AND c2.channel = 'sms') x;
  -- Review N6: a number is the person's only while they held it.
  v_tenures := public.privacy_phone_tenures(p_subject);$to$);
SELECT pg_temp.patch_function('public.privacy_erase_subject_internal(uuid,uuid,text,text)'::regprocedure,
$from$      ARRAY(SELECT x FROM unnest(v_bookings) x WHERE NOT x = ANY (v_hold_bookings)), v_phones));$from$,
$to$      ARRAY(SELECT x FROM unnest(v_bookings) x WHERE NOT x = ANY (v_hold_bookings)), v_tenures));$to$);
SELECT pg_temp.patch_function('public.privacy_erase_subject_internal(uuid,uuid,text,text)'::regprocedure,
$from$      INSERT INTO public.privacy_erasure_pending (subject_id, phones, notice_contacts)
      VALUES (p_subject, v_phones, COALESCE(v_contacts, '{}'::jsonb))
      ON CONFLICT (subject_id) DO UPDATE SET
        phones = ARRAY(SELECT DISTINCT x FROM unnest(privacy_erasure_pending.phones || EXCLUDED.phones) x),$from$,
$to$      INSERT INTO public.privacy_erasure_pending (subject_id, phones, notice_contacts, phone_tenures)
      VALUES (p_subject, v_phones, COALESCE(v_contacts, '{}'::jsonb), COALESCE(v_tenures, '[]'::jsonb))
      ON CONFLICT (subject_id) DO UPDATE SET
        phones = ARRAY(SELECT DISTINCT x FROM unnest(privacy_erasure_pending.phones || EXCLUDED.phones) x),
        phone_tenures = (SELECT COALESCE(jsonb_agg(DISTINCT e), '[]'::jsonb)
                           FROM jsonb_array_elements(privacy_erasure_pending.phone_tenures || EXCLUDED.phone_tenures) e),$to$);

-- The worker's list carries the tenures.
SELECT pg_temp.patch_function('public.privacy_auth_erasures_due()'::regprocedure,
$from$                  'phones', COALESCE((SELECT to_jsonb(p.phones) FROM public.privacy_erasure_pending p WHERE p.subject_id = r.subject_id), '[]'::jsonb))$from$,
$to$                  'phones', COALESCE((SELECT to_jsonb(p.phones) FROM public.privacy_erasure_pending p WHERE p.subject_id = r.subject_id), '[]'::jsonb),
                  'phone_tenures', COALESCE((SELECT p.phone_tenures FROM public.privacy_erasure_pending p WHERE p.subject_id = r.subject_id), '[]'::jsonb))$to$);
SELECT pg_temp.patch_function('public.privacy_auth_erasures_due()'::regprocedure,
$from$                  'phones', COALESCE((SELECT to_jsonb(p.phones) FROM public.privacy_erasure_pending p WHERE p.subject_id = l.subject_id), '[]'::jsonb)))$from$,
$to$                  'phones', COALESCE((SELECT to_jsonb(p.phones) FROM public.privacy_erasure_pending p WHERE p.subject_id = l.subject_id), '[]'::jsonb),
                  'phone_tenures', COALESCE((SELECT p.phone_tenures FROM public.privacy_erasure_pending p WHERE p.subject_id = l.subject_id), '[]'::jsonb)))$to$);

-- WhatsApp: only messages inside a number's tenure; a thread only when it began inside it and nothing else is left in it.
DROP FUNCTION IF EXISTS public.privacy_erase_whatsapp(UUID, TEXT[]);
CREATE OR REPLACE FUNCTION public.privacy_erase_whatsapp(p_request_id UUID, p_windows JSONB)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_n INTEGER;
  v_messages INTEGER;
  v_w RECORD;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the erasure worker erases WhatsApp threads' USING ERRCODE = '42501';
  END IF;
  IF p_windows IS NULL OR jsonb_typeof(p_windows) <> 'array' THEN
    RAISE EXCEPTION 'Windows must be an array' USING ERRCODE = '22023';
  END IF;
  FOR v_w IN SELECT e FROM jsonb_array_elements(p_windows) e LOOP
    IF jsonb_typeof(v_w.e) <> 'object' OR COALESCE(v_w.e->>'hash', '') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'Invalid hash' USING ERRCODE = '22023';
    END IF;
    IF v_w.e->>'from' IS NULL THEN
      RAISE EXCEPTION 'Each number needs the start of its tenure' USING ERRCODE = '22023';
    END IF;
    PERFORM (v_w.e->>'from')::timestamptz, (v_w.e->>'until')::timestamptz;
  END LOOP;
  DELETE FROM public.whatsapp_messages m
   USING public.whatsapp_conversations c, jsonb_array_elements(p_windows) w
   WHERE m.conversation_id = c.id AND c.customer_hash = w->>'hash'
     AND m.created_at >= (w->>'from')::timestamptz
     AND (w->>'until' IS NULL OR m.created_at <= (w->>'until')::timestamptz);
  GET DIAGNOSTICS v_messages = ROW_COUNT;
  DELETE FROM public.whatsapp_conversations c
   USING jsonb_array_elements(p_windows) w
   WHERE c.customer_hash = w->>'hash'
     AND c.created_at >= (w->>'from')::timestamptz
     AND (w->>'until' IS NULL OR c.created_at <= (w->>'until')::timestamptz)
     AND NOT EXISTS (SELECT 1 FROM public.whatsapp_messages m WHERE m.conversation_id = c.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF p_request_id IS NOT NULL THEN
    UPDATE public.privacy_requests SET completion_summary = jsonb_set(COALESCE(completion_summary, '{}'::jsonb), '{deleted,whatsapp_threads}',
             to_jsonb(COALESCE((completion_summary #>> '{deleted,whatsapp_threads}')::int, 0) + v_n), true)
     WHERE id = p_request_id AND completion_summary ? 'deleted';
    PERFORM public.privacy_log_event(p_request_id, 'whatsapp_threads_erased', jsonb_build_object('threads', v_n, 'messages', v_messages));
  END IF;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.privacy_erase_whatsapp(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_erase_whatsapp(UUID, JSONB) TO service_role;
