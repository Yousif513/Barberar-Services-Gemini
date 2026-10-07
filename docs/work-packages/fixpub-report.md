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
| D-22 / R34 landing, about, security, terms, discover, shop footer, category pages, layout metadata: unbacked claims (EN + AR) | fixed | group 5 | `web_platform/tests/no-mock-data.test.mjs` "public pages promise only what the platform does" (11 term rules) |
| R29 stale source-text tests (`verify_provider_cr`, `enqueue_post_visit_rebook` / `post_visit_review_rebook`) | the two named cases deleted, the rest kept | group 5 | `npm run test --workspace=web_platform` |
| R29 executing tests for slots, closures, leave, seasons | deferred: DB tests belong to the database packages (no migrations or DB test files in this package) | - | - |
| R35 `/services` filters on the server, pages, no `reviews` select | fixed | group 6 | guard tests in `no-mock-data.test.mjs` ("services catalogue is searched, filtered and paged on the server"), UI-vs-schema check |
| C-D21 discover: no invented map pins; plus found while there: category slugs that matched nothing, "distance" measured from the city centre, failed search shown as "no salons", stock photo per salon, clickable `div` cards | fixed | group 7 | guard tests in `no-mock-data.test.mjs` ("discover map draws only what the data places"), UI-vs-schema check |


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

## Group 5: unbacked public claims and the guard

What was removed or reworded, in both languages:

| Where | Before | After |
|---|---|---|
| Landing | "Top 1% Vetted", "Verified Artists", "certified home-service professionals", "Hygiene Certified / strict hygiene protocols 100%", "24/7 Dedicated Help / local support", AR "payment by trusted guarantee" (escrow), "thousands of ...", "Riyadh Geofenced", an invented "Featured Space: Riyadh Apothecary & Spa, from 150 SAR" card | "Reviewed Providers / checked before listing", "Prayer-Time Scheduling", "Message Your Provider", "Book with a Deposit ... pay the deposit by card through Tap", "Home Service"; the hero card says "Book online" and shows no listing or price |
| About | "Top 1% Vetted Talent", "passes verified identity checks, portfolio evaluations", "Primora guarantees a vetted, secure, and exceptional experience", "Secure Payment Settlement ... paid out after the appointment", "Geofenced Convenience", sanitation guidelines followed by everyone | "Reviewed Providers" (applications are reviewed by our team, customers rate visits), "Deposits Through Tap" (ledger, payout on request), "Home Service", "each provider sets its own hygiene practices" |
| Security | "VAT & Payments Compliance", "Secure Payouts", seals "PCI-DSS GATEWAY COMPLIANT" and "TLS 1.3 SECURE SSL" (English only) | "VAT and Payments", seals "Card details: entered on Tap's page", "VAT 15%: shown on every booking", "Connection: HTTPS" (translated) |
| Terms | provider "paid out after the appointment is marked complete", "verified bank account", an English-only "arbitration desk" callout | "payable after the visit, paid out on the provider's payout request to its registered bank account"; callout translated and without the arbitration claim |
| Privacy | see group 2 | |
| Shop footer, layout title and description, discover and the four category pages | "Luxury ... premier ... selective clients", "verified", "certified stylists", "finest", "highest-rated" | neutral descriptions |

Guard: `no-mock-data.test.mjs` now scans the public pages (`app/page.tsx`, `layout.tsx`, `about`, `security`, `privacy`, `terms`, `become-provider`, `login`,
`discover`, `services`, `shop`, `categories`, `components/category-providers.tsx`) for guarantee / certified / certification / compliant / compliance /
bank-grade / PCI-DSS / vetted / top 1% / 24/7 / thousands of / TLS 1.3, and for the Arabic terms ضمان، شهادة النظافة، متوافق، معتمد (and نخبة مصفاة،
أفضل 1%). It also checks that no commission rate or plan price is typed into the landing, about and provider-application pages, that the landing
page invents no featured listing, that login / booking dialog / privacy / provider application never write to `consents`, `data_subject_requests` or
`agreement_acceptances` directly and never send a typed `v1.0`, that failed consent writes are not swallowed, that the booking dialog has a required linked
terms checkbox, and that the booking page has no clickable `div`, no hand-made `fixed inset-0` overlay, labelled date input with `min`, `aria-pressed`
choices, named close buttons, and no `toLocaleTimeString("en-US")` or `} SAR` amounts.

