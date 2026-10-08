import type { OperationsLocale } from "@/components/operations-ui";

// Copy, labels and error wording for the WhatsApp receptionist screens (G60), in both languages.
export const WHATSAPP_PAGE_SIZE = 20;
export const WHATSAPP_REPLY_MAX = 1000;
export const WHATSAPP_TRANSCRIPT_LIMIT = 100;

export type ChannelRow = {
  id: string;
  provider_id: string;
  phone_number_id: string;
  display_number: string | null;
  enabled: boolean;
  ai_enabled: boolean;
  handoff_enabled: boolean;
  verified_at: string | null;
  last_inbound_at: string | null;
};

export type ConversationRow = {
  id: string;
  customer_last4: string;
  status: "bot" | "awaiting_human" | "closed";
  handoff_reason: string | null;
  locale: "ar" | "en";
  last_inbound_at: string | null;
  opted_out_at: string | null;
  updated_at: string;
};

export type TranscriptMessage = {
  id: string;
  direction: "inbound" | "outbound";
  sender: "customer" | "bot" | "provider";
  body: string | null;
  intent: string | null;
  delivery_status: "queued" | "sent" | "failed" | "cancelled" | null;
  message_type: string;
  created_at: string;
};

export type Transcript = {
  conversation: { id: string; status: string; customer_last4: string; locale: string; handoff_reason: string | null; last_inbound_at: string | null; opted_out: boolean };
  can_reply: boolean;
  reply_blocked_reason: string | null;
  messages: TranscriptMessage[];
};

export type AdminOverview = {
  channels: { total: number; enabled: number; receptionist_on: number; verified: number; pending_verification: number };
  conversations: { total: number; bot: number; awaiting_human: number; closed: number; opted_out: number };
  messages_7d: { inbound: number; outbound: number };
  settings: { session_window_hours: number | null; message_retention_days: number | null };
  pending_channels: { id: string; provider_name_en: string; provider_name_ar: string; phone_number_id: string; display_number: string | null; created_at: string }[];
};

export type ConnectionState = "not_configured" | "awaiting_verification" | "off" | "waiting_first_message" | "receiving";

export function connectionState(channel: ChannelRow | null): ConnectionState {
  if (!channel) return "not_configured";
  if (!channel.verified_at) return "awaiting_verification";
  if (!channel.enabled) return "off";
  return channel.last_inbound_at ? "receiving" : "waiting_first_message";
}

