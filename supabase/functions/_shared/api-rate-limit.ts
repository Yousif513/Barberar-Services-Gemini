// Rate-limit state and headers. Pure module.
//
// authenticate_api_key (database) owns the counting. This module validates what it returned and turns it into
// the headers every authenticated response carries:
//   X-RateLimit-Limit      requests allowed per window (the value stored on the key)
//   X-RateLimit-Remaining  requests left in the current window
//   X-RateLimit-Reset      Unix time (seconds) at which the window ends
//   Retry-After            seconds to wait; only on a 429

export interface RateLimitState {
  limit: number
  remaining: number
  reset_at: number
  exceeded: boolean
}

export function parseRateLimit(value: unknown): RateLimitState | null {
  if (typeof value !== "object" || value === null) return null
  const v = value as Record<string, unknown>
  if (!Number.isInteger(v.limit) || (v.limit as number) < 1) return null
  if (!Number.isInteger(v.remaining) || (v.remaining as number) < 0 || (v.remaining as number) > (v.limit as number)) return null
  if (!Number.isInteger(v.reset_at) || (v.reset_at as number) < 0) return null
  if (typeof v.exceeded !== "boolean") return null
  return { limit: v.limit as number, remaining: v.remaining as number, reset_at: v.reset_at as number, exceeded: v.exceeded }
}

export function retryAfterSeconds(state: RateLimitState, nowSeconds: number): number {
  return Math.max(1, state.reset_at - nowSeconds)
}

export function rateLimitHeaders(state: RateLimitState, nowSeconds: number): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(state.limit),
    "X-RateLimit-Remaining": String(state.exceeded ? 0 : state.remaining),
    "X-RateLimit-Reset": String(state.reset_at),
  }
  if (state.exceeded) headers["Retry-After"] = String(retryAfterSeconds(state, nowSeconds))
  return headers
}
