# Defects owned by fixprov

Extracted verbatim from the three reviews in docs/reviews/ (A = D-xx, B = Rxx, C = C-Dxx). Some ids appear in two packages because the fix has a
database part and a screen part: your task says which part is yours.

### D-09 HIGH: the QR code on the provider dashboard is not a QR code
- `web_platform/src/app/provider/dashboard/page.tsx:621-648` is hand-placed rectangles ("QR sample data blocks"). Only the print popup (`:654-657`) uses a third-party image (`api.qrserver.com`) and writes the unescaped business name into the popup HTML.
- Fix: generate a real QR in-browser (small MIT library, or the `toqr` already in the lockfile through Expo) and render it as SVG; escape the name; remove the third-party call.

### D-27 HIGH: providers cannot configure their cancellation / no-show policy
- No UI writes `free_cancellation_hours`, `late_cancellation_fee_percent` or `no_show_fee_percent` (grep); `web_platform/src/app/provider/settings/page.tsx:363-382` saves only the deposit. The dashboard checklist step "Policy" is hard-coded complete (`provider/dashboard/page.tsx:285`, `:162`). Every shop therefore advertises and enforces 24 h / 50% / 100% (the migration defaults, `20261003220000...:249-253`), which is the G10 requirement for a *per-provider* policy unmet.
- Fix: add a "Booking policy" card to provider settings that calls a `set_provider_booking_policy(p_provider_id, hours, late_pct, no_show_pct, deposit_pct)` SECURITY DEFINER function with the bounds from D-08; drive the checklist from `policy_confirmed_at IS NOT NULL`.

### D-28 LOW: setup checklist and dashboard show invented defaults
- `provider/dashboard/page.tsx:140` (`"Elite Barbershop"`), `:148` avatar "EB", `:158-164` (`hasHours: true, servicesCount: 3, staffCount: 4, hasPolicy: true`), `:282` (`hasHours = branchIds.length > 0`), `:377-382` slug fallback `elite-barbershop`, `:390` "link shared" kept in memory only. A provider with no data sees 3 services and 4 staff ticked; the share link falls back to a shop that does not exist.
- Fix: initial state all false/empty, derive each step from real counts (working-hours rows, services, employees, policy confirmed, share-click stored server-side); never build a link without `providerId`.

### D-22 MEDIUM: unbacked public claims remain on the landing, pricing, about, security and privacy pages
- Evidence in the G08 row. Nothing in the repo implements hygiene certification, a booking guarantee, escrow or PCI certification of PRIMORA itself; a hosted payment page makes the gateway, not PRIMORA, PCI-scoped. The privacy page headline "Saudi PDPL Compliance" sits over a consent/DSR flow that is partial (G13).
- Fix: remove or reword each string in both languages ("deposit paid through Tap's hosted page"); replace the guard regex with a list that includes the Arabic terms (الضمان، شهادة النظافة، متوافق، معتمد) and the English words guarantee, certified, compliant, bank-grade.

**R4 [D43] Provider calendar "reschedule by drag and drop" is client-state only.**
Where: `web_platform/src/app/provider/calendar/page.tsx:1108-1124` (`onDrop` calls only `setAppointments`, label "Rescheduled").
Scenario: the owner drags the 15:00 customer to 17:00, sees "Rescheduled"; after a reload the booking is at 15:00 and the customer was never told.
Fix: on drop call `reschedule_booking(target_booking_id, new_scheduled_at, reschedule_reason)`, update state only on success, restore and show the error otherwise; add a keyboard "Move to..." control in the details modal (drag is mouse-only).

**R8 [D44] A provider with no staff sees three invented employees and four invented services.**
Where: `web_platform/src/app/provider/employees/page.tsx:709-756` (`demoServiceOptions`, `demoStaffMembers`, ids `demo-*`, used when `liveStaffMembers` is empty).
Scenario: a new owner's team page shows Omar Khaled, Yousef Adel, Karim Saad and prices 45/30/80/90; edits against `demo-*` ids fail.
Fix: delete both constants, render an empty state with "Add your first professional"; extend `no-mock-data.test.mjs` to `app/provider/**`.

**R9 [D34] Provider promo codes can never be redeemed.**
Where: `web_platform/src/app/provider/promotions/page.tsx:142,187` writes `provider_promos`; no function reads that table (grep of effective definitions); checkout uses `promotional_codes` (`booking_create_internal`, `validate_and_apply_coupon`). `target_segment` is never enforced.
Scenario: a provider publishes `EID20` to clients; every attempt answers "not valid for this booking".
Fix: create the code in `promotional_codes` (provider_id set, funding_source `provider`) through an owner-only RPC and drop `provider_promos`, or make `booking_create_internal` read it; enforce `target_segment` (new clients) with `is_first_visit`.

**R16 [D7, D50] G22 has no UI, and the hours form cannot express or protect schedules.**
Where: no screen references `provider_closures`, `employee_time_off`, `seasonal_schedules` (grep web+mobile = 0). `web_platform/src/app/provider/settings/page.tsx:414-416` rejects `open >= close` (an overnight Ramadan shift 21:00-02:00 cannot be saved though the engine supports it); `:419-427` upserts the same hours into every active employee, overwriting individual schedules.
Scenario: an owner cannot close for Eid or add a Ramadan season; saving "business hours" silently replaces each professional's own shifts.
Fix: add screens (owner: closures and seasons; employee: leave requests; owner: approval) using the existing tables and RLS; allow `close <= open` as overnight; make the hours form per professional or apply only to staff without custom shifts, with a confirmation that lists what will change.

