# Test plan

Every unchecked box is missing coverage. Negative tests are not optional.

## entity: provider

- [ ] fixtures exist for every lifecycle state: pending, approved, rejected, suspended, active
- [ ] cross-tenant read and write of provider is rejected server-side

### provider.list (query, risk low)

- [ ] positive: `admin` achieves "Find providers by name, status and verification state so onboarding backlog and suspensions are visible"
- [ ] negative: `provider-owner` is rejected by the server for provider.list
- [ ] negative: `provider-employee` is rejected by the server for provider.list
- [ ] negative: `customer` is rejected by the server for provider.list
- [ ] negative: an unauthenticated request to supabase/migrations/20261005120000_admin_provider_operations.sql#L21, supabase/migrations/20261005120000_admin_provider_operations.sql#L62, supabase/migrations/20261011140000_secfix2_mediums_lows_personal_reads.sql is rejected
- [ ] precondition: the operation is rejected from states outside pending, approved, rejected, suspended, active

### provider.approve (command, risk high)

- [ ] positive: `admin` achieves "Verify a provider so its shops become bookable"
- [ ] negative: `provider-owner` is rejected by the server for provider.approve
- [ ] negative: `provider-employee` is rejected by the server for provider.approve
- [ ] negative: `customer` is rejected by the server for provider.approve
- [ ] negative: an unauthenticated request to supabase/migrations/20261005120000_admin_provider_operations.sql#L130 is rejected
- [ ] audit: supabase/migrations/20261005080000_release_gap_controls.sql#L69 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (Repeating the status already in force returns unchanged without writing.)
- [ ] safeguard: supabase/tests/db/provider_operations.test.mjs#L126 blocks the unconfirmed path
- [ ] recovery: Every move except reject is reversible through another command; rejection can be reopened to pending. restores the prior state
- [ ] concurrency: The provider row is locked FOR UPDATE for the check and the write.

### provider.reject (command, risk high)

- [ ] positive: `admin` achieves "Reject a provider application with a recorded reason"
- [ ] negative: `provider-owner` is rejected by the server for provider.reject
- [ ] negative: `provider-employee` is rejected by the server for provider.reject
- [ ] negative: `customer` is rejected by the server for provider.reject
- [ ] negative: an unauthenticated request to supabase/migrations/20261005120000_admin_provider_operations.sql#L130 is rejected
- [ ] audit: supabase/migrations/20261005080000_release_gap_controls.sql#L69 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (Repeating the status already in force returns unchanged without writing.)
- [ ] safeguard: supabase/tests/db/provider_operations.test.mjs#L126 blocks the unconfirmed path
- [ ] recovery: Every move except reject is reversible through another command; rejection can be reopened to pending. restores the prior state
- [ ] concurrency: The provider row is locked FOR UPDATE for the check and the write.

### provider.suspend (command, risk critical)

- [ ] positive: `admin` achieves "Suspend a provider so it stops taking bookings, without deleting its history"
- [ ] negative: `provider-owner` is rejected by the server for provider.suspend
- [ ] negative: `provider-employee` is rejected by the server for provider.suspend
- [ ] negative: `customer` is rejected by the server for provider.suspend
- [ ] negative: an unauthenticated request to supabase/migrations/20261005120000_admin_provider_operations.sql#L130 is rejected
- [ ] audit: supabase/migrations/20261005080000_release_gap_controls.sql#L69 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (Repeating the status already in force returns unchanged without writing.)
- [ ] safeguard: supabase/tests/db/provider_operations.test.mjs#L126 blocks the unconfirmed path
- [ ] recovery: Every move except reject is reversible through another command; rejection can be reopened to pending. restores the prior state
- [ ] concurrency: The provider row is locked FOR UPDATE for the check and the write.

### provider.set-commission (command, risk critical)

- [ ] positive: `admin` achieves "Change a provider's commission percentage"
- [ ] negative: `provider-owner` is rejected by the server for provider.set-commission
- [ ] negative: `provider-employee` is rejected by the server for provider.set-commission
- [ ] negative: `customer` is rejected by the server for provider.set-commission
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: - records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: - blocks the unconfirmed path
- [ ] recovery: - restores the prior state
- [ ] precondition: the operation is rejected from states outside approved, active

### provider.delete (command, risk critical)

- [ ] positive: `admin` achieves "Remove a provider record"
- [ ] negative: `provider-owner` is rejected by the server for provider.delete
- [ ] negative: `provider-employee` is rejected by the server for provider.delete
- [ ] negative: `customer` is rejected by the server for provider.delete
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: - records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: - blocks the unconfirmed path
- [ ] recovery: - restores the prior state
- [ ] precondition: the operation is rejected from states outside pending, approved, rejected, suspended, active

### provider.notes (command, risk low)

- [ ] positive: `admin` achieves "Attach an internal note to a provider case"
- [ ] negative: `provider-owner` is rejected by the server for provider.notes
- [ ] negative: `provider-employee` is rejected by the server for provider.notes
- [ ] negative: `customer` is rejected by the server for provider.notes
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: supabase/migrations/20261005080000_release_gap_controls.sql#L69 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] precondition: the operation is rejected from states outside pending, approved, suspended

### provider.vat-status (command, risk critical)

- [ ] positive: `admin` achieves "Capture and validate provider VAT registration status at onboarding"
- [ ] negative: `provider-owner` is rejected by the server for provider.vat-status
- [ ] negative: `provider-employee` is rejected by the server for provider.vat-status
- [ ] negative: `customer` is rejected by the server for provider.vat-status
- [ ] negative: an unauthenticated request to supabase/migrations/20261010340000_money_effective_fee_and_vat_status.sql#L75 is rejected
- [ ] audit: supabase/migrations/20261010340000_money_effective_fee_and_vat_status.sql#L108 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (setting the same status again is harmless)
- [ ] safeguard: supabase/tests/db/money_fee_terms_vat.test.mjs#L65 blocks the unconfirmed path
- [ ] recovery: the owner sets the status again restores the prior state
- [ ] concurrency: FOR UPDATE on the provider row

## entity: branch

- [ ] fixtures exist for every lifecycle state: active, inactive
- [ ] cross-tenant read and write of branch is rejected server-side

### branch.list (query, risk low)

- [ ] positive: `admin` achieves "See every venue and its activation state"
- [ ] negative: `provider-owner` is rejected by the server for branch.list
- [ ] negative: `provider-employee` is rejected by the server for branch.list
- [ ] negative: `customer` is rejected by the server for branch.list
- [ ] negative: an unauthenticated request to supabase/migrations/20261011140000_secfix2_mediums_lows_personal_reads.sql is rejected
- [ ] precondition: the operation is rejected from states outside active, inactive

### branch.toggle-active (command, risk high)

- [ ] positive: `admin` achieves "Take a venue offline"
- [ ] negative: `provider-owner` is rejected by the server for branch.toggle-active
- [ ] negative: `provider-employee` is rejected by the server for branch.toggle-active
- [ ] negative: `customer` is rejected by the server for branch.toggle-active
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: supabase/migrations/20261005190000_audit_values_by_allow_list.sql#L13, supabase/migrations/20261006000000_attach_admin_audit_trigger_helper.sql#L37 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: web_platform/src/app/admin/branches/page.tsx#L114 blocks the unconfirmed path
- [ ] recovery: Reactivate the branch with the same control. restores the prior state
- [ ] precondition: the operation is rejected from states outside active

## entity: service

- [ ] fixtures exist for every lifecycle state: active, inactive
- [ ] cross-tenant read and write of service is rejected server-side

### service.list (query, risk low)

- [ ] positive: `admin` achieves "Review the whole marketplace catalog and spot mispriced or duplicated services"
- [ ] negative: `provider-owner` is rejected by the server for service.list
- [ ] negative: `provider-employee` is rejected by the server for service.list
- [ ] negative: `customer` is rejected by the server for service.list
- [ ] negative: an unauthenticated request to - is rejected
- [ ] precondition: the operation is rejected from states outside active, inactive

### service.upsert (command, risk moderate)

- [ ] positive: `admin` achieves "Create or correct a catalog entry"
- [ ] negative: `provider-owner` is rejected by the server for service.upsert
- [ ] negative: `provider-employee` is rejected by the server for service.upsert
- [ ] negative: `customer` is rejected by the server for service.upsert
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: supabase/migrations/20261005190000_audit_values_by_allow_list.sql#L13, supabase/migrations/20261006000000_attach_admin_audit_trigger_helper.sql#L37 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] precondition: the operation is rejected from states outside active, inactive

### service.toggle-active (command, risk moderate)

- [ ] positive: `admin` achieves "Take a service off sale without deleting it"
- [ ] negative: `provider-owner` is rejected by the server for service.toggle-active
- [ ] negative: `provider-employee` is rejected by the server for service.toggle-active
- [ ] negative: `customer` is rejected by the server for service.toggle-active
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: supabase/migrations/20261005190000_audit_values_by_allow_list.sql#L13, supabase/migrations/20261006000000_attach_admin_audit_trigger_helper.sql#L37 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] precondition: the operation is rejected from states outside active

### service.set-price (command, risk high)

- [ ] positive: `admin` achieves "Change a service base price"
- [ ] negative: `provider-owner` is rejected by the server for service.set-price
- [ ] negative: `provider-employee` is rejected by the server for service.set-price
- [ ] negative: `customer` is rejected by the server for service.set-price
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: supabase/migrations/20261005190000_audit_values_by_allow_list.sql#L13, supabase/migrations/20261006000000_attach_admin_audit_trigger_helper.sql#L37 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: web_platform/src/app/admin/services/page.tsx#L290 blocks the unconfirmed path
- [ ] recovery: - restores the prior state
- [ ] precondition: the operation is rejected from states outside active, inactive

### service.delete (command, risk high)

- [ ] positive: `admin` achieves "Remove a catalog entry"
- [ ] negative: `provider-owner` is rejected by the server for service.delete
- [ ] negative: `provider-employee` is rejected by the server for service.delete
- [ ] negative: `customer` is rejected by the server for service.delete
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: supabase/migrations/20261005190000_audit_values_by_allow_list.sql#L13, supabase/migrations/20261006000000_attach_admin_audit_trigger_helper.sql#L37 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: web_platform/src/app/admin/services/page.tsx#L298 blocks the unconfirmed path
- [ ] recovery: Switch the service back on with service.toggle-active. restores the prior state
- [ ] precondition: the operation is rejected from states outside active, inactive

### service.set-featured (command, risk moderate)

- [ ] positive: `admin` achieves "Control landing-page and catalog placement"
- [ ] negative: `provider-owner` is rejected by the server for service.set-featured
- [ ] negative: `provider-employee` is rejected by the server for service.set-featured
- [ ] negative: `customer` is rejected by the server for service.set-featured
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: supabase/migrations/20261005190000_audit_values_by_allow_list.sql#L13, supabase/migrations/20261006000000_attach_admin_audit_trigger_helper.sql#L37 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] precondition: the operation is rejected from states outside active

## entity: booking

- [ ] fixtures exist for every lifecycle state: pending_payment, confirmed, completed, cancelled, no_show
- [ ] cross-tenant read and write of booking is rejected server-side

### booking.list (query, risk moderate)

- [ ] positive: `admin` achieves "See every booking across the marketplace with money, status and provider attribution"
- [ ] negative: `provider-owner` is rejected by the server for booking.list
- [ ] negative: `provider-employee` is rejected by the server for booking.list
- [ ] negative: `customer` is rejected by the server for booking.list
- [ ] negative: an unauthenticated request to supabase/migrations/20261005180000_admin_booking_directory.sql#L8, supabase/migrations/20261011140000_secfix2_mediums_lows_personal_reads.sql is rejected
- [ ] precondition: the operation is rejected from states outside pending_payment, confirmed, completed, cancelled, no_show

### booking.transition (command, risk high)

- [ ] positive: `admin` achieves "Move a booking between lifecycle states from the console (complete, cancel, mark no-show)"
- [ ] negative: `provider-owner` is rejected by the server for booking.transition
- [ ] negative: `provider-employee` is rejected by the server for booking.transition
- [ ] negative: `customer` is rejected by the server for booking.transition
- [ ] negative: an unauthenticated request to supabase/migrations/20261005170000_qa_release_gate_fixes.sql#L515, supabase/migrations/20261005170000_qa_release_gate_fixes.sql#L605, supabase/migrations/20261005170000_qa_release_gate_fixes.sql#L675, supabase/migrations/20261011110000_secfix2_h2_console_cancellations.sql is rejected
- [ ] audit: supabase/migrations/20261005000000_review_fix_booking_core.sql#L1209, supabase/migrations/20261005000000_review_fix_booking_core.sql#L1276 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (Each command refuses a booking that is no longer in a state it can leave.)
- [ ] safeguard: web_platform/tests/admin-console-guards.test.mjs#L196, supabase/tests/db/qa_defect_fixes.test.mjs#L248, supabase/tests/db/qa_defect_fixes.test.mjs#L47 blocks the unconfirmed path
- [ ] recovery: A cancelled or no-show booking is final; refunds and fees follow the shop's policy through refund_requests. restores the prior state
- [ ] precondition: the operation is rejected from states outside pending_payment, confirmed
- [ ] concurrency: The booking row is locked by each command before it changes state.

### booking.detail (query, risk moderate)

- [ ] positive: `admin` achieves "Open one booking and see its payment, ledger split, employee and travel context"
- [ ] negative: `provider-owner` is rejected by the server for booking.detail
- [ ] negative: `provider-employee` is rejected by the server for booking.detail
- [ ] negative: `customer` is rejected by the server for booking.detail
- [ ] negative: an unauthenticated request to - is rejected
- [ ] precondition: the operation is rejected from states outside pending_payment, confirmed, completed, cancelled, no_show

### booking.release-holds (command, risk moderate)

- [ ] positive: `admin` achieves "Release unpaid bookings that outlived the hold time so their slots reopen, with a recorded reason"
- [ ] negative: `provider-owner` is rejected by the server for booking.release-holds
- [ ] negative: `provider-employee` is rejected by the server for booking.release-holds
- [ ] negative: `customer` is rejected by the server for booking.release-holds
- [ ] negative: an unauthenticated request to supabase/migrations/20261005080000_release_gap_controls.sql#L205 is rejected
- [ ] audit: supabase/migrations/20261005080000_release_gap_controls.sql#L221 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (Only holds past the hold time are released, so a second run releases nothing more.)
- [ ] precondition: the operation is rejected from states outside pending_payment
- [ ] concurrency: Expiry locks each hold with SKIP LOCKED, so it cannot collide with a payment arriving.

