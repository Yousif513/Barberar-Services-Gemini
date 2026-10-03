# 12 — Prioritized Backlog and Master Gap Table

> **Research date:** 2026-10-03. This is a recommended backlog for owner approval. **Nothing has been implemented.**
> **Priority:** P0 critical (launch blocker, legal, security or money) · P1 important (needed for a competitive launch / first 6 months) · P2 useful (growth) · P3 later.
> **Complexity:** S ≤ 1 week · M 1–3 weeks · L 3–8 weeks · XL > 8 weeks (one experienced full-stack engineer; ASSUMPTION).
> **Phase** (report 11): 0 Stabilize & tell the truth · 1 Launchable marketplace core · 2 Provider value & retention · 3 Marketplace growth · 4 Scale & platform.

---

## 1. Master gap table (sorted P0 → P3)

| ID | Area | Feature | PRIMORA Status | Best Competitor | Why It Matters | Recommendation | Priority | Complexity | Phase | Expected Result |
|---|---|---|---|---|---|---|---|---|---|---|
| G01 | Supply | Provider application → verification → approval | NOT IMPLEMENTED (no code path creates a provider) | Fresha / Booksy trials; SPOT assisted setup | No supply = no marketplace | Application form, admin review queue, server-side approval creating provider + owner role | P0 | M | 1 | Provider live ≤ 72 h after applying |
| G02 | Monetization | Source-attributed fees (0 % own clients, first-visit fee for marketplace clients) | NOT IMPLEMENTED (15 % on every booking) | Fresha, StyleSeat, Treatwell | Commission on regulars drives leakage and blocks adoption | `bookings.source`, first-visit detection, server-side fee rules | P0 | M | 1 | Providers move whole book to PRIMORA |
| G03 | Supply / acquisition | Booking link, QR, Instagram & WhatsApp share | NOT IMPLEMENTED | Fresha, Booksy, SPOT, SQUIRE | Cheapest demand; enables own-client model | Public provider URL, QR generator, share kit, source tagging | P0 | S | 1 | ≥ 50 % of bookings via provider channels in launch cohort |
| G04 | Booking | Expire unpaid `pending_payment` holds | BROKEN (holds never expire) | Implicit everywhere | Slots blocked forever; abuse vector | Scheduled expiry + late-webhook handling | P0 | S | 0 | Zero slots blocked by abandoned payments |
| G05 | Payments / security | Refund function | BROKEN (no auth, CORS `*`, invalid status) | Glamera Pay refunds | Anyone can trigger real refunds | Disable now; rebuild admin-gated, idempotent, recorded | P0 | S (disable) / M (rebuild) | 0 | No unauthorized money movement |
| G06 | Security | Notification function | BROKEN (no auth; table missing) | — | Phishing via PRIMORA push | Require identity; server-triggered only | P0 | S | 0 | Push only from trusted server events |
| G07 | Payments / PCI | Raw card fields in `provider/pricing` and `shop/[id]` | PLACEHOLDER (collected in page state) | SPOT / Glamera hosted payments | PCI scope, trust | Remove; PSP-hosted or embedded fields; Apple Pay / mada first | P0 | S | 0 | No card data touches PRIMORA code |
| G08 | Legal / trust | Unbacked public claims (ZATCA, SMS, escrow, SAMA, 5-minute payouts, auto refunds, hygiene audits, PDPL compliance) | UI ONLY | — | Misleading advertising / regulatory exposure | Correct copy until features are real | P0 | S | 0 | Every public claim is true |
| G09 | Identity | Real phone + OTP; stop fabricating numbers | BROKEN (`handle_new_user` random `+9665…`) | Samha, Laha, BeautyBook phone-first | Messaging would reach strangers | Phone OTP sign-up; nullable phone until verified | P0 | M | 0–1 | 100 % of messaged numbers verified |
| G10 | Booking policy | Cancellation window, late-cancel and no-show fees, shown before payment | NOT IMPLEMENTED (cancel anytime; Terms say 24 h / 50 %) | SPOT | Provider revenue; Terms currently untrue | Per-provider policy enforced in `cancel_booking`; shown at checkout | P0 | M | 1 | No-show and late-cancel revenue protected |
| G11 | Messaging | WhatsApp confirmations + 24 h / 2 h reminders with confirm / reschedule | NOT IMPLEMENTED | SPOT, Fresha, Booksy | No-shows (SPOT pilot 18 % → < 6 %, self-reported) | WhatsApp Business Platform utility templates + scheduler + opt-in | P0 | M | 1 | No-show rate < 8 % on reminded bookings |
| G12 | Payments / regulatory | Fund custody model (PSP split instead of PRIMORA "escrow") | PARTIAL (deposit capture sound; custody unclear) | SPOT via licensed processor; Tap Marketplace | Possible SAMA licensing issue | Legal opinion; Tap Marketplace sub-merchants, split at capture, automatic payouts | P0 | L | 1 | PRIMORA never holds customer funds |
| G13 | Privacy | Consent records + data-subject request workflow | NOT IMPLEMENTED | — | PDPL obligations | `consents` table, opt-ins, 30-day DSR process | P0 | M | 1 | Every message and photo backed by recorded consent |
| G14 | Admin / money | Audit log + atomic, idempotent money operations | PARTIAL (3 of ~30 mutations audited; browser payouts) | — | Accountability; double payouts | Server operations with idempotency key writing audit rows in same transaction | P0 | M | 1 | 100 % of privileged actions audited |
| G15 | Observability | Funnel analytics + error tracking | NOT IMPLEMENTED | Fresha (GA / Meta pixel) | Cannot measure any KPI | Event schema on search → profile → slot → pay → complete; error tracking | P0 | S | 0 | Weekly funnel report available |
| G16 | UX / conversion | Keep booking selection through login; inline phone OTP | BROKEN (redirect to `/login` with no return) | Fresha, Booksy | Lost bookings at the last step | Return URL + inline OTP | P0 | S | 1 | Checkout completion ↑ |
| G17 | Booking | Overnight shifts (end after midnight) | BROKEN (zero slots) | Booksy | Ramadan and late barbershops unbookable | Shift end on next day | P0 | S | 1 | Late-night slots bookable before Ramadan 2027 |
| G18 | Legal | Provider agreement; customer terms aligned with actual behaviour; acceptance tracking | MISSING / NEEDS REVIEW | SPOT terms | No contract with supply | Draft with Saudi counsel (report 15); record acceptance with version | P0 | M | 1 | Every live provider has signed current terms |
| G19 | Quality | Test runner + authorization negative tests + booking engine tests | NOT IMPLEMENTED | — | No safety net for money and access | Add test runner; negative tests per role first | P0 | M | 0–1 | CI blocks regressions |
| G20 | Booking | "Any available professional" | NOT IMPLEMENTED (key only) | Fresha, Booksy | Conversion; fills idle staff | Aggregated slots, assign at booking | P1 | M | 2 | Higher slot-to-booking conversion |
| G21 | Booking | Reschedule | UI ONLY | SPOT one-tap | Saves bookings | Atomic reschedule RPC respecting policy | P1 | S | 2 | Fewer cancellations |
| G22 | Availability | Time off, closures, holidays, seasonal (Ramadan) schedules | NOT IMPLEMENTED | Booksy | Calendars match reality | Tables read by slot engine | P1 | M | 1–2 | No bookings during closures |
| G23 | Availability | Buffers, processing time, service variants | NOT IMPLEMENTED | Booksy | Accurate durations | Per-service buffers and variants | P1 | M | 2 | Fewer overruns |
| G24 | Employees | Employee "My day", status updates, earnings | PARTIAL (role exists; pages owner-scoped) | Glamera One, Fresha Team | Daily usage inside the salon | Membership model + employee views | P1 | M | 2 | Daily active professionals |
| G25 | Compliance | ZATCA Phase 2 e-invoicing via certified partner | NOT IMPLEMENTED | Glamera | Wave 25 deadline 2027-02-01 | Partner integration; provider VAT data | P1 | L | 2 | Compliant invoices; acquisition wedge |
| G26 | Trust | CR verification (Wathq) + "verified" badge | NOT IMPLEMENTED | Jamal (licence verification claim) | Trust; fraud prevention | Wathq CR API at application | P1 | S | 1 | 100 % of live providers CR-verified |
| G27 | Localization | One locale provider; server `lang`/`dir`; Arabic font | PARTIAL (57 files manage locale) | Glamiva, SPOT | Arabic-first quality | Central i18n, Arabic default for KSA | P1 | M | 1–2 | Consistent Arabic experience |
| G28 | Discovery / SEO | Server-rendered provider, category and district pages | NOT IMPLEMENTED (81/81 client pages) | Fresha, Glamera Pro | Organic acquisition | SSR pages, sitemap, schema.org, Arabic slugs | P1 | L | 3 | Organic traffic share ↑ |
| G29 | Discovery | Server search, distance sort, Arabic normalization | PARTIAL (client filtering) | Glamiva map | Relevance at scale; 1,000-row cap | Indexed search + distance | P1 | M | 3 | Search-to-profile CTR ↑ |
| G30 | Trust | Employee ratings, provider responses, moderation queue | PARTIAL (verified reviews ✓) | Glamiva, Booksy | Trust & professional reputation | Show pro ratings; report/hide flow | P1 | M | 2 | Review volume and trust ↑ |
| G31 | Data integrity | Create or remove features using non-existent tables (notifications, push tokens, CRM notes, promos) | BROKEN | — | Silent failures | Migration or remove features | P1 | M | 1 | No feature fails against real DB |
| G32 | Admin | Honest empty/error states, pagination, SAR currency | BROKEN (demo fallbacks; USD) | — | Operators trust data | Remove fallbacks; server pagination | P1 | M | 1 | Admin numbers match DB |
| G33 | Payments | Dispute / refund workflow + PSP reconciliation | NOT IMPLEMENTED | Zenoti dispute manager; Glamera Pay | Money after booking | Case management + daily reconciliation | P1 | L | 2 | 0 unreconciled transactions |
| G34 | Monetization | Collect fees beyond the deposit (provider fee invoices) | BROKEN (commission capped at captured deposit) | Fresha invoices fees | Revenue leakage | Fee ledger + monthly provider invoice / split | P1 | M | 2 | 100 % of fees collected |
| G35 | Supply | Client import (CSV) with consent flag | NOT IMPLEMENTED | SQUIRE client transfer; Zenoti migration | Switching cost | Import + dedupe | P1 | S | 2 | Faster provider activation |
| G36 | Mobile | Mock-data app: hide or connect to real data | PLACEHOLDER | Glamiva, Samha native apps | Store listing with fake salons damages brand | Shared data layer or keep web-only until ready | P1 | M–L | 2–3 | No mock data reaches users |
| G37 | Home service | Address privacy, accepted-then-revealed, capture after completion | PARTIAL | Salon Station | Safety and trust | Address reveal on acceptance; hold-then-capture via PSP | P1 | M | 3 | Safe women's home service |
| G38 | Monetization | Real subscription billing (when plans are real) | PLACEHOLDER (simulated) | All SaaS competitors | SaaS revenue | PSP recurring billing + plan table + entitlement checks | P1 | M | 2 | SaaS revenue from month 6 |
| G39 | UX / accessibility | Dashboard mobile nav, status badge fix, contrast, focus | BROKEN | Fresha / Glamera apps | Daily operation on phones | Design-system fixes | P1 | M | 1–2 | WCAG AA on key flows |
| G40 | Security | CORS allow-list, hashed API tokens, framework patch | PARTIAL | — | Attack surface | Allow-list; hash; patch | P1 | S | 0–1 | Clean security review |
| G41 | Retention | Post-visit WhatsApp: review + "book again" | NOT IMPLEMENTED | StyleSeat, Zenoti | Repeat rate | Utility template after completion | P1 | S | 2 | 60-day repeat rate ↑ |
| G42 | Supply / trust | Professional profile & portfolio | NOT IMPLEMENTED | Booksy, StyleSeat, Glamiva | Customers choose people | Pro pages with photos (consented) | P1 | M | 3 | Profile conversion ↑ |
| G43 | Provider value | "PRIMORA brought you…" summary | NOT IMPLEMENTED | SPOT new-client metric | Retention of providers | Monthly WhatsApp/email summary | P1 | S | 2 | Provider churn ↓ |
| G44 | Booking | Waitlist | NOT IMPLEMENTED | Booksy, Fresha, SQUIRE | Recovers cancellations | Time-frame waitlist + notify | P2 | M | 3 | Refilled slots |
| G45 | Monetization | Purchasable packages with redemption | PARTIAL (CRUD only) | Booksy, Fresha | Prepaid revenue | Purchase + session redemption | P2 | M | 3 | Package revenue |
| G46 | Marketing | Coupons redeemed at booking with funding rules | PARTIAL (CRUD only) | SPOT, SQUIRE | Promotions | Redeem in `create_booking` | P2 | M | 3 | Working promotions |
| G47 | Professionals | Tips (100 % to professional) | NOT IMPLEMENTED | SPOT, Fresha | Pro satisfaction | Post-visit tip | P2 | S | 3 | Pro advocacy |
| G48 | Customer | Gift an appointment / gift credit | NOT IMPLEMENTED | BeautyBook, Booksy | Eid / wedding gifting | Gift flow — stored-value legal check | P2 | M | 3 | New buyers |
| G49 | Acquisition | Referral credit | NOT IMPLEMENTED | StyleSeat (15 %) | Organic growth | PRIMORA-funded credit | P2 | S | 3 | Lower CAC |
| G50 | Retention | Loyalty | NOT IMPLEMENTED | Vagaro, Fresha add-on | Repeat visits | Visit-based reward | P2 | M | 4 | Repeat rate ↑ |
| G51 | Booking | Multi-service booking | NOT IMPLEMENTED | Booksy combos, BeautyBook | Higher ticket | Sequential services | P2 | L | 3 | Ticket size ↑ |
| G52 | Booking | Group booking (weddings, families) | NOT IMPLEMENTED | Fresha, SQUIRE | High-value occasions | Multi-guest booking | P2 | L | 4 | Event bookings |
| G53 | Operations | Walk-in quick entry / light checkout | NOT IMPLEMENTED | SPOT walk-in, Glamera POS | Barbershop reality | Walk-in entry without hardware | P2 | L | 3 | PRIMORA as daily system |
| G54 | Analytics | Real provider reports | PLACEHOLDER (mock charts) | Booksy 16 reports | Provider sees value | Revenue, utilization, no-show, repeat, source | P2 | M | 3 | Provider retention |
| G55 | Operations | Staff commission rules & export | NOT IMPLEMENTED | Glamera, SQUIRE | Saudi salons pay commission | Rules + export | P2 | M | 3 | Owner time saved |
| G56 | Operations | Multi-branch dashboard | PARTIAL | SPOT | Chains | Branch switcher + rollups | P2 | M | 3 | Chain adoption |
| G57 | Trust | Customer block list + no-show strike rules | NOT IMPLEMENTED | Booksy, SPOT | Provider protection | Block + platform rules | P2 | S | 2 | Fewer repeat offenders |
| G58 | Localization | Show prayer pause on customer slots | PARTIAL (provider side) | None | Visible differentiation | Label on slot grid | P2 | S | 2 | Brand recognition |
| G59 | Discovery | Map view | PARTIAL (mobile pins over mock) | Glamiva | Local discovery | Map on real data | P2 | M | 3 | Discovery engagement |
| G60 | AI | WhatsApp AI receptionist (Arabic) | NOT IMPLEMENTED | Zenoti, Booksy, SQUIRE, Fresha (US) | Saudi salons answer WhatsApp manually | Intent → availability → booking → payment link | P2 | L | 4 | Bookings captured 24/7 |
| G61 | Distribution | Google & Instagram booking integrations | NOT IMPLEMENTED | Fresha, Booksy, SQUIRE | Where customers search | Deep links first; formal integrations later | P2 | M | 3 | Off-platform booking volume |
| G62 | Payments | BNPL (Tabby, Tamara) | PARTIAL (registry only) | Fresha (Klarna US) | High tickets | PSP-supported BNPL | P2 | M | 3 | Bridal / package conversion |
| G63 | Monetization | Sponsored placement (labelled) | NOT IMPLEMENTED | Booksy Boost | Revenue | Pay-per-new-client boost | P2 | M | 4 | Additional revenue |
| G64 | Customer | Favourites | UI ONLY | Fresha, Booksy | Re-booking | Favourites table | P2 | S | 2 | Repeat bookings |
| G65 | Retention | Memberships | NOT IMPLEMENTED | Fresha, Booksy, Mindbody | Recurring revenue | Monthly membership | P3 | L | 4 | Predictable provider revenue |
| G66 | Operations | Inventory / retail | NOT IMPLEMENTED | Glamera, Fresha | Secondary revenue | Defer | P3 | L | 4 | — |
| G67 | Operations | Payroll | NOT IMPLEMENTED | Fresha Team, SQUIRE | Back office | Defer / integrate | P3 | L | 4 | — |
| G68 | Platform | White-label branded apps | NOT IMPLEMENTED | Salonist, SQUIRE, Glamera | Chains | Defer | P3 | XL | 4+ | — |
| G69 | Platform | Real developer API | PLACEHOLDER (plaintext tokens, no API) | Zenoti, Fresha Data Connector | Enterprise integrations | Hide page now; build later | P3 | L | 4 | — |
| G70 | Expansion | GCC multi-country configuration | NOT IMPLEMENTED (`+03`, VAT 15 % constants) | Fresha, Glamera | Expansion | Branch timezone, country tax config | P3 | XL | 4+ | — |
| G71 | Booking | Recurring appointments | NOT IMPLEMENTED | — | Regulars | Repeat rule | P3 | M | 4 | — |
| G72 | Safety | Intake forms / patch tests (explicit consent) | NOT IMPLEMENTED | Booksy, Fresha | Liability | Per-service forms | P3 | M | 4 | — |
| G73 | Payments | Own SAMA licence | NOT IMPLEMENTED | Glamera (fintech licence) | Control of payments | Defer; use PSP | P3 | XL | 4+ | — |
| G74 | Operations | Kiosk / hardware | NOT IMPLEMENTED | Glamera Kiosk, Fresha terminals | In-store | Do not build | P3 | XL | — | — |
| G75 | Supply | Professional identity portable across salons | NOT IMPLEMENTED | StyleSeat | Barbers move with followers | Pro accounts linked to employers | P3 | L | 4 | Pro-led supply |

