# Record of Processing Activities (RoPA)

Version: 0.1 (draft, prepared by engineering from the code on 2026-10-11)
Owner of this record: the DPO (not yet appointed; see "Owner must complete")
Basis: PDPL Art. 31; Implementing Regulation Art. 33 (written, current, kept for the processing period plus 5 years, minimum
contents in Art. 33(5)); X2 "Final decision text" in `docs/legal/2026-10-10-privacy-decision-memo.md`.
Review: every quarter and on every schema change that adds personal data. The admin console shows this file read-only at
`/admin/ropa`; this versioned document is the controlled source.

Fields marked **OWNER MUST COMPLETE** are legal or organisational facts engineering cannot know. Nothing has been filled in on
the owner's behalf.

## Controller and DPO

| Field | Value |
|---|---|
| Controller | PRIMORA. **OWNER MUST COMPLETE**: legal name, Commercial Registration number, national address, contact |
| Controller role for provider-side data and health intake | **OWNER MUST COMPLETE** (counsel item 3: controller, joint controller or processor) |
| DPO | **OWNER MUST COMPLETE**: name and published contact (DPO Rules Art. 6-7) |
| SDAIA National Data Governance Platform registration | **OWNER MUST COMPLETE**: registration reference |

## Processors and transfers outside the Kingdom

| Recipient | What it processes | Location | Legal basis for transfer | Status |
|---|---|---|---|---|
| Supabase (database, authentication, storage, Edge Functions) | All data below | **OWNER MUST COMPLETE**: project region (Dashboard > Project Settings > General); Supabase lists no KSA, UAE or Bahrain region (memo X3) | **OWNER MUST COMPLETE**: SDAIA SCCs or DPA addendum (X3 step 2) | Transfer risk assessment not yet approved; health-intake collection is switched off until it is (X3 step 6) |
| Tap Payments | Card payments (card details entered on Tap's hosted page, never received by PRIMORA), charge and refund references, amounts | **OWNER MUST COMPLETE** | **OWNER MUST COMPLETE** | Role (processor or independent controller) to be confirmed |
| Meta WhatsApp Cloud API | Booking and reminder messages to opted-in customers; the WhatsApp receptionist conversations | **OWNER MUST COMPLETE** | **OWNER MUST COMPLETE** | Used only with WhatsApp consent |
| E-mail and SMS sender for governance and privacy notices (Resend, Twilio by configuration) | Notice text and the verified address or number | **OWNER MUST COMPLETE** | **OWNER MUST COMPLETE** | No sender is configured yet; notices wait as "undeliverable: no sender configured" |
| Web hosting of the Next.js app | Requests carrying session tokens | **OWNER MUST COMPLETE** | **OWNER MUST COMPLETE** | |

## Processing activities

| # | Activity | Purpose | Data subjects | Personal data categories | Recipients | Retention | Security measures |
|---|---|---|---|---|---|---|---|
| 1 | Customer accounts | Sign-in and the customer account | Customers | Name, e-mail, phone, gender, language, consents, device push tokens | Supabase | Until the account is deleted on request (Q2); consents kept with the account | Row-level security; console reads only through audited functions (Q4); MFA and step-up for the console (Q6) |
| 2 | Bookings | Booking, scheduling and service delivery | Customers, provider staff | Booking date, service, price, VAT, provider, home address for home services (held in a separate table, shown to staff in a window around the visit), cancellation reason | The booked business; Supabase | Bookings linked to an invoice or ledger entry: pseudonymised on deletion and kept 10 years from the end of the financial year (CBL Art. 8, VAT IR Art. 66); others deleted on request | Audited console reads; home address window; D4 small-cell suppression |
| 3 | Messaging | Customer-business conversations | Customers, provider staff | Message text | The business in the conversation | Deleted on the customer's deletion request; the business keeps a "conversation deleted" tombstone | Party-only access; audited console reads |
| 4 | Health intake | Treatment safety questions | Customers (sensitive data) | Health-intake answers, patch-test results | Only the provider assigned to the booking | Destroyed 30 days after the appointment is completed or cancelled; reused only with a separate consent lasting 12 months (Q2.6); destroyed at once on deletion | Explicit consent; collection off until the transfer risk assessment is approved (X3(6)); no console read except the logged owner break-glass |
| 5 | Payments and payouts | Charging customers, refunds, paying providers | Customers, provider owners | Payment references (masked), amounts, provider IBAN (masked; reveal audited, Q3) | Tap; the provider's bank | 10 years from the end of the financial year | Append-only money tables, maker-checker approvals (D-Q5, D-Q8), audited reveals |
| 6 | Invoicing | ZATCA simplified tax invoices | Customers (B2C), providers | Seller details, amounts; B2C invoices name no buyer from 2026-10-11 (Q2.4) | ZATCA (when integrated) | 10 years from the end of the financial year, unaltered | Hash chain; finance-only audited reads |
| 7 | Marketing and reminders | WhatsApp and promotional messages | Customers who consented | Phone number, message history | Meta WhatsApp | Until consent is withdrawn | Consent records with document version; opt-out stops sending |
| 8 | Support and privacy requests | Answering customers and PDPL requests | Customers | Request details, channel, verification method, decisions | None outside PRIMORA | The privacy-request record is kept as evidence of compliance (IR Art. 3(1)(d)). **OWNER MUST COMPLETE**: retention period for closed requests | One-time-code identity check; four-eyes approval for copies and deletions |
| 9 | Analytics | Product usage measurement | Visitors, customers | Event names, pages, pseudonymous user id | Supabase | **OWNER MUST COMPLETE**: retention period | No personal keys accepted by the recorder; small cells suppressed |
| 10 | Admin audit | Accountability of console actions | Console users, affected customers and providers (identifiers only) | Actor, action, target identifiers, purpose, IP, user agent | None outside PRIMORA | 5 years (Q4.6) | Append-only; owner-only audited reads |
| 11 | Breach register | Recording and notifying personal data breaches | Affected data subjects (categories and counts only) | Incident description, categories, counts, decisions | SDAIA when notified | 5 years (X1) | Owner-only console access; step-up for decisions |
| 12 | Provider onboarding | Admitting businesses | Provider owners | Name, contact, Commercial Registration, VAT status, IBAN | Wathq (CR check) | **OWNER MUST COMPLETE** | Audited reads; IBAN controls (Q3) |
| 13 | Employee records (provider staff, payroll) | Scheduling and pay | Provider staff | Name, schedule, earnings, WPS IBAN (masked) | The employing business | **OWNER MUST COMPLETE** | Audited reads; masked IBAN |

## Disclosure log (IR Art. 20(6))

Disclosures to SDAIA, courts or other authorities are recorded here with date, method and purpose. **OWNER MUST COMPLETE**
(none recorded).

## Change history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-11 | First draft from the code (PRIV package). Every "OWNER MUST COMPLETE" field is open. |
