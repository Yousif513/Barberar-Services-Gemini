# 09 — Saudi and GCC Localization, Regulation and Compliance

> **Research date:** 2026-10-03.
> **Important:** this is product research, not legal advice. Every item is labelled:
> - **KNOWN REQUIREMENT** — stated in an official source consulted on the research date (source given).
> - **REQUIRES LEGAL / REGULATORY CONFIRMATION** — plausible or partially sourced; a licensed Saudi lawyer or tax advisor must confirm before PRIMORA relies on it.
> - **PRODUCT EXPECTATION** — market convention, not law.
> Nothing in the codebase has been changed.

---

## 1. Tax and e-invoicing (ZATCA)

| Topic | Label | What it means for PRIMORA | Current state |
|---|---|---|---|
| VAT at 15 % | **KNOWN REQUIREMENT** | Prices shown to consumers must account for VAT; PRIMORA already adds 15 % server-side | ✓ in `create_booking` |
| E-invoicing Phase 1 (generation with QR, since 4 Dec 2021) | **KNOWN REQUIREMENT** (ZATCA) | VAT-registered sellers issue electronic invoices from compliant solutions | ✗ only an invoice number sequence |
| **Phase 2 Wave 25** — taxpayers with VAT-subject revenue above **SAR 187,500** in any of 2022–2025 must integrate with Fatoora by **1 Feb 2027** | **KNOWN REQUIREMENT** (zatca.gov.sa news, 24 Jul 2026) | This captures most VAT-registered salons and barbershops. A booking platform that cannot produce compliant invoices becomes a liability for them — and one that can becomes a reason to switch | ✗ |
| Who issues the invoice for a service booked through PRIMORA (provider as seller vs PRIMORA as agent / principal) | **REQUIRES LEGAL / TAX CONFIRMATION** | Determines whether PRIMORA invoices the customer, the provider invoices the customer, or both | Undefined |
| VAT on PRIMORA's own commission / subscription to providers | **REQUIRES TAX CONFIRMATION** (standard treatment is a taxable supply by PRIMORA) | PRIMORA must issue its own compliant invoices for fees | ✗ |
| Small providers below the VAT registration threshold | **REQUIRES TAX CONFIRMATION** of threshold and treatment | Independent barbers may not be VAT-registered: invoices must not show VAT they do not charge | ✗ not captured |
| Invoice language (Arabic required, other languages allowed) | **REQUIRES CONFIRMATION of exact article** — widely documented ZATCA rule | Bilingual invoice template | ✗ |
| Record retention period for tax records | **REQUIRES LEGAL CONFIRMATION** | Conflicts with PDPL deletion requests; must be designed together | ✗ |
| Public claim "ZATCA e-invoicing" on every pricing tier | — | **Currently untrue** (report 01, claim register) — legal and trust exposure | Remove or make true |

**Recommendation:** integrate a ZATCA-certified e-invoicing provider rather than building the cryptographic stamp, CSID onboarding and clearance flow in-house. Start before the 1 Feb 2027 deadline and market it to salons that must comply.

---

## 2. Payments and fund custody (SAMA)

| Topic | Label | Implication | Current state |
|---|---|---|---|
| Services requiring a **pooled account** to deposit and keep customers' funds are payment services requiring a SAMA licence | **KNOWN REQUIREMENT** (SAMA Rulebook: rules on e-commerce payment service and support providers; PSP Regulations Art. 5-1) | If PRIMORA receives customer money and later pays providers, it may be performing a licensed activity | Terms describe an "escrow" model; payout ledger implies PRIMORA holds balances |
| Payment Technical Service Providers (linking/technical support) do not need a licence but cannot contract merchants, do KYC or settle funds | **KNOWN REQUIREMENT** (same source) | A pure technology role is possible if a licensed PSP holds and settles funds | — |
| Licensing tiers: Micro PI (≤ SAR 10M average monthly value, SAR 1M capital, SAR 20K fee), Major PI (SAR 3M capital, SAR 50K fee) | **KNOWN REQUIREMENT** (SAMA rulebook) | Own licence is expensive and slow; not an early-stage option | — |
| Commercial-agent exclusion | **REQUIRES LEGAL CONFIRMATION** | Whether PRIMORA could rely on it is a lawyer's question; do not assume | — |
| Tap Marketplace (sub-merchant onboarding with Tap KYC, instant or delayed split, payouts from sub-merchant wallets) | **KNOWN** (developers.tap.company) | PRIMORA can split at capture so funds go provider-side through a licensed PSP | ✗ not used |
| BNPL (Tabby, Tamara) | **PRODUCT EXPECTATION**; providers are SAMA-licensed | Higher-ticket bundles (bridal, packages) | Registry entries only |
| mada, Apple Pay, STC Pay | **PRODUCT EXPECTATION** | Wallet-first checkout | Registry entries; card form first |
| Public claims "SAMA regulations", "escrow", "instant payout in under 5 minutes" | — | **Currently unbacked** — remove or substantiate | — |

