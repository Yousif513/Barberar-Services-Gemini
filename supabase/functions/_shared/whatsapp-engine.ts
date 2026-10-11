// The WhatsApp receptionist's decision engine (v1: deterministic rules, no language model). Pure: the clock, the availability lookup and the
// prayer-time calculation are injected, so a node test drives it end to end with fakes and the Edge Function wires the real database.
//
// It never creates a booking and never takes payment: it understands the request, finds real free times through the database
// (get_branch_available_slots, with the shop's prayer windows), and replies with up to three options and a link to the shop page.

import {
  addDays, normalizeText, parseMessage, riyadhMinutes, riyadhYmd,
  type Intent, type Locale, type ParsedMessage, type ServiceRef, type TimeResolution,
} from "./whatsapp-intent.ts"
import { dateLabel, nameOf, priceLabel, replies, timeLabel, weekdayLabel } from "./whatsapp-reply.ts"
import { prayerWindowsForDate, type PrayerClock, type PrayerWindows } from "./whatsapp-prayer.ts"

export interface EngineService extends ServiceRef {
  price: number | string | null
}

export interface EngineBranch {
  id: string
  name_ar: string
  name_en: string
  address_ar: string | null
  address_en: string | null
  latitude: number | string
  longitude: number | string
  hours: { date: string; open: boolean; from_min: number | null; to_min: number | null }[]
}

export interface EngineContext {
  provider: { id: string; name_ar: string; name_en: string; bookable: boolean }
  handoffEnabled: boolean
  services: EngineService[]
  branches: EngineBranch[]
  /** platform_settings public_app_url; null while the owner has not set it. */
  publicAppUrl: string | null
}

export interface AvailabilityPort {
  /** Free start times (ISO) for the service at the branch on that Riyadh date, already filtered by the database. */
  slots(query: { branchId: string; serviceId: string; ymd: string; prayerWindows: PrayerWindows }): Promise<string[]>
}

export interface ConversationState {
  v: 1
  at: string
  intent?: "booking" | "availability"
  service_id?: string
  date?: string
  time?: TimeResolution
  asked?: "service" | "choose_service"
  misses?: number
}

export interface EngineInput {
  text: string
  now: Date
  state: unknown
  previousLocale: Locale | null
  context: EngineContext
}

export interface EngineResult {
  reply: string | null
  state: ConversationState
  status: "bot" | "awaiting_human"
  handoffReason: string | null
  intent: string
  locale: Locale
}

/** How long a half-finished request is remembered. A technical bound, not a business rule. */
export const STATE_TTL_MINUTES = 120
export const MAX_OPTIONS = 3
/** How many days ahead the receptionist looks when the requested day is full. */
export const SEARCH_DAYS = 7
const MAX_LISTED_SERVICES = 6

const THANKS = new Set(["شكرا", "شكرا لك", "شكرا جزيلا", "مشكور", "مشكوره", "تسلم", "تسلمين", "thanks", "thank you", "thx", "ok", "okay", "اوكي", "اوك", "تمام", "تم", "ممتاز", "حاضر"].map(normalizeText))

function readState(raw: unknown, now: Date): ConversationState | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null
  const state = raw as Partial<ConversationState>
  if (state.v !== 1 || typeof state.at !== "string") return null
  const at = new Date(state.at).getTime()
  if (Number.isNaN(at) || now.getTime() - at > STATE_TTL_MINUTES * 60000 || at > now.getTime() + 60000) return null
  return state as ConversationState
}

function appLink(base: string | null, path: string): string | null {
  return base ? `${base}${path}` : null
}

export function bookingLink(base: string | null, providerId: string, serviceId: string, ymd: string): string | null {
  return appLink(base, `/shop/${providerId}?service=${serviceId}&date=${ymd}&src=whatsapp`)
}

type ServiceResolution =
  | { kind: "one"; service: EngineService }
  | { kind: "choose"; candidates: EngineService[] }
  | { kind: "none" }

