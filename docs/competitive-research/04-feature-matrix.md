# 04 — Master Feature Matrix

> **Research date:** 2026-10-03. Same legend as report 03: ✓ verified · △ partial · ✗ verified absent · **?** unable to verify. PRIMORA: ✓ full · △ partial/UI/mock · **B** backend only · **X** broken · ✗ missing.
> "Others" cites the specific competitor that evidences the cell. "Best example" names the strongest observed implementation.

## 1. Marketplace & discovery

| Feature | PRIMORA | Fresha | Booksy | Glamiva | Samha | Glamera | SPOT | Vagaro | StyleSeat | SQUIRE | Others | Best example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Consumer marketplace | △ (web only, not indexable) | ✓ | ✓ | ✓ | ✓ | △ | ? | ? | ✓ | ? | Treatwell ✓, Mindbody ✓ (3M shoppers) | Treatwell / Fresha |
| Salon discovery | ✓ | ✓ | ✓ | ✓ | ✓ | △ | ✓ | ? | ✓ | ? | Laha ✓ | Fresha |
| Barber discovery | ✓ | ✓ | ✓ | ✗ (women-first) | ✗ (women-first) | ? | ? | ? | ✓ | ✓ | — | SQUIRE / Booksy |
| Independent professional discovery | ✗ | △ | ✓ | ? | ? | ? | ? | ? | ✓ | ✓ | — | StyleSeat |
| Location / map | ✗ | ? | ? | ✓ | ? | ? | ✓ | ? | ? | ? | — | Glamiva |
| Categories | △ | ✓ | ✓ | ✓ (incl. abayas, events) | ? | ? | ? | ? | ✓ | ? | — | Glamiva (breadth) |
| Filters (price, gender, home) | ✓ | ? | ? | ? | ? | ? | ? | ? | ? | ? | Jamal: category, price, rating | PRIMORA (gender) |
| Ranking / recommendations | ✗ | ? | ✓ (Boost) | ? | ? | ? | ? | ? | ✓ (search-ranking tools) | ? | — | StyleSeat |
| Stories / social feed | ✗ | ? | △ (social builder) | ✓ | ? | ? | ? | ? | △ | ? | — | Glamiva |
| SEO-indexable provider pages | ✗ | ? | ? | ? | ? | ✓ (websites) | ? | ✓ (websites) | ? | ✓ (landing pages) | Jamal (content SEO) | Glamera Pro |

## 2. Booking engine

| Feature | PRIMORA | Fresha | Booksy | Glamiva | Samha | Glamera | SPOT | Vagaro | StyleSeat | SQUIRE | Others | Best example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Real-time availability | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | BeautyBook ✓ | — (table stakes) |
| Double-booking protection | ✓ (DB constraint) | ? | ? | ? | ? | ? | ? | ? | ? | ? | — | PRIMORA (verified in code) |
| Professional selection | ✓ | ? | ✓ | ✓ | ? | ? | ? | ? | ✓ | ✓ | — | Glamiva |
| Any available professional | ✗ (string only) | ? | ? | ? | ? | ? | ? | ? | ? | ? | — | UNABLE TO VERIFY anyone |
| Multiple services | ✗ | ? | ✓ (combo) | ? | ? | ? | ✓ | ? | ? | ? | BeautyBook (across salons) | Booksy |
| Group booking | ✗ | ✓ | △ | ? | ? | ? | ? | ? | ? | ✓ | — | Fresha / SQUIRE |
| Home service | △ (job board + travel calc) | ? | ✓ (radius + fee) | ? | ? | ? | ? | ? | ? | ? | Salon Station ✓ | Salon Station |
| Buffers / padding | ✗ | ? | ✓ | ? | ? | ? | ? | ? | ? | ? | — | Booksy |
| Processing time | ✗ | ✓ | ✓ | ? | ? | ? | ? | ? | ? | ? | — | Fresha / Booksy |
| Rooms / chairs / resources | B (disconnected) | ✓ | △ (parallel clients) | ? | ? | ? | ✓ (chair occupancy KPI) | ? | ? | ? | Mindbody ✓ | Mindbody |
| Time off / leave | ✗ | ? | ✓ | ? | ? | ? | ✓ (block time) | ? | ? | ? | — | Booksy |
| Overnight / late-night shifts | ✗ (zero slots) | ? | ? | ? | ? | ? | ? | ? | ? | ? | — | UNABLE TO VERIFY |
| Prayer-time locks | ✓ | ✗ | ✗ | ? | ? | ? | ? | ✗ | ✗ | ✗ | — | **PRIMORA** |
| Family / dependent booking | ✓ | ? | ? | ? | ? | ? | ? | ? | ? | ✓ (group "father-and-son") | — | **PRIMORA** |
| Recurring appointments | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | ? | — | UNABLE TO VERIFY |
| Walk-ins | △ (UI) | ? | ? | ? | ? | ✓ (kiosk queue) | ✓ | ? | ? | ? | — | SPOT / Glamera Kiosk |
| Booking lead-time rules | ✗ | ? | ✓ | ? | ? | ? | ? | ? | ? | ? | — | Booksy |
| Payment-hold expiry | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | ? | — | — |

