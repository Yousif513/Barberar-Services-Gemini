// Shared wording for the membership screens (provider and customer). The database answers in English; a person on the Arabic
// screen reads the reason in Arabic, and an unknown reason is shown as the server wrote it so nothing is hidden.
import type { OperationsLocale } from "@/components/operations-ui";
import { describeServerError } from "@/app/provider/_components/server-errors";

export type MembershipStatus = "pending_payment" | "active" | "expired" | "cancelled";

export const membershipStatusLabel: Record<OperationsLocale, Record<MembershipStatus, string>> = {
  en: { pending_payment: "Awaiting payment", active: "Active", expired: "Expired", cancelled: "Cancelled" },
  ar: { pending_payment: "بانتظار الدفع", active: "نشطة", expired: "منتهية", cancelled: "ملغاة" },
};

const arabicReasons: Array<[RegExp, string]> = [
  [/^Both an English and an Arabic plan name/i, "اسم الخطة مطلوب بالعربية والإنجليزية (حتى 120 حرفاً)."],
  [/^The price must be a positive SAR amount/i, "السعر يجب أن يكون مبلغاً موجباً بالريال بخانتين عشريتين كحد أقصى."],
  [/^The period must be between/i, "مدة الفترة يجب أن تكون بين يوم و3660 يوماً."],
  [/^Included visits must be between/i, "عدد الزيارات المشمولة يجب أن يكون بين 1 و1000."],
  [/^State whether the plan covers every service/i, "حدّد هل تشمل الخطة كل الخدمات أم خدمات مختارة."],
  [/^A plan that covers every service cannot also list/i, "الخطة التي تشمل كل الخدمات لا تحتاج قائمة خدمات."],
  [/^Choose at least one covered service/i, "اختر خدمة مشمولة واحدة على الأقل."],
  [/^Every covered service must belong to this provider/i, "كل الخدمات المشمولة يجب أن تتبع نشاطك."],
  [/^Only the provider owner can/i, "مالك النشاط فقط يملك هذه الصلاحية."],
  [/^Plan not found|^Membership plan not found or not on sale/i, "الخطة غير موجودة أو غير معروضة للبيع."],
  [/^Membership not found|^Redemption not found/i, "لم يُعثر على العضوية المطلوبة."],
  [/^Only a paid membership can be renewed/i, "لا يمكن تجديد إلا عضوية مدفوعة."],
  [/^This membership has already ended/i, "انتهت هذه العضوية بالفعل."],
  [/^An idempotency key/i, "تعذر إرسال الطلب، أعد المحاولة."],
  [/^This idempotency key was already used/i, "تم استخدام معرّف هذا الطلب في عملية أخرى، أعد المحاولة."],
  [/^Only the provider staff can/i, "موظفو النشاط فقط يمكنهم تسجيل زيارات العضوية."],
  [/^This membership is not active/i, "هذه العضوية غير نشطة."],
  [/^This membership period has not started/i, "لم تبدأ فترة هذه العضوية بعد."],
  [/^This membership has expired/i, "انتهت صلاحية هذه العضوية."],
  [/^No included visits remain/i, "لا توجد زيارات مشمولة متبقية."],
  [/^A booking is required/i, "اختر الحجز الذي ستُسجَّل عليه الزيارة."],
  [/^The booking does not belong to this member/i, "هذا الحجز لا يخص هذا العضو لدى هذا النشاط."],
  [/^Only a confirmed or completed booking/i, "تُسجَّل الزيارة على حجز مؤكد أو مكتمل فقط."],
  [/^This booking is already covered by a package/i, "هذا الحجز مغطى بجلسة من باقة."],
  [/^This membership does not cover the services/i, "هذه العضوية لا تشمل خدمات الحجز."],
  [/^A membership visit was already recorded for this booking/i, "سُجلت زيارة عضوية على هذا الحجز من قبل."],
  [/^A reason of at least 3 characters/i, "اكتب سبباً لا يقل عن 3 أحرف."],
  [/^Notes are limited/i, "الملاحظات حتى 500 حرف."],
];

export function membershipError(error: unknown, locale: OperationsLocale): string {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : String(error ?? "");
  if (locale === "ar") for (const [pattern, arabic] of arabicReasons) if (pattern.test(message)) return arabic;
  return describeServerError(error, locale);
}

// A fresh key per intended purchase; the screen keeps it until the command succeeds so a double tap or a retry never buys twice.
export function newRequestKey(prefix: string): string {
  if (typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
