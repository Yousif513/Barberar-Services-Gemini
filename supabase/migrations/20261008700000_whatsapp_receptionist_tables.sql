-- G60 WhatsApp AI receptionist (v1: deterministic rules, no language model) - tables, settings, security helpers.
--
-- Data minimisation is the design:
--   * A customer is identified by a keyed hash of their WhatsApp id (computed by the Edge Function with a secret pepper) plus the last four
--     digits for display. The hash and the conversation state are not readable by any signed-in client.
--   * The plain WhatsApp id lives only in whatsapp_contact_addresses, a table with no client policy at all (service role only). It exists to
--     deliver a reply and is deleted when the customer opts out or the provider resolves the conversation.
--   * Message bodies sit in whatsapp_messages and can only be read through an audited command (see the commands migration).
--     Outbound text is never copied into message_queue or message_log, so the administrator audit paths never carry it.
--   * Two platform_settings keys are UNSET until the owner decides (value JSON null):
--       whatsapp.message_retention_days  unset = bodies are kept and the purge command does nothing
--       whatsapp.session_window_hours    unset = the receptionist sends no free-form reply at all (a person must answer)

-- ---------------------------------------------------------------------------
-- 1. Platform settings (unset by default; the owner enters them in the console)
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_settings (key, value, description, requires_owner_approval) VALUES
  ('whatsapp.message_retention_days', 'null'::jsonb,
   'Days WhatsApp receptionist message bodies are kept (whole number, 1 to 3650). Unset: bodies are kept and the purge command does nothing.', TRUE),
  ('whatsapp.session_window_hours', 'null'::jsonb,
   'Hours after a customer message during which free-form replies may be sent (whole number, 1 to 24; Meta allows 24). Unset: no free-form replies are sent.', TRUE)
ON CONFLICT (key) DO NOTHING;

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $helper$
DECLARE
  v_crlf text := chr(13) || chr(10);
  v_def text := replace(pg_get_functiondef(p_sig), v_crlf, chr(10));
  v_from text := replace(p_from, v_crlf, chr(10));
BEGIN
  IF position(v_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, v_from, replace(p_to, v_crlf, chr(10)));
END $helper$;

