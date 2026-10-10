// GOV-FIX H-1: an Edge Function that acts with the service key decides who may call it. A console session alone is not
// enough: every console role (analyst included) is an "admin" caller, so each function names the console permission its
// action needs and the database answers for the caller's own token (admin_can). Pure module so the Node tests run it.

export type CallerKind = "service" | "admin" | "user"

// The permission each service-key function requires of a console caller.
export const FUNCTION_PERMISSIONS = {
  // Records a Commercial Registration verification on a provider or application (an onboarding change).
  "wathq-verify": "operations.write",
  // Sends queued customer messages.
  "dispatch-messages": "operations.write",
  // Delivers outgoing integration webhooks.
  "deliver-webhooks": "settings.manage",
} as const

export type GuardedFunction = keyof typeof FUNCTION_PERMISSIONS

export type ConsoleDecision = { allowed: true } | { allowed: false; status: 401 | 403; error: string }

// allowService: whether the scheduler (service key) may call the function.
// permitted: asks the database whether the caller's token holds the permission (adminSessionAllows).
export async function consoleCallerDecision(
  kind: CallerKind | null,
  allowService: boolean,
  permission: string,
  permitted: (permission: string) => Promise<boolean>,
): Promise<ConsoleDecision> {
  if (kind === null) return { allowed: false, status: 401, error: "Authentication required." }
  if (kind === "service") {
    return allowService ? { allowed: true } : { allowed: false, status: 403, error: "Administrative access required." }
  }
  if (kind !== "admin") return { allowed: false, status: 403, error: "Administrative access required." }
  return (await permitted(permission))
    ? { allowed: true }
    : { allowed: false, status: 403, error: `Your console role cannot do this (${permission} required).` }
}
