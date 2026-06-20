-- Provider payout requests capture withdrawal intents before an admin releases
-- the matching ledger funds. The ledger remains the source of payment truth.

CREATE TABLE public.payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    bank_name TEXT NOT NULL,
    iban TEXT NOT NULL CHECK (iban ~ '^SA[0-9A-Z]{22}$'),
    status VARCHAR(32) NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'processing', 'paid', 'rejected')),
    admin_note TEXT,
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_payout_requests_provider_requested_at
ON public.payout_requests (provider_id, requested_at DESC);

CREATE INDEX idx_payout_requests_status
ON public.payout_requests (status);

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers create own payout requests"
ON public.payout_requests
FOR INSERT
TO authenticated
WITH CHECK (
    requested_by = (SELECT auth.uid())
    AND EXISTS (
        SELECT 1
        FROM public.providers p
        WHERE p.id = payout_requests.provider_id
          AND p.owner_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Providers read own payout requests"
ON public.payout_requests
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.providers p
        WHERE p.id = payout_requests.provider_id
          AND p.owner_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Admins manage payout requests"
ON public.payout_requests
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payout_requests TO authenticated;
