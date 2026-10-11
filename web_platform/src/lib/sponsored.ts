// Shared pieces of the sponsored-placement screens (G63): the shapes the database answers with, the month list, and the bilingual
// wording of the server's refusals. Nothing here is a business value: the price, the slot count and the window are read from the
// database (platform_settings through sponsored_config) and shown as they are.
import { describeServerError } from "@/app/provider/_components/server-errors";
import type { OperationsLocale } from "@/components/operations-ui";

export type SponsoredConfig = {
  enabled: boolean;
  configured: boolean;
  missing: string[];
  price_per_new_client_sar: number | null;
  max_slots_per_search: number | null;
  attribution_window_days: number | null;
};

export type CampaignStatus = "draft" | "active" | "paused" | "ended";
export type AttributionStatus = "accrued" | "waived" | "void";

export type StatementTotals = {
  new_clients: number;
  accrued_sar: number;
  billed_sar: number;
  unbilled_sar: number;
  waived_sar: number;
  void_sar: number;
  waived_for_cap: number;
  returning_clients: number;
};

export type StatementCampaign = {
  campaign_id: string;
  status: CampaignStatus;
  monthly_budget_cap_sar: number;
  spent_sar: number;
  cap_remaining_sar: number;
  new_clients: number;
  clicks: number;
};

export type StatementLine = {
  attribution_id: string;
  campaign_id: string;
  booking_id: string;
  status: AttributionStatus;
  status_reason: string | null;
  is_new_client: boolean;
  fee_amount_sar: number;
  invoice_number: string | null;
  created_at: string;
};

export type Statement = {
  provider_id: string;
  month: string;
  currency: "SAR";
  clicks: number;
  totals: StatementTotals;
  campaigns: StatementCampaign[];
  lines: StatementLine[];
};

export type SponsoredPlacement = {
  campaign_id: string;
  provider_id: string;
  branch_id: string;
  business_name_en: string;
  business_name_ar: string;
  branch_name_en: string;
  branch_name_ar: string;
  city: string | null;
  district: string | null;
  verified_business: boolean;
  rating: number | null;
  reviews: number;
  is_sponsored: true;
};

export const statusLabel: Record<OperationsLocale, Record<CampaignStatus | AttributionStatus, string>> = {
  en: { draft: "Draft", active: "Active", paused: "Paused", ended: "Ended", accrued: "Charged", waived: "Not charged", void: "Cancelled" },
  ar: { draft: "مسودة", active: "نشطة", paused: "متوقفة مؤقتاً", ended: "منتهية", accrued: "محتسبة", waived: "غير محتسبة", void: "ملغاة" },
};

// Why a fee was not charged. "cap" and "not_new_client" are written by the database; anything else is an administrator's own reason.
export const waivedReason: Record<OperationsLocale, Record<string, string>> = {
  en: { cap: "Monthly budget reached", not_new_client: "Returning client" },
  ar: { cap: "تم بلوغ الميزانية الشهرية", not_new_client: "عميل سابق" },
};

// The settings the owner must decide before anything runs, named for people.
export const settingLabel: Record<OperationsLocale, Record<string, string>> = {
  en: {
    "sponsored.enabled": "Master switch",
    "sponsored.price_per_new_client_sar": "Price per new client",
    "sponsored.max_slots_per_search": "Sponsored places per search",
    "sponsored.attribution_window_days": "Attribution window",
  },
  ar: {
    "sponsored.enabled": "المفتاح الرئيسي",
    "sponsored.price_per_new_client_sar": "السعر لكل عميل جديد",
    "sponsored.max_slots_per_search": "عدد الأماكن المموّلة في البحث",
    "sponsored.attribution_window_days": "مدة الاحتساب",
  },
};

const arabicReasons: Array<[RegExp, string]> = [
  [/^Sponsored placement is not available yet/i, "الأماكن المموّلة غير متاحة بعد."],
  [/^Provider not found/i, "لم يُعثر على النشاط المطلوب."],
  [/^Campaign not found/i, "لم يُعثر على الحملة."],
  [/^Attribution not found/i, "لم يُعثر على السجل المطلوب."],
  [/^Only an active, verified business can promote/i, "يمكن للنشاط الفعّال والموثّق فقط أن يروّج لنفسه."],
  [/^The monthly budget must be above 0/i, "الميزانية الشهرية يجب أن تكون أكبر من صفر وبخانتين عشريتين كحد أقصى."],
  [/^The end date is before the start date/i, "تاريخ النهاية قبل تاريخ البداية."],
  [/^The end date has passed/i, "انتهى تاريخ النهاية؛ مدّده قبل التفعيل."],
  [/^Unknown category/i, "التصنيف غير معروف."],
  [/^Branch not found/i, "لم يُعثر على الفرع."],
  [/^The branch is not in the chosen city/i, "الفرع ليس في المدينة المختارة."],
  [/^The city is too long/i, "اسم المدينة طويل جداً."],
  [/^An ended campaign cannot be changed/i, "لا يمكن تعديل حملة منتهية."],
  [/^Only an active campaign can be paused/i, "يمكن إيقاف الحملة النشطة فقط."],
  [/^The status must be active, paused or ended/i, "الحالة يجب أن تكون نشطة أو متوقفة أو منتهية."],
  [/^A reason of at least 3 characters/i, "اكتب سبباً لا يقل عن 3 أحرف."],
  [/^The action must be void or waive/i, "الإجراء إما إلغاء أو تنازل."],
  [/^Only an accrued fee can be voided or waived/i, "يمكن إلغاء الرسوم المحتسبة فقط أو التنازل عنها."],
  [/^This fee is already on an issued invoice/i, "هذه الرسوم مدرجة في فاتورة صادرة: صحّحها بإشعار دائن."],
  [/^The sponsored price/i, "السعر يجب أن يكون أكبر من صفر وبخانتين عشريتين كحد أقصى."],
  [/^The number of sponsored places/i, "عدد الأماكن المموّلة عدد صحيح من 1 إلى 10."],
  [/^The attribution window/i, "مدة الاحتساب عدد صحيح من الأيام بين 1 و365."],
  [/^Sponsored placement is switched on or off/i, "المفتاح الرئيسي إما مفعّل أو متوقف."],
];

export function sponsoredError(error: unknown, locale: OperationsLocale): string {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : String(error ?? "");
  if (locale === "ar") for (const [pattern, arabic] of arabicReasons) if (pattern.test(message)) return arabic;
  return describeServerError(error, locale);
}

const riyadhMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit" });

// The current Riyadh month and the five before it, as the first day of the month (yyyy-mm-01), newest first.
export function recentMonths(now: number, count = 6): string[] {
  const [year, month] = riyadhMonth.format(new Date(now)).split("-").map(Number);
  return Array.from({ length: count }, (_, back) => {
    const index = year * 12 + (month - 1) - back;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
  });
}

export function monthName(firstOfMonth: string, locale: OperationsLocale): string {
  const [year, month] = firstOfMonth.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

// A money amount typed by a person: digits with at most two decimals. Returns the number or null.
export function parseSarAmount(text: string): number | null {
  const normalised = text.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(normalised)) return null;
  const value = Number(normalised);
  return value > 0 ? value : null;
}
