# 15 — Agreements and Partnerships

> **Research date:** 2026-10-03. **This is not legal advice.** No agreement has been rewritten and no company has been contacted. Every agreement recommendation carries **SAUDI LEGAL REVIEW REQUIRED** unless stated otherwise.

---

## 1. Business-agreement audit

| Agreement / policy | Status | Evidence | Problem |
|---|---|---|---|
| Customer Terms of Service | **EXISTS — NEEDS REVIEW** | `/terms` (3 sections) | Describes an "escrow model" with Tap holding funds; promises 24 h free cancellation and up to 50 % fee that the code does not enforce; states a flat 15 % commission that contradicts the Growth plan's 10 % |
| Privacy Policy | **EXISTS — NEEDS REVIEW** | `/privacy` | Claims PDPL compliance with no consent records, no DSR workflow, no stated hosting location or cross-border basis |
| Security page | **EXISTS — NEEDS REVIEW** | `/security` | Marketing claims not backed by controls (see report 08) |
| About page claims | **EXISTS — NEEDS REVIEW** | `/about` | "rigorous licensing, hygiene audits", "medical-grade disinfection" — no process exists |
| **Provider / merchant agreement** | **MISSING** | — | No contract with supply: fees, payouts, policies, data, liability, termination |
| Professional / employee terms | **MISSING** | — | Professionals have accounts but no terms |
| Subscription terms | **MISSING** | Pricing page sells plans | Simulated checkout; no renewal, cancellation or refund terms |
| Payout terms | **MISSING** | Payout UI exists | Timing, holds, reserves, negative balances undefined |
| Cancellation & no-show policy | **PARTIAL** | In Terms only | Not per provider; not enforced; not shown at checkout |
| Refund policy | **PARTIAL** | "automatic refund policies" claim | No rules for who funds which refund |
| Review & content policy | **MISSING** | Reviews exist | No moderation basis, no removal rules |
| Community / acceptable use | **MISSING** | — | No basis for suspension |
| Data processing terms (provider ↔ PRIMORA) | **MISSING** | — | Who controls a salon's client list is undefined |
| Marketing & WhatsApp consent | **MISSING** | — | Required before business-initiated messages |
| Cookie / tracking notice | **MISSING** | No analytics yet | Needed when analytics is added |
| Home-service terms (safety, address, conduct) | **MISSING** | Home-service flows exist | Safety-sensitive service with no terms |
| Promotions / coupon terms | **MISSING** | Admin coupons | Funding and abuse rules undefined |
| Developer / API terms | **MISSING** | `/developer` issues tokens | Page should be hidden until there is an API |
| Terms acceptance tracking | **MISSING** | No consent or acceptance columns | Cannot prove what anyone agreed to |
| PSP contract (Tap) | **UNABLE TO VERIFY** | Integration code exists | Contract scope (marketplace vs single merchant) unknown from the repository |

---

## 2. Competitor agreement business-logic matrix

Legend: ✓ verified in public terms or help pages · ✗ verified absent · ? not verified · — not applicable.

| Clause | PRIMORA (today) | SPOT (terms 2026-03-22) | Glamiva (site terms) | StyleSeat (help) | Salon Station | Fresha (pricing page) | SQUIRE |
|---|---|---|---|---|---|---|---|
| Platform is intermediary; contract is customer ↔ provider | ? (Terms imply PRIMORA escrow) | ✓ | ✓ | ? | ? | ? | ? |
| Who collects payment | PRIMORA via Tap; "escrow" | Spot collects **on behalf of merchant via licensed processor** | ? | ✓ platform payments | **Hold, then capture after customer confirms** | ✓ Fresha payments | ✓ |
| Cancellation policy owner | Platform (24 h / 50 % in Terms; not enforced) | **Merchant sets window**, late fee **up to 100 %** | **Provider's policy shown before confirmation** | Pro-set | ? | ✓ no-show & cancellation fees | ✓ no-show protection |
| Deposits | Per-provider %, default 20 | Up to 100 %, may be non-refundable per merchant | ? | Customizable | Small deposit, balance after service | ✓ upfront payments | ? |
| No-show charge | ✗ | Up to 100 % | ? | ✓ | ? | ✓ | ✓ |
| Refunds | Claimed automatic; broken | Per merchant policy | Per provider policy | ? | Capture only after satisfaction | ? | ? |
| Tips | ✗ | 100 % to merchant less processing | ? | ? | ? | ✓ | ? |
| Promo codes responsibility | ✗ | Merchant discretion; Spot not responsible | ✓ provider offers | ✓ StyleSeat-funded referral 15 % | ? | ✓ deals | ✓ promo codes |
| Review rules | Verified by construction; no policy | Must be genuine; first name + last initial; platform may remove | ✓ verified reviews | ? | ? | ✓ | ? |
| Customer suspension | ✗ | Pattern of no-shows / chargebacks / fraud | ? | ? | ? | ? | ? |
| Provider can block customers | ✗ | ✓ | ? | ? | ? | ? | ? (Booksy ✓) |
| Liability cap | ? | Fees paid in prior 12 months | ? | ? | ? | ? | ? |
| Minimum age | ? | 18+ | ? | ? | ? | ? | ? |
| New-client fee only once | ✗ (all bookings) | ? | ? | ✓ 30 %, max $50, once per client | ? | ✓ returning clients free | ✗ (subscription) |
| Fee refunded if client was already the pro's | ✗ | ? | ? | ✓ word-of-mouth refund on request | — | ? | — |
| Client list belongs to the business | Undefined | ? | ? | ? | ? | ? | ✓ "won't be sold or shown to other businesses" |
| Address hidden until acceptance (home service) | ✗ | — | — | — | ✓ | — | — |

