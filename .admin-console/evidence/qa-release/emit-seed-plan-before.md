# Seed and fixture plan

Build these fixtures before verification. Fixtures are real records in a real store, not literals in the UI.

## Role accounts

| Role | Scopes | MFA | Purpose |
|---|---|---|---|
| admin | platform-wide, no tenant restriction, no monetary limit | False | Verify and suspend providers, Moderate the service catalog and pricing, Arbitrate disputes and authorise refunds, Review and release provider payouts from the ledger, Configure payment gateways and integrations, Configure VAT rate, commission and platform settings, Manage coupons and promotions |
| provider-owner | providers.owner_id = auth.uid() | False | Manage own shops, branches, employees and services, Request payouts of accrued provider_share, View own bookings and ledger |
| provider-employee | employees.profile_id = auth.uid() | False | View own assigned bookings, Maintain own availability |
| customer | profiles.id = auth.uid() | False | Book, cancel and review services |

## entity: provider

| Fixture | Requirement |
|---|---|
| state:pending | at least one record resting in this state |
| state:approved | at least one record resting in this state |
| state:rejected | at least one record resting in this state |
| state:suspended | at least one record resting in this state |
| state:active | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| cross-tenant | records owned by a second tenant that must never be visible |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: branch

| Fixture | Requirement |
|---|---|
| state:active | at least one record resting in this state |
| state:inactive | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| cross-tenant | records owned by a second tenant that must never be visible |

## entity: service

| Fixture | Requirement |
|---|---|
| state:active | at least one record resting in this state |
| state:inactive | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| cross-tenant | records owned by a second tenant that must never be visible |

## entity: booking

| Fixture | Requirement |
|---|---|
| state:pending_payment | at least one record resting in this state |
| state:confirmed | at least one record resting in this state |
| state:completed | at least one record resting in this state |
| state:cancelled | at least one record resting in this state |
| state:no_show | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| cross-tenant | records owned by a second tenant that must never be visible |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: ledger-entry

| Fixture | Requirement |
|---|---|
| state:pending | at least one record resting in this state |
| state:released | at least one record resting in this state |
| state:refunded | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| cross-tenant | records owned by a second tenant that must never be visible |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: payout-request

| Fixture | Requirement |
|---|---|
| state:requested | at least one record resting in this state |
| state:processing | at least one record resting in this state |
| state:paid | at least one record resting in this state |
| state:rejected | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| cross-tenant | records owned by a second tenant that must never be visible |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: refund-request

| Fixture | Requirement |
|---|---|
| state:pending | at least one record resting in this state |
| state:processing | at least one record resting in this state |
| state:succeeded | at least one record resting in this state |
| state:failed | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| cross-tenant | records owned by a second tenant that must never be visible |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: customer

| Fixture | Requirement |
|---|---|
| state:active | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: employee

| Fixture | Requirement |
|---|---|
| state:active | at least one record resting in this state |
| state:inactive | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| cross-tenant | records owned by a second tenant that must never be visible |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: review

| Fixture | Requirement |
|---|---|
| state:published | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| cross-tenant | records owned by a second tenant that must never be visible |

## entity: promotional-code

| Fixture | Requirement |
|---|---|
| state:active | at least one record resting in this state |
| state:inactive | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |

## entity: integration

| Fixture | Requirement |
|---|---|
| state:connected | at least one record resting in this state |
| state:disconnected | at least one record resting in this state |
| state:error | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: payment-method

| Fixture | Requirement |
|---|---|
| state:enabled | at least one record resting in this state |
| state:disabled | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |

## entity: platform-settings

| Fixture | Requirement |
|---|---|
| state:active | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: audit-event

| Fixture | Requirement |
|---|---|
| state:recorded | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: inventory-operations

| Fixture | Requirement |
|---|---|
| state:active | at least one record resting in this state |
| state:inactive | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| cross-tenant | records owned by a second tenant that must never be visible |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: feature-flag

| Fixture | Requirement |
|---|---|
| state:off | at least one record resting in this state |
| state:on | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |

## entity: fee-rule

