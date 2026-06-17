-- Add an optional gender to profiles so the app can personalize service
-- recommendations and imagery (male vs female experiences).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender TEXT
  CHECK (gender IN ('male', 'female'));

-- The hardening migration revoked blanket UPDATE on profiles and re-granted it
-- column-by-column. Extend that grant so users can set their own gender
-- (row ownership is still enforced by the "Users update own profile" policy).
GRANT UPDATE (gender) ON public.profiles TO authenticated;
