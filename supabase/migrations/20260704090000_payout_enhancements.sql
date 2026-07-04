-- Migration to add payout tracking columns and ZATCA invoice trigger
-- Date: 2026-07-04

-- 1. Add fields to public.payout_requests if they do not exist
ALTER TABLE public.payout_requests
ADD COLUMN IF NOT EXISTS bank_reference TEXT,
ADD COLUMN IF NOT EXISTS processed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Add link to payout_requests on transactional_ledger if it does not exist
ALTER TABLE public.transactional_ledger
ADD COLUMN IF NOT EXISTS payout_request_id UUID REFERENCES public.payout_requests(id) ON DELETE SET NULL;

-- 3. Add invoice_number to bookings if it does not exist
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS invoice_number BIGINT;

-- Create sequence for ZATCA-ready invoice numbers starting at 10000
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 10000;

-- Function to auto-assign sequential invoice_number when booking status changes to 'completed'
CREATE OR REPLACE FUNCTION public.assign_booking_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') AND NEW.invoice_number IS NULL THEN
        NEW.invoice_number := nextval('public.invoice_number_seq');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-assign invoice number on update
CREATE OR REPLACE TRIGGER tr_assign_booking_invoice_number
BEFORE UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.assign_booking_invoice_number();
