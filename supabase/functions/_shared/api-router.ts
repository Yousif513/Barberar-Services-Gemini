// Routing and request handling of the public read API. Pure module.
//
// handleApiRequest runs the whole pipeline (route, key, rate limit, scope, parameters, data, pagination, errors)
// against an injected backend, so the Deno entry point only adapts Request/Response and the database client, and
// the pipeline is tested in Node with a fake backend.
//
// Order matters and is part of the security model:
//   1. route and method        404 / 405 (answered before any key is looked at)
//   2. bearer token shape      401 without touching the database
//   3. authenticate_api_key    401 (one message for every refusal), 429 with the rate-limit headers
//   4. scope of the route      403 naming the scope
//   5. query parameters        400 naming the parameter
//   6. data function           provider and branch come from step 3, never from the request
// No response carries CORS headers: this is a server-to-server API and a browser must not call it with a key.

import { API_SCOPES } from "./api-contract.ts"
import type { ApiScope } from "./api-contract.ts"
import { ERROR_STATUS, UNAUTHORIZED_MESSAGE, errorBody, mapBackendError, newRequestId } from "./api-errors.ts"
import type { ApiErrorCode, BackendError } from "./api-errors.ts"
import { checkParams, filterEpochMs, isInstant, isUuid, parseDateParam, parseStatusParam, parseUuidParam, parseWhenParam } from "./api-params.ts"
import type { Parsed } from "./api-params.ts"
import { decodeCursor, paginate, parseLimit } from "./api-pagination.ts"
import type { Cursor } from "./api-pagination.ts"
import { parseRateLimit, rateLimitHeaders, retryAfterSeconds } from "./api-rate-limit.ts"
import type { RateLimitState } from "./api-rate-limit.ts"

export interface ApiRequestLike {
  method: string
  url: string
  headers: { get(name: string): string | null }
}

export interface ApiResponseLike {
  status: number
  headers: Record<string, string>
  body: unknown
}

export interface ApiBackend {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: BackendError | null }>
}

export interface HandleOptions {
  now?: () => number
  requestId?: string
  log?: (event: { request_id: string; route: string | null; status: number; key_id: string | null; detail?: string }) => void
}

export interface AuthResult {
  key_id: string
  provider_id: string
  branch_id: string | null
  scopes: string[]
  rate_limit: RateLimitState
}

type Row = Record<string, unknown>

interface RouteDef {
  name: string
  path: string
  scope: ApiScope
  rpc: string
  fields: readonly string[]
  // list routes are paginated; the single route returns one document
  list: boolean
  buildArgs(params: URLSearchParams): Parsed<{ args: Record<string, unknown>; limit: number }>
  cursorOf(row: Row): Cursor
}

// The columns each endpoint may return. The data functions already select only these; the allow-list is a second
// wall so that a column added to a function later (a customer's phone, say) cannot reach an integration unnoticed.
export const SERVICE_FIELDS = [
  "id", "name_en", "name_ar", "description_en", "description_ar", "category_id", "price", "currency",
  "duration_minutes", "is_home_service_eligible", "is_active", "created_at", "updated_at",
] as const
export const EMPLOYEE_FIELDS = ["id", "branch_id", "name_en", "name_ar", "title_en", "title_ar", "is_active", "service_ids"] as const
export const AVAILABILITY_FIELDS = ["employee_id", "branch_id", "service_id", "date", "slots"] as const
export const BOOKING_FIELDS = [
  "id", "status", "scheduled_at", "duration_minutes", "branch_id", "employee_id", "service_id", "service_name_en",
  "service_name_ar", "is_home_service", "source", "total_price", "tax_amount", "discount_amount", "currency", "created_at",
] as const

const LIST_PARAMS = ["limit", "cursor"] as const

function listArgs(params: URLSearchParams, allowed: readonly string[]): Parsed<{ cursor: Cursor | null; limit: number }> {
  const known = checkParams(params, allowed)
  if (!known.ok) return known
  const limit = parseLimit(params.get("limit"))
  if (!limit.ok) return limit
  const cursor = decodeCursor(params.get("cursor"))
  if (!cursor.ok) return cursor
  return { ok: true, value: { cursor: cursor.value, limit: limit.value } }
}

