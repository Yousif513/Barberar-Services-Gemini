"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { OperationsField as Field, OperationsPanel as Panel, OperationsNotice, operationsButton as button, operationsInput as input, operationsDate } from "@/components/operations-ui";
import { useConfirm } from "@/components/modal";
import { describeServerError } from "../_components/server-errors";

type Branch = { id: string; name_en: string | null; name_ar: string | null };
type Supplier = { id: string; name: string; contact_name: string | null; contact_phone: string | null; contact_email: string | null; payment_terms: string | null; status: "active" | "inactive" };
type Product = { id: string; supplier_id: string | null; name_en: string; name_ar: string; sku: string | null; category: string; unit: string; unit_cost_sar: number; retail_price_sar: number; default_reorder_point: number; is_active: boolean };
type Stock = { branch_id: string; product_id: string; quantity_on_hand: number; quantity_reserved: number; reorder_point_override: number | null };
type Movement = { id: string; branch_id: string; product_id: string; movement_type: string; quantity_delta: number; reason: string | null; created_at: string };
const copy = {
  en: { title: "Manage stock & catalog", supplier: "Edit supplier", product: "Edit product", select: "Choose a record", name: "Name", contact: "Contact", phone: "Phone", email: "Email", terms: "Payment terms", save: "Save changes", activate: "Activate", deactivate: "Deactivate", confirm: "Change availability for this record? Historical records will remain available.", adjustment: "Stock adjustment", transfer: "Branch transfer", branch: "Source branch", destination: "Destination branch", item: "Product", quantity: "Quantity (negative to remove)", transferQuantity: "Quantity to transfer", reason: "Reason", waste: "Record as waste", submit: "Apply stock change", confirmStock: "Apply this stock change? It will be recorded in the movement history.", saved: "Change saved.", history: "Recent stock movements (latest 50)", empty: "No records available.", reorder: "Reorder suggestions", prepare: "Prepare purchase order", units: "Available", point: "Reorder point", sku: "SKU", category: "Category", unit: "Unit", cost: "Unit cost (SAR)", price: "Retail price (SAR)", en: "English name", ar: "Arabic name", required: "Enter a valid quantity and a reason of at least three characters.", noSupplier: "Assign an active supplier to this product before reordering.", loading: "Loading movement history...", retry: "Retry", close: "Close", received: "Received", transfer_in: "Transfer in", transfer_out: "Transfer out", sale: "Sale" },
  ar: { title: "إدارة المخزون والكتالوج", supplier: "تعديل المورد", product: "تعديل المنتج", select: "اختر سجلا", name: "الاسم", contact: "جهة الاتصال", phone: "الهاتف", email: "البريد الإلكتروني", terms: "شروط الدفع", save: "حفظ التغييرات", activate: "تفعيل", deactivate: "تعطيل", confirm: "تغيير حالة هذا السجل؟ ستبقى السجلات السابقة متاحة.", adjustment: "تعديل المخزون", transfer: "نقل بين الفروع", branch: "الفرع المصدر", destination: "الفرع المستلم", item: "المنتج", quantity: "الكمية (سالبة للخصم)", transferQuantity: "الكمية المنقولة", reason: "السبب", waste: "تسجيل كتالف", submit: "تنفيذ تغيير المخزون", confirmStock: "تنفيذ التغيير وتسجيله في سجل الحركات؟", saved: "تم حفظ التغيير.", history: "حركات المخزون الحديثة (آخر ٥٠ حركة)", empty: "لا توجد سجلات متاحة.", reorder: "اقتراحات إعادة الطلب", prepare: "إعداد طلب شراء", units: "المتاح", point: "حد إعادة الطلب", sku: "رمز المنتج", category: "الفئة", unit: "الوحدة", cost: "تكلفة الوحدة (ريال)", price: "سعر البيع (ريال)", en: "الاسم بالإنجليزية", ar: "الاسم بالعربية", required: "أدخل كمية صحيحة وسببا من ثلاثة أحرف على الأقل.", noSupplier: "حدد موردا نشطا لهذا المنتج قبل إعادة الطلب.", loading: "جاري تحميل سجل الحركات...", retry: "إعادة المحاولة", close: "إغلاق", received: "استلام", transfer_in: "نقل وارد", transfer_out: "نقل صادر", sale: "بيع" }
};

