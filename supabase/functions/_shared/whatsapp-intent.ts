// Deterministic understanding of a customer's WhatsApp message (Arabic, Gulf dialect and English). No language model.
// Pure TypeScript with no Deno globals and no remote imports, so a node test imports it directly.
//
// parseMessage() turns a text into: an intent, the services of the provider it names, a date and a time-of-day, all resolved
// in Asia/Riyadh (UTC+3, no daylight saving). Nothing here reads a database or the clock: the caller passes `now`.

export type Intent =
  | "booking"
  | "availability"
  | "price"
  | "hours"
  | "location"
  | "cancel_reschedule"
  | "human"
  | "greeting"
  | "opt_out"
  | "opt_in"
  | "unknown"

export type Locale = "ar" | "en"

export interface ServiceRef {
  id: string
  name_ar: string
  name_en: string
}

export interface ServiceMatch {
  service: ServiceRef
  /** 0..1: share of the service-name words found in the message (1 = every word). */
  score: number
}

export interface DateResolution {
  /** YYYY-MM-DD in Asia/Riyadh. */
  ymd: string
  source: "today" | "tomorrow" | "day_after_tomorrow" | "weekday" | "next_weekday" | "explicit" | "relative"
}

export interface TimeResolution {
  /** Exact clock times asked for (minutes after midnight, Riyadh). Two entries when am/pm was not said and both are plausible. */
  exactMinutes: number[]
  /** A band the customer described in words ("العصر"), minutes after midnight, or null. */
  band: { from: number; to: number; label: string } | null
}

export interface ParsedMessage {
  intent: Intent
  locale: Locale
  normalized: string
  services: ServiceMatch[]
  date: DateResolution | null
  /** Set when a date was written but cannot be used ("past" = before today in Riyadh, "invalid" = no such calendar day). */
  dateProblem: "past" | "invalid" | null
  time: TimeResolution | null
}

const RIYADH_OFFSET_MINUTES = 180

// ---------------------------------------------------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------------------------------------------------

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩"
const EXTENDED_INDIC = "۰۱۲۳۴۵۶۷۸۹"

/**
 * Lower-cases, folds Arabic letter variants (alef with hamza/madda, alef maqsura, ta marbuta, hamza carriers, Persian yeh/kaf),
 * removes tashkeel and tatweel, converts Arabic-Indic digits to ASCII, collapses elongated letters and turns punctuation into spaces
 * (keeping : . / - @ + inside tokens that may be times and dates).
 */
export function normalizeText(input: string): string {
  let text = String(input ?? "").normalize("NFKC")
  text = text.replace(/[ً-ٰٟۖ-ۭـ]/g, "")
  let out = ""
  for (const ch of text) {
    const indic = ARABIC_INDIC.indexOf(ch)
    if (indic >= 0) { out += String(indic); continue }
    const extended = EXTENDED_INDIC.indexOf(ch)
    if (extended >= 0) { out += String(extended); continue }
    switch (ch) {
      case "أ": case "إ": case "آ": case "ٱ": out += "ا"; break
      case "ى": case "ی": case "ئ": out += "ي"; break
      case "ة": out += "ه"; break
      case "ؤ": out += "و"; break
      case "ک": out += "ك"; break
      case "،": case "؛": out += ","; break
      case "؟": out += "?"; break
      default: out += ch
    }
  }
  out = out.toLowerCase()
  out = out.replace(/(.)\1{2,}/gu, "$1")
  out = out.replace(/[^\p{L}\p{N}:./\-@+\s]/gu, " ")
  // A sentence-ending dot or a dash used as punctuation is not part of a token.
  out = out.replace(/(^|\s)[.\-/:+@]+(?=\s|$)/g, " ").replace(/([^\d\s])[.](?=\s|$)/g, "$1 ")
  return out.replace(/\s+/g, " ").trim()
}

const ARABIC_LETTER = /[؀-ۿ]/g
const LATIN_LETTER = /[a-z]/gi

/** The language of the message: whichever script has more letters; null for a message without letters (digits only). */
export function detectLocale(text: string): Locale | null {
  const arabic = (text.match(ARABIC_LETTER) || []).length
  const latin = (text.match(LATIN_LETTER) || []).length
  if (arabic === 0 && latin === 0) return null
  return arabic >= latin ? "ar" : "en"
}

function tokensOf(normalized: string): string[] {
  return normalized ? normalized.split(" ") : []
}

/** One leading conjunction/preposition letter removed (وبكرا، بالعصر، للحلاقة), so lexicon words still match. */
function stripPrefix(token: string): string {
  if (token.startsWith("لل") && token.length > 3) return "ال" + token.slice(2)
  if (token.length > 3 && "وبلفك".includes(token[0])) return token.slice(1)
  return token
}

interface Haystack { plain: string; stripped: string }

function haystackOf(tokens: string[]): Haystack {
  return { plain: ` ${tokens.join(" ")} `, stripped: ` ${tokens.map(stripPrefix).join(" ")} ` }
}

function hasPhrase(h: Haystack, phrase: string): boolean {
  const needle = ` ${phrase} `
  return h.plain.includes(needle) || h.stripped.includes(needle)
}

