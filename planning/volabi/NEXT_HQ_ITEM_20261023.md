# Next Headquarters item: Projects and Initiatives

Current status: approved for local implementation by the CEO; see [approval record](APPROVAL_PROJECTS_20261023.md). The proposal text below is preserved as the approved plan of record.

Prepared 23 October 2026. **Proposal only: no rendering, screen implementation, employee activation or scope approval is recorded by this packet.**

Volabi / AI Headquarters remains under development. The approved six-family, nine-route local first loop provides request → persistent task → source-linked recommendation → CEO decision → recorded follow-up. Its source-linked citation repair and independent acceptance are being closed separately. This packet does not certify that work or the full Headquarters complete.

## Recommended next item

**HQ-NEXT-01 — Local Projects and Initiatives:** let the CEO group related work, see dependencies and missing evidence, and record acceptance item by item using the existing task/decision loop.

The current [operator guide](../../docs/volabi-local-operations.md) describes the approved first-loop capabilities as implemented. No additional missing first-loop module was established by this planning pass. A broader management module is therefore proposed explicitly rather than presented as an already approved repair. The two project routes already appear in [the retained later inventory](LATER_SCOPE.md); they are absent from the approved [first-loop graph](FIRST_LOOP_DOMAIN_GRAPH.json). Council meetings, spatial offices, live conversation and business dashboards remain separate later items.

**Closure example:** create a local “Booking recovery readiness” project, link actual existing local tasks and source versions, define an independently checkable milestone, prepare its closure recommendation, record the CEO's exact decision, then record the factual follow-up. “Accepted locally” means the displayed development evidence was accepted. It does not mean deployed, financially reconciled, operated by an employee, or independently verified unless the corresponding evidence exists.

## Proposed complete surface boundary

Use the approved obsidian/ivory/gold system, current shell, bilingual copy, RTL behavior and existing accessible components. No new theme, identity or generated media is required.

| Surface | Complete behavior and destination |
|---|---|
| `/hq/projects` | Server-side search, state/proposed-owner filters, stable sort and bounded pagination; explicit open/accepted counts from this workspace only. Create opens the project editor; every row opens an existing authorized project. Add one deliberate shell/home entry only after this module is approved and implemented. |
| `/hq/projects/[id]` | Objective, acceptance criteria, proposed inactive coordinator, milestones, linked tasks, dependencies, blockers, evidence freshness, decisions, follow-ups and immutable local history. Links resolve to the existing task, source, decision and agent routes. Missing/inaccessible targets explain the condition without exposing another workspace. |
| Project editor overlay | Create or materially revise objective, criteria and proposed coordination association; preserve draft on failure; display the resulting revision. Existing original identities only. |
| Task-link overlay | Find and attach existing authorized local tasks, preview exact task revisions, and remove a link with reason/history. “Create task” reuses the existing composer; its project association is persisted atomically with task creation. No copied task record or separate execution queue. |
| Milestone editor overlay | Define a named outcome, acceptance evidence and linked tasks. Declare dependency links with cycle/self-reference checks. Dates are optional planning inputs displayed in Asia/Riyadh, with no invented SLA or scheduler. |
| Closure/reopen confirmation overlay | Preview the exact project/milestone revision, task revisions, current evidence, blockers and decision scope. Submit through the existing record-only recommendation/CEO decision workflow. Preserve reason and command identity on uncertainty; explicit reopen records a new event and reason. |

These are **two route patterns and four proposed local overlay contracts**. Source, audit-event, recommendation, task-composer and decision overlays are reused, not counted as new screens. Do not add unrelated settings, calendar, boardroom, financial actions, report export or a decorative progress dashboard.

Every list/detail has loading, empty, filtered-empty, populated, error, forbidden, missing-record and stale states. Every submitting overlay has idle, validation error, submitting, failed-with-draft, conflict, uncertain receipt and success states. Keyboard focus/return, cancellation, mobile layout and Arabic mirroring must be covered. There is no success state without a checked persisted receipt.

## Records and closure rules

Reuse the local loopback SQLite workspace/session boundary and command/receipt/audit patterns. Add versioned project, milestone, task-link and dependency records through a reversible, additive local schema migration. Existing task, evidence and decision records remain authoritative.

- Each record is scoped to the authenticated local workspace; client-supplied IDs never establish scope. Existing CSRF, bounded validation and per-object checks apply to reads and writes.
- Local tracking states are planning, tracking, closure-requested and accepted-locally; unresolved blockers are shown separately. State changes are named commands with preconditions, reasons and audit events. A general editable status dropdown is insufficient.
- Closure binds the current project/milestone revision, linked task revisions, source versions/hashes, explicit criteria and exact recommendation/decision. Missing evidence or unresolved declared acceptance blockers prevents acceptance. Material revisions or changed evidence invalidate pending closure and visibly qualify earlier acceptance as superseded.
- Task completion and independent review remain explicit evidence. A follow-up note, installed skill, linked decision or developer's claim does not automatically prove either. Display raw counts and unknowns; do not invent completion/competence percentages.
- Proposed coordination may name Alexander; actual preparation is attributed to the development/local actor. No scheduler, autonomous dispatch, employee assignment activation, money movement or external connector is introduced.
- Archive/delete, bulk/import/export, saved views, actual budget management, cross-workspace collaboration and production identity/recovery are explicitly deferred in this first project slice. Closed records remain searchable and historical evidence remains accessible under the same scope.

