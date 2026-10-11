"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { InventoryControls } from "./inventory-controls";
import { readAllOperationsRows } from "@/lib/operations-data";
import { ForbiddenNotice, isForbidden, useOperationsLocale } from "@/components/operations-ui";
import { CommandDialog, useConfirm } from "@/components/modal";
import { describeServerError } from "../_components/server-errors";

type Branch = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
};

type Supplier = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  payment_terms: string | null;
  status: "active" | "inactive";
};

type Product = {
  id: string;
  supplier_id: string | null;
  sku: string | null;
  name_en: string;
  name_ar: string;
  category: string;
  unit: string;
  unit_cost_sar: number;
  retail_price_sar: number;
  default_reorder_point: number;
  is_active: boolean;
  inventory_suppliers?: { name: string } | null;
};

type StockRow = {
  id: string;
  branch_id: string;
  product_id: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  reorder_point_override: number | null;
  branches?: Branch | null;
  inventory_products?: Product | null;
};

type PurchaseOrder = {
  id: string;
  branch_id: string | null;
  supplier_id: string;
  status: "draft" | "submitted" | "approved" | "received" | "cancelled";
  subtotal_sar: number;
  notes: string | null;
  created_at: string;
  inventory_suppliers?: { name: string } | null;
  branches?: Branch | null;
  supplier_purchase_order_items?: Array<{
    id: string;
    quantity: number;
    unit_cost_sar: number;
    line_total_sar: number;
    inventory_products?: Pick<Product, "name_en" | "name_ar" | "unit"> | null;
  }>;
};

