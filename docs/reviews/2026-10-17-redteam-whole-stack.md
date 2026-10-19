# Red team: whole stack outside the admin console (2026-10-17)

Reviewer: `redteam-wave2` (primora-red-team). Independent: I wrote none of the code reviewed here.
Checkout `primora-fix`, branch `claude-code` at `d7d5f07`. Local stack only: database container
`supabase_db_beauty_grooming_marketplace` with all 199 migrations applied (latest `20261016230000`). The untracked, unapplied
migration `20261017100000_qafix_console_catalogue_commands.sql` (another agent's work in progress, console only) is out of scope.

Status: DONE (finished 2026-10-18). Counts are at the end.

## Method

- Threat model: anonymous visitor, customer, provider owner, provider employee, provider delegate (manager, branch manager,
  inventory manager, receptionist), and the payment provider as a webhook caller. Assets: money (deposits, refunds, gift cards,
  wallet credit, tips, packages, memberships, payouts), customer personal data (phone, e-mail, chat, health answers), the
  integrity of chat and booking records used as dispute evidence, marketplace availability, and paid third-party quotas.
- Every database probe ran in one `BEGIN … ROLLBACK` transaction as `postgres` with `SET LOCAL ROLE authenticated` (or `anon`)
  and a forged `request.jwt.claims`. Actors: customers `…0001` (Yousif), `…0002` (Khalid), `4444…` (demo customer); owners
  `…0101` (Elite Grooming Lounge `a000…0001`), `…0102` (Sara Beauty `a000…0002`), `1111…`/`2222…`/`3333…` (demo shops);
  employee `…0201`. The owner's own account `admin.owner@primora.local` was never used. Nothing was committed to the database.
- Edge Functions and the web and mobile clients were read; URL handling was reproduced with Node's WHATWG `URL` (the same parser
  the browser and the Next.js router use).
- No source, test or manifest file was changed. This file is the only write.

## Findings

### RT-H1 (High). Either party can rewrite, backdate or move chat messages, and re-point a whole conversation to another customer or provider

`messages` and `conversations` carry column-level `UPDATE` grants on every column to `authenticated`, and the only UPDATE policies
("Participants mark messages read", "Participants update conversations") check that the caller is a participant before and after
the change. Nothing limits the change to `read_at` / the unread counters, and no trigger freezes `body`, `sender_id`, `sender_role`,
`created_at` or `conversation_id`. INSERT also accepts a client-chosen `created_at` and `read_at`.

Reproduction (rolled back):

```sql
SET LOCAL ROLE authenticated;
-- customer 4444… rewrites the PROVIDER's message in their own conversation and backdates it
SELECT set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","aal":"aal1"}',true);
UPDATE messages SET body='We confirm you will get a full refund and a free visit. - Elite', created_at=now()-interval '30 days'
 WHERE id='ffffffff-ffff-4fff-8fff-fffffffffff2' RETURNING sender_id, sender_role, body;
--   11111111-…|provider|We confirm you will get a full refund and a free visit. - Elite        (UPDATE 1)
UPDATE messages SET conversation_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3' WHERE id='ffffffff-ffff-4fff-8fff-fffffffffff2';  -- UPDATE 1
UPDATE conversations SET provider_id='a0000000-0000-0000-0000-000000000002' WHERE id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';  -- UPDATE 1
-- as Sara Beauty's owner …0102: the Elite conversation is now hers and she reads it
--   sara reads|ffffffff-…1|44444444-…|Hi, can I choose a quieter chair for the beard scu…
-- provider owner 3333… rewrites the CUSTOMER's message and hands the conversation to another customer
UPDATE messages SET body='I agree to pay the full price without any deposit refund.' WHERE id='ffffffff-ffff-4fff-8fff-fffffffffff4';  -- UPDATE 1, sender_role customer
UPDATE conversations SET customer_id='00000000-0000-0000-0000-000000000001' WHERE id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3';         -- UPDATE 1
```

Impact:
- Chat is the record a customer and a provider rely on in a dispute (`open_booking_dispute`) and that operations staff read. Either side
  can put words in the other side's mouth, change when they were said, and the row still shows the other party as sender. There is no
  edit history.
- A provider can push a conversation (with its own messages) into any customer's inbox by uuid (phishing that appears to come from a
  real salon on PRIMORA), and a customer can push a conversation into any provider's inbox.
