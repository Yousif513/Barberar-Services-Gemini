// Pure helpers the customer booking screens share: receipt arithmetic, the status each booking is shown in,
// the cancellation preview, and date formatting in the platform's time zone. Plain ES module with JSDoc types so
// the web tests execute it directly on any Node version (like csv.mjs).
//
// Money model (see cancel_booking / create_booking in the migrations): bookings.total_price is the TAXABLE amount,
// bookings.tax_amount the VAT on it, so the amount due is total_price + tax_amount. The deposit is collected online,
// a gift card pays part of the amount due, and the venue collects the rest.

export const PLATFORM_TIME_ZONE = "Asia/Riyadh";

/** @param {unknown} value @returns {number} whole halalas */
export function toCents(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * @typedef {{
 *   subtotal_price?: number | string | null, discount_amount?: number | string | null, tax_amount?: number | string | null,
 *   total_price?: number | string | null, deposit_required?: number | string | null, gift_card_amount?: number | string | null
 * }} ReceiptMoney
 */

/**
 * Every figure on the receipt, in SAR, computed once from the booking row.
 * @param {ReceiptMoney} booking
 */
export function receiptAmounts(booking) {
  const taxable = toCents(booking.total_price);
  const discount = toCents(booking.discount_amount);
  const tax = toCents(booking.tax_amount);
  const deposit = toCents(booking.deposit_required);
  const giftCard = toCents(booking.gift_card_amount);
  const subtotal = booking.subtotal_price === null || booking.subtotal_price === undefined ? taxable + discount : toCents(booking.subtotal_price);
  const totalDue = taxable + tax;
  const balance = Math.max(0, totalDue - deposit - giftCard);
  return {
    subtotal: subtotal / 100,
    discount: discount / 100,
    taxable: taxable / 100,
    vat: tax / 100,
    totalDue: totalDue / 100,
    deposit: deposit / 100,
    giftCard: giftCard / 100,
    balanceAtVenue: balance / 100,
  };
}

/** @typedef {"pending_payment" | "confirmed" | "completed" | "cancelled" | "no_show" | "unknown"} BookingStatusKey */

const KNOWN_STATUSES = ["pending_payment", "confirmed", "completed", "cancelled", "no_show"];

/** @param {unknown} status @returns {BookingStatusKey} */
export function bookingStatusKey(status) {
  return /** @type {BookingStatusKey} */ (KNOWN_STATUSES.includes(String(status)) ? String(status) : "unknown");
}

const STATUS_LABELS = {
  en: { pending_payment: "Awaiting payment", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled", no_show: "No-show", unknown: "Unknown" },
  ar: { pending_payment: "بانتظار الدفع", confirmed: "مؤكد", completed: "مكتمل", cancelled: "ملغى", no_show: "لم يحضر", unknown: "غير معروف" },
};

/** Every status in the active language; an unmapped value is never printed raw. @param {unknown} status @param {"en" | "ar"} locale */
export function bookingStatusLabel(status, locale) {
  return STATUS_LABELS[locale][bookingStatusKey(status)];
}

/** @param {BookingStatusKey} key @returns {"emerald" | "amber" | "red" | "stone" | "sky"} */
export function bookingStatusTone(key) {
  if (key === "confirmed" || key === "completed") return "emerald";
  if (key === "pending_payment") return "amber";
  if (key === "cancelled" || key === "no_show") return "red";
  return "stone";
}

/**
 * What happened to the money, from the booking row. A cancelled booking that kept a late fee is not "refunded".
 * @param {{ status?: unknown, deposit_required?: unknown, cancellation_fee?: unknown, refund_amount?: unknown }} booking
 * @returns {"pending" | "paid" | "not_required" | "refunded" | "partly_refunded" | "fee_kept" | "no_charge"}
 */
export function settlementKey(booking) {
  const status = bookingStatusKey(booking.status);
  if (status === "pending_payment") return "pending";
  if (status === "cancelled" || status === "no_show") {
    const fee = toCents(booking.cancellation_fee);
    const refund = toCents(booking.refund_amount);
    if (fee > 0 && refund > 0) return "partly_refunded";
    if (fee > 0) return "fee_kept";
    if (refund > 0) return "refunded";
    return "no_charge";
  }
  return toCents(booking.deposit_required) > 0 ? "paid" : "not_required";
}

/** @param {BookingStatusKey} key */
export function isSuccessfulBooking(key) {
  return key === "confirmed" || key === "completed";
}

/**
 * @typedef {{ freeHours: number, lateFeePercent: number, noShowFeePercent: number, depositPercent: number }} CancellationPolicy
 */

/**
 * The provider's policy from its columns; a missing column falls back to the database default so the receipt never
 * prints a literal of its own for a provider the query did not return.
 * @param {{ free_cancellation_hours?: unknown, late_cancellation_fee_percent?: unknown, no_show_fee_percent?: unknown, deposit_percentage?: unknown } | null | undefined} provider
 * @returns {CancellationPolicy | null} null when the provider row was not loaded
 */
export function policyFromProvider(provider) {
  if (!provider) return null;
  const num = (value, fallback) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? fallback : Number(value));
  return {
    freeHours: num(provider.free_cancellation_hours, 24),
    lateFeePercent: num(provider.late_cancellation_fee_percent, 50),
    noShowFeePercent: num(provider.no_show_fee_percent, 100),
    depositPercent: num(provider.deposit_percentage, 20),
  };
}

/** @param {number} value @param {"en" | "ar"} locale */
export function formatNumber(value, locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-GB", { maximumFractionDigits: 2 }).format(value);
}

/** The policy as sentences, so every number on screen comes from the provider's own settings. @param {CancellationPolicy} policy @param {"en" | "ar"} locale */
export function policySentences(policy, locale) {
  const hours = formatNumber(policy.freeHours, locale);
  const late = formatNumber(policy.lateFeePercent, locale);
  const noShow = formatNumber(policy.noShowFeePercent, locale);
  if (locale === "ar") {
    return [
      policy.freeHours > 0
        ? `الإلغاء مجاني مع استرداد العربون كاملاً حتى ${hours} ساعة قبل الموعد.`
        : "لا توجد فترة إلغاء مجاني: يُطبَّق رسم الإلغاء المتأخر على أي إلغاء.",
      policy.lateFeePercent > 0 ? `عند الإلغاء المتأخر يُخصم ${late}% من العربون.` : "لا يُخصم أي رسم عند الإلغاء المتأخر.",
      policy.noShowFeePercent > 0 ? `عند عدم الحضور يُخصم ${noShow}% من العربون.` : "لا يُخصم أي رسم عند عدم الحضور.",
    ];
  }
  return [
    policy.freeHours > 0
      ? `Free cancellation with a full deposit refund up to ${hours} hours before the appointment.`
      : "There is no free-cancellation window: the late-cancellation fee applies to any cancellation.",
    policy.lateFeePercent > 0 ? `A later cancellation keeps ${late}% of the deposit.` : "A later cancellation keeps no fee.",
    policy.noShowFeePercent > 0 ? `A no-show keeps ${noShow}% of the deposit.` : "A no-show keeps no fee.",
  ];
}

/**
 * What cancelling now would cost, from the provider's policy. It mirrors cancel_booking: the fee applies to the amount
 * captured, only when the visit is closer than the free window; a booking still awaiting payment has captured nothing.
 * The database stays authoritative: the screen shows the figures cancel_booking returns after the call.
 * @param {{ status: unknown, scheduledAt: string, now: Date, depositRequired: unknown, policy: CancellationPolicy }} input
 */
export function cancellationPreview({ status, scheduledAt, now, depositRequired, policy }) {
  const captured = bookingStatusKey(status) === "confirmed" ? toCents(depositRequired) : 0;
  const hoursUntil = (new Date(scheduledAt).getTime() - now.getTime()) / 3_600_000;
  const late = hoursUntil < policy.freeHours;
  const fee = captured > 0 && late ? Math.min(Math.round((captured * policy.lateFeePercent) / 100), captured) : 0;
  return { captured: captured / 100, hoursUntil, late, fee: fee / 100, refund: (captured - fee) / 100 };
}

/** @param {string} iso @param {"en" | "ar"} locale @param {Intl.DateTimeFormatOptions} options */
function format(iso, locale, options) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { ...options, timeZone: PLATFORM_TIME_ZONE }).format(date);
}

