// Shared by the three recurring-appointment screens (the "make this a regular" dialog, /customer/series, /provider/recurring):
// the server's answer shapes, every user-visible string in both languages, and the translation of the server's reasons.
import type { OperationsLocale } from "@/components/operations-ui";

export type SeriesOccurrence = {
  occurrence_no: number;
  target_at: string;
  state: "anchor" | "booked" | "skipped";
  booking_id: string | null;
  skip_reason: string | null;
  payment_due_at: string | null;
  booking_status: string | null;
};

export type SeriesPreview = {
  anchor_booking_id: string;
  interval_weeks: number;
  occurrences: number;
  all_available: boolean;
  items: { occurrence_no: number; target_at: string; available: boolean; reason: string | null }[];
  requires_online_payment: boolean;
  payment_hold_hours: number | null;
  can_create: boolean;
};

export type SeriesCreated = {
  series_id: string;
  status: string;
  occurrences: SeriesOccurrence[];
  replayed: boolean;
};

export type CancelOutcome = { occurrence_no: number; booking_id: string; target_at: string; outcome: "cancelled" | "already_cancelled" | "not_cancellable" | "failed"; error: string | null };
export type SeriesCancelled = { series_id: string; cancelled: number; failed: number; results: CancelOutcome[] };

export const MIN_OCCURRENCES = 2;
export const MAX_OCCURRENCES = 26;
export const SERIES_PAGE_SIZE = 10;

