"use client";

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { identifyUser, trackEvent } from "@/lib/analytics";
import { devRoleHome, isLocalDevAccessEnabled, setDevRole, type DevRole } from "@/lib/dev-access";
import { errorMessage } from "@/lib/error-message";
import { usePageLocale } from "@/lib/use-page-locale";
import { lookupPublishedAgreement, type AgreementLookup } from "@/lib/published-agreement";

type Portal = "customer" | "provider";
type AuthMode = "signin" | "signup";
type AuthMethod = "phone" | "email";

const translations = {
  en: {
    brandTag: "One account for beauty, grooming and marketplace operations.",
    portalReady: "Your portal, ready",
    heroTitle: "Book exceptional care or operate your business from one command center.",
    tiles: [
      ["OTP", "Sign in with an SMS code"],
      ["Email", "Or with a password"],
      ["2 portals", "Customer and provider"],
    ],
    accountAccess: "Account access",
    welcomeBack: "Welcome back",
    createYourAccount: "Create your account",
    signinDesc: "Sign in with the phone number or email linked to your Primora account.",
    signupDesc: "Start as a customer or continue to provider onboarding.",
    notConfiguredTitle: "Service not configured",
    notConfiguredBefore: "This deployment is missing its Supabase keys, so sign in and sign up are disabled. The site owner must add",
    notConfiguredAnd: "and",
    notConfiguredAfter: "in Vercel, then redeploy.",
    devAccess: "Local development access",
    devAccessDesc: "Skip verification on this computer while building.",
    localOnly: "LOCAL ONLY",
    devCustomer: "Customer",
    devProvider: "Provider",
    devAdmin: "Admin",
    tabSignin: "Sign in",
    tabSignup: "Create account",
    methodPhone: "Phone",
    methodEmail: "Email",
    selectPortal: "Select portal",
    portalCustomer: "Customer",
    portalProvider: "Provider",
    phoneLabel: "Saudi mobile number",
    codeLabel: "6-digit verification code",
    emailLabel: "Email address",
    passwordLabel: "Password",
    passwordHint: "At least 8 characters",
    showPassword: "Show password",
    hidePassword: "Hide password",
    changeNumber: "Change number",
    processing: "Processing...",
    connecting: "Connecting...",
    verify: "Verify and continue",
    sendCode: "Send verification code",
    enterPortal: "Enter portal",
    createSecure: "Create account",
    termsBefore: "I agree to the",
    termsLink: "Terms of Service",
    termsMid: "and the",
    privacyLink: "Privacy Notice",
    termsVersion: "Version",
    whatsappConsent: "Receive booking confirmations and appointment reminders via WhatsApp (optional).",
    marketingConsent: "Receive offers and promotions (optional).",
    termsLoading: "Checking the published terms...",
    termsUnpublished: "The customer terms have not been published yet, so new accounts cannot be created and no acceptance can be recorded. Please try again later.",
    termsError: "The published terms could not be loaded, so new accounts cannot be created right now:",
    footnote: "Sign in with a one-time code or with email and password. Consent choices are saved with the version of the terms you accepted.",
    resend: "Resend confirmation email",
    switchLang: "العربية",
    switchLangLabel: "Switch the language to Arabic",
    invalidPhone: "Please enter a valid Saudi mobile number (for example 05XXXXXXXX).",
    otpSent: "Verification code sent to your mobile. Enter the 6-digit code below.",
    otpSendFailed: "Unable to send the verification code.",
    otpInvalidLength: "Please enter the 6-digit verification code.",
    otpInvalid: "The verification code is not valid.",
    verifyFailed: "Verification failed.",
    authFailed: "Authentication failed.",
    createFailed: "Account creation failed.",
    authGeneric: "Unable to authenticate. Please try again.",
    createdDev: "Account created. Email confirmation is still required for real auth, or use Local development access on this page while building.",
    created: "Account created. Check your email to confirm it, then sign in. Your consent choices are not saved until you sign in and accept the terms again.",
    unreachable: "Cannot reach the authentication service. The site is missing its Supabase configuration (see the notice above). Contact the site owner if this persists.",
    confirmDevHint: "Use the Local development access buttons on this page to keep building without email verification.",
    enterEmailFirst: "Enter your account email first.",
    resendOk: "A new confirmation email was sent. Use the newest link.",
    resendFailed: "Unable to resend the confirmation email.",
    consentFailed: "You are signed in, but your consent choices could not be saved:",
    consentRetry: "Retry saving consent",
    consentRetrying: "Saving...",
  },
  ar: {
    brandTag: "حساب واحد للجمال والعناية وإدارة أعمال السوق.",
    portalReady: "بوابتك جاهزة",
    heroTitle: "احجز عناية استثنائية أو أدر عملك من مركز تحكم واحد.",
    tiles: [
      ["رمز", "سجّل الدخول برمز نصي"],
      ["بريد", "أو بكلمة مرور"],
      ["بوابتان", "للعميل ومقدم الخدمة"],
    ],
    accountAccess: "الدخول إلى الحساب",
    welcomeBack: "مرحباً بعودتك",
    createYourAccount: "أنشئ حسابك",
    signinDesc: "سجّل الدخول برقم الجوال أو البريد المرتبط بحسابك في بريمورا.",
    signupDesc: "ابدأ كعميل أو تابع إلى تسجيل مقدم الخدمة.",
    notConfiguredTitle: "الخدمة غير مهيأة",
    notConfiguredBefore: "نسخة النشر هذه تفتقد مفاتيح Supabase، لذلك تسجيل الدخول وإنشاء الحساب معطلان. على مالك الموقع إضافة",
    notConfiguredAnd: "و",
    notConfiguredAfter: "في Vercel ثم إعادة النشر.",
    devAccess: "دخول التطوير المحلي",
    devAccessDesc: "تجاوز التحقق على هذا الجهاز أثناء التطوير.",
    localOnly: "محلي فقط",
    devCustomer: "عميل",
    devProvider: "مقدم خدمة",
    devAdmin: "مسؤول",
    tabSignin: "تسجيل الدخول",
    tabSignup: "حساب جديد",
    methodPhone: "الجوال",
    methodEmail: "البريد",
    selectPortal: "اختر البوابة",
    portalCustomer: "عميل",
    portalProvider: "مقدم خدمة",
    phoneLabel: "رقم الجوال السعودي",
    codeLabel: "رمز التحقق المكون من 6 أرقام",
    emailLabel: "البريد الإلكتروني",
    passwordLabel: "كلمة المرور",
    passwordHint: "8 أحرف على الأقل",
    showPassword: "إظهار كلمة المرور",
    hidePassword: "إخفاء كلمة المرور",
    changeNumber: "تغيير الرقم",
    processing: "جارٍ المعالجة...",
    connecting: "جارٍ الاتصال...",
    verify: "تحقق وتابع",
    sendCode: "إرسال رمز التحقق",
    enterPortal: "دخول البوابة",
    createSecure: "إنشاء الحساب",
    termsBefore: "أوافق على",
    termsLink: "شروط الخدمة",
    termsMid: "و",
    privacyLink: "إشعار الخصوصية",
    termsVersion: "الإصدار",
    whatsappConsent: "استلام تأكيدات الحجز وتذكيرات المواعيد عبر واتساب (اختياري).",
    marketingConsent: "استلام العروض والتخفيضات (اختياري).",
    termsLoading: "جارٍ التحقق من الشروط المنشورة...",
    termsUnpublished: "لم تُنشر شروط العملاء بعد، لذلك لا يمكن إنشاء حسابات جديدة ولا تسجيل الموافقة. يرجى المحاولة لاحقاً.",
    termsError: "تعذر تحميل الشروط المنشورة، لذلك لا يمكن إنشاء حسابات جديدة الآن:",
    footnote: "سجّل الدخول برمز لمرة واحدة أو بالبريد وكلمة المرور. تُحفظ خيارات الموافقة مع إصدار الشروط الذي وافقت عليه.",
    resend: "إعادة إرسال رسالة التأكيد",
    switchLang: "English",
    switchLangLabel: "تغيير اللغة إلى الإنجليزية",
    invalidPhone: "يرجى إدخال رقم جوال سعودي صالح (مثال 05XXXXXXXX).",
    otpSent: "تم إرسال رمز التحقق إلى جوالك. أدخل الرمز المكون من 6 أرقام أدناه.",
    otpSendFailed: "تعذر إرسال رمز التحقق.",
    otpInvalidLength: "يرجى إدخال رمز التحقق المكون من 6 أرقام.",
    otpInvalid: "رمز التحقق غير صالح.",
    verifyFailed: "فشل التحقق.",
    authFailed: "فشلت المصادقة.",
    createFailed: "فشل إنشاء الحساب.",
    authGeneric: "تعذرت المصادقة. يرجى المحاولة مرة أخرى.",
    createdDev: "تم إنشاء الحساب. ما زال تأكيد البريد مطلوباً للدخول الفعلي، أو استخدم دخول التطوير المحلي في هذه الصفحة أثناء التطوير.",
    created: "تم إنشاء الحساب. تحقق من بريدك لتأكيده ثم سجّل الدخول. لا تُحفظ خيارات الموافقة إلا عند تسجيل الدخول والموافقة على الشروط مرة أخرى.",
    unreachable: "تعذر الوصول إلى خدمة المصادقة. الموقع يفتقد إعدادات Supabase (انظر التنبيه أعلاه). تواصل مع مالك الموقع إن استمرت المشكلة.",
    confirmDevHint: "استخدم أزرار دخول التطوير المحلي في هذه الصفحة لمواصلة التطوير دون تأكيد البريد.",
    enterEmailFirst: "أدخل بريد حسابك أولاً.",
    resendOk: "أُرسلت رسالة تأكيد جديدة. استخدم أحدث رابط.",
    resendFailed: "تعذرت إعادة إرسال رسالة التأكيد.",
    consentFailed: "تم تسجيل دخولك، لكن تعذر حفظ خيارات الموافقة:",
    consentRetry: "إعادة محاولة حفظ الموافقة",
    consentRetrying: "جارٍ الحفظ...",
  },
} as const;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl");
  const [locale, setLocale] = usePageLocale();
  const t = translations[locale];
  const isRTL = locale === "ar";
  const [portal, setPortal] = useState<Portal>("customer");
  const [mode, setMode] = useState<AuthMode>("signin");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("phone");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [devAccessEnabled, setDevAccessEnabled] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [termsLookup, setTermsLookup] = useState<AgreementLookup>({ state: "loading" });
  const [consentRetryUserId, setConsentRetryUserId] = useState<string | null>(null);

  useEffect(() => {
    setDevAccessEnabled(isLocalDevAccessEnabled());
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    lookupPublishedAgreement("customer_terms", errorMessage).then((result) => {
      if (active) setTermsLookup(result);
    });
    return () => {
      active = false;
    };
  }, []);

  // A sign-up cannot be completed while no customer terms are published: the acceptance would have no version to point at.
  const termsBlockMessage =
    termsLookup.state === "unpublished"
      ? t.termsUnpublished
      : termsLookup.state === "error"
        ? `${t.termsError} ${termsLookup.message}`
        : "";
  const signupBlocked = mode === "signup" && termsLookup.state !== "ready" && isSupabaseConfigured;

  // Saves the sign-up consent choices through the record_consents command (the table refuses direct writes). The terms are
  // recorded against the version that was published when the person ticked the box; a failure is raised, never swallowed.
  const recordConsents = async (): Promise<void> => {
    if (mode !== "signup" || !termsAccepted) return;
    if (termsLookup.state !== "ready") throw new Error(termsBlockMessage || t.termsLoading);
    const purposes = ["terms_privacy"];
    if (whatsappConsent) purposes.push("whatsapp");
    if (marketingConsent) purposes.push("marketing");
    const { error: consentError } = await supabase.rpc("record_consents", {
      p_purposes: purposes,
      p_status: "granted",
      p_document_version: termsLookup.agreement.version,
      p_method: "web_auth_form",
    });
    if (consentError) throw consentError;
  };

  const finishRouting = async (userId: string) => {
    identifyUser(userId);
    trackEvent("auth_completed", { method: phone && otpSent ? "phone_otp" : "email", user_id: userId });

    if (returnUrl && returnUrl.startsWith("/") && !returnUrl.startsWith("//")) {
      router.replace(returnUrl);
      router.refresh();
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) throw profileError;

    if (profile?.role === "admin") {
      router.replace("/admin");
    } else if (profile?.role === "provider_owner" || profile?.role === "provider_employee") {
      router.replace("/provider/dashboard");
    } else if (portal === "provider") {
      router.replace("/provider/become");
    } else {
      router.replace("/customer/dashboard");
    }
    router.refresh();
  };

  // The consent is saved before the person is routed on. When it fails, the person stays here with the reason and a retry:
  // a "terms accepted" state is never shown for a consent that was not stored.
  const routeAuthenticatedUser = async (userId: string) => {
    try {
      await recordConsents();
    } catch (consentError) {
      setConsentRetryUserId(userId);
      setError(`${t.consentFailed} ${errorMessage(consentError)}`);
      return;
    }
    setConsentRetryUserId(null);
    await finishRouting(userId);
  };

  const retryConsent = async () => {
    if (!consentRetryUserId) return;
    setIsLoading(true);
    setError("");
    try {
      await routeAuthenticatedUser(consentRetryUserId);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const normalizeSaudiPhone = (raw: string): string => {
    const digits = raw.replace(/[^\d+]/g, "");
    if (digits.startsWith("+966")) return digits;
    if (digits.startsWith("00966")) return "+" + digits.slice(2);
    if (digits.startsWith("966")) return "+" + digits;
    if (digits.startsWith("05")) return "+966" + digits.slice(1);
    if (digits.startsWith("5")) return "+966" + digits;
    return "+966" + digits;
  };

  const handleSendPhoneOtp = async () => {
    const formatted = normalizeSaudiPhone(phone);
    if (!formatted.startsWith("+9665") || formatted.length !== 13) {
      setError(t.invalidPhone);
      return;
    }
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: formatted,
        options: {
          channel: "sms",
        },
      });
      if (otpError) throw otpError;
      setOtpSent(true);
      trackEvent("auth_started", { method: "phone_otp", step: "otp_sent" });
      setMessage(t.otpSent);
    } catch (err: unknown) {
      setError(errorMessage(err) || t.otpSendFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = normalizeSaudiPhone(phone);
    if (!otpCode || otpCode.trim().length !== 6) {
      setError(t.otpInvalidLength);
      return;
    }
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        phone: formatted,
        token: otpCode.trim(),
        type: "sms",
      });
      if (verifyError || !data.user) {
        throw verifyError ?? new Error(t.otpInvalid);
      }
      await routeAuthenticatedUser(data.user.id);
    } catch (err: unknown) {
      setError(errorMessage(err) || t.verifyFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setMessage("");

    try {
      if (mode === "signin") {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInError || !data.user) {
          throw signInError ?? new Error(t.authFailed);
        }

        await routeAuthenticatedUser(data.user.id);
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: {
            language_preference: "ar",
            requested_portal: portal,
          },
        },
      });

      if (signUpError || !data.user) {
        throw signUpError ?? new Error(t.createFailed);
      }

      if (!data.session) {
        setMessage(devAccessEnabled ? t.createdDev : t.created);
        setMode("signin");
        return;
      }

      await routeAuthenticatedUser(data.user.id);
    } catch (err: unknown) {
      const authMessage = errorMessage(err) || t.authGeneric;
      const lower = authMessage.toLowerCase();
      const isConfirmationIssue = lower.includes("confirm");
      // A network/fetch failure on the deployed site almost always means the
      // Supabase env vars are missing from the Vercel build.
      const isConnectivityIssue =
        !isSupabaseConfigured || lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("load failed");
      if (isConnectivityIssue) {
        setError(t.unreachable);
      } else {
        setError(isConfirmationIssue && devAccessEnabled
          ? `${authMessage} ${t.confirmDevHint}`
          : authMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError("");
    setMessage("");
  };

  const resendConfirmation = async () => {
    if (!email.trim()) {
      setError(t.enterEmailFirst);
      return;
    }

    setIsLoading(true);
    setError("");
    setMessage("");

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (resendError) throw resendError;
      setMessage(t.resendOk);
    } catch (err: unknown) {
      setError(errorMessage(err) || t.resendFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const enterDevelopmentPortal = (role: DevRole) => {
    if (!setDevRole(role)) return;
    router.replace(devRoleHome[role]);
    router.refresh();
  };

  const portalFieldset = (
    <fieldset>
      <legend className="mb-2.5 text-[9px] font-black uppercase tracking-[0.18em] text-[#98A2B3]">{t.selectPortal}</legend>
      <div className="grid grid-cols-2 gap-3">
        {(["customer", "provider"] as Portal[]).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={portal === item}
            onClick={() => setPortal(item)}
            className={`rounded-xl border px-3 py-3 text-xs font-black transition focus-visible:outline-2 focus-visible:outline-[#D1AF47] ${
              portal === item
                ? "border-[#D1AF47]/50 bg-[#D1AF47]/10 text-[#D1AF47]"
                : "border-white/10 bg-[#0D111B] text-[#98A2B3] hover:border-white/20 hover:text-white"
            }`}
          >
            {item === "customer" ? t.portalCustomer : t.portalProvider}
          </button>
        ))}
      </div>
    </fieldset>
  );

  const consentFields =
    mode === "signup" ? (
      <div className="space-y-3 pt-2 text-xs">
        {termsLookup.state === "loading" && isSupabaseConfigured && (
          <p role="status" className="text-[#98A2B3]">{t.termsLoading}</p>
        )}
        {termsBlockMessage && (
          <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 font-semibold leading-5 text-amber-100">
            {termsBlockMessage}
          </div>
        )}
        <label className="flex cursor-pointer items-start gap-2.5 text-[#B8C0D4]">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-0.5 rounded border-white/20 bg-[#0D111B] text-[#D1AF47] focus-visible:outline-2 focus-visible:outline-[#D1AF47]"
            required
          />
          <span>
            {t.termsBefore}{" "}
            <Link href="/terms" target="_blank" className="text-[#D1AF47] underline underline-offset-2">{t.termsLink}</Link>{" "}
            {t.termsMid}{" "}
            <Link href="/privacy" target="_blank" className="text-[#D1AF47] underline underline-offset-2">{t.privacyLink}</Link>
            {termsLookup.state === "ready" ? ` (${t.termsVersion} ${termsLookup.agreement.version})` : ""}
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5 text-[#B8C0D4]">
          <input
            type="checkbox"
            checked={whatsappConsent}
            onChange={(e) => setWhatsappConsent(e.target.checked)}
            className="mt-0.5 rounded border-white/20 bg-[#0D111B] text-[#D1AF47] focus-visible:outline-2 focus-visible:outline-[#D1AF47]"
          />
          <span>{t.whatsappConsent}</span>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5 text-[#B8C0D4]">
          <input
            type="checkbox"
            checked={marketingConsent}
            onChange={(e) => setMarketingConsent(e.target.checked)}
            className="mt-0.5 rounded border-white/20 bg-[#0D111B] text-[#D1AF47] focus-visible:outline-2 focus-visible:outline-[#D1AF47]"
          />
          <span>{t.marketingConsent}</span>
        </label>
      </div>
    ) : null;

  return (
    <main dir={isRTL ? "rtl" : "ltr"} lang={locale} className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0D111B] px-4 py-10 text-white">
      <div className="absolute left-[-10%] top-[-20%] h-[420px] w-[420px] rounded-full bg-[#D1AF47]/10 blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] h-[480px] w-[480px] rounded-full bg-[#7B3F50]/10 blur-[140px]" />

      <section className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/10 bg-[#151B28] shadow-[0_32px_90px_rgba(0,0,0,0.42)] lg:grid-cols-[1.08fr_0.92fr]">
        <div className="relative hidden min-h-[620px] overflow-hidden bg-[#101828] p-12 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(209,175,71,0.22),transparent_34%),radial-gradient(circle_at_80%_80%,rgba(209,175,71,0.08),transparent_38%)]" />
          <div className="relative">
            <Link href="/" className="text-xl font-black tracking-[0.28em] text-[#D1AF47]">
              PRIMORA
            </Link>
            <p className="mt-3 max-w-sm text-xs font-semibold leading-6 text-[#B8C0D4]">{t.brandTag}</p>
          </div>

          <div className="relative space-y-6">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#D1AF47]">{t.portalReady}</p>
            <h1 className="max-w-md font-serif text-4xl font-black leading-tight">{t.heroTitle}</h1>
            <div className="grid grid-cols-3 gap-3">
              {t.tiles.map(([value, label]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <span className="block font-serif text-lg font-black text-[#D1AF47]">{value}</span>
                  <span className="mt-1 block text-[9px] font-bold uppercase tracking-wider text-[#B8C0D4]">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-10 lg:p-12">
          <div className="mb-8 flex items-center justify-between gap-3">
            <Link href="/" className="text-lg font-black tracking-[0.25em] text-[#D1AF47] lg:invisible">PRIMORA</Link>
            <button
              type="button"
              onClick={() => setLocale(isRTL ? "en" : "ar")}
              aria-label={t.switchLangLabel}
              className="rounded-xl border border-white/10 bg-[#0D111B] px-3.5 py-2 text-xs font-black text-[#D1AF47] transition hover:border-[#D1AF47]/50 focus-visible:outline-2 focus-visible:outline-[#D1AF47]"
            >
              {t.switchLang}
            </button>
          </div>

          <div className="mb-8">
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D1AF47]">{t.accountAccess}</span>
            <h2 className="mt-3 font-serif text-3xl font-black">{mode === "signin" ? t.welcomeBack : t.createYourAccount}</h2>
            <p className="mt-2 text-xs font-medium leading-5 text-[#98A2B3]">{mode === "signin" ? t.signinDesc : t.signupDesc}</p>
          </div>

          {!isSupabaseConfigured && (
            <div role="alert" className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
              <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-amber-300">{t.notConfiguredTitle}</span>
              <p className="mt-1.5 text-[11px] font-semibold leading-5 text-amber-100/90">
                {t.notConfiguredBefore}{" "}
                <code dir="ltr" className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_URL</code> {t.notConfiguredAnd}{" "}
                <code dir="ltr" className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> {t.notConfiguredAfter}
              </p>
            </div>
          )}

          {devAccessEnabled && (
            <div className="mb-6 rounded-2xl border border-[#D1AF47]/30 bg-[#D1AF47]/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-[#D1AF47]">{t.devAccess}</span>
                  <p className="mt-1 text-[10px] font-semibold leading-5 text-[#B8C0D4]">{t.devAccessDesc}</p>
                </div>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[8px] font-black text-emerald-300">
                  {t.localOnly}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  [t.devCustomer, "customer"],
                  [t.devProvider, "provider_owner"],
                  [t.devAdmin, "admin"],
                ].map(([label, role]) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => enterDevelopmentPortal(role as DevRole)}
                    className="rounded-xl border border-white/10 bg-[#0D111B] px-2 py-2.5 text-[9px] font-black text-white transition hover:border-[#D1AF47]/50 hover:text-[#D1AF47] focus-visible:outline-2 focus-visible:outline-[#D1AF47]"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 rounded-xl border border-white/10 bg-[#0D111B] p-1">
            {(["signin", "signup"] as AuthMode[]).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={mode === item}
                onClick={() => changeMode(item)}
                className={`rounded-lg py-2.5 text-xs font-black transition focus-visible:outline-2 focus-visible:outline-[#D1AF47] ${
                  mode === item ? "bg-[#222A3A] text-[#D1AF47] shadow" : "text-[#98A2B3] hover:text-white"
                }`}
              >
                {item === "signin" ? t.tabSignin : t.tabSignup}
              </button>
            ))}
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-xl border border-white/10 bg-[#101828] p-1 text-xs">
            {(["phone", "email"] as AuthMethod[]).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={authMethod === item}
                onClick={() => { setAuthMethod(item); setError(""); setMessage(""); }}
                className={`rounded-lg py-2 font-black transition focus-visible:outline-2 focus-visible:outline-[#D1AF47] ${
                  authMethod === item ? "border border-[#D1AF47]/40 bg-[#D1AF47]/20 text-[#D1AF47]" : "text-[#98A2B3] hover:text-white"
                }`}
              >
                {item === "phone" ? t.methodPhone : t.methodEmail}
              </button>
            ))}
          </div>

          {error && (
            <div role="alert" className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-3.5 text-xs font-semibold leading-5 text-red-300">
              <p>{error}</p>
              {consentRetryUserId && (
                <button
                  type="button"
                  onClick={retryConsent}
                  disabled={isLoading}
                  className="mt-2.5 rounded-lg border border-red-300/40 px-3 py-1.5 font-black text-red-100 transition hover:bg-red-400/10 focus-visible:outline-2 focus-visible:outline-red-200 disabled:opacity-50"
                >
                  {isLoading ? t.consentRetrying : t.consentRetry}
                </button>
              )}
            </div>
          )}
          {message && (
            <div role="status" className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3.5 text-xs font-semibold leading-5 text-emerald-300">
              {message}
            </div>
          )}

          {authMethod === "phone" ? (
            <form onSubmit={otpSent ? handleVerifyPhoneOtp : (e) => { e.preventDefault(); handleSendPhoneOtp(); }} className="space-y-5">
              {portalFieldset}

              <label className="block">
                <span className="mb-2 block text-[9px] font-black uppercase tracking-[0.18em] text-[#98A2B3]">{t.phoneLabel}</span>
                <div dir="ltr" className="flex overflow-hidden rounded-xl border border-white/10 bg-[#0D111B] focus-within:border-[#D1AF47]/70">
                  <span className="flex items-center border-r border-white/10 bg-white/5 px-3.5 text-xs font-bold text-[#D1AF47]">
                    +966
                  </span>
                  <input
                    type="tel"
                    autoComplete="tel"
                    placeholder="5XXXXXXXX"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    disabled={otpSent}
                    className="w-full bg-transparent px-4 py-3.5 text-sm outline-none transition placeholder:text-[#667085] disabled:opacity-60"
                    required
                  />
                </div>
              </label>

              {otpSent && (
                <label className="block">
                  <span className="mb-2 block text-[9px] font-black uppercase tracking-[0.18em] text-[#98A2B3]">{t.codeLabel}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value)}
                    dir="ltr"
                    className="w-full rounded-xl border border-white/10 bg-[#0D111B] px-4 py-3.5 text-center font-mono text-sm tracking-widest outline-none transition placeholder:text-[#667085] focus:border-[#D1AF47]/70"
                    required
                  />
                </label>
              )}

              {consentFields}

              <div className="flex gap-2">
                {otpSent && (
                  <button
                    type="button"
                    onClick={() => { setOtpSent(false); setOtpCode(""); }}
                    className="rounded-xl border border-white/10 bg-[#0D111B] px-4 py-3.5 text-xs font-bold text-[#B8C0D4] hover:text-white focus-visible:outline-2 focus-visible:outline-[#D1AF47]"
                  >
                    {t.changeNumber}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isLoading || signupBlocked}
                  className="flex-1 rounded-xl bg-[#D1AF47] py-3.5 text-xs font-black uppercase tracking-[0.12em] text-[#101828] shadow-lg shadow-[#D1AF47]/10 transition hover:bg-[#E0C46A] focus-visible:outline-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? t.processing : otpSent ? t.verify : t.sendCode}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {portalFieldset}

              <label className="block">
                <span className="mb-2 block text-[9px] font-black uppercase tracking-[0.18em] text-[#98A2B3]">{t.emailLabel}</span>
                <input
                  type="email"
                  autoComplete="email"
                  dir="ltr"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#0D111B] px-4 py-3.5 text-sm outline-none transition placeholder:text-[#667085] focus:border-[#D1AF47]/70"
                  required
                />
              </label>

              <div className="block">
                <label htmlFor="login-password" className="mb-2 block text-[9px] font-black uppercase tracking-[0.18em] text-[#98A2B3]">{t.passwordLabel}</label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    minLength={8}
                    dir="ltr"
                    placeholder={t.passwordHint}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#0D111B] py-3.5 ps-4 pe-12 text-sm outline-none transition placeholder:text-[#667085] focus:border-[#D1AF47]/70"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? t.hidePassword : t.showPassword}
                    aria-pressed={showPassword}
                    className="absolute end-3.5 top-1/2 flex -translate-y-1/2 cursor-pointer items-center justify-center p-1 text-[#98A2B3] transition hover:text-white focus-visible:outline-2 focus-visible:outline-[#D1AF47]"
                  >
                    {showPassword ? (
                      <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {consentFields}

              <button
                type="submit"
                disabled={isLoading || signupBlocked}
                className="w-full rounded-xl bg-[#D1AF47] py-3.5 text-xs font-black uppercase tracking-[0.12em] text-[#101828] shadow-lg shadow-[#D1AF47]/10 transition hover:bg-[#E0C46A] focus-visible:outline-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? t.connecting : mode === "signin" ? t.enterPortal : t.createSecure}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-[10px] font-semibold leading-5 text-[#667085]">{t.footnote}</p>
          <button
            type="button"
            onClick={resendConfirmation}
            disabled={isLoading}
            className="mt-2 w-full text-center text-[10px] font-black text-[#D1AF47] transition hover:text-[#E0C46A] focus-visible:outline-2 focus-visible:outline-[#D1AF47] disabled:opacity-50"
          >
            {t.resend}
          </button>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#0D111B] text-stone-400">&hellip;</div>}>
      <LoginForm />
    </Suspense>
  );
}
