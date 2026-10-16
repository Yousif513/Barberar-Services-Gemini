# PRIMORA owner decisions sheet (2026-10-17)

The code is finished and merged into `master` (production deploy held). What remains needs **you**. Every item below is already
built with the safest default. Mark ✅ to keep the default, or write a change. Nothing here is a legal opinion; the legal items at
the end need a licensed Saudi lawyer or tax adviser.

## 1. People (required before launch)

| # | Question | Your answer |
|---|----------|-------------|
| P1 | Who holds the **finance** role? Approvals need at least two admins, so the owner cannot approve their own payouts and refunds. | |
| P2 | Who is the **data protection officer (DPO)**? Until one is named, only owners can use the emergency access to health answers. | |
| P3 | Who is the **second owner**? With one owner, nobody can be made owner or finance from the console, and break-glass is the only path. | |
| P4 | How does a locked-out lone owner recover (MFA lost)? Today an engineer must reset it in the database. | |

## 2. Defaults already built: **APPROVED by the owner on 2026-10-17 ("approve all defaults")**

Recorded as confirmed decisions in `.admin-console/manifest.json`. Any of them can still be changed later through the console approval flow.

| # | Default (what the system does now) | Keep? |
|---|------------------------------------|-------|
| D1 | The platform runs at the strictest ("regulated") security level. | |
| D2 | Customer personal data is visible to the **owner** and **operations** roles only. Finance sees customer names only for disputes. Analyst sees totals only. | |
| D3 | Dashboard figures based on **fewer than 5 people** are hidden ("Fewer than 5"). | |
| D4 | Work-queue counts on the dashboard stay visible; only their money totals are hidden under 5. | |
| D5 | Payouts and refunds need a second admin. **Single refund ≥ SAR 1,000**, or **> SAR 5,000 refunded by one admin in a day**, needs approval. (Adjustable later, with approval.) | |
| D6 | Owner break-glass (lone owner): written reason, **SAR 10,000/day cap**, review within 7 days, never for IBAN changes or reconciliation corrections. | |
| D7 | Any difference with Tap of **SAR 0.01 or more** opens a reconciliation item (no tolerance). | |
| D8 | An open reconciliation item for a provider **blocks all of that provider's payouts** until it is resolved. | |
| D9 | Provider IBANs and staff salary IBANs are masked. Full number shown for 60 seconds, logged, finance/owner only (the provider's own owner can see staff IBANs after a recent sign-in). | |
| D10 | A changed bank account is held **48 hours**, and the provider is notified. Until an email/SMS sender exists, a second person must waive the notice to pay. | |
| D11 | Referral reward vests only after the friend's first **completed, paid, unrefunded** visit. | |
| D12 | Sponsored price changes need a second owner. | |
| D13 | Privacy identity check = sign-in with a one-time code within 10 minutes. A phone/email changed in the last **30 days** blocks the request. | |
| D14 | Customers can correct first name, last name and gender through a request; email and phone change in account settings. | |
| D15 | Retention clock uses the **calendar year** (31 Dec + 10 years) until you tell us your financial year end. → Financial year end: ____ | |
| D16 | Health answers and patch tests are destroyed **30 days** after the appointment (including no-shows). | |
| D17 | Court holds: after **3 renewals (~1 year)** a different owner must re-approve. Releasing a hold early needs a second person. | |
| D18 | Customer lookup for privacy requests: whole phone/email only, **10 searches per 10 minutes**, fresh code required. | |
| D19 | Arabic screens use Arabic-Indic digits (٠١٢٣); IDs, phones, emails, IBANs stay Latin. | |
| D20 | The register of processing activities stays in English with an Arabic note, until the DPO approves a translation. | |
| D21 | Provider "recorded commission %" is shown read-only and sets no price; real fees come from fee rules. | |
| D22 | `payment_methods` (which payment methods are enabled) is an owner setting, not a finance setting. | |

## 2b. Technical safeguards not on the list above (approve as a batch when convenient)

These are engineering choices made during the security fixes. Each is the stricter option. They stay "assumed" until you approve them.

| # | What the system does | Keep? |
|---|----------------------|-------|
| T1 | Treat the live database as NOT having the new migrations until we check it together. | |
| T2 | Refunds and settlements may lower (never raise) an original ledger row; every other correction is a new entry. | |
| T3 | Giving any money, IBAN, roles, MFA-reset, settings or break-glass permission needs a different owner's approval and a 72-hour wait. | |
| T4 | A ledger correction can never exceed the reconciliation difference it closes. | |
| T5 | After a deletion, purchased packages, memberships, gift cards and disputes keep their money record under a pseudonym (10 years). | |
| T6 | The privacy PDF uses the site's own Arabic font (IBM Plex Sans Arabic, open licence). | |
| T7 | The deletion record is exported for an archive outside the database (you choose where; see section 4). | |
| T8 | Admin menus hide what a role cannot use; the server still refuses it anyway. | |
| T9 | A booking with any money record (tip, coupon, gift card, wallet, package, loyalty, referral) is pseudonymised, never deleted. | |
| T10 | Correcting an incident's "aware at" time needs a second person and keeps the full history. | |
| T11 | Phone-based erasure only touches messages from the period the customer owned that number. | |
| T12 | After 10 years, money-linked bookings are kept with the marker "retention-ended"; everything else is deleted. | |
| T13 | A profile clear is refused while a court hold covers the account. | |
| T14 | A real 10-year purge needs a second person; dry runs do not. | |

## 3. Values only you can set (features stay OFF until set)

| # | Value | Your answer |
|---|-------|-------------|
| V1 | Referral reward (SAR), monthly cap per customer, monthly budget, expiry, terms text | |
| V2 | Loyalty points per SAR, cap, budget, expiry, terms text | |
| V3 | Sponsored placement price per new client and number of slots | |
| V4 | Plan prices and limits shown to providers (currently from the records) | |
| V5 | Message retention days; WhatsApp session window | |

## 4. Services to connect (your accounts)

1. **Email/SMS provider** (e.g. Resend for email, Twilio/Unifonic for SMS): needed for customer and security notices.
2. **Scheduler**: turn on Supabase cron for the daily jobs (privacy deadlines, health-answer purge, hold release, incident alerts, reconciliation, membership expiry, fee batch, webhooks, 10-year purge).
3. **Tap**: test key (to test refunds and "Check with Tap"), then **written confirmation** that Tap's Marketplace product collects, splits and pays out (so PRIMORA never holds customer money).
4. **Archive outside the database** for the deletion record (e.g. a private storage bucket in another account), so a backup restore cannot bring deleted customers back.

## 5. Legal and paperwork (lawyer / accountant / you)

1. Sign the data-protection impact assessment, appoint the DPO in writing, and register on SDAIA's National Data Governance Platform.
2. Sign SDAIA transfer clauses with Supabase (no Saudi region) and the other processors, plus a transfer risk assessment, and say in the privacy policy that data is processed outside KSA. Health-intake questions stay **off** until this is approved.
3. Lawyer and tax adviser to confirm the COUNSEL list in `docs/legal/2026-10-10-adopted-decisions.md`. **Most urgent:** whether PRIMORA owes VAT on the full booking price for providers that are not VAT-registered (rule from 1 Jan 2026).
4. Publish the terms and privacy policy (consent screens show "unpublished" until then).

## 6. Go live (together, about an hour, after 1–5)

1. Back up the hosted Supabase project.
2. Check its migration history, then apply the migrations.
3. In Supabase Auth: enable TOTP MFA, session limits (12 h / 30 min idle), the MFA lockout hook.
4. In Vercel: set the Supabase URL and key, then `PRIMORA_PRODUCTION_RELEASE` = `enabled`, then Redeploy.
5. Live check: sign-in, a booking, a Tap test payment, an admin approval.