export const recurringCopy = {
  en: {
    // make-this-a-regular dialog
    makeRegular: "Make this a regular",
    dialogTitle: "Make this a regular appointment",
    dialogIntro: "Repeat this booking with the same professional and service, at the same time of day.",
    every: "Repeat every",
    weeks: (n: number) => (n === 1 ? "week" : `${n} weeks`),
    total: "Total appointments (including this one)",
    skip: "Skip a date that is not available and book the rest",
    skipHelp: "Without this, nothing is booked unless every date is available.",
    previewing: "Checking the dates...",
    previewFailed: "The dates could not be checked.",
    retry: "Try again",
    available: "Available",
    unavailable: "Not available",
    thisBooking: "This booking",
    paymentTitle: "Deposits for the later appointments",
    paymentHold: (hours: number) => `Each later appointment needs its own deposit. It is held for you for up to ${hours} hours after it is booked (never past one hour before the visit). Pay it from My Regulars before the deadline or it is released.`,
    paymentBlocked: "The provider has not said how long unpaid regular appointments can be held, so a series cannot be booked yet. Ask the provider to set it.",
    paymentNone: "No deposit is due for the later appointments.",
    create: "Book the series",
    creating: "Booking...",
    close: "Close",
    createdTitle: "Your regular appointments are booked",
    createdBody: (booked: number, skipped: number) => `${booked} more appointment${booked === 1 ? "" : "s"} booked${skipped ? `, ${skipped} date${skipped === 1 ? "" : "s"} skipped` : ""}.`,
    createdPay: "Each one that needs a deposit is held until its payment deadline. Pay them from My Regulars.",
    viewSeries: "Open My Regulars",
    // customer series screen
    seriesTitle: "My Regular Appointments",
    seriesSubtitle: "Repeating appointments you set up, with their payment deadlines.",
    loading: "Loading your regular appointments...",
    loadFailed: "Your regular appointments could not be loaded.",
    emptyTitle: "No regular appointments yet",
    emptyBody: "Open a confirmed booking in My Bookings and choose Make this a regular.",
    goBookings: "Go to My Bookings",
    everyN: (n: number) => (n === 1 ? "Every week" : `Every ${n} weeks`),
    seriesState: { active: "Active", cancelled: "Ended" } as Record<string, string>,
    date: "Date",
    status: "Status",
    deadline: "Pay before",
    payDeposit: "Pay deposit",
    paying: "Opening payment...",
    payFailed: "The payment page could not be opened, nothing was charged.",
    cancelFrom: "Cancel this and the rest",
    cancelAll: "Cancel all upcoming",
    cancelTitle: "Cancel regular appointments",
    cancelIntro: "The appointments from this date on are cancelled one by one under the provider's cancellation policy. A deposit already paid is refunded or kept according to that policy.",
    cancelReason: "Reason (optional)",
    cancelConfirm: "Cancel appointments",
    cancelledDone: (n: number) => `${n} appointment${n === 1 ? "" : "s"} cancelled.`,
    cancelPartial: (n: number, failed: number) => `${n} cancelled, ${failed} could not be cancelled. Open the list to see which.`,
    skippedReason: { slot_unavailable: "Skipped: the time was not available" } as Record<string, string>,
    bookingStatus: { pending_payment: "Awaiting payment", confirmed: "Confirmed", cancelled: "Cancelled", completed: "Completed", no_show: "No show", skipped: "Skipped" } as Record<string, string>,
    prev: "Previous",
    next: "Next",
    page: (a: number, b: number) => `Page ${a} of ${b}`,
    // provider screen
    providerTitle: "Regular Appointments",
    providerSubtitle: "Let customers repeat a booking with the same professional on a schedule. Nothing is enabled until you turn it on.",
    settingsTitle: "Settings",
    enable: "Accept regular appointments",
    enableHelp: "Customers can then turn a confirmed booking into a repeating series with you.",
    maxLabel: "Most appointments in one series",
    maxHelp: "Between 2 and 26.",
    holdLabel: "Hours an unpaid regular appointment is held",
    holdHelp: "Each later appointment needs its own deposit. Until you choose a time (1 to 168 hours), customers cannot book a series that needs deposits. Leaving it empty keeps the normal short hold.",
    save: "Save settings",
    saving: "Saving...",
    saved: "Settings saved.",
    ownerOnly: "Only the owner can change these settings.",
    seriesListTitle: "Series with you",
    customer: "Customer",
    service: "Service",
    professional: "Professional",
    appointments: "Appointments",
    noSeries: "No customer has made a regular appointment with you yet.",
    viewBookings: "Open bookings",
    maxInvalid: "Enter a number from 2 to 26.",
    holdInvalid: "Enter a whole number from 1 to 168, or leave it empty.",
    noProvider: "This account is not linked to a provider.",
    forbidden: "You do not have access to this screen.",
  },
  ar: {
    makeRegular: "اجعله موعداً منتظماً",
    dialogTitle: "اجعل هذا الحجز موعداً منتظماً",
    dialogIntro: "كرّر هذا الحجز مع المختص والخدمة نفسيهما وفي الوقت نفسه من اليوم.",
    every: "كرّر كل",
    weeks: (n: number) => (n === 1 ? "أسبوع" : n === 2 ? "أسبوعين" : n <= 10 ? `${n} أسابيع` : `${n} أسبوعاً`),
    total: "عدد المواعيد الكلي (بما فيها هذا الموعد)",
    skip: "تجاوز التاريخ غير المتاح واحجز الباقي",
    skipHelp: "بدون هذا الخيار لا يُحجز شيء ما لم تكن كل التواريخ متاحة.",
    previewing: "جارٍ فحص التواريخ...",
    previewFailed: "تعذّر فحص التواريخ.",
    retry: "حاول مجدداً",
    available: "متاح",
    unavailable: "غير متاح",
    thisBooking: "هذا الحجز",
    paymentTitle: "عربون المواعيد اللاحقة",
    paymentHold: (hours: number) => `كل موعد لاحق يحتاج عربوناً خاصاً به. يُحجز لك حتى ${hours} ساعة بعد حجزه (وليس بعد ساعة قبل الزيارة). ادفعه من «مواعيدي المنتظمة» قبل الموعد النهائي وإلا سيُلغى.`,
    paymentBlocked: "لم يحدد مقدم الخدمة المدة التي يُحفظ فيها الموعد المنتظم غير المدفوع، لذلك لا يمكن حجز سلسلة الآن. اطلب منه تحديدها.",
    paymentNone: "لا يوجد عربون مستحق للمواعيد اللاحقة.",
    create: "احجز السلسلة",
    creating: "جارٍ الحجز...",
    close: "إغلاق",
    createdTitle: "تم حجز مواعيدك المنتظمة",
    createdBody: (booked: number, skipped: number) => `تم حجز ${booked} موعداً إضافياً${skipped ? `، وتم تجاوز ${skipped} تاريخاً` : ""}.`,
    createdPay: "كل موعد يحتاج عربوناً محجوز حتى موعد الدفع النهائي. ادفعها من «مواعيدي المنتظمة».",
    viewSeries: "افتح مواعيدي المنتظمة",
    seriesTitle: "مواعيدي المنتظمة",
    seriesSubtitle: "المواعيد المتكررة التي أنشأتها مع مواعيد الدفع.",
    loading: "جارٍ تحميل مواعيدك المنتظمة...",
    loadFailed: "تعذّر تحميل مواعيدك المنتظمة.",
    emptyTitle: "لا توجد مواعيد منتظمة بعد",
    emptyBody: "افتح حجزاً مؤكداً من «حجوزاتي» واختر «اجعله موعداً منتظماً».",
    goBookings: "اذهب إلى حجوزاتي",
    everyN: (n: number) => (n === 1 ? "كل أسبوع" : n === 2 ? "كل أسبوعين" : `كل ${n} أسابيع`),
    seriesState: { active: "نشطة", cancelled: "منتهية" } as Record<string, string>,
    date: "التاريخ",
    status: "الحالة",
    deadline: "ادفع قبل",
    payDeposit: "ادفع العربون",
    paying: "جارٍ فتح الدفع...",
    payFailed: "تعذّر فتح صفحة الدفع، ولم يُخصم أي مبلغ.",
    cancelFrom: "إلغاء هذا والمتبقي",
    cancelAll: "إلغاء كل القادم",
    cancelTitle: "إلغاء المواعيد المنتظمة",
    cancelIntro: "تُلغى المواعيد من هذا التاريخ فصاعداً واحداً تلو الآخر وفق سياسة الإلغاء لدى مقدم الخدمة. العربون المدفوع يُسترد أو يُحتجز وفق تلك السياسة.",
    cancelReason: "السبب (اختياري)",
    cancelConfirm: "إلغاء المواعيد",
    cancelledDone: (n: number) => `تم إلغاء ${n} موعداً.`,
    cancelPartial: (n: number, failed: number) => `تم إلغاء ${n} وتعذّر إلغاء ${failed}. افتح القائمة لمعرفة التفاصيل.`,
    skippedReason: { slot_unavailable: "تم التجاوز: الوقت غير متاح" } as Record<string, string>,
    bookingStatus: { pending_payment: "بانتظار الدفع", confirmed: "مؤكد", cancelled: "ملغي", completed: "مكتمل", no_show: "لم يحضر", skipped: "تم التجاوز" } as Record<string, string>,
    prev: "السابق",
    next: "التالي",
    page: (a: number, b: number) => `صفحة ${a} من ${b}`,
    providerTitle: "المواعيد المنتظمة",
    providerSubtitle: "اسمح للعملاء بتكرار الحجز مع المختص نفسه وفق جدول. لا يتفعّل شيء حتى تشغّله أنت.",
    settingsTitle: "الإعدادات",
    enable: "قبول المواعيد المنتظمة",
    enableHelp: "عندها يستطيع العملاء تحويل حجز مؤكد إلى سلسلة متكررة معك.",
    maxLabel: "أقصى عدد مواعيد في السلسلة",
    maxHelp: "بين 2 و26.",
    holdLabel: "عدد الساعات التي يُحفظ فيها الموعد المنتظم غير المدفوع",
    holdHelp: "كل موعد لاحق يحتاج عربوناً خاصاً به. حتى تحدد مدة (من 1 إلى 168 ساعة) لا يستطيع العملاء حجز سلسلة تحتاج عربوناً. وترك الحقل فارغاً يبقي الحجز القصير المعتاد.",
    save: "حفظ الإعدادات",
    saving: "جارٍ الحفظ...",
    saved: "تم حفظ الإعدادات.",
    ownerOnly: "المالك وحده يستطيع تغيير هذه الإعدادات.",
    seriesListTitle: "السلاسل لديك",
    customer: "العميل",
    service: "الخدمة",
    professional: "المختص",
    appointments: "المواعيد",
    noSeries: "لم ينشئ أي عميل موعداً منتظماً معك بعد.",
    viewBookings: "افتح الحجوزات",
    maxInvalid: "أدخل رقماً من 2 إلى 26.",
    holdInvalid: "أدخل عدداً صحيحاً من 1 إلى 168 أو اترك الحقل فارغاً.",
    noProvider: "هذا الحساب غير مرتبط بمقدم خدمة.",
    forbidden: "ليست لديك صلاحية الوصول إلى هذه الشاشة.",
  },
} as const;

