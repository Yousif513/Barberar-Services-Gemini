# PRIMORA — Master Audit, Competitive Intelligence and Strategy

> **Research date:** 2026-10-03 · Repository: `codex` branch @ `734fcd9` · Scope: research, audit and strategy only.
> **Nothing in the application, database, configuration, pricing or agreements was changed.** All recommendations await the owner's explicit approval.

---

## Executive summary

PRIMORA has a **strong booking core** — database-enforced double-booking protection, server-side pricing, verified reviews, prayer-aware scheduling, family booking and a gender-segmented catalog — wrapped in a large interface where much is decorative, mocked or broken.

**Today it cannot operate as a marketplace:** there is no way for a business to join, no reminders, no enforced cancellation policy, unpaid bookings block slots forever, a refund function anyone can call, fabricated phone numbers, and public claims (ZATCA, SMS reminders, escrow, SAMA, 5-minute payouts, hygiene audits) that the code does not back.

**Its business model is also inverted relative to the market:** PRIMORA charges 10–15 % on every booking, including clients the salon already owns. Its published Growth plan costs a provider **≈ 4–4.5× Glamera**, while leaders (Fresha, StyleSeat, Treatwell, Booksy) charge only for **new** marketplace clients.

**The opportunity is real and specific:** Fresha charges Saudi salons **50 %** of a new client's first visit (2.5× its US rate). Glamera is a strong ERP and payments company, not a consumer marketplace first. Local consumer apps are small and women-first. A **fair, Arabic, WhatsApp-native** platform with free own-client bookings and a capped first-visit fee — launched district by district in Riyadh — has a credible path.

