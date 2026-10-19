-- RT-H1 (red team 2026-10-17): either chat party could rewrite, backdate or move the other party's messages and re-point a
-- conversation to another customer or provider, because messages and conversations carried client INSERT and UPDATE grants
-- on every column. Chat is dispute evidence (open_booking_dispute) and the "relationship" that unlocks provider customer
-- tools (customer_has_provider_relationship, P-03), so it becomes server-written only:
--   * start_conversation   - the customer opens (or reuses) the one conversation with an active, verified provider.
--   * send_message         - a participant appends a message; sender, role and time are set by the server.
--   * mark_conversation_read - a participant clears their own unread flag and stamps read_at on the other side's messages.
-- Clients keep SELECT (row policies unchanged) and lose INSERT, UPDATE and DELETE on both tables. Messages are insert-only:
-- editing is not a product feature, so there is no edit command (decision dbsec2-chat-no-edit). Participants of a
-- conversation never change after creation; the only change to customer_id is to NULL, which the privacy engine makes when
-- it tombstones an erased customer's thread (privacy_erase_subject_internal, unchanged). Two triggers enforce the same rules
-- for every caller, so a future grant or definer function cannot quietly reintroduce the defect.

-- 1. Client write paths are removed.
DROP POLICY IF EXISTS "Participants send messages" ON public.messages;
DROP POLICY IF EXISTS "Participants mark messages read" ON public.messages;
DROP POLICY IF EXISTS "Customers create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Participants update conversations" ON public.conversations;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.messages FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.conversations FROM anon, authenticated;

-- 2. Integrity triggers (every caller, including definer functions and the table owner).
CREATE OR REPLACE FUNCTION public.guard_chat_message_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Messages are written only through send_message' USING ERRCODE = '42501', HINT = 'chat_server_only';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.body IS DISTINCT FROM OLD.body OR NEW.sender_role IS DISTINCT FROM OLD.sender_role
       OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
      RAISE EXCEPTION 'A sent message never changes' USING ERRCODE = '42501', HINT = 'chat_message_immutable';
    END IF;
    -- The sender link only goes away (profile deleted: ON DELETE SET NULL); it is never moved to someone else.
    IF NEW.sender_id IS DISTINCT FROM OLD.sender_id AND NEW.sender_id IS NOT NULL THEN
      RAISE EXCEPTION 'A sent message never changes' USING ERRCODE = '42501', HINT = 'chat_message_immutable';
    END IF;
    -- read_at is set once and never cleared or moved.
    IF OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at THEN
      RAISE EXCEPTION 'A read time is recorded once' USING ERRCODE = '42501', HINT = 'chat_message_immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_chat_message_integrity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_chat_message_integrity ON public.messages;
CREATE TRIGGER trg_guard_chat_message_integrity
  BEFORE INSERT OR UPDATE OR DELETE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_chat_message_integrity();

CREATE OR REPLACE FUNCTION public.guard_chat_conversation_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Conversations are written only through the chat commands' USING ERRCODE = '42501', HINT = 'chat_server_only';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.provider_id IS DISTINCT FROM OLD.provider_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (NEW.customer_id IS DISTINCT FROM OLD.customer_id AND NEW.customer_id IS NOT NULL) THEN
      RAISE EXCEPTION 'The participants of a conversation never change' USING ERRCODE = '42501', HINT = 'chat_participants_immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_chat_conversation_integrity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_chat_conversation_integrity ON public.conversations;
CREATE TRIGGER trg_guard_chat_conversation_integrity
  BEFORE INSERT OR UPDATE OR DELETE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.guard_chat_conversation_integrity();

-- 3. The side a user speaks for in a conversation: 'customer', 'provider' (owner or active professional of the provider), or NULL.
CREATE OR REPLACE FUNCTION public.chat_participant_side(p_conversation_id UUID, p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL OR c.id IS NULL THEN NULL
    WHEN c.customer_id = p_user_id THEN 'customer'
    WHEN public.is_provider_staff(c.provider_id, p_user_id) THEN 'provider'
  END
  FROM (SELECT 1) one LEFT JOIN public.conversations c ON c.id = p_conversation_id;
$$;
REVOKE ALL ON FUNCTION public.chat_participant_side(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- 4. Commands.
CREATE OR REPLACE FUNCTION public.start_conversation(p_provider_id UUID, p_subject TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_subject TEXT := NULLIF(left(btrim(COALESCE(p_subject, '')), 200), '');
  v_id UUID;
  v_created BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF public.is_admin() THEN
    RAISE EXCEPTION 'Console sessions do not open customer conversations' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.providers p WHERE p.id = p_provider_id AND p.status = 'active' AND COALESCE(p.is_verified, FALSE)) THEN
    RAISE EXCEPTION 'This business is not taking messages' USING ERRCODE = 'P0002';
  END IF;
  IF public.is_provider_staff(p_provider_id, v_uid) THEN
    RAISE EXCEPTION 'You work at this business; its conversations are in your provider inbox' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('chat_start:' || v_uid::text, 0));
  SELECT id INTO v_id FROM public.conversations WHERE customer_id = v_uid AND provider_id = p_provider_id;
  IF v_id IS NULL THEN
    -- Opening a conversation creates a customer relationship with the business (P-03); a burst of new ones is refused.
    IF (SELECT count(*) FROM public.conversations WHERE customer_id = v_uid AND created_at > now() - interval '24 hours')
         >= public.chat_limit('new_conversations_per_day', 20) THEN
      RAISE EXCEPTION 'You have started many conversations today. Try again tomorrow' USING ERRCODE = '54000', HINT = 'chat_rate_limited';
    END IF;
    INSERT INTO public.conversations (customer_id, provider_id, subject)
    VALUES (v_uid, p_provider_id, v_subject)
    RETURNING id INTO v_id;
    v_created := TRUE;
  END IF;
  RETURN jsonb_build_object('conversation_id', v_id, 'created', v_created);
END $$;

-- Limits come from platform_settings('chat_limits') so the owner can change them without a migration.
CREATE OR REPLACE FUNCTION public.chat_limit(p_key TEXT, p_default INTEGER)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN jsonb_typeof(value -> p_key) = 'number' AND (value ->> p_key)::numeric >= 1
                 THEN floor((value ->> p_key)::numeric)::int END
       FROM public.platform_settings WHERE key = 'chat_limits'),
    p_default);
