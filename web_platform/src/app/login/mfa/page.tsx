"use client";

import { Suspense, useCallback, useEffect, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { useOperationsLocale } from "@/components/operations-ui";

// Authenticator-app (TOTP) enrolment and sign-in challenge for console accounts (GOV-1 / Q6). The database refuses every
// administrator session below aal2, so the console sends an administrator here until this session has verified a code.

type Phase = "loading" | "signed-out" | "locked" | "enrol" | "challenge" | "done" | "error";
type Enrolment = { factorId: string; qr: string; secret: string };

const copy = {
  en: {
    title: "Two-step verification",
    enrolTitle: "Set up your authenticator app",
    enrolIntro: "Every console account protects sign-in with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password and similar). Scan the code, then enter the 6 digits the app shows.",
    secretLabel: "Can't scan? Enter this key in the app",
    challengeTitle: "Enter your authenticator code",
    challengeIntro: "Open your authenticator app and enter the 6-digit code for PRIMORA.",
    codeLabel: "6-digit code",
    verify: "Verify",
    working: "Checking…",
    badCode: "Enter the 6 digits shown in your authenticator app.",
    lockWarning: "After 10 wrong codes the account locks and another owner must reset it.",
    signedOut: "Sign in first, then come back to this page.",
    signIn: "Go to sign in",
    locked: "This account is locked after 10 incorrect codes. Ask another owner of the console to reset your two-step verification, then sign in again.",
    signOut: "Sign out",
    done: "Verified. Opening the console…",
    loadFailed: "Two-step verification could not be loaded: {reason}",
    retry: "Try again",
    qrAlt: "QR code for your authenticator app",
  },
  ar: {
    title: "التحقق بخطوتين",
    enrolTitle: "إعداد تطبيق المصادقة",
    enrolIntro: "يحمي كل حساب في لوحة الإدارة تسجيل الدخول بتطبيق مصادقة (Google Authenticator أو Microsoft Authenticator أو 1Password وغيرها). امسح الرمز ثم أدخل الأرقام الستة التي يعرضها التطبيق.",
    secretLabel: "لا يمكنك المسح؟ أدخل هذا المفتاح في التطبيق",
    challengeTitle: "أدخل رمز تطبيق المصادقة",
    challengeIntro: "افتح تطبيق المصادقة وأدخل الرمز المكوّن من 6 أرقام لحساب PRIMORA.",
    codeLabel: "الرمز المكوّن من 6 أرقام",
    verify: "تحقق",
    working: "جارٍ التحقق…",
    badCode: "أدخل الأرقام الستة الظاهرة في تطبيق المصادقة.",
    lockWarning: "بعد 10 رموز خاطئة يُقفل الحساب ويجب أن يعيد مالك آخر ضبطه.",
    signedOut: "سجّل الدخول أولاً ثم عد إلى هذه الصفحة.",
    signIn: "الانتقال إلى تسجيل الدخول",
    locked: "تم قفل هذا الحساب بعد 10 رموز خاطئة. اطلب من مالك آخر في لوحة الإدارة إعادة ضبط التحقق بخطوتين ثم سجّل الدخول من جديد.",
    signOut: "تسجيل الخروج",
    done: "تم التحقق. جارٍ فتح لوحة الإدارة…",
    loadFailed: "تعذّر تحميل التحقق بخطوتين: {reason}",
    retry: "إعادة المحاولة",
    qrAlt: "رمز QR لتطبيق المصادقة",
  },
};

// Only paths inside this site are followed after verification.
const safeNext = (value: string | null) => (value && value.startsWith("/") && !value.startsWith("//") ? value : "/admin");

export default function MfaPage() {
  return (
    <Suspense fallback={null}>
      <MfaScreen />
    </Suspense>
  );
}

function MfaScreen() {
  const locale = useOperationsLocale();
  const t = copy[locale];
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [phase, setPhase] = useState<Phase>("loading");
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const codeId = useId();

  const finish = useCallback(() => {
    setPhase("done");
    router.replace(next);
  }, [next, router]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          if (!cancelled) setPhase("signed-out");
          return;
        }
        const { data: state } = await supabase.rpc("admin_session_state");
        if ((state as { locked?: boolean } | null)?.locked) {
          if (!cancelled) setPhase("locked");
          return;
        }
        const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aalError) throw aalError;
        if (aal?.currentLevel === "aal2") {
          if (!cancelled) finish();
          return;
        }
        const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
        if (listError) throw listError;
        const verified = factors?.totp?.[0];
        if (verified) {
          if (!cancelled) {
            setFactorId(verified.id);
            setPhase("challenge");
          }
          return;
        }
        // A factor left unverified by an abandoned enrolment is replaced, so the QR code always matches the app.
        for (const factor of factors?.all ?? []) {
          if (factor.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
        const { data: enrolled, error: enrolError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `PRIMORA console ${new Date().toISOString().slice(0, 16)} ${crypto.randomUUID().slice(0, 6)}` });
        if (enrolError) throw enrolError;
        const qr = enrolled.totp.qr_code.startsWith("data:") ? enrolled.totp.qr_code : `data:image/svg+xml;utf-8,${encodeURIComponent(enrolled.totp.qr_code)}`;
        if (!cancelled) {
          setEnrolment({ factorId: enrolled.id, qr, secret: enrolled.totp.secret });
          setFactorId(enrolled.id);
          setPhase("enrol");
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(errorMessage(error));
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, finish]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const digits = code.replace(/\s+/g, "");
    if (!/^[0-9]{6}$/.test(digits)) {
      setFailure(t.badCode);
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: digits });
      if (error) throw error;
      finish();
    } catch (error) {
      setFailure(errorMessage(error));
      setCode("");
      const { data: state } = await supabase.rpc("admin_session_state");
      if ((state as { locked?: boolean } | null)?.locked) setPhase("locked");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/login");
  };

  const card = "w-full max-w-md rounded-[28px] border border-[#D1AF47]/40 bg-white p-6 shadow-[0_24px_60px_rgba(16,24,40,0.08)]";

  return (
    <main dir={locale === "ar" ? "rtl" : "ltr"} className="grid min-h-screen place-items-center bg-[#F7F6F3] px-4 py-10 text-start">
      <div className={card}>
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#9B7928]">PRIMORA</p>
        <h1 className="mt-1 font-serif text-2xl font-black text-[#101828]">{phase === "enrol" ? t.enrolTitle : phase === "challenge" ? t.challengeTitle : t.title}</h1>

        {phase === "loading" && <p role="status" className="mt-4 text-sm text-[#667085]">{t.working}</p>}
        {phase === "done" && <p role="status" className="mt-4 text-sm font-semibold text-green-800">{t.done}</p>}
        {phase === "signed-out" && (
          <div className="mt-4 space-y-3 text-sm text-[#475467]">
            <p>{t.signedOut}</p>
            <a href={`/login?returnUrl=${encodeURIComponent(`/login/mfa?next=${next}`)}`} className="inline-block rounded-xl bg-[#101828] px-4 py-2.5 text-sm font-black text-white focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.signIn}</a>
          </div>
        )}
        {phase === "locked" && (
          <div className="mt-4 space-y-3">
            <p role="alert" className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2.5 text-sm font-semibold text-[#B42318]">{t.locked}</p>
            <button type="button" onClick={() => void signOut()} className="rounded-xl border border-[#D0D5DD] px-4 py-2.5 text-sm font-bold text-[#344054] focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.signOut}</button>
          </div>
        )}
        {phase === "error" && (
          <div className="mt-4 space-y-3">
            <p role="alert" className="text-sm font-semibold text-[#B42318]">{t.loadFailed.replace("{reason}", loadError)}</p>
            <button type="button" onClick={() => { setPhase("loading"); setAttempt((n) => n + 1); }} className="rounded-xl border border-[#D0D5DD] px-4 py-2.5 text-sm font-bold text-[#344054] focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.retry}</button>
          </div>
        )}

        {(phase === "enrol" || phase === "challenge") && (
          <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-4">
            <p className="text-sm leading-6 text-[#475467]">{phase === "enrol" ? t.enrolIntro : t.challengeIntro}</p>
            {phase === "enrol" && enrolment && (
              <div className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- the QR code is an inline SVG data URL from Supabase Auth */}
                <img src={enrolment.qr} alt={t.qrAlt} width={192} height={192} className="mx-auto h-48 w-48 rounded-xl border border-[#ECECEC] bg-white p-2" />
                <div>
                  <p className="text-xs font-black text-[#344054]">{t.secretLabel}</p>
                  <code dir="ltr" className="mt-1 block break-all rounded-lg bg-[#F2F4F7] px-3 py-2 font-mono text-sm text-[#101828]">{enrolment.secret}</code>
                </div>
              </div>
            )}
            <div>
              <label htmlFor={codeId} className="block text-xs font-black text-[#344054]">{t.codeLabel}</label>
              <input id={codeId} autoFocus dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(event) => setCode(event.target.value)} disabled={busy}
                className="mt-1.5 w-full rounded-xl border border-[#D0D5DD] bg-white px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-[#101828] focus-visible:outline-2 focus-visible:outline-[#9B7928]" />
              <p className="mt-1 text-xs text-[#667085]">{t.lockWarning}</p>
            </div>
            {failure && <p role="alert" className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2 text-sm font-semibold text-[#B42318]">{failure}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={() => void signOut()} className="text-sm font-bold text-[#667085] underline focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.signOut}</button>
              <button type="submit" disabled={busy} className="rounded-xl bg-[#101828] px-5 py-2.5 text-sm font-black text-white focus-visible:outline-2 focus-visible:outline-[#9B7928] disabled:opacity-60">{busy ? t.working : t.verify}</button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
