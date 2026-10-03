# 07 — UX Audit

> **Research date:** 2026-10-03. Sources: code inspection of `web_platform/src/app/**` and `mobile_app/**`, the design-steward and adminwright reviews from the same session, and competitor flows in report 02.
> Format per finding: **CURRENT → PROBLEM → COMPETITOR LESSON → RECOMMENDED SOLUTION**. Nothing has been changed.

---

## 1. The ten UX problems that cost the most

| # | Current | Problem | Competitor lesson | Recommended solution | Priority |
|---|---|---|---|---|---|
| U1 | "Become a provider" leads to a marketing page with no form (`/provider/become` → `/become-provider`, 0 database calls) | Every interested business hits a dead end | SPOT: WhatsApp demo reply within 2 h, 30-min setup; Fresha/Booksy: trial in minutes | Short application (name, CR, branch, phone) + WhatsApp concierge + "you'll be live in 24 h" promise | P0 |
| U2 | Booking requires login; `shop/[id]/page.tsx:894` sends guests to `/login` with no return URL; `login/page.tsx` has no redirect parameter | Customer loses service, professional, date and slot | Fresha/Booksy keep the selection and ask for phone at the end | Pick slot first, authenticate by phone OTP inline, return to the same step | P0 |
| U3 | Shop page collects card number, holder, expiry and CVV in page state (`shop/[id]/page.tsx:253-256, 864-882`) then redirects to Tap anyway | Double entry, trust loss, PCI scope for no benefit | SPOT/Glamera: processor-hosted payment; Apple Pay first | Remove the in-page card form; go straight to the PSP's hosted or embedded fields; Apple Pay / mada first | P0 |
| U4 | Customer must pick a specific professional | Extra decision; idle staff not offered | Fresha/Booksy "any professional" | Default "first available", optional specific pro | P1 |
| U5 | No reminders, no confirmation message outside the app | Customers forget; providers absorb no-shows | SPOT Arabic WhatsApp reminders with one-tap confirm/reschedule | WhatsApp confirmation + 24 h and 2 h reminders with action buttons | P0 |
| U6 | Cancellation shows no policy and has no consequence; Terms promise a 24 h / 50 % rule | Customer sees one rule, system applies another | SPOT shows merchant policy before payment | Show the provider's policy on the slot screen and in the confirmation; enforce it | P0 |
| U7 | Home-service booking on the shop page throws "Home-service address confirmation is required before payment." (`shop/[id]/page.tsx:899`) | The toggle offers a path that always fails | Salon Station: address entered, revealed to specialist after acceptance | Address step with saved addresses; hide the toggle until the flow is complete | P1 |
| U8 | Language chosen per page (locale state in 57 files, root `<html lang="en" dir="ltr">`) | Arabic users see the page flip back to English; RTL glitches | Glamiva, SPOT: Arabic-native | One locale provider; server-rendered `lang` and `dir`; remember the choice | P1 |
| U9 | Dashboards have no mobile navigation | Owners and staff use phones between clients | Glamera One, Fresha business app | Bottom tab bar on small screens for the five daily actions | P1 |
| U10 | Status badges erased by a global `!important` rule (`globals.css:124` restyles every bordered element inside `.primora-dashboard-content`) | Confirmed / pending / cancelled look identical | Every scheduler colour-codes status | Scope the panel style to panels only; restore semantic badge colours | P1 |

---

## 2. Customer journey audit

| Step | Current | Problem | Lesson | Recommendation |
|---|---|---|---|---|
| Discover | `/services` real data; client-side filtering; categories pages static | No distance, no map, not indexable by Google | Glamiva map; Fresha SEO pages | Server-rendered provider pages; distance sort; Arabic SEO slugs |
| Evaluate provider | Photos by category; reviews | Employee ratings stored but never shown | Glamiva per-employee ratings; Booksy portfolio | Pro cards with rating, specialties, portfolio |
| Choose service | Gender-segmented catalog ✓ | No variants (hair length), no add-ons | Booksy variants/add-ons | Variants with price/duration |
| Choose time | Real slots, 15-min grid, prayer windows on provider side | Prayer pauses look like missing slots | None show it | "Paused for prayer" label |
| Book for someone | Dependents ✓ | Hidden in a selector | — | Promote "Book for my son / mother" |
| Pay | Deposit via Tap; in-page card form duplicates entry | See U3 | Apple Pay first | Wallet-first payment sheet |
| Confirm | Confirmation page `pending_payment` status | If webhook is late, customer sees "pending" with no guidance | — | Polling + "we'll message you on WhatsApp" |
| Before visit | Nothing | No reminder, no directions | SPOT | WhatsApp reminder with map link |
| After visit | Review request only in app | Low review volume | StyleSeat rebooking prompt | WhatsApp review + rebook message |