function resolveService(parsed: ParsedMessage, context: EngineContext, state: ConversationState | null): ServiceResolution {
  const byId = new Map(context.services.map((s) => [s.id, s]))
  if (parsed.services.length > 0) {
    const top = parsed.services[0].score
    const tied = parsed.services.filter((m) => m.score === top).map((m) => byId.get(m.service.id)).filter((s): s is EngineService => Boolean(s))
    if (tied.length === 1) return { kind: "one", service: tied[0] }
    if (tied.length > 1) return { kind: "choose", candidates: tied.slice(0, MAX_LISTED_SERVICES) }
  }
  const remembered = state?.service_id ? byId.get(state.service_id) : undefined
  if (remembered) return { kind: "one", service: remembered }
  if (context.services.length === 1) return { kind: "one", service: context.services[0] }
  return { kind: "none" }
}

interface Slot { iso: string; minutes: number; branchId: string }

function spread<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items
  if (count === 1) return [items[0]]
  const picked: T[] = []
  for (let i = 0; i < count; i += 1) picked.push(items[Math.round((i * (items.length - 1)) / (count - 1))])
  return picked
}

/** Up to MAX_OPTIONS slots shaped by what the customer said about the time, and whether their wish had to be relaxed. */
export function chooseSlots(slots: Slot[], time: TimeResolution | null): { picked: Slot[]; periodMissed: boolean } {
  const sorted = [...slots].sort((a, b) => a.iso.localeCompare(b.iso))
  if (sorted.length === 0) return { picked: [], periodMissed: false }
  if (time && time.exactMinutes.length > 0) {
    const distance = (s: Slot): number => Math.min(...time.exactMinutes.map((m) => Math.abs(s.minutes - m)))
    const nearest = [...sorted].sort((a, b) => distance(a) - distance(b) || a.iso.localeCompare(b.iso)).slice(0, MAX_OPTIONS)
    return { picked: nearest.sort((a, b) => a.iso.localeCompare(b.iso)), periodMissed: distance(nearest[0]) > 90 }
  }
  if (time?.band) {
    const inBand = sorted.filter((s) => s.minutes >= time.band!.from && s.minutes <= time.band!.to)
    if (inBand.length > 0) return { picked: spread(inBand, MAX_OPTIONS), periodMissed: false }
    return { picked: spread(sorted, MAX_OPTIONS), periodMissed: true }
  }
  return { picked: spread(sorted, MAX_OPTIONS), periodMissed: false }
}

interface Found { ymd: string; picked: Slot[]; periodMissed: boolean }

async function findOptions(
  context: EngineContext, port: AvailabilityPort, clock: PrayerClock, service: EngineService, startYmd: string, now: Date, time: TimeResolution | null,
): Promise<Found | null> {
  for (let offset = 0; offset <= SEARCH_DAYS; offset += 1) {
    const ymd = addDays(startYmd, offset)
    const all: Slot[] = []
    const seen = new Set<string>()
    for (const branch of context.branches) {
      const latitude = Number(branch.latitude)
      const longitude = Number(branch.longitude)
      // Without coordinates the shop's prayer pauses cannot be applied, and a time that clashes with a prayer must not be offered.
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
      const iso = await port.slots({ branchId: branch.id, serviceId: service.id, ymd, prayerWindows: prayerWindowsForDate(ymd, latitude, longitude, clock) })
      for (const value of iso) {
        const when = new Date(value)
        if (Number.isNaN(when.getTime()) || when.getTime() <= now.getTime() || riyadhYmd(when) !== ymd || seen.has(value)) continue
        seen.add(value)
        all.push({ iso: value, minutes: riyadhMinutes(when), branchId: branch.id })
      }
    }
    if (all.length > 0) {
      const { picked, periodMissed } = chooseSlots(all, time)
      return { ymd, picked, periodMissed }
    }
  }
  return null
}

