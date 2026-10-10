# PRIMORA money governance: decision memo

**Date:** 2026-10-10
**Scope:** Q5 (roles and maker-checker), Q7 (referral and loyalty), Q8 (money tables), Q9 (Tap vs ledger, refund timelines), D3 (commission display), and the licensing structure for collecting on behalf of providers.
**Author role:** a compliance and internal-controls review, prepared with AI assistance from public primary and secondary sources.

> **This is not legal or tax advice.** It is an engineering-oriented compliance review. It is not a substitute for a licensed Saudi lawyer or a ZATCA-registered tax adviser. Section 8 lists every point they must confirm before launch. English translations of Saudi laws are for convenience only; the Arabic text published in Umm Al-Qura and on the Bureau of Experts / National Center for Legal Documents portals controls.

---

## 0. Summary of verdicts

| # | Proposal | Verdict | One-line final decision |
|---|---|---|---|
| Q5 | Four roles plus maker-checker above a threshold | **NEEDS CHANGE** | Four roles stand. A second, different admin approves every payout batch, every IBAN change, and refunds of SAR 1,000 or more (adjustable business default). No one approves their own request. With only one admin, the owner uses a break-glass path that needs a reason, has a daily cap, notifies the owner out of band, and gets an independent review within 7 days. |
| Q7 | Platform-funded referral and loyalty rewards | **NEEDS CHANGE** | Ships disabled. Only the owner can enable it, after a second admin edits the values (or the reverse). The cap per customer per month must be set, with no null allowed. Credits cannot be withdrawn as cash, cannot be transferred, cannot be topped up with money, are usable only on PRIMORA, and come with published terms. VAT treatment is to be confirmed by a tax adviser before launch. |
| Q8 | Append-only ledger; dual approval on fee rules and balances; everything logged | **COMPLIANT** (with hardening) | Ledger rows are immutable at the database level, and corrections are new, linked adjustment entries. Fee-rule and balance changes take effect only after a second admin approves, apply to future bookings only, and are logged with before and after values. |
| Q9 | Tap is the source of truth; adjustments; "Check with Tap"; daily reconciliation | **NEEDS CHANGE** (scope refinement) | Tap is authoritative for *whether and when money moved*, and the ledger for *who is owed what*. Breaks are fixed by approved adjustment entries, never by edits. Reconciliation runs daily. "Check with Tap" refreshes refund status from Tap. Refunds start within 3 business days and complete within 14 calendar days of entitlement, back to the original payment method. |
| D3 | Read-only provider "commission %" that does not set prices | **NEEDS CHANGE** | Do not show a stand-alone "commission %" that can drift from the real fee. Show the effective fee and the VAT on it, both computed from the active fee rules, and the date each rule took effect. Customers see an all-in price, including platform fees and VAT, before paying. |
| L | Licensing for collecting and paying out | **NEEDS CHANGE** (structure) | PRIMORA does not hold or move customer funds itself. Collection, split and payout run inside Tap's SAMA-licensed marketplace product (destinations or sub-merchants). PRIMORA's books record entitlements only. Before launch, get a Saudi counsel opinion, and Tap's written confirmation, that this structure keeps PRIMORA outside the activities SAMA licenses. |

**Highest-severity finding (not asked, but material):** since **1 January 2026**, amended **Article 47(3) of the VAT Implementing Regulations** appears to make an electronic marketplace the *deemed supplier* for services it facilitates from **resident suppliers who are not VAT-registered**. The exception applies only if the marketplace does *not* set the price, collect the payment, handle complaints, or offer promotions or compensation. PRIMORA does all four. Many small barbers and salons are below the VAT registration threshold. If the reading below is right, PRIMORA must charge and remit 15% VAT on the *full booking value* for those providers, not only on its commission. This changes pricing, invoicing (ZATCA e-invoicing), and how referral discounts are treated (see Section 6). **Treat this as release-blocking until a tax adviser confirms it.**

---

## 1. Facts assumed

