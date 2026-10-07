-- Two tax invoices of one provider can no longer both chain from the same predecessor.
--
-- Review finding R30. generate_zatca_tax_invoice read the provider's latest invoice hash and inserted the new invoice without
-- any lock, ordering by created_at (the transaction start time). Two invoices issued at the same moment both chained from the
-- same predecessor (a fork), and a transaction that started earlier but committed later could be ordered before the one it
-- followed. The chain is now serialised per provider with an advisory transaction lock, and each invoice is stamped with the
-- real time it was written, so the order by time is the order of the chain.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n'); -- a checkout with Windows line endings stores them in function bodies
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n'); -- the migration file itself may have been checked out with CRLF
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

SELECT pg_temp.patch_function('public.generate_zatca_tax_invoice(uuid)'::regprocedure,
  $from$  SELECT invoice_hash INTO v_prev FROM public.invoices WHERE provider_id = v_provider.id ORDER BY created_at DESC LIMIT 1;$from$,
  $to$  PERFORM pg_advisory_xact_lock(hashtext('zatca-invoice-chain:' || v_provider.id::text));
  SELECT invoice_hash INTO v_prev FROM public.invoices WHERE provider_id = v_provider.id ORDER BY created_at DESC, id DESC LIMIT 1;$to$);

SELECT pg_temp.patch_function('public.generate_zatca_tax_invoice(uuid)'::regprocedure,
  $from$    invoice_hash, zatca_qr_code, zatca_status)$from$,
  $to$    invoice_hash, zatca_qr_code, zatca_status, created_at)$to$);

SELECT pg_temp.patch_function('public.generate_zatca_tax_invoice(uuid)'::regprocedure,
  $from$v_prev, v_hash, v_qr, 'not_submitted')$from$,
  $to$v_prev, v_hash, v_qr, 'not_submitted', clock_timestamp())$to$);
