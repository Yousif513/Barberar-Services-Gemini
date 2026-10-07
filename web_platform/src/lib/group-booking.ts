// Shared by the group-booking screens (/customer/group and /provider/groups): the server's answer shapes, every user-visible
// string in both languages, and the translation of the server's reasons.
import type { OperationsLocale } from "@/components/operations-ui";

export const GROUP_PAGE_SIZE = 10;
export const MIN_GROUP_SIZE = 2;
export const MAX_GROUP_SIZE = 30;
export const MAX_SERVICES_PER_GUEST = 6;
export const NOTES_MAX_LENGTH = 1000;
export const GUEST_LABEL_MAX_LENGTH = 80;
export const OCCASIONS = ["wedding", "family", "party", "other"] as const;
export type Occasion = (typeof OCCASIONS)[number];

export type GuestInput = {
  label?: string;
  client_profile_id?: string;
  services: { service_id: string }[];
  employee_id?: string;
  scheduled_at?: string;
};

export type PreviewGuest = {
  sequence: number;
  label: string | null;
  client_profile_id: string | null;
  employee_id: string | null;
  scheduled_at: string | null;
  duration_minutes: number | null;
  subtotal_sar: number | null;
  available: boolean;
  matched_preference: boolean;
  reason: "preferred_time_unavailable" | "no_availability" | null;
};

export type GroupPreview = {
  branch_id: string;
  provider_id: string;
  event_date: string;
  guest_count: number;
  guests: PreviewGuest[];
  all_available: boolean;
  can_create: boolean;
  max_group_size: number;
  payment_hold_hours: number | null;
  standard_hold_minutes: number;
  requires_full_prepayment: boolean;
  subtotal_sar: number;
};

export type GroupCreated = {
  group_id: string;
  status: string;
  headcount: number;
  payment_due_at: string | null;
  replayed: boolean;
  payment: { deposit_due: number; awaiting_payment: number; confirmed: number; cancelled: number };
};

export type CancelOutcome = {
  sequence: number;
  booking_id: string;
  scheduled_at: string;
  outcome: "cancelled" | "already_cancelled" | "not_cancellable" | "failed";
  error: string | null;
};
export type GroupCancelled = { group_id: string; cancelled: number; failed: number; results: CancelOutcome[] };

export type GroupSettings = { enabled: boolean; max_group_size: number | null; payment_hold_hours: number | null };