1. PRIMORA is a Saudi-established company with a Commercial Registration. It operates an e-shop (web and app) where customers book services from independent barbers and salons ("providers").
2. Customers pay deposits or full prices by card, mada, or Apple Pay through **Tap Payments**, which SAMA licensed as a payment institution after it graduated from the SAMA sandbox.
3. PRIMORA keeps an internal `transactional_ledger`, pays providers out to their IBANs, issues refunds, runs referral and loyalty programs that PRIMORA funds, and lets admins edit fee rules.
4. The admin team is small, typically 1 to 4 people.
5. Some providers are VAT-registered and many are not.

If any of these facts is wrong, especially if PRIMORA's own bank account ever receives customer money, the analysis in Section 7 changes.

---

## 2. Q5: Roles and maker-checker

### Proposal
Four roles. **Owner** can do everything. **Finance** handles payouts, refunds, the ledger, and IBAN reveal. **Operations/support** handles providers, bookings, customers, and reviews, with no access to money. **Analyst** is read-only. Payouts and refunds above a threshold need a second, different person to approve.

### Verdict: NEEDS CHANGE

### Basis
- **Segregation of duties and maker-checker** is standard internal-control practice: the COSO Internal Control framework, control activities principle 10, and the "four-eyes" principle. SAMA expects it of the entities it regulates. The *SAMA Cyber Security Framework* (3.3.5 Identity and Access Management) requires least privilege, segregation of duties and periodic access reviews. **The framework binds SAMA-regulated member organisations, not PRIMORA directly.** It is still the benchmark Tap and any acquirer will apply in due diligence. https://www.sama.gov.sa/en-US/Laws/BankingRules/SAMA%20Cyber%20Security%20Framework.pdf
- **Payout-destination fraud** is the single largest marketplace loss pattern. An insider or a compromised account changes an IBAN and then approves a payout to it. A threshold on payouts does not stop this. Controls on IBAN changes do.
- **Personal Data Protection Law (PDPL)**, Royal Decree M/19 1443H, as amended, and its Implementing Regulations require need-to-know access and logging. Provider IBANs and customer data are personal data where the provider is a natural person. https://sdaia.gov.sa/en/SDAIA/about/Documents/Personal%20Data%20English%20V2-23April2023-%20Reviewed-.pdf
- **AML Law** (Royal Decree M/20, 1439H; Implementing Regulation in force): PRIMORA is probably not itself a "financial institution" or a designated non-financial business under the law. Tap is, and Tap's merchant agreement will pass KYC, monitoring and record-keeping duties on to PRIMORA. Maker-checker supports the "unusual transaction" escalation Tap will expect. https://rulebook.sama.gov.sa/en/node/10107

### Risk if not adopted
- Undetected insider or account-takeover payouts, which cannot be recovered once a SARIE or IBAN transfer settles.
- Breach of Tap's merchant terms, which can lead to account freeze and fund holds.
- PDPL exposure from unrestricted IBAN viewing.
- No defensible audit trail in a dispute with a provider.

### Business choices and assumptions
The **threshold amount** is a business decision. The safest default that a team of 2 to 4 can work with:
- **Payouts: all payouts need dual approval, at the batch level.** One finance user prepares the daily or weekly batch, and a different admin approves the whole batch after seeing totals by provider and any destination changed in the last 30 days. This adds a single approval per cycle, not one per payout.
- **Refunds:** dual approval for any single refund of **SAR 1,000 or more** (a business default, adjustable by the owner under the Q8 dual approval). Dual approval also applies, at any amount, to more than **SAR 5,000** of refunds per admin in one day, to any refund to a different payment instrument (not allowed at all; see Q9), and to any refund on a booking older than 90 days. Below the threshold, a single finance user can refund up to the original captured amount. Each such refund is logged and sampled weekly.
- **IBAN creation or change: always dual.** The change is initiated by the provider, or entered by support from a provider request. Finance approves it after verifying that the name on the IBAN matches the provider's Commercial Registration or national ID. A **48-hour cooling-off** follows, during which the provider is notified on their *previous* verified contact channel. The first payout to a new IBAN is held until the cooling-off ends.
- **IBAN reveal:** masked by default, showing only the last 4 digits. A reveal needs a stated reason, is logged, and is limited to finance and owner. *The repository's AGENTS.md records that no one has yet approved which operators may view IBANs. The owner must record that approval.*

