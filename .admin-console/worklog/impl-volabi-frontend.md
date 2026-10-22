# Volabi first-loop frontend implementation

Date: 2026-10-22. Implementer: hq_repo_inventory. Source freeze: initial frontend slice. Parent owns integration and release disposition; this implementer does not independently approve its own work.

## Operator outcome and boundary

The local founder-review workspace can create a persistent request with actual source associations, revise it, prepare an explicitly labelled local source brief or publish a typed recommendation with exact source citations, inspect the resulting decision, record a reasoned approval/decline/change request, and record a factual follow-up. Source corrections retain prior versions and current source changes are checked before decisions. All records come from the local HQ API; no invented task, decision, activity, score or presence fallback is rendered.

The fifteen original identities have distinct source character directions, proposed role-specific skill associations, transparent instruction/version/hash evidence and runtime/permission gaps, original synthetic proposed portraits, and actual locally served English audition files. The available global skill catalog appears in proposal selection, not as every identity's associated skills. Conversation and meeting controls create bounded preparation records; they do not claim a conversation, attendance, employee work, package installation or permission grant happened.

Every receipt is record-only. Company employees, paid models, business tools, financial execution, external invitations/joining and recording remain inactive. Local synthetic English samples use two base engines with proposed prosody; they do not establish fifteen independent voices or Arabic-file readiness. Authored auditions are not employee replies. Dynamic speech requires an installed matching `localService === true` voice. Dictation requires both explicit user interaction and already available on-device recognition; no remote fallback or language-pack installation is invoked.

## Ownership and files

- `web_platform/src/app/hq/**`: approved nine route patterns, shared layout/CSS and explicit loading/error/not-found handling.
- `web_platform/src/components/hq/**`: local session/data/command context, shell, shared dialogs/fields, registers/detail workspaces, fifteen reusable overlay variants and identity profile.
- `web_platform/src/lib/hq/client.ts`, `contracts.ts`, `copy.ts`, `voice.ts`: typed contract, same-origin API transport, bilingual labels/error maps, and local-only speech boundaries.
- `web_platform/src/components/global-dev-tools.tsx`: authorized narrow `/hq` and `/hq/*` exclusion so marketplace development role switching is absent from this workspace.
- `web_platform/tests/hq-client.test.mjs`, `hq-voice.test.mjs`, and separate `tests-browser/hq-frontend-closure.mjs`: controlled transport/voice tests and explicit opt-in local browser acceptance.

No server, SQL, production account, business execution, pricing, root-package or release-manifest edit belongs to this worker. No commit, push or deployment was performed by this worker.

## Approved route closure

| Family | Route pattern | Real destination/data |
|---|---|---|
| Founder command | `/hq` | Actual local counts, latest task/decision records and links; empty and read failure are distinct |
| Work | `/hq/tasks` | Scoped search, status filter and server pagination; compose request |
| Work | `/hq/tasks/[id]` | Versioned request, real sources, preparation/authored recommendation, revision, decisions, follow-ups and audit events |
| Decisions | `/hq/decisions` | Scoped pending/history list, search/filter/pagination |
| Decisions | `/hq/decisions/[id]` | Exact recommendation hash/revision/citations and explicit choice with reason; stale source/recommendation prevents action |
| Team directory | `/hq/agents` | Fifteen inactive original identities and actual media/configuration metadata |
| Identity/readiness | `/hq/agents/[id]` | Character, role-specific skills, evidence/gaps, presence preparation and original function associations |
| Knowledge | `/hq/knowledge` | Actual source register/search/pagination and intake |
| Knowledge | `/hq/knowledge/[id]` | Exact text, version history/hash/provenance, affected tasks, proposed correction and audit events |

## Fifteen shared overlay contracts

| Overlay | Reachable entry | Result or honest limit |
|---|---|---|
| task-composer | Header/command CTA; identity conversation/meeting; task revision | `task.create`, `task.revise`, or record-only meeting proposal; checked receipt opens task |
| source-picker | Task “Change linked sources” | `task.revise` against pinned revision; prior recommendation retained as history |
| recommendation | Task “Write a recommendation” / “Inspect evidence” | Authored `recommendation.publish` with exact quote/version/hash/UTF16 range; persisted decision link |
| decision-confirmation | Decision approve or decline | `decision.record` with exact hash/revision and reason; no execution |
| request-changes | Decision “Request changes” | Same explicit checked decision contract with changes-requested result |
| audit-event | Actual timeline event button | Immutable persisted event fields; no invented activity |
| filters | Task/decision register filter | Updates scoped parent query only; cancel retains existing query |
| readiness-comparison | Task readiness; identity compare | Direct selected-task read plus paged/search task choices; evidence/permissions stay unknown where unestablished |
| skill-change | Identity skills | Persisted proposal for add/remove/pin; no install/binding execution |
| evaluation-request | Identity skills or particular skill | Persisted bounded evaluation proposal; no fabricated evaluation result |
| skill-evidence | Particular identity skill | Actual instruction version/hash/install state; proposed binding and unknown behavioral evidence remain separate |
| evaluation-evidence | Particular identity skill | Explicit absence of task/version behavioral evidence and freshness dependencies |
| skill-change-review | Decision “Inspect recorded proposal” / details | Exact stored task/proposal and limits; decision destination |
| source-intake | Knowledge add source | Exact typed body plus provenance metadata; forced current-session/proposed classification, no external fetch |
| source-correction | Source detail | New proposed version against pinned source version; old text/citations retained |

The rejected generic 159-screen diagnostic queue was not rendered. Mobile navigation, tabs, locale switching and inline follow-up are component states, not added business routes.

## Durability, failure and accessibility details