**Recommended next step (revised 2026-10-03 on the owner's instruction):** start development now and build **P0 then P1 back-to-back** in the step order of report 11 (P0-A safety & truth → P0-B identity & consent → P0-C supply & agreements → P0-D booking rules & money → P0-E WhatsApp → P1-A … P1-E). Send the payment-custody question to Saudi counsel in parallel. The 24-month calendar now governs only the commercial rollout.

---

## Scorecard

Method: 20 dimensions scored 0–10 from code evidence (reports 01, 07, 08) and competitor benchmarks (02–04). Total out of 200, shown as /100.

| # | Dimension | Current | After P0 + P1 | Main evidence |
|---|---|---|---|---|
| 1 | Customer booking flow | 5 | 8 | Real slots and payment; login loses selection; duplicate card form |
| 2 | Booking-engine integrity | 8 | 9 | Exclusion constraint, server pricing; holds never expire |
| 3 | Availability & scheduling depth | 4 | 7 | Split shifts, prayer windows; no time-off, buffers, overnight |
| 4 | Supply onboarding | 0 | 7 | No code path creates a provider |
| 5 | Provider operations tools | 4 | 6 | Services, staff, calendar; mock reports; missing tables |
| 6 | Employee experience | 1 | 6 | Role exists; pages owner-scoped |
| 7 | Payments & payouts | 3 | 7 | Capture sound; refund broken; manual payouts; custody unclear |
| 8 | Cancellation & no-show protection | 1 | 8 | Cancel any time, no fee; Terms promise otherwise |
| 9 | Communications (WhatsApp, reminders) | 1 | 8 | None |
| 10 | Discovery & search | 4 | 6 | Real catalog; client filtering; no distance |
| 11 | SEO & organic acquisition | 1 | 6 | 81/81 client-rendered pages; no sitemap |
| 12 | Reviews & trust | 6 | 8 | Verified by construction; no moderation; unbacked trust claims |
| 13 | Retention & marketing tools | 2 | 4 | Coupons/packages unusable; no loyalty, referral, waitlist |
| 14 | Saudi localization & culture | 6 | 8 | Prayer engine, gender catalog, family booking; ZATCA missing |
| 15 | Arabic / RTL UX quality | 4 | 7 | Locale per page; `lang="en"`; no Arabic font |
| 16 | Visual design & accessibility | 4 | 7 | Contrast 2.11:1, no focus styles, erased status badges |
| 17 | Admin & operations control | 3 | 7 | One-third decorative; demo fallbacks; USD |
| 18 | Security & privacy compliance | 3 | 8 | RLS strong; unauthenticated money/push functions; no consent |
| 19 | Pricing & monetization model | 2 | 8 | Commission on all bookings; simulated plans |
| 20 | Analytics, testing & observability | 1 | 7 | No analytics, no tests, no error tracking |
| | **Total** | **63 / 200** | **142 / 200** | |

## **CURRENT PRIMORA SCORE: 32/100**
## **POTENTIAL AFTER P0/P1: 71/100**

---

## Report index

| # | Report | What it contains |
|---|---|---|
| 01 | [Current PRIMORA audit](01-current-primora-audit.md) | Feature inventory F01–F82 with status and evidence; page inventories; claims-vs-reality register |
| 02 | [Competitor analysis](02-competitor-analysis.md) | Fresha, Glamera, SPOT, Glamiva, Samha, Laha, Salon Station, BeautyBook, Jamal, Salonist, Bookr, Booksy, Vagaro, StyleSeat, SQUIRE, Treatwell, Mindbody, Zenoti; flows; differentiators |
| 03 | [Page comparison](03-page-comparison.md) | Customer, business and employee screen matrices |
| 04 | [Feature matrix](04-feature-matrix.md) | Six capability matrices (✓ △ ✗ ?) |
| 05 | [Gap analysis](05-gap-analysis.md) | A has / B improve / C missing / D advantage; six strategy chains |
| 06 | [Missing features](06-missing-features.md) | Missing by audience; marketplace, booking, financial and trust mechanics not considered |
| 07 | [UX audit](07-ux-audit.md) | Current → problem → lesson → solution |
| 08 | [Technical audit](08-technical-audit.md) | Architecture, risks, scalability, data gaps, 28 booking edge cases |
| 09 | [Saudi localization](09-saudi-localization.md) | ZATCA, SAMA, PDPL, commerce, WhatsApp, culture — known vs requires confirmation |
| 10 | [Monetization](10-monetization.md) | Current revenue mechanics, streams, unit economics, scenarios |
| 11 | [Product roadmap](11-product-roadmap.md) | Development execution plan: P0-A → P0-E, then P1-A → P1-E, built now with exit checks per step |
| 12 | [Prioritized backlog](12-prioritized-backlog.md) | Master gap table G01–G75 (P0→P3, S–XL); not-build list |
| 13 | [Business strategy](13-business-strategy.md) | 17 sections incl. 24-month plan, assumptions, risks, experiments, go/no-go; AI strategy |
| 14 | [Pricing strategy](14-pricing-strategy.md) | Pricing-page audit; competitor prices; provider cost scenarios; launch/growth/mature |
| 15 | [Agreements & partnerships](15-agreements-and-partnerships.md) | Agreement audit; competitor clause matrix; agreement architecture; partners |
| 16 | [Go-to-market](16-go-to-market-strategy.md) | Positioning; segment; provider acquisition 10→1,000; customer acquisition; WhatsApp-first |
| 17 | [KPI framework](17-kpi-and-success-framework.md) | North star; targets for MVP / 6 / 12 / 24 months; instrumentation |

---

## Final executive output

### 1. Ten most important findings
1. **No business can join PRIMORA** — no code path creates a provider; "Add provider" in admin writes only to React state.
2. **Commission on every booking** (forced to 15 % in the database) taxes salons' own clients; the advertised Growth 10 % is not connected to anything.
3. **Published Growth plan ≈ 4–4.5× Glamera's cost** for the same salon; roughly equal to Fresha KSA but without delivering new clients.
4. **Unauthenticated `process-refund`** can trigger real Tap refunds and records nothing.
5. **Unpaid bookings never expire**, permanently blocking slots.
6. **Email sign-ups get random real-range Saudi mobile numbers**, which any messaging would reach.
7. **Public claims are untrue:** ZATCA e-invoicing, SMS reminders, escrow, SAMA, payouts in 5 minutes, automatic refunds, hygiene audits, PDPL compliance.
8. **Customer cancellation has no policy** although the Terms promise 24 h / up to 50 %.
9. **The booking core is genuinely strong** (exclusion constraint, server pricing, verified reviews) — the foundation is worth keeping.
10. **Fresha charges Saudi salons 50 % of a new client's first visit**; local consumer apps are women-first — leaving room for a fair, men's-grooming-first, Arabic WhatsApp-native platform.

### 2. Ten biggest missing features
1. Provider application, verification and approval
2. Booking link / QR / WhatsApp & Instagram share with source attribution
3. WhatsApp confirmations and reminders
4. Enforced cancellation and no-show policy
5. Payment-hold expiry and reconciliation
6. Phone-OTP identity
7. Consent records and data-subject requests (PDPL)
8. ZATCA Phase 2 e-invoicing (deadline 1 Feb 2027)
9. Employee "My day" view and staff permissions
10. Time-off, closures, overnight and Ramadan schedules

### 3. Ten most important improvements
1. Switch to source-based fees: 0 % on own clients, capped first-visit fee for marketplace clients
2. Move fund custody to a PSP split (Tap Marketplace) after legal opinion
3. Remove the raw card forms on the pricing and booking pages
4. Keep the booking selection through an inline phone OTP
5. Atomic, audited money operations (payouts, refunds)
6. One Arabic-first locale system with proper Arabic typography
7. Honest admin states (no demo fallbacks; SAR, not USD)
8. Show professional ratings; add responses and moderation
9. Server-rendered, indexable provider and district pages
10. Fix design-system defects: status badges, contrast, focus, mobile navigation

### 4. Ten things PRIMORA does well
1. Database-level double-booking prevention
2. Tamper-proof, server-derived pricing with VAT
3. Verified-by-construction reviews
4. Prayer-time aware scheduling (Umm al-Qura)
5. Family / dependent booking
6. Gender-segmented catalog
7. RLS on all 30 tables, role escalation blocked
8. Verified payment webhook with idempotency
9. Service catalog administration with correct rollback
10. Saudi payment-method registry (mada, Apple Pay, STC Pay, Tabby, Tamara)

### 5. Five things not considered
1. **Customer ownership and source attribution** — the basis of fair fees
2. **Fund custody under SAMA rules** — "escrow" may be a licensed activity
3. **Commission shortfall** — fees are taken only from the deposit and never collected above it
4. **Seasonality** — Ramadan night hours, Eid peaks, overnight shifts
5. **Trust & safety rules** — customer abuse, review moderation, home-service address privacy

### 6. Five strongest potential advantages
1. Fair pricing against Fresha's 50 % Saudi new-client fee
2. WhatsApp-native operations at near Meta cost (≈ SAR 0.04 per utility message)
3. Prayer-aware, Ramadan-aware, family-aware booking
4. Men's grooming first, where local apps are absent
5. Verified reputation per professional

### 7. Recommended P0 scope
G01–G19: provider onboarding; source-based fees; booking link/QR; hold expiry; disable/rebuild refunds; gate notifications; remove card forms; correct claims; phone OTP; cancellation/no-show policy; WhatsApp reminders; PSP split after legal opinion; consent + DSR; audit log + atomic money ops; analytics; login return; overnight shifts; provider agreement and aligned terms; test runner with authorization negative tests.

### 8. Recommended P1 scope
G20–G43: any-professional slots; reschedule; time-off and seasonal schedules; buffers and variants; employee view; ZATCA via partner; CR verification; Arabic-first locale; SEO pages; server search; review depth; missing tables; honest admin; disputes and reconciliation; fee collection beyond deposits; client import; mobile app decision; home-service safety; real subscriptions; design fixes; security hardening; post-visit rebook; pro profiles; provider value summary.

### 9. Deliberately not building yet
POS hardware and kiosks, inventory, payroll, own payment licence, white-label apps, AI voice receptionist, memberships, GCC expansion, developer API, consumer subscription, in-house ZATCA cryptography, mobile feature parity.

### 10. Major technical risks
Unauthenticated money and push functions; no scheduled jobs; browser-side money mutations; no tests or observability; four tables referenced but never created; client-only rendering (no SEO, no server authorization layer); hardcoded `+03` timezone; unbounded queries at the 1,000-row cap; plaintext API tokens; a high-severity framework advisory.

### 11. Major marketplace and business risks
Marketplace may not generate new clients (60–75 % of modelled revenue depends on it); Glamera's scale and licensed payments; Fresha price response; payment-custody regulation; current misleading claims; provider churn after free months; women's-salon segment requires female-led sales; founder bandwidth.

### 12. Recommended pricing model
Founding Partner (first 100): free 6 months; **0 % on own clients forever**; first-visit fee **20 %, min SAR 10, max SAR 40**; processing at cost. Then Solo SAR 0 · Team SAR 149 / branch · Team Plus SAR 249 / branch. All hypotheses to validate.

### 13. Provider acquisition strategy
Founder-led first 10 in 3–4 north-Riyadh districts → referrals and district clusters to 50 → male and female field sellers to 100 → self-serve + ZATCA Wave 25 campaign + academies to 500 → partner channels and Jeddah to 1,000.

### 14. Customer acquisition strategy
Providers' own clients via links and QR first; click-to-WhatsApp ads by district; Arabic local SEO; referral credits; Ramadan and pre-Eid campaigns; family booking; licensed influencers — consumer spend only after district density.

### 15. Launch strategy
Riyadh, barbershop-first hypothesis validated in 4 weeks; density gate (≥ 15 providers within ~5 km, ≥ 60 % hours bookable) before consumer marketing; soft launch January 2027; first demand test in Ramadan / pre-Eid 2027.

### 16. Agreement structure
P0: Provider Agreement, rewritten Customer Terms, Privacy Notice + consent model, payment & payout schedule (all with Saudi legal review). P1: subscription, professional, review & content, home-service and data-processing terms. Versioned with recorded acceptance.

### 17. Partnership priorities
1) Saudi counsel · 2) Tap Marketplace · 3) WhatsApp Business Platform · 4) Wathq · 5) ZATCA-certified e-invoicing partner · 6) SMS fallback · 7) academies, malls, influencers · 8) BNPL · later brands, banks, corporate.