### When only one admin exists (break-glass)
Maker-checker cannot exist with one person. Use compensating controls instead of pretending it exists:
1. Only the **owner** account can use break-glass. The account must have MFA, and the action needs a fresh MFA step-up.
2. A **free-text justification** of at least 20 characters is mandatory and stored with the action.
3. A **daily break-glass cap**, which is a business choice. The suggested default is the lower of SAR 10,000 or 2 days of average payouts. Anything above the cap waits for a second person.
4. An **out-of-band notification** goes to the owner's registered email and phone, so account takeover is detectable.
5. An **independent after-the-fact review within 7 days** by the external accountant or a second named person who is not an admin. The reviewer signs off in the system, or the review is logged with a document reference.
6. Break-glass *never* applies to IBAN changes. Those always wait for a second person or the provider's re-verification.
7. Break-glass usage appears on the owner dashboard and in the monthly control report.

### Final decision text
> **D-Q5.** Roles are `owner`, `finance`, `operations`, and `analyst`. `operations` and `analyst` have no money permissions, server-enforced through RLS and RPC checks. A different admin from the requester must approve every payout batch, every provider IBAN creation or change, any single refund ≥ SAR 1,000 (owner-adjustable under D-Q8), and cumulative refunds > SAR 5,000 per admin per day. Self-approval is rejected by the server, including for `owner`. IBANs are masked by default, and a reveal is finance/owner-only with a reason, audited. New or changed IBANs have a 48-hour hold with notice to the provider's previous verified contact. When no second eligible admin exists, the `owner` may use break-glass. Break-glass requires MFA step-up, a written justification, a daily cap (default SAR 10,000), out-of-band notification, and an independent review within 7 days. It is never available for IBAN changes.

---

## 3. Q7: Referral and loyalty rewards (platform-funded)

### Proposal
Ship disabled until the owner sets values. Owner-only approval, and the approver must differ from the editor. A hard monthly cap per customer.

### Verdict: NEEDS CHANGE (the control design is right; legal design must be added)

### Basis

**(a) SAMA: avoid becoming an e-money issuer.** The Implementing Regulations of the Law of Payments and Payment Services list "Issuing Electronic Money" as a licensed payment service (Article 6). Article 7 excludes "instruments usable only within a limited network". A platform-funded credit that is **free, usable only on PRIMORA, not withdrawable as cash, not transferable, and never purchasable or top-up-able** stays a loyalty or discount instrument, not stored value. Any cash-out, P2P transfer, or paid top-up of a "wallet" risks being treated as e-money issuance without a licence.
- Article 6: https://rulebook.sama.gov.sa/en/entiresection/1454
- Article 7: https://rulebook.sama.gov.sa/en/node/1439

**(b) Consumer and e-commerce law.**
- E-Commerce Law (Royal Decree M/126, 1440H) **Art. 10**: an electronic advertisement is part of the contract and binding. **Art. 11**: no misleading offers. A referral or loyalty promise is enforceable as advertised. Shrinking it after the fact, or adding hidden conditions, risks Art. 18 penalties: a warning, a fine of up to SAR 1,000,000, suspension, or blocking. https://misa.gov.sa/app/uploads/2025/07/E-Commerce-Law.pdf
- Ministry of Commerce discount rules: a **discount licence** is required before *announcing price reductions* (sales.mc.gov.sa), under the Anti-Commercial Fraud Law. https://mc.gov.sa/en/mediacenter/News/Pages/26-09-22-01.aspx. *Whether a standing referral credit or points program is a "discount" needing a licence is unconfirmed. Counsel must confirm.*

**(c) VAT and ZATCA.**
- ZATCA's circular on loyalty programs (Dec 2022, Arabic, summarised by PwC): when points are given for no separate consideration, issuing them is not a separate supply. VAT consequences arise at redemption and depend on who funds the reward and the contracts. https://pwc.com/m1/en/tax/documents/2023/ksa-circular-on-loyalty-programs-vat-implications.pdf
- **If PRIMORA is the supplier**, either as a deemed supplier under Art. 47(3) or as principal, a credit applied at checkout is a price reduction. VAT is charged on the reduced consideration, and the tax invoice must show the discount.
- **If the provider is the supplier** and PRIMORA pays the provider the gap, the provider's consideration is the full price, part of it paid by a third party (PRIMORA). The provider owes VAT on the full price, and PRIMORA's reward cost is a marketing expense with no input VAT.
- The two treatments give different VAT totals. They must not be mixed. ZATCA Retail Sector Guideline (discounts, vouchers): https://zatca.gov.sa/en/HelpCenter/guidelines/Documents/Guideline-For-Retail-Sector-under-VAT-Provisions.pdf
- **Ledger requirement:** each reward redemption creates a ledger entry that records the funder (`platform`) and the VAT basis, so the provider payout is not reduced by a platform-funded discount.

