// The server's refusal in the reader's language (gaps ux2-arabic-console-shows-english-server-refusals and
// console-refusals-say-administrator-access-required). The database answers in English with a SQLSTATE code and, for most
// console refusals, a HINT naming the rule. This module turns that into one sentence in English or Arabic that says what
// happened and that nothing was changed. It decides nothing: the database already refused. Pure, no React and no Supabase
// client; tests/console-errors.test.mjs checks that every HINT the migrations raise has an Arabic sentence.

const isolate = (text) => `⁨${text}⁩`;
const arNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("ar-SA") : String(value);
};
const firstNumber = (message) => (message.match(/\d+(?:\.\d+)?/) || [""])[0];
const parenthesised = (message) => (message.match(/\(([^)]+)\)/) || ["", ""])[1];

// The console permissions as an operator knows them (admin_role_permissions).
export const PERMISSION_LABELS = {
  en: {
    "operations.write": "operations changes", "settings.manage": "platform settings", "money.config": "money configuration",
    "money.ledger": "the ledger", "money.refund": "refunds", "money.payout": "payouts", "personal.read": "customer and staff details",
    "privacy.manage": "privacy requests", "privacy.approve": "privacy approvals", "incident.manage": "incidents",
    "audit.read": "the audit log", "roles.manage": "console roles", "mfa.reset": "authenticator resets",
    "rewards.approve": "reward programme approvals", "iban.reveal": "bank account reveals", "iban.approve": "bank account approvals",
    "break_glass.use": "break-glass", "break_glass.review": "break-glass reviews", "alerts.acknowledge": "security alerts",
    "health.break_glass": "health data break-glass",
  },
  ar: {
    "operations.write": "تعديلات العمليات", "settings.manage": "إعدادات المنصة", "money.config": "إعدادات المال",
    "money.ledger": "دفتر الحسابات", "money.refund": "المبالغ المستردة", "money.payout": "المدفوعات للمزودين",
    "personal.read": "بيانات العملاء والموظفين", "privacy.manage": "طلبات الخصوصية", "privacy.approve": "اعتماد طلبات الخصوصية",
    "incident.manage": "الحوادث", "audit.read": "سجل التدقيق", "roles.manage": "أدوار لوحة الإدارة", "mfa.reset": "إعادة ضبط المصادقة",
    "rewards.approve": "اعتماد برامج المكافآت", "iban.reveal": "كشف الحسابات البنكية", "iban.approve": "اعتماد الحسابات البنكية",
    "break_glass.use": "صلاحية الطوارئ", "break_glass.review": "مراجعة صلاحية الطوارئ", "alerts.acknowledge": "التنبيهات الأمنية",
    "health.break_glass": "صلاحية الطوارئ للبيانات الصحية",
  },
};

const permissionLabel = (permission, lang) => PERMISSION_LABELS[lang][permission] || permission;