### 18. Monetization strategy
"Free to run your book, pay when we bring you a client": first-visit fees (core), team SaaS from month 6, transparent payments (margin only if legal), messaging at cost, later sponsored placement and AI receptionist. Base case ~SAR 1.5M run-rate at month 12 and ~SAR 7.7M at month 24 (assumption-driven).

### 19. Development and rollout strategy (revised 2026-10-03)
**Development does not wait 24 months.** P0 and P1 are built now, back-to-back, each step starting as soon as the previous one passes its exit checks (report 11):

| Step | Items | Indicative effort |
|---|---|---|
| P0-A Safety, truth & cleanup | G05 refund lock, G06 notification auth, G07 card forms out, G08 true claims, G04 hold expiry, G15 analytics/errors, G19 tests | ~1–1.5 wk |
| P0-B Identity & consent | G09 phone OTP, G16 keep booking through sign-in, G13 consents + data requests | ~1–2 wk |
| P0-C Supply & agreements | G01 provider onboarding, G18 versioned terms + acceptance, G03 booking link/QR + source | ~2 wk |
| P0-D Booking rules & money | G17 overnight shifts, G10 cancellation/no-show policy, G02 source-based fees, G14 audit + atomic money ops, G12 PSP split (flagged) | ~2–3 wk |
| P0-E WhatsApp | G11 confirmations, reminders, post-visit | ~1–2 wk |
| P1-A → P1-E | Hygiene · scheduling depth · people & trust · money depth & ZATCA · growth surfaces (G20–G43) | ~10–14 wk |

