# 01 — Current PRIMORA Audit (Feature & Page Inventory)

> **Research date:** 2026-10-03 · **Code state audited:** branch `codex` @ `734fcd9` (12 commits ahead of `master` @ `e215227`) · **Method:** static reading of source, schema and Edge Functions; production build, lint and type-check executed; two independent specialist passes (adminwright admin-console audit, design-system audit) folded in.
> **Live database was not reachable** (Supabase MCP unauthenticated). Every database finding below is read from migration source. Five migrations dated 2026-07-03 → 2026-07-14 were, at last check, **not confirmed as applied** to the linked project.

**Status vocabulary** (used in every report):
`FULLY IMPLEMENTED` · `PARTIALLY IMPLEMENTED` · `UI ONLY` · `BACKEND ONLY` · `PLACEHOLDER / MOCK` · `BROKEN / INCOMPLETE` · `NOT IMPLEMENTED`

---

## 1. Platform at a glance

| Dimension | Measured value | Evidence |
|---|---|---|
| Web app | Next.js 16.2.9, React 19.2.4, Tailwind 4 · **81 routes**, 35.8k LOC | `web_platform/src/app/**/page.tsx` |
| Rendering | **81 / 81 pages are `"use client"`** · 0 server components · no `middleware.ts` · no `route.ts` · no server actions | grep across `web_platform/src/app` |
| Shared UI components | **5** (`auth-guard`, `control-center`, `dev-role-switcher`, `global-dev-tools`, `toast`) | `web_platform/src/components/` |
| Mobile app | Expo / React Native · 6 screens · 7.4k LOC · **no authentication code** · home & explore use `constants/mockData.ts` | `mobile_app/src/` |
| Database | Supabase Postgres · **30 tables**, 4 enums, 18 functions, 5 views, 9 triggers, **84 RLS policies, RLS on 30/30 tables** | `supabase/migrations/` (25 files) |
| Server logic | 9 Deno Edge Functions | `supabase/functions/` |
| Background jobs | **None** — no `pg_cron`, no queue, no scheduler | grep `cron.` → 0 |
| Build health | `next build` ✅ · mobile `tsc` ✅ · ESLint 0 errors / **353 warnings** (186 `no-explicit-any`) | executed 2026-10-03 |
| Tests | **No test runner.** Two `scripts/verify-*.mjs` files assert string presence in source | `scripts/` |
| Dependencies | `npm audit`: 28 advisories (13 high). `next@16.2.9` HIGH → fixed in 16.3.4 (non-breaking) | `npm audit --omit=dev` |
| Analytics / feature flags / PWA / sitemap | **None** | grep |

---

## 2. Feature inventory