**(d) Fraud and AML.** Referral programs are a classic abuse route: self-referral and multi-account farming. A hard cap, a minimum completed paid booking before a referral reward vests, and device and payment-instrument de-duplication are standard controls.

### Business choices (not invented)
Reward amounts, point earn and burn rates, expiry period, and the cap value are **owner decisions**. The system must **refuse to enable** a program while any of these is null:
- reward value
- cap per customer per calendar month (in SAR equivalent)
- program-wide monthly budget
- expiry
- terms version

### Final decision text
> **D-Q7.** Referral and loyalty programs ship `disabled`. Enabling requires all of the following to be non-null: reward value, per-customer monthly cap (SAR), program monthly budget (SAR), credit expiry, and a published terms version. Enabling also requires a two-person flow: an `owner` or `finance` editor proposes, and a *different* `owner` approves. With one admin, the program stays disabled, with no break-glass. Rewards are platform-funded promotional credits. They cannot be withdrawn as cash, cannot be transferred, cannot be purchased or topped up, are usable only on PRIMORA, and expire as published. A referral reward vests only after the referee's first completed, paid, non-refunded booking. If that booking is later refunded, the reward is reversed by an adjustment entry. Each redemption writes a ledger entry tagged `funded_by = platform`, and provider payouts are never reduced by it. Before enabling, the terms are shown in Arabic and English, and the user must accept them at enrolment. The terms cover eligibility, value, cap, expiry, exclusions, change and termination with 30 days' notice, and what happens on refund. Counsel confirms whether a Ministry of Commerce discount licence is needed, and a tax adviser confirms the VAT treatment, before the first enablement.

---

## 4. Q8: Money tables

### Proposal
The ledger is append-only, with corrections as new adjustment entries and never edits or deletes. Fee-rule and balance changes need a second approver. Everything is logged.

### Verdict: COMPLIANT (adopt with the hardening below)

### Basis
- **Accounting integrity:** append-only, double-entry, and correction by reversal are universal bookkeeping standards (IFRS as adopted by SOCPA). The Saudi Law of Commercial Books requires books to be kept without erasure or alteration. *The current law and its retention period must be confirmed by the accountant.*
- **VAT records:** ZATCA requires that tax invoices, credit and debit notes, and the accounting records behind VAT returns be kept for the statutory retention period (at least 6 years under the VAT Implementing Regulations, longer for certain assets). E-invoices must be issued in the Fatoorah phase-2 format. Credit notes are the *only* lawful way to reduce an invoiced amount, which mirrors adjustment-only ledgers. https://zatca.gov.sa/en/HelpCenter/guidelines/Documents/Guideline-for-Tax-Invoicing-and-Records-under-VAT-Provisions.pdf
- **AML record-keeping:** the AML Law requires obliged entities to keep transaction records for at least 10 years. Tap will pass that requirement down to PRIMORA by contract. https://misa.gov.sa/app/uploads/2025/07/Anti-Money-Laundering-Law.pdf

### Hardening required
1. Enforce immutability **in the database**, not the UI. Revoke `UPDATE` and `DELETE` on ledger tables from every role, including `authenticated` and admin roles, and add a `BEFORE UPDATE OR DELETE` trigger that raises an exception. Writes happen only through `SECURITY DEFINER` RPCs that take an idempotency key.
2. Adjustment entries must carry `reverses_entry_id` or `adjusts_entry_id`, a reason code, free-text justification, the maker id, the checker id, and approval time.
3. **Fee rules are effective-dated and never retroactive.** A change applies to bookings created after `effective_from`. History is kept, never overwritten. Each booking stores a snapshot of the fee rule it priced with.
4. Provider notice of fee changes is a business and contract term. The default is **30 days' notice** before a fee increase, through the provider agreement and an in-app notice.
5. Retention: keep ledger, audit, and invoice records for **at least 10 years**, which covers the AML and commercial-books maximum. Do not hard-delete them under a PDPL erasure request. PDPL allows retention where another law requires it, so pseudonymise display fields instead.

