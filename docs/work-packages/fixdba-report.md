# FIX-DBA report

Branch `wp/fixdba`, migrations `20261007010000` .. `20261007049999`. Status per defect: `fixed` / `not reproduced` / `deferred (reason)`.
Tests: `supabase/tests/db/fixdba_*.test.mjs`.

| Defect | Status | Migration | Test |
|---|---|---|---|
| D-08 bounds on provider money terms | fixed | `20261007010000_provider_booking_policy.sql` | `fixdba_booking_policy.test.mjs` (D-08 suites) |
| D-27 `set_provider_booking_policy` | fixed | `20261007010000_provider_booking_policy.sql` | `fixdba_booking_policy.test.mjs` (D-27 suite) |
| D-13 reminder never after the visit | fixed | `20261007010100_reminder_never_after_visit.sql` | `fixdba_reminders.test.mjs` |
| D-07 branch coordinates | fixed (DB part) | `20261007010200_provider_applications_integrity.sql` | `fixdba_applications_agreements.test.mjs` ("D-25 / D-07 / D-12", "D-12 + D-07") |
| D-25 application constraints | fixed | `20261007010200_provider_applications_integrity.sql` | same file |
| D-12 agreement acceptance | fixed (DB part) | `20261007010200_...`, `20261007010300_agreement_evidence.sql` | same file |
| D-24 agreement evidence | fixed | `20261007010300_agreement_evidence.sql` | same file ("D-24") |
| D-15 consent / data-request evidence | fixed (DB part) | `20261007010400_consent_and_request_evidence.sql` | `fixdba_consent_evidence.test.mjs` |
| R11 hidden reviews public | fixed | `20261007010500_reviews_visibility_and_forging.sql` | `fixdba_access_hardening.test.mjs` (R11) |
| R28 forged provider reply | fixed | `20261007010500_reviews_visibility_and_forging.sql` | same file (R28) |
| C-D6 promo code enumeration | fixed | `20261007010600_promo_codes_and_waitlist_access.sql` | same file (C-D6) |
| C-D10b waitlist rewriting + `cancel_waitlist_entry` | fixed | `20261007010600_promo_codes_and_waitlist_access.sql` | same file (C-D10b) |
| R12 home address reveal-on-confirmation | fixed (DB; no UI exists yet) | `20261007010800_home_address_vault.sql` | `fixdba_home_address.test.mjs` |
| C-D3b integrations.api_key | fixed (DB + `admin/integrations/page.tsx`) | `20261007010700_integration_secrets_and_payment_view.sql` | same file (C-D3b) |
| C-D24 accepted_payment_methods | fixed (view hardened; routing not built, see below) | `20261007010700_integration_secrets_and_payment_view.sql` | same file (C-D24) |

## D-08 / D-27 notes

- CHECK constraints: `free_cancellation_hours` 0..720, `late_cancellation_fee_percent` and `no_show_fee_percent` 0..100, `deposit_percentage` above 0 and at most 100
  (the old 0..100 constraint let a deposit of 0 confirm a booking without payment). Rows already outside the bounds are clamped by the migration (a deposit of 0 or less becomes 20, the original default).
