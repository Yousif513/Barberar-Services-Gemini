// Shape of one webhook delivery attempt and how its outcome is classified. Pure module.

import { DELIVERY_NOTE_MAX_CHARS, EVENT_HEADER, EVENT_ID_HEADER, SIGNATURE_HEADER } from "./api-contract.ts"
import { buildSignatureHeader } from "./webhook-signature.ts"

export interface DeliveryRequest {
  headers: Record<string, string>
  body: string
}

// The body is serialised exactly once; the signature covers these exact characters and they are what is sent.
export async function buildDeliveryRequest(input: {
  secret: string
  eventId: string
  eventType: string
  payload: unknown
  timestamp: number
}): Promise<DeliveryRequest> {
  const body = JSON.stringify(input.payload)
  return {
    body,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Primora-Webhooks/1",
      [EVENT_HEADER]: input.eventType,
      [EVENT_ID_HEADER]: input.eventId,
      [SIGNATURE_HEADER]: await buildSignatureHeader(input.secret, body, input.timestamp),
    },
  }
}

export type DeliveryOutcome = { delivered: true; status: number; note: null } | { delivered: false; status: number | null; note: string }

// Only a 2xx answer is a delivery. A redirect is a failure: the function never follows one, because the target
// of a redirect has not been through the URL policy.
export function classifyDeliveryResponse(status: number): DeliveryOutcome {
  if (status >= 200 && status < 300) return { delivered: true, status, note: null }
  if (status >= 300 && status < 400) return { delivered: false, status, note: "Redirects are not followed" }
  return { delivered: false, status, note: `The endpoint answered ${status}` }
}

export function classifyDeliveryError(kind: "timeout" | "network" | "blocked_address" | "invalid_url" | "not_configured", detail?: string): DeliveryOutcome {
  const text: Record<string, string> = {
    timeout: "The endpoint did not answer in time",
    network: "The endpoint could not be reached",
    blocked_address: "The endpoint resolves to a non-public address",
    invalid_url: "The endpoint address is not allowed",
    not_configured: "Delivery is not configured",
  }
  return { delivered: false, status: null, note: truncateNote(detail ? `${text[kind]}: ${detail}` : text[kind]) }
}

// Notes are kept short and single-line: they are shown to the provider and must never carry an endpoint's body.
export function truncateNote(note: string, max = DELIVERY_NOTE_MAX_CHARS): string {
  const flat = note.replace(/[\r\n\t]+/g, " ").trim()
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat
}
