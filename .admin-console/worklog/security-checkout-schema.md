# Independent SQL/security review - durable checkout

Reviewer: security-checkout-schema (root adopting a separate review pass). Date: 2026-10-22. Profile: regulated.

The SQL implementation was authored by server_hq_audit. This reviewer did not edit the migration or its checkout tests; root's Edge implementation is outside this SQL signoff and has its own independent reviewer. Read the complete new table/trigger, canonical payable snapshot, claim/read/record/unknown commands and actual executing role/receipt tests.

The source enforces service-only definer commands with a fixed empty search_path, no direct client or service table access, actual payer and payable validation, frozen authoritative amount/provider/SAR and gateway context, immutable exact request text/hash, one insertion-owned dispatch under the target lock, no stale lease reclaim, monotonic captured receipts and late-capture quarantine. Read access remains privileged and audited. Full-chain grant and standard administrator audit invariants are retained without opening raw table writes. Capture receipts alone do not execute new refunds.

Finding S1: record_checkout_attempt copied unknown provider status text into permanent audit details. Reported to the SQL author, who replaced that audit field with a documented allowlist or UNRECOGNIZED while retaining private evidence. Its sentinel regression first reproduced the leak, then passed. Root reread the final expression, admin maintenance sanitizer and complete tests. The trigger records field names and typed structural evidence only; raw wire/contact/URL/status sentinels stay absent from all target audit entries.

Independent command: node --test --test-concurrency=2 supabase/tests/db/checkout_attempts.test.mjs supabase/tests/db/qa_defect_fixes.test.mjs supabase/tests/db/data_api_grants.test.mjs supabase/tests/db/checkout_schema_contract.test.mjs. Exit 0:81/81 pass,23 suites, no skipped/cancelled cases. This includes33 checkout tests and4 actual handler/full-schema integration cases. The global network blocker is retained in the handler fixtures.

Disposition: no unresolved critical/high source defect found in this bounded command/receipt review. The independent full database rerun is recorded by the parent, not presumed green here. PGlite serializes a connection; its interleaved-claims case does not establish hosted multi-session behavior. The actual Deno/PostgREST deployment and Tap sandbox are not verified. No real financial transaction is an acceptance requirement of this local review.

Release dependency CHECKOUT-PRIVATE-WIRE-LIFECYCLE remains high: the immutable wire contains payment contact data and is not integrated into adopted privacy export/erasure/retention/hold controls. No retention duration, legal exception, destructive cleanup or business authorization was invented. Operator unknown-outcome recovery is also a separate open capability. This review does not clear production or the full regulated console.
