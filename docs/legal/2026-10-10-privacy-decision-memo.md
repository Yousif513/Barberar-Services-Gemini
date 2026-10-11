# PRIMORA — Privacy and Records Decision Memo (KSA)

Date: 2026-10-10
Prepared by: compliance review (AI-assisted research)
Status: decision memo for engineering and product. **This is not legal advice and is not a substitute for a licensed Saudi lawyer.** Items marked **[COUNSEL]** must be confirmed by counsel before launch.

Scope: PRIMORA, a Saudi beauty and grooming booking marketplace. Data held: customer names, emails, phones, addresses, booking history, private customer–provider messages, health-intake answers for treatments, provider IBANs, Saudi VAT invoices, payment records (Tap).

---

## 0. Sources consulted (primary texts read in full unless noted)

| Ref | Instrument | URL |
|---|---|---|
| PDPL | Personal Data Protection Law, Royal Decree M/19 (1443H), amended M/148 (1444H), official English | https://sdaia.gov.sa/en/SDAIA/about/Documents/Personal%20Data%20English%20V2-23April2023-%20Reviewed-.pdf |
| IR | Implementing Regulation of the PDPL, official English | https://sdaia.gov.sa/en/SDAIA/about/Documents/ExecutiveRegulationsEn.pdf |
| TR | Regulation on Personal Data Transfer outside the Kingdom (v2.0, Aug 2024) | https://sdaia.gov.sa/Documents/RegulationonPersonalDataEN.pdf |
| SCC | SDAIA Standard Contractual Clauses for transfers | https://sdaia.gov.sa/Documents/StandardContractualClausesForPersonalDataTransferEN.pdf |
| BG | SDAIA Personal Data Breach Incidents Procedural Guide (v1.0, Oct 2024) | https://sdaia.gov.sa/en/SDAIA/about/Documents/PersonalDataBreachIncidents.pdf |
| DPO | SDAIA Rules for Appointing a Personal Data Protection Officer | https://sdaia.gov.sa/en/SDAIA/about/Documents/RulesforAppointingPersonalDataProtectionOfficer.pdf |
| DRAFT | SDAIA draft amendments to the IR, public consultation 6 Oct – 5 Nov 2026 (secondary: Clyde & Co summary; not in force) | https://www.clydeco.com/en/insights/2026/10/sdaia-publishes-draft-amendments-to-the-pdpl |
| ZG | ZATCA Guideline for Tax Invoicing and Records under VAT Provisions (cites VAT Implementing Regulations Arts. 53, 64, 66) | https://zatca.gov.sa/en/HelpCenter/guidelines/Documents/Guideline-for-Tax-Invoicing-and-Records-under-VAT-Provisions.pdf |
| CBL | Law of Commercial Books, Royal Decree M/61 (1989), last updated 16 Jun 2022, Bureau of Experts translation | https://misa.gov.sa/app/uploads/2025/07/Law-of-Commercial-Books.pdf |
| ECC | NCA Essential Cybersecurity Controls ECC-2:2024 (secondary summary only; official text not retrievable in this session) | https://www.logintc.com/factsheets/nca-ecc-compliance-audit-checklist/ |
| SUPA | Supabase available regions (fetched 2026-10-10) | https://supabase.com/docs/guides/platform/regions |
| CTL | Civil Transactions Law limitation (secondary: Freshfields) | https://riskandcompliance.freshfields.com/post/102juha/the-ksa-civil-transactions-law-applied-exceptions-to-retrospective-effect |

Exposure if obligations are missed (applies to every item below):
- PDPL Art. 36(1): a warning or a fine of up to **SAR 5,000,000** per violation, which can be doubled for repeat violations.
- PDPL Art. 35: disclosing or publishing **sensitive data** (health-intake answers) with intent to harm or for personal benefit carries up to **2 years' imprisonment and/or a SAR 3,000,000 fine**. This is personal criminal liability for the individual.
- PDPL Art. 40: data subjects may sue for material and moral damages.
- IR Art. 37: a complaint to SDAIA can be filed within **90 days** of the incident or of the data subject becoming aware of it.
- PDPL Art. 38(2): the regulator may publish the violation at the violator's expense.
- CBL Art. 12: breaching the record-keeping rules carries a fine of SAR 5,000–50,000.

