// The database refuses with a reason in English ("Insufficient unreserved stock"). A person using the Arabic screen should read that
// reason in Arabic, and in either language it must be the server's reason, not a generic "could not save". Known reasons are
// translated; an unknown one is shown as the server wrote it after an Arabic lead-in, so nothing is hidden.

type Lang = "en" | "ar";

const known: Array<[RegExp, string]> = [
  [/^Authentication required/i, "يجب تسجيل الدخول أولاً."],
  [/^Administrator access required/i, "هذه العملية للمسؤولين فقط."],
  [/^Forbidden (inventory|transfer) scope|^Not authorized/i, "ليست لديك صلاحية لهذه العملية على هذا الفرع أو النشاط."],
  [/^Invalid branch scope/i, "نطاق الفرع غير صالح."],
  [/^Branch does not belong to provider/i, "هذا الفرع لا يتبع نشاطك."],
  [/^A branch is required before receiving stock/i, "اختر فرعاً قبل استلام المخزون."],
  [/^A cancellation reason is required/i, "سبب الإلغاء مطلوب."],
  [/^A reason of at least 3 characters/i, "اكتب سبباً لا يقل عن 3 أحرف."],
  [/^Active supplier does not belong to provider/i, "المورد النشط لا يتبع نشاطك."],
  [/^At least one purchase order item is required/i, "أضف بنداً واحداً على الأقل إلى طلب الشراء."],
  [/^Choose an operations role before granting/i, "اختر دوراً تشغيلياً قبل منح صلاحيات الإدارة."],
  [/^Distinct branches, positive quantity, reason and request id required/i, "اختر فرعين مختلفين وكمية موجبة وسبباً."],
  [/^Edit the existing membership instead/i, "هذا الموظف لديه صلاحية قائمة؛ عدّلها بدلاً من إضافة جديدة."],
  [/^Insufficient unreserved stock/i, "الكمية غير المحجوزة في المخزون غير كافية."],
  [/^Invalid booking status transition/i, "لا يمكن نقل الحجز إلى هذه الحالة."],
  [/^Invalid date range/i, "نطاق التاريخ غير صالح."],
  [/^Invalid order status/i, "حالة الطلب غير صالحة."],
  [/^Invalid pagination/i, "ترقيم الصفحات غير صالح."],
  [/^Invalid permission key or value/i, "الصلاحية المحددة غير صالحة."],
  [/^Invalid purchase order transition/i, "لا يمكن نقل طلب الشراء من حالته الحالية إلى هذه الحالة."],
  [/^Membership not found in provider/i, "لم يُعثر على هذه الصلاحية في نشاطك."],
  [/^No provider membership available/i, "لا توجد صلاحية مرتبطة بنشاطك."],
  [/^Only owners and admins manage delegation/i, "المالك والمسؤول فقط يديران تفويض الصلاحيات."],
  [/^Only owners may reassign staff identity or branch/i, "المالك وحده يغيّر هوية الموظف أو فرعه."],
  [/^Only the provider owner or administrator can approve/i, "المالك أو المسؤول وحده يعتمد الطلبات."],
  [/^Product belongs to another provider|^Product ownership cannot change|^Purchase order item references an inactive or foreign product/i, "هذا المنتج غير متاح لنشاطك."],
  [/^Product is assigned to a different supplier/i, "هذا المنتج مرتبط بمورد آخر."],
  [/^Purchase order not found/i, "لم يُعثر على طلب الشراء."],
  [/^Purchase order quantity and unit cost must be positive/i, "الكمية وتكلفة الوحدة يجب أن تكونا أكبر من صفر."],
  [/^Reports permission required/i, "تحتاج صلاحية التقارير."],
  [/^Request id already used for another command/i, "تم استخدام معرّف هذا الطلب في عملية أخرى. أعد المحاولة."],
  [/^Select registered staff linked to this provider and branch/i, "اختر موظفاً مسجلاً مرتبطاً بهذا النشاط والفرع."],
  [/^Supplier belongs to another provider|^Supplier ownership cannot change/i, "هذا المورد غير متاح لنشاطك."],
  [/^Supplier name required/i, "اسم المورد مطلوب."],
  [/^Valid product names, unit and finite costs required/i, "أدخل أسماء المنتج والوحدة وتكاليف صحيحة."],
  [/^Valid quantity, reason, movement type and request id required/i, "أدخل كمية وسبباً صحيحين."],
  [/^Valid role, permissions, active status and reason required/i, "أدخل دوراً وصلاحيات وحالة وسبباً صحيحة."],
  [/^Provider not found|^Code not found|^Booking not found/i, "لم يُعثر على السجل المطلوب."],
  [/permission denied|row-level security/i, "ليست لديك صلاحية لهذه العملية."],
];

function rawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error ?? "");
}

export function describeServerError(error: unknown, lang: Lang): string {
  const message = rawMessage(error).trim();
  if (lang === "en") return message;
  for (const [pattern, arabic] of known) if (pattern.test(message)) return arabic;
  return message ? `رفض الخادم العملية: ${message}` : "تعذر تنفيذ العملية.";
}