| # | Feature | Area | User type | Status | Evidence | Problems | Notes |
|---|---|---|---|---|---|---|---|
| F01 | Email + password sign-up / sign-in | Auth | All | PARTIALLY IMPLEMENTED | `app/login/page.tsx:56,69` | No phone/OTP login; mobile app has no auth at all | Saudi users are phone-first |
| F02 | Phone/WhatsApp OTP | Auth | All | BACKEND ONLY | `functions/send-otp` (Twilio WhatsApp if env set, else `mock`) | Not wired to any login; `verify-security-core.mjs` forbids it in login | |
| F03 | Profile creation on sign-up | Auth | All | BROKEN / INCOMPLETE | `20260615182811:7` `COALESCE(NEW.phone,'+9665'||random)` | **Email sign-ups receive a fabricated, real-range Saudi mobile number**; UNIQUE NOT NULL collision risk | Any SMS/WhatsApp to profile phones would reach strangers |
| F04 | Role-based dashboards (customer / provider / admin) | Auth | All | PARTIALLY IMPLEMENTED | `components/auth-guard.tsx`; layouts | Client-side render gate only; RLS is the real boundary | |
| F05 | Dev role bypass | Dev tooling | Dev | PARTIALLY IMPLEMENTED | `lib/dev-access.ts:10-13` | Localhost-only (safe on Vercel); opt-out, auto-assigns a role | |
| F06 | Business (provider) self-onboarding | Supply | Provider | NOT IMPLEMENTED | sign-up → `/provider/become` → redirect → `/become-provider` (0 DB calls); `set_user_role` admin-only | **No path creates a `providers` row** | Biggest marketplace blocker |
| F07 | Admin "Add provider" | Supply | Admin | PLACEHOLDER / MOCK | `admin/providers/provider-management.tsx` `saveProvider` → `source:"local"`, `nextLocalId` | New providers live in React state only and vanish on refresh | `providers.owner_id NOT NULL` also blocks admin-created shells |
| F08 | Provider approval / suspension | Supply | Admin | PARTIALLY IMPLEMENTED | `provider-management.tsx:997-1011` | Catch-and-succeed: failures show success | `provider_status` enum exists |
| F09 | Provider verification documents | Trust | Provider/Admin | PARTIALLY IMPLEMENTED | `providers.trade_license_url`, `iban` only | No CR / municipal / VAT-number capture, no review workflow | |
| F10 | Service catalog (public) | Discovery | Customer | FULLY IMPLEMENTED | `app/services/page.tsx` reads `categories`, `services`, `providers` | Category imagery; no ranking; no distance | |
| F11 | Unified search (services + shops) | Discovery | Customer | PARTIALLY IMPLEMENTED | `services/page.tsx` single search, All/Shops/Services | Client-side filtering of a full select; no server search | |
| F12 | Gender filter (male / female / unisex) | Discovery | Customer | FULLY IMPLEMENTED | `services/page.tsx` | | Saudi-relevant strength |
| F13 | Category landing pages | Discovery | Customer | PLACEHOLDER / MOCK | `app/categories/{barber,hair,makeup,spa}` — 4 static near-duplicates | Not data-driven, never reskinned | |
| F14 | Map / near-me discovery | Discovery | Customer | NOT IMPLEMENTED (web) · PLACEHOLDER (mobile) | no map library in web; `mobile_app/src/app/explore.tsx` pins over `mockData` | No geolocation search; branches have lat/lng | |
| F15 | Customer search page | Discovery | Customer | UI ONLY | `customer/search/page.tsx` (0 DB calls) | Duplicates `/services` | |
| F16 | Featured services on landing | Merchandising | Customer/Admin | FULLY IMPLEMENTED | landing reads `services.featured_on_landing`; admin toggle | | |
| F17 | Provider / shop profile | Discovery | Customer | PARTIALLY IMPLEMENTED | `app/shop/[id]/page.tsx` (1,596 lines) | Never reskinned; no portfolio; no per-employee ratings shown | |
| F18 | Employee selection at booking | Booking | Customer | FULLY IMPLEMENTED | `shop/[id]:755,903` `selectedSpecialist.id` | | |
| F19 | "Any available professional" | Booking | Customer | NOT IMPLEMENTED | translation key `anySpecialist` defined, **never rendered** | Customer must pick one person | Competitive standard |
| F20 | Real-time availability | Booking | Customer | FULLY IMPLEMENTED | `get_available_slots` RPC (15-min grid, employee shift, existing bookings) | Ignores rooms/resources, buffers, leave | |
| F21 | Double-booking prevention | Booking | System | FULLY IMPLEMENTED | `bookings_no_employee_overlap EXCLUDE USING gist` (`20260615182811:555`) | | Genuine concurrency safety |
| F22 | Booking creation with server-side pricing | Booking | Customer | FULLY IMPLEMENTED | `create_booking` SECURITY DEFINER, **no price parameter**; price, 15% VAT, commission derived server-side | | Tamper-proof |
| F23 | Payment-hold expiry for unpaid bookings | Booking | System | NOT IMPLEMENTED | no expiry, no cron; `pending_payment` is inside the exclusion constraint | **Abandoned checkout holds the slot forever**; also an abuse vector | P0 |
| F24 | Multiple services in one booking | Booking | Customer | NOT IMPLEMENTED | one `service_id` per booking | | |
| F25 | Group / party booking | Booking | Customer | NOT IMPLEMENTED | | | |
| F26 | Recurring appointments | Booking | Customer/Provider | NOT IMPLEMENTED | | | |
| F27 | Waitlist | Booking | Customer | NOT IMPLEMENTED | | | |
| F28 | Reschedule | Booking | Customer | UI ONLY | label in `customer/bookings/page.tsx:24`; no RPC | | |
| F29 | Customer cancellation | Booking | Customer | PARTIALLY IMPLEMENTED | `cancel_booking` RPC | **No policy window, no fee, no refund, no provider notification — contradicts `/terms` (24 h free, ≤50 % fee)** | Legal exposure |
| F30 | Provider status transitions (complete / no-show / cancel) | Booking | Provider owner | FULLY IMPLEMENTED | `validate_booking_status_transition` trigger | Employees cannot transition their own bookings | |
| F31 | Book for a family member / dependent | Booking | Customer | FULLY IMPLEMENTED | `client_profiles`; `customer/dependents`; `create_booking(request_client_profile_id)` | Minors' data → consent design needed | Differentiator |
| F32 | Booking confirmation + calendar file | Booking | Customer | PARTIALLY IMPLEMENTED | `customer/bookings/[id]/confirmation` (ICS) | Fabricated demo booking on read failure | |
| F33 | Provider calendar (day + week) | Ops | Provider | PARTIALLY IMPLEMENTED | `provider/calendar` (1,912 lines) | Walk-in booking UI partially local | |
| F34 | Weekly shifts incl. second (split) shift | Ops | Provider | FULLY IMPLEMENTED | `employee_availability`; `20260704133500_second_shift_availability` | **Shifts crossing midnight produce zero slots** | Ramadan / late barbershops |
| F35 | Breaks, leave / time-off, holidays, closures | Ops | Provider | NOT IMPLEMENTED | no schema | | |
| F36 | Service buffers / processing time | Ops | Provider | NOT IMPLEMENTED | no schema | | |
| F37 | Rooms / chairs / resources | Ops | Provider | BACKEND ONLY (disconnected) | `resources`, `service_resources`; `provider/resources` CRUD | **Slot engine ignores resources** | |
| F38 | Prayer-time lock windows | Ops / Localization | Provider/Customer | PARTIALLY IMPLEMENTED | `lib/use-prayer-times.ts` (adhan, Umm al-Qura); 5-arg `get_available_slots` overload; city picker | Server overload not yet called with real windows everywhere | **Unique Saudi differentiator** |
| F39 | Walk-in queue | Ops | Provider | UI ONLY | dashboard "Walk-In Queue" card | No queue table | |
| F40 | Employee management | Staff | Provider | FULLY IMPLEMENTED | `provider/employees` CRUD on `employees`, `employee_services`, `employee_availability` | | |
| F41 | Employee login & own dashboard | Staff | Employee | PARTIALLY IMPLEMENTED | role `provider_employee`; RLS lets employee read own bookings | Provider pages query by `owner_id` → employee sees nothing useful | |
| F42 | Per-employee ratings | Trust | Customer | BACKEND ONLY | `reviews.employee_id` set by trigger | Not aggregated or displayed | Glamiva shows it |
| F43 | Employee commission / earnings | Finance | Provider | PARTIALLY IMPLEMENTED | `transactional_ledger.employee_share`; `employee_earnings_summary` view | View unapplied; no commission rules | |
| F44 | Verified reviews | Trust | Customer | FULLY IMPLEMENTED | `set_review_relationships`: only the customer, only a `completed` booking, one per booking | No moderation or provider response workflow | **Strength** |
| F45 | Review moderation (admin) | Trust | Admin | PLACEHOLDER / MOCK | `admin/reviews` three hardcoded reviews | | |
| F46 | Online payment (deposit) | Payments | Customer | PARTIALLY IMPLEMENTED | `payment-checkout` charges `deposit_required` via Tap; balance at venue | Card fields elsewhere collected raw (see F60) | |
| F47 | Payment confirmation webhook | Payments | System | FULLY IMPLEMENTED | `payment-webhook` re-fetches charge from Tap, validates amount/currency, `UNIQUE(payment_intent_id)` | | Sound capture path |
| F48 | Per-provider deposit % | Payments | Provider | FULLY IMPLEMENTED | `providers.deposit_percentage` (default 20) | Customer pages still say "15 %" | |
| F49 | Refunds | Payments | Admin | BROKEN / INCOMPLETE | `process-refund`: no auth, CORS `*`, live Tap refund, writes non-existent enum `'refunded'` after money moves | Never called from the app | **Critical security defect** |
| F50 | Partial refunds / chargebacks | Payments | Admin | NOT IMPLEMENTED | | | |
| F51 | Tips | Payments | Customer | NOT IMPLEMENTED | 0 files | | |
| F52 | Coupons / promo codes | Marketing | Admin/Customer | BACKEND ONLY (no redemption) | `promotional_codes` admin CRUD | **Never applied in `create_booking` or checkout** | |
| F53 | Provider promotions | Marketing | Provider | BROKEN / INCOMPLETE | `provider/promotions` queries `provider_promos` | **Table does not exist** | |
| F54 | Packages / session passes | Retention | Provider/Customer | PARTIALLY IMPLEMENTED | `packages`, `user_packages`; provider CRUD; customer view | **No purchase path** | |
| F55 | Loyalty, gift cards, referrals, memberships | Retention | Customer | NOT IMPLEMENTED | words only in UI copy | | |
| F56 | Favorites | Retention | Customer | UI ONLY | `customer/favorites` (no table) | | |
| F57 | Provider payout request | Finance | Provider | PARTIALLY IMPLEMENTED | `request-payout` (owner-gated, balance check) | Wallet falls back to direct insert, bypassing balance check | |
| F58 | Payout processing | Finance | Admin | PARTIALLY IMPLEMENTED | `admin/ledger:598-667` non-atomic 3-step browser mutation | Correct `process-payout` function exists, unused | |
| F59 | VAT / settlement / employee earnings reports | Finance | Admin | PARTIALLY IMPLEMENTED | views in `20260703140000` | **Fabricated demo totals when a month has zero rows** | |
| F60 | Provider subscription plans | Monetization | Provider | PLACEHOLDER / MOCK | `provider/pricing` — `setTimeout` "success"; collects raw card number/CVV in a React form | No plan tables; nothing enforces tiers | PCI scope concern |
| F61 | ZATCA e-invoicing | Compliance | Provider | NOT IMPLEMENTED (sequence only) | `invoice_number_seq` assigned on completion | No QR, XML, cryptographic stamp, Fatoora integration — **yet the pricing page claims compliance** | Wave 25 deadline 2027-02-01 |
| F62 | Notifications inbox | Comms | Customer | BROKEN / INCOMPLETE | reads `notifications` | **Table does not exist** | |
| F63 | Push notifications | Comms | Customer | BROKEN / INCOMPLETE | `send-push`, `send-notification` read `expo_push_tokens` | **Table does not exist**; `send-notification` unauthenticated | |
| F64 | Reminders (SMS / WhatsApp / email) | Comms | Customer | NOT IMPLEMENTED | no scheduler, no email provider | Pricing page claims SMS reminders | |
| F65 | Admin broadcast | Comms | Admin | PLACEHOLDER / MOCK | `admin/notifications` `simulate:true` | | |
| F66 | In-app messaging | Comms | Customer/Provider | PARTIALLY IMPLEMENTED | `conversations`, `messages` (Codex migration) | Attachments decorative | |
| F67 | Provider CRM (customer list + notes) | CRM | Provider | BROKEN / INCOMPLETE | `provider/customers` reads `provider_customer_notes` | **Table does not exist** | |
| F68 | Home-service job board (customer posts, providers bid) | Home service | Customer/Provider | PARTIALLY IMPLEMENTED | `job_posts`, `job_bids`; `customer/jobs`, `provider/jobs` | | |
| F69 | Home-service logistics | Home service | Provider | PARTIALLY IMPLEMENTED | `delivery_jobs`; `provider/deliveries` (25 mock hits) | | |
| F70 | Travel distance / fee | Home service | System | PARTIALLY IMPLEMENTED | `calculate-travel` (Google Distance Matrix; returns `"10 km"` without key) | | |
| F71 | Provider analytics / reports | Analytics | Provider | PLACEHOLDER / MOCK | `provider/reports` reads only `providers`; chart grids invisible | | |
| F72 | Admin dashboard KPIs | Analytics | Admin | PLACEHOLDER / MOCK | `admin/page.tsx:175` literals, **rendered in USD** | | |
| F73 | Admin services CRUD + featured | Catalog | Admin | FULLY IMPLEMENTED | `admin/services` with rollback on error | | Reference implementation |
| F74 | Integrations registry + audit log | Platform | Admin | FULLY IMPLEMENTED | `admin/integrations`; `integration_audit_log` | Only audited surface; Arabic strings mojibake | |
| F75 | Payment-method registry | Payments | Admin | FULLY IMPLEMENTED | `payment_methods`, `accepted_payment_methods` view | View lacks `security_invoker`, granted to `anon` | |
| F76 | Admin audit trail | Governance | Admin | NOT IMPLEMENTED (3 of ~30 mutations) | only integrations writes audit rows | `/admin/audit-logs` redirects to a booking feed | |
| F77 | Developer API & webhooks | Platform | Partner | PLACEHOLDER / MOCK | `api_tokens`, `webhook_subscriptions`; `developer/page.tsx:253` stores token **in plaintext** | No API endpoint consumes tokens | |
| F78 | Bilingual EN/AR + RTL | Localization | All | PARTIALLY IMPLEMENTED | 57 files hold their own locale state | Root `lang="en" dir="ltr"`; language flips on navigation; no Arabic font | |
| F79 | SEO | Growth | Public | NOT IMPLEMENTED | one global `metadata`, no sitemap/robots/structured data, all pages client-rendered | Provider pages not indexable | |
| F80 | Product analytics / funnel events | Growth | Internal | NOT IMPLEMENTED | 0 tracking libraries | KPIs in report 17 are currently unmeasurable | |
| F81 | AI concierge | AI | All | NOT IMPLEMENTED | only an `integrations` registry row named "Anthropic Claude" | | |
| F82 | Legal pages | Legal | All | PARTIALLY IMPLEMENTED | `/terms`, `/privacy`, `/security`, `/about` (short) | No provider agreement, no consent capture | See report 15 |

