// Constants and helpers of the developer console. The API contract values mirror supabase/functions/_shared/api-contract.ts
// (the Edge Function side); web_platform/tests/developer-console.test.mjs fails when the two drift apart.

export const API_SCOPES = ["services:read", "employees:read", "availability:read", "bookings:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];
export const WEBHOOK_EVENTS = ["booking.created", "booking.confirmed", "booking.cancelled", "booking.completed"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export const BOOKING_STATUSES = ["pending_payment", "confirmed", "completed", "cancelled", "no_show"] as const;

export const PAGE_SIZE_DEFAULT = 25;
export const PAGE_SIZE_MAX = 100;
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const SIGNATURE_TOLERANCE_SECONDS = 300;
export const DELIVERY_TIMEOUT_SECONDS = 10;
export const BACKOFF_CAP_HOURS = 24;
export const LEASE_MINUTES = 5;
export const MAX_URL_LENGTH = 2048;

// Rows of the delivery log shown per request.
export const DELIVERY_LOG_PAGE = 25;

export type ApiSettingKey =
  | "api.max_requests_per_minute"
  | "api.max_key_lifetime_days"
  | "api.webhook_max_attempts"
  | "api.webhook_retry_base_seconds"
  | "api.webhook_disable_after_failures";
export const API_SETTING_KEYS: readonly ApiSettingKey[] = [
  "api.max_requests_per_minute",
  "api.max_key_lifetime_days",
  "api.webhook_max_attempts",
  "api.webhook_retry_base_seconds",
  "api.webhook_disable_after_failures",
];

export type ApiSettings = Record<ApiSettingKey, number | null>;

// A setting is "set" only when it holds a positive whole number; a missing row and JSON null both mean unset.
export function readApiSettings(rows: Array<{ key: string; value: unknown }>): ApiSettings {
  const out = Object.fromEntries(API_SETTING_KEYS.map((key) => [key, null])) as ApiSettings;
  for (const row of rows) {
    if ((API_SETTING_KEYS as readonly string[]).includes(row.key) && typeof row.value === "number" && Number.isInteger(row.value) && row.value >= 1) {
      out[row.key as ApiSettingKey] = row.value;
    }
  }
  return out;
}

export const keysEnabled = (s: ApiSettings) => s["api.max_requests_per_minute"] !== null;
export const webhookDeliveryEnabled = (s: ApiSettings) => s["api.webhook_max_attempts"] !== null && s["api.webhook_retry_base_seconds"] !== null;

// "prm_live_a1b2…c3d4": the only form in which a stored key is ever displayed.
export function maskKey(prefix: string, last4: string): string {
  return `${prefix}…${last4}`;
}

// A chosen calendar day becomes the last second of that day in Riyadh (UTC+03:00, no daylight saving).
export function endOfDayRiyadh(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const at = new Date(`${date}T23:59:59+03:00`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

// The earliest and latest day an expiry may be set to, as YYYY-MM-DD in Riyadh. A chosen day means the end of that day,
// so with a lifetime ceiling of L days the latest offered day is the one that contains now + (L - 1) days: its last
// second is still before now + L days, which is what the database accepts.
export function expiryBounds(now: Date, lifetimeDays: number | null): { min: string; max: string | null } {
  const riyadh = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const day = 86400000;
  return { min: riyadh(now), max: lifetimeDays === null ? null : riyadh(new Date(now.getTime() + (lifetimeDays - 1) * day)) };
}

export type KeyState = "active" | "expired" | "revoked";
export function keyState(key: { revoked_at: string | null; expires_at: string }, now: Date): KeyState {
  if (key.revoked_at) return "revoked";
  return new Date(key.expires_at).getTime() <= now.getTime() ? "expired" : "active";
}

export type ApiKeyRow = {
  id: string;
  branch_id: string | null;
  name: string;
  key_prefix: string;
  key_last4: string;
  scopes: string[];
  requests_per_minute: number;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type EndpointRow = {
  id: string;
  branch_id: string | null;
  name: string | null;
  target_url: string;
  event_types: string[];
  is_active: boolean;
  disabled_reason: string | null;
  disabled_at: string | null;
  consecutive_failures: number;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  created_at: string;
};

export type DeliveryRow = {
  id: string;
  subscription_id: string;
  event_type: string;
  event_id: string;
  status: "pending" | "delivered" | "failed" | "skipped";
  attempt_count: number;
  next_attempt_at: string;
  last_attempt_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
};

// The columns the console selects. Written out so the schema check in the tests can compare them with the migrations.
export const API_KEY_COLUMNS = "id, branch_id, name, key_prefix, key_last4, scopes, requests_per_minute, expires_at, last_used_at, revoked_at, created_at";
export const ENDPOINT_COLUMNS =
  "id, branch_id, name, target_url, event_types, is_active, disabled_reason, disabled_at, consecutive_failures, last_attempt_at, last_success_at, last_failure_at, created_at";
export const DELIVERY_COLUMNS =
  "id, subscription_id, event_type, event_id, status, attempt_count, next_attempt_at, last_attempt_at, last_status_code, last_error, delivered_at, created_at";