---

## Summary table

| # | Decision | Verdict |
|---|---|---|
| Q1 | DSR access/copy/correction/deletion, 30 days | **NEEDS CHANGE**: add the extension rule, free of charge, identity verification, format, refusal reasons, recipient notification, request log |
| Q2 | Deletion vs retention | **NEEDS CHANGE**: the retention period is 10 years, not 6. VAT records must be stored in KSA. "Anonymised" bookings are actually pseudonymised. Health data needs a short fixed deletion window. Legal hold has to be scoped. |
| Q3 | IBAN masked, finance reveal with reason, logged | **COMPLIANT** (add step-up, single-view and rate-limit details) |
| Q4 | Admin personal/bank reads only via logged functions | **NEEDS CHANGE**: extend to service-role, dashboard/SQL editor, exports and backups. Health data must be excluded from admin reads. |
| Q6 | TOTP MFA for all admins; step-up for payouts/refunds/delete/export | **COMPLIANT**: add a step-up window and extra step-up triggers |
| D1 | Treat as "regulated" | **COMPLIANT**: required in substance (sensitive health data, financial data, VAT) |
| D4 | Aggregates not logged; individual/bank/ledger views logged | **NEEDS CHANGE**: an aggregate that resolves to one person (e.g. a sole-trader barber's revenue) is an individual view |
| X1 | Breach notification process in console | **REQUIRED** |
| X2 | Records of processing (RoPA) | **REQUIRED** |
| X3 | Cross-border transfer (Supabase region) | **NON-COMPLIANT until resolved**: Supabase has no KSA or Middle East region, so personal data is transferred abroad and VAT records leave the Kingdom |

---

## Q1 — Data subject rights (access, copy, correction, deletion)

**Proposed:** customers request access, a copy, correction and deletion in-app; an admin queue processes them; 30-day deadline.

**Verdict: NEEDS CHANGE.** The 30-day deadline is correct. The proposal is missing the extension mechanics, identity verification, request logging, refusal handling, the format of the copy, and notifications to recipients.

**Legal basis**
- PDPL Art. 4: right to be informed; right of access; right to obtain a copy "in a readable and clear format"; right to correction; right to destruction, "without prejudice to Article (18)".
- PDPL Art. 21: respond within the period and by the method set in the Regulations.
- IR Art. 3(1)(a): act "within a period not exceeding (30) days and without delay". The period can be extended only (i) where implementation requires disproportionate effort or (ii) where the data subject has made multiple requests. The extension is capped at an additional 30 days, and the data subject must be **notified in advance with the reasons**.
- IR Art. 3(1)(c): verify identity before executing a request.
- IR Art. 3(1)(d): document and keep a record of all requests, **including oral ones**.
- IR Art. 3(2): a request may be refused if it is repetitive, manifestly unfounded or disproportionate, and the data subject must be told the reason.
- IR Art. 5–6: a copy is provided in a "commonly used electronic format", with printed copy on request if feasible. No other individual's personal data may be disclosed, and other people's rights must not be adversely affected.
- IR Art. 7(1): restrict processing while the accuracy of data is contested. Art. 7(2): supporting documents may be requested but must be destroyed after verification. Art. 7(3) and Art. 22(2)(b)–(d): notify prior recipients of a correction, notify the data subject when it is done, and document all updates. PDPL Art. 17(1) says the same.
- IR Art. 8(2): on destruction, notify the parties the data was disclosed to and ask them to destroy it, and destroy all copies **including backups**.
- IR Art. 10: request channels the data subject may choose from: e-mail, SMS, national address, app, or other.
- Fees: neither the PDPL nor the IR authorises charging the data subject. PDPL Art. 30(4)(D) lets SDAIA, not controllers, charge fees. The safest reading is free of charge. **[COUNSEL]**
- Portability: the PDPL has **no** GDPR-style portability right. The obligation is a readable copy in a common electronic format.
- DRAFT IR Art. 3 (not in force): a request left unanswered by the deadline would be deemed rejected, and the data subject could complain to SDAIA.

**Risk if not adopted:** missing the deadline or skipping verification is a direct IR breach (Art. 36 fine). Disclosing a provider's or another customer's data inside an export is an unauthorised disclosure. If the draft amendment is adopted, a silent queue becomes a deemed refusal and grounds for a complaint.

**Final decision text (implement exactly):**
> 1. Customers can submit Access, Copy, Correction, Deletion and Consent-withdrawal requests in-app and by e-mail to the published privacy address. Every request, including those received by phone or in person and logged by staff, is recorded in `privacy_requests` with channel, received_at, type, requester, verification method, status, decision, reason, and completed_at.
> 2. Identity: in-app requests require a fresh login plus a one-time code to the account's verified phone or e-mail. Requests from other channels must be verified the same way before any data is released or deleted. Supporting documents collected for correction are destroyed when verification completes.
> 3. Deadline: complete within **30 calendar days** of receipt; internal target 15 days. One extension of up to **30 more days** is allowed only for disproportionate effort or multiple requests from the same person. The customer must be notified **before day 30** with the reason. The queue escalates at day 20 and at day 28.
> 4. All requests are **free of charge**. A request may be refused only as repetitive, manifestly unfounded or disproportionate. The refusal reason is sent to the customer together with their right to complain to SDAIA.
> 5. Copy format: a machine-readable **JSON** file plus a human-readable **PDF** in Arabic and English, delivered in-app over an authenticated download link that expires after 7 days. It covers profile, addresses, bookings, payments (masked card), invoices, messages the customer sent and received (the other party's personal data redacted), reviews, consents, and health-intake answers. A printed copy is provided on request.
> 6. Correction: while a correction is disputed, processing of the contested field is restricted. When the correction is made, every provider or processor that received the field is notified, the customer is told it is complete, and the change is audit-logged.
> 7. The implementer of a request never approves its own deletion or export. Both actions require admin step-up (see Q6).

---

## Q2 — Deletion vs retention

**Proposed:** on a deletion request, delete the auth login (email and phone), delete private messages, anonymise bookings (keeping date, service, price and provider only), and keep tax invoices for the statutory period with personal data minimised.

**Verdict: NEEDS CHANGE.**

### 2.1 Retention period for tax invoices and accounting records: **10 years**

- **VAT:** VAT Implementing Regulations Art. 66(1) requires invoices, books, records and accounting documents to be kept for **at least 6 years from the end of the related tax period**. Records for capital assets are kept for the adjustment period plus 5 years, and real-estate records for 15 years (ZG §8.3.3, citing IR Art. 66(1) and Unified VAT Agreement Art. 59).
- **Commercial Books Law Art. 8:** "The merchant and his heirs shall keep the books … and the correspondence and documents referred to in Article 6 **for at least 10 years**." Under Art. 6, a merchant must keep exact copies of all correspondence and documents issued or received relating to the business, which includes invoices, payment records and payout records. The CBL applies where capital exceeds SAR 100,000 (Art. 1). ZATCA's guideline says VAT duties apply "in addition to" CBL duties (ZG §8.1).
- **Result:** the longer period governs, under PDPL Art. 18(2)(a) ("whichever longer"). Retain tax invoices, the ledger, payout records and Tap settlement records for **10 years from the end of the financial year** they relate to.
- **Location and form:** VAT records must be kept **inside the Kingdom**, in Arabic, and in electronic form with access to the server. For a KSA-resident taxable person, "the computer or server must be located within the Kingdom" (ZG §8.3.1–8.3.2, citing IR Art. 66(3)). See X3: the current Supabase hosting cannot satisfy this.
- I found no evidence of a new Commercial Books Law replacing M/61. **[COUNSEL]** must confirm that no newer CBL or ZATCA amendment changes the 10-year figure, and that PRIMORA's capital is above SAR 100,000.

### 2.2 Minimising personal data on invoices
- A B2C sale to a natural person may use a **simplified tax invoice**. Its required content is the date, supplier name, address and VAT number, a description, the consideration and the VAT, and it **does not require customer details** (ZG §4.3.1–4.3.2, IR Art. 53).
- An issued tax invoice must not be altered. Invoices already issued with customer names are kept unaltered, with restricted access.
- **[COUNSEL] / tax adviser:** confirm who the legal supplier on each invoice is: PRIMORA for its commission, or the provider for the service, with PRIMORA issuing on its behalf. That determines who the controller is and who carries the retention duty.

### 2.3 Booking "anonymisation"
- Under IR Art. 1(8) and Art. 9, anonymisation means it is **permanently impossible** to re-identify the person, and it requires an impact evaluation. A booking row kept to back a retained invoice (same date, service, price and provider, with a link to the invoice) is **pseudonymised, not anonymised**. It is still personal data, retained lawfully under PDPL Art. 18(2)(a) because it supports a record with a legal retention period.
- Truly anonymised analytics may be kept indefinitely (PDPL Art. 18(1)).

### 2.4 Health-intake answers (sensitive data)
- PDPL Art. 1(11) and (13) classify health data as sensitive.
- Processing requires **explicit consent** (IR Art. 11(2)(a)). Legitimate interest cannot be used as the basis (PDPL Art. 6(4) and Art. 10(7); IR Art. 16(1)(c)).
- An impact assessment (DPIA) is mandatory before processing (IR Art. 25(1)(a); PDPL Art. 22).
- Access must be restricted to the minimum number of people and need-to-know, and every processing stage must be documented with the responsible person identifiable (PDPL Art. 23; IR Art. 26(3)–(4) and (6)).
- Data must be destroyed when no longer needed (PDPL Art. 11(4) and Art. 18(1)).
- There is no statute fixing a retention period for beauty-treatment intake forms, so it is a **business choice**. The safest default is below.

### 2.5 Legal hold (disputes and chargebacks)
- PDPL Art. 18(2)(b) allows retention past purpose only for data "closely related to a case under consideration before a **judicial authority**", and the data is destroyed once the proceedings end.
- A Tap or card-scheme chargeback is **not** a judicial case. Holding non-ledger data such as messages or booking details for a chargeback rests on the purpose still subsisting, or on fraud-prevention legitimate interest (IR Art. 16(2)), which **cannot cover health data**.
- Ledger and payment data are already retained for 10 years under 2.1.
- Limitation context: tort claims under the Civil Transactions Law Art. 143 run 3 years from knowledge, with a 10-year longstop (CTL source). **[COUNSEL]**: confirm whether a pending chargeback or complaint justifies refusing deletion of messages.

### 2.6 Backups
IR Art. 8(2)(c) requires destroying all copies, including backups. Supabase point-in-time backups cannot be edited selectively. Two controls cover this: the backup retention window is the destruction deadline for backup copies, and a deletion ledger is re-applied after any restore.

### 2.7 What the customer must be told
- At collection (PDPL Art. 12–13; IR Art. 4(1)(d)): the retention period for each category, the legal basis, whether data is transferred outside KSA, and their rights.
- On completion of deletion (IR Art. 3(2), plus good practice): what was deleted, what was kept, why, the legal basis, the end date, and their right to complain to SDAIA.

**Risk if not adopted:**
- Keeping records for only 6 years breaches CBL Art. 8 (fine of SAR 5,000–50,000) and leaves PRIMORA unable to defend commercial claims.
- Calling pseudonymised data "anonymised" leaves personal data outside the controls that apply to it (Art. 36 fine).
- Keeping health answers indefinitely breaches Art. 11(4) and 18. Leaking them exposes individuals to Art. 35 criminal liability.
- Over-retaining under a "legal hold" label with no judicial case breaches Art. 18.

**Final decision text (implement exactly):**
> On a verified deletion request PRIMORA will, within the Q1 deadline:
> 1. **Delete** the auth account (email, phone, password and MFA factors), profile, saved addresses, avatar, device tokens, marketing consents, favourites, reviews' author link (review text is deleted or shown as "Deleted user" per customer choice), and all private message **content** in every thread the customer is party to. The thread is replaced with a "conversation deleted" tombstone for the provider. The provider is notified under IR Art. 8(2)(a).
> 2. **Destroy** all health-intake answers immediately, regardless of other retention.
> 3. **Pseudonymise** bookings linked to a retained invoice or ledger entry: keep booking id, date, service, price, VAT, provider, and invoice/ledger reference. Replace customer_id with a random irreversible token, and null every other customer field. These rows are labelled "pseudonymised — retained under Commercial Books Law Art. 8 / VAT IR Art. 66" and are destroyed with the invoice. Bookings with no invoice or ledger link are deleted.
> 4. **Retain** tax invoices, credit notes, ledger entries, payout records and Tap settlement records for **10 years from the end of the financial year** they relate to, unaltered, in KSA, with access restricted to the finance role and every read logged. From now on, B2C invoices are issued as simplified tax invoices containing **no customer name, email, phone or address**.
> 5. **Legal hold:** deletion of a data category is deferred only when (a) a court or judicial-authority case naming the customer is pending (PDPL Art. 18(2)(b)), or (b) an open, documented payment dispute or chargeback exists. In case (b) only booking and payment records and the messages relevant to that booking are held, never health data, for no longer than **30 days after the dispute closes**. Each hold records the reason, case reference, approver and review date. Holds are reviewed every 90 days, and all other categories are deleted on schedule.
> 6. **Health-intake retention (business choice; safest default):** answers are kept only for the booking they were collected for and are destroyed **30 days after the appointment is completed or cancelled**. They are reused for future bookings only if the customer gives separate explicit consent, which expires after 12 months. Only the assigned provider can read the answers. Admins cannot read them except through a DPO break-glass path that is logged and step-up protected.
> 7. **Backups:** backup retention is at most **30 days**. Deleted subjects are recorded in a `deletion_ledger`, which is re-applied automatically after any restore.
> 8. The customer receives a completion notice listing what was deleted, what was retained, the legal basis, the retention end date, and their right to complain to SDAIA within 90 days (IR Art. 37).

---

## Q3 — Provider IBAN

**Proposed:** masked by default (last 4 digits); revealed only to a finance role with a reason; every reveal logged.

**Verdict: COMPLIANT** (good practice that satisfies the security duty). Add the details below.

**Legal basis:** a sole-trader barber's IBAN is personal data (PDPL Art. 1). It is not "Credit Data" under the PDPL definition (Art. 1(15) covers financing data), so it is not sensitive, but the security duty in PDPL Art. 19 and IR Art. 23 applies. IR Art. 23(b) requires adopting NCA controls or recognised best practice, and ECC least-privilege and privileged-access controls (2-2-3) apply. Minimisation applies too (PDPL Art. 11(3); IR Art. 19). AGENTS.md records that no one has yet approved which operators may see unmasked IBANs; that approval is a business owner decision.

**Risk if not adopted:** an unmasked IBAN list is a high-value fraud target, particularly for payout-redirection social engineering. A leak triggers breach notification (X1) and Art. 36 exposure.

**Final decision text:**
> Provider IBANs are stored server-side and returned to every client masked as `SA** **** **** **** **** 1234`. Unmasked IBANs are returned only by a server function `reveal_provider_iban(provider_id, reason)`. That function requires (a) role `finance`, (b) an MFA session at AAL2 with step-up in the last 5 minutes, and (c) a reason of at least 15 characters including a ticket or payout reference. The value is shown once for no more than 60 seconds and is never included in list views, exports or logs. Each reveal writes an append-only audit event (actor, provider, reason, time, IP, user agent). More than 10 reveals by one user in 24 hours raises an alert. Payout execution uses the IBAN server-side without revealing it. An IBAN change requires the provider to re-authenticate and a second finance user to approve it, and the provider is notified on their old and new contact channels. The owner approving who holds `finance` is recorded in the manifest `decisions[]`.

---

## Q4 — Admin reads of personal and bank data only through logged functions

**Verdict: NEEDS CHANGE.** The principle is right, but the scope is too narrow.

**Legal basis:** PDPL Art. 19 and IR Art. 23 (security measures; NCA controls). IR Art. 26(4) requires documenting all stages of health-data processing and identifying the person in charge of each. IR Art. 22(2)(d) requires documenting updates. ECC event-log monitoring is control 2-12, reported as requiring 12 months' retention (secondary source, **verify against the official NCA text**). PDPL Art. 41 imposes a confidentiality duty on staff.

**Risk if not adopted:** without logs, PRIMORA cannot answer a breach investigation (IR Art. 24(1)(a)–(c) requires describing the circumstances and scope) or show which admin accessed whom. Unlogged service-role, Supabase dashboard or SQL-editor access is the usual gap.

**Final decision text:**
> 1. Admin UI and API access to customer personal data, provider bank data, ledger rows, invoices and messages goes only through server functions or views that write an audit event (actor, role, action, target ids, fields, purpose, time, IP). There is no direct table `SELECT` for the admin role. RLS denies by default.
> 2. Health-intake answers are not readable by any admin role. The only exception is the DPO break-glass function, which requires a reason and step-up and alerts a second admin.
> 3. Production use of the service-role key, the Supabase dashboard Table Editor or SQL Editor, and direct database connections is limited to named engineers through a break-glass procedure (ticket plus reason). Postgres statement logging (`pgaudit` or equivalent) is enabled for those sessions.
> 4. Exports and bulk reads are logged per export with a row count and filter. Export files expire after 7 days.
> 5. The audit log is append-only. No role can update or delete it. It stores identifiers, not copies of the personal data.
> 6. Retention: security and access audit events are kept for **5 years**. This is a business choice that aligns with the 5-year RoPA tail in IR Art. 33(1) and covers most claim windows; ECC's 12-month figure is a minimum. Events are then deleted.

---

## Q6 — MFA and step-up

**Verdict: COMPLIANT**, with additions.

**Legal basis:** IR Art. 23(b) (adopt NCA controls or recognised best practice). ECC-2:2024 control 2-2-3 reportedly extends MFA to privileged accounts (secondary source; **verify**). Strictly, ECC binds government and CNI entities and their vendors, so for PRIMORA it is the recognised-best-practice benchmark. Step-up re-authentication is best practice; no statute requires it.

**Risk if not adopted:** compromise of an admin account through phishing or credential stuffing gives access to everything in the console. That is a breach requiring notification, and a regulator would treat missing MFA on privileged accounts as a failure of "necessary measures" (Art. 19).

**Final decision text:**
> All admin, finance, support and DPO accounts must enrol an authenticator-app (TOTP) factor before first access. Passkeys/WebAuthn are allowed as an additional or stronger factor. Admin sessions without `aal = aal2` are rejected server-side, in RLS and Edge Functions, not only in the UI. Step-up means a fresh MFA challenge within the last **5 minutes**, checked server-side from the `amr` timestamp. It is required before: payouts, refunds, ledger adjustments, personal-data deletion, data export (DSR or bulk), IBAN reveal or change, role or permission changes, MFA reset for another user, and break-glass access. An admin's MFA can be reset only by a different admin, with a reason and step-up. Admin sessions expire after 12 hours absolute and 30 minutes idle. Ten failed MFA attempts lock the account and raise an alert.

---

## D1 — Treat the platform as "regulated" (strictest profile)

**Verdict: COMPLIANT and required in substance.** PRIMORA processes sensitive health data (PDPL Art. 1(11) and Art. 23; IR Art. 26), bank details, and tax records subject to VAT IR Art. 66 and CBL Art. 8.

This status brings:
- a mandatory DPIA (IR Art. 25(1)(a));
- a likely DPO obligation if processing sensitive data is a core activity (IR Art. 32(1)(c); DPO Rules Art. 5). Whether health intake is "core" for a beauty marketplace is a judgement call **[COUNSEL]**, and DPO Rules Art. 9(2) allows voluntary appointment;
- registration on SDAIA's National Data Governance Platform, which is needed in any case to file breach notices (BG Stage One). The draft IR Art. 34 would make registration mandatory for controllers that process sensitive data or transfer data abroad.

**Final decision text:**
> PRIMORA is operated at the `regulated` profile. Before launch PRIMORA will: (a) complete and sign off a written DPIA covering health intake, messaging, payments and cross-border hosting (IR Art. 25); (b) appoint a DPO in writing and publish their contact details (IR Art. 32; DPO Rules Art. 6–7); (c) register on SDAIA's National Data Governance Platform; (d) obtain separate, explicit, recorded consent for health intake (IR Art. 11(2)(a)).

---

## D4 — Aggregates not logged per view; individual, bank and ledger views logged

**Verdict: NEEDS CHANGE (minor).** Data about an identifiable individual remains personal data even when it is a total. A filter that narrows to one provider who is a natural person (for example a sole-trader barber's monthly revenue), to one customer, or to a cohort small enough to single someone out is an individual view.

**Legal basis:** PDPL Art. 1 (definition of personal data); IR Art. 1(8) and Art. 9 (anonymisation standard).

**Final decision text:**
> Platform-wide or city-level aggregate dashboard tiles are not audit-logged per view. Any view is logged as an individual view if it is filtered to a single provider, branch, customer or booking, if any cell represents fewer than **5** people, or if it shows names, contact details, bank details, ledger rows, invoices or messages. Cells with fewer than 5 people are suppressed in aggregate tiles. The threshold of 5 is a business choice and is the safest common default.

---

## X1 — Breach notification

**Verdict: REQUIRED. The console should have it.**

**Legal basis:**
- PDPL Art. 20.
- IR Art. 24(1): notify SDAIA within **72 hours** of becoming aware, if the incident potentially harms the data or the data subjects or conflicts with their rights or interests. The required contents are listed in (a)–(e).
- IR Art. 24(2): information not available within 72 hours is supplied later, with reasons for the delay. Art. 24(3): keep copies of reports and corrective measures. Art. 24(5): notify data subjects without undue delay where they may be harmed, in clear language, with recommendations.
- BG Stage One: notices are filed through the National Data Governance Platform, which requires prior registration.
- IR Art. 17(1)(d): processors (Supabase, Tap, SMS and e-mail providers) must be contractually bound to notify PRIMORA without undue delay.
- DRAFT IR Art. 24 (not in force) would remove the harm threshold and require notice of every breach within 72 hours. Design for that now.

**Risk if not adopted:** a late or missing notice is a separate violation (Art. 36, up to SAR 5M per violation, doubled on repeat) and aggravates any underlying breach.

**Final decision text:**
> The admin console includes an Incident Register, accessible to DPO and security roles. Each incident records discovered_at and aware_at, which starts a 72-hour countdown shown on every DPO screen. It also records description, categories and approximate number of data subjects, data types, risk assessment, containment actions, preventive actions, the SDAIA-notified decision, the SDAIA reference and notified_at, the data-subject notification decision and sent_at, and evidence attachments. Records are kept for 5 years. PRIMORA notifies SDAIA within 72 hours of awareness for **every** personal data breach unless the DPO records a reasoned conclusion that no harm is possible. Affected data subjects are notified without undue delay, by SMS or e-mail in Arabic and English using pre-approved templates, whenever harm is possible. Processor contracts (Supabase, Tap, messaging providers) require breach notice to PRIMORA within 24 hours.

---

## X2 — Records of processing activities (RoPA)

**Verdict: REQUIRED.**

**Legal basis:**
- PDPL Art. 31.
- IR Art. 33: the record must be written, accurate and current, available to SDAIA on request, and **kept for the whole processing period plus 5 years** after a processing activity ends. Minimum contents (Art. 33(5)): controller details, DPO, purposes, data and subject categories, retention per category, recipients, transfers outside KSA with their legal basis and recipients, and security measures.
- IR Art. 20(6): log disclosures (dates, methods, purposes) in the RoPA.
- DRAFT: may simplify the mandatory content list.

**Final decision text:**
> PRIMORA maintains a written RoPA, owned by the DPO and using the SDAIA template where one is published. It covers every activity: accounts, bookings, messaging, health intake, payments and payouts, invoicing, marketing, support, analytics, and admin audit. Each entry includes the IR Art. 33(5) fields, including the Supabase, Tap and messaging-provider transfers. It is reviewed every quarter and on every schema change that adds personal data, and each entry is kept for 5 years after the activity ends. The admin console may display the RoPA read-only, but the controlled source is a versioned document.

---

## X3 — Cross-border transfer (Supabase hosting region)

**Verdict: NON-COMPLIANT until resolved.** As of 2026-10-10, Supabase's official region list has **no Saudi, UAE or Bahrain region** (SUPA). Wherever the project sits, personal data, including health data, is processed outside KSA.

**Legal basis:**
- PDPL Art. 29(1): a transfer is allowed only for listed purposes. TR Art. 2 adds "to provide a service or benefit to the data subject" and "central processing".
- PDPL Art. 29(2): the transfer must not prejudice national security, the destination must give adequate protection, and data must be minimised.
- TR Art. 4: without adequacy, use Standard Contractual Clauses, binding common rules, or an accreditation certificate. Note that the TR Art. 4(2)(D) certificate route **excludes sensitive data**.
- TR Art. 7: a written **transfer risk assessment** is mandatory for Art. 4 transfers and for continuous transfer of sensitive data.
- PDPL Art. 13(4): tell users about the transfer. IR Art. 33(5)(g): record it in the RoPA.
- **Separately, VAT IR Art. 66(3) and ZG §8.3.1:** a KSA-resident taxable person's VAT records must be held on a server inside the Kingdom. Invoices and ledger data held only in a foreign Supabase region fail this regardless of PDPL.
- DRAFT IR Art. 23 would require storing personal data inside KSA, with transfers still permitted.

**Risk if not adopted:** an unlawful-transfer violation (Art. 36), a VAT record-keeping breach, and a weaker defence after any breach. If the draft localisation rule is adopted, the platform would need re-architecting under time pressure.

**What must be checked** (the hosting region is currently unknown):
1. The project region: Supabase Dashboard → Project Settings → General, or the Management API `GET /v1/projects` → `region`. Also confirm whether there is a read replica.
2. Where backups and point-in-time recovery data are stored.
3. Where Supabase Storage buckets are stored (intake attachments, avatars).
4. Where logs and analytics are stored.
5. Where Edge Functions execute. They run at the edge globally, so request payloads are processed in the region nearest the user.
6. Supabase's sub-processor list and DPA, and whether Supabase will sign SDAIA SCCs.
7. Tap's processing and storage location and its role (processor or independent controller).
8. The location of SMS, e-mail, push and analytics vendors, and the web hosting region (e.g. Vercel functions).
9. Whether SDAIA has published an adequacy list (TR Art. 3) that includes the destination country.

**Final decision text:**
> Until a KSA-resident option is in place: (1) record the Supabase region and every sub-processor location in the RoPA; (2) execute SDAIA Standard Contractual Clauses (or an equivalent addendum to the Supabase DPA) with Supabase and every non-KSA processor; (3) complete and sign a TR Art. 7 transfer risk assessment that specifically covers health-intake data; (4) disclose in the Arabic and English privacy policy that data is processed outside the Kingdom, naming the countries; (5) archive all tax invoices and accounting records daily to storage located **inside KSA** (a KSA cloud region or a ZATCA-integrated e-invoicing provider storing in KSA), retained 10 years, with ZATCA access; (6) move health-intake data to KSA-resident storage or stop collecting it until (3) is approved. Target architecture: personal data and records hosted in a KSA region, with Supabase self-hosted or replaced, before the draft IR Art. 23 localisation rule takes effect.

---

## Items a licensed Saudi lawyer must confirm before launch [COUNSEL]

1. Whether a newer Commercial Books Law or regulation changes the **10-year** period, and whether PRIMORA's capital exceeds SAR 100,000 (CBL Art. 1).
2. Invoice structure: which entity is the legal supplier on customer invoices (PRIMORA or the provider), whether PRIMORA may issue invoices on providers' behalf, and who holds the retention duty.
3. Whether PRIMORA is a controller, joint controller or processor for provider-side data and for health intake, and what the provider data-processing agreement must contain.
4. Whether health intake makes sensitive-data processing a "core activity" that mandates a DPO, and whether any Ministry of Health or SFDA rules apply to the treatments offered (IR Art. 26(1)).
5. Whether an open chargeback or non-judicial dispute justifies deferring deletion (PDPL Art. 18(2)(b) names only judicial cases).
6. That DSR handling free of charge is mandatory and not merely the safest reading.
7. The lawful transfer route for Supabase and Tap: SCCs vs. adequacy, the SCC execution formalities, and whether foreign hosting of VAT records is permissible in any form.
8. The status of the October 2026 draft IR amendments (consultation closes 5 Nov 2026; effective 60 days after Gazette publication), especially the Art. 23 localisation, Art. 24 breach and Art. 34 registration changes.
9. Arabic-text check: the official Arabic PDPL, IR and VAT IR prevail over the English translations used here.
10. Applicability of NCA ECC-2:2024 to PRIMORA, and the exact control numbers and log-retention figures from the official NCA text.
