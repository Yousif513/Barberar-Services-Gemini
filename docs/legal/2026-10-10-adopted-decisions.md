# Adopted owner decisions: 2026-10-10 (plan of record)

On 2026-10-10 the owner instructed the team to adopt the recommended answers to Q1–Q9 and D1–D4, but only where they comply with
Saudi regulation and serve customers and the business, after legal review. Two compliance reviews were run:

- `2026-10-10-privacy-decision-memo.md` (PDPL and its Implementing Regulation, the transfer regulation, the SDAIA breach guide, ZATCA,
  Commercial Books Law)
- `2026-10-10-money-governance-decision-memo.md` (SAMA, e-commerce and consumer rules, VAT, internal controls)

The **"Final decision text" of each memo is adopted as written** and replaces the earlier draft recommendations wherever they differ.
Neither review is advice from licensed counsel. The items marked COUNSEL below must be confirmed by a licensed Saudi lawyer or tax
adviser before launch. Where a memo calls a number a business choice, its safest default is adopted and can be changed by the owner.

## Adopted (to be built)

| Id | Decision (short form; the memo text governs) | Package |
|----|----------------------------------------------|---------|
| D1 | Regulated profile | manifest |
| D-Q5 | Roles `owner`, `finance`, `operations`, `analyst`. A different person approves: payout batches, IBAN creation or change, refunds ≥ SAR 1,000, and cumulative refunds > SAR 5,000 per admin per day. No self-approval. Owner break-glass: step-up, written reason (≥ 20 characters), daily cap SAR 10,000, out-of-band notice, independent review within 7 days, never for IBANs | GOV |
| Q6 | TOTP MFA for every admin role. AAL2 enforced on the server. Step-up within 5 minutes for money, deletion, export, IBAN, role and MFA-reset actions. Sessions end after 12 hours absolute or 30 minutes idle. 10 failed attempts lock the account | GOV |
| Q3 | IBAN masked everywhere. `reveal_provider_iban` for finance or owner only, with step-up and a reason (≥ 15 characters), shown once, audited, with an alert after more than 10 reveals in 24 hours. IBAN change: provider re-authenticates, a second finance user approves, 48-hour hold, provider notified | GOV |
| Q4 | Admins read personal data, bank data, the ledger, invoices and messages only through audited functions. No direct admin SELECT. No admin access to health answers except a DPO break-glass. Audit log is append-only and kept 5 years | GOV + PRIV |
| D4 | Aggregate tiles are not logged. Any view filtered to one person or entity, or with a cell of fewer than 5 people, is logged. Cells under 5 are suppressed | GOV |
| D-Q8 | Money tables are append-only, with corrections as linked adjustments (maker plus checker). Fee rules, balances, payout holds and refund thresholds change through a pending change approved by a different admin. Fee rules are effective-dated and prospective, with 30 days' notice for increases. Records kept ≥ 10 years | MONEY |
| D-Q7 | Referral and loyalty stay disabled until value, monthly cap, budget, expiry and published terms are all set, and a different owner approves. With only one admin they stay disabled. Credits are non-cash and non-transferable. A reward vests only after the referee's first paid, unrefunded booking | MONEY |
| D-Q9 | Tap is authoritative for money movement; the ledger is authoritative for entitlements. Daily reconciliation breaks are resolved only by approved adjustments and escalated after 3 business days. "Check with Tap" is available after 2 business days in processing. Refunds go to the original method, start within 3 business days and complete within 14 days | MONEY |
| D-D3 | Show the effective platform fee from fee rules, plus 15% VAT on the fee, with a worked example. No free-standing commission %. Provider VAT status captured at onboarding | MONEY |
| Q1 | Privacy requests in-app and logged by staff. Verified identity. 30 days, plus one 30-day extension notified before day 30, with escalation at days 20 and 28. Free of charge. Refusal reason sent with the right to complain to SDAIA. Copy delivered as JSON and AR/EN PDF through a link that expires after 7 days. Correction restricts processing of the disputed field | PRIV |
| Q2 | Deletion: auth account, profile, addresses, tokens, consents, favourites and message content are deleted (provider sees a tombstone). Health answers are destroyed. Bookings with an invoice or ledger link are pseudonymised; others are deleted. Invoices and ledger are kept 10 years. Future B2C invoices carry no customer PII. Legal hold only for a court case or open chargeback (until 30 days after it closes, reviewed every 90 days). A `deletion_ledger` is re-applied after any restore. The customer receives a completion notice | PRIV |
| Q2.6 | Health intake answers are destroyed 30 days after the appointment. Reuse needs separate consent, which lasts 12 months. Only the assigned provider may read them | PRIV |
| X1 | Incident register with a 72-hour SDAIA clock, records kept 5 years | PRIV |
| X2 | Read-only register of processing activities (RoPA) in the console. The controlled source stays a versioned document | PRIV |
| X3(6) | Health-intake collection stays off until the transfer risk assessment is approved (no KSA hosting today) | PRIV |

## Owner actions outside the code (cannot be done by engineering)

- **DPIA and governance:** sign the DPIA, appoint the DPO and publish their contact, and register on SDAIA's National Data Governance Platform.
- **Hosting outside KSA:** execute the SDAIA Standard Contractual Clauses (or an addendum to the Supabase DPA) with Supabase, Tap and messaging providers. Sign the transfer risk assessment. Disclose processing outside KSA in the privacy policy. Archive invoices daily inside KSA. The target is hosting in a KSA region before the draft IR Art. 23 takes effect.
- **Tap:** obtain written confirmation of Marketplace eligibility (Tap collects, splits and pays out; PRIMORA never holds funds).
- **Provider agreements:** appoint PRIMORA as commercial agent and set the fee terms.
- **Database access:** enable pgaudit or statement logging for break-glass database sessions, and name the engineers allowed to use the Supabase dashboard.
- **Backups:** set backup retention to 30 days or less.

## COUNSEL: must be confirmed by a licensed Saudi lawyer or tax adviser before launch

- **Tax (VAT and ZATCA):**
  - Deemed-supplier VAT (amended Art. 47(3), from 2026-01-01) for providers that are not VAT-registered.
  - VAT treatment of rewards and credits.
  - Who issues customer invoices.
  - The 10-year retention period and the SAR 100,000 capital threshold.
- **SAMA and Ministry of Commerce:**
  - Whether the structure stays outside SAMA-licensed activity.
  - Whether a Ministry of Commerce discount licence is needed for rewards.
  - The 7-day cancellation right for bookings and keeping deposits.
  - Whether the 14-day refund rule was adopted.
- **PDPL:**
  - PRIMORA's controller role and the DPO duty.
  - Chargeback holds.
  - That requests are free of charge.
  - The transfer route.
  - The October 2026 draft amendments (consultation closes 5 November).
  - That the Arabic texts prevail.
  - Whether the NCA ECC applies.
