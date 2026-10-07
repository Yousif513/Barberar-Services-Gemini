# Defects owned by fixdba

Extracted verbatim from the three reviews in docs/reviews/ (A = D-xx, B = Rxx, C = C-Dxx). Some ids appear in two packages because the fix has a
database part and a screen part: your task says which part is yours.

### D-07 HIGH: every approved branch is placed at the Riyadh centre
- `become-provider/page.tsx:235-250` never sends latitude/longitude; `20261003210000_supply_and_agreements.sql:51-52` defaults them to 24.7136/46.6753, so the NULL guard in `20261005170000...:767-769` never fires. Probe E21 confirms the approved branch keeps those values and city "Riyadh" (`become-provider/page.tsx:244`).
- Scenario: a Jeddah salon is approved at the Riyadh centre; distance sorting, home-service radius and maps are wrong.
- Fix: remove the column defaults, add city/location inputs (map pin or geocoded address), keep the NOT NULL guard.

### D-08 HIGH: provider-controlled money terms have no bounds and can bypass collection
- `20261003220000_booking_rules_and_money.sql:249-253` adds `free_cancellation_hours`, `late_cancellation_fee_percent`, `no_show_fee_percent`, `deposit_percentage` with no CHECK; owners may write them (only status/verification/commission are protected, `20261005000000...:146-185`).
- Probe E7: owner stored deposit 0, late fee -50, free hours -5, no-show 500. With deposit 0 the booking is `confirmed` with no payment, `platform_commission` 17.00 recorded, 0 ledger rows, so the marketplace fee is never collected.
- Fix: CHECK constraints (hours 0-720, percents 0-100, deposit between a platform minimum read from `platform_settings` and 100); enforce a minimum online deposit so the first-visit fee is always collectable.

### D-27 HIGH: providers cannot configure their cancellation / no-show policy
- No UI writes `free_cancellation_hours`, `late_cancellation_fee_percent` or `no_show_fee_percent` (grep); `web_platform/src/app/provider/settings/page.tsx:363-382` saves only the deposit. The dashboard checklist step "Policy" is hard-coded complete (`provider/dashboard/page.tsx:285`, `:162`). Every shop therefore advertises and enforces 24 h / 50% / 100% (the migration defaults, `20261003220000...:249-253`), which is the G10 requirement for a *per-provider* policy unmet.
- Fix: add a "Booking policy" card to provider settings that calls a `set_provider_booking_policy(p_provider_id, hours, late_pct, no_show_pct, deposit_pct)` SECURITY DEFINER function with the bounds from D-08; drive the checklist from `policy_confirmed_at IS NOT NULL`.

### D-13 MEDIUM: a 2 h reminder can be sent after the appointment
- `20261005020000_review_fix_trust_growth.sql:655-666`: non-transactional templates are pushed to 09:00 during 22:00-09:00 with no check against the booking start. Probe E15 shows the deferral at 22:xx Riyadh.
- Scenario: Ramadan appointment at 00:30, reminder due 22:30, delivered 09:00 next day.
- Fix: in `claim_message_batch`, for `reminder_*` skip (status `expired`) when `booking.scheduled_at <= now() + interval '15 minutes'`, and treat `reminder_2h` as time-critical (exempt from quiet hours or send at 21:59).

### D-12 MEDIUM: provider agreement acceptance is silently skipped
- `become-provider/page.tsx:253-267` records nothing when no published version exists, which is always true now (`20261005020000...:212-216` returns terms to draft; provider_agreement was seeded draft). The form still requires the checkbox and approval does not check acceptance.
- Fix: refuse submission when no published agreement exists (show "agreement not yet published"), store `agreed_at/agreement_version` on the application, and make `approve_provider_application` require an acceptance row.

