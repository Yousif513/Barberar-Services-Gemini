# HQ screen inventory - isolated MVP

These are unapproved route proposals; later scope is retained separately.

## Screen routes

- /hq — CEO Command Center
- /hq/tasks — Persistent Task Queue
- /hq/tasks/new — Task Composer
- /hq/tasks/[id] — Task Workspace
- /hq/decisions — CEO Decision Queue
- /hq/decisions/[id] — CEO Decision Detail
- /hq/agents — Original Agent Directory
- /hq/agents/[id] — Agent Profile
- /hq/skills — Skill Catalog
- /hq/skills/[id] — Skill Detail
- /hq/capabilities — Capability Gap Matrix
- /hq/evaluations — Evaluation History
- /hq/evaluations/[id] — Evaluation Detail
- /hq/skill-changes/[id] — Skill Change Review
- /hq/knowledge — Knowledge Source Library
- /hq/knowledge/[id] — Source Evidence Detail
- /hq/audit — Immutable Audit Timeline
- /hq/audit/[id] — Audit Event Detail
- /hq/connections — Tools and Connection Readiness
- /hq/settings — HQ Workspace Settings

## Proposed interactions

## CEO Command Center

Clicking Compose task opens /hq/tasks/new.
Clicking Inspect task opens /hq/tasks/[id].
Clicking Review decisions opens /hq/decisions.
Clicking Agent directory opens /hq/agents.
## Persistent Task Queue

Clicking New task opens /hq/tasks/new.
Clicking Open task opens /hq/tasks/[id].
Clicking Filter opens overlay:filters.
## Task Composer

Clicking Assess readiness opens inline:readiness.
Clicking Compare candidates opens overlay:readiness-comparison.
Clicking Submit draft opens /hq/tasks/[id].
Clicking Attach sources opens overlay:source-picker.
## Task Workspace

Clicking Review recommendation opens overlay:recommendation.
Clicking Request decision opens /hq/decisions/[id].
Clicking Add source opens overlay:source-picker.
Clicking Inspect agent opens /hq/agents/[id].
Clicking Open receipt opens /hq/audit/[id].
## CEO Decision Queue

Clicking Open decision opens /hq/decisions/[id].
Clicking Open skill change opens /hq/skill-changes/[id].
Clicking Filter opens overlay:filters.
## CEO Decision Detail

Clicking Approve or decline opens overlay:decision-confirmation.
Clicking Request changes opens overlay:request-changes.
Clicking Audit receipt opens /hq/audit/[id].
## Original Agent Directory

Clicking Open profile opens /hq/agents/[id].
Clicking View gaps opens /hq/capabilities.
Clicking Filter opens overlay:filters.
## Agent Profile

Clicking Inspect skill opens /hq/skills/[id].
Clicking Request evaluation opens overlay:evaluation-request.
Clicking Propose skill add/remove opens overlay:skill-change.
Clicking Task readiness opens inline:readiness.
Clicking Evidence opens /hq/evaluations/[id].
## Skill Catalog

Clicking Inspect skill opens /hq/skills/[id].
Clicking Propose addition opens overlay:skill-change.
Clicking Filter opens overlay:filters.
## Skill Detail

Clicking Evaluation opens /hq/evaluations/[id].
Clicking Binding proposal opens overlay:skill-change.
Clicking Source opens /hq/knowledge/[id].
Clicking Compare versions opens overlay:version-diff.
## Capability Gap Matrix

Clicking Open agent opens /hq/agents/[id].
Clicking Open skill opens /hq/skills/[id].
Clicking Propose resolution opens overlay:skill-change.
## Evaluation History

Clicking Open evaluation opens /hq/evaluations/[id].
Clicking Request evaluation opens overlay:evaluation-request.
## Evaluation Detail

Clicking Source evidence opens /hq/knowledge/[id].
Clicking Propose correction opens overlay:skill-change.
## Skill Change Review

Clicking CEO decision opens /hq/decisions/[id].
Clicking Compare versions opens overlay:version-diff.
Clicking Checked binding receipt opens inline:approved-change-receipt.
## Knowledge Source Library

Clicking Source detail opens /hq/knowledge/[id].
Clicking Attach source draft opens overlay:source-intake.
Clicking Filter opens overlay:filters.
## Source Evidence Detail

Clicking Correction proposal opens overlay:source-correction.
Clicking Affected tasks opens /hq/tasks.
## Immutable Audit Timeline

Clicking Event detail opens /hq/audit/[id].
Clicking Filter opens overlay:filters.
## Audit Event Detail

Clicking Task opens /hq/tasks/[id].
Clicking Decision opens /hq/decisions/[id].
## Tools and Connection Readiness

Clicking Prerequisites opens overlay:connection-prerequisites.
Clicking Request named setup opens overlay:connection-request.
## HQ Workspace Settings

Clicking Locale and preferences opens inline:preferences.
Clicking Permission request opens overlay:connection-request.