## entity: ledger-entry

- [ ] fixtures exist for every lifecycle state: pending, released, refunded
- [ ] cross-tenant read and write of ledger-entry is rejected server-side

### ledger.list (query, risk moderate)

- [ ] positive: `admin` achieves "Reconcile captured money against platform share, provider share and payout state"
- [ ] negative: `provider-owner` is rejected by the server for ledger.list
- [ ] negative: `provider-employee` is rejected by the server for ledger.list
- [ ] negative: `customer` is rejected by the server for ledger.list
- [ ] negative: an unauthenticated request to supabase/migrations/20261010200000_gov2_audited_admin_reads.sql#L389 is rejected
- [ ] precondition: the operation is rejected from states outside pending, released, refunded

### ledger.release-payout (command, risk critical)

- [ ] positive: `admin` achieves "Release one ledger row's provider share for settlement"
- [ ] negative: `provider-owner` is rejected by the server for ledger.release-payout
- [ ] negative: `provider-employee` is rejected by the server for ledger.release-payout
- [ ] negative: `customer` is rejected by the server for ledger.release-payout
- [ ] negative: an unauthenticated request to supabase/migrations/20261010300000_money_append_only_and_corrections.sql#L605, supabase/migrations/20261010300000_money_append_only_and_corrections.sql#L669, supabase/migrations/20261011120000_secfix2_h3_m4_m5_reconciliation_evidence.sql, supabase/migrations/20261011130000_secfix2_h4_governance_notice_delivery.sql is rejected
- [ ] audit: supabase/migrations/20261010300000_money_append_only_and_corrections.sql#L658 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (A stable key per ledger row; a row that is no longer pending answers already_released and changes nothing.)
- [ ] safeguard: supabase/tests/db/money_append_only.test.mjs#L204, supabase/tests/db/qa_defect_fixes.test.mjs#L189 blocks the unconfirmed path
- [ ] recovery: A release cannot be undone from the console; the audit entry records who released the share and why. restores the prior state
- [ ] precondition: the operation is rejected from states outside pending
- [ ] concurrency: The ledger row is locked FOR UPDATE, and a row already partly allocated to a payout is refused.

### ledger.mark-refunded (command, risk critical)

- [ ] positive: `admin` achieves "Record that a captured payment was refunded and back the split out"
- [ ] negative: `provider-owner` is rejected by the server for ledger.mark-refunded
- [ ] negative: `provider-employee` is rejected by the server for ledger.mark-refunded
- [ ] negative: `customer` is rejected by the server for ledger.mark-refunded
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: - records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: - blocks the unconfirmed path
- [ ] recovery: - restores the prior state
- [ ] precondition: the operation is rejected from states outside pending, released

### ledger.vat-report (export, risk critical)

- [ ] positive: `admin` achieves "Produce the monthly ZATCA VAT position"
- [ ] negative: `provider-owner` is rejected by the server for ledger.vat-report
- [ ] negative: `provider-employee` is rejected by the server for ledger.vat-report
- [ ] negative: `customer` is rejected by the server for ledger.vat-report
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: - records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: - blocks the unconfirmed path
- [ ] recovery: - restores the prior state
- [ ] precondition: the operation is rejected from states outside pending, released, refunded

### ledger.export (export, risk critical)

- [ ] positive: `admin` achieves "Download the payments ledger, VAT summary or provider settlements for a period as an audited CSV file"
- [ ] negative: `provider-owner` is rejected by the server for ledger.export
- [ ] negative: `provider-employee` is rejected by the server for ledger.export
- [ ] negative: `customer` is rejected by the server for ledger.export
- [ ] negative: an unauthenticated request to supabase/migrations/20261010200000_gov2_audited_admin_reads.sql#L642 is rejected
- [ ] audit: supabase/migrations/20261005130000_admin_report_exports.sql#L32 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (An export is a read; repeating it produces the same file and another audit entry.)
- [ ] safeguard: web_platform/tests/csv-export.test.mjs#L27, web_platform/tests/admin-console-guards.test.mjs#L143 blocks the unconfirmed path
- [ ] recovery: Not applicable: exports change no data. restores the prior state
- [ ] concurrency: Not applicable: nothing is written except the audit entry.

### money.append-only (command, risk critical)

- [ ] positive: `admin` achieves "Money tables are append-only; no client role writes them directly; corrections only as linked adjustments"
- [ ] negative: `provider-owner` is rejected by the server for money.append-only
- [ ] negative: `provider-employee` is rejected by the server for money.append-only
- [ ] negative: `customer` is rejected by the server for money.append-only
- [ ] negative: an unauthenticated request to supabase/migrations/20261010300000_money_append_only_and_corrections.sql#L180, supabase/migrations/20261010300000_money_append_only_and_corrections.sql#L322 is rejected
- [ ] audit: supabase/migrations/20261006000000_attach_admin_audit_trigger_helper.sql records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (not applicable: the control is a refusal)
- [ ] safeguard: supabase/tests/db/money_append_only.test.mjs#L43, supabase/tests/db/money_append_only.test.mjs#L92, supabase/tests/db/money_append_only.test.mjs#L123 blocks the unconfirmed path
- [ ] recovery: corrections are new linked entries (ledger.adjustment); nothing is deleted restores the prior state
- [ ] concurrency: row triggers; no client write path exists

### ledger.adjustment (command, risk critical)

- [ ] positive: `admin` achieves "Propose and approve a linked adjustment or reversal entry with a different checker"
- [ ] negative: `provider-owner` is rejected by the server for ledger.adjustment
- [ ] negative: `provider-employee` is rejected by the server for ledger.adjustment
- [ ] negative: `customer` is rejected by the server for ledger.adjustment
- [ ] negative: an unauthenticated request to supabase/migrations/20261010300000_money_append_only_and_corrections.sql#L429, supabase/migrations/20261010300000_money_append_only_and_corrections.sql#L541 is rejected
- [ ] audit: supabase/migrations/20261010300000_money_append_only_and_corrections.sql#L589 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (idempotency key: one pending request per key (target md5), payment_intent_id 'adj:'\|\|key unique after posting)
- [ ] safeguard: supabase/tests/db/money_append_only.test.mjs#L150, supabase/tests/db/money_append_only.test.mjs#L227 blocks the unconfirmed path
- [ ] recovery: a wrong correction is corrected by another approved adjustment restores the prior state
- [ ] concurrency: row lock on the approval request; unique payment_intent_id

## entity: payout-request

- [ ] fixtures exist for every lifecycle state: requested, processing, paid, rejected
- [ ] cross-tenant read and write of payout-request is rejected server-side

### payout.list (query, risk high)

- [ ] positive: `admin` achieves "Work the queue of provider payout requests by age and amount"
- [ ] negative: `provider-owner` is rejected by the server for payout.list
- [ ] negative: `provider-employee` is rejected by the server for payout.list
- [ ] negative: `customer` is rejected by the server for payout.list
- [ ] negative: an unauthenticated request to supabase/migrations/20261010200000_gov2_audited_admin_reads.sql#L449 is rejected
- [ ] safeguard: - blocks the unconfirmed path
- [ ] recovery: - restores the prior state
- [ ] precondition: the operation is rejected from states outside requested, processing, paid, rejected

### payout.approve (command, risk critical)

- [ ] positive: `admin` achieves "Approve a payout request for bank processing"
- [ ] negative: `provider-owner` is rejected by the server for payout.approve
- [ ] negative: `provider-employee` is rejected by the server for payout.approve
- [ ] negative: `customer` is rejected by the server for payout.approve
- [ ] negative: an unauthenticated request to supabase/migrations/20261005080000_release_gap_controls.sql#L77, supabase/migrations/20261011120000_secfix2_h3_m4_m5_reconciliation_evidence.sql, supabase/migrations/20261011130000_secfix2_h4_governance_notice_delivery.sql is rejected
- [ ] audit: supabase/migrations/20261005170000_qa_release_gate_fixes.sql#L39 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (Repeating the same decision returns the request unchanged.)
- [ ] safeguard: web_platform/tests/admin-console-guards.test.mjs#L303, supabase/tests/db/release_controls.test.mjs#L38 blocks the unconfirmed path
- [ ] recovery: A request moves requested -> processing or rejected only; a rejected request is final and the provider asks again. restores the prior state
- [ ] precondition: the operation is rejected from states outside requested
- [ ] concurrency: The payout request row is locked FOR UPDATE.

### payout.reject (command, risk high)

- [ ] positive: `admin` achieves "Reject a payout request with a reason the provider can see"
- [ ] negative: `provider-owner` is rejected by the server for payout.reject
- [ ] negative: `provider-employee` is rejected by the server for payout.reject
- [ ] negative: `customer` is rejected by the server for payout.reject
- [ ] negative: an unauthenticated request to web_platform/src/app/admin/ledger/page.tsx#L836 is rejected
- [ ] audit: supabase/migrations/20261005080000_release_gap_controls.sql#L12 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: supabase/tests/db/release_controls.test.mjs#L39 blocks the unconfirmed path
- [ ] recovery: A rejected request is final; the provider files a new one. restores the prior state
- [ ] precondition: the operation is rejected from states outside requested

### payout.mark-paid (command, risk critical)

- [ ] positive: `admin` achieves "Mark a payout paid and release the ledger rows that fund it"
- [ ] negative: `provider-owner` is rejected by the server for payout.mark-paid
- [ ] negative: `provider-employee` is rejected by the server for payout.mark-paid
- [ ] negative: `customer` is rejected by the server for payout.mark-paid
- [ ] negative: an unauthenticated request to supabase/migrations/20261005170000_qa_release_gate_fixes.sql#L308 is rejected
- [ ] audit: supabase/migrations/20261005170000_qa_release_gate_fixes.sql#L337 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (A stable key per request; the same key returns already_processed and a second key on a paid request is refused (23505).)
- [ ] safeguard: web_platform/tests/admin-console-guards.test.mjs#L303, supabase/tests/db/qa_adversarial.test.mjs#L173 blocks the unconfirmed path
- [ ] recovery: A payout cannot be undone from the console; the audit entry records who released it, the amount, the ledger rows and why. The amount must be typed to confirm. restores the prior state
- [ ] precondition: the operation is rejected from states outside requested, processing
- [ ] concurrency: The request and the ledger rows it allocates are locked FOR UPDATE; the payout is refused whole if the ledger cannot cover it.

## entity: refund-request

- [ ] fixtures exist for every lifecycle state: pending, processing, succeeded, failed
- [ ] cross-tenant read and write of refund-request is rejected server-side

### refund.list (query, risk high)

- [ ] positive: `admin` achieves "Work the queue of refund requests raised against captured payments"
- [ ] negative: `provider-owner` is rejected by the server for refund.list
- [ ] negative: `provider-employee` is rejected by the server for refund.list
- [ ] negative: `customer` is rejected by the server for refund.list
- [ ] negative: an unauthenticated request to supabase/migrations/20261005000000_review_fix_booking_core.sql#L1012 is rejected
- [ ] safeguard: - blocks the unconfirmed path
- [ ] recovery: - restores the prior state

### refund.execute (command, risk critical)

- [ ] positive: `admin` achieves "Issue a real refund through Tap and record it against the booking and ledger"
- [ ] negative: `provider-owner` is rejected by the server for refund.execute
- [ ] negative: `provider-employee` is rejected by the server for refund.execute
- [ ] negative: `customer` is rejected by the server for refund.execute
- [ ] negative: an unauthenticated request to supabase/functions/process-refund/index.ts, supabase/migrations/20261005010000_review_fix_money.sql#L599, supabase/migrations/20261011110000_secfix2_h2_console_cancellations.sql is rejected
- [ ] audit: supabase/migrations/20261005010000_review_fix_money.sql#L625 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (Each refund request carries a unique idempotency key sent to Tap; claim_refund_request only claims pending or failed rows.)
- [ ] safeguard: supabase/migrations/20261005010000_review_fix_money.sql#L580 blocks the unconfirmed path
- [ ] recovery: A refused refund is recorded as failed with the gateway's message and retried by the scheduler up to five attempts, then by an operator through refund.retry. restores the prior state
- [ ] concurrency: claim_refund_request locks the row FOR UPDATE SKIP LOCKED; complete_refund_request locks it again before writing the ledger.

### refund.retry (command, risk high)

- [ ] positive: `admin` achieves "Ask for another attempt at a refund the gateway refused, with a recorded reason"
- [ ] negative: `provider-owner` is rejected by the server for refund.retry
- [ ] negative: `provider-employee` is rejected by the server for refund.retry
- [ ] negative: `customer` is rejected by the server for refund.retry
- [ ] negative: an unauthenticated request to supabase/migrations/20261005100000_admin_refund_retry.sql#L11 is rejected
- [ ] audit: supabase/migrations/20261005100000_admin_refund_retry.sql#L43 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (The retry only adjusts the attempt counter; the money movement keeps the request's Tap idempotency key, so repeated clicks cannot refund twice.)
- [ ] safeguard: web_platform/src/app/admin/refunds/page.tsx#L185 blocks the unconfirmed path
- [ ] recovery: If the gateway refuses again the refund returns to failed with the message, and the operator decides again. restores the prior state
- [ ] precondition: the operation is rejected from states outside pending, failed
- [ ] concurrency: The retry locks the refund row; process-refund claims it FOR UPDATE SKIP LOCKED, so a concurrent attempt is skipped.

### refund.check-with-tap (command, risk critical)

- [ ] positive: `admin` achieves "Re-fetch a stuck refund status from Tap and apply it through the server; refund SLA tracking"
- [ ] negative: `provider-owner` is rejected by the server for refund.check-with-tap
- [ ] negative: `provider-employee` is rejected by the server for refund.check-with-tap
- [ ] negative: `customer` is rejected by the server for refund.check-with-tap
- [ ] negative: an unauthenticated request to supabase/migrations/20261010330000_money_tap_reconciliation.sql#L607, supabase/migrations/20261010330000_money_tap_reconciliation.sql#L636, supabase/functions/check-refund-status/index.ts, supabase/functions/_shared/tap-refund-status.ts is rejected
- [ ] audit: supabase/migrations/20261010330000_money_tap_reconciliation.sql#L627, supabase/migrations/20261010330000_money_tap_reconciliation.sql#L566 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (re-checking only records Tap's latest answer; breaks unique per (kind, subject))
- [ ] safeguard: supabase/tests/db/money_reconciliation.test.mjs#L169, supabase/tests/db/money_reconciliation.test.mjs#L179 blocks the unconfirmed path
- [ ] recovery: money never moves here; a wrong status is corrected by the next check restores the prior state
- [ ] concurrency: FOR UPDATE on the refund row while recording