### 2.1 Functionality that exists but is hard to discover
- **Prayer-time engine** (Umm al-Qura via `adhan`, city picker, lock windows) — buried in the provider calendar; never marketed to customers.
- **Dependents / family booking** (`client_profiles`) — a strong Saudi family-use feature, reachable only from customer settings.
- **Home-service job board** (customer posts a request, providers bid) — no entry from the landing page or services catalog.
- **Rooms/resources** — full CRUD exists but has no effect on availability.
- **Per-employee review linkage** — stored on every review, never surfaced.
- **Developer portal** — tables and UI exist with no API behind them.

### 2.2 Claim-versus-reality register (public copy the product does not back)

| Public claim | Where | Reality |
|---|---|---|
| "ZATCA E-Invoicing Compliance" (all plans) | `provider/pricing` feature matrix | Only an invoice-number sequence |
| "SMS Alerts & Reminders" (all plans) | `provider/pricing` | No reminder system exists |
| "Instant payout … in under 5 minutes" | `provider/pricing` | Manual request → admin approval |
| "secured under local SAMA regulations" | `provider/pricing` | No licensing basis documented — **requires legal confirmation** |
| "automatic refund policies" | `provider/pricing` | No refund policy logic; refund function is broken |
| 24 h free cancellation, ≤50 % late fee | `/terms` §2 | Not enforced (`cancel_booking`) |
| Standard 15 % commission | `/terms` §3 | Pricing page offers 10 % on Growth |
| "rigorous licensing, hygiene audits", "medical-grade disinfection" | `/about` | No verification workflow exists |

