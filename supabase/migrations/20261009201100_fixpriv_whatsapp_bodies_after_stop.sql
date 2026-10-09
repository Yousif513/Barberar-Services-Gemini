-- P-06 (privacy review 2026-10-08): after a customer wrote STOP the contact number was deleted but the message bodies stayed readable by the salon, and
-- whatsapp.message_retention_days is unset. Bodies of a conversation are now deleted (set to NULL; the row, its time, direction, intent and delivery
-- status stay as a log) when the customer opts out and when the salon resolves the conversation. Bodies still waiting to be sent are kept until sent.
-- whatsapp.message_retention_days stays unset (an owner decision); the existing whatsapp_purge_expired_messages applies it once it is set.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n'); -- a checkout with Windows line endings stores them in function bodies
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n'); -- the migration file itself may have been checked out with CRLF
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- Internal helper: blank the bodies of one conversation, except messages still queued for sending. Not callable by clients.
CREATE OR REPLACE FUNCTION public.whatsapp_blank_conversation_bodies(p_conversation_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count INTEGER;
BEGIN
  WITH gone AS (
    UPDATE public.whatsapp_messages m SET body = NULL
     WHERE m.conversation_id = p_conversation_id AND m.body IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.message_queue q WHERE q.outbound_message_id = m.id AND q.status IN ('pending', 'processing'))
    RETURNING 1
  ) SELECT COUNT(*)::integer INTO v_count FROM gone;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.whatsapp_blank_conversation_bodies(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_blank_conversation_bodies(UUID) TO service_role;

SELECT pg_temp.patch_function('public.whatsapp_ingest_message(text, text, text, text, text, text, timestamp with time zone)'::regprocedure,
$from$    UPDATE public.whatsapp_messages SET intent = 'opt_out', processed_at = now() WHERE id = v_message;$from$,
$to$    UPDATE public.whatsapp_messages SET intent = 'opt_out', processed_at = now() WHERE id = v_message;
    PERFORM public.whatsapp_blank_conversation_bodies(v_conv.id);$to$);

SELECT pg_temp.patch_function('public.provider_resolve_whatsapp_conversation(uuid)'::regprocedure,
$from$  DELETE FROM public.whatsapp_contact_addresses WHERE conversation_id = p_conversation_id;$from$,
$to$  DELETE FROM public.whatsapp_contact_addresses WHERE conversation_id = p_conversation_id;
  PERFORM public.whatsapp_blank_conversation_bodies(p_conversation_id);$to$);

-- Conversations already opted out or closed before this migration are cleaned once.
SELECT public.whatsapp_blank_conversation_bodies(c.id)
  FROM public.whatsapp_conversations c
 WHERE c.opted_out_at IS NOT NULL OR c.status = 'closed';
