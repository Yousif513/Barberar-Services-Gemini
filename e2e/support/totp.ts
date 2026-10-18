// RFC 6238 TOTP (HMAC-SHA1, 30-second step, 6 digits), the algorithm GoTrue verifies, computed from the base32 secret
// the local GoTrue returned when the test enrolled the factor.

import { createHmac } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(secret: string): Buffer {
  let bits = "";
  for (const ch of secret.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase()) {
    const value = ALPHABET.indexOf(ch);
    if (value < 0) throw new Error("the TOTP secret is not base32");
    bits += value.toString(2).padStart(5, "0");
  }
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
}

export function totp(secret: string, atMs: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / 30)));
  const hmac = createHmac("sha1", base32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

/** A code that is certainly wrong for this secret right now (and in the neighbouring steps GoTrue also accepts). */
export function wrongTotp(secret: string, atMs: number = Date.now()): string {
  const valid = new Set([-1, 0, 1].map((step) => totp(secret, atMs + step * 30_000)));
  for (let n = 0; ; n += 1) {
    const candidate = String((Number(totp(secret, atMs)) + 500_000 + n) % 1_000_000).padStart(6, "0");
    if (!valid.has(candidate)) return candidate;
  }
}
