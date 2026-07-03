# PRIMORA — Work Plan for Gemini (handoff from Claude Code)

> **Prepared:** 2026-07-03 · **Baseline:** `master @ 20f66c0` (= `claude-code` = origin, clean tree, build green)
> **Read this whole file before editing anything.** Start from the latest `master`, work ONLY on the `gemini` branch, and follow the Golden Rules in `.cursorrules` / `.coworking_changelog.md` (no branch switching, no force-push/reset, no overwriting other agents' files, append a changelog entry when done).

---

## 0 · Where the project stands right now

| Area | State |
|---|---|
| Build | `npm run build --workspace=web_platform` → EXIT 0, TypeScript clean |
| Dashboards | Admin (light-lux, control plane: services CRUD + featured, providers/shops mgmt w/ performance, payments registry, integrations registry) · Customer (light) · Provider (**mixed theme — see §2, the main problem**) |
| Public | Landing (featured rail admin-driven) · `/services` (dynamic catalog w/ gender filter + photos) · `/store`,`/discover` redirect to it |
| Supabase | Linked to `vpszcnxsgmoavkqorjzt`. **⚠ 2 migrations committed but NOT applied** (CLI token expired): `20260703014433_phase2_admin_control_plane.sql` and `20260703080424_admin_shop_management.sql`. Human must run `npx supabase login` then `npx supabase db push --linked`. All UI has demo-data fallbacks so nothing crashes meanwhile. |
| Edge functions | `payment-checkout`, `payment-webhook`, `send-otp`, `send-push`, `calculate-travel` — deployed. No payout/refund/prayer/notification-dispatch functions yet. |
| Money model (DB) | `bookings`: total_price, deposit_required (per-provider %), tax_amount (15% VAT), platform_commission · `transactional_ledger`: total_captured, platform_share, provider_share, employee_share, payout_status · `payment_methods` registry (pending migration) |

---

## 1 · ERRORS TO FIX (priority order)

**P0-1 · Provider theme clash — text/buttons disappearing (the user's main complaint).** See §2 for full spec. Root cause: `provider/layout.tsx` main content background is a **light ivory gradient** (`#F8F6EF → #E9E2D2`, line ~229), the dashboard page was reskinned light to match — but **17 other provider pages are still obsidian-dark** (`text-white`, `text-[#B8C0D4]`, `bg-white/[0.03]` glass buttons) and have **no dark page background of their own**, so their white text and 3%-white buttons render on the light shell and vanish. Worst offender: `provider/calendar/page.tsx` (Day/Week pill, "Manage" buttons, panel headers at lines ~694/720/728/859/941/1007/1051, price labels).

**P0-2 · Fake prayer countdown.** `provider/dashboard/page.tsx` line 37: `useState(4354)` looping seconds + hardcoded "Asr" (line ~264). Calendar prayer buffers are static too. Replace with real calculation — full spec in §5.

**P1-3 · Duplicate/orphan routes** (§3): `provider/employees` re-exports `provider/team`; `provider/staff-management` (169-line older page) is orphaned; `provider/pricing` not in nav; admin has 6 overlapping clusters.

**P1-4 · Synthesized provider contact data.** `admin/providers/provider-management.tsx` (~line 540) fabricates email/phone from a hash because `providers` has no contact columns. Add `contact_email`, `contact_phone` columns (migration) or join the owner profile, then persist them from the edit modal (the modal already has the fields — they just don't survive reload for DB rows).

**P1-5 · Derived (not real) analytics.** Employee cancelled/no-show/utilization/repeat-customers and shop revenue in admin provider detail are deterministic placeholders (`TODO(analytics)` comments mark every spot). After migrations apply, read `admin_provider_performance` view for shop-level truth; employee-level needs the rollup in §4.
Also `admin/services` `providersCount` is hardcoded 1/0.

**P2-6 · Decorative controls:** provider dashboard header search input filters nothing; calendar Day/Week pill has no week view; chat attach/emoji buttons (documented, waiting on a Storage bucket).

**P2-7 · Wallet ≠ payouts.** `provider/wallet` and `admin/ledger` read `transactional_ledger`, but there is no payout request/settlement flow — `payout_status` never changes. §4 fixes this.

---

## 2 · THEME / COLOR UNIFICATION (fixes the disappearing buttons)

**Decision (recommended): re-skin all dark provider pages to the light-lux system** already used by `provider/dashboard`, the whole admin, and the customer dashboard. One theme everywhere = brand-consistent and ends this class of bug permanently.

**Canonical light-lux tokens (copy from `provider/dashboard/page.tsx` / admin pages):**
- Page text `#101828` · card `bg-white` + `border-[#ECECEC]` + `shadow-[0_8px_30px_rgb(0,0,0,0.015)]` · muted text `#667085` · gold accent `#D1AF47` (hover `#E0C46A`, deep `#9A741F`) · success `#22C55E`/`#027A48` · danger `#EF4444`/`#B42318` · chip bg `#F7F3E8`
- Replace, per page: `text-white`→`text-[#101828]` (headings) / `text-[#344054]` (body); `text-[#B8C0D4]`/`text-[#7B859C]`→`text-[#667085]`; `bg-[#111827]` cards→`bg-white border border-[#ECECEC]`; `bg-white/[0.03..0.08]` glass buttons→`bg-white border border-[#ECECEC] text-[#667085] hover:border-[#D1AF47]/40`; `border-white/[0.06]`→`border-[#ECECEC]`; keep `#D1AF47`, `#FF5D73`→`#EF4444`, `#3DDC84`→`#22C55E`.

**Pages to convert (17), in this order:** `calendar` (P0 — the reported one), `bookings`, `services`, `wallet`, `team`, `settings`, `reports`, `customers`, `messages`, `promotions`, `packages`, `deliveries`, `resources`, `jobs`, `reviews`, `pricing`, then delete-or-redirect `staff-management`.

**Do NOT touch:** the dark provider **sidebar** in `provider/layout.tsx` (dark charcoal + gold is intentional contrast), the admin dark sidebar, or the customer dashboard.

**Acceptance:** open every provider page in EN and AR — zero invisible text/buttons; every interactive element has visible default, hover, and active states; contrast ≥ WCAG AA for body text.

---

## 3 · DUPLICATE TABS & FEATURE CLASHES — consolidation map

### Provider (3 staff pages → 1)
| Route | State | Action |
|---|---|---|
| `/provider/employees` | in nav; re-exports team page | **Keep as canonical URL** |
| `/provider/team` | 1240-line real implementation, NOT in nav | Move its content INTO `employees/page.tsx`; make `team` a redirect |
| `/provider/staff-management` | 169-line older orphan | Delete page → redirect to `/provider/employees` |
| `/provider/pricing` | orphan (subscription plans) | Link it from Settings ("Subscription") or from the sidebar footer; don't leave unreachable |

### Admin (30 pages; 6 overlapping clusters → consolidate to ~22 tabs)
| Cluster | Pages (lines) | Action |
|---|---|---|
| Bookings vs Orders | `bookings` (273) vs `orders` (138) | `orders` duplicates booking rows with another name → make `/admin/orders` redirect to `/admin/bookings`; remove nav item |
| Analytics vs Reports | `analytics` (256) vs `reports` (83) | Merge: keep `/admin/analytics` content, mount it as the default tab of `/admin/reports`; redirect analytics |
| Logs ×3 | `activity` (187), `audit-logs` (100), `system-logs` (110) | One `/admin/activity` page with 3 filter tabs (Platform feed · Audit · System); redirect the other two |
| Locations ×3 | `branches` (193, real table), `locations` (113), `rooms` (102) | `branches` is canonical (DB-backed). Fold rooms as a sub-section of a branch detail; redirect `locations` |
| Staff ×2 | `employees` (454, real), `teams` (130) | `employees` canonical; redirect `teams` |
| Finance ×4 | `payments` (345, methods+txns), `ledger` (596, settlement), `commissions` (112), `taxes` (102) | Keep `payments` + `ledger`; convert `commissions` and `taxes` into settings-style tabs INSIDE `ledger` (they're config, not workflows). Nav shrinks by 2 |

**Rule for every consolidation:** old route keeps working via a client redirect (pattern: see `web_platform/src/app/store/page.tsx`); remove the nav item from the layout; note it in the changelog. Never hard-delete a URL.

---

## 4 · MISSING APIs + ACCOUNTANT FEATURES (payments correctness)

### 4.1 Database (one migration, extend — don't duplicate)
```sql
-- payout workflow
CREATE TABLE payout_requests (
  id uuid PK, provider_id uuid REFERENCES providers,
  amount numeric(10,2), method_key text,            -- from payment_methods (bank_transfer / wallet)
  status text CHECK (status IN ('requested','approved','paid','rejected')),
  bank_reference text, requested_at timestamptz, processed_at timestamptz, processed_by uuid
);
ALTER TABLE transactional_ledger ADD COLUMN payout_request_id uuid REFERENCES payout_requests;
-- invoice numbering (ZATCA-ready)
ALTER TABLE bookings ADD COLUMN invoice_number bigint;  -- from a sequence, set on completion trigger
-- provider contact (fixes P1-4)
ALTER TABLE providers ADD COLUMN contact_email text, ADD COLUMN contact_phone text;
-- accountant views (security_invoker, admin RLS applies):
--   monthly_vat_summary        (month, provider_id, taxable_base, vat_collected)
--   provider_settlement_summary(provider_id, period, gross, commission, vat, net_payable, cash_collected)
--   employee_earnings_summary  (employee_id, period, completed, revenue, employee_share)
```

### 4.2 Edge functions to add
| Function | Purpose | Notes |
|---|---|---|
| `request-payout` | provider requests payout of unsettled provider_share | validates balance from ledger; inserts payout_requests |
| `process-payout` | admin approves/marks paid; stamps ledger rows `payout_status='paid'` + batch/bank ref | admin-only (is_admin) |
| `process-refund` | calls Tap refund API for an approved `payment_refund_requests` row; writes negative ledger entry | needs live Tap secret (placeholder until provided) |
| `send-notification` | drains the admin notifications queue → WhatsApp (Unifonic/Twilio) + Expo push | keys missing — implement with clear placeholder + integrations-registry health update |
| `prayer-times` (optional) | server-side prayer schedule per lat/lng/date | only if mobile needs it; web should compute client-side (§5) |

### 4.3 Accountant-facing features (UI)
1. **Settlement statement per provider per month** (admin/ledger): gross captured → platform commission → VAT (15%) → **net payable**, with the exact ledger rows behind each number and a CSV export button. Distinguish **card/online revenue (payable to provider)** from **cash-on-service (commission receivable FROM provider)** — sign matters.
2. **VAT report** (admin/taxes tab): output VAT collected per month, per provider, platform-wide total — from `monthly_vat_summary`.
3. **Payout reconciliation** (admin/ledger): pending payout requests list → approve → mark paid with bank reference; ledger rows flip to `paid`; provider wallet reflects it.
4. **Employee share statement** (provider/wallet + admin provider detail): from `employee_earnings_summary` — ledger already carries `employee_share` but no UI reads it.
5. **Wallet balance = SUM(unsettled provider_share) computed from ledger** — never a stored number.
6. **Invoice numbers + ZATCA phase-1 QR** (TLV base64: seller, VAT no., timestamp, total, VAT) on the booking receipt. Keep VAT number as a placeholder setting in admin/settings until the business provides it.

---

## 5 · REAL PRAYER TIMES + COUNTDOWN

**Approach: client-side calculation with the `adhan` npm package** (no API key, offline, exact for KSA using the **Umm al-Qura** method). Fallback/verification API if ever needed: `api.aladhan.com/v1/timings?latitude=..&longitude=..&method=4` (free, no key).

1. `npm i adhan` (web_platform).
2. New hook `web_platform/src/lib/use-prayer-times.ts`:
   - Inputs: lat/lng (default Riyadh 24.7136, 46.6753; use the provider's branch coordinates when available — `branches.latitude/longitude`).
   - `CalculationMethod.UmmAlQura()`, Shafi madhab.
   - Returns: today's 5 times, `nextPrayer` (name EN/AR: Fajr/الفجر, Dhuhr/الظهر, Asr/العصر, Maghrib/المغرب, Isha/العشاء), `secondsUntilNext` (live, 1s tick), and lock-window state: `lockStartsIn` / `isLocked` / `resumesIn` given configurable buffers (default lock 10 min before → resume 30 min after; read per-provider overrides from provider settings, where the calendar already shows buffer sliders).
3. Wire it in:
   - `provider/dashboard/page.tsx`: replace `useState(4354)` + hardcoded "Asr" — show real next-prayer name + real countdown; progress bar = elapsed fraction of the gap between previous and next prayer.
   - `provider/calendar/page.tsx`: "Prayer Operations Control" panel uses real times; the per-prayer buffer inputs (Dhuhr/Asr/Maghrib) feed the lock windows; "Auto Resume" countdown real.
   - Booking slot generation: exclude slots inside a lock window (extend the existing `get_available_slots` RPC with prayer windows server-side later — client-side filter is acceptable first).
4. Acceptance: countdown matches aladhan.com for Riyadh within ±1 min; names bilingual; survives midnight rollover (recompute for tomorrow's Fajr after Isha).

---

## 6 · EXECUTION ORDER (with per-phase acceptance)

| Phase | Work | Done when |
|---|---|---|
| 1 | §2 theme fix: calendar first, then the other 16 provider pages | No invisible controls on any provider page, EN + AR |
| 2 | §5 prayer times (hook + dashboard + calendar) | Real countdown matches aladhan.com |
| 3 | §3 consolidation (provider staff pages, then admin clusters) | Old URLs redirect; nav has no duplicates; build green |
| 4 | §4.1 migration + §4.3 items 1–3 (settlement, VAT, payouts) | Accountant can produce a monthly provider statement + VAT total from real ledger rows |
| 5 | §4.2 edge functions (payout pair first; refund/notification with placeholders for missing keys) | request→approve→paid flow updates wallet + ledger |
| 6 | P1-4 contact columns, P1-5 real analytics from views, employee share UI | Admin provider detail shows DB-truth numbers |

**Safety rules (mandatory):** work on `gemini` branch starting from latest `master`; never switch to other agents' branches; never rebase/reset/force-push; commit in logical groups; run `npm run build --workspace=web_platform` before each commit batch; append a `.coworking_changelog.md` entry; keep bilingual EN/AR + RTL on everything you touch; do not break the admin control plane (`admin/services`, `admin/providers`, `admin/payments`, `admin/integrations`), the `/services` catalog, or the dev-role-switcher.

**Blocked on the human (not Gemini):** `npx supabase login` + `npx supabase db push --linked` (applies the 2 pending migrations + any new one from §4.1); Tap live secret for refunds; Unifonic/Twilio + WhatsApp keys; company VAT number for ZATCA QR.
