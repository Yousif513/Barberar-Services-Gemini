# HQ-NEXT-03 — verified local synthetic recovery tooling

A developer can create an encrypted backup of a marked synthetic HQ instance, authenticate/inspect the portable package, and rebuild its historical records into a separate inert location with a verification report. This completes the approved fixture-only development slice. The full management Headquarters remains under development; real HQ backups/restores, live replacement and founder-seat reclamation were neither performed nor enabled.

## Delivered control and boundaries

Three local CLI operations, zero new web routes or overlays, using the existing local store invariants. Start with `npm run hq:recovery -- --help`; the exact command and custody contract is in [volabi-recovery-contract.md](volabi-recovery-contract.md). Interactive passphrases are masked, never argument/environment inputs. Capture requires a separate synthetic marker plus matching workspace proof records, opens the source read-only and refuses live/project roots. All destinations are new owned locations outside the repository/live instance.

The encrypted package preserves all fixture workspaces and all task/source/recommendation/decision/follow-up, project/milestone/closure and Council record kinds, every historical version, exact text/citations, command receipts, complete events and event allocator state. Compatible opaque kinds are retained; unsupported schemas refuse. A coherent native SQLite cut includes committed WAL data without including an open transaction. A fresh sanitized rebuild excludes session rows and native session pages. AES-256-GCM/scrypt has fixed bounded parameters and authenticated format metadata; wrong passwords or damaged packages refuse before payload interpretation/extraction. There is no scheduled job, cloud storage, external integration, account login or business executor.

A portable package is three files kept together: backup.vhq, receipt.json and journal.json. A failed/incomplete completion chain is unusable. Restore produces only the inert database, inert marker and two redacted completion files; HqStore refuses the marker and the reserved database identifier, including a moved database without its sidecar marker. Historical decisions retain their exact old meaning and confer no new authority. Reports expose counts, hashes and explicit limitations, never source bodies or passwords. All temporary native main/journal/WAL/SHM files are accounted for; cleanup failure cannot report success.

The existing OS owner is the development operator. This does not grant a Headquarters employee a permission, prove CEO identity or create a production access-control system. All 15 original management identities and their role/media/skill associations remain inactive and unchanged. No actual meeting, speech, attendance, finance or refund execution is inferred.

## Verification and independence

| Check | Result and evidence |
|---|---|
| Owner recovery cases | 6/6 pass, zero skips; RFC7914 scrypt and NIST AES256-GCM known answers, capture/sanitization/envelope, exact artifacts and failures. Owner final transcript under hq-recovery-owner. |
| Independent recovery QA | 25/25 pass, zero skips; rich two-workspace fixture, all 11 product kinds plus opaque kinds, exact history/source/citation/privacy pins, actual 500-command writer overlap, open transaction exclusion, corruption and intended refusal codes. |
| Independent security | 11/11 pass after repairs, zero skips; Windows ACL/junction/hardlink, complete publication binding, physical session exclusion, authentication/size/KDF bounds, partial disk-write fault, denied writes, exact artifact inventories and cleanup. |
| Supplemental chronology | Exact hidden rowids/columns and actual read-only Council selector match before/after restore; permitted control remains visible and newer restricted classification remains absent. No restored session or HqStore created. |
| Existing web regressions | 1078/1078 pass, 170 suites, zero failures/skips. The full 73-file web test set is partitioned into 70 existing files and the three separately executed recovery suites: 1120 tests total, none omitted or disabled. |
| Python tooling regressions | 136/136 pass: original 73 upstream cases unchanged, earlier evidence-context cases, nine new owner CLI-interface cases and eight independently authored adversarial cases. |
| Application checks | Mobile typecheck, Next web build and full web ESLint exit 0. ESLint retains 302 existing warnings; build retains four filesystem tracing warnings and provider-sitemap fetch warning. |
| Real Windows terminal | Final synthetic create exit 0, masked/no echoed passphrase, exact three final files; separate Ctrl+C refusal creates no output. Canonical checked cleanup removed only our owned temporary fixture roots. |

Implementation, QA and security are distinct development workers. The manifest's reviewedBy is qa-hq-recovery. Fresh independent source hashes and root source/test freezes match; no self-review is substituted. See [.admin-console/evidence/hq-recovery-independent/independent-review.json](../.admin-console/evidence/hq-recovery-independent/independent-review.json), [security review](../.admin-console/evidence/hq-recovery-security/source-review.json) and [complete test partition](../.admin-console/evidence/hq-recovery-root/web-test-partition.json).

Two HIGH defects were corrected and independently retested: an encrypted file could previously be consumed before its success journal existed; readonly native SQLite inspection left WAL/SHM files while reporting cleanup complete. Initial passing receipts were explicitly superseded when the latter physical-artifact defect was discovered. Failed probes and the corrected test harness timing/setup assumptions remain in evidence. No claim is made that session canary bytes were observed in the old sidecars.

## Delivery-tool reconciliation and release status

The approved item is CLI-only, whereas the prior manifest model required web routes/screens for every implemented capability. An independently reviewed project-local extension now requires explicit interfaceKind=cli, a bounded ordinary project-local cliEntrypoint, exact server operation binding, empty web routes and no web screen. It retains all policy, audit, safeguards, test/evidence, independent-review and default-web checks. Add/set validate actual before/after project-root context. No invented screen, forced write or validation waiver was used. Original installed tooling remains unchanged; schema/provenance/initial and incremental patch records are retained in tools/adminwright.

Profile: regulated. Plan and structural coverage exit 0. The complete regulated release gate still exits 1. Current exact counts, raw findings and the same-manifest installed-tool comparison are recorded under .admin-console/evidence/hq-recovery-root/manifest-*. No production-readiness claim or production merge/deployment is made. Verified new scanner context findings are retained and independently classified; genuine global backlog findings remain unresolved.

Three learning observations were banked in the existing local store: physical SQLite artifact inventory, truthful CLI applicability and intended-boundary negative tests. No global skill guidance was automatically adopted, exported or synced. Development claims are released and current workers are done.

## Limits and remaining approvals

Git's dirty flag in package provenance covers tracked files only (`--untracked-files=no`). Per-file hashes independently cover included dependencies, including newly added files; a clean dirty flag does not certify that every dependency was committed. External skill hashes are references, not installed content or competency evidence. Missing/mismatched/unverified dependencies are an explicit blocked full-fidelity result. No models, voices, global-home contents or credentials are imported.

Source text is preserved exactly and can contain sensitive user-entered prose; this is not automatic DLP. The encryption secret is separate from the files; loss of the secret means no recovery. Same-disk storage is not disk-loss redundancy. No creator identity, legal signature, forensic erasure, historical completeness against a coherently malicious OS owner, production RPO/RTO or account-seat recovery is certified.

Real-data capture/restoration, live replacement/merge, secure founder-seat reclamation and missing-live-database detection remain separately scoped prerequisites. Production deployment/merges, management activation, business permissions, external business writes, financial transactions and new paid/native-review services remain held. Azure setup/audio remains deferred. Saudi male/Lebanese female voice preferences and the original single SAR10 all-in / 100,000 aggregate characters / at most three rounds allowance are preserved without reset.

Recommended next item: prepare the secure local founder-seat continuity and missing-database detection scope before implementation. Recommended model: GPT-6.1-sol, high effort; separate security review xhigh.

Ready-to-send prompt: Prepare HQ-NEXT-04: secure local founder-seat recovery and missing-database detection. Define ownership verification, session rotation, isolation, audit history and acceptance criteria before building. Do not access, back up or restore real HQ data. Keep management agents inactive, Azure deferred and every existing approval hold. State the recommended model and effort.