**Recommendation:** obtain a written legal opinion on the payment model before launch. Default design: provider is merchant of record; PSP (e.g., Tap Marketplace) holds and splits funds; PRIMORA receives its fee as a split or invoice; PRIMORA never holds customer money.

---

## 3. Personal data (PDPL)

| Topic | Label | Implication | Current state |
|---|---|---|---|
| Consent must be free, specific, documented (time and method) and independent per purpose; withdrawable | **KNOWN REQUIREMENT** (SDAIA PDPL Implementing Regulation) | Separate consent for marketing, WhatsApp messages, photos, health information | ✗ no consent records |
| Explicit consent for sensitive data (health) | **KNOWN REQUIREMENT** (same) | Intake forms, allergy/patch-test answers | ✗ |
| Data-subject requests answered within 30 days (extendable with notice); identity verified | **KNOWN REQUIREMENT** (same) | Access, copy, correction, destruction workflow | ✗ |
| Cross-border transfer: minimum necessary, risk assessment in certain cases, safeguards (SCCs, binding rules, certification) | **KNOWN REQUIREMENT** (same) | **Where is the Supabase project hosted?** If outside KSA, a transfer assessment is needed | **UNABLE TO VERIFY** hosting region from the repository |
| Privacy policy claims "PDPL compliance" | — | Currently unbacked | — |
| Children's data (dependents / minors) | **REQUIRES LEGAL CONFIRMATION** of guardian consent requirements | Family booking stores minors' names | ✗ |
| Registration with SDAIA's national data governance platform for certain controllers | **REQUIRES LEGAL CONFIRMATION** | Possible obligation | — |
| Fabricated phone numbers stored for email sign-ups | — | Inaccurate personal data about real numbers; messaging strangers | **P0 fix** |

---

## 4. Commerce, consumer and sector rules

| Topic | Label | Implication |
|---|---|---|
| E-Commerce Law disclosure duties (identity, CR, contact, terms, price inclusive of taxes) | **REQUIRES LEGAL CONFIRMATION** of the exact list | Footer and checkout disclosures; order confirmation content |
| Consumer cancellation / refund rights for services booked online | **REQUIRES LEGAL CONFIRMATION** | Provider cancellation policies may need limits (e.g., maximum fee) |
| Salon / barbershop municipal licensing (Balady) | **REQUIRES REGULATORY CONFIRMATION** of what a platform must verify | Verification checklist; "licence verified" badge only when actually checked |
| Health-sector services (laser, injectables, clinical skin) | **REQUIRES REGULATORY CONFIRMATION** (likely Ministry of Health / SFDA scope) | Keep clinical services off the platform until a licensing check exists |
| Home beauty services licensing | **REQUIRES REGULATORY CONFIRMATION** | Salon Station operates the model; PRIMORA must know what to verify for independent home specialists |
| Saudization / Nitaqat for salon and barbershop professions | **REQUIRES REGULATORY CONFIRMATION** | Affects provider staffing, not PRIMORA directly; relevant to "professional profiles" and partnerships with training academies |
| Commercial Registration verification | **KNOWN** availability (Wathq CR API: status SAR 2, basic SAR 5, full SAR 12, owner check SAR 2, branches SAR 5 per call) | Affordable automated CR check at onboarding |
| Advertising rules for paid placement and influencer content (GCAM / Mawthooq licence for influencers) | **REQUIRES REGULATORY CONFIRMATION** | Influencer partnerships must use licensed creators; sponsored ranking must be labelled |
| Marketing messages consent (CST rules for SMS) | **REQUIRES REGULATORY CONFIRMATION** | Sender ID registration; opt-in; quiet hours |

---

## 5. Messaging (WhatsApp Business Platform)

