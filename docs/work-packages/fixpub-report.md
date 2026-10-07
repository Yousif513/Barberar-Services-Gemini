# FIX-PUB report (branch wp/fixpub)

Package scope: public pages and the booking page (`shop`, `login`, `discover`, `services`, `become-provider`, `privacy`, `terms`, `about`,
`security`, landing). No migrations were written. R25/R26 (global locale provider, double RTL mirroring) are skipped by instruction; the
integrator does them after all merges.

## Status per defect

| Defect | Status | Commit | Test / proof |
|---|---|---|---|
| D-17 login i18n + dir | fixed | group 1 | `tsc`, eslint, schema check (see Verification) |
| D-11 / D-23 login consent via `record_consents` | fixed (login) | group 1 | UI-vs-schema check |
| D-15 caller: privacy data request via `submit_data_request` | fixed | group 2 | UI-vs-schema check (86 rpc calls, 0 mismatches) |
| D-22 privacy page: "Saudi PDPL Compliance" headline and PDPL / statutory claims | fixed (EN + AR) | group 2 | guard test extended in group 5 |
| D-07 / D-12 / D-25 callers: become-provider city, coordinates, agreement-not-published state, acceptance evidence | fixed | group 3 | UI-vs-schema check |
| R34 become-provider: 15% commission text, "Growth" feature list, 299 SAR hard-coded price | fixed (plans read from `subscription_plans`, no rate quoted) | group 3 | guard test extended in group 5 |
| D-23 / D-11 booking modal: required linked terms checkbox, consent through `record_consents`, retry on failure | fixed | group 4 | UI-vs-schema check (87 rpc calls) |
| R22 / D25 shop page: service and specialist cards are `<button aria-pressed>`, labelled date input with `min`, named icon links and close buttons, both dialogs through `ModalOverlay` | fixed | group 4 | tsc, eslint (28 warnings, same as base), manual DOM review |
| R24 slot labels `ar-SA` / `Asia/Riyadh` and SAR through one formatter | fixed | group 4 | tsc |
| R24 any-professional duration (combined duration and service list into `get_branch_available_slots`) | deferred, needs a database change (see below) | - | - |
| "Book again" preselects `?service=<id>` | fixed (once per link, with a message when the service is gone) | group 4 | tsc |

(The table is appended after every commit group.)

## Group 1: login (D-17, D-11 login half, D-23 login half)

- `web_platform/src/app/login/page.tsx`: full EN/AR translation table, `dir`/`lang` on the root element, language switch button, logical
  utilities (`ps-`/`pe-`/`end-`), `dir="ltr"` on phone/email/password/code inputs, labelled password field, named show/hide button,
  `aria-pressed` on the toggles, focus-visible outlines.
- Consent: the terms/privacy checkbox now exists in BOTH the phone and the email sign-up forms (it was missing in the email form). The checkbox
  shows the version of the published `customer_terms` agreement (read from `legal_agreements`, which is publicly readable when published). Sign-up is
  blocked with an explicit message while no `customer_terms` is published or when the lookup fails. Consent is written with
  `rpc("record_consents", { p_purposes, p_status: "granted", p_document_version: <published version>, p_method: "web_auth_form" })`; the
  literal `v1.0` is gone from the client. A failed write is shown in an alert with a "retry saving consent" button and the person is NOT routed on.
- New shared pieces: `web_platform/src/lib/published-agreement.ts` (published agreement lookup, reused by the shop page and become-provider) and
  `web_platform/src/lib/use-page-locale.ts` (`primora_lang` via `useSyncExternalStore`, keeps `<html lang dir>`; no timer, no setState-in-effect).
- Limitation, not fixed here: when email sign-up needs confirmation (no session yet) there is no `auth.uid()`, so no consent can be written; the
  message tells the person that the choices are saved only after signing in and accepting again. A post-confirmation consent gate belongs to the
  customer portal package.

## Group 2: privacy page (data request caller, claims)

- `privacy/page.tsx` calls `rpc("submit_data_request", { p_request_type, p_details })`; the success text shows the server's `due_date` (Riyadh date,
  `ar-SA`/`en-GB`, `Asia/Riyadh`) and the reference, and says so when an open request of the same kind already exists (`created: false`). A failure is shown
  in a `role="alert"` box and the typed details are kept.
- Wording: the "Saudi PDPL Compliance" label, "statutory request", "statutory deadline", "committed to data protection principles under the Saudi PDPL" and
  "protected through secure platform access" are gone in both languages; the contact callout was English-only and named a "Riyadh Data Protection
  Officer" and "compliance team": it is now translated and says only that the request form or `privacy@primora.com` can be used.
- Request-type buttons have `aria-pressed`, the group is labelled, the textarea is labelled and capped at 2000 characters (the server limit).
- Open decision for the owner: `privacy@primora.com` (privacy page) and `support@primora.com` (terms page) are hard-coded contact addresses with no
  entry in `declaredStatic[]`; confirm the mailboxes exist or move them to `platform_settings`.