function hasAny(h: Haystack, phrases: readonly string[]): boolean {
  return phrases.some((p) => hasPhrase(h, p))
}

const N = (list: readonly string[]): string[] => list.map(normalizeText)

// ---------------------------------------------------------------------------------------------------------------------
// Opt-out / opt-in (checked on the whole message: a sentence that merely contains "stop" is not an opt-out)
// ---------------------------------------------------------------------------------------------------------------------

const OPT_OUT_PHRASES = new Set(N([
  "stop", "stop all", "stop messages", "unsubscribe", "opt out", "optout", "cancel subscription", "unsubscribe me",
  "إيقاف", "ايقاف", "ايقاف الاشتراك", "إيقاف الاشتراك", "الغاء الاشتراك", "إلغاء الاشتراك", "الغاء اشتراك", "الغاء الاشتراك من فضلك",
  "ايقاف الرسائل", "ايقاف الرسايل",
]))
const OPT_IN_PHRASES = new Set(N(["start", "subscribe", "start messages", "ابدأ", "ابدا", "اشتراك", "اشترك", "ابدأ الاشتراك", "تفعيل الاشتراك"]))

export function isOptOutText(text: string): boolean {
  return OPT_OUT_PHRASES.has(normalizeText(text))
}

export function isOptInText(text: string): boolean {
  return OPT_IN_PHRASES.has(normalizeText(text))
}

// ---------------------------------------------------------------------------------------------------------------------
// Intent lexicons (every phrase is normalised once at load)
// ---------------------------------------------------------------------------------------------------------------------

const HUMAN = N([
  "human", "agent", "real person", "a person", "someone", "speak to", "talk to", "talk with", "speak with", "call me", "customer service",
  "manager", "operator", "receptionist", "representative", "staff",
  "موظف", "موظفه", "شخص", "حد يكلمني", "كلمني", "كلموني", "اكلم", "اتكلم مع", "ابغي اتكلم", "ابي اتكلم", "ابغى اتكلم", "خدمه العملاء",
  "خدمة العملاء", "المسؤول", "المدير", "مدير", "صاحب المحل", "اتصل بي", "اتصلوا", "اتصل علي", "ابغى مختص", "بشر", "انسان",
])

const CANCEL = N([
  "cancel", "reschedule", "change my appointment", "change my booking", "move my appointment", "move my booking", "postpone",
  "الغاء", "الغي", "الغيه", "الغاء الحجز", "كنسل", "كنسلو", "كنسله", "تغيير الموعد", "تعديل الموعد", "غير موعدي", "غيرو موعدي", "غير الموعد",
  "اغير موعدي", "اغير الموعد", "اغير حجزي", "اعدل موعدي", "اعدل الموعد", "اعدل حجزي", "ابدل موعدي", "غير حجزي", "تاجيل", "اجل موعدي", "اجل الموعد", "ابدل الموعد", "تبديل الموعد", "تقديم الموعد", "تاخير الموعد", "نقل الموعد", "نقل موعدي",
])

const HOURS = N([
  "opening hours", "working hours", "business hours", "open hours", "hours", "when do you open", "when do you close", "what time do you open",
  "what time do you close", "are you open", "do you open", "closing time", "opening time",
  "دوام", "الدوام", "وقت الدوام", "اوقات الدوام", "مواعيد العمل", "مواعيد الدوام", "اوقات العمل", "ساعات العمل", "متى تفتحون", "متى تفتح",
  "متى تقفلون", "متى تسكرون", "متى تغلقون", "تفتحون", "تقفلون", "تسكرون", "تغلقون", "وقت الفتح", "وقت الاغلاق", "مفتوح", "مفتوحين", "شغالين",
  "وش اوقات", "ايش اوقات", "ايش مواعيدكم", "وش مواعيدكم", "الى متى", "لين متى",
])

const LOCATION = N([
  "where are you", "where is", "location", "address", "directions", "map", "google maps", "how to get", "find you",
  "وين", "فين", "اين", "موقع", "الموقع", "موقعكم", "لوكيشن", "عنوان", "العنوان", "عنوانكم", "خريطه", "الخريطه", "قوقل ماب", "قوقل مابس",
  "كيف اوصل", "كيف اجيكم", "وين مكانكم", "وين تقعون", "وين محلكم", "وين الفرع", "مكانكم",
])

const PRICE = N([
  "price", "prices", "cost", "how much", "rates", "rate", "fee", "fees", "pricing", "charge",
  "سعر", "السعر", "اسعار", "الاسعار", "اسعاركم", "بكم", "بكام", "كم سعر", "كم تكلف", "كم يكلف", "كم تكلفه", "تكلفه", "التكلفه", "كم الحساب", "كم حقه",
  "كم حق", "كم قيمه", "كم يطلع", "كم ياخذ", "كم تاخذون", "قيمه", "تسعيره", "كم الاجمالي", "الحق كم",
])

