-- FINAL-2: review M5 / N1 and N4 (docs/reviews/2026-10-11-security-priv-recheck.md).
--   N1  After a hold is released, nothing in privacy_erasure_runs, privacy_requests.completion_summary, the pending completion
--       notice or the hold's own approval ties the erased person to the records the hold kept (Q2.3: the pseudonym must be
--       irreversible). The runs that finish held records carry no subject, no request, no booking and no hold id; the "held"
--       entries of every summary lose their reference (a dispute reference resolves to the booking); the hold forgets its booking,
--       dispute and approval links; the hold approval's summary loses the subject. The row-level console audit is not itemised for
--       these unlinking writes (it would copy the subject next to the hold id), as the engine already does for its own writes.
--       A hold proposal is audited by an explicit entry without the subject or the booking for the same reason.
--   N4  Staff notes on the erased person's requests are erased with the account; a note added afterwards is stored redacted, and
--       the audit log records a note's length, never its text.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- N1
-- ---------------------------------------------------------------------------------------------------------------------
-- A run that finishes held records belongs to no one.
ALTER TABLE public.privacy_erasure_runs ALTER COLUMN subject_id DROP NOT NULL;
-- A released hold of an erased subject no longer names the disputed booking.
ALTER TABLE public.privacy_legal_holds DROP CONSTRAINT IF EXISTS privacy_legal_holds_check;
ALTER TABLE public.privacy_legal_holds ADD CONSTRAINT privacy_legal_holds_check CHECK (
  basis <> 'payment_dispute'
  OR ((booking_id IS NOT NULL OR (status = 'released' AND subject_id IS NULL)) AND categories <@ ARRAY['messages', 'bookings']));

