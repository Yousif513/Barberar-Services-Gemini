# Defects owned by fixpub

Extracted verbatim from the three reviews in docs/reviews/ (A = D-xx, B = Rxx, C = C-Dxx). Some ids appear in two packages because the fix has a
database part and a screen part: your task says which part is yours.

### D-17 MEDIUM: login screen is English-only with no RTL
- `web_platform/src/app/login/page.tsx` has no locale state and no `dir`; strings such as "Select portal", "Secure account access" are English (AGENTS.md section 2 forbids this).
- Fix: translation table and `dir` on the root element as in `become-provider/page.tsx:155-162`.

### D-22 MEDIUM: unbacked public claims remain on the landing, pricing, about, security and privacy pages
- Evidence in the G08 row. Nothing in the repo implements hygiene certification, a booking guarantee, escrow or PCI certification of PRIMORA itself; a hosted payment page makes the gateway, not PRIMORA, PCI-scoped. The privacy page headline "Saudi PDPL Compliance" sits over a consent/DSR flow that is partial (G13).
- Fix: remove or reword each string in both languages ("deposit paid through Tap's hosted page"); replace the guard regex with a list that includes the Arabic terms (الضمان، شهادة النظافة، متوافق، معتمد) and the English words guarantee, certified, compliant, bank-grade.

### D-23 HIGH: a "terms accepted" consent is stored for people who were never asked
- `web_platform/src/app/shop/[id]/page.tsx:1000-1007` inserts `terms_privacy granted` (`method inline_booking_modal`, version `v1.0`) after OTP; the modal at `:2171-2235` has WhatsApp and marketing boxes but no terms checkbox or link. `login/page.tsx:39-50` also pins `v1.0`, a version that is a draft in `legal_agreements` (`20261005020000...:212-216`).
- Scenario: in a dispute the platform presents a consent row for terms the customer never saw.
- Fix: add a required, linked terms/privacy checkbox to the modal, store the id of the published `legal_agreements` row (not the literal `v1.0`), and write through `record_consent`.

### D-11 HIGH: consent writes ignore errors, so a withdrawal can silently fail
- `web_platform/src/app/customer/settings/page.tsx:194-207`: `await supabase.from("consents").insert(...)` without reading `{ error }`; the toast says "updated successfully" and the toggle already moved. Same pattern in `login/page.tsx:69-72` and `shop/[id]/page.tsx:1000-1025` (supabase-js returns errors, it does not throw).
- Scenario: a user withdraws WhatsApp consent, the insert is refused, the UI shows withdrawn, messages continue (PDPL breach).
- Fix: call `record_consent` RPC, check `error`, roll back the toggle and show the message; a failed sign-up consent must block the "terms accepted" state.

**R22 [D13] Main booking flow is not keyboard or screen-reader operable.** `shop/[id]/page.tsx:1376,1445,1481` (service and specialist cards are `div onClick`), `:1692` (date input has no accessible name), `:1177-1186` (icon links without names), modals without `role="dialog"`, focus trap or Escape (`:2088-2235`; `customer/bookings/page.tsx` six modals; 16 files with `fixed inset-0`). Fix: render cards as `<button type="button" aria-pressed>`; add `htmlFor`/`aria-label`; move every modal to `ModalOverlay`/`useModalBehavior` from `web_platform/src/components/modal.tsx`; add `min` to date inputs.

**R24 [D14, D15] Slot display and any-professional duration.** `shop/[id]/page.tsx:205` formats slots with `en-US` AM/PM in Arabic; 15 hard-coded "SAR" in the page; `get_branch_available_slots` (`20261004010000_scheduling_depth.sql:481-543`) uses the first service's `base_duration_minutes` and checks only that service, so any-professional with several services lists slots `booking_create_internal` rejects. Fix: format with `ar-SA` and `Asia/Riyadh`, pass the combined duration and the service list to the RPC.

**R25 [D17, D29] No locale provider.** 24 pages run `setInterval(handleLangSync, 1000)` (customer, provider, public); 54 files own language state; `app/layout.tsx:33` always renders `lang="en" dir="ltr"`; `customer/bookings/page.tsx:135` and `provider/bookings/page.tsx:68` default to Arabic while the shop defaults to English. Fix: one `LocaleProvider` (cookie `primora_lang`, read on the server for `<html lang dir>`), one `useLocale()` hook; delete the intervals.

**R26 [D18] RTL is mirrored twice.** `provider/layout.tsx:294,331,363,380`, `customer/layout.tsx:270,304,324`, calendar and others use `isRTL ? "flex-row-reverse" : "flex-row"` while `document.documentElement.dir = "rtl"` is set (CSS: `row-reverse` under `dir=rtl` reads left-to-right; no override in `app/globals.css`). Reasoned from CSS semantics, not rendered. Fix: remove the conditional reversals and use logical utilities (`ps-`, `pe-`, `text-start`, `rtl:rotate-180` for arrows).

**R34 [D46, D47] Public claims contradict the system.** `web_platform/src/app/become-provider/page.tsx:31,94` (15% commission; real rule is 20% with 10-40 SAR on a first marketplace visit, 0% otherwise) and Growth features nothing gates; `app/page.tsx:49,60` and `about/page.tsx:16-17` ("Top 1% Vetted", "passes verified identity checks, portfolio evaluations"). Fix: derive pricing text from `fee_rules` and `subscription_plans`; remove the vetting claims.

**R35 [G29] `/services` filters in the browser and truncates ratings.** `web_platform/src/app/services/page.tsx:442-454,563-607` downloads all services, providers and all reviews (1,000-row cap, ratings become wrong beyond it), plain `includes` search. Fix: use `search_marketplace_providers` with paging; remove the `reviews` select.

**R29 [D27, D45] Tests do not prove screens or removed functions.** `web_platform/tests/negative-authorization.test.mjs:714-726` (`verify_provider_cr`) and `:933-944` (`enqueue_post_visit_rebook`, `post_visit_review_rebook`) assert text of functions later migrations removed; the `get_branch_available_slots`, closure, leave and season behaviours are never executed. Fix: delete the stale cases; add executing tests (complete a booking and read `message_queue`; list branch slots as anon; closures, leave, seasonal overnight). See R44.

**D25. Shop page is not keyboard or screen-reader operable.** `shop/[id]/page.tsx` (2,240 lines) has zero `role="dialog"`,
zero `aria-label`, zero `tabIndex`/`onKeyDown`; services and specialists are `div onClick` (`:1376-1383,1445-1525`), modal close
buttons are the bare character "x", labels are not associated with inputs. A keyboard user cannot pick a specialist and so
cannot book. Fix: use `<button>`/radio inputs for cards, `role="dialog" aria-modal="true" aria-labelledby`, focus trap and Escape
(the admin shared dialog already implements this), `aria-label` on icon buttons.