const AVAILABILITY = N([
  "available", "availability", "any slots", "free slots", "open slots", "slots", "any openings", "free time", "next available", "earliest",
  "do you have", "anything free", "are there any",
  "متاح", "متاحه", "متوفر", "متوفره", "فاضي", "فاضيه", "فاضين", "مواعيد", "المواعيد", "اوقات", "الاوقات", "فيه موعد", "في موعد", "عندكم موعد",
  "عندكم مواعيد", "يوجد موعد", "فيه مواعيد", "في مواعيد", "اقرب موعد", "اقرب وقت", "ايش المتاح", "وش المتاح", "وش فاضي", "ايش فاضي", "عندكم شي فاضي",
  "فيه مكان", "في مكان", "فيه فراغ", "عندكم وقت", "فيه وقت", "في وقت",
])

const BOOKING = N([
  "book", "booking", "book me", "book an", "book a", "reserve", "reservation", "appointment", "make an appointment", "schedule", "i want a", "i need a",
  "i would like", "i d like", "set up", "get me",
  "احجز", "احجزلي", "احجزلنا", "حجز", "حجزي", "ابغى حجز", "ابي حجز", "ابغي حجز", "ابغى احجز", "ابي احجز", "ابغي احجز", "اريد حجز", "اريد احجز",
  "ودي احجز", "حابب احجز", "حاب احجز", "بغيت احجز", "بغيت موعد", "ابغى موعد", "ابي موعد", "ابغي موعد", "اريد موعد", "ودي بموعد", "ودي موعد",
  "حجزلي", "سجلني", "سجلوني", "ابغى اجي", "ابي اجي", "ابغي اجي", "نحجز", "حجز موعد", "ابغاه", "ابغى", "ابي", "ابغي", "اريد", "ودي",
])

const GREETING = N([
  "hi", "hello", "hey", "hiya", "good morning", "good evening", "good afternoon", "greetings", "salam", "assalamu alaikum", "peace be upon you",
  "السلام عليكم", "سلام عليكم", "سلام", "السلام", "مرحبا", "مرحبتين", "هلا", "هلا والله", "اهلا", "اهلين", "يا هلا", "حياكم الله", "حياك الله",
  "صباح الخير", "مساء الخير", "صباح النور", "مساء النور", "يعطيكم العافيه", "يعطيك العافيه", "هاي", "هلو", "هلا بك", "هلا فيك", "الله يعطيكم العافيه",
])

// Words that, with "مواعيد", turn it into opening hours ("مواعيد العمل") rather than free appointments.
const HOURS_QUALIFIERS = N(["العمل", "الدوام", "الفتح", "الاغلاق", "work", "working", "business"])

export function classifyIntent(normalized: string, hasDateOrTime: boolean, hasService: boolean): Intent {
  const tokens = tokensOf(normalized)
  if (tokens.length === 0) return "unknown"
  if (OPT_OUT_PHRASES.has(normalized)) return "opt_out"
  if (OPT_IN_PHRASES.has(normalized)) return "opt_in"
  const h = haystackOf(tokens)

  if (hasAny(h, HUMAN)) return "human"
  if (hasAny(h, CANCEL) && !hasPhrase(h, normalizeText("الغاء الاشتراك"))) return "cancel_reschedule"

  const hoursWords = hasAny(h, HOURS)
  const hoursQualified = hasPhrase(h, "مواعيد") && HOURS_QUALIFIERS.some((q) => tokens.includes(q) || tokens.map(stripPrefix).includes(q))
  if (hoursWords || hoursQualified) return "hours"
  if (hasAny(h, LOCATION)) return "location"
  if (hasAny(h, PRICE)) return "price"

  const booking = hasAny(h, BOOKING)
  const availability = hasAny(h, AVAILABILITY)
  // "I want to book ... tomorrow" is a booking; "appointments today?" is a question about availability.
  const strongBooking = ["book", "booking", "reserve", "reservation", "احجز", "حجز", "موعد"].some((w) => hasPhrase(h, normalizeText(w))) ||
    hasAny(h, N(["ابغى حجز", "ابي حجز", "ابغى احجز", "ابي احجز", "ابغي احجز", "ابغي حجز", "ودي احجز", "حابب احجز", "بغيت احجز", "اريد حجز", "appointment", "book me", "set up"]))
  if (availability && !(strongBooking && !hasPhrase(h, "مواعيد") && !hasPhrase(h, "المواعيد"))) return "availability"
  if (booking && (strongBooking || hasService || hasDateOrTime)) return "booking"
  if (availability) return "availability"
  if (hasAny(h, GREETING)) return hasService ? "booking" : "greeting"
  if (hasService) return "booking"
  return "unknown"
}

// ---------------------------------------------------------------------------------------------------------------------
// Service matching
// ---------------------------------------------------------------------------------------------------------------------