export const groupCopy = {
  en: {
    // shared
    loading: "Loading...",
    retry: "Try again",
    prev: "Previous",
    next: "Next",
    page: (a: number, b: number) => `Page ${a} of ${b}`,
    close: "Close",
    forbidden: "You do not have access to this screen.",
    noProvider: "This account is not linked to a provider.",
    occasion: { wedding: "Wedding", family: "Family gathering", party: "Party", other: "Other" } as Record<string, string>,
    groupState: { active: "Active", cancelled: "Cancelled" } as Record<string, string>,
    bookingStatus: { pending_payment: "Awaiting payment", confirmed: "Confirmed", cancelled: "Cancelled", completed: "Completed", no_show: "No show" } as Record<string, string>,
    guestsCount: (n: number) => (n === 1 ? "1 guest" : `${n} guests`),
    // customer: create flow
    title: "Group Booking",
    subtitle: "Book a wedding party, a family or friends in one go: every guest gets their own services, professional and time on the same day.",
    detailsTitle: "1. Where and when",
    provider: "Provider",
    providerChoose: "Choose a provider",
    providersLoading: "Loading providers...",
    providersFailed: "The providers that take groups could not be loaded.",
    noProviders: "No provider accepts group bookings yet.",
    branch: "Branch",
    branchChoose: "Choose a branch",
    date: "Event date",
    occasionLabel: "Occasion",
    notes: "Notes for the provider (optional)",
    notesHelp: "The provider sees this note. Do not enter phone numbers or other personal details.",
    guestsTitle: "2. Guests",
    guestLimit: (max: number) => `This provider takes groups of 2 to ${max} guests.`,
    guestN: (n: number) => `Guest ${n}`,
    guestName: "Name the provider will see",
    guestProfile: "Or choose a saved profile",
    guestProfileNone: "No saved profile",
    professional: "Professional",
    anyProfessional: "Any available professional",
    services: "Services",
    servicesLoading: "Loading services...",
    servicesFailed: "The services could not be loaded.",
    noServices: "This branch has no services to book.",
    noServicesFor: "This professional offers none of the listed services.",
    preferredTime: "Preferred start time (optional)",
    preferredTimeHelp: "Riyadh time. Leave empty and the earliest free time is suggested.",
    addGuest: "Add a guest",
    removeGuest: (n: number) => `Remove guest ${n}`,
    check: "Check availability",
    checking: "Checking availability...",
    reviewTitle: "3. Review and confirm",
    colGuest: "Guest",
    colServices: "Services",
    colProfessional: "Professional",
    colTime: "Time",
    colStatus: "Status",
    available: "Available",
    preferredMoved: "Preferred time is taken: nearest free time suggested",
    noAvailability: "Nobody is free for this guest",
    fixGuests: "Some guests cannot be booked as asked. Change them and check again; nothing is booked until every guest can be.",
    subtotal: "Services subtotal (before VAT)",
    holdStandard: (minutes: number) => `Each guest booking needs its own deposit. Unpaid guest bookings are released ${minutes} minutes after you confirm, so pay them right away from the list below.`,
    holdLong: (hours: number) => `Each guest booking needs its own deposit. Unpaid guest bookings are held for up to ${hours} hours after you confirm (never past one hour before the first visit).`,
    fullPrepayment: "This provider asks you to pay in full online before the visit.",
    allOrNothing: "If any guest cannot be booked, nothing is booked at all.",
    editDetails: "Change details",
    confirm: "Confirm and book the group",
    booking: "Booking...",
    createdTitle: "Your group is booked",
    createdBody: (n: number) => `${n} guest bookings were made together.`,
    createdPay: "Each guest booking needs its own deposit. Pay them from the list below.",
    createdReplay: "This group was already booked; it is shown below.",
    // customer: validation
    dateRequired: "Choose the event date.",
    providerRequired: "Choose a provider.",
    branchRequired: "Choose a branch.",
    nameOrProfile: "Enter a name or choose a saved profile.",
    servicesRequired: "Choose at least one service (at most 6).",
    minGuests: "A group needs at least 2 guests.",
    // customer: list
    listTitle: "My group bookings",
    listLoadFailed: "Your group bookings could not be loaded.",
    emptyTitle: "No group bookings yet",
    emptyBody: "Use the form above to book your first group.",
    paymentTitle: "Payment",
    depositDue: "Deposits still due",
    totalWithVat: "Total with VAT",
    awaitingN: (n: number) => `${n} awaiting payment`,
    confirmedN: (n: number) => `${n} confirmed`,
    cancelledN: (n: number) => `${n} cancelled`,
    payBefore: "Pay before",
    payDeposit: "Pay deposit",
    paying: "Opening payment...",
    payFailed: "The payment page could not be opened, nothing was charged.",
    guest: "Guest",
    time: "Time",
    status: "Status",
    amount: "Deposit",
    cancelGroup: "Cancel the group",
    cancelGuest: "Cancel this guest",
    cancelGroupTitle: "Cancel the whole group",
    cancelGuestTitle: "Cancel one guest",
    cancelGroupIntro: "Every guest booking that has not started is cancelled one by one under the provider's cancellation policy. A deposit already paid is refunded or kept according to that policy.",
    cancelGuestIntro: "Only this guest booking is cancelled, under the provider's cancellation policy. The other guests keep their bookings.",
    cancelReason: "Reason (optional)",
    cancelConfirmGroup: "Cancel the group",
    cancelConfirmGuest: "Cancel this guest",
    cancelledDone: (n: number) => `${n} guest booking${n === 1 ? "" : "s"} cancelled.`,
    cancelPartial: (n: number, failed: number) => `${n} cancelled, ${failed} could not be cancelled. Open the list to see which.`,
    // provider
    providerTitle: "Group Bookings",
    providerSubtitle: "Let a customer book several guests for one day in one go. Nothing is enabled until you turn it on.",
    settingsTitle: "Settings",
    enable: "Accept group bookings",
    enableHelp: "Customers can then book a wedding party or a family with you in one request. Each guest is an ordinary booking with its own professional, time and deposit.",
    maxLabel: "Largest group you accept",
    maxHelp: "Between 2 and 30 guests.",
    holdLabel: "Hours an unpaid guest booking is held (optional)",
    holdHelp: "Without a number the normal short payment hold applies to every guest booking. Enter 1 to 168 hours to give a group longer to pay.",
    save: "Save settings",
    saving: "Saving...",
    saved: "Settings saved.",
    ownerOnly: "Only the owner can change these settings.",
    maxInvalid: "Enter a whole number from 2 to 30.",
    holdInvalid: "Enter a whole number from 1 to 168, or leave it empty.",
    settingsFailed: "The settings could not be loaded.",
    groupsTitle: "Groups booked with you",
    host: "Booked by",
    hostUnknown: "Customer",
    event: "Event",
    noGroups: "No customer has booked a group with you yet.",
    professionalCol: "Professional",
    serviceCol: "Service",
    cancelByProviderTitle: "Cancel the whole group",
    cancelByProviderGuestTitle: "Cancel one guest",
    cancelByProviderIntro: "Every guest booking that has not started is cancelled and the customer is refunded in full. The customer is told the reason.",
    cancelByProviderGuestIntro: "Only this guest booking is cancelled and refunded in full. The customer is told the reason.",
    providerReason: "Reason (shown to the customer)",
    viewBookings: "Open bookings",
  },
  ar: {
    loading: "جارٍ التحميل...",
    retry: "حاول مجدداً",
    prev: "السابق",
    next: "التالي",
    page: (a: number, b: number) => `صفحة ${a} من ${b}`,
    close: "إغلاق",
    forbidden: "ليست لديك صلاحية الوصول إلى هذه الشاشة.",
    noProvider: "هذا الحساب غير مرتبط بمقدم خدمة.",
    occasion: { wedding: "حفل زفاف", family: "تجمع عائلي", party: "حفلة", other: "مناسبة أخرى" } as Record<string, string>,
    groupState: { active: "نشط", cancelled: "ملغي" } as Record<string, string>,
    bookingStatus: { pending_payment: "بانتظار الدفع", confirmed: "مؤكد", cancelled: "ملغي", completed: "مكتمل", no_show: "لم يحضر" } as Record<string, string>,
    guestsCount: (n: number) => (n === 1 ? "ضيف واحد" : n === 2 ? "ضيفان" : n <= 10 ? `${n} ضيوف` : `${n} ضيفاً`),
    title: "حجز جماعي",
    subtitle: "احجز لحفل زفاف أو عائلة أو صديقات دفعة واحدة: لكل ضيف خدماته ومختصه ووقته في اليوم نفسه.",
    detailsTitle: "1. المكان والموعد",
    provider: "مقدم الخدمة",
    providerChoose: "اختر مقدم الخدمة",
    providersLoading: "جارٍ تحميل مقدمي الخدمة...",
    providersFailed: "تعذّر تحميل مقدمي الخدمة الذين يقبلون الحجز الجماعي.",
    noProviders: "لا يوجد بعد مقدم خدمة يقبل الحجز الجماعي.",
    branch: "الفرع",
    branchChoose: "اختر الفرع",
    date: "تاريخ المناسبة",
    occasionLabel: "المناسبة",
    notes: "ملاحظات لمقدم الخدمة (اختياري)",
    notesHelp: "يرى مقدم الخدمة هذه الملاحظة. لا تكتب أرقام هواتف أو بيانات شخصية أخرى.",
    guestsTitle: "2. الضيوف",
    guestLimit: (max: number) => `يقبل مقدم الخدمة هذا مجموعات من 2 إلى ${max} ضيفاً.`,
    guestN: (n: number) => `الضيف ${n}`,
    guestName: "الاسم الذي سيراه مقدم الخدمة",
    guestProfile: "أو اختر ملفاً محفوظاً",
    guestProfileNone: "بدون ملف محفوظ",
    professional: "المختص",
    anyProfessional: "أي مختص متاح",
    services: "الخدمات",
    servicesLoading: "جارٍ تحميل الخدمات...",
    servicesFailed: "تعذّر تحميل الخدمات.",
    noServices: "لا توجد خدمات متاحة للحجز في هذا الفرع.",
    noServicesFor: "هذا المختص لا يقدّم أياً من الخدمات المعروضة.",
    preferredTime: "وقت البدء المفضل (اختياري)",
    preferredTimeHelp: "بتوقيت الرياض. اتركه فارغاً ليُقترح أقرب وقت متاح.",
    addGuest: "أضف ضيفاً",
    removeGuest: (n: number) => `إزالة الضيف ${n}`,
    check: "تحقق من التوفر",
    checking: "جارٍ التحقق من التوفر...",
    reviewTitle: "3. المراجعة والتأكيد",
    colGuest: "الضيف",
    colServices: "الخدمات",
    colProfessional: "المختص",
    colTime: "الوقت",
    colStatus: "الحالة",
    available: "متاح",
    preferredMoved: "الوقت المفضل محجوز: اقتُرح أقرب وقت متاح",
    noAvailability: "لا يوجد من هو متاح لهذا الضيف",
    fixGuests: "تعذّر حجز بعض الضيوف كما طلبت. عدّلهم وتحقق مجدداً؛ لا يُحجز شيء حتى يمكن حجز كل الضيوف.",
    subtotal: "إجمالي الخدمات (قبل ضريبة القيمة المضافة)",
    holdStandard: (minutes: number) => `كل حجز ضيف يحتاج عربوناً خاصاً به. تُلغى الحجوزات غير المدفوعة بعد ${minutes} دقيقة من التأكيد، لذا ادفعها فوراً من القائمة أدناه.`,
    holdLong: (hours: number) => `كل حجز ضيف يحتاج عربوناً خاصاً به. تُحفظ الحجوزات غير المدفوعة حتى ${hours} ساعة بعد التأكيد (وليس بعد ساعة قبل أول زيارة).`,
    fullPrepayment: "يطلب مقدم الخدمة هذا دفع المبلغ كاملاً عبر الإنترنت قبل الزيارة.",
    allOrNothing: "إذا تعذّر حجز أي ضيف فلن يُحجز أي شيء.",
    editDetails: "تعديل التفاصيل",
    confirm: "أكّد واحجز المجموعة",
    booking: "جارٍ الحجز...",
    createdTitle: "تم حجز مجموعتك",
    createdBody: (n: number) => `تم إجراء ${n} حجزاً للضيوف معاً.`,
    createdPay: "كل حجز ضيف يحتاج عربوناً خاصاً به. ادفعها من القائمة أدناه.",
    createdReplay: "تم حجز هذه المجموعة سابقاً؛ وهي معروضة أدناه.",
    dateRequired: "اختر تاريخ المناسبة.",
    providerRequired: "اختر مقدم الخدمة.",
    branchRequired: "اختر الفرع.",
    nameOrProfile: "اكتب اسماً أو اختر ملفاً محفوظاً.",
    servicesRequired: "اختر خدمة واحدة على الأقل (6 كحد أقصى).",
    minGuests: "تحتاج المجموعة إلى ضيفين على الأقل.",
    listTitle: "حجوزاتي الجماعية",
    listLoadFailed: "تعذّر تحميل حجوزاتك الجماعية.",
    emptyTitle: "لا توجد حجوزات جماعية بعد",
    emptyBody: "استخدم النموذج أعلاه لحجز مجموعتك الأولى.",
    paymentTitle: "الدفع",
    depositDue: "العربون المتبقي",
    totalWithVat: "الإجمالي شاملاً الضريبة",
    awaitingN: (n: number) => `${n} بانتظار الدفع`,
    confirmedN: (n: number) => `${n} مؤكد`,
    cancelledN: (n: number) => `${n} ملغي`,
    payBefore: "ادفع قبل",
    payDeposit: "ادفع العربون",
    paying: "جارٍ فتح الدفع...",
    payFailed: "تعذّر فتح صفحة الدفع، ولم يُخصم أي مبلغ.",
    guest: "الضيف",
    time: "الوقت",
    status: "الحالة",
    amount: "العربون",
    cancelGroup: "إلغاء المجموعة",
    cancelGuest: "إلغاء هذا الضيف",
    cancelGroupTitle: "إلغاء المجموعة كاملة",
    cancelGuestTitle: "إلغاء ضيف واحد",
    cancelGroupIntro: "يُلغى كل حجز ضيف لم يبدأ بعد واحداً تلو الآخر وفق سياسة الإلغاء لدى مقدم الخدمة. العربون المدفوع يُسترد أو يُحتجز وفق تلك السياسة.",
    cancelGuestIntro: "يُلغى حجز هذا الضيف فقط وفق سياسة الإلغاء لدى مقدم الخدمة. يحتفظ باقي الضيوف بحجوزاتهم.",
    cancelReason: "السبب (اختياري)",
    cancelConfirmGroup: "إلغاء المجموعة",
    cancelConfirmGuest: "إلغاء هذا الضيف",
    cancelledDone: (n: number) => (n === 1 ? "تم إلغاء حجز واحد." : `تم إلغاء ${n} حجوزات.`),
    cancelPartial: (n: number, failed: number) => `تم إلغاء ${n} وتعذّر إلغاء ${failed}. افتح القائمة لمعرفة التفاصيل.`,
    providerTitle: "الحجوزات الجماعية",
    providerSubtitle: "اسمح للعميل بحجز عدة ضيوف ليوم واحد دفعة واحدة. لا يتفعّل شيء حتى تشغّله أنت.",
    settingsTitle: "الإعدادات",
    enable: "قبول الحجوزات الجماعية",
    enableHelp: "عندها يستطيع العملاء حجز حفل زفاف أو عائلة معك بطلب واحد. كل ضيف حجز عادي بمختصه ووقته وعربونه.",
    maxLabel: "أكبر مجموعة تقبلها",
    maxHelp: "بين 2 و30 ضيفاً.",
    holdLabel: "عدد الساعات التي يُحفظ فيها حجز الضيف غير المدفوع (اختياري)",
    holdHelp: "بدون رقم تُطبَّق مهلة الدفع القصيرة المعتادة على كل حجز ضيف. أدخل من 1 إلى 168 ساعة لمنح المجموعة وقتاً أطول للدفع.",
    save: "حفظ الإعدادات",
    saving: "جارٍ الحفظ...",
    saved: "تم حفظ الإعدادات.",
    ownerOnly: "المالك وحده يستطيع تغيير هذه الإعدادات.",
    maxInvalid: "أدخل عدداً صحيحاً من 2 إلى 30.",
    holdInvalid: "أدخل عدداً صحيحاً من 1 إلى 168 أو اترك الحقل فارغاً.",
    settingsFailed: "تعذّر تحميل الإعدادات.",
    groupsTitle: "المجموعات المحجوزة لديك",
    host: "الحاجز",
    hostUnknown: "عميل",
    event: "المناسبة",
    noGroups: "لم يحجز أي عميل مجموعة لديك بعد.",
    professionalCol: "المختص",
    serviceCol: "الخدمة",
    cancelByProviderTitle: "إلغاء المجموعة كاملة",
    cancelByProviderGuestTitle: "إلغاء ضيف واحد",
    cancelByProviderIntro: "يُلغى كل حجز ضيف لم يبدأ بعد ويُردّ للعميل المبلغ كاملاً. يُبلَّغ العميل بالسبب.",
    cancelByProviderGuestIntro: "يُلغى حجز هذا الضيف فقط ويُردّ المبلغ كاملاً. يُبلَّغ العميل بالسبب.",
    providerReason: "السبب (يظهر للعميل)",
    viewBookings: "افتح الحجوزات",
  },
} as const;