## 3. Policies, payments & finance

| Feature | PRIMORA | Fresha | Booksy | Glamiva | Samha | Glamera | SPOT | Vagaro | StyleSeat | SQUIRE | Others | Best example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Deposits | ✓ (per provider %) | ✓ | ✓ | ? | ? | ? | ✓ (≤100 %) | ? | ✓ | ✓ | Salon Station ✓ | StyleSeat |
| Online payment | △ (deposit only) | ✓ | ✓ | ? | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | BeautyBook ✓ | Fresha |
| Card on file | ✗ | ? | ? | ? | ? | ? | ? | ? | ✓ (required for NCC) | ? | — | StyleSeat |
| Cancellation policy enforcement | ✗ (Terms say 24 h; code none) | ✓ | ✓ | ✓ (per provider) | ? | ? | ✓ (per merchant) | ? | ✓ | ✓ | — | SPOT |
| No-show protection | ✗ | ✓ | ✓ | ? | ? | ? | ✓ (≤100 %) | ? | ✓ | ✓ | Treatwell ✓ | SPOT / StyleSeat |
| Rescheduling | △ (UI) | ? | ✓ | ? | ? | ? | ✓ (one tap) | ? | ? | ? | Zenoti ✓ | SPOT |
| Waitlist | ✗ | ✓ | ✓ | ? | ? | ? | ? | ? | ? | ✓ | — | Booksy (automated) |
| Refunds | X (unauthenticated, broken) | ? | ? | ✓ (per provider) | ? | ✓ (Pay) | ✓ | ? | ? | ? | — | Glamera Pay |
| Hold-then-capture | ✗ (claims "escrow") | ? | ? | ? | ? | ? | ? | ? | ? | ? | Salon Station ✓; Tap delayed split ✓ | Salon Station |
| Tips | ✗ | ✓ | ? | ? | ? | ? | ✓ | ? | ? | ? | — | Fresha / SPOT |
| Invoices / receipts | △ (number only) | ✓ | ? | ? | ? | ✓ | ? | ✓ | ? | ? | — | Glamera |
| ZATCA Phase 2 | ✗ (claimed) | ? | ? | ? | ? | ✓ | △ | ? | ? | ? | — | Glamera |
| Provider payouts | △ (manual) | ✓ | ✓ (next day) | ? | ? | ✓ | ✓ | ? | ✓ | ✓ | Tap Marketplace (auto cycle) | Booksy |
| Commissions (employee) | B | ✓ | ? | ? | ✓ | ✓ | ? | ✓ | ? | ✓ | — | Fresha |
| Payroll | ✗ | ✓ (pay runs) | ? | ? | ? | ? | ? | ✓ | ? | △ (rent collection) | Zenoti ✓ | Fresha |
| mada | ✓ (registry) | ? | ? | ? | ? | ? | ✓ | ? | ? | ? | — | SPOT |
| Apple Pay | ✓ (registry) | ? | ? | ? | ? | ? | ? | ? | ? | ✓ (Tap to Pay) | BeautyBook ✓ | BeautyBook |
| STC Pay | ✓ (registry) | ? | ? | ? | ? | ? | ? | ? | ? | ? | BeautyBook ✓ | BeautyBook |
| BNPL (Tabby / Tamara) | ✓ (registry, not live) | △ (Klarna, US) | ? | ? | ? | ? | ? | △ (Affirm, US) | ? | ? | — | UNABLE TO VERIFY in KSA |

