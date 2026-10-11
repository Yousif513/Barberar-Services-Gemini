import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  buildSignatureHeader, hmacSha256Hex, isWebhookSecret, parseSignatureHeader, signPayload, timingSafeEqualText, verifySignature,
} from "../../supabase/functions/_shared/webhook-signature.ts";
import { buildDeliveryRequest, classifyDeliveryError, classifyDeliveryResponse, truncateNote } from "../../supabase/functions/_shared/webhook-delivery.ts";
import { SIGNATURE_HEADER, SIGNATURE_TOLERANCE_SECONDS } from "../../supabase/functions/_shared/api-contract.ts";

const SECRET = `whsec_${"0123456789abcdef".repeat(4)}`;
const BODY = JSON.stringify({ id: "evt_1", type: "booking.created", data: { booking: { id: "b1", total_price: 150 } } });
const T = 1_790_000_000;

describe("signing", () => {
  it("matches an independent HMAC-SHA256 implementation over `${t}.${body}`", async () => {
    const expected = createHmac("sha256", SECRET).update(`${T}.${BODY}`).digest("hex");
    assert.equal(await signPayload(SECRET, BODY, T), expected);
    assert.equal(await hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog"), "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8", "RFC-style known answer");
    assert.equal(await buildSignatureHeader(SECRET, BODY, T), `t=${T},v1=${expected}`);
  });

  it("signs the exact bytes: a different body, secret or timestamp gives a different signature", async () => {
    const base = await signPayload(SECRET, BODY, T);
    assert.notEqual(await signPayload(SECRET, BODY + " ", T), base);
    assert.notEqual(await signPayload(SECRET + "0", BODY, T), base);
    assert.notEqual(await signPayload(SECRET, BODY, T + 1), base);
  });
});

describe("verification", () => {
  const verify = (over = {}) => verifySignature({ secret: SECRET, header: null, body: BODY, nowSeconds: T, ...over });

  it("accepts a fresh, correctly signed delivery", async () => {
    const header = await buildSignatureHeader(SECRET, BODY, T);
    assert.deepEqual(await verify({ header }), { ok: true });
    assert.deepEqual(await verify({ header, nowSeconds: T + SIGNATURE_TOLERANCE_SECONDS }), { ok: true }, "the tolerance boundary is inclusive");
    assert.deepEqual(await verify({ header, nowSeconds: T - SIGNATURE_TOLERANCE_SECONDS }), { ok: true });
  });

  it("refuses a stale or future timestamp (replay protection)", async () => {
    const header = await buildSignatureHeader(SECRET, BODY, T);
    assert.deepEqual(await verify({ header, nowSeconds: T + SIGNATURE_TOLERANCE_SECONDS + 1 }), { ok: false, reason: "stale" });
    assert.deepEqual(await verify({ header, nowSeconds: T - SIGNATURE_TOLERANCE_SECONDS - 1 }), { ok: false, reason: "stale" });
    assert.deepEqual(await verify({ header, nowSeconds: T + 10, toleranceSeconds: 5 }), { ok: false, reason: "stale" });
  });

  it("refuses a tampered body, a wrong secret and a re-stamped header", async () => {
    const header = await buildSignatureHeader(SECRET, BODY, T);
    assert.deepEqual(await verify({ header, body: BODY.replace("150", "1") }), { ok: false, reason: "mismatch" });
    assert.deepEqual(await verify({ header, secret: SECRET.replace("0", "1") }), { ok: false, reason: "mismatch" });
    const restamped = header.replace(`t=${T}`, `t=${T + 1}`);
    assert.deepEqual(await verify({ header: restamped, nowSeconds: T + 1 }), { ok: false, reason: "mismatch" });
  });

  it("refuses malformed headers", async () => {
    const good = (await buildSignatureHeader(SECRET, BODY, T)).split(",v1=")[1];
    for (const header of [null, undefined, "", "garbage", `t=${T}`, `v1=${good}`, `t=abc,v1=${good}`, `t=${T},v1=short`, `t=${T},v1=${good.toUpperCase()}`,
                          `t=${T},t=${T},v1=${good}`, `t=${T},v1=${good},bad`, "t=" + "9".repeat(20) + `,v1=${good}`, "x".repeat(600)]) {
      assert.deepEqual(await verify({ header }), { ok: false, reason: "malformed" }, String(header).slice(0, 30));
    }
  });

  it("accepts any matching v1 during a secret rotation and ignores unknown scheme versions", async () => {
    const real = (await buildSignatureHeader(SECRET, BODY, T)).split(",v1=")[1];
    const other = "f".repeat(64);
    assert.deepEqual(await verify({ header: `t=${T},v1=${other},v1=${real}` }), { ok: true });
    assert.deepEqual(await verify({ header: `t=${T},v2=${other},v1=${real}` }), { ok: true });
    assert.deepEqual(await verify({ header: `t=${T},v1=${other},v1=${other.replace("f", "e")}` }), { ok: false, reason: "mismatch" });
    assert.equal(parseSignatureHeader(`t=${T},v2=${other}`), null, "a header with no v1 value cannot be verified");
  });

  it("compares text without early exit and recognises generated secrets", () => {
    assert.equal(timingSafeEqualText("abc", "abc"), true);
    assert.equal(timingSafeEqualText("abc", "abd"), false);
    assert.equal(timingSafeEqualText("abc", "ab"), false);
    assert.equal(timingSafeEqualText("", ""), true);
    assert.equal(isWebhookSecret(SECRET), true);
    for (const bad of ["whsec_abc", "secret", SECRET.toUpperCase(), SECRET + "0", ""]) assert.equal(isWebhookSecret(bad), false);
  });

  it("agrees with the receiver snippet published in the API reference", async () => {
    // The documented receiver, copied verbatim from the comment in webhook-signature.ts.
    function documented(secret, header, rawBody, now, toleranceSeconds = 300) {
      const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
      if (Math.abs(now - Number(parts.t)) > toleranceSeconds) return false;
      const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
      const a = Buffer.from(expected), b = Buffer.from(parts.v1 ?? "");
      return a.length === b.length && timingSafeEqual(a, b);
    }
    const header = await buildSignatureHeader(SECRET, BODY, T);
    assert.equal(documented(SECRET, header, BODY, T), true);
    assert.equal(documented(SECRET, header, BODY + "x", T), false);
    assert.equal(documented(SECRET, header, BODY, T + 1000), false);
  });
});

describe("delivery request and outcome", () => {
  it("serialises the payload once and signs those exact characters", async () => {
    const payload = { id: "evt_1", type: "booking.confirmed", data: { n: 1 } };
    const request = await buildDeliveryRequest({ secret: SECRET, eventId: "evt_1", eventType: "booking.confirmed", payload, timestamp: T });
    assert.equal(request.body, JSON.stringify(payload));
    assert.equal(request.headers["Content-Type"], "application/json");
    assert.equal(request.headers["X-Primora-Event"], "booking.confirmed");
    assert.equal(request.headers["X-Primora-Event-Id"], "evt_1");
    assert.deepEqual(await verifySignature({ secret: SECRET, header: request.headers[SIGNATURE_HEADER], body: request.body, nowSeconds: T }), { ok: true });
    assert.ok(!JSON.stringify(request.headers).includes(SECRET), "the secret is never sent");
  });

  it("counts only a 2xx answer as delivered and never follows redirects", () => {
    for (const status of [200, 201, 202, 204, 299]) assert.equal(classifyDeliveryResponse(status).delivered, true, String(status));
    for (const status of [100, 301, 302, 307, 308, 400, 401, 404, 410, 429, 500, 503]) {
      const outcome = classifyDeliveryResponse(status);
      assert.equal(outcome.delivered, false, String(status));
      assert.equal(outcome.status, status);
    }
    assert.match(classifyDeliveryResponse(302).note, /Redirects are not followed/);
  });

  it("describes transport failures without status and keeps notes short and single-line", () => {
    const timeout = classifyDeliveryError("timeout");
    assert.deepEqual([timeout.delivered, timeout.status], [false, null]);
    assert.match(classifyDeliveryError("blocked_address", "10.0.0.4").note, /non-public.*10\.0\.0\.4/);
    const long = truncateNote("a\nb\r\nc\t" + "x".repeat(500));
    assert.ok(long.length <= 200 && !/[\r\n\t]/.test(long));
    assert.equal(truncateNote("short"), "short");
  });
});
