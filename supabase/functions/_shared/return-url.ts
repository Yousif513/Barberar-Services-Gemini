// The only addresses payment-checkout will send a customer back to besides the web site: screens of the mobile app.
// Pure and free of Deno globals so a node test can import it. The scheme comes from mobile_app/app.json ("mobileapp").
export const APP_RETURN_SCHEME = "mobileapp"
export const APP_RETURN_ROUTES = ["bookings", "profile", "explore", "messages"] as const

const ALLOWED = new Set<string>(APP_RETURN_ROUTES.map((route) => `${APP_RETURN_SCHEME}://${route}`))

/** Returns the return address when it is exactly one of the app's own screens, otherwise null (never an open redirect). */
export function allowedAppReturnUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  return ALLOWED.has(value) ? value : null
}

/**
 * The address the payment provider redirects to. With no (or a refused) returnUrl this is the web default
 * `${appUrl}${redirectPath}`; with an allow-listed app address it is that address carrying the query of redirectPath
 * (`/customer/bookings?payment=<id>` becomes `mobileapp://bookings?payment=<id>`).
 */
export function buildRedirectUrl(appUrl: string, redirectPath: string, returnUrl: unknown): string {
  const appReturn = allowedAppReturnUrl(returnUrl)
  if (!appReturn) return `${appUrl}${redirectPath}`
  const queryStart = redirectPath.indexOf("?")
  return queryStart === -1 ? appReturn : `${appReturn}${redirectPath.slice(queryStart)}`
}