/** Weekday, date and time in Riyadh time and the active language. */
export function formatBookingDateTime(iso, locale) {
  return format(iso, locale, { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

/** Date only, in Riyadh time and the active language. */
export function formatBookingDate(iso, locale) {
  return format(iso, locale, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

/** Time only, in Riyadh time and the active language. */
export function formatBookingTime(iso, locale) {
  return format(iso, locale, { hour: "numeric", minute: "2-digit", hour12: true });
}

/** The booking day (YYYY-MM-DD) of an instant in Riyadh, for date inputs and RPC date arguments. @param {Date} date */
export function riyadhDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PLATFORM_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** The shop page link that starts a repeat booking of one service, or null when the provider is unknown. */
export function bookAgainHref(providerId, serviceId) {
  if (!providerId) return null;
  return serviceId ? `/shop/${providerId}?service=${encodeURIComponent(serviceId)}` : `/shop/${providerId}`;
}

/**
 * The state a customer sees for one wallet ledger row, from the booking it belongs to. A cancelled booking that kept a
 * late fee is not "refunded"; a visit that has not happened yet is "upcoming"; nothing is "held in escrow".
 * @param {{ status?: unknown, scheduled_at?: string | null, deposit_required?: unknown, cancellation_fee?: unknown, refund_amount?: unknown }} booking
 * @param {Date} now
 * @returns {"pending" | "upcoming" | "completed" | "refunded" | "partly_refunded" | "fee_kept" | "no_charge"}
 */
export function walletEntryStatus(booking, now) {
  const status = bookingStatusKey(booking.status);
  if (status === "cancelled" || status === "no_show") {
    const settled = settlementKey(booking);
    return settled === "refunded" || settled === "partly_refunded" || settled === "fee_kept" ? settled : "no_charge";
  }
  if (status === "pending_payment") return "pending";
  if (status === "confirmed" && booking.scheduled_at && new Date(booking.scheduled_at).getTime() > now.getTime()) return "upcoming";
  return "completed";
}

/**
 * Deposits the customer has paid for confirmed visits that have not happened yet, net of anything refunded. Completed
 * visits waiting for payout, refund-pending rows and tips are not "upcoming deposits".
 * @param {Array<{ entry_type?: string | null, total_captured?: unknown, refunded_amount?: unknown, booking?: { status?: unknown, scheduled_at?: string | null } | null }>} entries
 * @param {Date} now
 * @returns {number} SAR
 */
export function upcomingDepositTotal(entries, now) {
  let cents = 0;
  for (const entry of entries) {
    if ((entry.entry_type ?? "booking_payment") !== "booking_payment" || !entry.booking) continue;
    if (bookingStatusKey(entry.booking.status) !== "confirmed" || !entry.booking.scheduled_at) continue;
    if (new Date(entry.booking.scheduled_at).getTime() <= now.getTime()) continue;
    cents += Math.max(0, toCents(entry.total_captured) - toCents(entry.refunded_amount));
  }
  return cents / 100;
}
