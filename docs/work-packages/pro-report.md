# PRO work package (G75): professional identity portable across salons

Branch `wp/pro`. Migration range 20261008400000 .. 20261008449999.

## Stage 1: tables (done)

`20261008400000_professional_identity_tables.sql` adds `professional_profiles`, `professional_handle_redirects`,
`professional_reserved_handles`, `professional_portfolio_items`, `professional_workplaces` (invited / active / former / declined,
never deleted) and `professional_follows`. All are RLS-enabled with default deny; clients can only SELECT their own rows (the
follower reads their own follows, nobody else reads follows); every write is a command (next stage). Each table ends with
`grant_data_api_access` and `attach_admin_audit_trigger`.

(This report is appended to after every stage.)
