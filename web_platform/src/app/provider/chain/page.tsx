"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { OperationsField as Field, OperationsPanel as Panel, OperationsNotice, operationsButton as button, operationsInput as input, operationError, sar, useOperationsLocale } from "@/components/operations-ui";

type Permission = "inventory" | "bookings" | "staff" | "reports";
type Membership = { id: string; user_id: string; branch_id: string | null; role: string; is_active: boolean; permissions: Partial<Record<Permission, boolean>>; display_name: string };
type Context = { provider_id: string; can_manage_memberships: boolean; branches: { id: string; name_en: string; name_ar: string }[]; memberships: Membership[]; employee_candidates: { user_id: string; display_name: string; branch_id: string }[] };
type Metrics = { revenue_sar: number; total_bookings: number; completed_bookings: number; active_staff: number; stock_value_sar: number; low_stock_count: number };
type Summary = { branches: (Metrics & { branch_id: string; name_en: string; name_ar: string })[]; totals: Metrics };
const translations = {
  en: { title: "Chain Operations", subtitle: "Review branch performance and delegate access to registered staff.", loading: "Loading branch operations...", retry: "Retry", empty: "No branches or staff memberships available.", from: "From", to: "To", revenue_sar: "Completed service revenue", total_bookings: "Bookings", completed_bookings: "Completed bookings", active_staff: "Active staff", stock_value_sar: "Stock at cost", low_stock_count: "Reorder alerts", branches: "Branch performance", access: "Branch manager access", add: "Add access", edit: "Edit", all: "All branches", person: "Registered employee", scope: "Branch scope", role: "Role", active: "Access enabled", inventory: "Inventory", bookings: "Bookings", staff: "Staff", reports: "Reports", reason: "Reason for change", save: "Save access", cancel: "Cancel", saved: "Access settings saved.", confirm: "Disable this employee's access?", noCandidates: "Link a registered staff account from the Employees page before adding access.", employees: "Manage employees", inventoryLink: "Manage inventory", required: "Select an employee, a role, and enter a reason.", status: "Status", enabled: "Enabled", disabled: "Disabled", manager: "Manager", branch_manager: "Branch manager", inventory_manager: "Inventory manager", receptionist: "Receptionist", stylist: "Stylist", owner: "Owner" },
  ar: { title: "عمليات الفروع", subtitle: "راجع أداء الفروع وفوض الصلاحيات للموظفين المسجلين.", loading: "جاري تحميل عمليات الفروع...", retry: "إعادة المحاولة", empty: "لا توجد فروع أو صلاحيات موظفين.", from: "من", to: "إلى", revenue_sar: "إيراد الخدمات المكتملة", total_bookings: "الحجوزات", completed_bookings: "الحجوزات المكتملة", active_staff: "الموظفون النشطون", stock_value_sar: "المخزون بالتكلفة", low_stock_count: "تنبيهات إعادة الطلب", branches: "أداء الفروع", access: "صلاحيات مديري الفروع", add: "إضافة صلاحية", edit: "تعديل", all: "جميع الفروع", person: "الموظف المسجل", scope: "نطاق الفرع", role: "الدور", active: "الصلاحية مفعلة", inventory: "المخزون", bookings: "الحجوزات", staff: "الموظفون", reports: "التقارير", reason: "سبب التغيير", save: "حفظ الصلاحيات", cancel: "إلغاء", saved: "تم حفظ إعدادات الصلاحيات.", confirm: "تعطيل صلاحيات هذا الموظف؟", noCandidates: "اربط حساب موظف مسجل من صفحة الموظفين قبل إضافة الصلاحيات.", employees: "إدارة الموظفين", inventoryLink: "إدارة المخزون", required: "اختر موظفا ودورا وأدخل سبب التغيير.", status: "الحالة", enabled: "مفعل", disabled: "معطل", manager: "مدير", branch_manager: "مدير فرع", inventory_manager: "مدير مخزون", receptionist: "موظف استقبال", stylist: "أخصائي", owner: "مالك" }
};
const permissions: Permission[] = ["inventory", "bookings", "staff", "reports"];
const roles = ["manager", "branch_manager", "inventory_manager", "receptionist", "stylist"] as const;
const day = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
export default function ChainOperationsPage() {
  const lang = useOperationsLocale(); const t = translations[lang];
  const [context, setContext] = useState<Context | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(""); const [reportError, setReportError] = useState(""); const [success, setSuccess] = useState("");
  const [revision, setRevision] = useState(0);
  const [dates, setDates] = useState(() => ({ from: day(new Date(Date.now() - 30 * 86400000)), to: day(new Date()) }));
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ id: "", user: "", branch: "", role: "branch_manager", active: true, permissions: {} as Partial<Record<Permission, boolean>>, reason: "" });
  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true); setError(""); setReportError("");
      const result = await supabase.rpc("get_provider_operations_context");
      if (!active) return;
      if (result.error) { setError(operationError(result.error)); setContext(null); setSummary(null); setLoading(false); return; }
      const current = result.data as Context; setContext(current);
      const report = await supabase.rpc("get_provider_chain_operations", { p_provider_id: current.provider_id, p_start_date: dates.from, p_end_date: dates.to });
      if (!active) return;
      setSummary(report.error ? null : report.data as Summary); setReportError(report.error ? operationError(report.error) : ""); setLoading(false);
    })();
    return () => { active = false; };
  }, [dates.from, dates.to, revision]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!context || !form.user || form.reason.trim().length < 3) { setError(t.required); return; }
    if (!form.active && !window.confirm(t.confirm)) return;
    setSaving(true); setError(""); setSuccess("");
    const result = await supabase.rpc("save_provider_operation_membership", { p_provider_id: context.provider_id, p_user_id: form.user,
      p_branch_id: form.branch || null, p_role: form.role, p_permissions: form.permissions, p_is_active: form.active,
      p_membership_id: form.id || null, p_reason: form.reason.trim() });
    setSaving(false);
    if (result.error) { setError(operationError(result.error)); return; }
    setEditing(false); setSuccess(t.saved); setRevision(r => r + 1);
  };
  const branchName = (id: string | null) => { const b = context?.branches.find(b => b.id === id); return id ? (lang === "ar" ? b?.name_ar : b?.name_en) || id : t.all; };
  const roleName = (role: string) => t[role as keyof typeof t] || role;
  return <div dir={lang === "ar" ? "rtl" : "ltr"} className="space-y-6 text-[#101828]">
    <header><h1 className="font-serif text-3xl font-bold">{t.title}</h1><p className="mt-2 text-sm text-[#667085]">{t.subtitle}</p><div className="mt-4 flex flex-wrap gap-2"><Link className={button} href="/provider/inventory">{t.inventoryLink}</Link><Link className={button} href="/provider/employees">{t.employees}</Link></div></header>
    <OperationsNotice error={error} success={success} />
    <div className="flex flex-wrap items-end gap-4"><Field label={t.from}><input className={input} type="date" value={dates.from} max={dates.to} onChange={e => setDates(d => ({ ...d, from: e.target.value }))} /></Field><Field label={t.to}><input className={input} type="date" value={dates.to} min={dates.from} onChange={e => setDates(d => ({ ...d, to: e.target.value }))} /></Field><button className={button} disabled={loading} onClick={() => setRevision(r => r + 1)}>{t.retry}</button></div>
    {loading && <p role="status">{t.loading}</p>}
    {!loading && <><OperationsNotice error={reportError} />{summary && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{(Object.keys(summary.totals) as (keyof Metrics)[]).map(key => <Panel key={key} title={t[key]}><strong className="text-2xl">{key.endsWith('_sar') ? sar(summary.totals[key], lang) : Number(summary.totals[key]).toLocaleString(lang)}</strong></Panel>)}</div>
      <Panel title={t.branches}>{!summary.branches.length ? <p>{t.empty}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-start text-sm"><thead><tr>{[t.scope, t.revenue_sar, t.completed_bookings, t.active_staff, t.stock_value_sar, t.low_stock_count].map(label => <th key={label} className="p-3 text-start text-[#667085]">{label}</th>)}</tr></thead><tbody>{summary.branches.map(b => <tr key={b.branch_id} className="border-t border-[#E8DDC0]"><td className="p-3 font-semibold">{lang === 'ar' ? b.name_ar : b.name_en}</td><td>{sar(b.revenue_sar, lang)}</td><td>{b.completed_bookings}</td><td>{b.active_staff}</td><td>{sar(b.stock_value_sar, lang)}</td><td>{b.low_stock_count}</td></tr>)}</tbody></table></div>}</Panel>
    </>}
    {context && <Panel title={t.access}>
      {context.can_manage_memberships && <button className={button} onClick={() => { setForm({ id: "", user: "", branch: "", role: "branch_manager", active: true, permissions: {}, reason: "" }); setEditing(true); }}>{t.add}</button>}
      {!context.memberships.length && <p className="mt-4 text-sm text-[#667085]">{t.empty}</p>}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">{context.memberships.map(m => <article key={m.id} className="rounded-xl border border-[#E8DDC0] p-4"><strong>{m.display_name}</strong><p className="my-2 text-sm text-[#667085]">{branchName(m.branch_id)} · {roleName(m.role)} · {m.is_active ? t.enabled : t.disabled}</p><p className="mb-3 text-sm">{permissions.filter(p => m.permissions[p]).map(p => t[p]).join(' · ')}</p>{context.can_manage_memberships && m.role !== 'owner' && <button className={button} onClick={() => { setForm({ id: m.id, user: m.user_id, branch: m.branch_id || "", role: m.role, active: m.is_active, permissions: { ...m.permissions }, reason: "" }); setEditing(true); }}>{t.edit}</button>}</article>)}</div>
      {editing && context.can_manage_memberships && <form onSubmit={save} className="mt-5 grid gap-4 rounded-xl bg-[#F7F3EA] p-4 md:grid-cols-2">
        <Field label={t.person}><select required disabled={Boolean(form.id)} className={input} value={form.user} onChange={e => { const candidate = context.employee_candidates.find(c => c.user_id === e.target.value); setForm(f => ({ ...f, user: e.target.value, branch: candidate?.branch_id || '' })); }}><option value="">{t.person}</option>{form.id ? <option value={form.user}>{context.memberships.find(m => m.id === form.id)?.display_name}</option> : context.employee_candidates.map(c => <option key={c.user_id} value={c.user_id}>{c.display_name}</option>)}</select></Field>
        <Field label={t.scope}><select required={form.role === 'branch_manager'} className={input} value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}><option value="">{t.all}</option>{context.branches.map(b => <option key={b.id} value={b.id}>{branchName(b.id)}</option>)}</select></Field>
        <Field label={t.role}><select className={input} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value, permissions: e.target.value === 'stylist' ? {} : f.permissions }))}>{roles.map(r => <option key={r} value={r}>{roleName(r)}</option>)}</select></Field>
        <Field label={t.reason}><input className={input} minLength={3} required value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} /></Field>
        <fieldset className="flex flex-wrap gap-4 md:col-span-2">{permissions.map(p => <label key={p} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={form.role === 'stylist'} checked={Boolean(form.permissions[p])} onChange={e => setForm(f => ({ ...f, permissions: { ...f.permissions, [p]: e.target.checked } }))} />{t[p]}</label>)}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />{t.active}</label></fieldset>
        {!context.employee_candidates.length && !form.id && <p className="text-sm">{t.noCandidates}</p>}
        <div className="flex gap-2 md:col-span-2"><button disabled={saving} className={button}>{t.save}</button><button disabled={saving} type="button" className={button} onClick={() => setEditing(false)}>{t.cancel}</button></div>
      </form>}
    </Panel>}</>}
  </div>;
}
