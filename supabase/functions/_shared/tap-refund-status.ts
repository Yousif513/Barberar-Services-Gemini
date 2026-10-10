// Pure helpers for Tap refunds and reconciliation imports (no Deno API), shared by the Edge Functions and the node tests.
// Tap API: GET https://api.tap.company/v2/refunds/{refund_id} answers a refund object with id, status, amount, currency,
// charge_id and response {code, message} (developers.tap.company/reference/retrieve-a-refund, read 2026-10-10).

export type RefundState = "succeeded" | "processing" | "failed" | "unknown"

const SUCCEEDED = new Set(["REFUNDED", "SUCCESS", "SUCCEEDED", "CAPTURED"])
const PROCESSING = new Set(["PENDING", "IN_PROGRESS", "INITIATED", "PROCESSING"])
const FAILED = new Set(["FAILED", "DECLINED", "CANCELLED", "CANCELED", "REJECTED", "VOID", "ABANDONED", "TIMEDOUT", "RESTRICTED"])

// The same table as public.tap_refund_state in the database.
export function tapRefundState(status: unknown): RefundState {
  const value = typeof status === "string" ? status.trim().toUpperCase() : ""
  if (SUCCEEDED.has(value)) return "succeeded"
  if (PROCESSING.has(value)) return "processing"
  if (FAILED.has(value)) return "failed"
  return "unknown"
}

export type TapRefund = { id: string; status: string; state: RefundState; amount: number | null; currency: string | null; chargeId: string | null }

// Reads only the fields PRIMORA records from Tap's refund object; anything else (card details, customer data) is dropped.
export function parseTapRefund(body: unknown): TapRefund | null {
  if (!body || typeof body !== "object") return null
  const record = body as Record<string, unknown>
  const id = typeof record.id === "string" ? record.id.trim() : ""
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(id)) return null
  const status = typeof record.status === "string" ? record.status.trim().toUpperCase().slice(0, 40) : ""
  const amount = typeof record.amount === "number" && Number.isFinite(record.amount)
    ? Math.round(record.amount * 100) / 100
    : typeof record.amount === "string" && /^\d+(\.\d{1,3})?$/.test(record.amount) ? Math.round(Number(record.amount) * 100) / 100 : null
  const currency = typeof record.currency === "string" ? record.currency.trim().toUpperCase().slice(0, 3) : null
  const chargeId = typeof record.charge_id === "string" ? record.charge_id.trim().slice(0, 128) : null
  return { id, status, state: tapRefundState(status), amount, currency, chargeId }
}

// The Riyadh calendar day (YYYY-MM-DD) of a moment.
export function riyadhDay(at: Date): string {
  return new Date(at.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// Whole business days after `from` up to `to` (Saudi weekend: Friday and Saturday), the same count as
// public.saudi_business_days_between.
export function saudiBusinessDaysBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0
  let count = 0
  const start = new Date(`${riyadhDay(from)}T00:00:00Z`)
  const end = new Date(`${riyadhDay(to)}T00:00:00Z`)
  for (let day = new Date(start.getTime() + 86400000); day.getTime() <= end.getTime(); day = new Date(day.getTime() + 86400000)) {
    const weekday = day.getUTCDay() // 5 Friday, 6 Saturday
    if (weekday !== 5 && weekday !== 6) count += 1
  }
  return count
}

export type ReconciliationEvent = {
  object_type: "charge" | "refund"
  tap_object_id: string
  charge_id: string | null
  amount: string
  currency: string
  status: string
  occurred_at: string | null
}

const createdAt = (item: Record<string, unknown>): string | null => {
  const transaction = item.transaction as Record<string, unknown> | undefined
  const raw = transaction?.created ?? item.created
  const ms = typeof raw === "number" ? raw : typeof raw === "string" && /^\d{10,13}$/.test(raw) ? Number(raw) : NaN
  if (!Number.isFinite(ms)) return null
  return new Date(ms < 1e12 ? ms * 1000 : ms).toISOString()
}

// Turns Tap list items into the rows record_tap_reconciliation_import stores: SAR only, two decimals, id and status only.
export function toReconciliationEvents(type: "charge" | "refund", items: unknown[]): ReconciliationEvent[] {
  const events: ReconciliationEvent[] = []
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue
    const item = raw as Record<string, unknown>
    const id = typeof item.id === "string" ? item.id.trim() : ""
    const currency = typeof item.currency === "string" ? item.currency.trim().toUpperCase() : ""
    const amount = typeof item.amount === "number" ? item.amount : typeof item.amount === "string" ? Number(item.amount) : NaN
    if (!/^[A-Za-z0-9_-]{3,128}$/.test(id) || currency !== "SAR" || !Number.isFinite(amount)) continue
    events.push({
      object_type: type,
      tap_object_id: id,
      charge_id: type === "refund" && typeof item.charge_id === "string" ? item.charge_id.trim() : null,
      amount: (Math.round(amount * 100) / 100).toFixed(2),
      currency: "SAR",
      status: typeof item.status === "string" ? item.status.trim().toUpperCase().slice(0, 40) : "RECORDED",
      occurred_at: createdAt(item),
    })
  }
  return events
}
