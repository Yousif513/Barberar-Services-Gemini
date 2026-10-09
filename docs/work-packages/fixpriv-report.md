# FIX-PRIV report (privacy review 2026-10-08, defects P-01 ... P-15)

Migration range 20261009200000 .. 20261009249999. Tests: `supabase/tests/db/fixpriv_*.test.mjs`.

| Defect | Status | Commit | Test |
|---|---|---|---|
| P-02 | fixed (anon part; see notes) | see git log "P-02" | fixpriv_consent_reviews.test.mjs |

## P-02
- `20261009200000_fixpriv_consent_oracle.sql`: `has_active_consent(uuid,text)` now raises `42501 Not authorized` when a signed-in caller asks about someone else and is not an administrator. Service role, jobs and definer-internal calls without a signed-in user (`auth.uid()` NULL) are unchanged. This replaces the (3-line, language sql) function body with a plpgsql body of the same signature; privileges are re-stated.
- `20261009200100_fixpriv_reviews_reviewer_privacy.sql`: anon lost table-wide SELECT on `reviews` (a column revoke cannot narrow a table grant) and got the nine public columns back by name; `customer_id`, `booking_id`, `moderated_by` are no longer readable by visitors. New anon-callable `public_provider_reviews(provider, limit)` returns the review plus `reviewer_first_name` and `reviewer_last_initial` and no identifier (the screens already showed first name + last initial). Screens changed: `web_platform/src/app/shop/[id]/page.tsx`, `mobile_app/src/lib/marketplace.ts` (they embedded `profiles!reviews_customer_id_fkey`, which needs the revoked column).
- Not done: signed-in users (role `authenticated`) still hold SELECT on those columns, because the customer, provider and admin review screens read them (customer own reviews, provider/admin embeds). With `has_active_consent` closed the uuid no longer feeds a consent oracle. A follow-up would serve those three screens through role-scoped RPCs and then revoke the columns from `authenticated`.
- Existing allow-list tests updated for the new anon function and for `reviews` no longer having a table-level anon grant (data_api_grants, inventory_workflows, trust, qa_adversarial).
