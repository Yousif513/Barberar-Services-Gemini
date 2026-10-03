# 08 — Technical Architecture Audit

> **Research date:** 2026-10-03, repository at `codex` @ `734fcd9`. Verified by reading code and migrations; build and type-check results from the same session.
> This is an audit, not a change. Nothing has been modified.

---

## 1. Architecture at a glance

| Layer | What exists | Assessment |
|---|---|---|
| Web | Next.js 16.2.9, React 19.2.4, Tailwind 4; 81 pages, **81/81 `"use client"`**, 0 server components, 0 route handlers, 0 server actions, no middleware | Works as a single-page app over Supabase. No server layer for secrets, SEO, rate limiting or authorization beyond RLS |
| Mobile | Expo, 6 screens; home and explore 100 % mock data; no sign-in | Not production. Shares no data layer with web |
| Database | Supabase Postgres 15: 30 tables, RLS on 30/30, 84 policies, 18 functions, 5 views, 9 triggers, 0 scheduled jobs | **Strongest part of the system** |
| Edge Functions | 9 Deno functions | Mixed: payment capture sound; refund and notification unsafe |
| Payments | Tap charge (deposit) + verified webhook | Capture correct; refund, payout and custody model need redesign |
| Messaging | Twilio WhatsApp OTP function (mock without env); no reminders; no email | Missing |
| Observability | None (no error tracking, no product analytics, `[analytics] enabled = false` in `supabase/config.toml`) | Blind in production |
| Tests | None. Two grep scripts | No safety net |
| Build health | Web build exit 0; mobile typecheck exit 0; ESLint 0 errors / 353 warnings (186 `any`); `npm audit` 28 issues (13 high, including Next.js 16.2.9 → patched in 16.3.x) | Builds, but unguarded |

---

## 2. What is technically strong

1. **Booking integrity in the database.** `EXCLUDE USING gist (employee_id WITH =, booking_window WITH &&) WHERE status IN ('pending_payment','confirmed')` makes double-booking impossible even under concurrent requests.
2. **Server-derived pricing.** `create_booking` takes no price; price, VAT (15 %), commission and deposit are computed from the service and provider rows.
3. **Status machine.** `validate_booking_status_transition` blocks illegal transitions.
4. **Verified reviews by construction.** Only the booking's customer, only after `completed`, one per booking.
5. **Webhook verification.** `payment-webhook` re-fetches the charge from Tap and validates id, status, currency and amount; `payment_intent_id` is unique.
6. **Role escalation closed.** Column-level grants stop users updating their own `role`; `set_user_role` is admin-only.
7. **Referential safety.** Bookings reference employees and services with `ON DELETE RESTRICT`, so history cannot be destroyed by deleting a staff member.

---

## 3. Critical technical risks

