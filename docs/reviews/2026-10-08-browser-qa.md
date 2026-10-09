# Browser QA, 2026-10-08 (independent, read-only on source)

Status: IN PROGRESS (this file is written incrementally; sections below are appended as pages are covered).

Environment
- Branch claude-code at c4c8662 (main checkout `primora-fix`), `next dev -p 3030` (Next 16.3.8, Turbopack) with
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and the local publishable key (overrides the hosted values in `.env.local`).
- Local Supabase stack in Docker, all migrations + seed applied.
- Browser: the built-in Browser pane (mcp__Claude_Browser__*) WAS available. Server-side evidence for failed API calls was taken from the
  Kong access log (`supabase_kong_beauty_grooming_marketplace`) and the PostgREST log, because the pane's network log also contains
  requests from other sessions (ports 3123 / 54399) and cannot be scoped to one navigation.
- Accounts (throw-away, removed at the end): qa-customer@primora-qa.test (customer, phone verified), qa-admin@primora-qa.test (admin),
  seeded owner faisal@elitebarber.sa, seeded employee ali@elitebarber.sa (passwords reset locally for the test only).
- NOTE: `web_platform/.env.local` has `NEXT_PUBLIC_ENABLE_DEV_ACCESS=true`; on localhost this renders a DEV role switcher in the home footer
  (Customer / Provider / Admin). It was NOT used for any role check below; every role was signed in through /login.

## Defects (raw log, ranked at the end)

### Q-01 HIGH - Home page: all five Featured Services tiles link to `/shop/null`, and the page fires a 400 request on every load
- Route: `/` (anonymous). Steps: open http://localhost:3030/, scroll to "Featured Services", read the tile hrefs or open the console.
- Saw: every tile `href="/shop/null"`; console: two `Failed to load resource: 400 (Bad Request)`;
  Kong: `GET /rest/v1/reviews?select=provider_id,rating,moderation_status&provider_id=in.(null) -> 400` (x2, React strict-mode double effect).
- Cause: the featured rows are platform-catalog services whose `services.provider_id` is NULL (seed: Classic Haircut, Moroccan Bath, Groom's Prep,
  Skin Fade, Royal Shave Ritual). `web_platform/src/app/page.tsx:206-210` builds `.in("provider_id", [null])` and `page.tsx:234` builds
  `href: /shop/${r.provider_id}`. Expected: tiles link to a bookable destination (service/category page or a provider that offers it), no failed request.
- Also (MEDIUM, same section): every featured card carries a hard-coded "POPULAR" badge (`page.tsx:510`) that is not derived from any data, and
  the rating line falls back to "New" for all five. The label asserts popularity nobody measured.

### Q-02 CRITICAL - Shop page `/shop/<provider>` never loads: "Could not embed because more than one relationship was found for 'reviews' and 'profiles'"
- Route: `/shop/a0000000-0000-0000-0000-000000000001` (Elite Grooming Lounge), also expected for every provider. Roles: anonymous and customer (customer signed in).
- Steps: open the URL (or /services -> "View shop").
- Saw: error card "Could not load this provider" + the PostgREST message above + "TRY AGAIN". The booking flow (shop -> service -> booking modal) is unreachable.
  Kong: `GET /rest/v1/reviews?select=id,rating,comment,created_at,reply_comment,moderation_status,employee_id,profiles(first_name,last_name)&provider_id=eq... -> 300 Multiple Choices` (PGRST201).
- Cause: `reviews` has two foreign keys to `profiles` (`reviews_customer_id_fkey` and `reviews_moderated_by_fkey`, the latter added in
  `supabase/migrations/20261004020000_people_and_trust.sql:247`), so the unqualified embed `profiles(...)` in
  `web_platform/src/app/shop/[id]/page.tsx:396` is ambiguous. Fix is to qualify it (`profiles!reviews_customer_id_fkey(...)`).
  The same unqualified embed exists in `web_platform/src/app/admin/reviews/page.tsx:87` (`customer:profiles(...)`), see the admin section.
- Note for QA tooling: PostgREST returns HTTP 300 for this, so 4xx/5xx-only monitors miss it.

### Q-03 HIGH - `/discover` shows "0 SALONS AVAILABLE" for the seeded marketplace (city filter defaults to Riyadh, seeded branches have NULL city)
- Route: `/discover` (anonymous and customer). Steps: open /discover. Saw: "No salons found matching your criteria", "RIYADH ... 0".
  `POST /rest/v1/rpc/search_marketplace_providers {"p_city":"Riyadh"}` returns `providers: []`; with `p_city:"all"` it returns both seeded providers.
- Cause: `web_platform/src/app/discover/page.tsx:123` initialises `selectedCity` to "Riyadh" and offers only Riyadh/Jeddah (no "all cities"); the seeded
  branches (`supabase/seed.sql:66-68`) have `city = NULL` and `district = NULL`, so the RPC filter excludes them. The address text says "Riyadh".
  A provider who saves a branch without a city is likewise invisible in discovery. Same root cause makes `/categories/*` show "No providers in this category yet".
- Related (MEDIUM): `/categories/barber` filters on slug `barber-hair` (`web_platform/src/app/categories/barber/page.tsx`) but the seeded barbershop's services sit in the
  leaf categories `mens-haircut` / `beard-grooming`; there are two parallel taxonomies (17 categories, 7 of them leaf-level duplicates such as "Beard Grooming" vs "Beard & Shave"),
  so even with a city the barbershop would not appear under Barbers. /services category filter lists all 17 mixed together.

### Q-04 LOW (environment) - Realtime websocket returns 503 on every signed-in page
- Kong: `GET /realtime/v1/websocket -> 503` (the local stack has no `supabase_realtime_*` container for this project; storage and inbucket are also not running).
  No console error surfaced on the customer pages, so the client degrades silently. Not a product defect, but any feature that relies on live updates
  (messages, notifications badge) cannot be verified here. Uploads (storage) cannot be verified either.

### Provider portal as seeded owner (faisal@elitebarber.sa) - route sweep result
Visited (render, console and Kong 3xx/4xx/5xx checked): /provider/dashboard, bookings, calendar, chain, customers, developer, employees, groups, identity, intake,
inventory, jobs, memberships, messages, my-day, packages, pricing, promote, promotions, recurring, reports, resources, reviews, services, settings, share,
time-off, wallet, whatsapp. All rendered, no console errors, no failed REST/RPC calls, no horizontal overflow at 1024.
Redirects (by design): /provider/staff-management and /provider/team -> /provider/employees; /provider/become -> /become-provider.
- /provider/my-day for an owner shows "This screen is for professionals" (honest, not an error).
- /provider/wallet shows a payout row with charge reference `ch_mada_mock_99182` (22.50 SAR share): it is the seed row `supabase/seed.sql:135`, so the screen is
  honest about the DB, but the reference text looks like a real Tap id; only a seed-hygiene note (LOW, Q-05).
- Check-in: /provider/bookings, seeded CONFIRMED booking (Luxury Beard Grooming, 10 Oct 17:00) -> "Seat in chair" changed the row to IN SERVICE with
  "Mark completed / Cancel" offered; no failed requests. No confirmation toast or reason prompt was visible (LOW, Q-06: the action has no visible success feedback).
- A booking created by the customer through the shop page earlier in the session (Master Haircut 11 Oct 10:00, pending_payment hold) was later shown as CANCELLED
  by the provider list, i.e. the unpaid hold lapsed on its own (expected hold-expiry behaviour; confirms the "Awaiting payment" hold is released).
