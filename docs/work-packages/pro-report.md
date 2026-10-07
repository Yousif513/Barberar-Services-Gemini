# PRO work package: G75 professional identity portable across salons

Branch `wp/pro`, migration range 20261008400000 .. 20261008449999 (two files used). Nothing was pushed or merged.

## Outcome

A professional (a login that works as an employee) creates ONE public profile that belongs to the person: handle, display names in
Arabic and English, headline, bio, specialties, languages, https portfolio links. A salon links to it through a two-sided consent
handshake. Customers follow the professional. When the person changes salon the profile and the followers stay; followers who opted
in are told where to book them now. Anyone can open `/pro/<handle>`.

**What never moves or copies:** a salon's client list, notes, booking history, invoices and the reviews of the salon. No function of
this package reads or writes those tables (a DB test greps the function bodies for it), and the public page, the identity screen and
the employee-list dialog say so in both languages.

## What was built

### Database (`supabase/migrations/`)

`20261008400000_professional_identity_tables.sql`
- `professional_profiles` (one per login, `owner_id` unique), `professional_handle_redirects`, `professional_reserved_handles` (52 words:
  routes, brand, roles, system words), `professional_portfolio_items` (https only, 500 chars), `professional_workplaces`
  (invited / active / former / declined, a CHECK ties each status to its dates and `closed_by`, one open link per professional and
  employee row), `professional_follows`.
- RLS on, default deny. The only SELECT policies: a professional reads their own profile / portfolio / links, a follower reads their own
  follows (the professional, the salon and administrators read none), administrators read profiles, redirects and reserved words.
  No client role has INSERT, UPDATE or DELETE on any of them. Each table ends with `grant_data_api_access` and `attach_admin_audit_trigger`.

`20261008400100_professional_identity_commands.sql` (all SECURITY DEFINER, `search_path = public`, REVOKE then GRANT, audit row with ids only)
- Profile: `save_professional_profile` (create or edit; only someone with an employee row can create), `publish_professional_profile`,
  `professional_handle_available`, `add_professional_portfolio_item`, `remove_professional_portfolio_item`.
- Handshake: `invite_professional_link(employee)` by the owner or a delegate with the `staff` permission for that branch;
  `respond_professional_invitation(link, accept)`; `end_professional_link(link)` by either side (a running link becomes `former` with an
  end date, a pending one `declined`; rows are never deleted).
- Followers: `follow_professional(handle, notify_on_move default false)`, `unfollow_professional(handle)`, `list_followed_professionals()`.
- Reads: `public_professional_profile(handle)` (the only anonymous door, SECURITY DEFINER, returns jsonb, NULL for anything unpublished or
  hidden, `{redirect_to}` for an old handle), `my_professional_identity()`, `provider_professional_links(provider)`.
- Admin (no UI, as agreed): `admin_set_professional_visibility(handle, hidden, reason)` and `admin_change_professional_handle(handle, new, reason)`;
  reason of 3+ characters, reason stored in the audit log; the change keeps the old handle as a redirect row.
- Additive trigger 1, `trg_end_professional_links_on_update` / `_on_delete` on `employees`: deactivating the row, releasing its login or
  deleting it ends every open link of that row (`closed_by = system`). Nothing else about the employee changes.
- Additive trigger 2, `trg_professional_workplace_before_update` on `professional_workplaces`: enforces the state machine even for a
  privileged connection and, when a link becomes active after an earlier link of the same professional ended, sends the move notice.

### Move notice rules
One in-app notification (`notifications`, type `professional_move`, bilingual text, `data.url = /pro/<handle>`, `data.book_url`) to followers
with `notify_on_move`, sent in the same transaction as the acceptance, so exactly once per link. Controlled by
`platform_settings.pro.move_notice_min_days`: **unset, non-numeric or negative sends nothing** (recorded on the link as `not_configured`);
a number N (0 allowed) sends at most one notice per professional per N days (otherwise recorded as `rate_limited`). The first link of a
professional is not a move (`first_link`). No value is seeded. `pro.max_portfolio_items` (also unset by default = no limit) caps portfolio links.

### Web (`web_platform/src`)
- `/pro/[handle]` public page, with server metadata (`layout.tsx`), language toggle, follow button and opt-in checkbox, current workplaces with
  "Book" (`/shop/<id>?source=link`) and "View salon", portfolio links (`rel="noopener noreferrer nofollow ugc"`), loading / not found /
  error states, old-handle redirect.
- `/provider/identity`: create or edit the profile (live handle check, input kept when the server refuses), publish / unpublish with a named
  confirmation, portfolio, pending invitations (accept / decline with confirmation), current and past workplaces with "End link", follower count.
- `/customer/following`: followed professionals, booking buttons, per-person move-notice toggle (optimistic with rollback), unfollow with confirmation.
- `provider/_components/professional-link.tsx`: invite / withdraw / end action per employee, one request per business through a shared store.
- `lib/professional-identity.ts`: types, every string in AR and EN, the server's reasons translated, helpers.
- Dialogs through `useConfirm` / `CommandResult`, no native dialogs, logical spacing only (RTL verified visually), Asia/Riyadh dates, no direct table access.

## Decisions I took

