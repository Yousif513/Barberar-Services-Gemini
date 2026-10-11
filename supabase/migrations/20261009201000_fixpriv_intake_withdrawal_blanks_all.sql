-- P-01 (privacy review 2026-10-08): when a customer withdrew health-data consent only answers of FUTURE appointments were blanked; the owner could still open
-- the answers of past and completed bookings for ever (probed: a 40-day-old completed booking), and retention is unset and unscheduled.
--
-- Withdrawal now removes ALL of the customer's intake answers, at every provider and for every appointment, past or future. What stays is the non-sensitive
-- tombstone on intake_submissions: which form version was filled in, when it was submitted (submitted_at), and the consent row it was submitted under
-- (consent_id); its status becomes 'withdrawn' with the removal time and reason. read_booking_intake_answers also refuses to return answers while the
-- latest health_data consent is not granted, as a second lock if a row ever survives. Nothing is returned to the salon but the status.
--
-- Owner / legal decision (not made here): whether a salon must be able to keep a pre-treatment questionnaire for a fixed period after treatment (for an
-- allergic-reaction or liability claim) even after the customer withdraws consent. Technically that would be a documented legal-hold exception with its
-- own retention period and an administrator-only read; until legal says so, withdrawal erases.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n'); -- a checkout with Windows line endings stores them in function bodies
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n'); -- the migration file itself may have been checked out with CRLF
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

SELECT pg_temp.patch_function('public.blank_intake_on_consent_withdrawal()'::regprocedure,
$from$ WHERE s.customer_id = NEW.user_id AND s.status = 'submitted' AND b.scheduled_at > now();$from$,
$to$ WHERE s.customer_id = NEW.user_id AND s.status = 'submitted';$to$);

SELECT pg_temp.patch_function('public.blank_intake_on_consent_withdrawal()'::regprocedure,
$from$  END IF;
  RETURN NEW;
END$from$,
$to$  END IF;
  DELETE FROM public.intake_answers WHERE customer_id = NEW.user_id;
  RETURN NEW;
END$to$);

SELECT pg_temp.patch_function('public.read_booking_intake_answers(uuid)'::regprocedure,
$from$  IF s.status <> 'submitted' THEN$from$,
$to$  IF s.status = 'submitted' AND NOT COALESCE((SELECT c.status = 'granted' FROM public.consents c
                                                 WHERE c.user_id = b.customer_id AND c.purpose = 'health_data'
                                                 ORDER BY c.created_at DESC, c.id DESC LIMIT 1), FALSE) THEN
    RETURN jsonb_build_object('booking_id', p_booking_id, 'status', 'withdrawn', 'answers', NULL, 'removed_at', s.answers_removed_at);
  END IF;
  IF s.status <> 'submitted' THEN$to$);

-- Submissions already left readable by the old rule (withdrawn consent, answers still stored) are cleaned up once, now.
DO $cleanup$
DECLARE v_ids UUID[];
BEGIN
  SELECT array_agg(s.id) INTO v_ids
    FROM public.intake_submissions s
   WHERE s.status = 'submitted'
     AND NOT COALESCE((SELECT c.status = 'granted' FROM public.consents c
                        WHERE c.user_id = s.customer_id AND c.purpose = 'health_data'
                        ORDER BY c.created_at DESC, c.id DESC LIMIT 1), FALSE);
  IF v_ids IS NOT NULL THEN
    DELETE FROM public.intake_answers WHERE submission_id = ANY (v_ids);
    UPDATE public.intake_submissions SET status = 'withdrawn', answers_removed_at = now(), removal_reason = 'consent_withdrawn', updated_at = now()
     WHERE id = ANY (v_ids);
  END IF;
END $cleanup$;
