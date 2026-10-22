export const HELD_CHECKOUT_PAGE_SIZE = 25;
export const HELD_CHECKOUT_MAX_OFFSET = 100000;
export const HELD_CHECKOUT_STATUSES = ["submitting", "unknown", "captured", "failed"];
export const HELD_CHECKOUT_PURCHASE_TYPES = ["booking", "gift_card", "package", "membership", "tip", "subscription"];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const timestamp = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const responseError = () => { throw new Error("response"); };
const FIELDS = ["id", "purchase_type", "target_id", "amount_sar", "currency", "status", "is_current", "reconciliation_required", "created_at", "updated_at", "unknown_at"];

export function heldCheckoutArgs(filters, offset) {
  const uuid = (key) => {
    const value = filters[key].trim();
    if (value && !UUID.test(value)) throw new Error(key);
    return value.toLowerCase() || null;
  };
  if (filters.status && !HELD_CHECKOUT_STATUSES.includes(filters.status)) throw new Error("status");
  if (filters.purchaseType && !HELD_CHECKOUT_PURCHASE_TYPES.includes(filters.purchaseType)) throw new Error("purchaseType");
  if (!Number.isInteger(offset) || offset < 0 || offset > HELD_CHECKOUT_MAX_OFFSET) throw new Error("offset");
  return { p_status: filters.status || null, p_purchase_type: filters.purchaseType || null, p_attempt_id: uuid("attemptId"), p_target_id: uuid("targetId"), p_limit: HELD_CHECKOUT_PAGE_SIZE, p_offset: offset };
}

function attempt(value) {
  if (!record(value) || Object.keys(value).length !== FIELDS.length || FIELDS.some((key) => !Object.hasOwn(value, key))) return responseError();
  if (typeof value.id !== "string" || !UUID.test(value.id) || typeof value.target_id !== "string" || !UUID.test(value.target_id)
      || !HELD_CHECKOUT_PURCHASE_TYPES.includes(value.purchase_type) || !HELD_CHECKOUT_STATUSES.includes(value.status)
      || value.currency !== "SAR" || typeof value.amount_sar !== "number" || !Number.isFinite(value.amount_sar) || value.amount_sar <= 0
      || typeof value.is_current !== "boolean" || typeof value.reconciliation_required !== "boolean"
      || !timestamp(value.created_at) || !timestamp(value.updated_at) || (value.unknown_at !== null && !timestamp(value.unknown_at))
      || (value.status === "unknown" && value.unknown_at === null)
      || (!["submitting", "unknown"].includes(value.status) && !value.reconciliation_required)) return responseError();
  return Object.fromEntries(FIELDS.map((key) => [key, value[key]]));
}

export function parseHeldCheckoutList(value, expectedOffset) {
  if (!record(value) || !Array.isArray(value.items) || !Number.isSafeInteger(value.total) || value.total < 0
      || !Number.isInteger(value.limit) || value.limit !== HELD_CHECKOUT_PAGE_SIZE || !Number.isInteger(value.offset)
      || value.offset < 0 || value.offset > HELD_CHECKOUT_MAX_OFFSET || value.offset !== expectedOffset || !timestamp(value.as_of)
      || value.items.length > value.limit || value.total < value.items.length
      || (value.items.length > 0 && value.total < value.offset + value.items.length)) return responseError();
  return { items: value.items.map(attempt), total: value.total, as_of: value.as_of, limit: value.limit, offset: value.offset };
}

export function parseHeldCheckoutDetail(value, expectedId) {
  if (!record(value) || !timestamp(value.as_of) || !Object.hasOwn(value, "attempt")) return responseError();
  const item = value.attempt === null ? null : attempt(value.attempt);
  if (item && item.id !== expectedId) return responseError();
  return { attempt: item, as_of: value.as_of };
}

export function elapsedCheckoutMinutes(value, asOf) {
  const elapsed = Date.parse(asOf) - Date.parse(value.created_at);
  return Number.isFinite(elapsed) && elapsed >= 0 ? Math.floor(elapsed / 60000) : null;
}
