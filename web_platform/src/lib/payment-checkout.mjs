const copy = {
  en: {
    submitting: "Your payment request is being checked. Check its status again; do not create another purchase.",
    unknown: "We could not confirm the payment outcome. Check the existing booking or purchase again before trying another payment.",
    captured: "Payment was received. Refresh the existing booking or purchase to confirm its latest status.",
    failed: "The payment request failed. You can explicitly try payment again for this existing booking or purchase.",
    priorSettled: "The earlier purchase is complete. Review your selection and submit again only if you want a new purchase.",
    purchase: "An earlier purchase needs checking. Review the existing purchase before creating another one.",
    signIn: "Sign in again to check this payment.",
  },
  ar: {
    submitting: "جارٍ التحقق من طلب الدفع. تحقق من حالته مجدداً، ولا تنشئ عملية شراء أخرى.",
    unknown: "تعذر تأكيد نتيجة الدفع. تحقق من الحجز أو عملية الشراء الحالية قبل محاولة دفع أخرى.",
    captured: "تم استلام الدفعة. حدّث الحجز أو عملية الشراء الحالية للتحقق من أحدث حالة.",
    failed: "فشل طلب الدفع. يمكنك إعادة محاولة الدفع صراحةً للحجز أو عملية الشراء الحالية.",
    priorSettled: "اكتملت عملية الشراء السابقة. راجع اختيارك وأرسل الطلب مجدداً فقط إذا كنت تريد عملية شراء جديدة.",
    purchase: "تحتاج عملية شراء سابقة إلى التحقق. راجع العملية الحالية قبل إنشاء عملية أخرى.",
    signIn: "سجّل الدخول مجدداً للتحقق من هذه الدفعة.",
  },
};
const text = (locale) => copy[locale === "ar" ? "ar" : "en"];
const checkouts = new Map();
const purchases = new Map();

export class CheckoutStateError extends Error {
  constructor(message, state = "unknown", receipt = {}) {
    super(message);
    this.name = "CheckoutStateError";
    this.state = state;
    this.code = receipt.code;
    this.attemptId = receipt.attemptId;
  }
}

async function invoke(client, body, locale) {
  let result;
  try { result = await client.functions.invoke("payment-checkout", { body }); }
  catch { throw new CheckoutStateError(text(locale).unknown); }
  let payload = result?.data;
  const response = result?.error?.context;
  if (result?.error && response && typeof response.clone === "function") {
    try { payload = await response.clone().json(); } catch { /* An unreadable result remains unknown. */ }
  }
  return { payload, status: response?.status, failed: Boolean(result?.error) };
}

function validCheckoutUrl(value) {
  try { const url = new URL(value); return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password; }
  catch { return false; }
}

async function interpret(result, locale, onCaptured) {
  const p = result.payload;
  if (p?.state === "captured") {
    try { await onCaptured?.(); } catch { /* The receipt remains captured even when the product read fails. */ }
    throw new CheckoutStateError(text(locale).captured, "captured", p);
  }
  if (p?.state === "unknown" || p?.state === "submitting") {
    throw new CheckoutStateError(text(locale)[p.state], p.state, p);
  }
  if (p?.state === "failed" && p?.code === "checkout_failed") {
    throw new CheckoutStateError(text(locale).failed, "failed", p);
  }
  if (!result.failed && p?.success === true && p?.state === "ready" &&
      typeof p.attemptId === "string" && p.attemptId && typeof p.chargeId === "string" && p.chargeId &&
      typeof p.checkoutUrl === "string" && validCheckoutUrl(p.checkoutUrl)) return p;
  throw new CheckoutStateError(text(locale).unknown, "unknown", p ?? {});
}

/** Every user-initiated retry recovers its existing target before a possible new dispatch. */
export async function requestCheckout(client, target, locale = "en", options = {}) {
  let actorId;
  try { actorId = (await client.auth.getSession()).data?.session?.user?.id; } catch { /* Authentication could not be confirmed. */ }
  if (!actorId) throw new CheckoutStateError(text(locale).signIn, "unknown");
  const key = `${actorId}:${target.bookingId ?? `${target.purchaseType}:${target.purchaseId}`}:${target.returnUrl ?? "web"}`;
  if (checkouts.has(key)) return checkouts.get(key);
  const work = (async () => {
    let response = await invoke(client, options.recoverFirst === false ? target : { ...target, action: "recover" }, locale);
    if (options.recoverFirst !== false && (
      (response.status === 404 && response.payload?.code === "checkout_not_found") ||
      (response.status === 409 && response.payload?.state === "failed" && response.payload?.code === "checkout_failed")
    )) response = await invoke(client, target, locale);
    return interpret(response, locale, options.onCaptured);
  })();
  checkouts.set(key, work);
  try { return await work; } finally { if (checkouts.get(key) === work) checkouts.delete(key); }
}

export const browserCheckoutStorage = {
  getItem: (key) => globalThis.localStorage.getItem(key),
  setItem: (key, value) => globalThis.localStorage.setItem(key, value),
  removeItem: (key) => globalThis.localStorage.removeItem(key),
};

const definitiveRefusal = new Set(["22023", "22003", "23505", "42501", "P0001", "P0002", "28000"]);

