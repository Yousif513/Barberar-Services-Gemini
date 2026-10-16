// Supabase Auth (GoTrue) answers in English whatever the page language. These are the answers a person meets on the sign-in
// code, step-up and privacy code screens, said in the page language with what to do next. An answer not listed here is
// reported as a generic failure in the page language instead of GoTrue's English text.

export type AuthLocale = "en" | "ar";

const copy = {
  en: {
    wrongTotp: "That code is not correct. Enter the code your authenticator app shows now; it changes every 30 seconds.",
    attemptsLeft: "{n} more wrong codes lock the account until another owner resets it.",
    lastAttempt: "One more wrong code locks the account until another owner resets it.",
    challengeExpired: "The check took too long. Enter the code your app shows now.",
    locked: "This account is locked after 10 incorrect codes. Ask another owner of the console to reset your two-step verification.",
    otpInvalid: "That code is wrong or has expired. Send a new code and enter it within a few minutes.",
    rateLimited: "Too many attempts in a short time. Wait a minute, then try again.",
    network: "The server could not be reached. Check your connection and try again.",
    generic: "The code could not be checked. Try again in a moment.",
  },
  ar: {
    wrongTotp: "الرمز غير صحيح. أدخل الرمز الظاهر الآن في تطبيق المصادقة؛ يتغير كل {s} ثانية.",
    attemptsLeft: "بعد {n} رموز خاطئة أخرى يُقفل الحساب حتى يعيد مالك آخر ضبطه.",
    lastAttempt: "رمز خاطئ واحد آخر يقفل الحساب حتى يعيد مالك آخر ضبطه.",
    challengeExpired: "استغرق التحقق وقتاً طويلاً. أدخل الرمز الظاهر الآن في التطبيق.",
    locked: "تم قفل هذا الحساب بعد {n} رموز خاطئة. اطلب من مالك آخر في لوحة الإدارة إعادة ضبط التحقق بخطوتين.",
    otpInvalid: "الرمز غير صحيح أو انتهت صلاحيته. اطلب رمزاً جديداً وأدخله خلال دقائق.",
    rateLimited: "محاولات كثيرة في وقت قصير. انتظر دقيقة ثم حاول مجدداً.",
    network: "تعذّر الوصول إلى الخادم. تحقق من الاتصال وحاول مجدداً.",
    generic: "تعذّر التحقق من الرمز. حاول مجدداً بعد قليل.",
  },
};

const arabicDigits = (value: number) => new Intl.NumberFormat("ar-SA").format(value);

function fields(error: unknown) {
  const e = (error ?? {}) as { code?: unknown; status?: unknown; message?: unknown; name?: unknown };
  return {
    code: typeof e.code === "string" ? e.code : "",
    status: typeof e.status === "number" ? e.status : 0,
    message: typeof e.message === "string" ? e.message : "",
    name: typeof e.name === "string" ? e.name : "",
  };
}

// An authenticator (TOTP) verification that failed. attemptsLeft comes from admin_session_state after the failure.
export function totpErrorMessage(error: unknown, locale: AuthLocale, attemptsLeft: number | null = null): string {
  const t = copy[locale];
  const { code, status, message, name } = fields(error);
  if (/locked/i.test(message) || attemptsLeft === 0) return locale === "ar" ? t.locked.replace("{n}", arabicDigits(10)) : t.locked;
  if (code === "mfa_verification_failed" || /invalid totp code/i.test(message) || status === 422) {
    const base = locale === "ar" ? t.wrongTotp.replace("{s}", arabicDigits(30)) : t.wrongTotp;
    if (attemptsLeft === null || attemptsLeft > 5) return base;
    const left = attemptsLeft === 1 ? t.lastAttempt : t.attemptsLeft.replace("{n}", locale === "ar" ? arabicDigits(attemptsLeft) : String(attemptsLeft));
    return `${base} ${left}`;
  }
  if (code === "mfa_challenge_expired") return t.challengeExpired;
  if (code.startsWith("over_") || status === 429) return t.rateLimited;
  if (name === "AuthRetryableFetchError" || /failed to fetch|network/i.test(message)) return t.network;
  return t.generic;
}

// A one-time code sent by e-mail or SMS that failed (verifyOtp), or sending it failed (signInWithOtp).
export function otpErrorMessage(error: unknown, locale: AuthLocale): string {
  const t = copy[locale];
  const { code, status, message, name } = fields(error);
  if (code === "otp_expired" || /expired or is invalid/i.test(message) || status === 403) return t.otpInvalid;
  if (code.startsWith("over_") || status === 429) return t.rateLimited;
  if (name === "AuthRetryableFetchError" || /failed to fetch|network/i.test(message)) return t.network;
  return t.generic;
}
