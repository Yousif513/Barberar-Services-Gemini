"use client";

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { devRoleHome, isLocalDevAccessEnabled, setDevRole, type DevRole } from "@/lib/dev-access";

type Portal = "customer" | "provider";
type AuthMode = "signin" | "signup";
type AuthMethod = "phone" | "email";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl");
  const [portal, setPortal] = useState<Portal>("customer");
  const [mode, setMode] = useState<AuthMode>("signin");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("phone");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(true);
  const [whatsappConsent, setWhatsappConsent] = useState(true);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [devAccessEnabled, setDevAccessEnabled] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setDevAccessEnabled(isLocalDevAccessEnabled());
  }, []);

  const recordConsents = async (userId: string) => {
    if (!termsAccepted) return;
    try {
      const records = [
        {
          user_id: userId,
          purpose: "terms_privacy",
          status: "granted",
          document_version: "v1.0",
          method: "web_auth_form",
        },
      ];
      if (whatsappConsent) {
        records.push({
          user_id: userId,
          purpose: "whatsapp",
          status: "granted",
          document_version: "v1.0",
          method: "web_auth_form",
        });
      }
      if (marketingConsent) {
        records.push({
          user_id: userId,
          purpose: "marketing",
          status: "granted",
          document_version: "v1.0",
          method: "web_auth_form",
        });
      }
      await supabase.from("consents").insert(records);
    } catch (e) {
      console.warn("Consent registration notice:", e);
    }
  };

  const routeAuthenticatedUser = async (userId: string) => {
    await recordConsents(userId);

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
      setError("Please enter a valid Saudi mobile number (e.g. 05XXXXXXXX). / يرجى إدخال رقم جوال سعودي صالح");
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
      setMessage("Verification code sent to your mobile. Enter the 6-digit code below. / تم إرسال رمز التحقق إلى جوالك");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to send verification code.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = normalizeSaudiPhone(phone);
    if (!otpCode || otpCode.trim().length !== 6) {
      setError("Please enter the 6-digit verification code. / يرجى إدخال الرمز المكون من 6 أرقام");
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
        throw verifyError ?? new Error("Invalid verification code.");
      }
      await routeAuthenticatedUser(data.user.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed.");
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
          throw signInError ?? new Error("Authentication failed.");
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
        throw signUpError ?? new Error("Account creation failed.");
      }

      if (!data.session) {
        setMessage(devAccessEnabled
          ? "Account created. Email confirmation is still required for real auth, or use Local development access on this page while building."
          : "Account created. Check your email to confirm it, then sign in.");
        setMode("signin");
        return;
      }

      await routeAuthenticatedUser(data.user.id);
    } catch (err: unknown) {
      const authMessage = err instanceof Error ? err.message : "Unable to authenticate. Please try again.";
      const lower = authMessage.toLowerCase();
      const isConfirmationIssue = lower.includes("confirm");
      // A network/fetch failure on the deployed site almost always means the
      // Supabase env vars are missing from the Vercel build.
      const isConnectivityIssue =
        !isSupabaseConfigured || lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("load failed");
      if (isConnectivityIssue) {
        setError("Cannot reach the authentication service. The site is missing its Supabase configuration — see the notice above. (Contact the site owner if this persists.)");
      } else {
        setError(isConfirmationIssue && devAccessEnabled
          ? `${authMessage} Use the Local development access buttons on this page to keep building without email verification.`
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
      setError("Enter your Barberar account email first.");
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
      setMessage("A new Barberar confirmation email was sent. Use the newest link.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to resend confirmation email.");
    } finally {
      setIsLoading(false);
    }
  };

  const enterDevelopmentPortal = (role: DevRole) => {
    if (!setDevRole(role)) return;
    router.replace(devRoleHome[role]);
    router.refresh();
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0D111B] px-4 py-10 text-white">
      <div className="absolute left-[-10%] top-[-20%] h-[420px] w-[420px] rounded-full bg-[#D1AF47]/10 blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] h-[480px] w-[480px] rounded-full bg-[#7B3F50]/10 blur-[140px]" />

      <section className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/10 bg-[#151B28] shadow-[0_32px_90px_rgba(0,0,0,0.42)] lg:grid-cols-[1.08fr_0.92fr]">
        <div className="relative hidden min-h-[620px] overflow-hidden bg-[#101828] p-12 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(209,175,71,0.22),transparent_34%),radial-gradient(circle_at_80%_80%,rgba(209,175,71,0.08),transparent_38%)]" />
          <div className="relative">
            <Link href="/" className="text-xl font-black tracking-[0.28em] text-[#D1AF47]">
              PRIMORA
            </Link>
            <p className="mt-3 max-w-sm text-xs font-semibold leading-6 text-[#B8C0D4]">
              One secure account for premium beauty, grooming, and marketplace operations.
            </p>
          </div>

          <div className="relative space-y-6">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#D1AF47]">Your portal, ready</p>
            <h1 className="max-w-md font-serif text-4xl font-black leading-tight">
              Book exceptional care or operate your business from one command center.
            </h1>
            <div className="grid grid-cols-3 gap-3">
              {[
                ["24/7", "Booking access"],
                ["Secure", "Account data"],
                ["Live", "Operations"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <span className="block font-serif text-lg font-black text-[#D1AF47]">{value}</span>
                  <span className="mt-1 block text-[9px] font-bold uppercase tracking-wider text-[#B8C0D4]">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-10 lg:p-12">
          <div className="mb-8 lg:hidden">
            <Link href="/" className="text-lg font-black tracking-[0.25em] text-[#D1AF47]">PRIMORA</Link>
          </div>

          <div className="mb-8">
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D1AF47]">
              Secure account access
            </span>
            <h2 className="mt-3 font-serif text-3xl font-black">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="mt-2 text-xs font-medium leading-5 text-[#98A2B3]">
              {mode === "signin"
                ? "Sign in with the email linked to your Primora account."
                : "Start as a customer or continue to provider onboarding."}
            </p>
          </div>

          {!isSupabaseConfigured && (
            <div role="alert" className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
              <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-amber-300">
                Service not configured
              </span>
              <p className="mt-1.5 text-[11px] font-semibold leading-5 text-amber-100/90">
                This deployment is missing its Supabase keys, so sign in and sign up are disabled.
                The site owner must add <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in Vercel, then redeploy.
              </p>
            </div>
          )}

          {devAccessEnabled && (
            <div className="mb-6 rounded-2xl border border-[#D1AF47]/30 bg-[#D1AF47]/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-[#D1AF47]">
                    Local development access
                  </span>
                  <p className="mt-1 text-[10px] font-semibold leading-5 text-[#B8C0D4]">
                    Skip verification on this computer while building.
                  </p>
                </div>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[8px] font-black text-emerald-300">
                  LOCAL ONLY
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  ["Customer", "customer"],
                  ["Provider", "provider_owner"],
                  ["Admin", "admin"],
                ].map(([label, role]) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => enterDevelopmentPortal(role as DevRole)}
                    className="rounded-xl border border-white/10 bg-[#0D111B] px-2 py-2.5 text-[9px] font-black text-white transition hover:border-[#D1AF47]/50 hover:text-[#D1AF47]"
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
                onClick={() => changeMode(item)}
                className={`rounded-lg py-2.5 text-xs font-black transition ${
                  mode === item ? "bg-[#222A3A] text-[#D1AF47] shadow" : "text-[#98A2B3] hover:text-white"
                }`}
              >
                {item === "signin" ? "Sign In / تسجيل الدخول" : "Create Account / حساب جديد"}
              </button>
            ))}
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-xl border border-white/10 bg-[#101828] p-1 text-xs">
            <button
              type="button"
              onClick={() => { setAuthMethod("phone"); setError(""); setMessage(""); }}
              className={`rounded-lg py-2 font-black transition ${
                authMethod === "phone" ? "bg-[#D1AF47]/20 text-[#D1AF47] border border-[#D1AF47]/40" : "text-[#98A2B3] hover:text-white"
              }`}
            >
              Phone / الجوال
            </button>
            <button
              type="button"
              onClick={() => { setAuthMethod("email"); setError(""); setMessage(""); }}
              className={`rounded-lg py-2 font-black transition ${
                authMethod === "email" ? "bg-[#D1AF47]/20 text-[#D1AF47] border border-[#D1AF47]/40" : "text-[#98A2B3] hover:text-white"
              }`}
            >
              Email / البريد
            </button>
          </div>

          {error && (
            <div role="alert" className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-3.5 text-xs font-semibold leading-5 text-red-300">
              {error}
            </div>
          )}
          {message && (
            <div role="status" className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3.5 text-xs font-semibold leading-5 text-emerald-300">
              {message}
            </div>
          )}

          {authMethod === "phone" ? (
            <form onSubmit={otpSent ? handleVerifyPhoneOtp : (e) => { e.preventDefault(); handleSendPhoneOtp(); }} className="space-y-5">
              <fieldset>
                <legend className="mb-2.5 text-[9px] font-black uppercase tracking-[0.18em] text-[#98A2B3]">
                  Select portal
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  {(["customer", "provider"] as Portal[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPortal(item)}
                      className={`rounded-xl border px-3 py-3 text-xs font-black transition ${
                        portal === item
                          ? "border-[#D1AF47]/50 bg-[#D1AF47]/10 text-[#D1AF47]"
                          : "border-white/10 bg-[#0D111B] text-[#98A2B3] hover:border-white/20 hover:text-white"
                      }`}
                    >
                      {item === "customer" ? "Customer" : "Provider"}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="block">
                <span className="mb-2 block text-[9px] font-black uppercase tracking-[0.18em] text-[#98A2B3]">
                  Saudi Mobile Number / رقم الجوال
                </span>
                <div className="flex rounded-xl border border-white/10 bg-[#0D111B] overflow-hidden focus-within:border-[#D1AF47]/70">
                  <span className="flex items-center px-3.5 bg-white/5 text-xs font-bold text-[#D1AF47] border-r border-white/10">
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
                  <span className="mb-2 block text-[9px] font-black uppercase tracking-[0.18em] text-[#98A2B3]">
                    6-Digit Verification Code / رمز التحقق
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#0D111B] px-4 py-3.5 text-sm tracking-widest text-center font-mono outline-none transition placeholder:text-[#667085] focus:border-[#D1AF47]/70"
                    required
                  />
                </label>
              )}

              {mode === "signup" && (
                <div className="space-y-3 pt-2 text-xs">
                  <label className="flex items-start gap-2.5 cursor-pointer text-[#B8C0D4]">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-0.5 rounded border-white/20 bg-[#0D111B] text-[#D1AF47] focus:ring-0"
                      required
                    />
                    <span>
                      I agree to the <Link href="/terms" className="text-[#D1AF47] underline underline-offset-2">Terms of Service</Link> and <Link href="/privacy" className="text-[#D1AF47] underline underline-offset-2">Privacy Notice</Link> (Saudi PDPL).
                    </span>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer text-[#B8C0D4]">
                    <input
                      type="checkbox"
                      checked={whatsappConsent}
                      onChange={(e) => setWhatsappConsent(e.target.checked)}
                      className="mt-0.5 rounded border-white/20 bg-[#0D111B] text-[#D1AF47] focus:ring-0"
                    />
                    <span>Receive booking confirmations and appointment reminders via WhatsApp.</span>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer text-[#B8C0D4]">
                    <input
                      type="checkbox"
                      checked={marketingConsent}
                      onChange={(e) => setMarketingConsent(e.target.checked)}
                      className="mt-0.5 rounded border-white/20 bg-[#0D111B] text-[#D1AF47] focus:ring-0"
                    />
                    <span>Receive exclusive beauty offers and promotional discounts (optional).</span>
                  </label>
                </div>
              )}

              <div className="flex gap-2">
                {otpSent && (
                  <button
                    type="button"
                    onClick={() => { setOtpSent(false); setOtpCode(""); }}
                    className="rounded-xl border border-white/10 bg-[#0D111B] px-4 py-3.5 text-xs font-bold text-[#B8C0D4] hover:text-white"
                  >
                    Change Number
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 rounded-xl bg-[#D1AF47] py-3.5 text-xs font-black uppercase tracking-[0.12em] text-[#101828] shadow-lg shadow-[#D1AF47]/10 transition hover:bg-[#E0C46A] disabled:cursor-wait disabled:opacity-60"
                >
                  {isLoading ? "Processing..." : otpSent ? "Verify & Continue" : "Send Verification Code"}
                </button>
              </div>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <fieldset>
              <legend className="mb-2.5 text-[9px] font-black uppercase tracking-[0.18em] text-[#98A2B3]">
                Select portal
              </legend>
              <div className="grid grid-cols-2 gap-3">
                {(["customer", "provider"] as Portal[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPortal(item)}
                    className={`rounded-xl border px-3 py-3 text-xs font-black transition ${
                      portal === item
                        ? "border-[#D1AF47]/50 bg-[#D1AF47]/10 text-[#D1AF47]"
                        : "border-white/10 bg-[#0D111B] text-[#98A2B3] hover:border-white/20 hover:text-white"
                    }`}
                  >
                    {item === "customer" ? "Customer" : "Provider"}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="block">
              <span className="mb-2 block text-[9px] font-black uppercase tracking-[0.18em] text-[#98A2B3]">Email address</span>
              <input
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0D111B] px-4 py-3.5 text-sm outline-none transition placeholder:text-[#667085] focus:border-[#D1AF47]/70"
                required
              />
            </label>

            <div className="block">
              <span className="mb-2 block text-[9px] font-black uppercase tracking-[0.18em] text-[#98A2B3]">Password</span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  minLength={8}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#0D111B] pl-4 pr-12 py-3.5 text-sm outline-none transition placeholder:text-[#667085] focus:border-[#D1AF47]/70"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#98A2B3] hover:text-white transition cursor-pointer flex items-center justify-center p-1"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-[#D1AF47] py-3.5 text-xs font-black uppercase tracking-[0.12em] text-[#101828] shadow-lg shadow-[#D1AF47]/10 transition hover:bg-[#E0C46A] disabled:cursor-wait disabled:opacity-60"
            >
              {isLoading ? "Connecting..." : mode === "signin" ? "Enter Portal" : "Create Secure Account"}
            </button>
          </form>

          )}

          <p className="mt-6 text-center text-[10px] font-semibold leading-5 text-[#667085]">
            Secure OTP and email authentication backed by Supabase Auth and Saudi PDPL consent recording.
          </p>
          <button
            type="button"
            onClick={resendConfirmation}
            disabled={isLoading}
            className="mt-2 w-full text-center text-[10px] font-black text-[#D1AF47] transition hover:text-[#E0C46A] disabled:opacity-50"
          >
            Resend Barberar confirmation email
          </button>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0D111B] flex items-center justify-center text-stone-400">Loading portal...</div>}>
      <LoginForm />
    </Suspense>
  );
}
