import { createHash, timingSafeEqual } from "node:crypto";

export class HqError extends Error {
  constructor(code, status = 400) { super(code); this.name = "HqError"; this.code = code; this.status = status; }
}
const loopback = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
export function checkLocalRequest(request, env = process.env) {
  if (env.VOLABI_LOCAL_MODE !== "enabled" || env.VERCEL) throw new HqError("local_disabled", 403);
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (!host || !loopback.has(url.hostname) || !["http:", "https:"].includes(url.protocol)) throw new HqError("origin_forbidden", 403);
  let actual;
  try { actual = new URL(`${url.protocol}//${host}`); } catch { throw new HqError("origin_forbidden", 403); }
  if (!loopback.has(actual.hostname) || actual.port !== url.port || actual.username || actual.password || actual.pathname!=="/" || actual.search || actual.hash) throw new HqError("origin_forbidden", 403);
  const origin = request.headers.get("origin");
  if ((request.method !== "GET" && request.method !== "HEAD" && !origin) || (origin && origin !== actual.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new HqError("origin_forbidden", 403);
  }
  return new URL(url.pathname+url.search, actual.origin);
}
export function readLocalCookie(request) {
  const cookies = (request.headers.get("cookie") || "").split(";").map(x => x.trim()).filter(x => x.startsWith("volabi_session="));
  if (cookies.length !== 1) return null;
  const value = cookies[0].slice("volabi_session=".length);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export const hash = value => createHash("sha256").update(value).digest("hex");
export const csrfForSession = token => hash(`volabi-local-csrf:${token}`);
export function checkCsrf(token, header) {
  if (!token || typeof header !== "string" || !/^[a-f0-9]{64}$/.test(header)) throw new HqError("csrf_failed", 403);
  const expected = csrfForSession(token);
  if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(header, "hex"))) throw new HqError("csrf_failed", 403);
}
export function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
}
