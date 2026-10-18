import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1"
import { adminSessionAllows, bearerToken, corsHeaders, json, MissingConfigError, resolveCaller, serviceClient } from "../_shared/http.ts"
import { findRefundForRequest, parseTapRefund, type TapRefund } from "../_shared/tap-refund-status.ts"

// "Check with Tap" (D-Q9): for a refund still processing at Tap after 2 business days, fetch the refund from Tap and record
// its status. It never moves money.
//   { "refundRequestId": "<uuid>" }   finance or owner, aal2 session with a recent MFA step-up
// 1. admin_begin_tap_refund_check runs with the caller's own token: it checks the console permission, the step-up and that
//    the refund is due, records the request, and answers the Tap refund id.
// 2. GET https://api.tap.company/v2/refunds/{id} with TAP_SECRET_KEY (from the environment, never in code).
// 3. apply_tap_refund_status (service role) records Tap's answer with the administrator's id and opens a reconciliation break
//    when Tap reports a failure or a different amount.
// QA item 4: for a refund whose outcome is unknown (timeout or no answer when it was sent) the check also runs at once. With a Tap
// refund id it reads that refund; without one it lists Tap's refunds from shortly before the refund was first sent
// (POST /v2/refunds/list, a read) and looks for the one carrying this refund request id in its metadata. apply_tap_refund_lookup
// records the result: issued completes the refund, failed makes it retryable, not found changes nothing.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) })
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405)

  try {
    const caller = await resolveCaller(req)
    if (!caller) return json(req, { error: "Authentication required." }, 401)
    if (caller.kind !== "admin") return json(req, { error: "Administrative access required." }, 403)
    const token = bearerToken(req)
    if (!(await adminSessionAllows(token, "money.refund"))) {
      return json(req, { error: "Your console role cannot check refunds with Tap." }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const refundRequestId = typeof body?.refundRequestId === "string" && /^[0-9a-f-]{36}$/i.test(body.refundRequestId) ? body.refundRequestId : null
    if (!refundRequestId) return json(req, { error: "refundRequestId is required." }, 400)

    const tapSecretKey = Deno.env.get("TAP_SECRET_KEY")
    if (!tapSecretKey) return json(req, { error: "Tap is not configured (TAP_SECRET_KEY)." }, 503)

    const asCaller = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: begun, error: beginError } = await asCaller.rpc("admin_begin_tap_refund_check", { p_refund_id: refundRequestId })
    if (beginError) {
      const status = beginError.code === "42501" ? 403 : beginError.code === "P0002" ? 404 : 409
      return json(req, { error: beginError.message, hint: beginError.hint ?? null }, status)
    }

    if (begun.status === "unknown") {
      const lookup = await lookUpUnknownRefund(tapSecretKey, begun)
      if ("error" in lookup) return json(req, { error: lookup.error }, lookup.status)
      const { data: applied, error: applyError } = await serviceClient().rpc("apply_tap_refund_lookup", {
        p_refund_id: refundRequestId,
        p_actor: caller.userId,
        p_found: lookup.refund !== null,
        p_tap_refund_id: lookup.refund?.id ?? null,
        p_tap_status: lookup.refund?.status ?? null,
        p_tap_amount: lookup.refund && lookup.refund.currency === "SAR" ? lookup.refund.amount : null,
        p_tap_charge_id: lookup.refund?.chargeId ?? null,
      })
      if (applyError) {
        const status = applyError.code === "42501" ? 403 : applyError.code === "P0002" ? 404 : 409
        return json(req, { error: applyError.message }, status)
      }
      return json(req, applied)
    }

    const response = await fetch(`https://api.tap.company/v2/refunds/${encodeURIComponent(begun.gateway_refund_id)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${tapSecretKey}`, Accept: "application/json" },
    })
    const tapBody = await response.json().catch(() => null)
    const refund = parseTapRefund(tapBody)
    if (!response.ok || !refund) {
      return json(req, { error: `Tap did not return the refund (${response.status}).` }, 502)
    }

    const { data: applied, error: applyError } = await serviceClient().rpc("apply_tap_refund_status", {
      p_refund_id: refundRequestId,
      p_actor: caller.userId,
      p_tap_refund_id: refund.id,
      p_tap_status: refund.status,
      p_tap_amount: refund.currency === "SAR" ? refund.amount : null,
    })
    if (applyError) throw applyError
    return json(req, applied)
  } catch (error) {
    if (error instanceof MissingConfigError) return json(req, { error: error.message }, 503)
    console.error("[check-refund-status] failure", error)
    return json(req, { error: error instanceof Error ? error.message : "Unexpected error." }, 500)
  }
})

type Begun = { refund_request_id: string; gateway_refund_id: string | null; charge_id: string; search_from: string }
type Lookup = { refund: TapRefund | null } | { error: string; status: number }

const MAX_LIST_PAGES = 5

// Reads what Tap holds for an unknown refund. Never creates or changes anything at Tap.
async function lookUpUnknownRefund(tapSecretKey: string, begun: Begun): Promise<Lookup> {
  const headers = { Authorization: `Bearer ${tapSecretKey}`, Accept: "application/json", "Content-Type": "application/json" }
  if (begun.gateway_refund_id) {
    const response = await fetch(`https://api.tap.company/v2/refunds/${encodeURIComponent(begun.gateway_refund_id)}`, { method: "GET", headers })
    if (response.status === 404) return { refund: null }
    const refund = parseTapRefund(await response.json().catch(() => null))
    if (!response.ok || !refund) return { error: `Tap did not return the refund (${response.status}).`, status: 502 }
    return { refund }
  }
  const from = Date.parse(begun.search_from)
  let startingAfter: string | null = null
  // Every page of the window is read, so a second refund for the same request (a double refund) is noticed, not hidden.
  let match: TapRefund | null = null
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const response = await fetch("https://api.tap.company/v2/refunds/list", {
      method: "POST",
      headers,
      body: JSON.stringify({ period: { date: { from: Number.isFinite(from) ? from : Date.now() - 86_400_000, to: Date.now() } }, limit: 50,
        ...(startingAfter ? { starting_after: startingAfter } : {}) }),
    })
    const body = await response.json().catch(() => null)
    if (!response.ok || !body) return { error: `Tap did not return its refund list (${response.status}).`, status: 502 }
    const found = findRefundForRequest(body, { refundRequestId: begun.refund_request_id, chargeId: begun.charge_id })
    if (found.ambiguous || (found.match && match && found.match.id !== match.id)) {
      return { error: "Tap holds more than one refund for this request. Record what Tap shows with a second person and open a reconciliation case.", status: 409 }
    }
    match = match ?? found.match
    if (!found.hasMore || !found.lastId) break
    startingAfter = found.lastId
  }
  return { refund: match }
}