// One entry per HINT the migrations raise. `en` is optional: the server's English text is already specific (it names
// amounts, dates and references) and is kept unless a clearer sentence is given here.
export const HINT_TEXT = {
  missing_permission: {
    en: (_m, d) => `Your console role does not include ${permissionLabel(d, "en")} (${d}), so nothing was changed. An owner can change console roles on Roles & Permissions.`,
    ar: (_m, d) => `لا يشمل دورك في لوحة الإدارة صلاحية «${permissionLabel(d, "ar")}» (${isolate(d)})، لذا لم يتغير شيء. يمكن للمالك تغيير الأدوار من شاشة الأدوار والصلاحيات.`,
  },
  console_role_forbidden: { ar: "لا يسمح دورك في لوحة الإدارة بهذا الإجراء، لذا لم يتغير شيء." },
  step_up_required: {
    en: "This change needs a fresh code from your authenticator app. Nothing was changed; confirm the code and try again.",
    ar: "يحتاج هذا التغيير إلى رمز جديد من تطبيق المصادقة. لم يتغير شيء؛ أكّد الرمز ثم حاول مجدداً.",
  },
  reauth_required: { ar: "سجّل الدخول مجدداً لتأكيد هويتك، ثم كرر هذا التغيير. لم يتغير شيء." },
  approval_required: { ar: "يحتاج هذا الاسترداد إلى موافقة مسؤول ثانٍ لأنه يبلغ حد الاسترداد الفردي أو يتجاوز الحد اليومي. اطلبه للاعتماد." },
  stale_write: {
    en: "Someone else changed this record after you opened it, so nothing was changed. Reload to see the current values.",
    ar: "غيّر شخص آخر هذا السجل بعد أن فتحته، لذا لم يتغير شيء. أعد تحميل الصفحة لرؤية القيم الحالية.",
  },
  not_found: { ar: "لم يعد هذا السجل موجوداً، لذا لم يتغير شيء. أعد تحميل القائمة." },
  reason_required: { ar: "اكتب سبباً واضحاً لهذا الإجراء (٣ أحرف على الأقل، و١٠ أحرف لعملية الحذف الدوري)." },
  unknown_field: { ar: "لا يمكن تغيير هذا الحقل من لوحة الإدارة." },
  decider_not_independent: {
    ar: (m) => (/72 hours/.test(m)
      ? "مُنح دورك في لوحة الإدارة قبل أقل من ٧٢ ساعة، لذا لا يمكنك البت في الطلبات بعد. يبت فيه مسؤول آخر."
      : "عيّنك صاحب هذا الطلب في دورك قبل أقل من ٣٠ يوماً، لذا يبت فيه مسؤول آخر."),
  },
  new_approver_required: { ar: "لا يُجدَّد الحجز القانوني إلا بموافقة شخص جديد: ليس من اقترحه ولا من اعتمده أو جدده آخر مرة." },
  fresh_owner_required: {
    ar: (m) => `جُدد هذا الحجز ${arNumber(firstNumber(m))} مرات، فلا يبقيه إلا مالك لم يسبق له أن اقترحه أو اعتمده أو جدده.`,
  },
  owner_required: { ar: (m) => `جُدد هذا الحجز ${arNumber(firstNumber(m))} مرات، فلا يبقيه إلا مالك المنصة.` },
  legal_hold_active: {
    ar: (m) => `يُبقي حجز قانوني نشط${parenthesised(m) ? ` (${isolate(parenthesised(m))})` : ""} حساب هذا العميل، لذا لا يمكن مسح بيانات ملفه حتى يُرفع الحجز. لم يتغير شيء.`,
  },
  account_reason_required: { ar: "اشرح لماذا تحتاج القضية إلى الحساب نفسه (الملف وبيانات التواصل وتسجيل الدخول)، في ٢٠ حرفاً على الأقل." },
  already_corrected: { ar: "صُحح وقت العلم بهذه الحادثة مرة من قبل، ولا يُصحح مرة ثانية." },
  correction_pending: { ar: "يوجد تصحيح لوقت العلم بهذه الحادثة ينتظر موافقة شخص ثانٍ." },
  break_resolution_needs_second_person: { ar: "التصحيح الذي يسوّي فرق مطابقة ينتظر دائماً شخصاً ثانياً، ولا تنطبق عليه صلاحية الطوارئ." },
  use_admin_propose_break_resolution: { ar: "يُقترح التصحيح الذي يسوّي فرق مطابقة من شاشة المطابقة." },
  correction_exceeds_break: { ar: "يتجاوز هذا التصحيح ما تبقى من فرق المطابقة بعد التصحيحات المسجلة والمنتظرة." },
  change_notice_undelivered: { ar: "لم يُبلَّغ المزود بعد بتغيير حسابه البنكي. ادفع بعد إرسال الإشعار أو بعد أن يعفي منه شخص ثانٍ." },
  contact_changed_recently: { ar: "تغيّر البريد أو رقم الجوال لهذا الحساب خلال آخر ٣٠ يوماً، فلا يُسلَّم شيء ولا يُحذف قبل انتهاء فترة التهدئة." },
  contact_recently_changed: { ar: "تغيّر البريد أو رقم الجوال الموثق خلال آخر ٤٨ ساعة، لذا توقفت تغييرات الحساب البنكي مؤقتاً." },
  contact_otp_required: { ar: "أكّد هويتك برمز لمرة واحدة يُرسل إلى بريدك أو جوالك الموثق، ثم كرر الطلب." },
  destination_not_approved: { ar: "يذكر هذا الدفع حساباً بنكياً غير معتمد؛ يجب أن تعتمد المالية حساب المزود أولاً." },
  destination_on_hold: { ar: "المدفوعات إلى هذا الحساب البنكي الجديد معلّقة لمدة ٤٨ ساعة بعد اعتماده." },
  destination_pending: { ar: "لدى المزود تغيير في الحساب البنكي ينتظر الاعتماد؛ سوِّ الدفع بعد البت فيه." },
  duplicate_file: { ar: "استُورد هذا الملف من قبل أو ينتظر الاعتماد لذلك اليوم." },
  email_incomplete: { ar: "اكتب عنوان البريد الإلكتروني كاملاً؛ لا يُبحث بجزء منه." },
  phone_incomplete: { ar: "اكتب رقم الجوال كاملاً؛ لا يُبحث بجزء منه." },
  query_too_short: { ar: "ابحث بثلاثة أحرف على الأقل من الاسم، أو بالبريد أو رقم الجوال كاملاً." },
  export_expired: { ar: "انتهت صلاحية هذا التنزيل بعد ٧ أيام من تجهيزه؛ اطلب نسخة جديدة." },
  download_limit_reached: { ar: "نُزّل هذا الملف عدد المرات المسموح به؛ اطلب نسخة جديدة إن احتجت إليه." },
  health_intake_gated: { ar: "لا تُجمع الأسئلة الصحية بعد: لم يُعتمد تقييم مخاطر نقل البيانات الصحية." },
  identity_not_verified: { ar: "لم يؤكد العميل هويته بعد، فلا يُسلَّم شيء ولا يُحذف قبل ذلك." },
  no_earlier_request: { ar: "طلب متكرر: ليس لهذا العميل طلب مكتمل سابق من النوع نفسه خلال آخر ١٢ شهراً." },
  no_verified_contact: { ar: "لا يوجد بريد أو رقم جوال موثق لإرسال رمز لمرة واحدة إليه." },
  not_a_customer_account: { ar: "حذف الخصوصية يشمل حسابات العملاء فقط؛ تُغلق حسابات الأعمال ولوحة الإدارة عبر الدعم." },
  object_type_not_allowed_for_source: { ar: "هذا المصدر لا يحمل هذا النوع من العمليات: عمليات الشحن والاسترداد تأتي من واجهة Tap فقط." },
  payout_hold: { ar: "المدفوعات لهذا المزود معلّقة؛ ارفع التعليق أولاً." },
  prospective_only: { ar: "يسري تغيير الرسوم على الحجوزات المستقبلية فقط: اختر تاريخ بدء من اليوم فصاعداً." },
  fee_increase_notice: { ar: "زيادة الرسوم تمنح المزودين إشعاراً مدته ٣٠ يوماً: اختر تاريخ بدء لاحقاً." },
  purpose_required: { ar: "اذكر الغرض من هذا الاطلاع." },
  reconciliation_break_open: { ar: "تنتظر المدفوعات تسوية فروق المطابقة المفتوحة مع Tap." },
  reward_program_approval: { ar: "لا تتغير برامج الإحالة والولاء إلا بتغيير معتمد من شاشة الإعدادات." },
  reward_values_required: { ar: "لا يمكن تفعيل البرنامج قبل تحديد كل قيمه." },
  tap_check_not_due: { ar: "يتاح التحقق من Tap لاسترداد نتيجته غير معروفة، أو ما زال قيد المعالجة بعد يومي عمل." },
  refund_outcome_unknown: { ar: "ربما دفعت Tap هذا الاسترداد من قبل، لذا لا يُرسل مرة أخرى: تحقق منه مع Tap، أو اطلب من شخص ثانٍ تسجيل ما تُظهره Tap." },
  tap_refund_id_required: { ar: "اكتب معرّف الاسترداد في Tap الذي يثبت أن المبلغ دُفع." },
  terms_required: { ar: "اقرأ شروط برنامج الإحالة ووافق عليها أولاً." },
  too_many_rows: { ar: "تحتوي هذه الفترة على صفوف كثيرة جداً. اختر فترة أقصر." },
  append_only: { ar: "سجلات المال لا تُعدَّل بعد تسجيلها؛ سجّل قيد تصحيح أو عكس مرتبطاً بها." },
  use_admin_cancel_booking: { ar: "يُلغى الحجز من لوحة الإدارة بأمر الإلغاء الذي يطبق قواعد اعتماد الاسترداد." },
  use_admin_mark_booking_no_show: { ar: "يُسجَّل عدم الحضور من لوحة الإدارة بالأمر الذي يطبق قواعد اعتماد الاسترداد." },
  vat_number_format: { ar: "الرقم الضريبي ١٥ رقماً يبدأ بالرقم ٣ وينتهي به." },
  gateway_not_operational: { ar: "لا توجد بوابة دفع متصلة ومفعلة تدعم هذه الطريقة في بيئتها، لذا لم يتغير شيء." },
  integration_key_fixed: { ar: "لا يتغير مفتاح ربط قائم: طرق الدفع تذكر بوابتها به." },
  integration_key_hint_invalid: { ar: "يقبل تلميح المفتاح نقاطاً وآخر أربعة أحرف من المفتاح فقط؛ لا تلصق المفتاح كاملاً أبداً." },
  integration_key_invalid: { ar: "مفتاح الربط من ٢ إلى ٤٨ حرفاً إنجليزياً صغيراً أو رقماً أو شرطة سفلية." },
  integration_key_taken: { ar: "يوجد ربط آخر بهذا المفتاح." },
  integration_name_required: { ar: "اكتب اسماً للربط لا يزيد على ١٢٠ حرفاً." },
  integration_url_invalid: { ar: `يبدأ الرابط بـ ${isolate("https://")} (أو مسار ${isolate("/functions/v1/")} لرابط الويبهوك).` },
  service_names_required: { ar: "تحتاج الخدمة إلى اسم بالإنجليزية واسم بالعربية." },
  service_category_required: { ar: "اختر فئة موجودة للخدمة." },
  service_price_invalid: { ar: "السعر مبلغ بالريال يساوي صفراً أو أكثر." },
  service_duration_invalid: { ar: "المدة بين ٥ و١٤٤٠ دقيقة." },
  service_image_invalid: { ar: `الصورة رابط يبدأ بـ ${isolate("https://")} أو مسار في الموقع يبدأ بـ /.` },
};

