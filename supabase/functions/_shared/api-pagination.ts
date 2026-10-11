// Cursor pagination. Pure module.
//
// A cursor is an opaque base64url string that holds the sort key of the last item of the previous page. Timestamps
// stay in the exact text the database returned (microsecond precision) so a page boundary never skips or repeats a
// row because of rounding.

import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from "./api-contract.ts"
import { isInstant, isUuid } from "./api-params.ts"
import type { Parsed } from "./api-params.ts"

export interface Cursor {
  // Sort timestamp for time-ordered lists (bookings); null for lists ordered by id alone.
  t: string | null
  // Id of the last item returned; the tie-breaker of the sort key.
  i: string
}

const CURSOR_VERSION = 1
const MAX_CURSOR_CHARS = 256
const BASE64URL = /^[A-Za-z0-9_-]+$/

export function parseLimit(raw: string | null): Parsed<number> {
  if (raw === null) return { ok: true, value: PAGE_SIZE_DEFAULT }
  if (!/^[1-9][0-9]{0,5}$/.test(raw) || Number(raw) > PAGE_SIZE_MAX) {
    return { ok: false, message: `The limit parameter must be a whole number from 1 to ${PAGE_SIZE_MAX}.` }
  }
  return { ok: true, value: Number(raw) }
}

export function encodeCursor(cursor: Cursor): string {
  const json = JSON.stringify({ v: CURSOR_VERSION, t: cursor.t, i: cursor.i })
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function decodeCursor(raw: string | null): Parsed<Cursor | null> {
  if (raw === null || raw === "") return { ok: true, value: null }
  const bad: Parsed<Cursor | null> = { ok: false, message: "The cursor parameter is not valid. Use the next_cursor value of a previous response unchanged." }
  if (raw.length > MAX_CURSOR_CHARS || !BASE64URL.test(raw)) return bad
  let parsed: unknown
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/")
    parsed = JSON.parse(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4)))
  } catch {
    return bad
  }
  if (typeof parsed !== "object" || parsed === null) return bad
  const body = parsed as Record<string, unknown>
  if (body.v !== CURSOR_VERSION || typeof body.i !== "string" || !isUuid(body.i)) return bad
  if (body.t !== null && (typeof body.t !== "string" || !isInstant(body.t))) return bad
  return { ok: true, value: { t: body.t as string | null, i: body.i.toLowerCase() } }
}

export interface Page<T> {
  data: T[]
  pagination: { limit: number; has_more: boolean; next_cursor: string | null }
}

// `rows` holds up to limit + 1 rows fetched with the sort key after the cursor. The extra row only says there is
// another page; it is not returned.
export function paginate<T>(rows: T[], limit: number, cursorOf: (row: T) => Cursor): Page<T> {
  const hasMore = rows.length > limit
  const data = hasMore ? rows.slice(0, limit) : rows
  const last = data[data.length - 1]
  return {
    data,
    pagination: { limit, has_more: hasMore, next_cursor: hasMore && last !== undefined ? encodeCursor(cursorOf(last)) : null },
  }
}