type Reason = { match: RegExp; en: string; ar: (m: RegExpMatchArray) => string };
const reasons: Reason[] = [
  { match: /^Authentication required/i, en: "Sign in to continue.", ar: () => "سجّل الدخول للمتابعة." },
  { match: /^(Group booking|Provider|Branch) not found/i, en: "This item was not found.", ar: () => "لم يُعثر على هذا العنصر." },
  { match: /does not offer group bookings/i, en: "This provider does not offer group bookings.", ar: () => "هذا المزوّد لا يقدّم الحجز الجماعي." },
  { match: /allows at most (\d+) guests/i, en: "", ar: (m) => `يسمح مقدم الخدمة بـ ${m[1]} ضيفاً كحد أقصى في المجموعة.` },
  { match: /group needs at least 2 guests/i, en: "A group needs at least 2 guests.", ar: () => "تحتاج المجموعة إلى ضيفين على الأقل." },
  { match: /group has at most 30 guests/i, en: "A group has at most 30 guests.", ar: () => "لا تزيد المجموعة عن 30 ضيفاً." },
  { match: /guest list must be a non-empty array/i, en: "Add at least two guests.", ar: () => "أضف ضيفين على الأقل." },
  { match: /event date cannot be in the past/i, en: "The event date cannot be in the past.", ar: () => "لا يمكن أن يكون تاريخ المناسبة في الماضي." },
  { match: /event date is required/i, en: "Choose the event date.", ar: () => "اختر تاريخ المناسبة." },
  { match: /not accepting bookings/i, en: "This provider is not accepting bookings right now.", ar: () => "مقدم الخدمة هذا لا يقبل الحجوزات حالياً." },
  { match: /cannot book with this provider/i, en: "You cannot book with this provider. Please contact the provider directly.", ar: () => "لا يمكنك الحجز لدى مقدم الخدمة هذا. تواصل معه مباشرة." },
  { match: /Guest (\d+) must be booked on the event date/i, en: "", ar: (m) => `يجب أن يكون حجز الضيف ${m[1]} في تاريخ المناسبة.` },
  { match: /Guest (\d+) needs a start time/i, en: "", ar: (m) => `يحتاج الضيف ${m[1]} إلى وقت بدء.` },
  { match: /Guest (\d+) needs between 1 and 6 services/i, en: "", ar: (m) => `يحتاج الضيف ${m[1]} إلى خدمة واحدة على الأقل وحتى 6 خدمات.` },
  { match: /Guest (\d+) lists the same service twice/i, en: "", ar: (m) => `كرّرت الخدمة نفسها للضيف ${m[1]}.` },
  { match: /Guest (\d+) needs a name or a saved profile/i, en: "", ar: (m) => `اكتب اسماً للضيف ${m[1]} أو اختر ملفاً محفوظاً.` },
  { match: /Guest (\d+) uses a saved profile that was not found/i, en: "", ar: (m) => `لم يُعثر على الملف المحفوظ للضيف ${m[1]}.` },
  { match: /Guest (\d+) has a value that is not valid/i, en: "", ar: (m) => `توجد قيمة غير صالحة في بيانات الضيف ${m[1]}.` },
  { match: /Guest (\d+) has a service/i, en: "", ar: (m) => `توجد خدمة غير صالحة في بيانات الضيف ${m[1]}.` },
  { match: /Guest (\d+) must be an object/i, en: "", ar: (m) => `بيانات الضيف ${m[1]} غير صالحة.` },
  { match: /name of guest (\d+) is longer than 80/i, en: "", ar: (m) => `اسم الضيف ${m[1]} أطول من 80 حرفاً.` },
  { match: /^Guest (\d+) could not be booked: ([\s\S]*)$/i, en: "", ar: (m) => `تعذّر حجز الضيف ${m[1]}: ${innerReason(m[2])} لم يُحجز أي ضيف.` },
  { match: /notes are longer than 1000/i, en: "The notes are longer than 1000 characters.", ar: () => "الملاحظات أطول من 1000 حرف." },
  { match: /occasion is required/i, en: "Choose the occasion.", ar: () => "اختر المناسبة." },
  { match: /idempotency key/i, en: "This request was already used for a different group. Check availability again and confirm.", ar: () => "استُخدم هذا الطلب لمجموعة أخرى. تحقق من التوفر مجدداً ثم أكّد." },
  { match: /reason of at least 3/i, en: "Enter a reason of at least 3 characters.", ar: () => "اكتب سبباً لا يقل عن 3 أحرف." },
  { match: /Only the provider owner/i, en: "Only the owner can change these settings.", ar: () => "المالك وحده يستطيع تغيير هذه الإعدادات." },
  { match: /maximum group size is required/i, en: "Enter the largest group you accept (2 to 30).", ar: () => "أدخل أكبر مجموعة تقبلها (من 2 إلى 30)." },
  { match: /maximum group size must be between/i, en: "The largest group must be between 2 and 30.", ar: () => "يجب أن تكون أكبر مجموعة بين 2 و30." },
  { match: /payment hold must be between/i, en: "The hold must be between 1 and 168 hours.", ar: () => "يجب أن تكون مدة الحفظ بين 1 و168 ساعة." },
  { match: /permission denied|row-level security/i, en: "You do not have access to this.", ar: () => "ليست لديك صلاحية لهذه العملية." },
];

