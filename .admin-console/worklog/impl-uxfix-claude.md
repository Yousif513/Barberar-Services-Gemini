# impl-uxfix-claude — UX round 1 fixes (2026-10-11 to 2026-10-16)

Implementer pass over the 23 `ux1-` gaps filed by `ux-round1-claude` (docs/reviews/2026-10-11-ux-review.md). Branch
`claude-code`, checkout `primora-fix`. Commits UXFIX-1 to UXFIX-8 (3b51d7a .. 87c6944). No push.

## What changed

- **Server (migrations 20261011400000, 20261011410000).**
  - `admin_session_state` also returns the console-role catalogue and the codes left before the MFA lockout.
  - `admin_list_audit_events(p_event_class)` filters changes, reads or all; it also returns the record types present.
    The helper `audit_event_is_read` is immutable.
  - `admin_privacy_find_customers` is the audited customer lookup. It needs `privacy.manage`, at least 3 characters,
    returns at most 10 customer accounts with masked e-mail and the last 4 digits of the phone, and logs
    `privacy.subject_lookup` without the query text.
  - `admin_clear_customer_profile` now only requests. The new approval kind `customer_profile_clear` (approver
    permission `privacy.approve`) clears inside the approved execution through `gov_exec_customer_profile_clear`, which
    `authenticated` cannot execute.
  - The dashboard reconciliation card now reads `tap_reconciliation_runs`.
- **Console.**
  - Role trimming lives in `lib/console-session.tsx`: navigation, the route gate (no refused calls on load), dashboard
    rows, roles actions, privacy queue actions, and ledger reveal and payout actions.
  - `ForbiddenNotice` names the console role and the roles that grant the screen.
  - Modal changes: focus guard, readOnly while busy, scroll lock, and no self-inerting of in-place dialogs (three are
    now portalled). `CommandResult` takes focus when focus was lost.
  - Step-up and `/login/mfa` show localized errors with codes left (`lib/auth-errors.ts`). MFA preparation runs once
    per load, so there are no duplicate unenrol 404s.
  - Typed confirmation on removing console access and on MFA reset.
- **Screens.**
  - Privacy:
    - customer picker and in-language validation;
    - customer privacy: code asked before sending, localized errors, the result says what was received and when.
  - Provider pricing: every figure comes from `subscription_plans`, the fee rules or the server quote.
  - Ledger:
    - APG tabs that scroll at 375 px;
    - the reconciliation tab reads `admin_reconciliation_overview`;
    - one SAR formatter;
    - payout and reveal states.
  - Audit log: changes/reads filter and operator record-type names.
  - Reconciliation feedback.
  - h1 on every reviewed screen.
  - Arabic-Indic digits in Arabic copy and Intl for interpolated numbers. Identifiers, phones and e-mails stay Latin.
  - become-provider: icons, Arabic number agreement, no form while applications are closed.
  - RoPA: English-only note in Arabic.
  - `aria-expanded` on programme disclosures.

## Decisions (assumed, recorded in the manifest)

- The Arabic numeral system is Arabic-Indic, following the existing `ar-SA` Intl formatter used by `sar()` and the dates.
- Clearing a profile is treated as erasure, so it needs the same second-owner approval (`privacy.approve`) as a
  privacy deletion. It is not a narrower correction.
- The RoPA stays English-only with an Arabic note. A translation of a controlled legal register needs the DPO.
- Payout and IBAN reveal states are proven by unit and source tests (`tests/payout-display.test.mjs`). No payout data
  was inserted.

## Verification

- Browser (Playwright, real sign-in with TOTP from the local DB, nothing printed). Evidence is in
  `.admin-console/evidence/ux-fix/`.
- Finance EN 1440: 15 routes, 0 console errors, 0 4xx. Forbidden screens name Finance and the granting roles.
- Owner AR 375: 15 routes with h1, no overflow, 0 errors. The remaining Latin digits are identifiers, e-mails and
  phones only.
- Keyboard flows, AR 375 and EN 1440:
  - ledger tabs by arrows reach the last tab inside the viewport;
  - privacy lookup finds customers, and an empty submit shows an in-language error with focus on the field;
  - the remove dialog has typed confirmation and scroll lock, and Escape returns focus;
  - the audit log opens on changes;
  - the fee dialog opens with focus inside;
  - after a wrong step-up code, focus stays in the dialog (see `flows-en-1440.txt`).
- Checks:

  | Check | Result |
  |---|---|
  | `test:db` | 1399/1401. The 2 failures: `money.test.mjs` "invoices the fee still owed" fails on any date in an open month (pre-existing, filed); the pricing failure I caused is fixed. |
  | `inventory`, `edge`, `mobile`, `ui-schema`, `security-core`, `admin-controls`, `p3-compat HEAD` | pass |
  | `tsc` | clean |
  | lint | 0 errors |
  | `typecheck:mobile` | clean |
  | deno lint/check | clean |
  | smoke | 19/19 |
  | web tests | 741/741 |
  | Step-up | Run after the 5-minute window. A wrong code reads "That code is not correct…" and the focus stays on the code input (`flows-stepup-en-1440.txt`). The 403 and 422 are the designed step-up refusal and the wrong-code answer. The same value was proposed, so nothing was created. |
  | Manifest | `validate` exits 0 with 24 warnings. `coverage` reports 6 errors, all pre-existing (21 at HEAD before this pass). `validate --phase release` reports 330 errors, pre-existing, so the console is not release-ready. |

## Not done / notes

- A concurrent commit (6042264, another agent) landed on this branch during the pass. My work did not touch its files.
- Not taken on: the privacy re-review findings in docs/reviews/2026-10-11-security-priv-recheck.md (M3, M5/N1, N2,
  N3–N9). Those belong to the next pass.
- `/admin/bookings` cancel copy still names fixed SAR 1,000 / 5,000 thresholds that live in `governance_settings`.
  Filed as a gap.

## Next agent's first action

ux-reviewer: re-run the round-1 session at 375 px in Arabic and at 1440 in English, then close or reopen each `ux1-` gap.
security: re-check `customer_profile_clear` and `admin_privacy_find_customers`.