Command identity and the original payload are persisted in sessionStorage before dispatch. Retries check the same receipt before reposting the same identity. Same-ID double clicks coalesce; changed content cannot borrow an in-flight result. A denied/failed receipt lookup never proves the write failed and retains the pending command; only a verified rejected POST may clear it. Unknown outcomes expose the retained original payload and a same-command recovery control, which is explicitly `type=button` so it cannot accidentally submit a surrounding form.

The local session cookie and server store provide authorization/durability; no marketplace AuthGuard or Supabase role is used. Reads use request identity to ignore old query/context responses. Initial authoritative reads gate forms; source correction, source association, recommendation publication and decision drafts retain their initial expected revision/hash rather than silently rebasing after refresh. Failed input remains in its form. Successful task/source/proposal creation navigates only after the checked receipt.

Shared ModalOverlay provides focus entry, focus containment, inert background, Escape behavior and focus restoration. Inputs have stable explicit label/id links and separately described hints. AR locale mirrors the shell and dialogs; dates use Asia/Riyadh. The approved existing obsidian/ivory/gold theme and repository font variables are reused. No additional theme or screen was introduced.

## Evidence and tests

RED/GREEN: the initial seven client tests and seven voice tests failed with missing modules before implementation; all fourteen passed after implementation. An additional receipt-lookup-refusal test failed before the definitive-rejection distinction and passed after the fix. All tests hard-block unplanned global network and inject controlled fetch/recognition/synthesis boundaries.

- `node --test tests/hq-client.test.mjs tests/hq-voice.test.mjs` from `web_platform`: **16 passed, 0 failed**.
- `node ../node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`: **exit 0** after current source changes.
- Scoped ESLint over HQ app/components/client/contracts/copy/voice plus GlobalDevTools: **exit 0, 0 errors, 2 warnings**. Warnings are raw `<img>` for local proposed portrait files with explicit dimensions/containment and honest asset-failure state; no remote image service is used.
- Actual local browser: `VOLABI_UI_TEST_URL=http://localhost:3113` with `node --test tests-browser/hq-frontend-closure.mjs` from the repository root: **1 integrated case passed, 0 failed**. Its isolated browser session created a real local task, opened all **9 route patterns / 15 reusable overlays**, prepared a persisted evidence brief/decision, exercised immutable revision/decision/source controls, checked Nora versus Daniel role-specific associations, local audition metadata, AR 375px layout/no horizontal overflow and mobile navigation. **0 page errors, 0 external origins**. The runner rejects non-loopback targets and blocks all other origins. No fake API response is substituted.

Evidence directory: `C:/Users/Yousif's PC/.codex/visualizations/2026/10/21/01a15fd4-1061-7012-83d4-de2af22d120b/Approved_Booking_Payment_Reconciliation/hq-frontend-acceptance/`.

- `hq-frontend-closure.json`: exact route/overlay sets and role-specific skill sets.
- `hq-profile-presence-en.png`: desktop English presence view.
- `hq-profile-presence-ar-mobile.png`: Arabic 375px presence view.

Initial browser failures were investigated rather than treated as success: a transient server session setup error correctly rendered storage-unavailable; initialized textarea label ambiguity was fixed with explicit labels; the route counter was corrected to normalize named identity slugs to the single approved profile pattern. The final actual browser run passed after these corrections.

These are implementation checks, not independent review approval. Parent's independent reviewer owns the separate adverse/browser verdict. Full web build, mobile type-check, manifest validate/coverage and overall release disposition remain parent integration gates. The browser probe does not claim physical-device mic/TTS/audio audition quality, external meeting capability, model-backed conversation, employee activation or production readiness.

## Research consulted

- Approved `planning/volabi/FIRST_LOOP_DOMAIN_GRAPH.json`, `APPROVAL_20261022.md`, `DESIGN.md`, persona registry/skill map and `docs/volabi-local-api-contract.md`.
- Repository and web AGENTS, current coworking changelog and the installed Next 16 bundled documentation for App Router server/client boundaries, Promise route params, route-handler caching, async cookies and authorization checks.
- Design Architect, frontend-design, approved staged Primora design replacements, Primora boardroom/presence, solution architecture, durable workflows and TDD guidance.
- MDN: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static ; https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally ; https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService . These support the installed on-device/local-service capability checks; none is evidence of runtime employee competence.

Review integration correction: the explicit browser runner was moved from a web `.cjs` unit-test filename to repository `tests-browser/hq-frontend-closure.mjs`, using ESM imports. It remains separate from normal unit globs and requires the explicit loopback target. This follows the existing Next ESLint file conventions without weakening rules.

Final source-verified transition correction: preparation/publication controls use the backend's exact `requested` / `changes_requested` precondition. Approved/declined/follow-up and pending states offer decision inspection or revision rather than an enabled submit that must fail. A localized explanation accompanies the disabled controls.


Final review repair and recheck: independent visual finding F-UI1 identified the link reset overriding the primary-anchor text color. Scoped primary link/hover rules restore the approved white-on-obsidian contrast; the independent reviewer owns the computed-contrast verdict. The manually wrapped source version picker now has an explicit localized accessible name.

Exact-source citation regression: browser textarea selections normalize CRLF/CR, while stored source strings intentionally retain their original UTF16 ranges. A RED test established the missing mapper; GREEN now maps display offsets back to original text, including Unicode before the quote and a deliberately selected repeated occurrence. Authored citation payloads always slice the original body and preserve its version/hash. Stored sources are never normalized. Final controlled client/voice result is **16/16**, final web TypeScript exits **0**, and scoped lint remains **0 errors / 2 local-image warnings**. The relocated ESM browser closure runner passed **1/1** after its move and transition/accessibility corrections; independent review additionally checks the final contrast/citation snapshot.