**Lessons:** (1) the provider owns the service policy, the platform enforces and displays it; (2) a licensed processor collects funds; (3) acquisition fees are once per client and refundable on proof; (4) client lists belong to the business; (5) suspension and blocking rules protect both sides.

---

## 3. Recommended agreement architecture

| Priority | Agreement | Key contents (summary) | Saudi legal review |
|---|---|---|---|
| **P0** | **Provider Agreement** | Parties and intermediary role; fee schedule (own-client 0 %, first-visit fee, SaaS, processing); attribution rules and dispute process; payout via PSP, timing, reserves, negative balances; provider-set cancellation/no-show policy within platform limits; service quality floor; licensing warranties (CR, municipal licence); data roles (provider controls its client list; PRIMORA controls marketplace accounts); confidentiality; suspension and termination; data export on exit; liability cap; governing law and venue | **REQUIRED** — commercial law, e-commerce law, PDPL roles |
| **P0** | **Customer Terms** (rewrite) | Intermediary role; price includes VAT; provider policy shown before payment and binding; deposits; refunds by case; reviews; suspension rules; minors / dependents; complaints | **REQUIRED** — consumer protection, e-commerce law |
| **P0** | **Privacy Notice + consent model** | Purposes, legal bases, processors, hosting location and transfers, retention (aligned with ZATCA), rights and 30-day DSR process; separate opt-ins for marketing, WhatsApp, photos, health data | **REQUIRED** — PDPL |
| **P0** | Payment & payout terms (schedule to Provider Agreement) | Who is merchant of record; PSP role; split timing; refunds and chargebacks funding; fee invoicing and VAT | **REQUIRED** — SAMA scope, VAT |
| **P1** | Subscription Terms | Plans, billing cycle, renewal, cancellation, price changes with notice, founding-partner lock | Recommended |
| **P1** | Professional Terms | Profile content, conduct, portfolio photo consent, tips, relationship to employer | Recommended — labour law interface |
| **P1** | Review & Content Policy | Eligibility, prohibited content, removal reasons, provider responses, appeals | Recommended |
| **P1** | Home-Service Terms | Address disclosure after acceptance, conduct, gender matching option, incident reporting, capture after completion | **REQUIRED** — safety and sector licensing |
| **P1** | Data Processing Terms (provider ↔ PRIMORA) | Processing of provider's client data on its behalf; sub-processors (Supabase, Tap, Meta/WhatsApp, Twilio); breach notice | **REQUIRED** — PDPL |
| **P2** | Promotions & Gift Terms | Funding, expiry, refunds, stored-value treatment | **REQUIRED** for gift credit (e-money question) |
| **P2** | Community Guidelines | Behaviour standards for customers and providers | Optional |
| **P3** | API & Enterprise terms, SLA | For chains | Recommended |
| **P3** | Affiliate / influencer agreements | Disclosure, licensed creators | **REQUIRED** — advertising rules |

**Operational requirement for all:** versioned documents, acceptance recorded with timestamp, version and method; re-acceptance on material change.

---

## 4. Partnership strategy

