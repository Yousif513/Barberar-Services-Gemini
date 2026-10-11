-- G75 Professional identity portable across salons: tables, constraints, row-level security.
--
-- The person owns the identity. A professional (a login that works as an employee of a salon) creates ONE public profile that
-- belongs to the login, not to an employer. A salon links to it through a two-sided handshake (the salon invites one of its
-- employee rows, the professional accepts), and either side can end the link. When the person moves, the profile and the
-- followers stay with the person. What belongs to a salon (its client list, notes, booking history, invoices and the reviews of the
-- salon) is never copied or moved by any of this: nothing here reads or writes those tables.
--
-- Design:
--   * professional_profiles      one row per login: handle, bilingual names, headline, bio, specialties, languages, visibility.
--   * professional_handle_redirects  the old handle after an administrator changes it, so old links still land on the person.
--   * professional_reserved_handles  words that are never available as a handle (routes, brand, roles).
--   * professional_portfolio_items   https links to the professional's own work.
--   * professional_workplaces    the handshake: invited -> active -> former, or invited -> declined. Rows are never deleted.
--   * professional_follows       who follows whom. The professional sees a COUNT only; nobody but the follower reads the rows.
-- Clients cannot write any of these tables: every change is a SECURITY DEFINER command in the next migration.

-- 1. Profiles. No phone, email, address or internal reference of the employer is stored here.
CREATE TABLE IF NOT EXISTS public.professional_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  handle TEXT NOT NULL UNIQUE,
  display_name_en VARCHAR(80) NOT NULL,
  display_name_ar VARCHAR(80) NOT NULL,
  headline_en VARCHAR(120),
  headline_ar VARCHAR(120),
  bio_en TEXT,
  bio_ar TEXT,
  specialties TEXT[] NOT NULL DEFAULT '{}',
  languages TEXT[] NOT NULL DEFAULT '{}',
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  hidden_by_admin_at TIMESTAMPTZ,
  last_move_notice_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT professional_handle_shape CHECK (
    handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(handle) BETWEEN 3 AND 30),
  CONSTRAINT professional_names_not_blank CHECK (length(btrim(display_name_en)) > 0 AND length(btrim(display_name_ar)) > 0),
  CONSTRAINT professional_bio_length CHECK (
    (bio_en IS NULL OR char_length(bio_en) <= 1000) AND (bio_ar IS NULL OR char_length(bio_ar) <= 1000)),
  CONSTRAINT professional_specialties_shape CHECK (cardinality(specialties) <= 20),
  CONSTRAINT professional_languages_shape CHECK (cardinality(languages) <= 10),
  CONSTRAINT professional_published_has_date CHECK (NOT is_published OR published_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_professional_profiles_visible ON public.professional_profiles (handle)
  WHERE is_published AND hidden_by_admin_at IS NULL;

-- 2. An old handle keeps pointing at the person after an administrator changes it.
CREATE TABLE IF NOT EXISTS public.professional_handle_redirects (
  old_handle TEXT PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES public.professional_profiles(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT professional_redirect_shape CHECK (old_handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE INDEX IF NOT EXISTS idx_professional_redirects_professional ON public.professional_handle_redirects (professional_id);

-- 3. Words that are never a handle: site routes, the brand, roles and system words. A route added to the web app later is
-- reserved with one INSERT; nothing else reads this table except the handle check.
CREATE TABLE IF NOT EXISTS public.professional_reserved_handles (
  handle TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT 'route',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT professional_reserved_shape CHECK (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
INSERT INTO public.professional_reserved_handles (handle, reason)
SELECT w, r FROM (VALUES
  ('admin', 'role'), ('administrator', 'role'), ('moderator', 'role'), ('owner', 'role'), ('staff', 'role'), ('support', 'role'),
  ('system', 'system'), ('root', 'system'), ('null', 'system'), ('undefined', 'system'), ('api', 'system'), ('www', 'system'),
  ('mail', 'system'), ('static', 'system'), ('assets', 'system'), ('new', 'system'), ('me', 'system'), ('edit', 'system'),
  ('primora', 'brand'), ('official', 'brand'), ('team', 'brand'), ('help', 'brand'),
  ('pro', 'route'), ('pros', 'route'), ('shop', 'route'), ('shops', 'route'), ('provider', 'route'), ('providers', 'route'),
  ('customer', 'route'), ('customers', 'route'), ('search', 'route'), ('login', 'route'), ('logout', 'route'),
  ('signin', 'route'), ('signup', 'route'), ('register', 'route'), ('settings', 'route'), ('about', 'route'),
  ('terms', 'route'), ('privacy', 'route'), ('contact', 'route'), ('book', 'route'), ('booking', 'route'),
  ('bookings', 'route'), ('salon', 'route'), ('salons', 'route'), ('barber', 'route'), ('barbers', 'route'),
  ('dashboard', 'route'), ('following', 'route'), ('identity', 'route'), ('auth', 'route')
) AS v(w, r)
ON CONFLICT (handle) DO NOTHING;

-- 4. Portfolio: https links to the professional's own work (the link text is shown, the page behind it is not ours).
CREATE TABLE IF NOT EXISTS public.professional_portfolio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professional_profiles(id) ON DELETE CASCADE,
  title_en VARCHAR(100),
  title_ar VARCHAR(100),
  url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT professional_portfolio_url_https CHECK (url ~ '^https://[^[:space:]]+$' AND char_length(url) <= 500)
);
CREATE INDEX IF NOT EXISTS idx_professional_portfolio_professional ON public.professional_portfolio_items (professional_id, display_order, created_at);

-- 5. The handshake. employee_id is NULL only once the employee row is gone (the history stays); an open link always has one.
CREATE TABLE IF NOT EXISTS public.professional_workplaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professional_profiles(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'former', 'declined')),
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  closed_by TEXT CHECK (closed_by IN ('professional', 'provider', 'system', 'admin')),
  closed_reason TEXT CHECK (closed_reason IN ('employee_deactivated', 'employee_removed', 'login_released', 'ended_by_request')),
  move_notice_outcome TEXT CHECK (move_notice_outcome IN ('sent', 'rate_limited', 'not_configured', 'first_link')),
  move_notice_sent_at TIMESTAMPTZ,
  CONSTRAINT professional_workplace_state CHECK (
    (status = 'invited' AND started_at IS NULL AND ended_at IS NULL AND closed_by IS NULL AND employee_id IS NOT NULL)
    OR (status = 'active' AND started_at IS NOT NULL AND ended_at IS NULL AND closed_by IS NULL AND employee_id IS NOT NULL)
    OR (status = 'former' AND started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at >= started_at AND closed_by IS NOT NULL)
    OR (status = 'declined' AND started_at IS NULL AND ended_at IS NOT NULL AND closed_by IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_professional_workplaces_professional ON public.professional_workplaces (professional_id, status);
CREATE INDEX IF NOT EXISTS idx_professional_workplaces_provider ON public.professional_workplaces (provider_id, status);
CREATE INDEX IF NOT EXISTS idx_professional_workplaces_employee ON public.professional_workplaces (employee_id) WHERE employee_id IS NOT NULL;
-- One open link (pending or running) per professional and employee row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_professional_workplaces_open ON public.professional_workplaces (professional_id, employee_id)
  WHERE status IN ('invited', 'active');

-- 6. Followers. notify_on_move is the follower's own opt-in and is off until they switch it on.
CREATE TABLE IF NOT EXISTS public.professional_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professional_profiles(id) ON DELETE CASCADE,
  follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notify_on_move BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (professional_id, follower_id)
);
CREATE INDEX IF NOT EXISTS idx_professional_follows_follower ON public.professional_follows (follower_id, created_at DESC);

-- 7. Row-level security: default deny. A signed-in person reads only what is theirs; every write is a command.
ALTER TABLE public.professional_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_handle_redirects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_reserved_handles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_portfolio_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_workplaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals read their own profile" ON public.professional_profiles;
CREATE POLICY "Professionals read their own profile" ON public.professional_profiles
  FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Administrators read handle redirects" ON public.professional_handle_redirects;
CREATE POLICY "Administrators read handle redirects" ON public.professional_handle_redirects
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Administrators read reserved handles" ON public.professional_reserved_handles;
CREATE POLICY "Administrators read reserved handles" ON public.professional_reserved_handles
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Professionals read their own portfolio" ON public.professional_portfolio_items;
CREATE POLICY "Professionals read their own portfolio" ON public.professional_portfolio_items
  FOR SELECT TO authenticated USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.professional_profiles p WHERE p.id = professional_portfolio_items.professional_id AND p.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Professionals read their own workplaces" ON public.professional_workplaces;
CREATE POLICY "Professionals read their own workplaces" ON public.professional_workplaces
  FOR SELECT TO authenticated USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.professional_profiles p WHERE p.id = professional_workplaces.professional_id AND p.owner_id = auth.uid()));

-- Only the follower reads a follow. Not the professional (who sees a count), not a salon, not an administrator.
DROP POLICY IF EXISTS "Followers read their own follows" ON public.professional_follows;
CREATE POLICY "Followers read their own follows" ON public.professional_follows
  FOR SELECT TO authenticated USING (follower_id = auth.uid());

-- 8. Privileges and the administrator audit trigger (the project convention for every new table).
SELECT public.grant_data_api_access('public.professional_profiles');
SELECT public.grant_data_api_access('public.professional_handle_redirects');
SELECT public.grant_data_api_access('public.professional_reserved_handles');
SELECT public.grant_data_api_access('public.professional_portfolio_items');
SELECT public.grant_data_api_access('public.professional_workplaces');
SELECT public.grant_data_api_access('public.professional_follows');

SELECT public.attach_admin_audit_trigger('public.professional_profiles');
SELECT public.attach_admin_audit_trigger('public.professional_handle_redirects');
SELECT public.attach_admin_audit_trigger('public.professional_reserved_handles');
SELECT public.attach_admin_audit_trigger('public.professional_portfolio_items');
SELECT public.attach_admin_audit_trigger('public.professional_workplaces');
SELECT public.attach_admin_audit_trigger('public.professional_follows');