## entity: customer

- [ ] fixtures exist for every lifecycle state: active

### customer.list (query, risk moderate)

- [ ] positive: `admin` achieves "Find a customer to support them"
- [ ] negative: `provider-owner` is rejected by the server for customer.list
- [ ] negative: `provider-employee` is rejected by the server for customer.list
- [ ] negative: `customer` is rejected by the server for customer.list
- [ ] negative: an unauthenticated request to supabase/migrations/20261010200000_gov2_audited_admin_reads.sql#L307, supabase/migrations/20261010200000_gov2_audited_admin_reads.sql#L354, supabase/migrations/20261011140000_secfix2_mediums_lows_personal_reads.sql is rejected
- [ ] precondition: the operation is rejected from states outside active

### customer.detail (query, risk moderate)

- [ ] positive: `admin` achieves "Open one customer and see their bookings, payments and support history"
- [ ] negative: `provider-owner` is rejected by the server for customer.detail
- [ ] negative: `provider-employee` is rejected by the server for customer.detail
- [ ] negative: `customer` is rejected by the server for customer.detail
- [ ] negative: an unauthenticated request to - is rejected
- [ ] precondition: the operation is rejected from states outside active

### customer.suspend (command, risk high)

- [ ] positive: `admin` achieves "Block an abusive customer from booking"
- [ ] negative: `provider-owner` is rejected by the server for customer.suspend
- [ ] negative: `provider-employee` is rejected by the server for customer.suspend
- [ ] negative: `customer` is rejected by the server for customer.suspend
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: - records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: - blocks the unconfirmed path
- [ ] recovery: - restores the prior state
- [ ] precondition: the operation is rejected from states outside active

### customer.data-request (command, risk critical)

- [ ] positive: `admin` achieves "Export or erase a customer's personal data on request"
- [ ] negative: `provider-owner` is rejected by the server for customer.data-request
- [ ] negative: `provider-employee` is rejected by the server for customer.data-request
- [ ] negative: `customer` is rejected by the server for customer.data-request
- [ ] negative: an unauthenticated request to supabase/migrations/20261011200000_priv_privacy_requests.sql, supabase/migrations/20261011210000_priv_copy_export.sql, supabase/migrations/20261011220000_priv_deletion_engine.sql is rejected
- [ ] audit: supabase/migrations/20261011200000_priv_privacy_requests.sql records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (A request already in the target state is refused; closed requests cannot change.)
- [ ] safeguard: supabase/tests/db/priv_privacy.test.mjs blocks the unconfirmed path
- [ ] recovery: Completed and rejected are final by design; the note and reviewer remain on the request and in the audit log. restores the prior state
- [ ] concurrency: The request row is locked FOR UPDATE for the check and the write.

### customer.clear-profile (command, risk critical)

- [ ] positive: `admin` achieves "Clear the personal details held on a customer's profile, with a recorded reason"
- [ ] negative: `provider-owner` is rejected by the server for customer.clear-profile
- [ ] negative: `provider-employee` is rejected by the server for customer.clear-profile
- [ ] negative: `customer` is rejected by the server for customer.clear-profile
- [ ] negative: an unauthenticated request to supabase/migrations/20261005110000_admin_clear_customer_profile.sql#L12, supabase/migrations/20261016200000_f1_profile_clear_respects_account_hold.sql#L33 is rejected
- [ ] audit: supabase/migrations/20261005110000_admin_clear_customer_profile.sql#L51 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (Clearing an already cleared profile sets the same NULL values again and records another audit entry.)
- [ ] safeguard: supabase/tests/db/customer_directory.test.mjs#L51, supabase/tests/db/release_controls.test.mjs#L97, supabase/tests/db/f123_final_recheck.test.mjs#L45, supabase/tests/db/f123_final_recheck.test.mjs#L56 blocks the unconfirmed path
- [ ] recovery: Not reversible by design; the audit entry records who cleared it and why, without the removed values. restores the prior state
- [ ] concurrency: The profile row is locked for the update.

### customer.verify-phone (command, risk high)

- [ ] positive: `admin` achieves "Mark a customer's phone number verified, or remove the mark, without a one-time code, with a recorded reason"
- [ ] negative: `provider-owner` is rejected by the server for customer.verify-phone
- [ ] negative: `provider-employee` is rejected by the server for customer.verify-phone
- [ ] negative: `customer` is rejected by the server for customer.verify-phone
- [ ] negative: an unauthenticated request to supabase/migrations/20261005140000_admin_customer_directory.sql#L153 is rejected
- [ ] audit: supabase/migrations/20261005080000_release_gap_controls.sql#L69 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (Repeating the state already in force returns unchanged without writing.)
- [ ] safeguard: supabase/tests/db/customer_directory.test.mjs#L160 blocks the unconfirmed path
- [ ] recovery: Reversible: the mark can be removed with another reasoned command. restores the prior state
- [ ] concurrency: The profile row is locked FOR UPDATE.

### customer.submit-data-request (command, risk moderate)

- [ ] positive: `customer` achieves "File a privacy request (access, rectification, erasure, export) and get its due date"
- [ ] negative: `admin` is rejected by the server for customer.submit-data-request
- [ ] negative: `provider-owner` is rejected by the server for customer.submit-data-request
- [ ] negative: `provider-employee` is rejected by the server for customer.submit-data-request
- [ ] negative: an unauthenticated request to supabase/migrations/20261011200000_priv_privacy_requests.sql is rejected
- [ ] audit: supabase/migrations/20261007010400_consent_and_request_evidence.sql#L115 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (A second request of the same kind returns the open one.)

## entity: employee

- [ ] fixtures exist for every lifecycle state: active, inactive
- [ ] cross-tenant read and write of employee is rejected server-side

### employee.list (query, risk low)

- [ ] positive: `admin` achieves "See provider staff, their assignments and availability"
- [ ] negative: `provider-owner` is rejected by the server for employee.list
- [ ] negative: `provider-employee` is rejected by the server for employee.list
- [ ] negative: `customer` is rejected by the server for employee.list
- [ ] negative: an unauthenticated request to supabase/migrations/20261010200000_gov2_audited_admin_reads.sql#L788, supabase/migrations/20261011140000_secfix2_mediums_lows_personal_reads.sql is rejected
- [ ] precondition: the operation is rejected from states outside active, inactive

### employee.upsert (command, risk moderate)

- [ ] positive: `admin` achieves "Correct a staff record or service assignment"
- [ ] negative: `provider-owner` is rejected by the server for employee.upsert
- [ ] negative: `provider-employee` is rejected by the server for employee.upsert
- [ ] negative: `customer` is rejected by the server for employee.upsert
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: - records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] precondition: the operation is rejected from states outside active, inactive

### employee.delete (command, risk high)

- [ ] positive: `admin` achieves "Remove a staff record"
- [ ] negative: `provider-owner` is rejected by the server for employee.delete
- [ ] negative: `provider-employee` is rejected by the server for employee.delete
- [ ] negative: `customer` is rejected by the server for employee.delete
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: - records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: - blocks the unconfirmed path
- [ ] recovery: - restores the prior state
- [ ] precondition: the operation is rejected from states outside active, inactive

## entity: review

- [ ] fixtures exist for every lifecycle state: published
- [ ] cross-tenant read and write of review is rejected server-side

### review.moderate-queue (query, risk moderate)

- [ ] positive: `admin` achieves "Work the queue of flagged or reported reviews"
- [ ] negative: `provider-owner` is rejected by the server for review.moderate-queue
- [ ] negative: `provider-employee` is rejected by the server for review.moderate-queue
- [ ] negative: `customer` is rejected by the server for review.moderate-queue
- [ ] negative: an unauthenticated request to - is rejected
- [ ] precondition: the operation is rejected from states outside published

### review.hide (command, risk high)

- [ ] positive: `admin` achieves "Remove an abusive review from public view"
- [ ] negative: `provider-owner` is rejected by the server for review.hide
- [ ] negative: `provider-employee` is rejected by the server for review.hide
- [ ] negative: `customer` is rejected by the server for review.hide
- [ ] negative: an unauthenticated request to supabase/migrations/20261005020000_review_fix_trust_growth.sql#L503 is rejected
- [ ] audit: supabase/migrations/20261005020000_review_fix_trust_growth.sql#L527 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: web_platform/tests/admin-console-guards.test.mjs#L310 blocks the unconfirmed path
- [ ] recovery: Restore the review with the same command. restores the prior state
- [ ] precondition: the operation is rejected from states outside published

## entity: promotional-code

- [ ] fixtures exist for every lifecycle state: active, inactive

### coupon.list (query, risk low)

- [ ] positive: `admin` achieves "See active and expired promotions and their redemption limits"
- [ ] negative: `provider-owner` is rejected by the server for coupon.list
- [ ] negative: `provider-employee` is rejected by the server for coupon.list
- [ ] negative: `customer` is rejected by the server for coupon.list
- [ ] negative: an unauthenticated request to - is rejected
- [ ] precondition: the operation is rejected from states outside active, inactive

### coupon.upsert (command, risk high)

- [ ] positive: `admin` achieves "Create or correct a promotion"
- [ ] negative: `provider-owner` is rejected by the server for coupon.upsert
- [ ] negative: `provider-employee` is rejected by the server for coupon.upsert
- [ ] negative: `customer` is rejected by the server for coupon.upsert
- [ ] negative: an unauthenticated request to supabase/migrations/20261008100100_adm1_admin_promo_code_commands.sql#L7 is rejected
- [ ] audit: supabase/migrations/20261008100100_adm1_admin_promo_code_commands.sql#L108 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: supabase/tests/db/adm1_promo_code_commands.test.mjs#L67 blocks the unconfirmed path
- [ ] recovery: Edit the code again, or deactivate it with coupon.toggle. restores the prior state
- [ ] precondition: the operation is rejected from states outside active, inactive

### coupon.toggle (command, risk moderate)

- [ ] positive: `admin` achieves "Switch a promotion on or off"
- [ ] negative: `provider-owner` is rejected by the server for coupon.toggle
- [ ] negative: `provider-employee` is rejected by the server for coupon.toggle
- [ ] negative: `customer` is rejected by the server for coupon.toggle
- [ ] negative: an unauthenticated request to supabase/migrations/20261008100100_adm1_admin_promo_code_commands.sql#L117 is rejected
- [ ] audit: supabase/migrations/20261008100100_adm1_admin_promo_code_commands.sql#L108 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] precondition: the operation is rejected from states outside active

### coupon.delete (command, risk high)

- [ ] positive: `admin` achieves "Retire a promotion"
- [ ] negative: `provider-owner` is rejected by the server for coupon.delete
- [ ] negative: `provider-employee` is rejected by the server for coupon.delete
- [ ] negative: `customer` is rejected by the server for coupon.delete
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: - records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: - blocks the unconfirmed path
- [ ] recovery: - restores the prior state
- [ ] precondition: the operation is rejected from states outside active, inactive

## entity: integration

- [ ] fixtures exist for every lifecycle state: connected, disconnected, error

### integration.list (query, risk moderate)

- [ ] positive: `admin` achieves "See connection health for every payment, SMS, push and maps provider"
- [ ] negative: `provider-owner` is rejected by the server for integration.list
- [ ] negative: `provider-employee` is rejected by the server for integration.list
- [ ] negative: `customer` is rejected by the server for integration.list
- [ ] negative: an unauthenticated request to - is rejected
- [ ] precondition: the operation is rejected from states outside connected, disconnected, error

### integration.toggle (command, risk critical)

- [ ] positive: `admin` achieves "Enable or disable a provider connection"
- [ ] negative: `provider-owner` is rejected by the server for integration.toggle
- [ ] negative: `provider-employee` is rejected by the server for integration.toggle
- [ ] negative: `customer` is rejected by the server for integration.toggle
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: supabase/migrations/20261005190000_audit_values_by_allow_list.sql#L13, supabase/migrations/20261006000000_attach_admin_audit_trigger_helper.sql#L37 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: supabase/tests/db/fixdba_access_hardening.test.mjs#L158 blocks the unconfirmed path
- [ ] recovery: - restores the prior state
- [ ] precondition: the operation is rejected from states outside disconnected

### integration.upsert (command, risk critical)

- [ ] positive: `admin` achieves "Register or reconfigure an external provider"
- [ ] negative: `provider-owner` is rejected by the server for integration.upsert
- [ ] negative: `provider-employee` is rejected by the server for integration.upsert
- [ ] negative: `customer` is rejected by the server for integration.upsert
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: supabase/migrations/20261005190000_audit_values_by_allow_list.sql#L13, supabase/migrations/20261006000000_attach_admin_audit_trigger_helper.sql#L37 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: supabase/tests/db/fixdba_access_hardening.test.mjs#L158 blocks the unconfirmed path
- [ ] recovery: - restores the prior state
- [ ] precondition: the operation is rejected from states outside connected, disconnected

### integration.delete (command, risk critical)

- [ ] positive: `admin` achieves "Remove an integration registration"
- [ ] negative: `provider-owner` is rejected by the server for integration.delete
- [ ] negative: `provider-employee` is rejected by the server for integration.delete
- [ ] negative: `customer` is rejected by the server for integration.delete
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: supabase/migrations/20261005190000_audit_values_by_allow_list.sql#L13, supabase/migrations/20261006000000_attach_admin_audit_trigger_helper.sql#L37 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: supabase/tests/db/fixdba_access_hardening.test.mjs#L158 blocks the unconfirmed path
- [ ] recovery: - restores the prior state
- [ ] precondition: the operation is rejected from states outside connected, disconnected, error

## entity: payment-method

- [ ] fixtures exist for every lifecycle state: enabled, disabled

### payment-method.toggle (command, risk critical)