- Erasure (Q2) deletes messages by `conversations.customer_id`. A provider who sets `customer_id` to its own account before the
  customer's erasure keeps the full message content, defeating "message content is deleted, the provider sees a tombstone". The same
  move removes the conversation from the customer's privacy copy (Q1).
- A forged conversation also creates the "relationship" that `customer_has_provider_relationship` accepts, which unlocks
  `toggle_customer_block` and the eligibility read for an arbitrary customer.

Fix:
1. `REVOKE UPDATE ON public.messages FROM authenticated; GRANT UPDATE (read_at) ON public.messages TO authenticated;` and
   `REVOKE INSERT ON public.messages FROM authenticated; GRANT INSERT (conversation_id, sender_role, body) ON public.messages TO authenticated;`
   (`sender_id` defaults from `auth.uid()` through a BEFORE INSERT trigger that also sets `created_at := now()`, `read_at := NULL`).
2. Replace "Participants mark messages read" with a policy whose CHECK also requires the row to be addressed to the caller
   (`sender_id <> auth.uid()`), and add a BEFORE UPDATE trigger that refuses any change other than `read_at` from NULL to a time.
3. `REVOKE UPDATE ON public.conversations FROM authenticated; GRANT UPDATE (unread_for_customer, unread_for_provider, customer_deleted_at)`
   only, plus a trigger that freezes `customer_id`, `provider_id` and `created_at` for non-service callers. Restrict INSERT to
   `(provider_id, subject)` with `customer_id` set from `auth.uid()` and the provider required to be verified and active.
4. Better still: move sending and reading to two definer commands (`send_message`, `mark_conversation_read`) and drop the client
   write grants entirely, the pattern the rest of the schema already follows. The direct writes to change are in the mobile app
   (`mobile_app/src/app/messages.tsx:170` and `:180`, `mobile_app/src/components/shop-details-modal.tsx:323`) and the web
   customer and provider message screens.
5. Negative tests: a customer and a provider each fail to change `body`, `sender_id`, `created_at`, `conversation_id`, and a
   conversation's `customer_id` / `provider_id`.

### RT-M1 (Medium). One account can hold every free slot of a professional (unpaid booking holds are unlimited)

`booking_create_internal` has no limit on how many `pending_payment` bookings one customer may hold at once, and no rate limit.
Each hold blocks the professional's calendar until `expire_stale_booking_holds` releases it (15 minutes), and the attacker can
re-create the holds as soon as they lapse. E-mail sign-up is open (`[auth.email]` defaults), so a provider can be blocked with
throwaway accounts.

Reproduction (rolled back), customer `…0001`, Sara Beauty employee `e000…0002`, service "French Gel Manicure":

```sql
DO $$ DECLARE d int; s record; n int := 0; BEGIN
  FOR d IN 2..4 LOOP FOR s IN SELECT slot_start FROM get_available_slots('e0000000-0000-0000-0000-000000000002', current_date+d, 180, null, null, 0, 0, null) LOOP
    BEGIN PERFORM create_booking('e0000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000004', s.slot_start); n := n+1;
    EXCEPTION WHEN others THEN NULL; END; END LOOP; END LOOP; RAISE NOTICE 'created %', n; END $$;
-- NOTICE: created 24 pending bookings
-- pending_payment | 24 | deposit 864.00 never paid
-- free 60-minute slots left on day 3: 3 of 19
```

Group and recurring bookings make it worse: with a provider-chosen `payment_hold_hours` their unpaid guest or series bookings
hold the slots for hours instead of 15 minutes (`create_group_booking` sets `payment_due_at`, which the sweeper respects).

Impact: a competitor or a bot empties a salon's (or the whole marketplace's) bookable calendar indefinitely at no cost. The same
holds also consume coupon redemptions (`promotional_codes.redeemed_count` is incremented at hold time), so a limited platform or
provider code can be exhausted by holds that are never paid.

Fix:
- Cap open holds per customer (for example 2 per provider and 3 platform-wide, as a `platform_settings` value) inside
  `booking_create_internal` under `pg_advisory_xact_lock(hashtext('holds:'||customer))`, and the same in
  `create_multi_service_booking`, `create_group_booking` and `create_booking_series_from_booking` (M-17 is the series case).