> These are listed because unbacked marketing claims are a consumer-protection and trust risk, not because the claims are bad goals.

---

## 3. Page & route inventory

### 3.1 Public / marketing

| Page | Route | User type | Purpose | Status | Main features | Problems |
|---|---|---|---|---|---|---|
| Home | `/` | Public | Landing | PARTIALLY IMPLEMENTED | Featured services from DB, hero, categories | Most sections static; no SEO metadata per section |
| Services | `/services` | Public | Catalog + search | FULLY IMPLEMENTED | Single search, All/Shops/Services, gender, price, home-service, scroll-collapsing categories | Client-side filtering; no distance |
| Shop profile & booking | `/shop/[id]` | Customer | Provider page + live booking | PARTIALLY IMPLEMENTED | Branches, employee pick, slots, `create_booking`, Tap checkout, dependents | Never reskinned; no portfolio; no "any professional"; 28 fallback hits |
| Login / sign-up | `/login` | All | Auth | PARTIALLY IMPLEMENTED | Email+password, portal choice, misconfig banner | No phone/OTP; provider path dead-ends |
| Become a provider | `/become-provider` | Prospect | Supply marketing | UI ONLY | Marketing copy | No application form persisted |
| Service board | `/service-board` | Public | Home-service requests | PLACEHOLDER / MOCK | Board UI | 0 DB calls |
| Category pages ×4 | `/categories/{barber,hair,makeup,spa}` | Public | Category landing | PLACEHOLDER / MOCK | Static lists | 71 % duplicated code; Arabic in LTR document |
| About / Terms / Privacy / Security | `/about` `/terms` `/privacy` `/security` | Public | Legal & trust | PARTIALLY IMPLEMENTED | Short static text | See report 15 |
| Developer portal | `/developer` | Partner | API tokens & webhooks | PLACEHOLDER / MOCK | Token create, webhook subscribe | Plaintext tokens; no API |
| Redirects | `/store`, `/discover` | — | Legacy → `/services` | — | | Client-side redirect stubs |