$$;
REVOKE ALL ON FUNCTION public.chat_limit(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;

INSERT INTO public.platform_settings (key, value, description, requires_owner_approval)
VALUES ('chat_limits', '{"new_conversations_per_day": 20, "messages_per_minute": 20, "max_body_chars": 2000}'::jsonb,
        'Chat abuse limits (RT-H1): conversations a customer may open per 24 hours, messages one person may send in one conversation per minute, and the longest message. Conservative defaults; the owner confirms the values.',
        TRUE)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.send_message(p_conversation_id UUID, p_body TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_body TEXT := btrim(COALESCE(p_body, ''));
  v_side TEXT;
  v_conv public.conversations;
  v_message public.messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id FOR UPDATE;
  v_side := public.chat_participant_side(p_conversation_id, v_uid);
  IF v_conv.id IS NULL OR v_side IS NULL THEN
    -- The same answer for a missing and a foreign conversation, so ids cannot be probed.
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_conv.customer_id IS NULL THEN
    RAISE EXCEPTION 'This conversation was closed' USING ERRCODE = '22023', HINT = 'chat_closed';
  END IF;
  IF v_body = '' THEN
    RAISE EXCEPTION 'Write a message first' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) > public.chat_limit('max_body_chars', 2000) THEN
    RAISE EXCEPTION 'A message is at most % characters', public.chat_limit('max_body_chars', 2000) USING ERRCODE = '22001';
  END IF;
  IF (SELECT count(*) FROM public.messages m
       WHERE m.conversation_id = p_conversation_id AND m.sender_id = v_uid AND m.created_at > now() - interval '1 minute')
       >= public.chat_limit('messages_per_minute', 20) THEN
    RAISE EXCEPTION 'You are sending messages too quickly. Wait a minute and try again' USING ERRCODE = '54000', HINT = 'chat_rate_limited';
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, sender_role, body, created_at, read_at)
  VALUES (p_conversation_id, v_uid, v_side, v_body, now(), NULL)
  RETURNING * INTO v_message;

  RETURN jsonb_build_object('id', v_message.id, 'conversation_id', v_message.conversation_id,
                            'sender_role', v_message.sender_role, 'created_at', v_message.created_at);
END $$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_side TEXT;
  v_marked INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  v_side := public.chat_participant_side(p_conversation_id, v_uid);
  IF v_side IS NULL THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;
  WITH marked AS (
    UPDATE public.messages SET read_at = now()
     WHERE conversation_id = p_conversation_id AND read_at IS NULL AND sender_role <> v_side
    RETURNING 1
  ) SELECT count(*)::int INTO v_marked FROM marked;
  IF v_side = 'customer' THEN
    UPDATE public.conversations SET unread_for_customer = FALSE WHERE id = p_conversation_id AND unread_for_customer;
  ELSE
    UPDATE public.conversations SET unread_for_provider = FALSE WHERE id = p_conversation_id AND unread_for_provider;
  END IF;
  RETURN jsonb_build_object('conversation_id', p_conversation_id, 'side', v_side, 'messages_marked', v_marked);
END $$;

REVOKE ALL ON FUNCTION public.start_conversation(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_message(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_conversation_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_conversation(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_message(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(UUID) TO authenticated;

-- 5. The preview trigger runs inside send_message (definer) and the privacy engine; it no longer needs the caller's grants.
ALTER FUNCTION public.touch_conversation_from_message() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.touch_conversation_from_message() FROM PUBLIC, anon, authenticated;

-- Rate-limit lookup in send_message: messages of one sender in one conversation in the last minute.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_sender_created ON public.messages (conversation_id, sender_id, created_at DESC);
-- New-conversation limit in start_conversation: one customer's conversations by creation time.
CREATE INDEX IF NOT EXISTS idx_conversations_customer_created ON public.conversations (customer_id, created_at DESC);
