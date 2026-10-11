# Defects owned by fixmobile

Extracted verbatim from the three reviews in docs/reviews/ (A = D-xx, B = Rxx, C = C-Dxx). Some ids appear in two packages because the fix has a
database part and a screen part: your task says which part is yours.

### D-10 MEDIUM: mobile checkout misstates the cancellation fee and the deposit
- `mobile_app/src/components/shop-details-modal.tsx:84,135` say fees are "% of the price" (server applies them to the captured deposit); `:231-238` computes the deposit on the VAT-inclusive total (server: on the ex-VAT subtotal).
- Fix: use the web wording ("of the deposit") and `deposit = round(subtotal * pct / 100)`.

### D-20 LOW: CORS on service-role functions accepts any `*.vercel.app` and any host ending `primora.sa`
- `supabase/functions/send-notification/index.ts:11-12` (also `send-otp`, `send-push`, `process-payout`, `request-payout`, `calculate-travel`).
- Fix: use `_shared/http.ts` `corsHeaders` (exact allow-list) everywhere.

**R37 [D36] Mobile deposit estimate is wrong.** `mobile_app/src/components/shop-details-modal.tsx:236` uses `total (incl. VAT) x deposit %`; the server uses `taxable x deposit %` (`booking_create_internal` `:750-757`). 85 SAR at 20%: app 19.55, charge 17.00. Fix: `Math.round(price * pct) / 100`.

**R38 [D37] Mobile cancellation copy is wrong.** `shop-details-modal.tsx:84-85` says the late and no-show fees are "% of the price"; the server takes a percentage of the deposit (`booking.test.mjs:131`). Fix: "% of the deposit" in both languages.

**R39 [D38] Mobile payment returns to the web site.** `supabase/functions/payment-checkout/index.ts` always redirects to `${APP_URL}${redirectPath}`; the app opens the URL with `Linking.openURL` and closes (`shop-details-modal.tsx:279-280`). Fix: accept an allow-listed `returnUrl` (`mobileapp://bookings`), use `expo-web-browser` `openAuthSessionAsync`, refresh bookings on return.

**R40 [D39] Mobile language and RTL.** Six independent `useState<"en" | "ar">("ar")` (`app/index.tsx:19`, `explore.tsx:39`, `profile.tsx:47`, `messages.tsx:36`, `service-board.tsx:43`, `bookings.tsx:32`), nothing persisted, tab labels English (`components/app-tabs.tsx`), RTL by `row-reverse` (`app/index.tsx:237`) without `I18nManager` (double mirroring on an Arabic-locale Android phone; not device-tested), English placeholders in `service-board.tsx:474-569`. Fix: one provider persisted in storage, `I18nManager.allowRTL/forceRTL` with `expo-localization`, remove `rtlRow`.

**R41 [D40] Mobile has no accessibility metadata.** 129 `Pressable/TouchableOpacity`, zero `accessibilityLabel/accessibilityRole/accessibilityState`; "OK" hard-coded (`shop-details-modal.tsx:268`). Fix: shared pressable wrapper with `accessibilityRole="button"`, label and state.

**R46 [D42] Mobile start-up and consent.** `mobile_app/src/app/profile.tsx:190` uses `getUser()` (network) so an offline launch shows signed-out; `:235-241` inserts a new `terms_privacy` consent row with the fixed version `v1.0` at every sign-in and throws after sign-in when it fails (the web modal swallows the same failure, `shop/[id]/page.tsx:1000-1025`). Fix: `getSession()` first; record consent once through an RPC that stores the published `legal_agreements` version.

**R48 Residual edge case in the integrator's storage adapter.** `mobile_app/src/lib/chunked-storage.ts:34-36` splits by UTF-16 units; a split inside an emoji surrogate pair in `user_metadata` would corrupt the session on read. Fix: split on code points (`Array.from(value)`).

**R49 `send-otp` is unused and carries stale text.** `supabase/functions/send-otp/index.ts:48-57`: brand "Beauty & Grooming", "valid for 3 minutes", Twilio sandbox sender default `whatsapp:+14155238886`; no caller, no auth hook in `supabase/config.toml`. Fix: wire it as the Supabase Send-SMS hook with settings, or delete it.