function formatHoursBlocks(context: EngineContext, locale: Locale): { branch: string | null; lines: string[] }[] {
  const blocks: { branch: string | null; lines: string[] }[] = []
  for (const branch of context.branches) {
    if (!Array.isArray(branch.hours) || branch.hours.length === 0) continue
    const rows = branch.hours.map((h) => ({
      ymd: h.date.slice(0, 10),
      text: h.open && h.from_min !== null && h.to_min !== null
        ? `${timeLabel(h.from_min, locale)} - ${timeLabel(h.to_min, locale)}${h.to_min >= 1440 ? replies.nextDayMark(locale) : ""}`
        : replies.closedLabel(locale),
    }))
    // Consecutive days with the same hours share one line.
    const lines: string[] = []
    for (let i = 0; i < rows.length;) {
      let j = i
      while (j + 1 < rows.length && rows[j + 1].text === rows[i].text) j += 1
      const first = weekdayLabel(rows[i].ymd, locale)
      lines.push(`${j > i ? `${first} - ${weekdayLabel(rows[j].ymd, locale)}` : first}: ${rows[i].text}`)
      i = j + 1
    }
    blocks.push({ branch: context.branches.length > 1 ? nameOf(branch, locale) : null, lines })
  }
  return blocks
}

function result(partial: Omit<EngineResult, "status" | "handoffReason"> & Partial<Pick<EngineResult, "status" | "handoffReason">>): EngineResult {
  return { status: "bot", handoffReason: null, ...partial }
}

