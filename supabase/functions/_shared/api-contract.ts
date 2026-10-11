// The public API contract (G69). Pure module: no Deno globals, no remote imports, so Node can import it for tests.
//
// Everything here is part of the interface that integrators code against. Changing a value is a breaking change
// and needs a new API version. Business limits (requests per minute, retry counts) are NOT here: they live in
// platform_settings and on the key row.

export const API_VERSION = "v1"

// Scopes a key can carry. Keep in sync with public.api_allowed_scopes() (a test compares them).
// webhooks:manage is deliberately absent: webhooks are managed in the console only.
export const API_SCOPES = ["services:read", "employees:read", "availability:read", "bookings:read"] as const
export type ApiScope = (typeof API_SCOPES)[number]

// Pagination. A page never holds more than PAGE_SIZE_MAX items; asking for more is a 400, never a silent clamp.
export const PAGE_SIZE_DEFAULT = 25
export const PAGE_SIZE_MAX = 100

// Booking states an integration can filter on (the booking_status enum).
export const BOOKING_STATUSES = ["pending_payment", "confirmed", "completed", "cancelled", "no_show"] as const
export type BookingStatus = (typeof BOOKING_STATUSES)[number]

// Date-only filters and the availability date are calendar dates in this time zone.
export const API_TIME_ZONE = "Asia/Riyadh"

// Webhook contract.
export const WEBHOOK_EVENT_TYPES = ["booking.created", "booking.confirmed", "booking.cancelled", "booking.completed"] as const
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]
export const SIGNATURE_HEADER = "X-Primora-Signature"
export const EVENT_HEADER = "X-Primora-Event"
export const EVENT_ID_HEADER = "X-Primora-Event-Id"
export const SIGNATURE_VERSION = "v1"
// A receiver should reject a signed timestamp older than this (replay protection).
export const SIGNATURE_TOLERANCE_SECONDS = 300
// An endpoint must answer within this time or the attempt counts as failed.
export const DELIVERY_TIMEOUT_MS = 10000
// Only this much of an endpoint's answer or error is kept in the delivery log.
export const DELIVERY_NOTE_MAX_CHARS = 200

export const RATE_LIMIT_WINDOW_SECONDS = 60
export const MAX_URL_LENGTH = 2048
