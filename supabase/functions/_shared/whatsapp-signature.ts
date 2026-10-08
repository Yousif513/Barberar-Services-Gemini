// Meta webhook authenticity for the WhatsApp Cloud API. Pure (Web Crypto only), so a node test imports it directly.
//
// Meta signs the RAW request body with the app secret (HMAC-SHA256) and sends it as `X-Hub-Signature-256: sha256=<hex>`.
// The comparison is constant time. The verification of the subscription (GET hub.challenge) uses a separate verify token.
import { timingSafeEqualText } from "./webhook-signature.ts"

const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** HMAC-SHA256 over the exact bytes of the body (a string is encoded as UTF-8), as lower-case hex. */
export async function hmacSha256HexBytes(secret: string, body: Uint8Array | string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const data = typeof body === "string" ? encoder.encode(body) : body
  return toHex(await crypto.subtle.sign("HMAC", key, data as BufferSource))
}

/** The hex digest of a well-formed `sha256=<64 hex>` header, lower-cased; null for anything else. */
export function parseMetaSignatureHeader(header: string | null | undefined): string | null {
  if (typeof header !== "string") return null
  const match = /^sha256=([0-9a-fA-F]{64})$/.exec(header.trim())
  return match ? match[1].toLowerCase() : null
}

export type MetaSignatureResult =
  | { ok: true }
  | { ok: false; reason: "missing_secret" | "missing_header" | "malformed" | "mismatch" }

export async function verifyMetaSignature(input: {
  appSecret: string | null | undefined
  rawBody: Uint8Array | string
  header: string | null | undefined
}): Promise<MetaSignatureResult> {
  // Without a configured secret nothing is accepted: an unsigned deployment must not process customer messages.
  if (!input.appSecret) return { ok: false, reason: "missing_secret" }
  if (input.header === null || input.header === undefined || input.header === "") return { ok: false, reason: "missing_header" }
  const claimed = parseMetaSignatureHeader(input.header)
  if (!claimed) return { ok: false, reason: "malformed" }
  const expected = await hmacSha256HexBytes(input.appSecret, input.rawBody)
  return timingSafeEqualText(claimed, expected) ? { ok: true } : { ok: false, reason: "mismatch" }
}

/**
 * Subscription verification: Meta calls GET with hub.mode=subscribe, hub.verify_token and hub.challenge. The challenge is echoed only when
 * the token matches the configured one (constant time).
 */
export function verifySubscription(
  query: { get(name: string): string | null },
  verifyToken: string | null | undefined,
): { ok: true; challenge: string } | { ok: false; reason: "missing_token" | "wrong_mode" | "wrong_token" | "missing_challenge" } {
  if (!verifyToken) return { ok: false, reason: "missing_token" }
  if (query.get("hub.mode") !== "subscribe") return { ok: false, reason: "wrong_mode" }
  const supplied = query.get("hub.verify_token") ?? ""
  if (!timingSafeEqualText(supplied, verifyToken)) return { ok: false, reason: "wrong_token" }
  const challenge = query.get("hub.challenge")
  if (!challenge) return { ok: false, reason: "missing_challenge" }
  return { ok: true, challenge }
}

/**
 * The keyed hash that identifies a customer inside one channel: HMAC-SHA256(pepper, `${channelKey}:${waId}`) as hex. The pepper is a secret
 * held only by the Edge Function, so the stored hash cannot be reversed by hashing a list of phone numbers.
 */
export async function hashCustomerId(pepper: string, channelKey: string, waId: string): Promise<string> {
  if (!pepper) throw new Error("A hashing pepper is required")
  return hmacSha256HexBytes(pepper, `${channelKey}:${waId}`)
}