### 3.2 Customer (14 routes)

| Page | Route | Purpose | Status | Main features | Problems |
|---|---|---|---|---|---|
| Dashboard | `/customer/dashboard` | Home | PARTIALLY IMPLEMENTED | Upcoming booking, search, concierge cards | 9 mock hits |
| Book (resolver) | `/customer/book` | Booking entry | PARTIALLY IMPLEMENTED | Redirects to live shop or shows demo badge | Demo provider data |
| My bookings | `/customer/bookings` | History & cancel | PARTIALLY IMPLEMENTED | List, `cancel_booking` | Reschedule UI-only; no policy |
| Confirmation | `/customer/bookings/[id]/confirmation` | Receipt | PARTIALLY IMPLEMENTED | Status, price split, ICS | Demo fallback |
| Dependents | `/customer/dependents` | Family profiles | FULLY IMPLEMENTED | CRUD `client_profiles` | Consent for minors |
| Favorites | `/customer/favorites` | Saved providers | UI ONLY | | No table |
| Jobs | `/customer/jobs` | Home-service requests | PARTIALLY IMPLEMENTED | Post jobs, see bids | |
| Messages | `/customer/messages` | Chat | PARTIALLY IMPLEMENTED | Conversations | Attachments decorative |
| Notifications | `/customer/notifications` | Inbox | BROKEN / INCOMPLETE | | Table missing |
| Packages | `/customer/packages` | Owned passes | PARTIALLY IMPLEMENTED | View `user_packages` | Cannot buy |
| Reviews | `/customer/reviews` | Write/read reviews | PARTIALLY IMPLEMENTED | Review completed bookings | |
| Search | `/customer/search` | Search | UI ONLY | | Duplicates `/services` |
| Settings | `/customer/settings` | Profile | FULLY IMPLEMENTED | Profile + client profiles | No consent preferences |
| Wallet | `/customer/wallet` | Payments history | PARTIALLY IMPLEMENTED | Ledger rows | No stored balance / top-up |

