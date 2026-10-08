-- G60 WhatsApp receptionist commands.
--
--   service role (the whatsapp-inbound and dispatch-messages Edge Functions):
--     whatsapp_ingest_message          store one inbound message, idempotent on Meta's message id; opt-out / start words handled here
--     whatsapp_provider_context        what the rules engine may say (services, branches, hours, base URL), read from the database
--     whatsapp_record_turn             store the engine's decision and queue the reply (or hand the conversation to a person)
--     claim_whatsapp_session_batch     the dispatcher's claim of free-form replies, re-checking opt-out and the reply window at send time
--     complete_whatsapp_session_delivery
--     whatsapp_purge_expired_messages  blank old bodies (does nothing while whatsapp.message_retention_days is unset)
--   provider owner or provider-wide delegate with the bookings permission:
--     provider_open_whatsapp_conversation (audited read), provider_send_whatsapp_reply, provider_resolve_whatsapp_conversation
--   provider owner:  provider_save_whatsapp_channel
--   administrator:   admin_whatsapp_overview (counts only), admin_set_whatsapp_channel_verified

-- ---------------------------------------------------------------------------
-- 1. Text helpers (mirror supabase/functions/_shared/whatsapp-intent.ts for the words that matter to consent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_normalize_text(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(translate(
            regexp_replace(COALESCE(p_text, ''), '[ً-ٰٟـ]', '', 'g'),
            'أإآٱىیئةؤک٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
            'ااااييي' || 'هوك' || '0123456789' || '0123456789')),
          '(.)\1{2,}', '\1', 'g'),
        '[!-/:-@[-`{-~،؛؟]', ' ', 'g'),
      '\s+', ' ', 'g'));