const ROUTES: RouteDef[] = [
  {
    name: "services",
    path: "/v1/services",
    scope: "services:read",
    rpc: "api_list_services",
    fields: SERVICE_FIELDS,
    list: true,
    buildArgs(params) {
      const page = listArgs(params, LIST_PARAMS)
      if (!page.ok) return page
      return { ok: true, value: { limit: page.value.limit, args: { p_after_id: page.value.cursor?.i ?? null, p_limit: page.value.limit + 1 } } }
    },
    cursorOf: (row) => ({ t: null, i: String(row.id) }),
  },
  {
    name: "employees",
    path: "/v1/employees",
    scope: "employees:read",
    rpc: "api_list_employees",
    fields: EMPLOYEE_FIELDS,
    list: true,
    buildArgs(params) {
      const page = listArgs(params, LIST_PARAMS)
      if (!page.ok) return page
      return { ok: true, value: { limit: page.value.limit, args: { p_after_id: page.value.cursor?.i ?? null, p_limit: page.value.limit + 1 } } }
    },
    cursorOf: (row) => ({ t: null, i: String(row.id) }),
  },
  {
    name: "availability",
    path: "/v1/availability",
    scope: "availability:read",
    rpc: "api_get_availability",
    fields: AVAILABILITY_FIELDS,
    list: false,
    buildArgs(params) {
      const known = checkParams(params, ["service_id", "date"])
      if (!known.ok) return known
      const service = parseUuidParam("service_id", params.get("service_id"), true)
      if (!service.ok) return service
      const date = parseDateParam("date", params.get("date"), true)
      if (!date.ok) return date
      return { ok: true, value: { limit: 0, args: { p_service_id: service.value, p_date: date.value } } }
    },
    cursorOf: (row) => ({ t: null, i: String(row.employee_id) }),
  },
  {
    name: "bookings",
    path: "/v1/bookings",
    scope: "bookings:read",
    rpc: "api_list_bookings",
    fields: BOOKING_FIELDS,
    list: true,
    buildArgs(params) {
      const page = listArgs(params, ["from", "to", "status", "limit", "cursor"])
      if (!page.ok) return page
      const from = parseWhenParam("from", params.get("from"))
      if (!from.ok) return from
      const to = parseWhenParam("to", params.get("to"))
      if (!to.ok) return to
      if (from.value !== null && to.value !== null && filterEpochMs(from.value) >= filterEpochMs(to.value)) {
        return { ok: false, message: "The from parameter must be earlier than the to parameter." }
      }
      const status = parseStatusParam(params.get("status"))
      if (!status.ok) return status
      return {
        ok: true,
        value: {
          limit: page.value.limit,
          args: {
            p_from: from.value, p_to: to.value, p_status: status.value,
            p_after_scheduled_at: page.value.cursor?.t ?? null, p_after_id: page.value.cursor?.i ?? null,
            p_limit: page.value.limit + 1,
          },
        },
      }
    },
    cursorOf: (row) => ({ t: String(row.scheduled_at), i: String(row.id) }),
  },
]

export const ROUTE_PATHS = ROUTES.map((r) => r.path)
export const ROUTE_SCOPES: Record<string, ApiScope> = Object.fromEntries(ROUTES.map((r) => [r.path, r.scope]))
export const ROUTE_RPCS: string[] = ROUTES.map((r) => r.rpc)

// The function is served at /functions/v1/public-api/...; accept the path with or without those prefixes.
export function normalizePath(pathname: string): string {
  let path = pathname.replace(/^\/functions\/v1(?=\/|$)/, "").replace(/^\/public-api(?=\/|$)/, "")
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1)
  return path === "" ? "/" : path
}

export function matchRoute(pathname: string): RouteDef | null {
  const path = normalizePath(pathname)
  return ROUTES.find((r) => r.path === path) ?? null
}

const TOKEN_SHAPE = /^prm_live_[0-9a-f]{64}$/

// "Authorization: Bearer <key>". The key is never read from the query string or the body.
export function extractBearer(header: string | null): string | null {
  if (header === null) return null
  const match = /^Bearer +(\S+)$/i.exec(header.trim())
  if (!match || !TOKEN_SHAPE.test(match[1])) return null
  return match[1]
}

function parseAuthResult(data: unknown): AuthResult | null {
  if (typeof data !== "object" || data === null) return null
  const d = data as Record<string, unknown>
  const rate = parseRateLimit(d.rate_limit)
  if (typeof d.key_id !== "string" || typeof d.provider_id !== "string" || rate === null) return null
  if (d.branch_id !== null && typeof d.branch_id !== "string") return null
  if (!Array.isArray(d.scopes) || !d.scopes.every((s) => typeof s === "string")) return null
  return { key_id: d.key_id, provider_id: d.provider_id, branch_id: (d.branch_id as string | null) ?? null, scopes: d.scopes as string[], rate_limit: rate }
}

function pick(row: unknown, fields: readonly string[]): Row | null {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return null
  const out: Row = {}
  for (const field of fields) if (field in (row as Row)) out[field] = (row as Row)[field]
  return out
}