const translations = {
  en: {
    title: "Inventory & Suppliers",
    subtitle: "Enterprise stock control, supplier ordering, and branch-level reorder visibility.",
    loading: "Loading inventory operations...",
    noProvider: "No provider profile or branch-manager membership is linked to this account.",
    loadFailed: "Failed to load inventory data.",
    supplierSaved: "Supplier saved.",
    productSaved: "Product saved.",
    orderCreated: "Purchase order created.",
    orderUpdated: "Purchase order updated.",
    saveFailed: "Could not save the change.",
    receiveReason: "Received into branch stock",
    suppliers: "Suppliers",
    products: "Products",
    stock: "Branch Stock",
    purchaseOrders: "Purchase Orders",
    addSupplier: "Add Supplier",
    addProduct: "Add Product",
    createOrder: "Create PO",
    supplierName: "Supplier name",
    contactName: "Contact name",
    phone: "Phone",
    productNameEn: "Product name English",
    productNameAr: "Product name Arabic",
    sku: "SKU",
    category: "Category",
    unit: "Unit",
    cost: "Cost SAR",
    retail: "Retail SAR",
    reorderPoint: "Reorder point",
    supplier: "Supplier",
    branch: "Branch",
    product: "Product",
    quantity: "Quantity",
    notes: "Notes",
    save: "Save",
    submit: "Submit",
    approve: "Approve",
    receive: "Receive Stock",
    cancel: "Cancel",
    lowStock: "Low stock",
    healthy: "Healthy",
    onHand: "On hand",
    reserved: "Reserved",
    totalValue: "Retail stock value",
    pendingOrders: "Pending orders",
    reorderAlerts: "Reorder alerts",
    noSuppliers: "No suppliers yet. Add your first supplier to start purchase ordering.",
    noProducts: "No products yet. Add retail or professional-use products to track stock.",
    noStock: "No branch stock yet. Receive an approved purchase order to create stock balances.",
    noOrders: "No purchase orders yet.",
    required: "Complete the required fields first.",
    sar: "SAR"
    , operations: "Stock & supply operations", retry: "Retry", cancellationReason: "Why cancel this order?", cancelOrderConfirm: "Cancel order", confirmReceive: "Receive this order into branch stock?", confirmCancel: "Cancel this purchase order?"
  },
  ar: {
    title: "المخزون والموردون",
    subtitle: "تحكم مؤسسي بالمخزون وطلبات الموردين وتنبيهات إعادة الطلب لكل فرع.",
    loading: "جاري تحميل عمليات المخزون...",
    noProvider: "لا يوجد مزود أو صلاحية مدير فرع مرتبطة بهذا الحساب.",
    loadFailed: "تعذر تحميل بيانات المخزون.",
    supplierSaved: "تم حفظ المورد.",
    productSaved: "تم حفظ المنتج.",
    orderCreated: "تم إنشاء طلب الشراء.",
    orderUpdated: "تم تحديث طلب الشراء.",
    saveFailed: "تعذر حفظ التغيير.",
    receiveReason: "استلام في مخزون الفرع",
    suppliers: "الموردون",
    products: "المنتجات",
    stock: "مخزون الفروع",
    purchaseOrders: "طلبات الشراء",
    addSupplier: "إضافة مورد",
    addProduct: "إضافة منتج",
    createOrder: "إنشاء طلب",
    supplierName: "اسم المورد",
    contactName: "اسم جهة الاتصال",
    phone: "الهاتف",
    productNameEn: "اسم المنتج بالإنجليزية",
    productNameAr: "اسم المنتج بالعربية",
    sku: "رمز المنتج",
    category: "الفئة",
    unit: "الوحدة",
    cost: "التكلفة بالريال",
    retail: "سعر البيع بالريال",
    reorderPoint: "حد إعادة الطلب",
    supplier: "المورد",
    branch: "الفرع",
    product: "المنتج",
    quantity: "الكمية",
    notes: "ملاحظات",
    save: "حفظ",
    submit: "إرسال",
    approve: "اعتماد",
    receive: "استلام المخزون",
    cancel: "إلغاء",
    lowStock: "مخزون منخفض",
    healthy: "مستقر",
    onHand: "المتوفر",
    reserved: "المحجوز",
    totalValue: "قيمة المخزون للبيع",
    pendingOrders: "طلبات قيد المتابعة",
    reorderAlerts: "تنبيهات إعادة الطلب",
    noSuppliers: "لا يوجد موردون بعد. أضف أول مورد لبدء طلبات الشراء.",
    noProducts: "لا توجد منتجات بعد. أضف منتجات البيع أو الاستخدام المهني لتتبع المخزون.",
    noStock: "لا يوجد رصيد مخزون بعد. استلم طلب شراء معتمد لإنشاء أرصدة الفروع.",
    noOrders: "لا توجد طلبات شراء بعد.",
    required: "أكمل الحقول المطلوبة أولا.",
    sar: "ريال"
    , operations: "عمليات المخزون والتوريد", retry: "إعادة المحاولة", cancellationReason: "ما سبب إلغاء الطلب؟", cancelOrderConfirm: "إلغاء الطلب", confirmReceive: "استلام هذا الطلب في مخزون الفرع؟", confirmCancel: "إلغاء طلب الشراء؟"
  }
};

const numberValue = (value: unknown) => Number(value || 0);

