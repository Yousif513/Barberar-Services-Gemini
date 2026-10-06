import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkResolvedAddresses, isNonPublicAddress, validateWebhookUrl } from "../../supabase/functions/_shared/webhook-url.ts";

// The SSRF policy for webhook endpoints. The vector file is shared with the database tests, which run the same
// inputs through public.webhook_url_rejection so the two implementations cannot drift apart.
const vectors = JSON.parse(readFileSync(new URL("../../supabase/tests/fixtures/webhook-url-vectors.json", import.meta.url), "utf8"));

describe("validateWebhookUrl", () => {
  for (const vector of vectors) {
    const label = `${vector.ok ? "accepts" : `rejects (${vector.reason})`} ${vector.url.length > 70 ? vector.url.slice(0, 60) + `… [${vector.url.length} chars]` : JSON.stringify(vector.url)}`;
    it(label, () => {
      const result = validateWebhookUrl(vector.url);
      assert.equal(result.ok, vector.ok);
      if (!vector.ok) assert.equal(result.reason, vector.reason);
    });
  }

  it("returns the normalised URL and host for an accepted endpoint", () => {
    const result = validateWebhookUrl("HTTPS://Hooks.Example.COM:443/a/b?c=d");
    assert.deepEqual(result, { ok: true, url: "https://hooks.example.com/a/b?c=d", hostname: "hooks.example.com" });
  });

  it("refuses values that are not strings", () => {
    for (const value of [null, undefined, 5, {}, [], true]) assert.deepEqual(validateWebhookUrl(value), { ok: false, reason: "malformed" });
  });

  it("refuses spellings the URL parser rewrites into an address (decimal, octal, hex, short forms)", () => {
    for (const host of ["2130706433", "0x7f000001", "017700000001", "0177.0.0.1", "127.1", "0x7f.1", "1.1", "4294967295"]) {
      const result = validateWebhookUrl(`https://${host}/hook`);
      assert.deepEqual(result, { ok: false, reason: "ip_literal" }, host);
    }
  });

  it("refuses a host whose last label is a number, whatever reason it is given", () => {
    for (const host of ["example.123", "a.b.c.d.5", "example.0x1f"]) assert.equal(validateWebhookUrl(`https://${host}/`).ok, false, host);
  });

  it("treats a backslash trick as the host it really is", () => {
    // WHATWG parsing reads this as host example.com and path /@evil.example/, which is a public name: accepted by
    // this layer. The database rule is stricter and refuses any '@' in the authority.
    const result = validateWebhookUrl("https://example.com\\@evil.example/");
    assert.equal(result.ok && result.hostname, "example.com");
  });
});

describe("isNonPublicAddress", () => {
  it("refuses every non-public IPv4 range", () => {
    const refused = [
      "0.0.0.0", "0.255.255.255", "10.0.0.1", "10.255.255.255", "100.64.0.1", "100.127.255.255", "127.0.0.1", "127.255.255.254",
      "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.0.0.1", "192.0.2.10", "192.88.99.1", "192.168.1.1", "198.18.0.1",
      "198.19.255.255", "198.51.100.7", "203.0.113.9", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255",
    ];
    for (const address of refused) assert.equal(isNonPublicAddress(address), true, address);
  });

  it("accepts public IPv4 addresses, including the edges of the private ranges", () => {
    for (const address of ["8.8.8.8", "1.1.1.1", "9.255.255.255", "11.0.0.0", "100.63.255.255", "100.128.0.0", "126.255.255.255", "128.0.0.1",
                           "169.253.255.255", "169.255.0.0", "172.15.255.255", "172.32.0.0", "192.167.255.255", "192.169.0.0", "198.17.255.255", "198.20.0.0", "223.255.255.255"]) {
      assert.equal(isNonPublicAddress(address), false, address);
    }
  });

  it("refuses every non-public IPv6 range and anything that is not an address", () => {
    const refused = [
      "::", "::1", "fe80::1", "fe80::abcd:1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:8.8.8.8",
      "64:ff9b::7f00:1", "100::1", "2001:db8::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "2001:2::1", "2002:7f00:1::1", "3fff::1", "3fff:fff::1",
      "[::1]", "::127.0.0.1", "fe80::1%eth0", "not-an-ip", "", "1.2.3", "256.1.1.1", "01.1.1.1", "1:2:3:4:5:6:7:8:9", "1::2::3", "g::1",
    ];
    for (const address of refused) assert.equal(isNonPublicAddress(address), true, JSON.stringify(address));
  });

  it("accepts global unicast IPv6", () => {
    for (const address of ["2001:4860:4860::8888", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e", "2400:cb00:2048:1::c629:d7a2", "2001:200::1", "2620:fe::fe"]) {
      assert.equal(isNonPublicAddress(address), false, address);
    }
  });
});

describe("checkResolvedAddresses", () => {
  it("passes a name only when every answer is public", () => {
    assert.deepEqual(checkResolvedAddresses(["8.8.8.8", "2606:4700:4700::1111"]), { ok: true });
    assert.deepEqual(checkResolvedAddresses(["8.8.8.8", "10.0.0.2"]), { ok: false, offending: "10.0.0.2" });
    assert.deepEqual(checkResolvedAddresses(["127.0.0.1"]), { ok: false, offending: "127.0.0.1" });
    assert.deepEqual(checkResolvedAddresses(["::ffff:192.168.0.1"]), { ok: false, offending: "::ffff:192.168.0.1" });
  });

  it("refuses a name that resolved to nothing", () => {
    assert.deepEqual(checkResolvedAddresses([]), { ok: false, offending: "(no address)" });
  });
});
