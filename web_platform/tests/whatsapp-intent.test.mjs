import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, classifyIntent, detectLocale, isOptInText, isOptOutText, normalizeText, parseDate, parseMessage, parseTimeOfDay, riyadhYmd, weekday,
} from "../../supabase/functions/_shared/whatsapp-intent.ts";

// 2026-10-07 12:00 in Riyadh is a Wednesday (UTC 09:00).
const NOW = new Date("2026-10-07T09:00:00Z");
const SERVICES = [
  { id: "s-cut", name_ar: "قص شعر", name_en: "Haircut" },
  { id: "s-beard", name_ar: "تحديد لحية", name_en: "Beard trim" },
  { id: "s-color", name_ar: "صبغة شعر", name_en: "Hair colour" },
  { id: "s-mani", name_ar: "مانيكير", name_en: "Manicure" },
  { id: "s-massage", name_ar: "مساج استرخاء", name_en: "Relaxation massage" },
];
const parse = (text) => parseMessage(text, { now: NOW, services: SERVICES });

describe("normalisation", () => {
  it("folds alef, ya, ta marbuta, tashkeel, tatweel and Arabic-Indic digits", () => {
    assert.equal(normalizeText("إِلْغَاء"), "الغاء");
    assert.equal(normalizeText("أبغى حجز"), "ابغي حجز"); // alef-hamza and alef maqsura folded
    assert.equal(normalizeText("الساعة ٥:٣٠"), "الساعه 5:30");
    assert.equal(normalizeText("الساعة ۵"), "الساعه 5");
    assert.equal(normalizeText("مرحباااااا"), "مرحبا");
    assert.equal(normalizeText("هلا!!! كيف الحال؟"), "هلا كيف الحال");
    assert.equal(normalizeText("  Book   A  Haircut. "), "book a haircut");
    assert.equal(normalizeText("جـــمعة"), "جمعه");
  });
  it("detects the language by script", () => {
    assert.equal(detectLocale("أبغى حجز"), "ar");
    assert.equal(detectLocale("book a haircut"), "en");
    assert.equal(detectLocale("12345"), null);
  });
});

describe("opt out and opt in match the whole message only", () => {
  for (const text of ["STOP", "stop", "Stop.", "إيقاف", "ايقاف", "الغاء الاشتراك", "إلغاء الاشتراك", "unsubscribe"]) {
    it(`opt-out: ${text}`, () => assert.equal(isOptOutText(text), true));
  }
  for (const text of ["START", "ابدأ", "اشتراك", "subscribe"]) {
    it(`opt-in: ${text}`, () => assert.equal(isOptInText(text), true));
  }
  it("a sentence containing a stop word is not an opt-out", () => {
    assert.equal(isOptOutText("please do not stop the booking"), false);
    assert.equal(isOptOutText("ايقاف الحجز"), false);
    assert.equal(parse("ابغى الغاء الحجز").intent, "cancel_reschedule");
  });
});

