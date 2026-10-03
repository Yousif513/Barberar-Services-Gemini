# 10 — Monetization

> **Research date:** 2026-10-03. Labels: **KNOWN DATA** (from code or an official source) · **BENCHMARK** (competitor public data) · **ASSUMPTION** (stated, not verified) · **RECOMMENDATION** (requires owner approval).
> The pricing page and business rules have **not** been changed. Detailed pricing and cost scenarios are in report 14.

---

## 1. How PRIMORA earns money today (KNOWN DATA)

| Stream | Where in code | Reality |
|---|---|---|
| Commission per booking | `providers.commission_percentage` default **15.00**; forced to 15 on provider insert by trigger (`20260615182811_harden_auth_and_booking_core.sql:143`); only admin / service role can change it | Real. Applies to **every** booking, including the provider's own clients |
| Commission collection | `confirm_booking_payment`: `v_platform_share := LEAST(platform_commission, total_captured)` (line 843) | PRIMORA's commission is taken **out of the online deposit**. With the default 20 % deposit and 15 % commission, PRIMORA keeps ~¾ of what the customer paid online. If a provider sets a deposit below the commission rate (allowed: `deposit_percentage` 0–100), **the shortfall is never collected** — there is no provider invoicing |
| Subscription plans (Lite 0 / Growth SAR 299 / Elite SAR 799) | `provider/pricing/page.tsx` | **Not real.** Checkout is a `setTimeout` simulation; no plan or subscription tables; Growth's advertised 10 % commission is not linked to anything (commission stays 15 %) |
| Coupons | `promotional_codes` admin CRUD | Never redeemed, so no revenue effect (and no discount-funding rule) |
| Packages | Provider CRUD | Customers cannot buy them |
| Payments margin | — | None; processing cost absorbed inside commission (Tap rates **NOT PUBLICLY DISCLOSED**) |
| Advertising / boost | — | None |
| Messaging resale | — | None |

**Conclusion:** PRIMORA has one working revenue stream (commission on deposits) and it is priced in a way that (a) punishes providers for bringing their own clients and (b) under-collects when deposits are low.

---

## 2. Revenue streams available to a Saudi beauty marketplace

| Stream | Who pays | Benchmark | Fit for PRIMORA | When |
|---|---|---|---|---|
| **New-client acquisition fee** (first visit via marketplace) | Provider | Fresha KSA 50 % min SAR 10; Booksy Boost 30 % cap $100; StyleSeat 30 % cap $50; Treatwell first-visit only | **Core.** Fair, performance-based, easy to explain | Launch |
| **SaaS subscription** | Provider | Glamera SAR 125/225/325; Fresha KSA SAR 149.95 solo; Booksy $29.99 + $20/staff | **Core**, but only once the software is worth paying for (reminders, invoices, reports, staff app) | From month 6 |
| **Payments margin** | Provider (inside processing rate) | Fresha KSA 4.90 % + SAR 0.75 | **Core** if PRIMORA processes prepayment; structure via PSP split — **REQUIRES LEGAL CONFIRMATION** | Launch (deposits), grow with prepayment |
| **Messaging** (WhatsApp/SMS beyond allowance) | Provider | Fresha KSA WhatsApp SAR 0.15–0.30, text SAR 0.35 | Include utility reminders (cost ≈ SAR 0.04 each); charge marketing messages near cost + margin | Month 6+ |
| **Paid placement / boost** | Provider | Booksy Boost; Fresha marketplace ranking | Only after organic demand exists; always labelled "sponsored" | Month 12+ |
| **ZATCA e-invoicing add-on** | Provider | Glamera includes Phase 1 & 2 | Strong wedge before 1 Feb 2027; include in paid plans rather than charge separately | Month 3–6 |
| **AI WhatsApp receptionist** | Provider | Fresha AI Concierge $99.95/location (US); SQUIRE Operator +$99; Zenoti AI Workforce | Premium add-on once booking via WhatsApp works | Month 12+ |
| **Gift cards / gift appointments** | Customer (float) | Booksy, Fresha, BeautyBook | Revenue via breakage — **REQUIRES LEGAL CONFIRMATION** (stored value / e-money) | Month 12+ |
| **BNPL** (Tabby, Tamara) | Provider via merchant fee | Fresha (Klarna US) | Higher tickets (bridal); pass-through cost | Month 9+ |
| **Brand advertising / product sampling** | Beauty brands | Marketplace media | After meaningful traffic | Month 18+ |
| **Training / academy partnerships** | Academies, brands | — | Supply pipeline more than revenue | Month 12+ |
| **Data products** | — | Fresha Data Connector SAR 1,100/location | Defer; PDPL constraints | Not before month 24 |
| Customer booking fee | Customer | Generally avoided by leaders | **Do not** — conflicts with "transparent price" positioning | Never early |

---

## 3. Recommended monetization model (RECOMMENDATION — hypothesis to validate)

**"Free to run your book, pay when we bring you a client."**

