-- Migration: 20260614010000_expo_push_tokens.sql
-- Description: Add expo_push_token to profiles to support push notifications

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS expo_push_token VARCHAR(255);

-- Enable RLS updates for own profile token
CREATE POLICY "Users can update their own expo_push_token"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