export function InventoryControls({ lang, providerId, branches, suppliers, products, stock, reload, onReorder }: {
  lang: "en" | "ar"; providerId: string; branches: Branch[]; suppliers: Supplier[]; products: Product[]; stock: Stock[];
  reload: () => Promise<void>; onReorder: (branchId: string, product: Product, quantity: number) => void;
}) {
  const t = copy[lang];
  const [confirmNode, askConfirm] = useConfirm(lang);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({ branch: "", destination: "", product: "", quantity: "", reason: "", transfer: false, waste: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [history, setHistory] = useState<Movement[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const request = useRef<{ payload: string; id: string } | null>(null);
  const name = (p: Product) => lang === "ar" ? p.name_ar : p.name_en;
  const branchName = (id: string) => { const b = branches.find(b => b.id === id); return (lang === "ar" ? b?.name_ar : b?.name_en) || id; };
  useEffect(() => {
    let active = true;
    void (async () => {
      setHistoryLoading(true);
      const result = await supabase.from("inventory_stock_movements").select("id,branch_id,product_id,movement_type,quantity_delta,reason,created_at").eq("provider_id", providerId).order("created_at", { ascending: false }).limit(50);
      if (!active) return;
      setHistoryError(result.error ? describeServerError(result.error, lang) : "");
      setHistory((result.data || []) as Movement[]); setHistoryLoading(false);
    })();
    return () => { active = false; };
  }, [providerId, revision, lang]);
  const suggestions = useMemo(() => branches.flatMap(b => products.filter(p => p.is_active).flatMap(p => {
    const s = stock.find(s => s.branch_id === b.id && s.product_id === p.id);
    const available = Number(s?.quantity_on_hand || 0) - Number(s?.quantity_reserved || 0);
    const point = Number(s?.reorder_point_override ?? p.default_reorder_point);
    return point > 0 && available <= point ? [{ branch: b.id, product: p, available, point }] : [];
  })), [branches, products, stock]);
  const run = async (operation: () => PromiseLike<{ error: unknown }>) => {
    setSaving(true); setError(""); setSuccess("");
    try { const result = await operation(); if (result.error) throw result.error; await reload(); setRevision(r => r + 1); setSuccess(t.saved); return true; }
    catch (e) { setError(describeServerError(e, lang)); return false; } finally { setSaving(false); }
  };
  const submitStock = async (event: React.FormEvent) => {
    event.preventDefault();
    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || !quantity || form.reason.trim().length < 3 || (form.transfer && (quantity <= 0 || form.branch === form.destination)) || (form.waste && !form.transfer && quantity >= 0)) { setError(t.required); return; }
    if (!(await askConfirm({ title: t.confirmStock, confirmLabel: t.submit }))) return;
    const payload = JSON.stringify(form);
    if (request.current?.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
    const common = { p_product_id: form.product, p_reason: form.reason.trim(), p_request_id: request.current.id };
    const ok = await run(() => form.transfer
      ? supabase.rpc("transfer_branch_inventory_stock", { ...common, p_from_branch_id: form.branch, p_to_branch_id: form.destination, p_quantity: quantity })
      : supabase.rpc("adjust_branch_inventory_stock", { ...common, p_branch_id: form.branch, p_quantity_delta: quantity, p_movement_type: form.waste ? "waste" : "adjustment" }));
    if (ok) { request.current = null; setForm(f => ({ ...f, quantity: "", reason: "" })); }
  };
  // Switching a record off or on keeps its history; the shared dialog asks first and names the action.
  const toggleAvailability = async () => {
    const active = supplier ? supplier.status === "active" : Boolean(product?.is_active);
    if (!(await askConfirm({ title: t.confirm, confirmLabel: active ? t.deactivate : t.activate, tone: active ? "danger" : "default" }))) return;
    const ok = supplier
      ? await run(() => supabase.from("inventory_suppliers").update({ status: supplier.status === "active" ? "inactive" : "active" }).eq("id", supplier.id).eq("provider_id", providerId).select("id").single())
      : product ? await run(() => supabase.from("inventory_products").update({ is_active: !product.is_active }).eq("id", product.id).eq("provider_id", providerId).select("id").single()) : false;
    if (ok) { setSupplier(null); setProduct(null); }
  };
  const saveCatalog = async (event: React.FormEvent) => {
    event.preventDefault();
    if (supplier) {
      const { id, ...values } = supplier;
      if (await run(() => supabase.from("inventory_suppliers").update(values).eq("id", id).eq("provider_id", providerId).select("id").single())) setSupplier(null);
    } else if (product) {
      const values = { name_en: product.name_en, name_ar: product.name_ar, supplier_id: product.supplier_id || null, sku: product.sku || null, category: product.category, unit: product.unit,
        unit_cost_sar: Number(product.unit_cost_sar), retail_price_sar: Number(product.retail_price_sar), default_reorder_point: Number(product.default_reorder_point) };
      if (await run(() => supabase.from("inventory_products").update(values).eq("id", product.id).eq("provider_id", providerId).select("id").single())) setProduct(null);
    }
  };
  return <Panel title={t.title}><div className="space-y-5">
    <OperationsNotice error={error} success={success} />
    <div className="grid gap-4 md:grid-cols-2">
      <Field label={t.supplier}><select className={input} value={supplier?.id || ""} onChange={e => { setProduct(null); setSupplier(suppliers.find(s => s.id === e.target.value) || null); }}><option value="">{t.select}</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label={t.product}><select className={input} value={product?.id || ""} onChange={e => { setSupplier(null); setProduct(products.find(p => p.id === e.target.value) || null); }}><option value="">{t.select}</option>{products.map(p => <option key={p.id} value={p.id}>{name(p)}</option>)}</select></Field>
    </div>
    {(supplier || product) && <form onSubmit={saveCatalog} className="grid gap-4 rounded-xl bg-[#F7F3EA] p-4 md:grid-cols-2">
      {supplier && <>{([['name', t.name], ['contact_name', t.contact], ['contact_phone', t.phone], ['contact_email', t.email], ['payment_terms', t.terms]] as const).map(([key, label]) => <Field key={key} label={label}><input required={key === 'name'} type={key === 'contact_email' ? 'email' : 'text'} className={input} value={supplier[key] || ""} onChange={e => setSupplier({ ...supplier, [key]: e.target.value })} /></Field>)}</>}
      {product && <>{([['name_en', t.en], ['name_ar', t.ar], ['sku', t.sku], ['category', t.category], ['unit', t.unit], ['unit_cost_sar', t.cost], ['retail_price_sar', t.price], ['default_reorder_point', t.point]] as const).map(([key, label]) => <Field key={key} label={label}><input required={key !== 'sku'} className={input} type={['unit_cost_sar', 'retail_price_sar', 'default_reorder_point'].includes(key) ? 'number' : 'text'} min="0" step="0.001" value={product[key] ?? ""} onChange={e => setProduct({ ...product, [key]: e.target.value })} /></Field>)}<Field label={t.supplier}><select className={input} value={product.supplier_id || ""} onChange={e => setProduct({ ...product, supplier_id: e.target.value || null })}><option value="">{t.select}</option>{suppliers.filter(s => s.status === 'active' || s.id === product.supplier_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field></>}
      <div className="flex flex-wrap gap-2 md:col-span-2"><button disabled={saving} className={button}>{t.save}</button><button type="button" disabled={saving} className={button} onClick={() => void toggleAvailability()}>{(supplier ? supplier.status === 'active' : product?.is_active) ? t.deactivate : t.activate}</button><button type="button" className={button} onClick={() => { setSupplier(null); setProduct(null); }}>{t.close}</button></div>
    </form>}
    <form onSubmit={submitStock} className="grid gap-4 border-t border-[#E8DDC0] pt-4 md:grid-cols-3">
      <div className="flex gap-2 md:col-span-3"><button type="button" className={button} aria-pressed={!form.transfer} onClick={() => setForm(f => ({ ...f, transfer: false }))}>{t.adjustment}</button><button type="button" className={button} aria-pressed={form.transfer} onClick={() => setForm(f => ({ ...f, transfer: true }))}>{t.transfer}</button></div>
      <Field label={t.branch}><select required className={input} value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}><option value="">{t.select}</option>{branches.map(b => <option key={b.id} value={b.id}>{branchName(b.id)}</option>)}</select></Field>
      {form.transfer && <Field label={t.destination}><select required className={input} value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}><option value="">{t.select}</option>{branches.filter(b => b.id !== form.branch).map(b => <option key={b.id} value={b.id}>{branchName(b.id)}</option>)}</select></Field>}
      <Field label={t.item}><select required className={input} value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))}><option value="">{t.select}</option>{products.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{name(p)}</option>)}</select></Field>
      <Field label={form.transfer ? t.transferQuantity : t.quantity}><input className={input} type="number" step="0.001" required value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></Field>
      <Field label={t.reason}><input className={input} minLength={3} required value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} /></Field>
      {!form.transfer && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.waste} onChange={e => setForm(f => ({ ...f, waste: e.target.checked }))} />{t.waste}</label>}
      <div className="md:col-span-3"><button className={button} disabled={saving || !branches.length || !products.some(p => p.is_active)}>{t.submit}</button></div>
    </form>
    <h3 className="font-semibold text-[#101828]">{t.reorder}</h3>{!suggestions.length && <p className="text-sm text-[#667085]">{t.empty}</p>}
    <div className="grid gap-3 md:grid-cols-2">{suggestions.map(s => <div key={`${s.branch}-${s.product.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D1AF47]/30 p-3"><div className="text-sm"><strong>{name(s.product)}</strong><p>{branchName(s.branch)} · {t.units}: {s.available} · {t.point}: {s.point}</p></div><button className={button} disabled={saving} onClick={() => {
      if (!suppliers.some(supplier => supplier.id === s.product.supplier_id && supplier.status === 'active')) { setError(t.noSupplier); return; }
      onReorder(s.branch, s.product, Math.max(1, s.point - s.available));
    }}>{t.prepare}</button></div>)}</div>
    <h3 className="font-semibold text-[#101828]">{t.history}</h3>
    {historyLoading ? <p role="status">{t.loading}</p> : historyError ? <div role="alert">{historyError} <button className={button} onClick={() => setRevision(r => r + 1)}>{t.retry}</button></div> : !history.length ? <p>{t.empty}</p> : <ul className="max-h-72 space-y-2 overflow-y-auto">{history.map(m => <li key={m.id} className="rounded-xl bg-[#F7F3EA] p-3 text-sm"><strong>{products.find(p => p.id === m.product_id) ? name(products.find(p => p.id === m.product_id)!) : m.product_id}</strong> · {branchName(m.branch_id)} · {t[m.movement_type as keyof typeof t] || m.movement_type} · {Number(m.quantity_delta)}<p className="text-[#667085]">{m.reason} · {operationsDate(m.created_at, lang)}</p></li>)}</ul>}
  {confirmNode}</div></Panel>;
}
