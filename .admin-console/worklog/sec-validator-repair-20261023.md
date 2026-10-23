# Independent validator repair security pass - 23 October 2026

Mode: repair review. Reviewer: sec-validator-repair-independent (development-only). Scope: repository-local validator candidate, evidence resolution and bounded context classification. This is not a full console security acceptance or production release approval.

## Threat model

The relevant malicious actor is an author who can edit a manifest or its cited files and wants a passing structural gate without real implementation evidence. Inputs include manifest path references, executable test bodies, JSON review claims, reviewed-source hashes and filesystem aliases. Risks include claiming production fallback data is a fixture, burying positive fake-data claims in negative prose, placing assertion or capability tokens in comments or strings, and reading a truncated or out-of-root file as accepted evidence.

The independent pass leaves the installed global validator and original regression tests unchanged. It exercises the public CLI, not an alternate helper implementation. Twenty-three adversarial groups were prepared before candidate freeze. Candidate execution and acceptance remain pending.

## Preserved baseline

The historical delivered gate was 313 errors/29 warnings. The current manifest was deliberately changed by root for the separate Headquarters citation repair: hq-local.request-review-loop is now in-progress. The unchanged installed validator therefore reports 305 errors/29 warnings: nine prior Headquarters evidence/token diagnostics are replaced by one unresolved-status diagnostic. This is not a validator improvement. The fifteen held-checkout evidence-context diagnostics remain.

Installed script SHA256: 7bf69a8383b32749ad1b855f312e24fad3cb786b5f552f60abb3580ce641d316. Original tests and verbatim vendored upstream tests SHA256: 472045c15f0138762886950c406ef548aec0646b30691a11e5001fff170b05bf. Comparison manifest SHA256: 5d995882da2a976ec6e903ca3195494e3c06a228b55c5a9de5293be906c4e4cc.

Evidence: .admin-console/evidence/validator-repair-20261023/independent-original-release.json, independent-original-release-receipt.json, independent-comparison-manifest.json. The comparison snapshot is immutable for this pass; root will rerun both versions on the final restored Headquarters model.

## Authority

Azure account and speech synthesis remain deferred. No business employee activation, permission grant, production deployment/merge, hosted data write, provider call, financial transaction, credential request or paid service is part of this review.

## Final disposition

Accepted for bounded project-local use after source refreeze; this does not pass the regulated release gate. Initial HIGH runtime-directory isolation bypass was reported without reviewer self-fix, then repaired by the implementer. All25 independent adversarial CLI groups pass with zero failures/skips. The initial two independent fixture representation/hash errors are disclosed separately. A real Windows junction verifies outside-root rejection after ordinary symlink privilege denial.

Same frozen manifest: original305errors/29warnings, candidate288errors/29warnings, both exit1; exactly17false-positive/dependent diagnostics removed and zero findings added. Fifteen belong to held checkout and two to existing references of the isolated Headquarters HTTP UUID fixture. No genuine release defect was removed. Global script and verbatim upstream tests are unchanged. Final root restoration of the separate Headquarters capability requires a new paired gate run; current counts cannot be reused as that result.

Full source hashes, source-review assertions, unchanged rule checks, boundary limitations and holds are in independent-review.json. No production, business or financial authorization is granted by this local review.
