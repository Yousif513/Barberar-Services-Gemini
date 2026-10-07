import type { OperationsLocale } from "@/components/operations-ui";

// G75 professional identity: the shapes the commands return, the server's reasons in both languages, and every string the four
// screens (/pro/<handle>, /provider/identity, /customer/following and the employee-list action) show.

export type Locale = OperationsLocale;

export type PublicWorkplace = { name_en: string; name_ar: string; city: string | null; shop_url: string; book_url: string; since: string };
export type PortfolioLink = { title_en: string | null; title_ar: string | null; url: string };
export type PublicProfessional = {
  handle: string;
  display_name_en: string;
  display_name_ar: string;
  headline_en: string | null;
  headline_ar: string | null;
  bio_en: string | null;
  bio_ar: string | null;
  specialties: string[];
  languages: string[];
  portfolio: PortfolioLink[];
  workplaces: PublicWorkplace[];
  viewer: { signed_in: boolean; is_self: boolean; follows: boolean; notify_on_move: boolean };
};
export type ProfessionalRedirect = { redirect_to: string };

export type OwnProfile = {
  handle: string;
  display_name_en: string;
  display_name_ar: string;
  headline_en: string | null;
  headline_ar: string | null;
  bio_en: string | null;
  bio_ar: string | null;
  specialties: string[];
  languages: string[];
  is_published: boolean;
  published_at: string | null;
  hidden: boolean;
  handle_locked: boolean;
};
export type OwnPortfolioItem = { id: string; title_en: string | null; title_ar: string | null; url: string };
export type Invitation = { id: string; name_en: string; name_ar: string; city: string | null; invited_at: string };
export type OwnWorkplace = {
  id: string;
  status: "active" | "former";
  name_en: string;
  name_ar: string;
  city: string | null;
  started_at: string | null;
  ended_at: string | null;
  closed_by: "professional" | "provider" | "system" | "admin" | null;
};
export type MyIdentity = {
  can_create: boolean;
  suggested_names: { en: string; ar: string } | null;
  profile: OwnProfile | null;
  portfolio: OwnPortfolioItem[];
  invitations: Invitation[];
  workplaces: OwnWorkplace[];
  follower_count: number;
};
export type FollowedProfessional = {
  handle: string;
  available: boolean;
  display_name_en: string | null;
  display_name_ar: string | null;
  headline_en: string | null;
  headline_ar: string | null;
  workplaces: PublicWorkplace[];
  notify_on_move: boolean;
  followed_at: string;
};
export type ProviderLink = {
  employee_id: string;
  has_login: boolean;
  has_profile: boolean;
  link_id: string | null;
  link_status: "invited" | "active" | null;
  invited_at: string | null;
  started_at: string | null;
  handle: string | null;
};

// Languages a professional can list. Codes are ISO 639 (the server accepts any 2 to 3 letter code); the names come from Intl.
export const LANGUAGE_CODES = ["ar", "en", "ur", "hi", "bn", "tl", "fr", "tr", "fa", "ne", "ml", "ta", "id"] as const;

