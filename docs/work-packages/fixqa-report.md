# FIX-QA report

## Q-10 and Q-11 (375px overflow) - not visually verified
- Q-10 `web_platform/src/app/page.tsx` header: padding `px-4 sm:px-12`, logo `text-xl sm:text-2xl`, search/profile icon group and divider hidden below `sm` (Log in remains as text link, search is still reachable from the hero CTA), action groups get `min-w-0` and smaller gaps, Sign up `whitespace-nowrap px-3.5 sm:px-5`. All spacing is symmetric/logical so RTL is unaffected.
- Q-11 `web_platform/src/app/customer/bookings/page.tsx` tabs: container `w-full max-w-full overflow-x-auto`, each tab `min-w-0 flex-1 sm:flex-none px-2 sm:px-6`, so three tabs share 375px and a longer Arabic label scrolls inside the row instead of widening the page.
