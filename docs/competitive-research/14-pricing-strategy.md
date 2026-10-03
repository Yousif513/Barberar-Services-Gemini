# 14 — Pricing Strategy

> **Research date:** 2026-10-03. The PRIMORA pricing page has **not** been modified. Competitor prices come from official pages fetched on the research date (report 02); where a price is not published it is marked **NOT PUBLICLY DISCLOSED**. Every recommended price below is a **HYPOTHESIS to validate**, not a decision.
> All SAR figures exclude VAT unless stated. USD converted at 3.75.

---

## 1. Audit of the current PRIMORA pricing page (`web_platform/src/app/provider/pricing/page.tsx`)

### 1.1 What the page says

| Plan | Monthly | Annual (per month) | Commission shown | Audience copy |
|---|---|---|---|---|
| Lite Starter (`:30`) | SAR 0 — "Free Forever" (`:50`) | — | **15 %** platform fee (`:409`) | "independent artists & newly opened local salons" (`:33`) |
| Growth Pro (`:35-38`) | **SAR 299** | **SAR 239** ("Save 20 %", `:22`) | **10 %** "(Discounted!)" (`:468`) | "scaling salons needing advanced analytics and marketing integrations" |
| Elite Salon (`:40-43`) | **SAR 799** | **SAR 639** | **Not stated** on the card | "luxury salon chains requiring dedicated managers & bespoke APIs" |

Feature matrix (`:297-305`): online booking, **ZATCA e-invoicing**, **SMS alerts & reminders**, **secure escrow hold & split ledger** on all three plans; advanced analytics, marketing tools and unlimited staff on Growth and Elite; 24/7 dedicated account manager on Elite. Fee explainer (`:14`): "flat 15 % commission fee on every booking … covers ZATCA e-invoicing compliance, Tap Connect transaction fees, SMS alerts, and secure escrow holds. No monthly subscription is required for basic accounts."

### 1.2 Claims versus reality

| Claim on the page | Reality in the codebase | Risk |
|---|---|---|
| ZATCA e-invoicing on every plan | Invoice number sequence only; no XML, QR, cryptographic stamp or Fatoora integration | Regulatory / misleading advertising |
| SMS alerts & reminders on every plan | No reminder scheduler, no SMS sending | Misleading |
| "Secure escrow hold" | No escrow; deposit captured by Tap and split in PRIMORA's ledger; PRIMORA described as holding funds | SAMA licensing question (report 09) |
| "automated payout transfers … in under 5 minutes" (`:67`) | Payouts are a manual request → admin approval | Misleading |
| "secured under local SAMA regulations" (`:65`, Arabic `:151`) | No licence or legal opinion found | Regulatory |
| "automatic refund policies" (`:69`) | Refund function is broken and unauthenticated; no policy engine | Misleading + security |
| Growth commission 10 % | `commission_percentage` is forced to **15.00** on provider insert and only admin can change it; no plan is linked to it | Billing dispute |
| Elite commission | Not shown; Terms say flat 15 % | Ambiguity |
| Plan checkout | `setTimeout` simulation (`:213, :248, :258`); collects raw card number, expiry, **CVV** and cardholder in React state (`:192, :253, :813-817`); `mockCardWarning` text (`:87`) | PCI scope; owner believes they subscribed |
| Unlimited staff on Growth/Elite, not on Lite | Nothing enforces tiers | Unenforceable promise |

### 1.3 Structural problems

1. **Commission on every booking** — including the provider's own regulars. This is the opposite of what the market leaders do (section 2).
2. **Paying SAR 299 buys only 5 percentage points of commission.** Growth breaks even with Lite at SAR 5,980 GMV/month; above that it is cheaper, but both are far more expensive than SaaS competitors.
3. **No free trial and no founding-partner offer** — yet there is no product a provider can try anyway (no onboarding path).
4. **The price page sells features that do not exist.** Before any pricing change, the claims must be corrected (P0).

---

## 2. Competitor pricing (official sources, 2026-10-03)