// Each row: [utterance, expected intent, expected service id or null, expected date or null].
const CORPUS = [
  ["أبغى حجز قص شعر بكرة العصر", "booking", "s-cut", "2026-10-08"],
  ["مواعيد اليوم؟", "availability", null, "2026-10-07"],
  ["book a haircut tomorrow", "booking", "s-cut", "2026-10-08"],
  ["ابي احجز قصة شعر بكرا الساعة ٥ العصر", "booking", "s-cut", "2026-10-08"],
  ["السلام عليكم", "greeting", null, null],
  ["هلا والله", "greeting", null, null],
  ["hello", "greeting", null, null],
  ["Good evening", "greeting", null, null],
  ["كم سعر قص الشعر؟", "price", "s-cut", null],
  ["بكم المانيكير", "price", "s-mani", null],
  ["how much is a beard trim", "price", "s-beard", null],
  ["اسعاركم", "price", null, null],
  ["متى تفتحون؟", "hours", null, null],
  ["مواعيد العمل", "hours", null, null],
  ["what are your opening hours", "hours", null, null],
  ["وش اوقات الدوام", "hours", null, null],
  ["وين موقعكم", "location", null, null],
  ["where are you located", "location", null, null],
  ["ابغى العنوان", "location", null, null],
  ["لوكيشن", "location", null, null],
  ["ابغى الغي موعدي", "cancel_reschedule", null, null],
  ["I need to reschedule my appointment", "cancel_reschedule", null, null],
  ["كنسل الحجز لو سمحت", "cancel_reschedule", null, null],
  ["ابغى اغير موعدي", "cancel_reschedule", null, null],
  ["ابغى اكلم موظف", "human", null, null],
  ["can I talk to a person", "human", null, null],
  ["كلمني احد من فضلك", "human", null, null],
  ["خدمة العملاء", "human", null, null],
  ["STOP", "opt_out", null, null],
  ["إيقاف", "opt_out", null, null],
  ["الغاء الاشتراك", "opt_out", null, null],
  ["START", "opt_in", null, null],
  ["هل في موعد متاح الجمعة؟", "availability", null, "2026-10-09"],
  ["do you have any slots on Friday", "availability", null, "2026-10-09"],
  ["فيه مواعيد فاضية بعد بكرة؟", "availability", null, "2026-10-09"],
  ["ودي احجز مساج الخميس", "booking", "s-massage", "2026-10-08"],
  ["ابغى صبغة شعر بعد بكره", "booking", "s-color", "2026-10-09"],
  ["I want to book a manicure next Friday", "booking", "s-mani", "2026-10-16"],
  ["ابي موعد حلاقة لحية يوم السبت", "booking", "s-beard", "2026-10-10"],
  ["بغيت احجز قص شعر ١٢ اكتوبر", "booking", "s-cut", "2026-10-12"],
  ["book haircut 15/10", "booking", "s-cut", "2026-10-15"],
  ["احجزلي قص شعر ٢٠٢٦-١٠-٢٠", "booking", "s-cut", "2026-10-20"],
  ["مانيكر بكرة", "booking", "s-mani", "2026-10-08"],
  ["قص شعر", "booking", "s-cut", null],
  ["haircut please", "booking", "s-cut", null],
  ["فاضي اليوم؟", "availability", null, "2026-10-07"],
  ["Is there anything free today?", "availability", null, "2026-10-07"],
  ["أبي أحجز عندكم يوم الثلاثاء الجاي", "booking", null, "2026-10-13"],
  ["مرحبا ابغى احجز", "booking", null, null],
  ["هلا ابي اعرف الاسعار", "price", null, null],
  ["???", "unknown", null, null],
  ["شكرا", "unknown", null, null],
];

describe("corpus of Arabic (including Gulf dialect) and English utterances", () => {
  for (const [text, intent, service, date] of CORPUS) {
    it(`${JSON.stringify(text)} -> ${intent}`, () => {
      const parsed = parse(text);
      assert.equal(parsed.intent, intent, `intent for ${text} (normalised: ${parsed.normalized})`);
      assert.equal(parsed.services[0]?.service.id ?? null, service, `service for ${text}`);
      assert.equal(parsed.date?.ymd ?? null, date, `date for ${text}`);
    });
  }
  it("is large enough", () => assert.ok(CORPUS.length >= 40));
});

