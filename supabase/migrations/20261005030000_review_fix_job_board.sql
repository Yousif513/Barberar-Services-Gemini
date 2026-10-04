-- Migration: 20261005030000_review_fix_job_board.sql
-- Review fix for the on-demand request board (job_posts / job_bids).
-- Found in docs/reviews/2026-10-04-gemini-p0-p2-review.md:
--   * customers "accepted" bids with a client-side UPDATE that RLS silently filtered (0 rows),
--     while the UI reported success;
--   * providers could insert or update their own bids with status 'accepted';
--   * clients invented Riyadh-centre coordinates and a placeholder category id.
-- Bid decisions are now one server command; status columns can no longer be set by clients.

-- Coordinates are optional: a post records the address the customer typed, never invented points.
ALTER TABLE public.job_posts ALTER COLUMN latitude DROP NOT NULL;
ALTER TABLE public.job_posts ALTER COLUMN longitude DROP NOT NULL;

ALTER TABLE public.job_posts DROP CONSTRAINT IF EXISTS job_posts_status_check;
ALTER TABLE public.job_posts ADD CONSTRAINT job_posts_status_check
  CHECK (status IN ('open', 'assigned', 'completed', 'cancelled'));
ALTER TABLE public.job_posts DROP CONSTRAINT IF EXISTS job_posts_budget_check;
ALTER TABLE public.job_posts ADD CONSTRAINT job_posts_budget_check CHECK (budget_max IS NULL OR budget_max > 0);

ALTER TABLE public.job_bids DROP CONSTRAINT IF EXISTS job_bids_status_check;
ALTER TABLE public.job_bids ADD CONSTRAINT job_bids_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn'));
ALTER TABLE public.job_bids DROP CONSTRAINT IF EXISTS job_bids_price_check;
ALTER TABLE public.job_bids ADD CONSTRAINT job_bids_price_check CHECK (bid_price > 0);

-- ---------------------------------------------------------------------------
-- Posts: created open; customers may cancel their own open post; assignment only via accept_job_bid.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_job_post_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' OR current_setting('primora.job_decision', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'open';
    IF NEW.target_date <= now() THEN
      RAISE EXCEPTION 'The requested date must be in the future.';
    END IF;
    IF length(trim(COALESCE(NEW.address_text, ''))) = 0 THEN
      RAISE EXCEPTION 'An address is required.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'A request cannot be moved to another customer.';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status = 'open' AND NEW.status = 'cancelled') THEN
    RAISE EXCEPTION 'Request status changes only through accepting a bid or cancelling an open request.';
  END IF;
  IF OLD.status <> 'open' AND (NEW.title, NEW.description, NEW.budget_max, NEW.target_date, NEW.address_text)
       IS DISTINCT FROM (OLD.title, OLD.description, OLD.budget_max, OLD.target_date, OLD.address_text) THEN
    RAISE EXCEPTION 'Only open requests can be edited.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_job_post_fields ON public.job_posts;
CREATE TRIGGER trg_protect_job_post_fields
  BEFORE INSERT OR UPDATE ON public.job_posts
  FOR EACH ROW EXECUTE FUNCTION public.protect_job_post_fields();

-- ---------------------------------------------------------------------------
-- Bids: verified providers bid on open posts as 'pending'; they may edit or withdraw a pending bid.
-- Accept/reject happens only in accept_job_bid.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_job_bid_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post public.job_posts%ROWTYPE;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' OR current_setting('primora.job_decision', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.job_post_id IS DISTINCT FROM OLD.job_post_id OR NEW.provider_id IS DISTINCT FROM OLD.provider_id THEN
      RAISE EXCEPTION 'A bid cannot be moved to another request or provider.';
    END IF;
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Only pending bids can be changed.';
    END IF;
    IF NEW.status NOT IN ('pending', 'withdrawn') THEN
      RAISE EXCEPTION 'Bids are accepted or rejected only by the customer.';
    END IF;
  ELSE
    NEW.status := 'pending';
  END IF;

  SELECT * INTO v_post FROM public.job_posts WHERE id = NEW.job_post_id;
  IF NOT FOUND OR v_post.status <> 'open' THEN
    RAISE EXCEPTION 'This request is no longer open for bids.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.providers p WHERE p.id = NEW.provider_id AND p.is_verified) THEN
    RAISE EXCEPTION 'Only verified providers can bid.';
  END IF;
  IF NEW.employee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.employees e JOIN public.branches b ON b.id = e.branch_id
    WHERE e.id = NEW.employee_id AND b.provider_id = NEW.provider_id AND COALESCE(e.is_active, TRUE)
  ) THEN
    RAISE EXCEPTION 'The assigned professional does not work for this provider.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_job_bid_fields ON public.job_bids;
