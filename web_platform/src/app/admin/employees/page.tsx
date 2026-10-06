"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { ForbiddenNotice, isForbidden, operationsInput, sar, useOperationsLocale } from "@/components/operations-ui";

// A read-only directory of the staff providers have registered. Providers manage their own team, so there is
// nothing to add, edit or delete here; the figures come from admin_employee_performance (bookings, the ledger
// and published reviews) and are left blank, never estimated, when that view cannot be read.

const PAGE_SIZE = 25;

type EmployeeRow = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  title_en: string | null;
  title_ar: string | null;
  is_active: boolean | null;
  photo_url: string | null;
  work_type: string | null;
  branches: {
    name_en: string | null;
    name_ar: string | null;
    provider_id: string;
    providers: { business_name_en: string | null; business_name_ar: string | null } | null;
  } | null;
};

type PerformanceRow = {
  employee_id: string;
  completed_bookings: number | string | null;
  employee_earnings: number | string | null;
  review_count: number | string | null;
  rating_sum: number | string | null;
};

type ProviderOption = { id: string; business_name_en: string | null; business_name_ar: string | null };

const translations = {
  en: {
    title: "Employees",
    subtitle: "Staff registered by providers. Providers manage their own teams, so this directory is read-only.",
    search: "Search by name or title",
    status: "Status",
    provider: "Provider",
    allProviders: "All providers",
    statuses: { all: "All", active: "Active", inactive: "Inactive" } as Record<string, string>,
    employee: "Employee",
    branch: "Provider and branch",
    workType: "Work type",
    workTypes: { in_shop: "In-shop", remote: "Remote", both: "Remote + in-shop" } as Record<string, string>,
    completed: "Completed bookings",
    rating: "Rating",
    earnings: "Earnings",
    noTitle: "No title",
    loading: "Loading employees…",
    loadFailed: "Employees could not be loaded: {reason}",
    figuresFailed: "Booking figures could not be loaded, so none are shown: {reason}",
    providersFailed: "The provider list could not be loaded, so you cannot filter by provider: {reason}",
    providersCapped: "Only the first {n} providers are listed in the filter. Search by name to find the others.",
    clearFilters: "Clear filters",
    retry: "Try again",
    empty: "No employees have been registered yet.",
    filteredEmpty: "No employees match these filters.",
    total: "{n} employees",
    page: "Page {page} of {pages}",
    previous: "Previous",
    next: "Next",
  },
  ar: {
    title: "الموظفون",
    subtitle: "الموظفون المسجلون لدى مقدمي الخدمة. يدير كل مقدم خدمة فريقه بنفسه، لذلك هذا الدليل للعرض فقط.",
    search: "ابحث بالاسم أو المسمى",
    status: "الحالة",
    provider: "مقدم الخدمة",
    allProviders: "كل مقدمي الخدمة",
    statuses: { all: "الكل", active: "نشط", inactive: "غير نشط" } as Record<string, string>,
    employee: "الموظف",
    branch: "مقدم الخدمة والفرع",
    workType: "نوع العمل",
    workTypes: { in_shop: "داخل المتجر", remote: "عن بعد", both: "عن بعد وداخل المتجر" } as Record<string, string>,
    completed: "الحجوزات المكتملة",
    rating: "التقييم",
    earnings: "الأرباح",
    noTitle: "بلا مسمى",
    loading: "جارٍ تحميل الموظفين…",
    loadFailed: "تعذّر تحميل الموظفين: {reason}",
    figuresFailed: "تعذّر تحميل أرقام الحجوزات، لذا لا تُعرض أي أرقام: {reason}",
    providersFailed: "تعذّر تحميل قائمة مقدمي الخدمة، لذا لا يمكن التصفية بحسب مقدم الخدمة: {reason}",
    providersCapped: "تُعرض أول {n} من مقدمي الخدمة فقط في التصفية. ابحث بالاسم للوصول إلى الباقين.",
    clearFilters: "مسح التصفية",
    retry: "إعادة المحاولة",
    empty: "لم يُسجَّل أي موظف بعد.",
    filteredEmpty: "لا يوجد موظفون مطابقون لهذه التصفية.",
    total: "عدد الموظفين: {n}",
    page: "الصفحة {page} من {pages}",
    previous: "السابق",
    next: "التالي",
  },
};

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);
const initialsOf = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word.charAt(0)).join("").toUpperCase();
// Characters that would change the meaning of a PostgREST filter are not searchable.
const safeTerm = (term: string) => term.replace(/[%*,()\\]/g, " ").replace(/\s+/g, " ").trim();