Left on purpose, owner decision needed: section 3 of the terms and security pages still states the marketplace fee (20% on a new client's first visit, SAR 10
minimum, SAR 40 maximum, none on repeat visits). It matches `fee_rules` today, but `fee_rules` is only readable by signed-in users and is seeded
"subject to commercial confirmation"; the text belongs in the published agreement, not in page copy. The page is unchanged until the owner confirms.

## Group 6: `/services` (R35)

- Shops come from `rpc("search_marketplace_providers", { p_query, p_category, p_limit: 24, p_offset })` (normalised Arabic search, category, real
  rating and review count in the same answer). Services come from a paged query (`.range`, `count: "exact"`) filtered by category, home service and price
  band on the server, with ordering by featured/sort order or price; the service search is an `ilike` on name and description in both languages. Both lists
  have "show more" with "showing N of TOTAL", a loading state, an empty state and an error state that names the reason and offers a retry. The search box is
  debounced (300 ms). Service ratings come from `provider_rating_summaries(uuid[])` for the providers on the current page; the `reviews` table is no longer
  read at all, so ratings no longer degrade past 1,000 rows.
- Deleted invented content in the same file (it could not be paged honestly): `inferServiceGender`, the "for Men" / "for Women" duplicates of each
  provider's service with generated descriptions and stock photos, the per-gender image tables, the gender filter and chips, the "Rating" sort (it cannot be
  ordered on the server), the per-shop stock photo chosen by guessed gender (shops show an initial tile instead) and the "home service" chip on shops (the
  search function does not return it).
- Behaviour changes to know about: the price and home-service filters apply to services only (the shops list says so when they are active); searching a
  provider's name finds the shop in the Shops list, and the service list matches service text only; Arabic search in the service list is plain `ilike` (the shop
  list normalises Arabic spelling on the server).
- The service detail drawer is a named modal dialog (`ModalPortal` + `ModalOverlay`): focus moves in and stays, Escape closes, the page behind is inert; all
  prices go through `sar()`; filter and category buttons expose `aria-pressed`.

## Group 7: `/discover` (C-D21)

- A pin is drawn only for a branch that has numeric coordinates inside the selected city's box. Before, a branch without coordinates (or with an
  out-of-box one, clamped to the edge) got a position made from its list index. Such branches stay in the list with a "no map location" note and are counted in the
  map caption; the map is labelled as schematic (its road lines are a drawing, not a basemap).
- Found while there and fixed: the category pills used slugs (`haircuts`, `haircolor`, `massage`, `skincare`, `nails`) that exist in no database row, so any category
  filter returned nothing - the pills now come from `categories`. "N km away" was measured from a fixed city centre passed as the user's position; distance now
  needs the visitor to share a position (a "distance from me" button). The fixed district lists are gone: district pills come from the branches the search
  returns. A failed search was logged to the console and shown as "no salons found"; it is now an error with the reason and a retry. The stock photo used for every
  salon is replaced by an initial tile. Salon cards were clickable `div`s; the selection is a `<button aria-pressed>` and the link to the shop is separate. Prices go
  through `sar()`.
- `negative-authorization.test.mjs` asserted the literal `SAUDI_DISTRICTS`; that single assertion now checks `districtOptions` (the behaviour that replaced it).

## Needs from other packages

- `get_branch_available_slots` takes one `target_service_id` and uses that service's duration; with "any professional" and several services in the cart it
  lists times that `create_multi_service_booking` then rejects. The page cannot fix this on its own: the function needs a service list (or combined
  duration) argument; the page will pass it once it exists.
- `record_consent` (patched in `20261007010400`) still falls back to the literal `'v1.0'` when no `customer_terms` row is published and the caller
  passes no version. The screens now refuse to record when nothing is published, but the database should raise instead of defaulting.

## Verification (commands run in `primora-wp-fixpub`, results)

