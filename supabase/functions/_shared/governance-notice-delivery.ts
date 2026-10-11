// Pure logic of the governance notice sender (SECFIX-2 R2-H4). No network, no database, no Deno globals: the Edge Function
// deliver-governance-notices passes the environment and does the I/O; supabase/tests/governance-notice-delivery.test.mjs runs
// this module under Node.
//
// The sender is configured only by environment variables. Nothing here holds a credential, and a channel without a complete
// configuration is "not configured": its notices are marked 'undeliverable: no sender configured' by the database and are
// never reported as sent. Which provider PRIMORA uses is an owner decision (gap governance-notice-sender-not-chosen); the
// adapters below are the two the variables select:
//   email  GOVERNANCE_EMAIL_PROVIDER=resend  GOVERNANCE_EMAIL_API_KEY  GOVERNANCE_EMAIL_FROM   (Resend POST /emails)
//   sms    GOVERNANCE_SMS_PROVIDER=twilio   GOVERNANCE_SMS_ACCOUNT_SID GOVERNANCE_SMS_AUTH_TOKEN GOVERNANCE_SMS_FROM
//          (Twilio Programmable Messaging POST /2010-04-01/Accounts/{sid}/Messages.json)

export type Channel = "email" | "sms";
export type EmailSender = { provider: "resend"; apiKey: string; from: string };
export type SmsSender = { provider: "twilio"; accountSid: string; authToken: string; from: string };
export type SenderConfig = { email: EmailSender | null; sms: SmsSender | null; problems: string[] };
export type Notice = { id: string; channel: Channel; destination: string; template_key: string; payload: Record<string, unknown>; attempts: number };
export type Message = { subject: string; text: string };
export type Outcome = { outcome: "sent"; providerMessageId: string } | { outcome: "retry" | "failed"; error: string };

const clean = (value: string | undefined | null) => (typeof value === "string" ? value.trim() : "");
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const E164 = /^\+[1-9]\d{7,14}$/;

// Reads the sender configuration. A partly configured channel is not configured, and says what is missing (names only).
export function senderConfig(env: (name: string) => string | undefined): SenderConfig {
  const problems: string[] = [];
  let email: EmailSender | null = null;
  let sms: SmsSender | null = null;

  const emailProvider = clean(env("GOVERNANCE_EMAIL_PROVIDER")).toLowerCase();
  if (emailProvider) {
    const apiKey = clean(env("GOVERNANCE_EMAIL_API_KEY"));
    const from = clean(env("GOVERNANCE_EMAIL_FROM"));
    if (emailProvider !== "resend") problems.push(`GOVERNANCE_EMAIL_PROVIDER '${emailProvider}' is not supported (resend)`);
    else if (!apiKey) problems.push("GOVERNANCE_EMAIL_API_KEY is not set");
    else if (!from || !(EMAIL.test(from) || /<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>$/.test(from))) problems.push("GOVERNANCE_EMAIL_FROM is not an email address");
    else email = { provider: "resend", apiKey, from };
  }

  const smsProvider = clean(env("GOVERNANCE_SMS_PROVIDER")).toLowerCase();
  if (smsProvider) {
    const accountSid = clean(env("GOVERNANCE_SMS_ACCOUNT_SID"));
    const authToken = clean(env("GOVERNANCE_SMS_AUTH_TOKEN"));
    const from = clean(env("GOVERNANCE_SMS_FROM"));
    if (smsProvider !== "twilio") problems.push(`GOVERNANCE_SMS_PROVIDER '${smsProvider}' is not supported (twilio)`);
    else if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid)) problems.push("GOVERNANCE_SMS_ACCOUNT_SID is not a Twilio account SID");
    else if (!authToken) problems.push("GOVERNANCE_SMS_AUTH_TOKEN is not set");
    else if (!E164.test(from) && !/^MG[0-9a-fA-F]{32}$/.test(from)) problems.push("GOVERNANCE_SMS_FROM is not an E.164 number or a messaging service SID");
    else sms = { provider: "twilio", accountSid, authToken, from };
  }
  return { email, sms, problems };
}

