# Bounded development Azure auditions

This is an offline-by-default, dependency-free Node utility for the 22 October 2026 approval. It prepares the fifteen original identities' candidate auditions. It does not activate employees, select production voices or prove native pronunciation/identity distinction. The initial 92 jobs comprise 15 role scripts, 75 blind trials and 2 neutral baseline anchors. The immutable plan currently reserves 66,818 full-payload units for one complete first pass. Three rounds are the maximum; selective follow-ups must fit the same remaining allowance.

## Safe commands

From the repository root, the default invocation only verifies the reviewed source hashes and prints the immutable plan:

```powershell
node scripts/volabi-auditions/runner.mjs
node --test scripts/volabi-auditions/runner.test.mjs
```

No network or credential read occurs in plan, preflight or status mode. Node's built-in fetch/fs/crypto and Windows PowerShell DPAPI are the only runtimes; no SDK or dependency installation is needed. Tests hard-block global fetch, inject synthetic responses, and use isolated temporary directories. The test subprocess likewise refuses live fetch.

## Account evidence and approval gate

Before credential setup, the named operator must confirm the existing DEVELOPMENT paid-tier Azure Speech resource (verify the actual resource SKU separately; S1 in the public pricing evidence is a meter SKU, not an assumed resource tier) and the account-specific terms, pricing, attributable fees/tax/FX maximums, and regional availability of ar-SA-HamedNeural and ar-LB-LaylaNeural. The paid pass is authorized; actual account and credential access are still held until these facts are confirmed. No new subscription or paid service is created. The public retail rate is a reference, not an account quote. An account bound that omits an unknown fee is not a valid bound.

Create a nonsecret UTF-8 JSON attestation OUTSIDE the repository with these exact fields; do not put the resource key in it. No runnable attestation with invented approvals or prices is supplied.

| Field | Required value / meaning |
|---|---|
| approvalId | 20261022-azure-development-15 |
| environment | development-only |
| approvalDocumentSha256 | SHA-256 of EXECUTION_APPROVAL_20261022.md after strict UTF-8 decoding, CRLF pairs to LF only, UTF-8 re-encoding; preserve every other character |
| planSha256 | Exact planSha256 printed by offline plan |
| resourceId | Actual /subscriptions/.../resourceGroups/.../providers/Microsoft.CognitiveServices/accounts/... resource ID |
| region | eastus or uaenorth; only these documented/researched regions are enabled |
| endpoint | Exact https://REGION.tts.speech.microsoft.com/cognitiveservices/v1; no aliases, queries, custom hosts, redirects or deployment IDs |
| reviewedBy | Named account/terms/pricing reviewer |
| verifiedAt; validUntil | ISO UTC timestamps, verification not in the future; expiration within 24 hours of verification |
| termsAccepted; pricingConfirmed; feesAndTaxesIncluded | true only after actual account review |
| exclusiveAuditionUseConfirmed; voicesConfirmed | true only after confirming exclusive bounded audition use and current regional candidate availability |
| allInSarPerMillionUnits | Positive decimal STRING, up to 6 decimal places: maximum SAR per million billable characters, including bounded conversion/tax/variable fees; conservative full-payload units are charged at this maximum |
| fixedFeeSarPerAttempt | Nonnegative decimal STRING: additional maximum per attempted request, if any; documented zero allowed |
| maxNonRequestFeesSar | Nonnegative decimal STRING: all additional attributable fixed/non-request costs; reserved once before any request; documented zero allowed |
| evidence | Array of {kind,path,sha256}. Required kinds: account-price-and-fees, account-terms, regional-voices. Local exact-byte SHA-256 evidence files must exist; paths absolute. Keep evidence nonsecret and outside release paths. |

