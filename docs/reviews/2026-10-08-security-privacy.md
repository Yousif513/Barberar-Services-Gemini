# Security and privacy review, 2026-10-08

Reviewer: independent security and privacy pass (did not write this code). Branch `claude-code`, all packages merged (HEAD c4c8662).
Method: current function and policy definitions printed from a fully migrated PGlite database (`supabase/tests/db/harness.mjs`), then small
probe scripts run as the roles anon, customer, other customer, owner, other owner, employee, delegate without permission, admin.
Read-only on source and migrations. Probes live in the reviewer scratchpad; reproducible ones are saved as `supabase/tests/db/review_privacy_*`.

Status: COMPLETE. Reproduction file for the open defects: `supabase/tests/db/review_privacy_open.repro.mjs` (5 tests, all fail today by design; named `.repro.mjs` so the suite glob ignores it).

## Verdict table

| # | Area | Verdict |
|---|------|---------|
| 1 | Intake forms and health data | ISSUES (P-01 medium; read path itself SOUND) |
| 2 | Professional identity public function | SOUND (P-12 low) |
| 3 | WhatsApp receptionist | ISSUES (P-05, P-06) |
| 4 | Developer API (keys, webhooks, SSRF, rate limits) | SOUND (P-07 residual) |
| 5 | Attribution analytics | SOUND |
| 6 | Home-address vault | SOUND (P-08 low) |
| 7 | Consent and data-request evidence | ISSUES (P-02 oracle, P-11 low) |
| 8 | Column-level privileges on providers/employees | ISSUES (P-02, P-04, P-10); provider phone/email/VAT/CR/IBAN not readable by customers |
| 9 | Delegated access and offboarding | ISSUES (P-14); offboarding SOUND |
| 10 | Countries patches (Saudi regression) | SOUND for Saudi; P-15 flaky invoice chain seen |
| 11 | Grants vs policies vs anon allow-list | ISSUES (P-03, P-09) |
| 12 | Edge Function authentication and CORS | SOUND (P-13 low) |

## Defects (ranked at the end)

See the ranked list at the end of this document.

## Area notes

### 1. Intake forms and health data (20261008200000..200200) - verdict: ISSUES (one MEDIUM, design-level)

Probed as anon, customer, other customer, owner, other owner, assigned employee, provider-2 employee, stranger employee, delegate with `bookings`,
delegate without `bookings`, offboarded delegate (membership inactive) and admin, with a real submission containing a marker string.
- Answer text is reachable only through `intake_answers` (customer's own row, RLS) and `read_booking_intake_answers` (owner, delegate with `bookings`, the
  assigned active employee). Owner/other owner/stranger/other-provider employee/delegate-without-permission/offboarded delegate/admin all got "Booking not found"
  or zero rows; the marker never appeared in any table scan, in `intake_submissions`, in `provider_booking_intake_status`, or in `admin_audit_logs`.
- Error text is identical for a real foreign booking and a random uuid in `read_booking_intake_answers`, `get_booking_intake`, `delete_booking_intake`,
  `record_patch_test` (no enumeration).
- Each staff read is audited (`intake.answers_read`, booking, provider, version; never an answer) and bumps the client-visible `read_count`.
- `audit_admin_write` cannot copy answers into `admin_audit_logs`: it logs only admin-actor writes and `answers` (jsonb object) falls into the `{changed:true}` branch.
- The admin sees consent rows (`consents` policy "Admins read all consents", including `ip_address`/`user_agent` columns) and the status view; that is evidence, not health data.
- Defect P-01 (below): withdrawal blanks only future-dated submissions; past and completed answers stay readable by staff indefinitely and no job purges them.

### 4. Developer API (20261006090000..) - verdict: SOUND (one residual, P-07)
- Keys: 256-bit `prm_live_` token from pgcrypto; only the SHA-256 is stored, in `api_key_hashes` (no client privilege); `api_keys` shows prefix (`prm_live_` + 1 hex char) and last 4 only. Create/revoke are owner-only and audited without key, digest or prefix.
- `authenticate_api_key` and all `api_list_*`/`api_get_availability` functions are service-role only (anon/authenticated EXECUTE revoked; verified with the catalog and by calling as customer/owner). Provider and branch come from the key, never the request; scope is enforced twice (router and `api_require_scope`).
- Response allow-lists carry no customer identity; webhook payload is `api_booking_json` (same fields). `webhook_subscription_secrets` has no client privilege; `webhook_subscriptions` has no secret column.
- Rate limit: fixed-window counter per key; failed key guesses are not throttled (256-bit token, so only a load concern).
- SSRF: 34 URL vectors run through SQL `webhook_url_rejection` and TS `validateWebhookUrl`; they agree (IP literals in every spelling, userinfo, ports, `.internal/.localhost`, single labels). The SQL is stricter on full-width characters (safe direction). DNS names that resolve to private space (`169.254.169.254.nip.io`, `localtest.me`) pass both static checks by design and rely on the delivery-time DNS check, which is skipped when `Deno.resolveDns` is missing and is check-then-connect otherwise: P-07.
- Delivery never follows redirects, never stores the endpoint answer, signs with a per-endpoint secret.

