-- Migration: 20260613050000_full_marketplace.sql
-- Description: Implement database structures for Phase 4 (Full Service Marketplace) supporting Medical Home Care, Pet Care, Deliveries, and Developer API webhooks.

-- Cleanup pre-existing tables from any previous partial execution to ensure clean run
DROP TABLE IF EXISTS public.webhook_subscriptions CASCADE;
DROP TABLE IF EXISTS public.api_tokens CASCADE;
DROP TABLE IF EXISTS public.developer_profiles CASCADE;
DROP TABLE IF EXISTS public.delivery_jobs CASCADE;
DROP TABLE IF EXISTS public.client_profiles CASCADE;

-- 1. DEPENDENTS / CLIENT PROFILES (For Medical Home Care patients, Pet Care pets, etc.)
CREATE TABLE public.client_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL, -- e.g., 'patient', 'pet', 'dependent'
    dob DATE,
    medical_info TEXT,
    gender VARCHAR(10),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. LINK BOOKINGS TO SPECIFIC DEPENDENT / CLIENT PROFILES
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS client_profile_id UUID REFERENCES public.client_profiles(id) ON DELETE SET NULL;

-- 3. LOGISTICS / DELIVERY JOBS
CREATE TABLE public.delivery_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    pickup_address TEXT NOT NULL,
    delivery_address TEXT NOT NULL,
    pickup_latitude DECIMAL(9,6) NOT NULL,
    pickup_longitude DECIMAL(9,6) NOT NULL,
    delivery_latitude DECIMAL(9,6) NOT NULL,
    delivery_longitude DECIMAL(9,6) NOT NULL,
    carrier_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- The driver/courier
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, accepted, in_transit, delivered, cancelled
    estimated_delivery_time TIMESTAMP WITH TIME ZONE,
    delivery_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. DEVELOPER PROFILES (For third-party developer integrations)
CREATE TABLE public.developer_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    app_name VARCHAR(100) NOT NULL,
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. API TOKENS (For developer auth credentials)
CREATE TABLE public.api_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_profile_id UUID NOT NULL REFERENCES public.developer_profiles(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    scopes TEXT[] NOT NULL DEFAULT '{}'::text[],
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, revoked
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. WEBHOOK SUBSCRIPTIONS (For event-driven integrations)
CREATE TABLE public.webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_profile_id UUID NOT NULL REFERENCES public.developer_profiles(id) ON DELETE CASCADE,
    target_url TEXT NOT NULL,
    event_types TEXT[] NOT NULL DEFAULT '{}'::text[], -- e.g. {'booking.created', 'booking.completed'}
    secret_key VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE public.client_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;

-- 7. RLS POLICIES

-- Client Profiles
CREATE POLICY "Clients manage own dependent profiles" ON public.client_profiles
    FOR ALL USING (client_id = auth.uid());

-- Delivery Jobs
CREATE POLICY "Authorized roles view delivery job" ON public.delivery_jobs
    FOR SELECT USING (
        carrier_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.bookings b
            WHERE b.id = delivery_jobs.booking_id AND b.customer_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM public.bookings b
            JOIN public.branches br ON b.branch_id = br.id
            JOIN public.providers p ON br.provider_id = p.id
            WHERE b.id = delivery_jobs.booking_id AND p.owner_id = auth.uid()
        )
    );

CREATE POLICY "Carriers manage assigned delivery jobs" ON public.delivery_jobs
    FOR ALL USING (carrier_id = auth.uid());

-- Developer Profiles
CREATE POLICY "Developers manage own profile" ON public.developer_profiles
    FOR ALL USING (developer_id = auth.uid());

-- API Tokens
CREATE POLICY "Developers manage own API tokens" ON public.api_tokens
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.developer_profiles dp
            WHERE dp.id = api_tokens.developer_profile_id AND dp.developer_id = auth.uid()
        )
    );

-- Webhook Subscriptions
CREATE POLICY "Developers manage own webhook subscriptions" ON public.webhook_subscriptions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.developer_profiles dp
            WHERE dp.id = webhook_subscriptions.developer_profile_id AND dp.developer_id = auth.uid()
        )
    );

-- 8. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_client_profiles_client ON public.client_profiles (client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_client_profile ON public.bookings (client_profile_id);
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_booking ON public.delivery_jobs (booking_id);
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_carrier ON public.delivery_jobs (carrier_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON public.api_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_api_tokens_dev ON public.api_tokens (developer_profile_id);
CREATE INDEX IF NOT EXISTS idx_webhook_subs_dev ON public.webhook_subscriptions (developer_profile_id);