### 3.3 Business / provider (20 routes)

| Page | Route | Purpose | Status | Main features | Problems |
|---|---|---|---|---|---|
| Dashboard | `/provider/dashboard` | Operations home | PARTIALLY IMPLEMENTED | KPIs, prayer countdown, search jump | Mixed live/demo KPIs |
| Calendar | `/provider/calendar` | Scheduling | PARTIALLY IMPLEMENTED | Day/week, prayer locks, shifts, city picker, buffers UI | No overnight shifts; buffers not in engine |
| Bookings | `/provider/bookings` | Appointment list | PARTIALLY IMPLEMENTED | List, status updates | |
| Services | `/provider/services` | Menu | FULLY IMPLEMENTED | CRUD | No per-employee price/duration |
| Employees | `/provider/employees` | Staff | FULLY IMPLEMENTED | CRUD, services, shifts | No invites, no permissions |
| Customers (CRM) | `/provider/customers` | Client list & notes | BROKEN / INCOMPLETE | Derived from bookings | Notes table missing |
| Messages | `/provider/messages` | Chat | PARTIALLY IMPLEMENTED | Conversations | |
| Packages | `/provider/packages` | Session passes | PARTIALLY IMPLEMENTED | CRUD | Not sellable |
| Promotions | `/provider/promotions` | Offers | BROKEN / INCOMPLETE | UI | Table missing |
| Reports | `/provider/reports` | Analytics | PLACEHOLDER / MOCK | Charts | No booking queries; invisible grid |
| Resources | `/provider/resources` | Rooms/chairs | PARTIALLY IMPLEMENTED | CRUD | Not used by availability |
| Reviews | `/provider/reviews` | Reputation | PARTIALLY IMPLEMENTED | Read reviews | No response workflow |
| Settings | `/provider/settings` | Business profile | PARTIALLY IMPLEMENTED | Profile, hours, deposit %, radius, subscription link | Some sections UI-only |
| Wallet | `/provider/wallet` | Earnings & payouts | PARTIALLY IMPLEMENTED | Balance, payout request | Fallback bypass |
| Pricing | `/provider/pricing` | Subscription | PLACEHOLDER / MOCK | 3 plans, checkout | Simulated; raw card fields |
| Jobs | `/provider/jobs` | Home-service bids | PARTIALLY IMPLEMENTED | Bid on posts | |
| Deliveries | `/provider/deliveries` | Home-service logistics | PARTIALLY IMPLEMENTED | Delivery jobs | 25 mock hits |
| Redirects | `/provider/team`, `/provider/staff-management`, `/provider/become` | — | — | | |

