# UX browser check, round 2 (2026-10-17)

Reviewer: `ux-round2-claude` (ux-reviewer). Checkout `primora-fix`, branch `claude-code`, nothing committed. The app ran on
http://localhost:3100 (next dev, webpack) against the local Supabase stack. No server logic, migration or data was changed
apart from the test accounts below. I did not run `supabase db reset` and did not stop the dev server or functions serve.

## Can operators and customers do the job?

Mostly yes. Every privacy, legal-hold, incident and MFA workflow I was asked to check finished end to end in a real
browser, with a second person where the rules need one. The worst problem is on phones: the shared confirmation dialog
has no height cap. At 375 x 600 the "Clear profile details" dialog is 1,101 px tall. Its title and its confirm button
are both off-screen, the page behind it is scroll-locked, and neither the mouse wheel nor Tab brings the button into
view, so an owner cannot finish that command on a phone. The approvals decision dialog has the same fault, only smaller.
On the approvals list at 375 px, the Approve and Reject buttons start off-screen.

## How it was run

- **Browser and isolation:** headless Chromium (Playwright 1.61, already in the npx cache), one isolated browser context per
  person. I did not use the Browser pane: the user's tab is on the same origin, and signing other accounts in there would
  have replaced its session.
- **Locale and timezone:** the language was chosen through `primora_lang`, with timezone Asia/Riyadh.
- **TOTP codes:** computed with RFC 6238. For enrolment, the key came from the key the MFA page shows. For challenge and
  step-up, it came from `auth.mfa_factors` in the local DB. No secret or password is printed in any evidence file.
- **Customer one-time codes:** read from local Mailpit.
- **Accounts:** I did not sign in as `admin.owner@primora.local` and did not touch its factors. All accounts were created
  through the GoTrue admin API with the local service key:
  - eight throw-away owners, `ux2-owner-a` to `ux2-owner-h`, with the console role assigned the way `supabase/seed.sql` does it;
  - three customers, `ux2-customer-1` to `ux2-customer-3`.

  Their credentials are only in `supabase/.temp/local-admin-logins.txt` (gitignored). `ux2-customer-2` was deleted by the
  deletion flow under test.
- **Scripts and evidence:** the run scripts are in the session scratchpad. Their JSON results, screenshots and a
  timestamped run log are in `.admin-console/evidence/ux-round2/` (`run-log.txt`).

### Two things that disturbed the run

1. **Dev-server outage (external).** From about 21:43Z the dev server answered 500 on every route for about 5 minutes. It
   came back once the `/robots.txt` entry was disposed (`dev-server-500-during-run-en-1440.png`). The cause:
   - The `next-metadata-route-loader` parse error on this checkout's apostrophe path. That gap is already filed:
     `dev-server-metadata-routes-break-on-apostrophe-path`.
   - At the same time, a QA pass ran `npm run build` in the same `web_platform` directory as the running dev server
     (`.admin-console/evidence/qa-release/gate-build.log`, 00:38 +03).

   I re-ran every step that hit the outage.
2. **Console errors caused by my own test script.** The script first navigated to /login/mfa itself instead of waiting for
   the console to redirect. That aborted in-flight `/auth/v1/user` calls, which logged `TypeError: Failed to fetch`:
   - 12 in `flow-mfa.json`;
   - 4 in `flow-customer-submit.json`, from a navigation right after sign-in.

   `probe-mfa-errors.mjs` reproduced and explained it. After I fixed the script (let the app redirect; settle 2.5 s before
   any navigation), the same paths logged 0 errors (`flow-mfa-ux2-owner-g.json`, `flow-mfa-tabs.json` load and reload
   steps). These are not app defects and are not counted below.

## Results per item

| # | Item | Route | Language / width | Result | Console errors (app) |
|---|---|---|---|---|---|
| 1 | Customer "Privacy & my data" | /customer/privacy | EN 1440 (mouse), AR 375 (keyboard only), EN 375, AR 1440 sweep | **Pass, with 1 medium and 5 low findings** | 1 × 403 `auth/v1/verify` (the wrong code I typed on purpose) |
| 2 | Admin Privacy Requests: lookup, off-app logging, extension, refusal, second-owner approval | /admin/privacy, /admin/approvals | EN 1440, AR 375, EN 375 and AR 1440 sweeps | **Pass, with 2 medium and 4 low findings** | 2 × 400 (partial e-mail/phone, designed refusals), 1 × 403 (step-up asked, designed) |
| 3 | Legal holds: place, early release by a second person, renewal after 3, profile clear under an account hold | /admin/privacy?tab=holds, /admin/approvals, /admin/customers | EN 1440, AR 375 | **Pass on the rules; fail on the approver's message (English refusal in the Arabic console)** | 4 × 403 (server refusals I triggered on purpose) |
| 4 | Retention purge: dry run, real purge creates an approval | (no console screen), /admin/approvals | EN 1440, AR 375 | **Fail in the console**: there is still no entry point (open gap `retention-purge-console-entry-missing`). The server path works through the console's own client, and Approvals shows and decides it | 0 |
| 5 | Incident register: aware-at correction | /admin/incidents, /admin/approvals | EN 1440, AR 375, EN 375 and AR 1440 sweeps | **Pass, with 2 low findings** | 3 × 400 (my invalid time, then the duplicate request; designed) |
| 6 | /login/mfa enrolment for a fresh account | /login/mfa | EN 1440 (A, C, D), AR 375 keyboard only (B, E, F, G, H) | **Pass**: abandoned enrolment and a second tab no longer cause a 404 | 0 on clean runs; 1 × 404 in the stale-tab edge case (low finding) |

