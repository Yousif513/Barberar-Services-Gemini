import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { declaredLengthExceeds, readBodyLimited, serviceKeyMatches } from "../functions/_shared/request-guards.ts";

// FIX-PRIV P-13: the service key is compared without an early exit, and an oversized body is refused before it is read.

describe("serviceKeyMatches", () => {
  it("accepts only the exact key", () => {
    assert.equal(serviceKeyMatches("sb_service_key_value", "sb_service_key_value"), true);
    assert.equal(serviceKeyMatches("sb_service_key_valuf", "sb_service_key_value"), false);
    assert.equal(serviceKeyMatches("sb_service_key_value ", "sb_service_key_value"), false);
    assert.equal(serviceKeyMatches("sb_service", "sb_service_key_value"), false);
    assert.equal(serviceKeyMatches("sb_service_key_value_and_more", "sb_service_key_value"), false);
  });
  it("never matches when the key is unset or the token empty", () => {
    assert.equal(serviceKeyMatches("", ""), false);
    assert.equal(serviceKeyMatches("anything", undefined), false);
    assert.equal(serviceKeyMatches("anything", null), false);
    assert.equal(serviceKeyMatches(undefined, "key"), false);
  });
});

describe("declaredLengthExceeds", () => {
  it("refuses a declared length over the limit and ignores a missing or malformed header", () => {
    assert.equal(declaredLengthExceeds("1048577", 1048576), true);
    assert.equal(declaredLengthExceeds("1048576", 1048576), false);
    assert.equal(declaredLengthExceeds(" 2000000 ", 1048576), true);
    assert.equal(declaredLengthExceeds(null, 1048576), false);
    assert.equal(declaredLengthExceeds("abc", 1048576), false);
    assert.equal(declaredLengthExceeds("-5", 1048576), false);
    assert.equal(declaredLengthExceeds("99999999999999999999", 1048576), false, "more digits than any real length is treated as malformed here and still capped by the byte counter");
  });
});

describe("readBodyLimited", () => {
  const streamOf = (...chunks) => new ReadableStream({ start(c) { for (const chunk of chunks) c.enqueue(chunk); c.close(); } });
  it("returns the whole body when it fits, including an empty one", async () => {
    const got = await readBodyLimited(streamOf(new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])), 10);
    assert.deepEqual([...got], [1, 2, 3, 4, 5]);
    assert.equal((await readBodyLimited(null, 10)).byteLength, 0);
    assert.equal((await readBodyLimited(streamOf(), 10)).byteLength, 0);
  });
  it("returns null as soon as the limit is passed and stops reading", async () => {
    let pulled = 0;
    const endless = new ReadableStream({ pull(c) { pulled += 1; c.enqueue(new Uint8Array(1024)); } });
    assert.equal(await readBodyLimited(endless, 4096), null);
    assert.ok(pulled <= 8, `read ${pulled} chunks of an endless body`);
    assert.equal(await readBodyLimited(streamOf(new Uint8Array(11)), 10), null);
    assert.equal((await readBodyLimited(streamOf(new Uint8Array(10)), 10)).byteLength, 10);
  });
});

describe("wiring", () => {
  it("send-otp and send-push compare the service key with serviceKeyMatches", () => {
    for (const fn of ["send-otp", "send-push"]) {
      const src = readFileSync(new URL(`../functions/${fn}/index.ts`, import.meta.url), "utf8");
      assert.match(src, /serviceKeyMatches\(/, fn);
      assert.doesNotMatch(src, /authorization !== `Bearer/, fn);
    }
  });
  const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  it("resolveCaller no longer compares the service key with ===", () => {
    const http = read("../functions/_shared/http.ts");
    assert.match(http, /serviceKeyMatches\(token, Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)\)/);
    assert.doesNotMatch(http, /token === Deno\.env\.get/);
  });
  it("whatsapp-inbound checks Content-Length before it reads the body", () => {
    const src = read("../functions/whatsapp-inbound/index.ts");
    const check = src.indexOf("declaredLengthExceeds(req.headers.get");
    const readAt = src.indexOf("readBodyLimited(req.body");
    assert.ok(check > 0 && readAt > check, "length check must come first");
    assert.doesNotMatch(src, /req\.arrayBuffer\(\)/);
  });
});