// Words that name the same thing in everyday speech. Tokens in one group count as equal when a service name is matched.
const CONCEPTS: readonly (readonly string[])[] = [
  ["قص", "قصه", "قصات", "حلاقه", "حلق", "cut", "haircut", "trim", "تقصير", "قصيه"],
  ["شعر", "hair", "راس"],
  ["لحيه", "ذقن", "beard", "لحى"],
  ["صبغه", "صبغ", "صبغات", "لون", "تلوين", "color", "colour", "dye", "coloring", "colouring"],
  ["اظافر", "اظفار", "مانيكير", "manicure", "nails", "nail", "اظافري"],
  ["باديكير", "pedicure", "قدم", "اقدام"],
  ["مكياج", "ميكب", "makeup", "make-up", "ميك"],
  ["مساج", "massage", "تدليك"],
  ["بشره", "facial", "تنظيف", "عنايه", "skincare"],
  ["شمع", "واكس", "wax", "waxing", "ازاله", "ازالة"],
  ["كيراتين", "بروتين", "keratin", "protein"],
  ["حنا", "henna", "نقش"],
  ["سشوار", "تسريح", "blowdry", "blow", "brushing", "ستايل", "styling", "blowout"],
  ["حمام", "bath", "spa", "سبا"],
  ["عروس", "bridal", "bride", "زفاف"],
  ["رجالي", "men", "mens", "رجال", "male"],
  ["نسائي", "women", "womens", "نساء", "ladies", "female"],
  ["اطفال", "kids", "children", "child", "طفل", "اولاد"],
]
const CONCEPT_OF = new Map<string, number>()
CONCEPTS.forEach((group, index) => group.forEach((word) => CONCEPT_OF.set(normalizeText(word), index)))

const STOP_WORDS = new Set(N([
  "و", "في", "من", "على", "مع", "الى", "عن", "ال", "a", "an", "the", "of", "for", "and", "to", "my", "me", "i", "want", "need", "please", "pls",
  "ابغى", "ابي", "ابغي", "ودي", "اريد", "حجز", "احجز", "موعد", "service", "خدمه", "خدمة",
]))

function stripArticle(token: string): string {
  if (token.length > 4 && token.startsWith("ال")) return token.slice(2)
  return token
}

function canonical(token: string): string {
  const base = stripArticle(token)
  let group = CONCEPT_OF.get(base) ?? CONCEPT_OF.get(token)
  if (group === undefined && base.length >= 4) {
    // A slip in spelling of a known word (مانيكر, manicur) still names its group.
    for (const [word, index] of CONCEPT_OF) {
      if (word.length >= 3 && wordsMatch(base, word)) { group = index; break }
    }
  }
  return group === undefined ? base : `#${group}`
}

function editDistance(a: string, b: string, cap: number): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > cap) return cap + 1
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
    }
    previous = current
  }
  return previous[b.length]
}

function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (a.startsWith("#") || b.startsWith("#")) return false
  const shorter = Math.min(a.length, b.length)
  const cap = shorter >= 6 ? 2 : shorter >= 4 || (shorter >= 3 && Math.max(a.length, b.length) >= 4) ? 1 : 0
  return cap > 0 && editDistance(a, b, cap) <= cap
}

function nameWords(name: string): string[] {
  return tokensOf(normalizeText(name)).filter((t) => !STOP_WORDS.has(t)).map(canonical).filter((t) => t.length > 0)
}

/**
 * Services of the provider named in the message, best first. The score is the share of the service name's words that appear in the
 * message (words in one group such as قص / حلاقة / haircut are equal; spelling slips within a small edit distance are tolerated).
 * A service whose every word is present scores 1. Only matches with a score of at least 0.5 are returned.
 */
export function matchServices(normalized: string, services: readonly ServiceRef[]): ServiceMatch[] {
  const textWords = tokensOf(normalized).map((t) => stripPrefix(t)).filter((t) => !STOP_WORDS.has(t)).map(canonical)
  const textSet = tokensOf(normalized).filter((t) => !STOP_WORDS.has(t)).map(canonical)
  const pool = [...textWords, ...textSet]
  const out: ServiceMatch[] = []
  for (const service of services) {
    let best = 0
    for (const name of [service.name_ar, service.name_en]) {
      const words = nameWords(name)
      if (words.length === 0) continue
      const found = words.filter((w) => pool.some((t) => wordsMatch(t, w))).length
      best = Math.max(best, found / words.length)
    }
    if (best >= 0.5) out.push({ service, score: Math.round(best * 1000) / 1000 })
  }
  return out.sort((a, b) => b.score - a.score || a.service.name_en.localeCompare(b.service.name_en) || a.service.id.localeCompare(b.service.id))
}

// ---------------------------------------------------------------------------------------------------------------------
// Dates (Asia/Riyadh)
// ---------------------------------------------------------------------------------------------------------------------

