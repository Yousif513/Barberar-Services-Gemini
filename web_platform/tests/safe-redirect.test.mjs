import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { safeInternalPath } from "../src/lib/safe-redirect.mjs";

// RT-M2: /login?returnUrl= and /login/mfa?next= accept only a path on this site. Every payload is checked the way the
// Next.js router resolves it (new URL(href, location.href) with the WHATWG parser), from the real site's origin.
const SITE = "https://primora.sa";
const lands = (path) => new URL(path, `${SITE}/login`).origin;
const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");

// Values as the page reads them from searchParams (already percent-decoded once by URLSearchParams).
const query = (raw) => new URLSearchParams(`x=${raw}`).get("x");

describe("safeInternalPath refuses every way off the site", () => {
  const BYPASSES = [
    ["backslash host", "/\\evil.example"],
    ["tab then slash", "/\t/evil.example"],
    ["newline then slash", "/\n/evil.example"],
    ["carriage return", "/\r/evil.example"],
    ["double slash", "//evil.example"],
    ["double backslash", "\\\\evil.example"],
    ["slash backslash path", "/\\/evil.example/x"],
    ["https scheme", "https://evil.example"],
    ["scheme relative with spaces", " //evil.example"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,<script>alert(1)</script>"],
    ["encoded backslash", "/%5Cevil.example"],
    ["encoded slash", "/%2Fevil.example"],
    ["double encoded backslash", "/%255Cevil.example"],
    ["encoded tab", "/%09/evil.example"],
    ["credentials", "/@evil.example"],
    ["empty", ""],
    ["relative without slash", "evil.example"],
  ];
  for (const [name, value] of BYPASSES) {
    it(`${name}: ${JSON.stringify(value)}`, () => {
      const out = safeInternalPath(value, "/fallback");
      assert.equal(lands(out), new URL(SITE).origin, "whatever is returned stays on the site");
      if (name !== "credentials") assert.equal(out, "/fallback");
    });
  }
  it("the report's two payloads, read from the query string, fall back", () => {
    assert.equal(safeInternalPath(query("%2F%5Cevil.example"), "/admin"), "/admin");
    assert.equal(safeInternalPath(query("%2F%09%2Fevil.example"), "/admin"), "/admin");
    assert.equal(safeInternalPath(query("%2F%2Fevil.example"), "/admin"), "/admin");
    assert.equal(safeInternalPath(query("https%3A%2F%2Fevil.example"), "/admin"), "/admin");
  });
  it("null, undefined and non-strings fall back", () => {
    for (const v of [null, undefined, 42, {}, ["/admin"]]) assert.equal(safeInternalPath(v, "/x"), "/x");
  });
});

describe("safeInternalPath keeps real site paths", () => {
  for (const path of ["/admin", "/customer/memberships", "/provider/wallet", "/pro/sara-beauty", "/login/mfa?next=%2Fadmin%2Fledger",
    "/customer/bookings?payment=b1#top", "/become-provider"]) {
    it(path, () => assert.equal(safeInternalPath(path, "/fallback"), path));
  }
});

describe("the sign-in pages use it", () => {
  it("/login follows only safeInternalPath(returnUrl)", () => {
    const code = read("web_platform/src/app/login/page.tsx");
    assert.match(code, /const returnUrl = safeInternalPath\(searchParams\.get\("returnUrl"\), ""\);/);
    assert.ok(!/returnUrl\.startsWith\(/.test(code), "no string-prefix check is left");
  });
  it("/login/mfa follows only safeInternalPath(next)", () => {
    const code = read("web_platform/src/app/login/mfa/page.tsx");
    assert.match(code, /const safeNext = \(value: string \| null\) => safeInternalPath\(value, "\/admin"\);/);
    assert.ok(!/value\.startsWith\("\/"\)/.test(code));
  });
});
