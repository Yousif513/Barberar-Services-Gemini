# Surface Audit

**Verdict:** FAIL

**Coverage: 0/41 (0.0%)**

| Kind | Planned | Generated |
|---|---:|---:|
| command-palette | 1 | 0 |
| drawer | 1 | 0 |
| modal | 3 | 0 |
| page | 7 | 0 |
| popover | 11 | 0 |
| state | 15 | 0 |
| toast | 3 | 0 |

| Check | Result |
|---|---|
| completeness | ✓ pass |
| references | ✗ 392 finding(s) |
| consistency | skipped — skipped |
| components | skipped — no component_census.json in out-dir |
| assets | skipped — no asset_manifest.json in out-dir |
| image evidence | ✓ pass |
| quality | ✗ 5 finding(s) |

**Output closure: ⚠ 1067 unplanned** — 1068 interactive elements found in generated artifacts.

## Missing — planned but not generated

- `page` **Account sign-in** (`account-sign-in`)
- `popover` **Date range** (`account-sign-in-popover-date-range`)
- `popover` **Widget menu** (`account-sign-in-popover-widget-actions`)
- `state` **Account sign-in — loading** (`account-sign-in-state-loading`)
- `state` **Account sign-in — error** (`account-sign-in-state-error`)
- `state` **Account sign-in — empty** (`account-sign-in-state-empty`)
- `page` **Customer profile** (`customer-profile`)
- `popover` **Date range** (`customer-profile-popover-date-range`)
- `popover` **Widget menu** (`customer-profile-popover-widget-actions`)
- `state` **Customer profile — loading** (`customer-profile-state-loading`)
- `state` **Customer profile — error** (`customer-profile-state-error`)
- `state` **Customer profile — empty** (`customer-profile-state-empty`)
- `page` **Salon application** (`salon-application`)
- `popover` **Date range** (`salon-application-popover-date-range`)
- `popover` **Widget menu** (`salon-application-popover-widget-actions`)
- `state` **Salon application — loading** (`salon-application-state-loading`)
- `state` **Salon application — error** (`salon-application-state-error`)
- `state` **Salon application — empty** (`salon-application-state-empty`)
- `page` **Salon booking** (`salon-booking`)
- `popover` **Date range** (`salon-booking-popover-date-range`)
- `popover` **Widget menu** (`salon-booking-popover-widget-actions`)
- `state` **Salon booking — loading** (`salon-booking-state-loading`)
- `state` **Salon booking — error** (`salon-booking-state-error`)
- `state` **Salon booking — empty** (`salon-booking-state-empty`)
- `page` **Profile** (`profile`)
- `popover` **Date range** (`profile-popover-date-range`)
- `popover` **Widget menu** (`profile-popover-widget-actions`)
- `page` **Settings** (`settings`)
- `modal` **Danger zone action** (`settings-modal-destructive-confirm`)
- `page` **Notifications** (`settings-notifications`)
- `modal` **Danger zone action** (`settings-notifications-modal-destructive-confirm`)
- `popover` **User menu** (`shared-popover-user-menu`)
- `drawer` **Notifications** (`shared-drawer-notifications`)
- `state` **Notifications — empty** (`shared-drawer-notifications-state-empty`)
- `state` **Notifications — loading** (`shared-drawer-notifications-state-loading`)
- `command-palette` **Search** (`shared-command-palette-global-search`)
- `state` **Search — no-results** (`shared-command-palette-global-search-state-no-results`)
- `toast` **Mark all read** (`shared-toast-success`)
- `toast` **Error** (`shared-toast-error`)
- `modal` **Confirm password** (`shared-modal-reauthenticate`)
- `toast` **Undo** (`shared-toast-info`)

## Broken asset references

These point at files that are not on disk — they render as holes.