export function riyadhYmd(now: Date): string {
  const t = new Date(now.getTime() + RIYADH_OFFSET_MINUTES * 60000)
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`
}

export function riyadhMinutes(now: Date): number {
  const t = new Date(now.getTime() + RIYADH_OFFSET_MINUTES * 60000)
  return t.getUTCHours() * 60 + t.getUTCMinutes()
}

function ymdParts(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split("-").map(Number)
  return [y, m, d]
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymdParts(ymd)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(ymd: string): number {
  const [y, m, d] = ymdParts(ymd)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

function formatYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

const WEEKDAYS: Record<string, number> = {}
function defineWeekday(dow: number, names: string[]): void {
  for (const name of names) WEEKDAYS[normalizeText(name)] = dow
}
defineWeekday(0, ["الاحد", "sunday", "sun"])
defineWeekday(1, ["الاثنين", "الاتنين", "monday", "mon"])
defineWeekday(2, ["الثلاثاء", "الثلاثا", "الثلاث", "ثلاثاء", "التلات", "التلاتاء", "tuesday", "tue", "tues"])
defineWeekday(3, ["الاربعاء", "الاربعا", "اربعاء", "الاربع", "wednesday", "wed"])
defineWeekday(4, ["الخميس", "خميس", "thursday", "thu", "thur", "thurs"])
defineWeekday(5, ["الجمعه", "جمعه", "friday", "fri"])
defineWeekday(6, ["السبت", "سبت", "saturday", "sat"])

const NEXT_WORDS = new Set(N(["next", "الجاي", "الجايه", "القادم", "القادمه", "الجاى", "الجاييه", "القابل", "القابله", "اللي بعده"]))

const MONTHS: Record<string, number> = {}
function defineMonth(month: number, names: string[]): void {
  for (const name of names) MONTHS[normalizeText(name)] = month
}
defineMonth(1, ["يناير", "كانون الثاني", "january", "jan"])
defineMonth(2, ["فبراير", "شباط", "february", "feb"])
defineMonth(3, ["مارس", "اذار", "march", "mar"])
defineMonth(4, ["ابريل", "نيسان", "april", "apr"])
defineMonth(5, ["مايو", "ايار", "may"])
defineMonth(6, ["يونيو", "حزيران", "june", "jun"])
defineMonth(7, ["يوليو", "تموز", "july", "jul"])
defineMonth(8, ["اغسطس", "اب", "august", "aug"])
defineMonth(9, ["سبتمبر", "ايلول", "september", "sep", "sept"])
defineMonth(10, ["اكتوبر", "تشرين الاول", "october", "oct"])
defineMonth(11, ["نوفمبر", "تشرين الثاني", "november", "nov"])
defineMonth(12, ["ديسمبر", "كانون الاول", "december", "dec"])

interface DateParse {
  date: DateResolution | null
  problem: "past" | "invalid" | null
  /** Token indexes that belong to the date, so the time parser does not read them again. */
  used: Set<number>
}

function finishExplicit(y: number | null, m: number, d: number, today: string): { ymd: string | null; problem: "invalid" | "past" | null } {
  const [ty] = ymdParts(today)
  let year = y ?? ty
  if (year < 100) year += 2000
  if (!isRealDate(year, m, d)) return { ymd: null, problem: "invalid" }
  let ymd = formatYmd(year, m, d)
  if (y === null && ymd < today) {
    // A day and month without a year that already passed means next year's.
    if (!isRealDate(year + 1, m, d)) return { ymd: null, problem: "invalid" }
    ymd = formatYmd(year + 1, m, d)
  }
  if (ymd < today) return { ymd, problem: "past" }
  return { ymd, problem: null }
}

export function parseDate(normalized: string, now: Date): DateParse {
  const today = riyadhYmd(now)
  const tokens = tokensOf(normalized)
  const used = new Set<number>()
  const stripped = tokens.map(stripPrefix)
  const at = (i: number): string => tokens[i] ?? ""
  const sat = (i: number): string => stripped[i] ?? ""
  const relative = (offset: number, source: DateResolution["source"]): DateParse => ({ date: { ymd: addDays(today, offset), source }, problem: null, used })

  // "the day after tomorrow" must be tried before "tomorrow".
  for (let i = 0; i < tokens.length; i += 1) {
    if (sat(i) === "بعد" && ["بكره", "بكرا", "باجر", "غدا", "بكرى"].includes(sat(i + 1))) { used.add(i); used.add(i + 1); return relative(2, "day_after_tomorrow") }
    if (at(i) === "بعد" && ["غد", "بكره", "بكرا"].includes(at(i + 1))) { used.add(i); used.add(i + 1); return relative(2, "day_after_tomorrow") }
    if (at(i) === "day" && at(i + 1) === "after" && (at(i + 2) === "tomorrow" || at(i + 2) === "tmrw")) { used.add(i); used.add(i + 1); used.add(i + 2); return relative(2, "day_after_tomorrow") }
    if (at(i) === "overmorrow") { used.add(i); return relative(2, "day_after_tomorrow") }
  }
  // "in 3 days" / "بعد 3 ايام" / "بعد اسبوع"
  for (let i = 0; i < tokens.length; i += 1) {
    if (at(i) === "in" && /^\d{1,2}$/.test(at(i + 1)) && /^days?$/.test(at(i + 2))) { used.add(i); used.add(i + 1); used.add(i + 2); return relative(Number(at(i + 1)), "relative") }
    if (sat(i) === "بعد" && /^\d{1,2}$/.test(at(i + 1)) && ["ايام", "يوم"].includes(sat(i + 2))) { used.add(i); used.add(i + 1); used.add(i + 2); return relative(Number(at(i + 1)), "relative") }
    if (sat(i) === "بعد" && ["اسبوع", "اسبوعين"].includes(sat(i + 1))) { used.add(i); used.add(i + 1); return relative(sat(i + 1) === "اسبوع" ? 7 : 14, "relative") }
  }

  // Explicit calendar dates.
  for (let i = 0; i < tokens.length; i += 1) {
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(at(i))
    if (iso) {
      used.add(i)
      const r = finishExplicit(Number(iso[1]), Number(iso[2]), Number(iso[3]), today)
      return { date: r.ymd && !r.problem ? { ymd: r.ymd, source: "explicit" } : null, problem: r.problem, used }
    }
    const slash = /^(\d{1,2})[/\-](\d{1,2})(?:[/\-](\d{2,4}))?$/.exec(at(i))
    if (slash) {
      used.add(i)
      const r = finishExplicit(slash[3] ? Number(slash[3]) : null, Number(slash[2]), Number(slash[1]), today)
      return { date: r.ymd && !r.problem ? { ymd: r.ymd, source: "explicit" } : null, problem: r.problem, used }
    }
    // "12 اكتوبر", "12 october", "october 12", "اكتوبر 12". Two-word month names (تشرين الاول) are tried first.
    const monthAt = (j: number): { month: number; len: number } | null => {
      const two = MONTHS[`${at(j)} ${at(j + 1)}`]
      if (two) return { month: two, len: 2 }
      const one = MONTHS[at(j)] ?? MONTHS[sat(j)]
      return one ? { month: one, len: 1 } : null
    }
    if (/^\d{1,2}(st|nd|rd|th)?$/.test(at(i))) {
      const m = monthAt(i + 1)
      if (m) {
        for (let k = i; k <= i + m.len; k += 1) used.add(k)
        const r = finishExplicit(null, m.month, parseInt(at(i), 10), today)
        return { date: r.ymd && !r.problem ? { ymd: r.ymd, source: "explicit" } : null, problem: r.problem, used }
      }
    }
    const lead = monthAt(i)
    if (lead && /^\d{1,2}(st|nd|rd|th)?$/.test(at(i + lead.len))) {
      for (let k = i; k <= i + lead.len; k += 1) used.add(k)
      const r = finishExplicit(null, lead.month, parseInt(at(i + lead.len), 10), today)
      return { date: r.ymd && !r.problem ? { ymd: r.ymd, source: "explicit" } : null, problem: r.problem, used }
    }
  }

  // Weekday names, with "next" / "الجاية" meaning the same weekday of the following Sunday-based week.
  for (let i = 0; i < tokens.length; i += 1) {
    const dow = WEEKDAYS[at(i)] ?? WEEKDAYS[sat(i)]
    if (dow === undefined) continue
    // "sat" / "sun" / "mon" are only weekdays when nothing makes them a verb; accept them as written.
    used.add(i)
    const isNext = NEXT_WORDS.has(at(i - 1)) || NEXT_WORDS.has(at(i + 1)) || (at(i + 1) === "بعده" && NEXT_WORDS.has(at(i + 2)))
    if (NEXT_WORDS.has(at(i - 1))) used.add(i - 1)
    if (NEXT_WORDS.has(at(i + 1))) used.add(i + 1)
    const todayDow = weekday(today)
    if (isNext) {
      const nextWeekStart = addDays(today, 7 - todayDow)
      return { date: { ymd: addDays(nextWeekStart, dow), source: "next_weekday" }, problem: null, used }
    }
    return { date: { ymd: addDays(today, (dow - todayDow + 7) % 7), source: "weekday" }, problem: null, used }
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const w = sat(i)
    if (["اليوم", "النهارده", "النهاردة", "today", "tonight", "الليله", "الليلة"].includes(w) || at(i) === "today") { used.add(i); return relative(0, "today") }
    if (["بكره", "بكرا", "باجر", "غدا", "tomorrow", "tmrw", "بكرى", "tomorow", "غدن"].includes(w) || ["بكره", "بكرا", "tomorrow", "غدا"].includes(at(i))) { used.add(i); return relative(1, "tomorrow") }
  }
  return { date: null, problem: null, used }
}

// ---------------------------------------------------------------------------------------------------------------------
// Time of day (Asia/Riyadh)
// ---------------------------------------------------------------------------------------------------------------------

// A word that says a part of the day, resolved to a band of minutes after midnight. Phrases that start with "بعد"/"قبل" come first.
const BANDS: readonly { words: string[]; from: number; to: number; label: string; meridiem: "am" | "pm" | "noon" | null }[] = [
  { words: ["بعد العصر", "after asr"], from: 16 * 60, to: 19 * 60, label: "after_asr", meridiem: "pm" },
  { words: ["قبل العصر", "before asr"], from: 13 * 60, to: 15 * 60 + 30, label: "before_asr", meridiem: "pm" },
  { words: ["بعد الظهر", "بعد الضهر", "afternoon", "after noon"], from: 13 * 60, to: 17 * 60, label: "afternoon", meridiem: "pm" },
  { words: ["بعد المغرب", "after maghrib"], from: 18 * 60 + 30, to: 22 * 60, label: "after_maghrib", meridiem: "pm" },
  { words: ["بعد العشاء", "after isha"], from: 20 * 60 + 30, to: 23 * 60 + 59, label: "after_isha", meridiem: "pm" },
  { words: ["قبل الظهر", "before noon"], from: 9 * 60, to: 12 * 60, label: "before_noon", meridiem: "am" },
  { words: ["العصر", "عصرا", "عصر", "asr"], from: 15 * 60, to: 17 * 60 + 30, label: "asr", meridiem: "pm" },
  { words: ["الظهر", "ظهرا", "ظهر", "الضهر", "noon", "midday", "lunchtime"], from: 11 * 60, to: 14 * 60, label: "noon", meridiem: "noon" },
  { words: ["المغرب", "maghrib"], from: 17 * 60 + 30, to: 19 * 60 + 30, label: "maghrib", meridiem: "pm" },
  { words: ["العشاء", "isha"], from: 19 * 60 + 30, to: 22 * 60, label: "isha", meridiem: "pm" },
  { words: ["صباحا", "الصبح", "صباح", "الصباح", "morning", "am"], from: 6 * 60, to: 12 * 60, label: "morning", meridiem: "am" },
  { words: ["مساء", "المسا", "المساء", "evening", "مسا"], from: 17 * 60, to: 22 * 60, label: "evening", meridiem: "pm" },
  { words: ["ليلا", "الليل", "بالليل", "night", "tonight", "ليل"], from: 20 * 60, to: 23 * 60 + 59, label: "night", meridiem: "pm" },
]

const MERIDIEM_AM = new Set(N(["ص", "am", "a.m", "a.m.", "صباحا", "الصبح", "صباح", "الصباح", "morning", "فجرا", "الفجر"]))
const MERIDIEM_PM = new Set(N(["م", "pm", "p.m", "p.m.", "مساء", "المسا", "المساء", "عصرا", "العصر", "عصر", "ليلا", "الليل", "بالليل", "المغرب", "العشاء", "evening", "night", "afternoon", "مسا"]))
const MERIDIEM_NOON = new Set(N(["ظهرا", "الظهر", "ظهر", "الضهر", "noon"]))

const NUMBER_WORDS: Record<string, number> = {}
function defineNumbers(value: number, names: string[]): void {
  for (const name of names) NUMBER_WORDS[normalizeText(name)] = value
}
defineNumbers(1, ["واحده", "وحده", "واحد", "one"])
defineNumbers(2, ["اثنين", "ثنتين", "اتنين", "two"])
defineNumbers(3, ["ثلاثه", "ثلاث", "تلاته", "تلات", "three"])
defineNumbers(4, ["اربعه", "اربع", "four"])
defineNumbers(5, ["خمسه", "خمس", "five"])
defineNumbers(6, ["سته", "ست", "six"])
defineNumbers(7, ["سبعه", "سبع", "seven"])
defineNumbers(8, ["ثمانيه", "ثمان", "تمانيه", "eight"])
defineNumbers(9, ["تسعه", "تسع", "nine"])
defineNumbers(10, ["عشره", "عشر", "ten"])
defineNumbers(11, ["احدعشر", "حداشر", "eleven"])
defineNumbers(12, ["اثنعشر", "اثناعشر", "اطناعش", "twelve"])

function meridiemNear(tokens: string[], start: number, end: number): "am" | "pm" | "noon" | null {
  for (let i = Math.max(0, start - 1); i <= Math.min(tokens.length - 1, end + 2); i += 1) {
    const t = stripPrefix(tokens[i])
    for (const candidate of [tokens[i], t]) {
      if (MERIDIEM_PM.has(candidate)) return "pm"
      if (MERIDIEM_AM.has(candidate)) return "am"
      if (MERIDIEM_NOON.has(candidate)) return "noon"
    }
  }
  return null
}

function resolveHour(hour: number, minute: number, meridiem: "am" | "pm" | "noon" | null): number[] {
  if (hour > 23 || minute > 59) return []
  if (hour >= 13) return [hour * 60 + minute]
  if (hour === 0) return [minute]
  if (meridiem === "pm") return [(hour === 12 ? 12 : hour + 12) * 60 + minute]
  if (meridiem === "am") return [(hour === 12 ? 0 : hour) * 60 + minute]
  if (meridiem === "noon") return [(hour >= 11 ? hour : hour + 12) * 60 + minute]
  if (hour === 12) return [12 * 60 + minute]
  // Without am/pm: 1-6 can only be the afternoon or evening for a salon; 7-11 could be either.
  if (hour <= 6) return [(hour + 12) * 60 + minute]
  return [hour * 60 + minute, (hour + 12) * 60 + minute]
}

function minutesFromFraction(tokens: string[], index: number): { minute: number; consumed: number; minus: boolean } {
  const t = tokens[index] ?? ""
  const next = tokens[index + 1] ?? ""
  // "5 ونص" = 5:30, "5 وربع" = 5:15, "5 الا ربع" = 4:45, "5 وثلث" = 5:20
  const bare = t.startsWith("و") ? t.slice(1) : t
  if (bare === "نص" || bare === "نصف" || t === "نص") return { minute: 30, consumed: 1, minus: false }
  if (bare === "ربع") return { minute: 15, consumed: 1, minus: false }
  if (bare === "ثلث") return { minute: 20, consumed: 1, minus: false }
  if ((t === "الا" || t === "illa") && (next === "ربع" || next === "ثلث")) return { minute: next === "ربع" ? 15 : 20, consumed: 2, minus: true }
  return { minute: 0, consumed: 0, minus: false }
}

export function parseTimeOfDay(normalized: string, dateUsed: Set<number> = new Set()): TimeResolution | null {
  const tokens = tokensOf(normalized)
  const exact: number[] = []
  const usedForClock = new Set<number>()
  const push = (values: number[]): void => { for (const v of values) if (!exact.includes(v)) exact.push(v) }
  const clockMarkers = new Set(N(["الساعه", "الساعة", "ساعه", "at", "@", "around", "حوالي", "تقريبا", "الساعه"]))

  for (let i = 0; i < tokens.length && exact.length === 0; i += 1) {
    if (dateUsed.has(i)) continue
    const token = tokens[i]
    // 17:30, 5:30pm, 5:30
    let m = /^(\d{1,2}):(\d{2})(am|pm|ص|م)?$/.exec(token)
    if (m) {
      const meridiem = m[3] ? (m[3] === "am" || m[3] === "ص" ? "am" : "pm") : meridiemNear(tokens, i, i)
      push(resolveHour(Number(m[1]), Number(m[2]), meridiem))
      usedForClock.add(i)
      continue
    }
    // 5pm, 5م, 5ص
    m = /^(\d{1,2})(am|pm|ص|م)$/.exec(token)
    if (m) {
      push(resolveHour(Number(m[1]), 0, m[2] === "am" || m[2] === "ص" ? "am" : "pm"))
      usedForClock.add(i)
      continue
    }
    // "الساعه 5", "at 5", "الساعه خمسه ونص", "الساعه 5.30"
    const marker = clockMarkers.has(token) || clockMarkers.has(stripPrefix(token)) || token === "@" || /^@\d/.test(token)
    if (marker) {
      let j = i + 1
      let raw = token.startsWith("@") && token.length > 1 ? token.slice(1) : tokens[j] ?? ""
      if (token.startsWith("@") && token.length > 1) j = i
      const dotted = /^(\d{1,2})[.:](\d{2})$/.exec(raw)
      let hour = -1
      let minute = 0
      if (dotted) { hour = Number(dotted[1]); minute = Number(dotted[2]) }
      else if (/^\d{1,2}$/.test(raw)) hour = Number(raw)
      else if (NUMBER_WORDS[raw] !== undefined) hour = NUMBER_WORDS[raw]
      else { raw = ""; }
      if (hour >= 0 && !dateUsed.has(j)) {
        let end = j
        if (!dotted) {
          const fraction = minutesFromFraction(tokens, j + 1)
          if (fraction.consumed > 0) {
            end = j + fraction.consumed
            if (fraction.minus) { hour = (hour + 11) % 12 || 12; minute = 60 - fraction.minute } else { minute = fraction.minute }
          }
        }
        const meridiem = meridiemNear(tokens, j, end)
        push(resolveHour(hour, minute === 60 ? 0 : minute, meridiem))
        for (let k = i; k <= end; k += 1) usedForClock.add(k)
        continue
      }
    }
    // "5 العصر", "9 مساء", "3 ظهرا": a bare hour followed by a part-of-day word.
    if (/^\d{1,2}$/.test(token) && !dateUsed.has(i)) {
      const next = tokens[i + 1] ?? ""
      const meridiem = MERIDIEM_PM.has(next) || MERIDIEM_PM.has(stripPrefix(next)) ? "pm"
        : MERIDIEM_AM.has(next) || MERIDIEM_AM.has(stripPrefix(next)) ? "am"
        : MERIDIEM_NOON.has(next) || MERIDIEM_NOON.has(stripPrefix(next)) ? "noon" : null
      if (meridiem) {
        const hour = Number(token)
        if (hour >= 1 && hour <= 12) {
          push(resolveHour(hour, 0, meridiem))
          usedForClock.add(i)
        }
      }
    }
  }

  // A band in words, searched on the text without the clock tokens.
  const rest = tokens.filter((_, i) => !usedForClock.has(i))
  const h = haystackOf(rest)
  let band: TimeResolution["band"] = null
  for (const candidate of BANDS) {
    if (candidate.words.some((w) => hasPhrase(h, normalizeText(w)))) {
      band = { from: candidate.from, to: candidate.to, label: candidate.label }
      break
    }
  }
  if (exact.length === 0 && !band) return null
  return { exactMinutes: exact, band }
}

// ---------------------------------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------------------------------

export function parseMessage(text: string, options: { now: Date; services?: readonly ServiceRef[] }): ParsedMessage {
  const normalized = normalizeText(text)
  const services = matchServices(normalized, options.services ?? [])
  const dateParse = parseDate(normalized, options.now)
  const time = parseTimeOfDay(normalized, dateParse.used)
  const intent = classifyIntent(normalized, dateParse.date !== null || time !== null, services.length > 0)
  return {
    intent,
    locale: detectLocale(normalized) ?? "ar",
    normalized,
    services,
    date: dateParse.date,
    dateProblem: dateParse.problem,
    time,
  }
}