### Final decision text
> **D-Q8.** `transactional_ledger` and its related money tables are append-only, enforced by revoked UPDATE/DELETE privileges and a blocking trigger. All writes go through server RPCs with idempotency keys. Corrections are new adjustment or reversal entries linked to the original, with reason, maker, and checker. Changes to fee rules, provider balances, payout holds, and refund thresholds create a pending change. The change takes effect only after a different admin approves it, and break-glass per D-Q5 applies only to balance adjustments within the cap. Fee rules are effective-dated, prospective only, and snapshotted on each booking, and fee increases carry 30 days' notice to providers. Every privileged read (IBAN reveal, export) and every mutation writes an audit event with actor, before and after values, reason, and request id. Money, audit, and invoice records are kept at least 10 years and are exempt from erasure, with personal display fields pseudonymised on a valid PDPL request.

---

## 5. Q9: Tap vs internal ledger; refund timelines

### Proposal
Tap, as holder of funds, is the source of truth for money movement, and the ledger is corrected by adjustment entries. Add a "Check with Tap" action for refunds stuck in processing. Reconcile daily.

### Verdict: NEEDS CHANGE (refine the scope of "source of truth"; add timelines)

### Basis
- Tap holds and settles the funds under its SAMA licence, so Tap's charge, refund, and settlement records are authoritative for **whether money moved and when**. Tap does *not* know PRIMORA's contractual allocation (commission, platform-funded discounts, provider entitlement) unless that allocation was sent in the `destinations` split. So the **ledger stays authoritative for entitlements**, and a disagreement is a *break to investigate*, not an automatic overwrite. Tap Marketplace docs: https://developers.tap.company/docs/marketplace-overview, https://developers.tap.company/docs/marketplace-getting-started
- The **bank statement** for PRIMORA's own fee settlement account is a third, independent check.

**Refund timelines under Saudi law:**
- **E-Commerce Law Art. 13(1):** the consumer may rescind within **7 days** of the service contract, provided the service has not been received or used. Art. 13(2)(g) allows the Regulations to add exceptions. *Whether booked personal-care appointments fall under an exception, and whether a deposit may be withheld for a late cancellation, is for counsel.*
- **Art. 14(1):** if the provider delays performance more than **15 days** beyond the agreed date without the consumer's agreement, the consumer may rescind and claim a refund of amounts paid plus costs. **Art. 14(2):** the provider must notify the consumer of any anticipated delay.
- **Art. 7(e)** and **Art. 8:** payment and processing arrangements must be disclosed before the contract, and an itemised invoice issued after it.
- **Implementing Regulations:** the Ministry of Commerce consulted in 2020 on an amendment requiring a refund **without undue delay and within 14 days** of the consumer's rescission notice, **to the same payment method**, with no extra fees to the consumer. https://mc.gov.sa/en/mediacenter/News/Pages/24-11-20-01.aspx. *I could not confirm the final adopted text. Counsel must confirm.* Building to the 14-day standard is the safe default either way.
- Enforcement precedent: in 2022 the Ministry of Commerce blocked e-stores for failing to cancel orders and refund customers. https://mc.gov.sa/en/mediacenter/News/Pages/17-05-22-02.aspx

### Business choices and assumptions
- **Reconciliation frequency: daily** (T+1). It is workable for a small team if automated. Breaks above **SAR 1** are queued, and breaks open longer than 3 business days escalate to the owner.
- A **"stuck refund"** is one in `processing` for more than 2 business days. "Check with Tap" calls Tap's retrieve-refund API, records the response as an audit event, and updates status only through an RPC. It never moves money itself.