Total indicative engineering effort for P0 + P1: ~17–24 weeks for one senior engineer equivalent — less with parallel agents. **These are effort sizes, not waiting periods.** The 24-month plan (report 13) now applies only to commercial rollout: founding supply (months 0–3), soft launch and Ramadan/Eid demand test (3–6), Riyadh growth and paid plans (6–12), Jeddah (12–18), scale (18–24), with go/no-go gates on spending and expansion only.

### 20. Next development step
**Start P0-A now:** lock `process-refund` behind admin authentication (full rebuild in P0-D), require authentication on `send-notification`, remove raw card forms, expire unpaid holds, correct every unbacked claim in Arabic and English, remove demo fallbacks from financial/tax screens and grep-bait comments, add analytics and error tracking, add a test runner with authorization negative tests. Then continue straight into P0-B. In parallel (owner): engage Saudi counsel on payment custody, terms and PDPL; confirm fee values; provide WhatsApp / Tap Marketplace / analytics credentials; run 20–30 owner interviews.

---

## Final strategic answer

**If PRIMORA were my company and capital were limited:**

**What I would build.** In order: (1) the truth-and-safety fixes, because a marketplace that moves money cannot carry an open refund endpoint or false claims; (2) provider onboarding with CR verification and a 30-minute assisted setup; (3) a booking link and QR for every provider, with source tagging; (4) WhatsApp confirmations and reminders with confirm/reschedule buttons; (5) provider-set cancellation and no-show policies, enforced; (6) payments through a licensed PSP split so PRIMORA never holds customer money; (7) an employee "My day" view; (8) ZATCA invoices through a certified partner before 1 February 2027. Those eight items make PRIMORA useful every day inside a salon and fair to the salon. Discovery, SEO and growth features come after the first districts are dense.