| Competitor | Market | Subscription | Marketplace / new-client fee | Payment processing | Messaging | Other | Source |
|---|---|---|---|---|---|---|---|
| **Fresha** | KSA | Independent **SAR 149.95/mo** (1 member); Team **custom — NOT PUBLICLY DISCLOSED** | **50 % of new client's first visit, min SAR 10**; returning clients free | **4.90 % + SAR 0.75** | WhatsApp **SAR 0.15–0.30**; automated text SAR 0.35; marketing text SAR 0.40; email SAR 0.07 (after 20 free/member) | Insights SAR 319.95/location; Smart Website SAR 129.95; Google Rating Boost SAR 35.95/location | fresha.com/pricing (SA, raw HTML) |
| Fresha | US | Independent $19.95; Team $14.95/member | 20 %, min $6 | 2.79 % + $0.20 online | 100 free msgs | AI Concierge $99.95/location | fresha.com/pricing (US) |
| **Glamera** | KSA | **Starter SAR 125** (≤ 3 users) · **Basic SAR 225** (≤ 10) · **Advanced SAR 325** (≤ 20); **+SAR 10/additional employee**; up to 20 % off annually; free trial | NOT PUBLICLY DISCLOSED | NOT PUBLICLY DISCLOSED (Glamera Pay) | NOT PUBLICLY DISCLOSED (WhatsApp & SMS included in Pro) | Website, staff app, kiosk add-ons unpriced | business.glamera.com/en/pricing |
| **SPOT (Slotex)** | KSA | "Custom pricing per salon" — **NOT PUBLICLY DISCLOSED**; free setup; no long-term contract | NOT PUBLICLY DISCLOSED | Via licensed processor — NOT PUBLICLY DISCLOSED | Arabic SMS + WhatsApp included (price undisclosed) | — | slotex.sa |
| **Glamiva** | KSA | NOT PUBLICLY DISCLOSED | NOT PUBLICLY DISCLOSED | NOT PUBLICLY DISCLOSED | — | Ad banners / offers inside app | glamiva.sa |
| **Samha** | KSA | UNABLE TO VERIFY | UNABLE TO VERIFY | UNABLE TO VERIFY | — | — | samhaapp.com (certificate expired) |
| **Booksy** | US (KSA UNABLE TO VERIFY) | $29.99/mo + $20/additional staff | Boost: 30 % of first visit, cap $100 | 2.69 % + $0.30 mobile | 2,000 SMS/mo included | Fast payout 1.5 % | biz.booksy.com/pricing |
| **Vagaro** | US | ~$30/mo + $10/calendar (up to 7) | — | NOT PUBLICLY DISCLOSED | 1,000 emails/mo | 30-day trial | vagaro.com/pro/pricing |
| **StyleSeat** | US | $35/mo | 30 % of first appointment, max $50, opt-out allowed, refundable for word-of-mouth | NOT PUBLICLY DISCLOSED | — | Referral discount 15 % funded by StyleSeat | styleseat.com, help.styleseat.com |
| **SQUIRE** | US (barbers) | $30 / $50 / $150 / $250 per month | — | NOT PUBLICLY DISCLOSED | Unlimited reminders free | AI Operator +$99 | getsquire.com/pricing |
| **Treatwell** | Europe | NOT PUBLICLY DISCLOSED | First appointment only ("finder's fee"); % NOT PUBLICLY DISCLOSED | — | — | — | treatwell.co.uk/partners |
| **Mindbody** | Global | From $79/location/mo | Marketplace listing included | Included plans; rates NOT PUBLICLY DISCLOSED | Automation on top tier | — | mindbodyonline.com/business/pricing |
| **Zenoti** | Enterprise | NOT PUBLICLY DISCLOSED | — | — | — | — | zenoti.com |

**Pattern:** every marketplace leader charges for **new** marketplace clients only, and every SaaS leader charges a flat or per-staff subscription. Nobody charges a percentage of every booking forever. Fresha's Saudi new-client fee (**50 %**) is 2.5× its US rate — a visible weakness PRIMORA can attack.

---

## 3. Effective provider cost scenarios

### 3.1 Assumptions (all ASSUMPTION unless marked)

| Input | Value |
|---|---|
| Average ticket | SAR 150 |
| Share of bookings paid online | 70 % |
| Share of monthly bookings that are **new clients from the marketplace** | 1-person 20 % · 5-person 15 % · 10-person 12 % · 3-branch 10 % · enterprise 5 % |
| Monthly bookings | 80 · 400 · 800 · 2,400 · 10,000 |
| Staff / branches | 1/1 · 5/1 · 10/1 · 24/3 · 100/10 |
| PRIMORA commission | on every booking at the published rate (Lite 15 %, Growth 10 %, Elite 15 % per Terms); processing included (page `:14`) |
| Fresha KSA | published SA rates; one WhatsApp reminder per booking at SAR 0.15 after 20 free per member; Team subscription not disclosed → excluded |
| Glamera | published tiers, **per branch** (assumption); range = Starter + SAR 10/extra employee vs next tier; processing **NOT PUBLICLY DISCLOSED → 3 % assumed** for comparability |
| Booksy | US prices as reference only; Boost applied to new marketplace clients |

### 3.2 Monthly cost to the provider (SAR)

| Scenario (GMV/month) | PRIMORA Lite (published) | PRIMORA Growth (published) | Fresha KSA | Glamera (+3 % assumed processing) | Booksy (US ref.) | **PRIMORA proposed** (hypothesis, §4) |
|---|---|---|---|---|---|---|
| 1-person barber (SAR 12,000) | **1,800** (15.0 %) | **1,499** (12.5 %) | **1,813** (149.95 sub + 1,200 new-client + 454 processing + 9 WhatsApp) | **377** (125 + 252) | 1,121 | **732** (0 SaaS + 480 new-client + 252 processing) |
| 5-person salon (SAR 60,000) | 9,000 (15.0 %) | 6,299 (10.5 %) | 6,813 **+ undisclosed Team sub** | 1,405–1,485 | 4,557 | 3,209 (149 + 1,800 + 1,260) |
| 10-person salon (SAR 120,000) | 18,000 (15.0 %) | 12,299 (10.2 %) | 11,826 + undisclosed sub | 2,715–2,745 | 7,997 | 5,549 (149 + 2,880 + 2,520) |
| 3 branches, 24 staff (SAR 360,000) | 54,000 (15.0 %) | 36,299 (10.1 %) | 31,896 + undisclosed sub | 8,085–8,235 | 21,306 | 15,207 (447 + 7,200 + 7,560) |
| Enterprise, 10 branches, 100 staff (SAR 1.5M) | 225,000 (15.0 %) | 150,299 (10.0 %) | 95,400 + undisclosed sub | 33,450–33,750 (likely custom) | 66,157 | 47,990 (negotiated in practice) |