### D-15 MEDIUM: consent and DSR evidence are client-writable
- `20261003200000...:97-102` lets users insert any `created_at`, `method`, `document_version`, `ip_address`; `:218-223` lets them set `due_date`, `reviewed_by`, `admin_notes`. Probes E9/E11: a future-dated granted row defeats a later withdrawal; a request can be inserted with a 10-year due date and a self-approved note.
- Fix: drop the INSERT policies, force writes through `record_consent` / a `submit_data_request` SECURITY DEFINER function that sets timestamps, version from the published agreement and the 30-day due date.

### D-24 MEDIUM: agreement evidence can be forged or rewritten
- Probe E16: a customer inserted an acceptance of the unpublished provider agreement with `accepted_at` 400 days ago through the INSERT policy `20261003210000_supply_and_agreements.sql:330-335`, bypassing the published-only check in `record_agreement_acceptance`. Probe E17: an administrator rewrote `content_en` of a published, already-accepted version (`FOR ALL` policy `:315-321`, no immutability trigger). Probe E18: `approve_provider_application` approved a provider with 0 provider-agreement acceptances.
- Fix: drop the INSERT policy; add `BEFORE UPDATE` trigger that rejects changes to `content_*`, `version` when `status = 'published'`; make approval require an acceptance row for the current published `provider_agreement` (and refuse approval while none is published).

### D-25 LOW: applications accept unlimited pending rows and any URL scheme
- Probe E19: three pending applications for one user, and `trade_license_url = 'javascript:alert(1)'`, were stored; the admin screen renders it as `<a href>` (`web_platform/src/app/admin/providers/provider-management.tsx:1290`). React 19 blocks `javascript:` navigation, but any `https` phishing URL is still shown to administrators.
- Fix: partial unique index `ON provider_applications(user_id) WHERE status IN ('pending','under_review')`; `CHECK (trade_license_url ~ '^https://')` or, better, upload to a private Storage bucket.

**R10 [D3] Any signed-in user can read provider and staff internals.**
Where: `supabase/migrations/20260613010000_triggers_rls.sql:51` (row policy) with table-level SELECT for `authenticated`; anon was fixed in `20261005150000_security_review_hardening.sql:133`, `authenticated` was not. Tracked in the manifest as `public-read-policies-expose-internal-provider-and-staff-columns` (open).
Scenario (PROBE): a customer with no booking selects `vat_number, cr_number, admin_notes, contact_phone, contact_email, commission_percentage, trade_license_url, cr_wathq_data` of any verified provider and `phone, email` of any active employee ("internal: slow payer" returned).
Fix: `REVOKE SELECT ON public.providers FROM authenticated; GRANT SELECT (id, owner_id, type, business_name_en, business_name_ar, description_en, description_ar, logo_url, cover_image_url, is_verified, created_at, deposit_percentage, status, free_cancellation_hours, late_cancellation_fee_percent, no_show_fee_percent, cr_verification_status, cr_verified_at) ON public.providers TO authenticated;` and the same for `employees` without `phone, email`; serve owner/admin fields through a `SECURITY INVOKER` view or RPC checked with `is_provider_staff`/`is_admin`.

**R11 [D4] Hidden or flagged reviews are still public.**
Where: `supabase/migrations/20260615182811_harden_auth_and_booking_core.sql:377` (`"Public read reviews"` `USING (true)`); moderation only filtered in the browser (`shop/[id]/page.tsx:383`, `mobile_app/src/lib/marketplace.ts:201`).
Scenario (PROBE): after an admin hides an abusive review, `select comment from reviews` as `anon` still returns it.
Fix: replace the policy with `USING (moderation_status = 'published' OR customer_id = auth.uid() OR is_admin() OR is_provider_staff(provider_id, auth.uid()))`.

