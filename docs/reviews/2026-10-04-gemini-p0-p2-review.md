# Review and fix: Gemini milestones P0–P2 (2026-10-04)

Branch: `claude-code`. Reviewer and fixer: Claude Code. This document records what the review found in
Gemini's P0, P1 and P2 work (and in older code it touched), what was fixed, how it was verified, and what
remains for the owner or for later passes.

## 1. Outcome by operational domain

### Booking
- **Found:** four migrations could never apply (wrong column names, wrong enum default, missing service-role
  claim); overloaded `create_booking`/`get_available_slots` were ambiguous through PostgREST; discounts were
  applied in the browser after pricing; walk-ins created fake customer profiles; prayer times were hard-coded;
  anonymous visitors could confirm attendance on any booking; the web shop page ran on mock shops, staff,
  slots and reviews (since June); the mobile app ran entirely on `mockData.ts` and had no sign-in.
- **Now:** one server-priced `create_booking` (fee rules, coupon/gift/loyalty, VAT, provider deposit %, slot
  check, block/strike rules); walk-ins at 0% fee without fake profiles; client-supplied Umm al-Qura prayer
  windows; real cancellation policy and refund requests; reschedule notice rule; hold expiry releases
  discounts. Web shop page and the whole mobile app read live data; mobile has phone-OTP sign-in.
- **Migration:** `20261005000000_review_fix_booking_core.sql`. Tests: `supabase/tests/db/booking.test.mjs`.

### Money
- **Found:** gift cards, packages, tips and subscriptions were activated without payment; payouts could be
  double-spent and exceed balance; the monthly fee invoice was always 0; PSP reconciliation always reported
  "matched"; ZATCA invoices were marked "reported" with no submission; `payment-checkout` had a syntax error;
  admin bookings printed "simplified tax invoices" with an invented VAT number; the booking confirmation page
  showed a mock booking when the lookup failed; disputes fell back to editing booking status (no refund).
- **Now:** purchases are pending until Tap confirms (`confirm_purchase_payment`); refunds go through
  `refund_requests` and the `process-refund` function with an idempotency key; payouts use allocations and
  idempotency; reconciliation compares Tap's daily totals (`reconcile-psp`) or records "awaiting PSP data";
  tax invoices are issued server-side only when the provider has a VAT number, status `not_submitted`;
  dispute decisions require a reason and run only through `resolve_booking_dispute`.
- **Migration:** `20261005010000_review_fix_money.sql`. Tests: `money.test.mjs`.

### Trust, onboarding and messaging
- **Found:** providers could self-verify their CR and self-approve via `providers.status`; draft legal texts
  were published as "licensed"; `dispatch-messages` fabricated WhatsApp ids; the admin broadcast sent to the
  placeholder number +966500000000 and reported success; chat pages showed seeded threads and simulated
  replies; the request board let providers set their own bids to "accepted" while the customer's accept
  silently changed nothing.
- **Now:** Wathq verification (`wathq-verify`) or an audited admin review; agreements accepted only when
  published; real WhatsApp sends via `claim_message_batch`/`complete_message_delivery` with consent, verified
  phones and quiet hours; `admin_broadcast_notification` (in-app + WhatsApp only with WhatsApp **and**
  marketing consent, audited); real inboxes on web and mobile; `accept_job_bid` with status triggers.
- **Migrations:** `20261005020000_review_fix_trust_growth.sql`, `20261005030000_review_fix_job_board.sql`,
  `20261005040000_review_fix_admin_broadcast.sql`. Tests: `trust.test.mjs`, `jobs.test.mjs`, `admin.test.mjs`.

### Catalogue, discovery and SEO
- **Found:** `/services` invented shops, services, ratings and review counts; the landing page invented
  ratings and advertised a non-existent code `PRIMORA15`; `/discover` read `data.results` while the RPC
  returns `providers`, so it always showed zero shops; the sitemap listed `?lang=` and district URLs the app
  does not serve and no shop pages.
- **Now:** ratings only from published reviews ("New" otherwise); verified providers only; discover fixed;
  sitemap lists real routes and every verified `/shop/{id}` (hourly revalidation); shop pages get server
  metadata.