| Command | Result |
|---|---|
| `npx tsc --noEmit -p web_platform` | exit 0, no output |
| `npx eslint <the 18 changed .ts/.tsx files>` (from `web_platform/`) | 0 errors, 40 warnings; the same pre-existing files had 56 warnings on the base commit `e3c8598` (`<img>`, `any`, set-state-in-effect that were already there); the 4 new files add none |
| `npm run test --workspace=web_platform` | tests 220, pass 220, fail 0 (base: 195; +25 guard tests, -2 stale cases) |
| `node scripts/verify-ui-schema.mjs` | **fails before it checks anything on this CRLF checkout**: `Migration 20261007900300_delegated_access_scope.sql failed: patch_function: pattern not found in is_provider_staff(uuid,uuid)` (its helper normalises line endings in the function body but not in its own `$from$` pattern; identical on the base commit). With an LF copy of that single file (restored afterwards, the tree is clean): `checked 89 rpc calls and 190 select strings (8 dynamic calls not checked); 0 mismatches, 0 in the baseline` |
| `npm run build --workspace=web_platform` | fails only because Turbopack rejects the `node_modules` junction (`Symlink [project]/node_modules is invalid, it points out of the filesystem root`); the integrator builds after merging |

Not run: the database suite (this package changes no SQL), `npm run typecheck:mobile` (no mobile change), a browser pass (the dev server hits the same junction
limit). Keyboard and screen-reader behaviour is therefore reasoned from the markup and from `ModalOverlay` (focus move/trap/restore, Escape, inert background), not observed.

## What the integrator must do or decide

1. **Booking calls** in `shop/[id]/page.tsx` (`getPrayerWindowsForDate`, `fetchSlots`, `handleBook`, the `create_booking` / `create_multi_service_booking` arguments) are untouched;
   apply FIX-BOOKING's prayer-window and attribution-token changes there (`fixbooking-report.md` was not in the tree when I looked). Separate hunks: my edits sit at least
   ten lines away from those blocks. The page still falls back to the centre of Riyadh for prayer times when a branch has no coordinates (`coordinates` default): FIX-BOOKING's call.
2. **R25/R26** (global locale provider, double RTL mirroring) skipped as instructed. `usePageLocale` (new `src/lib/use-page-locale.ts`) is the single-file stand-in used by
   login, become-provider and the shop page; swap it for `useLocale()` and delete it. The 1-second language polling remains on privacy, about, security, terms, discover, services and
   `category-providers.tsx`.
3. **Database needs** (no SQL written here): (a) `record_consent` must raise instead of defaulting to the literal `'v1.0'` when no `customer_terms` is published; (b)
   `get_branch_available_slots` needs a service list / combined duration argument for any-professional multi-service bookings (R24); (c) the harness migration
   `20261007900300_delegated_access_scope.sql` should normalise CRLF in its `patch_function` pattern like `20261007010400` does; (d) executing DB tests for slots, closures, leave
   and seasons (R29) belong to the database packages.
4. **Owner decisions**: the fee sentence in terms/security section 3 (20% first marketplace visit, SAR 10-40) and the mailboxes `privacy@primora.com` / `support@primora.com` are typed into page copy
   and need either confirmation (`declaredStatic[]`) or a move into the published agreements / `platform_settings`.
5. Email sign-up that needs confirmation cannot record consent (no session yet); a post-confirmation consent prompt belongs to the customer portal package (the customer settings page
   still inserts into `consents` directly, D-11's other half).

## Files touched outside the pages I own

- New shared files: `web_platform/src/lib/published-agreement.ts`, `web_platform/src/lib/use-page-locale.ts`, `web_platform/src/components/public-dialog.tsx`.
- Copy-only edits: `web_platform/src/app/categories/{barber,hair,makeup,spa}/page.tsx`, `web_platform/src/app/layout.tsx` (title and description).
- Tests: `web_platform/tests/no-mock-data.test.mjs` (+25 guard tests), `web_platform/tests/negative-authorization.test.mjs` (two stale cases deleted, one assertion updated).
- No migrations, no changes under `customer/**`, `provider/**`, `admin/**`, `mobile_app/**`, `supabase/**`.