## 4. Retention & marketing

| Feature | PRIMORA | Fresha | Booksy | Glamiva | Samha | Glamera | SPOT | Vagaro | StyleSeat | SQUIRE | Others | Best example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Reminders | ✗ | ✓ | ✓ | ? | ✓ | ✓ | ✓ (Arabic WhatsApp) | ✓ | ✓ | ✓ | — | SPOT |
| WhatsApp | B (OTP only) | ✓ | ? | ? | ? | ✓ | ✓ | ? | ? | ? | — | SPOT |
| Rebooking prompts | ✗ | ? | ? | ? | ? | ? | ? | ? | ✓ | ? | Zenoti ✓ | StyleSeat |
| Favorites | △ (UI) | ? | ? | ? | ? | ? | ? | ? | ? | ? | Sudan Samha ✓ | — |
| Messaging | △ | ✓ | ? | ? | ? | ? | ? | ? | ? | ✓ | — | Fresha |
| Offers / promos | X | ✓ | ✓ | ✓ | ? | ? | ✓ | ? | ✓ | ✓ | — | Glamiva |
| Coupon redemption | B (never applied) | ✓ | ? | ? | ? | ? | ✓ | ? | ? | ✓ | — | SQUIRE |
| Memberships | ✗ | ✓ | ✓ | ? | ? | ? | ? | ✓ | ? | ? | Mindbody ✓ | Mindbody |
| Packages | △ (not sellable) | ✓ | ✓ | ? | ? | ? | ? | ✓ | ? | ? | — | Booksy |
| Loyalty | ✗ | ✓ (add-on) | ? | ? | ? | ✓ | ? | ✓ | ✓ | ✓ | — | Vagaro |
| Gift cards | ✗ | ✓ | ✓ | ? | ? | ? | ? | ? | ? | ✓ | BeautyBook (gift an appointment) | Booksy |
| Referrals | ✗ | ? | ? | ? | ? | ? | ? | ? | ✓ (15 % funded) | ? | — | StyleSeat |
| Email / SMS campaigns | ✗ | ✓ | ✓ | ? | ? | ✓ | ? | ✓ | ✓ | ✓ | — | SQUIRE (unlimited) |
| Google reviews booster | ✗ | ✓ (add-on) | ? | ? | ? | ? | ? | ? | ? | ✓ | — | SQUIRE |

## 5. Business operations

