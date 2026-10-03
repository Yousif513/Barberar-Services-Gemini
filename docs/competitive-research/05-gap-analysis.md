# 05 — PRIMORA Gap Analysis

> **Research date:** 2026-10-03. Evidence references point to report 01 (`F##` = feature row) and report 02 (competitor sources).
> Priority: **P0** critical · **P1** important · **P2** useful · **P3** later. Complexity: **S / M / L / XL**.
> **Nothing in this report has been implemented.** These are recommendations for the owner to approve.

---

## A — PRIMORA already has this (competitive today)

| Capability | Evidence | Why it is competitive |
|---|---|---|
| Database-enforced double-booking prevention | `EXCLUDE USING gist (employee_id, booking_window)` | Correct under concurrency; many apps check in application code only |
| Tamper-proof booking pricing | `create_booking` has no price parameter; price/VAT/commission server-derived | Removes a whole class of payment fraud |
| Verified reviews | Only the customer, only a `completed` booking, one per booking | Fake-review resistance is a trust moat in a marketplace |
| Real-time slots with employee selection | `get_available_slots`, `shop/[id]` | Table stakes, done |
| Gender-segmented catalog and filter | `services/page.tsx` | Mirrors how Saudi beauty demand is actually segmented |
| Family / dependent booking | `client_profiles`, `create_booking(request_client_profile_id)` | Saudi families book for children and relatives; no competitor showed this |
| Payment-confirmation webhook | Re-fetches the charge from Tap, validates amount/currency, unique intent | Sound capture path |
| Service catalog administration | `admin/services` (rollback on failure) | Reliable control plane |
| Staff, services, weekly and split shifts | `provider/employees`, `employee_availability` | Operational baseline |
| Row-level security everywhere | 30/30 tables, 84 policies, column-level `GRANT UPDATE` blocks role self-promotion | Strong data foundation |
| Saudi payment-method registry | mada, Apple Pay, Visa, Mastercard, STC Pay, Tabby, Tamara entries | Locally correct defaults |

---

## B — PRIMORA has it but it needs improvement