### Final decision text
> **D-Q9.** Tap is the system of record for the fact, amount, and timing of charges, refunds, and settlements. `transactional_ledger` is the system of record for entitlements: commission, provider share, and platform-funded rewards. A daily automated reconciliation matches every Tap charge, refund, and settlement to ledger entries and to the PRIMORA settlement bank statement. Unmatched or mismatched items open a reconciliation break. A break is resolved only by an approved adjustment entry under D-Q8, citing the Tap object id, and is never resolved by editing. Breaks open for more than 3 business days escalate to the owner. "Check with Tap" is available on any refund in `processing` for more than 2 business days. It re-fetches status from Tap, logs the response, and updates status through the server. Refunds go only to the original payment method. They are initiated within 3 business days of the customer becoming entitled to them and must reach `succeeded` at Tap within 14 calendar days of the customer's cancellation notice; card-network posting time is disclosed to the customer. The cancellation and refund policy (Arabic and English) is shown before payment. It covers the 7-day rescission right where it applies, the 15-day non-performance right, the deposit rules, and the refund timeline. Customers are notified of any provider-side delay.

---

## 6. D3: Read-only provider "commission %"

### Proposal
The provider's "commission %" is shown read-only and does not set prices. Actual fees come from fee rules.

### Verdict: NEEDS CHANGE

### Basis
- **Customers.** E-Commerce Law **Art. 7(d)** requires disclosure before contract of the **total price including all charges and taxes**. **Art. 8** requires an **itemised invoice** with the total, charges, and taxes. Platform booking fees charged to the customer must therefore appear in the pre-payment total, not first at checkout. **Art. 11:** no misleading presentation.
- **Providers (business-to-business).** The Consumer and E-Commerce Law does not protect providers as consumers, but **contract law and Art. 11 on misleading statements** still apply. A displayed "commission %" that differs from what fee rules actually charge invites claims of misrepresentation and underpayment, and disputes over set-off.
- **VAT on PRIMORA's commission:**
  - For a VAT-registered resident provider, PRIMORA's commission or service fee is a standard-rated **15%** taxable supply by PRIMORA to the provider. PRIMORA must issue a ZATCA-compliant (Fatoorah) tax invoice to the provider. https://www.grantthornton.sa/insights/articles-and-publications/vat_and_electronic_marketplace_in_saudi_arabia/
  - For an **unregistered resident provider**, from 1 Jan 2026 PRIMORA is likely the **deemed supplier** of the whole service under amended **VAT IR Art. 47(3)**. PRIMORA then charges 15% VAT on the full customer price, issues the customer tax invoice in its own name, and is treated as buying from the provider. In that case no separate VAT is charged on the commission. https://www.pwc.com/m1/en/services/tax/me-tax-legal-news/2025/approved-amendments-to-the-vat-implementing-regulations.html ; https://www.dariba.co/online-marketplaces-as-deemed-suppliers-vat/
  - PRIMORA meets the Art. 47 conditions that make a marketplace the deemed supplier. It sets or collects the consideration (Tap checkout), handles complaints and refunds, and offers promotions (Q7). The carve-out conditions are therefore not met.

### Final decision text
> **D-D3.** The provider portal and admin do not show a free-standing "commission %" field. They show the **effective platform fee**, computed from the fee rules active on the provider's account, as a percentage or fixed amount with its `effective_from` date, followed by **"+ 15% VAT on this fee"** where applicable. A worked example on a sample booking amount shows the provider's net payout. Fee terms come from the signed provider agreement. Changes follow D-Q8, with 30 days' notice for increases. Monthly provider statements and ZATCA e-invoices for platform fees reconcile to the ledger. Customers see, before payment, an all-in price that itemises service price, platform or booking fee if any, deposit, and VAT. They receive an itemised tax invoice issued by the correct supplier of record: the provider if VAT-registered and PRIMORA is acting as a disclosed agent, otherwise PRIMORA as deemed supplier. Each provider's VAT registration status is captured and verified (VAT number checked against ZATCA) at onboarding. That status drives the invoicing path and must be re-verified when the provider updates it.

---

## 7. Licensing: does PRIMORA need a SAMA licence?

### Verdict: NEEDS CHANGE (structure, not a licence application, in the default case)

