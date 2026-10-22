// Service-owned checkout evidence. Recovery never repeats a charge submission.
export type CheckoutAttempt = {
  id: string; actor_id: string; purchase_type: string; target_id: string; amount_sar: number | string;
  currency: string; status: string; request_text: string; gateway_context: string; created_at: string;
  charge_id?: string | null; checkout_url?: string | null; reconciliation_required?: boolean;
}
type Database = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }
type Options = { db: Database; apiKey: string; gatewayContext: string; attempt: CheckoutAttempt; fetchImpl?: typeof fetch }
type Charge = Record<string, unknown> & { id?: string; status?: string; amount?: number; currency?: string; metadata?: Record<string, string>; reference?: Record<string, string>; transaction?: { url?: string } }
const TERMINAL_FAILURE = new Set(["FAILED", "DECLINED", "CANCELLED", "ABANDONED", "RESTRICTED", "VOID"])

export async function checkoutGatewayContext(apiKey: string, supabaseUrl: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${supabaseUrl}\0${apiKey}`)
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), n => n.toString(16).padStart(2, "0")).join("")
}

function validReceipt(a: CheckoutAttempt, c: Charge): boolean {
  const target = a.purchase_type === "booking" ? c.metadata?.booking_id : c.metadata?.purchase_id
  const amount = Number(c.amount)
  return typeof c.id === "string" && c.id.length > 0 && c.id.length <= 200
    && (!a.charge_id || a.charge_id === c.id)
    && c.currency === "SAR" && Number.isFinite(amount) && amount > 0 && amount === Number(a.amount_sar)
    && c.metadata?.checkout_attempt_id === a.id && c.metadata?.purchase_type === a.purchase_type
    && target === a.target_id && c.reference?.transaction === a.id && c.reference?.order === a.target_id
    && (!c.reference?.idempotent || c.reference.idempotent === a.id)
}

async function unknown(o: Options): Promise<CheckoutAttempt> {
  try {
    const r = await o.db.rpc("mark_checkout_attempt_unknown", { p_attempt_id: o.attempt.id, p_gateway_context: o.gatewayContext })
    if (!r.error && r.data) return confirmCaptured(o, r.data as CheckoutAttempt)
  } catch { /* The persisted submitting row still blocks another dispatch. */ }
  return { ...o.attempt, status: o.attempt.status === "captured" ? "captured" : "unknown" }
}

async function confirmCaptured(o: Options, a: CheckoutAttempt): Promise<CheckoutAttempt> {
  if (a.status !== "captured" || !a.charge_id) return a
  // Existing confirmation commands own business effects and conflict-refund queues. No refund is dispatched here.
  try {
    const r = a.purchase_type === "booking"
      ? await o.db.rpc("confirm_booking_payment", { target_booking_id: a.target_id, target_payment_intent_id: a.charge_id, target_total_captured: Number(a.amount_sar) })
      : a.purchase_type === "membership"
        ? await o.db.rpc("confirm_membership_payment", { p_membership_id: a.target_id, p_payment_intent_id: a.charge_id, p_amount: Number(a.amount_sar) })
        : await o.db.rpc("confirm_purchase_payment", { p_purchase_type: a.purchase_type, p_purchase_id: a.target_id, p_payment_intent_id: a.charge_id, p_amount: Number(a.amount_sar) })
    if (r.error) console.error("[checkout-recovery] capture confirmation pending", a.id)
  } catch { console.error("[checkout-recovery] capture confirmation pending", a.id) }
  return a
}

async function record(o: Options, charge: Charge): Promise<CheckoutAttempt> {
  if (!validReceipt(o.attempt, charge)) return unknown(o)
  const r = await o.db.rpc("record_checkout_attempt", { p_attempt_id: o.attempt.id, p_gateway_context: o.gatewayContext, p_charge: charge })
  if (r.error || !r.data) return unknown(o)
  return confirmCaptured(o, r.data as CheckoutAttempt)
}

async function retrieve(o: Options, id: string, signal: AbortSignal): Promise<Charge | null> {
  const response = await (o.fetchImpl ?? fetch)(`https://api.tap.company/v2/charges/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${o.apiKey}` }, signal,
  })
  if (!response.ok) return null
  return await response.json() as Charge
}

export async function dispatchCheckoutAttempt(o: Options): Promise<CheckoutAttempt> {
  // Only the database insert claimant may call this function. No retry path invokes it.
  try {
    const response = await (o.fetchImpl ?? fetch)("https://api.tap.company/v2/charges", {
      method: "POST", headers: { Authorization: `Bearer ${o.apiKey}`, "Content-Type": "application/json" },
      body: o.attempt.request_text, signal: AbortSignal.timeout(12000),
    })
    if (!response.ok) return unknown(o)
    let charge = await response.json() as Charge
    if (!charge?.id) return unknown(o)
    // Re-fetch final outcomes before treating them as proof that retry is safe or business payment was captured.
    const createStatus = String(charge.status || "").toUpperCase()
    if (TERMINAL_FAILURE.has(createStatus) || createStatus === "CAPTURED") {
      const verified = await retrieve(o, charge.id, AbortSignal.timeout(10000))
      if (!verified || verified.id !== charge.id) return unknown(o)
      charge = verified
    }
    return record(o, charge)
  } catch { return unknown(o) }
}

export async function recoverCheckoutAttempt(o: Options): Promise<CheckoutAttempt> {
  const a = o.attempt
  if (a.status === "captured") return confirmCaptured(o, a)
  if (a.status === "failed") return a
  if (a.status === "submitting" && Date.now() - Date.parse(a.created_at) < 30000) return a
  const deadline = Date.now() + 10000
  const signal = () => AbortSignal.timeout(Math.max(1, deadline - Date.now()))
  try {
    if (a.charge_id) {
      const c = await retrieve(o, a.charge_id, signal())
      if (!c || !validReceipt(a, c)) return { ...a, status: "unknown" }
      return record(o, c)
    }
    const candidates = new Set<string>()
    let cursor: string | undefined
    let complete = false
    for (let page = 0; page < 5 && Date.now() < deadline; page++) {
      const response = await (o.fetchImpl ?? fetch)("https://api.tap.company/v2/charges/list", {
        method: "POST", headers: { Authorization: `Bearer ${o.apiKey}`, "Content-Type": "application/json" }, signal: signal(),
        body: JSON.stringify({ reference: { transaction: [a.id], order: [a.target_id] }, limit: 50, ...(cursor ? { starting_after: cursor } : {}) }),
      })
      if (!response.ok) return { ...a, status: "unknown" }
      const body = await response.json()
      if (!Array.isArray(body.charges) || typeof body.has_more !== "boolean") return { ...a, status: "unknown" }
      for (const c of body.charges) {
        if (typeof c?.id !== "string" || !c.id || c.id.length > 200) return { ...a, status: "unknown" }
        candidates.add(c.id)
      }
      if (candidates.size > 1) return { ...a, status: "unknown" }
      if (!body.has_more) { complete = true; break }
      const next = body.charges.at(-1)?.id
      if (!next || next === cursor) return { ...a, status: "unknown" }
      cursor = next
    }
    // Neither an absent charge nor incomplete/multiple results is authoritative evidence of failure.
    if (!complete || candidates.size !== 1) return a.status === "submitting" ? unknown(o) : a
    const id = [...candidates][0]
    const c = await retrieve(o, id, signal())
    if (!c || c.id !== id || !validReceipt(a, c)) return { ...a, status: "unknown" }
    return record(o, c)
  } catch { return a.status === "submitting" ? unknown(o) : { ...a, status: "unknown" } }
}