### 3. WhatsApp receptionist (20261008700000..) - verdict: ISSUES (P-05, P-06)
- Signature: HMAC-SHA256 over the raw bytes, constant-time compare, refuses everything when the app secret is unset, GET handshake uses a separate token; nothing is parsed or logged before the check. Replay is harmless (ingest idempotent on `wa_message_id`).
- Customer id is `HMAC(pepper, phone_number_id:wa_id)`: per channel, so no cross-provider linking; plain id only in `whatsapp_contact_addresses` (no client privilege), deleted on STOP.
- Probed as customer, owner, other owner, assigned employee, delegate with and without `bookings`, offboarded delegate, admin, anon: only the owner and a branch-wide `bookings` delegate who is an active employee open a transcript (audited); `customer_hash`/`state` are not selectable; admin gets counts only; ingest/claim functions refuse non-service callers.
- P-05: channel ownership is proven only by an admin's manual "verified" click; first claimant of a `phone_number_id` wins (a second owner gets "already connected to another business", which is also an existence oracle).
- P-06: message bodies are kept after STOP (probed: 3 messages kept, owner can still open the transcript) and `whatsapp.message_retention_days` is unset.

### 2. Professional identity (20261008400000..) - verdict: SOUND (P-12 low)
- `public_professional_profile` returns only names, headline, bio, specialties, languages, https portfolio links (rendered `rel="noopener noreferrer nofollow ugc"`) and workplaces that are active, accepted by the professional, at an active verified provider. No owner id, phone, email or follower data. Unpublished, admin-hidden and unknown handles all return NULL (same answer); old handles redirect only while the profile is published; a hidden profile's old handle returns NULL.
- Followers: `professional_follows` is readable only by the follower (professional, salon owner and admin see 0 rows); a second customer sees only their own `follows`.
- Reserved handles block `admin` etc. (probed); `primora-official` is accepted (P-12). A published handle can be changed only by support, which limits squatting.
- Invitations: workplace shows only after the professional accepts (probed: invited = hidden).

### 6. Home-address vault - verdict: SOUND with P-08 (low)
Probed 13 roles on a confirmed home booking: before reveal only the customer reads the vault row; after the reveal command only owner, assigned employee and `bookings` delegate (and the customer) read it; other-provider owner/employee, unassigned same-provider employee, delegate without permission, offboarded delegate, anon: nothing. `bookings.home_address_*` stay NULL.

### 5. Attribution analytics - verdict: SOUND
`track_analytics_event` (anon) rejects personal-data keys in properties (probed with phone/email), caps at 4096 bytes and 120 events/minute per identity, refuses server-only events; `analytics_events` is admin-read only; `booking_attribution` is readable by its customer only.

### 7. Consent and data-request evidence - verdict: ISSUES (P-11 low)
Append-only (`consents` has SELECT only for clients, written through `record_consent`); users read their own, admin reads all. Data requests are one open per kind, audited, 30-day due date.

### Cross-cutting findings from the grants sweep (areas 8 and 11)
- P-02, P-03, P-04, P-09, P-10 below. Details in the defect list.