| Topic | Label | Implication |
|---|---|---|
| Per-message pricing on delivered templates by category (marketing / utility / authentication) and recipient country, since 1 Jul 2025 | **KNOWN** (Meta developer docs) | Budget per booking is predictable |
| Saudi rates effective 2026-04-01: marketing ≈ SAR 0.188, utility ≈ SAR 0.040, authentication ≈ SAR 0.040 | **THIRD-PARTY** (Meta rate card via SAEI calculator, at 3.75 SAR/USD) — verify in Meta Business Manager | 1 confirmation + 2 reminders ≈ SAR 0.12 per booking |
| From 1 Oct 2026 service messages beyond 1,000 free/month per number charged at utility rate | **KNOWN** (Meta docs) | Support conversations are no longer free at scale |
| 72 h free window after click-to-WhatsApp ad entry | **KNOWN** (Meta docs) | Click-to-WhatsApp ads are a cheap booking channel |
| Opt-in required for business-initiated messages | **KNOWN** (Meta policy) | Capture WhatsApp opt-in at booking |

---

## 6. Cultural and operational localization (PRODUCT EXPECTATIONS)

| Area | Expectation | Current | Recommendation |
|---|---|---|---|
| Language | Arabic first, English second | English default; locale per page | Arabic default for Saudi traffic; one provider; server `lang`/`dir` |
| Typography | Proper Arabic typeface | Georgia fallback | Arabic webfont with matching Latin |
| Arabic search | Normalize alef forms (أ إ آ ا), taa marbuta/haa, yaa/alef maqsura, strip diacritics, colloquial synonyms (حلاق / باربر / صالون رجالي) | Client-side `includes` | Normalized search column + synonyms |
| Calendar | Hijri alongside Gregorian; weekend Friday–Saturday | Gregorian only | Dual dates in confirmations |
| Prayer times | Umm al-Qura calculation by city | ✓ provider side (adhan) | Show on customer slots |
| Ramadan | Late-night hours (often to 02:00–03:00), shifted demand | Overnight shifts break slot engine | Seasonal schedules; overnight shift support |
| Eid al-Fitr / Eid al-Adha | Peak demand days before Eid | Not modelled | Pre-booking windows, full prepayment option, gift appointments |
| National Day (23 Sep), Founding Day (22 Feb), wedding season | Promotions and peaks | Not modelled | Campaign calendar |
| Gender | Men's and women's services, female staff for women's home service | Gender filter ✓ | Separate entry points; female-staff preference |
| Family purchasing | Parents book for children; relatives book for each other | ✓ dependents | Promote; guardian consent |
| Phone format | +966 5X XXX XXXX, WhatsApp as identity | Email/password | Phone OTP |
| Address | National Address short code (4 letters + 4 digits) + map pin | Free text | Map pin + optional short address |
| Currency | SAR everywhere | Admin dashboard shows **US dollars** | SAR formatting with Arabic and Latin numerals |
| Tipping | Common but informal | None | Optional tip, 100 % to professional |

---

## 7. GCC expansion readiness

| Market | VAT (verify at expansion) | Notes | Technical blocker today |
|---|---|---|---|
| UAE | 5 % | Different e-invoicing programme and data law | `+03` hardcoded timezone (UAE is +04) |
| Bahrain | 10 % | Bookr (now Glamera-owned) present | Timezone OK (+03) but VAT rate is a constant 15 % |
| Kuwait | No VAT at research date (verify) | Bookr present | VAT constant |
| Qatar | No VAT at research date (verify) | — | VAT constant |
| Oman | 5 % | — | Timezone (+04), VAT constant |

**Recommendation:** do not expand beyond KSA in the first 18 months. Before any expansion: branch-level timezone, country-level tax configuration, per-country payment methods and legal review.

---

## 8. Localization and compliance priorities

- **P0:** stop unbacked claims (ZATCA, SAMA, escrow, PDPL compliance, hygiene audits); real phone numbers; consent records; legal opinion on payment custody; DSR workflow.
- **P1:** ZATCA Phase 2 via certified partner before 1 Feb 2027; Arabic-first locale and typography; Arabic search normalization; Ramadan/overnight schedules; SAR everywhere; CR verification via Wathq.
- **P2:** Hijri dates, Eid campaign tooling, National Address, tips.
- **P3:** GCC multi-country configuration.