export default function ProviderInventoryPage() {
  const lang = useOperationsLocale();
  const [confirmNode, askConfirm] = useConfirm(lang);
  const [forbidden, setForbidden] = useState(false);
  const [cancelFor, setCancelFor] = useState<PurchaseOrder | null>(null);
  const [providerId, setProviderId] = useState("");
  const [canApprove, setCanApprove] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  // True only after every inventory query succeeded; a failed load must not look like an empty catalogue.
  const [dataLoaded, setDataLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: "", contactName: "", phone: "" });
  const [productForm, setProductForm] = useState({
    supplierId: "",
    sku: "",
    nameEn: "",
    nameAr: "",
    category: "retail",
    unit: "unit",
    cost: "0",
    retail: "0",
    reorderPoint: "0"
  });
  const [orderForm, setOrderForm] = useState({
    branchId: "",
    supplierId: "",
    productId: "",
    quantity: "1",
    unitCost: "",
    notes: ""
  });

  const t = translations[lang];
  const isRTL = lang === "ar";

  const branchName = useCallback((branch?: Branch | null) => {
    if (!branch) return "";
    return lang === "ar" ? branch.name_ar || branch.name_en || "" : branch.name_en || branch.name_ar || "";
  }, [lang]);

  const productName = useCallback((product?: Pick<Product, "name_en" | "name_ar"> | null) => {
    if (!product) return "";
    return lang === "ar" ? product.name_ar || product.name_en : product.name_en || product.name_ar;
  }, [lang]);

  const money = useCallback((value: number) => `${Number(value || 0).toLocaleString(lang === "ar" ? "ar-SA" : "en-US")} ${t.sar}`, [lang, t.sar]);

  const metrics = useMemo(() => {
    const totalValue = stockRows.reduce((sum, row) => {
      const retail = numberValue(row.inventory_products?.retail_price_sar);
      return sum + numberValue(row.quantity_on_hand) * retail;
    }, 0);
    const lowStockCount = branches.reduce((count, branch) => count + products.filter(product => {
      if (!product.is_active) return false;
      const row = stockRows.find(row => row.branch_id === branch.id && row.product_id === product.id);
      const reorderPoint = numberValue(row?.reorder_point_override ?? product.default_reorder_point);
      return reorderPoint > 0 && numberValue(row?.quantity_on_hand) - numberValue(row?.quantity_reserved) <= reorderPoint;
    }).length, 0);
    const pendingOrders = orders.filter((order) => ["draft", "submitted", "approved"].includes(order.status)).length;
    return { totalValue, lowStockCount, pendingOrders };
  }, [orders, stockRows, branches, products]);

  const loadInventory = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setDataLoaded(false);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) {
        setProviderId("");
        setError(t.noProvider);
        return;
      }

      const { data: context, error: contextError } = await supabase.rpc("get_provider_operations_context");
      if (contextError) throw contextError;
      const resolvedProviderId: string = context?.provider_id || "";
      const permitted = (context?.memberships || []).filter((m: { is_active: boolean; permissions: { inventory?: boolean }; role: string }) =>
        m.is_active && m.permissions.inventory === true && ["manager", "branch_manager", "inventory_manager", "receptionist"].includes(m.role));
      const unscoped = context?.can_manage_memberships || permitted.some((m: { branch_id: string | null }) => !m.branch_id);
      const scopedBranchIds: string[] = unscoped ? [] : permitted.map((m: { branch_id: string }) => m.branch_id);
      setCanApprove(Boolean(context?.can_manage_memberships));
      if (!unscoped && !scopedBranchIds.length) throw new Error(t.noProvider);

      if (!resolvedProviderId) {
        setProviderId("");
        setError(t.noProvider);
        return;
      }

      setProviderId(resolvedProviderId);

      let branchQuery = supabase
        .from("branches")
        .select("id, name_en, name_ar")
        .eq("provider_id", resolvedProviderId)
        .order("created_at", { ascending: true });

      if (scopedBranchIds.length > 0) {
        branchQuery = branchQuery.in("id", scopedBranchIds);
      }

      const [branchResult, supplierResult, productResult, orderResult] = await Promise.all([
        readAllOperationsRows((start, end) => branchQuery.range(start, end)),
        readAllOperationsRows((start, end) => supabase
          .from("inventory_suppliers")
          .select("id, name, contact_name, contact_phone, contact_email, payment_terms, status")
          .eq("provider_id", resolvedProviderId)
          .order("name", { ascending: true }).order("id").range(start, end)),
        readAllOperationsRows((start, end) => supabase
          .from("inventory_products")
          .select("*, inventory_suppliers(name)")
          .eq("provider_id", resolvedProviderId)
          .order("created_at", { ascending: false }).order("id").range(start, end)),
        readAllOperationsRows((start, end) => supabase
          .from("supplier_purchase_orders")
          .select(`
            *,
            inventory_suppliers(name),
            branches(id, name_en, name_ar),
            supplier_purchase_order_items(
              id,
              quantity,
              unit_cost_sar,
              line_total_sar,
              inventory_products(name_en, name_ar, unit)
            )
          `)
          .eq("provider_id", resolvedProviderId)
          .order("created_at", { ascending: false }).order("id").range(start, end))
      ]);

      if (branchResult.error) throw branchResult.error;
      if (supplierResult.error) throw supplierResult.error;
      if (productResult.error) throw productResult.error;
      if (orderResult.error) throw orderResult.error;

      const resolvedBranches = (branchResult.data || []) as Branch[];
      setBranches(resolvedBranches);
      setSuppliers((supplierResult.data || []) as unknown as Supplier[]);
      setProducts((productResult.data || []) as unknown as Product[]);
      setOrders((orderResult.data || []) as unknown as PurchaseOrder[]);

      const branchIds = resolvedBranches.map((branch) => branch.id);
      if (branchIds.length === 0) {
        setStockRows([]);
        return;
      }

      const { data: stockData, error: stockError } = await readAllOperationsRows((start, end) => supabase
        .from("branch_inventory_stock")
        .select(`
          id,
          branch_id,
          product_id,
          quantity_on_hand,
          quantity_reserved,
          reorder_point_override,
          branches(id, name_en, name_ar),
          inventory_products(id, name_en, name_ar, category, unit, retail_price_sar, default_reorder_point)
        `)
        .in("branch_id", branchIds)
        .order("updated_at", { ascending: false }).order("id").range(start, end));

      if (stockError) throw stockError;
      setStockRows((stockData || []) as unknown as StockRow[]);
      setDataLoaded(true);
    } catch (err) {
      console.error("Inventory operations load failed:", err);
      setBranches([]); setSuppliers([]); setProducts([]); setStockRows([]); setOrders([]);
      setForbidden(isForbidden(err));
      setError(`${t.loadFailed} ${describeServerError(err, lang)}`);
    } finally {
      setLoading(false);
    }
  }, [t.loadFailed, t.noProvider, lang]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadInventory();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadInventory]);

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  const saveSupplier = async () => {
    clearMessages();
    if (!providerId || !supplierForm.name.trim()) {
      setError(t.required);
      return;
    }
    try {
      setSaving(true);
      const { error: insertError } = await supabase
        .from("inventory_suppliers")
        .insert({
          provider_id: providerId,
          name: supplierForm.name.trim(),
          contact_name: supplierForm.contactName.trim() || null,
          contact_phone: supplierForm.phone.trim() || null
        });
      if (insertError) throw insertError;
      setSupplierForm({ name: "", contactName: "", phone: "" });
      setShowSupplierForm(false);
      setSuccess(t.supplierSaved);
      await loadInventory();
    } catch (err) {
      console.error("Supplier save failed:", err);
      setError(`${t.saveFailed} ${describeServerError(err, lang)}`);
    } finally {
      setSaving(false);
    }
  };

  const saveProduct = async () => {
    clearMessages();
    if (!providerId || !productForm.nameEn.trim() || !productForm.nameAr.trim()) {
      setError(t.required);
      return;
    }
    try {
      setSaving(true);
      const { error: insertError } = await supabase
        .from("inventory_products")
        .insert({
          provider_id: providerId,
          supplier_id: productForm.supplierId || null,
          sku: productForm.sku.trim() || null,
          name_en: productForm.nameEn.trim(),
          name_ar: productForm.nameAr.trim(),
          category: productForm.category.trim() || "retail",
          unit: productForm.unit.trim() || "unit",
          unit_cost_sar: Number(productForm.cost || 0),
          retail_price_sar: Number(productForm.retail || 0),
          default_reorder_point: Number(productForm.reorderPoint || 0)
        });
      if (insertError) throw insertError;
      setProductForm({
        supplierId: "",
        sku: "",
        nameEn: "",
        nameAr: "",
        category: "retail",
        unit: "unit",
        cost: "0",
        retail: "0",
        reorderPoint: "0"
      });
      setShowProductForm(false);
      setSuccess(t.productSaved);
      await loadInventory();
    } catch (err) {
      console.error("Product save failed:", err);
      setError(`${t.saveFailed} ${describeServerError(err, lang)}`);
    } finally {
      setSaving(false);
    }
  };

  const createOrder = async () => {
    clearMessages();
    if (!providerId || !orderForm.branchId || !orderForm.supplierId || !orderForm.productId || Number(orderForm.quantity) <= 0) {
      setError(t.required);
      return;
    }
    try {
      setSaving(true);
      const selectedProduct = products.find((product) => product.id === orderForm.productId);
      const unitCost = Number(orderForm.unitCost || selectedProduct?.unit_cost_sar || 0);
      const { error: rpcError } = await supabase.rpc("create_supplier_purchase_order", {
        p_provider_id: providerId,
        p_branch_id: orderForm.branchId,
        p_supplier_id: orderForm.supplierId,
        p_notes: orderForm.notes,
        p_items: [{
          product_id: orderForm.productId,
          quantity: Number(orderForm.quantity),
          unit_cost_sar: unitCost
        }]
      });
      if (rpcError) throw rpcError;
      setOrderForm({ branchId: "", supplierId: "", productId: "", quantity: "1", unitCost: "", notes: "" });
      setShowOrderForm(false);
      setSuccess(t.orderCreated);
      await loadInventory();
    } catch (err) {
      console.error("Purchase order create failed:", err);
      setError(`${t.saveFailed} ${describeServerError(err, lang)}`);
    } finally {
      setSaving(false);
    }
  };

  // One command runs every purchase-order transition. It answers with the server's reason (translated) or null on success,
  // so the dialog that asked for a reason can stay open and keep what was typed.
  const runTransition = async (order: PurchaseOrder, action: "submit" | "approve" | "receive" | "cancel", reason: string | null): Promise<string | null> => {
    clearMessages();
    setSaving(true);
    const { error: rpcError } = await supabase.rpc("transition_supplier_purchase_order", {
      p_order_id: order.id,
      p_action: action,
      p_reason: reason
    });
    setSaving(false);
    if (rpcError) return describeServerError(rpcError, lang);
    setSuccess(t.orderUpdated);
    await loadInventory();
    return null;
  };

  const transitionOrder = async (order: PurchaseOrder, action: "submit" | "approve" | "receive" | "cancel") => {
    if (action === "cancel") {
      setCancelFor(order);
      return;
    }
    if (action === "receive") {
      const yes = await askConfirm({ title: t.confirmReceive, confirmLabel: t.receive });
      if (!yes) return;
    }
    const message = await runTransition(order, action, action === "receive" ? t.receiveReason : null);
    if (message) setError(`${t.saveFailed} ${message}`);
  };

  const activeProducts = products.filter((product) => product.is_active);

  const renderTextInput = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    type = "text"
  ) => (
    <label className="space-y-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#667085]">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-[#101828] outline-none transition focus:border-[#D1AF47]/60 ${isRTL ? "text-right" : "text-left"}`}
      />
    </label>
  );

  if (loading && !providerId) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#ECECEC] border-t-[#D1AF47]" />
        <p className="text-sm font-bold text-[#667085]">{t.loading}</p>
      </div>
    );
  }

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#D1AF47]">{t.operations}</p>
          <h1 className="mt-2 font-serif text-3xl font-black text-[#101828]">{t.title}</h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold text-[#667085]">{t.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowSupplierForm((value) => !value)} className="rounded-2xl border border-[#D1AF47]/30 bg-white px-4 py-2.5 text-xs font-black text-[#9B7928] shadow-[0_8px_30px_rgba(0,0,0,0.015)] transition hover:border-[#D1AF47]">
            {t.addSupplier}
          </button>
          <button onClick={() => setShowProductForm((value) => !value)} className="rounded-2xl border border-[#D1AF47]/30 bg-white px-4 py-2.5 text-xs font-black text-[#9B7928] shadow-[0_8px_30px_rgba(0,0,0,0.015)] transition hover:border-[#D1AF47]">
            {t.addProduct}
          </button>
          <button onClick={() => setShowOrderForm((value) => !value)} className="rounded-2xl bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] px-4 py-2.5 text-xs font-black text-[#070B12] shadow-[0_0_24px_rgba(209,175,71,0.22)] transition hover:scale-[1.01]">
            {t.createOrder}
          </button>
        </div>
      </div>

      {forbidden && <ForbiddenNotice locale={lang} />}
      {error && !forbidden && <div role="alert" className="rounded-2xl border border-[#FF5D73]/20 bg-[#FF5D73]/10 p-4 text-sm font-bold text-[#B42318]">{error} <button onClick={() => void loadInventory()} className="underline">{t.retry}</button></div>}
      {success && <div className="rounded-2xl border border-[#3DDC84]/20 bg-[#3DDC84]/10 p-4 text-sm font-bold text-[#15803D]">{success}</div>}

      {providerId && dataLoaded && <InventoryControls lang={lang} providerId={providerId} branches={branches} suppliers={suppliers} products={products} stock={stockRows} reload={loadInventory} onReorder={(branchId, product, quantity) => {
        setOrderForm({ branchId, productId: product.id, supplierId: product.supplier_id || "", quantity: String(quantity), unitCost: String(product.unit_cost_sar), notes: "" });
        setShowOrderForm(true);
        window.setTimeout(() => document.getElementById("inventory-order-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
      }} />}
      {dataLoaded && (<>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          [t.totalValue, money(metrics.totalValue)],
          [t.pendingOrders, String(metrics.pendingOrders)],
          [t.reorderAlerts, String(metrics.lowStockCount)]
        ].map(([label, value]) => (
          <div key={label} className="rounded-[26px] border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.015)]">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#667085]">{label}</span>
            <strong className="mt-3 block text-2xl font-black text-[#101828]">{value}</strong>
          </div>
        ))}
      </section>

      {(showSupplierForm || showProductForm || showOrderForm) && (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {showSupplierForm && (
            <div className="rounded-[28px] border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.015)]">
              <h2 className="mb-4 text-sm font-black text-[#101828]">{t.addSupplier}</h2>
              <div className="space-y-4">
                {renderTextInput(t.supplierName, supplierForm.name, (value) => setSupplierForm((form) => ({ ...form, name: value })))}
                {renderTextInput(t.contactName, supplierForm.contactName, (value) => setSupplierForm((form) => ({ ...form, contactName: value })))}
                {renderTextInput(t.phone, supplierForm.phone, (value) => setSupplierForm((form) => ({ ...form, phone: value })))}
                <button disabled={saving} onClick={() => void saveSupplier()} className="w-full rounded-2xl bg-[#101828] px-4 py-3 text-xs font-black text-white transition hover:bg-[#D1AF47] hover:text-[#070B12] disabled:opacity-50">
                  {t.save}
                </button>
              </div>
            </div>
          )}

          {showProductForm && (
            <div className="rounded-[28px] border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.015)] xl:col-span-2">
              <h2 className="mb-4 text-sm font-black text-[#101828]">{t.addProduct}</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {renderTextInput(t.productNameEn, productForm.nameEn, (value) => setProductForm((form) => ({ ...form, nameEn: value })))}
                {renderTextInput(t.productNameAr, productForm.nameAr, (value) => setProductForm((form) => ({ ...form, nameAr: value })))}
                {renderTextInput(t.sku, productForm.sku, (value) => setProductForm((form) => ({ ...form, sku: value })))}
                <label className="space-y-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#667085]">
                  {t.supplier}
                  <select value={productForm.supplierId} onChange={(event) => setProductForm((form) => ({ ...form, supplierId: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-[#101828] outline-none focus:border-[#D1AF47]/60">
                    <option value="">{t.supplier}</option>
                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                </label>
                {renderTextInput(t.category, productForm.category, (value) => setProductForm((form) => ({ ...form, category: value })))}
                {renderTextInput(t.unit, productForm.unit, (value) => setProductForm((form) => ({ ...form, unit: value })))}
                {renderTextInput(t.cost, productForm.cost, (value) => setProductForm((form) => ({ ...form, cost: value })), "number")}
                {renderTextInput(t.retail, productForm.retail, (value) => setProductForm((form) => ({ ...form, retail: value })), "number")}
                {renderTextInput(t.reorderPoint, productForm.reorderPoint, (value) => setProductForm((form) => ({ ...form, reorderPoint: value })), "number")}
              </div>
              <button disabled={saving} onClick={() => void saveProduct()} className="mt-4 rounded-2xl bg-[#101828] px-5 py-3 text-xs font-black text-white transition hover:bg-[#D1AF47] hover:text-[#070B12] disabled:opacity-50">
                {t.save}
              </button>
            </div>
          )}

          {showOrderForm && (
            <div id="inventory-order-form" className="rounded-[28px] border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.015)] xl:col-span-3">
              <h2 className="mb-4 text-sm font-black text-[#101828]">{t.createOrder}</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
                <label className="space-y-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#667085]">
                  {t.branch}
                  <select value={orderForm.branchId} onChange={(event) => setOrderForm((form) => ({ ...form, branchId: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-[#101828] outline-none focus:border-[#D1AF47]/60">
                    <option value="">{t.branch}</option>
                    {branches.map((branch) => <option key={branch.id} value={branch.id}>{branchName(branch)}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#667085]">
                  {t.supplier}
                  <select value={orderForm.supplierId} onChange={(event) => setOrderForm((form) => ({ ...form, supplierId: event.target.value, productId: "", unitCost: "" }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-[#101828] outline-none focus:border-[#D1AF47]/60">
                    <option value="">{t.supplier}</option>
                    {suppliers.filter(s => s.status === "active").map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#667085] md:col-span-2">
                  {t.product}
                  <select value={orderForm.productId} onChange={(event) => {
                    const product = activeProducts.find((item) => item.id === event.target.value);
                    setOrderForm((form) => ({ ...form, productId: event.target.value, unitCost: product ? String(product.unit_cost_sar) : form.unitCost }));
                  }} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-[#101828] outline-none focus:border-[#D1AF47]/60">
                    <option value="">{t.product}</option>
                    {activeProducts.filter(p => !p.supplier_id || p.supplier_id === orderForm.supplierId).map((product) => <option key={product.id} value={product.id}>{productName(product)}</option>)}
                  </select>
                </label>
                {renderTextInput(t.quantity, orderForm.quantity, (value) => setOrderForm((form) => ({ ...form, quantity: value })), "number")}
                {renderTextInput(t.cost, orderForm.unitCost, (value) => setOrderForm((form) => ({ ...form, unitCost: value })), "number")}
                <div className="md:col-span-6">
                  {renderTextInput(t.notes, orderForm.notes, (value) => setOrderForm((form) => ({ ...form, notes: value })))}
                </div>
              </div>
              <button disabled={saving} onClick={() => void createOrder()} className="mt-4 rounded-2xl bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] px-5 py-3 text-xs font-black text-[#070B12] transition hover:scale-[1.01] disabled:opacity-50">
                {t.createOrder}
              </button>
            </div>
          )}
        </section>
      )}

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1.2fr]">
        <div className="space-y-5">
          <div className="rounded-[28px] border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.015)]">
            <h2 className="text-sm font-black text-[#101828]">{t.suppliers}</h2>
            <div className="mt-4 space-y-3">
              {suppliers.length === 0 && <p className="rounded-2xl bg-[#F9FAFB] p-4 text-sm font-semibold text-[#667085]">{t.noSuppliers}</p>}
              {suppliers.map((supplier) => (
                <div key={supplier.id} className="rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong className="block text-sm text-[#101828]">{supplier.name}</strong>
                      <span className="text-xs font-semibold text-[#667085]">{supplier.contact_name || supplier.contact_phone || "-"}</span>
                    </div>
                    <span className="rounded-full bg-[#3DDC84]/10 px-3 py-1 text-[10px] font-black uppercase text-[#15803D]">{supplier.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.015)]">
            <h2 className="text-sm font-black text-[#101828]">{t.products}</h2>
            <div className="mt-4 space-y-3">
              {products.length === 0 && <p className="rounded-2xl bg-[#F9FAFB] p-4 text-sm font-semibold text-[#667085]">{t.noProducts}</p>}
              {products.map((product) => (
                <div key={product.id} className="rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong className="block text-sm text-[#101828]">{productName(product)}</strong>
                      <span className="text-xs font-semibold text-[#667085]">{product.category} · {product.unit}</span>
                    </div>
                    <span className="text-xs font-black text-[#D1AF47]">{money(numberValue(product.retail_price_sar))}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-[28px] border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.015)]">
            <h2 className="text-sm font-black text-[#101828]">{t.stock}</h2>
            <div className="mt-4 overflow-x-auto">
              {stockRows.length === 0 ? (
                <p className="rounded-2xl bg-[#F9FAFB] p-4 text-sm font-semibold text-[#667085]">{t.noStock}</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#ECECEC] text-[10px] font-black uppercase tracking-[0.16em] text-[#667085]">
                      <th className="px-3 py-3 text-start">{t.product}</th>
                      <th className="px-3 py-3 text-start">{t.branch}</th>
                      <th className="px-3 py-3 text-start">{t.onHand}</th>
                      <th className="px-3 py-3 text-start">{t.reserved}</th>
                      <th className="px-3 py-3 text-start">{t.reorderPoint}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockRows.map((row) => {
                      const reorderPoint = numberValue(row.reorder_point_override ?? row.inventory_products?.default_reorder_point);
                      const isLow = reorderPoint > 0 && numberValue(row.quantity_on_hand) - numberValue(row.quantity_reserved) <= reorderPoint;
                      return (
                        <tr key={row.id} className="border-b border-[#ECECEC]/70">
                          <td className="px-3 py-3 font-bold text-[#101828]">{productName(row.inventory_products)}</td>
                          <td className="px-3 py-3 font-semibold text-[#344054]">{branchName(row.branches)}</td>
                          <td className="px-3 py-3 font-black text-[#101828]">{numberValue(row.quantity_on_hand)}</td>
                          <td className="px-3 py-3 font-semibold text-[#667085]">{numberValue(row.quantity_reserved)}</td>
                          <td className="px-3 py-3">
                            <span className={`rounded-full px-3 py-1 text-[10px] font-black ${isLow ? "bg-[#FF5D73]/10 text-[#B42318]" : "bg-[#3DDC84]/10 text-[#15803D]"}`}>
                              {isLow ? t.lowStock : t.healthy}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.015)]">
            <h2 className="text-sm font-black text-[#101828]">{t.purchaseOrders}</h2>
            <div className="mt-4 space-y-3">
              {orders.length === 0 && <p className="rounded-2xl bg-[#F9FAFB] p-4 text-sm font-semibold text-[#667085]">{t.noOrders}</p>}
              {orders.map((order) => (
                <div key={order.id} className="rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm text-[#101828]">{order.inventory_suppliers?.name || t.supplier}</strong>
                        <span className="rounded-full border border-[#D1AF47]/25 bg-[#D1AF47]/10 px-2.5 py-1 text-[10px] font-black uppercase text-[#9B7928]">{order.status}</span>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-[#667085]">{branchName(order.branches)} · {money(numberValue(order.subtotal_sar))}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(order.supplier_purchase_order_items || []).map((item) => (
                          <span key={item.id} className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-[#344054]">
                            {productName(item.inventory_products)} × {numberValue(item.quantity)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {order.status === "draft" && <button disabled={saving} onClick={() => void transitionOrder(order, "submit")} className="rounded-xl border border-[#D1AF47]/30 bg-white px-3 py-2 text-[11px] font-black text-[#9B7928]">{t.submit}</button>}
                      {order.status === "submitted" && canApprove && <button disabled={saving} onClick={() => void transitionOrder(order, "approve")} className="rounded-xl bg-[#101828] px-3 py-2 text-[11px] font-black text-white">{t.approve}</button>}
                      {order.status === "approved" && <button disabled={saving} onClick={() => void transitionOrder(order, "receive")} className="rounded-xl bg-[#D1AF47] px-3 py-2 text-[11px] font-black text-[#070B12]">{t.receive}</button>}
                      {["draft", "submitted", "approved"].includes(order.status) && <button disabled={saving} onClick={() => void transitionOrder(order, "cancel")} className="rounded-xl bg-[#FF5D73]/10 px-3 py-2 text-[11px] font-black text-[#B42318]">{t.cancel}</button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      </>)}
      {confirmNode}
      {cancelFor && (
        <CommandDialog
          locale={lang}
          tone="danger"
          title={t.confirmCancel}
          reasonLabel={t.cancellationReason}
          confirmLabel={t.cancelOrderConfirm}
          onConfirm={(reason) => runTransition(cancelFor, "cancel", reason)}
          onClose={() => setCancelFor(null)}
        />
      )}
    </div>
  );
}
