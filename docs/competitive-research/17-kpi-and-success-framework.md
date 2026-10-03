# 17 — KPI and Success Framework

> **Research date:** 2026-10-03. Every number is labelled: **KNOWN DATA** (measured in PRIMORA) · **BENCHMARK** (competitor public claim — usually self-reported) · **ASSUMPTION** · **TARGET** (recommended goal, owner to approve).
> **Baseline:** PRIMORA has **no analytics instrumentation** and **no real providers** outside seed data, so every current value is **UNKNOWN — not measurable today** (KNOWN DATA). Instrumentation (G15) is the first prerequisite.

---

## 1. North-star metric

**Completed bookings per month through PRIMORA**, split by source (provider-owned vs marketplace-new).

Why: it captures supply (someone must provide the service), demand (someone must book), reliability (it must be completed) and monetization (marketplace-new bookings carry the fee). Track the **marketplace-new share** beside it — it is the share that proves PRIMORA is a marketplace and not only software.

---

## 2. KPI tree

```
Completed bookings / month
├── Supply: live providers × bookable hours × online-bookable share
├── Demand: active customers × booking frequency
│     ├── provider-owned customers (link, QR, WhatsApp, import)
│     └── marketplace-new customers (search, SEO, ads, referral)
├── Conversion: search → profile → slot → payment → confirmed
└── Reliability: confirmed → completed (no-shows, cancellations, provider cancellations)
```

---

## 3. KPIs and targets by stage

| Area | KPI | Definition | MVP / soft launch (month 3) | Month 6 | Month 12 | Month 24 | Label / basis |
|---|---|---|---|---|---|---|---|
| **Supply** | Live providers | Verified, ≥ 1 bookable professional, ≥ 1 booking in 30 days | 30 | 100 | 250 | 1,000 | TARGET (report 10 base case) |
| | Application → live | % approved applicants live within 72 h | 60 % | 70 % | 75 % | 80 % | TARGET |
| | Online-bookable share | % of working hours bookable on PRIMORA | 50 % | 60 % | 70 % | 75 % | TARGET |
| | 90-day provider retention | Providers active 90 days after going live | — | 85 % | 85 % | 88 % | TARGET |
| **Demand** | Completed bookings / month | North star | 500 (cumulative by month 3) | 12,000 | 40,000 | 180,000 | TARGET (ASSUMPTION-driven) |
| | Marketplace-new share | % of bookings that are a customer's first visit to that provider via PRIMORA discovery | measure | 5–10 % | 8 % | 8–10 % | TARGET; drives 60–75 % of revenue (report 10) |
| | Customer 60-day repeat rate | % of customers with a second booking within 60 days | measure | 35 % | 40 % | 45 % | TARGET; men's grooming frequency every 2–4 weeks is an ASSUMPTION |
| **Conversion** | Slot → paid booking | % of slot selections that end in a paid booking | measure | 55 % | 60 % | 65 % | TARGET; Zenoti claims ~50 % of online bookings are abandoned (BENCHMARK, self-reported) |
| | Search → booking | % of searches that end in a booking within 7 days | measure | 8 % | 10 % | 12 % | TARGET |
| | Searches with ≥ 3 open slots in 48 h | Liquidity per district | measure | 70 % | 80 % | 85 % | TARGET |
| **Reliability** | No-show rate (reminded bookings) | No-shows ÷ confirmed | < 10 % | < 8 % | < 6 % | < 5 % | TARGET; SPOT pilot 18 % → < 6 % (BENCHMARK, self-reported, 12 salons) |
| | Provider cancellation rate | Provider-cancelled ÷ confirmed | < 3 % | < 2 % | < 2 % | < 1.5 % | TARGET |
| | Payment success rate | Successful ÷ attempted charges | 95 % | 96 % | 97 % | 97 % | TARGET |
| **Money** | GMV / month (SAR) | Completed booking value | measure | 1.8M | 6.0M | 27M | ASSUMPTION (ticket SAR 150) |
| | Net revenue / month (SAR) | Fees + SaaS + approved payments margin | 0 (founding) | ~40K | ~126K | ~638K | ASSUMPTION (report 10 base case) |
| | Take rate | Net revenue ÷ GMV | — | ~2.3 % | ~2.1 % | ~2.4 % | ASSUMPTION |
| | Paid SaaS share | Providers on paid plans | 0 % | 0–10 % | 40 % | 50 % | TARGET |
| | Fee disputes | Disputed ÷ charged new-client fees | — | < 3 % | < 3 % | < 2 % | TARGET |
| | Unreconciled transactions | PSP vs ledger mismatches older than 48 h | 0 | 0 | 0 | 0 | TARGET (non-negotiable) |
| **Unit economics** | Customer CAC (paid channels) | Paid spend ÷ new marketplace customers | measure | ≤ SAR 40 | ≤ SAR 35 | ≤ SAR 30 | TARGET; must stay ≤ ~1.3× first-visit fee (SAR 30) + repeat value |
| | CAC payback | Months of PRIMORA revenue to recover CAC | measure | ≤ 4 | ≤ 3 | ≤ 3 | TARGET |
| | Provider acquisition cost | Sales + incentives ÷ new live providers | measure | ≤ SAR 800 | ≤ SAR 600 | ≤ SAR 400 | TARGET (ASSUMPTION) |
| | Messaging cost per booking | WhatsApp + SMS spend ÷ bookings | ≤ SAR 0.20 | ≤ SAR 0.16 | ≤ SAR 0.14 | ≤ SAR 0.14 | TARGET; Meta utility ≈ SAR 0.04 (third-party rate card) |
| **Experience** | Provider NPS | Quarterly survey | measure | ≥ 40 | ≥ 45 | ≥ 50 | TARGET |
| | Customer rating of booking experience | Post-visit survey | ≥ 4.5 | ≥ 4.6 | ≥ 4.6 | ≥ 4.7 | TARGET; SPOT claims 4.9 (BENCHMARK) |
| | Review rate | Reviews ÷ completed bookings | 15 % | 20 % | 25 % | 25 % | TARGET |
| **Platform health** | Booking-flow errors | Client errors per 1,000 sessions | baseline | < 5 | < 3 | < 2 | TARGET |
| | Critical security findings open | — | 0 | 0 | 0 | 0 | TARGET (non-negotiable) |
| | Admin actions audited | % of privileged mutations with audit rows | 100 % | 100 % | 100 % | 100 % | TARGET |
| **Compliance** | Verified providers | CR-verified ÷ live | 100 % | 100 % | 100 % | 100 % | TARGET |
| | Messages with recorded consent | — | 100 % | 100 % | 100 % | 100 % | TARGET |
| | DSR closed in 30 days | — | 100 % | 100 % | 100 % | 100 % | KNOWN REQUIREMENT (PDPL) |
| | ZATCA-compliant invoices (VAT-registered providers) | — | — | partner live before 2027-02-01 | 90 % | 100 % | KNOWN REQUIREMENT deadline; TARGET coverage |

