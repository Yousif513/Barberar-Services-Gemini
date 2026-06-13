-- Migration: 20260613040000_home_services.sql
-- Description: Implement on-demand job posts, bidding, and dynamic dispatch structures for home services.

-- 1. CUSTOMER JOB POSTINGS (Request for Bids)
CREATE TABLE public.job_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    address_text TEXT NOT NULL,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    target_date TIMESTAMP WITH TIME ZONE NOT NULL,
    budget_max DECIMAL(10,2),
    status VARCHAR(50) DEFAULT 'open', -- open, assigned, completed, cancelled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. PROVIDER BIDS FOR JOBS
CREATE TABLE public.job_bids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_post_id UUID NOT NULL REFERENCES public.job_posts(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    bid_price DECIMAL(10,2) NOT NULL,
    proposal_notes TEXT,
    status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, rejected
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (job_post_id, provider_id)
);

-- Enable RLS
ALTER TABLE public.job_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_bids ENABLE ROW LEVEL SECURITY;

-- 3. RLS POLICIES FOR JOB POSTS
CREATE POLICY "Customers manage own job posts" ON public.job_posts
  FOR ALL USING (customer_id = auth.uid());

CREATE POLICY "Providers select open job posts" ON public.job_posts
  FOR SELECT USING (
    status = 'open' AND EXISTS (
      -- Verify user is a provider or employee
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('provider_owner', 'provider_employee')
    )
  );

-- 4. RLS POLICIES FOR JOB BIDS
CREATE POLICY "Providers manage own bids" ON public.job_bids
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.providers
      WHERE providers.id = job_bids.provider_id AND providers.owner_id = auth.uid()
    )
  );

CREATE POLICY "Customers view bids for own posts" ON public.job_bids
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.job_posts
      WHERE job_posts.id = job_bids.job_post_id AND job_posts.customer_id = auth.uid()
    )
  );
  
-- 5. PERFORMANCE INDEXES
CREATE INDEX idx_job_posts_coords ON public.job_posts (latitude, longitude);
CREATE INDEX idx_job_bids_post ON public.job_bids (job_post_id);
