// Parses the WhatsApp Cloud API webhook payload into the few facts the receptionist needs. Pure; no network.
//
// Shape (https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples):
//   { object: "whatsapp_business_account", entry: [{ id, changes: [{ field: "messages", value: {
//       metadata: { display_phone_number, phone_number_id }, contacts: [...], messages: [{ from, id, timestamp, type, text: { body } }],
//       statuses: [...] } }] }] }
// The sender's number comes from the payload, which is trusted only after the HMAC signature was verified; the business a message belongs to
// is decided by the database from metadata.phone_number_id (a channel that is switched on AND verified), never from anything in the text.

export interface InboundMessage {
  phoneNumberId: string
  waId: string
  messageId: string
  type: string
  /** Text of a text message, a button reply or a list reply; null for media, location and other types. */
  body: string | null
  /** ISO timestamp from Meta's unix seconds, or null when absent or implausible. */
  sentAt: string | null
}

export interface ParsedPayload {
  messages: InboundMessage[]
  /** Delivery receipts and read receipts: acknowledged and ignored. */
  statuses: number
  /** Entries that could not be used (wrong shape, reactions, invalid ids). */
  ignored: number
}

const MAX_BODY = 4096

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function isoFromUnix(value: unknown): string | null {
  const seconds = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  const date = new Date(seconds * 1000)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function extractBody(message: Record<string, unknown>): string | null {
  const type = message.type
  if (type === "text") {
    const text = asRecord(message.text)
    return typeof text?.body === "string" ? text.body.slice(0, MAX_BODY) : null
  }
  if (type === "button") {
    const button = asRecord(message.button)
    return typeof button?.text === "string" ? button.text.slice(0, MAX_BODY) : null
  }
  if (type === "interactive") {
    const interactive = asRecord(message.interactive)
    const reply = asRecord(interactive?.button_reply) ?? asRecord(interactive?.list_reply)
    return typeof reply?.title === "string" ? reply.title.slice(0, MAX_BODY) : null
  }
  return null
}

export function parseWebhookPayload(payload: unknown): ParsedPayload {
  const out: ParsedPayload = { messages: [], statuses: 0, ignored: 0 }
  const root = asRecord(payload)
  if (!root || root.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) {
    out.ignored += 1
    return out
  }
  for (const entryValue of root.entry) {
    const entry = asRecord(entryValue)
    if (!entry || !Array.isArray(entry.changes)) { out.ignored += 1; continue }
    for (const changeValue of entry.changes) {
      const change = asRecord(changeValue)
      const value = asRecord(change?.value)
      if (!change || change.field !== "messages" || !value) { out.ignored += 1; continue }
      const metadata = asRecord(value.metadata)
      const phoneNumberId = typeof metadata?.phone_number_id === "string" ? metadata.phone_number_id : ""
      if (Array.isArray(value.statuses)) out.statuses += value.statuses.length
      if (!Array.isArray(value.messages)) continue
      for (const raw of value.messages) {
        const message = asRecord(raw)
        const waId = typeof message?.from === "string" ? message.from.replace(/^\+/, "") : ""
        const messageId = typeof message?.id === "string" ? message.id : ""
        const type = typeof message?.type === "string" ? message.type : ""
        if (!message || !/^[0-9]{5,25}$/.test(phoneNumberId) || !/^[0-9]{6,20}$/.test(waId) || messageId.length < 1 || messageId.length > 200 || !/^[a-z_]{1,30}$/.test(type)) {
          out.ignored += 1
          continue
        }
        // A reaction or a system notice is not a request: nothing to answer.
        if (type === "reaction" || type === "system" || type === "ephemeral") { out.ignored += 1; continue }
        out.messages.push({ phoneNumberId, waId, messageId, type, body: extractBody(message), sentAt: isoFromUnix(message.timestamp) })
      }
    }
  }
  return out
}