No uncaught exception, no React error and no failed request outside a designed refusal appeared on any route. The
completion gate says "no browser console errors on any admin route", and the designed 4xx refusals do still log
browser resource errors. They are listed in the table above.

## What I pressed and what happened

### 1. Customer privacy

`flow-customer-submit.json`, `flow-customer-track.json`; screenshots `cust-*.png`.

- **Each request type.** Access, copy, correction (last name), consent withdrawal (WhatsApp) and deletion were each
  submitted:
  - The first submission of a session opens "Confirm it is you", and focus lands on "Send the code".
  - After sending, focus moves to the code field. A 2-digit code gets the in-language "Enter the 6 digits…". The mailed
    code then sends the request.
  - Later requests within 9 minutes skip the code step.
  - The result appears as a focused `role=status` with the type and the answer date, e.g. "We received your Copy request.
    We will answer by 16 Nov 2026".
- **Deletion (AR 375, keyboard only).** Arrow keys move through the radio group and the preview appears. Submitting
  without a review choice is blocked by the browser's English "Please select one of these options.". With
  `«مستخدم محذوف»` chosen, it went through the code step and the request was received.
- **Tracking (AR 375, new session).** The list shows each request:
  - consent withdrawal "مكتمل";
  - correction "مكتمل";
  - copy "مكتمل" with Download PDF/JSON, "available until 24/10/2026";
  - access "مستلم" with the extension reason.
- **Download with a fresh code.** "Download PDF" in a password session opens the code step first, and a wrong code gives
  "الرمز غير صحيح…" with focus kept. The mailed code then downloads `primora-personal-data.pdf` (76,559 bytes, `%PDF-`).
  "Download JSON" right after needed no new code (`{"format":"primora-personal-data-copy/1"…`).
- **Correction.** The owner completed it, the customer's list shows "Completed", and the console now shows the corrected
  last name.
- **Refusal as the customer sees it** (customer 3, EN 375): "Refused" with the reason and the SDAIA complaint right.
- **Deleted customer.** After the approved deletion, signing in fails ("Invalid login credentials").

### 2. Admin Privacy Requests

`flow-admin-requests-a1/b1/a2.json`, `flow-limit.json`, `flow-stepup-lookup.json`.

- **Empty log form.** Submitting shows in-language errors on the customer and details fields, with focus on the
  customer search.
- **Lookup:**
  - `ab` gives "Type at least 3 characters" with no server call.
  - A partial e-mail and the last 6 phone digits are refused with "Type the whole e-mail address…" and "…phone number…".
  - "Maryam" finds `Maryam B.` (masked e-mail, phone ending 4978), and "نورة" finds customer 1.
  - "ux2.cust" (a name inside an e-mail) finds nothing.
  - A local-format phone (05…) and an upper-case whole e-mail match.
  - 5 server lookups gave 5 `privacy.subject_lookup` audit rows.
- **10/10-minute limit** (owner C, AR 375, keyboard): searches 1–10 return the customer. The 11th and 12th show
  "استخدمت عمليات البحث المتاحة لك (10 كل 10 دقائق). حاول مجدداً بعد ١٠:٣٩ ص. تم تنبيه الملاك.". This produced 1
  `privacy_lookup_limit_reached` alert and 2 `privacy.subject_lookup_refused` audit rows, with 0 console errors.
- **Step-up** (owner D, search 5.5 minutes after sign-in): the step-up dialog opens with focus in the code field. After
  the code, the search completes. The dialog's copy says "This action moves money, reveals bank details or changes
  access" (finding).
- **Off-app request.** A copy request for customer 3 by phone: a 5-character description gives the in-language error and
  the text is kept. The full text gives "Logged. The customer was asked to confirm it in the app.".
- **Extension.** An empty reason gives "Write at least 20 characters (0 now)." with focus on the field. A valid reason
  moves the deadline to 16 Dec 2026, "(Extended once)", and the extend form disappears. The customer sees the reason.