- [ ] positive: `admin` achieves "Turn a KSA payment method (mada, Apple Pay, tabby, cash) on or off for customers"
- [ ] negative: `provider-owner` is rejected by the server for payment-method.toggle
- [ ] negative: `provider-employee` is rejected by the server for payment-method.toggle
- [ ] negative: `customer` is rejected by the server for payment-method.toggle
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: supabase/migrations/20261005190000_audit_values_by_allow_list.sql#L13, supabase/migrations/20261006000000_attach_admin_audit_trigger_helper.sql#L37 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: web_platform/src/app/admin/ledger/page.tsx#L275 blocks the unconfirmed path
- [ ] recovery: - restores the prior state
- [ ] precondition: the operation is rejected from states outside disabled

### payment-method.set-default (command, risk high)

- [ ] positive: `admin` achieves "Choose the default checkout method"
- [ ] negative: `provider-owner` is rejected by the server for payment-method.set-default
- [ ] negative: `provider-employee` is rejected by the server for payment-method.set-default
- [ ] negative: `customer` is rejected by the server for payment-method.set-default
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: supabase/migrations/20261005190000_audit_values_by_allow_list.sql#L13, supabase/migrations/20261006000000_attach_admin_audit_trigger_helper.sql#L37 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: web_platform/src/app/admin/ledger/page.tsx#L289 blocks the unconfirmed path
- [ ] recovery: - restores the prior state
- [ ] precondition: the operation is rejected from states outside enabled

### payment-method.list (query, risk moderate)

- [ ] positive: `admin` achieves "See the payment methods, their gateway and whether each is operational"
- [ ] negative: `provider-owner` is rejected by the server for payment-method.list
- [ ] negative: `provider-employee` is rejected by the server for payment-method.list
- [ ] negative: `customer` is rejected by the server for payment-method.list
- [ ] negative: an unauthenticated request to - is rejected

## entity: platform-settings

- [ ] fixtures exist for every lifecycle state: active

### settings.vat-rate (command, risk critical)

- [ ] positive: `admin` achieves "Set the ZATCA VAT rate the platform charges"
- [ ] negative: `provider-owner` is rejected by the server for settings.vat-rate
- [ ] negative: `provider-employee` is rejected by the server for settings.vat-rate
- [ ] negative: `customer` is rejected by the server for settings.vat-rate
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: - records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: - blocks the unconfirmed path
- [ ] recovery: - restores the prior state
- [ ] precondition: the operation is rejected from states outside active

### settings.commission (command, risk critical)

- [ ] positive: `admin` achieves "Set the default platform commission"
- [ ] negative: `provider-owner` is rejected by the server for settings.commission
- [ ] negative: `provider-employee` is rejected by the server for settings.commission
- [ ] negative: `customer` is rejected by the server for settings.commission
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: - records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: - blocks the unconfirmed path
- [ ] recovery: - restores the prior state
- [ ] precondition: the operation is rejected from states outside active

### settings.platform (command, risk high)

- [ ] positive: `admin` achieves "Set platform name, support address and operational toggles"
- [ ] negative: `provider-owner` is rejected by the server for settings.platform
- [ ] negative: `provider-employee` is rejected by the server for settings.platform
- [ ] negative: `customer` is rejected by the server for settings.platform
- [ ] negative: an unauthenticated request to supabase/migrations/20261005080000_release_gap_controls.sql#L133 is rejected
- [ ] audit: supabase/tests/db/release_controls.test.mjs#L68 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: supabase/tests/db/release_controls.test.mjs#L58 blocks the unconfirmed path
- [ ] recovery: Set the previous value again; the audit entry holds the old value. restores the prior state
- [ ] precondition: the operation is rejected from states outside active

### settings.list (query, risk moderate)

- [ ] positive: `admin` achieves "See the current value, approval and last change of the editable platform settings"
- [ ] negative: `provider-owner` is rejected by the server for settings.list
- [ ] negative: `provider-employee` is rejected by the server for settings.list
- [ ] negative: `customer` is rejected by the server for settings.list
- [ ] negative: an unauthenticated request to - is rejected

### settings.api-limits (command, risk high)

- [ ] positive: `admin` achieves "Set the developer API limits (requests per minute, key lifetime, webhook retries) with a recorded reason"
- [ ] negative: `provider-owner` is rejected by the server for settings.api-limits
- [ ] negative: `provider-employee` is rejected by the server for settings.api-limits
- [ ] negative: `customer` is rejected by the server for settings.api-limits
- [ ] negative: an unauthenticated request to supabase/migrations/20261006090000_api_keys.sql#L60 is rejected
- [ ] audit: - records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: supabase/tests/db/adm1_api_settings_screen.test.mjs#L20 blocks the unconfirmed path
- [ ] recovery: Set the previous value again. restores the prior state

## entity: audit-event

- [ ] fixtures exist for every lifecycle state: recorded

### audit.search (query, risk critical)

- [ ] positive: `admin` achieves "Answer who changed this record, when, and from what to what"
- [ ] negative: `provider-owner` is rejected by the server for audit.search
- [ ] negative: `provider-employee` is rejected by the server for audit.search
- [ ] negative: `customer` is rejected by the server for audit.search
- [ ] negative: an unauthenticated request to supabase/migrations/20261011100000_secfix2_h1_m8_no_direct_console_reads.sql, web_platform/src/app/admin/audit-logs/page.tsx#L117 is rejected
- [ ] safeguard: supabase/tests/db/qa_defect_fixes.test.mjs#L68 blocks the unconfirmed path
- [ ] recovery: Audit rows cannot be edited or deleted by any client role; a search is read-only and a wrong filter changes nothing. restores the prior state
- [ ] precondition: the operation is rejected from states outside recorded

### audit.emit (command, risk critical)

- [ ] positive: `admin` achieves "Record every state-changing admin action with actor, target, before and after"
- [ ] negative: `provider-owner` is rejected by the server for audit.emit
- [ ] negative: `provider-employee` is rejected by the server for audit.emit
- [ ] negative: `customer` is rejected by the server for audit.emit
- [ ] negative: an unauthenticated request to supabase/migrations/20261005190000_audit_values_by_allow_list.sql#L13, supabase/migrations/20261006000000_attach_admin_audit_trigger_helper.sql#L37, supabase/migrations/20261011140000_secfix2_mediums_lows_personal_reads.sql is rejected
- [ ] audit: supabase/migrations/20261005190000_audit_values_by_allow_list.sql#L13 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: supabase/tests/db/security_hardening.test.mjs#L43 blocks the unconfirmed path
- [ ] recovery: - restores the prior state
- [ ] precondition: the operation is rejected from states outside recorded

## entity: inventory-operations

- [ ] fixtures exist for every lifecycle state: active, inactive
- [ ] cross-tenant read and write of inventory-operations is rejected server-side

### inventory.catalog (command, risk moderate)

- [ ] positive: `provider-owner` achieves "Create, edit, disable and reactivate suppliers and products"
- [ ] positive: `provider-employee` achieves "Create, edit, disable and reactivate suppliers and products"
- [ ] negative: `admin` is rejected by the server for inventory.catalog
- [ ] negative: `customer` is rejected by the server for inventory.catalog
- [ ] negative: an unauthenticated request to supabase/migrations/20261005070000_inventory_controls_and_chain_operations.sql is rejected
- [ ] audit: supabase/migrations/20261005070000_inventory_controls_and_chain_operations.sql records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (Request receipts deduplicate stock commands; catalog updates set explicit field values.)
- [ ] precondition: the operation is rejected from states outside active, inactive
- [ ] concurrency: Stock rows lock in branch ID order; purchase orders lock before transition.

### inventory.adjust (command, risk high)

- [ ] positive: `provider-owner` achieves "Record a reasoned stock adjustment or waste without changing reserved stock"
- [ ] positive: `provider-employee` achieves "Record a reasoned stock adjustment or waste without changing reserved stock"
- [ ] negative: `admin` is rejected by the server for inventory.adjust
- [ ] negative: `customer` is rejected by the server for inventory.adjust
- [ ] negative: an unauthenticated request to supabase/migrations/20261005070000_inventory_controls_and_chain_operations.sql is rejected
- [ ] audit: supabase/migrations/20261005070000_inventory_controls_and_chain_operations.sql records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (Request receipts deduplicate stock commands; catalog updates set explicit field values.)
- [ ] safeguard: supabase/tests/inventory.test.mjs blocks the unconfirmed path
- [ ] recovery: Catalog and access deactivation are reversible; errors roll back the database transaction. restores the prior state
- [ ] precondition: the operation is rejected from states outside active, inactive
- [ ] concurrency: Stock rows lock in branch ID order; purchase orders lock before transition.

### inventory.transfer (command, risk high)

- [ ] positive: `provider-owner` achieves "Transfer unreserved stock atomically between authorized branches"
- [ ] positive: `provider-employee` achieves "Transfer unreserved stock atomically between authorized branches"
- [ ] negative: `admin` is rejected by the server for inventory.transfer
- [ ] negative: `customer` is rejected by the server for inventory.transfer
- [ ] negative: an unauthenticated request to supabase/migrations/20261005070000_inventory_controls_and_chain_operations.sql is rejected
- [ ] audit: supabase/migrations/20261005070000_inventory_controls_and_chain_operations.sql records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (Request receipts deduplicate stock commands; catalog updates set explicit field values.)
- [ ] safeguard: supabase/tests/inventory.test.mjs blocks the unconfirmed path
- [ ] recovery: Catalog and access deactivation are reversible; errors roll back the database transaction. restores the prior state
- [ ] precondition: the operation is rejected from states outside active, inactive
- [ ] concurrency: Stock rows lock in branch ID order; purchase orders lock before transition.

### inventory.supply-read (query, risk moderate)

- [ ] positive: `admin` achieves "Review live orders, inventory health and stock reductions with server pagination"
- [ ] negative: `provider-owner` is rejected by the server for inventory.supply-read
- [ ] negative: `provider-employee` is rejected by the server for inventory.supply-read
- [ ] negative: `customer` is rejected by the server for inventory.supply-read
- [ ] negative: an unauthenticated request to supabase/migrations/20261005070000_inventory_controls_and_chain_operations.sql is rejected
- [ ] precondition: the operation is rejected from states outside active, inactive
- [ ] concurrency: Stock rows lock in branch ID order; purchase orders lock before transition.

### inventory.delegation (command, risk high)

- [ ] positive: `provider-owner` achieves "Grant scoped operation permissions to registered staff and revoke access"
- [ ] negative: `admin` is rejected by the server for inventory.delegation
- [ ] negative: `provider-employee` is rejected by the server for inventory.delegation
- [ ] negative: `customer` is rejected by the server for inventory.delegation
- [ ] negative: an unauthenticated request to supabase/migrations/20261005070000_inventory_controls_and_chain_operations.sql is rejected
- [ ] audit: supabase/migrations/20261005070000_inventory_controls_and_chain_operations.sql records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (Request receipts deduplicate stock commands; catalog updates set explicit field values.)
- [ ] safeguard: supabase/tests/inventory.test.mjs blocks the unconfirmed path
- [ ] recovery: Catalog and access deactivation are reversible; errors roll back the database transaction. restores the prior state
- [ ] precondition: the operation is rejected from states outside active, inactive
- [ ] concurrency: Stock rows lock in branch ID order; purchase orders lock before transition.

### inventory.chain-read (query, risk moderate)

- [ ] positive: `provider-owner` achieves "Review branch totals scoped by reports permission and Riyadh date range"
- [ ] positive: `provider-employee` achieves "Review branch totals scoped by reports permission and Riyadh date range"
- [ ] negative: `admin` is rejected by the server for inventory.chain-read
- [ ] negative: `customer` is rejected by the server for inventory.chain-read
- [ ] negative: an unauthenticated request to supabase/migrations/20261005070000_inventory_controls_and_chain_operations.sql is rejected
- [ ] precondition: the operation is rejected from states outside active, inactive
- [ ] concurrency: Stock rows lock in branch ID order; purchase orders lock before transition.

## entity: feature-flag

- [ ] fixtures exist for every lifecycle state: off, on

### feature-flag.list (query, risk low)

- [ ] positive: `admin` achieves "See every platform feature flag and whether it is on"
- [ ] negative: `provider-owner` is rejected by the server for feature-flag.list
- [ ] negative: `provider-employee` is rejected by the server for feature-flag.list
- [ ] negative: `customer` is rejected by the server for feature-flag.list
- [ ] negative: an unauthenticated request to - is rejected

### feature-flag.set (command, risk high)

- [ ] positive: `admin` achieves "Switch a feature flag on or off with a recorded reason"
- [ ] negative: `provider-owner` is rejected by the server for feature-flag.set
- [ ] negative: `provider-employee` is rejected by the server for feature-flag.set
- [ ] negative: `customer` is rejected by the server for feature-flag.set
- [ ] negative: an unauthenticated request to supabase/migrations/20261008100200_adm1_roles_flags_fee_rules.sql#L94 is rejected
- [ ] audit: supabase/tests/db/adm1_roles_flags_fee_rules.test.mjs#L75 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (Setting a flag to the value it has changes nothing and writes no second audit entry.)
- [ ] safeguard: supabase/tests/db/adm1_roles_flags_fee_rules.test.mjs#L87 blocks the unconfirmed path
- [ ] recovery: Switch the flag back; the audit entry records who changed it and why. restores the prior state
- [ ] precondition: the operation is rejected from states outside off, on

## entity: fee-rule

- [ ] fixtures exist for every lifecycle state: active, inactive

### fee-rule.list (query, risk moderate)

- [ ] positive: `admin` achieves "See the platform fee rules per booking channel and visit type"
- [ ] negative: `provider-owner` is rejected by the server for fee-rule.list
- [ ] negative: `provider-employee` is rejected by the server for fee-rule.list
- [ ] negative: `customer` is rejected by the server for fee-rule.list
- [ ] negative: an unauthenticated request to supabase/migrations/20261010310000_money_pending_changes.sql#L470 is rejected

### fee-rule.save (command, risk critical)

- [ ] positive: `admin` achieves "Change or add a marketplace fee rule with a recorded reason"
- [ ] negative: `provider-owner` is rejected by the server for fee-rule.save
- [ ] negative: `provider-employee` is rejected by the server for fee-rule.save
- [ ] negative: `customer` is rejected by the server for fee-rule.save
- [ ] negative: an unauthenticated request to supabase/migrations/20261010310000_money_pending_changes.sql#L168 is rejected
- [ ] audit: supabase/migrations/20261010310000_money_pending_changes.sql#L323 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (Saving the same values changes nothing new.)
- [ ] safeguard: supabase/tests/db/money_pending_changes.test.mjs#L72 blocks the unconfirmed path
- [ ] recovery: Save the previous values again; the audit entry holds them. restores the prior state
- [ ] precondition: the operation is rejected from states outside active, inactive