- `/_next/static/chunks/%5Broot-of-the-server%5D__1e7rvoz._.css`  _(in browser-detail-en.html)_
- `/_next/static/chunks/%5Bturbopack%5D_browser_dev_hmr-client_hmr-client_ts_1di75ot._.js`  _(in browser-detail-en.html)_
- `/_next/static/chunks/node_modules_next_dist_compiled_next-devtools_index_090k2jm.js`  _(in browser-detail-en.html)_
- `/_next/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js`  _(in browser-detail-en.html)_
- `/_next/static/chunks/node_modules_next_dist_compiled_react-server-dom-turbopack_164kp-6._.js`  _(in browser-detail-en.html)_
- `/_next/static/chunks/node_modules_next_dist_compiled_1amofcm._.js`  _(in browser-detail-en.html)_
- `/_next/static/chunks/node_modules_next_dist_client_0_90u2t._.js`  _(in browser-detail-en.html)_
- `/_next/static/chunks/node_modules_next_dist_1e8vcs8._.js`  _(in browser-detail-en.html)_
- `/_next/static/chunks/node_modules_%40swc_helpers_cjs_1r9vbqw._.js`  _(in browser-detail-en.html)_
- `/_next/static/chunks/web_platform_1anvha4._.js`  _(in browser-detail-en.html)_
- `/_next/static/chunks/turbopack-web_platform_08bm286._.js`  _(in browser-detail-en.html)_
- `/_next/static/chunks/web_platform_1vp25kt._.js`  _(in browser-detail-en.html)_
- `/_next/static/chunks/_18csebl._.js`  _(in browser-detail-en.html)_
- `/_next/static/chunks/web_platform_src_1rcgfzk._.js`  _(in browser-detail-en.html)_
- `/_next/static/chunks/node_modules_1hxqwvo._.js`  _(in browser-detail-en.html)_
- `/_next/static/chunks/web_platform_src_0cxk0w8._.js`  _(in browser-detail-en.html)_
- `/favicon.ico?favicon.2vob68tjqpejf.ico`  _(in browser-detail-en.html)_
- `/_next/static/chunks/node_modules_next_dist_build_polyfills_polyfill-nomodule.js`  _(in browser-detail-en.html)_
- `/_next/static/chunks/%5Bturbopack%5D_browser_dev_hmr-client_hmr-client_ts_1mojsay._.js`  _(in browser-detail-en.html)_
- `/_next/static/media/280fac012b00b901-s.p.3ihiqn4pviisd.woff2`  _(in browser-detail-en.html)_
- `/_next/static/media/3347fc7792f0b5ea-s.p.0c7ha31nuacbu.woff2`  _(in browser-detail-en.html)_
- `/_next/static/media/441492499fc86682-s.p.1fbvi_fot8u4l.woff2`  _(in browser-detail-en.html)_
- `/_next/static/media/5ad8fdb5805e9b4a-s.p.0-uv4l43gdmt7.woff2`  _(in browser-detail-en.html)_
- `/_next/static/media/5d6231e6818a3930-s.p.2vs72h_x6qrve.woff2`  _(in browser-detail-en.html)_
- `/_next/static/media/84cd8d504984ae62-s.p.0iritm8hg8q1a.woff2`  _(in browser-detail-en.html)_
- `/_next/static/media/c9a0d344f313d307-s.p.3ik2qu-u9tgho.woff2`  _(in browser-detail-en.html)_
- `/_next/static/media/ceec3e50f42c26e3-s.p.0da8nscnv1nkd.woff2`  _(in browser-detail-en.html)_
- `/_next/static/chunks/%5Bturbopack%5D_browser_dev_hmr-client_hmr-client_ts_1di75ot._.js`  _(in browser-detail-en.html)_
- `/_next/static/chunks/%5Broot-of-the-server%5D__1e7rvoz._.css`  _(in browser-detail-no-longer-held-en.html)_
- `/_next/static/chunks/%5Bturbopack%5D_browser_dev_hmr-client_hmr-client_ts_1di75ot._.js`  _(in browser-detail-no-longer-held-en.html)_
- `/_next/static/chunks/node_modules_next_dist_compiled_next-devtools_index_090k2jm.js`  _(in browser-detail-no-longer-held-en.html)_
- `/_next/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js`  _(in browser-detail-no-longer-held-en.html)_
- `/_next/static/chunks/node_modules_next_dist_compiled_react-server-dom-turbopack_164kp-6._.js`  _(in browser-detail-no-longer-held-en.html)_
- `/_next/static/chunks/node_modules_next_dist_compiled_1amofcm._.js`  _(in browser-detail-no-longer-held-en.html)_
- `/_next/static/chunks/node_modules_next_dist_client_0_90u2t._.js`  _(in browser-detail-no-longer-held-en.html)_
- `/_next/static/chunks/node_modules_next_dist_1e8vcs8._.js`  _(in browser-detail-no-longer-held-en.html)_
- `/_next/static/chunks/node_modules_%40swc_helpers_cjs_1r9vbqw._.js`  _(in browser-detail-no-longer-held-en.html)_
- `/_next/static/chunks/web_platform_1anvha4._.js`  _(in browser-detail-no-longer-held-en.html)_
- `/_next/static/chunks/turbopack-web_platform_08bm286._.js`  _(in browser-detail-no-longer-held-en.html)_
- `/_next/static/chunks/web_platform_1vp25kt._.js`  _(in browser-detail-no-longer-held-en.html)_