1. **0 % commission on provider-sourced bookings** (booking link, QR, Instagram/WhatsApp button, imported clients, walk-ins).
2. **One-time new-client fee** on a client's first visit to that provider when PRIMORA's marketplace produced it: hypothesis **20 % of first-visit service value, minimum SAR 10, maximum SAR 40**. Returning visits free. Refundable if the provider proves the client was already theirs (StyleSeat precedent).
3. **SaaS from month 6** for teams: Solo free; Team and Branch plans priced at or below Glamera (report 14).
4. **Payments:** deposits/prepayment through a PSP marketplace split; processing passed through transparently; a small platform margin only if legal review confirms the structure.
5. **Messaging:** utility reminders included; marketing messages billed near cost.
6. **Later:** sponsored placement, AI receptionist, ZATCA included in paid plans, BNPL.

### Why this model

| Reason | Evidence |
|---|---|
| Removes the incentive to move regulars off-platform | Fresha, StyleSeat, Treatwell, Booksy all charge only for new marketplace clients |
| Undercuts the strongest global player in KSA on its weakest point | Fresha KSA charges **50 %** of a new client's first visit (min SAR 10) |
| Makes PRIMORA the system of record for the whole salon | Every booking (even free ones) generates data, reminders and repeat-booking opportunities |
| Aligns PRIMORA's revenue with value delivered | Provider pays when PRIMORA brings demand |
| Leaves room to compete with Glamera on SaaS without matching its ERP | Glamera's strength is POS / inventory / accounting; PRIMORA's is demand + WhatsApp |

### What it costs PRIMORA versus today

Today PRIMORA charges 10–15 % on all GMV **on paper**, but no provider can join, so actual revenue is zero. The question is not "how much revenue do we give up" but "what model lets providers say yes". The modelled take rate under the recommendation is **≈ 2–3 % of GMV** (section 5), close to the effective take rates of Fresha in mature markets and far below PRIMORA's published 10–15 %.

---

## 4. Unit economics per booking (ASSUMPTION, average ticket SAR 150)

| Item | Provider-sourced booking | Marketplace new-client booking |
|---|---|---|
| PRIMORA fee | SAR 0 | SAR 30 (20 % of 150, within SAR 10–40) |
| WhatsApp confirmation + 2 reminders (Meta utility ≈ SAR 0.04 each, third-party rate card) | –SAR 0.12 | –SAR 0.12 |
| Phone OTP (authentication ≈ SAR 0.04) — first booking only | — | –SAR 0.04 |
| Payments margin on prepaid share (if approved; 0.5 pp × 50 % online) | +SAR 0.38 | +SAR 0.38 |
| Contribution before fixed costs | **≈ +SAR 0.26** | **≈ +SAR 30.2** |

Provider-sourced bookings are roughly break-even per booking; they are paid for by SaaS and they feed the marketplace (reviews, repeat data, network effects). Marketplace bookings carry the margin.

---

## 5. Revenue scenarios (ASSUMPTION — not forecasts)

Inputs: ticket SAR 150; new-client fee SAR 30; SaaS starts month 6; payments margin 0.5–1.0 pp on the online-paid share.

| Scenario | Live providers | PRIMORA bookings / month | Marketplace-new share | Paid SaaS share | Monthly revenue (SAR) | Run-rate ARR (SAR) | Take rate | Messaging cost / month |
|---|---|---|---|---|---|---|---|---|
| Month 6 base | 100 | 12,000 | 10 % | 0 % | 40,500 | 486,000 | 2.25 % | 1,488 |
| Month 12 conservative | 150 | 18,000 | 6 % | 30 % | 44,505 | 534,060 | 1.65 % | 2,203 |
| **Month 12 base** | **250** | **40,000** | **8 %** | **40 %** | **125,900** | **1,510,800** | **2.10 %** | **4,928** |
| Month 12 ambitious | 400 | 80,000 | 10 % | 50 % | 323,800 | 3,885,600 | 2.70 % | 9,920 |
| Month 24 conservative | 500 | 75,000 | 6 % | 40 % | 194,925 | 2,339,100 | 1.73 % | 9,180 |
| **Month 24 base** | **1,000** | **180,000** | **8 %** | **50 %** | **638,000** | **7,656,000** | **2.36 %** | **22,176** |
| Month 24 ambitious | 1,500 | 330,000 | 10 % | 55 % | 1,484,175 | 17,810,100 | 3.00 % | 40,920 |

**Sensitivity:** in every case the **new-client fee is 60–75 % of revenue**. The business therefore depends on PRIMORA genuinely generating demand. If the marketplace does not produce new clients, PRIMORA is a low-priced SaaS competing with Glamera — a weaker business. This is the central risk to validate in months 0–6 (report 13, go/no-go gates).

---

## 6. Monetization risks

| Risk | Mitigation |
|---|---|
| Attribution disputes ("that client was already mine") | Clear rules, source shown on each booking, refund-on-proof policy |
| Providers route marketplace clients to WhatsApp after first visit | Fee is first-visit only, so there is nothing to avoid after the first visit |
| Payment margin treated as a regulated payment service | Legal opinion before charging any margin; PSP split |
| Free tier attracts low-quality supply | Quality floor and curation in launch districts |
| SaaS price war with Glamera | Compete on demand + WhatsApp + Arabic UX, not on ERP features |
| Messaging costs scale with free bookings | Utility-only included; marketing messages billed |