| Feature | PRIMORA | Fresha | Booksy | Glamiva | Samha | Glamera | SPOT | Vagaro | StyleSeat | SQUIRE | Others | Best example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Salon dashboard | △ | ✓ | ✓ | ✓ | ? | ✓ | ✓ | ✓ | ✓ | ✓ | — | Glamera |
| Staff management | ✓ | ✓ | ✓ | ✓ | ? | ✓ | ✓ | ✓ | ? | ✓ | — | Fresha |
| Roles / permissions | △ (owner/employee only) | ✓ | ? | ? | ? | ? | ? | ? | ? | ? | — | Fresha |
| Scheduling | ✓ | ✓ | ✓ | ✓ | ? | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| CRM / client notes | X | ✓ | ✓ | ? | ? | ✓ | ✓ | ✓ | ✓ | ✓ | — | Booksy (tags, notes, block) |
| POS | ✗ | ✓ | ✓ | ? | ? | ✓ | ? | ✓ | ✓ | ✓ | — | Glamera |
| Inventory | ✗ | ✓ | ? | ? | ? | ✓ | ? | ✓ | ? | ✓ | — | Glamera |
| Analytics | △ (mock) | ✓ | ✓ (16 reports) | ✓ | ? | ✓ | ✓ | ✓ | ✓ | ✓ | Zenoti (AI advisor) | Booksy |
| Multi-branch | △ | ✓ | ? | ✓ | ? | ✓ | ✓ | ✓ | ? | ✓ | — | Glamera |
| Website builder | ✗ | ✓ (add-on) | ? | ? | ? | ✓ | ? | ✓ | ✓ (AI) | ✓ | Salonist (white-label app) | Glamera Pro |
| Booking links | ✗ | ✓ | ✓ | ? | ? | ✓ | ✓ | ? | ✓ | ✓ | — | SPOT |
| Booking widget | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | ? | Mindbody ✓ | Mindbody |
| Custom domain | ✗ | ? | ? | ? | ? | ✓ | ? | ? | ? | ? | — | Glamera Pro |
| QR booking | ✗ | ? | ✓ | ? | ? | ? | ? | ? | ? | ? | — | Booksy |
| API | △ (decorative) | ✓ (Data Connector) | ? | ? | ? | ? | ? | ? | ? | ? | — | Fresha |
| Integrations | △ (registry) | ✓ (Xero, Meta, GA) | ✓ (IG, FB) | ? | ? | ? | ✓ (IG, WA) | ? | ? | ✓ (Google, IG) | — | Fresha |
| Forms / waivers | ✗ | ✓ | ✓ | ? | ? | ? | ? | ? | ? | ? | — | Booksy |

## 6. Trust, AI & localization

| Feature | PRIMORA | Fresha | Booksy | Glamiva | Samha | Glamera | SPOT | Vagaro | StyleSeat | SQUIRE | Others | Best example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Verified reviews | ✓ (completed booking only) | ✓ | ✓ | ✓ | ✓ | ? | ✓ | ? | ✓ | ✓ | Laha ✓ | PRIMORA / Glamiva |
| Employee ratings | B | ? | ? | ✓ | ? | ? | ? | ? | ✓ | ? | — | Glamiva |
| Business rating | ✓ | ✓ | ✓ | ✓ | ✓ | ? | ✓ | ? | ✓ | ✓ | — | — |
| Provider verification | △ (licence URL) | ? | ? | ? | ? | ? | ? | ? | ? | ? | Jamal (licence check); Tap (KYC) | Tap KYC + Wathq |
| Customer blocking | ✗ | ? | ✓ | ? | ? | ? | ✓ (suspension) | ? | ? | ? | — | Booksy |
| Audit trail | △ (3/30 admin actions) | ? | ? | ? | ? | ? | ? | ? | ? | ? | — | — |
| AI receptionist | ✗ | ✓ (US add-on) | ✓ | ? | ? | △ (announced) | ? | ✓ ("AI tools") | ✓ | ✓ (Operator) | Zenoti ✓, Mindbody ✓ | Zenoti |
| AI marketing / insights | ✗ | ? | ? | ? | ? | ? | ? | ✓ | ✓ | ✓ | Zenoti ✓ | Zenoti |
| Arabic UI | △ (state fragmented) | ? | ? | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | Laha ✓ | Glamiva / SPOT |
| RTL correctness | △ | ? | ? | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | — | SPOT |
| SAR pricing | ✓ | ✓ | ✗ | ? | ? | ✓ | ✓ | ✗ | ✗ | ✗ | — | Glamera |
| Gender-segmented catalog | ✓ | ? | ? | △ (women-only) | △ (women-only) | ? | ? | ? | ? | ? | — | **PRIMORA** |
| Home-service privacy (address reveal) | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | ? | Salon Station ✓ | Salon Station |

## 7. Reading the matrix

- **PRIMORA is ahead or unique on:** database-level double-booking protection, tamper-proof server pricing, verified-by-construction reviews, prayer-time locks, gender-segmented catalog, family/dependent booking, multiple Saudi payment methods in the registry.
- **PRIMORA is at table-stakes on:** search, availability, employee selection, staff, services, deposits.
- **PRIMORA is behind on almost everything after the booking and around the provider:** reminders, WhatsApp, no-show and cancellation enforcement, waitlist, rebooking, CRM, POS, analytics, booking links, verification, payouts, ZATCA.
