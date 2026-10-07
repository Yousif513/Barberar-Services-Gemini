-- C-D3b + C-D24: the integrations registry never stores a credential, and the payment-method view obeys the caller's rights.
--
-- C-D3b: integrations.api_key held live provider secrets in clear text, readable by every administrator and shipped to the browser by
--        select("*"); no function reads it (Edge Functions take TAP_SECRET_KEY and friends from their environment). The column is
--        dropped. key_masked stays as an identification hint only, written from the last four characters of what was stored, and a
--        CHECK now guarantees nothing longer than a hint can be put there.
-- C-D24: accepted_payment_methods was created without security_invoker (it ran as its owner and showed gateway status and the
--        integration registry to anonymous visitors) and nothing reads it: checkout always creates a Tap charge. The view is now
--        security_invoker and is no longer readable by anonymous visitors; routing checkout by gateway_key is a product decision
--        recorded in the report.

-- Turn what was stored into a hint before the column goes away: bullets plus the last four letters or digits.
UPDATE public.integrations
   SET key_masked = repeat('•', 4) || right(regexp_replace(COALESCE(NULLIF(api_key, ''), key_masked, ''), '[^A-Za-z0-9]', '', 'g'), 4)
 WHERE api_key IS NOT NULL OR key_masked IS NOT NULL;
UPDATE public.integrations SET key_masked = NULL WHERE key_masked = repeat('•', 4);

ALTER TABLE public.integrations DROP COLUMN IF EXISTS api_key;

ALTER TABLE public.integrations DROP CONSTRAINT IF EXISTS integrations_key_masked_is_a_hint;
ALTER TABLE public.integrations ADD CONSTRAINT integrations_key_masked_is_a_hint
  CHECK (key_masked IS NULL OR key_masked ~ '^[*•]{0,12}[A-Za-z0-9]{0,4}$');
COMMENT ON COLUMN public.integrations.key_masked IS
  'Identification hint only (bullets and the last four characters). The credential itself is an Edge Function secret and is never stored here.';

ALTER VIEW public.accepted_payment_methods SET (security_invoker = true);
REVOKE ALL ON public.accepted_payment_methods FROM anon;