describe("service matching", () => {
  it("is exact for the full Arabic or English name", () => {
    assert.equal(parse("قص شعر").services[0].score, 1);
    assert.equal(parse("Beard trim").services[0].service.id, "s-beard");
  });
  it("tolerates a spelling slip within a small edit distance", () => {
    assert.equal(parse("ابغى مانيكيير").services[0]?.service.id, "s-mani");
    assert.equal(parse("manicur tomorrow").services[0]?.service.id, "s-mani");
    assert.equal(parse("hair cutt").services[0]?.service.id, "s-cut");
  });
  it("treats everyday synonyms as the same word", () => {
    assert.equal(parse("حلاقة شعر").services[0]?.service.id, "s-cut");
    assert.equal(parse("hair cut").services[0]?.service.id, "s-cut");
    assert.equal(parse("لحية").services[0]?.service.id, "s-beard");
  });
  it("reports several candidates when the message is ambiguous, never guesses between equals", () => {
    const parsed = parseMessage("شعر", { now: NOW, services: SERVICES });
    const ids = parsed.services.map((m) => m.service.id);
    assert.ok(ids.includes("s-cut") && ids.includes("s-color"));
    assert.equal(parsed.services[0].score, parsed.services[1].score);
  });
  it("returns nothing for a service the provider does not offer", () => {
    assert.equal(parse("ابغى تقويم اسنان").services.length, 0);
  });
});

describe("dates resolve in Asia/Riyadh", () => {
  it("uses the Riyadh calendar day, not the UTC one", () => {
    const lateUtc = new Date("2026-10-07T22:30:00Z"); // 01:30 on the 8th in Riyadh
    assert.equal(riyadhYmd(lateUtc), "2026-10-08");
    assert.equal(parseDate(normalizeText("اليوم"), lateUtc).date.ymd, "2026-10-08");
    assert.equal(parseDate(normalizeText("بكرة"), lateUtc).date.ymd, "2026-10-09");
  });
  it("today, tomorrow, the day after tomorrow", () => {
    assert.equal(parseDate("today", NOW).date.ymd, "2026-10-07");
    assert.equal(parseDate(normalizeText("بكرة"), NOW).date.source, "tomorrow");
    assert.equal(parseDate(normalizeText("بعد بكرة"), NOW).date.source, "day_after_tomorrow");
    assert.equal(parseDate("day after tomorrow", NOW).date.ymd, "2026-10-09");
    assert.equal(parseDate(normalizeText("وبكرا"), NOW).date.ymd, "2026-10-08");
  });
  it("weekday names: the coming one, today if it is that day, and 'next' meaning next Sunday-based week", () => {
    assert.equal(weekday("2026-10-07"), 3);
    assert.equal(parseDate(normalizeText("الاربعاء"), NOW).date.ymd, "2026-10-07");
    assert.equal(parseDate(normalizeText("الخميس"), NOW).date.ymd, "2026-10-08");
    assert.equal(parseDate(normalizeText("الاحد"), NOW).date.ymd, "2026-10-11");
    assert.equal(parseDate("friday", NOW).date.ymd, "2026-10-09");
    assert.equal(parseDate("next friday", NOW).date.ymd, "2026-10-16");
    assert.equal(parseDate("next sunday", NOW).date.ymd, "2026-10-11");
    assert.equal(parseDate(normalizeText("الجمعة الجاية"), NOW).date.ymd, "2026-10-16");
  });
  it("explicit dates, month names in both languages, and rolling over to next year", () => {
    assert.equal(parseDate("12/10", NOW).date.ymd, "2026-10-12");
    assert.equal(parseDate("5-11-2026", NOW).date.ymd, "2026-11-05");
    assert.equal(parseDate("2026-12-01", NOW).date.ymd, "2026-12-01");
    assert.equal(parseDate("on 20 october", NOW).date.ymd, "2026-10-20");
    assert.equal(parseDate("october 20", NOW).date.ymd, "2026-10-20");
    assert.equal(parseDate(normalizeText("٢٥ نوفمبر"), NOW).date.ymd, "2026-11-25");
    assert.equal(parseDate(normalizeText("3 تشرين الثاني"), NOW).date.ymd, "2026-11-03");
    assert.equal(parseDate("2/1", NOW).date.ymd, "2027-01-02");
  });
  it("rejects a day that does not exist or has passed, instead of guessing", () => {
    assert.equal(parseDate("31/02", NOW).problem, "invalid");
    assert.equal(parseDate("2026-10-01", NOW).problem, "past");
    assert.equal(parseDate("2026-10-01", NOW).date, null);
    assert.equal(parseDate("29/02/2027", NOW).problem, "invalid");
  });
  it("relative offsets", () => {
    assert.equal(parseDate("in 3 days", NOW).date.ymd, "2026-10-10");
    assert.equal(parseDate(normalizeText("بعد 3 ايام"), NOW).date.ymd, "2026-10-10");
    assert.equal(parseDate(normalizeText("بعد اسبوع"), NOW).date.ymd, "2026-10-14");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  });
});

