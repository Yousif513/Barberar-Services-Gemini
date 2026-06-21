-- Admin dashboard controls: branch operational state and platform coupons.
-- Branches already have RLS/policies; this adds the state that the admin UI toggles.
ALTER TABLE public.branches
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS public.promotional_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'flat')),
  discount_value DECIMAL(10,2) NOT NULL CHECK (discount_value > 0),
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redeemed_count INTEGER NOT NULL DEFAULT 0 CHECK (redeemed_count >= 0),
  starts_at TIMESTAMP WITH TIME ZONE,
  ends_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT promotional_codes_valid_window
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_promotional_codes_active
ON public.promotional_codes (is_active, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_promotional_codes_code
ON public.promotional_codes (code);

ALTER TABLE public.promotional_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage promotional codes"
ON public.promotional_codes
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated users read currently active promotional codes"
ON public.promotional_codes
FOR SELECT
TO authenticated
USING (
  is_active = TRUE
  AND (starts_at IS NULL OR starts_at <= NOW())
  AND (ends_at IS NULL OR ends_at >= NOW())
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotional_codes TO authenticated;

CREATE TABLE IF NOT EXISTS public.payment_refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES public.transactional_ledger(id) ON DELETE RESTRICT,
  payment_intent_id TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'rejected', 'processed')),
  admin_note TEXT,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (ledger_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_refund_requests_status
ON public.payment_refund_requests (status, requested_at DESC);

ALTER TABLE public.payment_refund_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage payment refund requests"
ON public.payment_refund_requests
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_refund_requests TO authenticated;