- Platform floor: `platform_settings.minimum_online_deposit_percentage` is seeded as JSON `null` (unset, needs the owner's approval). `admin_update_platform_setting` was patched in place (pg_temp.patch_function) to accept a percentage above 0 and at most 100, or `null`. A trigger on `providers` enforces the floor whenever the deposit is written, directly or through the command (it does not block unrelated edits when the floor later rises above an old deposit).
- Command `set_provider_booking_policy(p_provider_id, p_free_cancellation_hours, p_late_cancellation_fee_percent, p_no_show_fee_percent, p_deposit_percentage, p_reason DEFAULT NULL)`: owner, a delegate holding an active business-wide (`branch_id IS NULL`) `manager`/`owner` membership with `permissions.settings = true`, or an administrator (reason of 3+ characters required when the business is not their own). Strangers get `P0002`, staff without the permission `42501`, anonymous has no EXECUTE, the service role has no acting user (`28000`). Idempotent (same values: `changed=false`, no audit row, stamp unchanged). Audited as `provider.booking_policy_set` with before/after and reason.
- `providers.policy_confirmed_at` / `policy_confirmed_by` added; the stamp can only be written by the command (trigger resets it for every other writer except the service role). The provider dashboard checklist step "Policy" should read `policy_confirmed_at IS NOT NULL`.
- New delegate permission key: `settings` (inside `provider_memberships.permissions`). `can_access_provider_operation` only knows `inventory/bookings/staff/reports` and belongs to another package, so the command checks the membership itself.
- Direct owner writes of the four columns remain possible but bounded and floored (the provider settings screen still saves the deposit that way until it calls the command). Blocking direct writes is a one-line follow-up once that screen is migrated.
- Not changed (other packages own it): `cancel_booking` reads the provider's *current* policy, so a policy change also applies to bookings made earlier under the old terms.

## D-13

`claim_message_batch` is patched in place: a `reminder_*` message whose booking starts within 15 minutes (or has begun) is closed as `expired` (new
allowed value of `message_queue.status`) instead of being delivered late, and `reminder_2h` is exempt from the 22:00-09:00 Riyadh quiet hours (the earlier
pipeline, `20261003230000:591`, exempted it; the rewrite in `20261005020000` lost that). The quiet-hours branch cannot be driven to a chosen clock time in
PGlite, so the test asserts the clock-independent outcomes and, for the deferred case, branches on the real Riyadh hour.

## D-07 / D-25 / D-12 / D-24 (applications and agreements)

- `provider_applications`: defaults of `latitude`, `longitude` and `city` removed; pending applications still holding exactly 24.7136 / 46.6753 are cleared (approval then asks for a real location); coordinates both-or-neither and in range; one open (`pending`/`under_review`) application per applicant (older open duplicates are closed as superseded by the migration); `trade_license_url` must be https (a stored non-https link is moved into `admin_notes` as plain text and cleared; same check added to `providers.trade_license_url`).
- A BEFORE INSERT trigger refuses an application while no `provider_agreement` is published (error 22023 "The provider agreement has not been published yet, so applications are closed"), stamps `agreement_id` / `agreement_version`, and nulls the review fields a client could have supplied. `agreed_at` is stamped when `record_agreement_acceptance` records the acceptance (the become-provider page inserts the application first and accepts second, so the stamp follows the acceptance). The service role bypasses the stamp (fixtures, Edge Functions).
- `agreement_acceptances`: INSERT policy dropped and INSERT/UPDATE/DELETE revoked from the client roles; BEFORE UPDATE trigger makes rows immutable even for the service role; `record_agreement_acceptance` (patched in place) validates the method and returns the existing row on a repeat.
- `legal_agreements`: trigger forbids editing a published or archived version (only `published -> archived` is allowed, which is what `admin_publish_agreement` does) and deleting a non-draft version.
- `approve_provider_application` (patched in place) refuses while no provider agreement is published and until the applicant has an acceptance row for the published version, then still requires the location.
- Existing tests adapted because they relied on the old behaviour: `booking.test.mjs` used `free_cancellation_hours = 2000` to force a late cancellation (now 720, the maximum, still longer than any lead time used there); `trust.test.mjs` "activates an approved provider" now publishes the provider agreement, has the applicant accept it and passes `city` (no default any more).
- Web: `become-provider/page.tsx` must (a) send `latitude`/`longitude`/`city` collected from the applicant instead of the hard-coded `city: "Riyadh"`, (b) call `record_agreement_acceptance` and show "agreement not yet published" when the insert fails with 22023, (c) handle 23505 (an open application already exists) and 23514 (https link only). `admin/providers/provider-management.tsx:1290` can keep rendering the link: only https values exist now.

## D-15

`consents` and `data_subject_requests` lose their INSERT policies and the client roles lose INSERT (and UPDATE/DELETE on `consents`). Commands: `record_consent` (patched in place: validates `method` `^[a-z0-9_]{1,50}$` and version format, records the published `customer_terms` version for `terms_privacy`), new `record_consents(p_purposes text[], p_status, p_document_version, p_method)` (atomic, up to 5 purposes), new `submit_data_request(p_request_type, p_details)` (server status `pending`, due date = Riyadh date + 30, replay returns the open request of the same kind, audited without the free text).
Callers that insert directly today and must move to the commands (other packages own them): `web_platform/src/app/login/page.tsx:69`, `web_platform/src/app/customer/settings/page.tsx:195`, `web_platform/src/app/shop/[id]/page.tsx:1000`, `mobile_app/src/app/profile.tsx:240` (consents -> `record_consents`), `web_platform/src/app/privacy/page.tsx:104` (data requests -> `submit_data_request`).

## R11 / R28 (reviews)

`"Public read reviews"` (USING true) is replaced by two policies: published reviews for `anon` and `authenticated`, and, for `authenticated` only, the review's author, administrators and the staff of the reviewed business (owner, active membership, active employee: written inline because `is_provider_staff` is not executable by signed-in users, so a policy cannot call it). INSERT is now a column privilege (`booking_id, customer_id, rating, comment`) and the policy also requires the reply, moderation and `moderated_by` fields to be empty, so a customer can no longer write `reply_comment`, a moderation status or a back-dated `created_at`. The only caller (`customer/reviews/page.tsx:143`) sends exactly those columns. `provider_rating_summaries` already filters published reviews and runs with the caller's rights, so ratings stay consistent.

## C-D6 / C-D10b

`promotional_codes` is readable by administrators only (the only web reader is `admin/coupons`; checkout uses the SECURITY DEFINER `validate_and_apply_coupon` and `booking_create_internal`). `waitlists`: the open UPDATE policy is dropped and UPDATE/DELETE revoked from the client roles; `cancel_waitlist_entry(p_id, p_reason)` lets the customer cancel their own entry, the owner or a delegate holding the `bookings` permission (via `can_access_provider_operation`) cancel an entry of their branch, and an administrator cancel with a reason; a stranger gets `P0002`, a claimed or expired entry `22023`, a repeat `changed=false`; audited as `waitlist.cancelled` (customer-supplied text is not logged). No web or mobile code reads or writes `waitlists` directly (grep), so no screen change is needed.

## C-D3b / C-D24

`integrations.api_key` is dropped after turning whatever was stored into a hint (`••••` plus the last four letters or digits, so `key_masked` carries no prefix any more). A CHECK keeps `key_masked` to bullets plus at most four characters, so a secret cannot be stored there. `admin/integrations/page.tsx` no longer selects `*` (named columns), no longer has an API-key input or sends `api_key`, validates the hint, and states in both languages that credentials are Edge Function secrets. `accepted_payment_methods` is now `security_invoker` and not readable by `anon`. Not built (product decision): routing checkout by `gateway_key` through this view; the checkout still always creates a Tap charge, so the "connected" toggles and method tick-boxes in the integrations screen still change nothing at checkout (the view is the hook for it once decided). Note that under `security_invoker` a non-administrator sees only methods that do not need a gateway row, because `integrations` is administrator-only.

## R12 (home-service address)

`booking_home_addresses(booking_id, address_text, latitude, longitude, revealed_at)`. A BEFORE INSERT trigger on `bookings` (`trg_zz_home_address_to_vault`) moves what `booking_create_internal` writes into the vault and leaves `bookings.home_address_text/lat/lng` NULL, so `booking_create_internal` is not edited (tested through the real command). Existing addresses are backfilled and the legacy columns emptied by the migration (the immutability guard is disabled for that one statement). The three legacy columns stay because `booking_create_internal`, `protect_booking_immutable_fields` and the history trigger still name them; a column-level REVOKE would have needed a column grant list for the whole `bookings` table. They are always NULL now and can be dropped when `booking_create_internal` is next rewritten. Past values may also exist in the booking history/audit rows written by the old trigger (not touched).
RLS: the customer reads their own row; staff read it directly only after `get_booking_address_secure` revealed it (status `confirmed`/`completed`; it stamps `revealed_at`) and not once the booking is cancelled; administrators have no direct read and use `get_booking_address_secure`, which now audits their view (`booking.home_address_viewed`, no address in the log); no client write. `get_booking_address_secure` is patched in place (reads the vault, returns `latitude`/`longitude`, the customer always sees their own address). Decision: a home-service screen must call `get_booking_address_secure(booking_id)` to show the address to a provider; there is no UI yet.