| Fixture | Requirement |
|---|---|
| state:active | at least one record resting in this state |
| state:inactive | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: role-assignment

| Fixture | Requirement |
|---|---|
| state:customer | at least one record resting in this state |
| state:provider_owner | at least one record resting in this state |
| state:admin | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: dispute

| Fixture | Requirement |
|---|---|
| state:open | at least one record resting in this state |
| state:resolved_refund | at least one record resting in this state |
| state:resolved_rejected | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| cross-tenant | records owned by a second tenant that must never be visible |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: package

| Fixture | Requirement |
|---|---|
| state:active | at least one record resting in this state |
| state:inactive | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| cross-tenant | records owned by a second tenant that must never be visible |

## entity: notification-broadcast

| Fixture | Requirement |
|---|---|
| state:queued | at least one record resting in this state |
| state:sent | at least one record resting in this state |
| state:delivered | at least one record resting in this state |
| state:failed | at least one record resting in this state |
| state:skipped | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: sponsored-placement

| Fixture | Requirement |
|---|---|
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| cross-tenant | records owned by a second tenant that must never be visible |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: whatsapp-channel

| Fixture | Requirement |
|---|---|
| state:unverified | at least one record resting in this state |
| state:verified | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| cross-tenant | records owned by a second tenant that must never be visible |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: country

| Fixture | Requirement |
|---|---|
| state:inactive | at least one record resting in this state |
| state:active | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |

## entity: operations-dashboard

| Fixture | Requirement |
|---|---|
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: analytics-event

| Fixture | Requirement |
|---|---|
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |

## entity: support-contact

| Fixture | Requirement |
|---|---|
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |

## entity: admin-governance

| Fixture | Requirement |
|---|---|
| state:pending | at least one record resting in this state |
| state:approved | at least one record resting in this state |
| state:rejected | at least one record resting in this state |
| state:executed | at least one record resting in this state |
| state:cancelled | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: reconciliation

| Fixture | Requirement |
|---|---|
| state:open | at least one record resting in this state |
| state:escalated | at least one record resting in this state |
| state:resolved | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: reward-program

| Fixture | Requirement |
|---|---|
| state:disabled | at least one record resting in this state |
| state:enabled | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: privacy-request

| Fixture | Requirement |
|---|---|
| state:awaiting_verification | at least one record resting in this state |
| state:open | at least one record resting in this state |
| state:awaiting_approval | at least one record resting in this state |
| state:executing | at least one record resting in this state |
| state:completed | at least one record resting in this state |
| state:refused | at least one record resting in this state |
| state:withdrawn | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: privacy-incident

| Fixture | Requirement |
|---|---|
| state:open | at least one record resting in this state |
| state:contained | at least one record resting in this state |
| state:closed | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |
| sensitive | records carrying the fields that must be redacted or access-logged |

## entity: processing-register

| Fixture | Requirement |
|---|---|
| state:draft | at least one record resting in this state |
| empty | no records at all, so the empty state is exercised |
| large | enough records to force pagination, virtualization, and the performance budget |
| long-text | maximum-length and non-Latin text in every displayed field |
| missing-optional | records with every optional field null or absent |
| conflict | two operators editing the same record, producing a version conflict |
| partial-failure | a bulk or job run where some items succeed and some fail |

## Integrations

| Integration | Fixture |
|---|---|
| tap-payments | provider timeout, duplicate delivery, and reconciliation mismatch |
| expo-push | provider timeout, duplicate delivery, and reconciliation mismatch |
| sms-otp | provider timeout, duplicate delivery, and reconciliation mismatch |

## Work queues

| Queue | Fixture |
|---|---|
| provider-onboarding | backlog past its SLA, an empty queue, and one item claimed by another operator |
| payout-approval | backlog past its SLA, an empty queue, and one item claimed by another operator |
| refund-arbitration | backlog past its SLA, an empty queue, and one item claimed by another operator |
| failed-payment | backlog past its SLA, an empty queue, and one item claimed by another operator |
| webhook-failure | backlog past its SLA, an empty queue, and one item claimed by another operator |
