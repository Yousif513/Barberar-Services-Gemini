# Projects backend implementer worklog

Development-only implementer `impl-hq-projects-backend`, 2026-10-23. HQ-NEXT-01 is the user-approved plan of record. Read the scope packet, local store/HTTP contracts, primora-durable-workflows, primora-authority-and-approvals and primora-quality-engineering.

Implemented workspace-scoped projects/milestones/versioned task links/dependencies, bounded SQL project search/filter/page/count, exact closure preview, existing task/recommendation/decision/follow-up reuse, atomic task/project creation, named reopening, source/task/material/transitive dependency freshness, durable receipts and rollback. Generic records avoid a destructive table migration; additive child index only. Full contract and reversible-code procedure: docs/volabi-projects-contract.md.

Owner initial four regression groups genuinely failed at absent project.create before implementation (invalid_input). First GREEN4, expanded GREEN7; restart cleanup initially failed EPERM because the hook closed the prior already closed store rather than the newly opened instance. Corrected only the test-owned hook, not runtime. Final eight owner groups plus existing store8/HTTP5 =21 passing in evidence/hq-projects-owner/GREEN.txt. No global fetch/provider/service, production DB, employee activation, financial action or Azure operation.

Independent reviewer supplied a genuine transitive dependency stale-acceptance case: sourceA correction made A stale but dependent accepted B remained labelled accepted. Fixed freshness to traverse required accepted dependencies (cycles already prohibited) and refresh persisted state/audit atomically after mutations. Owner does not mark independent acceptance. SQL pagination was improved after reviewer observation; filters and count execute in SQL rather than collecting every project in application memory.

Targeted lint passed from web_platform. An earlier lint invocation from repository root used web_platform-relative src paths and found no files; re-run in correct directory succeeded. One patch attempt used wrong cwd and one used Python's default Windows text encoding; neither modified the target before failure. All later targeted edits used explicit UTF-8 and explicit workdir.

No commit, manifest review marks or global skill modifications by this worker. Root retains commit/push and repository health gates. Await independent acceptance and real browser contract checks.