### 8/9/11/12 Column privileges, delegated access, grants, Edge Functions
- Providers: anon/authenticated SELECT is column-limited (no `contact_phone`, `contact_email`, `trade_license_url`, VAT, CR number, IBAN, `admin_notes`); an owner's UPDATE of `is_verified`, `status`, `commission_percentage` is refused (`permission denied`), `cr_verification_status` and `owner_id` are silently reset. A customer cannot insert a provider. Owner hard-delete is blocked by RESTRICT keys once bookings or ledger rows exist.
- Grants: no TRUNCATE/REFERENCES/TRIGGER grant to any client role; every public table has RLS on; all 11 views are `security_invoker`; three client privileges without policy (`conversations` DELETE, `messages` DELETE, `payout_requests` INSERT) are denied by default; 13 functions are callable by anon (the slot and schedule listings, `get_sponsored_placements`, `record_sponsored_click`, `public_professional_profile`, `search_marketplace_providers`, `track_analytics_event`, `provider_rating_summaries` and trigger/normalise helpers); 103 SECURITY DEFINER functions are internal only. A sweep calling every authenticated function with NULL arguments as a plain customer found no unguarded write; the ones that succeed are pure readers or self-service.
- Delegated access: `can_access_provider_operation` requires an active membership AND an active employee row (deactivating either removes access: probed). It treats a branch-scoped membership as valid whenever the caller passes no branch, which provider-wide callers do (P-14). Both helpers admit administrators, which is why intake explicitly excludes them.
- Edge Functions: every function holding the service key authenticates the caller itself (service key, admin via `auth.getUser` + `profiles.role`, or HMAC / Tap re-fetch for the webhooks); no `*` CORS anywhere; `process-payout` and `request-payout` are retired (410).
- Countries patches: `countries.test` and `money.test` pass; Saudi VAT 15 % and Asia/Riyadh come from the seeded SA row; ZATCA invoices refuse non-SA branches.

## Ranked defect list

No CRITICAL or HIGH defect was reproduced.

### MEDIUM
- **P-01** `blank_intake_on_consent_withdrawal` (only `scheduled_at > now()`), `read_booking_intake_answers` (no time or consent limit), `intake.retention_days` seeded null, no scheduler for `purge_expired_intake`. Scenario: the customer withdraws `health_data` consent; the owner still opens answers of past and completed bookings (probed: marker returned for a 3-hour-old and a 40-day-old booking), indefinitely. Repro test 1. Fix: legal sets the retention; technically make `read_booking_intake_answers` refuse when the latest `health_data` consent is `withdrawn`, add a read window (appointment + N days), and schedule `purge_expired_intake` with pg_cron once a value is set.
- **P-02** `reviews` column grants to anon (`customer_id`, `booking_id`, `moderated_by`) and `has_active_consent(uuid,text)` (SECURITY DEFINER, authenticated). Scenario: a visitor lists every reviewer's profile uuid and links one person's reviews across salons; any signed-in user then asks `has_active_consent(uuid, 'marketing'|'whatsapp'|'health_data')` for that uuid (probed: true for a marketing grant). Repro tests 2 and 3. Fix: `REVOKE SELECT (customer_id, booking_id, moderated_by) ON reviews FROM anon, authenticated` and serve "my review" through a security_invoker view or an RPC keyed on `auth.uid()`; in `has_active_consent` return/raise unless `p_user_id = auth.uid()`, admin or service role (or revoke EXECUTE from authenticated).
- **P-03** `check_customer_booking_eligibility(p_provider_id, p_customer_id)`. Scenario: any provider owner or delegate passes `v_is_staff` for their own provider and may pass any customer uuid; the answer includes the customer's platform-wide `no_show_strikes` and `requires_full_prepayment` (probed with a customer who never booked at the asking provider). Repro test 4. Fix: for staff callers require a booking, waitlist entry or block row linking the customer to that provider, else raise the same "Not authorized"; return only the boolean to staff.

### MEDIUM-LOW / LOW-MEDIUM
- **P-14** `can_access_provider_operation(provider, NULL, op)` callers (`get_provider_staff_contacts`, `can_read_patch_tests`, `provider_professional_links`). A delegate scoped to branch A reads phone and email of staff in branch B (probed). Repro test 5. Fix: pass the target branch or filter rows to `m.branch_id IS NULL OR e.branch_id = m.branch_id`.
- **P-05** `provider_save_whatsapp_channel` / `admin_set_whatsapp_channel_verified`. Channel ownership is a manual admin click; the first owner to type a `phone_number_id` holds it and can block the real owner ("already connected to another business", also an existence oracle). Fix: verify through the Graph API plus a one-time code to the display number; generic conflict message.
- **P-06** `whatsapp_ingest_message` opt-out branch, `whatsapp.message_retention_days` null. After STOP the contact address is deleted but message bodies stay readable by the provider (probed). Fix: delete bodies after resolve, set a default retention.
- **P-07** `deliver-webhooks` `resolveAll`, `webhook-url.ts`. Static rules do not catch names such as `x.nip.io`; the DNS check is skipped when `Deno.resolveDns` is missing and is check-then-connect otherwise (the authors say so). Blind signed POST to an internal address is possible. Not verifiable here. Fix: egress allow-list or proxy; refuse delivery when the runtime cannot resolve.