- **Refusal.** A 5-character reason gives an in-language error. A valid reason sets the request to "Refused". The
  customer sees the reason and the complaint right.
- **Second-owner approval:**
  - Owner A proposes the copy and the deletion; the deletion dialog lists its effects.
  - Owner B approves both on /admin/approvals at AR 375 ("تم الاعتماد والتنفيذ.").
  - The copy was built and the deletion completed with `auth_deleted`, so both requests appear under Closed for owner A.

### 3. Legal holds

`flow-holds-*.json`.

1. Owner A asks to clear customer 3's profile (typed confirmation `0a17b8f1`): "Recorded for approval…".
2. Owner A proposes a court-case hold covering Account and Bookings. An empty submit gives four in-language errors, with
   focus on the customer search.
3. Owner B approves the hold at AR 375.
4. **Approver.** On Approvals, the pending profile clear row warns in Arabic that the hold keeps the account. Pressing
   Approve is refused, but the dialog shows the server's English text: "An active legal hold (CRT-2026-0412 Riyadh
   Commercial Court) keeps this customer's account; …" (`approvals-refused-h2-ar-375.png`). Finding M2.
5. **Requester.** Owner A asks again to clear the profile and gets the localized refusal: "A legal hold keeps this
   customer's account, so the profile cannot be cleared. Nothing was changed; the hold must be released first on Privacy
   Requests."
6. The creator pressing Keep is refused after filling the dialog ("A hold is kept only by a new approver…").
7. **Renewals.** Keep by C, then B, then C gives `renewals` 1, 2, 3. Keep by B then says "جُدد هذا الحجز ٣ مرات… الطلب في
   صفحة الموافقات." On Approvals:
   - C is refused: "…only with an owner who has never proposed, approved or renewed it".
   - D approves, giving `renewals` 4.
8. **Early release.** Owner A's release says "Release requested: a second privacy approver must approve it…". A second
   click is absorbed (still 1 pending release). Owner B approves at AR 375 and the hold is `released`.

### 4. Retention purge

`flow-incident-purge-i1.json`, `-i2.json`.

- **No console entry.** The Privacy ledger tab has no purge control; its buttons are ledger download, re-apply and
  collection switch.
- **Dry run.** Called through the console's own Supabase client (`window.primoraSupabaseClient`, development build), it
  returns cutoff 2026-10-17 with 0 sub-records.
- **Real run.** It returns `pending_approval` with approval `d7a39ed1…`.
- **On Approvals (owner B, AR 375).** The line reads "تجربة بتاريخ 2026-10-17: حذف 0 سجلاً فرعياً و0 حجزاً…". I rejected it
  rather than run an irreversible purge on the shared local data.

### 5. Incident register

`flow-incident-purge-i1/i1b/i2.json`.

1. An empty create is blocked by the browser's English "Please fill out this field.". INC-2026-0002 was then created with
   72-hour clock "67.0 h left".
2. My first correction (before the discovery time) was refused: "The awareness time must be after the discovery and not
   in the future". The detail does not show the discovery time.
3. A valid correction gives "Correction requested: a second incident manager must approve it…".
4. A second request while it waits gives "…already waiting for a second person".
5. Owner B approves at AR 375 (SDAIA deadline 05:26 to 04:42, "(-0.7 ساعة)"). The detail then shows "صُحح وقت العلم في … سُجل
   أولاً …" and the clock is recalculated.

### 6. /login/mfa

`flow-mfa.json`, `flow-mfa-ux2-owner-g.json`, `flow-mfa-tabs.json`.

- **Clean enrolment.** For a fresh account, password sign-in sends the browser to /login/mfa with no help from the script.
  The enrol phase shows the QR and the key, with focus in the code field.
- **Validation.** 5 digits gives "Enter the 6 digits…" (Arabic: "أدخل الأرقام الستة…") with focus kept. The correct code
  (typed, then Enter) lands on /admin with 1 verified factor and none left unverified. 0 console errors and 0 HTTP
  failures (owners A and G).
- **Abandoned enrolment** (reload): the new key differs and there is still one factor. No 404 (owners A, B, E, H).
- **Second tab:** it replaces the first tab's factor with no 404 on load. Verifying in tab 2 lands on /admin.
- **Stale first tab (finding L10).** Typing a code in the first tab gives `POST …/factors/<old>/challenge` → 404 and
  "تعذّر التحقق من الرمز. حاول مجدداً بعد قليل." ("try again shortly"), which can never succeed.

### Viewport and dialog measurements at 375 x 600

`flow-sweep-ux2-owner-c-en-375.json`, `probe-dialog-en.json`.