-- The console command learns the two keys (patched in place; the other keys are untouched).
SELECT pg_temp.patch_function('public.admin_update_platform_setting(text, jsonb, text)'::regprocedure,
  $q$  ELSIF p_key = 'public_app_url' THEN$q$,
  $q$  ELSIF p_key = 'whatsapp.session_window_hours' THEN
    IF jsonb_typeof(p_value) NOT IN ('number', 'null')
       OR (jsonb_typeof(p_value) = 'number' AND ((p_value #>> '{}')::numeric < 1 OR (p_value #>> '{}')::numeric > 24
                                                OR (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric))) THEN
      RAISE EXCEPTION 'The reply window is a whole number of hours from 1 to 24, or null to remove it' USING ERRCODE = '22023';
    END IF;
  ELSIF p_key = 'whatsapp.message_retention_days' THEN
    IF jsonb_typeof(p_value) NOT IN ('number', 'null')
       OR (jsonb_typeof(p_value) = 'number' AND ((p_value #>> '{}')::numeric < 1 OR (p_value #>> '{}')::numeric > 3650
                                                OR (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric))) THEN
      RAISE EXCEPTION 'Retention is a whole number of days from 1 to 3650, or null to keep bodies' USING ERRCODE = '22023';
    END IF;
  ELSIF p_key = 'public_app_url' THEN$q$);
DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL,
  display_number TEXT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  handoff_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  -- The platform confirms that this Meta phone number id really belongs to the provider; until then no inbound message is routed to it.
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_inbound_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_channels_one_per_provider UNIQUE (provider_id),
  CONSTRAINT whatsapp_channels_phone_number_id_unique UNIQUE (phone_number_id),
  CONSTRAINT whatsapp_channels_phone_number_id_format CHECK (phone_number_id ~ '^[0-9]{5,25}$'),
  CONSTRAINT whatsapp_channels_display_number_format CHECK (display_number IS NULL OR display_number ~ '^[+]?[0-9 ()-]{6,24}$')
);

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.whatsapp_channels(id) ON DELETE CASCADE,
  customer_hash TEXT NOT NULL,
  customer_last4 TEXT NOT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'bot',
  handoff_reason TEXT,
  locale TEXT NOT NULL DEFAULT 'ar',
  last_inbound_at TIMESTAMPTZ,
  opted_out_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_conversations_customer_unique UNIQUE (channel_id, customer_hash),
  CONSTRAINT whatsapp_conversations_status_check CHECK (status IN ('bot', 'awaiting_human', 'closed')),
  CONSTRAINT whatsapp_conversations_locale_check CHECK (locale IN ('ar', 'en')),
  CONSTRAINT whatsapp_conversations_hash_format CHECK (customer_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT whatsapp_conversations_last4_format CHECK (customer_last4 ~ '^[0-9]{1,4}$')
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_inbox ON public.whatsapp_conversations (provider_id, status, last_inbound_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  sender TEXT NOT NULL,
  -- Meta's message id: inbound ids make the ingest command idempotent; outbound ids are filled in when the dispatcher reports the send.
  wa_message_id TEXT,
  message_type TEXT NOT NULL DEFAULT 'text',
  intent TEXT,
  body TEXT,
  delivery_status TEXT,
  idempotency_key TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_messages_wa_message_id_unique UNIQUE (wa_message_id),
  CONSTRAINT whatsapp_messages_direction_check CHECK (direction IN ('inbound', 'outbound')),
  CONSTRAINT whatsapp_messages_sender_check CHECK (sender IN ('customer', 'bot', 'provider')),
  CONSTRAINT whatsapp_messages_delivery_check CHECK (delivery_status IS NULL OR delivery_status IN ('queued', 'sent', 'failed', 'cancelled')),
  CONSTRAINT whatsapp_messages_direction_sender CHECK ((direction = 'inbound') = (sender = 'customer'))
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation ON public.whatsapp_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_purge ON public.whatsapp_messages (created_at) WHERE body IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_messages_idempotency ON public.whatsapp_messages (conversation_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- The only place the plain WhatsApp id is kept. No policy for any client role: only the service role (and the definer commands) touch it.
CREATE TABLE IF NOT EXISTS public.whatsapp_contact_addresses (
  conversation_id UUID PRIMARY KEY REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  recipient_wa_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_contact_addresses_format CHECK (recipient_wa_id ~ '^[0-9]{6,20}$')
);

-- ---------------------------------------------------------------------------
-- 3. Outbound replies ride the existing message_queue. A queue row with a conversation_id is a free-form reply: its text is read from
--    whatsapp_messages at send time (never copied into the queue or the log) and it is claimed by claim_whatsapp_session_batch, not by
--    claim_message_batch, which only handles approved templates.
-- ---------------------------------------------------------------------------
ALTER TABLE public.message_queue
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outbound_message_id UUID REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_msg_queue_conversation ON public.message_queue (conversation_id) WHERE conversation_id IS NOT NULL;

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $helper$
DECLARE
  v_crlf text := chr(13) || chr(10);
  v_def text := replace(pg_get_functiondef(p_sig), v_crlf, chr(10));
  v_from text := replace(p_from, v_crlf, chr(10));
BEGIN
  IF position(v_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, v_from, replace(p_to, v_crlf, chr(10)));
END $helper$;

-- Template dispatch must never pick up a free-form reply (it has no template and no verified profile).
SELECT pg_temp.patch_function('public.claim_message_batch(integer)'::regprocedure,
  $q$AND scheduled_for <= now()$q$,
  $q$AND scheduled_for <= now()
      AND conversation_id IS NULL$q$);
DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);

-- ---------------------------------------------------------------------------
-- 4. Row level security. Default deny; the inbox is readable by the owner and by delegates with the bookings permission (provider wide).
--    Administrators get counts from admin_whatsapp_overview() and are deliberately NOT given these tables.
-- ---------------------------------------------------------------------------
ALTER TABLE public.whatsapp_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_contact_addresses ENABLE ROW LEVEL SECURITY;

-- Owner or a provider-wide delegate with the bookings permission who is also an active employee. Mirrors can_access_provider_wide
-- without its administrator clause.
CREATE OR REPLACE FUNCTION public.whatsapp_can_handle(p_provider_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.providers p WHERE p.id = p_provider_id AND p.owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.provider_memberships m
      WHERE m.provider_id = p_provider_id AND m.user_id = auth.uid() AND m.is_active
        AND m.branch_id IS NULL
        AND m.role IN ('manager', 'branch_manager', 'inventory_manager', 'receptionist')
        AND m.permissions -> 'bookings' = 'true'::jsonb
        AND EXISTS (
          SELECT 1 FROM public.employees e JOIN public.branches b ON b.id = e.branch_id
           WHERE b.provider_id = p_provider_id AND e.profile_id = m.user_id AND e.is_active
        )
    )
  );
$$;
REVOKE ALL ON FUNCTION public.whatsapp_can_handle(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_can_handle(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "Handlers read their whatsapp channel" ON public.whatsapp_channels;
CREATE POLICY "Handlers read their whatsapp channel" ON public.whatsapp_channels
  FOR SELECT TO authenticated USING (public.whatsapp_can_handle(provider_id));

DROP POLICY IF EXISTS "Handlers read their whatsapp conversations" ON public.whatsapp_conversations;
CREATE POLICY "Handlers read their whatsapp conversations" ON public.whatsapp_conversations
  FOR SELECT TO authenticated USING (public.whatsapp_can_handle(provider_id));

-- whatsapp_messages and whatsapp_contact_addresses: no policy on purpose. Transcripts are read through provider_open_whatsapp_conversation,
-- which records the read in the audit log.

-- Column level privileges: the hash, the slot-filling state and the service ids never leave the database towards a client.
REVOKE ALL ON public.whatsapp_channels, public.whatsapp_conversations, public.whatsapp_messages, public.whatsapp_contact_addresses FROM anon, authenticated;
GRANT SELECT (id, provider_id, phone_number_id, display_number, enabled, ai_enabled, handoff_enabled, verified_at, last_inbound_at, created_at, updated_at)
  ON public.whatsapp_channels TO authenticated;
GRANT SELECT (id, provider_id, channel_id, customer_last4, status, handoff_reason, locale, last_inbound_at, opted_out_at, resolved_at, created_at, updated_at)
  ON public.whatsapp_conversations TO authenticated;

SELECT public.grant_data_api_access('public.whatsapp_channels');
SELECT public.grant_data_api_access('public.whatsapp_conversations');
SELECT public.grant_data_api_access('public.whatsapp_messages');
SELECT public.grant_data_api_access('public.whatsapp_contact_addresses');
SELECT public.attach_admin_audit_trigger('public.whatsapp_channels');
SELECT public.attach_admin_audit_trigger('public.whatsapp_conversations');
SELECT public.attach_admin_audit_trigger('public.whatsapp_messages');
SELECT public.attach_admin_audit_trigger('public.whatsapp_contact_addresses');