### LOW
- **P-04** `employees` anon column grant `profile_id`; owner INSERT/UPDATE accepts any `profile_id`. Staff auth uuids are public (feeds P-02) and an owner can bind an unrelated user as an employee (probed), giving them the salon context and link invitations. Fix: revoke `profile_id` from anon, validate against an accepted invitation.
- **P-08** `booking_home_addresses` policy / `get_booking_address_secure`. Owner and assigned employee read a home address 400 days after the visit (probed); an administrator's reveal stamps `revealed_at`, exposing it to provider staff. Fix: staff read window after completion; no stamp for admin.
- **P-09** `platform_settings` policy `USING (true)` for anon: every key is public (non-secret today, including `no_show_strike_policy`); a future secret key would be public by default. Fix: allow-list public keys.
- **P-10** `branches`, `employee_availability`, `provider_closures` policies `USING (true)`: address and coordinates of pending, rejected or suspended providers (including a home-based one) are public. Fix: filter by provider status as `providers` does.
- **P-11** `record_consent`: `document_version` and `method` are client text except for `terms_privacy`; `ip_address`/`user_agent` are never filled. Fix: take the published notice version server side for every purpose.
- **P-12** `save_professional_profile`: `primora-official`-style handles accepted; `professional_handle_available` is a handle-existence oracle. Fix: reserve patterns.
- **P-13** `resolveCaller` uses `===` on the service key; `whatsapp-inbound` reads the whole body before the 413 check; `calculate-travel` sends customer coordinates to Google Maps without a consent record. Fix: `timingSafeEqualText`, check `Content-Length` first, disclose in the privacy notice.
- **P-15** (outside privacy) `generate_zatca_tax_invoice` previous-hash lookup `ORDER BY created_at DESC, id DESC`: `money.test` "chains every invoice" failed once in 9 runs under parallel load; ties fall back to a random uuid. Fix: per-provider counter column for chain order.

## Could not verify
- Hosted Supabase behaviour (Auth hooks, PostgREST as exposed, real `Deno.resolveDns` in the Edge Runtime, Meta Graph responses): no hosted project reachable; everything ran on PGlite with the repository migrations and on source reading.
- Browser rendering of screens (no dev server session); portfolio link attributes were read from source.
- Edge Function code was read, not executed (no Deno runtime).
- Legal questions: retention period for health answers and messages, and whether administrators may read `consents` rows with IP and user agent.

## Summary (12 lines)
1. Independent review of 12 areas on branch claude-code (HEAD c4c8662), by catalog inspection and role probes on a fully migrated PGlite database.
2. No CRITICAL or HIGH defect found; no cross-tenant read of health answers, WhatsApp transcripts, home addresses, API keys or webhook secrets could be reproduced.
3. Intake read path is sound (owner, bookings delegate, assigned employee only; admin excluded; every read audited), but P-01: withdrawal does not stop reads of past answers and retention is unset and unscheduled.
4. P-02: reviews expose reviewer and booking uuids to anyone, and `has_active_consent` answers for any uuid.
5. P-03: any provider owner can read a customer's platform-wide no-show strikes by uuid.
6. P-14: branch-scoped delegates read other branches' staff contacts.
7. WhatsApp: signature check, per-channel keyed hash, opt-out and column privileges are sound; channel ownership is manual (P-05) and bodies outlive STOP (P-06).
8. Developer API: hashed keys, double scope check, service-only data functions, SSRF rules identical in SQL and TS; DNS-rebinding residual (P-07).
9. Professional identity, attribution analytics and the address vault leak nothing across roles; minor retention and naming points (P-08, P-12).
10. Grants: RLS everywhere, all views invoker, no TRUNCATE/REFERENCES/TRIGGER, anon limited to 13 listed functions; P-09 and P-10 are public-by-default policies.
11. Edge Functions all authenticate themselves, no wildcard CORS; countries patches keep Saudi VAT 15 % and Riyadh time; one flaky invoice-chain test (P-15).
12. Repro file `supabase/tests/db/review_privacy_open.repro.mjs` (5 failing tests for P-01, P-02, P-03, P-14); nothing committed; source and migrations untouched.