### money.pending-change (command, risk critical)

- [ ] positive: `admin` achieves "Fee rules, provider balances, payout holds and refund thresholds change only through an approved pending change"
- [ ] negative: `provider-owner` is rejected by the server for money.pending-change
- [ ] negative: `provider-employee` is rejected by the server for money.pending-change
- [ ] negative: `customer` is rejected by the server for money.pending-change
- [ ] negative: an unauthenticated request to supabase/migrations/20261010310000_money_pending_changes.sql#L168, supabase/migrations/20261010310000_money_pending_changes.sql#L257, supabase/migrations/20261010310000_money_pending_changes.sql#L378 is rejected
- [ ] audit: supabase/migrations/20261010310000_money_pending_changes.sql#L323, supabase/migrations/20261010310000_money_pending_changes.sql#L443 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (one pending request per rule (channel, visit type) or provider hold)
- [ ] safeguard: supabase/tests/db/money_pending_changes.test.mjs#L58, supabase/tests/db/money_pending_changes.test.mjs#L109 blocks the unconfirmed path
- [ ] recovery: a further approved change; versions are never edited or deleted restores the prior state
- [ ] concurrency: FOR UPDATE on the latest version at execution; stale request refused (23505)

### fee.effective-display (command, risk critical)

- [ ] positive: `admin` achieves "Show the effective platform fee, VAT on the fee and a worked example to providers and admins"
- [ ] negative: `provider-owner` is rejected by the server for fee.effective-display
- [ ] negative: `provider-employee` is rejected by the server for fee.effective-display
- [ ] negative: `customer` is rejected by the server for fee.effective-display
- [ ] negative: an unauthenticated request to supabase/migrations/20261010340000_money_effective_fee_and_vat_status.sql#L122 is rejected
- [ ] audit: supabase/migrations/20261010310000_money_pending_changes.sql#L323 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (read only)
- [ ] safeguard: supabase/tests/db/money_fee_terms_vat.test.mjs#L50 blocks the unconfirmed path
- [ ] recovery: read only restores the prior state
- [ ] concurrency: read only

## entity: role-assignment

- [ ] fixtures exist for every lifecycle state: customer, provider_owner, admin

### role.directory (query, risk high)

- [ ] positive: `admin` achieves "Find administrators, staff and (by search) customers and see their roles"
- [ ] negative: `provider-owner` is rejected by the server for role.directory
- [ ] negative: `provider-employee` is rejected by the server for role.directory
- [ ] negative: `customer` is rejected by the server for role.directory
- [ ] negative: an unauthenticated request to supabase/migrations/20261008100200_adm1_roles_flags_fee_rules.sql#L17 is rejected
- [ ] safeguard: supabase/tests/db/adm1_roles_flags_fee_rules.test.mjs#L44 blocks the unconfirmed path
- [ ] recovery: - restores the prior state

### role.set-administrator (command, risk critical)

- [ ] positive: `admin` achieves "Grant or remove the administrator role with a recorded reason"
- [ ] negative: `provider-owner` is rejected by the server for role.set-administrator
- [ ] negative: `provider-employee` is rejected by the server for role.set-administrator
- [ ] negative: `customer` is rejected by the server for role.set-administrator
- [ ] negative: an unauthenticated request to supabase/migrations/20261005170000_qa_release_gate_fixes.sql#L393, supabase/migrations/20261010410000_govfix_h2_role_grants_need_second_owner.sql#admin_set_console_role is rejected
- [ ] audit: supabase/tests/db/adm1_roles_flags_fee_rules.test.mjs#L66 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: supabase/tests/db/adm1_roles_flags_fee_rules.test.mjs#L61 blocks the unconfirmed path
- [ ] recovery: Grant or remove the role again; the audit entry records who and why. restores the prior state
- [ ] precondition: the operation is rejected from states outside customer, admin
- [ ] concurrency: Concurrent changes are serialised by an advisory lock so the last administrator cannot be removed twice at once.

## entity: dispute

- [ ] fixtures exist for every lifecycle state: open, resolved_refund, resolved_rejected
- [ ] cross-tenant read and write of dispute is rejected server-side

### dispute.list (query, risk high)

- [ ] positive: `admin` achieves "See the customer disputes awaiting a decision and past decisions"
- [ ] negative: `provider-owner` is rejected by the server for dispute.list
- [ ] negative: `provider-employee` is rejected by the server for dispute.list
- [ ] negative: `customer` is rejected by the server for dispute.list
- [ ] negative: an unauthenticated request to - is rejected
- [ ] safeguard: - blocks the unconfirmed path
- [ ] recovery: - restores the prior state

### dispute.resolve (command, risk critical)

- [ ] positive: `admin` achieves "Decide a dispute: refund the customer or reject, with a recorded reason"
- [ ] negative: `provider-owner` is rejected by the server for dispute.resolve
- [ ] negative: `provider-employee` is rejected by the server for dispute.resolve
- [ ] negative: `customer` is rejected by the server for dispute.resolve
- [ ] negative: an unauthenticated request to supabase/migrations/20261005010000_review_fix_money.sql#L1022 is rejected
- [ ] audit: - records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: supabase/tests/db/qa_defect_fixes.test.mjs#L339 blocks the unconfirmed path
- [ ] recovery: A decision is final in the console; a refund follows refund-request.retry. restores the prior state
- [ ] precondition: the operation is rejected from states outside open

## entity: package

- [ ] fixtures exist for every lifecycle state: active, inactive
- [ ] cross-tenant read and write of package is rejected server-side

### package.list (query, risk low)

- [ ] positive: `admin` achieves "See the service packages providers sell and how many vouchers are live"
- [ ] negative: `provider-owner` is rejected by the server for package.list
- [ ] negative: `provider-employee` is rejected by the server for package.list
- [ ] negative: `customer` is rejected by the server for package.list
- [ ] negative: an unauthenticated request to - is rejected

### package.toggle (command, risk moderate)

- [ ] positive: `admin` achieves "Switch a package on or off"
- [ ] negative: `provider-owner` is rejected by the server for package.toggle
- [ ] negative: `provider-employee` is rejected by the server for package.toggle
- [ ] negative: `customer` is rejected by the server for package.toggle
- [ ] negative: an unauthenticated request to - is rejected
- [ ] audit: - records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] precondition: the operation is rejected from states outside active, inactive

## entity: notification-broadcast

- [ ] fixtures exist for every lifecycle state: queued, sent, delivered, failed, skipped

### notification.broadcast (command, risk high)

- [ ] positive: `admin` achieves "Send an in-app and WhatsApp broadcast to an audience of customers or providers"
- [ ] negative: `provider-owner` is rejected by the server for notification.broadcast
- [ ] negative: `provider-employee` is rejected by the server for notification.broadcast
- [ ] negative: `customer` is rejected by the server for notification.broadcast
- [ ] negative: an unauthenticated request to supabase/migrations/20261005040000_review_fix_admin_broadcast.sql#L16 is rejected
- [ ] audit: supabase/migrations/20261005040000_review_fix_admin_broadcast.sql#L82 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: supabase/tests/db/admin.test.mjs#L37 blocks the unconfirmed path
- [ ] recovery: Queued WhatsApp messages cannot be recalled from the console. restores the prior state

### notification.log (query, risk high)

- [ ] positive: `admin` achieves "See recent messages sent, queued and skipped, with cost"
- [ ] negative: `provider-owner` is rejected by the server for notification.log
- [ ] negative: `provider-employee` is rejected by the server for notification.log
- [ ] negative: `customer` is rejected by the server for notification.log
- [ ] negative: an unauthenticated request to - is rejected
- [ ] safeguard: - blocks the unconfirmed path
- [ ] recovery: - restores the prior state

### notification.dispatch (command, risk moderate)

- [ ] positive: `admin` achieves "Run the message dispatcher now for a batch of queued messages"
- [ ] negative: `provider-owner` is rejected by the server for notification.dispatch
- [ ] negative: `provider-employee` is rejected by the server for notification.dispatch
- [ ] negative: `customer` is rejected by the server for notification.dispatch
- [ ] negative: an unauthenticated request to supabase/functions/deliver-governance-notices/index.ts, supabase/functions/dispatch-messages/index.ts#L1, supabase/migrations/20261011130000_secfix2_h4_governance_notice_delivery.sql is rejected
- [ ] audit: - records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)

## entity: sponsored-placement

- [ ] cross-tenant read and write of sponsored-placement is rejected server-side

### sponsored.overview (query, risk moderate)

- [ ] positive: `admin` achieves "See sponsored campaigns, accrued fees and the attributions for a month"
- [ ] negative: `provider-owner` is rejected by the server for sponsored.overview
- [ ] negative: `provider-employee` is rejected by the server for sponsored.overview
- [ ] negative: `customer` is rejected by the server for sponsored.overview
- [ ] negative: an unauthenticated request to supabase/migrations/20261008800100_sponsored_placement_commands.sql#L386 is rejected

### sponsored.configure (command, risk critical)

- [ ] positive: `admin` achieves "Switch sponsored placement on and set its price, slot count and attribution window"
- [ ] negative: `provider-owner` is rejected by the server for sponsored.configure
- [ ] negative: `provider-employee` is rejected by the server for sponsored.configure
- [ ] negative: `customer` is rejected by the server for sponsored.configure
- [ ] negative: an unauthenticated request to supabase/migrations/20261005080000_release_gap_controls.sql#L133, supabase/migrations/20261011150000_secfix2_lows_rewards_sponsored_reconcile_actor.sql is rejected
- [ ] audit: - records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: supabase/tests/db/sponsored.test.mjs#L162 blocks the unconfirmed path
- [ ] recovery: Set the previous value; switching it off stops accrual. restores the prior state

### sponsored.void-attribution (command, risk critical)

- [ ] positive: `admin` achieves "Void or waive a sponsored fee that should not be charged, with a reason"
- [ ] negative: `provider-owner` is rejected by the server for sponsored.void-attribution
- [ ] negative: `provider-employee` is rejected by the server for sponsored.void-attribution
- [ ] negative: `customer` is rejected by the server for sponsored.void-attribution
- [ ] negative: an unauthenticated request to supabase/migrations/20261008800100_sponsored_placement_commands.sql#L352 is rejected
- [ ] audit: supabase/tests/db/sponsored.test.mjs#L590 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: supabase/tests/db/sponsored.test.mjs#L590 blocks the unconfirmed path
- [ ] recovery: A voided fee is not charged; it cannot be restored from the console. restores the prior state

## entity: whatsapp-channel

- [ ] fixtures exist for every lifecycle state: unverified, verified
- [ ] cross-tenant read and write of whatsapp-channel is rejected server-side

### whatsapp.overview (query, risk moderate)

- [ ] positive: `admin` achieves "See how many receptionist channels, conversations and handoffs exist and which numbers await verification"
- [ ] negative: `provider-owner` is rejected by the server for whatsapp.overview
- [ ] negative: `provider-employee` is rejected by the server for whatsapp.overview
- [ ] negative: `customer` is rejected by the server for whatsapp.overview
- [ ] negative: an unauthenticated request to supabase/migrations/20261008700100_whatsapp_receptionist_commands.sql#L787 is rejected

### whatsapp.verify-channel (command, risk moderate)

- [ ] positive: `admin` achieves "Confirm that a provider's WhatsApp number was checked, with a reason"
- [ ] negative: `provider-owner` is rejected by the server for whatsapp.verify-channel
- [ ] negative: `provider-employee` is rejected by the server for whatsapp.verify-channel
- [ ] negative: `customer` is rejected by the server for whatsapp.verify-channel
- [ ] negative: an unauthenticated request to supabase/migrations/20261008700100_whatsapp_receptionist_commands.sql#L819 is rejected
- [ ] audit: supabase/tests/db/whatsapp_receptionist.test.mjs#L125 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] precondition: the operation is rejected from states outside unverified

## entity: country

- [ ] fixtures exist for every lifecycle state: inactive, active

### country.list (query, risk low)

- [ ] positive: `admin` achieves "See the countries the platform operates in with currency, time zone and VAT rate"
- [ ] negative: `provider-owner` is rejected by the server for country.list
- [ ] negative: `provider-employee` is rejected by the server for country.list
- [ ] negative: `customer` is rejected by the server for country.list
- [ ] negative: an unauthenticated request to - is rejected

### country.configure (command, risk critical)

- [ ] positive: `admin` achieves "Open or change a country and assign a branch to it, with a reason"
- [ ] negative: `provider-owner` is rejected by the server for country.configure
- [ ] negative: `provider-employee` is rejected by the server for country.configure
- [ ] negative: `customer` is rejected by the server for country.configure
- [ ] negative: an unauthenticated request to supabase/migrations/20261008900100_gcc_country_commands.sql#L5, supabase/migrations/20261008900100_gcc_country_commands.sql#L80 is rejected
- [ ] audit: - records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: - blocks the unconfirmed path
- [ ] recovery: - restores the prior state

## entity: operations-dashboard


### dashboard.overview (query, risk moderate)

- [ ] positive: `admin` achieves "See what needs attention now: queues with counts, oldest waiting time and money at stake, and live SAR figures"
- [ ] negative: `provider-owner` is rejected by the server for dashboard.overview
- [ ] negative: `provider-employee` is rejected by the server for dashboard.overview
- [ ] negative: `customer` is rejected by the server for dashboard.overview
- [ ] negative: an unauthenticated request to supabase/migrations/20261005090000_admin_dashboard_overview.sql#L8 is rejected

### activity.feed (query, risk low)

- [ ] positive: `admin` achieves "Glance at the latest bookings and newly registered providers"
- [ ] negative: `provider-owner` is rejected by the server for activity.feed
- [ ] negative: `provider-employee` is rejected by the server for activity.feed
- [ ] negative: `customer` is rejected by the server for activity.feed
- [ ] negative: an unauthenticated request to - is rejected

## entity: analytics-event


### analytics.funnel (query, risk low)