export function configuredChannels(config: SenderConfig): Channel[] {
  return [...(config.email ? (["email"] as Channel[]) : []), ...(config.sms ? (["sms"] as Channel[]) : [])];
}

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const sar = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "";
};
const riyadh = (value: unknown) => {
  const d = new Date(text(value));
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(d) + " (Riyadh)";
};
const ROLE_EN: Record<string, string> = { owner: "Owner", finance: "Finance", operations: "Operations", analyst: "Analyst" };
const ROLE_AR: Record<string, string> = { owner: "مالك", finance: "المالية", operations: "العمليات", analyst: "محلل" };
const roleEn = (v: unknown) => ROLE_EN[text(v)] ?? (text(v) || "no console role");
const roleAr = (v: unknown) => ROLE_AR[text(v)] ?? (text(v) || "بلا دور");

// Arabic first, then English, in one message: the recipient's language is not stored with the notice. Only the values the
// payload already carries for this purpose are used (a masked IBAN, never a full one); unknown keys are ignored.
export function renderNotice(templateKey: string, payload: Record<string, unknown>): Message {
  const p = payload ?? {};
  const support = "PRIMORA";
  let ar: string;
  let en: string;
  let subject: string;
  switch (templateKey) {
    case "payout_account_change_requested":
      subject = "PRIMORA: a change to your payout bank account was requested";
      ar = `طُلب تغيير حساب التحويل البنكي لنشاطك إلى ${text(p.bank_name)} ${text(p.iban_masked)}. إذا لم تطلب ذلك فتواصل مع ${support} فوراً.`;
      en = `A change of your business's payout bank account to ${text(p.bank_name)} ${text(p.iban_masked)} was requested. If you did not ask for this, contact ${support} at once.`;
      break;
    case "payout_account_change_approved":
      subject = "PRIMORA: your new payout bank account was approved";
      ar = `اعتُمد حساب التحويل الجديد ${text(p.iban_masked)}. لن تُحوَّل إليه أي مبالغ قبل ${riyadh(p.hold_until)}. إذا لم تطلب ذلك فتواصل مع ${support} فوراً.`;
      en = `The new payout account ${text(p.iban_masked)} was approved. Nothing is paid to it before ${riyadh(p.hold_until)}. If you did not ask for this, contact ${support} at once.`;
      break;
    case "payout_account_change_rejected":
      subject = "PRIMORA: a payout bank account change was rejected";
      ar = `رُفض طلب تغيير حساب التحويل إلى ${text(p.iban_masked)}. يبقى حسابك السابق كما هو.`;
      en = `The request to change your payout account to ${text(p.iban_masked)} was rejected. Your previous account is unchanged.`;
      break;
    case "break_glass_used":
      subject = "PRIMORA: an owner used break-glass";
      ar = `استخدم أحد الملاك إجراء الطوارئ لطلب من نوع ${text(p.kind)} بمبلغ ${sar(p.amount)} ريال. تجب مراجعته خلال 7 أيام في لوحة الإدارة.`;
      en = `An owner used break-glass on a ${text(p.kind)} request of SAR ${sar(p.amount)}. It must be reviewed within 7 days in the console.`;
      break;
    case "health_break_glass_used":
      subject = "PRIMORA: health answers were opened under break-glass";
      ar = "فتح أحد الملاك إجابات استبيان صحي عبر إجراء الطوارئ. السجل متاح في لوحة الإدارة.";
      en = "An owner opened health-intake answers under break-glass. The record is in the console.";
      break;
    case "console_role_change_requested":
      subject = "PRIMORA: a console role change was requested for you";
      ar = `طُلب تغيير دورك في لوحة الإدارة من ${roleAr(p.role_before)} إلى ${roleAr(p.role_after)}. ينتظر موافقة مالك آخر.`;
      en = `A change of your console role from ${roleEn(p.role_before)} to ${roleEn(p.role_after)} was requested. It waits for another owner.`;
      break;
    case "console_role_changed":
      subject = "PRIMORA: your console role changed";
      ar = `تغيّر دورك في لوحة الإدارة من ${roleAr(p.role_before)} إلى ${roleAr(p.role_after)}.`;
      en = `Your console role changed from ${roleEn(p.role_before)} to ${roleEn(p.role_after)}.`;
      break;
    case "mfa_factor_added":
      subject = "PRIMORA: a sign-in verification method was added";
      ar = "أُضيفت طريقة تحقق جديدة لتسجيل الدخول إلى حسابك الإداري. إذا لم تقم بذلك فتواصل مع مالك آخر فوراً.";
      en = "A new sign-in verification method was added to your console account. If this was not you, contact another owner at once.";
      break;
    case "mfa_locked":
      subject = "PRIMORA: your console account was locked";
      ar = `قُفل حسابك الإداري بعد ${text(p.failed_count)} محاولات تحقق فاشلة. يعيد مالك آخر ضبطه.`;
      en = `Your console account was locked after ${text(p.failed_count)} failed verification attempts. Another owner resets it.`;
      break;
    case "mfa_reset":
      subject = "PRIMORA: your sign-in verification was reset";
      ar = "أُعيد ضبط طرق التحقق لحسابك الإداري وأُنهيت جلساتك. سجّل دخولك وفعّل طريقة تحقق جديدة.";
      en = "Your console sign-in verification was reset and your sessions were ended. Sign in and set up a new method.";
      break;
    case "reconciliation_break_escalated":
      subject = "PRIMORA: a Tap reconciliation break was escalated";
      ar = `بقي فرق تسوية مع Tap مفتوحاً أكثر من 3 أيام عمل (يوم ${text(p.business_day)}، الفرق ${sar(p.difference)} ريال).`;
      en = `A Tap reconciliation break has been open for more than 3 business days (day ${text(p.business_day)}, difference SAR ${sar(p.difference)}).`;
      break;
    default:
      subject = "PRIMORA: a security event on your account";
      ar = `حدث أمني على حسابك (${templateKey}). التفاصيل في PRIMORA.`;
      en = `A security event on your account (${templateKey}). The details are in PRIMORA.`;
  }
  return { subject, text: `${ar}\n\n${en}` };
}

