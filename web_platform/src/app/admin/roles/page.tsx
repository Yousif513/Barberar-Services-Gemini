"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { CommandResult, ForbiddenNotice, isForbidden, operationsDate, operationsInput, useOperationsLocale } from "@/components/operations-ui";
import { CommandDialog } from "@/components/modal";
import { oneOf, writeUrlState } from "@/lib/url-state";

// Administrators and staff. The list is one server page at a time (admin_role_directory, which also records that the
// directory was read, without the search text). Console roles (GOV-1 / D-Q5: owner, finance, operations, analyst) change only
// through admin_set_console_role: owner only, a reason of at least 10 characters, a fresh authenticator code, never your own
// account and never the last owner; the screen shows the server's refusal as written. An owner can also reset another
// administrator's two-step verification (admin_reset_mfa, reason and fresh code). Provider roles are created by approving an
// application, so this screen only manages console roles.

const PAGE_SIZE = 25;
const VIEWS = ["staff", "admin", "provider_owner", "provider_employee", "customer"] as const;
type View = (typeof VIEWS)[number];
type Numeric = number | string | null;
type RoleRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string;
  created_at: string;
  provider_name_en: string | null;
  provider_name_ar: string | null;
  console_role: ConsoleRole | null;
  mfa_enrolled: boolean | null;
  mfa_locked: boolean | null;
};
const CONSOLE_ROLES = ["owner", "finance", "operations", "analyst"] as const;
type ConsoleRole = (typeof CONSOLE_ROLES)[number];
type Directory = { counts: Record<string, Numeric>; matching: Numeric; rows: RoleRow[] };
type Pending = { person: RoleRow; next: ConsoleRole | null } | { person: RoleRow; resetMfa: true };

