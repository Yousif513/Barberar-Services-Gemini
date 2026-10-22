import { requestCheckout } from "./payment-checkout.js";

export const PENDING_PACKAGE_PAGE_SIZE = 25;

/** Query the purchase snapshot itself: a retired catalogue offer must not hide its pending payment. */
export async function loadPendingPackagePayments(client, page = 0, locale = "en") {
  const invalid = () => new Error(locale === "ar" ? "تعذر قراءة سجل شراء الباقة بشكل موثوق." : "The package purchase record could not be read reliably.");
  if (!Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(page * PENDING_PACKAGE_PAGE_SIZE)) throw invalid();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const actorId = sessionData?.session?.user?.id;
  if (!actorId) return { actorId: null, items: [], total: 0 };
  const { data, count, error } = await client.from("user_packages")
    .select("id,status,package_name_en,package_name_ar,amount_paid,session_count,created_at", { count: "exact" })
    .eq("customer_id", actorId).eq("status", "pending_payment")
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(page * PENDING_PACKAGE_PAGE_SIZE, (page + 1) * PENDING_PACKAGE_PAGE_SIZE - 1);
  if (error) throw error;
  if (!Array.isArray(data) || !Number.isSafeInteger(count) || count < 0) throw invalid();
  const items = data.map((row) => {
    const amount = Number(row.amount_paid);
    const sessions = Number(row.session_count);
    if (typeof row.id !== "string" || !row.id || row.status !== "pending_payment" ||
        row.amount_paid === null || row.amount_paid === undefined || String(row.amount_paid).trim() === "" ||
        !Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(sessions) || sessions < 1 ||
        !(row.package_name_en || row.package_name_ar) || !Number.isFinite(Date.parse(row.created_at))) throw invalid();
    return { id: row.id, amount, sessions, createdAt: row.created_at,
      name: { en: row.package_name_en || row.package_name_ar, ar: row.package_name_ar || row.package_name_en } };
  });
  return { actorId, items, total: count };
}

/** Auth-session results never activate a pass. Always re-read its authoritative list afterward. */
export async function resumePendingPackagePayment(client, purchaseId, options) {
  let refreshed = false;
  const refresh = async () => { refreshed = true; await options.refresh(); };
  try {
    const receipt = await requestCheckout(client, { purchaseType: "package", purchaseId, returnUrl: options.returnUrl }, options.locale, { onCaptured: refresh });
    await options.openCheckout(receipt.checkoutUrl);
  } finally {
    if (!refreshed) await refresh();
  }
}