Account, evidence and private-state paths must be fully qualified local paths. Before evidence/account bytes, state reads, directory creation or credential-file operations, guards reject UNC/device/URL/relative paths, alternate data streams, mapped/network/SUBST/non-fixed drives and existing symlink/junction/reparse ancestors. Windows drive checks use local volume metadata before root-to-leaf attributes; rejected remote examples in tests are intercepted and never contacted. Account data, evidence references, plan and dispatch data are synchronously cloned/frozen before awaits so later caller or credential-callback mutations cannot alter the reserved payload/fees/endpoint.

Unknown fields are rejected. Account review expires after at most 24 hours. Fresh timestamps/evidence may be supplied without resetting reservations, but resource, endpoint, exact plan, recorded approval and pricing bounds remain bound to the original ledger. Changed prices/source/approval require operator reconciliation and a reviewed continuation design; never delete or relocate a ledger to bypass its cap. These metadata/hash checks do not authenticate a quote or CEO identity; the trusted operator must actually verify the source and authority.

```powershell
node scripts/volabi-auditions/runner.mjs preflight --account 'C:\private\confirmed-development-account.json'
```

This validates local evidence only and still does not read a key or contact Azure. Replace the account path with the real external file; never enter a key on the command line.

## Masked local credential setup (operator only)

After the account gate, the human operator opens a local PowerShell console in this checkout and runs the following command using the actual validated nonsecret local account JSON path:

```powershell
node scripts/volabi-auditions/runner.mjs setup-key --account 'C:\private\confirmed-development-account.json' --confirm 20261022-azure-development-15
```

The setup command revalidates the account/terms/price evidence and passes only its nonsecret confirmed ARM resource ID and SHA-256 to Store. The helper displays that exact resource and asks the operator to confirm the key will be copied from it. Read-Host -AsSecureString masks key input. The helper encrypts with current-user Windows DPAPI using the resource hash as additional entropy, restricts the directory ACL to that user, and uses CreateNew to refuse overwriting an existing key. A versioned JSON envelope containing the nonsecret resource hash and protected key is stored at %LOCALAPPDATA%\Primora\VolabiAuditions\azure-speech-development-key.dpapi. Do not paste a key into chat, command arguments, environment variables, a browser, logs, Git or the account JSON. No one should run InternalRead manually: it exists only for the runner's private captured child-process pipe and refuses a normal interactive console. The helper has NOT been run against an actual key in implementation tests. Windows DPAPI interoperability and real credential setup remain operator acceptance steps. The shared pure envelope validator is executed in offline tests with invented protected bytes; it does not read a key file or invoke DPAPI. InternalRead compares the expected confirmed resource hash before decoding/decrypting protected material. A mismatch or legacy unbound envelope is refused. This binds the local operator-approved credential record to the attested resource; it does not remotely prove that a pasted key belongs to that Azure resource. The operator must verify the key source, actual account and SKU.

The runner loads the key only after all account, source, lock and aggregate-cap checks. It invokes PowerShell with no credential in arguments/environment, captures the private stdout pipe without echoing it, and supplies the key only as the official HTTPS subscription-key header. The expected resource hash comes from the immutable validated account snapshot and is passed to the private reader; the key never appears in those arguments. Plaintext necessarily exists briefly in process memory; JavaScript cannot promise perfect memory erasure. No key or raw provider exception/body/header is persisted in provenance.

## Explicit dispatch and resume

A single invocation dispatches exactly one named immutable job. Inspect offline plan to choose its ID. After all gates are satisfied, the operator uses:

```powershell
node scripts/volabi-auditions/runner.mjs execute --account 'C:\private\confirmed-development-account.json' --job adam-role --round 1 --attempt 1 --confirm 20261022-azure-development-15
node scripts/volabi-auditions/runner.mjs status
```

There is no automatic batch, retry or fallback provider. To process additional candidates, explicitly invoke each planned job after inspecting the prior receipt. A non-audio outcome returns a nonzero exit code. Repeating the same job/round/attempt returns its prior result without another credential read or request. Even a prior failure/timeout cannot silently dispatch again. An explicitly reviewed retry uses a NEW attempt number, consumes another full reservation and remains inside the same aggregate limits. Round must be 1, 2 or 3; attempt numbers are positive integers, never an exemption from the caps.

