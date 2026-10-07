-- FIX-BOOKING item 7f (D14 / C-D14): "Send a gift card" tells the recipient.
--
-- Defect: no message template or queue write referenced a gift card. The recipient name, phone and sender message were stored and never used; the code was
-- shown to the purchaser only. The earlier changelog says a WhatsApp notice is queued; it was not.
--
-- Implemented:
--   * message_templates 'gift_card_received' (ar and en, utility, is_transactional = true, provider template name primora_gift_card_received; the Meta template
--     must be approved before delivery works) with the sender's name, the amount, the code, the expiry and the sender's message.
--   * an AFTER UPDATE trigger on gift_cards: when a card turns from pending_payment to active (the payment webhook activates it in confirm_purchase_payment), the
--     message is queued for the recipient. It is additive: confirm_purchase_payment is not touched.
--   * gift_cards.recipient_notice_status / recipient_notice_queued_at / recipient_notice_queue_id record what happened.
--
-- Limit that must be understood (decision for the owner and for legal review): the dispatcher (claim_message_batch) only sends to a registered user with a
-- verified phone number that equals the queued number AND an active WhatsApp consent. A recipient with no account, or with no consent, is therefore NOT messaged.
-- For a recipient without a verified account the card is marked `not_reachable` and nothing is queued: the purchaser must pass the code on themselves
-- (the screen should say so). Messaging a non-user third party needs a decision on transactional-message consent under PDPL; this migration does not decide it.

ALTER TABLE public.gift_cards
  ADD COLUMN IF NOT EXISTS recipient_notice_status TEXT CHECK (recipient_notice_status IS NULL OR recipient_notice_status IN ('queued', 'not_reachable')),
  ADD COLUMN IF NOT EXISTS recipient_notice_queued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recipient_notice_queue_id UUID REFERENCES public.message_queue(id) ON DELETE SET NULL;

INSERT INTO public.message_templates (name, locale, category, template_body, variables, provider_template_name, body_param_keys, is_transactional)
VALUES
  ('gift_card_received', 'ar', 'utility',
   'مرحباً {{recipient_name}}، أرسل لك {{sender_name}} بطاقة هدية من PRIMORA بقيمة {{amount}} ر.س. رمز البطاقة: {{gift_code}}. صالحة حتى {{expires_date}}. رسالته: {{gift_message}}',
   '["recipient_name","sender_name","amount","gift_code","expires_date","gift_message"]'::jsonb,
   'primora_gift_card_received', ARRAY['recipient_name','sender_name','amount','gift_code','expires_date','gift_message'], TRUE),
  ('gift_card_received', 'en', 'utility',
   'Hi {{recipient_name}}, {{sender_name}} sent you a PRIMORA gift card worth SAR {{amount}}. Card code: {{gift_code}}. Valid until {{expires_date}}. Their message: {{gift_message}}',
   '["recipient_name","sender_name","amount","gift_code","expires_date","gift_message"]'::jsonb,
   'primora_gift_card_received', ARRAY['recipient_name','sender_name','amount','gift_code','expires_date','gift_message'], TRUE)
ON CONFLICT (name, locale) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enqueue_gift_card_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone TEXT := NULLIF(regexp_replace(COALESCE(NEW.recipient_phone, ''), '[^0-9+]', '', 'g'), '');
  v_recipient RECORD;
  v_sender TEXT;
  v_lang TEXT;
  v_queue_id UUID;
BEGIN
  IF v_phone ~ '^05[0-9]{8}$' THEN
    v_phone := '+966' || substr(v_phone, 2);
  END IF;

  SELECT id, phone_number, CASE WHEN language_preference = 'en' THEN 'en' ELSE 'ar' END AS lang
  INTO v_recipient
  FROM public.profiles
  WHERE phone_verified AND phone_number = v_phone
  LIMIT 1;

  IF v_recipient.id IS NULL THEN
    UPDATE public.gift_cards SET recipient_notice_status = 'not_reachable' WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  v_lang := v_recipient.lang;
  SELECT NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), '') INTO v_sender
  FROM public.profiles WHERE id = NEW.purchaser_id;

  INSERT INTO public.message_queue (recipient_phone, recipient_id, channel, template_name, locale, variables, scheduled_for, status)
  VALUES (
    v_recipient.phone_number, v_recipient.id, 'whatsapp', 'gift_card_received', v_lang,
    jsonb_build_object(
      'recipient_name', NEW.recipient_name,
      'sender_name', COALESCE(v_sender, CASE WHEN v_lang = 'en' THEN 'A PRIMORA customer' ELSE 'أحد عملاء PRIMORA' END),
      'amount', to_char(NEW.original_amount, 'FM999990.00'),
      'gift_code', NEW.code,
      'expires_date', to_char(NEW.expires_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD'),
      'gift_message', COALESCE(NULLIF(left(TRIM(COALESCE(NEW.message, '')), 300), ''), '-')
    ),
    now(), 'pending')
  RETURNING id INTO v_queue_id;

  UPDATE public.gift_cards
  SET recipient_notice_status = 'queued', recipient_notice_queued_at = now(), recipient_notice_queue_id = v_queue_id
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_gift_card_received() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_enqueue_gift_card_received ON public.gift_cards;
CREATE TRIGGER trigger_enqueue_gift_card_received
  AFTER UPDATE OF status ON public.gift_cards
  FOR EACH ROW
  WHEN (OLD.status = 'pending_payment' AND NEW.status = 'active')
  EXECUTE FUNCTION public.enqueue_gift_card_received();
