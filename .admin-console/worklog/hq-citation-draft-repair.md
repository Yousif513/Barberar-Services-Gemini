# HQ citation draft repair — owner implementation, 2026-10-23

Development worker `impl-hq-citation-draft` repaired only the existing approved authored recommendation overlay and its bilingual copy. The approved six-family/nine-route/fifteen-overlay inventory, existing theme and inactive original employee associations remain unchanged. No new helper, backend contract, permission, API or schema was added.

## Verified defect and bounded correction

After one citation was added, a second typed or selected quote could remain pending while Save submitted only the added array. Valid actual-browser baseline RED: Save was enabled where a pending quote required it to be disabled. A synchronous ref now also blocks Enter/direct requestSubmit; explicit Add or Clear is required. Pending text is labelled and associated with its localized guidance. Source choice is disabled while a quote is pending so a source change cannot silently discard it. Clear drops only the pending quote/binding/error; it retains authored text and already added citations.

Add refuses an unmatched quote, more than twelve citations or a source range longer than 1,200 UTF-16 source characters with localized explanation and draft preservation. These mirror existing server bounds; backend validation remains authoritative and unchanged. Explicit text selection still binds the chosen occurrence with the original source version/hash, CRLF and UTF-16 offsets; a mismatched explicit binding is refused rather than silently rebound to a first occurrence.

## Owner verification and honest counterevidence

`node web_platform/tests-browser/hq-citation-draft-owner.mjs --red` failed before implementation at the intended enabled Save assertion. Server-unavailable and a label mismatch preceded that valid RED; they are setup failures only and retained separately. The existing approved `npm run hq:dev` launcher was started on 127.0.0.1:3113 without resetting SQLite; session 43426 belongs to this worker.

Final `node web_platform/tests-browser/hq-citation-draft-owner.mjs` passed eight actual-browser groups: pending typed quote and Enter/requestSubmit guard; Clear preservation; mismatch/overlimit preservation; second repeated occurrence with original CRLF/UTF-16/version/hash on real local publish; twelve-citation bound and retry after removal; stale-source refusal with preserved draft and later pending guard; Arabic 375px RTL/keyboard guard/recovery/no page overflow; inactive employees and absence of unexpected external/business/device/speech calls or browser errors. Receipt miss 404s and one deliberate invalid_citation 400 remain expected and separately recorded. Two intermediate test-harness assumptions (synthetic selection event and an unloaded Arabic page context) were corrected without application edits and retained separately.

Focused ESLint from `web_platform` with --max-warnings=0 passed. Web TypeScript `npx tsc --noEmit --incremental false --project web_platform/tsconfig.json` passed. An initial root-directory ESLint invocation could not discover the workspace config and is not counted as validation. `git diff --check` passed. Root owns full build/mobile gates, manifest coordination, separate independent review and any delivery commits; this worker does not mark implementation reviewed or commit.

Evidence is under `.admin-console/evidence/hq-citation-draft-owner/`; green.json records exact canonical UTF-8/CRLF-to-LF hashes for source and test. Azure account/audio is deferred; all existing production, activation, permission, external-write, financial and paid-service approval holds remain. No actual credential, provider, microphone, speech or business action was used by this regression.