**Mobile app (Expo):** `index` and `explore` run entirely on mock data and there is no sign-in. A customer installing it today sees invented salons. Recommendation: either hide the app until it shares the web data layer, or reduce it to a thin shell around the real flows. Shipping a mock app to stores is a reputational risk.

---

## 3. Business owner journey audit

| Step | Current | Problem | Recommendation |
|---|---|---|---|
| Sign up | Dead end (U1) | No supply | Assisted application |
| Set up | Services, staff, shifts pages exist | No guided order; no "go live" checklist | 5-step checklist: hours → services → staff → policy → share link |
| Daily operations | Calendar + bookings | No walk-in, no mobile nav, badges erased | Mobile day view with tap actions |
| Get paid | Wallet + payout request | Manual, opaque timing | Automatic payout schedule visible in the wallet |
| Understand value | Reports are mock charts with invisible controls | Owner cannot see what PRIMORA earned them | "PRIMORA brought you X new clients, Y SAR" summary |
| Upgrade plan | Simulated checkout | Owner thinks they paid | Remove until real |

---

## 4. Employee journey audit

Employees can sign in (role exists) but every provider page queries by `owner_id`, so an employee sees empty screens. The status-transition trigger lets only the owner complete a booking. **Recommendation:** a dedicated "My day" view (today's bookings, start/complete/no-show, earnings, tips) — the cheapest way to make PRIMORA used every hour inside a salon.

---

## 5. Admin journey audit (summary of adminwright findings)

- One third of admin routes are decorative or redirect stubs; the dashboard shows hard-coded figures in **US dollars**.
- Six screens substitute invented records when a query fails or returns zero rows, so an outage and a quiet month look the same.
- Destructive actions (coupon delete, provider changes) have no confirmation, reason capture or recovery.
- Recommendation: honest loading / empty / error states first; then the four operational queues (applications, disputes, payouts exceptions, review reports).

---

## 6. Visual and accessibility audit

| Finding | Evidence | Impact | Recommendation |
|---|---|---|---|
| Gold on white contrast 2.11:1 | 223 occurrences (design-steward) | Fails WCAG AA (4.5:1) | Darker gold for text; keep bright gold for accents |
| No visible focus styles | 0 `focus-visible` rules | Keyboard users lost | Global focus ring token |
| Small text | 74.7 % of text ≤ 12 px | Hard to read, especially Arabic | 14 px minimum body; Arabic +1 step |
| No webfont; Georgia fallback | `layout.tsx` | Arabic rendered by system default | Arabic-capable pair (e.g., IBM Plex Sans Arabic or Tajawal with a Latin match) |
| Sticky headers broken | `globals.css:166` forces `position: relative` on all descendants | Navigation scrolls away | Remove the blanket rule |
| Unthemed pages | `shop/[id]`, `service-board`, `become-provider`, `categories/*` | The most important customer page looks like a different product | Bring the booking page into the design system first |
| Invisible controls | Provider pricing, reports, settings, jobs | Owners cannot find actions | Contrast pass on controls |

---

## 7. Saudi-specific UX expectations

| Expectation | Current | Recommendation |
|---|---|---|
| Arabic first, not translated | English default | Arabic default for Saudi users, Hijri date shown alongside Gregorian |
| WhatsApp as the main channel | Not integrated | Confirmations, reminders, support and booking link via WhatsApp |
| Apple Pay and mada first | Card form first | Wallet-first payment |
| Women-only and men-only journeys | Gender filter | Separate entry points; female staff preference for women's home service |
| Prayer times | Provider side only | Visible on customer slots |
| Ramadan and Eid | Not modelled | Seasonal hours, Eid pre-booking, gift appointments |
| Family booking | Built | Promote prominently |
| Trust signals | "Verified" claims without process | Real CR-verified badge, review counts, response time |

---

## 8. UX priorities

- **P0:** U1, U2, U3, U5, U6.
- **P1:** U4, U7, U8, U9, U10, employee "My day", honest admin states, booking page reskin, contrast and focus.
- **P2:** maps, pro portfolios, variants, owner value summary.