- [ ] positive: `admin` achieves "See how many visitors reached each step of the booking funnel in a period"
- [ ] negative: `provider-owner` is rejected by the server for analytics.funnel
- [ ] negative: `provider-employee` is rejected by the server for analytics.funnel
- [ ] negative: `customer` is rejected by the server for analytics.funnel
- [ ] negative: an unauthenticated request to supabase/migrations/20261007150900_analytics_events.sql#L102 is rejected

## entity: support-contact


### support.contact (query, risk low)

- [ ] positive: `admin` achieves "Reach platform support during an incident from the console"
- [ ] negative: `provider-owner` is rejected by the server for support.contact
- [ ] negative: `provider-employee` is rejected by the server for support.contact
- [ ] negative: `customer` is rejected by the server for support.contact
- [ ] negative: an unauthenticated request to - is rejected

## entity: admin-governance

- [ ] fixtures exist for every lifecycle state: pending, approved, rejected, executed, cancelled

### gov.console-roles (command, risk critical)

- [ ] positive: `admin` achieves "Assign owner, finance, operations or analyst console roles with reason, step-up and a last-owner guard"
- [ ] negative: `provider-owner` is rejected by the server for gov.console-roles
- [ ] negative: `provider-employee` is rejected by the server for gov.console-roles
- [ ] negative: `customer` is rejected by the server for gov.console-roles
- [ ] negative: an unauthenticated request to supabase/migrations/20261010100000_gov1_console_roles_and_mfa.sql#L594, supabase/migrations/20261010100000_gov1_console_roles_and_mfa.sql#L257, supabase/migrations/20261010410000_govfix_h2_role_grants_need_second_owner.sql#admin_set_console_role, supabase/migrations/20261010410000_govfix_h2_role_grants_need_second_owner.sql#gov_exec_role_change is rejected
- [ ] audit: supabase/migrations/20261010100000_gov1_console_roles_and_mfa.sql#L656, supabase/migrations/20261010410000_govfix_h2_role_grants_need_second_owner.sql#record_admin_role_history records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: supabase/tests/db/gov1_console_roles_mfa.test.mjs#L141, supabase/tests/db/gov1_console_roles_mfa.test.mjs#L152, supabase/tests/db/govfix_h2_role_grants.test.mjs blocks the unconfirmed path
- [ ] recovery: - restores the prior state
- [ ] concurrency: pg_advisory_xact_lock('primora.set_user_role') serialises role changes

### gov.mfa (command, risk critical)

- [ ] positive: `admin` achieves "Enrol and verify an authenticator app; every admin session must be AAL2; step-up within 5 minutes for sensitive actions; lockout after 10 failures; MFA reset by a different admin"
- [ ] negative: `provider-owner` is rejected by the server for gov.mfa
- [ ] negative: `provider-employee` is rejected by the server for gov.mfa
- [ ] negative: `customer` is rejected by the server for gov.mfa
- [ ] negative: an unauthenticated request to supabase/migrations/20261010100000_gov1_console_roles_and_mfa.sql#L285, supabase/migrations/20261010100000_gov1_console_roles_and_mfa.sql#L679, supabase/migrations/20261010100000_gov1_console_roles_and_mfa.sql#L770, supabase/migrations/20261010420000_govfix_h3_verified_contacts_m6_factor_alerts.sql#alert_admin_mfa_factor_added, supabase/migrations/20261010430000_govfix_sessions_step_up_and_lows.sql#session_is_live is rejected
- [ ] audit: supabase/migrations/20261010100000_gov1_console_roles_and_mfa.sql#L51, supabase/migrations/20261010420000_govfix_h3_verified_contacts_m6_factor_alerts.sql#alert_admin_mfa_factor_added records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: supabase/tests/db/gov1_console_roles_mfa.test.mjs#L109, supabase/tests/db/gov1_console_roles_mfa.test.mjs#L167 blocks the unconfirmed path
- [ ] recovery: - restores the prior state

### gov.approvals (command, risk critical)

- [ ] positive: `admin` achieves "Request, approve or reject payouts, refunds over thresholds, IBAN changes and governance settings with a different approver"
- [ ] negative: `provider-owner` is rejected by the server for gov.approvals
- [ ] negative: `provider-employee` is rejected by the server for gov.approvals
- [ ] negative: `customer` is rejected by the server for gov.approvals
- [ ] negative: an unauthenticated request to supabase/migrations/20261010110000_gov1_maker_checker_approvals.sql#L281, supabase/migrations/20261010110000_gov1_maker_checker_approvals.sql#L341, supabase/migrations/20261010110000_gov1_maker_checker_approvals.sql#L380, supabase/migrations/20261010110000_gov1_maker_checker_approvals.sql#L650, supabase/migrations/20261010410000_govfix_h2_role_grants_need_second_owner.sql#admin_approval_inbox, supabase/migrations/20261010410000_govfix_h2_role_grants_need_second_owner.sql#governance_decider_refusal, supabase/migrations/20261011110000_secfix2_h2_console_cancellations.sql, supabase/migrations/20261011120000_secfix2_h3_m4_m5_reconciliation_evidence.sql, supabase/migrations/20261011150000_secfix2_lows_rewards_sponsored_reconcile_actor.sql is rejected
- [ ] audit: supabase/migrations/20261010110000_gov1_maker_checker_approvals.sql#L432 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (one pending request per (kind, target); execution keeps admin_release_payout's idempotency key)
- [ ] safeguard: supabase/tests/db/gov1_maker_checker.test.mjs#L56, supabase/tests/db/gov1_maker_checker.test.mjs#L80, supabase/tests/db/gov1_maker_checker.test.mjs#L98 blocks the unconfirmed path
- [ ] recovery: a rejected or cancelled request changes nothing; a failed execution rolls the decision back restores the prior state
- [ ] concurrency: row lock on the request; partial unique index on pending (kind, target_id)

### gov.break-glass (command, risk critical)

- [ ] positive: `admin` achieves "Owner executes an approval alone when no second eligible admin exists, with step-up, justification, daily cap, notice and 7-day review"
- [ ] negative: `provider-owner` is rejected by the server for gov.break-glass
- [ ] negative: `provider-employee` is rejected by the server for gov.break-glass
- [ ] negative: `customer` is rejected by the server for gov.break-glass
- [ ] negative: an unauthenticated request to supabase/migrations/20261010110000_gov1_maker_checker_approvals.sql#L496, supabase/migrations/20261010110000_gov1_maker_checker_approvals.sql#L567, supabase/migrations/20261010410000_govfix_h2_role_grants_need_second_owner.sql#governance_break_glass_blocked_until, supabase/migrations/20261011120000_secfix2_h3_m4_m5_reconciliation_evidence.sql is rejected
- [ ] audit: supabase/migrations/20261010110000_gov1_maker_checker_approvals.sql#L557 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: supabase/tests/db/gov1_maker_checker.test.mjs, supabase/tests/db/govfix_h2_role_grants.test.mjs blocks the unconfirmed path
- [ ] recovery: - restores the prior state

### gov.iban-reveal (query, risk critical)

- [ ] positive: `admin` achieves "Reveal a provider IBAN once for 60 seconds with a referenced reason; masked everywhere else"
- [ ] negative: `provider-owner` is rejected by the server for gov.iban-reveal
- [ ] negative: `provider-employee` is rejected by the server for gov.iban-reveal
- [ ] negative: `customer` is rejected by the server for gov.iban-reveal
- [ ] negative: an unauthenticated request to supabase/migrations/20261010120000_gov1_iban_controls.sql#L363, supabase/migrations/20261010440000_govfix_wps_iban_and_reveal_limits.sql#admin_lift_iban_reveal_limit, supabase/migrations/20261010440000_govfix_wps_iban_and_reveal_limits.sql#reveal_employee_wps_iban, supabase/migrations/20261010440000_govfix_wps_iban_and_reveal_limits.sql#reveal_provider_iban, supabase/migrations/20261011140000_secfix2_mediums_lows_personal_reads.sql is rejected
- [ ] safeguard: supabase/tests/db/gov1_iban.test.mjs#L58, supabase/tests/db/gov1_iban.test.mjs#L75 blocks the unconfirmed path
- [ ] recovery: - restores the prior state

### gov.iban-change (command, risk critical)

- [ ] positive: `admin` achieves "Provider changes payout IBAN after re-authentication; finance approves; 48-hour hold; notices to contacts"
- [ ] positive: `provider-owner` achieves "Provider changes payout IBAN after re-authentication; finance approves; 48-hour hold; notices to contacts"
- [ ] negative: `provider-employee` is rejected by the server for gov.iban-change
- [ ] negative: `customer` is rejected by the server for gov.iban-change
- [ ] negative: an unauthenticated request to supabase/migrations/20261010120000_gov1_iban_controls.sql#L149, supabase/migrations/20261010120000_gov1_iban_controls.sql#L211, supabase/migrations/20261010420000_govfix_h3_verified_contacts_m6_factor_alerts.sql#gov_request_payout_destination, supabase/migrations/20261010420000_govfix_h3_verified_contacts_m6_factor_alerts.sql#queue_governance_notice is rejected
- [ ] audit: supabase/migrations/20261010120000_gov1_iban_controls.sql#L141 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (-)
- [ ] safeguard: supabase/tests/db/gov1_iban.test.mjs#L86, supabase/tests/db/gov1_iban.test.mjs#L102 blocks the unconfirmed path
- [ ] recovery: - restores the prior state

### gov.audited-reads (query, risk critical)

- [ ] positive: `admin` achieves "Read customer personal data, provider bank data, ledger rows, invoices and messages only through audited, paged server functions; health answers only through a logged step-up break-glass"
- [ ] negative: `provider-owner` is rejected by the server for gov.audited-reads
- [ ] negative: `provider-employee` is rejected by the server for gov.audited-reads
- [ ] negative: `customer` is rejected by the server for gov.audited-reads
- [ ] negative: an unauthenticated request to supabase/migrations/20261010200000_gov2_audited_admin_reads.sql#L307, supabase/migrations/20261010200000_gov2_audited_admin_reads.sql#L389, supabase/migrations/20261010200000_gov2_audited_admin_reads.sql#L449, supabase/migrations/20261010200000_gov2_audited_admin_reads.sql#L642, supabase/migrations/20261010200000_gov2_audited_admin_reads.sql#L788, supabase/migrations/20261010200000_gov2_audited_admin_reads.sql#L976, supabase/migrations/20261010450000_govfix_gov2_remaining_audited_reads.sql#admin_list_disputes, supabase/migrations/20261010450000_govfix_gov2_remaining_audited_reads.sql#admin_list_refund_requests, supabase/migrations/20261010450000_govfix_gov2_remaining_audited_reads.sql#admin_list_reviews, supabase/migrations/20261010450000_govfix_gov2_remaining_audited_reads.sql#admin_provider_private_directory, supabase/migrations/20261010450000_govfix_gov2_remaining_audited_reads.sql#admin_recent_bookings, supabase/migrations/20261011100000_secfix2_h1_m8_no_direct_console_reads.sql, supabase/migrations/20261011140000_secfix2_mediums_lows_personal_reads.sql is rejected
- [ ] safeguard: supabase/tests/db/gov2_audited_reads.test.mjs#L85, supabase/tests/db/gov2_audited_reads.test.mjs#L167, supabase/tests/db/gov2_audited_reads.test.mjs#L221, supabase/tests/db/gov2_audited_reads.test.mjs#L240 blocks the unconfirmed path
- [ ] recovery: Nothing to recover: no data changes; a refused read returns 42501 with HINT console_role_forbidden. restores the prior state
- [ ] concurrency: Read-only snapshots; totals and pages come from the same statement.

## entity: reconciliation

- [ ] fixtures exist for every lifecycle state: open, escalated, resolved

### reconciliation.daily (command, risk critical)

- [ ] positive: `admin` achieves "Daily match of Tap charges, refunds and settlements to the ledger, opening breaks"
- [ ] negative: `provider-owner` is rejected by the server for reconciliation.daily
- [ ] negative: `provider-employee` is rejected by the server for reconciliation.daily
- [ ] negative: `customer` is rejected by the server for reconciliation.daily
- [ ] negative: an unauthenticated request to supabase/functions/reconcile-psp/index.ts, supabase/migrations/20261010330000_money_tap_reconciliation.sql#L249, supabase/migrations/20261010330000_money_tap_reconciliation.sql#L266, supabase/migrations/20261010330000_money_tap_reconciliation.sql#L319, supabase/migrations/20261010330000_money_tap_reconciliation.sql#L350, supabase/migrations/20261011120000_secfix2_h3_m4_m5_reconciliation_evidence.sql, supabase/migrations/20261011150000_secfix2_lows_rewards_sponsored_reconcile_actor.sql is rejected
- [ ] audit: supabase/migrations/20261010330000_money_tap_reconciliation.sql#L466, supabase/migrations/20261010330000_money_tap_reconciliation.sql#L241, supabase/migrations/20261010330000_money_tap_reconciliation.sql#L340 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (events unique per (object_type, tap_object_id); one open break per (kind, subject); run row per day)
- [ ] safeguard: supabase/tests/db/money_reconciliation.test.mjs#L64, supabase/tests/db/money_reconciliation.test.mjs#L146 blocks the unconfirmed path
- [ ] recovery: breaks resolved by approved correction; timing differences auto-matched on Tap data restores the prior state
- [ ] concurrency: unique indexes; FOR UPDATE on breaks during escalation

### reconciliation.resolve-break (command, risk critical)

- [ ] positive: `admin` achieves "Resolve a break only through an approved adjustment citing the Tap object id; escalate after 3 business days"
- [ ] negative: `provider-owner` is rejected by the server for reconciliation.resolve-break
- [ ] negative: `provider-employee` is rejected by the server for reconciliation.resolve-break
- [ ] negative: `customer` is rejected by the server for reconciliation.resolve-break
- [ ] negative: an unauthenticated request to supabase/migrations/20261010300000_money_append_only_and_corrections.sql#L583, supabase/migrations/20261010330000_money_tap_reconciliation.sql#L486, supabase/migrations/20261011120000_secfix2_h3_m4_m5_reconciliation_evidence.sql is rejected
- [ ] audit: supabase/migrations/20261010300000_money_append_only_and_corrections.sql#L589 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (idempotency key per break and amounts)
- [ ] safeguard: supabase/tests/db/money_reconciliation.test.mjs#L128 blocks the unconfirmed path
- [ ] recovery: a further approved correction restores the prior state
- [ ] concurrency: approval row lock