/** Local state contains opaque IDs only. Owned database reads recover it when a response/storage was lost. */
export async function ensurePurchase(options) {
  const { actorId, scope, locale = "en", storage } = options;
  if (!actorId || !/^[A-Za-z0-9._-]+$/.test(actorId) || !/^[A-Za-z0-9._-]+$/.test(scope)) {
    throw new CheckoutStateError(text(locale).purchase);
  }
  const key = `primora.checkout.${actorId}.${scope}`;
  const previous = purchases.get(key);
  const work = (async () => {
    if (previous) { try { await previous; } catch { /* Inspect the preserved identity after the previous action settles. */ } }
    try {
      const raw = await storage.getItem(key);
      let saved = null;
      if (raw) { try { saved = JSON.parse(raw); } catch { throw new CheckoutStateError(text(locale).purchase); } }
      if (saved && (typeof saved !== "object" || !["creating", "pending"].includes(saved.phase) ||
          (saved.phase === "pending" && (typeof saved.id !== "string" || !saved.id)) ||
          (saved.requestKey !== undefined && (typeof saved.requestKey !== "string" || !saved.requestKey)) ||
          (options.idempotent && saved.phase === "creating" && !saved.requestKey))) {
        throw new CheckoutStateError(text(locale).purchase);
      }
      if (saved?.id) {
        const record = await options.inspect(saved.id);
        if (!record) throw new CheckoutStateError(text(locale).purchase);
        if (record.settled === true) {
          await storage.removeItem(key);
          try { await options.onSettled?.(); } catch { /* Ask the customer to check the authoritative product screen. */ }
          if (record.matches !== true) throw new CheckoutStateError(text(locale).priorSettled, "prior_settled");
          throw new CheckoutStateError(text(locale).captured, "captured");
        }
        if (record.matches !== true || !["pending_payment", "pending"].includes(record.status)) {
          throw new CheckoutStateError(text(locale).purchase);
        }
        return { id: record.id, reused: true };
      }
      const candidates = await options.lookup();
      if (!Array.isArray(candidates) || candidates.length > 1 || candidates.some((record) => record.matches !== true)) {
        throw new CheckoutStateError(text(locale).purchase);
      }
      if (candidates.length === 1) {
        const id = candidates[0].id;
        if (typeof id !== "string" || !id) throw new CheckoutStateError(text(locale).purchase);
        await storage.setItem(key, JSON.stringify({ id, phase: "pending" }));
        return { id, reused: true };
      }
      if (saved && !options.idempotent) throw new CheckoutStateError(text(locale).purchase);
      if (options.idempotent && !saved?.requestKey && typeof options.makeKey !== "function") {
        throw new CheckoutStateError(text(locale).purchase);
      }
      const requestKey = saved?.requestKey ?? options.makeKey?.();
      await storage.setItem(key, JSON.stringify({ phase: "creating", ...(requestKey ? { requestKey } : {}) }));
      let id;
      try { id = await options.create(requestKey); }
      catch (failure) {
        if (definitiveRefusal.has(failure?.code)) { await storage.removeItem(key); throw failure; }
        throw new CheckoutStateError(text(locale).purchase);
      }
      if (typeof id !== "string" || !id) throw new CheckoutStateError(text(locale).purchase);
      await storage.setItem(key, JSON.stringify({ id, phase: "pending" }));
      return { id, reused: false };
    } catch (failure) {
      if (failure instanceof CheckoutStateError || definitiveRefusal.has(failure?.code)) throw failure;
      throw new CheckoutStateError(text(locale).purchase);
    }
  })();
  purchases.set(key, work);
  try { return await work; } finally { if (purchases.get(key) === work) purchases.delete(key); }
}


const purchaseTables = {
  package: { table: "user_packages", owner: "customer_id", pending: "pending_payment", filter: ["package_id"] },
  gift_card: { table: "gift_cards", owner: "purchaser_id", pending: "pending_payment", filter: [] },
  tip: { table: "booking_tips", owner: "customer_id", pending: "pending", filter: ["booking_id"] },
  subscription: { table: "subscription_payments", owner: "provider_id", pending: "pending_payment", filter: [] },
  membership: { table: "memberships", owner: "customer_id", pending: "pending_payment", filter: ["plan_id", "renewal_of"] },
};

/** Resume an owned, material-matching pending record before invoking its creation command. */
export async function preparePurchase(client, options) {
  const config = purchaseTables[options.type];
  const actorId = options.actorId ?? (await client.auth.getSession()).data?.session?.user?.id;
  if (!config || !actorId || (options.type === "subscription" && !options.ownerId)) {
    throw new CheckoutStateError(text(options.locale).purchase);
  }
  const material = options.material;
  const fields = ["id", "status", "paid_at", ...Object.keys(material)].join(",");
  const ownerId = options.ownerId ?? actorId;
  const base = () => client.from(config.table).select(fields).eq(config.owner, ownerId);
  const describe = (row) => ({
    id: row.id, status: row.status,
    matches: Object.entries(material).every(([field, value]) => typeof value === "number" ? Number(row[field]) === value : row[field] === value),
    settled: Boolean(row.paid_at) || ["active", "paid", "partially_redeemed", "redeemed", "exhausted"].includes(row.status),
  });
  return ensurePurchase({
    ...options, actorId,
    lookup: async () => {
      let query = base().eq("status", config.pending);
      for (const field of config.filter) query = material[field] === null ? query.is(field, null) : query.eq(field, material[field]);
      const { data, error } = await query.limit(2);
      if (error) throw error;
      return (data ?? []).map(describe);
    },
    inspect: async (id) => {
      const { data, error } = await base().eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? describe(data) : null;
    },
  });
}