## Unplanned controls in generated output

The generator rendered these; nothing in the plan backs them. Either add them to the plan and regenerate, or tighten the prompt.

- link “PRIMORA” → `/`  _(in browser-detail-en.html)_
- link “Dashboard” → `/admin`  _(in browser-detail-en.html)_
- link “Bookings” → `/admin/bookings`  _(in browser-detail-en.html)_
- link “Services” → `/admin/services`  _(in browser-detail-en.html)_
- link “Packages” → `/admin/packages`  _(in browser-detail-en.html)_
- link “Disputes” → `/admin/disputes`  _(in browser-detail-en.html)_
- link “Approvals” → `/admin/approvals`  _(in browser-detail-en.html)_
- link “Ledger & Splits” → `/admin/ledger`  _(in browser-detail-en.html)_
- link “Refunds” → `/admin/refunds`  _(in browser-detail-en.html)_
- link “Tap Reconciliation” → `/admin/reconciliation`  _(in browser-detail-en.html)_
- link “Held checkouts” → `/admin/reconciliation/checkouts`  _(in browser-detail-en.html)_
- link “Reports” → `/admin/reports`  _(in browser-detail-en.html)_
- link “Staff & Teams” → `/admin/employees`  _(in browser-detail-en.html)_
- link “Venues & Rooms” → `/admin/branches`  _(in browser-detail-en.html)_
- link “Supply Oversight” → `/admin/supply`  _(in browser-detail-en.html)_
- link “WhatsApp Receptionist” → `/admin/whatsapp`  _(in browser-detail-en.html)_
- link “Sponsored placement” → `/admin/sponsored`  _(in browser-detail-en.html)_
- link “Taxes & Fees” → `/admin/taxes`  _(in browser-detail-en.html)_
- link “Coupons & Offers” → `/admin/coupons`  _(in browser-detail-en.html)_
- link “Roles & Permissions” → `/admin/roles`  _(in browser-detail-en.html)_
- link “Platform Rules” → `/admin/platform-rules`  _(in browser-detail-en.html)_
- link “Processing Register” → `/admin/ropa`  _(in browser-detail-en.html)_
- link “Activity Feed” → `/admin/activity`  _(in browser-detail-en.html)_
- link “API & Integrations” → `/admin/integrations`  _(in browser-detail-en.html)_
- link “Settings” → `/admin/settings`  _(in browser-detail-en.html)_
- link “Need Help? Help Center” → `/admin/help`  _(in browser-detail-en.html)_
- button “العربية”  _(in browser-detail-en.html)_
- button “Apply filters”  _(in browser-detail-en.html)_
- button “Clear filters”  _(in browser-detail-en.html)_
- button “Refresh queue”  _(in browser-detail-en.html)_
- button “Details”  _(in browser-detail-en.html)_

## Artifacts with no plan entry

- `browser-detail-en`
- `browser-detail-no-longer-held-en`
- `browser-empty-en`
- `browser-filtered-empty-en`
- `browser-final-en`
- `browser-forbidden-en`
- `browser-harness-console-classification-observation`
- `browser-harness-label-selector-failure`
- `browser-mobile-ar-header`
- `browser-mobile-ar-scrolled`
- `browser-mobile-en-header`
- `browser-mobile-en-scrolled`
- `browser-populated-en`
- `browser-shrinking-page-en`
- `plan`

## Quality findings (design_lint)

- `viewport-meta` (error) — missing viewport meta tag  _(in .admin-console\evidence\held-checkout-queue\planner\plan.html)_
- `landmarks` (warning) — no <main> landmark — screen readers get no way past the chrome  _(in .admin-console\evidence\held-checkout-queue\planner\plan.html)_
- `input-label` (error) — <input> has no label, aria-label, or aria-labelledby  _(in .admin-console\evidence\held-checkout-queue\planner\plan.html)_
- `body-font-size` (warning) — font-size 10px is below the 11px legibility floor  _(in .admin-console\evidence\held-checkout-queue\planner\plan.html)_
- `outline-none` (error) — outline:none with no :focus-visible replacement removes the focus ring  _(in .admin-console\evidence\held-checkout-queue\planner\plan.html)_