## entity: reward-program

- [ ] fixtures exist for every lifecycle state: disabled, enabled

### reward-program.enable (command, risk critical)

- [ ] positive: `admin` achieves "Enable referral or loyalty only with all values set and a different owner approving"
- [ ] negative: `provider-owner` is rejected by the server for reward-program.enable
- [ ] negative: `provider-employee` is rejected by the server for reward-program.enable
- [ ] negative: `customer` is rejected by the server for reward-program.enable
- [ ] negative: an unauthenticated request to supabase/migrations/20261010320000_money_reward_programs.sql#L292, supabase/migrations/20261010320000_money_reward_programs.sql#L559, supabase/migrations/20261010320000_money_reward_programs.sql#L642, supabase/migrations/20261010320000_money_reward_programs.sql#L711, supabase/migrations/20261011150000_secfix2_lows_rewards_sponsored_reconcile_actor.sql is rejected
- [ ] audit: supabase/migrations/20261010320000_money_reward_programs.sql#L671, supabase/migrations/20261010320000_money_reward_programs.sql#L550 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (one pending request per programme; acceptance ON CONFLICT DO NOTHING; reversal unique per credit and refund)
- [ ] safeguard: supabase/tests/db/money_rewards.test.mjs#L38, supabase/tests/db/money_rewards.test.mjs#L72, supabase/tests/db/booking_engine_referrals.test.mjs#L116 blocks the unconfirmed path
- [ ] recovery: an approved change disables the programme; credits reversed by recorded reversal rows restores the prior state
- [ ] concurrency: row lock on the referral during vesting; approval row lock

## entity: privacy-request

- [ ] fixtures exist for every lifecycle state: awaiting_verification, open, awaiting_approval, executing, completed, refused, withdrawn

### privacy.request-intake (command, risk high)

- [ ] positive: `admin` achieves "Customers file access/copy/correction/deletion/consent-withdrawal requests in-app with a fresh one-time-code sign-in; staff log e-mail/phone/in-person requests that the customer confirms the same way"
- [ ] negative: `provider-owner` is rejected by the server for privacy.request-intake
- [ ] negative: `provider-employee` is rejected by the server for privacy.request-intake
- [ ] negative: `customer` is rejected by the server for privacy.request-intake
- [ ] negative: an unauthenticated request to supabase/migrations/20261011200000_priv_privacy_requests.sql, web_platform/src/app/customer/privacy/page.tsx, supabase/migrations/20261016210000_f2_customer_lookup_not_an_oracle.sql#L55 is rejected
- [ ] audit: supabase/migrations/20261011200000_priv_privacy_requests.sql, supabase/migrations/20261016210000_f2_customer_lookup_not_an_oracle.sql#L153 records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (One open request per customer and type (unique partial index); repeating returns the open one.)
- [ ] safeguard: supabase/tests/db/priv_privacy.test.mjs, supabase/tests/db/f123_final_recheck.test.mjs#L160 blocks the unconfirmed path
- [ ] recovery: Withdrawn by the customer while not approved; a contested field is restored. restores the prior state
- [ ] precondition: the operation is rejected from states outside awaiting_verification, open
- [ ] concurrency: Advisory lock per customer and type; row lock for every change.

### privacy.deadline-and-refusal (command, risk high)

- [ ] positive: `admin` achieves "30-day deadline, one notified extension before day 30, day-20/28 escalation, coded refusal with the SDAIA complaint right"
- [ ] negative: `provider-owner` is rejected by the server for privacy.deadline-and-refusal
- [ ] negative: `provider-employee` is rejected by the server for privacy.deadline-and-refusal
- [ ] negative: `customer` is rejected by the server for privacy.deadline-and-refusal
- [ ] negative: an unauthenticated request to supabase/migrations/20261011200000_priv_privacy_requests.sql is rejected
- [ ] audit: supabase/migrations/20261011200000_priv_privacy_requests.sql records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (Extension columns hold one extension; refusal only from an open state.)
- [ ] safeguard: supabase/tests/db/priv_privacy.test.mjs blocks the unconfirmed path
- [ ] recovery: A refused request is final; the customer files a new one. restores the prior state
- [ ] precondition: the operation is rejected from states outside awaiting_verification, open, awaiting_approval
- [ ] concurrency: Row lock FOR UPDATE.

### privacy.correction (command, risk high)

- [ ] positive: `admin` achieves "Correction with the contested field held out of processing, recipients notified, customer told"
- [ ] negative: `provider-owner` is rejected by the server for privacy.correction
- [ ] negative: `provider-employee` is rejected by the server for privacy.correction
- [ ] negative: `customer` is rejected by the server for privacy.correction
- [ ] negative: an unauthenticated request to supabase/migrations/20261011200000_priv_privacy_requests.sql is rejected
- [ ] audit: supabase/migrations/20261011200000_priv_privacy_requests.sql records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (One restriction per customer and field.)
- [ ] safeguard: supabase/tests/db/priv_privacy.test.mjs blocks the unconfirmed path
- [ ] recovery: Refusal or withdrawal restores the held value. restores the prior state
- [ ] precondition: the operation is rejected from states outside open
- [ ] concurrency: Row lock; profile trigger refuses other edits while restricted.

### privacy.copy-export (command, risk critical)

- [ ] positive: `admin` achieves "Access/copy released after a different owner approves; server-built JSON and Arabic/English PDF downloaded by the customer for 7 days"
- [ ] negative: `provider-owner` is rejected by the server for privacy.copy-export
- [ ] negative: `provider-employee` is rejected by the server for privacy.copy-export
- [ ] negative: `customer` is rejected by the server for privacy.copy-export
- [ ] negative: an unauthenticated request to supabase/migrations/20261011210000_priv_copy_export.sql, supabase/functions/privacy-export/index.ts, supabase/functions/privacy-export-download/index.ts, supabase/functions/_shared/privacy-export-document.ts is rejected
- [ ] audit: supabase/migrations/20261011210000_priv_copy_export.sql records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (One export per request (unique); rebuild overwrites the same paths.)
- [ ] safeguard: supabase/tests/db/priv_privacy.test.mjs, supabase/tests/privacy-export.test.mjs blocks the unconfirmed path
- [ ] recovery: A failed build is recorded and retried; expired files are removed and a new request is made. restores the prior state
- [ ] precondition: the operation is rejected from states outside open, awaiting_approval, executing
- [ ] concurrency: Approval executes once under the governance token.

### privacy.deletion (command, risk critical)

- [ ] positive: `admin` achieves "Approved deletion: delete account data, destroy health answers, pseudonymise retained bookings and money records, tombstone threads, delete the auth account, completion notice"
- [ ] negative: `provider-owner` is rejected by the server for privacy.deletion
- [ ] negative: `provider-employee` is rejected by the server for privacy.deletion
- [ ] negative: `customer` is rejected by the server for privacy.deletion
- [ ] negative: an unauthenticated request to supabase/migrations/20261011220000_priv_deletion_engine.sql, supabase/functions/privacy-erase-account/index.ts, supabase/functions/_shared/privacy-erasure.ts, supabase/migrations/20261016220000_f3_retention_purge_second_person.sql#L105 is rejected
- [ ] audit: supabase/migrations/20261011220000_priv_deletion_engine.sql records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (Approval executes once; the ledger upsert and auth step are idempotent (already-gone counts as done).)
- [ ] safeguard: supabase/tests/db/priv_privacy.test.mjs, supabase/tests/privacy-erasure.test.mjs, supabase/tests/db/f123_final_recheck.test.mjs#L209 blocks the unconfirmed path
- [ ] recovery: Irreversible by design; the preview is shown to customer, maker and approver; records with a legal basis are kept. restores the prior state
- [ ] precondition: the operation is rejected from states outside open, awaiting_approval, executing
- [ ] concurrency: Governance token, row locks, recorded erasure run bound to the transaction id.

### privacy.legal-hold (command, risk high)

- [ ] positive: `admin` achieves "Court-case or open-dispute holds with reason, reference, approver, 90-day review and release 30 days after the dispute closes"
- [ ] negative: `provider-owner` is rejected by the server for privacy.legal-hold
- [ ] negative: `provider-employee` is rejected by the server for privacy.legal-hold
- [ ] negative: `customer` is rejected by the server for privacy.legal-hold
- [ ] negative: an unauthenticated request to supabase/migrations/20261011220000_priv_deletion_engine.sql is rejected
- [ ] audit: supabase/migrations/20261011220000_priv_deletion_engine.sql records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (One active dispute hold per dispute.)
- [ ] safeguard: supabase/tests/db/priv_privacy.test.mjs blocks the unconfirmed path
- [ ] recovery: A released hold cannot be re-activated; a new hold is proposed. restores the prior state
- [ ] concurrency: Row lock on review/release.

### privacy.deletion-ledger (command, risk high)

- [ ] positive: `admin` achieves "Deletion ledger re-applied after a restore and exported for an archive outside the database"
- [ ] negative: `provider-owner` is rejected by the server for privacy.deletion-ledger
- [ ] negative: `provider-employee` is rejected by the server for privacy.deletion-ledger
- [ ] negative: `customer` is rejected by the server for privacy.deletion-ledger
- [ ] negative: an unauthenticated request to supabase/migrations/20261011220000_priv_deletion_engine.sql is rejected
- [ ] audit: supabase/migrations/20261011220000_priv_deletion_engine.sql records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (Re-application is idempotent.)
- [ ] safeguard: supabase/tests/db/priv_privacy.test.mjs blocks the unconfirmed path
- [ ] recovery: Archive entries restore the ledger itself. restores the prior state
- [ ] concurrency: Each subject erased in its own recorded run.

### intake.health-retention-and-gate (command, risk critical)

- [ ] positive: `admin` achieves "Health answers destroyed 30 days after the appointment, reused only under a separate 12-month consent, read only by the assigned provider, collected only after the transfer risk assessment is recorded"
- [ ] negative: `provider-owner` is rejected by the server for intake.health-retention-and-gate
- [ ] negative: `provider-employee` is rejected by the server for intake.health-retention-and-gate
- [ ] negative: `customer` is rejected by the server for intake.health-retention-and-gate
- [ ] negative: an unauthenticated request to supabase/migrations/20261011230000_priv_health_intake.sql is rejected
- [ ] audit: supabase/migrations/20261011230000_priv_health_intake.sql records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (The purge deletes only eligible rows; re-running finds none.)
- [ ] safeguard: supabase/tests/db/priv_privacy.test.mjs, supabase/tests/db/intake.test.mjs blocks the unconfirmed path
- [ ] recovery: Purged answers are gone by design; the customer completes a new form. restores the prior state
- [ ] concurrency: Set-based delete; gate read per call.

### privacy.queue (query, risk high)

- [ ] positive: `admin` achieves "The privacy-request queue (open by deadline with escalation flags, closed by completion) and one request with its history, audited per read"
- [ ] negative: `provider-owner` is rejected by the server for privacy.queue
- [ ] negative: `provider-employee` is rejected by the server for privacy.queue
- [ ] negative: `customer` is rejected by the server for privacy.queue
- [ ] negative: an unauthenticated request to supabase/migrations/20261011200000_priv_privacy_requests.sql is rejected
- [ ] safeguard: supabase/tests/db/priv_privacy.test.mjs blocks the unconfirmed path
- [ ] recovery: Read-only. restores the prior state
- [ ] precondition: the operation is rejected from states outside awaiting_verification, open, awaiting_approval, executing, completed, refused, withdrawn
- [ ] concurrency: Read-only.

## entity: privacy-incident

- [ ] fixtures exist for every lifecycle state: open, contained, closed

### incident.register (command, risk high)

- [ ] positive: `admin` achieves "Breach register with the 72-hour SDAIA clock from awareness, decisions, evidence and 5-year retention"
- [ ] negative: `provider-owner` is rejected by the server for incident.register
- [ ] negative: `provider-employee` is rejected by the server for incident.register
- [ ] negative: `customer` is rejected by the server for incident.register
- [ ] negative: an unauthenticated request to supabase/migrations/20261011240000_priv_incident_register.sql is rejected
- [ ] audit: supabase/migrations/20261011240000_priv_incident_register.sql records actor, target, reason, result
- [ ] idempotency: repeating the operation does not double-apply (References are sequence-numbered; decisions overwrite with history.)
- [ ] safeguard: supabase/tests/db/priv_privacy.test.mjs blocks the unconfirmed path
- [ ] recovery: Closed incidents are kept as recorded. restores the prior state
- [ ] precondition: the operation is rejected from states outside open, contained
- [ ] concurrency: Row lock FOR UPDATE.

### incident.list (query, risk high)

- [ ] positive: `admin` achieves "The incident register list and one incident with its history"
- [ ] negative: `provider-owner` is rejected by the server for incident.list
- [ ] negative: `provider-employee` is rejected by the server for incident.list
- [ ] negative: `customer` is rejected by the server for incident.list
- [ ] negative: an unauthenticated request to supabase/migrations/20261011240000_priv_incident_register.sql is rejected
- [ ] safeguard: supabase/tests/db/priv_privacy.test.mjs blocks the unconfirmed path
- [ ] recovery: Read-only. restores the prior state
- [ ] precondition: the operation is rejected from states outside open, contained, closed
- [ ] concurrency: Read-only.

## entity: processing-register

- [ ] fixtures exist for every lifecycle state: draft

### ropa.view (query, risk low)

- [ ] positive: `admin` achieves "Read-only RoPA in the console from the versioned document"
- [ ] negative: `provider-owner` is rejected by the server for ropa.view
- [ ] negative: `provider-employee` is rejected by the server for ropa.view
- [ ] negative: `customer` is rejected by the server for ropa.view
- [ ] negative: an unauthenticated request to scripts/build-ropa.mjs, web_platform/src/app/admin/ropa/page.tsx is rejected
- [ ] precondition: the operation is rejected from states outside draft
- [ ] concurrency: Not applicable (read-only).

## screens

