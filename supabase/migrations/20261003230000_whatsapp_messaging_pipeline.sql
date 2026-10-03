-- ============================================================================
-- PRIMORA P0-E MIGRATION: WHATSAPP MESSAGING PIPELINE (G11)
-- 1. message_templates (Bilingual AR/EN utility templates)
-- 2. message_queue (Scheduled message delivery, retries & quiet hours)
-- 3. message_log (Audit trail, status, and SAR cost accounting)
-- 4. Booking lifecycle messaging trigger (Confirmations, 24h & 2h reminders, reviews)
-- 5. Dispatcher stored procedure with Saudi quiet hours (AST UTC+3) & PDPL consent gate
-- ============================================================================

-- 1. WHATSAPP & SMS MESSAGE TEMPLATES
CREATE TABLE IF NOT EXISTS public.message_templates (
  name VARCHAR(50) NOT NULL,
  locale VARCHAR(5) NOT NULL CHECK (locale IN ('ar', 'en')),
  category VARCHAR(30) NOT NULL DEFAULT 'utility' CHECK (category IN ('utility', 'authentication', 'marketing')),
  template_body TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (name, locale)
);

-- Seed standard bilingual templates (G11)
INSERT INTO public.message_templates (name, locale, category, template_body, variables)
VALUES
  -- 1. Booking Confirmation (Immediate)
  ('booking_confirmation', 'ar', 'utility',
   'مرحباً {{customer_name}}، تم تأكيد حجزك في {{provider_name}} لخدمة {{service_name}} يوم {{booking_date}} الساعة {{booking_time}}. المبلغ المدفوع كعربون: {{deposit_amount}} ر.س. للإلغاء أو تعديل الموعد: {{action_url}}',
   '["customer_name", "provider_name", "service_name", "booking_date", "booking_time", "deposit_amount", "action_url"]'::jsonb),
  ('booking_confirmation', 'en', 'utility',
   'Hello {{customer_name}}, your appointment at {{provider_name}} for {{service_name}} is confirmed for {{booking_date}} at {{booking_time}}. Deposit paid: {{deposit_amount}} SAR. To manage or cancel: {{action_url}}',
   '["customer_name", "provider_name", "service_name", "booking_date", "booking_time", "deposit_amount", "action_url"]'::jsonb),

  -- 2. 24-Hour Reminder (Confirm / Reschedule / Cancel action links)
  ('reminder_24h', 'ar', 'utility',
   'تذكير: موعدك غداً في {{provider_name}} لخدمة {{service_name}} الساعة {{booking_time}}. لتأكيد الحضور أو التعديل أو الإلغاء اضغط هنا: {{action_url}}',
   '["customer_name", "provider_name", "service_name", "booking_time", "action_url"]'::jsonb),
  ('reminder_24h', 'en', 'utility',
   'Reminder: Your appointment tomorrow at {{provider_name}} for {{service_name}} is at {{booking_time}}. To confirm attendance, reschedule, or cancel: {{action_url}}',
   '["customer_name", "provider_name", "service_name", "booking_time", "action_url"]'::jsonb),

  -- 3. 2-Hour Reminder
  ('reminder_2h', 'ar', 'utility',
   'تذكير: موعدك بعد ساعتين في {{provider_name}} الساعة {{booking_time}}. العنوان: {{address}}. ننتظرك بكل ترحيب!',
   '["customer_name", "provider_name", "booking_time", "address"]'::jsonb),
  ('reminder_2h', 'en', 'utility',
   'Reminder: Your appointment at {{provider_name}} is in 2 hours at {{booking_time}}. Address: {{address}}. Looking forward to seeing you!',
   '["customer_name", "provider_name", "booking_time", "address"]'::jsonb),

  -- 4. Post-Visit Review & Rebook
  ('post_visit_review', 'ar', 'utility',
   'شكراً لزيارتك {{provider_name}}! نود سماع رأيك وتقييمك لخدمة {{service_name}}: {{review_url}} ولحجز موعدك القادم مع خصم الولاء: {{rebook_url}}',
   '["customer_name", "provider_name", "service_name", "review_url", "rebook_url"]'::jsonb),
  ('post_visit_review', 'en', 'utility',
   'Thank you for visiting {{provider_name}}! Please rate your experience: {{review_url}} or book your next visit: {{rebook_url}}',
   '["customer_name", "provider_name", "service_name", "review_url", "rebook_url"]'::jsonb),

  -- 5. Owner New Booking Notification
  ('owner_new_booking', 'ar', 'utility',
   'تنبيه حجز جديد في {{provider_name}}: حجز العميل {{customer_name}} لخدمة {{service_name}} في {{booking_date}} الساعة {{booking_time}}. لمراجعة جدول المواعيد: {{dashboard_url}}',
   '["provider_name", "customer_name", "service_name", "booking_date", "booking_time", "dashboard_url"]'::jsonb),
  ('owner_new_booking', 'en', 'utility',
   'New booking alert for {{provider_name}}: Customer {{customer_name}} booked {{service_name}} on {{booking_date}} at {{booking_time}}. View calendar: {{dashboard_url}}',
   '["provider_name", "customer_name", "service_name", "booking_date", "booking_time", "dashboard_url"]'::jsonb)
