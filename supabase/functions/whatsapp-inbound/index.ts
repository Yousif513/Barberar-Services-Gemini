import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import * as adhan from "https://esm.sh/adhan@4.4.4"
import { env, MissingConfigError, serviceClient } from "../_shared/http.ts"
import { hashCustomerId, verifyMetaSignature, verifySubscription } from "../_shared/whatsapp-signature.ts"
import { parseWebhookPayload, type InboundMessage } from "../_shared/whatsapp-payload.ts"
import { makeAdhanClock } from "../_shared/whatsapp-prayer.ts"
import { riyadhYmd } from "../_shared/whatsapp-intent.ts"
import { respond, type AvailabilityPort } from "../_shared/whatsapp-engine.ts"
import { toEngineContext } from "../_shared/whatsapp-context.ts"
import { declaredLengthExceeds, readBodyLimited } from "../_shared/request-guards.ts"

// Receives WhatsApp Cloud API webhooks for the receptionist (G60). Deployed with verify_jwt = false (config.toml): Meta does not send a
// Supabase JWT, so the HMAC signature of the raw body (X-Hub-Signature-256, app secret) is the authentication. Nothing from the body is
// trusted before that check, and the business a message belongs to is decided by the database from the phone number id of a channel that is
// switched on AND verified by the platform.
//
// Required secrets: WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, WHATSAPP_CONTACT_PEPPER (keys the customer hash; never changes once set)
//   plus the SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY every function has.
// Replies are not sent from here: the decision is recorded and queued (whatsapp_record_turn -> message_queue) and dispatch-messages sends it.
const MAX_BODY_BYTES = 1024 * 1024
const clock = makeAdhanClock(adhan as never)

const reply = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

type Db = ReturnType<typeof serviceClient>

// Free times come from the same database function the shop page calls, with the same prayer windows.
function availabilityPort(db: Db): AvailabilityPort {
  return {
    async slots(query) {
      const { data, error } = await db.rpc("get_branch_available_slots", {
        target_branch_id: query.branchId,
        target_service_id: query.serviceId,
        target_date: query.ymd,
        prayer_window_starts: query.prayerWindows.starts,
        prayer_window_ends: query.prayerWindows.ends,
      })
      if (error) throw error
      return (data ?? []).map((row: { slot_start: string }) => row.slot_start)
    },
  }
}

async function processMessage(db: Db, message: InboundMessage, pepper: string): Promise<string> {
  const customerHash = await hashCustomerId(pepper, message.phoneNumberId, message.waId)
  const { data: ingest, error: ingestError } = await db.rpc("whatsapp_ingest_message", {
    p_phone_number_id: message.phoneNumberId,
    p_customer_hash: customerHash,
    p_wa_id: message.waId,
    p_wa_message_id: message.messageId,
    p_body: message.body,
    p_message_type: message.type,
    p_received_at: message.sentAt,
  })
  if (ingestError) throw ingestError
  if (!ingest?.routed) return `not routed (${ingest?.reason ?? "unknown"})`
  if (ingest.duplicate) return "duplicate"
  if (!ingest.run_engine) return "stored"

  const now = new Date()
  const { data: rawContext, error: contextError } = await db.rpc("whatsapp_provider_context", {
    p_channel_id: ingest.channel_id,
    p_from: riyadhYmd(now),
  })
  if (contextError) throw contextError

  const result = await respond(
    { text: message.body ?? "", now, state: ingest.state, previousLocale: ingest.locale === "en" ? "en" : "ar", context: toEngineContext(rawContext) },
    availabilityPort(db),
    clock,
  )
  const { data: turn, error: turnError } = await db.rpc("whatsapp_record_turn", {
    p_conversation_id: ingest.conversation_id,
    p_inbound_wa_message_id: message.messageId,
    p_state: result.state,
    p_status: result.status,
    p_intent: result.intent,
    p_locale: result.locale,
    p_reply_text: result.reply,
    p_handoff_reason: result.handoffReason,
  })
  if (turnError) throw turnError
  return turn?.enqueued ? "answered" : `no reply (${turn?.reason ?? "none"})`
}

serve(async (req) => {
  try {
    if (req.method === "GET") {
      const verdict = verifySubscription(new URL(req.url).searchParams, Deno.env.get("WHATSAPP_VERIFY_TOKEN"))
      if (!verdict.ok) return reply({ error: "Verification failed." }, verdict.reason === "missing_token" ? 503 : 403)
      return new Response(verdict.challenge, { status: 200, headers: { "Content-Type": "text/plain" } })
    }
    if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405)

    // Refuse an oversized body before reading it: the declared length first, then the bytes actually received (chunked uploads declare none).
    if (declaredLengthExceeds(req.headers.get("Content-Length"), MAX_BODY_BYTES)) return reply({ error: "Payload too large." }, 413)
    const raw = await readBodyLimited(req.body, MAX_BODY_BYTES)
    if (raw === null) return reply({ error: "Payload too large." }, 413)
    const signature = await verifyMetaSignature({
      appSecret: Deno.env.get("WHATSAPP_APP_SECRET"),
      rawBody: raw,
      header: req.headers.get("X-Hub-Signature-256"),
    })
    if (!signature.ok) {
      // Never log the body of an unauthenticated request.
      console.error("[whatsapp-inbound] signature refused:", signature.reason)
      return reply({ error: "Invalid signature." }, signature.reason === "missing_secret" ? 503 : 401)
    }

    let payload: unknown
    try {
      payload = JSON.parse(new TextDecoder().decode(raw))
    } catch {
      return reply({ error: "Invalid JSON." }, 400)
    }
    const parsed = parseWebhookPayload(payload)
    if (parsed.messages.length === 0) return reply({ received: true, messages: 0, statuses: parsed.statuses })

    const pepper = env("WHATSAPP_CONTACT_PEPPER")
    const db = serviceClient()
    const outcomes: string[] = []
    for (const message of parsed.messages) {
      outcomes.push(await processMessage(db, message, pepper))
    }
    return reply({ received: true, messages: parsed.messages.length, outcomes })
  } catch (error) {
    if (error instanceof MissingConfigError) return reply({ error: error.message }, 503)
    // A failure answers 500 so Meta redelivers; ingest is idempotent on the message id, so a retry never doubles anything.
    console.error("[whatsapp-inbound] failure", error instanceof Error ? error.message : "unknown error")
    return reply({ error: "Unexpected error." }, 500)
  }
})