### 3.3 What the numbers say

1. **PRIMORA's published Growth plan costs ≈ 4.0–4.5× Glamera** in every scenario; Lite costs 4.8–6.7×.
2. **PRIMORA Growth is roughly equal to Fresha KSA** for small providers — but Fresha only charges that much because of new clients it delivers; PRIMORA charges it on clients the provider already had.
3. At **zero** marketplace clients, the proposed model costs a provider **SaaS + processing only** (5-person: SAR 1,409; 10-person: SAR 2,669) — on par with Glamera. Everything above that is paid only when PRIMORA delivers a new client.
4. The proposed new-client fee (SAR 30 on a SAR 150 visit) is **60 % lower than Fresha KSA (SAR 75)**. If an acquired client returns six times a year (ASSUMPTION), the fee is ≈ 3 % of that client's first-year revenue.
5. Processing is the largest cost line in every model; negotiating PSP rates is worth more to providers than shaving the subscription.

---

## 4. Recommended pricing (HYPOTHESES — owner approval and validation required)

### Phase A — Launch (months 0–6): "Founding Partner"

| Element | Recommendation | Reason |
|---|---|---|
| Who | First 100 providers in the launch districts | Scarcity, community, testimonials |
| Software | **Free for 6 months**, then founding price locked for 12 months (e.g., 30 % off the Team plan) | Removes the adoption barrier while the product earns trust |
| Own clients (link, QR, WhatsApp, Instagram, import, walk-in) | **0 % commission, forever** | The core promise |
| Marketplace new clients | **20 % of first-visit service value, min SAR 10, max SAR 40**, first visit only | Fair and 60 % below Fresha KSA |
| Payments | Deposits / prepayment via PSP split; processing at cost, **no margin until legal opinion** | Regulatory safety |
| Messaging | WhatsApp confirmations and reminders included | Visible value from week one |
| Contract | Monthly, cancel anytime, data export on exit | Matches Fresha / SPOT / Glamera norms |

### Phase B — Growth (months 6–18)

| Plan | Price (hypothesis) | Includes | Compared with |
|---|---|---|---|
| **Solo** | SAR 0 | 1 professional; booking link/QR; calendar; marketplace listing; WhatsApp reminders (fair-use cap); 0 % own clients | Fresha KSA Independent SAR 149.95 |
| **Team** | **SAR 149 / branch / month** (up to 10 bookable professionals) | Staff app, policies & no-show fees, reports, client notes, ZATCA invoices via partner (when live) | Glamera Starter 125 (≤3) / Basic 225 (≤10) |
| **Team Plus** | **SAR 249 / branch / month** (up to 25) | Multi-branch dashboard, marketing campaigns, priority support | Glamera Advanced 325 (≤20) |
| Annual | 2 months free (~17 %) | Cash flow | Glamera "up to 20 %" |
| New-client fee | unchanged (20 %, SAR 10–40) | — | — |

### Phase C — Mature (months 18+)

- **Sponsored placement**: opt-in, labelled; pay per new client booked (e.g., higher fee cap) rather than per click.
- **AI WhatsApp receptionist** add-on (hypothesis SAR 99–149 / branch / month) once WhatsApp booking is proven.
- **Enterprise**: custom (API, SSO, central reporting, SLA).
- **Payments margin**: only within the legally confirmed structure.
- Revisit the new-client fee **with data**: dispute rate, provider churn, marketplace share of bookings.

---

## 5. Pricing experiments

| Experiment | Method | Success signal |
|---|---|---|
| Willingness to pay | 20–30 structured interviews with owners (Van Westendorp questions) in launch districts | Acceptable range covers SAR 149 Team plan |
| Fee cap | Founding cohort A: cap SAR 40; cohort B: cap SAR 30 | No difference in signup → keep SAR 40 |
| Message test | Landing pages: "0 % on your clients" vs "Half of Fresha's new-client fee" | Higher application rate |
| Annual uptake | Offer at month 6 | ≥ 25 % choose annual |
| Attribution trust | Track dispute rate on new-client fees | < 3 % of charged fees disputed |

---

## 6. What not to do with pricing

- Do not keep a percentage on every booking.
- Do not charge customers a booking fee.
- Do not sell features that do not exist (current page).
- Do not take a payments margin before the SAMA question is answered.
- Do not race Glamera to the bottom on SaaS; compete on demand, WhatsApp and Arabic UX.
- Do not change the live pricing page until the owner approves a model (this report changes nothing).
