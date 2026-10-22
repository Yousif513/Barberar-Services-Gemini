# Independent Volabi frontend acceptance

Reviewer: server_hq_audit. Frontend implementer: hq_repo_inventory; backend/media/policy owner: root. This reviewer did not implement the reviewed frontend. Ownership was limited to web_platform/tests-browser/hq-local-acceptance.mjs, this worklog and evidence under .admin-console/evidence/volabi-first-loop. No UI, server or manifest edits.

The local interface supports a real persisted request, an authored recommendation with exact citations, record-only CEO review and an auditable factual follow-up. It is suitable for the approved isolated local review loop after the fixes below. It does not activate business employees, provide a live agent conversation, or authorize finance/production work.

## Actual execution

Command: node web_platform/tests-browser/hq-local-acceptance.mjs

Final result: exit 0; **16 checkpoints passed**, all nine route patterns with persisted IDs, all fifteen approved overlay kinds plus the mobile navigation drawer. Actual Chromium against http://127.0.0.1:3113 and the real local SQLite/API. English desktop1440 and Arabic RTL375; no horizontal overflow on any of the nine Arabic route patterns. Zero unexpected page/console errors, zero external HTTP/WebSocket origin requests and zero microphone/speech-synthesis attempts. Only specific deliberately caused API error messages are classified as expected; unrelated errors fail.

The accepted run performs UI source intake, task creation (Daniel proposed owner/Omar independent reviewer), reload, AUTHORED recommendation publication, false-quote refusal, exact quote/range/hash citation, explicit local approval/reason, factual follow-up, audit event inspection and reload persistence. It does not substitute an automatically assembled source brief for the requested authored work.

A local command POST was deliberately allowed to commit before its browser response was aborted. The original command/payload survived reload. A controlled receipt-GET403 then retained that same identity; restoring the endpoint recovered the receipt with one POST and one visible follow-up. No blind new operation was created.

After approval, a real source correction appended proposedv2. The UI displayed originalv1 bytes/current-session provenance and proposedv2 separately. A real follow-up POST returned409stale_source; both note and next-action drafts remained intact. A separate authored UI selection chose the SECOND repeated passage in an original CRLF source containing an emoji: the actual published quote retained CRLF and its exact original UTF16 offsets. Only the extra CRLF source/task arrangement used local record API fixtures.

Nora and Daniel profiles showed their own agent.skills lists, not the larger global catalog; original function counts matched actual profile records. Both PNG portraits loaded pixels, and both local WAV files loaded and played: Nora9.697868seconds, Daniel10.978005seconds. Arabic voice limitations, inactive ownership, unknown behavioral evidence and ungranted tools remained explicit. No local/remote speech synthesis or microphone was started.

All planned dialogs were opened, focus containment was exercised with Tab, Escape closed them and focus returned to their trigger. The mobile Arabic navigation also passed. These tests do not certify all assistive-technology behavior or every possible overlay lifecycle.

## Findings and owner fixes

- **F-UI1 / medium / fixed:** actual English task screenshot showed the Decisions primary anchor near-black on obsidian. In hq.css:2 the .hq a reset outranked .hq-button-primary. Reported to owner before any product edit; owner added scoped primary-anchor/hover colors. Final real link is rgb(255,255,255) on rgb(21,26,20), contrast17.65:1. The >=4.5 browser assertion and final visual inspection pass. Pre-fix screenshot is retained as independent-en-task-before-link-contrast.png; final screenshot is independent-en-task.png.
- **F-UI2 / low / fixed:** source Version picker lacked a stable exact localized accessible name because its wrapping label included option text. Owner added an explicit localized aria-label. Final exact Version accessible-name and v1/v2 provenance checks pass.
- Owner-authored changes separately verified, not claimed as this reviewer's discoveries: stable HqField labels; role-specific skill rendering/readiness; original-text CRLF/repeated selection mapper; definitive receipt-GET refusal retaining pending command.

Exploratory runner failures included an incorrect confirmation-button label and an overly broad alert locator that also matched Next's route announcer. These were runner corrections, not product defects. Final tests use the real action label and scope error assertions to the HQ surface. Earlier exploratory runs are not counted as accepted verification.

## Real HTTP policy and error boundaries

Actual HTTP /hq policy allows microphone=(self), camera=(); /login retains microphone=(), camera=(). Header checks do not request hardware permission or start recording. The enabled process remains bound to loopback; Origin/Host headers do not replace that launch boundary.

A separate real local seat and random missing task each received actual not-found refusals without leaked record data. Filtered-empty lists remained distinct. A controlled403overview response displayed an explicit forbidden/disabled error instead of invented data. These controlled error fixtures test presentation; actual server authorization is separately covered by the independent server review.

## Evidence and limits

Machine evidence: .admin-console/evidence/volabi-first-loop/independent-frontend.json, including command identities, receipt checks, final frontend/client/overlays/CSS/route hashes, header values, routes/overlays, media metadata, zero unexpected-error/device/external counters, screenshots and finding disposition. Viewed English task before/after and Arabic375 Nora screenshots. No source changed between the final browser run and hash verification.

No unresolved actionable critical/high omission was found in this bounded frontend loop. Root owns manifest status, full regression/build/lint/coverage/release gates. This verdict supplies independent local frontend evidence only; it is not full regulated completion or production clearance. Original finance/provider/device/counsel/activation holds remain.

No hosted write, real financial transaction, external invitation, model/provider/voice service call, business permission grant, employee activation or deployment occurred.

Post-test EOF normalization: removed only one extra final newline from `web_platform/tests-browser/hq-local-acceptance.mjs`; all assertions and non-EOF bytes remain unchanged. The original executed SHA256 is preserved in the evidence alongside the final formatting-only SHA256 `8324eed9016d4471f2e43cd1efb4be599469ef988c3b73a2bfdb3b139d29cd9a`. No browser rerun was claimed for this normalization.