-- The "held" entries of a summary without the reference of the given hold (or of every hold that is no longer active when
-- p_reference is NULL). The entry keeps its basis and categories and says it was released.
CREATE OR REPLACE FUNCTION public.privacy_strip_held_reference(p_summary JSONB, p_reference TEXT) RETURNS JSONB
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_summary IS NULL OR jsonb_typeof(p_summary->'held') IS DISTINCT FROM 'array' THEN p_summary
    ELSE jsonb_set(p_summary, '{held}', COALESCE((
      SELECT jsonb_agg(CASE WHEN e->>'reference' IS NOT NULL AND (p_reference IS NULL OR e->>'reference' = p_reference)
                            THEN (e - 'reference' - 'review_due_at') || jsonb_build_object('released', TRUE)
                            ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(p_summary->'held') WITH ORDINALITY AS x(e, ord)), '[]'::jsonb))
  END;
$$;
REVOKE ALL ON FUNCTION public.privacy_strip_held_reference(JSONB, TEXT) FROM PUBLIC, anon, authenticated;

-- Everything that still pairs an erased subject with a released hold's reference.
CREATE OR REPLACE FUNCTION public.privacy_forget_hold_reference(p_subject UUID, p_reference TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_subject IS NULL OR p_reference IS NULL THEN RETURN; END IF;
  UPDATE public.privacy_erasure_runs SET summary = public.privacy_strip_held_reference(summary, p_reference)
   WHERE subject_id = p_subject AND summary->'held' @> jsonb_build_array(jsonb_build_object('reference', p_reference));
  UPDATE public.privacy_requests SET completion_summary = public.privacy_strip_held_reference(completion_summary, p_reference)
   WHERE subject_id = p_subject AND completion_summary->'held' @> jsonb_build_array(jsonb_build_object('reference', p_reference));
  UPDATE public.governance_notifications SET payload = public.privacy_strip_held_reference(payload, p_reference)
   WHERE recipient_user_id = p_subject AND template_key = 'privacy_deletion_completed'
     AND payload->'held' @> jsonb_build_array(jsonb_build_object('reference', p_reference));
  -- The deletion approval keeps the engine's summary as its execution result.
  UPDATE public.admin_approval_requests a
     SET execution_result = jsonb_set(a.execution_result, '{summary}', public.privacy_strip_held_reference(a.execution_result->'summary', p_reference))
   WHERE a.kind = 'privacy_deletion' AND a.target_id IN (SELECT q.id FROM public.privacy_requests q WHERE q.subject_id = p_subject)
     AND a.execution_result->'summary'->'held' @> jsonb_build_array(jsonb_build_object('reference', p_reference));
END $$;
REVOKE ALL ON FUNCTION public.privacy_forget_hold_reference(UUID, TEXT) FROM PUBLIC, anon, authenticated;

SELECT pg_temp.patch_function('public.privacy_finish_held_booking(public.privacy_legal_holds)'::regprocedure,
$from$  VALUES (h.subject_id, NULL, 'hold_release', txid_current(), auth.uid()) RETURNING id INTO v_run;$from$,
$to$  VALUES (NULL, NULL, 'hold_release', txid_current(), auth.uid()) RETURNING id INTO v_run;$to$);
SELECT pg_temp.patch_function('public.privacy_finish_held_booking(public.privacy_legal_holds)'::regprocedure,
$from$summary = jsonb_build_object('booking_id', h.booking_id, 'threads', v_n)$from$,
$to$summary = jsonb_build_object('basis', 'payment_dispute', 'threads', v_n)$to$);
SELECT pg_temp.patch_function('public.privacy_finish_held_booking(public.privacy_legal_holds)'::regprocedure,
$from$  RETURN jsonb_build_object('booking_id', h.booking_id, 'threads_tombstoned', v_n);$from$,
$to$  RETURN jsonb_build_object('threads_tombstoned', v_n);$to$);

SELECT pg_temp.patch_function('public.privacy_finish_court_hold(public.privacy_legal_holds,public.deletion_ledger)'::regprocedure,
$from$  VALUES (h.subject_id, l.request_id, 'hold_release', txid_current(), auth.uid()) RETURNING id INTO v_run;$from$,
$to$  VALUES (NULL, NULL, 'hold_release', txid_current(), auth.uid()) RETURNING id INTO v_run;$to$);
SELECT pg_temp.patch_function('public.privacy_finish_court_hold(public.privacy_legal_holds,public.deletion_ledger)'::regprocedure,
$from$         summary = jsonb_build_object('hold_id', h.id, 'threads', v_threads,$from$,
$to$         summary = jsonb_build_object('basis', 'court_case', 'threads', v_threads,$to$);

CREATE OR REPLACE FUNCTION public.privacy_release_hold_internal(p_hold_id UUID, p_reason TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  h public.privacy_legal_holds;
  l public.deletion_ledger;
  v_summary JSONB;
BEGIN
  UPDATE public.privacy_legal_holds SET status = 'released', released_at = now(), released_by = auth.uid(), release_reason = p_reason
   WHERE id = p_hold_id AND status = 'active' RETURNING * INTO h;
  IF h.id IS NULL THEN RAISE EXCEPTION 'Active hold not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.write_audit_log('privacy.legal_hold_released', 'privacy_legal_holds', h.id, jsonb_build_object('reason', p_reason));
  SELECT * INTO l FROM public.deletion_ledger WHERE subject_id = h.subject_id;
  IF l.subject_id IS NOT NULL THEN
    IF h.basis = 'payment_dispute' THEN
      v_summary := public.privacy_finish_held_booking(h);
    ELSIF l.account_held THEN
      -- The account was kept: once no active court hold names it, the engine erases it (the worker then deletes the login).
      IF NOT EXISTS (SELECT 1 FROM public.privacy_legal_holds WHERE subject_id = h.subject_id AND status = 'active' AND basis = 'court_case'
                       AND 'account' = ANY (categories)) THEN
        v_summary := public.privacy_erase_subject_internal(h.subject_id, l.request_id, l.review_choice, 'hold_release');
      END IF;
    ELSE
      v_summary := public.privacy_finish_court_hold(h, l);
    END IF;
    -- N1: the unlinking writes are not itemised in the row-level console log (it would pair the subject with the hold id).
    PERFORM set_config('primora.audit_rows_saved', COALESCE(NULLIF(current_setting('primora.audit_rows', true), ''), '0'), true);
    PERFORM set_config('primora.audit_rows', '1000000', true);
    PERFORM public.privacy_forget_hold_reference(h.subject_id, h.case_reference);
    UPDATE public.admin_approval_requests SET summary = summary - 'subject_id'
     WHERE kind = 'privacy_legal_hold' AND target_id = h.id AND summary ? 'subject_id';
    UPDATE public.privacy_legal_holds SET pseudonym_token = NULL, subject_id = NULL, held_conversation_ids = NULL,
           booking_id = NULL, dispute_id = NULL, approval_request_id = NULL,
           case_reference = CASE WHEN basis = 'payment_dispute' THEN 'payment_dispute' ELSE case_reference END
     WHERE id = h.id;
    PERFORM set_config('primora.audit_rows', current_setting('primora.audit_rows_saved', true), true);
  ELSE
    UPDATE public.privacy_legal_holds SET pseudonym_token = NULL WHERE id = h.id;
  END IF;
  RETURN jsonb_build_object('hold_id', h.id, 'status', 'released', 'erasure', v_summary);
END $$;
REVOKE ALL ON FUNCTION public.privacy_release_hold_internal(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- A hold proposal: the row-level log would copy the subject and the booking into the append-only audit log, where a later
-- release could not remove them. The proposal is audited by its own entry (hold id, basis, categories); the approval request
-- names the subject until the hold ends.
SELECT pg_temp.patch_function('public.admin_privacy_propose_legal_hold(uuid,text,text,text[],uuid,text,text)'::regprocedure,
$from$  INSERT INTO public.privacy_legal_holds (subject_id, basis, case_reference, booking_id, dispute_id, categories, reason, account_reason, created_by)
  VALUES (p_subject_id, p_basis, v_ref, CASE WHEN p_basis = 'payment_dispute' THEN p_booking_id END, v_dispute, v_categories, v_reason,
          v_account_reason, auth.uid())
  RETURNING id INTO v_id;$from$,
$to$  PERFORM set_config('primora.audit_rows_saved', COALESCE(NULLIF(current_setting('primora.audit_rows', true), ''), '0'), true);
  PERFORM set_config('primora.audit_rows', '1000000', true);
  INSERT INTO public.privacy_legal_holds (subject_id, basis, case_reference, booking_id, dispute_id, categories, reason, account_reason, created_by)
  VALUES (p_subject_id, p_basis, v_ref, CASE WHEN p_basis = 'payment_dispute' THEN p_booking_id END, v_dispute, v_categories, v_reason,
          v_account_reason, auth.uid())
  RETURNING id INTO v_id;
  PERFORM set_config('primora.audit_rows', current_setting('primora.audit_rows_saved', true), true);
  PERFORM public.write_audit_log('privacy.legal_hold_proposed', 'privacy_legal_holds', v_id,
    jsonb_build_object('basis', p_basis, 'categories', to_jsonb(v_categories)));$to$);

-- Rows written before this migration: runs that finished held records forget their subject, request, booking and hold; every
-- summary and pending notice loses the references of holds that are no longer active; released holds of erased subjects forget
-- their booking, dispute and approval links.
UPDATE public.privacy_erasure_runs SET subject_id = NULL, request_id = NULL,
       summary = (summary - 'booking_id' - 'hold_id') || jsonb_build_object('basis', CASE WHEN summary ? 'booking_id' THEN 'payment_dispute' ELSE 'court_case' END)
 WHERE mode = 'hold_release' AND (summary ? 'booking_id' OR summary ? 'hold_id');
DO $old$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT case_reference FROM public.privacy_legal_holds WHERE status IN ('released', 'rejected', 'withdrawn') AND subject_id IS NULL
            AND case_reference IS NOT NULL LOOP
    UPDATE public.privacy_erasure_runs SET summary = public.privacy_strip_held_reference(summary, r.case_reference)
     WHERE summary->'held' @> jsonb_build_array(jsonb_build_object('reference', r.case_reference));
    UPDATE public.privacy_requests SET completion_summary = public.privacy_strip_held_reference(completion_summary, r.case_reference)
     WHERE completion_summary->'held' @> jsonb_build_array(jsonb_build_object('reference', r.case_reference));
    UPDATE public.governance_notifications SET payload = public.privacy_strip_held_reference(payload, r.case_reference)
     WHERE template_key = 'privacy_deletion_completed' AND payload->'held' @> jsonb_build_array(jsonb_build_object('reference', r.case_reference));
    UPDATE public.admin_approval_requests a
       SET execution_result = jsonb_set(a.execution_result, '{summary}', public.privacy_strip_held_reference(a.execution_result->'summary', r.case_reference))
     WHERE a.kind = 'privacy_deletion'
       AND a.execution_result->'summary'->'held' @> jsonb_build_array(jsonb_build_object('reference', r.case_reference));
  END LOOP;
  UPDATE public.admin_approval_requests a SET summary = a.summary - 'subject_id'
    FROM public.privacy_legal_holds h
   WHERE a.kind = 'privacy_legal_hold' AND a.target_id = h.id AND h.subject_id IS NULL AND h.status = 'released' AND a.summary ? 'subject_id';
  UPDATE public.privacy_legal_holds SET booking_id = NULL, dispute_id = NULL, approval_request_id = NULL,
         case_reference = CASE WHEN basis = 'payment_dispute' THEN 'payment_dispute' ELSE case_reference END
   WHERE status = 'released' AND subject_id IS NULL AND (booking_id IS NOT NULL OR dispute_id IS NOT NULL OR approval_request_id IS NOT NULL);
END $old$;

-- ---------------------------------------------------------------------------------------------------------------------
-- N4
-- ---------------------------------------------------------------------------------------------------------------------
SELECT pg_temp.patch_function('public.gov_exec_privacy_deletion(public.admin_approval_requests)'::regprocedure,
$from$  UPDATE public.privacy_requests SET correction_value = NULL, details = NULL, updated_at = now()
   WHERE subject_id = r.subject_id AND (correction_value IS NOT NULL OR details IS NOT NULL);$from$,
$to$  -- N4: staff notes are free text about the person (a phone number, what they said); they go with the account.
  UPDATE public.privacy_requests SET correction_value = NULL, details = NULL, staff_notes = NULL, updated_at = now()
   WHERE subject_id = r.subject_id AND (correction_value IS NOT NULL OR details IS NOT NULL OR staff_notes IS NOT NULL);$to$);
SELECT pg_temp.patch_function('public.gov_exec_privacy_deletion(public.admin_approval_requests)'::regprocedure,
$from$         details = NULL, correction_value = NULL, updated_at = now()
   WHERE id = r.id RETURNING * INTO r;$from$,
$to$         details = NULL, correction_value = NULL, staff_notes = NULL, updated_at = now()
   WHERE id = r.id RETURNING * INTO r;$to$);

-- N1: the approval's execution result (and the approval.approved audit entry that copies it) never carries a hold reference;
-- only the customer's own completion summary names what is held, until the hold ends.
CREATE OR REPLACE FUNCTION public.privacy_summary_without_references(p_summary JSONB) RETURNS JSONB
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_summary IS NULL OR jsonb_typeof(p_summary->'held') IS DISTINCT FROM 'array' THEN p_summary
    ELSE jsonb_set(p_summary, '{held}', COALESCE((SELECT jsonb_agg(e - 'reference' ORDER BY ord)
                                                    FROM jsonb_array_elements(p_summary->'held') WITH ORDINALITY AS x(e, ord)), '[]'::jsonb))
  END;
$$;
REVOKE ALL ON FUNCTION public.privacy_summary_without_references(JSONB) FROM PUBLIC, anon, authenticated;
SELECT pg_temp.patch_function('public.gov_exec_privacy_deletion(public.admin_approval_requests)'::regprocedure,
$from$                            'summary', v_summary);$from$,
$to$                            'summary', public.privacy_summary_without_references(v_summary));$to$);

SELECT pg_temp.patch_function('public.admin_privacy_add_note(uuid,text)'::regprocedure,
$from$  UPDATE public.privacy_requests SET staff_notes = left(concat_ws(E'\n', staff_notes, to_char(now() AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || ' ' || v_note), 4000),$from$,
$to$  -- N4: once the person is erased, a later note keeps no e-mail address or number.
  IF EXISTS (SELECT 1 FROM public.privacy_requests q JOIN public.deletion_ledger l ON l.subject_id = q.subject_id WHERE q.id = p_request_id) THEN
    v_note := public.privacy_redact_text(v_note);
  END IF;
  UPDATE public.privacy_requests SET staff_notes = left(concat_ws(E'\n', staff_notes, to_char(now() AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || ' ' || v_note), 4000),$to$);
SELECT pg_temp.patch_function('public.admin_privacy_add_note(uuid,text)'::regprocedure,
$from$jsonb_build_object('note', v_note)$from$,
$to$jsonb_build_object('note_length', char_length(v_note))$to$);