$$;
REVOKE ALL ON FUNCTION public.whatsapp_normalize_text(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_normalize_text(TEXT) TO service_role;

-- 'opt_out' / 'opt_in' only when the WHOLE message is one of the words: "please do not stop the booking" is neither.
CREATE OR REPLACE FUNCTION public.whatsapp_text_kind(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN x.n = ANY (ARRAY['stop', 'stop all', 'stop messages', 'unsubscribe', 'opt out', 'optout', 'cancel subscription', 'unsubscribe me',
                          'ايقاف', 'ايقاف الاشتراك', 'الغاء الاشتراك', 'الغاء اشتراك', 'ايقاف الرسايل', 'الغاء الاشتراك من فضلك']) THEN 'opt_out'
    WHEN x.n = ANY (ARRAY['start', 'subscribe', 'start messages', 'ابدا', 'اشتراك', 'اشترك', 'ابدا الاشتراك', 'تفعيل الاشتراك']) THEN 'opt_in'
  END
  FROM (SELECT public.whatsapp_normalize_text(p_text) AS n) x;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_text_kind(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_text_kind(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_setting_number(p_key TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN jsonb_typeof(value) = 'number' THEN (value #>> '{}')::numeric END FROM public.platform_settings WHERE key = p_key;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_setting_number(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_setting_number(TEXT) TO authenticated, service_role;

-- Why a free-form reply cannot go out right now; NULL means it can. One rule for the bot, the provider and the dispatcher.
CREATE OR REPLACE FUNCTION public.whatsapp_reply_block_reason(p_conversation_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv public.whatsapp_conversations;
  v_channel public.whatsapp_channels;
  v_window NUMERIC := public.whatsapp_setting_number('whatsapp.session_window_hours');
BEGIN
  SELECT * INTO v_conv FROM public.whatsapp_conversations WHERE id = p_conversation_id;
  IF v_conv.id IS NULL THEN RETURN 'not_found'; END IF;
  IF v_conv.opted_out_at IS NOT NULL THEN RETURN 'opted_out'; END IF;
  SELECT * INTO v_channel FROM public.whatsapp_channels WHERE id = v_conv.channel_id;
  IF v_channel.id IS NULL OR NOT v_channel.enabled OR v_channel.verified_at IS NULL THEN RETURN 'channel_disabled'; END IF;
  IF v_window IS NULL THEN RETURN 'window_unset'; END IF;
  IF v_conv.last_inbound_at IS NULL OR v_conv.last_inbound_at < now() - make_interval(hours => v_window::int) THEN RETURN 'window_closed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.whatsapp_contact_addresses a WHERE a.conversation_id = p_conversation_id) THEN RETURN 'no_address'; END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_reply_block_reason(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_reply_block_reason(UUID) TO service_role;

-- Stores the outbound text and queues it. Internal: callers have already authorised the actor.
CREATE OR REPLACE FUNCTION public.whatsapp_enqueue_reply(
  p_conversation_id UUID, p_text TEXT, p_sender TEXT, p_intent TEXT, p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv public.whatsapp_conversations;
  v_block TEXT;
  v_message UUID;
  v_queue UUID;
BEGIN
  SELECT * INTO v_conv FROM public.whatsapp_conversations WHERE id = p_conversation_id FOR UPDATE;
  IF v_conv.id IS NULL THEN RETURN jsonb_build_object('enqueued', FALSE, 'reason', 'not_found'); END IF;

  SELECT id INTO v_message FROM public.whatsapp_messages WHERE conversation_id = p_conversation_id AND idempotency_key = p_idempotency_key;
  IF v_message IS NOT NULL THEN
    RETURN jsonb_build_object('enqueued', TRUE, 'replay', TRUE, 'message_id', v_message);
  END IF;

  v_block := public.whatsapp_reply_block_reason(p_conversation_id);
  IF v_block IS NOT NULL THEN
    RETURN jsonb_build_object('enqueued', FALSE, 'reason', v_block);
  END IF;

  INSERT INTO public.whatsapp_messages (conversation_id, direction, sender, message_type, intent, body, delivery_status, idempotency_key)
  VALUES (p_conversation_id, 'outbound', p_sender, 'text', p_intent, p_text, 'queued', p_idempotency_key)
  RETURNING id INTO v_message;

  -- The queue row carries no text and no number: the phone is read from whatsapp_contact_addresses and the text from the message at send time.
  INSERT INTO public.message_queue (recipient_phone, recipient_id, channel, template_name, locale, variables, scheduled_for, status,
                                    conversation_id, outbound_message_id)
  VALUES ('****' || v_conv.customer_last4, NULL, 'whatsapp', 'whatsapp_session_text', v_conv.locale, '{}'::jsonb, now(), 'pending',
          p_conversation_id, v_message)
  RETURNING id INTO v_queue;

  RETURN jsonb_build_object('enqueued', TRUE, 'replay', FALSE, 'message_id', v_message, 'queue_id', v_queue);
END;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_enqueue_reply(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Ingest (service role). Idempotent on Meta's message id: a replay changes nothing once the turn was recorded.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_ingest_message(
  p_phone_number_id TEXT,
  p_customer_hash TEXT,
  p_wa_id TEXT,
  p_wa_message_id TEXT,
  p_body TEXT,
  p_message_type TEXT DEFAULT 'text',
  p_received_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel public.whatsapp_channels;
  v_conv public.whatsapp_conversations;
  v_message UUID;
  v_existing RECORD;
  v_kind TEXT;
  v_received TIMESTAMPTZ := LEAST(COALESCE(p_received_at, now()), now());
  v_type TEXT := COALESCE(NULLIF(btrim(p_message_type), ''), 'text');
  v_body TEXT;
  v_block TEXT;
  v_run BOOLEAN := FALSE;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_phone_number_id IS NULL OR p_phone_number_id !~ '^[0-9]{5,25}$' THEN
    RAISE EXCEPTION 'The phone number id is not valid' USING ERRCODE = '22023';
  END IF;
  IF p_customer_hash IS NULL OR p_customer_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'The customer hash must be 64 hexadecimal characters' USING ERRCODE = '22023';
  END IF;
  IF p_wa_id IS NULL OR p_wa_id !~ '^[0-9]{6,20}$' THEN
    RAISE EXCEPTION 'The WhatsApp id is not valid' USING ERRCODE = '22023';
  END IF;
  IF p_wa_message_id IS NULL OR char_length(p_wa_message_id) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'The message id is not valid' USING ERRCODE = '22023';
  END IF;
  IF v_type !~ '^[a-z_]{1,30}$' THEN
    RAISE EXCEPTION 'The message type is not valid' USING ERRCODE = '22023';
  END IF;
  v_body := CASE WHEN v_type = 'text' THEN LEFT(p_body, 4096) ELSE NULL END;

  SELECT * INTO v_channel FROM public.whatsapp_channels WHERE phone_number_id = p_phone_number_id;
  IF v_channel.id IS NULL THEN
    RETURN jsonb_build_object('routed', FALSE, 'reason', 'unknown_channel');
  ELSIF NOT v_channel.enabled THEN
    RETURN jsonb_build_object('routed', FALSE, 'reason', 'channel_disabled');
  ELSIF v_channel.verified_at IS NULL THEN
    RETURN jsonb_build_object('routed', FALSE, 'reason', 'channel_unverified');
  END IF;

  INSERT INTO public.whatsapp_conversations (provider_id, channel_id, customer_hash, customer_last4, last_inbound_at)
  VALUES (v_channel.provider_id, v_channel.id, p_customer_hash, right(p_wa_id, 4), v_received)
  ON CONFLICT (channel_id, customer_hash) DO NOTHING;
  SELECT * INTO v_conv FROM public.whatsapp_conversations WHERE channel_id = v_channel.id AND customer_hash = p_customer_hash FOR UPDATE;

  INSERT INTO public.whatsapp_messages (conversation_id, direction, sender, wa_message_id, message_type, body, created_at)
  VALUES (v_conv.id, 'inbound', 'customer', p_wa_message_id, v_type, v_body, v_received)
  ON CONFLICT (wa_message_id) DO NOTHING
  RETURNING id INTO v_message;

  IF v_message IS NULL THEN
    SELECT id, conversation_id, processed_at INTO v_existing FROM public.whatsapp_messages WHERE wa_message_id = p_wa_message_id;
    IF v_existing.conversation_id IS DISTINCT FROM v_conv.id THEN
      RAISE EXCEPTION 'This message id belongs to another conversation' USING ERRCODE = '23505';
    END IF;
    IF v_existing.processed_at IS NOT NULL THEN
      RETURN jsonb_build_object('routed', TRUE, 'duplicate', TRUE, 'conversation_id', v_conv.id, 'run_engine', FALSE, 'reply_allowed', FALSE);
    END IF;
    -- Stored earlier but never answered (the caller crashed after ingesting): process it again.
    v_message := v_existing.id;
  END IF;

  UPDATE public.whatsapp_conversations
  SET last_inbound_at = GREATEST(COALESCE(last_inbound_at, v_received), v_received), customer_last4 = right(p_wa_id, 4), updated_at = now()
  WHERE id = v_conv.id;
  UPDATE public.whatsapp_channels
  SET last_inbound_at = GREATEST(COALESCE(last_inbound_at, v_received), v_received)
  WHERE id = v_channel.id;

  v_kind := CASE WHEN v_type = 'text' THEN public.whatsapp_text_kind(v_body) END;

  IF v_kind = 'opt_out' THEN
    UPDATE public.whatsapp_conversations
    SET opted_out_at = COALESCE(opted_out_at, now()), state = '{}'::jsonb, status = 'closed', handoff_reason = NULL,
        resolved_at = COALESCE(resolved_at, now()), updated_at = now()
    WHERE id = v_conv.id;
    DELETE FROM public.whatsapp_contact_addresses WHERE conversation_id = v_conv.id;
    UPDATE public.whatsapp_messages SET intent = 'opt_out', processed_at = now() WHERE id = v_message;
    RETURN jsonb_build_object('routed', TRUE, 'duplicate', FALSE, 'conversation_id', v_conv.id, 'provider_id', v_channel.provider_id,
      'opted_out', TRUE, 'kind', 'opt_out', 'run_engine', FALSE, 'reply_allowed', FALSE, 'reply_blocked_reason', 'opted_out');
  END IF;

  IF v_conv.opted_out_at IS NOT NULL AND v_kind IS DISTINCT FROM 'opt_in' THEN
    -- The customer unsubscribed: keep the record, send nothing, until they write a start word.
    UPDATE public.whatsapp_messages SET processed_at = now() WHERE id = v_message;
    RETURN jsonb_build_object('routed', TRUE, 'duplicate', FALSE, 'conversation_id', v_conv.id, 'provider_id', v_channel.provider_id,
      'opted_out', TRUE, 'kind', NULL, 'run_engine', FALSE, 'reply_allowed', FALSE, 'reply_blocked_reason', 'opted_out');
  END IF;

  IF v_kind = 'opt_in' THEN
    UPDATE public.whatsapp_conversations SET opted_out_at = NULL, state = '{}'::jsonb, updated_at = now() WHERE id = v_conv.id;
  END IF;
  INSERT INTO public.whatsapp_contact_addresses (conversation_id, recipient_wa_id) VALUES (v_conv.id, p_wa_id)
  ON CONFLICT (conversation_id) DO UPDATE SET recipient_wa_id = EXCLUDED.recipient_wa_id, updated_at = now();
  IF v_conv.status = 'closed' THEN
    UPDATE public.whatsapp_conversations SET status = 'bot', handoff_reason = NULL, resolved_at = NULL, resolved_by = NULL, updated_at = now()
    WHERE id = v_conv.id;
  END IF;

  SELECT * INTO v_conv FROM public.whatsapp_conversations WHERE id = v_conv.id;
  IF v_conv.status = 'awaiting_human' THEN
    v_run := FALSE; -- a person has the conversation: the receptionist stays silent
  ELSIF NOT v_channel.ai_enabled THEN
    v_run := FALSE;
    IF v_channel.handoff_enabled THEN
      UPDATE public.whatsapp_conversations SET status = 'awaiting_human', handoff_reason = 'ai_disabled', updated_at = now() WHERE id = v_conv.id;
      v_conv.status := 'awaiting_human';
    END IF;
  ELSE
    v_run := TRUE;
  END IF;
  IF NOT v_run THEN
    UPDATE public.whatsapp_messages SET processed_at = now() WHERE id = v_message;
  END IF;

  v_block := public.whatsapp_reply_block_reason(v_conv.id);
  RETURN jsonb_build_object('routed', TRUE, 'duplicate', FALSE, 'conversation_id', v_conv.id, 'provider_id', v_channel.provider_id,
    'channel_id', v_channel.id, 'inbound_message_id', v_message, 'status', v_conv.status, 'state', v_conv.state, 'locale', v_conv.locale,
    'opted_out', FALSE, 'kind', v_kind, 'run_engine', v_run, 'ai_enabled', v_channel.ai_enabled, 'handoff_enabled', v_channel.handoff_enabled,
    'reply_allowed', (v_block IS NULL AND v_channel.ai_enabled), 'reply_blocked_reason', v_block);
END;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_ingest_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_ingest_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Context for the rules engine (service role): only what the database knows, nothing invented.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_provider_context(p_channel_id UUID, p_from DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel public.whatsapp_channels;
  v_provider RECORD;
  v_services JSONB;
  v_branches JSONB := '[]'::jsonb;
  v_branch RECORD;
  v_hours JSONB;
  v_day DATE;
  v_from_min INTEGER;
  v_to_min INTEGER;
  v_base TEXT;
  i INTEGER;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_channel FROM public.whatsapp_channels WHERE id = p_channel_id;
  IF v_channel.id IS NULL THEN RAISE EXCEPTION 'Channel not found' USING ERRCODE = 'P0002'; END IF;
  SELECT id, business_name_en, business_name_ar, COALESCE(is_verified, FALSE) AS is_verified, status::text AS status
    INTO v_provider FROM public.providers WHERE id = v_channel.provider_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', s.id, 'name_ar', s.name_ar, 'name_en', s.name_en,
                                               'price', s.base_price, 'duration_minutes', s.base_duration_minutes)
                            ORDER BY s.name_en, s.id), '[]'::jsonb)
    INTO v_services
  FROM public.services s WHERE s.provider_id = v_provider.id AND COALESCE(s.is_active, TRUE);

  FOR v_branch IN
    SELECT b.id, b.name_ar, b.name_en, b.address_text_ar, b.address_text_en, b.latitude, b.longitude
    FROM public.branches b WHERE b.provider_id = v_provider.id AND COALESCE(b.is_active, TRUE) ORDER BY b.name_en, b.id
  LOOP
    v_hours := '[]'::jsonb;
    FOR i IN 0..6 LOOP
      v_day := p_from + i;
      -- Earliest start and latest finish over the branch's active professionals who work that day (after seasons and second shifts).
      -- A shift that ends at or before its start crosses midnight: its finish is counted as past 24:00.
      SELECT MIN((extract(epoch FROM sch.shift_start) / 60)::int),
             MAX(CASE WHEN sch.has_second_shift AND sch.second_end IS NOT NULL
                      THEN (extract(epoch FROM sch.second_end) / 60)::int + CASE WHEN sch.second_end <= sch.second_start THEN 1440 ELSE 0 END
                      ELSE (extract(epoch FROM sch.shift_end) / 60)::int + CASE WHEN sch.shift_end <= sch.shift_start THEN 1440 ELSE 0 END END)
        INTO v_from_min, v_to_min
      FROM public.employees e
      CROSS JOIN LATERAL public.employee_day_schedule(e.id, v_provider.id, v_branch.id, v_day) sch
      WHERE e.branch_id = v_branch.id AND COALESCE(e.is_active, TRUE) AND sch.is_working;
      v_hours := v_hours || jsonb_build_object('date', v_day, 'open', v_from_min IS NOT NULL, 'from_min', v_from_min, 'to_min', v_to_min);
    END LOOP;
    v_branches := v_branches || jsonb_build_object('id', v_branch.id, 'name_ar', v_branch.name_ar, 'name_en', v_branch.name_en,
      'address_ar', v_branch.address_text_ar, 'address_en', v_branch.address_text_en,
      'latitude', v_branch.latitude, 'longitude', v_branch.longitude, 'hours', v_hours);
  END LOOP;

  SELECT CASE WHEN jsonb_typeof(value) = 'string' THEN rtrim(value #>> '{}', '/') END INTO v_base FROM public.platform_settings WHERE key = 'public_app_url';

  RETURN jsonb_build_object(
    'provider', jsonb_build_object('id', v_provider.id, 'name_ar', v_provider.business_name_ar, 'name_en', v_provider.business_name_en,
                                   'bookable', (v_provider.is_verified AND v_provider.status = 'active')),
    'channel', jsonb_build_object('id', v_channel.id, 'handoff_enabled', v_channel.handoff_enabled, 'ai_enabled', v_channel.ai_enabled),
    'services', v_services,
    'branches', v_branches,
    'public_app_url', v_base);
END;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_provider_context(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_provider_context(UUID, DATE) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Record the engine's decision (service role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_record_turn(
  p_conversation_id UUID,
  p_inbound_wa_message_id TEXT,
  p_state JSONB,
  p_status TEXT,
  p_intent TEXT,
  p_locale TEXT,
  p_reply_text TEXT,
  p_handoff_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv public.whatsapp_conversations;
  v_channel public.whatsapp_channels;
  v_inbound RECORD;
  v_status TEXT := p_status;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_handoff_reason, '')), '');
  v_reply JSONB := jsonb_build_object('enqueued', FALSE, 'reason', 'no_reply');
  v_text TEXT := NULLIF(btrim(COALESCE(p_reply_text, '')), '');
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('bot', 'awaiting_human') THEN
    RAISE EXCEPTION 'The status must be bot or awaiting_human' USING ERRCODE = '22023';
  END IF;
  IF p_locale IS NULL OR p_locale NOT IN ('ar', 'en') THEN
    RAISE EXCEPTION 'The locale must be ar or en' USING ERRCODE = '22023';
  END IF;
  IF p_state IS NULL OR jsonb_typeof(p_state) <> 'object' OR char_length(p_state::text) > 4000 THEN
    RAISE EXCEPTION 'The state must be a JSON object of at most 4000 characters' USING ERRCODE = '22023';
  END IF;
  IF v_text IS NOT NULL AND char_length(v_text) > 1500 THEN
    RAISE EXCEPTION 'A reply is at most 1500 characters' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NOT NULL AND v_reason !~ '^[a-z_]{1,60}$' THEN
    RAISE EXCEPTION 'The handoff reason is a short code' USING ERRCODE = '22023';
  END IF;
  IF p_intent IS NOT NULL AND p_intent !~ '^[a-z_]{1,40}$' THEN
    RAISE EXCEPTION 'The intent is a short code' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_conv FROM public.whatsapp_conversations WHERE id = p_conversation_id FOR UPDATE;
  IF v_conv.id IS NULL THEN RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002'; END IF;
  SELECT id, processed_at INTO v_inbound FROM public.whatsapp_messages
   WHERE conversation_id = p_conversation_id AND wa_message_id = p_inbound_wa_message_id AND direction = 'inbound';
  IF v_inbound.id IS NULL THEN RAISE EXCEPTION 'Inbound message not found' USING ERRCODE = 'P0002'; END IF;
  IF v_inbound.processed_at IS NOT NULL THEN
    RETURN jsonb_build_object('enqueued', FALSE, 'reason', 'already_processed', 'replay', TRUE, 'status', v_conv.status);
  END IF;

  SELECT * INTO v_channel FROM public.whatsapp_channels WHERE id = v_conv.channel_id;

  IF v_conv.opted_out_at IS NOT NULL THEN
    UPDATE public.whatsapp_messages SET processed_at = now() WHERE id = v_inbound.id;
    RETURN jsonb_build_object('enqueued', FALSE, 'reason', 'opted_out', 'status', v_conv.status);
  END IF;

  -- A conversation is only handed to a person when the provider switched hand-off on; otherwise the receptionist keeps it.
  IF v_status = 'awaiting_human' AND NOT v_channel.handoff_enabled THEN
    v_status := 'bot';
    v_reason := NULL;
  END IF;

  IF v_text IS NOT NULL THEN
    IF NOT v_channel.ai_enabled THEN
      v_reply := jsonb_build_object('enqueued', FALSE, 'reason', 'ai_disabled');
    ELSE
      v_reply := public.whatsapp_enqueue_reply(p_conversation_id, v_text, 'bot', p_intent, 'turn:' || p_inbound_wa_message_id);
    END IF;
    IF NOT COALESCE((v_reply ->> 'enqueued')::boolean, FALSE) AND v_channel.handoff_enabled THEN
      -- The answer could not be sent (no reply window, opted out, channel off): a person has to take over.
      v_status := 'awaiting_human';
      v_reason := COALESCE(v_reply ->> 'reason', 'reply_blocked');
    END IF;
  END IF;

  UPDATE public.whatsapp_conversations
  SET state = p_state, status = v_status, handoff_reason = CASE WHEN v_status = 'awaiting_human' THEN v_reason ELSE NULL END,
      locale = p_locale, updated_at = now()
  WHERE id = p_conversation_id;
  UPDATE public.whatsapp_messages SET intent = p_intent, processed_at = now() WHERE id = v_inbound.id;

  RETURN v_reply || jsonb_build_object('status', v_status, 'handoff_reason', CASE WHEN v_status = 'awaiting_human' THEN v_reason END);
END;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_record_turn(UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_record_turn(UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Sending (service role). The dispatcher claims free-form replies here; claim_message_batch never sees them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_whatsapp_session_batch(p_batch_size INTEGER DEFAULT 25)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_block TEXT;
  v_body TEXT;
  v_to TEXT;
  v_phone_number_id TEXT;
  v_out JSONB := '[]'::jsonb;
  v_skipped INTEGER := 0;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  FOR v_row IN
    SELECT q.id, q.conversation_id, q.outbound_message_id
    FROM public.message_queue q
    WHERE q.conversation_id IS NOT NULL AND q.status = 'pending' AND q.scheduled_for <= now()
      AND q.attempts < COALESCE(q.max_attempts, 3)
    ORDER BY q.scheduled_for, q.created_at
    LIMIT LEAST(GREATEST(COALESCE(p_batch_size, 25), 1), 100)
    FOR UPDATE SKIP LOCKED
  LOOP
    -- The rules are checked again now: the customer may have opted out, or the reply window may have closed, since the reply was queued.
    v_block := public.whatsapp_reply_block_reason(v_row.conversation_id);
    SELECT body INTO v_body FROM public.whatsapp_messages WHERE id = v_row.outbound_message_id;
    IF v_block IS NULL AND v_body IS NULL THEN v_block := 'body_unavailable'; END IF;
    IF v_block IS NOT NULL THEN
      UPDATE public.message_queue SET status = 'cancelled', error_message = LEFT('not sent: ' || v_block, 1000), updated_at = now() WHERE id = v_row.id;
      UPDATE public.whatsapp_messages SET delivery_status = 'cancelled' WHERE id = v_row.outbound_message_id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT a.recipient_wa_id, ch.phone_number_id INTO v_to, v_phone_number_id
    FROM public.whatsapp_contact_addresses a
    JOIN public.whatsapp_conversations c ON c.id = a.conversation_id
    JOIN public.whatsapp_channels ch ON ch.id = c.channel_id
    WHERE a.conversation_id = v_row.conversation_id;

    UPDATE public.message_queue
    SET status = 'processing', attempts = attempts + 1, last_attempt_at = now(), updated_at = now()
    WHERE id = v_row.id;

    v_out := v_out || jsonb_build_object('queue_id', v_row.id, 'conversation_id', v_row.conversation_id, 'to', v_to,
                                         'phone_number_id', v_phone_number_id, 'type', 'text', 'text', v_body);
  END LOOP;

  RETURN jsonb_build_object('messages', v_out, 'skipped', v_skipped);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_whatsapp_session_batch(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_session_batch(INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_whatsapp_session_delivery(
  p_queue_id UUID, p_succeeded BOOLEAN, p_external_id TEXT, p_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg public.message_queue;
  v_external TEXT := NULLIF(btrim(COALESCE(p_external_id, '')), '');
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_msg FROM public.message_queue WHERE id = p_queue_id AND conversation_id IS NOT NULL FOR UPDATE;
  IF v_msg.id IS NULL OR v_msg.status <> 'processing' THEN
    RAISE EXCEPTION 'Message is not being processed' USING ERRCODE = '22023';
  END IF;
  IF p_succeeded AND v_external IS NULL THEN
    RAISE EXCEPTION 'A provider message id is required to mark a message as sent' USING ERRCODE = '22023';
  END IF;

  IF p_succeeded THEN
    UPDATE public.message_queue SET status = 'sent', error_message = NULL, updated_at = now() WHERE id = v_msg.id;
    UPDATE public.whatsapp_messages
    SET delivery_status = 'sent', wa_message_id = COALESCE(wa_message_id, v_external)
    WHERE id = v_msg.outbound_message_id
      AND NOT EXISTS (SELECT 1 FROM public.whatsapp_messages other WHERE other.wa_message_id = v_external AND other.id <> v_msg.outbound_message_id);
  ELSIF v_msg.attempts < COALESCE(v_msg.max_attempts, 3) THEN
    UPDATE public.message_queue
    SET status = 'pending', error_message = LEFT(p_error, 1000), scheduled_for = now() + make_interval(mins => 2 * v_msg.attempts), updated_at = now()
    WHERE id = v_msg.id;
  ELSE
    UPDATE public.message_queue SET status = 'failed', error_message = LEFT(p_error, 1000), updated_at = now() WHERE id = v_msg.id;
    UPDATE public.whatsapp_messages SET delivery_status = 'failed' WHERE id = v_msg.outbound_message_id;
  END IF;

  -- The permanent log records that a free-form message was sent, never its text and never the customer's number.
  IF p_succeeded OR v_msg.attempts >= COALESCE(v_msg.max_attempts, 3) THEN
    INSERT INTO public.message_log (queue_id, booking_id, recipient_phone, recipient_id, channel, template_name, locale, message_body,
                                    status, cost_sar, external_id, error_details)
    VALUES (v_msg.id, NULL, v_msg.recipient_phone, NULL, 'whatsapp', 'whatsapp_session_text', v_msg.locale, '',
            CASE WHEN p_succeeded THEN 'sent' ELSE 'failed' END, NULL, v_external, LEFT(p_error, 1000));
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_whatsapp_session_delivery(UUID, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_whatsapp_session_delivery(UUID, BOOLEAN, TEXT, TEXT) TO service_role;

-- Retention: blank the text of old messages. While whatsapp.message_retention_days is unset this does nothing, on purpose.
CREATE OR REPLACE FUNCTION public.whatsapp_purge_expired_messages()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days NUMERIC := public.whatsapp_setting_number('whatsapp.message_retention_days');
  v_count INTEGER;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF v_days IS NULL THEN
    RETURN jsonb_build_object('purged', 0, 'reason', 'retention_unset');
  END IF;
  WITH gone AS (
    UPDATE public.whatsapp_messages SET body = NULL
    WHERE body IS NOT NULL AND created_at < now() - make_interval(days => v_days::int)
      AND NOT EXISTS (SELECT 1 FROM public.message_queue q WHERE q.outbound_message_id = whatsapp_messages.id AND q.status IN ('pending', 'processing'))
    RETURNING 1
  ) SELECT COUNT(*)::int INTO v_count FROM gone;
  RETURN jsonb_build_object('purged', v_count, 'retention_days', v_days);
END;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_purge_expired_messages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_purge_expired_messages() TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Provider commands
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_save_whatsapp_channel(
  p_provider_id UUID,
  p_phone_number_id TEXT,
  p_display_number TEXT,
  p_enabled BOOLEAN,
  p_ai_enabled BOOLEAN,
  p_handoff_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_number TEXT := NULLIF(btrim(COALESCE(p_phone_number_id, '')), '');
  v_display TEXT := NULLIF(btrim(COALESCE(p_display_number, '')), '');
  v_channel public.whatsapp_channels;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = v_caller) THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_number IS NULL OR v_number !~ '^[0-9]{5,25}$' THEN
    RAISE EXCEPTION 'The phone number id is the numeric id shown in Meta WhatsApp Manager (5 to 25 digits)' USING ERRCODE = '22023';
  END IF;
  IF v_display IS NOT NULL AND v_display !~ '^[+]?[0-9 ()-]{6,24}$' THEN
    RAISE EXCEPTION 'The display number may contain digits, spaces, brackets, a leading + and dashes' USING ERRCODE = '22023';
  END IF;
  IF p_enabled IS NULL OR p_ai_enabled IS NULL OR p_handoff_enabled IS NULL THEN
    RAISE EXCEPTION 'The enabled, receptionist and hand-off switches are required' USING ERRCODE = '22023';
  END IF;
  IF p_ai_enabled AND NOT p_enabled THEN
    RAISE EXCEPTION 'Switch the channel on before switching the receptionist on' USING ERRCODE = '22023';
  END IF;

  BEGIN
    INSERT INTO public.whatsapp_channels (provider_id, phone_number_id, display_number, enabled, ai_enabled, handoff_enabled)
    VALUES (p_provider_id, v_number, v_display, p_enabled, p_ai_enabled, p_handoff_enabled)
    ON CONFLICT (provider_id) DO UPDATE SET
      verified_at = CASE WHEN public.whatsapp_channels.phone_number_id = EXCLUDED.phone_number_id THEN public.whatsapp_channels.verified_at END,
      verified_by = CASE WHEN public.whatsapp_channels.phone_number_id = EXCLUDED.phone_number_id THEN public.whatsapp_channels.verified_by END,
      phone_number_id = EXCLUDED.phone_number_id,
      display_number = EXCLUDED.display_number,
      enabled = EXCLUDED.enabled,
      ai_enabled = EXCLUDED.ai_enabled,
      handoff_enabled = EXCLUDED.handoff_enabled,
      updated_at = now()
    RETURNING * INTO v_channel;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This WhatsApp number is already connected to another business' USING ERRCODE = '23505';
  END;

  PERFORM public.write_audit_log('whatsapp.channel_saved', 'whatsapp_channels', v_channel.id,
    jsonb_build_object('enabled', v_channel.enabled, 'ai_enabled', v_channel.ai_enabled, 'handoff_enabled', v_channel.handoff_enabled,
                       'verified', v_channel.verified_at IS NOT NULL));

  RETURN jsonb_build_object('id', v_channel.id, 'provider_id', v_channel.provider_id, 'phone_number_id', v_channel.phone_number_id,
    'display_number', v_channel.display_number, 'enabled', v_channel.enabled, 'ai_enabled', v_channel.ai_enabled,
    'handoff_enabled', v_channel.handoff_enabled, 'verified_at', v_channel.verified_at, 'last_inbound_at', v_channel.last_inbound_at);
END;
$$;
REVOKE ALL ON FUNCTION public.provider_save_whatsapp_channel(UUID, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_save_whatsapp_channel(UUID, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

-- The transcript is personal data: opening it is an audited read.
CREATE OR REPLACE FUNCTION public.provider_open_whatsapp_conversation(p_conversation_id UUID, p_limit INTEGER DEFAULT 100)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv public.whatsapp_conversations;
  v_messages JSONB;
  v_block TEXT;
  v_limit INTEGER := COALESCE(p_limit, 100);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'The limit is between 1 and 200' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_conv FROM public.whatsapp_conversations WHERE id = p_conversation_id;
  IF v_conv.id IS NULL OR NOT public.whatsapp_can_handle(v_conv.provider_id) THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', m.id, 'direction', m.direction, 'sender', m.sender, 'body', m.body, 'intent', m.intent,
                                               'delivery_status', m.delivery_status, 'message_type', m.message_type, 'created_at', m.created_at)
                            ORDER BY m.created_at, m.id), '[]'::jsonb)
    INTO v_messages
  FROM (SELECT * FROM public.whatsapp_messages WHERE conversation_id = p_conversation_id ORDER BY created_at DESC, id DESC LIMIT v_limit) m;

  PERFORM public.write_audit_log('whatsapp.transcript_read', 'whatsapp_conversations', v_conv.id,
    jsonb_build_object('messages', jsonb_array_length(v_messages)));

  v_block := public.whatsapp_reply_block_reason(v_conv.id);
  RETURN jsonb_build_object(
    'conversation', jsonb_build_object('id', v_conv.id, 'status', v_conv.status, 'customer_last4', v_conv.customer_last4,
      'locale', v_conv.locale, 'handoff_reason', v_conv.handoff_reason, 'last_inbound_at', v_conv.last_inbound_at,
      'opted_out', v_conv.opted_out_at IS NOT NULL),
    'can_reply', v_block IS NULL,
    'reply_blocked_reason', v_block,
    'messages', v_messages);
END;
$$;
REVOKE ALL ON FUNCTION public.provider_open_whatsapp_conversation(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_open_whatsapp_conversation(UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.provider_send_whatsapp_reply(p_conversation_id UUID, p_text TEXT, p_idempotency_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv public.whatsapp_conversations;
  v_text TEXT := NULLIF(btrim(COALESCE(p_text, '')), '');
  v_result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_conv FROM public.whatsapp_conversations WHERE id = p_conversation_id;
  IF v_conv.id IS NULL OR NOT public.whatsapp_can_handle(v_conv.provider_id) THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_text IS NULL OR char_length(v_text) > 1000 THEN
    RAISE EXCEPTION 'A reply is between 1 and 1000 characters' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 8 AND 80 THEN
    RAISE EXCEPTION 'An idempotency key of 8 to 80 characters is required' USING ERRCODE = '22023';
  END IF;

  v_result := public.whatsapp_enqueue_reply(p_conversation_id, v_text, 'provider', 'manual_reply', 'manual:' || p_idempotency_key);
  IF NOT COALESCE((v_result ->> 'enqueued')::boolean, FALSE) THEN
    RAISE EXCEPTION 'The reply cannot be sent: %', COALESCE(v_result ->> 'reason', 'unknown') USING ERRCODE = '22023';
  END IF;

  IF NOT COALESCE((v_result ->> 'replay')::boolean, FALSE) THEN
    -- A person has taken over: the receptionist stays silent until the conversation is resolved.
    UPDATE public.whatsapp_conversations
    SET status = 'awaiting_human', handoff_reason = COALESCE(handoff_reason, 'manual_reply'), updated_at = now()
    WHERE id = p_conversation_id AND status <> 'awaiting_human';
    PERFORM public.write_audit_log('whatsapp.manual_reply', 'whatsapp_conversations', p_conversation_id,
      jsonb_build_object('characters', char_length(v_text)));
  END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.provider_send_whatsapp_reply(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_send_whatsapp_reply(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.provider_resolve_whatsapp_conversation(p_conversation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv public.whatsapp_conversations;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_conv FROM public.whatsapp_conversations WHERE id = p_conversation_id FOR UPDATE;
  IF v_conv.id IS NULL OR NOT public.whatsapp_can_handle(v_conv.provider_id) THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_conv.status = 'closed' THEN
    RETURN jsonb_build_object('id', v_conv.id, 'status', 'closed', 'replay', TRUE);
  END IF;
  UPDATE public.whatsapp_conversations
  SET status = 'closed', state = '{}'::jsonb, handoff_reason = NULL, resolved_at = now(), resolved_by = auth.uid(), updated_at = now()
  WHERE id = p_conversation_id;
  -- Nothing more will be sent to this customer until they write again, so their number is no longer kept.
  DELETE FROM public.whatsapp_contact_addresses WHERE conversation_id = p_conversation_id;
  PERFORM public.write_audit_log('whatsapp.conversation_resolved', 'whatsapp_conversations', p_conversation_id, jsonb_build_object('previous_status', v_conv.status));
  RETURN jsonb_build_object('id', p_conversation_id, 'status', 'closed', 'replay', FALSE);
END;
$$;
REVOKE ALL ON FUNCTION public.provider_resolve_whatsapp_conversation(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_resolve_whatsapp_conversation(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Administrator: counts only, and confirming that a phone number id belongs to the provider who entered it
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_whatsapp_overview()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'channels', (SELECT jsonb_build_object('total', COUNT(*), 'enabled', COUNT(*) FILTER (WHERE enabled),
                   'receptionist_on', COUNT(*) FILTER (WHERE enabled AND ai_enabled),
                   'verified', COUNT(*) FILTER (WHERE verified_at IS NOT NULL),
                   'pending_verification', COUNT(*) FILTER (WHERE verified_at IS NULL)) FROM public.whatsapp_channels),
    'conversations', (SELECT jsonb_build_object('total', COUNT(*), 'bot', COUNT(*) FILTER (WHERE status = 'bot'),
                   'awaiting_human', COUNT(*) FILTER (WHERE status = 'awaiting_human'), 'closed', COUNT(*) FILTER (WHERE status = 'closed'),
                   'opted_out', COUNT(*) FILTER (WHERE opted_out_at IS NOT NULL)) FROM public.whatsapp_conversations),
    'messages_7d', (SELECT jsonb_build_object('inbound', COUNT(*) FILTER (WHERE direction = 'inbound'),
                   'outbound', COUNT(*) FILTER (WHERE direction = 'outbound')) FROM public.whatsapp_messages WHERE created_at >= now() - interval '7 days'),
    'settings', jsonb_build_object('session_window_hours', public.whatsapp_setting_number('whatsapp.session_window_hours'),
                   'message_retention_days', public.whatsapp_setting_number('whatsapp.message_retention_days')),
    'pending_channels', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'provider_name_en', p.business_name_en,
                   'provider_name_ar', p.business_name_ar, 'phone_number_id', c.phone_number_id, 'display_number', c.display_number,
                   'created_at', c.created_at) ORDER BY c.created_at), '[]'::jsonb)
                 FROM public.whatsapp_channels c JOIN public.providers p ON p.id = c.provider_id WHERE c.verified_at IS NULL));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_whatsapp_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_whatsapp_overview() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_whatsapp_channel_verified(p_channel_id UUID, p_verified BOOLEAN, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel public.whatsapp_channels;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;
  IF p_verified IS NULL THEN
    RAISE EXCEPTION 'The verified flag is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_channel FROM public.whatsapp_channels WHERE id = p_channel_id FOR UPDATE;
  IF v_channel.id IS NULL THEN
    RAISE EXCEPTION 'Channel not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM set_config('primora.audit_reason', btrim(p_reason), true);
  UPDATE public.whatsapp_channels
  SET verified_at = CASE WHEN p_verified THEN COALESCE(verified_at, now()) END,
      verified_by = CASE WHEN p_verified THEN COALESCE(verified_by, auth.uid()) END,
      updated_at = now()
  WHERE id = p_channel_id
  RETURNING * INTO v_channel;
  PERFORM set_config('primora.audit_reason', '', true);
  PERFORM public.write_audit_log('whatsapp.channel_verification', 'whatsapp_channels', p_channel_id,
    jsonb_build_object('verified', p_verified, 'reason', btrim(p_reason)));
  RETURN jsonb_build_object('id', v_channel.id, 'verified_at', v_channel.verified_at);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_whatsapp_channel_verified(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_whatsapp_channel_verified(UUID, BOOLEAN, TEXT) TO authenticated;
