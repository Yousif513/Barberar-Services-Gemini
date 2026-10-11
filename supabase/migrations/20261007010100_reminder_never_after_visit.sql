-- D-13: a reminder is only useful before the visit.
--
-- claim_message_batch pushed every non-transactional template to 09:00 during the Riyadh quiet hours (22:00-09:00) without looking at
-- the booking. A 2-hour reminder for a 00:30 appointment came due at 22:30 and was delivered at 09:00 the next morning, after the
-- appointment. Now:
--   * a reminder_* message whose booking starts within 15 minutes (or has started) is closed as 'expired' instead of being sent late;
--   * reminder_2h is time-critical and is not held back by quiet hours (the earlier pipeline exempted it; the rewrite lost that).
-- The function is patched in place; everything else in it is untouched.

DO $$
DECLARE
  v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.message_queue'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%skipped_unverified%'
  LOOP
    EXECUTE format('ALTER TABLE public.message_queue DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;
ALTER TABLE public.message_queue ADD CONSTRAINT message_queue_status_check CHECK (status IN (
  'pending', 'processing', 'sent', 'failed', 'cancelled', 'deferred_quiet_hours',
  'skipped_no_consent', 'skipped_unverified', 'expired'));

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_def text := replace(pg_get_functiondef(p_sig), chr(13) || chr(10), chr(10));
  v_from text := replace(p_from, chr(13) || chr(10), chr(10));
  v_to text := replace(p_to, chr(13) || chr(10), chr(10));
BEGIN
  IF position(v_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, v_from, v_to);
END $$;

SELECT pg_temp.patch_function('public.claim_message_batch(integer)'::regprocedure,
  $from$  v_skipped INT := 0;$from$,
  $to$  v_skipped INT := 0;
  v_visit_start TIMESTAMPTZ;$to$);

SELECT pg_temp.patch_function('public.claim_message_batch(integer)'::regprocedure,
  $from$    v_local := now() AT TIME ZONE 'Asia/Riyadh';$from$,
  $to$    -- A reminder due within 15 minutes of the visit (or after it began) is no longer useful: close it instead of sending it late.
    IF left(v_msg.template_name, 9) = 'reminder_' AND v_msg.booking_id IS NOT NULL THEN
      SELECT scheduled_at INTO v_visit_start FROM public.bookings WHERE id = v_msg.booking_id;
      IF v_visit_start IS NOT NULL AND v_visit_start <= now() + interval '15 minutes' THEN
        UPDATE public.message_queue
        SET status = 'expired', error_message = 'The visit starts within 15 minutes or has begun', updated_at = now()
        WHERE id = v_msg.id;
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
    END IF;

    v_local := now() AT TIME ZONE 'Asia/Riyadh';$to$);

SELECT pg_temp.patch_function('public.claim_message_batch(integer)'::regprocedure,
  $from$    IF NOT v_tpl.is_transactional AND (v_local::time$from$,
  $to$    IF NOT v_tpl.is_transactional AND v_msg.template_name <> 'reminder_2h' AND (v_local::time$to$);