const translations = {
  en: {
    title: "Administrators & Roles",
    subtitle: "Who can operate the console, with which console role, and who works for a provider. Only an owner changes console roles or resets two-step verification; each change needs a reason and a fresh authenticator code and is recorded in the audit log.",
    viewStaff: "Administrators and staff",
    viewAdmin: "Administrators",
    viewOwner: "Provider owners",
    viewEmployee: "Provider employees",
    viewCustomer: "Find a customer",
    searchLabel: "Search by name, email, phone or ID",
    searchHint: "A customer is listed only when you search for one.",
    columnPerson: "Person",
    columnEmail: "Email",
    columnRole: "Role",
    columnProvider: "Provider",
    columnSince: "Since",
    columnActions: "Actions",
    roleAdmin: "Administrator",
    roleOwner: "Provider owner",
    roleEmployee: "Provider employee",
    roleCustomer: "Customer",
    grant: "Make administrator",
    revoke: "Remove administrator",
    self: "This is your account",
    selfHint: "You cannot change your own role; ask another administrator.",
    loading: "Loading people...",
    empty: "Nobody matches this view.",
    loadFailed: "The people could not be loaded: {reason}",
    retry: "Retry",
    previous: "Previous",
    next: "Next",
    pageOf: "Page {page} of {pages}",
    grantTitle: "Make {name} an administrator",
    grantIntro: "An administrator can change prices, money, providers and customers in the console. Give this role only to people who need it.",
    revokeTitle: "Remove the administrator role from {name}",
    revokeIntro: "The account becomes a customer account and loses access to the console at once. The last administrator cannot be removed.",
    reasonLabel: "Why is the role changing?",
    factPerson: "Person",
    factRole: "Current role",
    factNewRole: "New role",
    grantConfirm: "Make administrator",
    revokeConfirm: "Remove administrator",
    grantDone: "The administrator role was granted.",
    revokeDone: "The administrator role was removed.",
    unnamed: "Unnamed account",
    count: "{n} people",
    columnConsoleRole: "Console role",
    columnMfa: "Two-step verification",
    consoleRoles: { owner: "Owner", finance: "Finance", operations: "Operations", analyst: "Analyst (read-only)" } as Record<ConsoleRole, string>,
    consoleRoleHints: {
      owner: "Everything, including roles, settings and break-glass",
      finance: "Payouts, refunds, ledger, IBAN reveal and approval",
      operations: "Providers, bookings, customers and reviews; no money",
      analyst: "Read-only",
    } as Record<ConsoleRole, string>,
    chooseRole: "Console role for {name}",
    apply: "Apply",
    removeAccess: "Remove from console",
    resetMfa: "Reset two-step verification",
    mfaOn: "Enrolled",
    mfaOff: "Not enrolled",
    mfaLocked: "Locked (10 wrong codes)",
    roleTitle: "Change the console role of {name}",
    roleIntro: "A role that adds no money or governance rights applies at the person's next request. Owner and Finance wait for a different owner's approval. Changing roles needs a fresh code from your authenticator app; the person is notified.",
    removeTitle: "Remove {name} from the console",
    removeIntro: "The account becomes a customer account and loses console access at once. The last owner cannot be removed.",
    mfaTitle: "Reset two-step verification for {name}",
    mfaIntro: "Removes their authenticator app and ends all their sessions; at the next sign-in they enrol a new one. Use it for a lost phone or a lockout after 10 wrong codes. Needs a fresh code from your own app.",
    mfaReason: "Why is the reset needed? (at least 10 characters, include the ticket)",
    roleReason: "Why is the role changing? (at least 10 characters)",
    mfaDone: "Two-step verification was reset; the person enrols again at the next sign-in.",
    roleDone: "The console role was changed.",
    roleRequested: "This role adds money, bank-account or governance rights, so a different owner must approve it in Approvals. It applies once approved, and the person can decide requests only 72 hours later.",
  },
  ar: {
    title: "المسؤولون والأدوار",
    subtitle: "من يشغّل لوحة الإدارة وبأي دور، ومن يعمل لدى مزود خدمة. المالك وحده يغيّر الأدوار أو يعيد ضبط التحقق بخطوتين؛ وكل تغيير يحتاج سبباً ورمزاً جديداً من تطبيق المصادقة ويُسجَّل في سجل التدقيق.",
    viewStaff: "المسؤولون والموظفون",
    viewAdmin: "المسؤولون",
    viewOwner: "ملّاك المزودين",
    viewEmployee: "موظفو المزودين",
    viewCustomer: "البحث عن عميل",
    searchLabel: "ابحث بالاسم أو البريد أو الجوال أو المعرّف",
    searchHint: "لا يظهر العميل إلا عند البحث عنه.",
    columnPerson: "الشخص",
    columnEmail: "البريد الإلكتروني",
    columnRole: "الدور",
    columnProvider: "المزود",
    columnSince: "منذ",
    columnActions: "الإجراءات",
    roleAdmin: "مسؤول",
    roleOwner: "مالك مزود",
    roleEmployee: "موظف مزود",
    roleCustomer: "عميل",
    grant: "منح دور المسؤول",
    revoke: "سحب دور المسؤول",
    self: "هذا حسابك",
    selfHint: "لا يمكنك تغيير دورك بنفسك؛ اطلب من مسؤول آخر.",
    loading: "جارٍ تحميل الأشخاص...",
    empty: "لا يوجد أحد في هذا العرض.",
    loadFailed: "تعذّر تحميل الأشخاص: {reason}",
    retry: "إعادة المحاولة",
    previous: "السابق",
    next: "التالي",
    pageOf: "الصفحة {page} من {pages}",
    grantTitle: "منح {name} دور المسؤول",
    grantIntro: "يستطيع المسؤول تغيير الأسعار والمبالغ والمزودين والعملاء في لوحة الإدارة. امنح هذا الدور لمن يحتاجه فقط.",
    revokeTitle: "سحب دور المسؤول من {name}",
    revokeIntro: "يصبح الحساب حساب عميل ويفقد الوصول إلى لوحة الإدارة فوراً. لا يمكن سحب دور آخر مسؤول.",
    reasonLabel: "ما سبب تغيير الدور؟",
    factPerson: "الشخص",
    factRole: "الدور الحالي",
    factNewRole: "الدور الجديد",
    grantConfirm: "منح دور المسؤول",
    revokeConfirm: "سحب دور المسؤول",
    grantDone: "تم منح دور المسؤول.",
    revokeDone: "تم سحب دور المسؤول.",
    unnamed: "حساب بلا اسم",
    count: "{n} شخص",
    columnConsoleRole: "الدور في لوحة الإدارة",
    columnMfa: "التحقق بخطوتين",
    consoleRoles: { owner: "المالك", finance: "المالية", operations: "العمليات", analyst: "محلل (قراءة فقط)" } as Record<ConsoleRole, string>,
    consoleRoleHints: {
      owner: "كل شيء، بما فيه الأدوار والإعدادات وإجراء الطوارئ",
      finance: "التحويلات والاسترداد ودفتر الحسابات وكشف الآيبان واعتماده",
      operations: "المزودون والحجوزات والعملاء والتقييمات؛ دون أموال",
      analyst: "قراءة فقط",
    } as Record<ConsoleRole, string>,
    chooseRole: "دور {name} في لوحة الإدارة",
    apply: "تطبيق",
    removeAccess: "إزالة من لوحة الإدارة",
    resetMfa: "إعادة ضبط التحقق بخطوتين",
    mfaOn: "مفعّل",
    mfaOff: "غير مفعّل",
    mfaLocked: "مقفل (10 رموز خاطئة)",
    roleTitle: "تغيير دور {name} في لوحة الإدارة",
    roleIntro: "الدور الذي لا يضيف صلاحيات مالية أو حوكمة يسري من الطلب التالي للشخص. أما المالك والمالية فينتظران اعتماد مالك آخر. تغيير الأدوار يحتاج رمزاً جديداً من تطبيق المصادقة لديك، ويُبلَّغ الشخص.",
    removeTitle: "إزالة {name} من لوحة الإدارة",
    removeIntro: "يصبح الحساب حساب عميل ويفقد الوصول إلى لوحة الإدارة فوراً. لا يمكن إزالة آخر مالك.",
    mfaTitle: "إعادة ضبط التحقق بخطوتين لـ {name}",
    mfaIntro: "يزيل تطبيق المصادقة لديه وينهي كل جلساته؛ وعند الدخول التالي يضيف تطبيقاً جديداً. استخدمه عند فقد الهاتف أو القفل بعد 10 رموز خاطئة. يحتاج رمزاً جديداً من تطبيقك.",
    mfaReason: "لماذا تلزم إعادة الضبط؟ (10 أحرف على الأقل، اذكر رقم التذكرة)",
    roleReason: "ما سبب تغيير الدور؟ (10 أحرف على الأقل)",
    mfaDone: "تمت إعادة ضبط التحقق بخطوتين؛ يضيف الشخص تطبيقه من جديد عند الدخول التالي.",
    roleDone: "تم تغيير الدور في لوحة الإدارة.",
    roleRequested: "هذا الدور يضيف صلاحيات مالية أو مصرفية أو صلاحيات حوكمة، لذا يجب أن يعتمده مالك آخر في صفحة الاعتمادات. يسري بعد الاعتماد، ولا يبت الشخص في الطلبات إلا بعد 72 ساعة.",
  },
};