export const whatsappCopy = {
  en: {
    title: "WhatsApp receptionist",
    subtitle: "Customers who message your WhatsApp business number get free times and a booking link, day or night. Anything else comes to you here. The receptionist never books or takes payment by itself.",
    loading: "Loading…",
    retry: "Try again",
    noProvider: "No business is linked to this account.",
    ownerOnly: "Only the business owner can change these settings.",
    connectionTitle: "Connection",
    phoneIdLabel: "WhatsApp phone number id",
    phoneIdHelp: "The numeric id shown for your number in Meta WhatsApp Manager (not the phone number itself).",
    phoneIdInvalid: "Enter the numeric phone number id (5 to 25 digits).",
    displayLabel: "Number shown to customers (optional)",
    displayHelp: "For your own reference, for example +966 50 123 4567.",
    displayInvalid: "Use digits, spaces, brackets, dashes and a leading +.",
    enableLabel: "Receive WhatsApp messages",
    enableHelp: "Messages sent to this number are stored here. Nothing is received until the platform has verified the number.",
    aiLabel: "Let the receptionist answer",
    aiHelp: "It understands Arabic and English, checks real availability and replies with up to three times and a booking link.",
    handoffLabel: "Send everything else to my team",
    handoffHelp: "Requests for a person, cancellations, and anything it does not understand wait in the list below. When off, the receptionist keeps answering on its own.",
    aiNeedsEnabled: "Switch on receiving messages first.",
    save: "Save settings",
    saving: "Saving…",
    saved: "Settings saved.",
    status: "Status",
    state: {
      not_configured: "Not connected yet. Enter your phone number id and save.",
      awaiting_verification: "Waiting for the platform to verify that this number is yours. You will receive messages once it does.",
      off: "Verified, but receiving is switched off.",
      waiting_first_message: "Connected. Waiting for the first customer message.",
      receiving: "Connected. Last customer message:",
    },
    windowUnset: "Automatic replies are paused: the platform has not set the reply window yet, so every conversation waits here for a person.",
    windowSet: (hours: number) => `Replies are sent only within ${hours} hours of the customer's last message.`,
    inboxTitle: "Conversations",
    filters: { awaiting_human: "Needs a person", bot: "Handled by the receptionist", closed: "Resolved" },
    filterLabel: "Show",
    inboxEmpty: { awaiting_human: "No conversation is waiting for a person.", bot: "No conversation is being handled by the receptionist.", closed: "No resolved conversations yet." },
    listFailed: "The conversations could not be loaded.",
    customer: "Customer",
    endingIn: (last4: string) => `Customer ending in ${last4}`,
    reason: "Why",
    lastMessage: "Last message",
    open: "Open",
    openLabel: (last4: string) => `Open the conversation with the customer ending in ${last4}`,
    optedOut: "Unsubscribed",
    page: (n: number, total: number) => `Page ${n} of ${total}`,
    prev: "Previous",
    next: "Next",
    transcriptTitle: (last4: string) => `Conversation with customer ending in ${last4}`,
    transcriptLoading: "Opening the conversation…",
    transcriptFailed: "The conversation could not be opened.",
    transcriptNote: "Opening a conversation is recorded in the audit log. Message text is kept only as long as the platform's retention setting allows.",
    bodyGone: "Text no longer stored",
    noMessages: "There are no messages in this conversation.",
    nonText: "(a message that is not text)",
    senders: { customer: "Customer", bot: "Receptionist", provider: "Your team" },
    delivery: { queued: "Waiting to send", sent: "Sent", failed: "Not delivered", cancelled: "Not sent" },
    replyLabel: "Your reply",
    replyHelp: (max: number) => `Sent from your business number. Up to ${max} characters.`,
    replyEmpty: "Write a reply first.",
    replyTooLong: (max: number) => `A reply is at most ${max} characters.`,
    send: "Send reply",
    sending: "Sending…",
    sent: "Your reply was queued and will be sent in a moment.",
    resolve: "Mark as resolved",
    resolving: "Resolving…",
    resolved: "Conversation marked as resolved. It reopens if the customer writes again.",
    close: "Close",
    cannotReply: {
      opted_out: "The customer unsubscribed, so no message can be sent to them.",
      window_closed: "More than the allowed time has passed since the customer's last message, so WhatsApp does not allow a free-form reply any more.",
      window_unset: "The platform has not set the reply window yet, so free-form replies are switched off.",
      channel_disabled: "The channel is switched off or not verified.",
      no_address: "The conversation is resolved, so the customer's number is no longer kept. A new message from them reopens it.",
      not_found: "This conversation no longer exists.",
    } as Record<string, string>,
    reasons: {
      human_requested: "Asked for a person",
      cancel_or_reschedule: "Wants to cancel or change a booking",
      not_understood: "The receptionist did not understand",
      ai_disabled: "Receptionist is switched off",
      window_unset: "Reply window not set by the platform",
      window_closed: "Reply window closed",
      opted_out: "Unsubscribed",
      channel_disabled: "Channel off",
      no_address: "No number kept",
      no_booking_link: "No booking link configured",
      hours_unknown: "Asked about hours; none on record",
      location_unknown: "Asked for the address; none on record",
      provider_not_bookable: "Online booking is not available for the business",
      no_services: "No active services",
      manual_reply: "Your team replied",
      reply_blocked: "A reply could not be sent",
    } as Record<string, string>,
    adminTitle: "WhatsApp receptionist",
    adminSubtitle: "Counts only. No customer number, hash or message text is shown here.",
    adminChannels: "Channels",
    adminConversations: "Conversations",
    adminMessages: "Messages in the last 7 days",
    adminSettings: "Platform settings",
    channelsTotal: "Connected businesses",
    channelsEnabled: "Receiving messages",
    channelsReceptionist: "Receptionist on",
    channelsVerified: "Verified numbers",
    channelsPending: "Waiting for verification",
    convBot: "With the receptionist",
    convHuman: "Waiting for a person",
    convClosed: "Resolved",
    convOptedOut: "Unsubscribed",
    convTotal: "All conversations",
    messagesIn: "From customers",
    messagesOut: "Sent to customers",
    settingWindow: "Reply window (hours)",
    settingRetention: "Message retention (days)",
    unsetValue: "Not set",
    settingsHint: "Both are set by the platform owner in the platform rules. While the window is not set, nothing is sent automatically; while retention is not set, message text is kept.",
    pendingTitle: "Numbers waiting for verification",
    pendingEmpty: "No number is waiting for verification.",
    business: "Business",
    phoneId: "Phone number id",
    requested: "Requested",
    verify: "Verify",
    verifyLabel: (name: string) => `Verify the number of ${name}`,
    verifyTitle: "Verify this WhatsApp number",
    verifyIntro: "Confirm in Meta Business Manager that this phone number id belongs to this business. Customer messages to it will then be delivered to the business.",
    verifyReason: "How you checked",
    verifyConfirm: "Verify number",
    verified: "The number is verified.",
    adminLoadFailed: "The overview could not be loaded.",
  },
  ar: {
    title: "مساعد واتساب للحجز",
    subtitle: "العملاء الذين يراسلون رقم واتساب النشاط يحصلون على المواعيد المتاحة ورابط الحجز في أي وقت، وما عدا ذلك يصلك هنا. المساعد لا يحجز ولا يستلم دفعاً بنفسه.",
    loading: "جارٍ التحميل…",
    retry: "حاول مرة أخرى",
    noProvider: "لا يوجد نشاط مرتبط بهذا الحساب.",
    ownerOnly: "يمكن لمالك النشاط وحده تغيير هذه الإعدادات.",
    connectionTitle: "الربط",
    phoneIdLabel: "معرّف رقم هاتف واتساب",
    phoneIdHelp: "المعرّف الرقمي الظاهر لرقمك في مدير واتساب من ميتا (وليس رقم الهاتف نفسه).",
    phoneIdInvalid: "أدخل معرّف رقم الهاتف الرقمي (من 5 إلى 25 رقماً).",
    displayLabel: "الرقم الظاهر للعملاء (اختياري)",
    displayHelp: "للرجوع إليه فقط، مثل +966 50 123 4567.",
    displayInvalid: "استخدم أرقاماً ومسافات وأقواساً وشرطات وعلامة + في البداية.",
    enableLabel: "استقبال رسائل واتساب",
    enableHelp: "تُحفظ الرسائل المرسلة إلى هذا الرقم هنا. لا يصل شيء قبل أن تتحقق المنصة من الرقم.",
    aiLabel: "السماح للمساعد بالرد",
    aiHelp: "يفهم العربية والإنجليزية، ويتحقق من المواعيد الفعلية ويرد بثلاثة مواعيد على الأكثر مع رابط الحجز.",
    handoffLabel: "تحويل كل ما عدا ذلك إلى فريقي",
    handoffHelp: "طلبات التحدث مع موظف والإلغاء وكل ما لا يفهمه المساعد تنتظر في القائمة أدناه. عند الإيقاف يواصل المساعد الرد وحده.",
    aiNeedsEnabled: "فعّل استقبال الرسائل أولاً.",
    save: "حفظ الإعدادات",
    saving: "جارٍ الحفظ…",
    saved: "تم حفظ الإعدادات.",
    status: "الحالة",
    state: {
      not_configured: "لم يتم الربط بعد. أدخل معرّف رقم الهاتف واحفظ.",
      awaiting_verification: "بانتظار أن تتحقق المنصة من أن هذا الرقم يخصك. ستصلك الرسائل بعد التحقق.",
      off: "تم التحقق، لكن استقبال الرسائل متوقف.",
      waiting_first_message: "تم الربط. بانتظار أول رسالة من عميل.",
      receiving: "تم الربط. آخر رسالة من عميل:",
    },
    windowUnset: "الردود التلقائية متوقفة: لم تحدد المنصة نافذة الرد بعد، لذلك تنتظر كل محادثة هنا موظفاً.",
    windowSet: (hours: number) => `لا تُرسل الردود إلا خلال ${hours} ساعة من آخر رسالة للعميل.`,
    inboxTitle: "المحادثات",
    filters: { awaiting_human: "تحتاج موظفاً", bot: "يتولاها المساعد", closed: "تمت معالجتها" },
    filterLabel: "عرض",
    inboxEmpty: { awaiting_human: "لا توجد محادثة بانتظار موظف.", bot: "لا توجد محادثة يتولاها المساعد.", closed: "لا توجد محادثات تمت معالجتها بعد." },
    listFailed: "تعذّر تحميل المحادثات.",
    customer: "العميل",
    endingIn: (last4: string) => `عميل رقمه ينتهي بـ ${last4}`,
    reason: "السبب",
    lastMessage: "آخر رسالة",
    open: "فتح",
    openLabel: (last4: string) => `فتح المحادثة مع العميل الذي ينتهي رقمه بـ ${last4}`,
    optedOut: "ألغى الاشتراك",
    page: (n: number, total: number) => `الصفحة ${n} من ${total}`,
    prev: "السابق",
    next: "التالي",
    transcriptTitle: (last4: string) => `المحادثة مع العميل الذي ينتهي رقمه بـ ${last4}`,
    transcriptLoading: "جارٍ فتح المحادثة…",
    transcriptFailed: "تعذّر فتح المحادثة.",
    transcriptNote: "يُسجَّل فتح المحادثة في سجل التدقيق. ولا يُحتفظ بنص الرسائل إلا بقدر ما يسمح به إعداد الاحتفاظ في المنصة.",
    bodyGone: "لم يعد النص محفوظاً",
    noMessages: "لا توجد رسائل في هذه المحادثة.",
    nonText: "(رسالة ليست نصاً)",
    senders: { customer: "العميل", bot: "المساعد", provider: "فريقك" },
    delivery: { queued: "بانتظار الإرسال", sent: "أُرسلت", failed: "لم تصل", cancelled: "لم تُرسل" },
    replyLabel: "ردّك",
    replyHelp: (max: number) => `يُرسل من رقم نشاطك. حتى ${max} حرفاً.`,
    replyEmpty: "اكتب رداً أولاً.",
    replyTooLong: (max: number) => `الرد لا يتجاوز ${max} حرفاً.`,
    send: "إرسال الرد",
    sending: "جارٍ الإرسال…",
    sent: "تمت إضافة ردك إلى قائمة الإرسال وسيُرسل بعد لحظات.",
    resolve: "تمت المعالجة",
    resolving: "جارٍ الإغلاق…",
    resolved: "تم إغلاق المحادثة. ستُفتح من جديد إذا كتب العميل مرة أخرى.",
    close: "إغلاق",
    cannotReply: {
      opted_out: "ألغى العميل الاشتراك، لذلك لا يمكن إرسال أي رسالة إليه.",
      window_closed: "مضى على آخر رسالة من العميل أكثر من المدة المسموحة، ولم يعد واتساب يسمح بالرد الحر.",
      window_unset: "لم تحدد المنصة نافذة الرد بعد، لذلك الردود الحرة متوقفة.",
      channel_disabled: "القناة متوقفة أو لم يتم التحقق منها.",
      no_address: "تمت معالجة المحادثة فلم يعد رقم العميل محفوظاً. رسالة جديدة منه تفتحها من جديد.",
      not_found: "هذه المحادثة لم تعد موجودة.",
    } as Record<string, string>,
    reasons: {
      human_requested: "طلب التحدث مع موظف",
      cancel_or_reschedule: "يريد إلغاء حجز أو تغييره",
      not_understood: "لم يفهم المساعد الطلب",
      ai_disabled: "المساعد متوقف",
      window_unset: "لم تحدد المنصة نافذة الرد",
      window_closed: "انتهت نافذة الرد",
      opted_out: "ألغى الاشتراك",
      channel_disabled: "القناة متوقفة",
      no_address: "لا يوجد رقم محفوظ",
      no_booking_link: "لا يوجد رابط حجز مُعدّ",
      hours_unknown: "سأل عن الدوام ولا توجد بيانات",
      location_unknown: "سأل عن العنوان ولا توجد بيانات",
      provider_not_bookable: "الحجز عبر الإنترنت غير متاح للنشاط",
      no_services: "لا توجد خدمات مفعّلة",
      manual_reply: "ردّ فريقك",
      reply_blocked: "تعذّر إرسال رد",
    } as Record<string, string>,
    adminTitle: "مساعد واتساب للحجز",
    adminSubtitle: "أعداد فقط. لا يظهر هنا رقم عميل ولا بصمته ولا نص رسالة.",
    adminChannels: "القنوات",
    adminConversations: "المحادثات",
    adminMessages: "الرسائل خلال آخر 7 أيام",
    adminSettings: "إعدادات المنصة",
    channelsTotal: "الأنشطة المرتبطة",
    channelsEnabled: "تستقبل الرسائل",
    channelsReceptionist: "المساعد مفعّل",
    channelsVerified: "أرقام تم التحقق منها",
    channelsPending: "بانتظار التحقق",
    convBot: "مع المساعد",
    convHuman: "بانتظار موظف",
    convClosed: "تمت معالجتها",
    convOptedOut: "ألغوا الاشتراك",
    convTotal: "كل المحادثات",
    messagesIn: "من العملاء",
    messagesOut: "أُرسلت للعملاء",
    settingWindow: "نافذة الرد (ساعات)",
    settingRetention: "مدة الاحتفاظ بالرسائل (أيام)",
    unsetValue: "غير محددة",
    settingsHint: "يحددهما مالك المنصة في قواعد المنصة. ما دامت النافذة غير محددة لا يُرسل شيء تلقائياً، وما دام الاحتفاظ غير محدد يبقى نص الرسائل محفوظاً.",
    pendingTitle: "أرقام بانتظار التحقق",
    pendingEmpty: "لا يوجد رقم بانتظار التحقق.",
    business: "النشاط",
    phoneId: "معرّف رقم الهاتف",
    requested: "تاريخ الطلب",
    verify: "تحقق",
    verifyLabel: (name: string) => `التحقق من رقم ${name}`,
    verifyTitle: "التحقق من رقم واتساب هذا",
    verifyIntro: "تأكد في مدير أعمال ميتا أن معرّف رقم الهاتف هذا يخص هذا النشاط. بعدها تُسلَّم إليه رسائل العملاء المرسلة إلى الرقم.",
    verifyReason: "كيف تم التحقق",
    verifyConfirm: "تحقق من الرقم",
    verified: "تم التحقق من الرقم.",
    adminLoadFailed: "تعذّر تحميل النظرة العامة.",
  },
};

