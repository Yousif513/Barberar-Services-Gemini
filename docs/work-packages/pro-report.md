# PRO work package (G75): professional identity portable across salons

Branch `wp/pro`. Migration range 20261008400000 .. 20261008449999.

## Stage 1: tables (done)

`20261008400000_professional_identity_tables.sql` adds `professional_profiles`, `professional_handle_redirects`,
`professional_reserved_handles`, `professional_portfolio_items`, `professional_workplaces` (invited / active / former / declined,
never deleted) and `professional_follows`. All are RLS-enabled with default deny; clients can only SELECT their own rows (the
follower reads their own follows, nobody else reads follows); every write is a command (next stage). Each table ends with
`grant_data_api_access` and `attach_admin_audit_trigger`.

(This report is appended to after every stage.)

## Stage 2: commands, public read, triggers, DB tests (done)

`20261008400100_professional_identity_commands.sql`: handle rules (`professional_handle_problem`, `professional_require_handle`,
`professional_handle_available`), `save_professional_profile`, `publish_professional_profile`, `add_professional_portfolio_item`,
`remove_professional_portfolio_item`, the handshake (`invite_professional_link`, `respond_professional_invitation`,
`end_professional_link`), `follow_professional`, `unfollow_professional`, admin commands `admin_set_professional_visibility` and
`admin_change_professional_handle` (reason of 3+ characters, audited), reads `public_professional_profile` (the only anonymous door),
`my_professional_identity`, `provider_professional_links`, `list_followed_professionals`, and two additive triggers:
`end_professional_links_of_departed_employee` on `employees` (deactivation, login release or removal closes open links) and
`professional_workplace_before_update` on `professional_workplaces` (state machine + the one-time move notice).

`supabase/tests/db/professional_identity.test.mjs`: 56 tests, all passing (run on its own in about 13 s).
The three anon allow-lists (`qa_adversarial`, `trust`, `inventory_workflows`) now list `public_professional_profile`.
