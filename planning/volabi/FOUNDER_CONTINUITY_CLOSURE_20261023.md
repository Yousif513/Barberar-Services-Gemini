# HQ-NEXT-04 — bounded access scope closure (proposal)

This document and FOUNDER_CONTINUITY_DOMAIN_GRAPH.json describe the proposed scope. The generic Design Architect outputs inside access-continuity-plan/.design-architect are rejected as a render queue and retained only as diagnostic evidence. Their 23 candidates and zero machine holes do not approve any extra profile/settings/dashboard/notification/search screen or establish security acceptance.

## Complete surface contract

- One page: `/hq/access`. Accessible before ordinary HQ provider/session bootstrap. Existing authenticated actor control and lost-session/storage-error states link here.
- Three dialogs: enrollment; credential rotation; current/all-session revocation. Their explicit domain contracts come from FOUNDER_CONTINUITY_SCOPE_20261023.md; none is inferred from a generic settings template.
- Recovery proof/staging/saved-copy confirmation, bootstrap-required, loading/validation/invalid-proof/expiry/rate limit/conflict/uncertain-result/success/cancel and storage unavailable are component states, not generated pages.
- Successful authentication returns to an allowlisted existing relative HQ route, default `/hq`. Unknown/external/protocol-relative/encoded-escape returns refuse. Unauthorized deep links retain no source bodies or protected labels.
- Every cancel returns to the prior safe Access state. Retry performs a bounded status/receipt check, never implicit initialization, fresh workspace creation or a new unknown-effect operation. Missing data guidance is nonsecret offline guidance, not a browser create/restore button.
- No public account/seat list, transfers, invitations, ownership override, browser initialization, notification center, global search, KPI widget, date filter, profile/settings pages or unbounded history directory.

## Command and authorization map (proposed)

| Operation | Proof / scope | Durable effect and audit |
|---|---|---|
| Storage/access status | Existing configured instance; public response only coarse safe state. Caller-only enrollment details require valid session. | No create/open-write/seed/repair. Failure diagnostic ID; no source/seat enumeration. |
| Synthetic init/adopt/permit | Local CLI, positively marked owned fixture, explicit local confirmation; legacy adoption also valid original session proof. | No-clobber pending instance or exact-seat permit/bootstrap, five-minute expiry, reasoned security intent. No normal session until enrollment confirms. |
| Enrollment stage/confirm | Current matching session+CSRF+permit, or exact restricted first-enrollment bootstrap proof. | Pending verifier, saved-copy confirmation, then one exact-seat enrollment+session+audit transaction. Bootstrap cannot use domain endpoints. |
| Recovery stage/confirm | Exact existing credential generation + pre-auth challenge/origin proof. | Pending saved replacement credential; commit consumes old generation, revokes original seat sessions and issues one session with immutable event/receipt. No business record rewrite. |
| Rotation stage/confirm | Current session+CSRF+current recovery factor; exact seat/generation. | Same saved-copy protocol and atomic factor/session rotation; other seats unchanged. |
| Sign out / revoke all | Current session+CSRF; revoke all additionally current recovery factor and explicit confirmation. | Revoke exact session or all same-seat sessions, checked audit+receipt; no factor/data deletion. |
| Operation status / cancel | Original unguessable operation proof and matching instance/seat/generation/purpose. | Redacted result or stage cancellation only. Never disclose or replay plaintext secrets, manufacture a cookie or undo committed rotation. |

Security mutations require a healthy supported database and atomic checked audit persistence. Invalid proof has no privileged effect. Diagnosis of unavailable storage uses a separate bounded owner-restricted journal and never pretends to be a committed business event. Generic business task/decision command handling cannot invoke any of these operations.

## Closure disposition

All actions in the one-page/three-dialog contract resolve above to a protected operation, component state, existing destination or explicit offline guidance. No unresolved ambiguous destination is accepted. This is a manually reviewed scope closure, not an implementation/browser audit. Independent review must verify these contracts before presentation. Scope approval remains pending; theme is inherited unchanged. No renderer was seeded or invoked. No UI has been built.
