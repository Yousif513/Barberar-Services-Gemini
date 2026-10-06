// Strict parsing of query parameters. Pure module.
//
// A bad value is a 400 naming the parameter. Unknown and repeated parameters are 400s too: a typo such as
// "staus=cancelled" must not silently return every booking.

import { BOOKING_STATUSES } from "./api-contract.ts"
import type { BookingStatus } from "./api-contract.ts"

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?(Z|[+-]\d{2}:\d{2})$/

export function isUuid(value: string): boolean {
  return UUID.test(value)
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

export function isCalendarDate(value: string): boolean {
  const m = DATE_ONLY.exec(value)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  return year >= 1970 && year <= 2999 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

// An ISO-8601 timestamp that states its offset ("2026-10-07T09:30:00+03:00" or "...Z").
export function isInstant(value: string): boolean {
  const m = INSTANT.exec(value)
  if (!m) return false
  if (!isCalendarDate(`${m[1]}-${m[2]}-${m[3]}`)) return false
  const hour = Number(m[4])
  const minute = Number(m[5])
  const second = m[6] === undefined ? 0 : Number(m[6])
  if (hour > 23 || minute > 59 || second > 59) return false
  const zone = m[8]
  if (zone !== "Z") {
    const zh = Number(zone.slice(1, 3))
    const zm = Number(zone.slice(4, 6))
    if (zh > 23 || zm > 59) return false
  }
  return true
}

// Milliseconds since the epoch of a validated date-only (midnight in Riyadh, UTC+03:00) or instant value.
// Only used to compare two filter values with each other; the database does the real conversion.
export function filterEpochMs(value: string): number {
  if (DATE_ONLY.test(value)) return Date.parse(`${value}T00:00:00+03:00`)
  return Date.parse(value)
}

export function parseUuidParam(name: string, raw: string | null, required: boolean): Parsed<string | null> {
  if (raw === null || raw === "") {
    return required ? { ok: false, message: `The ${name} parameter is required.` } : { ok: true, value: null }
  }
  if (!isUuid(raw)) return { ok: false, message: `The ${name} parameter must be a UUID.` }
  return { ok: true, value: raw.toLowerCase() }
}

export function parseDateParam(name: string, raw: string | null, required: boolean): Parsed<string | null> {
  if (raw === null || raw === "") {
    return required ? { ok: false, message: `The ${name} parameter is required.` } : { ok: true, value: null }
  }
  if (!isCalendarDate(raw)) return { ok: false, message: `The ${name} parameter must be a calendar date like 2026-10-07.` }
  return { ok: true, value: raw }
}

// A date (interpreted in Asia/Riyadh) or a timestamp with an explicit offset.
export function parseWhenParam(name: string, raw: string | null): Parsed<string | null> {
  if (raw === null || raw === "") return { ok: true, value: null }
  if (isCalendarDate(raw) || isInstant(raw)) return { ok: true, value: raw }
  return { ok: false, message: `The ${name} parameter must be a date like 2026-10-07 or a timestamp with an offset like 2026-10-07T09:30:00+03:00.` }
}

export function parseStatusParam(raw: string | null): Parsed<BookingStatus | null> {
  if (raw === null || raw === "") return { ok: true, value: null }
  if ((BOOKING_STATUSES as readonly string[]).includes(raw)) return { ok: true, value: raw as BookingStatus }
  return { ok: false, message: `The status parameter must be one of: ${BOOKING_STATUSES.join(", ")}.` }
}

// Rejects parameters the endpoint does not define, and any parameter given twice.
export function checkParams(params: URLSearchParams, allowed: readonly string[]): Parsed<true> {
  const seen = new Set<string>()
  for (const key of params.keys()) {
    if (!allowed.includes(key)) return { ok: false, message: `Unknown parameter: ${key.slice(0, 40)}.` }
    if (seen.has(key)) return { ok: false, message: `The ${key} parameter was given more than once.` }
    seen.add(key)
  }
  return { ok: true, value: true }
}