| Dialog | Position | Containing-block ancestor | Rect (l, t, r, b) | Primary action visible after scrolling the dialog | Escape closes, focus back on trigger |
|---|---|---|---|---|---|
| Privacy "Add a note" | fixed | none | 16, 147, 359, 454 | yes | yes |
| Incident "Close the incident" | fixed | none | 16, 111, 359, 490 | yes | yes |
| Approvals "Reject" (profile clear) | fixed | none | 16, **−33**, 359, **634** | **no** (submit 567–609) | yes |
| Customers "Clear profile details" | fixed | none | 16, **−250**, 359, **851** | **no** (submit 786–826; wheel and Tab do not reach it) | yes |

- **Root cause.** The dialog carries `max-h-full overflow-y-auto`, but the compiled CSS has no `.max-h-full` rule.
  Computed `max-height` is `none` (`probe-css.mjs`: 12 `max-h-*` rules, none of them `-full`). The overlay is
  `overflow: visible` and `<html>`/`<body>` are `overflow: hidden`.
- **Page overflow.** No horizontal page overflow on any route at 375 in either language.
- **Approvals at 375 (AR).** The table region is 482/341 px. The first Approve button sits at x = −108…−58, and the
  request column wraps one word per line (`approvals-privacy-pending-ar-375.png`).

## Findings filed as manifest gaps

| Gap id | Severity | Summary |
|---|---|---|
| ux2-command-dialog-height-uncapped-confirm-unreachable | high | `.max-h-full` missing from the compiled CSS. CommandDialog grows past the viewport and its confirm button is unreachable at 375 x 600 (customers clear 1,101 px; approvals decide 667 px) |
| ux2-approvals-actions-offscreen-at-375 | medium | Approve/Reject start off-screen at 375; request column one word per line; reason clipped |
| ux2-arabic-console-shows-english-server-refusals | medium | Approvals and incident refusals show the server's English text in the Arabic console (held profile clear, fresh-owner renewal, aware-at validation) |
| ux2-customer-deletion-preview-latin-zero-reads-as-five | medium | The Arabic deletion and balance preview interpolates raw Latin digits; the Arabic font draws "0" as a ring that reads as ٥ (five) bookings kept/deleted |
| ux2-approvals-arabic-summaries-raw-values | low | Arabic approval summaries carry English basis/categories ("court case", "account, bookings"), Latin digits ("جُدد 3 مرات", "0 حجوزات", "(-0.7 ساعة)", "2026-10-17"); limit message "(10 كل 10 دقائق)" |
| ux2-hold-renewal-kind-label-inaccurate | low | "Renewal of a legal hold kept for over a year" is shown for a 4th renewal made minutes after placing |
| ux2-holds-pending-and-eligibility-not-shown | low | Holds list shows no renewal count or pending release/renewal; Keep offered to the creator/last renewer and Approve to an owner who renewed, all refused only after the dialog |
| ux2-incident-pending-correction-and-discovery-not-shown | low | Pending aware-at correction not shown on the incident (form still offered); discovery time never displayed though the refusal refers to it |
| ux2-native-validation-english-on-customer-privacy-and-incidents | low | Customer privacy form and incident forms use browser-native validation (English, no fix named); consent submit disabled with no explanation |
| ux2-customer-privacy-feedback-not-specific | low | Duplicate request reported as newly received; consent withdrawal "complete" when nothing was active; code step says "the request is then sent" before a download |
| ux2-console-privacy-commands-answer-done | low | Propose, extend, refuse, correction, hold and incident commands answer a bare "Done."/"Saved." |
| ux2-step-up-copy-says-money-for-lookups | low | Step-up for a customer lookup says the action "moves money, reveals bank details or changes access" |
| ux2-lookup-partial-queries-log-console-errors | low | Partial e-mail/phone searches go to the server and come back 400 (console errors); remaining searches not shown before the limit |
| ux2-mfa-stale-enrolment-tab-message | low | A stale enrolment tab answers 404 and says "try again shortly", which never works |
| ux2-login-error-english-on-arabic | low | /login shows GoTrue's "Invalid login credentials" on the Arabic page |
| ux2-operator-reason-text-not-bidi-isolated | low | Operator-written extension/refusal reasons are shown to Arabic customers without bidi isolation (punctuation lands at the wrong end) |

Already filed and seen again: `global-page-title-rule-overrides-content` (section h2s render at page-title size),
`dev-server-metadata-routes-break-on-apostrophe-path`, `retention-purge-console-entry-missing`.

`f123-screens-not-browser-verified` is closed by this pass: its new copy was exercised in a signed-in TOTP session.
`final-screens-not-browser-verified` is narrowed: the bookings cancel dialog was not in this pass's scope.

## Not covered

- Screen-reader review.
- /login/mfa at EN 375 and AR 1440.
- The bookings cancel dialog.
- The production CSS build (the missing `.max-h-full` was observed on the dev server only).
- Data volumes beyond a handful of rows. The test customers have no bookings, so every deletion preview count was 0.