**R18 [D22] A `provider_employee` account cannot use the provider portal.**
Where: `web_platform/src/components/auth-guard.tsx:14` sends employees to `/provider/dashboard`; all 16 provider screens and `provider/layout.tsx:225` look up the business by `providers.owner_id = auth.uid()`.
Scenario: a stylist signs in and sees empty pages and no business name; RLS would allow their own bookings but no screen asks.
Fix: add an RPC `my_provider_context()` (resolving the business through `provider_memberships`/`employees.profile_id`) and use it in the layout and every screen instead of `owner_id`; build `/provider/my-day` (today's bookings for `employees.profile_id = auth.uid()`, check-in / complete / no-show through `employee_update_booking_status`, own earnings from `employee_earnings_summary`); hide owner-only navigation for employees.

**R27 [D50-part] Provider dashboard numbers and share kit.** `provider/dashboard/page.tsx:278` "Walk-ins" = non-home bookings; `:236` unbounded bookings select (1,000-row cap) summed in the browser; `:162,226,285` `hasPolicy: true` hard-coded; `:377-382,395` fall back to the slug `elite-barbershop`; `:621-648` the "QR" is a hand-drawn SVG that cannot be scanned; `:656` print window loads `api.qrserver.com` and writes `businessName` into `document.write`. Fix: server-side aggregates (`source = 'walk_in'`), derive the checklist from rows, hide the share kit until the provider id exists, draw the QR locally (dependency decision: `toqr` already in the lockfile) and escape the name.

**R36 [G35] CSV import robustness.** `web_platform/src/app/provider/customers/page.tsx:139-196` and `import_provider_clients`: accept a file, parse quotes, skip a header row, normalize `966...`/`00966...`/Arabic-Indic digits, reject rows without a phone, translate "CSV Data (Name, Phone, Notes)" and the two error strings.

**R50 [G42, G43] Delivery surfaces are missing.** `web_platform/src/app/provider/employees/page.tsx` edits only `photo_url` (`:560`); no screen edits `bio_en/ar`, `years_of_experience`, `specialties`, `instagram_handle` or `employee_portfolios`, and the shop page never shows the bio or portfolio; nothing sends the monthly "PRIMORA brought you" message. Fix: add the profile fields and a consented-photo uploader to the employee form and a portfolio section to the specialist card; add a monthly job that enqueues a `provider_monthly_summary` template to the owner (consent permitting).

**R34 [D46, D47] Public claims contradict the system.** `web_platform/src/app/become-provider/page.tsx:31,94` (15% commission; real rule is 20% with 10-40 SAR on a first marketplace visit, 0% otherwise) and Growth features nothing gates; `app/page.tsx:49,60` and `about/page.tsx:16-17` ("Top 1% Vetted", "passes verified identity checks, portfolio evaluations"). Fix: derive pricing text from `fee_rules` and `subscription_plans`; remove the vetting claims.

**D13. WPS payroll export is wrong and over-claimed.** `provider/reports/page.tsx:352-366`: `emp.role` is undefined (field
is `title_en`), unconfigured staff print `null`, names are not CSV-escaped and `encodeURI` of a data URI breaks on `#`;
the label claims Mudad/WPS compliance. No screen authors `employee_commission_rules`. Fix: build the CSV with the shared
escaper in `web_platform/src/lib/csv.mjs`, use a Blob download, skip or flag unconfigured staff, rename to "Payroll
summary (not a WPS file)" until the bank layout is implemented, and add a rules editor on `provider/employees`.

**D15. Walk-in screen.** See G53: new names cannot be typed when any customer exists, phone never sent, notes discarded,
"cash" hard-coded, English-only "Walk-in Customer". Fix: always render the text input plus an optional customer
`<select>`; send `p_customer_phone`; add `p_notes` and `p_payment_method` parameters to `create_walk_in_booking`
(validate against `payment_methods`); select `walk_in_name` and use a translated fallback.

**D26. Coupon and block writes lack safeguards.** `admin/coupons/page.tsx:187-208` writes the table directly with no reason;
`provider/customers/page.tsx:120-125` blocks with one click and a constant reason. Fix: `admin_save_promo_code(...)` and a
block dialog with required reason, both audited by command.

**D28 (P3).** Native `window.confirm`/`window.prompt` for receive, cancel and stock changes
(`provider/inventory/page.tsx:492-496`, `inventory-controls.tsx:61`); every failed write shows the generic `saveFailed`
(`page.tsx:403-406,448-451,482-485,509-513`) instead of the server's reason; Arabic mode shows English DB messages;
no forbidden state (`ForbiddenNotice` is not used on P3 screens); permission `fieldset` without `<legend>`
(`provider/chain/page.tsx`); low-stock metric uses `on_hand - reserved` (`page.tsx:244-248`) while the row flag ignores reserved
(`:731`). Fix: use the shared admin dialog, surface `error.message` through a translation map, add the legend.