### 3.4 Employee / professional
There is **no employee-specific interface**. Employees (`provider_employee`) pass the provider `AuthGuard` but every provider page loads data by `owner_id`, so an employee sees the owner's shell with empty or fallback data. RLS already allows an employee to read their own bookings — the backend half exists.

| Capability | Status |
|---|---|
| Own login | PARTIALLY IMPLEMENTED (role exists; no invite flow) |
| Own dashboard / calendar / bookings | NOT IMPLEMENTED (UI) · BACKEND ONLY (RLS read) |
| Availability self-management | NOT IMPLEMENTED |
| Profile / portfolio | NOT IMPLEMENTED |
| Ratings | BACKEND ONLY (`reviews.employee_id`) |
| Commissions / earnings | BACKEND ONLY (`employee_share`, view) |
| Leave / schedule requests | NOT IMPLEMENTED |
| Notifications | NOT IMPLEMENTED |

### 3.5 Admin (30 routes) — summary of the adminwright audit
11 routes are client-side redirect stubs. Real and reliable: `/admin/services`, `/admin/integrations`. Real but unsafe or silently failing: `/admin/providers`, `/admin/ledger`, `/admin/coupons`, `/admin/branches`, `/admin/bookings` (read-only), `/admin/customers` (fabricated columns via a non-existent `String.hashCode`). Decorative: `/admin` (USD literals), `/admin/employees`, `/admin/reviews`, `/admin/taxes`, `/admin/settings`, `/admin/reports`, `/admin/packages`, `/admin/disputes` (broken), `/admin/notifications` (simulated), `/admin/activity` (presented as the audit log). Full detail: `.admin-console/manifest.json` and `.admin-console/worklog/architect-primora-audit.md`.

### 3.6 Mobile app (Expo)

| Screen | Status | Notes |
|---|---|---|
| Home `index.tsx` | PLACEHOLDER / MOCK | `mockData` |
| Explore `explore.tsx` | PLACEHOLDER / MOCK | Hand-drawn pins over mock shops |
| Bookings | UI ONLY | No data calls |
| Messages | UI ONLY | No data calls |
| Profile | PARTIALLY IMPLEMENTED | 2 Supabase calls, no sign-in |
| Service board | PARTIALLY IMPLEMENTED | 8 Supabase calls |
| Shop details modal | PARTIALLY IMPLEMENTED | `create_booking` + `payment-checkout`, mixed with mock |

> **The mobile app cannot authenticate a user**, so none of its booking paths can complete for a real customer today.
