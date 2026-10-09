# FIX-QA report

## Q-10 and Q-11 (375px overflow) - not visually verified
- Q-10 `web_platform/src/app/page.tsx` header: padding `px-4 sm:px-12`, logo `text-xl sm:text-2xl`, search/profile icon group and divider hidden below `sm` (Log in remains as text link, search is still reachable from the hero CTA), action groups get `min-w-0` and smaller gaps, Sign up `whitespace-nowrap px-3.5 sm:px-5`. All spacing is symmetric/logical so RTL is unaffected.
- Q-11 `web_platform/src/app/customer/bookings/page.tsx` tabs: container `w-full max-w-full overflow-x-auto`, each tab `min-w-0 flex-1 sm:flex-none px-2 sm:px-6`, so three tabs share 375px and a longer Arabic label scrolls inside the row instead of widening the page.

## Q-03b category taxonomy
- Cause: `search_marketplace_providers` matches `p_category` against the exact slug (or id) of a provider service's own category (migration `20261005020000`, line ~324), never the children. Providers list services in leaf categories (`mens-haircut`), while pages asked for a parent, and `/categories/barber` and `/hair` asked for a legacy slug.
- New `web_platform/src/lib/category-tree.ts` (`expandCategorySlugs`, `loadExpandedCategorySlugs`): reads active `categories` (id, slug, parent_id) and returns the slug plus every descendant. No SQL change.
- `components/category-providers.tsx` now takes `categorySlugs`, runs one existing-parameter search per expanded slug and merges by branch; a failed category read shows the error state. Pages: barber = `barber-hair` + `grooming-barbering`, hair = `barber-hair` + `hair-styling`, spa = `spa-wellness` (makeup still uses the name-term search).
- `/discover` expands the selected category the same way (merged by branch, ordered by distance when the visitor shared a position).
- Not changed: `/services` category chips (the 17-item mixed list is an admin data-hygiene matter: duplicate leaf categories "Beard Grooming" vs "Beard & Shave"; consolidating them is a data decision, not a web fix).

## Q-07 and Q-12 language leftovers
- `/admin/branches`: the language state was hard-wired to Arabic and never set; it now follows the admin shell language (`useOperationsLocale`).
- `/customer/notifications`: "Mark Read / Mark Unread" now bilingual; the timestamps use the page locale and Asia/Riyadh.
- `/about`: "Operational Integrity" label bilingual (`hygieneLabel`).
- `/discover`: the map watermark showed the upper-cased English city value; it now shows the localized city name (no letter-spacing in Arabic).
- `/customer/search`: removed the invented "Riyadh" fallback on a card whose branch has no city or district; the pin is simply hidden.

## Q-08 dev switcher (already holds, no change)
`web_platform/src/lib/dev-access.ts` returns false in production builds, off localhost/127.0.0.1/[::1], and unless `NEXT_PUBLIC_ENABLE_DEV_ACCESS === "true"`; `components/dev-role-switcher.tsx:75` and the login page both go through it. Operational note: never set that variable in Vercel.
