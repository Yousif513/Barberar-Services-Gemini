-- Migration: 20260613010000_triggers_rls.sql
-- Description: Create auth sync triggers and Row-Level Security (RLS) policies.

-- 1. AUTH TRIGGER FOR AUTO-PROFILING
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, first_name, last_name, email, phone_number, language_preference)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'customer'::user_role),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email,
    COALESCE(NEW.phone, '+9665' || floor(random() * 900000000 + 100000000)::text), -- Fallback phone for testing
    COALESCE(NEW.raw_user_meta_data->>'language_preference', 'ar')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger to auth.users table
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 2. ENABLE ROW-LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactional_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;


-- 3. RLS POLICIES

-- profiles
CREATE POLICY "Public read on profiles" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- providers
CREATE POLICY "Public read on verified providers" ON public.providers
  FOR SELECT USING (is_verified = true OR owner_id = auth.uid());

CREATE POLICY "Owners manage own providers" ON public.providers
  FOR ALL USING (owner_id = auth.uid());

-- branches
CREATE POLICY "Public read on branches" ON public.branches
  FOR SELECT USING (true);

CREATE POLICY "Owners manage branch" ON public.branches
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.providers
      WHERE providers.id = branches.provider_id AND providers.owner_id = auth.uid()
    )
  );

-- services
CREATE POLICY "Public read on services" ON public.services
  FOR SELECT USING (is_active = true);

CREATE POLICY "Owners manage services" ON public.services
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.providers
      WHERE providers.id = services.provider_id AND providers.owner_id = auth.uid()
    )
  );

-- bookings
CREATE POLICY "Customers view own bookings" ON public.bookings
  FOR SELECT USING (customer_id = auth.uid());

CREATE POLICY "Customers create own bookings" ON public.bookings
  FOR INSERT WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Providers view branch bookings" ON public.bookings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.branches b
      JOIN public.providers p ON b.provider_id = p.id
      WHERE b.id = bookings.branch_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Staff view own bookings" ON public.bookings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = bookings.employee_id AND e.profile_id = auth.uid()
    )
  );
