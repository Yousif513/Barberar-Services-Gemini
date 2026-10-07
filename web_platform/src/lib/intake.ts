// Shared by the intake screens (provider /provider/intake, customer /customer/bookings/[id]/intake and the small link on the
// bookings screens): the server's answer shapes, every user-visible string in both languages, and the translation of the
// server's reasons. Health answers are sensitive personal data: nothing here logs or caches an answer.
import type { OperationsLocale } from "@/components/operations-ui";

export const INTAKE_PAGE_SIZE = 10;
export const FIELD_TYPES = ["short_text", "long_text", "yes_no", "single_choice", "multi_choice", "date", "acknowledge"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
// Technical ceilings the database also enforces; the business numbers (validity, minimum hours, retention) are never defaulted here.
export const MAX_FIELDS = 60;
export const MAX_TEXT_LENGTH = 2000;
export const MAX_OPTIONS = 30;

export type IntakeOption = { value: string; label_en: string; label_ar: string };
export type IntakeField = {
  key: string;
  type: FieldType;
  label_en: string;
  label_ar: string;
  required: boolean;
  max_length?: number;
  options?: IntakeOption[];
};
export type AnswerValue = string | boolean | string[] | null | undefined;
export type Answers = Record<string, AnswerValue>;

export type FormStatus = "not_required" | "submitted" | "missing" | "withdrawn" | "deleted" | "purged";
export type PatchStatus = "not_required" | "valid" | "missing" | "expired" | "too_late" | "blocked";

export type StatusRow = {
  booking_id: string;
  provider_id: string;
  service_id: string;
  customer_id: string;
  scheduled_at: string;
  booking_status: string;
  service_name_en: string;
  service_name_ar: string;
  customer_first_name: string | null;
  customer_last_name: string | null;
  form_required: boolean;
  form_status: FormStatus;
  patch_required: boolean;
  patch_status: PatchStatus;
  blocked: boolean;
  met: boolean;
};

export type BookingIntake = {
  booking_id: string;
  booking_status: string;
  scheduled_at: string;
  service_id: string;
  provider_id: string;
  consent_active: boolean;
  requirement: { form_required: boolean; patch_test_required: boolean; patch_validity_days: number | null; patch_min_hours_before: number | null } | null;
  form: { template_id: string; version: number; name_en: string; name_ar: string; is_active: boolean; fields: IntakeField[] } | null;
  submission: {
    status: "submitted" | "withdrawn" | "deleted" | "purged";
    submitted_at: string;
    template_version: number;
    answers_removed_at: string | null;
    removal_reason: string | null;
    read_count: number;
    last_read_at: string | null;
    answers: Answers | null;
  } | null;
  state: { form_status: FormStatus; patch_status: PatchStatus; blocked: boolean; met: boolean };
  patch_tests: { id: string; result: "negative" | "positive"; tested_at: string; cleared_at: string | null }[];
};

export type StaffAnswers = {
  booking_id: string;
  status: "missing" | "submitted" | "withdrawn" | "deleted" | "purged";
  answers: Answers | null;
  fields?: IntakeField[];
  name_en?: string;
  name_ar?: string;
  template_version?: number;
  submitted_at?: string;
};

export const intakeCopy = {
  en: {
    // generic
    loading: "Loading…",
    retry: "Try again",
    loadFailed: "This could not be loaded:",
    noProvider: "No business is linked to this account.",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    close: "Close",
    prev: "Previous",
    next: "Next",
    page: (n: number, total: number) => `Page ${n} of ${total}`,
    yes: "Yes",
    no: "No",
    ownerOnly: "Only the owner of the business can change these settings.",
    // provider screen
    providerTitle: "Intake forms and patch tests",
    providerSubtitle: "Define the health questionnaire clients complete after booking, the patch tests a service needs, and see which upcoming bookings are still missing something. Answers are health data: only staff who serve the booking can open them, and every opening is recorded.",
    enforceTitle: "Enforcement",
    enforceLabel: "Do not allow a service to start or complete while a required form or valid patch test is missing",
    enforceHelp: "Off by default. Cancelling or marking a no-show is never blocked. A positive patch test always blocks that service for that client until you clear it.",
    enforceOnTitle: "Turn enforcement on?",
    enforceOnIntro: "Professionals will not be able to check a client in or complete the service until the form and patch test the service requires are in place.",
    enforceOffTitle: "Turn enforcement off?",
    enforceOffIntro: "Services can start and complete even when a form or patch test is missing. A positive patch test still blocks that service.",
    enforceOn: "Turn on",
    enforceOff: "Turn off",
    enforcementNow: "Enforcement is",
    on: "on",
    off: "off",
    templatesTitle: "Forms",
    newForm: "New form",
    editForm: "Edit",
    noForms: "No forms yet. Create one, then attach it to a service below.",
    formName: "Name",
    nameEn: "Name (English)",
    nameAr: "Name (Arabic)",
    version: (n: number) => `Version ${n}`,
    activeForm: "Form is active",
    archived: "Archived",
    activeBadge: "Active",
    fieldsTitle: "Questions",
    addField: "Add question",
    removeField: "Remove question",
    moveUp: "Move up",
    moveDown: "Move down",
    fieldType: "Answer type",
    labelEn: "Question (English)",
    labelAr: "Question (Arabic)",
    requiredField: "Required",
    maxLength: "Maximum length (characters)",
    maxLengthHelp: "Optional, up to 2000.",
    options: "Choices",
    addOption: "Add choice",
    removeOption: "Remove choice",
    optionEn: "Choice (English)",
    optionAr: "Choice (Arabic)",
    types: {
      short_text: "Short text",
      long_text: "Long text",
      yes_no: "Yes / no",
      single_choice: "Single choice",
      multi_choice: "Multiple choice",
      date: "Date",
      acknowledge: "I acknowledge",
    } as Record<FieldType, string>,
    templateHelp: "Saving a form with different questions publishes a new version. Bookings keep the version the client answered.",
    templateNeedsFields: "Add at least one question.",
    labelsNeeded: "Give every question an English and an Arabic text.",
    optionsNeeded: "A choice question needs at least two choices with both languages.",
    maxLengthInvalid: "The maximum length must be a whole number from 1 to 2000.",
    formNamesNeeded: "Give the form an English and an Arabic name.",
    saveForm: "Save form",
    formSaved: "The form was saved.",
    servicesTitle: "Requirements per service",
    servicesHelp: "A form is required before the appointment by default once you attach one. Patch-test numbers are your own settings and stay empty until you set them.",
    noServices: "This business has no services yet.",
    service: "Service",
    requirement: "Requirement",
    none: "None",
    setRequirement: "Set requirement",
    editRequirement: "Edit",
    removeRequirement: "Remove",
    removeRequirementTitle: "Remove this requirement?",
    removeRequirementIntro: "Clients will no longer be asked for a form or patch test for this service. Forms already submitted are kept.",
    requirementTitle: "Requirement for this service",
    formRequiredLabel: "Clients complete a form before the appointment",
    chooseForm: "Form",
    chooseFormPlaceholder: "Choose an active form",
    patchRequiredLabel: "A patch test is required",
    validityDays: "Patch test stays valid for (days)",
    validityHelp: "Required when a patch test is required.",
    minHours: "Done at least this many hours before the appointment",
    minHoursHelp: "Optional. Leave empty for no minimum.",
    validityInvalid: "Enter a whole number of days from 1 to 3650.",
    minHoursInvalid: "Enter a whole number of hours from 0 to 720, or leave it empty.",
    formChoiceNeeded: "Choose an active form.",
    requirementSaved: "The requirement was saved.",
    requirementRemoved: "The requirement was removed.",
    summaryForm: "Form before the appointment",
    summaryPatch: (days: number, hours: number | null) => `Patch test valid ${days} days${hours != null ? `, done at least ${hours} h before` : ""}`,
    missingTitle: "Upcoming bookings",
    missingHelp: "Bookings that still lack a required form or a valid patch test.",
    onlyMissing: "Only bookings that lack something",
    noMissing: "Every upcoming booking has what its service requires.",
    noUpcoming: "There are no upcoming bookings that need a form or patch test.",
    client: "Client",
    when: "When",
    formCol: "Form",
    patchCol: "Patch test",
    actions: "Actions",
    viewAnswers: "View answers",
    recordPatch: "Record patch test",
    formStatus: {
      not_required: "Not required",
      submitted: "Received",
      missing: "Missing",
      withdrawn: "Withdrawn by client",
      deleted: "Deleted by client",
      purged: "Removed (retention)",
    } as Record<FormStatus, string>,
    patchStatus: {
      not_required: "Not required",
      valid: "Valid",
      missing: "Missing",
      expired: "Expired",
      too_late: "Done too late",
      blocked: "Blocked (positive)",
    } as Record<PatchStatus, string>,
    answersTitle: "Client answers",
    answersWarning: "These are health answers. Opening them has been recorded in the audit log.",
    answersNone: "There are no answers to show.",
    answersRemoved: "The client removed these answers.",
    submittedOn: "Submitted",
    patchDialogTitle: "Record a patch test",
    patchDialogIntro: "Record the result for this client and service.",
    result: "Result",
    negative: "Negative (no reaction)",
    positive: "Positive (reaction)",
    testedAt: "Tested on",
    testedAtInvalid: "Enter a date and time that is not in the future.",
    patchPositiveWarning: "A positive result blocks this service for this client until the owner clears it.",
    patchSaved: "The patch test was recorded.",
    patchLogTitle: "Patch-test log",
    noPatchTests: "No patch tests have been recorded.",
    resultCol: "Result",
    testedCol: "Tested",
    clearBlock: "Clear block",
    clearTitle: "Clear this block?",
    clearIntro: "The client can be booked and served for this service again. Your reason is kept in the audit log.",
    clearReason: "Why is the block being cleared?",
    clearConfirm: "Clear block",
    blockCleared: "The block was cleared.",
    cleared: "Cleared",
    activeBlock: "Block active",
    // customer screen
    customerTitle: "Health form",
    customerSubtitle: "Your provider asks for this information to serve you safely.",
    back: "Back to my bookings",
    noFormTitle: "No form is needed for this booking",
    noFormBody: "Your provider has not asked for a health form for this service.",
    formUnavailable: "The provider's form is not available right now. Please contact the provider.",
    cannotComplete: "A form can only be completed for an upcoming booking.",
    consentTitle: "Before you share health information",
    shareHeading: "Who can see your answers",
    shareItems: (provider: string) => [
      `Only ${provider}: the owner, managers with booking access, and the professional assigned to this booking can open your answers, and only to prepare your service.`,
      "Every time someone opens your answers it is recorded, and you can see how many times below.",
      "PRIMORA administrators never see your answers. They only see counts.",
    ],
    keptHeading: "How long they are kept",
    keptItems: [
      "Until you delete them, or until the retention period the platform sets ends.",
      "If you withdraw your consent, answers for upcoming bookings are erased and your provider can see that you withdrew.",
    ],
    consentLabel: "I agree to share my answers to this form with this provider for the purpose above.",
    consentNeeded: "Tick the box to agree before continuing.",
    consentGive: "Agree and continue",
    consentGiving: "Saving…",
    consentRecorded: "Your consent was recorded.",
    yourAnswers: "Your answers",
    submit: "Submit form",
    submitting: "Submitting…",
    update: "Save changes",
    submitted: "Your form was submitted.",
    submittedHeading: "Form received",
    submittedBody: (date: string, version: number) => `Submitted ${date} (form version ${version}).`,
    readCount: (n: number) => (n === 0 ? "Nobody has opened your answers yet." : `Your answers were opened ${n} time${n === 1 ? "" : "s"}.`),
    lastRead: "Last opened",
    editAnswers: "Change my answers",
    deleteAnswers: "Delete my answers",
    deleteTitle: "Delete your answers?",
    deleteIntro: "Your answers are erased. Your provider will see that the form is missing and you can complete it again later.",
    deleteConfirm: "Delete",
    deleted: "Your answers were deleted.",
    withdraw: "Withdraw my consent",
    withdrawTitle: "Withdraw your consent?",
    withdrawIntro: "Answers for your upcoming bookings are erased. You will need to consent again to complete a form.",
    withdrawConfirm: "Withdraw",
    withdrawn: (n: number) => `Your consent was withdrawn. ${n} set${n === 1 ? "" : "s"} of answers for upcoming bookings ${n === 1 ? "was" : "were"} erased.`,
    stateWithdrawn: "You withdrew consent, so these answers were erased. Give consent again to complete the form.",
    stateDeleted: "You deleted your answers. Complete the form again if you still want to.",
    statePurged: "These answers were removed after the retention period.",
    patchHeading: "Patch test",
    patchRule: (days: number | null, hours: number | null) =>
      `This service needs a patch test${days != null ? ` valid for ${days} days` : ""}${hours != null ? `, done at least ${hours} hours before your appointment` : ""}. Your provider records the result.`,
    patchNone: "No patch test has been recorded for you yet.",
    patchBlockedNote: "A patch test showed a reaction, so this service is on hold. Please contact your provider.",
    required: "Required",
    optional: "Optional",
    chooseOne: "Choose one",
    dateFormat: "Date",
    answerRequired: "This answer is required.",
    ackRequired: "You need to acknowledge this to continue.",
    tooLong: (n: number) => `Keep this under ${n} characters.`,
    checkAnswers: "Check the highlighted answers.",
    // link on the bookings screens
    linkComplete: "Complete health form",
    linkView: "Health form",
    linkPatch: "Patch test",
  },
  ar: {
    loading: "جارٍ التحميل…",
    retry: "إعادة المحاولة",
    loadFailed: "تعذّر تحميل هذه البيانات:",
    noProvider: "لا يوجد نشاط تجاري مرتبط بهذا الحساب.",
    save: "حفظ",
    saving: "جارٍ الحفظ…",
    cancel: "إلغاء",
    close: "إغلاق",
    prev: "السابق",
    next: "التالي",
    page: (n: number, total: number) => `الصفحة ${n} من ${total}`,
    yes: "نعم",
    no: "لا",
    ownerOnly: "مالك النشاط وحده يستطيع تغيير هذه الإعدادات.",
    providerTitle: "نماذج الاستمارة واختبارات الحساسية",
    providerSubtitle: "حدّد الاستبيان الصحي الذي يعبّئه العميل بعد الحجز، واختبارات الحساسية التي تحتاجها الخدمة، وتعرّف على الحجوزات القادمة التي ينقصها شيء. الإجابات بيانات صحية: لا يفتحها إلا من يخدم الحجز، ويُسجَّل كل فتح لها.",
    enforceTitle: "الإلزام",
    enforceLabel: "منع بدء الخدمة أو إكمالها ما دام النموذج المطلوب أو اختبار الحساسية الساري ناقصًا",
    enforceHelp: "متوقف افتراضيًا. لا يُمنع الإلغاء ولا تسجيل عدم الحضور أبدًا. والنتيجة الإيجابية لاختبار الحساسية تمنع تلك الخدمة عن ذلك العميل دائمًا إلى أن ترفع المنع.",
    enforceOnTitle: "تفعيل الإلزام؟",
    enforceOnIntro: "لن يتمكن المختصون من تسجيل وصول العميل أو إكمال الخدمة قبل توفر النموذج واختبار الحساسية اللذين تطلبهما الخدمة.",
    enforceOffTitle: "إيقاف الإلزام؟",
    enforceOffIntro: "يمكن بدء الخدمات وإكمالها حتى لو نقص نموذج أو اختبار حساسية. أما النتيجة الإيجابية فتبقى مانعة لتلك الخدمة.",
    enforceOn: "تفعيل",
    enforceOff: "إيقاف",
    enforcementNow: "الإلزام",
    on: "مفعّل",
    off: "متوقف",
    templatesTitle: "النماذج",
    newForm: "نموذج جديد",
    editForm: "تعديل",
    noForms: "لا توجد نماذج بعد. أنشئ نموذجًا ثم اربطه بخدمة من الأسفل.",
    formName: "الاسم",
    nameEn: "الاسم (بالإنجليزية)",
    nameAr: "الاسم (بالعربية)",
    version: (n: number) => `الإصدار ${n}`,
    activeForm: "النموذج مفعّل",
    archived: "مؤرشف",
    activeBadge: "مفعّل",
    fieldsTitle: "الأسئلة",
    addField: "إضافة سؤال",
    removeField: "حذف السؤال",
    moveUp: "نقل لأعلى",
    moveDown: "نقل لأسفل",
    fieldType: "نوع الإجابة",
    labelEn: "السؤال (بالإنجليزية)",
    labelAr: "السؤال (بالعربية)",
    requiredField: "إلزامي",
    maxLength: "الحد الأقصى للطول (حرفًا)",
    maxLengthHelp: "اختياري، حتى 2000.",
    options: "الخيارات",
    addOption: "إضافة خيار",
    removeOption: "حذف الخيار",
    optionEn: "الخيار (بالإنجليزية)",
    optionAr: "الخيار (بالعربية)",
    types: {
      short_text: "نص قصير",
      long_text: "نص طويل",
      yes_no: "نعم / لا",
      single_choice: "اختيار واحد",
      multi_choice: "اختيارات متعددة",
      date: "تاريخ",
      acknowledge: "أُقرّ بذلك",
    } as Record<FieldType, string>,
    templateHelp: "حفظ نموذج بأسئلة مختلفة ينشر إصدارًا جديدًا. تحتفظ الحجوزات بالإصدار الذي أجاب عنه العميل.",
    templateNeedsFields: "أضف سؤالًا واحدًا على الأقل.",
    labelsNeeded: "اكتب لكل سؤال نصًا بالإنجليزية ونصًا بالعربية.",
    optionsNeeded: "سؤال الاختيار يحتاج خيارين على الأقل بكلتا اللغتين.",
    maxLengthInvalid: "يجب أن يكون الحد الأقصى للطول عددًا صحيحًا من 1 إلى 2000.",
    formNamesNeeded: "اكتب للنموذج اسمًا بالإنجليزية واسمًا بالعربية.",
    saveForm: "حفظ النموذج",
    formSaved: "تم حفظ النموذج.",
    servicesTitle: "المتطلبات لكل خدمة",
    servicesHelp: "يُطلب النموذج قبل الموعد افتراضيًا بمجرد ربطك نموذجًا. أرقام اختبار الحساسية إعداداتك أنت وتبقى فارغة حتى تحددها.",
    noServices: "لا توجد خدمات في هذا النشاط بعد.",
    service: "الخدمة",
    requirement: "المتطلب",
    none: "لا يوجد",
    setRequirement: "تحديد متطلب",
    editRequirement: "تعديل",
    removeRequirement: "إزالة",
    removeRequirementTitle: "إزالة هذا المتطلب؟",
    removeRequirementIntro: "لن يُطلب من العملاء نموذج أو اختبار حساسية لهذه الخدمة. النماذج المرسلة سابقًا تبقى محفوظة.",
    requirementTitle: "متطلب هذه الخدمة",
    formRequiredLabel: "يعبّئ العميل نموذجًا قبل الموعد",
    chooseForm: "النموذج",
    chooseFormPlaceholder: "اختر نموذجًا مفعّلًا",
    patchRequiredLabel: "اختبار الحساسية مطلوب",
    validityDays: "مدة سريان اختبار الحساسية (بالأيام)",
    validityHelp: "مطلوبة عند اشتراط اختبار الحساسية.",
    minHours: "يُجرى قبل الموعد بهذا العدد من الساعات على الأقل",
    minHoursHelp: "اختياري. اتركه فارغًا إن لم يكن هناك حد أدنى.",
    validityInvalid: "أدخل عددًا صحيحًا من الأيام بين 1 و3650.",
    minHoursInvalid: "أدخل عددًا صحيحًا من الساعات بين 0 و720، أو اتركه فارغًا.",
    formChoiceNeeded: "اختر نموذجًا مفعّلًا.",
    requirementSaved: "تم حفظ المتطلب.",
    requirementRemoved: "تمت إزالة المتطلب.",
    summaryForm: "نموذج قبل الموعد",
    summaryPatch: (days: number, hours: number | null) => `اختبار حساسية ساري ${days} يومًا${hours != null ? `، يُجرى قبل الموعد بـ ${hours} ساعة على الأقل` : ""}`,
    missingTitle: "الحجوزات القادمة",
    missingHelp: "الحجوزات التي ينقصها نموذج مطلوب أو اختبار حساسية ساري.",
    onlyMissing: "الحجوزات الناقصة فقط",
    noMissing: "كل حجز قادم لديه ما تتطلبه خدمته.",
    noUpcoming: "لا توجد حجوزات قادمة تحتاج نموذجًا أو اختبار حساسية.",
    client: "العميل",
    when: "الموعد",
    formCol: "النموذج",
    patchCol: "اختبار الحساسية",
    actions: "إجراءات",
    viewAnswers: "عرض الإجابات",
    recordPatch: "تسجيل اختبار حساسية",
    formStatus: {
      not_required: "غير مطلوب",
      submitted: "تم الاستلام",
      missing: "ناقص",
      withdrawn: "سحبه العميل",
      deleted: "حذفه العميل",
      purged: "أُزيل (مدة الاحتفاظ)",
    } as Record<FormStatus, string>,
    patchStatus: {
      not_required: "غير مطلوب",
      valid: "ساري",
      missing: "ناقص",
      expired: "منتهي",
      too_late: "أُجري متأخرًا",
      blocked: "ممنوع (إيجابي)",
    } as Record<PatchStatus, string>,
    answersTitle: "إجابات العميل",
    answersWarning: "هذه إجابات صحية. تم تسجيل فتحها في سجل التدقيق.",
    answersNone: "لا توجد إجابات لعرضها.",
    answersRemoved: "أزال العميل هذه الإجابات.",
    submittedOn: "أُرسل",
    patchDialogTitle: "تسجيل اختبار حساسية",
    patchDialogIntro: "سجّل النتيجة لهذا العميل وهذه الخدمة.",
    result: "النتيجة",
    negative: "سلبية (دون تفاعل)",
    positive: "إيجابية (حدث تفاعل)",
    testedAt: "تاريخ الاختبار",
    testedAtInvalid: "أدخل تاريخًا ووقتًا لا يقعان في المستقبل.",
    patchPositiveWarning: "النتيجة الإيجابية تمنع هذه الخدمة عن هذا العميل إلى أن يرفع المالك المنع.",
    patchSaved: "تم تسجيل اختبار الحساسية.",
    patchLogTitle: "سجل اختبارات الحساسية",
    noPatchTests: "لم يُسجَّل أي اختبار حساسية.",
    resultCol: "النتيجة",
    testedCol: "تاريخ الاختبار",
    clearBlock: "رفع المنع",
    clearTitle: "رفع هذا المنع؟",
    clearIntro: "يمكن حجز هذه الخدمة لهذا العميل وخدمته من جديد. يُحفظ سببك في سجل التدقيق.",
    clearReason: "لماذا يُرفع المنع؟",
    clearConfirm: "رفع المنع",
    blockCleared: "تم رفع المنع.",
    cleared: "تم رفع المنع",
    activeBlock: "المنع قائم",
    customerTitle: "النموذج الصحي",
    customerSubtitle: "يطلب مزوّد الخدمة هذه المعلومات ليخدمك بأمان.",
    back: "العودة إلى حجوزاتي",
    noFormTitle: "لا يلزم نموذج لهذا الحجز",
    noFormBody: "لم يطلب مزوّد الخدمة نموذجًا صحيًا لهذه الخدمة.",
    formUnavailable: "نموذج المزوّد غير متاح حاليًا. يُرجى التواصل مع المزوّد.",
    cannotComplete: "لا يمكن تعبئة النموذج إلا لحجز قادم.",
    consentTitle: "قبل أن تشارك معلومات صحية",
    shareHeading: "من يستطيع رؤية إجاباتك",
    shareItems: (provider: string) => [
      `${provider} فقط: المالك والمديرون الذين لديهم صلاحية الحجوزات والمختص المعيّن لهذا الحجز يستطيعون فتح إجاباتك، وذلك لتجهيز خدمتك فقط.`,
      "يُسجَّل كل فتح لإجاباتك، ويمكنك رؤية عدد مرات الفتح أدناه.",
      "مسؤولو بريمورا لا يرون إجاباتك أبدًا. يرون أعدادًا فقط.",
    ],
    keptHeading: "مدة الاحتفاظ بها",
    keptItems: [
      "إلى أن تحذفها أنت، أو تنتهي مدة الاحتفاظ التي تحددها المنصة.",
      "إن سحبت موافقتك تُمسح إجابات حجوزاتك القادمة، ويرى المزوّد أنك سحبت الموافقة.",
    ],
    consentLabel: "أوافق على مشاركة إجاباتي في هذا النموذج مع هذا المزوّد للغرض المذكور أعلاه.",
    consentNeeded: "ضع علامة للموافقة قبل المتابعة.",
    consentGive: "أوافق وأتابع",
    consentGiving: "جارٍ الحفظ…",
    consentRecorded: "تم تسجيل موافقتك.",
    yourAnswers: "إجاباتك",
    submit: "إرسال النموذج",
    submitting: "جارٍ الإرسال…",
    update: "حفظ التغييرات",
    submitted: "تم إرسال نموذجك.",
    submittedHeading: "تم استلام النموذج",
    submittedBody: (date: string, version: number) => `أُرسل ${date} (إصدار النموذج ${version}).`,
    readCount: (n: number) => (n === 0 ? "لم يفتح أحد إجاباتك بعد." : `فُتحت إجاباتك ${n} ${n === 1 ? "مرة" : "مرات"}.`),
    lastRead: "آخر فتح",
    editAnswers: "تغيير إجاباتي",
    deleteAnswers: "حذف إجاباتي",
    deleteTitle: "حذف إجاباتك؟",
    deleteIntro: "تُمسح إجاباتك. سيرى المزوّد أن النموذج ناقص ويمكنك تعبئته من جديد لاحقًا.",
    deleteConfirm: "حذف",
    deleted: "تم حذف إجاباتك.",
    withdraw: "سحب موافقتي",
    withdrawTitle: "سحب موافقتك؟",
    withdrawIntro: "تُمسح إجابات حجوزاتك القادمة. ستحتاج إلى الموافقة من جديد لتعبئة أي نموذج.",
    withdrawConfirm: "سحب الموافقة",
    withdrawn: (n: number) => `تم سحب موافقتك. تم مسح إجابات ${n} من حجوزاتك القادمة.`,
    stateWithdrawn: "سحبت موافقتك فمُسحت هذه الإجابات. أعطِ موافقتك من جديد لتعبئة النموذج.",
    stateDeleted: "حذفت إجاباتك. عبّئ النموذج من جديد إن رغبت.",
    statePurged: "أُزيلت هذه الإجابات بعد انتهاء مدة الاحتفاظ.",
    patchHeading: "اختبار الحساسية",
    patchRule: (days: number | null, hours: number | null) =>
      `تحتاج هذه الخدمة إلى اختبار حساسية${days != null ? ` ساري ${days} يومًا` : ""}${hours != null ? `، يُجرى قبل موعدك بـ ${hours} ساعة على الأقل` : ""}. يسجّل المزوّد النتيجة.`,
    patchNone: "لم يُسجَّل لك اختبار حساسية بعد.",
    patchBlockedNote: "أظهر اختبار الحساسية تفاعلًا، لذا فهذه الخدمة معلّقة. يُرجى التواصل مع المزوّد.",
    required: "إلزامي",
    optional: "اختياري",
    chooseOne: "اختر واحدًا",
    dateFormat: "التاريخ",
    answerRequired: "هذه الإجابة مطلوبة.",
    ackRequired: "يجب أن تقرّ بذلك للمتابعة.",
    tooLong: (n: number) => `اجعلها أقل من ${n} حرفًا.`,
    checkAnswers: "راجع الإجابات المُظلّلة.",
    linkComplete: "تعبئة النموذج الصحي",
    linkView: "النموذج الصحي",
    linkPatch: "اختبار الحساسية",
  },
};

type Reason = { match: RegExp; en: string; ar: (m: RegExpMatchArray) => string };
const reasons: Reason[] = [
  { match: /Authentication required/i, en: "Please sign in again.", ar: () => "يُرجى تسجيل الدخول من جديد." },
  { match: /Booking not found/i, en: "", ar: () => "لم يُعثر على الحجز." },
  { match: /Provider not found/i, en: "", ar: () => "لم يُعثر على النشاط." },
  { match: /Service not found/i, en: "", ar: () => "لم تُعثر على الخدمة." },
  { match: /Template not found/i, en: "", ar: () => "لم يُعثر على النموذج." },
  { match: /Patch test not found/i, en: "", ar: () => "لم يُعثر على اختبار الحساسية." },
  { match: /Only the provider owner can change intake forms and requirements/i, en: "", ar: () => "مالك النشاط وحده يستطيع تغيير النماذج والمتطلبات." },
  { match: /Administrator access required/i, en: "", ar: () => "هذا الإجراء للمسؤولين فقط." },
  { match: /Only the scheduled job can run the intake purge/i, en: "", ar: () => "هذا الإجراء للمهمة المجدولة فقط." },
  { match: /A reason of at least 3 characters is required/i, en: "", ar: () => "اكتب سببًا من 3 أحرف على الأقل." },
  { match: /Explicit consent to share health information is required before answers are saved/i, en: "", ar: () => "يلزم موافقتك الصريحة على مشاركة المعلومات الصحية قبل حفظ الإجابات." },
  { match: /The form can only be completed for an upcoming booking/i, en: "", ar: () => "لا يمكن تعبئة النموذج إلا لحجز قادم." },
  { match: /This service has no form/i, en: "", ar: () => "لا يوجد نموذج لهذه الخدمة." },
  { match: /This form is no longer available/i, en: "", ar: () => "لم يعد هذا النموذج متاحًا." },
  { match: /This form is still used by a service requirement; change the requirement first/i, en: "", ar: () => "ما زالت خدمة تستخدم هذا النموذج. غيّر المتطلب أولًا." },
  { match: /Answers are not available for a cancelled or missed booking/i, en: "", ar: () => "الإجابات غير متاحة لحجز ملغى أو لم يحضره العميل." },
  { match: /Answer required: (\S+)/i, en: "", ar: (m) => `الإجابة مطلوبة: ${m[1]}` },
  { match: /Answer too long or not text: (\S+)/i, en: "", ar: (m) => `الإجابة طويلة جدًا أو ليست نصًا: ${m[1]}` },
  { match: /Answer must be yes or no: (\S+)/i, en: "", ar: (m) => `يجب أن تكون الإجابة نعم أو لا: ${m[1]}` },
  { match: /Acknowledgement required: (\S+)/i, en: "", ar: (m) => `يجب الإقرار بهذا البند: ${m[1]}` },
  { match: /Answer must be a date \(YYYY-MM-DD\): (\S+)/i, en: "", ar: (m) => `يجب أن تكون الإجابة تاريخًا بصيغة YYYY-MM-DD: ${m[1]}` },
  { match: /Answer must be a real date: (\S+)/i, en: "", ar: (m) => `يجب أن يكون تاريخًا حقيقيًا: ${m[1]}` },
  { match: /Answer is not one of the choices: (\S+)/i, en: "", ar: (m) => `الإجابة ليست من الخيارات المتاحة: ${m[1]}` },
  { match: /Answer must be a list of choices: (\S+)/i, en: "", ar: (m) => `يجب أن تكون الإجابة قائمة خيارات: ${m[1]}` },
  { match: /Answer is not a valid set of choices: (\S+)/i, en: "", ar: (m) => `مجموعة الخيارات غير صالحة: ${m[1]}` },
  { match: /The answers must be an object/i, en: "", ar: () => "صيغة الإجابات غير صالحة." },
  { match: /The form has no field named (\S+)/i, en: "", ar: (m) => `لا يحتوي النموذج على سؤال باسم ${m[1]}.` },
  { match: /A form needs between 1 and 60 fields/i, en: "", ar: () => "يحتاج النموذج إلى سؤال واحد على الأقل وبحد أقصى 60 سؤالًا." },
  { match: /Every field must be an object/i, en: "", ar: () => "صيغة الأسئلة غير صالحة." },
  { match: /A field key must be 1 to 40 characters/i, en: "", ar: () => "معرّف السؤال غير صالح." },
  { match: /The field key (\S+) is used twice/i, en: "", ar: (m) => `معرّف السؤال ${m[1]} مكرر.` },
  { match: /Field (\S+): the type is not supported/i, en: "", ar: (m) => `السؤال ${m[1]}: نوع الإجابة غير مدعوم.` },
  { match: /Field (\S+): an English and an Arabic label of 1 to 300 characters are required/i, en: "", ar: (m) => `السؤال ${m[1]}: يلزم نص بالإنجليزية ونص بالعربية (من 1 إلى 300 حرف).` },
  { match: /Field (\S+): required must be true or false/i, en: "", ar: (m) => `السؤال ${m[1]}: قيمة الإلزام غير صالحة.` },
  { match: /Field (\S+): the maximum length must be a whole number from 1 to 2000/i, en: "", ar: (m) => `السؤال ${m[1]}: الحد الأقصى للطول عدد صحيح من 1 إلى 2000.` },
  { match: /Field (\S+): a choice needs between 2 and 30 options/i, en: "", ar: (m) => `السؤال ${m[1]}: يحتاج الاختيار إلى ما بين 2 و30 خيارًا.` },
  { match: /Field (\S+): every option needs a value and an English and an Arabic label/i, en: "", ar: (m) => `السؤال ${m[1]}: لكل خيار قيمة ونص بالإنجليزية ونص بالعربية.` },
  { match: /Field (\S+): an option value is used twice/i, en: "", ar: (m) => `السؤال ${m[1]}: قيمة خيار مكررة.` },
  { match: /An English and an Arabic name of 1 to 120 characters are required/i, en: "", ar: () => "يلزم اسم بالإنجليزية واسم بالعربية (من 1 إلى 120 حرفًا)." },
  { match: /The active flag is required/i, en: "", ar: () => "حالة التفعيل مطلوبة." },
  { match: /The enabled flag is required/i, en: "", ar: () => "حالة التفعيل مطلوبة." },
  { match: /State whether a form and a patch test are required/i, en: "", ar: () => "حدّد هل النموذج واختبار الحساسية مطلوبان." },
  { match: /Choose an active form of this provider/i, en: "", ar: () => "اختر نموذجًا مفعّلًا من نماذج هذا النشاط." },
  { match: /Choose a form of this provider/i, en: "", ar: () => "اختر نموذجًا من نماذج هذا النشاط." },
  { match: /Set how many days a patch test stays valid/i, en: "", ar: () => "حدّد عدد الأيام التي يبقى فيها اختبار الحساسية ساريًا (من 1 إلى 3650)." },
  { match: /The minimum hours before the appointment must be between 0 and 720/i, en: "", ar: () => "الحد الأدنى للساعات قبل الموعد يجب أن يكون بين 0 و720." },
  { match: /This service does not require a patch test/i, en: "", ar: () => "هذه الخدمة لا تتطلب اختبار حساسية." },
  { match: /The result must be negative or positive/i, en: "", ar: () => "يجب أن تكون النتيجة سلبية أو إيجابية." },
  { match: /A walk-in client has no account to record a patch test against/i, en: "", ar: () => "عميل الحضور المباشر ليس له حساب لتسجيل اختبار حساسية عليه." },
  { match: /A patch test is recorded for a confirmed or completed booking/i, en: "", ar: () => "يُسجَّل اختبار الحساسية على حجز مؤكد أو مكتمل." },
  { match: /A patch test cannot be dated in the future/i, en: "", ar: () => "لا يمكن أن يكون تاريخ اختبار الحساسية في المستقبل." },
  { match: /That request key belongs to another request/i, en: "", ar: () => "مفتاح الطلب هذا يخص طلبًا آخر." },
  { match: /Only a positive result carries a block/i, en: "", ar: () => "المنع لا يكون إلا مع النتيجة الإيجابية." },
  { match: /A positive patch test blocks this service for this client until the owner clears it/i, en: "", ar: () => "نتيجة اختبار حساسية إيجابية تمنع هذه الخدمة عن هذا العميل إلى أن يرفع المالك المنع." },
  { match: /This service is blocked for this client after a positive patch test; contact the provider/i, en: "", ar: () => "هذه الخدمة معلّقة لك بعد نتيجة اختبار حساسية إيجابية. تواصل مع المزوّد." },
  { match: /The intake form \((\w+)\) must be completed before the service starts or completes/i, en: "", ar: () => "يجب إكمال نموذج الاستمارة قبل بدء الخدمة أو إكمالها." },
  { match: /A valid patch test \((\w+)\) is required before the service starts or completes/i, en: "", ar: () => "يلزم اختبار حساسية ساري قبل بدء الخدمة أو إكمالها." },
  { match: /permission denied|row-level security/i, en: "You do not have access to this.", ar: () => "ليست لديك صلاحية لهذه العملية." },
];

// The server's reason in the screen's language. Known reasons are translated; an unknown one is shown as written (after an Arabic lead-in).
export function describeIntakeError(error: unknown, locale: OperationsLocale): string {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : String(error);
  for (const reason of reasons) {
    const m = message.match(reason.match);
    if (m) return locale === "ar" ? reason.ar(m) : reason.en || message;
  }
  return locale === "ar" ? `تعذّر تنفيذ الطلب: ${message}` : message;
}

export function personName(first: string | null | undefined, last: string | null | undefined): string {
  return [first, last].filter(Boolean).join(" ");
}

// True when the answer counts as given for a required question.
export function hasAnswer(field: IntakeField, value: AnswerValue): boolean {
  if (field.type === "yes_no") return typeof value === "boolean";
  if (field.type === "acknowledge") return value === true;
  if (field.type === "multi_choice") return Array.isArray(value) && value.length > 0;
  return typeof value === "string" && value.trim() !== "";
}

// The answers the server expects: unanswered optional questions are left out, text is trimmed.
export function cleanAnswers(fields: IntakeField[], draft: Answers): Answers {
  const out: Answers = {};
  for (const f of fields) {
    const v = draft[f.key];
    if (f.type === "yes_no") { if (typeof v === "boolean") out[f.key] = v; continue; }
    if (f.type === "acknowledge") { if (v === true) out[f.key] = true; continue; }
    if (f.type === "multi_choice") { if (Array.isArray(v) && v.length > 0) out[f.key] = v; continue; }
    if (typeof v === "string" && v.trim() !== "") out[f.key] = v.trim();
  }
  return out;
}

// Client-side check that mirrors the database (which stays the authority): which questions still need attention.
export function answerProblems(fields: IntakeField[], draft: Answers, locale: OperationsLocale): Record<string, string> {
  const t = intakeCopy[locale];
  const problems: Record<string, string> = {};
  for (const f of fields) {
    const v = draft[f.key];
    if (f.required && !hasAnswer(f, v)) { problems[f.key] = f.type === "acknowledge" ? t.ackRequired : t.answerRequired; continue; }
    if ((f.type === "short_text" || f.type === "long_text") && typeof v === "string" && v.length > (f.max_length ?? MAX_TEXT_LENGTH)) {
      problems[f.key] = t.tooLong(f.max_length ?? MAX_TEXT_LENGTH);
    }
  }
  return problems;
}
