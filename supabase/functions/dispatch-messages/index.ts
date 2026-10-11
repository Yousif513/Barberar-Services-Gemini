import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { adminSessionAllows, bearerToken, corsHeaders, json, MissingConfigError, resolveCaller, serviceClient } from "../_shared/http.ts"
import { consoleCallerDecision, FUNCTION_PERMISSIONS } from "../_shared/console-permission.ts"
import { buildTextBody, extractMessageId } from "../_shared/whatsapp-send.ts"

// Sends queued WhatsApp messages through the WhatsApp Cloud API.
// The database (claim_message_batch) applies phone verification, consent and quiet hours and
// renders each approved template; this function only sends and reports the real outcome via
// complete_message_delivery. A message is marked sent only with the API's message id.
//
// Required secrets: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID
// Optional: WHATSAPP_API_VERSION (default v21.0)
// Each template in public.message_templates must exist and be approved in WhatsApp Manager under
// provider_template_name (default "primora_<name>") with the same body parameter order.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) })
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405)

  try {
    const caller = await resolveCaller(req)
    // GOV-FIX H-1: the scheduler (service key) or a console session holding operations.write; not every console role.
    const decision = await consoleCallerDecision(caller?.kind ?? null, true, FUNCTION_PERMISSIONS["dispatch-messages"],
      (permission) => adminSessionAllows(bearerToken(req), permission))
    if (!decision.allowed) return json(req, { error: decision.error }, decision.status)

    const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN")
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")
    if (!token || !phoneNumberId) {
      // Nothing is claimed, so queued messages stay pending until the integration is configured.
      return json(req, { error: "WhatsApp is not configured (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID).", sent: 0 }, 503)
    }
    const version = Deno.env.get("WHATSAPP_API_VERSION") || "v21.0"
    const body = await req.json().catch(() => ({}))
    const batchSize = Math.min(Math.max(Number(body?.batchSize) || 25, 1), 100)

    const db = serviceClient()
    const { data: batch, error } = await db.rpc("claim_message_batch", { p_batch_size: batchSize })
    if (error) throw error

    let sent = 0
    let failed = 0
    for (const message of batch?.messages ?? []) {
      let externalId: string | null = null
      let failure: string | null = null
      try {
        const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: String(message.to).replace(/^\+/, ""),
            type: "template",
            template: {
              name: message.template,
              language: { code: message.language },
              components: message.body_params?.length
                ? [{ type: "body", parameters: message.body_params.map((text: string) => ({ type: "text", text: String(text) })) }]
                : [],
            },
          }),
        })
        const result = await response.json().catch(() => ({}))
        externalId = result?.messages?.[0]?.id ?? null
        if (!response.ok || !externalId) {
          failure = `WhatsApp API ${response.status}: ${JSON.stringify(result?.error ?? result).slice(0, 500)}`
          externalId = null
        }
      } catch (sendError) {
        failure = sendError instanceof Error ? sendError.message : "WhatsApp request failed"
      }

      const { error: completeError } = await db.rpc("complete_message_delivery", {
        p_queue_id: message.queue_id,
        p_succeeded: !failure,
        p_external_id: externalId,
        p_error: failure,
        p_rendered_body: message.rendered_body,
      })
      if (completeError) throw completeError
      if (failure) failed += 1
      else sent += 1
    }

    // Free-form replies of the WhatsApp receptionist (G60). The database hands over only replies that are still allowed: it re-checks the
    // customer's opt-out and the reply window at this moment, and each reply is sent from the phone number of the provider's own channel.
    let sessionSent = 0
    let sessionFailed = 0
    const { data: session, error: sessionError } = await db.rpc("claim_whatsapp_session_batch", { p_batch_size: batchSize })
    if (sessionError) throw sessionError
    for (const message of session?.messages ?? []) {
      let sessionExternalId: string | null = null
      let sessionFailure: string | null = null
      try {
        const response = await fetch(`https://graph.facebook.com/${version}/${message.phone_number_id}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(buildTextBody({ to: message.to, text: message.text })),
        })
        const result = await response.json().catch(() => ({}))
        sessionExternalId = extractMessageId(result)
        if (!response.ok || !sessionExternalId) {
          sessionFailure = `WhatsApp API ${response.status}: ${String(result?.error?.code ?? "")} ${String(result?.error?.message ?? "").slice(0, 300)}`.trim()
          sessionExternalId = null
        }
      } catch (sendError) {
        sessionFailure = sendError instanceof Error ? sendError.message : "WhatsApp request failed"
      }
      const { error: sessionCompleteError } = await db.rpc("complete_whatsapp_session_delivery", {
        p_queue_id: message.queue_id,
        p_succeeded: !sessionFailure,
        p_external_id: sessionExternalId,
        p_error: sessionFailure,
      })
      if (sessionCompleteError) throw sessionCompleteError
      if (sessionFailure) sessionFailed += 1
      else sessionSent += 1
    }

    // Retention: does nothing while whatsapp.message_retention_days is unset.
    const { error: purgeError } = await db.rpc("whatsapp_purge_expired_messages")
    if (purgeError) console.error("[dispatch-messages] whatsapp purge failed", purgeError.message)

    return json(req, {
      sent,
      failed,
      deferred_quiet_hours: batch?.deferred_quiet_hours ?? 0,
      skipped: batch?.skipped ?? 0,
      whatsapp_replies_sent: sessionSent,
      whatsapp_replies_failed: sessionFailed,
      whatsapp_replies_skipped: session?.skipped ?? 0,
    })
  } catch (error) {
    if (error instanceof MissingConfigError) return json(req, { error: error.message }, 503)
    console.error("[dispatch-messages] failure", error)
    return json(req, { error: error instanceof Error ? error.message : "Unexpected dispatch error." }, 500)
  }
})