export async function respond(input: EngineInput, port: AvailabilityPort, clock: PrayerClock): Promise<EngineResult> {
  const { context, now } = input
  const previous = readState(input.state, now)
  const parsed = parseMessage(input.text, { now, services: context.services })
  const hasLetters = /\p{L}/u.test(parsed.normalized)
  const locale: Locale = hasLetters ? parsed.locale : (input.previousLocale ?? "ar")
  const stamp = now.toISOString()
  const fresh: ConversationState = { v: 1, at: stamp }
  const providerName = nameOf(context.provider, locale)
  const base = context.publicAppUrl
  const finish = (reply: string | null, intent: string, state: ConversationState = fresh, handoffReason: string | null = null): EngineResult => {
    const handoff = handoffReason !== null && context.handoffEnabled
    return result({ reply, state, intent, locale, status: handoff ? "awaiting_human" : "bot", handoffReason: handoff ? handoffReason : null })
  }

  if (parsed.intent === "opt_out") return finish(null, "opt_out")
  if (!context.provider.bookable) return finish(replies.notBookable(locale), "not_bookable", fresh, "provider_not_bookable")
  if (THANKS.has(parsed.normalized)) return finish(replies.thanks(locale), "thanks")

  // A one-word answer to our question ("بكرة", "قص شعر") continues the request we were filling in.
  let intent: Intent = parsed.intent
  const hasEntities = parsed.services.length > 0 || parsed.date !== null || parsed.time !== null || parsed.dateProblem !== null
  if ((intent === "unknown" || intent === "greeting") && previous?.intent && hasEntities) intent = previous.intent

  switch (intent) {
    case "opt_in":
      return finish(replies.welcomeBack(locale, providerName), "opt_in")
    case "greeting":
      return finish(replies.greeting(locale, providerName), "greeting")
    case "human":
      return context.handoffEnabled
        ? finish(replies.handoff(locale), "human", fresh, "human_requested")
        : finish(replies.handoffUnavailable(locale), "human")
    case "cancel_reschedule":
      return finish(replies.cancelHelp(locale, appLink(base, "/customer/bookings")), "cancel_reschedule", fresh, "cancel_or_reschedule")
    case "hours": {
      const blocks = formatHoursBlocks(context, locale)
      return blocks.length > 0 && blocks.some((b) => b.lines.length > 0)
        ? finish(replies.hours(locale, blocks), "hours")
        : finish(replies.hoursUnknown(locale), "hours", fresh, "hours_unknown")
    }
    case "location": {
      const items = context.branches
        .map((b) => {
          const address = locale === "ar" ? b.address_ar : b.address_en
          const lat = Number(b.latitude)
          const lng = Number(b.longitude)
          return {
            branch: context.branches.length > 1 ? nameOf(b, locale) : null,
            address: address && address.trim() ? address.trim() : null,
            mapUrl: Number.isFinite(lat) && Number.isFinite(lng) ? `https://maps.google.com/?q=${lat},${lng}` : null,
          }
        })
        .filter((i) => i.address !== null || i.mapUrl !== null)
      return items.length > 0 ? finish(replies.location(locale, items), "location") : finish(replies.locationUnknown(locale), "location", fresh, "location_unknown")
    }
    case "price": {
      if (context.services.length === 0) return finish(replies.noServices(locale), "price", fresh, "no_services")
      const named = resolveService(parsed, context, null)
      if (named.kind === "one") return finish(replies.prices(locale, [{ service: named.service, price: named.service.price }], false), "price")
      const listed = named.kind === "choose" ? named.candidates : context.services.slice(0, MAX_LISTED_SERVICES)
      return finish(replies.prices(locale, listed.map((s) => ({ service: s, price: s.price })), context.services.length > listed.length), "price")
    }
    case "booking":
    case "availability": {
      if (context.services.length === 0) return finish(replies.noServices(locale), intent, fresh, "no_services")
      if (parsed.dateProblem) {
        return finish(replies.dateProblem(locale, parsed.dateProblem), intent, { ...fresh, intent, service_id: previous?.service_id, time: parsed.time ?? previous?.time })
      }
      const carriedDate = previous?.date && previous.date >= riyadhYmd(now) ? previous.date : undefined
      const date = parsed.date?.ymd ?? carriedDate
      const time = parsed.time ?? previous?.time ?? null
      const resolved = resolveService(parsed, context, previous)
      const carry: ConversationState = { ...fresh, intent, ...(date ? { date } : {}), ...(time ? { time } : {}) }

      if (resolved.kind === "choose") {
        return finish(replies.chooseService(locale, resolved.candidates.map((s) => ({ name_ar: s.name_ar, name_en: s.name_en }))), intent, { ...carry, asked: "choose_service" })
      }
      if (resolved.kind === "none") {
        const listed = context.services.slice(0, MAX_LISTED_SERVICES)
        return finish(replies.askService(locale, listed, context.services.length > listed.length), intent, { ...carry, asked: "service" })
      }

      const service = resolved.service
      const startYmd = date ?? riyadhYmd(now)
      const found = await findOptions(context, port, clock, service, startYmd, now, time)
      const serviceName = nameOf(service, locale)
      if (!found) {
        const link = bookingLink(base, context.provider.id, service.id, startYmd)
        return finish(replies.nothingAvailable(locale, serviceName, SEARCH_DAYS + 1, link), intent, { ...carry, service_id: service.id }, link ? null : "no_booking_link")
      }
      const multiBranch = context.branches.length > 1
      const branchName = (id: string): string | null => {
        const branch = context.branches.find((b) => b.id === id)
        return multiBranch && branch ? nameOf(branch, locale) : null
      }
      const link = bookingLink(base, context.provider.id, service.id, found.ymd)
      const reply = replies.offer(locale, {
        businessName: providerName,
        serviceName,
        ymd: found.ymd,
        requestedYmd: date ?? null,
        options: found.picked.map((s) => ({ time: timeLabel(s.minutes, locale), branch: branchName(s.branchId) })),
        periodMissed: found.periodMissed,
        link,
      })
      // Without a configured public URL there is no link to give: say a person will follow up, and let the provider see the conversation.
      return finish(reply, intent, { ...carry, service_id: service.id, date: found.ymd }, link ? null : "no_booking_link")
    }
    default: {
      const misses = (previous?.misses ?? 0) + 1
      const next: ConversationState = { ...(previous ?? fresh), at: stamp, misses }
      if (misses >= 2 && context.handoffEnabled) return finish(replies.handoff(locale), "unknown", next, "not_understood")
      return finish(replies.fallback(locale), "unknown", next)
    }
  }
}

// Re-exported so the Edge Function and the tests build prices and labels from one place.
export { dateLabel, priceLabel, timeLabel }