const toNumber = (value: Numeric | undefined) => Number(value ?? 0);
const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);

export default function AdminRoles() {
  return (
    <Suspense fallback={null}>
      <RolesScreen />
    </Suspense>
  );
}

function RolesScreen() {
  const lang = useOperationsLocale();
  const params = useSearchParams();
  const t = translations[lang];
  const isRTL = lang === "ar";
  const numberFormat = isRTL ? "ar-SA" : "en-US";

  const [view, setView] = useState<View>(() => oneOf(params.get("view"), VIEWS, "staff"));
  const [term, setTerm] = useState(() => params.get("q") ?? "");
  const [search, setSearch] = useState(() => (params.get("q") ?? "").trim());
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [choice, setChoice] = useState<Record<string, ConsoleRole>>({});
  const [success, setSuccess] = useState("");

  useEffect(() => {
    writeUrlState({ view: view === "staff" ? "" : view, q: search });
  }, [view, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(term.trim());
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setSelfId(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // A customer is found, never browsed: the server also refuses a customer list without a search.
      if (view === "customer" && search.length < 3) {
        setDirectory(null);
        setLoadError("");
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError("");
      const { data, error } = await supabase.rpc("admin_role_directory", {
        p_role: view === "staff" ? null : view,
        p_search: search || null,
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
      });
      if (cancelled) return;
      if (error) {
        setDirectory(null);
        setLoadError(errorMessage(error));
        setForbidden(isForbidden(error));
      } else {
        setDirectory(data as Directory);
        setForbidden(false);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [view, search, page, reloadKey]);

  const roleLabel = (role: string) =>
    role === "admin" ? t.roleAdmin : role === "provider_owner" ? t.roleOwner : role === "provider_employee" ? t.roleEmployee : t.roleCustomer;
  const personName = (person: RoleRow) => [person.first_name, person.last_name].filter(Boolean).join(" ") || person.email || t.unnamed;

  const changeRole = async (reason: string): Promise<string | null> => {
    if (!pending) return null;
    if ("resetMfa" in pending) {
      const { error } = await supabase.rpc("admin_reset_mfa", { p_user_id: pending.person.id, p_reason: reason });
      if (error) return errorMessage(error);
      setSuccess(t.mfaDone);
    } else {
      const { person, next } = pending;
      const { data, error } = await supabase.rpc("admin_set_console_role", { p_user_id: person.id, p_admin_role: next, p_reason: reason });
      if (error) return errorMessage(error);
      // GOV-FIX H-2: a grant of owner or finance is recorded as a request for a different owner, not applied.
      const outcome = data as { status?: string } | null;
      setSuccess(outcome?.status === "pending_approval" ? t.roleRequested : next === null ? t.revokeDone : person.role === "admin" ? t.roleDone : t.grantDone);
    }
    setReloadKey((key) => key + 1);
    return null;
  };
  const consoleRoleOf = (person: RoleRow) => (person.console_role ? t.consoleRoles[person.console_role] : "—");

  const rows = directory?.rows ?? [];
  const matching = toNumber(directory?.matching);
  const pages = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928]";
  const cell = "px-4 py-3 align-top";
  const smallButton = `whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-black disabled:opacity-50 ${focusRing}`;
  const viewLabels: Record<View, string> = {
    staff: t.viewStaff,
    admin: t.viewAdmin,
    provider_owner: t.viewOwner,
    provider_employee: t.viewEmployee,
    customer: t.viewCustomer,
  };

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="space-y-6 text-start">
      <div>
        <h2 className="font-serif text-2xl font-black text-gray-900">{t.title}</h2>
        <p className="mt-1 max-w-3xl text-xs font-semibold text-gray-500">{t.subtitle}</p>
      </div>

      {forbidden ? (
        <ForbiddenNotice locale={lang} />
      ) : (
        <>
          <div role="tablist" aria-label={t.title} className="flex flex-wrap gap-2">
            {VIEWS.map((item) => {
              const total = item === "staff" ? null : directory?.counts?.[item];
              return (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={view === item}
                  onClick={() => {
                    setView(item);
                    setPage(1);
                  }}
                  className={`rounded-full border px-4 py-2 text-xs font-black ${focusRing} ${view === item ? "border-[#101828] bg-[#101828] text-[#F4E7B6]" : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"}`}
                >
                  {viewLabels[item]}
                  {total !== null && total !== undefined && item !== "customer" ? <span className="ms-2 opacity-70">{toNumber(total).toLocaleString(numberFormat)}</span> : null}
                </button>
              );
            })}
          </div>

          <label className="flex max-w-xl flex-col gap-2 text-xs font-semibold text-[#667085]">
            <span>{t.searchLabel}</span>
            <input value={term} onChange={(event) => setTerm(event.target.value)} aria-describedby="roles-search-hint" className={operationsInput} />
            <span id="roles-search-hint" className="text-[11px]">{t.searchHint}</span>
          </label>

          <section className="overflow-hidden rounded-2xl border border-[#ECECEC] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            {loading ? (
              <p className="p-8 text-center text-xs font-bold text-gray-400">{t.loading}</p>
            ) : loadError ? (
              <div className="p-8 text-center">
                <p role="alert" className="text-xs font-bold text-[#B42318]">{fill(t.loadFailed, { reason: loadError })}</p>
                <button type="button" onClick={() => setReloadKey((key) => key + 1)} className={`mt-3 rounded-xl border border-gray-300 px-4 py-2 text-xs font-bold text-gray-800 hover:border-gray-500 ${focusRing}`}>{t.retry}</button>
              </div>
            ) : view === "customer" && search.length < 3 ? (
              <p className="p-8 text-center text-xs font-semibold text-gray-500">{t.searchHint}</p>
            ) : rows.length === 0 ? (
              <p className="p-8 text-center text-xs font-semibold text-gray-500">{t.empty}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-xs">
                  <thead className="border-b border-[#ECECEC] bg-[#FAF9F6] text-[10px] font-extrabold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th scope="col" className={`${cell} text-start`}>{t.columnPerson}</th>
                      <th scope="col" className={`${cell} text-start`}>{t.columnEmail}</th>
                      <th scope="col" className={`${cell} text-start`}>{t.columnRole}</th>
                      <th scope="col" className={`${cell} text-start`}>{t.columnConsoleRole}</th>
                      <th scope="col" className={`${cell} text-start`}>{t.columnMfa}</th>
                      <th scope="col" className={`${cell} text-start`}>{t.columnProvider}</th>
                      <th scope="col" className={`${cell} text-start`}>{t.columnSince}</th>
                      <th scope="col" className={`${cell} text-start`}>{t.columnActions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5F5F5] font-semibold text-gray-700">
                    {rows.map((person) => {
                      const mine = person.id === selfId;
                      const providerName = isRTL ? person.provider_name_ar || person.provider_name_en : person.provider_name_en || person.provider_name_ar;
                      return (
                        <tr key={person.id}>
                          <td className={`${cell} font-bold text-gray-900`}>{personName(person)}</td>
                          <td dir="ltr" className={`${cell} text-start`}>{person.email || "—"}</td>
                          <td className={cell}>
                            <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-black ${person.role === "admin" ? "bg-[#101828] text-[#F4E7B6]" : "bg-stone-100 text-stone-700"}`}>{roleLabel(person.role)}</span>
                          </td>
                          <td className={cell}>
                            {person.role === "admin" ? <span title={person.console_role ? t.consoleRoleHints[person.console_role] : undefined}>{consoleRoleOf(person)}</span> : "—"}
                          </td>
                          <td className={cell}>
                            {person.role !== "admin" ? "—" : person.mfa_locked ? <span className="font-black text-[#B42318]">{t.mfaLocked}</span> : person.mfa_enrolled ? <span className="text-green-800">{t.mfaOn}</span> : <span className="text-[#B54708]">{t.mfaOff}</span>}
                          </td>
                          <td className={cell}>{providerName || "—"}</td>
                          <td className={`${cell} whitespace-nowrap text-[11px] text-gray-500`}>{operationsDate(person.created_at, lang)}</td>
                          <td className={cell}>
                            {mine ? (
                              <span className="text-[11px] font-bold text-gray-500" title={t.selfHint}>{t.self}</span>
                            ) : person.role === "admin" || person.role === "customer" ? (
                              <span className="flex flex-wrap items-center gap-1.5">
                                <select
                                  aria-label={fill(t.chooseRole, { name: personName(person) })}
                                  value={choice[person.id] ?? person.console_role ?? "analyst"}
                                  onChange={(event) => setChoice((current) => ({ ...current, [person.id]: event.target.value as ConsoleRole }))}
                                  className={`rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-[11px] font-bold ${focusRing}`}
                                >
                                  {CONSOLE_ROLES.map((role) => <option key={role} value={role}>{t.consoleRoles[role]}</option>)}
                                </select>
                                <button type="button"
                                  disabled={(choice[person.id] ?? person.console_role ?? "analyst") === person.console_role}
                                  onClick={() => setPending({ person, next: choice[person.id] ?? person.console_role ?? "analyst" })}
                                  className={`${smallButton} border-gray-300 bg-white text-gray-900 hover:border-[#D1AF47]`}
                                  aria-label={`${person.role === "admin" ? t.apply : t.grant}: ${personName(person)}`}>{person.role === "admin" ? t.apply : t.grant}</button>
                                {person.role === "admin" && (
                                  <button type="button" onClick={() => setPending({ person, next: null })} className={`${smallButton} border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]`} aria-label={`${t.removeAccess}: ${personName(person)}`}>{t.removeAccess}</button>
                                )}
                                {person.role === "admin" && (person.mfa_enrolled || person.mfa_locked) && (
                                  <button type="button" onClick={() => setPending({ person, resetMfa: true })} className={`${smallButton} border-gray-300 bg-white text-gray-800`} aria-label={`${t.resetMfa}: ${personName(person)}`}>{t.resetMfa}</button>
                                )}
                              </span>
                            ) : (
                              <span className="text-[11px] text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && !loadError && rows.length > 0 ? (
              <div className="flex items-center justify-between gap-3 border-t border-[#ECECEC] px-4 py-3 text-xs font-bold text-gray-600">
                <span>{fill(t.count, { n: matching.toLocaleString(numberFormat) })} · {fill(t.pageOf, { page: page.toLocaleString(numberFormat), pages: pages.toLocaleString(numberFormat) })}</span>
                <span className="flex gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className={`${smallButton} border-gray-300`}>{t.previous}</button>
                  <button type="button" disabled={page >= pages} onClick={() => setPage((value) => value + 1)} className={`${smallButton} border-gray-300`}>{t.next}</button>
                </span>
              </div>
            ) : null}
          </section>
        </>
      )}

      {pending && "resetMfa" in pending && (
        <CommandDialog
          locale={lang}
          tone="danger"
          title={fill(t.mfaTitle, { name: personName(pending.person) })}
          intro={t.mfaIntro}
          facts={[{ label: t.factPerson, value: personName(pending.person) }, { label: t.columnConsoleRole, value: consoleRoleOf(pending.person) }]}
          reasonLabel={t.mfaReason}
          minReasonLength={10}
          confirmLabel={t.resetMfa}
          onConfirm={changeRole}
          onClose={() => setPending(null)}
        />
      )}
      {pending && !("resetMfa" in pending) && (
        <CommandDialog
          locale={lang}
          tone={pending.next === null ? "danger" : "default"}
          title={fill(pending.next === null ? t.removeTitle : pending.person.role === "admin" ? t.roleTitle : t.grantTitle, { name: personName(pending.person) })}
          intro={pending.next === null ? t.removeIntro : pending.person.role === "admin" ? t.roleIntro : t.grantIntro}
          facts={[
            { label: t.factPerson, value: personName(pending.person) },
            { label: t.factRole, value: pending.person.role === "admin" ? consoleRoleOf(pending.person) : roleLabel(pending.person.role) },
            { label: t.factNewRole, value: pending.next === null ? roleLabel("customer") : `${t.consoleRoles[pending.next]} — ${t.consoleRoleHints[pending.next]}` },
          ]}
          reasonLabel={t.roleReason}
          minReasonLength={10}
          confirmLabel={pending.next === null ? t.revokeConfirm : pending.person.role === "admin" ? t.apply : t.grantConfirm}
          onConfirm={changeRole}
          onClose={() => setPending(null)}
        />
      )}
      <CommandResult success={success} locale={lang} onDismiss={() => setSuccess("")} />
    </div>
  );
}