export function languageLabel(code: string, locale: Locale): string {
  try {
    return new Intl.DisplayNames(locale === "ar" ? "ar" : "en", { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export const HANDLE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export function handleLooksValid(handle: string): boolean {
  return handle.length >= 3 && handle.length <= 30 && HANDLE_PATTERN.test(handle);
}
export function splitList(text: string): string[] {
  return text.split(/[,،\n]/).map((item) => item.trim()).filter(Boolean);
}
export function profilePath(handle: string): string {
  return `/pro/${handle}`;
}
// A calendar day in Riyadh time, in the screen's language.
export function dayLabel(value: string | null | undefined, locale: Locale): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(date);
}

export function pick(locale: Locale, en: string | null | undefined, ar: string | null | undefined): string {
  return (locale === "ar" ? ar || en : en || ar) ?? "";
}

// The server's reasons in the screen's language. A reason without an Arabic form is shown as the server wrote it, after a lead-in.
type Reason = { match: RegExp; en: string; ar: string };
const reasons: Reason[] = [
  { match: /Authentication required/i, en: "Please sign in again.", ar: "يُرجى تسجيل الدخول من جديد." },
  { match: /A handle is 3 to 30 characters/i, en: "", ar: "المعرّف من 3 إلى 30 حرفاً: أحرف إنجليزية صغيرة وأرقام وشرطات مفردة." },
  { match: /handle is reserved/i, en: "", ar: "هذا المعرّف محجوز ولا يمكن استخدامه." },
  { match: /handle is already taken/i, en: "", ar: "هذا المعرّف مستخدم بالفعل. اختر معرّفاً آخر." },
  { match: /accepts at most/i, en: "", ar: "عدد الإدخالات في هذه القائمة أكبر من المسموح." },
  { match: /has an entry that is not valid/i, en: "", ar: "إحدى القيم في هذه القائمة غير صالحة." },
  { match: /Display names are required/i, en: "", ar: "الاسم مطلوب بالإنجليزية والعربية، بحد أقصى 80 حرفاً لكل منهما." },
  { match: /headline is at most/i, en: "", ar: "العنوان المختصر لا يتجاوز 120 حرفاً." },
  { match: /bio is at most/i, en: "", ar: "النبذة لا تتجاوز 1000 حرف." },
  { match: /Only a registered professional of a salon/i, en: "", ar: "يمكن إنشاء الملف المهني فقط لمن هو مسجّل كموظف في صالون." },
  { match: /published can only be changed by support/i, en: "", ar: "المعرّف الذي نُشر لا يغيّره إلا فريق الدعم." },
  { match: /Publish or unpublish must be stated/i, en: "", ar: "حدّد النشر أو إلغاء النشر." },
  { match: /Professional profile not found/i, en: "", ar: "لم يُعثر على ملفك المهني. أنشئه أولاً." },
  { match: /hidden by an administrator and cannot be published/i, en: "", ar: "أخفت الإدارة هذا الملف ولا يمكن نشره حالياً." },
  { match: /portfolio link must be an https/i, en: "", ar: "رابط المعرض يجب أن يبدأ بـ https:// ولا يتجاوز 500 حرف." },
  { match: /portfolio title is at most/i, en: "", ar: "عنوان رابط المعرض لا يتجاوز 100 حرف." },
  { match: /most links allowed/i, en: "", ar: "بلغ المعرض الحد الأقصى المسموح من الروابط." },
  { match: /Portfolio link not found/i, en: "", ar: "لم يُعثر على رابط المعرض." },
  { match: /Employee not found/i, en: "", ar: "لم يُعثر على الموظف." },
  { match: /Only an active employee can be linked/i, en: "", ar: "يمكن ربط الموظف النشط فقط." },
  { match: /no login yet/i, en: "", ar: "ليس لهذا الموظف حساب دخول بعد، فلا يوجد ملف مهني للربط." },
  { match: /not created a professional profile yet/i, en: "", ar: "لم ينشئ هذا الموظف ملفاً مهنياً بعد." },
  { match: /already linked/i, en: "", ar: "هذا الموظف مرتبط بالفعل." },
  { match: /Accept or decline must be stated/i, en: "", ar: "حدّد القبول أو الرفض." },
  { match: /Invitation not found/i, en: "", ar: "لم يُعثر على الدعوة." },
  { match: /invitation is no longer open/i, en: "", ar: "هذه الدعوة لم تعد مفتوحة." },
  { match: /invitation is no longer valid/i, en: "", ar: "هذه الدعوة لم تعد صالحة: أنت لست موظفاً نشطاً هناك." },
  { match: /Link not found/i, en: "", ar: "لم يُعثر على الربط." },
  { match: /Professional not found/i, en: "", ar: "لم يُعثر على هذا المحترف." },
  { match: /cannot follow your own profile/i, en: "", ar: "لا يمكنك متابعة ملفك الشخصي." },
  { match: /Administrator access required/i, en: "", ar: "هذه العملية للإدارة فقط." },
  { match: /State whether to hide or restore/i, en: "", ar: "حدّد الإخفاء أو الاستعادة واكتب سبباً من 3 أحرف على الأقل." },
  { match: /reason of at least 3 characters is required/i, en: "", ar: "السبب مطلوب (3 أحرف على الأقل)." },
  { match: /new handle is the current handle/i, en: "", ar: "المعرّف الجديد هو نفسه المعرّف الحالي." },
  { match: /Provider not found/i, en: "", ar: "لم يُعثر على النشاط." },
  { match: /workplace link cannot move from/i, en: "", ar: "لا يمكن نقل الربط إلى هذه الحالة." },
];

export function describeProfessionalError(error: unknown, locale: Locale): string {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : String(error);
  for (const reason of reasons) {
    if (reason.match.test(message)) return locale === "ar" ? reason.ar : reason.en || message;
  }
  return locale === "ar" ? `تعذّر تنفيذ الطلب: ${message}` : message;
}

const common = {
  en: {
    loading: "Loading…",
    retry: "Try again",
    loadFailed: "This could not be loaded: ",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    close: "Close",
    back: "Back",
    privacyKept: "Your bookings, notes, invoices and reviews stay with each salon. Nothing here moves or copies them.",
  },
  ar: {
    loading: "جارٍ التحميل…",
    retry: "حاول مجدداً",
    loadFailed: "حدثت مشكلة أثناء التحميل. ",
    save: "حفظ",
    saving: "جارٍ الحفظ…",
    cancel: "إلغاء",
    close: "إغلاق",
    back: "رجوع",
    privacyKept: "حجوزاتك وملاحظاتك وفواتيرك وتقييماتك تبقى لدى كل صالون. لا شيء هنا ينقلها أو ينسخها.",
  },
};

export const publicCopy = {
  en: {
    ...common.en,
    brand: "PRIMORA",
    switchLanguage: "العربية",
    notFoundTitle: "This professional page does not exist",
    notFoundBody: "The link may be mistyped, or the professional has not published their page yet.",
    home: "Go to PRIMORA",
    headlineFallback: "Beauty and grooming professional",
    about: "About",
    specialties: "Specialties",
    languages: "Languages",
    portfolio: "Portfolio",
    portfolioOpens: "opens the professional's own page in a new tab",
    workplaces: "Where to book",
    noWorkplace: "Not currently linked to a salon on PRIMORA. Follow to hear when they are bookable again.",
    since: (date: string) => `Since ${date}`,
    book: "Book",
    viewShop: "View salon",
    follow: "Follow",
    following: "Following",
    unfollow: "Unfollow",
    notifyOnMove: "Tell me where to book them if they move to a new salon",
    followSignIn: "Sign in to follow",
    followNote: "The professional sees how many people follow them, never who.",
    followed: "You now follow this professional.",
    unfollowed: "You no longer follow this professional.",
    notifyUpdated: "Your notification choice was saved.",
    self: "This is your page.",
    editMine: "Edit my page",
    identityNote: "This page belongs to the professional, not to a salon. It stays the same if they change workplace. A salon's client list, notes, bookings, invoices and reviews never travel with a person.",
  },
  ar: {
    ...common.ar,
    brand: "بريمورا",
    switchLanguage: "English",
    notFoundTitle: "هذه الصفحة المهنية غير موجودة",
    notFoundBody: "ربما كُتب الرابط بشكل خاطئ، أو أن المحترف لم ينشر صفحته بعد.",
    home: "الذهاب إلى بريمورا",
    headlineFallback: "محترف تجميل وعناية",
    about: "نبذة",
    specialties: "التخصصات",
    languages: "اللغات",
    portfolio: "المعرض",
    portfolioOpens: "يفتح صفحة المحترف الخاصة في تبويب جديد",
    workplaces: "أين تحجز",
    noWorkplace: "غير مرتبط حالياً بصالون على بريمورا. تابعه لتعرف متى يصبح الحجز معه متاحاً من جديد.",
    since: (date: string) => `منذ ${date}`,
    book: "احجز",
    viewShop: "عرض الصالون",
    follow: "متابعة",
    following: "تتابعه",
    unfollow: "إلغاء المتابعة",
    notifyOnMove: "أخبرني أين أحجز معه إذا انتقل إلى صالون جديد",
    followSignIn: "سجّل الدخول للمتابعة",
    followNote: "يرى المحترف عدد متابعيه فقط، ولا يرى من هم.",
    followed: "أصبحت تتابع هذا المحترف.",
    unfollowed: "لم تعد تتابع هذا المحترف.",
    notifyUpdated: "تم حفظ اختيار التنبيه.",
    self: "هذه صفحتك.",
    editMine: "تعديل صفحتي",
    identityNote: "هذه الصفحة تخص المحترف وليست تخص صالوناً. تبقى كما هي إذا غيّر مكان عمله. قائمة عملاء الصالون وملاحظاته وحجوزاته وفواتيره وتقييماته لا تنتقل مع أي شخص.",
  },
};

export const identityCopy = {
  en: {
    ...common.en,
    title: "Professional identity",
    subtitle: "Your public page, your followers and your workplaces. They belong to you and move with you.",
    notAvailableTitle: "Professional profiles are for registered staff",
    notAvailableBody: "Ask the salon you work for to register you as an employee with your login, then come back here to create your page.",
    stays: "What moves with you and what stays",
    staysBody: "Your page, your handle, your portfolio links and your followers stay with you when you change salon. Each salon keeps its own client list, notes, bookings, invoices and reviews; none of that is copied or moved.",
    profile: "Public profile",
    createProfile: "Create your page",
    handle: "Handle",
    handleHint: "3 to 30 lowercase English letters, digits and hyphens. Your page address will be /pro/your-handle.",
    handleLocked: "Your handle is public, so only support can change it. Contact support with the reason.",
    handleChecking: "Checking…",
    handleFree: "This handle is available.",
    handleInvalid: "Use 3 to 30 lowercase English letters, digits and single hyphens.",
    handleTaken: "This handle is taken.",
    handleReserved: "This handle is reserved.",
    nameEn: "Display name (English)",
    nameAr: "Display name (Arabic)",
    headlineEn: "Headline (English)",
    headlineAr: "Headline (Arabic)",
    bioEn: "About you (English)",
    bioAr: "About you (Arabic)",
    specialties: "Specialties",
    specialtiesHint: "Separate with commas. Up to 20.",
    languages: "Languages you speak",
    namesRequired: "Enter your name in English and in Arabic.",
    saved: "Your profile was saved.",
    created: "Your page was created. Publish it when you are ready.",
    saveFailed: "Your profile was not saved: ",
    status: "Visibility",
    draft: "Draft: only you can see it",
    published: "Public",
    hiddenByAdmin: "Hidden by an administrator",
    hiddenBody: "Support hid this page. Contact support to have it reviewed.",
    publish: "Publish",
    unpublish: "Unpublish",
    publishTitle: "Publish your page?",
    publishIntro: "Anyone with the link can see your name, headline, about text, specialties, languages, portfolio links and the salon you are linked to. Your phone, email and address are never shown.",
    unpublishTitle: "Unpublish your page?",
    unpublishIntro: "The page stops being public at once. Your followers and your workplaces are kept.",
    published_ok: "Your page is public.",
    unpublished_ok: "Your page is no longer public.",
    viewPublic: "Open my public page",
    portfolio: "Portfolio links",
    portfolioHint: "Links (https) to your work on your own pages. Only link to work whose client agreed to it being shown.",
    portfolioTitleEn: "Title (English)",
    portfolioTitleAr: "Title (Arabic)",
    portfolioUrl: "Link (https)",
    portfolioAdd: "Add link",
    portfolioEmpty: "No portfolio links yet.",
    portfolioRemove: "Remove",
    portfolioRemoveTitle: "Remove this link?",
    portfolioRemoveIntro: "It disappears from your public page at once.",
    portfolioInvalid: "Enter a full https:// link.",
    portfolioAdded: "The link was added.",
    portfolioRemoved: "The link was removed.",
    needProfile: "Create your page first.",
    invitations: "Invitations from salons",
    invitationsEmpty: "No pending invitations.",
    invitedBy: (name: string) => `${name} asked to show you as part of their team.`,
    accept: "Accept",
    decline: "Decline",
    acceptTitle: "Link your page to this salon?",
    acceptIntro: "Your public page will show this salon and a button to book. You can end the link at any time. The salon does not get your followers, and you do not get its clients.",
    declineTitle: "Decline this invitation?",
    declineIntro: "The salon is told nothing more than that the invitation is closed.",
    accepted: "The salon is now linked to your page.",
    declined: "The invitation was declined.",
    workplaces: "Workplaces",
    workplacesEmpty: "You are not linked to any salon yet.",
    current: "Current",
    former: "Past",
    startedOn: (date: string) => `since ${date}`,
    endedOn: (from: string, to: string) => `${from} to ${to}`,
    endedByYou: "ended by you",
    endedBySalon: "ended by the salon",
    endedBySystem: "ended when your employment record changed",
    endedByAdmin: "ended by support",
    endLink: "End link",
    endTitle: "End the link with this salon?",
    endIntro: "Your page stops showing this salon. Your followers and your page stay with you. The salon keeps its own records.",
    ended: "The link was ended.",
    followers: "Followers",
    followersCount: (n: number) => (n === 1 ? "1 person follows you" : `${n} people follow you`),
    followersNote: "You see how many follow you, never who.",
    commandFailed: "That did not work: ",
  },
  ar: {
    ...common.ar,
    title: "الهوية المهنية",
    subtitle: "صفحتك العامة ومتابعوك وأماكن عملك. هي ملك لك وتنتقل معك.",
    notAvailableTitle: "الملفات المهنية لموظفي الصالونات المسجّلين",
    notAvailableBody: "اطلب من الصالون الذي تعمل فيه تسجيلك كموظف بحسابك، ثم عد إلى هنا لإنشاء صفحتك.",
    stays: "ما ينتقل معك وما يبقى",
    staysBody: "صفحتك ومعرّفك وروابط معرضك ومتابعوك تبقى معك عند تغيير الصالون. يحتفظ كل صالون بقائمة عملائه وملاحظاته وحجوزاته وفواتيره وتقييماته، ولا شيء منها يُنسخ أو يُنقل.",
    profile: "الملف العام",
    createProfile: "أنشئ صفحتك",
    handle: "المعرّف",
    handleHint: "من 3 إلى 30 حرفاً إنجليزياً صغيراً أو رقماً أو شرطة. سيكون عنوان صفحتك /pro/معرّفك.",
    handleLocked: "معرّفك منشور للعامة، لذلك لا يغيّره إلا فريق الدعم. تواصل مع الدعم واذكر السبب.",
    handleChecking: "جارٍ التحقق…",
    handleFree: "هذا المعرّف متاح.",
    handleInvalid: "استخدم من 3 إلى 30 حرفاً إنجليزياً صغيراً وأرقاماً وشرطات مفردة.",
    handleTaken: "هذا المعرّف مستخدم.",
    handleReserved: "هذا المعرّف محجوز.",
    nameEn: "الاسم المعروض (بالإنجليزية)",
    nameAr: "الاسم المعروض (بالعربية)",
    headlineEn: "العنوان المختصر (بالإنجليزية)",
    headlineAr: "العنوان المختصر (بالعربية)",
    bioEn: "نبذة عنك (بالإنجليزية)",
    bioAr: "نبذة عنك (بالعربية)",
    specialties: "التخصصات",
    specialtiesHint: "افصل بينها بفواصل. حتى 20.",
    languages: "اللغات التي تتحدثها",
    namesRequired: "أدخل اسمك بالإنجليزية والعربية.",
    saved: "تم حفظ ملفك.",
    created: "تم إنشاء صفحتك. انشرها عندما تكون جاهزاً.",
    saveFailed: "لم يُحفظ ملفك: ",
    status: "الظهور",
    draft: "مسودة: لا يراها غيرك",
    published: "عامة",
    hiddenByAdmin: "أخفتها الإدارة",
    hiddenBody: "أخفى فريق الدعم هذه الصفحة. تواصل مع الدعم لمراجعتها.",
    publish: "نشر",
    unpublish: "إلغاء النشر",
    publishTitle: "نشر صفحتك؟",
    publishIntro: "يستطيع كل من لديه الرابط رؤية اسمك وعنوانك ونبذتك وتخصصاتك ولغاتك وروابط معرضك والصالون المرتبط بك. لا يظهر هاتفك ولا بريدك ولا عنوانك أبداً.",
    unpublishTitle: "إلغاء نشر صفحتك؟",
    unpublishIntro: "تتوقف الصفحة عن كونها عامة فوراً. يبقى متابعوك وأماكن عملك كما هي.",
    published_ok: "صفحتك الآن عامة.",
    unpublished_ok: "لم تعد صفحتك عامة.",
    viewPublic: "افتح صفحتي العامة",
    portfolio: "روابط المعرض",
    portfolioHint: "روابط (https) لأعمالك على صفحاتك الخاصة. لا تضع رابطاً إلا لعمل وافق عميله على عرضه.",
    portfolioTitleEn: "العنوان (بالإنجليزية)",
    portfolioTitleAr: "العنوان (بالعربية)",
    portfolioUrl: "الرابط (https)",
    portfolioAdd: "إضافة رابط",
    portfolioEmpty: "لا توجد روابط في المعرض بعد.",
    portfolioRemove: "إزالة",
    portfolioRemoveTitle: "إزالة هذا الرابط؟",
    portfolioRemoveIntro: "يختفي من صفحتك العامة فوراً.",
    portfolioInvalid: "أدخل رابطاً كاملاً يبدأ بـ https://.",
    portfolioAdded: "تمت إضافة الرابط.",
    portfolioRemoved: "تمت إزالة الرابط.",
    needProfile: "أنشئ صفحتك أولاً.",
    invitations: "دعوات الصالونات",
    invitationsEmpty: "لا توجد دعوات معلّقة.",
    invitedBy: (name: string) => `طلب ${name} إظهارك ضمن فريقه.`,
    accept: "قبول",
    decline: "رفض",
    acceptTitle: "ربط صفحتك بهذا الصالون؟",
    acceptIntro: "ستعرض صفحتك العامة هذا الصالون وزر الحجز. يمكنك إنهاء الربط في أي وقت. لا يحصل الصالون على متابعيك، ولا تحصل أنت على عملائه.",
    declineTitle: "رفض هذه الدعوة؟",
    declineIntro: "لا يعلم الصالون سوى أن الدعوة أُغلقت.",
    accepted: "أصبح الصالون مرتبطاً بصفحتك.",
    declined: "تم رفض الدعوة.",
    workplaces: "أماكن العمل",
    workplacesEmpty: "لست مرتبطاً بأي صالون بعد.",
    current: "الحالي",
    former: "السابق",
    startedOn: (date: string) => `منذ ${date}`,
    endedOn: (from: string, to: string) => `من ${from} إلى ${to}`,
    endedByYou: "أنهيته أنت",
    endedBySalon: "أنهاه الصالون",
    endedBySystem: "انتهى عند تغيّر سجل عملك",
    endedByAdmin: "أنهاه فريق الدعم",
    endLink: "إنهاء الربط",
    endTitle: "إنهاء الربط مع هذا الصالون؟",
    endIntro: "تتوقف صفحتك عن عرض هذا الصالون. يبقى متابعوك وصفحتك معك. ويحتفظ الصالون بسجلاته.",
    ended: "تم إنهاء الربط.",
    followers: "المتابعون",
    followersCount: (n: number) => (n === 1 ? "شخص واحد يتابعك" : `${n} أشخاص يتابعونك`),
    followersNote: "ترى عدد المتابعين فقط، ولا ترى من هم.",
    commandFailed: "لم تنجح العملية: ",
  },
};

export const followingCopy = {
  en: {
    ...common.en,
    title: "Professionals I follow",
    subtitle: "When a professional you follow moves to a new salon you can be told where to book them.",
    empty: "You do not follow any professional yet. Open a professional's page and press Follow.",
    notify: "Tell me when they move salon",
    unfollow: "Unfollow",
    unfollowTitle: "Unfollow this professional?",
    unfollowIntro: "You will stop seeing them here and stop getting move notices.",
    unavailable: "This page is no longer available.",
    book: "Book",
    openPage: "Open page",
    notWorking: "Not linked to a salon right now.",
    unfollowed: "You no longer follow this professional.",
    updated: "Your notification choice was saved.",
    commandFailed: "That did not work: ",
  },
  ar: {
    ...common.ar,
    title: "المحترفون الذين أتابعهم",
    subtitle: "عندما ينتقل محترف تتابعه إلى صالون جديد يمكن إخبارك أين تحجز معه.",
    empty: "لا تتابع أي محترف بعد. افتح صفحة محترف واضغط متابعة.",
    notify: "أخبرني عند انتقاله إلى صالون آخر",
    unfollow: "إلغاء المتابعة",
    unfollowTitle: "إلغاء متابعة هذا المحترف؟",
    unfollowIntro: "لن تراه هنا ولن تصلك إشعارات انتقاله.",
    unavailable: "هذه الصفحة لم تعد متاحة.",
    book: "احجز",
    openPage: "فتح الصفحة",
    notWorking: "غير مرتبط بصالون حالياً.",
    unfollowed: "لم تعد تتابع هذا المحترف.",
    updated: "تم حفظ اختيار التنبيه.",
    commandFailed: "لم تنجح العملية: ",
  },
};

export const linkCopy = {
  en: {
    loadFailed: "Identity link status could not be loaded.",
    noLogin: "No login yet",
    noLoginHint: "Link their login to this employee first.",
    noProfile: "No professional page yet",
    noProfileHint: "They need to create their professional page before you can invite them.",
    invite: "Invite to link identity",
    invited: "Invitation sent",
    withdraw: "Withdraw invitation",
    linked: (handle: string | null) => (handle ? `Linked: /pro/${handle}` : "Linked"),
    end: "End identity link",
    inviteTitle: "Invite this professional to link their page?",
    inviteIntro: "They decide whether to accept. If they do, their public page shows your salon and a booking button. Their page and followers belong to them and leave with them. Your client list, notes, bookings, invoices and reviews stay with you.",
    withdrawTitle: "Withdraw the invitation?",
    withdrawIntro: "The invitation closes and the professional can no longer accept it.",
    endTitle: "End the identity link?",
    endIntro: "Their public page stops showing your salon. Nothing in your own records changes.",
    confirmInvite: "Send invitation",
    confirmWithdraw: "Withdraw",
    confirmEnd: "End link",
    invitedOk: "Invitation sent.",
    withdrawnOk: "Invitation withdrawn.",
    endedOk: "Identity link ended.",
    failed: "That did not work: ",
    working: "Working…",
  },
  ar: {
    loadFailed: "تعذّر تحميل حالة ربط الهوية.",
    noLogin: "لا يوجد حساب دخول بعد",
    noLoginHint: "اربط حساب دخوله بهذا الموظف أولاً.",
    noProfile: "لا توجد صفحة مهنية بعد",
    noProfileHint: "عليه إنشاء صفحته المهنية قبل أن تتمكن من دعوته.",
    invite: "دعوة لربط الهوية",
    invited: "تم إرسال الدعوة",
    withdraw: "سحب الدعوة",
    linked: (handle: string | null) => (handle ? `مرتبط: /pro/${handle}` : "مرتبط"),
    end: "إنهاء ربط الهوية",
    inviteTitle: "دعوة هذا المحترف لربط صفحته؟",
    inviteIntro: "القرار له في القبول أو الرفض. إذا قبل، ستعرض صفحته العامة صالونك وزر الحجز. صفحته ومتابعوه ملك له ويغادرون معه. أما قائمة عملائك وملاحظاتك وحجوزاتك وفواتيرك وتقييماتك فتبقى لديك.",
    withdrawTitle: "سحب الدعوة؟",
    withdrawIntro: "تُغلق الدعوة ولا يعود بإمكان المحترف قبولها.",
    endTitle: "إنهاء ربط الهوية؟",
    endIntro: "تتوقف صفحته العامة عن عرض صالونك. لا يتغير شيء في سجلاتك.",
    confirmInvite: "إرسال الدعوة",
    confirmWithdraw: "سحب",
    confirmEnd: "إنهاء الربط",
    invitedOk: "تم إرسال الدعوة.",
    withdrawnOk: "تم سحب الدعوة.",
    endedOk: "تم إنهاء ربط الهوية.",
    failed: "لم تنجح العملية: ",
    working: "جارٍ التنفيذ…",
  },
};