export default function AdminEmployeesPage() {
  const lang = useOperationsLocale();
  const t = translations[lang];
  const isRTL = lang === "ar";
  const numberFormat = isRTL ? "ar-SA" : "en-US";

  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [providerId, setProviderId] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [figures, setFigures] = useState<Record<string, PerformanceRow> | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadForbidden, setLoadForbidden] = useState(false);
  const [providersError, setProvidersError] = useState("");
  const [figuresError, setFiguresError] = useState("");

  // The search box applies a moment after typing stops, so each keystroke is not a query.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(safeTerm(term));
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from("providers").select("id, business_name_en, business_name_ar").order("business_name_en", { ascending: true });
      if (cancelled) return;
      if (error) {
        setProviders([]);
        setProvidersError(errorMessage(error));
        return;
      }
      setProvidersError("");
      setProviders((data ?? []) as ProviderOption[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError("");
      setFiguresError("");
      let query = supabase
        .from("employees")
        .select("id, name_en, name_ar, title_en, title_ar, is_active, photo_url, work_type, branches!inner ( name_en, name_ar, provider_id, providers ( business_name_en, business_name_ar ) )", { count: "exact" })
        .order("name_en", { ascending: true })
        .order("id", { ascending: true })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      if (status === "active") query = query.eq("is_active", true);
      if (status === "inactive") query = query.eq("is_active", false);
      if (providerId) query = query.eq("branches.provider_id", providerId);
      if (search) query = query.or(`name_en.ilike.*${search}*,name_ar.ilike.*${search}*,title_en.ilike.*${search}*,title_ar.ilike.*${search}*`);
      const { data, error, count } = await query;
      if (cancelled) return;
      if (error) {
        setRows([]);
        setFigures(null);
        setTotal(0);
        setLoadError(errorMessage(error));
        setLoadForbidden(isForbidden(error));
        setLoading(false);
        return;
      }
      setLoadForbidden(false);
      const pageRows = (data ?? []) as unknown as EmployeeRow[];
      setRows(pageRows);
      setTotal(count ?? 0);
      if (pageRows.length > 0) {
        const performance = await supabase
          .from("admin_employee_performance")
          .select("employee_id, completed_bookings, employee_earnings, review_count, rating_sum")
          .in("employee_id", pageRows.map((row) => row.id));
        if (cancelled) return;
        if (performance.error) {
          setFigures(null);
          setFiguresError(errorMessage(performance.error));
        } else {
          setFigures(Object.fromEntries(((performance.data ?? []) as PerformanceRow[]).map((row) => [row.employee_id, row])));
        }
      } else {
        setFigures({});
      }
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [page, status, providerId, search, reloadKey]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928]";
  const cell = "px-4 py-3 align-top";
  const filtered = Boolean(search || providerId || status !== "all");
  const name = (row: EmployeeRow) => (isRTL ? row.name_ar || row.name_en : row.name_en || row.name_ar) || "—";
  const title = (row: EmployeeRow) => (isRTL ? row.title_ar || row.title_en : row.title_en || row.title_ar) || t.noTitle;
  const providerName = (row: { business_name_en: string | null; business_name_ar: string | null } | null | undefined) =>
    (isRTL ? row?.business_name_ar || row?.business_name_en : row?.business_name_en || row?.business_name_ar) || "—";
  const branchName = (row: EmployeeRow) => (isRTL ? row.branches?.name_ar || row.branches?.name_en : row.branches?.name_en || row.branches?.name_ar) || "—";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-5 ${isRTL ? "text-right" : "text-left"}`}>
      <div>
        <h1 className="font-serif text-2xl font-black leading-tight text-gray-900">{t.title}</h1>
        <p className="mt-1 text-xs font-semibold text-gray-500">{t.subtitle}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[11px] font-bold text-[#667085]">
          <span>{t.search}</span>
          <input type="search" value={term} onChange={(event) => setTerm(event.target.value)} className={operationsInput} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold text-[#667085]">
          <span>{t.provider}</span>
          <select
            value={providerId}
            onChange={(event) => {
              setProviderId(event.target.value);
              setPage(1);
            }}
            className={`${operationsInput} min-w-[200px]`}
          >
            <option value="">{t.allProviders}</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>{providerName(provider)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold text-[#667085]">
          <span>{t.status}</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
              setPage(1);
            }}
            className={operationsInput}
          >
            {(["all", "active", "inactive"] as const).map((value) => (
              <option key={value} value={value}>{t.statuses[value]}</option>
            ))}
          </select>
        </label>
        {!loading && !loadError && <div className="pb-2 text-[11px] font-semibold text-gray-500">{fill(t.total, { n: total.toLocaleString(numberFormat) })}</div>}
      </div>

      {providersError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-xs font-bold text-[#93370D]">
          <span>{fill(t.providersFailed, { reason: providersError })}</span>
          <button type="button" onClick={() => setReloadKey((key) => key + 1)} className={`rounded-lg border border-[#FEDF89] bg-white px-3 py-1.5 font-black ${focusRing}`}>{t.retry}</button>
        </div>
      )}
      {!providersError && providers.length >= 1000 && (
        <div role="status" className="rounded-xl border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-xs font-bold text-[#93370D]">{fill(t.providersCapped, { n: (1000).toLocaleString(numberFormat) })}</div>
      )}

      {figuresError && (
        <div role="alert" className="rounded-xl border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-xs font-bold text-[#B54708]">{fill(t.figuresFailed, { reason: figuresError })}</div>
      )}

      {loadError && loadForbidden ? (
        <ForbiddenNotice locale={lang} />
      ) : loadError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{fill(t.loadFailed, { reason: loadError })}</span>
          <button type="button" onClick={() => setReloadKey((key) => key + 1)} className={`rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-black text-red-800 ${focusRing}`}>{t.retry}</button>
        </div>
      ) : loading ? (
        <div role="status" className="rounded-2xl border border-[#ECECEC] bg-white p-5 text-sm font-semibold text-gray-500">{t.loading}</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#ECECEC] bg-white p-5 text-sm font-semibold text-gray-500">
          <span>{filtered ? t.filteredEmpty : t.empty}</span>
          {filtered && (
            <button type="button" onClick={() => { setTerm(""); setSearch(""); setStatus("all"); setProviderId(""); setPage(1); }} className={`rounded-xl border border-[#ECECEC] px-3 py-1.5 text-xs font-black text-gray-700 ${focusRing}`}>{t.clearFilters}</button>
          )}
        </div>
      ) : (
        <div role="region" aria-label={t.title} tabIndex={0} className={`overflow-x-auto rounded-2xl border border-[#ECECEC] bg-white ${focusRing}`}>
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-[#FAFAF7] text-[11px] font-extrabold uppercase tracking-widest text-[#667085]">
              <tr>
                {[t.employee, t.branch, t.workType, t.status, t.completed, t.rating, t.earnings].map((heading) => (
                  <th key={heading} scope="col" className={`${cell} text-start`}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F4F7]">
              {rows.map((row) => {
                const performance = figures?.[row.id];
                const reviews = Number(performance?.review_count ?? 0);
                const rating = performance && reviews > 0 ? Number(performance.rating_sum ?? 0) / reviews : null;
                return (
                  <tr key={row.id}>
                    <td className={cell}>
                      <div className="flex items-center gap-3">
                        {row.photo_url ? (
                          // Photos are stored as links to storage we do not control, so next/image would need every host allow-listed.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.photo_url} alt={name(row)} loading="lazy" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
                        ) : (
                          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F4E7B6]/60 text-xs font-black text-[#7A5B12]">{initialsOf(name(row))}</span>
                        )}
                        <div className="min-w-0">
                          <div className="font-black text-gray-900">{name(row)}</div>
                          <div className="text-[11px] font-semibold text-gray-500">{title(row)}</div>
                        </div>
                      </div>
                    </td>
                    <td className={cell}>
                      <div className="font-bold text-gray-900">{providerName(row.branches?.providers)}</div>
                      <div className="text-[11px] font-semibold text-gray-500">{branchName(row)}</div>
                    </td>
                    <td className={`${cell} text-xs text-gray-700`}>{t.workTypes[row.work_type ?? "in_shop"] ?? row.work_type}</td>
                    <td className={cell}>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${row.is_active === false ? "bg-gray-100 text-[#667085]" : "bg-green-50 text-green-700"}`}>
                        {row.is_active === false ? t.statuses.inactive : t.statuses.active}
                      </span>
                    </td>
                    <td className={`${cell} font-black text-gray-900`}>{performance ? Number(performance.completed_bookings ?? 0).toLocaleString(numberFormat) : "—"}</td>
                    <td className={`${cell} font-black text-gray-900`}>
                      {performance ? (rating === null ? "—" : `★ ${rating.toLocaleString(numberFormat, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`) : "—"}
                    </td>
                    <td className={`${cell} whitespace-nowrap font-black text-[#9A741F]`}>{performance ? sar(Number(performance.employee_earnings ?? 0), lang) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loadError && total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-gray-500">{fill(t.page, { page: page.toLocaleString(numberFormat), pages: pages.toLocaleString(numberFormat) })}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} className={`rounded-xl border border-[#ECECEC] px-3 py-1.5 font-bold disabled:opacity-40 ${focusRing}`}>{t.previous}</button>
            <button type="button" disabled={page >= pages || loading} onClick={() => setPage((current) => Math.min(pages, current + 1))} className={`rounded-xl border border-[#ECECEC] px-3 py-1.5 font-bold disabled:opacity-40 ${focusRing}`}>{t.next}</button>
          </div>
        </div>
      )}
    </div>
  );
}