// Frequent refusals that carry no HINT, matched on the server's English text.
const MESSAGE_TEXT = [
  [/^Administrator access required$/i, "Your console role cannot do this, so nothing was changed.", "لا يسمح دورك في لوحة الإدارة بهذا الإجراء، لذا لم يتغير شيء."],
  [/^Your console role cannot do this \((.+) required\)$/i, null, (m) => `لا يسمح دورك في لوحة الإدارة بهذا الإجراء (يحتاج ${isolate(m[1])}).`],
  [/^Your console role cannot read (.+)$/i, null, () => "لا يسمح دورك في لوحة الإدارة بالاطلاع على هذه البيانات."],
  [/^Your console role cannot decide (.+) requests$/i, null, () => "لا يسمح دورك في لوحة الإدارة بالبت في هذا النوع من الطلبات."],
  [/^A reason (?:of at least (\d+) characters )?is required/i, null, (m) => `اكتب سبباً لا يقل عن ${arNumber(m[1] || 3)} أحرف.`],
  [/^Explain the correction \(at least (\d+) characters\)$/i, null, (m) => `اشرح التصحيح في ${arNumber(m[1])} حرفاً على الأقل.`],
  [/^Record the outcome of the review \(at least (\d+) characters\)$/i, null, (m) => `سجّل نتيجة المراجعة في ${arNumber(m[1])} حرفاً على الأقل.`],
  [/^Record why the purge should run \(at least (\d+) characters\)$/i, null, (m) => `اكتب سبب تشغيل الحذف في ${arNumber(m[1])} أحرف على الأقل.`],
  [/^This request is no longer pending$/i, null, "لم يعد هذا الطلب قيد الانتظار؛ أعد تحميل القائمة."],
  [/^You cannot approve or reject your own request/i, null, "لا يمكنك اعتماد طلبك أو رفضه؛ يبت فيه مسؤول آخر."],
  [/^Only the administrator who made the request can withdraw it/i, null, "لا يسحب الطلب إلا من قدّمه؛ يمكن لغيره رفضه."],
  [/^The awareness time must be after the discovery and not in the future$/i, null, "يجب أن يكون وقت العلم بعد وقت الاكتشاف وألا يكون في المستقبل."],
  [/^A closed incident is kept as recorded$/i, null, "تُحفظ الحادثة المغلقة كما سُجلت ولا تُعدَّل."],
  [/^The dispute closed; this hold ends 30 days after and is not renewed$/i, null, "أُغلق النزاع؛ ينتهي هذا الحجز بعد ٣٠ يوماً ولا يُجدَّد."],
  [/^The hold is no longer active$/i, null, "لم يعد هذا الحجز نشطاً."],
  [/^(.+) not found$/i, null, "لم يُعثر على هذا السجل، لذا لم يتغير شيء. أعد تحميل القائمة."],
  [/^Decision must be approve or reject$/i, null, "القرار إما اعتماد أو رفض."],
  [/permission denied/i, "The server refused this for your account, so nothing was changed.", "رفض الخادم هذا الإجراء لحسابك، لذا لم يتغير شيء."],
  [/row-level security/i, "The server refused this change for your account, so nothing was changed.", "رفض الخادم هذا التغيير لحسابك، لذا لم يتغير شيء."],
  [/JWT expired|invalid JWT|session.*expired/i, "Your session ended. Sign in again; nothing was changed.", "انتهت جلستك. سجّل الدخول مجدداً؛ لم يتغير شيء."],
  [/Failed to fetch|NetworkError|Load failed|fetch failed/i, "The server could not be reached, so nothing was changed. Check your connection and try again.", "تعذر الوصول إلى الخادم، لذا لم يتغير شيء. تحقق من الاتصال وحاول مجدداً."],
];