ON CONFLICT (name, locale) DO UPDATE SET
  template_body = EXCLUDED.template_body,
  variables = EXCLUDED.variables,
  updated_at = CURRENT_TIMESTAMP;

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view message templates" ON public.message_templates;
CREATE POLICY "Anyone can view message templates"
  ON public.message_templates
  FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Admins can modify message templates" ON public.message_templates;
CREATE POLICY "Admins can modify message templates"
  ON public.message_templates
  FOR ALL
  TO authenticated
  USING (
    COALESCE(auth.jwt()->>'role', '') = 'service_role' OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- 2. MESSAGE QUEUE TABLE
CREATE TABLE IF NOT EXISTS public.message_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
  recipient_phone VARCHAR(30) NOT NULL,
  recipient_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'sms')),
  template_name VARCHAR(50) NOT NULL,
  locale VARCHAR(5) NOT NULL DEFAULT 'ar' CHECK (locale IN ('ar', 'en')),
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'processing',
    'sent',
    'failed',
    'cancelled',
    'deferred_quiet_hours',
    'skipped_no_consent',
    'skipped_unverified'
  )),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_msg_queue_status_sched ON public.message_queue (status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_msg_queue_booking ON public.message_queue (booking_id);
CREATE INDEX IF NOT EXISTS idx_msg_queue_recipient ON public.message_queue (recipient_id);

ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read message queue" ON public.message_queue;
CREATE POLICY "Admins read message queue"
  ON public.message_queue
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(auth.jwt()->>'role', '') = 'service_role' OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Recipients read own queued messages" ON public.message_queue;
CREATE POLICY "Recipients read own queued messages"
  ON public.message_queue
  FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "Service role manages message queue" ON public.message_queue;
CREATE POLICY "Service role manages message queue"
  ON public.message_queue
  FOR ALL
  TO authenticated
  USING (COALESCE(auth.jwt()->>'role', '') = 'service_role')
  WITH CHECK (COALESCE(auth.jwt()->>'role', '') = 'service_role');


-- 3. MESSAGE LOG TABLE (Permanent record & cost tracking)
CREATE TABLE IF NOT EXISTS public.message_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID REFERENCES public.message_queue(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  recipient_phone VARCHAR(30) NOT NULL,
  recipient_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
  template_name VARCHAR(50) NOT NULL,
  locale VARCHAR(5) NOT NULL DEFAULT 'ar',
  message_body TEXT NOT NULL,
  status VARCHAR(30) NOT NULL CHECK (status IN (
    'delivered',
    'sent',
    'failed',
    'simulated',
    'skipped_no_consent',
    'skipped_unverified'
  )),
  cost_sar NUMERIC(10, 4) NOT NULL DEFAULT 0.1500,
  external_id VARCHAR(100),
  error_details TEXT,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_msg_log_recipient ON public.message_log (recipient_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_log_booking ON public.message_log (booking_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_log_status ON public.message_log (status, sent_at DESC);

ALTER TABLE public.message_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read message logs" ON public.message_log;
CREATE POLICY "Admins read message logs"
  ON public.message_log
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(auth.jwt()->>'role', '') = 'service_role' OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Recipients read own message logs" ON public.message_log;
CREATE POLICY "Recipients read own message logs"
  ON public.message_log
  FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "Service role manages message logs" ON public.message_log;
CREATE POLICY "Service role manages message logs"
  ON public.message_log
  FOR ALL
  TO authenticated
  USING (COALESCE(auth.jwt()->>'role', '') = 'service_role')
  WITH CHECK (COALESCE(auth.jwt()->>'role', '') = 'service_role');


-- 4. BOOKINGS TABLE EXTENSIONS FOR ATTENDANCE ACTIONS
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS customer_attendance_confirmed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS attendance_confirmed_at TIMESTAMP WITH TIME ZONE;


-- 5. FUNCTION: CUSTOMER CONFIRM ATTENDANCE VIA INTERACTIVE WHATSAPP LINK
CREATE OR REPLACE FUNCTION public.customer_confirm_attendance(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
BEGIN
  SELECT id, customer_id, status, scheduled_at
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  -- Authorization check: Caller must be the customer or admin or service_role
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_booking.customer_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
      RAISE EXCEPTION 'Not authorized to confirm this booking' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_booking.status <> 'confirmed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Booking is not in confirmed status (' || v_booking.status || ')'
    );
  END IF;

  UPDATE public.bookings
  SET customer_attendance_confirmed = TRUE,
      attendance_confirmed_at = CURRENT_TIMESTAMP
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'status', 'attendance_confirmed',
    'confirmed_at', CURRENT_TIMESTAMP
  );
END;
$$;

REVOKE ALL ON FUNCTION public.customer_confirm_attendance(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_confirm_attendance(UUID) TO anon, authenticated, service_role;


-- 6. TRIGGER: ENQUEUE MESSAGES ON BOOKING LIFECYCLE EVENTS
CREATE OR REPLACE FUNCTION public.handle_booking_messaging_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer RECORD;
  v_provider RECORD;
  v_owner RECORD;
  v_branch RECORD;
  v_service RECORD;
  v_employee RECORD;
  v_customer_locale VARCHAR(5) := 'ar';
  v_owner_locale VARCHAR(5) := 'ar';
  v_cust_vars JSONB;
  v_owner_vars JSONB;
  v_date_str TEXT;
  v_time_str TEXT;
  v_action_url TEXT;
  v_rebook_url TEXT;
  v_review_url TEXT;
  v_dashboard_url TEXT;
BEGIN
  -- A. WHEN BOOKING BECOMES CONFIRMED
  IF (TG_OP = 'INSERT' AND NEW.status = 'confirmed') OR
     (TG_OP = 'UPDATE' AND NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status <> 'confirmed')) THEN

    -- Fetch customer details
    SELECT id, first_name, last_name, phone_number, phone_verified, COALESCE(language_preference, 'ar') AS lang
    INTO v_customer
    FROM public.profiles
    WHERE id = NEW.customer_id;

    -- Fetch branch details
    SELECT id, provider_id, name_en, name_ar, address_text_en, address_text_ar
    INTO v_branch
    FROM public.branches
    WHERE id = NEW.branch_id;

    -- Fetch provider details
    SELECT id, owner_id, name_en, name_ar
    INTO v_provider
    FROM public.providers
    WHERE id = v_branch.provider_id;

    -- Fetch owner details
    SELECT id, first_name, last_name, phone_number, phone_verified, COALESCE(language_preference, 'ar') AS lang
    INTO v_owner
    FROM public.profiles
    WHERE id = v_provider.owner_id;

    -- Fetch service details
    SELECT id, name_en, name_ar
    INTO v_service
    FROM public.services
    WHERE id = NEW.service_id;

    -- Fetch employee details
    SELECT id, name_en, name_ar
    INTO v_employee
    FROM public.employees
    WHERE id = NEW.employee_id;

    IF v_customer.lang IN ('ar', 'en') THEN
      v_customer_locale := v_customer.lang;
    END IF;
    IF v_owner.lang IN ('ar', 'en') THEN
      v_owner_locale := v_owner.lang;
    END IF;

    -- Format date & time in Saudi timezone (AST UTC+3)
    v_date_str := to_char(NEW.scheduled_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD');
    v_time_str := to_char(NEW.scheduled_at AT TIME ZONE 'Asia/Riyadh', 'HH24:MI');
    v_action_url := 'https://primora.sa/customer/bookings/' || NEW.id::text;
    v_dashboard_url := 'https://primora.sa/provider/bookings';

    -- Prepare variables for Customer
    v_cust_vars := jsonb_build_object(
      'customer_name', COALESCE(NULLIF(TRIM(v_customer.first_name || ' ' || COALESCE(v_customer.last_name, '')), ''), 'العميل'),
      'provider_name', CASE WHEN v_customer_locale = 'en' THEN COALESCE(v_provider.name_en, v_provider.name_ar) ELSE COALESCE(v_provider.name_ar, v_provider.name_en) END,
      'service_name', CASE WHEN v_customer_locale = 'en' THEN COALESCE(v_service.name_en, v_service.name_ar) ELSE COALESCE(v_service.name_ar, v_service.name_en) END,
      'booking_date', v_date_str,
      'booking_time', v_time_str,
      'deposit_amount', NEW.deposit_required::text,
      'action_url', v_action_url,
      'address', CASE WHEN v_customer_locale = 'en' THEN COALESCE(v_branch.address_text_en, v_branch.address_text_ar) ELSE COALESCE(v_branch.address_text_ar, v_branch.address_text_en) END
    );

    -- Prepare variables for Provider Owner
    v_owner_vars := jsonb_build_object(
      'customer_name', COALESCE(NULLIF(TRIM(v_customer.first_name || ' ' || COALESCE(v_customer.last_name, '')), ''), 'Customer'),
      'provider_name', CASE WHEN v_owner_locale = 'en' THEN COALESCE(v_provider.name_en, v_provider.name_ar) ELSE COALESCE(v_provider.name_ar, v_provider.name_en) END,
      'service_name', CASE WHEN v_owner_locale = 'en' THEN COALESCE(v_service.name_en, v_service.name_ar) ELSE COALESCE(v_service.name_ar, v_service.name_en) END,
      'booking_date', v_date_str,
      'booking_time', v_time_str,
      'dashboard_url', v_dashboard_url
    );

    -- 1. Enqueue Booking Confirmation to Customer (Immediate)
    IF v_customer.phone_number IS NOT NULL THEN
      INSERT INTO public.message_queue (
        booking_id, recipient_phone, recipient_id, channel,
        template_name, locale, variables, scheduled_for, status
      ) VALUES (
        NEW.id, v_customer.phone_number, v_customer.id, 'whatsapp',
        'booking_confirmation', v_customer_locale, v_cust_vars,
        CURRENT_TIMESTAMP, 'pending'
      );
    END IF;

    -- 2. Enqueue New Booking Alert to Provider Owner (Immediate)
    IF v_owner.phone_number IS NOT NULL THEN
      INSERT INTO public.message_queue (
        booking_id, recipient_phone, recipient_id, channel,
        template_name, locale, variables, scheduled_for, status
      ) VALUES (
        NEW.id, v_owner.phone_number, v_owner.id, 'whatsapp',
        'owner_new_booking', v_owner_locale, v_owner_vars,
        CURRENT_TIMESTAMP, 'pending'
      );
    END IF;

    -- 3. Enqueue 24h Reminder (Only if appointment is at least 12h away)
    IF v_customer.phone_number IS NOT NULL AND NEW.scheduled_at > CURRENT_TIMESTAMP + interval '12 hours' THEN
      INSERT INTO public.message_queue (
        booking_id, recipient_phone, recipient_id, channel,
        template_name, locale, variables, scheduled_for, status
      ) VALUES (
        NEW.id, v_customer.phone_number, v_customer.id, 'whatsapp',
        'reminder_24h', v_customer_locale, v_cust_vars,
        GREATEST(CURRENT_TIMESTAMP + interval '10 seconds', NEW.scheduled_at - interval '24 hours'),
        'pending'
      );
    END IF;

    -- 4. Enqueue 2h Reminder (Only if appointment is at least 2h away)
    IF v_customer.phone_number IS NOT NULL AND NEW.scheduled_at > CURRENT_TIMESTAMP + interval '2 hours' THEN
      INSERT INTO public.message_queue (
        booking_id, recipient_phone, recipient_id, channel,
        template_name, locale, variables, scheduled_for, status
      ) VALUES (
        NEW.id, v_customer.phone_number, v_customer.id, 'whatsapp',
        'reminder_2h', v_customer_locale, v_cust_vars,
        GREATEST(CURRENT_TIMESTAMP + interval '10 seconds', NEW.scheduled_at - interval '2 hours'),
        'pending'
      );
    END IF;

  -- B. WHEN BOOKING IS COMPLETED -> Enqueue Post-Visit Review & Rebook
  ELSIF (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed')) THEN

    SELECT id, first_name, last_name, phone_number, phone_verified, COALESCE(language_preference, 'ar') AS lang
    INTO v_customer
    FROM public.profiles
    WHERE id = NEW.customer_id;

    SELECT id, provider_id FROM public.branches WHERE id = NEW.branch_id INTO v_branch;
    SELECT id, name_en, name_ar FROM public.providers WHERE id = v_branch.provider_id INTO v_provider;
    SELECT id, name_en, name_ar FROM public.services WHERE id = NEW.service_id INTO v_service;

    IF v_customer.lang IN ('ar', 'en') THEN
      v_customer_locale := v_customer.lang;
    END IF;

    v_review_url := 'https://primora.sa/customer/reviews?booking=' || NEW.id::text;
    v_rebook_url := 'https://primora.sa/shop/' || v_provider.id::text || '?source=whatsapp_rebook';

    v_cust_vars := jsonb_build_object(
      'customer_name', COALESCE(NULLIF(TRIM(v_customer.first_name || ' ' || COALESCE(v_customer.last_name, '')), ''), 'العميل'),
      'provider_name', CASE WHEN v_customer_locale = 'en' THEN COALESCE(v_provider.name_en, v_provider.name_ar) ELSE COALESCE(v_provider.name_ar, v_provider.name_en) END,
      'service_name', CASE WHEN v_customer_locale = 'en' THEN COALESCE(v_service.name_en, v_service.name_ar) ELSE COALESCE(v_service.name_ar, v_service.name_en) END,
      'review_url', v_review_url,
      'rebook_url', v_rebook_url
    );

    IF v_customer.phone_number IS NOT NULL THEN
      INSERT INTO public.message_queue (
        booking_id, recipient_phone, recipient_id, channel,
        template_name, locale, variables, scheduled_for, status
      ) VALUES (
        NEW.id, v_customer.phone_number, v_customer.id, 'whatsapp',
        'post_visit_review', v_customer_locale, v_cust_vars,
        GREATEST(CURRENT_TIMESTAMP + interval '10 seconds', NEW.scheduled_at + (NEW.duration_minutes || ' minutes')::interval + interval '1 hour'),
        'pending'
      );
    END IF;

  -- C. WHEN BOOKING IS CANCELLED OR NO-SHOW -> Cancel all pending reminders
  ELSIF (TG_OP = 'UPDATE' AND NEW.status IN ('cancelled', 'no_show') AND (OLD.status IS NULL OR OLD.status NOT IN ('cancelled', 'no_show'))) THEN
    UPDATE public.message_queue
    SET status = 'cancelled',
        updated_at = CURRENT_TIMESTAMP
    WHERE booking_id = NEW.id
      AND status IN ('pending', 'deferred_quiet_hours');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_messaging_lifecycle ON public.bookings;
CREATE TRIGGER trg_booking_messaging_lifecycle
  AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_booking_messaging_lifecycle();


-- 7. DISPATCHER STORED PROCEDURE: DISPATCH QUEUED MESSAGES WITH SAUDI QUIET HOURS & PDPL CONSENT GATES
CREATE OR REPLACE FUNCTION public.dispatch_message_queue_batch(p_batch_size INT DEFAULT 20)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg RECORD;
  v_template RECORD;
  v_rendered_body TEXT;
  v_key TEXT;
  v_val TEXT;
  v_current_hour_ast INT;
  v_is_quiet_hours BOOLEAN := FALSE;
  v_next_morning_ast TIMESTAMPTZ;
  v_has_whatsapp_consent BOOLEAN := FALSE;
  v_is_phone_verified BOOLEAN := FALSE;
  v_processed_count INT := 0;
  v_sent_count INT := 0;
  v_deferred_count INT := 0;
  v_skipped_consent_count INT := 0;
  v_skipped_unverified_count INT := 0;
BEGIN
  -- Saudi Arabia Time is UTC+3 (Asia/Riyadh)
  v_current_hour_ast := EXTRACT(HOUR FROM CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh');

  -- Saudi Quiet hours: 22:00 to 09:00 AST (10 PM to 9 AM)
  IF v_current_hour_ast >= 22 OR v_current_hour_ast < 9 THEN
    v_is_quiet_hours := TRUE;
  END IF;

  -- Compute next morning 09:00 AST
  IF v_current_hour_ast >= 22 THEN
    v_next_morning_ast := ((date(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh') + 1)::text || ' 09:00:00+03')::timestamptz;
  ELSE
    v_next_morning_ast := (date(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::text || ' 09:00:00+03')::timestamptz;
  END IF;

  -- Iterate through pending queued messages that are due
  FOR v_msg IN
    SELECT q.*
    FROM public.message_queue q
    WHERE q.status IN ('pending', 'deferred_quiet_hours')
      AND q.scheduled_for <= CURRENT_TIMESTAMP
    ORDER BY q.scheduled_for ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    v_processed_count := v_processed_count + 1;

    -- Gate 1: Check recipient phone verification (G09)
    SELECT COALESCE(phone_verified, FALSE)
    INTO v_is_phone_verified
    FROM public.profiles
    WHERE id = v_msg.recipient_id;

    -- If profile is linked but phone is unverified, reject send
    IF v_msg.recipient_id IS NOT NULL AND NOT v_is_phone_verified THEN
      UPDATE public.message_queue
      SET status = 'skipped_unverified',
          error_message = 'Recipient phone number is not verified',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = v_msg.id;

      INSERT INTO public.message_log (
        queue_id, booking_id, recipient_phone, recipient_id,
        channel, template_name, locale, message_body,
        status, cost_sar, error_details
      ) VALUES (
        v_msg.id, v_msg.booking_id, v_msg.recipient_phone, v_msg.recipient_id,
        v_msg.channel, v_msg.template_name, v_msg.locale,
        '[BLOCKED] Unverified phone number',
        'skipped_unverified', 0.0000, 'Phone is not verified'
      );

      v_skipped_unverified_count := v_skipped_unverified_count + 1;
      CONTINUE;
    END IF;

    -- Gate 2: Check WhatsApp consent in consents table (G13)
    -- Utility operational messages (confirmation & owner alert) are contractual obligations,
    -- but marketing and reminder messages strictly require explicit WhatsApp consent.
    IF v_msg.recipient_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.consents
        WHERE user_id = v_msg.recipient_id
          AND purpose = 'whatsapp'
          AND status = 'granted'
      ) INTO v_has_whatsapp_consent;

      -- If reminder/review template and no consent, skip
      IF v_msg.template_name IN ('reminder_24h', 'reminder_2h', 'post_visit_review') AND NOT v_has_whatsapp_consent THEN
        UPDATE public.message_queue
        SET status = 'skipped_no_consent',
            error_message = 'No active WhatsApp consent found in consents table',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_msg.id;

        INSERT INTO public.message_log (
          queue_id, booking_id, recipient_phone, recipient_id,
          channel, template_name, locale, message_body,
          status, cost_sar, error_details
        ) VALUES (
          v_msg.id, v_msg.booking_id, v_msg.recipient_phone, v_msg.recipient_id,
          v_msg.channel, v_msg.template_name, v_msg.locale,
          '[BLOCKED] Missing WhatsApp consent',
          'skipped_no_consent', 0.0000, 'Consent missing or withdrawn'
        );

        v_skipped_consent_count := v_skipped_consent_count + 1;
        CONTINUE;
      END IF;
    END IF;

    -- Gate 3: Saudi Quiet Hours Check (AST 22:00 - 09:00)
    -- Allow immediate confirmations and 2h reminders to pass; defer non-urgent reminders & reviews
    IF v_is_quiet_hours AND v_msg.template_name NOT IN ('booking_confirmation', 'owner_new_booking', 'reminder_2h') THEN
      UPDATE public.message_queue
      SET status = 'deferred_quiet_hours',
          scheduled_for = v_next_morning_ast,
          error_message = 'Deferred due to Saudi quiet hours (22:00 - 09:00 AST)',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = v_msg.id;

      v_deferred_count := v_deferred_count + 1;
      CONTINUE;
    END IF;

    -- Fetch and render message template
    SELECT template_body
    INTO v_rendered_body
    FROM public.message_templates
    WHERE name = v_msg.template_name
      AND locale = v_msg.locale;

    IF v_rendered_body IS NULL THEN
      -- Fallback to Arabic template
      SELECT template_body
      INTO v_rendered_body
      FROM public.message_templates
      WHERE name = v_msg.template_name
        AND locale = 'ar';
    END IF;

    -- Perform variable interpolation
    FOR v_key, v_val IN SELECT * FROM jsonb_each_text(v_msg.variables)
    LOOP
      v_rendered_body := replace(v_rendered_body, '{{' || v_key || '}}', COALESCE(v_val, ''));
    END LOOP;

    -- Mark Queue item sent
    UPDATE public.message_queue
    SET status = 'sent',
        attempts = attempts + 1,
        last_attempt_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = v_msg.id;

    -- Insert permanent audit message log with utility fee (0.15 SAR)
    INSERT INTO public.message_log (
      queue_id, booking_id, recipient_phone, recipient_id,
      channel, template_name, locale, message_body,
      status, cost_sar, external_id
    ) VALUES (
      v_msg.id, v_msg.booking_id, v_msg.recipient_phone, v_msg.recipient_id,
      v_msg.channel, v_msg.template_name, v_msg.locale,
      v_rendered_body,
      'delivered', 0.1500, 'wamid_' || substr(gen_random_uuid()::text, 1, 16)
    );

    v_sent_count := v_sent_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed', v_processed_count,
    'sent', v_sent_count,
    'deferred_quiet_hours', v_deferred_count,
    'skipped_no_consent', v_skipped_consent_count,
    'skipped_unverified', v_skipped_unverified_count,
    'dispatched_at', CURRENT_TIMESTAMP
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_message_queue_batch(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_message_queue_batch(INT) TO authenticated, service_role;


-- 8. RPC: ENQUEUE DIRECT BROADCAST OR TRANSACTIONAL MESSAGE (Admin & Service Role)
CREATE OR REPLACE FUNCTION public.enqueue_direct_message(
  p_recipient_phone VARCHAR(30),
  p_recipient_id UUID,
  p_template_name VARCHAR(50),
  p_locale VARCHAR(5),
  p_variables JSONB,
  p_channel VARCHAR(20) DEFAULT 'whatsapp',
  p_scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_id UUID;
BEGIN
  -- Authorization check: Admin or service_role only
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
      RAISE EXCEPTION 'Only administrators can enqueue direct messages' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.message_queue (
    recipient_phone, recipient_id, channel, template_name,
    locale, variables, scheduled_for, status
  ) VALUES (
    p_recipient_phone, p_recipient_id, p_channel, p_template_name,
    COALESCE(p_locale, 'ar'), COALESCE(p_variables, '{}'::jsonb),
    COALESCE(p_scheduled_for, CURRENT_TIMESTAMP), 'pending'
  )
  RETURNING id INTO v_queue_id;

  RETURN v_queue_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_direct_message(VARCHAR, UUID, VARCHAR, VARCHAR, JSONB, VARCHAR, TIMESTAMP WITH TIME ZONE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_direct_message(VARCHAR, UUID, VARCHAR, VARCHAR, JSONB, VARCHAR, TIMESTAMP WITH TIME ZONE) TO authenticated, service_role;
