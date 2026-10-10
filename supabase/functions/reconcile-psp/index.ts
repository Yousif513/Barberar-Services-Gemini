import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, json, MissingConfigError, resolveCaller, serviceClient, adminSessionAllows, bearerToken } from "../_shared/http.ts"

// Daily PSP reconciliation: totals the captured charges and refunds Tap reports for a Riyadh
// calendar day and asks the database to compare them with the ledger (run_daily_psp_reconciliation).
//   { "date": "2026-10-04" }   admin or scheduler
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000

async function listAll(apiKey: string, path: "charges" | "refunds", from: number, to: number) {
  const items: Record<string, unknown>[] = []
  let startingAfter: string | undefined
  for (let page = 0; page < 40; page += 1) {
    const response = await fetch(`https://api.tap.company/v2/${path}/list`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ period: { date: { from, to }, type: 1 }, limit: 50, ...(startingAfter ? { starting_after: startingAfter } : {}) }),
    })
    if (!response.ok) throw new Error(`Tap ${path} list failed (${response.status}): ${(await response.text()).slice(0, 300)}`)
    const body = await response.json()
    const batch = (body?.[path] ?? []) as Record<string, unknown>[]
    items.push(...batch)
    if (!body?.has_more || batch.length === 0) break
    startingAfter = String(batch[batch.length - 1]?.id)
  }
  return items
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) })
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405)

  try {
    const caller = await resolveCaller(req)
    if (!caller) return json(req, { error: "Authentication required." }, 401)
    if (caller.kind === "user") return json(req, { error: "Administrative access required." }, 403)
    // D-Q5: reconciliation is a money action; operations and analyst hold no money permission.
    if (caller.kind === "admin" && !(await adminSessionAllows(bearerToken(req), "money.ledger"))) {
      return json(req, { error: "Your console role cannot run reconciliation." }, 403)
    }

    const apiKey = Deno.env.get("TAP_SECRET_KEY")
    if (!apiKey) return json(req, { error: "Tap is not configured (TAP_SECRET_KEY)." }, 503)

    const body = await req.json().catch(() => ({}))
    const date = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : new Date(Date.now() + RIYADH_OFFSET_MS - 86400000).toISOString().slice(0, 10)
    const from = Date.parse(`${date}T00:00:00Z`) - RIYADH_OFFSET_MS
    const to = from + 86400000 - 1

    const charges = (await listAll(apiKey, "charges", from, to))
      .filter((c) => String(c.status).toUpperCase() === "CAPTURED" && String(c.currency).toUpperCase() === "SAR")
    const refunds = (await listAll(apiKey, "refunds", from, to))
      .filter((r) => ["REFUNDED", "SUCCESS"].includes(String(r.status).toUpperCase()) && String(r.currency).toUpperCase() === "SAR")

    const captured = Math.round(charges.reduce((sum, c) => sum + Number(c.amount || 0), 0) * 100) / 100
    const refunded = Math.round(refunds.reduce((sum, r) => sum + Number(r.amount || 0), 0) * 100) / 100

    const { data, error } = await serviceClient().rpc("run_daily_psp_reconciliation", {
      p_date: date, p_psp_captured: captured, p_psp_refunded: refunded, p_psp_count: charges.length,
    })
    if (error) throw error
    return json(req, data)
  } catch (error) {
    if (error instanceof MissingConfigError) return json(req, { error: error.message }, 503)
    console.error("[reconcile-psp] failure", error)
    return json(req, { error: error instanceof Error ? error.message : "Unexpected reconciliation error." }, 500)
  }
})
