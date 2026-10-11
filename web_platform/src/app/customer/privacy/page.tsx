"use client";

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { errorHint } from "@/lib/step-up";
import { useOperationsLocale } from "@/components/operations-ui";

// The customer's privacy requests (PRIV; Q1 and Q2 of docs/legal/2026-10-10-privacy-decision-memo.md): access, a copy, a
// correction, a deletion or a consent withdrawal. Free of charge, answered within 30 days. The server asks for a sign-in by
// one-time code to the account's verified e-mail or phone in the last 10 minutes before it accepts or confirms a request; this
// screen sends that code and repeats the request. The copy downloads through an authenticated link for 7 days.

type Request = {
  id: string; request_type: string; channel: string; status: string; received_at: string; deadline_at: string; extended_due_at: string | null;
  extension_reason: string | null; refusal_code: string | null; decision_reason: string | null; completed_at: string | null;
  review_choice: string | null; correction_field: string | null; completion_summary: Record<string, unknown> | null;
  complaint_right: { en: string; ar: string }; export: { status: string; expires_at: string | null; downloads: number } | null;
};
type Pending = { run: () => Promise<void> } | null;

const copy = {
  en: {
    title: "Privacy & my data", subtitle: "Ask for access to your data, a copy of it, a correction or its deletion, or withdraw a consent. Every request is free of charge and answered within 30 days.",
    newRequest: "Make a request", type: "What do you need?", details: "Anything we should know (optional)", submit: "Send the request", sending: "Sending…",
    types: { access: "See my data", copy: "A copy of my data (JSON and PDF)", correction: "Correct a detail", deletion: "Delete my account and data", consent_withdrawal: "Withdraw a consent" } as Record<string, string>,
    typeNames: { access: "Access", copy: "Copy", correction: "Correction", deletion: "Deletion", consent_withdrawal: "Consent withdrawal" } as Record<string, string>,
    field: "Detail", newValue: "Correct value", fields: { first_name: "First name", last_name: "Last name", gender: "Gender" } as Record<string, string>,
    genders: { male: "Male", female: "Female" } as Record<string, string>,
    correctionNote: "While we check it, this detail is held out of use and nobody can change it.",
    reviews: "Your reviews", reviewChoices: { delete_text: "Delete my reviews", deleted_user: "Keep them, shown as \"Deleted user\"" } as Record<string, string>,
    deletionPreview: "What happens: your account, profile, contact details, consents, favourites, device tokens and all your messages are deleted and your health-intake answers destroyed. {p} bookings with a tax invoice or payment are kept for 10 years without your name (Commercial Books Law Art. 8, VAT rules); {d} other bookings are deleted. A record that is part of an open payment dispute is kept until 30 days after it closes.",
    balance: "You still have {w} SAR wallet credit and {s} unused package sessions; they cannot be used after deletion.",
    purposes: "Consents to withdraw", purposeNames: { whatsapp: "WhatsApp reminders", marketing: "Offers and promotions", photos_portfolio: "Photos in portfolios", health_data: "Health information for treatments", health_data_reuse: "Reusing my health answers for later bookings" } as Record<string, string>,
    verifyTitle: "Confirm it is you", verifyBody: "We send a one-time code to {dest}. Enter it here; the request is then sent.", sendCode: "Send the code", code: "6-digit code", verify: "Confirm",
    noContact: "Your account has no verified e-mail or phone. Contact PRIMORA support to verify one first.", codeSent: "Code sent.",
    mine: "My requests", none: "You have not made any privacy request.", loadFailed: "Your requests could not be loaded: {reason}", retry: "Try again",
    statuses: { awaiting_verification: "Waiting for you to confirm", open: "Received", awaiting_approval: "Being checked", executing: "Being carried out", completed: "Completed", refused: "Refused", withdrawn: "Withdrawn" } as Record<string, string>,
    received: "Received", deadline: "Answer by", extended: "Extended once: {reason}", refused: "Reason: {reason}", confirm: "Confirm this request", withdraw: "Withdraw",
    download: "Download {file}", expires: "Available until {date}", expired: "The download expired after 7 days. Make a new copy request if you need it again.",
    chooseReviews: "Choose what happens to your reviews before confirming:", saveChoice: "Save choice", done: "Done.", printed: "A printed copy is available on request.",
    reuseTitle: "Health answers for later bookings", reuseOn: "You allow us to reuse your latest health-intake answers for your next bookings until {date}.", reuseOff: "Your health-intake answers are used only for the booking they were given for and destroyed 30 days after it.",
    reuseGrant: "Allow reuse for 12 months", reuseWithdraw: "Stop reuse",
  },
  ar: {
    title: "الخصوصية وبياناتي", subtitle: "اطلب الاطلاع على بياناتك أو نسخة منها أو تصحيحها أو حذفها، أو اسحب موافقة. كل طلب مجاني ونرد عليه خلال 30 يوماً.",
    newRequest: "تقديم طلب", type: "ما الذي تحتاجه؟", details: "أي معلومة تفيدنا (اختياري)", submit: "إرسال الطلب", sending: "جارٍ الإرسال…",
    types: { access: "الاطلاع على بياناتي", copy: "نسخة من بياناتي (JSON وPDF)", correction: "تصحيح بيان", deletion: "حذف حسابي وبياناتي", consent_withdrawal: "سحب موافقة" } as Record<string, string>,
    typeNames: { access: "اطلاع", copy: "نسخة", correction: "تصحيح", deletion: "حذف", consent_withdrawal: "سحب موافقة" } as Record<string, string>,
    field: "البيان", newValue: "القيمة الصحيحة", fields: { first_name: "الاسم الأول", last_name: "اسم العائلة", gender: "الجنس" } as Record<string, string>,
    genders: { male: "ذكر", female: "أنثى" } as Record<string, string>,
    correctionNote: "أثناء التحقق يُوقف استخدام هذا البيان ولا يمكن لأحد تغييره.",
    reviews: "تقييماتك", reviewChoices: { delete_text: "حذف تقييماتي", deleted_user: "إبقاؤها باسم «مستخدم محذوف»" } as Record<string, string>,
    deletionPreview: "ما الذي سيحدث: يُحذف حسابك وملفك الشخصي وبيانات التواصل والموافقات والمفضلة ورموز الأجهزة وكل رسائلك، وتُتلف إجابات الاستبيان الصحي. تُحفظ {p} حجوزات مرتبطة بفاتورة ضريبية أو دفعة لمدة 10 سنوات دون اسمك (المادة 8 من نظام الدفاتر التجارية وأحكام ضريبة القيمة المضافة)، وتُحذف {d} حجوزات أخرى. السجل المرتبط بنزاع دفع مفتوح يُحفظ حتى 30 يوماً بعد إغلاقه.",
    balance: "لديك {w} ريال رصيد في المحفظة و{s} جلسات باقات غير مستخدمة؛ لا يمكن استخدامها بعد الحذف.",
    purposes: "الموافقات المطلوب سحبها", purposeNames: { whatsapp: "تذكيرات واتساب", marketing: "العروض والترويج", photos_portfolio: "الصور في المعارض", health_data: "المعلومات الصحية للعلاجات", health_data_reuse: "إعادة استخدام إجاباتي الصحية لحجوزات لاحقة" } as Record<string, string>,
    verifyTitle: "تأكيد هويتك", verifyBody: "نرسل رمزاً لمرة واحدة إلى {dest}. أدخله هنا ثم يُرسل الطلب.", sendCode: "إرسال الرمز", code: "رمز من 6 أرقام", verify: "تأكيد",
    noContact: "لا يوجد في حسابك بريد أو هاتف موثق. تواصل مع دعم بريمورا لتوثيق أحدهما أولاً.", codeSent: "أُرسل الرمز.",
    mine: "طلباتي", none: "لم تقدم أي طلب خصوصية.", loadFailed: "تعذّر تحميل طلباتك: {reason}", retry: "إعادة المحاولة",
    statuses: { awaiting_verification: "بانتظار تأكيدك", open: "مستلم", awaiting_approval: "قيد المراجعة", executing: "قيد التنفيذ", completed: "مكتمل", refused: "مرفوض", withdrawn: "مسحوب" } as Record<string, string>,
    received: "الاستلام", deadline: "الرد قبل", extended: "مُدِّد مرة واحدة: {reason}", refused: "السبب: {reason}", confirm: "تأكيد هذا الطلب", withdraw: "سحب الطلب",
    download: "تنزيل {file}", expires: "متاح حتى {date}", expired: "انتهت صلاحية التنزيل بعد 7 أيام. قدّم طلب نسخة جديداً إذا احتجته.",
    chooseReviews: "اختر ما يحدث لتقييماتك قبل التأكيد:", saveChoice: "حفظ الاختيار", done: "تم.", printed: "تتوفر نسخة مطبوعة عند الطلب.",
    reuseTitle: "الإجابات الصحية للحجوزات اللاحقة", reuseOn: "تسمح لنا بإعادة استخدام أحدث إجاباتك الصحية لحجوزاتك القادمة حتى {date}.", reuseOff: "تُستخدم إجاباتك الصحية للحجز الذي قُدمت له فقط، وتُتلف بعد 30 يوماً منه.",
    reuseGrant: "السماح بإعادة الاستخدام 12 شهراً", reuseWithdraw: "إيقاف إعادة الاستخدام",
  },
};
const input = "w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 focus-visible:outline-2 focus-visible:outline-[#A57C32]";
const button = "rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-black text-[#D1AF47] shadow transition hover:bg-stone-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A57C32]";
const ghost = "rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-800 hover:bg-stone-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#A57C32]";
const fill = (s: string, v: Record<string, string | number>) => Object.entries(v).reduce((acc, [k, x]) => acc.split(`{${k}}`).join(String(x)), s);

