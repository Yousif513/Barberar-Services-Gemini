# FIX-MOBILE report

Branch `wp/fixmobile`. No migrations. Files touched outside `mobile_app/`: `supabase/functions/payment-checkout/index.ts` (2 lines),
`supabase/functions/_shared/return-url.ts` (new), `supabase/functions/send-otp/index.ts`.

| Defect | Status | Commit | Test |
|---|---|---|---|
| R39 payment returns to the app | fixed (Edge Function not executable here, see below) | 6ecd42c | `mobile_app/tests/return-url.test.mjs` |
| R40 language provider, tab labels, RTL | fixed; native RTL deferred (decision below) | 76af2c0 | `mobile_app/tests/locale.test.mjs` |
| R41 accessibility metadata | fixed on the five main screens and the shop sheet | 4b27acc | `mobile_app/tests/a11y-label.test.mjs` |
| R46 start-up and consent | fixed | a337f4b | `mobile_app/tests/consent.test.mjs` |
| R49 send-otp | fixed by configuration, not deleted | see last commit | none (Deno only) |
| D-10, R37, R38, R45, R48 | already in the base; re-checked D-10 (wording "of the deposit", deposit on the ex-VAT price) | base | existing |
| D-20 | `send-otp` already used `_shared/http.ts` `corsHeaders`; the other functions are not in this package | n/a | n/a |

## R39
- `supabase/functions/_shared/return-url.ts`: pure, no Deno globals. `allowedAppReturnUrl` accepts only the exact strings
  `mobileapp://bookings|profile|explore|messages` (scheme matches `mobile_app/app.json`, asserted by the test); query, fragment, userinfo, other
  schemes, other casing, whitespace and non-strings are refused. `buildRedirectUrl` keeps the web default `${APP_URL}${redirectPath}` and, for an allowed
  address, uses it with the query of `redirectPath` (`mobileapp://bookings?payment=<id>`). `payment-checkout` calls it with `body.returnUrl`; nothing else changed.
- App: `src/lib/payment-return.ts` `openCheckout` uses `WebBrowser.openAuthSessionAsync(url, "mobileapp://bookings")` and, whatever the outcome, notifies the
  bookings list, which reloads (`subscribeBookingsChanged` in `bookings.tsx`). Used for both booking and package checkout; a confirmed no-deposit booking also refreshes.
- Not verified: the function was not run (no Deno), and Tap's acceptance of a custom-scheme redirect URL could not be checked. If Tap rejects non-http(s)
  redirects, the fix is an https page on the web app that forwards to `mobileapp://bookings`; the allow-list and the app side stay as they are.

## R40
- `src/lib/locale-core.ts` (pure: `parseLang`, `loadLang`, `saveLang`, `TAB_LABELS`) and `src/lib/locale.tsx` (`LocaleProvider`, `useLocale`). The choice is kept in
  expo-secure-store on phones (localStorage in a browser); no new dependency. The provider mounts in `app/_layout.tsx` and waits for the saved value, so there is no
  language flash. The six `useState<"en"|"ar">` copies are replaced by `useLocale()` (same `lang`/`setLang` API, updater form kept).
- Tab labels (native and web tab bars) come from `TAB_LABELS`. English placeholders and the "OK" button in `service-board.tsx` / `shop-details-modal.tsx` are translated.
- RTL decision: `I18nManager.forceRTL` needs an app restart and removing every `row-reverse` on every screen at once, and cannot be tried without a device,
  so it is NOT done. Instead the platform's own mirroring is switched off (`I18nManager.allowRTL(false)`, `swapLeftAndRightInRTL(false)`), which removes the
  double mirroring on an Arabic-locale phone and keeps the existing logical-direction layout. Not device-tested. `rtlRow` styles stay.
- The web tab bar still shows the Expo template brand text ("Expo Starter", "Docs"); not part of this defect.

## R41
- `src/components/app-pressable.tsx` `AppPressable` (Pressable with `accessibilityRole` default "button", `accessibilityLabel` from `label` or the visible text via
  `src/lib/a11y-label.ts`, `accessibilityState` for disabled/selected/busy/checked, pressed opacity like TouchableOpacity). Every `TouchableOpacity` on `index`, `explore`,
  `bookings`, `messages`, `profile`, `service-board` and `shop-details-modal` is now `AppPressable` (0 TouchableOpacity/Pressable left there). Filter chips, tabs, view-mode, service,
  specialist, date, slot, profile and category pickers carry `role` (tab/radio) and `selected`; icon-only or spinner controls carry explicit `label` and `busy`;
  language toggles are named "Switch to Arabic/English" in the target language.
- Not covered: `toast.tsx` and non-pressable semantics (headings, text inputs have placeholders but no `accessibilityLabel`); not screen-reader tested.

## R46
- `profile.tsx` start-up uses `getSession()` (no network). A launch with a retryable network error and no usable session shows an offline notice instead of a silent
  sign-out look. `bookings`, `messages`, `service-board` loads also use `getSession()`. Limit: if the stored access token is expired and the refresh needs the network, supabase-js
  returns no session until it is back online; the offline notice covers that case. The booking and package actions in the shop sheet keep `getUser()` on purpose (revalidation before money).
- Consent: after `verifyOtp` the app reads its own `consents` rows and calls `rpc('record_consents', { p_purposes, p_status: 'granted', p_method: 'mobile_auth_form' })` only for
  purposes whose newest row is not granted (`src/lib/consent.ts`). No fixed `v1.0`: the server stamps the published `customer_terms` version. A consent failure no longer throws after
  sign-in; the customer is told and is asked again at the next sign-in. Direct inserts into `consents` are gone.
- R45 follow-through: the sign-in card shows "service not configured" and `handleSendCode` refuses when `isSupabaseConfigured` is false. Other screens already show their query error.

## R49
Kept `supabase/functions/send-otp` and made it configuration-only: sender (`TWILIO_WHATSAPP_SENDER`), brand (`OTP_BRAND_NAME`) and validity (`OTP_VALID_MINUTES`) have no fallback; a
missing one answers 503. The message no longer says "Beauty & Grooming", "3 minutes" or the Twilio sandbox number. Deleting was not chosen because the function is harmless behind its
service-role check and is the starting point if the owner wires a Send-SMS/WhatsApp auth hook; nothing calls it today (`config.toml` has no hook). It was not run (no Deno).

## Commands run (worktree `primora-wp-fixmobile`)
- `npm run typecheck:mobile` -> exit 0
- `npm run test:mobile` -> 27 tests, 27 pass, 0 fail (chunked-storage, return-url, locale, a11y-label, consent)
- `npm run lint --workspace=mobile_app` -> 0 errors, 14 warnings (all react-hooks set-state-in-effect / exhaustive-deps / purity warnings in code this package did not introduce; 16 before the profile and layout fixes)
- `npm run test:security-core` -> "Security core verification passed."

## Could not verify
Device behaviour (RTL, accessibility announcements, keychain language persistence, the in-app browser return), the Edge Functions under Deno, Tap accepting a custom-scheme redirect.