const reasons: { match: RegExp; en?: string; ar: string }[] = [
  { match: /Provider not found/i, ar: "لم يُعثر على النشاط، أو أنك لست مالكه." },
  { match: /already connected to another business/i, ar: "رقم واتساب هذا مربوط بنشاط آخر." },
  { match: /numeric id/i, ar: "معرّف رقم الهاتف رقمي من 5 إلى 25 رقماً." },
  { match: /display number/i, ar: "الرقم الظاهر يحتوي على أحرف غير مسموحة." },
  { match: /Switch the channel on/i, ar: "فعّل استقبال الرسائل قبل تفعيل المساعد." },
  { match: /Conversation not found/i, ar: "لم يُعثر على المحادثة." },
  { match: /reply cannot be sent: (\w+)/i, ar: "تعذّر إرسال الرد." },
  { match: /between 1 and 1000/i, ar: "الرد بين حرف واحد و1000 حرف." },
  { match: /idempotency key/i, ar: "تعذّر إرسال الرد، أعد المحاولة." },
  { match: /Administrator access required/i, ar: "هذه العملية للمشرفين فقط." },
  { match: /A reason is required/i, ar: "السبب مطلوب (3 أحرف على الأقل)." },
  { match: /Channel not found/i, ar: "لم يُعثر على القناة." },
  { match: /Authentication required/i, ar: "سجّل الدخول أولاً." },
];

export function describeWhatsappError(error: unknown, locale: OperationsLocale): string {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : String(error);
  const blocked = /reply cannot be sent: (\w+)/i.exec(message);
  if (blocked) {
    const known = whatsappCopy[locale].cannotReply[blocked[1]];
    if (known) return known;
  }
  for (const reason of reasons) {
    if (reason.match.test(message)) return locale === "ar" ? reason.ar : reason.en ?? message;
  }
  return locale === "ar" ? `تعذّر تنفيذ الطلب: ${message}` : message;
}
