import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, json, MissingConfigError, resolveCaller, serviceClient } from "../_shared/http.ts"
import { buildRequest, classifyResponse, configuredChannels, renderNotice, senderConfig, type Notice } from "../_shared/governance-notice-delivery.ts"

// Out-of-band governance notices (SECFIX-2 R2-H4): bank account changes, break-glass, console role changes, MFA events,
// escalated reconciliation breaks. Run by the scheduler with the service key:
//   { "limit": 25 }   (optional, at most 100)
// 1. governance_notices_claim marks every pending notice of a channel with no configured sender 'undeliverable: no sender
//    configured' and claims the due notices of the configured channels.
// 2. Each claimed notice is sent through the provider named by the environment (see _shared/governance-notice-delivery.ts).
// 3. governance_notice_record_result records sent (with the provider's message id), retry (backoff) or failed.
// A notice is never recorded as sent unless the provider accepted it. The destination address is never logged or returned.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) })
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405)

  try {
    const caller = await resolveCaller(req)
    if (!caller) return json(req, { error: "Authentication required." }, 401)
    if (caller.kind !== "service") return json(req, { error: "Only the scheduler sends governance notices." }, 403)

    const body = await req.json().catch(() => ({}))
    const limit = Number.isInteger(body?.limit) ? Math.min(Math.max(body.limit, 1), 100) : 25
    const config = senderConfig((name) => Deno.env.get(name))
    const channels = configuredChannels(config)
    const db = serviceClient()

    const { data: claim, error: claimError } = await db.rpc("governance_notices_claim", { p_configured_channels: channels, p_limit: limit })
    if (claimError) throw claimError
    const notices = (claim?.claimed ?? []) as Notice[]

    const results: { id: string; status: string }[] = []
    for (const notice of notices) {
      let outcome
      try {
        const message = renderNotice(notice.template_key, notice.payload ?? {})
        const request = buildRequest(notice, config, message)
        const response = await fetch(request.url, request.init)
        const answer = await response.json().catch(() => null)
        outcome = classifyResponse(notice.channel, response.status, answer)
      } catch (error) {
        // A destination the provider cannot take fails at once; a network failure is retried.
        const text = error instanceof Error ? error.message : "Unexpected error"
        outcome = /destination is not/.test(text) ? { outcome: "failed" as const, error: text } : { outcome: "retry" as const, error: text }
      }
      const { data: recorded, error: recordError } = await db.rpc("governance_notice_record_result", {
        p_id: notice.id,
        p_outcome: outcome.outcome,
        p_error: outcome.outcome === "sent" ? null : outcome.error,
        p_provider_message_id: outcome.outcome === "sent" ? outcome.providerMessageId : null,
      })
      if (recordError) throw recordError
      results.push({ id: notice.id, status: recorded?.status ?? outcome.outcome })
    }

    return json(req, {
      configured_channels: channels,
      configuration_problems: config.problems,
      marked_undeliverable: claim?.marked_undeliverable ?? 0,
      processed: results.length,
      results,
    })
  } catch (error) {
    if (error instanceof MissingConfigError) return json(req, { error: error.message }, 503)
    console.error("[deliver-governance-notices] failure", error instanceof Error ? error.message : "unknown")
    return json(req, { error: error instanceof Error ? error.message : "Unexpected error." }, 500)
  }
})