**R12 [D2] Home-service address is readable by the provider before confirmation, and the feature has no UI.**
Where: policy `"Providers view branch bookings"` (`20260613010000_triggers_rls.sql:88`) exposes `bookings.home_address_text/lat/lng`; `get_booking_address_secure` (`20261005170000_qa_release_gate_fixes.sql:454`) masks only when called, and nothing calls it; `shop/[id]/page.tsx:1681-1687` says home booking is unavailable.
Scenario (PROBE): a `pending_payment` home booking made through the API shows the full address and coordinates to the owner. Not live from the web or mobile UI today, so this must be fixed before the UI is built.
Fix: move the address to `booking_home_addresses(booking_id, text, lat, lng)` with RLS: customer always; staff and owner only when the booking status is `confirmed`/`completed` (set `address_revealed_at` through the RPC); revoke the three columns from `bookings`; keep coordinates out of `bookings`.

**R28 [D24] A customer can forge a provider reply.** `20260615182811_harden_auth_and_booking_core.sql:362` check allows every column; PROBE inserted `reply_comment = 'Thank you - owner'`. Fix: `GRANT INSERT (booking_id, rating, comment) ON public.reviews TO authenticated` after revoking table INSERT, or extend WITH CHECK (`reply_comment IS NULL AND reply_created_at IS NULL AND moderation_status = 'published' AND moderated_by IS NULL`).

**D3b. Admin integrations store secrets in plaintext and ship them to the browser, and nothing uses them.**
`supabase/migrations/20260714153000_expand_integrations_registry.sql:7` adds `integrations.api_key TEXT`;
`web_platform/src/app/admin/integrations/page.tsx:268` reads `select("*")` (including `api_key`) into the page,
`:350` makes a key mandatory for every new integration and `:373` writes it from the browser, while the file header
(`:5-8`) states "Secrets never live client-side". No Edge Function reads `integrations` (grep of `supabase/functions`
for `api_key` and `from("integrations")` is empty; they use `TAP_SECRET_KEY` etc. from the environment). Scenario: an
admin pastes the live Tap or Twilio secret; it sits in clear text readable by every admin and by any admin
browser session, and does nothing. Fix: drop the column (`ALTER TABLE integrations DROP COLUMN api_key`), stop selecting
`*` (select named columns), remove the key input and make `key_masked` a server-written last-4 hint, and state in the
page that credentials are Edge Function secrets.

**D6 (High as a pair with D5). Every active promo code is enumerable by any signed-in user.** Policy "Promotional codes
readable by admins or when active" (`20260621184453_refine_admin_control_policies.sql:5`) lets `authenticated` read
`code`, value and redemption counts. Probe: a stranger listed an active `VIP-SECRET` 50 percent code. Fix: drop that
policy; `validate_and_apply_coupon` and `booking_create_internal` are `SECURITY DEFINER` and need no table access.

**D10b. Waitlist rows can be rewritten by the customer and by the provider owner.** Policy "Customers and providers cancel
waitlist entries" (`20261004050000:61-74`) is `FOR UPDATE` with no `WITH CHECK` and no column limit, and `authenticated`
holds UPDATE on the table. Probe: a customer ran `update waitlists set status='claimed', expires_at=now()+interval '100 years'`
on their own row (succeeded) and the owner ran `update waitlists set customer_id=<another user>` (succeeded). Scenario: a
customer forges a `notified` row with a 100-year claim window; an owner moves a customer's entry to a friend. Fix: drop the
policy, revoke UPDATE on `waitlists` from `authenticated`, and add `cancel_waitlist_entry(p_id)` (customer cancels own,
owner/staff with the `bookings` permission cancel for their branch).

**D24 (Codex earlier commits). Payment-method linkage governs nothing.** `accepted_payment_methods`
(`20260714170000_link_payment_methods_to_integrations.sql:61-96`) is referenced by no screen, mobile code or function; checkout
always creates a Tap charge (`supabase/functions/payment-checkout/index.ts`). Operators can mark any gateway "connected" and
tick method support with no effect. The view is also created without `security_invoker` and granted to `anon`
(already recorded as a gap at `.admin-console/manifest.json:4722`). Fix: either read the view in the checkout screen and
route by `gateway_key`, or remove the controls and the view; add `WITH (security_invoker = true)` and revoke `anon` writes.
