# Independent capture and calendar review

Mode: repair review. Profile: regulated. Agent: security-reconciliation (root, independent of the capture and calendar implementers).

Re-read the final migration, canonical confirm_booking_payment and booking_captured_amount definitions, prior wallet patch, the focused executing test file and calendar diff. The migration changes only three one-occurrence verified blocks. CREATE OR REPLACE retains the existing pinned search path/security; explicit grants keep capture confirmation service-only. The booking row lock, exact deposit comparison and charge uniqueness checks remain intact. The new request uses the newly inserted ledger identity and exact charge, preserves canonical refund.requested audit evidence and returns the same identity on replay. Ordinary refund/cancellation sources are untouched. The captured-amount helper excludes only a ledger linked to late_payment_conflict across every refund state.

Twelve executing regressions cover exact charge/ledger separation, exhaustion of the old payment, replay, same-charge reuse on another booking, refund claim limits, unknown quarantine, completing only the duplicate ledger, audit idempotency, anon/customer/provider rejection, amount mismatch rollback, four cancellation refund states and no-show accounting against existing provider percentages. No new numeric business rule was selected.

Calendar review found missing Save/feedback in the original flow, lossy fallback and subsequent draft/context races. The separate implementer closed them and verified English/Arabic failure, input retention, explicit real database retry, pending-state guards and refresh behavior. The roster feedback and existing RTL/theme were visually inspected in Arabic failure and English success captures. The initial-read and stale-response gates are included in the final browser run.

No introduced unresolved high/critical finding in this bounded patch. This does not clear the pre-existing contested refund capability or full regulated console. Durable checkout attempts, actual environment/provider evidence, historical misbound rows and broader release gaps remain open. No production action or financial API request was performed.

Next action: QA records the final aggregate checks and retains the production hold.
