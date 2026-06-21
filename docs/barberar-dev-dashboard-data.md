# Barberar Dev Dashboard Data

This project must use only the Barberar Supabase project:

- Project ref: `vpszcnxsgmoavkqorjzt`
- Product: Barberar / PRIMORA beauty and grooming marketplace
- Do not use Chocolux Supabase, Vercel, storage, auth, or seed data here.

## Local Login

For local dashboard development, use the dev role switcher that appears in the app shell after the localhost dev-access work. It is intended for UI and CRUD verification only.

Do not disable production auth guards to test pages. If a page needs real Supabase writes, use the appropriate local dev role and verify the linked project ref before pushing migrations.

## Safe Demo Data

Use `supabase/seed.sql` only with the Barberar database. The seed includes deterministic IDs for profiles, providers, branches, bookings, and ledger rows that are safe for local resets.

Before testing admin dashboard pages, confirm the linked Supabase project:

```powershell
npx supabase status
Get-Content supabase/.temp/project-ref
```

Expected project ref:

```text
vpszcnxsgmoavkqorjzt
```

## Admin Controls Added

The following admin controls are backed by schema/state and should not be replaced with mock-only local state:

- Branch activity uses `public.branches.is_active`.
- Coupons use `public.promotional_codes`.
- Refund review requests use `public.payment_refund_requests`.
- Payments remain sourced from `public.transactional_ledger`.

## Verification

Run these before handing off dashboard-control work:

```powershell
npm run test:admin-controls
npx tsc --noEmit --project web_platform/tsconfig.json
npm run typecheck:mobile
npm run build --workspace=web_platform
```
