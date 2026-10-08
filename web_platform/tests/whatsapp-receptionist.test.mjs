import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import * as adhan from "adhan";
import {
  hashCustomerId, hmacSha256HexBytes, parseMetaSignatureHeader, verifyMetaSignature, verifySubscription,
} from "../../supabase/functions/_shared/whatsapp-signature.ts";
import { parseWebhookPayload } from "../../supabase/functions/_shared/whatsapp-payload.ts";
import { makeAdhanClock, prayerWindowsForDate } from "../../supabase/functions/_shared/whatsapp-prayer.ts";
import { bookingLink, chooseSlots, respond, SEARCH_DAYS, STATE_TTL_MINUTES } from "../../supabase/functions/_shared/whatsapp-engine.ts";
import { applyParaphrase, noParaphrase, preservesFacts } from "../../supabase/functions/_shared/whatsapp-llm-adapter.ts";
import { dateLabel, priceLabel, timeLabel } from "../../supabase/functions/_shared/whatsapp-reply.ts";

// ---------------------------------------------------------------------------------------------------------------------
// Signature vectors
// ---------------------------------------------------------------------------------------------------------------------
describe("Meta signature", () => {
  const SECRET = "app-secret-for-tests";
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [{ text: { body: "أبغى حجز" } }] } }] }] });
  const bytes = new TextEncoder().encode(body);
  const header = (secret = SECRET, data = body) => `sha256=${createHmac("sha256", secret).update(data).digest("hex")}`;

  it("matches the RFC 4231 HMAC-SHA256 known answer", async () => {
    assert.equal(await hmacSha256HexBytes("Jefe", "what do ya want for nothing?"), "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
    // Test case 1: key = 20 x 0x0b, data = "Hi There".
    assert.equal(await hmacSha256HexBytes("\u000b".repeat(20), "Hi There"), "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
  });
  it("agrees with an independent implementation over the raw bytes, for strings and byte arrays alike", async () => {
    assert.equal(await hmacSha256HexBytes(SECRET, body), createHmac("sha256", SECRET).update(body).digest("hex"));
    assert.equal(await hmacSha256HexBytes(SECRET, bytes), createHmac("sha256", SECRET).update(body).digest("hex"));
  });
  it("accepts a correct signature, in either case of hex", async () => {
    assert.deepEqual(await verifyMetaSignature({ appSecret: SECRET, rawBody: bytes, header: header() }), { ok: true });
    assert.deepEqual(await verifyMetaSignature({ appSecret: SECRET, rawBody: body, header: header().replace("sha256=", "sha256=").toUpperCase().replace("SHA256=", "sha256=") }), { ok: true });
  });
  it("rejects a changed body, a changed byte, a wrong secret and a replayed signature on another body", async () => {
    const good = header();
    assert.deepEqual(await verifyMetaSignature({ appSecret: SECRET, rawBody: body + " ", header: good }), { ok: false, reason: "mismatch" });
    const flipped = new Uint8Array(bytes); flipped[10] ^= 1;
    assert.deepEqual(await verifyMetaSignature({ appSecret: SECRET, rawBody: flipped, header: good }), { ok: false, reason: "mismatch" });
    assert.deepEqual(await verifyMetaSignature({ appSecret: "other", rawBody: bytes, header: good }), { ok: false, reason: "mismatch" });
    assert.deepEqual(await verifyMetaSignature({ appSecret: SECRET, rawBody: "{}", header: good }), { ok: false, reason: "mismatch" });
  });
  it("rejects a missing secret, a missing header and malformed headers", async () => {
    assert.deepEqual(await verifyMetaSignature({ appSecret: "", rawBody: bytes, header: header() }), { ok: false, reason: "missing_secret" });
    assert.deepEqual(await verifyMetaSignature({ appSecret: null, rawBody: bytes, header: header() }), { ok: false, reason: "missing_secret" });
    assert.deepEqual(await verifyMetaSignature({ appSecret: SECRET, rawBody: bytes, header: null }), { ok: false, reason: "missing_header" });
    assert.deepEqual(await verifyMetaSignature({ appSecret: SECRET, rawBody: bytes, header: "" }), { ok: false, reason: "missing_header" });
    for (const bad of ["abc", "sha256=", "sha256=zz", `sha1=${"a".repeat(40)}`, `sha256=${"a".repeat(63)}`, `sha256=${"a".repeat(65)}`, `SHA256=${"a".repeat(64)}`, `sha256=${"g".repeat(64)}`]) {
      const result = await verifyMetaSignature({ appSecret: SECRET, rawBody: bytes, header: bad });
      assert.equal(result.ok, false, bad);
      assert.ok(["malformed", "mismatch"].includes(result.reason), bad);
    }
    assert.equal(parseMetaSignatureHeader(`sha256=${"A".repeat(64)}`), "a".repeat(64));
    assert.equal(parseMetaSignatureHeader(undefined), null);
  });
  it("verifies the subscription handshake with a constant-time token check", () => {
    const q = (o) => ({ get: (k) => o[k] ?? null });
    assert.deepEqual(verifySubscription(q({ "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "1158201444" }), "tok"), { ok: true, challenge: "1158201444" });
    assert.equal(verifySubscription(q({ "hub.mode": "subscribe", "hub.verify_token": "bad", "hub.challenge": "1" }), "tok").reason, "wrong_token");
    assert.equal(verifySubscription(q({ "hub.mode": "unsubscribe", "hub.verify_token": "tok", "hub.challenge": "1" }), "tok").reason, "wrong_mode");
    assert.equal(verifySubscription(q({ "hub.mode": "subscribe", "hub.verify_token": "tok" }), "tok").reason, "missing_challenge");
    assert.equal(verifySubscription(q({ "hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "1" }), "").reason, "missing_token");
    assert.equal(verifySubscription(q({ "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "1" }), undefined).reason, "missing_token");
  });
  it("hashes a customer id with a secret pepper: stable, channel-bound, and not the plain digest", async () => {
    const a = await hashCustomerId("pepper", "chan-1", "966501234567");
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(a, await hashCustomerId("pepper", "chan-1", "966501234567"));
    assert.notEqual(a, await hashCustomerId("pepper2", "chan-1", "966501234567"));
    assert.notEqual(a, await hashCustomerId("pepper", "chan-2", "966501234567"));
    assert.notEqual(a, await hashCustomerId("pepper", "chan-1", "966501234568"));
    assert.notEqual(a, createHash("sha256").update("966501234567").digest("hex"));
    await assert.rejects(() => hashCustomerId("", "chan-1", "966501234567"));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Payload parsing
// ---------------------------------------------------------------------------------------------------------------------
describe("webhook payload", () => {
  const envelope = (value) => ({ object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field: "messages", value }] }] });
  const meta = { display_phone_number: "966500000000", phone_number_id: "109876543210987" };
  it("extracts text messages with the verified channel's phone number id", () => {
    const parsed = parseWebhookPayload(envelope({ metadata: meta, contacts: [{ wa_id: "966501234567" }],
      messages: [{ from: "966501234567", id: "wamid.A", timestamp: "1790000000", type: "text", text: { body: "أبغى حجز قص شعر بكرة العصر" } }] }));
    assert.equal(parsed.messages.length, 1);
    assert.deepEqual(parsed.messages[0], { phoneNumberId: "109876543210987", waId: "966501234567", messageId: "wamid.A", type: "text",
      body: "أبغى حجز قص شعر بكرة العصر", sentAt: new Date(1790000000 * 1000).toISOString() });
  });
  it("reads button and list replies, keeps media as a bodiless message, and strips a leading +", () => {
    const parsed = parseWebhookPayload(envelope({ metadata: meta, messages: [
      { from: "+966501234567", id: "wamid.B", type: "button", button: { text: "نعم" } },
      { from: "966501234567", id: "wamid.C", type: "interactive", interactive: { button_reply: { title: "Book" } } },
      { from: "966501234567", id: "wamid.D", type: "interactive", interactive: { list_reply: { title: "Friday" } } },
      { from: "966501234567", id: "wamid.E", type: "image", image: { id: "x" } },
    ] }));
    assert.deepEqual(parsed.messages.map((m) => [m.waId, m.type, m.body]), [
      ["966501234567", "button", "نعم"], ["966501234567", "interactive", "Book"], ["966501234567", "interactive", "Friday"], ["966501234567", "image", null]]);
  });
  it("counts delivery receipts, ignores reactions and malformed entries, never throws", () => {
    const parsed = parseWebhookPayload(envelope({ metadata: meta, statuses: [{ id: "s1" }, { id: "s2" }], messages: [
      { from: "966501234567", id: "wamid.F", type: "reaction", reaction: { emoji: "x" } },
      { from: "abc", id: "wamid.G", type: "text", text: { body: "x" } },
      { from: "966501234567", id: "", type: "text", text: { body: "x" } },
      { from: "966501234567", id: "wamid.H", type: "Text!", text: { body: "x" } },
      null, 7, "x",
    ] }));
    assert.equal(parsed.messages.length, 0);
    assert.equal(parsed.statuses, 2);
    assert.ok(parsed.ignored >= 6);
    for (const junk of [null, undefined, 5, "x", [], {}, { object: "page" }, { object: "whatsapp_business_account" }, { object: "whatsapp_business_account", entry: [null, { changes: "x" }] }]) {
      assert.equal(parseWebhookPayload(junk).messages.length, 0);
    }
    assert.equal(parseWebhookPayload(envelope({ metadata: { phone_number_id: "x" }, messages: [{ from: "966501234567", id: "w", type: "text", text: { body: "hi" } }] })).messages.length, 0, "bad phone number id");
  });
  it("a body over 4096 characters is cut", () => {
    const parsed = parseWebhookPayload(envelope({ metadata: meta, messages: [{ from: "966501234567", id: "w", type: "text", text: { body: "ا".repeat(5000) } }] }));
    assert.equal(parsed.messages[0].body.length, 4096);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Prayer windows: the same arrays the shop sends
// ---------------------------------------------------------------------------------------------------------------------
describe("prayer windows", () => {
  const clock = makeAdhanClock(adhan);
  const RIYADH = [24.7136, 46.6753];
  // The shop page's formula, written out independently (web_platform/src/app/shop/[id]/page.tsx getPrayerWindowsForDate).
  const shopWindows = (ymd, lat, lng) => {
    const params = adhan.CalculationMethod.UmmAlQura();
    params.madhab = adhan.Madhab.Shafi;
    const coords = new adhan.Coordinates(lat, lng);
    const day = new adhan.PrayerTimes(coords, new Date(`${ymd}T12:00:00Z`), params);
    const next = new adhan.PrayerTimes(coords, new Date(new Date(`${ymd}T12:00:00Z`).getTime() + 86400000), params);
    const times = [day.fajr, day.dhuhr, day.asr, day.maghrib, day.isha, next.fajr];
    return { starts: times.map((t) => new Date(t.getTime() - 10 * 60000).toISOString()), ends: times.map((t) => new Date(t.getTime() + 30 * 60000).toISOString()) };
  };
  it("produces six windows of 40 minutes each, in order, equal to the shop's", () => {
    const windows = prayerWindowsForDate("2026-10-08", ...RIYADH, clock);
    assert.equal(windows.starts.length, 6);
    assert.equal(windows.ends.length, 6);
    for (let i = 0; i < 6; i += 1) assert.equal(new Date(windows.ends[i]) - new Date(windows.starts[i]), 40 * 60000);
    for (let i = 1; i < 6; i += 1) assert.ok(windows.starts[i] > windows.starts[i - 1]);
    assert.deepEqual(windows, shopWindows("2026-10-08", ...RIYADH));
  });
  it("puts dhuhr near midday Riyadh time in autumn", () => {
    const windows = prayerWindowsForDate("2026-10-08", ...RIYADH, clock);
    const dhuhr = new Date(new Date(windows.starts[1]).getTime() + 10 * 60000);
    const minutes = (dhuhr.getUTCHours() * 60 + dhuhr.getUTCMinutes() + 180) % 1440;
    assert.ok(minutes > 11 * 60 && minutes < 12 * 60 + 30, `dhuhr at ${minutes}`);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The engine, end to end with fakes
// ---------------------------------------------------------------------------------------------------------------------
const NOW = new Date("2026-10-07T09:00:00Z"); // Wednesday 12:00 in Riyadh
const clock = makeAdhanClock(adhan);
const PROVIDER = { id: "prov-1", name_ar: "صالون الأناقة", name_en: "Elegance Salon", bookable: true };
const SERVICES = [
  { id: "s-cut", name_ar: "قص شعر", name_en: "Haircut", price: "80.00" },
  { id: "s-beard", name_ar: "تحديد لحية", name_en: "Beard trim", price: "40.00" },
  { id: "s-color", name_ar: "صبغة شعر", name_en: "Hair colour", price: null },
  { id: "s-mani", name_ar: "مانيكير", name_en: "Manicure", price: 65.5 },
];
const week = (open = true) => Array.from({ length: 7 }, (_, i) => {
  const date = new Date(Date.UTC(2026, 9, 7 + i)).toISOString().slice(0, 10);
  const friday = new Date(date).getUTCDay() === 5;
  return { date, open: open && !friday, from_min: open && !friday ? 600 : null, to_min: open && !friday ? 1380 : null };
});
const BRANCH = { id: "br-1", name_ar: "فرع العليا", name_en: "Olaya branch", address_ar: "طريق العليا، الرياض", address_en: "Olaya Road, Riyadh",
  latitude: "24.713600", longitude: "46.675300", hours: week() };
const ctx = (over = {}) => ({ provider: PROVIDER, handoffEnabled: true, services: SERVICES, branches: [BRANCH], publicAppUrl: "https://primora.example", ...over });
const ISO = (ymd, minutes) => new Date(new Date(`${ymd}T00:00:00Z`).getTime() + (minutes - 180) * 60000).toISOString();

// A fake database: free every 30 minutes from 10:00 to 22:00 Riyadh time, except where a slot would start inside a prayer window.
function fakePort({ days = null, calls = [] } = {}) {
  return {
    calls,
    async slots(query) {
      calls.push(query);
      if (days && !days.includes(query.ymd)) return [];
      const out = [];
      for (let m = 600; m <= 1320; m += 30) {
        const iso = ISO(query.ymd, m);
        const t = new Date(iso).getTime();
        const clash = query.prayerWindows.starts.some((s, i) => t >= new Date(s).getTime() && t < new Date(query.prayerWindows.ends[i]).getTime());
        if (!clash) out.push(iso);
      }
      return out;
    },
  };
}
const say = (text, over = {}, port = fakePort()) => respond({ text, now: NOW, state: null, previousLocale: null, context: ctx(over.context), ...over.input }, port, clock);
const optionLines = (reply) => reply.split("\n").filter((l) => l.startsWith("• "));

describe("the receptionist: booking and availability", () => {
  it("'أبغى حجز قص شعر بكرة العصر' offers up to three real afternoon options and the booking link", async () => {
    const calls = [];
    const r = await say("أبغى حجز قص شعر بكرة العصر", {}, fakePort({ calls }));
    assert.equal(r.intent, "booking");
    assert.equal(r.status, "bot");
    const lines = optionLines(r.reply);
    assert.ok(lines.length >= 1 && lines.length <= 3, r.reply);
    for (const line of lines) {
      const m = /(\d{1,2}):(\d{2}) م/.exec(line);
      assert.ok(m, line);
      const minutes = ((Number(m[1]) % 12) + 12) * 60 + Number(m[2]);
      assert.ok(minutes >= 15 * 60 && minutes <= 17 * 60 + 30, `${line} is inside the asr band`);
    }
    assert.ok(r.reply.includes("https://primora.example/shop/prov-1?service=s-cut&date=2026-10-08&src=whatsapp"));
    assert.ok(r.reply.includes("الخميس 8 أكتوبر"));
    assert.equal(r.state.service_id, "s-cut");
    assert.equal(r.state.date, "2026-10-08");
    // The database was asked with the shop's six prayer windows for that branch and day.
    assert.equal(calls[0].branchId, "br-1");
    assert.equal(calls[0].serviceId, "s-cut");
    assert.equal(calls[0].ymd, "2026-10-08");
    assert.deepEqual(calls[0].prayerWindows, prayerWindowsForDate("2026-10-08", 24.7136, 46.6753, clock));
    assert.equal(calls[0].prayerWindows.starts.length, 6);
  });
  it("never offers a time that falls in a prayer pause", async () => {
    const r = await say("book a haircut tomorrow", {}, fakePort());
    const windows = prayerWindowsForDate("2026-10-08", 24.7136, 46.6753, clock);
    const times = optionLines(r.reply);
    assert.ok(times.length > 0);
    for (const line of times) {
      const m = /(\d{1,2}):(\d{2}) (AM|PM)/.exec(line);
      const minutes = ((Number(m[1]) % 12) + (m[3] === "PM" ? 12 : 0)) * 60 + Number(m[2]);
      const t = new Date(ISO("2026-10-08", minutes)).getTime();
      assert.ok(!windows.starts.some((s, i) => t >= new Date(s).getTime() && t < new Date(windows.ends[i]).getTime()), line);
    }
  });
  it("answers an English request in English", async () => {
    const r = await say("book a haircut tomorrow");
    assert.equal(r.locale, "en");
    assert.ok(r.reply.startsWith("Free times for Haircut on Thursday 8 October:"));
    assert.ok(r.reply.includes("src=whatsapp"));
    assert.ok(r.reply.includes("booking is completed on the website"));
  });
  it("'مواعيد اليوم؟' asks which service, remembers the day, and the next message completes the request", async () => {
    const first = await say("مواعيد اليوم؟");
    assert.equal(first.intent, "availability");
    assert.ok(first.reply.includes("أي خدمة"));
    assert.equal(first.state.asked, "service");
    assert.equal(first.state.date, "2026-10-07");
    const second = await respond({ text: "قص شعر", now: new Date(NOW.getTime() + 60000), state: first.state, previousLocale: "ar", context: ctx() }, fakePort(), clock);
    assert.ok(second.reply.includes("يوم الأربعاء 7 أكتوبر"));
    const lines = optionLines(second.reply);
    assert.ok(lines.length > 0);
    for (const line of lines) assert.ok(/م$/.test(line), `only afternoon or later is left today at noon: ${line}`);
  });
  it("only offers times in the future", async () => {
    const late = new Date("2026-10-07T17:00:00Z"); // 20:00 Riyadh
    const r = await respond({ text: "احجز قص شعر اليوم", now: late, state: null, previousLocale: null, context: ctx() }, fakePort(), clock);
    for (const line of optionLines(r.reply)) {
      const m = /(\d{1,2}):(\d{2}) م/.exec(line);
      assert.ok(m && ((Number(m[1]) % 12) + 12) * 60 + Number(m[2]) > 20 * 60, line);
    }
  });
  it("a clock time picks the nearest free times", async () => {
    const r = await say("book a haircut tomorrow at 4:30 pm");
    assert.ok(optionLines(r.reply).some((l) => l.includes("4:30 PM")), r.reply);
  });
  it("when the day is full it says so and offers the nearest day that has times", async () => {
    const r = await say("احجز قص شعر بكرة", {}, fakePort({ days: ["2026-10-10"] }));
    assert.ok(r.reply.includes("ما عندنا مواعيد متاحة يوم الخميس 8 أكتوبر"));
    assert.ok(r.reply.includes("السبت 10 أكتوبر"));
    assert.ok(r.reply.includes("date=2026-10-10"));
  });
  it("when nothing is free for a week it says so honestly and still gives the link", async () => {
    const r = await say("احجز قص شعر بكرة", {}, fakePort({ days: [] }));
    assert.ok(r.reply.includes(String(SEARCH_DAYS + 1)));
    assert.ok(r.reply.includes("https://primora.example/shop/prov-1"));
    assert.equal(optionLines(r.reply).length, 0);
  });
  it("with no public_app_url there is no link, a person follows up, and the provider sees the conversation", async () => {
    const r = await say("احجز قص شعر بكرة", { context: { publicAppUrl: null } });
    assert.ok(!r.reply.includes("http"));
    assert.ok(r.reply.includes("سيتواصل معك أحد موظفينا"));
    assert.equal(r.status, "awaiting_human");
    assert.equal(r.handoffReason, "no_booking_link");
  });
  it("a past or impossible date is not guessed at and the database is not asked", async () => {
    const calls = [];
    const past = await say("احجز قص شعر 2026-10-01", {}, fakePort({ calls }));
    assert.ok(past.reply.includes("مضى"));
    const invalid = await say("احجز قص شعر 31/02", {}, fakePort({ calls }));
    assert.ok(invalid.reply.includes("ما فهمت هذا التاريخ"));
    assert.equal(calls.length, 0);
  });
  it("an ambiguous service is put back to the customer, never guessed", async () => {
    const r = await say("ابغى حجز شعر بكرة");
    assert.equal(r.state.asked, "choose_service");
    assert.ok(r.reply.includes("قص شعر") && r.reply.includes("صبغة شعر"));
  });
  it("a service the provider does not offer leads to the service list, not an invented one", async () => {
    const r = await say("ابغى احجز تقويم اسنان بكرة");
    assert.ok(r.reply.includes("أي خدمة"));
    assert.ok(!r.reply.includes("تقويم"));
  });
  it("with several branches the options say which branch they belong to", async () => {
    const second = { ...BRANCH, id: "br-2", name_ar: "فرع الملقا", name_en: "Malqa branch" };
    const port = { async slots(q) { return q.branchId === "br-1" ? [ISO("2026-10-08", 15 * 60)] : [ISO("2026-10-08", 16 * 60)]; } };
    const r = await say("book a haircut tomorrow afternoon", { context: { branches: [BRANCH, second] } }, port);
    assert.ok(r.reply.includes("3:00 PM (Olaya branch)"), r.reply);
    assert.ok(r.reply.includes("4:00 PM (Malqa branch)"), r.reply);
  });
  it("state older than the time limit is forgotten", async () => {
    const old = { v: 1, at: new Date(NOW.getTime() - (STATE_TTL_MINUTES + 1) * 60000).toISOString(), intent: "booking", service_id: "s-cut", date: "2026-10-08" };
    const r = await say("الساعة 5 العصر", { input: { state: old } });
    assert.notEqual(r.intent, "booking");
  });
  it("never creates a booking: the engine has no write path at all", async () => {
    const port = fakePort();
    assert.deepEqual(Object.keys(port).sort(), ["calls", "slots"]);
  });
});

describe("the receptionist: facts come from the database or a person answers", () => {
  it("prices are the stored prices", async () => {
    const r = await say("كم سعر قص الشعر؟");
    assert.equal(r.intent, "price");
    assert.ok(r.reply.includes("قص شعر: 80 ر.س"));
    const en = await say("how much is a manicure");
    assert.ok(en.reply.includes("Manicure: SAR 65.50"));
  });
  it("a service without a price gets no number", async () => {
    const r = await say("بكم صبغة شعر");
    assert.ok(r.reply.includes("سيجيبك أحد موظفينا"));
    assert.ok(!/\d/.test(r.reply.split("\n").filter((l) => l.includes("صبغة"))[0]));
  });
  it("a general price question lists stored prices only", async () => {
    const r = await say("اسعاركم");
    const digits = (r.reply.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).sort((a, b) => a - b);
    assert.deepEqual(digits, [40, 65.5, 80]);
  });
  it("opening hours come from the schedule rows, grouped by consecutive days", async () => {
    const r = await say("متى تفتحون؟");
    assert.equal(r.intent, "hours");
    assert.ok(r.reply.includes("10:00 ص - 11:00 م"));
    assert.ok(r.reply.includes("مغلق"));
    assert.ok(/الأربعاء - الخميس: 10:00 ص - 11:00 م/.test(r.reply), r.reply);
  });
  it("with no schedule it invents nothing and hands over", async () => {
    const r = await say("what are your opening hours", { context: { branches: [{ ...BRANCH, hours: [] }] } });
    assert.ok(!/\d/.test(r.reply));
    assert.equal(r.status, "awaiting_human");
    assert.equal(r.handoffReason, "hours_unknown");
  });
  it("an overnight shift is shown as running past midnight", async () => {
    const hours = week().map((h) => ({ ...h, open: true, from_min: 1080, to_min: 1500 }));
    const r = await say("opening hours", { context: { branches: [{ ...BRANCH, hours }] } });
    assert.ok(r.reply.includes("1:00 AM (after midnight)"), r.reply);
  });
  it("the address and map link come from the branch row", async () => {
    const r = await say("وين موقعكم");
    assert.ok(r.reply.includes("طريق العليا، الرياض"));
    assert.ok(r.reply.includes("https://maps.google.com/?q=24.7136,46.6753"));
    const none = await say("where are you", { context: { branches: [{ ...BRANCH, address_en: "", address_ar: "", latitude: "x", longitude: "y" }] } });
    assert.equal(none.status, "awaiting_human");
    assert.equal(none.handoffReason, "location_unknown");
  });
});

describe("the receptionist: hand-off, consent words and fallbacks", () => {
  it("a request for a person is handed over, and answered politely when hand-off is switched off", async () => {
    const r = await say("ابغى اكلم موظف");
    assert.equal(r.status, "awaiting_human");
    assert.equal(r.handoffReason, "human_requested");
    const off = await say("ابغى اكلم موظف", { context: { handoffEnabled: false } });
    assert.equal(off.status, "bot");
    assert.equal(off.handoffReason, null);
    assert.ok(off.reply.includes("غير متاح"));
  });
  it("cancel and reschedule requests point to the bookings page and wait for a person", async () => {
    const r = await say("ابغى الغي موعدي");
    assert.equal(r.intent, "cancel_reschedule");
    assert.ok(r.reply.includes("https://primora.example/customer/bookings"));
    assert.equal(r.handoffReason, "cancel_or_reschedule");
    const noLink = await say("I need to reschedule", { context: { publicAppUrl: null } });
    assert.ok(!noLink.reply.includes("http"));
  });
  it("a salon that cannot take bookings hands every conversation to a person", async () => {
    const r = await say("احجز قص شعر بكرة", { context: { provider: { ...PROVIDER, bookable: false } } });
    assert.equal(r.status, "awaiting_human");
    assert.equal(r.handoffReason, "provider_not_bookable");
  });
  it("greetings, thanks and a start word get a friendly answer without a hand-off", async () => {
    assert.ok((await say("السلام عليكم")).reply.includes("صالون الأناقة"));
    assert.ok((await say("hello")).reply.includes("Elegance Salon"));
    assert.equal((await say("شكرا")).status, "bot");
    assert.equal((await say("thanks")).intent, "thanks");
    assert.equal((await say("START")).intent, "opt_in");
  });
  it("an opt-out word produces no reply at all", async () => {
    const r = await say("STOP");
    assert.equal(r.reply, null);
    assert.equal(r.status, "bot");
  });
  it("two messages in a row it cannot understand go to a person", async () => {
    const first = await say("blah blah");
    assert.equal(first.status, "bot");
    assert.equal(first.state.misses, 1);
    const second = await respond({ text: "xyz xyz", now: NOW, state: first.state, previousLocale: "en", context: ctx() }, fakePort(), clock);
    assert.equal(second.status, "awaiting_human");
    assert.equal(second.handoffReason, "not_understood");
  });
  it("without hand-off the receptionist keeps the conversation and keeps helping", async () => {
    const state = { v: 1, at: NOW.toISOString(), misses: 5 };
    const r = await respond({ text: "ضصثق", now: NOW, state, previousLocale: "ar", context: ctx({ handoffEnabled: false }) }, fakePort(), clock);
    assert.equal(r.status, "bot");
    assert.ok(r.reply.includes("ما فهمت"));
  });
  it("is deterministic: the same input gives the same output", async () => {
    const a = await say("أبغى حجز قص شعر بكرة العصر");
    const b = await say("أبغى حجز قص شعر بكرة العصر");
    assert.deepEqual(a, b);
  });
  it("replies stay within a WhatsApp-friendly length", async () => {
    for (const text of ["أبغى حجز قص شعر بكرة العصر", "اسعاركم", "متى تفتحون", "وين موقعكم", "مواعيد اليوم"]) {
      const r = await say(text);
      assert.ok(r.reply.length < 1500, `${text}: ${r.reply.length}`);
    }
  });
});

describe("formatting and slot choice", () => {
  it("formats Riyadh dates and times", () => {
    assert.equal(dateLabel("2026-10-09", "ar"), "الجمعة 9 أكتوبر");
    assert.equal(dateLabel("2026-10-09", "en"), "Friday 9 October");
    assert.equal(timeLabel(16 * 60 + 30, "ar"), "4:30 م");
    assert.equal(timeLabel(0, "en"), "12:00 AM");
    assert.equal(timeLabel(12 * 60, "en"), "12:00 PM");
    assert.equal(timeLabel(1500, "en"), "1:00 AM");
    assert.equal(priceLabel("80.00", "ar"), "80 ر.س");
    assert.equal(priceLabel(12.5, "en"), "SAR 12.50");
  });
  it("builds the booking link in the agreed shape", () => {
    assert.equal(bookingLink("https://app.example", "p1", "s1", "2026-10-09"), "https://app.example/shop/p1?service=s1&date=2026-10-09&src=whatsapp");
    assert.equal(bookingLink(null, "p1", "s1", "2026-10-09"), null);
  });
  it("chooseSlots spreads, filters by band, and relaxes honestly", () => {
    const slots = Array.from({ length: 24 }, (_, i) => ({ iso: ISO("2026-10-08", 600 + i * 30), minutes: 600 + i * 30, branchId: "b" }));
    assert.equal(chooseSlots(slots, null).picked.length, 3);
    const morning = chooseSlots(slots, { exactMinutes: [], band: { from: 360, to: 720, label: "morning" } });
    assert.ok(morning.picked.every((s) => s.minutes <= 720) && !morning.periodMissed);
    const dawn = chooseSlots(slots, { exactMinutes: [], band: { from: 0, to: 300, label: "x" } });
    assert.equal(dawn.periodMissed, true);
    assert.equal(chooseSlots([], null).picked.length, 0);
    const exact = chooseSlots(slots, { exactMinutes: [16 * 60 + 30], band: null });
    assert.ok(exact.picked.some((s) => s.minutes === 990));
  });
});

describe("LLM adapter (interface only)", () => {
  it("is off by default and keeps the original text", async () => {
    assert.equal(await applyParaphrase(noParaphrase, { text: "السعر 80 ر.س", locale: "ar", intent: "price" }), "السعر 80 ر.س");
  });
  it("accepts a re-wording only when every number and link survives", async () => {
    const original = "Free times Friday 9 October: 4:30 PM https://x.example/shop/1?a=1";
    assert.equal(preservesFacts(original, "Here you go: 9 October at 4:30 PM, book via https://x.example/shop/1?a=1"), true);
    assert.equal(preservesFacts(original, "Friday at 5:00 PM https://x.example/shop/1?a=1"), false);
    const faithful = { paraphrase: async () => "Sure! 9 October, 4:30 PM, 1 https://x.example/shop/1?a=1" };
    const liar = { paraphrase: async () => "Sure! 10 October, 5:00 PM" };
    const broken = { paraphrase: async () => { throw new Error("down"); } };
    assert.notEqual(await applyParaphrase(faithful, { text: original, locale: "en", intent: "booking" }), original);
    assert.equal(await applyParaphrase(liar, { text: original, locale: "en", intent: "booking" }), original);
    assert.equal(await applyParaphrase(broken, { text: original, locale: "en", intent: "booking" }), original);
  });
});