## Original team, skill and finance continuity

[The original function registry](source/ORIGINAL_42_FUNCTIONS.json) preserves Alexander's OF37 Executive Operations Analyst and OF38 Project Coordination Specialist, Nora's OF39 Decision Register Coordinator and OF40 Executive Briefing Specialist, Adam's OF41/OF42 strategic research/scenario functions, Daniel's OF20–OF22 finance functions, and Omar's OF30–OF33 independent assurance functions. These are proposed functions, not 42 additional people or adopted authority.

Reuse all 15 canonical identities, characters and portrait provenance from [the persona registry](persona-and-skills/PERSONA_REGISTRY.json). Show their existing proposed role/skill associations and task-specific gaps. Alexander's coordination, Nora's decision continuity, Adam's strategic challenge, Daniel's financial evidence and Omar's independent assurance remain distinct proposals. Implementation and independent technical review must be done by different development workers.

Reuse `primora-project-delivery`, `primora-durable-workflows`, `primora-authority-and-approvals`, `primora-memory-and-knowledge`, `primora-source-continuity` and `primora-quality-engineering`; apply existing design skills. Preserve the four separate states: globally available package, agent binding, evaluated evidence, actual permission/dependency. No new skill package or business binding is presumed necessary by this packet.

Male management voices remain Saudi; female voices remain Lebanese, per [the current voice direction](VOICE_ACCENT_REQUIREMENTS.json). Existing English previews do not satisfy regional voice acceptance. Azure setup/audio stays deferred. The previously approved single audition exception is retained without reset: SAR10 all-in, 100,000 aggregate characters including anchors/retries/rounds, maximum three rounds. No voice account, key, provider call or paid review is needed for this module.

Financial project tasks may link the existing [finance/refund decision queue](../../docs/volabi-finance-refund-gaps.md). Preserve first-acquisition-only commission, zero repeat acquisition, licensed-provider allocation/no custody, conditional human maker/checker controls and existing Tap/ledger authority. Commercial terms, qualifying acquisition event, refund allocation and PSP acceptance remain named unresolved items. This project module neither chooses rates nor resolves them by an internal acceptance record. Amounts, if displayed as cited evidence, retain SAR units, source/date and unknown state; no invented live totals.

## Acceptance and delivery order

1. Extend the surface graph with the two routes, four overlays, exact destinations and states; independently check closure against this packet. Reuse the existing approved visual direction. Record the CEO's bounded scope decision before rendering/building these later-scope surfaces.
2. Implement the local records/commands first with owner regression tests. Prove cross-workspace denial, CSRF failure, malformed/duplicate input, dependency cycles, atomic task/link creation, stale revisions, late audit failure rollback and same-command recovery after an uncertain response.
3. Implement the complete bilingual surfaces against those commands. Independently exercise actual English/Arabic mobile/desktop workflows, keyboard paths, empty/error/refusal states and browser console; no fixture data may reach runtime release bindings.
4. Demonstrate restart persistence and an entire project → milestone/task → source-linked closure recommendation → CEO decision → audited follow-up/reopen loop. Changing evidence must block a stale closure; a different independent reviewer must verify the final source and receipts.
5. Run the applicable repository checks, report the remaining regulated release failures honestly, commit and push only the isolated development branch, and update the item ledger. Acceptance of this module does not certify full HQ or production readiness.

**Dependencies:** finish independent acceptance of the current validator/citation repairs; preserve the local store/session and exact revision/receipt contracts; no credentials or new paid service. Production login, multi-user tenancy and backup/retention policy remain later prerequisites for any real deployment.

**The one decision required is scope:** whether to include this bounded later-inventory project module in local development. No missing commercial decision is required to build it under these limits. Production deployment/merges, Headquarters employee activation, business permission grants, external business writes, financial transactions and new paid/native-review services remain pending explicit approval.

## Ready-to-send next prompt

> I approve HQ-NEXT-01 in NEXT_HQ_ITEM_20261023.md: the local Projects and Initiatives module with two routes, four overlay contracts and the existing Volabi visual direction. Reuse the current task, source, decision and audit loop. Build and independently test evidence-bound milestone closure and item-by-item project tracking, keeping all original agents inactive. Commit and push the isolated development branch. Keep Azure setup/audio deferred and retain every production, business activation, permission, external-write, financial and additional paid-service hold.
