import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, json, MissingConfigError, resolveCaller, serviceClient } from "../_shared/http.ts"

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
    if (!caller) return json(req, { error: "Authentication required." }, 401)
    if (caller.kind === "user") return json(req, { error: "Administrative access required." }, 403)

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

    return json(req, {
      sent,
      failed,
      deferred_quiet_hours: batch?.deferred_quiet_hours ?? 0,
      skipped: batch?.skipped ?? 0,
    })
  } catch (error) {
    if (error instanceof MissingConfigError) return json(req, { error: error.message }, 503)
    console.error("[dispatch-messages] failure", error)
    return json(req, { error: error instanceof Error ? error.message : "Unexpected dispatch error." }, 500)
  }
})