| # | Capability | Current implementation | Weakness (evidence) | Competitor benchmark | Recommendation | Priority | Expected result |
|---|---|---|---|---|---|---|---|
| B1 | Commission model | 15 % (Lite) / 10 % (Growth) on **every** booking | Taxes clients the salon already owns → off-platform leakage; 4× Glamera cost (report 14) | Fresha, StyleSeat, Treatwell, Booksy charge **only first marketplace visit**; direct links free | Charge by **acquisition source**: provider-sourced bookings 0 %; marketplace-new clients a capped one-time fee | **P0** | Providers move their whole book onto PRIMORA |
| B2 | Customer cancellation | `cancel_booking` any time, no fee | Contradicts `/terms` (24 h / 50 %) (F29) | Merchant-set window, fees ≤100 % shown pre-booking (SPOT) | Provider-configurable window + late-cancel / no-show fee, displayed before payment, enforced server-side | **P0** | Lower no-shows; Terms become true |
| B3 | Deposits & payment custody | Deposit captured by Tap; copy claims PRIMORA "escrow" | Holding customer funds in a pooled account may require a SAMA license (report 09) | SPOT collects via licensed processor; Tap Marketplace delayed split | Move to **PSP split-settlement** (Tap Marketplace) so PRIMORA never holds funds; rewrite "escrow" copy | **P0** | Regulatory risk removed; automatic payouts |
| B4 | Refunds | `process-refund` unauthenticated, fail-open, invalid enum (F49) | Any signed-in user can trigger a real refund; DB never records it | Glamera Pay refunds; Zenoti AI Dispute Manager | Disable now; rebuild as admin-gated, idempotent, single transaction; add `refunded` status | **P0** | Money cannot leave without authorization and record |
| B5 | Provider payouts | Admin 3-step browser mutation (F58) | Non-atomic, no idempotency, no audit | Booksy next-day; Tap automatic payout cycle | Use PSP payout cycle; keep `process-payout` only for exceptions | **P0** | Providers trust the money |
| B6 | Pricing page | Simulated checkout; raw card fields; unbacked claims (F60) | Misleading claims; PCI scope; nothing enforced | Glamera: clear tiers, free trial | Remove raw card form; correct claims; model plans in data before selling them | **P0** | Legal and trust risk removed |
| B7 | Availability engine | 15-min grid, one employee | No buffers, leave, overnight shifts, resources (F34-F37) | Booksy: padding, processing, time off, parallel; Mindbody: rooms | Add buffers, time-off, overnight shifts, resource constraints | **P1** | Calendars match reality; fewer conflicts |
| B8 | Employee accounts | Role exists; pages owner-scoped (F41) | Employees see nothing | Fresha permissions; Glamera staff app; StyleSeat pro | Employee view: own schedule, bookings, earnings, profile | **P1** | Professionals become a supply channel |
| B9 | Reviews | Verified ✓ | Employee ratings stored, never shown; no responses or moderation | Glamiva per-employee ratings | Show employee ratings; provider response; admin moderation queue | **P1** | Trust + professional reputation moat |
| B10 | Messaging | Conversations table | No WhatsApp, attachments decorative | SPOT WhatsApp; Fresha Client Connect | WhatsApp utility templates for confirmations and reminders; keep in-app chat secondary | **P1** | Communication where Saudi customers already are |
| B11 | Packages | Provider can create | Customers cannot buy (F54) | Booksy, Fresha, Vagaro sell packages | Purchasable packages with session redemption at booking | **P2** | Prepaid revenue, retention |
| B12 | Coupons | Admin CRUD | Never redeemed (F52) | SPOT, SQUIRE promo codes | Redeem in `create_booking`; record who funds the discount | **P2** | Working promotions with correct accounting |
| B13 | Home service | Job board + travel calc | No address privacy, no hold-then-capture | Salon Station | Reveal address after acceptance; capture after completion | **P1** (women's home service) | Safety-led trust |
| B14 | Localization | 57 files manage locale; root `lang="en"` | Language flips on navigation; no Arabic font | Glamiva, SPOT Arabic-native | One locale provider, server `lang/dir`, Arabic webfont | **P1** | Arabic-first quality |
| B15 | Search & discovery | Client-side filter of full selects | No map, no distance, no server search, not indexable | Glamiva map; Glamera Pro sites | Server search, distance from branch lat/lng, SEO-rendered provider pages | **P1** | Organic acquisition |
| B16 | Admin console | 1/3 decorative | Demo data on zero rows; catch-and-succeed (adminwright) | — | Honest empty/error states; audit log; atomic money ops | **P0** for money/audit, **P1** rest | Operators can trust what they see |
| B17 | Provider analytics | Mock charts (F71) | Invisible grid; no booking queries | Booksy 16 reports | Real revenue, utilization, no-show, repeat-rate | **P2** | Provider sees value → retention |
| B18 | Prayer-time engine | Provider calendar | Never shown to customers | None observed | Show "prayer pause" on customer slots; market it | **P2** | Visible local differentiation |
| B19 | Provider verification | Licence URL + IBAN | No CR check, no review workflow | Tap KYC; Wathq CR API (SAR 2–12/call) | CR verification + document review + "verified" badge | **P1** | Trust; regulatory hygiene |

---

## C — PRIMORA is missing this

| # | Feature | Problem solved | Why it matters | Competitors offering it | Recommended implementation | Priority | Complexity |
|---|---|---|---|---|---|---|---|
| C1 | **Self-serve business onboarding** | No provider can join | A marketplace with no supply path cannot launch | Fresha, Booksy, Glamera (trials); SPOT (assisted) | Application form → CR verification → admin review → provider row + owner role → guided setup | **P0** | M |
| C2 | **Booking link + QR + WhatsApp link** | Providers can't bring their existing clients | Cheapest liquidity; enables 0 %-commission own-client model | Fresha, Booksy, SPOT, SQUIRE | Per-provider public URL, QR, Instagram/WhatsApp share, source attribution | **P0** | S–M |
| C3 | **Automated reminders (WhatsApp utility)** | No-shows | SPOT pilot: 18 % → <6 % (self-reported) | SPOT, Fresha, Booksy, all majors | WhatsApp utility templates (≈SAR 0.04 each) + SMS fallback + scheduler | **P0** | M |
| C4 | **Payment-hold expiry** | Abandoned checkouts block slots forever | Revenue loss + abuse vector | — (implicit everywhere) | Expire `pending_payment` after N minutes via scheduled job | **P0** | S |
| C5 | **Consent & data-subject requests** | PDPL obligations | Documented, purpose-specific consent required | — | Consent records (time + method), marketing/WhatsApp opt-in, DSR workflow (30 days) | **P0** | M |
| C6 | **Real phone capture at sign-up** | Fabricated numbers (F03) | Messaging would reach strangers | All Saudi apps are phone-first | Phone + OTP verification; remove random fallback | **P0** | S–M |
| C7 | **Admin audit log** | No accountability | Required before money operations scale | — | Append-only `admin_audit_log` written in the same transaction | **P0** | M |
| C8 | Product analytics / funnel events | Can't measure anything | KPIs in report 17 depend on it | Fresha (GA, Meta pixel free) | Event tracking on search → profile → slot → pay → complete | **P0** | S |
| C9 | "Any available professional" | Customer must choose a person | Reduces friction, fills idle staff | Common in category | Aggregate slots across qualified staff; assign at booking | **P1** | M |
| C10 | Reschedule | Cancel-and-rebook friction | Keeps the booking alive | SPOT one-tap, Booksy | Atomic reschedule RPC respecting policy | **P1** | S |
| C11 | Waitlist | Cancelled slots stay empty | Recovers revenue | Booksy, Fresha, SQUIRE | Join for a time frame; notify on opening | **P2** | M |
| C12 | No-show protection | Lost provider revenue | Retention reason for providers | StyleSeat, Booksy, SPOT | Fee per policy, charged against deposit or card | **P1** | M |
| C13 | ZATCA Phase 2 invoicing | Wave 25 deadline 2027-02-01 | Most VAT-registered salons must integrate | Glamera | Partner with a certified e-invoicing provider; do not build the crypto stack in-house first | **P1** | L |
| C14 | Employee profile & portfolio | Customers book people | Professionals bring followers | Booksy, StyleSeat, Glamiva | Public pro page with photos and ratings | **P1** | M |
| C15 | Rebooking prompts | Repeat rate | Cheapest growth | StyleSeat, Zenoti | Post-visit WhatsApp with "book same again" | **P1** | S |
| C16 | Tips | Professional earnings | Professional satisfaction | Fresha, SPOT | Post-visit tip, 100 % to employee | **P2** | S |
| C17 | Loyalty | Repeat visits | Retention | Vagaro, StyleSeat, Fresha add-on | Simple visit-based reward per provider | **P2** | M |
| C18 | Gift cards / gift an appointment | New buyers, occasions | Eid & wedding gifting culture | Booksy, Fresha, BeautyBook | Gift an appointment or credit | **P2** | M |
| C19 | Referrals | Customer acquisition | Organic growth | StyleSeat (15 % funded) | Referral credit funded by PRIMORA | **P2** | S |
| C20 | Memberships | Recurring revenue | Predictable provider income | Fresha, Booksy, Mindbody | Monthly membership with included services | **P3** | L |
| C21 | Multi-service booking | Real visit composition | Higher ticket | Booksy combos, SPOT | Sequential services, same or different staff | **P2** | L |
| C22 | Group booking | Weddings, family visits | High-value occasions | Fresha, SQUIRE | Several guests in one booking | **P2** | L |
| C23 | Recurring appointments | Regulars | Retention | — | Repeat rule with conflict check | **P3** | M |
| C24 | POS / in-store checkout | Walk-in revenue capture | Owns the till | Glamera, Fresha, Booksy | Light checkout for walk-ins; avoid hardware first | **P2** | L |
| C25 | Inventory / retail | Product sales | Secondary revenue | Glamera, Fresha | Defer | **P3** | L |
| C26 | AI receptionist (WhatsApp, Arabic) | Missed messages | Saudi salons answer WhatsApp manually | Zenoti, Booksy, SQUIRE, Mindbody | WhatsApp agent: intent → availability → book → pay link | **P2** (after C3) | L |
| C27 | Google / Instagram booking integrations | Discovery outside PRIMORA | Where customers search | Fresha, Booksy, SQUIRE | Deep links first; formal integrations later | **P2** | M |
| C28 | Website / custom domain | Business-owned brand | Upsell | Glamera Pro, Vagaro | SEO-rendered provider microsite on PRIMORA domain first | **P2** | M |
| C29 | Customer blocking / abuse controls | Serial no-shows | Provider protection | Booksy, SPOT | Provider block list; platform suspension rules | **P2** | S |
| C30 | Intake forms / patch tests | Treatments with risk | Liability | Booksy, Fresha | Per-service form; health data needs explicit consent | **P3** | M |

---

## D — PRIMORA has (or can easily have) an advantage

| Advantage | Status | Why it is defensible | What it needs |
|---|---|---|---|
| **Prayer-aware scheduling** | Built (provider side) | Locally essential, globally absent; hard for foreign platforms to prioritize | Surface to customers; server-side everywhere |
| **Fair, source-based pricing** vs Fresha's 50 % Saudi new-client fee | Not built — pricing decision | Direct, quantifiable saving for every salon | Pricing change + attribution (C2) |
| **Family / dependent booking** | Built | Fits Saudi household purchasing | Guardian consent; marketing |
| **Verified reviews by construction** | Built | Trust compounding over time | Employee ratings + moderation |
| **Gender-segmented, culturally correct catalog** | Built | Matches regulated, segregated supply | Men's and women's journeys tuned separately |
| **Data integrity core** (constraints, server pricing, RLS) | Built | Lets PRIMORA scale payments safely once surface bugs are fixed | Fix the money surfaces (B3-B5) |
| **WhatsApp-native experience** | Not built | Meta utility messages ≈ SAR 0.04; Fresha charges salons SAR 0.15–0.30 | C3, then C26 |
| **Arabic-first premium brand** | Partially built | Local apps skew budget/women-only; global apps skew English | Fix locale + typography |
| **Home-service bidding board** | Built (partial) | Unusual model for home beauty | Privacy & capture model (B13) |

---

## Strategy chains for the six decisive gaps

### Chain 1 — Supply cannot join (C1)
**Current state** no code path creates a provider → **Gap** zero self-serve supply → **Why** onboarding was designed as marketing copy; `owner_id NOT NULL`; admin "add" writes to React state → **Competitor lesson** Fresha/Booksy self-serve trials; SPOT assisted 30-minute setup → **Strategy** assisted self-serve: form + WhatsApp concierge → **Capability** application, CR verification, approval, role assignment, guided setup → **Business requirement** verification policy, provider agreement acceptance → **Technical requirement** `provider_applications` table, server-side approval operation, Wathq integration, audit → **Dependencies** provider agreement (report 15), consent (C5) → **Phase** 1 → **Success metric** application → live provider ≤ 72 h; activation ≥ 60 % → **Intended result** a provider can go from Instagram ad to bookable in one day.

### Chain 2 — Commission leakage (B1 + C2)
**Current state** 10–15 % on every booking → **Gap** own clients taxed → **Why** single commission constant → **Lesson** Fresha/StyleSeat/Treatwell charge only the first marketplace visit; direct links free → **Strategy** source-attributed pricing → **Capability** booking source tagging (marketplace / provider link / QR / WhatsApp / walk-in) → **Business requirement** published fee schedule, attribution rules, dispute path → **Technical requirement** `bookings.source`, first-visit detection per provider-customer pair, fee calculation server-side → **Dependencies** booking links (C2) → **Phase** 1 → **Metric** share of a provider's total bookings flowing through PRIMORA ≥ 70 % → **Intended result** providers run their whole book on PRIMORA.

### Chain 3 — No-shows and silent customers (C3 + B2 + C12)
**Current state** no reminders, no policy enforcement → **Gap** provider revenue loss → **Why** no scheduler, no messaging provider → **Lesson** SPOT Arabic WhatsApp reminders with one-tap confirm → **Strategy** WhatsApp utility reminders + enforced policy → **Capability** scheduled reminders, confirm/reschedule actions, late-cancel/no-show fee → **Business requirement** policy defaults, customer consent for WhatsApp → **Technical requirement** job scheduler, WhatsApp Business Platform templates, webhook handling → **Dependencies** real phone numbers (C6), consent (C5) → **Phase** 1 → **Metric** no-show rate < 8 % on reminded bookings → **Intended result** providers see a measurable reason to stay.

### Chain 4 — Money custody (B3–B5)
**Current state** "escrow" claimed; refunds broken; payouts manual → **Gap** regulatory and integrity risk → **Why** payments built feature-first → **Lesson** SPOT uses a licensed processor; Tap Marketplace offers delayed split and sub-merchant KYC → **Strategy** PRIMORA as technology platform; PSP as funds holder → **Capability** sub-merchant onboarding, split at capture, automatic payouts, refund via PSP → **Business requirement** legal opinion on SAMA scope; merchant-of-record decision → **Technical requirement** Tap Marketplace integration, idempotent server operations, reconciliation → **Dependencies** C1, legal review → **Phase** 1 → **Metric** 100 % of payouts automated; 0 unreconciled transactions → **Intended result** money moves correctly without PRIMORA holding it.

### Chain 5 — ZATCA Wave 25 (C13)
**Current state** invoice number only; compliance claimed → **Gap** most VAT-registered salons must integrate with Fatoora by **2027-02-01** → **Why** compliance treated as copy → **Lesson** Glamera markets Phase 1 & 2 compliance → **Strategy** integrate a certified e-invoicing provider; sell compliance as a reason to switch → **Capability** compliant invoice issuance per booking (provider as seller) and per commission (PRIMORA as seller) → **Business requirement** tax advisor confirmation of who invoices what → **Technical requirement** provider VAT numbers, invoice data model, partner API → **Dependencies** C1, legal/tax review → **Phase** 2 (start before 2027-02-01) → **Metric** % of active VAT-registered providers issuing compliant invoices → **Intended result** compliance becomes an acquisition wedge, not a liability.

### Chain 6 — Booking integrity (C4 + overnight shifts + payment-hold)
**Current state** unpaid bookings hold slots forever; overnight shifts yield no slots → **Gap** lost and unbookable inventory → **Why** no scheduler; date arithmetic assumes same-day shifts → **Lesson** implicit in every mature system → **Strategy** fix the engine before scaling demand → **Capability** hold expiry, overnight shifts, buffers, time-off → **Business requirement** hold duration policy (e.g., 15 minutes — to validate) → **Technical requirement** scheduled job, shift model spanning midnight, timezone per branch → **Dependencies** none → **Phase** 1 → **Metric** 0 slots blocked by expired holds; Ramadan late-night slots bookable → **Intended result** every real hour of capacity is sellable.