- A salon cannot see the professional's profile unless the professional accepted; the employee list shows only `has_login`, `has_profile`,
  link state, and the handle once the link is active and the profile published.
- Creating a profile requires an employee row (any status) for the login. It keeps the handle namespace from filling with strangers.
- A handle can be changed by its owner only while the profile has never been published; after that only an administrator changes it (reason, redirect).
  Old handles are reserved for the same person forever; going back to an old handle retires the redirect.
- An administrator is deliberately NOT treated as "the salon" in the invite and end commands (those need no reason); administrators act through the two `admin_*` commands.
- The follower count is not shown publicly (the brief lists the public fields; a count is not among them). The professional sees only the count.
- A hidden profile: public function answers NULL, cannot be followed or published, followers see only its handle and can unfollow.
- The hide reason lives in `admin_audit_logs`, not in a column the professional could read.
- A follow and an unfollow write an audit row (ids only, no text).

## Commands run (worktree `primora-wp-pro`)

| Command | Result |
|---|---|
| `node --test supabase/tests/db/professional_identity.test.mjs` | 58 tests, 58 pass (about 13 s) |
| `node --test "supabase/tests/db/**/*.test.mjs"` | 843 tests, 843 pass, 0 fail (includes migration hygiene, admin security matrix, data API grants, catalog invariants) |
| `npm run test --workspace=web_platform` | 498 tests, 498 pass (includes 21 new guard tests in `tests/professional-identity-screens.test.mjs`) |
| `node scripts/verify-ui-schema.mjs` | 0 mismatches (checked that it fails on a wrong argument name and a missing function, so the new screens are covered) |
| `npx tsc --noEmit -p web_platform` | clean |
| `npx eslint` on every new file | 0 errors, 0 warnings (the three touched shared files only show warnings that were already there) |
| `npm run test:security-core`, `test:admin-controls`, `test:inventory`, `test:p3-compat`, `typecheck:mobile` | all pass |
| `npm run build --workspace=web_platform` | **fails for an environmental reason only**: Turbopack rejects the junctioned `node_modules` ("Symlink [project]/node_modules is invalid"). `next build --webpack` also fails, on metadata routes (`favicon.ico`, `robots.ts`, `sitemap.ts`) because the checkout path contains an apostrophe. The integrator builds after merging. |
| Dev server (webpack) with a throw-away mock REST server kept outside the repo | `/pro/<handle>` in English and Arabic (RTL), redirect from an old handle, not-found and error states, `/provider/identity` including the accept confirmation, `/customer/following` in Arabic all rendered correctly |

## What I could not verify

- A production build (see above) and any run against a hosted Supabase (unreachable; no network calls were made).
- The screens against real data: the visual check used a local mock that is not part of the repository. The DB behaviour is proven by the DB tests.
- Real PostgREST exposure of the jsonb functions (the repo's schema verifier and the DB tests cover names, arguments and privileges).

## Known limits and hand-offs

1. **Move needs the old login released first.** `employees.profile_id` is unique, so a new salon can register the person only after the old row stops holding the
   login (the old salon deactivates the row and clears the login, or deletes it). Deactivating alone already ends the link and keeps the profile. This package does not
   change that constraint or the staff screens; if the owner wants "release my login" as a one-click staff command, that is a separate change to `employees`.
2. **Notification deep link is stored but not rendered.** The notice carries `data.url` and `data.book_url`; `customer/notifications/page.tsx` (another package's file) does not
   read `data` yet, so today it shows the text without a link. A two-line change there (render a link when `data.url` starts with `/`) finishes the journey.
3. **The shop page does not preselect a specialist**, so "Book" opens the salon (`?source=link`, an accepted source value), not a pre-filtered booking.
4. Reserved handles and `pro.*` settings are managed by SQL / the existing platform settings command; no admin screen (agreed).
5. Rate limiting of follow requests is not built (no business value was given).

## Files touched outside my own directories (for the merge)

- `web_platform/src/app/provider/layout.tsx`: translation key `identity` (en, ar), one `identityItem` nav entry used for owners and for employees.
- `web_platform/src/app/customer/layout.tsx`: translation key `following` (en, ar), one nav entry.
- `web_platform/src/app/provider/employees/page.tsx`: one import and one `<ProfessionalLinkAction .../>` element.
- `supabase/tests/db/qa_adversarial.test.mjs`, `trust.test.mjs`, `inventory_workflows.test.mjs`: `public_professional_profile` added to the anonymous allow-list.

New files are under `supabase/migrations/20261008400*`, `supabase/tests/db/professional_identity.test.mjs`, `web_platform/src/app/pro/`,
`web_platform/src/app/provider/identity/`, `web_platform/src/app/customer/following/`, `web_platform/src/app/provider/_components/professional-link.tsx`,
`web_platform/src/lib/professional-identity.ts`, `web_platform/tests/professional-identity-screens.test.mjs`.

## For the manifest (the integrator updates it; I did not touch it)

Domain "Supply / professional identity": entities professional profile, workplace link, follow; commands listed above; roles: professional (self), salon owner and
staff-permission delegate (invite, end), customer (follow), administrator (hide, change handle: reason required, audited); safeguards: consent handshake, state machine trigger,
automatic end on deactivation, reason on every admin command, no private field on the public function; audit: every command writes `professional.*` or `admin.professional_*`.