All durable state, immutable payload snapshots and actual WAV files go to the FIXED current-user path %LOCALAPPDATA%\Primora\VolabiAuditions\20261022-azure-development-15. The CLI provides no state-root override. Never use another Windows user/machine/path or another utility for this approval without a separately reconciled continuation: local accounting cannot track parallel tools/accounts. The test-only injected storage paths are outside isolated fixture projects.

## Accounting and recovery

The exclusive cross-process lock is held across credential load, reservation, the request and result recording. Before each possible POST, a hash-chained append-only journal reservation is written, fsynced and closed. Full immutable UTF-8 payload bytes conservatively cover every code point in current Arabic/Latin SSML, plus all tags/whitespace, including speak/voice tags even though those tags are excluded from provider billing. Han characters are rejected because of the documented double billing weight. There is no spoken-text-only counter or free retry.

The runner adds non-request fee bounds once and rounds each maximum request cost upward to integer micro-SAR. It refuses a reservation exceeding 100,000 aggregate units or SAR10. Every failed, rejected, interrupted, unknown or no-audio attempt remains fully reserved. Provider redirects are manual/refused; the key never follows them. Audio must be a bounded, complete PCM mono 24kHz 16-bit WAV and is saved with a hash and matching source/voice/endpoint/account-evidence provenance. Audio saving is not native acceptance.

A process crash can leave execution.lock. No stale-lock timeout deletes it. The operator first confirms no runner is alive, audits the complete journal and account status, and only then may remove that lock. A prior reservation without a final result stays UNKNOWN and is never resubmitted on resume. It counts against the cap forever in this runner, even if no audio exists. The test suite's manual lock removal is confined to an isolated killed-process fixture. Truncated/corrupt/reordered journals, changed source/account policy or tampered/missing saved audio fail closed. Existing artifacts with a missing ledger, or artifacts not accounted for by reservations, block reinitialization/dispatch; do not keep unrelated notes/account JSON inside the fixed state directory. Do not repair journals by guessing, clearing reservations or resetting paths. Inconsistent durable state requires operator review; a changed approval needs a separately designed continuation that carries prior totals.

Local guards run before file access and are rechecked at the normal trust boundaries; they do not promise protection against a malicious same-user process racing path replacements after a check. File fsync plus an append-only journal protects normal interruption; it is not a transactional remote gateway or a guarantee against disk destruction, malicious local edits, backups restored to old states, changed provider tariffs or unrelated account charges. Azure alerts are not a hard invoice stop. The <=SAR10 dispatch bound holds only for this runner under verified maximum all-in assumptions. If those assumptions cannot be bounded, do not execute.

## Primary technical sources (verified 22 October 2026)

- [Official REST synthesis API](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech): regional endpoint, subscription-key authentication, SSML request and WAV response format.
- [Official billable character rules](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech#billable-characters): markup/whitespace count, Chinese-character weighting and charging after successful processing even without audio.
- [Official voice catalog](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts): candidate IDs; availability is separate from native quality.
- [Windows drive classification](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getdrivetypew) and [DOS-device mapping](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-querydosdevicew): local fixed-volume checks before path traversal.
- [Azure Retail Prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices): public-reference evidence only; actual account pricing and applicable terms must be verified separately.

Independent offline review passed: 31 owner cases plus 7 independent cases, 38/38 combined on Windows. Actual account, DPAPI/key setup, Azure audio and native acceptance remain held.

Next step: verify the named development account evidence and maximum all-in fee bounds, then arrange masked resource-bound local key setup before any explicit approved dispatch.

Ready-to-send prompt: Confirm the actual development resource, terms, candidate availability and maximum all-in SAR charges for the independently reviewed audition runner. After the gates pass, request masked local key entry and generate the approved jobs within the fixed shared ledger. Keep actual native scores pending.
