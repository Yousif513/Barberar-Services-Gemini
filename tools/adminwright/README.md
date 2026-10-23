# Project-local Adminwright evidence and interface validation

Project-local validator for PRIMORA, accepted and adopted 2026-10-23 after separate independent review: 25/25 adversarial groups, zero failures/skips. The installed global validator remains unchanged. Both original and local full release gates still fail. Acceptance receipt: `.admin-console/evidence/validator-repair-20261023/independent-review.json`.

The validator is vendored from the installed Adminwright snapshot, not an inferred upstream version/commit. `PROVENANCE.json` records every copied file's original and candidate raw SHA256, exact Apache-2.0 `LICENSE`/`NOTICE`, and dependencies (Python standard library only). `UPSTREAM_PATCH.diff` retains the original evidence-repair delta. `CLI_INTERFACE_PATCH.diff` is the later incremental project-local CLI/schema delta from commit bf8c233; provenance records both separately. The incremental patch has zero context lines; use `git apply --unidiff-zero` against that base. This retains exact source changes without whitespace-only diff context lines. The original 73-case `tests/test_manifest.py` is byte-identical. Only schema/template assets needed by this command/test scope are vendored; this is not a global skill install.

## Reproduce locally

From the repository root:

```powershell
python -m unittest discover -s tools/adminwright/tests -p test_manifest.py -v
python -m unittest discover -s tools/adminwright/tests -p test_evidence_context.py -v
python tools/adminwright/scripts/admin_console_manifest.py validate --manifest .admin-console/manifest.json --project-root . --phase release
python tools/adminwright/scripts/admin_console_manifest.py coverage --manifest .admin-console/manifest.json --project-root .
```

The repository completion gate now uses this project-local copy. `npm run test:admin-validator` runs all 136 owner, unchanged upstream and independent groups; `npm run validate:admin-console` and `npm run coverage:admin-console` expose its release and structural gates. Passing validator tests does not establish release readiness. Validate/coverage do not mutate the manifest. The original installed tool remains available only for paired regression comparison.

## Exact repair contract

A cited test must already be in an explicit tests/policyTests field, resolve inside this project, name a recognized JS/TS/Python test file, and contain a statically recognized assertion call. Imports, comments, regex/string examples and Markdown are not assertions. The source code is never executed by the validator. At regulated profile, capability/screen links use executable code and call-argument context instead of comments/import strings/unrelated constant literals. Queue tests must mention the queue or a linked capability operation/route.

Before classifying evidence, each validation inventories existing repository paths named by `sourceOfTruth`, `dataBinding` and `dataSources` (including integrations and directory bindings). Those runtime-bound files are always scanned strictly even if they also live in a test directory. Unknown test syntax fails closed.

Only isolated recognized executable tests gain two narrow content treatments: the exact standard `randomUUID` identifier/zero-argument template interpolation, and literal/regex arguments inside `assert.doesNotMatch`. A positive `mockUsers` fallback or arbitrary fixture identifier stays blocked. This does not certify test isolation transitively through every possible import graph; independent review must still assess the actual implementation and tests.

Only JSON files under `.admin-console/evidence/` with an explicit SOURCE REVIEW classification, named reviewer, source_assertions strings and current canonical source-file hashes gain negative-prose context. Every source path must remain inside the project and every declared canonical hash must match current strict UTF8/CRLF-to-LF bytes. The exception masks only a short no/without sample/mock/fake/stub/placeholder data/fallback clause, or the exact phrase `not widening or sample fallback`. It does not blank the sentence/document. Code fragments and all other fields remain strict, so a denial plus a positive mock fallback elsewhere still fails. Plain notes, stale hashes, runtime source paths and unknown report shapes retain the original strict behavior.

Evidence is read completely up to 512KiB; oversized or invalid UTF8 files fail explicitly. The original first-512KiB truncation and replacement-decoding acceptance are not retained. Directory, empty, missing, traversal and symlink escapes remain rejected.

This is a deterministic structural floor. A matching operation in a test title is retained for upstream compatibility and cannot prove the assertion exercises that operation. A source review hash establishes a current-file link, not that the review happened. Test execution, negative mutation proof, source review and operator/browser acceptance remain separate required evidence. No test outcome, capability status, permission, employee activation or production authorization is inferred or changed.

## Owner evidence and limitations

`RED.txt` records 16 initial regression groups against the unchanged upstream copy (13 failing results/subtests). The first implementation pass revealed a Windows CRLF hash mistake in the isolated review fixture; that fixture was corrected and `RED_CORRECTED_REVIEW.txt` independently confirms the original gate still rejects the now-valid review. `RED_ADDITIONAL.txt` records queue/dotted-call binding failures. `RED_FINAL_CONTEXT.txt` records real UUID-template and semicolon review-prose failures; its template fixture needed an explicit screen-route title after the content fix, because an unrelated screen is correctly refused. `GREEN.txt` records all 21 final owner groups passing. No setup error is presented as a product defect.

`UPSTREAM_TESTS.txt` records the 73 unchanged upstream cases. `original-release.json`, `candidate-release.json` and `release-comparison.json` preserve the same manifest comparison, including unresolved real baseline defects; no finding is waived and no gate is forced green. Historical 313/298 counts used a prior manifest; current same-manifest counts must be read from the comparison receipt. Separate independent review owns its tests/receipt. That pass found a genuine high-severity bare runtime-directory/root-file/absolute-path overlap bypass in the first candidate. `RED_RUNTIME_BINDINGS.txt` records five failing owner subcases before the inventory-layer repair; the new complete-value-first resolution fixed those cases without disabling the bounded fixture feature. Final source freeze and independent acceptance remain separate from owner verification.

No application/HQ/payment logic, database schema, credential, business action, paid service, global skill or installed gate was modified by this repair. Azure account setup/audio remains deferred and all existing holds remain.

## Explicit CLI interface applicability — HQ-NEXT-03

The approved recovery tooling has zero web routes. `interfaceKind: cli` requires an exact `cliEntrypoint` in serverOperations: a nonblank bounded ordinary UTF8 executable source file within this project. Traversal, absolute paths, links/reparse points/hardlinks, missing/oversized files, web routes/screens and unknown interface kinds fail. Only the inapplicable web-route/screen-anchor requirement is replaced by this checked command entrypoint. Add/set write guards resolve the actual manifest project root for both the before and after validations, so missing CLI files cannot be admitted during incremental writes. Default web interfaces and all role, policy, audit, safeguards, idempotency, independent reviewer, executable test/evidence and runtime-source overlap checks remain. Coverage validates CLI files with its project-root context; direct rootless render helpers conservatively report unverified CLI entrypoints.

Nine owner regression groups start red against the previous validator; eight independently authored adversarial groups verify actual Windows filesystem paths and preserved critical security/evidence gates. Independent acceptance: `.admin-console/evidence/hq-recovery-security/cli-validator-review.json`. The installed global validator and original 73 upstream tests remain unchanged. Full-console release findings are retained; explicit CLI applicability is not a waiver or production-readiness claim.