export default function CustomerPrivacy() {
  const lang = useOperationsLocale();
  const t = copy[lang];
  const isRTL = lang === "ar";
  const date = (v: string) => new Intl.DateTimeFormat(isRTL ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(new Date(v));
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [type, setType] = useState("access");
  const [details, setDetails] = useState("");
  const [field, setField] = useState("first_name");
  const [value, setValue] = useState("");
  const [reviewChoice, setReviewChoice] = useState("");
  const [purposes, setPurposes] = useState<string[]>([]);
  const [preview, setPreview] = useState<Record<string, number | string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const [pending, setPending] = useState<Pending>(null);
  const [contact, setContact] = useState<{ email?: string; phone?: string } | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [reuse, setReuse] = useState<{ active: boolean; until: string | null } | null>(null);

  const load = useCallback(() => setReload((k) => k + 1), []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [mine, consents, user] = await Promise.all([
        supabase.rpc("privacy_my_requests"),
        supabase.from("consents").select("purpose,status,created_at").eq("purpose", "health_data_reuse").order("created_at", { ascending: false }).limit(1),
        supabase.auth.getUser(),
      ]);
      if (cancelled) return;
      if (mine.error) { setLoadError(errorMessage(mine.error)); setRequests(null); }
      else { setLoadError(""); setRequests(mine.data as Request[]); }
      const latest = consents.data?.[0] as { status: string; created_at: string } | undefined;
      const until = latest && latest.status === "granted" ? new Date(new Date(latest.created_at).setMonth(new Date(latest.created_at).getMonth() + 12)).toISOString() : null;
      setReuse({ active: Boolean(until && new Date(until).getTime() > Date.now()), until });
      const u = user.data.user;
      setContact(u ? { email: u.email_confirmed_at ? u.email ?? undefined : undefined, phone: u.phone_confirmed_at ? u.phone ?? undefined : undefined } : null);
    })();
    return () => { cancelled = true; };
  }, [reload]);

  useEffect(() => {
    if (type !== "deletion") return;
    let cancelled = false;
    void supabase.rpc("privacy_deletion_preview").then(({ data, error }) => { if (!cancelled && !error) setPreview(data as Record<string, number | string>); });
    return () => { cancelled = true; };
  }, [type]);

  // Runs a command; when the server asks for a fresh one-time code, keeps the command and opens the code step.
  const attempt = async (run: () => Promise<{ error: unknown }>, success: string) => {
    setBusy(true);
    setMessage({});
    const { error } = await run();
    setBusy(false);
    if (error && errorHint(error) === "contact_otp_required") {
      setPending({ run: async () => { await attempt(run, success); } });
      return;
    }
    if (error) { setMessage({ error: errorHint(error) === "no_verified_contact" ? t.noContact : errorMessage(error) }); return; }
    setMessage({ success });
    load();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const options = type === "correction" ? { correction_field: field, correction_value: value.trim() }
      : type === "deletion" ? { review_choice: reviewChoice } : type === "consent_withdrawal" ? { consent_purposes: purposes } : {};
    void attempt(async () => supabase.rpc("privacy_submit_request", { p_request_type: type, p_details: details.trim() || null, p_options: options }), t.done);
  };

  const sendCode = async () => {
    if (!contact?.email && !contact?.phone) { setMessage({ error: t.noContact }); return; }
    setBusy(true);
    const { error } = contact.email
      ? await supabase.auth.signInWithOtp({ email: contact.email, options: { shouldCreateUser: false } })
      : await supabase.auth.signInWithOtp({ phone: contact.phone as string, options: { shouldCreateUser: false, channel: "sms" } });
    setBusy(false);
    if (error) setMessage({ error: errorMessage(error) }); else { setCodeSent(true); setMessage({ success: t.codeSent }); }
  };
  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = contact?.email
      ? await supabase.auth.verifyOtp({ email: contact.email, token: code.trim(), type: "email" })
      : await supabase.auth.verifyOtp({ phone: contact?.phone as string, token: code.trim(), type: "sms" });
    setBusy(false);
    if (error) { setMessage({ error: errorMessage(error) }); return; }
    const next = pending;
    setPending(null); setCodeSent(false); setCode("");
    if (next) await next.run();
  };

  const download = async (r: Request, file: "json" | "pdf") => {
    const { data, error } = await supabase.functions.invoke("privacy-export-download", { body: { request_id: r.id, file } });
    if (error) { setMessage({ error: errorMessage(error) }); return; }
    const blob = data instanceof Blob ? data : new Blob([typeof data === "string" ? data : JSON.stringify(data, null, 2)], { type: file === "pdf" ? "application/pdf" : "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `primora-personal-data.${file}`; a.click();
    URL.revokeObjectURL(url);
  };

  const setReuseConsent = (status: "granted" | "withdrawn") =>
    attempt(async () => supabase.rpc("record_consent", { p_purpose: "health_data_reuse", p_status: status, p_document_version: "v1.0", p_method: "web_form" }), t.done);

  const destination = contact?.email ?? contact?.phone ?? "";
  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-black text-stone-900">{t.title}</h1>
        <p className="mt-1 text-sm text-stone-600">{t.subtitle}</p>
      </div>
      {message.error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800">{message.error}</div>}
      {message.success && <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message.success}</div>}

      {pending && (
        <section aria-labelledby="verify-title" className="space-y-3 rounded-2xl border border-[#A57C32]/40 bg-[#FBF7EA] p-5">
          <h2 id="verify-title" className="font-serif text-lg font-black text-stone-900">{t.verifyTitle}</h2>
          {destination ? <p className="text-sm text-stone-700">{fill(t.verifyBody, { dest: destination })}</p> : <p className="text-sm text-red-800">{t.noContact}</p>}
          {destination && !codeSent && <button type="button" disabled={busy} onClick={() => void sendCode()} className={button}>{t.sendCode}</button>}
          {codeSent && (
            <form onSubmit={(e) => void verifyCode(e)} className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-bold text-stone-700">{t.code}
                <input dir="ltr" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required value={code} onChange={(e) => setCode(e.target.value)} className={`${input} mt-1 w-40 font-mono`} />
              </label>
              <button type="submit" disabled={busy} className={button}>{t.verify}</button>
            </form>
          )}
        </section>
      )}

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5" aria-labelledby="new-title">
        <h2 id="new-title" className="font-serif text-lg font-black text-stone-900">{t.newRequest}</h2>
        <fieldset>
          <legend className="text-xs font-bold text-stone-700">{t.type}</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(t.types).map(([k, v]) => (
              <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${type === k ? "border-[#A57C32] bg-[#A57C32]/10 font-bold" : "border-stone-200"}`}>
                <input type="radio" name="privacy-type" value={k} checked={type === k} onChange={() => setType(k)} className="accent-[#A57C32]" />{v}
              </label>
            ))}
          </div>
        </fieldset>
        {type === "correction" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-stone-700">{t.field}
              <select value={field} onChange={(e) => { setField(e.target.value); setValue(""); }} className={`${input} mt-1`}>{Object.entries(t.fields).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            <label className="text-xs font-bold text-stone-700">{t.newValue}
              {field === "gender"
                ? <select required value={value} onChange={(e) => setValue(e.target.value)} className={`${input} mt-1`}><option value="" />{Object.entries(t.genders).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                : <input required maxLength={50} value={value} onChange={(e) => setValue(e.target.value)} className={`${input} mt-1`} />}
            </label>
            <p className="text-xs text-stone-600 sm:col-span-2">{t.correctionNote}</p>
          </div>
        )}
        {type === "deletion" && (
          <div className="space-y-3">
            {preview && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">{fill(t.deletionPreview, { p: preview.bookings_to_pseudonymise ?? 0, d: preview.bookings_to_delete ?? 0 })}</p>}
            {preview && (Number(preview.wallet_balance_sar) > 0 || Number(preview.unused_package_sessions) > 0) && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">{fill(t.balance, { w: preview.wallet_balance_sar, s: preview.unused_package_sessions })}</p>
            )}
            <fieldset><legend className="text-xs font-bold text-stone-700">{t.reviews}</legend>
              {Object.entries(t.reviewChoices).map(([k, v]) => (
                <label key={k} className="mt-1 flex items-center gap-2 text-sm"><input type="radio" name="review-choice" required value={k} checked={reviewChoice === k} onChange={() => setReviewChoice(k)} className="accent-[#A57C32]" />{v}</label>
              ))}
            </fieldset>
          </div>
        )}
        {type === "consent_withdrawal" && (
          <fieldset><legend className="text-xs font-bold text-stone-700">{t.purposes}</legend>
            {Object.entries(t.purposeNames).map(([k, v]) => (
              <label key={k} className="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" checked={purposes.includes(k)} onChange={(e) => setPurposes((p) => e.target.checked ? [...p, k] : p.filter((x) => x !== k))} className="accent-[#A57C32]" />{v}</label>
            ))}
          </fieldset>
        )}
        <label className="block text-xs font-bold text-stone-700">{t.details}<textarea maxLength={2000} rows={2} value={details} onChange={(e) => setDetails(e.target.value)} className={`${input} mt-1`} /></label>
        <button type="submit" disabled={busy || (type === "consent_withdrawal" && purposes.length === 0)} className={button}>{busy ? t.sending : t.submit}</button>
      </form>

      <section aria-labelledby="mine-title" className="space-y-3">
        <h2 id="mine-title" className="font-serif text-lg font-black text-stone-900">{t.mine}</h2>
        {loadError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <span>{fill(t.loadFailed, { reason: loadError })}</span><button type="button" onClick={load} className={ghost}>{t.retry}</button>
          </div>
        ) : !requests ? null : requests.length === 0 ? <p className="text-sm text-stone-500">{t.none}</p> : (
          <ul className="space-y-3">
            {requests.map((r) => (
              <li key={r.id} className="space-y-2 rounded-2xl border border-stone-200 bg-white p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-stone-900">{t.typeNames[r.request_type] ?? r.request_type}</strong>
                  <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-bold text-stone-700">{t.statuses[r.status] ?? r.status}</span>
                </div>
                <p className="text-xs text-stone-600">{t.received}: {date(r.received_at)} · {t.deadline}: {date(r.deadline_at)}</p>
                {r.extended_due_at && r.extension_reason && <p className="text-xs text-amber-900">{fill(t.extended, { reason: r.extension_reason })}</p>}
                {r.status === "refused" && r.decision_reason && <p className="text-xs text-red-800">{fill(t.refused, { reason: r.decision_reason })} {isRTL ? r.complaint_right.ar : r.complaint_right.en}</p>}
                {r.status === "awaiting_verification" && (
                  <div className="space-y-2">
                    {r.request_type === "deletion" && !r.review_choice && (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span>{t.chooseReviews}</span>
                        <select value={choices[r.id] ?? ""} onChange={(e) => setChoices({ ...choices, [r.id]: e.target.value })} className={`${input} w-auto`}><option value="" />{Object.entries(t.reviewChoices).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                        <button type="button" disabled={!choices[r.id]} onClick={() => void attempt(async () => supabase.rpc("privacy_set_review_choice", { p_request_id: r.id, p_choice: choices[r.id] }), t.done)} className={ghost}>{t.saveChoice}</button>
                      </div>
                    )}
                    <button type="button" disabled={busy} onClick={() => void attempt(async () => supabase.rpc("privacy_confirm_request", { p_request_id: r.id }), t.done)} className={button}>{t.confirm}</button>
                  </div>
                )}
                {["awaiting_verification", "open"].includes(r.status) && (
                  <button type="button" disabled={busy} onClick={() => void attempt(async () => supabase.rpc("privacy_withdraw_request", { p_request_id: r.id }), t.done)} className={ghost}>{t.withdraw}</button>
                )}
                {r.export && (r.export.status === "built" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => void download(r, "pdf")} className={ghost}>{fill(t.download, { file: "PDF" })}</button>
                    <button type="button" onClick={() => void download(r, "json")} className={ghost}>{fill(t.download, { file: "JSON" })}</button>
                    {r.export.expires_at && <span className="text-xs text-stone-500">{fill(t.expires, { date: date(r.export.expires_at) })} · {t.printed}</span>}
                  </div>
                ) : r.export.status === "expired" ? <p className="text-xs text-stone-500">{t.expired}</p> : null)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="reuse-title" className="space-y-2 rounded-2xl border border-stone-200 bg-white p-5">
        <h2 id="reuse-title" className="font-serif text-lg font-black text-stone-900">{t.reuseTitle}</h2>
        {reuse && (reuse.active && reuse.until ? (
          <>
            <p className="text-sm text-stone-700">{fill(t.reuseOn, { date: date(reuse.until) })}</p>
            <button type="button" disabled={busy} onClick={() => void setReuseConsent("withdrawn")} className={ghost}>{t.reuseWithdraw}</button>
          </>
        ) : (
          <>
            <p className="text-sm text-stone-700">{t.reuseOff}</p>
            <button type="button" disabled={busy} onClick={() => void setReuseConsent("granted")} className={ghost}>{t.reuseGrant}</button>
          </>
        ))}
      </section>
    </div>
  );
}
