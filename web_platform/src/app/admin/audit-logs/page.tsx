"use client";
import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ForbiddenNotice, isForbidden, useOperationsLocale } from "@/components/operations-ui";

// The audit trail: rows written by server commands and by the audit_admin_write trigger in the same
// transaction as each change. Admin-only by RLS ("Admins read audit logs"); rows cannot be edited.
type AuditRow = {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type Actor = { id: string; first_name: string | null; last_name: string | null; email: string | null };

const PAGE_SIZE = 50;

const translations = {
  en: {
    title: "Audit Log",
    subtitle: "Who changed what, when and why. Entries are written by the server in the same transaction as the change.",
    action: "Action contains",
    target: "Record type",
    allTypes: "All record types",
    from: "From",
    to: "To",
    search: "Search",
    clear: "Clear filters",
    loading: "Loading audit entries...",
    rangeInvalid: "The From date must not be after the To date.",
    loadFailed: "Could not load the audit log",
    retry: "Retry",
    empty: "No audit entries yet.",
    noMatches: "No entries match these filters.",
    when: "When",
    who: "Who",
    what: "Action",
    record: "Record",
    reason: "Reason",
    details: "Details",
    show: "Show",
    hide: "Hide",
    system: "System",
    previous: "Previous",
    next: "Next",
    page: "Page",
    of: "of",
    entries: "entries",
  },
  ar: {
    title: "سجل التدقيق",
    subtitle: "من غيّر ماذا ومتى ولماذا. يكتب الخادم كل سجل في نفس معاملة التغيير.",
    action: "الإجراء يحتوي على",
    target: "نوع السجل",
    allTypes: "كل أنواع السجلات",
    from: "من",
    to: "إلى",
    search: "بحث",
    clear: "مسح الفلاتر",
    loading: "جارٍ تحميل سجلات التدقيق...",
    rangeInvalid: "يجب ألا يكون تاريخ البداية بعد تاريخ النهاية.",
    loadFailed: "تعذر تحميل سجل التدقيق",
    retry: "إعادة المحاولة",
    empty: "لا توجد سجلات تدقيق بعد.",
    noMatches: "لا توجد سجلات مطابقة لهذه الفلاتر.",
    when: "الوقت",
    who: "المستخدم",
    what: "الإجراء",
    record: "السجل",
    reason: "السبب",
    details: "التفاصيل",
    show: "عرض",
    hide: "إخفاء",
    system: "النظام",
    previous: "السابق",
    next: "التالي",
    page: "صفحة",
    of: "من",
    entries: "سجل",
  },
};

const TARGET_TYPES = [
  "bookings", "branches", "data_subject_requests", "employee", "integrations", "inventory_products", "inventory_suppliers",
  "branch_inventory_stock", "packages", "payment_disputes", "payment_methods", "payout_requests", "platform_settings",
  "profiles", "promotional_codes", "provider_membership", "providers", "refund_requests", "services", "transactional_ledger",
];

// Riyadh is UTC+3 all year.
const riyadhDayStart = (date: string) => new Date(`${date}T00:00:00+03:00`).toISOString();
const riyadhDayEnd = (date: string) => new Date(`${date}T23:59:59.999+03:00`).toISOString();

export default function AdminAuditLogPage() {
  const lang = useOperationsLocale();
  const t = translations[lang];
  const isRTL = lang === "ar";
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [actors, setActors] = useState<Record<string, Actor>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadForbidden, setLoadForbidden] = useState(false);
  const [formError, setFormError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ action: "", target: "", from: "", to: "" });
  const [filters, setFilters] = useState({ action: "", target: "", from: "", to: "" });

  const load = useCallback(async (pageNumber: number, active: typeof filters) => {
    setLoading(true);
    setLoadError("");
    let query = supabase
      .from("admin_audit_logs")
      .select("id, actor_id, action, target_type, target_id, details, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE - 1);
    if (active.action.trim()) query = query.ilike("action", `%${active.action.trim()}%`);
    if (active.target) query = query.eq("target_type", active.target);
    if (active.from) query = query.gte("created_at", riyadhDayStart(active.from));
    if (active.to) query = query.lte("created_at", riyadhDayEnd(active.to));
    const { data, error, count } = await query;
    if (error) {
      setRows([]);
      setTotal(0);
      setLoadError(error.message);
      setLoadForbidden(isForbidden(error));
      setLoading(false);
      return;
    }
    setLoadForbidden(false);
    const list = (data || []) as AuditRow[];
    setRows(list);
    setTotal(count || 0);
    const ids = [...new Set(list.map((r) => r.actor_id).filter((id): id is string => Boolean(id)))];
    if (ids.length) {
      // GOV-2: console staff names for every console role; anyone else only with personal.read, and that lookup is logged.
      const { data: people } = await supabase.rpc("admin_people_names", { p_ids: ids, p_purpose: "audit_review" });
      const map: Record<string, Actor> = {};
      for (const person of (people || []) as Actor[]) map[person.id] = person;
      setActors(map);
    } else {
      setActors({});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(page, filters);
  }, [load, page, filters]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(filters.action || filters.target || filters.from || filters.to);
  const formatTime = (value: string) =>
    new Intl.DateTimeFormat(isRTL ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Riyadh" }).format(new Date(value));
  const actorName = (id: string | null) => {
    if (!id) return t.system;
    const person = actors[id];
    const name = [person?.first_name, person?.last_name].filter(Boolean).join(" ");
    return name || person?.email || `${id.slice(0, 8)}…`;
  };
  const reasonOf = (row: AuditRow) => {
    const details = row.details || {};
    const reason = (details as Record<string, unknown>).reason;
    return typeof reason === "string" ? reason : "";
  };

  const inputBase = "w-full rounded-xl border border-[#D0D5DD] bg-white px-3 py-2 text-sm text-gray-900 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928]";
  const labelBase = "flex flex-col gap-1 text-[11px] font-bold text-[#667085]";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div>
        <h1 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h1>
        <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
      </div>

      <form
        className="grid grid-cols-1 gap-3 rounded-2xl border border-[#ECECEC] bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (form.from && form.to && form.from > form.to) {
            setFormError(t.rangeInvalid);
            return;
          }
          setFormError("");
          setPage(1);
          setFilters({ ...form });
        }}
      >
        <label className={labelBase}>
          <span>{t.action}</span>
          <input className={inputBase} value={form.action} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))} />
        </label>
        <label className={labelBase}>
          <span>{t.target}</span>
          <select className={inputBase} value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}>
            <option value="">{t.allTypes}</option>
            {TARGET_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className={labelBase}>
          <span>{t.from}</span>
          <input type="date" className={inputBase} value={form.from} aria-invalid={Boolean(formError)} aria-describedby={formError ? "audit-range-error" : undefined} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))} />
        </label>
        <label className={labelBase}>
          <span>{t.to}</span>
          <input type="date" className={inputBase} value={form.to} aria-invalid={Boolean(formError)} aria-describedby={formError ? "audit-range-error" : undefined} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} />
        </label>
        <div className={`flex items-end gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <button type="submit" className="rounded-xl bg-gray-900 px-4 py-2 text-xs font-black text-white focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.search}</button>
          <button
            type="button"
            onClick={() => {
              const empty = { action: "", target: "", from: "", to: "" };
              setForm(empty);
              setFormError("");
              setPage(1);
              setFilters(empty);
            }}
            className="rounded-xl border border-[#ECECEC] px-4 py-2 text-xs font-bold text-gray-600 focus-visible:outline-2 focus-visible:outline-[#9B7928]"
          >
            {t.clear}
          </button>
        </div>
      </form>
      {formError && <p id="audit-range-error" role="alert" className="text-xs font-bold text-red-700">{formError}</p>}

      {loading && rows.length === 0 && <p role="status" className="text-sm text-gray-600">{t.loading}</p>}
      {!loading && loadError && loadForbidden && <ForbiddenNotice locale={lang} />}
      {!loading && loadError && !loadForbidden && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          {t.loadFailed}: {loadError}{" "}
          <button type="button" onClick={() => void load(page, filters)} className="font-bold underline">{t.retry}</button>
        </div>
      )}
      {!loading && !loadError && rows.length === 0 && (
        <p className="rounded-2xl border border-[#ECECEC] bg-white p-8 text-center text-sm text-gray-500">{filtered ? t.noMatches : t.empty}</p>
      )}

      {!loadError && rows.length > 0 && (
        <div role="region" aria-label={t.title} aria-busy={loading} tabIndex={0} className={`overflow-x-auto rounded-2xl border border-[#ECECEC] bg-white focus-visible:outline-2 focus-visible:outline-[#9B7928] ${loading ? "opacity-60" : ""}`}>
          {loading && <p role="status" className="px-4 pt-3 text-xs font-semibold text-gray-600">{t.loading}</p>}
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-[#667085]">
              <tr>
                <th scope="col" className="px-4 py-3 text-start">{t.when}</th>
                <th scope="col" className="px-4 py-3 text-start">{t.who}</th>
                <th scope="col" className="px-4 py-3 text-start">{t.what}</th>
                <th scope="col" className="px-4 py-3 text-start">{t.record}</th>
                <th scope="col" className="px-4 py-3 text-start">{t.reason}</th>
                <th scope="col" className="px-4 py-3 text-start">{t.details}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <React.Fragment key={row.id}>
                  <tr className="border-t border-[#F2F4F7] align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">{formatTime(row.created_at)}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-900">{actorName(row.actor_id)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-900" dir="ltr">{row.action}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-gray-600" dir="ltr">
                      {row.target_type || "—"}{row.target_id ? ` · ${row.target_id.slice(0, 8)}…` : ""}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">{reasonOf(row) || "—"}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        aria-expanded={expanded === row.id}
                        aria-controls={`audit-details-${row.id}`}
                        aria-label={`${expanded === row.id ? t.hide : t.show}: ${row.action} · ${formatTime(row.created_at)}`}
                        onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                        className="rounded-lg border border-[#ECECEC] px-3 py-1 text-[11px] font-bold text-gray-700 focus-visible:outline-2 focus-visible:outline-[#9B7928]"
                      >
                        {expanded === row.id ? t.hide : t.show}
                      </button>
                    </td>
                  </tr>
                  {expanded === row.id && (
                    <tr id={`audit-details-${row.id}`} className="bg-gray-50">
                      <td colSpan={6} className="px-4 py-3">
                        <pre dir="ltr" className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-left font-mono text-[11px] text-gray-800">
                          {JSON.stringify({ target_id: row.target_id, ...(row.details || {}) }, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loadError && total > 0 && (
        <nav aria-label={t.page} className={`flex items-center justify-between gap-3 text-xs text-gray-600 ${isRTL ? "flex-row-reverse" : ""}`}>
          <span>{t.page} {page} {t.of} {pages} · {total.toLocaleString(isRTL ? "ar-SA" : "en-US")} {t.entries}</span>
          <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <button type="button" aria-disabled={page <= 1 || loading} onClick={() => { if (!loading) setPage((p) => Math.max(1, p - 1)); }} className={`rounded-xl border border-[#ECECEC] px-3 py-1.5 font-bold focus-visible:outline-2 focus-visible:outline-[#9B7928] ${page <= 1 || loading ? "opacity-40" : ""}`}>{t.previous}</button>
            <button type="button" aria-disabled={page >= pages || loading} onClick={() => { if (!loading) setPage((p) => Math.min(pages, p + 1)); }} className={`rounded-xl border border-[#ECECEC] px-3 py-1.5 font-bold focus-visible:outline-2 focus-visible:outline-[#9B7928] ${page >= pages || loading ? "opacity-40" : ""}`}>{t.next}</button>
          </div>
        </nav>
      )}
    </div>
  );
}