function sanitizeAvailability(row: Row): Row | null {
  if (!Array.isArray(row.slots)) return null
  const slots: { start: string; end: string }[] = []
  for (const slot of row.slots as unknown[]) {
    const s = slot as Row
    if (typeof slot !== "object" || slot === null || typeof s.start !== "string" || typeof s.end !== "string") return null
    slots.push({ start: s.start, end: s.end })
  }
  return { ...row, slots }
}

const BASE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
}

export async function handleApiRequest(req: ApiRequestLike, backend: ApiBackend, options: HandleOptions = {}): Promise<ApiResponseLike> {
  const requestId = options.requestId ?? newRequestId()
  const nowMs = options.now ?? Date.now
  let routeName: string | null = null
  let keyId: string | null = null
  let extraHeaders: Record<string, string> = {}

  const respond = (status: number, body: unknown, headers: Record<string, string> = {}, detail?: string): ApiResponseLike => {
    options.log?.({ request_id: requestId, route: routeName, status, key_id: keyId, ...(detail ? { detail } : {}) })
    return { status, headers: { ...BASE_HEADERS, ...extraHeaders, ...headers, "X-Request-Id": requestId }, body }
  }
  const fail = (code: ApiErrorCode, message: string, headers: Record<string, string> = {}, detail?: string): ApiResponseLike =>
    respond(ERROR_STATUS[code], errorBody(code, message, requestId), headers, detail)

  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return fail("invalid_request", "The request URL could not be read.")
  }

  const route = matchRoute(url.pathname)
  if (route === null) return fail("not_found", "No such endpoint.")
  routeName = route.name
  if (req.method !== "GET") return fail("method_not_allowed", "This endpoint only accepts GET.", { Allow: "GET" })

  const token = extractBearer(req.headers.get("authorization"))
  if (token === null) return fail("unauthorized", UNAUTHORIZED_MESSAGE, { "WWW-Authenticate": 'Bearer realm="primora-api"' })

  try {
    const authResponse = await backend.rpc("authenticate_api_key", { p_key: token })
    if (authResponse.error) {
      const mapped = mapBackendError(authResponse.error)
      return fail(mapped.code, mapped.message, mapped.code === "unauthorized" ? { "WWW-Authenticate": 'Bearer realm="primora-api"' } : {},
        mapped.code === "internal_error" ? `authenticate: ${authResponse.error.code ?? "?"}` : undefined)
    }
    const auth = parseAuthResult(authResponse.data)
    if (auth === null) return fail("internal_error", mapBackendError({}).message, {}, "authenticate: unexpected result shape")
    keyId = auth.key_id

    const nowSeconds = Math.floor(nowMs() / 1000)
    extraHeaders = rateLimitHeaders(auth.rate_limit, nowSeconds)
    if (auth.rate_limit.exceeded) {
      return fail("rate_limited", `Rate limit of ${auth.rate_limit.limit} requests per minute exceeded. Retry in ${retryAfterSeconds(auth.rate_limit, nowSeconds)} seconds.`)
    }

    if (!(API_SCOPES as readonly string[]).includes(route.scope) || !auth.scopes.includes(route.scope)) {
      return fail("forbidden", `This API key needs the ${route.scope} scope for this endpoint.`)
    }

    const built = route.buildArgs(url.searchParams)
    if (!built.ok) return fail("invalid_request", built.message)

    const data = await backend.rpc(route.rpc, {
      p_provider_id: auth.provider_id,
      p_branch_id: auth.branch_id,
      p_scopes: auth.scopes,
      ...built.value.args,
    })
    if (data.error) {
      const mapped = mapBackendError(data.error)
      return fail(mapped.code, mapped.message, {}, mapped.code === "internal_error" ? `${route.rpc}: ${data.error.code ?? "?"}` : undefined)
    }
    if (!Array.isArray(data.data)) return fail("internal_error", mapBackendError({}).message, {}, `${route.rpc}: result is not an array`)

    const rows: Row[] = []
    for (const raw of data.data) {
      let row = pick(raw, route.fields)
      if (row !== null && route.name === "availability") row = sanitizeAvailability(row)
      if (row === null) return fail("internal_error", mapBackendError({}).message, {}, `${route.rpc}: malformed row`)
      if (route.list) {
        const idOk = typeof row.id === "string" && isUuid(row.id)
        const timeOk = route.name !== "bookings" || (typeof row.scheduled_at === "string" && isInstant(row.scheduled_at))
        if (!idOk || !timeOk) return fail("internal_error", mapBackendError({}).message, {}, `${route.rpc}: row without a usable sort key`)
      }
      rows.push(row)
    }

    if (!route.list) return respond(200, { data: rows })
    return respond(200, paginate(rows, built.value.limit, route.cursorOf))
  } catch (error) {
    return fail("internal_error", mapBackendError({}).message, {}, `exception: ${error instanceof Error ? error.name : "unknown"}`)
  }
}