describe("time of day", () => {
  const time = (text) => parseTimeOfDay(normalizeText(text));
  it("part-of-day words become bands", () => {
    assert.equal(time("العصر").band.label, "asr");
    assert.equal(time("بعد العصر").band.label, "after_asr");
    assert.equal(time("صباحا").band.label, "morning");
    assert.equal(time("ظهرا").band.label, "noon");
    assert.equal(time("مساء").band.label, "evening");
    assert.equal(time("بعد المغرب").band.label, "after_maghrib");
    assert.equal(time("in the evening").band.label, "evening");
    assert.equal(time("بالعصر").band.label, "asr");
    assert.equal(time("ابغى موعد"), null);
  });
  it("clock times in both digit systems", () => {
    assert.deepEqual(time("17:30").exactMinutes, [17 * 60 + 30]);
    assert.deepEqual(time("الساعة ٥ العصر").exactMinutes, [17 * 60]);
    assert.deepEqual(time("الساعة 5 مساء").exactMinutes, [17 * 60]);
    assert.deepEqual(time("at 5pm").exactMinutes, [17 * 60]);
    assert.deepEqual(time("5:30 pm").exactMinutes, [17 * 60 + 30]);
    assert.deepEqual(time("10 am").exactMinutes, [10 * 60]);
    assert.deepEqual(time("٩ صباحا").exactMinutes, [9 * 60]);
    assert.deepEqual(time("الساعة 3").exactMinutes, [15 * 60]);
    assert.deepEqual(time("الساعة ١٢ ظهرا").exactMinutes, [12 * 60]);
    assert.deepEqual(time("الساعة 1 ظهرا").exactMinutes, [13 * 60]);
  });
  it("halves and quarters in dialect", () => {
    assert.deepEqual(time("الساعة 4 ونص").exactMinutes, [16 * 60 + 30]);
    assert.deepEqual(time("الساعة 4 وربع").exactMinutes, [16 * 60 + 15]);
    assert.deepEqual(time("الساعة خمسة ونص").exactMinutes, [17 * 60 + 30]);
  });
  it("keeps both readings when am or pm was not said and both are plausible", () => {
    assert.deepEqual(time("الساعة 9").exactMinutes, [9 * 60, 21 * 60]);
    assert.deepEqual(time("at 8").exactMinutes, [8 * 60, 20 * 60]);
  });
  it("does not read a date as a time", () => {
    const parsed = parse("ابغى حجز قص شعر ١٢ اكتوبر");
    assert.equal(parsed.time, null);
    assert.equal(parse("book haircut 15/10").time, null);
  });
  it("a full request carries date, service and time together", () => {
    const parsed = parse("أبغى حجز قص شعر بكرة العصر");
    assert.equal(parsed.time.band.label, "asr");
    assert.equal(parsed.date.ymd, "2026-10-08");
    const exact = parse("book a haircut tomorrow at 4:30 pm");
    assert.deepEqual(exact.time.exactMinutes, [16 * 60 + 30]);
  });
});

describe("classification details", () => {
  it("an opening-hours question is not an availability question", () => {
    assert.equal(parse("مواعيد العمل").intent, "hours");
    assert.equal(parse("مواعيد اليوم").intent, "availability");
  });
  it("empty input is unknown", () => {
    assert.equal(classifyIntent("", false, false), "unknown");
    assert.equal(parse("   ").intent, "unknown");
  });
  it("is deterministic", () => {
    assert.deepEqual(parse("أبغى حجز قص شعر بكرة العصر"), parse("أبغى حجز قص شعر بكرة العصر"));
  });
});
