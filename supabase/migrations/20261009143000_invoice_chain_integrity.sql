-- M-16 and P-15 of docs/reviews (2026-10-08-security-money.md and 2026-10-08-security-privacy.md).
--
-- M-16. generate_zatca_tax_invoice looked for an existing invoice of the booking BEFORE it took the per-provider advisory lock and never looked
-- again, and nothing in the table stopped a second row: two near-simultaneous calls (customer, provider and administrator may all call it) produced
-- two chained tax invoices for one supply. The lock is now taken first (the check and the insert are one critical section) and a unique index
-- on booking_id makes a second invoice for a booking impossible whatever the code does.
--
-- P-15. The "previous invoice" of the chain was found with ORDER BY created_at DESC, id DESC; two invoices with the same timestamp tie-break on a
-- random uuid, so the chain order was not deterministic (one flaky run in nine under load). Each invoice now carries a per-provider counter
-- (chain_seq), assigned under the same lock, and the chain follows it. Existing invoices are numbered once, in their historic order.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS chain_seq BIGINT;

-- Number the existing invoices once (an issued invoice is append-only, so the guard is lifted for this one statement only).
ALTER TABLE public.invoices DISABLE TRIGGER trg_protect_issued_invoice;
UPDATE public.invoices i SET chain_seq = n.seq
FROM (SELECT id, row_number() OVER (PARTITION BY provider_id ORDER BY created_at, id) AS seq FROM public.invoices) n
WHERE n.id = i.id AND i.chain_seq IS NULL;
ALTER TABLE public.invoices ENABLE TRIGGER trg_protect_issued_invoice;

CREATE OR REPLACE FUNCTION public.invoice_assign_chain_seq() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NEW.chain_seq IS NULL THEN
    SELECT COALESCE(MAX(i.chain_seq), 0) + 1 INTO NEW.chain_seq FROM public.invoices i WHERE i.provider_id = NEW.provider_id;
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_invoice_assign_chain_seq ON public.invoices;
CREATE TRIGGER trg_invoice_assign_chain_seq BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.invoice_assign_chain_seq();

ALTER TABLE public.invoices ALTER COLUMN chain_seq SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_provider_chain_seq ON public.invoices (provider_id, chain_seq);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_one_per_booking ON public.invoices (booking_id) WHERE booking_id IS NOT NULL;

-- M-16: the lock first, then the existence check
SELECT pg_temp.patch_function('public.generate_zatca_tax_invoice(uuid)'::regprocedure,
$from$  SELECT * INTO v_existing FROM public.invoices WHERE booking_id = p_booking_id;$from$,
$to$  PERFORM pg_advisory_xact_lock(hashtext('zatca-invoice-chain:' || (SELECT br.provider_id::text FROM public.branches br WHERE br.id = v_booking.branch_id)));
  SELECT * INTO v_existing FROM public.invoices WHERE booking_id = p_booking_id;$to$);

-- P-15: the chain follows the counter
SELECT pg_temp.patch_function('public.generate_zatca_tax_invoice(uuid)'::regprocedure,
$from$ORDER BY created_at DESC, id DESC LIMIT 1;$from$,
$to$ORDER BY chain_seq DESC LIMIT 1;$to$);
