// Error taxonomy of the public API. Pure module.
//
// Every failure has the same JSON shape: { "error": { "code", "message", "request_id" } }.
// Database messages are never forwarded: a caller sees a fixed message per code, and the real cause stays in the
// server log next to the request id.

export type ApiErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "method_not_allowed"
  | "rate_limited"
  | "internal_error"

export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  rate_limited: 429,
  internal_error: 500,
}

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; request_id: string }
}

export interface BackendError {
  code?: string | null
  message?: string | null
}

// One message for every authentication failure, so a caller cannot tell a revoked key from an unknown one.
export const UNAUTHORIZED_MESSAGE = "Invalid or missing API key."

export function errorBody(code: ApiErrorCode, message: string, requestId: string): ApiErrorBody {
  return { error: { code, message, request_id: requestId } }
}

// Maps a database error (SQLSTATE in `code`) to the API taxonomy. Unknown errors are internal errors.
export function mapBackendError(error: BackendError): { code: ApiErrorCode; message: string } {
  switch (error.code) {
    case "28000":
      return { code: "unauthorized", message: UNAUTHORIZED_MESSAGE }
    case "42501":
      return { code: "forbidden", message: "This API key does not have the scope this endpoint needs." }
    case "P0002":
      return { code: "not_found", message: "The requested resource was not found." }
    case "22023":
    case "22007":
    case "22P02":
      return { code: "invalid_request", message: "The request parameters were not accepted." }
    default:
      return { code: "internal_error", message: "Something went wrong on our side. Quote the request id when you contact support." }
  }
}

// Server-generated, never taken from the caller (so a caller cannot inject text into logs).
export function newRequestId(): string {
  return "req_" + crypto.randomUUID().replace(/-/g, "")
}
