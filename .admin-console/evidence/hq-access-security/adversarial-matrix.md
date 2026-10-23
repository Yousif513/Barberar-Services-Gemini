# HQ-NEXT-04 independent security matrix

Reviewer: sec-hq-access. Scope: approved FOUNDER_CONTINUITY_SCOPE_20261023.md, domain closure, docs/volabi-access-contract.md and docs/volabi-access-api.json. Implementation and browser QA belong to other agents. No product edits or real HQ roots/cookies permitted.

## Trust boundaries and assets

- Masked local operator proof to explicit fixture initialization/adoption/permit: exact original seat continuity; no cookie-only takeover.
- Unauthenticated HTTP to challenge/stage/confirm/status: bearer factor, operation proof, account-existence privacy, bounded persistent work.
- Session/CSRF to ordinary HQ commands and revoke: exact seat scope, generation freshness, no stale queued mutation.
- Configured root/guard/native SQLite file to cached store: canonical physical identity, owner custody, no implicit repair/creation or inert activation.
- Auth metadata and native SQLite pages to encrypted portable package: physically excluded session/factor/permit/instance control material; preserved business history.

## Independent adverse cases

| Group | Intended proof | Required healthy baseline |
|---|---|---|
| S01 | Restricted bootstrap cannot get ordinary HQ reads/commands or choose actor/workspace; unknown proof same refusal | Enrollment confirms exact fresh seat |
| S02 | Cookie alone, permit alone, cross-seat permit, changed generation cannot enroll | Current cookie + exact permit enrollment |
| S03 | Wrong/unknown/cross-instance factor; spoofed actor/workspace/role fields refuse without listing seats | Valid factor recovers original actor/workspace |
| S04 | Staging cancellation/expiry keeps original factor/session; stage never creates ordinary session | Recovery saved-copy staging |
| S05 | Lost confirmed response can be resolved with proof receipt and saved replacement; same material replay no new cookie/effect; changed material conflicts | Atomic confirm |
| S06 | Audit failure rolls back factor, session revocation, generation and receipt | Same confirm succeeds once fault removed |
| S07 | Competing confirmations have one winner; stale operation cannot revoke newer session | Two independent valid pending contenders where contract permits |
| S08 | Retained session object/read/detail/command/receipt after revoke refuse; a queued write rechecks inside transaction | Pre-revocation scoped command succeeds |
| S09 | Malformed/oversized/extra fields, wrong Origin/method/CSRF, challenge replay/expiry refuse at intended boundary | Same-origin challenge and protected POST |
| S10 | Five-per-challenge and thirty-instance invalid budgets persist reopen; unauth challenge flood cannot displace valid seat stage or disable existing session | Valid session and pending stage remain usable |
| S11 | Missing DB/guard/both/parent never creates root/schema/seed/sidecar; cached guard deletion blocks reads/writes | Healthy guarded open and read |
| S12 | Copied DB, stale/swapped guard, corrupt/empty/unsupported DB, junction/hardlink, Windows insecure ACL refuse without repair | Native healthy identity + owner ACL |
| S13 | Cached/in-flight DB replacement/guard loss revalidated before commit; native Windows lock outcome disclosed | Actual paused write or guard validation boundary |
| S14 | Inert marker, moved inert application ID, legacy/un-enrolled normal open refuse | Inert package from synthetic valid capture |
| S15 | Raw sanitized native pages and decrypted logical payload exclude factor/session/verifier/proof/guard canaries; restored storage cannot enroll | Supported new-schema backup passes inspect |
| S16 | Redacted audit/diagnostics/HTTP receipts contain no raw synthetic secrets or source bodies; bounded failed diagnostics and no fallback success | Successful audited enrollment/recovery/revoke |

Each runtime group must use independent synthetic marker/proof setup outside the repository, validate healthy access before an intended refusal, retain initial failures, and hash the final reviewed source/test set. Refusals must assert the expected code/effect rather than merely catch any error. No skipped or weakened cases can stand in for an unimplemented obligation. Final disposition remains pending until backend and root backup integration are ready.
