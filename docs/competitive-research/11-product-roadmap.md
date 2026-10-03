# 11 — Product Roadmap: Development Execution Plan (P0 → P1, starting now)

> **Revised 2026-10-03 on the owner's instruction:** development is **not** paced by the 24-month business calendar. P0 and P1 are built **now, back-to-back**, step by step. Each step starts as soon as the previous step's exit checks pass. P2 and P3 follow continuously.
> The 24-month plan in report 13 now governs only the **commercial rollout** (provider sign-ups, marketing spend, hiring, new cities). It never holds back engineering.
> Item IDs (G##) refer to the master gap table in report 12.

---

## Principle

**Fix what is untrue and unsafe → open supply → enforce booking and money rules → automate communication → deepen the product → open growth surfaces.** Each step leaves the product releasable: build, type-check, lint and tests green, and nothing half-wired left visible to users.

```
P0  Launch-blocking — build first, in this order
    P0-A  Safety, truth & cleanup
    P0-B  Identity & consent
    P0-C  Supply & agreements
    P0-D  Booking rules & money
    P0-E  WhatsApp messaging
P1  Competitive core — starts the moment P0 exit checks pass
    P1-A  Platform hygiene
    P1-B  Scheduling depth
    P1-C  People & trust
    P1-D  Money depth & compliance
    P1-E  Growth surfaces
P2 / P3 continue without waiting (report 12)
```

Indicative effort with one senior engineer equivalent (ASSUMPTION): P0 ≈ 7–10 weeks, P1 ≈ 10–14 weeks. More capacity or parallel agents shorten this. **These are effort sizes, not waiting periods.**

---

## P0 — Launch-blocking

### P0-A · Safety, truth & cleanup — G05, G06, G07, G08, G04, G15, G19
| Work | Requirement |
|---|---|
| Refund function (G05) | Close `process-refund` immediately: require an admin caller exactly like `process-payout` (read `Authorization`, `auth.getUser`, check `profiles.role`), no CORS `*`, fail closed. The full rebuild comes in P0-D |
| Notification function (G06) | Require an authenticated caller. Only server-side events may target another user. Stop writing to the non-existent `notifications` table (the table itself is created in P1-A, G31) |
| Card forms (G07) | Remove raw card number / expiry / CVV state and inputs from `provider/pricing` and `shop/[id]`. Payment only through the PSP's hosted or embedded flow |
| Public claims (G08) | Remove or correct every unbacked claim (ZATCA, SMS reminders, escrow, SAMA, 5-minute payouts, automatic refunds, hygiene audits, PDPL compliance) in both Arabic and English. **Prices and fees stay as they are until the owner approves the new values** |
| Hold expiry (G04) | Expire `pending_payment` bookings after a configurable hold window; release the slot; handle a payment confirmation that arrives after expiry (confirm if the slot is still free, otherwise refund and notify) |
| Cleanup (truth) | Delete grep-bait comments (e.g., `admin/payments/page.tsx:6-9`). Remove demo-data fallbacks from **financial and tax screens**: zero rows show an empty state, a failed query shows an error state |
| Analytics & errors (G15) | Error tracking plus the funnel events in report 17 §5 (keys come from the owner, via environment variables) |
| Tests (G19) | Add a test runner to `web_platform`. First tests: negative authorization tests for every role on bookings, providers, ledger and the refund, payout and notification functions |

**Exit checks:** no unauthenticated service-role function; no card data in PRIMORA code; every public claim true; holds expire in a test; test command green.

### P0-B · Identity & consent — G09, G16, G13
| Work | Requirement |
|---|---|
| Phone identity (G09) | Phone + OTP sign-up and sign-in using the existing `send-otp` function. Remove the random `'+9665…'` fallback in `handle_new_user`; phone stays NULL until verified. Cleaning existing fabricated numbers is a **production data change — ask the owner first** |
| Keep the booking (G16) | Choosing a slot as a guest keeps service, professional, date and slot through OTP and returns to the same step (no bare redirect to `/login`) |
| Consent & data requests (G13) | `consents` table (purpose, granted/withdrawn, timestamp, method, document version). Separate opt-ins: WhatsApp, marketing, photos. Data-subject request intake plus an admin queue with a 30-day due date |

**Exit checks:** no account gets an unverified phone number; a guest can book end to end without losing the slot; every message purpose has a consent record.

### P0-C · Supply & agreements — G01, G18, G03
| Work | Requirement |
|---|---|
| Provider onboarding (G01) | `provider_applications` (business name, CR number, branch, contact, documents) → admin review queue with approve/reject plus reason → one **server-side, audited** approval operation that creates the `providers` row, the owner relationship and the `provider_owner` role → guided setup checklist (hours → services → staff → policy → share link) |
| Agreements (G18) | Versioned legal documents (customer terms, provider agreement, privacy notice) with acceptance records (user, version, timestamp, method). Text drafted from report 15 is stored as **draft** and published only after the owner confirms counsel's review. Re-acceptance when a material change is published |
| Booking link & QR (G03) | Public provider URL, QR generator and WhatsApp / Instagram share kit. `bookings.source` (marketplace, link, qr, whatsapp, instagram, walk_in, import) set server-side, plus first-visit detection per provider–customer pair |

**Exit checks:** a test business applies, is approved and takes a booking through its own link with `source = link`; every approval is audited; every provider has accepted the current agreement version.

### P0-D · Booking rules & money — G17, G10, G02, G14, G12
| Work | Requirement |
|---|---|
| Overnight shifts (G17) | Shifts that end after midnight produce slots, with tests for Ramadan-style 21:00–02:00 schedules |
| Cancellation & no-show policy (G10) | Per-provider policy (free-cancellation window, late-cancel fee %, no-show fee %, deposit %), shown before payment and on the confirmation, enforced in `cancel_booking` and in no-show marking |
| Source-based fees (G02) | A fee-rules table instead of the forced 15 % commission: own-client sources 0 %; marketplace first visit = percentage with min/max. **Numeric values need owner confirmation** (report 14 has the hypotheses); stored as data, never hard-coded |
| Audit & atomic money (G14) | `admin_audit_log` written in the same transaction as each privileged action. Payout approval and the refund rebuild become single server operations with idempotency keys, replacing the browser-side three-step ledger mutation and the wallet fallback insert |
| PSP split (G12) | Tap Marketplace sub-merchant onboarding and split at capture behind a feature flag, **off until the owner confirms the legal opinion on fund custody**. Credentials come from the owner |

**Exit checks:** policy fees and source fees calculated server-side with tests; no money mutation from the browser; 100 % of privileged actions audited; split flow passes in the PSP sandbox.

### P0-E · WhatsApp messaging — G11
| Work | Requirement |
|---|---|
| Message pipeline | `message_queue` and `message_log` (template, recipient, status, cost); a scheduled dispatcher (pg_cron or a scheduled Edge Function); retries with backoff |
| Templates (AR/EN) | Confirmation, 24 h and 2 h reminders with Confirm / Reschedule / Cancel, post-visit review + rebook, owner new-booking alert |
| Rules | Send only to verified numbers with WhatsApp consent; quiet hours; SMS fallback can wait until P1 |

**Exit checks:** in sandbox, a booking triggers confirmation and both reminders; actions update the booking; nothing is sent without consent.

**P0 complete →** soft-launch readiness (report 13 gate G-1 applies to commercial rollout, not engineering).

---

## P1 — Competitive core (starts immediately after P0)

| Step | Items | Outcome |
|---|---|---|
| **P1-A Platform hygiene** | G31 create (or remove features for) `notifications`, `expo_push_tokens`, `provider_customer_notes`, `provider_promos`; G32 honest empty/error states on every admin screen, server-side pagination, SAR everywhere; G40 CORS allow-list on all functions, hashed developer tokens (or hide the page), Next.js security patch; G39 status badges restored, WCAG AA contrast, focus rings, dashboard mobile navigation | Nothing fails silently; operators trust the numbers |
| **P1-B Scheduling depth** | G22 time off, closures, holidays, seasonal (Ramadan) schedules; G23 buffers, processing time, service variants; G20 "any available professional"; G21 atomic reschedule | Calendars match reality; higher conversion |
| **P1-C People & trust** | G24 membership model (user ↔ provider ↔ role ↔ branch) + employee "My day" + employee status updates; G26 Wathq CR verification + "verified" badge; G30 professional ratings, provider replies, moderation queue; G42 professional profiles and portfolios (consented photos) | Staff use PRIMORA hourly; trust signals are real |
| **P1-D Money depth & compliance** | G33 disputes, refunds and daily PSP reconciliation; G34 fee ledger and collection beyond the deposit; G38 real subscription billing and plan entitlements (prices confirmed by the owner); G25 ZATCA Phase 2 through a certified partner (Wave 25 deadline **2027-02-01**) | Money is complete and compliant |
| **P1-E Growth surfaces** | G27 single locale provider, server `lang`/`dir`, Arabic font; G28 server-rendered provider, category and district pages, sitemap, schema.org; G29 server search with Arabic normalization + distance; G35 client import; G41 post-visit rebook; G43 monthly "PRIMORA brought you…" summary; G37 home-service privacy and capture model; G36 mobile app connected to real data or withheld (owner decision) | Ready for marketplace growth |

**P1 complete →** P2 starts immediately (waitlist, packages, coupons, tips, gifts, referrals, multi-service, walk-ins, reports, maps, AI receptionist groundwork).

---

## What still waits, and why

Only **spending and expansion** decisions wait for evidence: paid consumer advertising, hiring field sales beyond the first sellers, second city, GCC. Those keep the go/no-go gates in report 13. Engineering does not wait for them.

## Dependencies that fix the order inside P0

| Dependency | Why |
|---|---|
| P0-A before everything | Money and messaging holes must be closed before real users arrive |
| P0-B before P0-E | WhatsApp needs verified numbers and recorded consent |
| P0-C before P0-D fee rules | Fees depend on `bookings.source` and first-visit detection |
| Legal opinion before enabling G12 | The split is built behind a flag; turning it on is the owner's decision |
| Owner values before enabling G02 and G38 | Mechanisms ship as data; numbers are business decisions |