---

## 4. Benchmarks consulted (public, self-reported)

| Benchmark | Source | Use |
|---|---|---|
| SPOT pilot: 12 salons, no-show 18 % → < 6 %, 4.9 rating | slotex.sa | Reminder impact ceiling |
| Zenoti: ~50 % of online bookings abandoned; 30 % of calls unanswered | zenoti.com | Conversion and AI-receptionist rationale |
| StyleSeat: "+120 new clients/yr via search" per pro | styleseat.com | Marketplace-new expectation for a mature marketplace |
| Glamiva: +500 providers, +50K active customers | glamiva.sa | Local scale reference |
| Laha: 200+ salons, 15K+ bookings, 15K+ downloads | laha.app | Local scale reference |
| Glamera: SAR 3B GMV with 4,000+ partners (Dec 2025); SAR 4B+ processed, 4,500+ providers (Jan 2026) | Glamera LinkedIn; MENA Startup Digest | Category leader scale |

---

## 5. Instrumentation requirements (prerequisite)

| Event | Properties |
|---|---|
| `search_performed` | query (normalized), district, category, gender segment, results count |
| `provider_viewed` | provider, source (search, link, QR, WhatsApp, ad, SEO) |
| `slot_selected` | provider, professional or "any", service, date offset, hour |
| `auth_started` / `auth_completed` | method (phone OTP), step |
| `payment_started` / `payment_succeeded` / `payment_failed` | method (Apple Pay, mada, card, BNPL), amount band, error code |
| `booking_confirmed` / `completed` / `cancelled` / `no_show` | actor, policy applied, fee charged |
| `reminder_sent` / `reminder_action` | channel, template, action (confirm / reschedule / cancel) |
| `review_submitted` | rating, has text |
| `provider_applied` / `provider_live` | channel, segment, district |

Store attribution (`source`) on the booking itself, not only in analytics, because fees depend on it.

---

## 6. Review cadence

- **Weekly:** north star, marketplace-new share, conversion funnel, no-shows, payment success, critical incidents.
- **Monthly:** provider retention, NPS samples, CAC and payback, messaging cost, fee disputes, district liquidity.
- **Quarterly:** go/no-go gates (report 13), pricing experiments, roadmap re-prioritization.