## Group 3: become-provider (D-07, D-12, D-25 callers, R34 pricing)

- City is a required input (the hard-coded `"Riyadh"` is gone); latitude and longitude are optional, both-or-neither and range-checked (matching
  `provider_applications_coordinates_range`), with a "use my current location" button. The trade licence link is `type="url"` and must be https
  (matching `provider_applications_trade_license_https`).
- The published `provider_agreement` is read on load (with its text, shown in a `<details>` the applicant can open). While none is published, or when
  the read fails, the form shows an explicit "applications are closed" / error state and the submit button is disabled (the server also refuses with
  22023). Submission records the acceptance first through `record_agreement_acceptance(p_agreement_key, p_version, p_method)` (idempotent) and then
  inserts the application; the server stamps `status`, `agreement_id`, `agreement_version` and `agreed_at` (the client no longer sends `status`).
  The old code silently skipped the acceptance when nothing was published.
- A second open application is reported ("you already have an open application", SQLSTATE 23505 from `provider_applications_one_open_per_applicant`);
  an application in `under_review` is now shown as under review (before, the form was shown and the insert failed).
- Pricing: the hard-coded "15% platform commission", "299 SAR / month" and the feature list nothing gates are removed. The plan cards are read from
  `subscription_plans` (anon-readable): name, price through the shared `sar()` formatter, branch / staff / SMS limits, with loading, empty and error
  states. No commission rate is quoted on the public page: `fee_rules` is readable by signed-in users only and its seed says "subject to commercial
  confirmation", so the page says fees are stated in the Provider Agreement and the provider dashboard.
- Other: all labelled inputs are associated (`htmlFor`/`id`), icon links and the language switch have names, `as any` removed, load failure of the
  existing application is surfaced instead of swallowed, page language through the shared `usePageLocale` hook.

## Group 4: booking page (`shop/[id]/page.tsx`)

- Consent: the phone-verification dialog now has a required terms/privacy checkbox that links to `/terms` and `/privacy` and shows the version that is
  published for `customer_terms` (read on page load). The checkbox, and the send-code button, stay disabled while no terms are published or when the
  read fails (an alert says which). After the code is verified the choices are written with
  `rpc("record_consents", { p_purposes, p_status: "granted", p_document_version: <published version>, p_method: "inline_booking_modal" })`.
  If the write fails the dialog keeps the error and the number stays verified (`authVerifiedUserId`): the button becomes "retry saving consent" and
  the spent one-time code is not asked for again; the booking only continues after the consent is stored. The old unchecked `.insert` and the literal
  `v1.0` are gone.
- Keyboard and screen reader (R22 / D25): service and specialist cards are real buttons with `aria-pressed` (spans inside, no nested buttons),
  the date input has a `<label htmlFor>` and `min` = today in Riyadh, the dependents select and the dialog fields are labelled, slot buttons have
  `aria-pressed`, the header icon links and the language switch are named, decorative SVGs are `aria-hidden`. The waitlist and phone dialogs use the new
  `components/public-dialog.tsx` (`ModalPortal` + `ModalOverlay` + `role="dialog" aria-modal aria-label`): focus moves in and is trapped, Escape closes
  (not while a request is running), the page behind is inert and focus returns to the opener; the close buttons are named.
- R24: slot labels come from `formatBookingTime` (`ar-SA` or `en-GB`, `Asia/Riyadh`, the shared formatter of the customer portal); all money on the page
  goes through `sar()` from `operations-ui` (the Arabic coupon and gift-card messages no longer say "ريال" next to an English "SAR").
- Language: the page uses `usePageLocale` (no localStorage-then-setState effect). The remaining `setInterval` language polling on other public pages
  is part of R25 and is left to the integrator.
- "Book again": the existing preselect effect re-ran on every provider reload (a language switch undid the visitor's choices) and did nothing when the
  service had been removed; it now runs once per link, after the provider has loaded, and shows a message when the service is no longer offered.
- NOT touched (FIX-BOOKING's area): `getPrayerWindowsForDate`, `fetchSlots`, `handleBook` and the `create_booking` / `create_multi_service_booking`
  calls. `docs/work-packages/fixbooking-report.md` did not exist yet when I reached the booking call (only `fixcust-report.md` and `fixdba-report.md`
  were present in the primora-fix tree), so the call is unchanged. The integrator must apply the prayer-window and attribution-token changes there.

## Needs from other packages

- `get_branch_available_slots` takes one `target_service_id` and uses that service's duration; with "any professional" and several services in the cart it
  lists times that `create_multi_service_booking` then rejects. The page cannot fix this on its own: the function needs a service list (or combined
  duration) argument; the page will pass it once it exists.
- `record_consent` (patched in `20261007010400`) still falls back to the literal `'v1.0'` when no `customer_terms` row is published and the caller
  passes no version. The screens now refuse to record when nothing is published, but the database should raise instead of defaulting.
