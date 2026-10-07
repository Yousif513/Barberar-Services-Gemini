import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { MissingConfigError, resolveCaller, serviceClient } from "../_shared/http.ts"
import { DELIVERY_TIMEOUT_MS } from "../_shared/api-contract.ts"
import { buildDeliveryRequest, classifyDeliveryError, classifyDeliveryResponse } from "../_shared/webhook-delivery.ts"
import type { DeliveryOutcome } from "../_shared/webhook-delivery.ts"
import { isWebhookSecret } from "../_shared/webhook-signature.ts"
import { checkResolvedAddresses, validateWebhookUrl } from "../_shared/webhook-url.ts"

// Sends the booking webhooks queued in webhook_deliveries (G69). Run it on a schedule with the service key, or by an
// administrator. The queue, the retry back-off, the attempt limit and the automatic disabling of a failing endpoint
// are decided by the database (webhook_claim_deliveries / webhook_record_attempt); this function only performs the
// HTTP request and reports what happened.
//
//   POST {}   claims due deliveries (at most BATCH), sends them, records each outcome
//
// Authentication is checked here and not delegated to verify_jwt: only the service-role key or an administrator's
// session may call it. No CORS headers are sent, a browser has no business here.
//
// Outbound safety, per attempt: the address is re-validated (https, port 443, no IP literal, no local name), the
// host is resolved and refused when ANY answer is not a public address (where the runtime can resolve), redirects are
// never followed, the endpoint's answer is never stored, and the signing secret is only used to sign.
// Limit: fetch resolves the name again when it connects, so a hostile DNS server (rebinding) is narrowed, not
// excluded. Run this function where outbound traffic to private ranges is blocked by the network.
const BATCH = 20
const PARALLEL = 5

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } })
}

async function resolveAll(hostname: string): Promise<string[] | null> {
  // null: this runtime cannot resolve names, so only the static address policy applies.
  if (typeof (Deno as { resolveDns?: unknown }).resolveDns !== "function") return null
  const answers: string[] = []
  for (const type of ["A", "AAAA"] as const) {
    try {
      answers.push(...(await Deno.resolveDns(hostname, type)))
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error
    }
  }
  return answers
}

interface Claimed {
  delivery_id: string
  event_id: string
  event_type: string
  payload: unknown
  attempt_count: number
  target_url: string
  signing_secret: string
}

async function attempt(item: Claimed): Promise<DeliveryOutcome> {
  const url = validateWebhookUrl(item.target_url)
  if (!url.ok) return classifyDeliveryError("invalid_url", url.reason)
  if (!isWebhookSecret(item.signing_secret)) return classifyDeliveryError("not_configured")
  try {
    const addresses = await resolveAll(url.hostname)
    if (addresses !== null) {
      const check = checkResolvedAddresses(addresses)
      if (!check.ok) return classifyDeliveryError("blocked_address", check.offending)
    }
  } catch {
    return classifyDeliveryError("network")
  }
  const request = await buildDeliveryRequest({
    secret: item.signing_secret,
    eventId: item.event_id,
    eventType: item.event_type,
    payload: item.payload,
    timestamp: Math.floor(Date.now() / 1000),
  })
  try {
    const response = await fetch(url.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      redirect: "manual",
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    })
    await response.body?.cancel()
    return classifyDeliveryResponse(response.status)
  } catch (error) {
    return classifyDeliveryError(error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "network")
  }
}

serve(async (req) => {
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405)
  try {
    const caller = await resolveCaller(req)
    if (!caller) return reply({ error: "Authentication required." }, 401)
    if (caller.kind !== "service" && caller.kind !== "admin") return reply({ error: "Administrative access required." }, 403)

    const db = serviceClient()
    const settings = await db.rpc("webhook_delivery_settings")
    if (settings.error) throw settings.error
    if (!settings.data?.enabled) {
      return reply({
        enabled: false,
        processed: 0,
        message: "Webhook delivery is switched off: api.webhook_max_attempts and api.webhook_retry_base_seconds are not set.",
      })
    }

    const claimed = await db.rpc("webhook_claim_deliveries", { p_limit: BATCH })
    if (claimed.error) throw claimed.error
    const queue = (claimed.data ?? []) as Claimed[]
    let delivered = 0
    let failed = 0
    for (let i = 0; i < queue.length; i += PARALLEL) {
      await Promise.all(
        queue.slice(i, i + PARALLEL).map(async (item) => {
          const outcome = await attempt(item)
          const recorded = await db.rpc("webhook_record_attempt", {
            p_delivery_id: item.delivery_id,
            p_attempt: item.attempt_count + 1,
            p_delivered: outcome.delivered,
            p_status_code: outcome.status,
            p_note: outcome.note,
          })
          if (recorded.error) console.error("[deliver-webhooks] record failed", recorded.error.code)
          if (outcome.delivered) delivered += 1
          else failed += 1
        }),
      )
    }
    return reply({ enabled: true, processed: queue.length, delivered, failed })
  } catch (error) {
    if (error instanceof MissingConfigError) return reply({ error: error.message }, 503)
    console.error("[deliver-webhooks] failure", error instanceof Error ? error.name : "unknown")
    return reply({ error: "Webhook delivery failed." }, 500)
  }
})
