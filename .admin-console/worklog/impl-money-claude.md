# impl-money-claude — MONEY package (2026-10-10)

Role: implementer. Branch `claude-code` in `primora-fix`. Plan of record: D-Q7, D-Q8, D-Q9, D-D3 "Final decision text" in
`docs/legal/2026-10-10-money-governance-decision-memo.md`, adopted in `docs/legal/2026-10-10-adopted-decisions.md`, plus GOV-1
review findings C-1, C-2, H-4, M-1 (`docs/reviews/2026-10-10-security-gov1.md`). All claimed capabilities left `in-progress`,
`unreviewed`; `provider.set-commission` set `not-applicable` (D-D3).

## Built (commits 967d7b5, 14763e2, 8aaa2a2, c76fd78, b12ef6a)

- `20261010300000_money_append_only_and_corrections.sql` — C-1: no client writes on 22 money tables (policies → read, privileges
  and column grants revoked, money.write removed, service role cannot DELETE/TRUNCATE); D-Q8 `guard_money_append_only` trigger
  (ledger rows: identity/captured frozen, only settling server paths under `primora.ledger_system_write`, shares never grow);
  C-2: booking money columns frozen, admins lose direct booking writes, wallet settlement from redemption rows; approval kinds
  ledger_settlement/ledger_adjustment/fee_rule_change/payout_hold/reward_program; linked adjustment/reversal entries
  (`admin_propose_ledger_adjustment`, maker ≠ checker, break-glass within cap); H-4 two-person manual settlement with bank
  reference and approved account; M-1 advisory lock on the daily refund threshold.
- `..._310000_money_pending_changes.sql` — versioned effective-dated fee rules, `admin_propose_fee_rule_change` (prospective,
  increases ≥ 30 days after approval, provider notices + notifications), booking fee snapshot, `admin_save_fee_rule` dropped,
  payout holds.
- `..._320000_money_reward_programs.sql` — D-Q7 reward_programs (all unset, invented loyalty values removed), AR/EN terms,
  acceptances, owner-approved enablement only, vesting/reversal, caps/budget, loyalty expiry and platform settlement.
- `..._330000_money_tap_reconciliation.sql` + `functions/check-refund-status`, `_shared/tap-refund-status.ts`, reconcile-psp and
  refunds.ts changes — D-Q9 evidence import, itemised run, breaks, escalation, refund timelines, Check with Tap.
- `..._340000_money_effective_fee_and_vat_status.sql` — D-D3 fee terms RPC, VAT status capture and command.
- `..._350000_money_function_grants.sql` — mapping function not callable by anon.
- Screens: `/admin/reconciliation` (new, nav), `/admin/platform-rules` (versions, proposals), `/admin/settings` (programmes panel),
  `/admin/approvals` (new kinds), `/admin/ledger` (bank reference), `/admin/providers` and `/provider/pricing` (effective fee,
  invented 20/15/85/10% copy removed), `/become-provider` (VAT status), `/customer/wallet` (terms acceptance). AR/EN, RTL.

## Tests and checks

New: `money_append_only` (13), `money_pending_changes` (7), `money_rewards` (9), `money_reconciliation` (13), `money_fee_terms_vat` (7),
rewritten `booking_engine_referrals` (9), `tap-refund-status` node (wired into test:edge), web `money-screens` (8). Updated older
tests where the decisions changed behaviour. Results: test:db 1254 pass, test:inventory 10, test:edge 16, test:mobile 27,
web 729, test:ui-schema 0 mismatches, security-core and admin-controls pass, tsc clean, lint 0 errors, typecheck:mobile clean.
Live (local stack): migrations applied with `supabase migration up --local`; PostgREST with locally signed aal2 sessions —
direct ledger/wallet/settings writes 403, reconciliation/rewards/fee RPCs 200, enable-without-values refused; two concurrent
sessions serialise on the refund threshold lock; every changed route answers 200 on :3100.

## Not done / gaps filed

money-refund-accounting-mutates-original-row, zatca-vat-number-verification-not-integrated (blocked), tap-settlement-api-import-not-built,
reconciliation-and-tap-check-not-scheduled, saudi-public-holidays-not-in-business-days, tap-refund-status-values-unconfirmed,
check-refund-status-edge-not-deployed-or-run, money-screens-not-browser-verified-with-totp, provider-commission-percentage-column-dead,
provider-plan-prices-hard-coded-in-pricing-page, rewards-counsel-and-tax-before-enablement (blocked). GOV-1 H-1..H-3, M-2..M-6 not in scope.

## Next agent's first action

adminwright-security over money.append-only, ledger.adjustment, money.pending-change, reward-program.enable,
reconciliation.*, refund.check-with-tap: re-read migrations 20261010300000–350000 (not this summary), try every console role and
the service role against the money tables and the new commands, attack the `primora.ledger_system_write` / governance markers and
the break resolution guard; then ux-reviewer with a real TOTP sign-in over /admin/reconciliation, /admin/settings,
/admin/platform-rules and /provider/pricing.