| # | Risk | Evidence | Consequence | Recommendation | Priority |
|---|---|---|---|---|---|
| T1 | Unauthenticated refund function | `supabase/functions/process-refund/index.ts`: no auth check, service role, CORS `*`, calls Tap refund, then writes a status value that is not in the enum | Anyone with the public key can trigger real refunds; DB does not record them | Disable immediately; rebuild admin-gated, idempotent, single transaction | **P0** |
| T2 | Unauthenticated notification function | `send-notification`: no auth, pushes to any `userId`; also writes to a `notifications` table that does not exist | Phishing vector through PRIMORA's own push channel | Require caller identity and server-side triggers only | **P0** |
| T3 | No provider creation path | Only `INSERT INTO providers` is the demo seed; admin "add" is React state | Marketplace cannot onboard supply | Server-side approval operation | **P0** |
| T4 | Payment holds never expire | No scheduler; `pending_payment` bookings stay in the exclusion constraint forever | Slots permanently blocked; trivial abuse | Scheduled expiry (pg_cron or scheduled function) | **P0** |
| T5 | Fabricated phone numbers | `handle_new_user` stores `'+9665' || random 9 digits` when no phone is given | Messages to real strangers; unique-constraint collisions | Require verified phone or allow NULL | **P0** |
| T6 | Money mutations from the browser | `admin/ledger` 3-step payout writes from React; `provider/wallet` falls back to a direct insert | Partial writes, double payouts, no audit | One server operation per money action with idempotency key | **P0** |
| T7 | Four tables queried but never created | `notifications`, `expo_push_tokens`, `provider_customer_notes`, `provider_promos` | Features fail silently against a real database | Create via migration or remove the features | **P1** |
| T8 | Developer API tokens stored in plaintext | `developer/page.tsx:253` "store directly for simple sandbox demo"; no API consumes them | Credential exposure; misleading feature | Hide the page until there is an API; store hashes only | **P1** |
| T9 | CORS `*` on service-role functions | 7 of 9 functions | Any website can call them from a visitor's browser | Allow-list PRIMORA origins | **P1** |
| T10 | Unbounded list queries | Admin and provider lists select all rows; `max_rows = 1000` | Silent truncation at 1,000 rows | Server-side pagination | **P1** |
| T11 | Known vulnerable dependency | Next.js 16.2.9 flagged high | Exposure | Patch upgrade (owner's decision; not done here) | **P1** |

---

## 4. Scalability assessment

| Dimension | Today | Breaks at | What to change, and when |
|---|---|---|---|
| Slot computation | `get_available_slots` per employee per day, 15-min loop in PL/pgSQL | "Any professional" across 10+ staff and 7 days becomes 70 calls per page view | Batch function per branch/date range; cache per day; invalidate on booking |
| Search | Client-side filter of full table selects | ~1,000 providers (row cap) | Server search with indexes; Postgres full-text + trigram for Arabic; PostGIS or earthdistance for distance |
| SEO / first load | All client-rendered | Immediately — Google sees empty shells | Server-render public pages (provider, category, district) |
| Timezone | `+03` / `Asia/Riyadh` hardcoded in 6 migrations | First UAE (+04) branch | Store IANA timezone per branch; compute in branch time |
| Notifications | None | Launch | Queue table + worker; WhatsApp provider; retry with backoff |
| Scheduled work | 0 jobs | Launch (hold expiry, reminders, payouts, reconciliation) | pg_cron or scheduled Edge Functions |
| Payments | One PSP, deposit only | Split payouts, refunds, chargebacks | PSP marketplace product; ledger with double entry |
| Multi-tenancy | Provider scoping via `owner_id` | Employees, multi-branch managers | Membership table (user ↔ provider ↔ role ↔ branch) |
| Mobile | Separate mock data | Launch | Shared typed data layer and the same RPCs |

Supabase itself is a reasonable platform up to tens of thousands of bookings per day if queries are indexed and paginated; the constraints above are design limits, not platform limits.

---

## 5. Data model gaps

| Missing | Purpose |
|---|---|
| `provider_applications` | Supply onboarding and verification |
| `bookings.source` + first-visit marker | Source-based pricing and attribution |
| `cancellation_policies` (per provider) | Enforceable policy |
| `staff_time_off`, `branch_closures`, seasonal schedules | Real availability |
| Service variants, buffers, processing time | Accurate durations |
| `memberships` (user ↔ provider ↔ role ↔ branch) | Employees and managers |
| `consents` (purpose, time, method, withdrawal) | PDPL |
| `message_log` (template, recipient, status, cost) | WhatsApp operations and cost control |
| `admin_audit_log` | Accountability |
| `refunds`, `disputes`, `chargebacks` | Money after the booking |
| `subscriptions`, `plans`, `invoices` | Real SaaS billing |
| `refunded` / `partially_refunded` booking or payment states | Refund lifecycle |
| Branch `timezone` | GCC readiness |

---

## 6. Booking edge cases

| # | Edge case | Current behaviour | Risk | Recommended handling |
|---|---|---|---|---|
| E1 | Two customers book the same slot simultaneously | Exclusion constraint rejects the second | None | ✓ Keep; show friendly "just taken" message |
| E2 | Customer abandons payment | Booking stays `pending_payment` forever, slot blocked | High | Expire after hold window; release slot |
| E3 | Webhook arrives after hold expiry | Not designed | Paid booking for a released slot | If slot still free → confirm; else auto-refund and notify |
| E4 | Webhook arrives twice | Unique `payment_intent_id` | Low | ✓ Keep idempotent |
| E5 | Customer pays but webhook never arrives | Booking stuck pending | Medium | Reconciliation job polls PSP for pending charges |
| E6 | Shift crosses midnight (21:00–02:00) | `get_available_slots` builds end time on the same date → **zero slots** | High in Ramadan | Shift end on next day when end < start |
| E7 | Booking spans a prayer window | Prayer windows block slots (provider configured) | Medium | Allow provider rule: block, pause-and-extend, or ignore per service |
| E8 | Provider changes service price after booking | Price stored on booking ✓ | Low | ✓ Keep; show "price at booking" |
| E9 | Provider changes service duration after booking | Existing booking window unchanged ✓ | Low | Warn on conflicts with later bookings |
| E10 | Employee deleted with future bookings | `ON DELETE RESTRICT` → delete fails | Medium (UX) | Deactivate instead; reassign or cancel future bookings with notice |
| E11 | Employee calls in sick | No time-off; owner must cancel manually | Medium | Time-off → affected bookings list → reassign / notify |
| E12 | Provider cancels | Allowed via status; no refund, no notice | High | Provider cancellation = full refund + notification + reliability score |
| E13 | Customer cancels 1 h before | Allowed, no fee (Terms say up to 50 %) | High | Enforce provider policy |
| E14 | No-show | Owner can mark; no fee | Medium | Charge per policy against deposit |
| E15 | Customer late 20 min | Not modelled | Medium | Grace period + provider choice |
| E16 | Booking for a dependent | Supported ✓ | Low | Guardian consent for minors |
| E17 | Branch closed for Eid | No closures table | High in season | Closures block slots |
| E18 | Daylight saving | Not applicable in KSA; relevant for future markets | Low | Branch IANA timezone |
| E19 | Customer books two services back to back | Two separate bookings, separate payments | Medium | Multi-service booking |
| E20 | Group booking (wedding party) | Not supported | Medium | Group booking with per-guest services |
| E21 | Coupon applied | Never redeemed | Medium | Redeem in `create_booking`, single use per rule |
| E22 | Package session used | No redemption path | Medium | Redeem sessions at booking |
| E23 | Home-service address outside radius | Distance calc with mock "10 km" fallback | Medium | Validate radius server-side; never mock |
| E24 | Partial refund | Not supported | Medium | Refund table with amount and reason |
| E25 | Chargeback | Not modelled | High | Dispute case + evidence + PSP liability shift |
| E26 | Customer account deleted with future bookings | Not designed | Medium | Cancel future bookings; retain financial records per ZATCA retention (**requires legal confirmation**) |
| E27 | Duplicate customer accounts (email + phone) | Phone is fabricated for email users | High | Phone as primary identity; merge flow |
| E28 | Provider suspended with future bookings | Not designed | High | Suspension workflow: notify, refund or transfer |

---

## 7. Security and compliance posture

- **Good:** RLS on all tables, role escalation blocked, server pricing, webhook verification, verified reviews.
- **Bad:** two unauthenticated service-role functions, CORS `*`, plaintext tokens, raw card fields in two pages (`provider/pricing`, `shop/[id]`), no audit log, no rate limiting, no consent records, IBANs shown unmasked to all admins.
- **Missing process:** no tests (especially negative authorization tests), no error tracking, no backup/restore drill documented, no incident runbook.

---

## 8. Recommended technical sequence

1. **Close the money and messaging holes:** disable `process-refund`; gate `send-notification`; remove raw card forms; restrict CORS.
2. **Make booking inventory honest:** hold expiry, overnight shifts, time-off/closures, reconciliation job.
3. **Open supply:** provider application → approval operation → membership roles.
4. **Add the server layer you need:** route handlers or server actions for privileged operations, server-rendered public pages for SEO.
5. **Add observability and tests:** error tracking, funnel events, authorization negative tests, booking engine tests.
6. **Then** scale features (WhatsApp, search, analytics).