### Basis
- The Law of Payments and Payment Services and its Implementing Regulations (SAMA, 13/6/2023) list licensed payment services in **Art. 6**. The list includes executing payment transactions, acquiring, **payment aggregation services**, and issuing e-money. Doing any of these as a business without a SAMA licence, or without being an appointed agent of a licensed PSP holding a SAMA no-objection (Part 3, Agents), is prohibited. https://rulebook.sama.gov.sa/en/entiresection/1454 ; https://rulebook.sama.gov.sa/en/entiresection/1456
- **Art. 7(2)** excludes payment transactions made "through a commercial agent authorized via an agreement to negotiate or conclude the sale or purchase of goods or services on behalf of" the payer or payee. https://rulebook.sama.gov.sa/en/node/1439. *There is no published SAMA guidance applying this to marketplaces.* By analogy with the EU PSD2 exclusion the text mirrors, a marketplace acting for **both** sides, or with no real authority to conclude contracts, may fall outside it. Do not rely on it alone.
- **Art. 7(9)** excludes technical service providers. A platform that only *instructs* a licensed PSP and never holds funds fits more comfortably here.
- **Tap** is SAMA-licensed (SAMA announcement: https://sama.gov.sa/en-US/News/Pages/News-578.aspx). It offers a Marketplace product in which each provider is onboarded and KYC'd as a Tap "business" with a `destination_id`, charges are split at source, and Tap's payout engine pays out. https://developers.tap.company/docs/marketplace-overview

### Compliant structure
1. **Funds never touch a PRIMORA bank account.** Customer payments settle within Tap. Provider shares are routed by Tap `destinations` and paid out by Tap's payout engine to the provider's Tap-verified IBAN. Only PRIMORA's own fee settles to PRIMORA's account.
2. **Every provider is onboarded and KYC'd by Tap** before payouts are enabled. PRIMORA does not "pay out" from a pooled balance.
3. **Written contracts:**
   - A **Tap Marketplace agreement** that names Tap as the licensed PSP for collection, split, and payout, and allocates AML/KYC, chargeback, and refund duties.
   - A **provider agreement** appointing PRIMORA as the provider's commercial agent to market services and *conclude bookings* on its behalf, and authorising Tap to collect for the provider and deduct PRIMORA's fee. It also covers fee terms, set-off, refund and chargeback liability, the provider's VAT status, and the PDPL data-processing terms.
   - **Customer terms** stating that the service contract is with the provider (unless PRIMORA is deemed supplier for VAT), and that payment is processed by Tap.
4. **Avoid stored-value features:** no customer wallet that can be topped up or withdrawn, and no provider "balance" withdrawable on demand outside Tap (see D-Q7).
5. **Get written comfort:** Tap's confirmation that the Marketplace product is approved for this use in KSA under its licence, and a Saudi counsel memo on Art. 6 and Art. 7. Where doubt remains, ask SAMA for a determination, for example through the SAMA Fintech Sandbox or the Fintech Saudi channels.

### Final decision text
> **D-L.** PRIMORA does not receive, hold, pool, or transmit customer funds. All collection, split, refund, and provider payout is executed by Tap, a SAMA-licensed PSP, through its Marketplace product. Each provider is a Tap-KYC'd business with a destination id, and only PRIMORA's fee settles to PRIMORA's account. `transactional_ledger` records entitlements and mirrors Tap events, and is not a custody record. PRIMORA offers no top-up-able or cash-withdrawable wallet. Provider agreements appoint PRIMORA as commercial agent to conclude bookings and authorise Tap's split. Launch is conditional on written confirmation from Tap of product eligibility and from Saudi counsel that this structure falls outside SAMA-licensed activity.

---

## 8. What a licensed Saudi lawyer and accountant must confirm before launch

**Lawyer:**
1. Whether the Tap Marketplace structure in Section 7 keeps PRIMORA outside SAMA Art. 6 licensed activities, and whether Art. 7(2) or 7(9) applies.
2. Whether booked grooming appointments carry the E-Commerce Law Art. 13 7-day rescission right, which exceptions apply, and whether non-refundable deposits or late-cancellation fees are lawful.
3. The current, adopted refund-deadline text in the E-Commerce Implementing Regulations: 14 days, same payment method.
4. Whether referral credits or loyalty points need a Ministry of Commerce discount licence.
5. Terms for Arabic-language consumers and providers.
6. The PDPL basis for IBAN access, plus data-retention and erasure carve-outs.
7. Whether any new Consumer Protection Law or Ministry of Commerce platform rules (under E-Commerce Law Art. 16(b)) are now in force.

**Tax adviser and accountant:**
1. Whether PRIMORA is the **deemed supplier under VAT IR Art. 47(3)** for unregistered providers. This is release-blocking.
2. The invoicing path for registered versus unregistered providers.
3. The VAT treatment of platform-funded rewards at redemption.
4. Whether PRIMORA must register for VAT now, and its Fatoorah phase-2 integration wave.
5. Record-retention periods under the VAT, Commercial Books, and AML rules.
6. Approval of the reconciliation and adjustment-entry procedure.

**Owner (business decisions):**
- Refund dual-approval threshold (default SAR 1,000)
- Break-glass daily cap (default SAR 10,000)
- All reward values and caps
- Fee-change notice period (default 30 days)
- Which roles may reveal IBANs

---

## Sources consulted

- SAMA, Implementing Regulations of the Law of Payments and Payment Services:
  - Art. 6: https://rulebook.sama.gov.sa/en/entiresection/1454
  - Art. 7: https://rulebook.sama.gov.sa/en/node/1439
  - Agents: https://rulebook.sama.gov.sa/en/entiresection/1456
  - Full text: https://www.sama.gov.sa/en-US/LawsRegulations/DocLib/Implementing_Regulations_for_Law_of_Payments_and_Payment_Services-EN.pdf
- SAMA licensing of Tap: https://sama.gov.sa/en-US/News/Pages/News-578.aspx
- SAMA Cyber Security Framework: https://www.sama.gov.sa/en-US/Laws/BankingRules/SAMA%20Cyber%20Security%20Framework.pdf
- E-Commerce Law (M/126, 1440H), English translation: https://misa.gov.sa/app/uploads/2025/07/E-Commerce-Law.pdf
- Ministry of Commerce:
  - Refund amendment consultation: https://mc.gov.sa/en/mediacenter/News/Pages/24-11-20-01.aspx
  - Enforcement: https://mc.gov.sa/en/mediacenter/News/Pages/17-05-22-02.aspx
  - Discount rules: https://mc.gov.sa/en/mediacenter/News/Pages/26-09-22-01.aspx
- AML Law (M/20), English translation: https://misa.gov.sa/app/uploads/2025/07/Anti-Money-Laundering-Law.pdf ; Implementing Regulation: https://rulebook.sama.gov.sa/en/node/10107
- ZATCA guidelines:
  - Retail Sector: https://zatca.gov.sa/en/HelpCenter/guidelines/Documents/Guideline-For-Retail-Sector-under-VAT-Provisions.pdf
  - Tax Invoicing and Records: https://zatca.gov.sa/en/HelpCenter/guidelines/Documents/Guideline-for-Tax-Invoicing-and-Records-under-VAT-Provisions.pdf
- VAT IR Art. 47 amendments:
  - PwC: https://www.pwc.com/m1/en/services/tax/me-tax-legal-news/2025/approved-amendments-to-the-vat-implementing-regulations.html
  - KPMG: https://kpmg.com/sa/en/insights/tax-insights/vat-guideline-for-persons-obligated-to-pay-tax-in-special-cases-deemed-suppliers.html
  - Grant Thornton: https://www.grantthornton.sa/insights/articles-and-publications/vat_and_electronic_marketplace_in_saudi_arabia/
  - Dariba: https://www.dariba.co/online-marketplaces-as-deemed-suppliers-vat/
- ZATCA loyalty circular (PwC summary): https://pwc.com/m1/en/tax/documents/2023/ksa-circular-on-loyalty-programs-vat-implications.pdf
- Tap Marketplace docs: https://developers.tap.company/docs/marketplace-overview ; https://developers.tap.company/docs/marketplace-getting-started
- PDPL (SDAIA): https://sdaia.gov.sa/en/SDAIA/about/Documents/Personal%20Data%20English%20V2-23April2023-%20Reviewed-.pdf

**Source limits:**
- The Art. 47(3) analysis relies on advisory-firm summaries; I did not retrieve the primary gazette text.
- The 14-day refund rule is from a 2020 consultation, and I did not verify its adoption.
- The AML 10-year retention period and the Commercial Books retention period are from secondary sources.
- The SAMA CSF and PDPL URLs were not fetched in this session.