type Reason = { match: RegExp; en: string; ar: (m: RegExpMatchArray) => string };
const reasons: Reason[] = [
  { match: /^Authentication required/i, en: "Sign in to continue.", ar: () => "سجّل الدخول للمتابعة." },
  { match: /^(Booking|Series|Provider) not found/i, en: "This item was not found.", ar: () => "لم يُعثر على هذا العنصر." },
  { match: /does not offer recurring/i, en: "This provider does not offer regular appointments.", ar: () => "هذا المزوّد لا يقدّم المواعيد المنتظمة." },
  { match: /Only a confirmed booking can be repeated/i, en: "Only a confirmed booking can be made a regular.", ar: () => "لا يمكن تحويل إلا الحجز المؤكد إلى موعد منتظم." },
  { match: /Only an upcoming booking can be repeated/i, en: "Only an upcoming booking can be made a regular.", ar: () => "لا يمكن تحويل إلا الحجز القادم إلى موعد منتظم." },
  { match: /Home visits cannot be repeated/i, en: "Home visits cannot be made regular yet.", ar: () => "لا يمكن جعل الزيارات المنزلية منتظمة حالياً." },
  { match: /several services cannot be repeated/i, en: "A booking with several services cannot be made a regular yet.", ar: () => "لا يمكن جعل الحجز متعدد الخدمات منتظماً حالياً." },
  { match: /already belongs to a series/i, en: "This booking is already part of a regular series.", ar: () => "هذا الحجز جزء من سلسلة منتظمة بالفعل." },
  { match: /between 1 and 8 weeks/i, en: "Choose an interval of 1 to 8 weeks.", ar: () => "اختر فاصلاً من أسبوع إلى 8 أسابيع." },
  { match: /at least 2 appointments/i, en: "A series needs at least 2 appointments.", ar: () => "تحتاج السلسلة إلى موعدين على الأقل." },
  { match: /allows at most (\d+) appointments/i, en: "", ar: (m) => `يسمح مقدم الخدمة بـ ${m[1]} موعداً كحد أقصى في السلسلة.` },
  { match: /released within minutes/i, en: "The provider has not set how long unpaid regular appointments are held, so these appointments would be released within minutes. Ask the provider to set it.", ar: () => "لم يحدد مقدم الخدمة مدة حفظ المواعيد المنتظمة غير المدفوعة، لذا ستُلغى هذه المواعيد خلال دقائق. اطلب منه تحديدها." },
  { match: /^Appointment (\d+) on ([\d-]+ [\d:]+) could not be booked/i, en: "", ar: (m) => `تعذّر حجز الموعد رقم ${m[1]} بتاريخ ${m[2]}. لم يُحجز أي موعد.` },
  { match: /None of the following appointments/i, en: "None of the following dates could be booked.", ar: () => "تعذّر حجز أي من التواريخ اللاحقة." },
  { match: /idempotency key/i, en: "This request was already used for a different series. Close the dialog and try again.", ar: () => "استُخدم هذا الطلب لسلسلة أخرى. أغلق النافذة وحاول مجدداً." },
  { match: /reason of at least 3/i, en: "Enter a reason of at least 3 characters.", ar: () => "اكتب سبباً لا يقل عن 3 أحرف." },
  { match: /Only the provider owner/i, en: "Only the owner can change these settings.", ar: () => "المالك وحده يستطيع تغيير هذه الإعدادات." },
  { match: /maximum number of appointments/i, en: "Enter a maximum between 2 and 26.", ar: () => "أدخل حداً أقصى بين 2 و26." },
  { match: /payment hold must be between/i, en: "The hold must be between 1 and 168 hours.", ar: () => "يجب أن تكون مدة الحفظ بين 1 و168 ساعة." },
  { match: /permission denied|row-level security/i, en: "You do not have access to this.", ar: () => "ليست لديك صلاحية لهذه العملية." },
];

// The server's reason in the screen's language. Known reasons are translated; an unknown one is shown as written (after an Arabic lead-in).
export function describeRecurringError(error: unknown, locale: OperationsLocale): string {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : String(error);
  for (const reason of reasons) {
    const m = message.match(reason.match);
    if (m) return locale === "ar" ? reason.ar(m) : reason.en || message;
  }
  return locale === "ar" ? `تعذّر تنفيذ الطلب: ${message}` : message;
}

export function bookingStatusLabel(status: string | null | undefined, locale: OperationsLocale): string {
  const labels = recurringCopy[locale].bookingStatus;
  return (status && labels[status]) || status || "";
}
