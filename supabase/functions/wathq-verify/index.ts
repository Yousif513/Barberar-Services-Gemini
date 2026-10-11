import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { adminSessionAllows, bearerToken, corsHeaders, json, MissingConfigError, resolveCaller, serviceClient } from "../_shared/http.ts"
import { consoleCallerDecision, FUNCTION_PERMISSIONS } from "../_shared/console-permission.ts"

// Verifies a provider's Commercial Registration with the Ministry of Commerce Wathq API and
// records the result (record_wathq_cr_verification). Admin only.
//   { "providerId": "<uuid>", "crNumber": "1010123456" }   (an approved provider)
//   { "applicationId": "<uuid>", "crNumber": "1010123456" } (an application waiting for approval)
// Secrets: WATHQ_API_KEY. Optional WATHQ_CR_API_BASE (default https://api.wathq.sa/v5/commercialregistration;
// set it to the base URL of the API version on your Wathq subscription).
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) })
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405)

  try {
    const caller = await resolveCaller(req)
    // GOV-FIX H-1: a console session is not enough; recording a CR verification needs operations.write.
    const decision = await consoleCallerDecision(caller?.kind ?? null, false, FUNCTION_PERMISSIONS["wathq-verify"],
      (permission) => adminSessionAllows(bearerToken(req), permission))
    if (!decision.allowed) return json(req, { error: decision.error }, decision.status)

    const apiKey = Deno.env.get("WATHQ_API_KEY")
    if (!apiKey) return json(req, { error: "Wathq is not configured (WATHQ_API_KEY). Use a manual admin review instead." }, 503)
    const base = (Deno.env.get("WATHQ_CR_API_BASE") || "https://api.wathq.sa/v5/commercialregistration").replace(/\/$/, "")

    const body = await req.json().catch(() => ({}))
    const providerId = String(body?.providerId || "")
    const applicationId = String(body?.applicationId || "")
    const crNumber = String(body?.crNumber || "").trim()
    if (!providerId && !applicationId) return json(req, { error: "providerId or applicationId is required." }, 400)
    if (providerId && applicationId) return json(req, { error: "Send either providerId or applicationId, not both." }, 400)
    if (!/^[0-9]{10}$/.test(crNumber)) return json(req, { error: "Commercial Registration number must be 10 digits." }, 400)

    // The database decides the outcome (verified / name_mismatch / rejected) by comparing the registered
    // name with the names on the provider or application. This function only relays Wathq's answer.
    const record = async (isActive: boolean, payload: Record<string, unknown>) => {
      const registeredName = payload?.crName ?? payload?.name ?? null
      const wathqPayload = { ...payload, crName: registeredName }
      const { data, error } = applicationId
        ? await serviceClient().rpc("record_wathq_application_check", {
            p_application_id: applicationId, p_cr_number: crNumber, p_is_active: isActive, p_wathq_payload: wathqPayload,
          })
        : await serviceClient().rpc("record_wathq_cr_verification", {
            p_provider_id: providerId, p_cr_number: crNumber, p_is_active: isActive, p_wathq_payload: wathqPayload,
          })
      if (error) throw error
      return data as { status: string; name_match?: boolean; registered_name?: string | null }
    }

    const response = await fetch(`${base}/info/${crNumber}`, { headers: { apiKey, Accept: "application/json" } })
    const payload = await response.json().catch(() => ({}))

    if (response.status === 404) {
      await record(false, payload)
      return json(req, { status: "rejected", reason: "Commercial Registration not found in Wathq." })
    }
    if (!response.ok) {
      return json(req, { error: `Wathq returned ${response.status}`, details: payload }, 502)
    }

    // Wathq reports the registration status as { id, name }; only an explicitly active
    // registration counts as verified. Anything unrecognised is left for manual review.
    const statusId = payload?.status?.id
    const statusName = String(payload?.status?.name ?? payload?.status ?? "").toLowerCase()
    const isActive = statusId === 1 || /active|نشط|قائم/.test(statusName)
    const isInactive = /expired|cancel|suspend|deleted|منته|ملغ|موقوف|مشطوب/.test(statusName)
    if (!isActive && !isInactive) {
      return json(req, { error: "Unrecognised Wathq status; review the CR certificate manually.", details: payload?.status }, 502)
    }

    const result = await record(isActive, payload)
    // status: verified | name_mismatch (an administrator confirms it with admin_confirm_application_cr) | rejected
    return json(req, { status: result.status, nameMatch: result.name_match ?? null, crName: result.registered_name ?? payload?.crName ?? payload?.name ?? null })
  } catch (error) {
    if (error instanceof MissingConfigError) return json(req, { error: error.message }, 503)
    console.error("[wathq-verify] failure", error)
    return json(req, { error: error instanceof Error ? error.message : "Unexpected Wathq error." }, 500)
  }
})
