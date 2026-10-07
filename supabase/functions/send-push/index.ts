// supabase/functions/send-push/index.ts
// Deno Edge Function that delivers the push queue through the Expo Push API.
// The database owns what is sent: claim_push_batch hands out queued notifications together with the user's active tokens,
// and complete_push_delivery records the outcome (and deactivates tokens that Expo reports as dead).
// Called by the scheduler with the service role key:  POST { "limit": 50 }  (limit optional, 1 to 200).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { MissingConfigError, serviceClient } from "../_shared/http.ts"
import { corsHeaders as sharedCorsHeaders } from "../_shared/http.ts"

type ClaimedPush = {
  queue_id: string
  user_id: string
  title_en: string
  title_ar: string
  body_en: string
  body_ar: string
  data: Record<string, unknown> | null
  tokens: string[]
}

type ExpoTicket = { status: "ok" | "error"; message?: string; details?: { error?: string } }

serve(async (req) => {
  const corsHeaders = sharedCorsHeaders(req)
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const authorization = req.headers.get("Authorization")
    if (!serviceKey || authorization !== `Bearer ${serviceKey}`) {
      return reply({ error: "Unauthorized." }, 401)
    }

    const requested = Number((await req.json().catch(() => ({})))?.limit ?? 50)
    const limit = Number.isInteger(requested) ? requested : 50

    const db = serviceClient()
    const { data: claimed, error: claimError } = await db.rpc("claim_push_batch", { p_limit: limit })
    if (claimError) throw claimError
    const batch = (claimed ?? []) as ClaimedPush[]

    let sent = 0
    let failed = 0
    for (const item of batch) {
      // Only tokens the database returned are used. A user without an active token is reported as failed, not retried forever.
      const tokens = (item.tokens ?? []).filter((token) => typeof token === "string" && token.length > 0)
      if (tokens.length === 0) {
        await db.rpc("complete_push_delivery", { p_queue_id: item.queue_id, p_ok: false, p_error: "No active push token for the user.", p_invalid_tokens: [] })
        failed += 1
        continue
      }

      let ok = false
      let errorText: string | null = null
      const invalidTokens: string[] = []
      try {
        // Users have no stored language preference, so the notification carries both languages.
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(tokens.map((token) => ({
            to: token,
            sound: "default",
            title: `${item.title_ar} | ${item.title_en}`,
            body: `${item.body_ar}\n${item.body_en}`,
            data: item.data ?? {},
          }))),
        })
        if (!response.ok) {
          errorText = `Expo answered ${response.status}: ${(await response.text()).slice(0, 300)}`
        } else {
          const tickets = ((await response.json()).data ?? []) as ExpoTicket[]
          tickets.forEach((ticket, index) => {
            if (ticket.status === "ok") {
              ok = true
            } else {
              errorText = ticket.message ?? ticket.details?.error ?? "Expo rejected the notification."
              if (ticket.details?.error === "DeviceNotRegistered") invalidTokens.push(tokens[index])
            }
          })
        }
      } catch (sendError) {
        errorText = sendError instanceof Error ? sendError.message : "The push request failed."
      }

      const { error: completeError } = await db.rpc("complete_push_delivery", {
        p_queue_id: item.queue_id, p_ok: ok, p_error: ok ? null : errorText, p_invalid_tokens: invalidTokens,
      })
      if (completeError) throw completeError
      if (ok) sent += 1
      else failed += 1
    }

    return reply({ success: true, claimed: batch.length, sent, failed })
  } catch (error) {
    if (error instanceof MissingConfigError) return reply({ error: error.message }, 503)
    const message = error instanceof Error ? error.message : "Unexpected push notification error."
    console.error("[Push Engine] Exception occurred:", message)
    return reply({ error: message }, 500)
  }
})