// The reasons create_booking itself gives when a guest cannot be booked, so the host reads them in the screen's language.
const innerReasons: { match: RegExp; en: string; ar: string }[] = [
  { match: /no longer available|No professional is available/i, en: "that time is no longer available.", ar: "هذا الوقت لم يعد متاحاً." },
  { match: /does not offer every selected service|does not work at this provider/i, en: "the professional does not offer these services.", ar: "المختص لا يقدّم هذه الخدمات." },
  { match: /Services must be active/i, en: "a service is not available at this provider.", ar: "إحدى الخدمات غير متاحة لدى مقدم الخدمة." },
  { match: /in the future/i, en: "the time must be in the future.", ar: "يجب أن يكون الوقت في المستقبل." },
];
function innerReason(message: string): string {
  const found = innerReasons.find((r) => r.match.test(message));
  return found ? found.ar : message;
}

// The server's reason in the screen's language. Known reasons are translated; an unknown one is shown as written (after an Arabic lead-in).
export function describeGroupError(error: unknown, locale: OperationsLocale): string {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : String(error);
  for (const reason of reasons) {
    const m = message.match(reason.match);
    if (m) {
      if (locale === "ar") return reason.ar(m);
      if (reason.en) return reason.en;
      const inner = message.match(/^Guest (\d+) could not be booked: ([\s\S]*)$/i);
      if (inner) {
        const found = innerReasons.find((r) => r.match.test(inner[2]));
        return `Guest ${inner[1]} could not be booked: ${found ? found.en : inner[2]} Nothing was booked.`;
      }
      return message;
    }
  }
  return locale === "ar" ? `تعذّر تنفيذ الطلب: ${message}` : message;
}

export function bookingStatusLabel(status: string | null | undefined, locale: OperationsLocale): string {
  const labels = groupCopy[locale].bookingStatus;
  return (status && labels[status]) || status || "";
}

// The event date of today in Riyadh as YYYY-MM-DD: the earliest date a group can be booked for.
export function riyadhToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 3 * 3600000).toISOString().slice(0, 10);
}

// "2026-11-04" + "14:30" is 14:30 in Riyadh (UTC+3, no daylight saving), sent with its offset so the server reads the same instant.
export function riyadhInstant(date: string, time: string): string {
  return `${date}T${time}:00+03:00`;
}