function parts(error) {
  if (!error) return { message: "", code: "", hint: "", detail: "" };
  if (typeof error === "string") return { message: error, code: "", hint: "", detail: "" };
  const e = /** @type {Record<string, unknown>} */ (error);
  const text = (value) => (typeof value === "string" ? value : "");
  return {
    message: text(e.message) || (error instanceof Error ? error.message : ""),
    code: text(e.code),
    hint: text(e.hint),
    detail: text(e.details) || text(e.detail),
  };
}

// One sentence for a refused or failed read or write, in the reader's language.
/**
 * @param {unknown} error
 * @param {"en" | "ar"} lang
 * @returns {string}
 */
export function describeConsoleError(error, lang) {
  const { message, code, hint, detail } = parts(error);
  if (code === "no_rows") {
    return lang === "ar"
      ? "لم يتغير شيء: لم يقبل الخادم هذا التغيير لدورك في لوحة الإدارة، أو لم يعد السجل موجوداً. أعد تحميل الصفحة لرؤية القيم الحالية."
      : "Nothing was changed: the server did not accept this change for your console role, or the record no longer exists. Reload to see the current values.";
  }
  const byHint = hint ? HINT_TEXT[hint] : undefined;
  if (byHint) {
    const pick = lang === "ar" ? byHint.ar : byHint.en;
    if (typeof pick === "function") return pick(message, detail);
    if (typeof pick === "string") return pick;
    if (message) return message;
  }
  for (const [pattern, en, ar] of MESSAGE_TEXT) {
    const match = message.match(pattern);
    if (!match) continue;
    const pick = lang === "ar" ? ar : en;
    if (typeof pick === "function") return pick(match);
    if (typeof pick === "string") return pick;
    return message;
  }
  if (lang === "en") {
    if (message) return message;
    return "The request failed and nothing was changed. Try again.";
  }
  const lead = code === "42501" ? "رفض الخادم هذا الإجراء لدورك، ولم يتغير شيء"
    : code === "P0002" ? "لم يُعثر على السجل، ولم يتغير شيء"
      : code === "40001" ? "تغيّر السجل بعد أن فتحته، ولم يتغير شيء"
        : code === "23505" ? "توجد قيمة مطابقة مسجلة من قبل، ولم يتغير شيء"
          : code === "22023" || code.startsWith("22") ? "لم يقبل الخادم هذه القيمة، ولم يتغير شيء"
            : "رفض الخادم العملية ولم يتغير شيء";
  return message ? `${lead}: ${isolate(message)}` : `${lead}.`;
}

// A confirmed answer that nothing needed to change (the record was already in the asked state): said plainly, never as saved.
export function unchangedText(lang) {
  return lang === "ar" ? "لم يتغير شيء: السجل على هذه الحالة من قبل." : "Nothing changed: the record was already in that state.";
}
