# Independent review: checkout repair branch deployment hold

Date: 2026-10-22. Reviewer: `server_hq_audit`. Author of the reviewed change: root; this reviewer did not implement it.

Scope: the current diff in `web_platform/scripts/vercel-ignore-build.mjs` and `web_platform/tests/vercel-ignore-build.test.mjs`. Checked the repository-root and web-workspace `vercel.json` ignore-command wiring. No product/client files, SQL, Edge code, permissions, secrets, remote settings, or review-authority records were modified in this pass.

## Disposition

No actionable finding in the bounded change. The exact Git ref `codex-booking-payment-reconciliation` now returns `skip` before the environment decision, credentials/Git metadata processing, and remote check requests. The existing script entrypoint translates `skip` to exit 0. The hold applies to that branch in preview, production, and development contexts, including when the existing production release switch is enabled and CI would otherwise be green.

The change introduces no bypass, environment variable, credential, or global configuration. For every other ref, control flow continues through the unchanged existing logic. Production still requires the existing `PRIMORA_PRODUCTION_RELEASE=enabled` switch, deployment Git metadata, and successful required checks; unreadable GitHub responses, failed checks, or a deadline with incomplete checks still skip. Unrelated previews retain their existing build behavior. Both checked-in Vercel configurations already invoke the script and were unchanged.

This prevents this branch's clients from being automatically exposed through the checked-in build path while the legacy hosted checkout protocol remains incompatible with `action: recover`. Removing the hold remains part of the separate coordinated backend/client acceptance and owner-approved release; this review does not grant that approval.

## Independent verification

Executed from `web_platform`:

```powershell
node --test tests/vercel-ignore-build.test.mjs
```

Result: **19 tests passed, 0 failed, 0 skipped; exit 0**. All three new branch-hold tests assert both the skip verdict and zero requests to the injected GitHub fetch implementation. Existing production-switch, green/failing/missing/running check, timeout, remote-error, check-override, and token-scoping cases also passed. The tests use injected fake fetch implementations and an advancing fake clock; no remote checks or provider operations were performed.

`git diff --check -- web_platform/scripts/vercel-ignore-build.mjs web_platform/tests/vercel-ignore-build.test.mjs` exited 0.

Limits: this is source and local regression verification of the checked-in ignored-build command. No Vercel project settings were inspected or changed, no external service was contacted, no deployment was attempted, and no claim is made that this command governs alternate/manual deployment mechanisms. No broader production readiness or release approval is implied.
