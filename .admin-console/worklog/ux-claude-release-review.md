# worklog ux-claude-release-review
role: ux-reviewer
mode: audit (review of repair work)    profile: regulated
started: 2026-10-04    ended: 2026-10-06

claims-held: none. No capability was claimed: `claim` sets capabilities[].owner to the claimer, which the
reviewer-identity rule compares against reviewedBy, and its exclusive lock would have blocked the parallel
security pass from the same capabilities (see feedback ux-claim-collides-with-reviewer-identity-and-parallel-review).
claims-released: n/a

Review of: admin-dashboard, admin-refunds, admin-audit-logs, admin-settings, admin-taxes, admin-bookings,
admin-customers, admin-reports, admin-employees, admin-providers, plus the admin, provider and customer shells and
globals.css. Source was read fresh from disk (files kept changing during the pass: layout, dashboard, refunds,
customers, reports, employees and provider-management were all rewritten or edited after I began, and the
findings cite the lines as of the final verification at 06:15 on 2026-10-06).

## How the screens were exercised
Real browser (Browser pane) against an isolated copy of web_platform (scratchpad `ux-app`, `node_modules` junctioned),
NEXT_PUBLIC_SUPABASE_URL pointed at a verification-only API I wrote (scratchpad `ux-mock-supabase.mjs`, never shipped,
never the hosted project). Dev role admin / provider_owner / customer. Production-shaped data: 1,150 customers, 1,420
bookings in every status, 63 refunds in every state, 230 audit rows (many with equal timestamps), 38 providers (long
EN/AR names, nulls), 109 employees, 4 data requests (one overdue), 300-25,000 ledger rows, long Arabic names, a cell
beginning `=HYPERLINK(`. The mock can force 403, 500, a dropped connection, slow replies and empty tables per resource,
so every state below was reached, not assumed. Helper scripts in the same folder: `ux-audit.js` (accessible-name,
duplicate-name, landmark, table, focus-indicator sweeps), `ux-contrast.js` (composited text contrast),
`ux_lines.py` (evidence line resolver), `ux_gaps.py` (the gap batch).

## did
- Registered ux-claude-release-review; filed 32 gaps (below); set `states`, `accessibilityStatus` (in-progress: checked,
  defects open) on the 10 screens; set `responsive` true on settings, taxes, customers, reports and false on providers;
  No capability reviewStatus changed by me (customer.clear-profile was already `contested`; my gap
  clear-profile-irreversible-behind-generic-prompt supports it). No application or server file touched.

## verified (runtime unless marked code)
- 1280 px and 375 px in English and Arabic (RTL mirrors correctly everywhere; sidebar, columns, drawers); 24 tab stops
  precede content; focus indicators on every control of every screen by keyboard modality; accessible names and duplicate
  names; contrast sweep; forced loading/500/403/empty on dashboard, refunds, audit log, settings, bookings; 500/403/empty/
  filtered-empty/paging on customers, employees, audit log, refunds; commands with stubbed prompts (refund retry, booking
  cancel, customer clear-profile, provider status, application approve/reject, settings save, report exports incl. CSV
  content, audit-before-delivery, empty/too-long/inverted period); dialogs (focus, Escape, roles); invoice overlay at 600 px
  height and at 375x812; Providers filter bar at 375 px both locales; shells at 375 px.
- Holds up: dashboard (honest per-section failures, SAR-only, Riyadh note, RTL), refunds failure messages, audit log
  filters/expansion, Settings server rejection keeps input, report exports (formula cells neutralised, no file when the
  audit call fails), customers search/paging/DSR queue, employees directory, provider edit keeps input on failure.

## could not verify
Hosted data/RLS/real roles (hosted project unreachable; dev roles only); native `window.prompt` dialogs (stubbed to read
their text; the real dialog UX and "prevent additional dialogs" were reasoned, not exercised); screen-reader speech
(roles/names inspected via DOM, no AT run); the 20,000-row export refusal and the 409 'skipped' refund outcome (code only);
loading states of taxes, customers, employees, providers (code only); settings with zero rows; the unchanged
reviews/packages/disputes/ledger/integrations/coupons/services/branches screens (out of scope); Hijri date display
(this Chrome renders ar-SA as Gregorian, other browsers may differ).

## found (32 gaps)
high: clear-profile-irreversible-behind-generic-prompt, invoice-qr-sent-to-third-party-service
medium: modal-surfaces-lack-focus-management, admin-phone-drawer-not-keyboard-operable, focus-lost-after-commands-and-paging,
command-results-render-out-of-view, reason-prompts-do-not-name-target-or-impact, reopen-stuck-refund-prompt-asserts-unverified-gateway-safety,
row-action-names-not-unique, forbidden-state-not-distinct-from-outage, input-focus-indicators-missing-or-too-faint,
paginated-sorts-not-total-ties-skip-audit-rows, filters-tabs-and-drilldowns-not-in-url, providers-filter-bar-clipped-at-phone-width,
invoice-panel-clipped-by-global-card-skin, taxes-literals-presented-as-server-facts, reports-month-buckets-follow-database-time-not-riyadh,
admin-shell-has-no-language-switch, shells-show-invented-signals-and-dead-search, sign-out-is-global-and-failure-is-silent,
filter-and-form-validation-feedback-weak, locale-time-and-currency-formatting-inconsistent, fixtures-too-tidy-for-state-coverage
low: customers-tab-pattern-half-implemented, document-titles-and-heading-structure-weak, wide-tables-hide-status-and-actions-at-phone-width,
kpi-tiles-without-definition-window-or-drilldown, employees-provider-filter-swallows-load-failure, sidebar-labels-promise-more-than-screens-do,
low-contrast-status-text-and-micro-typography, data-request-rows-do-not-link-to-the-customer-record, bookings-load-error-plain-div-without-alert-or-retry
Routed to security: invoice-qr-sent-to-third-party-service, sign-out-is-global-and-failure-is-silent (data exposure / sessions).
Not duplicated here because already filed: global-page-title-rule-overrides-content (measured effect is wider than titles: every <p>
inside a page root renders 14.8 px #667085 !important, e.g. the 9 px bookings IDs), no-pagination-or-server-side-filtering (bookings
still lists the newest 500 only), clear-profile-action-was-not-reachable (fixed).

## decided
- No reviewStatus set to `reviewed` anywhere: every reviewed screen still has open findings, so reviewed=0 and I contested nothing
  newly (customer.clear-profile already stood `contested`).
- Reported `states` only for what I reached at runtime; code-only states are listed above, and `forbidden` is removed everywhere
  because 403 is indistinguishable from an outage (gap forbidden-state-not-distinct-from-outage).
- Static data caveat: the fixtures gap's REMEDY refers to this log: copy the mock's generators (customers, bookings, refunds,
  audit rows with equal timestamps, long Arabic names) into a repo script outside the release path.

## next
Implementer pass in this order: (1) clear-profile and every reason prompt -> one shared accessible command dialog with the target
named and a typed confirmation (gaps clear-profile..., reason-prompts..., reopen-stuck..., modal-surfaces...), (2) remove the
third-party QR host and the invoice clipping, (3) providers filter bar and focus indicators, (4) forbidden state and URL state.
Then a UX re-review of the same ten screens against a volume fixture, then qa.

## blocked-on
none. Security should rate the two routed gaps; the owner decides whether console operators may sign out globally.
