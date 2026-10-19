// RT-M2 (red team 2026-10-17): the address a page sends a person to after sign-in or after the authenticator step comes from
// the query string (/login?returnUrl=, /login/mfa?next=), so it is attacker-chosen. Only a path on this site is followed.
//
// A string check is not enough: the WHATWG URL parser (the one the browser and the Next.js router use) treats a backslash as a
// slash and drops tabs and newlines, so "/\evil.example" and "/\t/evil.example" become "//evil.example", another site.
// The value is therefore resolved against a fixed placeholder origin and accepted only if it stays on it; anything with a
// backslash, a control character, or an encoded slash or backslash where the host would start is refused outright, also
// after percent-decoding (an encoded variant can be decoded once more by a later hop).

const PLACEHOLDER_ORIGIN = "https://primora.internal.invalid";
const UNSAFE_CHARACTERS = /[\\\u0000-\u001f\u007f]/;
const ENCODED_SEPARATOR_AT_HOST = /^\/(?:%2f|%5c)/i;

function decodeRepeatedly(value) {
  let current = value;
  for (let i = 0; i < 3; i += 1) {
    let next;
    try {
      next = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (next === current) return current;
    current = next;
  }
  return current;
}

/**
 * Returns a same-site path ("/path?query#hash") for value, or fallback when value is missing or could lead off this site.
 * @param {string | null | undefined} value
 * @param {string} fallback
 * @returns {string}
 */
export function safeInternalPath(value, fallback) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (UNSAFE_CHARACTERS.test(value) || ENCODED_SEPARATOR_AT_HOST.test(value)) return fallback;
  const decoded = decodeRepeatedly(value);
  if (decoded === null || UNSAFE_CHARACTERS.test(decoded) || decoded.startsWith("//") || ENCODED_SEPARATOR_AT_HOST.test(decoded)) {
    return fallback;
  }
  let url;
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN || url.username || url.password) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
