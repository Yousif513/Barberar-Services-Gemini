// Webhook endpoint URL policy (SSRF defence). Pure module.
//
// Layers, from the first to the last line of defence:
//   1. validateWebhookUrl     static rules, applied by the database command that stores the endpoint (the SQL
//                             function webhook_url_is_acceptable mirrors them; a shared vector file keeps them
//                             in step) and again by the delivery function before every attempt.
//   2. checkResolvedAddresses the delivery function resolves the host name and refuses to connect when ANY answer
//                             is not a public address (DNS names that point at 127.0.0.1, 10.x, 169.254.x ...).
//   3. delivery never follows redirects, never sends credentials, keeps only a short note of the answer.
//
// What this cannot do: Deno's fetch resolves the name again when it connects, so a hostile DNS server that answers
// differently the second time (DNS rebinding) is not stopped by step 2 alone. Run the delivery function where
// outbound traffic to private ranges is blocked by the network, and treat step 2 as a strong filter, not a proof.

import { MAX_URL_LENGTH } from "./api-contract.ts"

export type UrlRejection =
  | "malformed"
  | "too_long"
  | "not_https"
  | "credentials"
  | "port"
  | "ip_literal"
  | "single_label"
  | "local_host"

export type UrlCheck = { ok: true; url: string; hostname: string } | { ok: false; reason: UrlRejection }

// Top-level names and suffixes that never resolve on the public internet (RFC 6761, RFC 6762, RFC 8375 and the
// common private conventions).
const LOCAL_SUFFIXES = [
  "localhost", "local", "localdomain", "internal", "intranet", "lan", "home", "corp", "private",
  "test", "example", "invalid", "onion", "home.arpa",
]

export function validateWebhookUrl(raw: unknown): UrlCheck {
  if (typeof raw !== "string" || raw.length === 0 || raw !== raw.trim()) return { ok: false, reason: "malformed" }
  if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: "too_long" }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: "malformed" }
  }
  if (url.protocol !== "https:") return { ok: false, reason: "not_https" }
  if (url.username !== "" || url.password !== "") return { ok: false, reason: "credentials" }
  if (url.port !== "" && url.port !== "443") return { ok: false, reason: "port" }

  let host = url.hostname.toLowerCase()
  if (host.endsWith(".")) host = host.slice(0, -1)
  if (host === "" || host.startsWith("[")) return host === "" ? { ok: false, reason: "malformed" } : { ok: false, reason: "ip_literal" }
  // The URL parser has already rewritten decimal, octal and hexadecimal IPv4 spellings to dotted decimal.
  if (/^[0-9.]+$/.test(host)) return { ok: false, reason: "ip_literal" }
  if (!host.includes(".")) return { ok: false, reason: "single_label" }
  const labels = host.split(".")
  if (/^[0-9]+$/.test(labels[labels.length - 1])) return { ok: false, reason: "ip_literal" }
  for (const suffix of LOCAL_SUFFIXES) {
    if (host === suffix || host.endsWith("." + suffix)) return { ok: false, reason: "local_host" }
  }
  return { ok: true, url: url.toString(), hostname: host }
}

// ---------------------------------------------------------------------------------------------------------------
// Address classification (used on DNS answers)
// ---------------------------------------------------------------------------------------------------------------

function parseIPv4(text: string): number[] | null {
  const parts = text.split(".")
  if (parts.length !== 4) return null
  const octets: number[] = []
  for (const part of parts) {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) return null
    const value = Number(part)
    if (value > 255) return null
    octets.push(value)
  }
  return octets
}

// [network, prefix length] pairs of IPv4 space that is not a public unicast address.
const NON_PUBLIC_V4: [number[], number][] = [
  [[0, 0, 0, 0], 8], [[10, 0, 0, 0], 8], [[100, 64, 0, 0], 10], [[127, 0, 0, 0], 8], [[169, 254, 0, 0], 16],
  [[172, 16, 0, 0], 12], [[192, 0, 0, 0], 24], [[192, 0, 2, 0], 24], [[192, 88, 99, 0], 24], [[192, 168, 0, 0], 16],
  [[198, 18, 0, 0], 15], [[198, 51, 100, 0], 24], [[203, 0, 113, 0], 24], [[224, 0, 0, 0], 4], [[240, 0, 0, 0], 4],
]

function inV4(octets: number[], network: number[], prefix: number): boolean {
  let remaining = prefix
  for (let i = 0; i < 4 && remaining > 0; i += 1) {
    const bits = Math.min(8, remaining)
    const mask = (0xff << (8 - bits)) & 0xff
    if ((octets[i] & mask) !== (network[i] & mask)) return false
    remaining -= bits
  }
  return true
}

function parseIPv6(text: string): number[] | null {
  if (text.includes("%")) return null
  let head = text
  let tail4: number[] | null = null
  const lastColon = text.lastIndexOf(":")
  if (lastColon !== -1 && text.slice(lastColon + 1).includes(".")) {
    tail4 = parseIPv4(text.slice(lastColon + 1))
    if (tail4 === null) return null
    head = text.slice(0, lastColon + 1) + "0:0"
  }
  const doubles = head.split("::")
  if (doubles.length > 2) return null
  const toGroups = (s: string): number[] | null => {
    if (s === "") return []
    const groups: number[] = []
    for (const g of s.split(":")) {
      if (!/^[0-9a-f]{1,4}$/i.test(g)) return null
      groups.push(parseInt(g, 16))
    }
    return groups
  }
  const left = toGroups(doubles[0])
  const right = doubles.length === 2 ? toGroups(doubles[1]) : []
  if (left === null || right === null) return null
  let groups: number[]
  if (doubles.length === 2) {
    const missing = 8 - left.length - right.length
    if (missing < 1) return null
    groups = [...left, ...new Array<number>(missing).fill(0), ...right]
  } else {
    groups = left
  }
  if (groups.length !== 8) return null
  if (tail4 !== null) {
    groups[6] = (tail4[0] << 8) | tail4[1]
    groups[7] = (tail4[2] << 8) | tail4[3]
  }
  return groups
}

// True when the address is anything other than a public unicast address. Unparseable text counts as non-public.
export function isNonPublicAddress(address: string): boolean {
  const v4 = parseIPv4(address)
  if (v4 !== null) return NON_PUBLIC_V4.some(([network, prefix]) => inV4(v4, network, prefix))
  const g = parseIPv6(address.replace(/^\[|\]$/g, ""))
  if (g === null) return true
  // Only global unicast 2000::/3 is public, minus the ranges inside it that are not routable hosts.
  if ((g[0] & 0xe000) !== 0x2000) return true
  if (g[0] === 0x2001 && g[1] < 0x0200) return true // 2001::/23: protocol assignments, Teredo, benchmarking
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true // documentation
  if (g[0] === 0x2002) return true // 6to4 embeds an IPv4 address
  if (g[0] === 0x3fff && g[1] < 0x1000) return true // documentation 3fff::/20
  return false
}

export type AddressCheck = { ok: true } | { ok: false; offending: string }

// A name is acceptable only when it resolved to at least one address and every address is public.
export function checkResolvedAddresses(addresses: string[]): AddressCheck {
  if (addresses.length === 0) return { ok: false, offending: "(no address)" }
  for (const address of addresses) if (isNonPublicAddress(address)) return { ok: false, offending: address }
  return { ok: true }
}
