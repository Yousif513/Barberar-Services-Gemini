# Independent local HQ server security/QA review

Reviewer: server_hq_audit. Implementation authors: root (backend), skills_and_delivery (staged packages). Mode: scoped independent review, not full regulated-release acceptance. Reviewed the six frozen server/route files against docs/volabi-local-api-contract.md, current approval/holds, Adminwright security/QA prompts and security/architecture/verification/coordination guidance. Root owns manifest registration/status; this reviewer changed only its new test, this worklog and the linked evidence JSON.

A stolen local review session can inspect and change its own development workspace, prepare proposals and record local decisions/follow-ups. It cannot access a different seat or invoke financial, employee, permission or contact executors through this API. This is acceptable only for the explicitly enabled isolated local record-only preview; it is not a business-authority or production authentication system.

## Findings and corrections

- **F-HQ1, medium, fixed:** local-store.mjs originally checked task/decision lineage for followup.record but omitted current citation version/hash checks. Actual SQLite RED case prepare -> approve -> source.correct -> followup.record succeeded when it should refuse. Root added exact recommendation-hash and source-currentness checks at lines 190–197. Independent regression now passes and proves refused followup leaves material/history/receipt counts unchanged.
- **S-HQ-SK1, medium, fixed:** two staged financial references attributed assistant P075 completion/refund recommendations generically to the source alongside human choices. Persona owner separated human P074/P075 first-only/zero-repeat/processing direction from assistant hypotheses and explicitly retained the unadopted qualifying/earning event. Fresh independent reads verified the changes; this reviewer did not edit the packages.
- Owner pre-review corrections (not claimed as independent discoveries): CSRF argument wiring, exact source-body preservation and correction reason. Real HTTP and byte/hash tests verify their final behavior.

An initial rollback test assertion also failed because its helper deliberately read sources after the baseline, creating a legitimate read audit. The reviewer fixed only that test arrangement: construct payload before baseline, then assert exact rollback of records, versions, mutation audits and receipts. This was not a product defect and no assertion was weakened.

## Executed evidence

Final command:

    node --test web_platform/tests/hq-independent-review.test.mjs web_platform/tests/hq-store.test.mjs web_platform/tests/hq-local-boundary.test.mjs

Exit 0; **35 passed, 0 failed, 0 skipped** in 789.5039 ms: 21 independent cases plus 14 owner cases. No retry/skip. Temporary real HTTP bound 127.0.0.1, actual Node 24.15 SQLite, isolated fixture folders, global external fetch hard-block with zero calls asserted. Actual handlerPOST is exercised, not just a pure CSRF helper or mocked store.

Coverage: session/CSRF; origin/Host/rebinding/Vercel-disabled; forbidden business executors; foreign workspace query/command/receipt/search; expiration/ambiguous cookies; payload limits and generic errors; replay/restart/concurrent duplicate delivery; exact CRLF/whitespace source hashes; citation/task lineage; stale approvals/follow-up; changes-requested replacement recommendations; composite/receipt-insertion rollback; immutable/minimized audit; scoped pagination and injection refusal; 15 inactive catalog identities and exact source author/status.

Reviewed local-boundary.mjs, local-store.mjs, catalog.mjs, handler.mjs, handler.d.mts and API route wrapper. The source route wrapper delegates only GET/POST into the reviewed handler; this command does not boot Next. The local runtime directory is ignored by Git. Manifest/release/build/browser/full-regression gates remain root-owned and are not claimed here.

## Four staged packages

Read every SKILL.md and referenced source-and-cases.md for bilingual-conversation, meeting-facilitation, payment-reconciliation and refund-case-review. Scopes are sufficiently distinct and references exist. Corrected financial author/status separation is reflected in the evidence hashes. These are reusable instructions with explicit current holds; package presence/installation is not assigned skill, evaluated competence, live participation or access.

Remaining functional prerequisites are explicit: actual persona/task/version behavioral tests; on-device/Arabic speech and interruption/transcript evidence; live meeting consent/attendance/invitation/recording capabilities and permissions; actual provider/merchant policy/evidence for reconciliation/refunds; signed commercial qualifying/earning and reversal rules where unresolved. None is silently supplied by the local source brief or proposal command.

## Boundaries and disposition

No unresolved actionable critical/high finding remains in the reviewed bounded backend after owner fixes. No accepted-risk exception or new authority was granted by this reviewer. The enabled process must bind loopback; Host/Origin headers do not authenticate a TCP peer or replace that launch restriction. Local malicious OS users/direct filesystem tampering are outside this software acceptance boundary. Immutable history means application/trigger-protected history, not protection from an OS administrator.

No provider or hosted calls, actual credentials, money movement, business activation/grant, production deployment, external model/voice service or paid request. No claim of full regulated completion; current console release gaps remain. Exact tested source/package hashes and result details: .admin-console/evidence/volabi-local/server-independent-review.json.

## Final Next normalization recheck

The owner’s real Next browser pass found that the internal Request URL used localhost while the browser Host/Origin used 127.0.0.1. The reviewed narrowed fix requires both names to be loopback, equal ports and exact Origin against the actual parsed Host; Host paths, query, fragment and credentials are refused. Independent actual HTTP session/command acceptance using that normalized internal URL passed, together with hostile Host/Origin/port/path/query/hash/userinfo/nonloopback cases. Final combined rerun: 35/35 pass, exit 0, no skips or external fetch. Original 33-case run remains recorded in evidence history; the final source hashes cover the normalization fix and 21-case independent suite.

Post-test EOF normalization: removed only one extra final newline from `web_platform/tests/hq-independent-review.test.mjs`; all assertions and non-EOF bytes remain unchanged. The original executed SHA256 is preserved in the evidence alongside the final formatting-only SHA256 `cddb4ee40cf7f94175fee30496c3b95eaf998832377fb957daf41f296cac9b9c`. No browser rerun was claimed for this normalization.

After EOF normalization, the same three-file local Node HTTP/SQLite suite was rerun:35 passed,0 failed,0 skipped,exit0,duration823.5123ms. Browser acceptance was not rerun or re-claimed.
