// Webhook signing and verification. Pure module (Web Crypto only, available in Deno and Node).
//
// The signature header is  X-Primora-Signature: t=<unix seconds>,v1=<hex>
// where v1 = HMAC-SHA256(secret, `${t}.${body}`) over the exact request body bytes as text. The key is the signing
// secret string exactly as shown once in the console (including its "whsec_" prefix). During a secret rotation a
// header may carry more than one v1 value; a receiver accepts the event when any of them matches.
//
// Receiver snippet (Node):
//
//   import { createHmac, timingSafeEqual } from "node:crypto";
//   function verify(secret, header, rawBody, toleranceSeconds = 300) {
//     const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));   // { t, v1 }
//     if (Math.abs(Date.now() / 1000 - Number(parts.t)) > toleranceSeconds) return false;
//     const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
//     const a = Buffer.from(expected), b = Buffer.from(parts.v1 ?? "");
//     return a.length === b.length && timingSafeEqual(a, b);
//   }
//
// Always verify against the raw body, before any JSON parsing, and de-duplicate on the event id.

import { SIGNATURE_TOLERANCE_SECONDS, SIGNATURE_VERSION } from "./api-contract.ts"

const encoder = new TextEncoder()

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("")
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)))
}

export async function signPayload(secret: string, body: string, timestamp: number): Promise<string> {
  return await hmacSha256Hex(secret, `${timestamp}.${body}`)
}

export async function buildSignatureHeader(secret: string, body: string, timestamp: number): Promise<string> {
  return `t=${timestamp},${SIGNATURE_VERSION}=${await signPayload(secret, body, timestamp)}`
}

export interface ParsedSignature {
  timestamp: number
  signatures: string[]
}

export function parseSignatureHeader(header: string | null | undefined): ParsedSignature | null {
  if (!header || header.length > 512) return null
  let timestamp: number | null = null
  const signatures: string[] = []
  for (const part of header.split(",")) {
    const eq = part.indexOf("=")
    if (eq < 1) return null
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (name === "t") {
      if (!/^[0-9]{1,12}$/.test(value) || timestamp !== null) return null
      timestamp = Number(value)
    } else if (name === SIGNATURE_VERSION) {
      if (!/^[0-9a-f]{64}$/.test(value)) return null
      signatures.push(value)
    }
    // Unknown scheme versions are ignored so a receiver keeps working when a new version is added.
  }
  if (timestamp === null || signatures.length === 0) return null
  return { timestamp, signatures }
}

// Compares two strings without stopping at the first difference.
export function timingSafeEqualText(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < length; i += 1) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

export type VerifyResult = { ok: true } | { ok: false; reason: "malformed" | "stale" | "mismatch" }

export async function verifySignature(input: {
  secret: string
  header: string | null | undefined
  body: string
  nowSeconds: number
  toleranceSeconds?: number
}): Promise<VerifyResult> {
  const parsed = parseSignatureHeader(input.header)
  if (parsed === null) return { ok: false, reason: "malformed" }
  const tolerance = input.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS
  if (Math.abs(input.nowSeconds - parsed.timestamp) > tolerance) return { ok: false, reason: "stale" }
  const expected = await signPayload(input.secret, input.body, parsed.timestamp)
  let matched = false
  for (const candidate of parsed.signatures) matched = timingSafeEqualText(expected, candidate) || matched
  return matched ? { ok: true } : { ok: false, reason: "mismatch" }
}

// "whsec_" + 64 hex characters, the shape the database generates. Used by tests and by the delivery function to
// refuse to sign with something that is not a generated secret.
export function isWebhookSecret(value: string): boolean {
  return /^whsec_[0-9a-f]{64}$/.test(value)
}