### Customer and provider portals
- Removed demo fallbacks from the customer dashboard, reviews (which also never hid already-reviewed visits),
  dependents, provider dashboard, resources, admin services/activity, search; `/customer/book` and
  `/service-board` now forward to the real flows; the simulated courier board (no backend) was removed.
- Provider settings: hours are applied to staff schedules (`employee_availability`, which drives slots), the
  home-service radius saves to `branches`, and deposit/notification saves report real errors.

### Copy and claims
- Removed "escrow", "licensed gateway", "flat 15% commission" and "ZATCA & Payments" wording. Fees, payouts
  and cancellation text now match the system: 20% (SAR 10–40) on a first marketplace visit, 0% on repeat
  marketplace visits and own clients; each shop sets its cancellation policy; shop-cancelled bookings are
  refunded in full. A guard test blocks these phrases from returning.

### Platform
- G15: funnel events wired (`trackEvent`); PostHog is not loaded until a key and an analytics-consent
  decision exist. G27: IBM Plex Sans Arabic and pre-paint `lang`/`dir`; the language no longer resets on
  mount. G39: dashboard skin no longer repaints status pills or breaks `sticky`. G40: Next.js 16.3.8.
- CI now runs DB, web and admin-control tests, lints and type-checks every Edge Function, and fails on
  critical advisories in shipped dependencies.

## 2. Verification (on this branch)

| Check | Result |
| --- | --- |
| `npm run test:db` (PGlite, all migrations from scratch) | 50 / 50 pass |
| `npm run test --workspace=web_platform` | 103 / 103 pass |
| `npm run test:security-core`, `npm run test:admin-controls` | pass |
| `npm run typecheck:mobile`, `npx tsc --noEmit` (web) | 0 errors |
| ESLint web / mobile | 0 errors (warnings pre-existing) |
| `npm run build --workspace=web_platform` | pass |
| `deno check` + `deno lint` on all Edge Functions | pass |
| `npm audit --omit=dev --audit-level=critical` | pass (0 critical) |
| Browser check (Arabic landing, RTL, font) | verified |
| adminwright `validate --phase release` | **exit 1 — 279 errors** |
| adminwright `coverage` | **exit 1 — 26 errors** |

The adminwright gates are not met. The errors are manifest states (screens and work queues not yet marked
implemented/reviewed, missing tests/evidence, unresolved gaps); 24 evidence references now point past the
end of files that this branch rewrote. Closing them requires the independent ux-reviewer, security and QA
passes; an implementer may not mark its own work reviewed. The earlier changelog statement that adminwright
validation "passed with 0 errors" does not hold for the release phase.

## 3. Owner decisions and blockers

1. **Supabase project `vpszcnxsgmoavkqorjzt` no longer resolves in DNS.** Nothing can be deployed or used
   until a project exists and these migrations are applied to it.
2. **Vercel deploys `master` to production even when CI fails.** Require CI before promotion.
3. **Credentials:** Tap (secret key, webhook), WhatsApp Cloud API, Wathq, Vault secrets `project_url` and
   `service_role_key` for pg_cron; approve the Meta templates (including `primora_broadcast_notice`).
4. **Commercial values:** loyalty and referral programmes are off (`platform_settings`) until values are
   approved; the fee rules above should be confirmed.
5. **Legal:** publish the customer terms and privacy notice after counsel review; legal opinion on the
   payment split before enabling it; ZATCA onboarding before any invoice is submitted.
6. **Provider VAT numbers** are required before tax invoices can be issued for that provider.
7. **Analytics:** choose PostHog (or another tool) and the consent approach before loading it.
8. **Sensitive data:** provider IBANs are still visible to every admin; nobody has approved that.

## 4. Remaining work

- Run the adminwright passes (ux-reviewer, security, QA, harvester) and update the manifest from evidence.
- Mobile sessions are not persisted across app restarts (no storage adapter); add
  `@react-native-async-storage/async-storage` with Expo's install command.
- Home-service booking UI is not built (only the eligibility flag and radius).
- Expo/React Native tooling advisories (high) await an Expo SDK upgrade; `eslint-config-next` pulls a
  lint-only `braces` ReDoS.
- Gemini's `gemini` branch must merge `master` before any further work, so these fixes are not reverted.
