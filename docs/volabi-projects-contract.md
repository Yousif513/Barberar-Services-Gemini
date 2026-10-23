# Volabi Projects and Initiatives local contract

HQ-NEXT-01 extends the existing local SQLite record store and current authenticated loopback seat. It adds no production service, independent worker scheduler, business identity or financial executor. Every management employee remains inactive.

## Queries

`GET /api/hq/state?view=projects` accepts `q` (200 characters), `status` (80), `ownerId` (100), `sort=updated|created|title`, and zero-based `page`. SQL filters are seat-scoped before a stable order, `LIMIT 25` and offset. Counts show this seat's open and accepted records. No browser filtering establishes authority.

`view=project&id=<id>` returns the project, milestones, authoritative linked tasks and sources, immutable closure snapshots, project history and audit events. `view=project-preview&id=<id>&milestoneId=<optional>` returns exact project/milestone revisions, criteria, task revisions, source versions/hashes, required milestone revisions, blockers and a material fingerprint. The returned readiness flag establishes eligibility for a local recommendation, not proof of task completion or independent review.

## Commands

All writes use the current `HqCommand` envelope, actual seat CSRF, command ID/material hash and atomic receipt/event transaction. Every project mutation expects the current **project** revision.

- `project.create`: title, objective, acceptance, proposed ownerId.
- `project.revise`: projectId and material fields; invalidates prior acceptance by new revision.
- `project.start`: projectId; named planning-to-tracking command.
- `project.task.link` / `project.task.unlink`: projectId, taskId, reason. Duplicate links fail. A task still used by a milestone cannot be detached until that milestone is revised.
- Existing `task.create` additionally accepts projectId and projectRevision. Task, association, project revision, audit and receipt commit together or all roll back.
- `milestone.create` / `milestone.revise`: projectId, milestoneId for revision, title, outcome, acceptance, taskIds, sourceIds, dependencyIds, blockers and optional ISO calendar dueDate. Task links must already belong to this project. Source and dependency targets are checked in the authenticated seat. Dependencies must belong to this project and cannot self-reference or cycle. Dates represent planning in Asia/Riyadh, with no scheduler or SLA.
- `project.closure.prepare`: projectId, optional milestoneId, reason and optional preview fingerprint (the UI supplies it). A changed supplied fingerprint fails before creating records. Creates a dedicated existing task/recommendation/decision and an immutable project-closure snapshot. Its receipt names project, milestone, closure, task, recommendation and decision. It does not activate a coordinator or perform any business work.
- `project.reopen`: projectId, optional milestoneId, reason. Writes a new local revision/event; history remains retained.

## Closure and freshness

At least one linked task and one actual source are required; at most 12 distinct sources fit the existing exact citation boundary. All declared blockers must be resolved. Dependencies, or all milestones for parent closure, must have current local acceptance. Source versions/hashes and task revisions are bound along with exact project/milestone revisions and criteria. An immutable snapshot fingerprint is included in the exact recommendation and its decision hash; the project closure history retains its full task/source snapshot.

Existing `decision.record` revalidates the snapshot and transitive dependencies before acceptance. Existing `followup.record` revalidates again. A factual follow-up never supplies automatic completion or independent review evidence. Material changes, source correction, revised tasks, or a now-stale dependency qualify accepted and pending targets as superseded, transactionally append audit/history, and retain prior decisions. Downstream dependencies are checked transitively. Rejected/changes-requested recommendations return the target to tracking.

An uncertain response is recovered using the original command ID and receipt endpoint; changed payload under that ID conflicts. Audit failure causes full rollback, including task association and closure state. No catch converts a failed write into success.

## Additive local storage and reversal

The existing generic `records` / immutable `record_versions` tables hold three additional kinds: project, milestone and project-closure. Task-link changes are versioned in the project taskIds field and named link/unlink events; dependencies are versioned in milestone dependencyIds. Existing records remain authoritative and are not copied. An idempotent `records_project_parent` expression index accelerates scoped child lookups. Existing SQLite workspaces and sessions are preserved.

This is a reversible application extension: reverting its code stops accepting the new command/query kinds while preserving additive records and all audit history. No destructive down migration runs. If the index must be reverted for development, `DROP INDEX IF EXISTS records_project_parent` removes only that index; no table, row or history is deleted. Production recovery, backup/retention, multi-user tenancy and business permissions remain outside this local slice.

## Owner evidence

`web_platform/tests/hq-projects-owner.test.mjs` contains eight real isolated SQLite behavioral groups, covering initial missing-command RED, persistence/reopen, exact decision/follow-up, corrected evidence, duplicate/cyclic links, blockers, replay and late-audit rollback. Existing HQ store/HTTP tests are also run. Independent review owns separate tests and acceptance; owner results do not establish independent review or full regulated release readiness.