- Count a coupon redemption only when the booking is confirmed (or reserve it with an expiry), so holds cannot exhaust a code.
- Add a per-user and per-IP rate limit on booking creation at the edge (Supabase rate limits do not cover RPC calls).
- Negative test: the third concurrent hold of one customer is refused.

### RT-M2 (Medium). Open redirect after sign-in and after the authenticator step (`/login?returnUrl=`, `/login/mfa?next=`)

Both pages accept any value that starts with `/` and not with `//`:

- `web_platform/src/app/login/page.tsx:248` `if (returnUrl && returnUrl.startsWith("/") && !returnUrl.startsWith("//")) router.replace(returnUrl)`
- `web_platform/src/app/login/mfa/page.tsx:92` `safeNext = (value) => value.startsWith("/") && !value.startsWith("//") ? value : "/admin"`

A backslash or a tab after the first slash passes the check, and the WHATWG URL parser turns it into a protocol-relative address.
The Next.js App Router builds `new URL(href, location.href)` and, when the origin differs (`isExternalURL`), performs a hard
navigation to it (`navigate-reducer.js` → `completeHardNavigation`).

Reproduction (Node, same parser as the browser):

```text
returnUrl=%2F%5Cevil.example   -> "/\evil.example"   passes the check -> http://evil.example/
returnUrl=%2F%09%2Fevil.example -> "/\t/evil.example" passes the check -> http://evil.example/
```

Impact: a link `https://primora.sa/login?returnUrl=%2F%5Cprimora-sa.example` signs the customer in on the real site and then lands
them on an attacker page that can ask for a "card re-verification" or a "new one-time code". The MFA variant
(`/login/mfa?next=%2F%5C…`) does the same to an administrator right after TOTP, the moment they are most willing to type a code.

Fix: parse instead of string-matching, in one shared helper used by both pages and anything else that redirects:

```ts
export function safeInternalPath(value: string | null, fallback: string): string {
  if (!value || /[\\\u0000-\u001f]/.test(value)) return fallback;
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search + url.hash : fallback;
  } catch { return fallback; }
}
```

Add unit tests for `/\host`, `/\t/host`, `/%5Chost`, `//host`, `https://host`, `javascript:`.

### RT-L1 (Low). P-05 is not closed: a provider squats another business's WhatsApp number, and the platform's promo code names

`provider_save_whatsapp_channel` still lets the first provider owner who types a `phone_number_id` hold it, before any
verification; the real business then gets "This WhatsApp number is already connected to another business". Messages are not
routed to an unverified channel (sound), so this is a denial of service and an existence oracle, not interception. The same
first-come rule applies to promo codes: codes are unique across the platform, so a provider can pre-register `RAMADAN`,
`PRIMORA`, `EID2026` and block the platform's own campaigns (the refusal deliberately does not say who holds it).

Reproduction (rolled back): owner `…0101` saves `109876543210987` (unverified) and code `RAMADAN`; owner `…0102` then gets
`This WhatsApp number is already connected to another business` and `This code cannot be used. Choose another`.