// The HTTP request for a notice. The destination is the verified address snapshotted when the notice was queued.
export function buildRequest(notice: Notice, config: SenderConfig, message: Message): { url: string; init: { method: string; headers: Record<string, string>; body: string } } {
  if (notice.channel === "email") {
    if (!config.email) throw new Error("email sender not configured");
    if (!EMAIL.test(notice.destination)) throw new Error("the destination is not an email address");
    return {
      url: "https://api.resend.com/emails",
      init: {
        method: "POST",
        headers: { Authorization: `Bearer ${config.email.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `governance-notice-${notice.id}` },
        body: JSON.stringify({ from: config.email.from, to: [notice.destination], subject: message.subject, text: message.text }),
      },
    };
  }
  if (!config.sms) throw new Error("sms sender not configured");
  if (!E164.test(notice.destination)) throw new Error("the destination is not an E.164 phone number");
  const form = new URLSearchParams({ To: notice.destination, Body: message.text });
  form.set(config.sms.from.startsWith("MG") ? "MessagingServiceSid" : "From", config.sms.from);
  const basic = btoa(`${config.sms.accountSid}:${config.sms.authToken}`);
  return {
    url: `https://api.twilio.com/2010-04-01/Accounts/${config.sms.accountSid}/Messages.json`,
    init: { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() },
  };
}

// What the provider's answer means. Sent only when the provider accepted the message and named it; anything that cannot be
// confirmed is retried, and a refusal of the destination itself fails the notice for good.
export function classifyResponse(channel: Channel, status: number, body: unknown): Outcome {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const message = text(b.message || b.error || b.name || "").slice(0, 300);
  if (status >= 200 && status < 300) {
    const id = channel === "email" ? text(b.id) : text(b.sid);
    const smsFailed = channel === "sms" && ["failed", "undelivered"].includes(text(b.status).toLowerCase());
    if (smsFailed) return { outcome: "retry", error: `Twilio reported ${text(b.status)} ${text(b.error_message)}`.trim() };
    if (!id) return { outcome: "retry", error: "The provider answered without a message id; delivery is not confirmed" };
    return { outcome: "sent", providerMessageId: id };
  }
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) {
    return { outcome: "retry", error: `Provider unavailable (${status}) ${message}`.trim() };
  }
  if (status === 401 || status === 403) {
    return { outcome: "retry", error: `The provider refused the sender credentials (${status}); check the environment configuration` };
  }
  return { outcome: "failed", error: `The provider refused the message (${status}) ${message}`.trim() };
}

// The retry delay the database applies after a failed attempt (governance_notice_record_result), in minutes.
export function backoffMinutes(attempts: number): number {
  return Math.min(2 ** Math.max(0, Math.floor(attempts)), 360);
}