- [x] /admin renders the loading state
- [x] /admin renders the populated state
- [x] /admin renders the error state
- [x] /admin renders the forbidden state
- [ ] /admin renders the empty state
- [ ] /admin renders the partial state
- [ ] /admin is operable by keyboard only
- [ ] /admin is usable at the project's smallest supported viewport
- [x] /admin/providers renders the loading state
- [x] /admin/providers renders the populated state
- [x] /admin/providers renders the error state
- [ ] /admin/providers renders the forbidden state
- [x] /admin/providers renders the success state
- [ ] /admin/providers renders the empty state
- [ ] /admin/providers is operable by keyboard only
- [ ] /admin/providers is usable at the project's smallest supported viewport
- [x] /admin/ledger renders the loading state
- [x] /admin/ledger renders the populated state
- [x] /admin/ledger renders the error state
- [ ] /admin/ledger renders the forbidden state
- [ ] /admin/ledger renders the empty state
- [ ] /admin/ledger renders the validation state
- [ ] /admin/ledger renders the success state
- [ ] /admin/ledger is operable by keyboard only
- [ ] /admin/ledger is usable at the project's smallest supported viewport
- [x] /admin/services renders the loading state
- [x] /admin/services renders the populated state
- [x] /admin/services renders the error state
- [ ] /admin/services renders the forbidden state
- [x] /admin/services renders the success state
- [ ] /admin/services renders the empty state
- [ ] /admin/services is operable by keyboard only
- [ ] /admin/services is usable at the project's smallest supported viewport
- [ ] /admin/integrations renders the loading state
- [x] /admin/integrations renders the populated state
- [x] /admin/integrations renders the error state
- [ ] /admin/integrations renders the forbidden state
- [x] /admin/integrations renders the success state
- [ ] /admin/integrations renders the empty state
- [ ] /admin/integrations is operable by keyboard only
- [ ] /admin/integrations is usable at the project's smallest supported viewport
- [x] /admin/coupons renders the loading state
- [x] /admin/coupons renders the populated state
- [x] /admin/coupons renders the error state
- [ ] /admin/coupons renders the forbidden state
- [x] /admin/coupons renders the success state
- [ ] /admin/coupons renders the empty state
- [ ] /admin/coupons is operable by keyboard only
- [ ] /admin/coupons is usable at the project's smallest supported viewport
- [x] /admin/bookings renders the loading state
- [x] /admin/bookings renders the populated state
- [x] /admin/bookings renders the error state
- [x] /admin/bookings renders the forbidden state
- [x] /admin/bookings renders the success state
- [ ] /admin/bookings renders the empty state
- [ ] /admin/bookings is operable by keyboard only
- [ ] /admin/bookings is usable at the project's smallest supported viewport
- [x] /admin/customers renders the loading state
- [x] /admin/customers renders the populated state
- [x] /admin/customers renders the error state
- [x] /admin/customers renders the forbidden state
- [x] /admin/customers renders the success state
- [ ] /admin/customers renders the empty state
- [ ] /admin/customers renders the filtered-empty state
- [ ] /admin/customers is operable by keyboard only
- [ ] /admin/customers is usable at the project's smallest supported viewport
- [x] /admin/branches renders the loading state
- [x] /admin/branches renders the populated state
- [x] /admin/branches renders the error state
- [ ] /admin/branches renders the forbidden state
- [x] /admin/branches renders the success state
- [ ] /admin/branches renders the empty state
- [ ] /admin/branches is operable by keyboard only
- [ ] /admin/branches is usable at the project's smallest supported viewport
- [x] /admin/disputes renders the loading state
- [x] /admin/disputes renders the populated state
- [x] /admin/disputes renders the error state
- [ ] /admin/disputes renders the forbidden state
- [x] /admin/disputes renders the success state
- [ ] /admin/disputes is operable by keyboard only
- [ ] /admin/disputes is usable at the project's smallest supported viewport
- [ ] /admin/activity renders the loading state
- [x] /admin/activity renders the populated state
- [x] /admin/activity renders the error state
- [ ] /admin/activity renders the forbidden state
- [ ] /admin/activity renders the empty state
- [ ] /admin/activity is operable by keyboard only
- [ ] /admin/activity is usable at the project's smallest supported viewport
- [x] /admin/employees renders the loading state
- [x] /admin/employees renders the populated state
- [x] /admin/employees renders the error state
- [x] /admin/employees renders the forbidden state
- [ ] /admin/employees renders the empty state
- [ ] /admin/employees renders the filtered-empty state
- [ ] /admin/employees is operable by keyboard only
- [ ] /admin/employees is usable at the project's smallest supported viewport
- [x] /admin/reviews renders the loading state
- [x] /admin/reviews renders the populated state
- [x] /admin/reviews renders the error state
- [ ] /admin/reviews renders the forbidden state
- [x] /admin/reviews renders the success state
- [ ] /admin/reviews renders the empty state
- [ ] /admin/reviews is operable by keyboard only
- [ ] /admin/reviews is usable at the project's smallest supported viewport
- [x] /admin/taxes renders the loading state
- [x] /admin/taxes renders the populated state
- [x] /admin/taxes renders the error state
- [x] /admin/taxes renders the forbidden state
- [ ] /admin/taxes renders the empty state
- [ ] /admin/taxes is operable by keyboard only
- [ ] /admin/taxes is usable at the project's smallest supported viewport
- [x] /admin/settings renders the loading state
- [x] /admin/settings renders the populated state
- [x] /admin/settings renders the error state
- [x] /admin/settings renders the forbidden state
- [ ] /admin/settings renders the validation state
- [ ] /admin/settings renders the success state
- [ ] /admin/settings is operable by keyboard only
- [ ] /admin/settings is usable at the project's smallest supported viewport
- [x] /admin/reports renders the loading state
- [x] /admin/reports renders the populated state
- [x] /admin/reports renders the error state
- [x] /admin/reports renders the forbidden state
- [x] /admin/reports renders the success state
- [ ] /admin/reports renders the empty state
- [ ] /admin/reports is operable by keyboard only
- [ ] /admin/reports is usable at the project's smallest supported viewport
- [x] /admin/packages renders the loading state
- [x] /admin/packages renders the populated state
- [x] /admin/packages renders the error state
- [ ] /admin/packages renders the forbidden state
- [x] /admin/packages renders the success state
- [ ] /admin/packages renders the empty state
- [ ] /admin/packages is operable by keyboard only
- [ ] /admin/packages is usable at the project's smallest supported viewport
- [x] /admin/notifications renders the loading state
- [x] /admin/notifications renders the populated state
- [x] /admin/notifications renders the error state
- [ ] /admin/notifications renders the forbidden state
- [x] /admin/notifications renders the success state
- [ ] /admin/notifications renders the empty state
- [ ] /admin/notifications is operable by keyboard only
- [ ] /admin/notifications is usable at the project's smallest supported viewport
- [ ] /admin/help renders the loading state
- [x] /admin/help renders the populated state
- [ ] /admin/help renders the error state
- [ ] /admin/help renders the forbidden state
- [ ] /admin/help is operable by keyboard only
- [ ] /admin/help is usable at the project's smallest supported viewport
- [x] /provider/inventory renders the loading state
- [x] /provider/inventory renders the populated state
- [x] /provider/inventory renders the error state
- [x] /provider/inventory renders the forbidden state
- [x] /provider/inventory renders the success state
- [ ] /provider/inventory renders the empty state
- [ ] /provider/inventory renders the filtered-empty state
- [ ] /provider/inventory is operable by keyboard only
- [ ] /provider/inventory is usable at the project's smallest supported viewport
- [x] /provider/chain renders the loading state
- [x] /provider/chain renders the populated state
- [x] /provider/chain renders the error state
- [x] /provider/chain renders the forbidden state
- [x] /provider/chain renders the success state
- [ ] /provider/chain renders the empty state
- [ ] /provider/chain renders the filtered-empty state
- [ ] /provider/chain is operable by keyboard only
- [ ] /provider/chain is usable at the project's smallest supported viewport
- [x] /admin/supply renders the loading state
- [x] /admin/supply renders the populated state
- [x] /admin/supply renders the error state
- [ ] /admin/supply renders the forbidden state
- [x] /admin/supply renders the success state
- [ ] /admin/supply renders the empty state
- [ ] /admin/supply renders the filtered-empty state
- [ ] /admin/supply is operable by keyboard only
- [ ] /admin/supply is usable at the project's smallest supported viewport
- [x] /admin/refunds renders the loading state
- [x] /admin/refunds renders the populated state
- [x] /admin/refunds renders the error state
- [x] /admin/refunds renders the forbidden state
- [x] /admin/refunds renders the success state
- [ ] /admin/refunds renders the empty state
- [ ] /admin/refunds renders the filtered-empty state
- [ ] /admin/refunds is operable by keyboard only
- [ ] /admin/refunds is usable at the project's smallest supported viewport
- [x] /admin/audit-logs renders the loading state
- [x] /admin/audit-logs renders the populated state
- [x] /admin/audit-logs renders the error state
- [x] /admin/audit-logs renders the forbidden state
- [ ] /admin/audit-logs renders the empty state
- [ ] /admin/audit-logs renders the filtered-empty state
- [ ] /admin/audit-logs is operable by keyboard only
- [ ] /admin/audit-logs is usable at the project's smallest supported viewport
- [x] /admin/platform-rules renders the loading state
- [x] /admin/platform-rules renders the populated state
- [x] /admin/platform-rules renders the error state
- [x] /admin/platform-rules renders the forbidden state
- [x] /admin/platform-rules renders the success state
- [ ] /admin/platform-rules renders the empty state
- [ ] /admin/platform-rules is operable by keyboard only
- [ ] /admin/platform-rules is usable at the project's smallest supported viewport
- [x] /admin/roles renders the loading state
- [x] /admin/roles renders the populated state
- [x] /admin/roles renders the error state
- [x] /admin/roles renders the forbidden state
- [x] /admin/roles renders the success state
- [ ] /admin/roles renders the empty state
- [ ] /admin/roles is operable by keyboard only
- [ ] /admin/roles is usable at the project's smallest supported viewport
- [x] /admin/sponsored renders the loading state
- [x] /admin/sponsored renders the populated state
- [x] /admin/sponsored renders the error state
- [x] /admin/sponsored renders the forbidden state
- [x] /admin/sponsored renders the success state
- [ ] /admin/sponsored renders the empty state
- [ ] /admin/sponsored is operable by keyboard only
- [ ] /admin/sponsored is usable at the project's smallest supported viewport
- [x] /admin/whatsapp renders the loading state
- [x] /admin/whatsapp renders the populated state
- [x] /admin/whatsapp renders the error state
- [x] /admin/whatsapp renders the forbidden state
- [x] /admin/whatsapp renders the success state
- [ ] /admin/whatsapp renders the empty state
- [ ] /admin/whatsapp is operable by keyboard only
- [ ] /admin/whatsapp is usable at the project's smallest supported viewport
- [ ] /privacy renders the loading state
- [x] /privacy renders the populated state
- [x] /privacy renders the error state
- [ ] /privacy renders the forbidden state
- [x] /privacy renders the success state
- [ ] /privacy is operable by keyboard only
- [ ] /privacy is usable at the project's smallest supported viewport
- [x] /admin/privacy renders the loading state
- [x] /admin/privacy renders the populated state
- [x] /admin/privacy renders the error state
- [x] /admin/privacy renders the forbidden state
- [x] /admin/privacy renders the success state
- [ ] /admin/privacy renders the empty state
- [ ] /admin/privacy is operable by keyboard only
- [ ] /admin/privacy is usable at the project's smallest supported viewport
- [x] /admin/incidents renders the loading state
- [x] /admin/incidents renders the populated state
- [x] /admin/incidents renders the error state
- [x] /admin/incidents renders the forbidden state
- [x] /admin/incidents renders the success state
- [ ] /admin/incidents renders the empty state
- [ ] /admin/incidents is operable by keyboard only
- [ ] /admin/incidents is usable at the project's smallest supported viewport
- [ ] /admin/ropa renders the loading state
- [x] /admin/ropa renders the populated state
- [ ] /admin/ropa renders the error state
- [ ] /admin/ropa renders the forbidden state
- [ ] /admin/ropa is operable by keyboard only
- [ ] /admin/ropa is usable at the project's smallest supported viewport
- [x] /customer/privacy renders the loading state
- [x] /customer/privacy renders the populated state
- [x] /customer/privacy renders the error state
- [ ] /customer/privacy renders the forbidden state
- [x] /customer/privacy renders the success state
- [ ] /customer/privacy renders the empty state
- [ ] /customer/privacy is operable by keyboard only
- [ ] /customer/privacy is usable at the project's smallest supported viewport
- [x] /login/mfa renders the loading state
- [x] /login/mfa renders the populated state
- [x] /login/mfa renders the error state
- [x] /login/mfa renders the forbidden state
- [ ] /login/mfa renders the validation state
- [ ] /login/mfa renders the success state
- [ ] /login/mfa is operable by keyboard only
- [ ] /login/mfa is usable at the project's smallest supported viewport
- [x] /admin/approvals renders the loading state
- [x] /admin/approvals renders the populated state
- [x] /admin/approvals renders the error state
- [x] /admin/approvals renders the forbidden state
- [ ] /admin/approvals renders the empty state
- [ ] /admin/approvals renders the validation state
- [ ] /admin/approvals renders the success state
- [ ] /admin/approvals is operable by keyboard only
- [ ] /admin/approvals is usable at the project's smallest supported viewport
- [x] /admin/reconciliation renders the loading state
- [x] /admin/reconciliation renders the populated state
- [x] /admin/reconciliation renders the error state
- [x] /admin/reconciliation renders the forbidden state
- [ ] /admin/reconciliation renders the empty state
- [ ] /admin/reconciliation renders the validation state
- [ ] /admin/reconciliation renders the success state
- [ ] /admin/reconciliation is operable by keyboard only
- [ ] /admin/reconciliation is usable at the project's smallest supported viewport
- [x] /provider/pricing renders the loading state
- [x] /provider/pricing renders the populated state
- [x] /provider/pricing renders the error state
- [ ] /provider/pricing renders the forbidden state
- [ ] /provider/pricing renders the empty state
- [ ] /provider/pricing renders the success state
- [ ] /provider/pricing is operable by keyboard only
- [ ] /provider/pricing is usable at the project's smallest supported viewport
- [x] /become-provider renders the loading state
- [x] /become-provider renders the populated state
- [x] /become-provider renders the error state
- [ ] /become-provider renders the forbidden state
- [ ] /become-provider renders the empty state
- [ ] /become-provider renders the validation state
- [ ] /become-provider renders the success state
- [ ] /become-provider is operable by keyboard only
- [ ] /become-provider is usable at the project's smallest supported viewport
