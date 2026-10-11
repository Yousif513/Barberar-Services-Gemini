"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { OperationsField as Field, OperationsPanel as Panel, OperationsNotice, operationsButton as button, operationsInput as input, operationError, operationsDate, sar, useOperationsLocale } from "@/components/operations-ui";

type Order = { id: string; provider_id: string; provider_name: string; branch_name: string; supplier_name: string; status: string; subtotal_sar: number; created_at: string; notes: string | null; items: { product_name: string; quantity: number; unit_cost_sar: number; line_total_sar: number }[] };
type Health = { provider_id: string; provider_name: string; stock_value_sar: number; low_stock_count: number; pending_orders: number };
type Overview = { total_orders: number; total_providers: number; total_movements: number; orders: Order[]; provider_health: Health[];
  metrics: { pending_orders: number; stock_value_sar: number; low_stock_count: number; negative_adjustments: number; waste_events: number };
  movements: { id: string; provider_name: string; branch_name: string; product_name: string; movement_type: string; quantity_delta: number; reason: string | null; created_at: string }[] };
const translations = {
  en: { title: "Supply Oversight", subtitle: "Monitor provider inventory, supplier orders and recorded stock reductions.", loading: "Loading live supply data...", retry: "Refresh", search: "Provider, supplier or order ID", apply: "Search", status: "Order status", all: "All statuses", clear: "Clear provider filter", pending_orders: "Pending supplier orders", stock_value_sar: "Stock at cost", low_stock_count: "Low-stock combinations", negative_adjustments: "Negative adjustments · 30 days", waste_events: "Waste records · 30 days", orders: "Supplier purchase orders", health: "Provider inventory health", activity: "Stock reductions · last 30 days", activityHint: "Recorded waste and negative adjustments are review signals. They do not imply fraud.", metricsHint: "Inventory metrics cover the selected provider scope. The status filter applies to orders.", empty: "No records match these filters.", provider: "Provider", branch: "Branch", supplier: "Supplier", amount: "Order value", date: "Date (Riyadh)", details: "View details", close: "Close details", product: "Product", quantity: "Quantity", cost: "Unit cost", total: "Line total", notes: "Notes", filter: "Review provider", previous: "Previous", next: "Next", page: "Page", of: "of", records: "records", reason: "Reason", type: "Movement", draft: "Draft", submitted: "Submitted", approved: "Approved", received: "Received", cancelled: "Cancelled", waste: "Waste", adjustment: "Adjustment" },
  ar: { title: "الإشراف على التوريد", subtitle: "تابع مخزون المزودين وطلبات الموردين وعمليات خفض المخزون المسجلة.", loading: "جاري تحميل بيانات التوريد...", retry: "تحديث", search: "المزود أو المورد أو رقم الطلب", apply: "بحث", status: "حالة الطلب", all: "جميع الحالات", clear: "إزالة تصفية المزود", pending_orders: "طلبات الموردين المعلقة", stock_value_sar: "المخزون بالتكلفة", low_stock_count: "أرصدة منخفضة", negative_adjustments: "تعديلات سالبة · ٣٠ يوما", waste_events: "سجلات التلف · ٣٠ يوما", orders: "طلبات شراء الموردين", health: "حالة مخزون المزودين", activity: "خفض المخزون · آخر ٣٠ يوما", activityHint: "التلف والتعديلات السالبة مؤشرات للمراجعة ولا تعني وجود احتيال.", metricsHint: "مؤشرات المخزون تغطي نطاق المزود المحدد. تصفية الحالة تنطبق على الطلبات.", empty: "لا توجد سجلات مطابقة لهذه المرشحات.", provider: "المزود", branch: "الفرع", supplier: "المورد", amount: "قيمة الطلب", date: "التاريخ (الرياض)", details: "عرض التفاصيل", close: "إغلاق التفاصيل", product: "المنتج", quantity: "الكمية", cost: "تكلفة الوحدة", total: "إجمالي البند", notes: "ملاحظات", filter: "مراجعة المزود", previous: "السابق", next: "التالي", page: "الصفحة", of: "من", records: "سجلا", reason: "السبب", type: "الحركة", draft: "مسودة", submitted: "مرسل", approved: "معتمد", received: "مستلم", cancelled: "ملغى", waste: "تلف", adjustment: "تعديل" }
};
const statuses = ["draft", "submitted", "approved", "received", "cancelled"] as const;
export default function AdminSupplyPage() {
  const lang = useOperationsLocale(); const t = translations[lang];
  const [data, setData] = useState<Overview | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(""); const [filters, setFilters] = useState({ search: "", status: "", provider: "", page: 1 });
  const [revision, setRevision] = useState(0); const [detail, setDetail] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true); setError(""); setData(null);
      const result = await supabase.rpc("get_admin_supply_overview", { p_page: filters.page, p_page_size: 20, p_status: filters.status || null, p_search: filters.search || null, p_provider_id: filters.provider || null });
      if (!active) return;
      setLoading(false); if (result.error) { setError(operationError(result.error)); return; }
      setData(result.data as Overview);
    })();
    return () => { active = false; };
  }, [filters, revision]);
  const label = (status: string) => t[status as keyof typeof t] || status;
  const pages = data ? Math.max(1, Math.ceil(Math.max(data.total_orders, data.total_providers, data.total_movements || 0) / 20)) : filters.page;
  const order = data?.orders.find(o => o.id === detail);
  return <div dir={lang === "ar" ? "rtl" : "ltr"} className="space-y-6 text-[#101828]">
    <header><h1 className="font-serif text-3xl font-bold">{t.title}</h1><p className="mt-2 text-sm text-[#667085]">{t.subtitle}</p></header>
    <form onSubmit={e => { e.preventDefault(); setFilters(f => ({ ...f, search: search.trim(), page: 1 })); setDetail(null); }} className="flex flex-wrap items-end gap-4">
      <div className="min-w-[220px] flex-1"><Field label={t.search}><input className={input} value={search} onChange={e => setSearch(e.target.value)} /></Field></div>
      <Field label={t.status}><select className={input} value={filters.status} onChange={e => { setFilters(f => ({ ...f, status: e.target.value, page: 1 })); setDetail(null); }}><option value="">{t.all}</option>{statuses.map(s => <option key={s} value={s}>{t[s]}</option>)}</select></Field>
      <button className={button}>{t.apply}</button><button type="button" disabled={loading} className={button} onClick={() => setRevision(r => r + 1)}>{t.retry}</button>
      {filters.provider && <button type="button" className={button} onClick={() => setFilters(f => ({ ...f, provider: "", page: 1 }))}>{t.clear}</button>}
    </form>
    <OperationsNotice error={error} />{loading && <p role="status">{t.loading}</p>}
    {data && <>
      <p className="text-xs text-[#667085]">{t.metricsHint}</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{(Object.keys(data.metrics) as (keyof Overview['metrics'])[]).filter(key => key in t).map(key => <Panel key={key} title={t[key]}><strong className="text-2xl">{key === 'stock_value_sar' ? sar(data.metrics[key], lang) : Number(data.metrics[key]).toLocaleString(lang)}</strong></Panel>)}</div>
      <Panel title={`${t.orders} (${data.total_orders})`}>{!data.orders.length ? <p>{t.empty}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[740px] text-start text-sm"><thead><tr>{[t.provider, t.branch, t.supplier, t.status, t.amount, t.date, t.details].map(l => <th key={l} className="p-3 text-start text-[#667085]">{l}</th>)}</tr></thead><tbody>{data.orders.map(o => <tr key={o.id} className="border-t border-[#E8DDC0]"><td className="p-3 font-semibold">{o.provider_name}</td><td>{o.branch_name}</td><td>{o.supplier_name}</td><td><span className="rounded-full bg-[#F4E7B6]/60 px-2 py-1 text-xs">{label(o.status)}</span></td><td>{sar(o.subtotal_sar, lang)}</td><td>{operationsDate(o.created_at, lang)}</td><td><button className={button} aria-expanded={detail === o.id} onClick={() => setDetail(detail === o.id ? null : o.id)}>{detail === o.id ? t.close : t.details}</button></td></tr>)}</tbody></table></div>}
        {order && <section className="mt-4 rounded-xl bg-[#F7F3EA] p-4"><h3 className="font-semibold">{order.provider_name} · {order.supplier_name}</h3><p className="my-2 text-xs">{order.id}</p><p className="text-sm">{t.notes}: {order.notes || '—'}</p><ul className="mt-3 space-y-2">{order.items.map((item, index) => <li key={`${order.id}-${index}`} className="flex flex-wrap justify-between gap-3 text-sm"><strong>{item.product_name}</strong><span>{t.quantity}: {item.quantity} · {t.cost}: {sar(item.unit_cost_sar, lang)} · {t.total}: {sar(item.line_total_sar, lang)}</span></li>)}</ul></section>}
      </Panel>
      <Panel title={`${t.health} (${data.total_providers})`}>{!data.provider_health.length ? <p>{t.empty}</p> : <div className="grid gap-4 lg:grid-cols-2">{data.provider_health.map(p => <article key={p.provider_id} className="rounded-xl border border-[#E8DDC0] p-4"><h3 className="font-semibold">{p.provider_name}</h3><p className="my-3 text-sm text-[#667085]">{t.stock_value_sar}: {sar(p.stock_value_sar, lang)} · {t.low_stock_count}: {p.low_stock_count} · {t.pending_orders}: {p.pending_orders}</p><button className={button} onClick={() => { setFilters(f => ({ ...f, provider: p.provider_id, search: '', page: 1 })); setSearch(''); setDetail(null); }}>{t.filter}</button></article>)}</div>}</Panel>
      <Panel title={`${t.activity} (${data.total_movements || 0})`}><p className="mb-4 text-xs text-[#667085]">{t.activityHint}</p>{!data.movements.length ? <p>{t.empty}</p> : <ul className="space-y-3">{data.movements.map(m => <li key={m.id} className="rounded-xl bg-[#F7F3EA] p-4 text-sm"><strong>{m.provider_name} · {m.branch_name} · {m.product_name}</strong><p className="my-2">{t.type}: {label(m.movement_type)} · {t.quantity}: {Number(m.quantity_delta)}</p><p className="text-[#667085]">{t.reason}: {m.reason} · {operationsDate(m.created_at, lang)}</p></li>)}</ul>}</Panel>
      <nav aria-label={t.page} className="flex flex-wrap items-center justify-between gap-3"><button disabled={filters.page <= 1} className={button} onClick={() => { setFilters(f => ({ ...f, page: f.page - 1 })); setDetail(null); }}>{t.previous}</button><span className="text-sm">{t.page} {filters.page} {t.of} {pages}</span><button disabled={filters.page >= pages} className={button} onClick={() => { setFilters(f => ({ ...f, page: f.page + 1 })); setDetail(null); }}>{t.next}</button></nav>
    </>}
  </div>;
}