Fix: store an unverified channel without the unique claim (unique index only `WHERE verified_at IS NOT NULL`), verify ownership
through the Graph API (`GET /{phone-number-id}` with the provider's own token) or a one-time code sent to the display number, and
let verification evict an unverified squatter. Reserve a platform list of code names (and prefix provider codes or scope the
uniqueness to `(provider_id, code)` with platform codes in their own namespace).

### RT-H2 (High). A provider cancels a customer's paid membership and keeps all of the money, which is payable at once

`cancel_membership` lets the provider owner cancel an `active`, paid membership ("Cancelling never moves money: a refund of a paid
membership goes through the existing refund process"). No refund request is created, the visits are forfeited, and the
`package_sale` ledger row written by `confirm_membership_payment` stays `pending` with the full amount as `provider_share`.
`ledger_entry_payable` treats every entry without a booking as payable immediately, so the money is in the provider's available
balance from the moment of sale. The customer has no in-app recourse: `open_booking_dispute` only accepts bookings with a
`booking_payment` ledger row.

Reproduction (rolled back):

```sql
-- owner …0101 creates and activates "Gold", SAR 1,200, 365 days, 12 visits; customer …0002 buys it (purchase_membership)
-- service role: confirm_membership_payment(<membership>, 'chg_red_member_1', 1200.00)  -> {"status":"activated"}
SELECT provider_available_balance('a0000000-0000-0000-0000-000000000001');   -- 1200.00
-- owner …0101 (aal1, no step-up):
SELECT cancel_membership(<membership>, 'closing the programme');               -- {"status":"cancelled","previous_status":"active"}
-- memberships: cancelled | visits_remaining 12
-- refund_requests for the charge: 0
-- transactional_ledger: package_sale | provider_share 1200.00 | pending
SELECT provider_available_balance('a0000000-0000-0000-0000-000000000001');   -- 1200.00 (still payable)
```

Impact: a provider can sell annual memberships, request a payout of the prepaid amount the same day (`request_provider_payout`),
and cancel the memberships, leaving customers with no service and no refund. Packages have the same immediate payability (see
RT-M3). This contradicts D-Q9 ("refunds go to the original method, start within 3 business days") for the cancellation the
provider chose, and the commercial-agent model where PRIMORA collects on the provider's behalf.

Fix:
1. A provider-initiated (or console) cancellation of a paid membership creates a refund in the same transaction: the unused share
   (`amount_due * visits_remaining / visits_per_period`, or pro rata by time, as the owner decides) through
   `create_refund_request_internal(..., 'provider_membership_cancellation', 'mcancel:'||id)`; the customer's own cancellation follows
   the published policy. Record the refund id on the membership.
2. Make prepaid value earned as it is used: `ledger_entry_payable` returns false for `package_sale` (memberships and packages)
   until the visit is redeemed, or release it pro rata per redemption, with a holdback for the remainder; this is the same rule
   that M-09 introduced for booking deposits.
3. Let the customer open a dispute on a membership or package charge (`payment_disputes.purchase_type/purchase_id`).
4. Negative test: after an owner cancels a paid membership, a refund request exists and the provider's available balance does
   not include the refunded part.

### RT-M3 (Medium). Package terms are read at payment time, and suspended or unverified providers still sell packages

`purchase_service_package` snapshots only the price (`amount_paid`). `confirm_purchase_payment` sets
`remaining_sessions = packages.session_count` and `expires_at = now() + packages.expires_in_days` from the live row, which the
owner can change at any time through the direct `packages` UPDATE policy ("Owners manage packages"). Neither the purchase nor the
public read policy ("Public read on packages": `is_active = true`) checks the provider's status, so the packages of a suspended,
unverified provider stay listed to `anon` and can be bought.

Reproduction (rolled back), suspended and unverified provider `aaaa…0001`:

```sql
-- anon: SELECT id, price FROM packages WHERE provider_id='aaaaaaaa-…1'   -> the package, 900.00
-- customer …0002: purchase_service_package(<package>)                     -> pending_payment, amount_sar 900.00
-- owner 1111… between purchase and payment:
UPDATE packages SET session_count = 1, expires_in_days = 1 WHERE id=<package>;  -- UPDATE 1
-- service role: confirm_purchase_payment('package', <user_package>, 'chg_red_pkg_1', 900)  -> activated
-- user_packages: remaining_sessions 1 | lifetime 1 day | amount_paid 900.00     (bought as 10 sessions)
-- provider_available_balance(suspended provider) = 900.00
```

Impact: bait and switch on prepaid bundles, and a suspended provider (suspended for cause) keeps collecting prepaid money.

Fix: snapshot `session_count`, `expires_in_days`, `service_id` and the package name onto `user_packages` at purchase and use only
the snapshot at payment; refuse purchase (and hide the package in the public policy) unless the provider is `active` and
`is_verified`, as `membership_open_purchase` already does for plans (`p.status = 'active'`). Freeze the commercial columns of a
package that has sold units (a new version instead), mirroring how fee rules are versioned.

### RT-L2 (Low). The anonymous analytics rate limit is per caller-chosen id, so it does not limit anything

`track_analytics_event` (executable by `anon`) counts the last minute's events for the `p_anon_id` the caller sends. Rotating the
id removes the limit.

Reproduction (rolled back, as `anon`): 500 calls with ids `anon-rt-1 … anon-rt-500` give `accepted 500 of 500 in one transaction`;
the same id 130 times gives `accepted 120 of 130` (the limit only applies when the id is reused).

Impact: anyone can grow `analytics_events` without bound (storage and query cost) and forge funnel figures such as
`shop_viewed` for a chosen provider in the console's event counts. No money or ranking reads these rows today
(`admin_get_event_counts`, `admin_sponsored_overview` only), which keeps this low.

Fix: rate-limit anonymous events at the edge by IP (the anonymous id is not an identity), add a global per-minute ceiling for
`source = 'client'` in the function, and keep client events out of any future ranking or billing input.

### RT-L3 (Low). Any signed-in account can spend the paid Google Maps quota without limit

`calculate-travel` accepts any valid user token and any pair of coordinates, with no link to a booking, no rate limit and no
cap, and calls the Distance Matrix API for each request. It also returns Google's error text to the caller (`details`).
Found by reading; no Maps key is configured locally.

Fix: require a `booking_id` (or a branch id plus a home-service draft) that the caller owns, take the provider coordinates from
the branch row instead of the request, cache by rounded coordinates, apply a per-user daily ceiling, and drop `details` from the
response.

### RT-L4 (Low). A push token can be re-bound to another account, and providers can read the token column of their customers

`register_push_token` upserts on the token and sets `user_id = auth.uid()` on conflict, so whoever presents a known token takes
it over: the device stops receiving its owner's notifications and receives the new account's instead, and `send-notification`
lets any user send a free-text title and body to their own tokens. Separately, `profiles.expo_push_token` is granted for SELECT
to `authenticated`, and the "Providers read booked customer profiles" policy exposes it to provider owners and assigned staff.
The column is unused today (0 rows hold a value), so the two do not combine yet.

Fix: drop `profiles.expo_push_token` (tokens live in `expo_push_tokens`) or revoke its SELECT grant; on conflict, reassign a
token only after the previous owner's session on that device has signed out (or keep one row per token and user and send only to
the latest sign-in); limit `send-notification` for non-console callers to fixed templates.

### RT-L5 (Low). A fixed one-time code sits in the shared auth config

`supabase/config.toml` sets `[auth.sms.test_otp] "+966500000000" = "123456"`. Locally that is intended. If this file is used to
configure the hosted project (`supabase config push`, or copied by hand into the dashboard), anyone can sign in as that number
with that code.

Fix: move test codes to a local-only override (an `env(…)` value that is empty in hosted), and add a release check that the
hosted auth config has no test OTP entries.

### RT-L6 (Low). Two functions still compare the service key with `===`

`send-notification/index.ts` and `expire-holds/index.ts` use `token === serviceKey` instead of `serviceKeyMatches` (constant time,
refuses an empty key), which every other function now uses (P-13). Remote timing recovery is impractical, so this is hygiene; the
fix is a two-line change to `serviceKeyMatches`.

## Earlier findings: re-check (critical and high, plus the open non-admin items)

| Id (review) | Status | Evidence on the current database |
|---|---|---|
| C-1 (gov1) finance/owner write money tables | Closed | `authenticated` has no INSERT, UPDATE or DELETE on `transactional_ledger`, no INSERT on `wallet_credits` |
| C-2 (gov1) operations mints balance through `bookings` | Closed | no table or column UPDATE grant on `bookings` for `authenticated` |
| H-1..H-4 (gov1) | Closed (H-3 through R2-H4) | Edge Functions gate on `consoleCallerDecision` / `adminSessionAllows`; `deliver-governance-notices` exists and is service-key only |
| R2-H1 (round2) direct console reads | Closed | 68 restrictive "Console sessions read only through audited functions" policies, including `provider_customer_notes`, `waitlists`, `provider_customer_blocks` |
| R2-H2 (round2) operations refunds via `cancel_booking` | Closed | `cancel_booking` raises `use_admin_cancel_booking` for a console session |
| R2-H3 (round2) forged Tap evidence | Closed | `admin_import_reconciliation_file`: a `tap_settlement_file` accepts only `settlement` objects |
| R2-H4 (round2) notices never sent | Closed in code | delivery worker present; scheduling is an owner and release item |
| C1, H1–H3 (priv) erasure | Closed | `privacy_erase_subject_internal` not executable by `authenticated`; the 10-16 recheck evidence still matches the function bodies |
| M-03 (money, critical) late payment resurrects credit | Closed | the `confirm_booking_payment` conflict test includes `wallet_credit_amount` |
| M-01 (money) non-booking double capture | Closed | `confirm_purchase_payment` and `confirm_membership_payment` record the capture and queue a refund |
| M-06 (money) yearly plan price | Closed | `quote_provider_plan` multiplies the yearly rate by 12 months |
| M-08 (money) walk-in removes the first-visit fee | Closed | first visit ignores `walk_in` and zero-price bookings |
| M-09 (money) future deposits payable at once | Closed for bookings; **not for prepaid products** | `ledger_entry_payable` waits for `completed` on `booking_payment` only; `package_sale` (packages and memberships) is payable at once, see RT-H2 |
| M-10 (money) self-attested import source | Closed | `resolve_booking_source` requires a reviewed, consented import |
| P-02 (privacy) reviewer ids and `has_active_consent` | Closed | `reviews` anon columns exclude `customer_id` and `booking_id`; `has_active_consent` refuses another user's id |
| P-03 (privacy) eligibility for any customer | Partly closed | a staff caller needs a relationship, but RT-H1 lets a provider manufacture one by re-pointing a conversation |
| P-05 (privacy) WhatsApp channel squatting | **Not closed** | reproduced again, see RT-L1 |
| P-07 (privacy) webhook DNS rebinding | Accepted limit, unchanged | documented in `webhook-url.ts`; egress filtering is still the real control |
| P-13 (privacy) `===` key compare | Partly closed | two functions remain, see RT-L6 |
| P-14 (privacy) branch-scoped delegate with a NULL branch | Partly closed | `get_provider_staff_contacts` now filters per branch; `memberships_read`, `membership_plans_read`, `is_membership_staff` and the gate of `get_provider_chain_operations` still pass `NULL` (code reading, not reproduced) |

## Checked with no finding

- Anonymous surface: 11 functions executable by `anon`, all read-only or rate-limited except RT-L2. `record_sponsored_click` binds
  the click to `auth.uid()`, so a competitor cannot bill another provider (a sponsored fee needs the clicking customer's own
  completed booking). Anon column grants exclude provider contacts, CR and VAT data, `admin_notes` and employee `profile_id`.
- Direct provider creation by a customer: refused (the control trigger nulls `cr_verification_status`, which is NOT NULL);
  providers only come from an approved application.
- Payments: `payment-webhook` re-fetches the charge from Tap and accepts only a `CAPTURED` SAR charge whose amount equals the stored
  deposit or price; a second charge for the same booking is recorded and refunded; `payment-checkout` takes every amount from the
  database and allow-lists the mobile return address. Refund, reconciliation and payout functions require the service key or a
  console session with the named money permission; `process-payout` and `request-payout` answer 410.
- Edge Function CORS: no wildcard anywhere; unknown origins get the first production origin.
- Booking money: gift-card codes carry 64 random bits; coupon, loyalty, wallet and package checks lock their rows; the late-cancel
  fee cannot be dodged by rescheduling inside the notice window; tips are customer-only and after the visit; reviews are one per
  completed booking and customers cannot edit or re-publish them.
- Job board: bids cannot be self-accepted or moved; only verified providers bid.
- Inventory and supply: every command checks that both branches belong to the provider and respects the delegate's branch scope;
  products, suppliers and stock cannot cross providers (`validate_inventory_scope`); command receipts are bound to the actor.
- Public API: hashed keys, scope per route, provider and branch taken from the key, field allow-list, no CORS.
- WhatsApp inbound: HMAC over the raw body, size limit before reading, unverified channels are not routed, deterministic engine
  with no booking or payment power.
- Privacy: requests and downloads need a fresh OTP sign-in and refuse recently changed contacts; correction fields are allow-listed.
- Web: JSON-LD is escaped; React 19 blocks `javascript:` links; security headers are set (no CSP yet, already known).
- Mobile: the session is stored in SecureStore (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`); the app uses the same RPCs and tables as
  the web, so it has no extra power, but it shares RT-H1's direct chat writes.
- Offboarded staff: a deactivated employee reads no conversations, bookings or customer profiles (RLS on `employees` hides the
  inactive row inside the policies).

## Counts

| Severity | New | Ids |
|---|---|---|
| Critical | 0 | |
| High | 2 | RT-H1, RT-H2 |
| Medium | 3 | RT-M1, RT-M2, RT-M3 |
| Low | 6 | RT-L1 (P-05 still open, promo-code squatting), RT-L2, RT-L3, RT-L4, RT-L5, RT-L6 |

Earlier critical and high findings: all closed. Earlier items not closed: P-05. Partly closed: P-03, P-13, P-14, and M-09 for
prepaid products.
