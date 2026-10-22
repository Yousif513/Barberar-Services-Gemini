# Surface Audit

**Verdict:** FAIL

**Coverage: 4/4 (100.0%)**

| Kind | Planned | Generated |
|---|---:|---:|
| modal | 3 | 3 |
| page | 1 | 1 |

| Check | Result |
|---|---|
| completeness | ✓ pass |
| references | ✗ 108 finding(s) |
| consistency | skipped — skipped |
| components | skipped — no component_census.json in out-dir |
| assets | skipped — no asset_manifest.json in out-dir |
| image evidence | ✗ 4 finding(s) |
| quality | ✓ pass |

**Output closure: ⚠ 37 unplanned** — 40 interactive elements found in generated artifacts.

## Broken asset references

These point at files that are not on disk — they render as holes.

- `/_next/static/chunks/%5Broot-of-the-server%5D__1e7rvoz._.css`  _(in confirm-case.html)_
- `/_next/static/chunks/web_platform_src_components_customer-pilot_pilot_20bdeop.css`  _(in confirm-case.html)_
- `/_next/static/chunks/%5Bturbopack%5D_browser_dev_hmr-client_hmr-client_ts_1di75ot._.js`  _(in confirm-case.html)_
- `/_next/static/chunks/node_modules_next_dist_compiled_next-devtools_index_090k2jm.js`  _(in confirm-case.html)_
- `/_next/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js`  _(in confirm-case.html)_
- `/_next/static/chunks/node_modules_next_dist_compiled_react-server-dom-turbopack_164kp-6._.js`  _(in confirm-case.html)_
- `/_next/static/chunks/node_modules_next_dist_compiled_1amofcm._.js`  _(in confirm-case.html)_
- `/_next/static/chunks/node_modules_next_dist_client_0_90u2t._.js`  _(in confirm-case.html)_
- `/_next/static/chunks/node_modules_next_dist_1e8vcs8._.js`  _(in confirm-case.html)_
- `/_next/static/chunks/node_modules_%40swc_helpers_cjs_1r9vbqw._.js`  _(in confirm-case.html)_
- `/_next/static/chunks/web_platform_1anvha4._.js`  _(in confirm-case.html)_
- `/_next/static/chunks/turbopack-web_platform_08bm286._.js`  _(in confirm-case.html)_
- `/_next/static/chunks/web_platform_11nvzzh._.js`  _(in confirm-case.html)_
- `/_next/static/chunks/_18csebl._.js`  _(in confirm-case.html)_
- `/_next/static/chunks/web_platform_src_1f1bokw._.js`  _(in confirm-case.html)_
- `/favicon.ico?favicon.2vob68tjqpejf.ico`  _(in confirm-case.html)_
- `/_next/static/chunks/node_modules_next_dist_build_polyfills_polyfill-nomodule.js`  _(in confirm-case.html)_
- `/_next/static/chunks/%5Bturbopack%5D_browser_dev_hmr-client_hmr-client_ts_1mojsay._.js`  _(in confirm-case.html)_
- `/_next/static/media/280fac012b00b901-s.p.3ihiqn4pviisd.woff2`  _(in confirm-case.html)_
- `/_next/static/media/3347fc7792f0b5ea-s.p.0c7ha31nuacbu.woff2`  _(in confirm-case.html)_
- `/_next/static/media/441492499fc86682-s.p.1fbvi_fot8u4l.woff2`  _(in confirm-case.html)_
- `/_next/static/media/5ad8fdb5805e9b4a-s.p.0-uv4l43gdmt7.woff2`  _(in confirm-case.html)_
- `/_next/static/media/5d6231e6818a3930-s.p.2vs72h_x6qrve.woff2`  _(in confirm-case.html)_
- `/_next/static/media/84cd8d504984ae62-s.p.0iritm8hg8q1a.woff2`  _(in confirm-case.html)_
- `/_next/static/media/c9a0d344f313d307-s.p.3ik2qu-u9tgho.woff2`  _(in confirm-case.html)_
- `/_next/static/media/ceec3e50f42c26e3-s.p.0da8nscnv1nkd.woff2`  _(in confirm-case.html)_
- `/_next/static/chunks/%5Bturbopack%5D_browser_dev_hmr-client_hmr-client_ts_1di75ot._.js`  _(in confirm-case.html)_
- `/_next/static/chunks/%5Broot-of-the-server%5D__1e7rvoz._.css`  _(in confirm-request.html)_
- `/_next/static/chunks/web_platform_src_components_customer-pilot_pilot_20bdeop.css`  _(in confirm-request.html)_
- `/_next/static/chunks/%5Bturbopack%5D_browser_dev_hmr-client_hmr-client_ts_1di75ot._.js`  _(in confirm-request.html)_
- `/_next/static/chunks/node_modules_next_dist_compiled_next-devtools_index_090k2jm.js`  _(in confirm-request.html)_
- `/_next/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js`  _(in confirm-request.html)_
- `/_next/static/chunks/node_modules_next_dist_compiled_react-server-dom-turbopack_164kp-6._.js`  _(in confirm-request.html)_
- `/_next/static/chunks/node_modules_next_dist_compiled_1amofcm._.js`  _(in confirm-request.html)_
- `/_next/static/chunks/node_modules_next_dist_client_0_90u2t._.js`  _(in confirm-request.html)_
- `/_next/static/chunks/node_modules_next_dist_1e8vcs8._.js`  _(in confirm-request.html)_
- `/_next/static/chunks/node_modules_%40swc_helpers_cjs_1r9vbqw._.js`  _(in confirm-request.html)_
- `/_next/static/chunks/web_platform_1anvha4._.js`  _(in confirm-request.html)_
- `/_next/static/chunks/turbopack-web_platform_08bm286._.js`  _(in confirm-request.html)_
- `/_next/static/chunks/web_platform_11nvzzh._.js`  _(in confirm-request.html)_

## Unplanned controls in generated output

The generator rendered these; nothing in the plan backs them. Either add them to the plan and regenerate, or tighten the prompt.

- button “Refresh records”  _(in confirm-case.html)_
- button “Import a public source catalog”  _(in confirm-case.html)_
- button “Selected”  _(in confirm-case.html)_
- button “Previous”  _(in confirm-case.html)_
- button “Next”  _(in confirm-case.html)_
- button “Review details”  _(in confirm-case.html)_
- button “Edit draft”  _(in confirm-case.html)_
- button “Record this local request”  _(in confirm-case.html)_
- button “QA fixture service QA fixture provider · SAR 1,250.75 39fd01”  _(in confirm-case.html)_
- button “Record a support case”  _(in confirm-case.html)_
- button “Keep editing”  _(in confirm-case.html)_
- button “Save local record”  _(in confirm-case.html)_
- button “Close”  _(in import-source.html)_
- button “Confirm public-source import”  _(in import-source.html)_

## Artifacts with no plan entry

- `browser-urdu-375`
- `browser-urdu-375-viewport`