**What I would not build.** POS hardware, inventory, payroll, a payment licence, white-label apps, memberships, an AI voice agent, a feature-complete mobile app, a developer API, or anything for other GCC countries. I would also hide or simplify pages that pretend to work — the mock mobile app, the developer token page, decorative admin and report screens — rather than polish them.

**How I would price it.** Free to run your own book, forever, with 0 % on clients the salon brings. A one-time fee only when PRIMORA's marketplace brings a new client — around 20 % of the first visit, capped at SAR 40, refundable when the salon proves the client was already theirs. Free software for the first 100 founding partners for six months, then a Team plan priced at or below Glamera (around SAR 149 per branch). Payments passed through transparently. Every number tested with owners before it goes on the page.

**How I would get the first providers and customers.** The founder personally signs the first 10 premium barbershops in three or four adjacent north-Riyadh districts and sets them up in the shop. Those ten bring their own clients through the link and QR on the mirror — PRIMORA's first liquidity costs nothing. Referrals and district walking get to 50; a male and a female field seller get to 100. Consumer marketing (click-to-WhatsApp ads, Ramadan nights, pre-Eid "guaranteed slot") starts only when a district has enough providers to give customers real choice.

**How I would generate revenue.** First-visit fees once the marketplace sends real customers (the main stream); team subscriptions from month six; later, labelled sponsored placement and an Arabic WhatsApp receptionist add-on. Revenue grows with value delivered, not with every booking a salon already had.

**How PRIMORA should differ from Fresha, Booksy and the Saudi/GCC players.** Against **Fresha**: the same fairness on returning clients, a fraction of its 50 % Saudi new-client fee, and Arabic, WhatsApp-native operations. Against **Glamera**: not an ERP — a demand engine with simple operations, fast to start. Against **SPOT**: the same WhatsApp discipline plus a marketplace and public prices. Against **Samha, Laha, Jamal, Glamiva**: men's grooming first, family booking and verified businesses. Underneath all of it: prayer-aware and Ramadan-aware scheduling, verified reviews per professional, and a booking engine that cannot double-book.

**The sequence with the highest probability of success.** Engineering builds P0 and P1 immediately and back-to-back (report 11); the commercial sequence runs alongside it: truth and safety first → founding supply in one dense district cluster (months 1–3) → prove providers stay and that PRIMORA can create first visits during Ramadan and pre-Eid (months 3–6) → turn on paid plans and grow Riyadh (months 6–12) → replicate in Jeddah only if Riyadh's unit economics hold (months 12–18) → scale (months 18–24). If after six months PRIMORA cannot generate meaningful new-client demand, the fallback is a lean Arabic WhatsApp operations tool for salons — a smaller but still viable business — rather than burning capital on consumer ads.

---

## Limitations and items that could not be verified

- **NOT PUBLICLY DISCLOSED:** Fresha KSA Team pricing; Glamera processing and marketplace fees; SPOT, Glamiva, Treatwell and Zenoti pricing; Tap rates.
- **UNABLE TO VERIFY:** Samha pricing and onboarding (site certificate expired); Booksy presence in KSA; Supabase hosting region; scope of PRIMORA's Tap contract.
- Competitor performance claims (SPOT no-show reduction, Zenoti abandonment, scale figures) are **self-reported**.
- Saudi legal and tax points are flagged; none is legal advice.
- Revenue and cost scenarios are **assumption-driven models**, not forecasts.

## Repository state

- This research (folder `docs/competitive-research/`), the adminwright manifest (`.admin-console/`) and the "Admin console delivery rules" appended to `AGENTS.md` were committed on 2026-10-03 and merged into `master` together with Codex's previously unmerged `codex` branch work, as the starting point for development.
- The development hand-off prompt for Gemini is [GEMINI_P0_P1_DEVELOPMENT_PROMPT.md](GEMINI_P0_P1_DEVELOPMENT_PROMPT.md).
- No application code, migrations, configuration, pricing page or agreements were modified by the research itself.
