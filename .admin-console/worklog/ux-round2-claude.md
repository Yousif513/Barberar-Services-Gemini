# worklog ux-round2-claude
role: ux-reviewer
mode: audit    profile: regulated
started: 2026-10-16T21:20Z    ended: 2026-10-17T07:45Z (paused about 9 h by a usage limit)

Exit condition: every reviewed screen has its observed states, `responsive` set from a real 375 / desktop check, and
findings filed as gaps. No server code, migration or data changed apart from local test accounts.

claims-held: none (reviewers do not claim)
claims-released: none

## Did

Browser check in EN 1440, AR 375, EN 375 and AR 1440, using Playwright and real TOTP sessions on the local stack. It
covers /customer/privacy, /admin/privacy (requests, holds, ledger), /admin/approvals, /admin/customers, /admin/incidents
and /login/mfa.

Accounts and data:
- Created owners `ux2-owner-a` to `ux2-owner-h` and customers `ux2-customer-1` to `ux2-customer-3`. Credentials are only
  in `supabase/.temp/local-admin-logins.txt`.
- `ux2-customer-2` was deleted by the deletion flow.
- Customer 3's profile-clear request (by owner A) is left pending on Approvals; it is refused while a hold is active and
  the hold is now released.
- One retention purge request was rejected; no purge ran.

Report: `docs/reviews/2026-10-17-ux-browser-check.md`. Evidence: `.admin-console/evidence/ux-round2/`.

## Verified

- item 1 customer privacy: `flow-customer-submit.json`, `flow-customer-track.json`. Pass, with 1 medium finding.
- item 2 admin requests, lookup, limit, step-up, approvals: `flow-admin-requests-a1/b1/a2.json`, `flow-limit.json`,
  `flow-stepup-lookup.json`. Pass, with 2 medium findings.
- item 3 legal holds: `flow-holds-*.json`. Pass on the rules; the approver sees an English refusal in the Arabic console.
- item 4 retention purge: `flow-incident-purge-i1/i2.json`. Fail in the console (no entry point; existing gap). The server
  path and the Approvals line both work.
- item 5 incident aware-at correction: `flow-incident-purge-i1b/i2.json`. Pass.
- item 6 /login/mfa fresh enrolment: `flow-mfa-ux2-owner-g.json`, `flow-mfa-tabs.json`. Pass: no 404 on reload or a
  second tab; 0 console errors on clean runs.
- Dialogs at 375 x 600: `flow-sweep-ux2-owner-c-en-375.json`, `probe-dialog-en.json`. Fail (customers clear dialog,
  approvals decide dialog).

## Manifest writes (add/set only)

- Gaps:
  - 16 `ux2-*` gaps: 1 high, 3 medium, 12 low.
  - `f123-screens-not-browser-verified` set to fixed.
  - `final-screens-not-browser-verified` narrowed to the bookings cancel dialog.
- `reviewStatus` set to contested, each paired with a gap:
  - `customer.clear-profile` (ux2-command-dialog-height-uncapped-confirm-unreachable);
  - `gov.approvals` (ux2-approvals-actions-offscreen-at-375, ux2-arabic-console-shows-english-server-refusals);
  - `privacy.deletion` (ux2-customer-deletion-preview-latin-zero-reads-as-five).
- Screens:
  - `states`, `responsive` and `rationale` on customer-privacy-account, admin-privacy, admin-approvals, admin-customers,
    admin-incidents and login-mfa.
  - `responsive` is now false on admin-approvals and admin-customers.
- Quality gates `experience` and `component-health` added, both failed.
- Feedback: ux2-parallel-build-breaks-shared-dev-server, ux2-harness-navigation-fakes-console-errors,
  ux2-dialog-measurement-caught-missing-utility.

## Decided

- none

## Found

- ux2-command-dialog-height-uncapped-confirm-unreachable: high.
- ux2-approvals-actions-offscreen-at-375: medium.
- ux2-arabic-console-shows-english-server-refusals: medium.
- ux2-customer-deletion-preview-latin-zero-reads-as-five: medium.
- 12 low `ux2-*` gaps: see the report table.

## Next

- An implementer claims `customer.clear-profile` and `gov.approvals`. The first step is to fix the CommandDialog height
  cap in `web_platform/src/components/modal.tsx` (find why `.max-h-full` is not generated). Then re-measure every dialog
  at 375 x 600 in EN and AR.

## Blocked on

- Owner: the retention purge console entry still waits on the scheduling decision (`retention-purge-not-scheduled`).
