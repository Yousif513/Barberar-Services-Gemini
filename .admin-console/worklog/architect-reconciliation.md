# Architect reconciliation

Mode: repair. Profile: regulated. Plan of record: direct CEO approval of the previously presented incremental plan, starting with branch/schema reconciliation, then booking/payment repairs. Production deployment, company agent activation and external financial transactions remain held.

The isolated foundation contains master plus two booking/account commits. All 210 original migrations match across current master, foundation and Claude. Gemini is 343 commits behind master; its two untracked P3 migrations match the chosen chain and must not be replayed. Existing branch `codex` prevents the preferred slash prefix, so preserve it and use `codex-booking-payment-reconciliation`.

Build order: retain existing authorization/audit spine; append the exact-charge refund repair, then existing calendar save closure and checkout fail-closed guards. No new permissions, roles, prices, commission rates or legal assumptions. No new admin screens. Independent cross-review and executing tests precede branch publication. Plan validation: exit 0, 23 pre-existing warnings.

Next action: implement the two bounded repair slices, then independently review charge binding, refund limits, and failed-save behavior.
