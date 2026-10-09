import { timingSafeEqualText } from "./webhook-signature.ts"

// Pure request helpers (no Deno API) so the same code runs in the edge runtime and in the node tests.

// True when the presented bearer token is the service key. The comparison does not stop at the first different
// character, and an unset or empty key never matches (so an unset secret cannot be "guessed" with an empty token).
export function serviceKeyMatches(token: string | null | undefined, serviceKey: string | null | undefined): boolean {
  if (!token || !serviceKey) return false
  return timingSafeEqualText(token, serviceKey)
}

// True when the Content-Length the client declared is already larger than the limit, so the body is refused before a byte is read.
// A missing header is not an answer (chunked uploads have none): readBodyLimited enforces the limit on the bytes actually received.
export function declaredLengthExceeds(header: string | null | undefined, maxBytes: number): boolean {
  if (header === null || header === undefined) return false
  const trimmed = header.trim()
  if (!/^[0-9]{1,15}$/.test(trimmed)) return false
  return Number(trimmed) > maxBytes
}

// Reads at most maxBytes from a request body. Returns null as soon as the limit is passed, without buffering the rest.
export async function readBodyLimited(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array(0)
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}