| Partner (category) | Purpose | Why | When | Commercial model | Cost (public) | Technical dependency | Negotiation points | Risks | Priority |
|---|---|---|---|---|---|---|---|---|---|
| **Tap Payments — Marketplace product** | Split settlement, sub-merchant KYC, payouts, refunds | Keeps PRIMORA out of fund custody; already integrated for charges | Phase 1 | Per-transaction rates | NOT PUBLICLY DISCLOSED | Sub-merchant onboarding; destinations; delayed split | Blended rate for mada vs cards; payout cycle; liability shift to sub-merchants; onboarding SLA | Single-PSP dependency | **P0** |
| Alternative PSPs (for quotes) | Price benchmark, redundancy | Negotiating leverage | Phase 1 (quotes only) | Per-transaction | NOT PUBLICLY DISCLOSED | Abstraction layer | Same as above | Integration cost | P2 |
| **Meta WhatsApp Business Platform** (direct Cloud API or a BSP) | Confirmations, reminders, OTP, later AI | Saudi customers live on WhatsApp | Phase 1 | Per delivered template | Utility ≈ SAR 0.04; marketing ≈ SAR 0.19 (third-party rate card) | Templates, opt-in, webhooks | BSP margin vs direct; Arabic template approval speed; support SLA | Template rejection; cost creep on service messages after 1 Oct 2026 | **P0** |
| SMS provider (Saudi-registered sender ID) | Fallback when WhatsApp fails | Delivery certainty | Phase 1 | Per message | NOT PUBLICLY DISCLOSED (varies) | Sender ID registration | Volume tiers | Regulatory registration | P1 |
| **ZATCA-certified e-invoicing provider** | Phase 2 invoices for providers and for PRIMORA's own fees | Wave 25 deadline 2027-02-01 | Phase 2 (contract in Phase 1) | Per invoice or per device / month | NOT PUBLICLY DISCLOSED | Provider VAT data; invoice model | Per-invoice price at marketplace volume; white-label; multi-tenant onboarding of providers | Partner lock-in | **P1** |
| **Wathq (Ministry of Commerce APIs)** | CR verification at onboarding | Trust, fraud prevention | Phase 1 | Per call | **SAR 2–12 per call** | Application flow | — (public pricing) | Coverage of non-CR home specialists | **P1** |
| Tabby / Tamara | BNPL for high tickets | Bridal and packages | Phase 3 | Merchant fee | NOT PUBLICLY DISCLOSED | Via PSP or direct | Rate; minimum ticket | Cost to providers | P2 |
| Google (Maps / Places; Business Profile booking links) | Distance, autocomplete, discovery | Customers search on Google Maps | Phase 1 (Maps); Phase 3 (booking links) | Per API call | Per Google pricing (already used in `calculate-travel`) | Keys, quotas | — | Cost at scale | P1 / P2 |
| Instagram / Meta booking button | Book from profiles | Salons market on Instagram | Phase 3 | — | UNABLE TO VERIFY for KSA | Booking link | — | Platform policy changes | P2 |
| **Barber & beauty training academies** | Supply pipeline of new professionals; Saudi talent | Grow supply and professional profiles | Phase 2–3 | Free listing for graduates; co-marketing | — | Pro accounts | Graduate onboarding, certification badge | Low early volume | P2 |
| Beauty product distributors / brands | Sampling, sponsored content, supply discounts for providers | Revenue and provider perks | Phase 4 | Sponsorship / ads | — | Traffic | Exclusivity terms | Conflicts with neutrality | P3 |
| Malls and community developers in launch districts | Co-marketing, foot traffic, cluster acquisition | Dense salon clusters | Phase 1–2 | Co-marketing | — | QR materials | Joint campaigns | Low digital conversion | P2 |
| Wedding planners, hotels, event venues | Group / bridal bookings | High-value occasions | Phase 3–4 | Referral fee | — | Group booking | Referral terms | Volume seasonality | P3 |
| Corporate HR / wellness benefits | B2B demand (grooming benefits) | Recurring demand | Phase 4 | Corporate contracts | — | Corporate accounts, invoicing | Payment terms | Sales cycle | P3 |
| Licensed influencers (Mawthooq) | Awareness | Discovery in Saudi social media | Phase 2–3 | Per campaign / affiliate | Market rate | Referral links | Disclosure, performance pay | Compliance; cost | P2 |
| Banks / wallets loyalty programmes | Customer acquisition via offers | Large audiences | Phase 4 | Offer funding | — | Promo codes with funding rules | Who funds discounts | Discount-seeking users | P3 |

---

## 5. Partnership sequencing

1. **Phase 0–1:** legal counsel (custody, terms, PDPL); Tap Marketplace; WhatsApp (direct or BSP); Wathq.
2. **Phase 1–2:** ZATCA partner contract (live before 2027-02-01); SMS fallback; malls/developers in launch districts.
3. **Phase 2–3:** academies; influencers; BNPL; Google/Instagram booking links.
4. **Phase 4:** brands, banks, corporate, events.

**Do not** sign exclusivity with any partner in the first 18 months. Keep PSP and messaging behind thin internal interfaces so they can be switched.