---

## 2. Build order — P0 then P1, starting now (revised 2026-10-03)

Development is not paced by the 24-month business calendar: each step starts as soon as the previous step's exit checks pass (full step definitions and exit checks in report 11). The "Phase" column in the table above describes the **commercial rollout** only.

| Step | Items | Indicative effort (ASSUMPTION: one senior engineer equivalent) |
|---|---|---|
| **P0-A** Safety, truth & cleanup | G05, G06, G07, G08, G04, G15, G19 | ~1–1.5 weeks |
| **P0-B** Identity & consent | G09, G16, G13 | ~1–2 weeks |
| **P0-C** Supply & agreements | G01, G18, G03 | ~2 weeks |
| **P0-D** Booking rules & money | G17, G10, G02, G14, G12 | ~2–3 weeks |
| **P0-E** WhatsApp messaging | G11 | ~1–2 weeks |
| **P1-A** Platform hygiene | G31, G32, G40, G39 | ~2 weeks |
| **P1-B** Scheduling depth | G22, G23, G20, G21 | ~2–3 weeks |
| **P1-C** People & trust | G24, G26, G30, G42 | ~2–3 weeks |
| **P1-D** Money depth & compliance | G33, G34, G38, G25 | ~3 weeks |
| **P1-E** Growth surfaces | G27, G28, G29, G35, G41, G43, G37, G36 | ~3–4 weeks |
| P2, then P3 | G44–G64, then G65–G75 | continuous after P1 |

---

## 3. Deliberately not building yet

| Item | Why not now | Revisit when |
|---|---|---|
| POS hardware, kiosk, terminals | Capital-heavy; Glamera and Fresha already there; not why customers choose PRIMORA | Multi-branch chains demand it |
| Inventory and retail | Low leverage on bookings | ≥ 500 paying providers ask for it |
| Payroll | Regulated, low differentiation | Integrate partners later |
| Own payment licence | SAR 1–3M capital, long timeline | GMV makes PSP fees material and legal advises |
| White-label native apps per salon | Expensive; fragments demand | Enterprise contracts pay for it |
| AI voice receptionist | Saudi customers message more than they call; WhatsApp first | WhatsApp AI proven |
| Memberships | Complex billing; few Saudi salons sell them | Data shows demand |
| GCC expansion | KSA liquidity not proven | Go/no-go gate at month 18 (report 13) |
| Developer API | No consumer; tokens currently plaintext | Enterprise customers request it |
| Consumer subscription | No proven willingness to pay | Never early |
| Cryptographic ZATCA stack in-house | Certified partners exist | Volume makes a partner fee material |
| Mobile app feature parity | Web + WhatsApp reach more users at lower cost | Repeat customers want an app |