CREATE TRIGGER trg_protect_job_bid_fields
  BEFORE INSERT OR UPDATE ON public.job_bids
  FOR EACH ROW EXECUTE FUNCTION public.protect_job_bid_fields();

-- Policies: owners manage their bids (the trigger limits what they can change); WITH CHECK pins ownership.
DROP POLICY IF EXISTS "Providers manage own bids" ON public.job_bids;
CREATE POLICY "Providers manage own bids" ON public.job_bids
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.providers WHERE providers.id = job_bids.provider_id AND providers.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.providers WHERE providers.id = job_bids.provider_id AND providers.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Customers manage own job posts" ON public.job_posts;
CREATE POLICY "Customers manage own job posts" ON public.job_posts
  FOR ALL
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

-- Providers also see the posts they have bid on after they close, so they learn the outcome.
-- The lookup runs as definer: a policy on job_posts that reads job_bids directly would recurse
-- through "Customers view bids for own posts".
CREATE OR REPLACE FUNCTION public.caller_has_bid_on_job(p_job_post_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.job_bids jb JOIN public.providers p ON p.id = jb.provider_id
    WHERE jb.job_post_id = p_job_post_id AND p.owner_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.caller_has_bid_on_job(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_has_bid_on_job(UUID) TO authenticated;

DROP POLICY IF EXISTS "Providers select posts they bid on" ON public.job_posts;
CREATE POLICY "Providers select posts they bid on" ON public.job_posts
  FOR SELECT USING (public.caller_has_bid_on_job(id));

-- ---------------------------------------------------------------------------
-- accept_job_bid: the customer picks one pending bid; the others are rejected; the post is assigned.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_job_bid(p_bid_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bid public.job_bids%ROWTYPE;
  v_post public.job_posts%ROWTYPE;
BEGIN
  SELECT * INTO v_bid FROM public.job_bids WHERE id = p_bid_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bid not found.';
  END IF;
  SELECT * INTO v_post FROM public.job_posts WHERE id = v_bid.job_post_id FOR UPDATE;
  IF v_post.customer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the customer who posted this request can accept a bid.';
  END IF;
  IF v_post.status <> 'open' THEN
    RAISE EXCEPTION 'This request is no longer open.';
  END IF;
  IF v_bid.status <> 'pending' THEN
    RAISE EXCEPTION 'This bid is no longer available.';
  END IF;

  PERFORM set_config('primora.job_decision', 'on', true);
  UPDATE public.job_bids SET status = 'accepted' WHERE id = v_bid.id;
  UPDATE public.job_bids SET status = 'rejected' WHERE job_post_id = v_post.id AND id <> v_bid.id AND status = 'pending';
  UPDATE public.job_posts SET status = 'assigned' WHERE id = v_post.id;
  PERFORM set_config('primora.job_decision', 'off', true);

  RETURN jsonb_build_object('success', TRUE, 'job_post_id', v_post.id, 'bid_id', v_bid.id,
                            'provider_id', v_bid.provider_id, 'bid_price', v_bid.bid_price);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_job_bid(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_job_bid(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.protect_job_bid_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_job_post_fields() FROM PUBLIC, anon, authenticated;
