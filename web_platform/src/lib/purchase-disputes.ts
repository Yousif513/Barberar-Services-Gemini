import { supabase } from "@/lib/supabase";
import { describeServerError } from "@/app/provider/_components/server-errors";
import type { OperationsLocale } from "@/components/operations-ui";

// PAY-WAVE2 (RT-H2): what a customer sees about the money of a membership or package they bought: a report (dispute) they can
// open with open_purchase_dispute, and the refunds of the purchase. Reads go through the customer's own row policies only.

export type PurchaseType = "membership" | "package";
export type PurchaseDispute = { id: string; purchase_id: string; status: string; disputed_amount_sar: number | string; created_at: string };
export type PurchaseRefund = { id: string; purchase_id: string; status: string; value: number | string; created_at: string };

export const purchaseMoneyCopy = {
  en: {
    report: "Report a problem",
    reportTitle: "Report a problem with this payment",
    reportIntro:
      "PRIMORA reviews your report with the salon. If it is upheld, the money goes back to your original payment method. The salon is not paid from this purchase until the report is decided.",
    reportReason: "What went wrong? (at least 10 characters)",
    reportConfirm: "Send report",
    reportSent: "Your report was sent. We will tell you the decision.",
    reportOpen: "Report under review",
    reportUpheld: "Report upheld: refund issued",
    reportRejected: "Report not upheld",
    refundLine: "Refund of {sum}: {state}",
    refundStates: {
      pending: "on its way",
      processing: "on its way",
      succeeded: "returned to your payment method",
      failed: "delayed; PRIMORA is retrying it",
      unknown: "being confirmed with the payment provider",
    } as Record<string, string>,
    paidFact: "You paid",
  },
  ar: {
    report: "الإبلاغ عن مشكلة",
    reportTitle: "الإبلاغ عن مشكلة في هذا الدفع",
    reportIntro:
      "تراجع PRIMORA بلاغك مع الصالون. إذا ثبت، يُعاد المبلغ إلى وسيلة الدفع الأصلية. لا يُدفع للصالون من هذه العملية حتى يُبتّ في البلاغ.",
    reportReason: "ما المشكلة؟ (10 أحرف على الأقل)",
    reportConfirm: "إرسال البلاغ",
    reportSent: "أُرسل بلاغك، وسنبلغك بالقرار.",
    reportOpen: "البلاغ قيد المراجعة",
    reportUpheld: "ثبت البلاغ: صدر استرداد",
    reportRejected: "لم يثبت البلاغ",
    refundLine: "استرداد {sum}: {state}",
    refundStates: {
      pending: "في الطريق إليك",
      processing: "في الطريق إليك",
      succeeded: "أُعيد إلى وسيلة الدفع",
      failed: "متأخر، وتعيد PRIMORA المحاولة",
      unknown: "قيد التأكيد مع مزود الدفع",
    } as Record<string, string>,
    paidFact: "المبلغ المدفوع",
  },
};

const arabicReasons: Array<[RegExp, string]> = [
  [/^Please describe the problem/i, "يرجى وصف المشكلة في 10 إلى 2000 حرف."],
  [/^A dispute is already open/i, "يوجد بلاغ مفتوح لهذه العملية بالفعل."],
  [/^There is no payment on this purchase/i, "لا يوجد دفع على هذه العملية للاعتراض عليه."],
  [/^Everything you paid is already being refunded/i, "كل ما دفعته في طريقه إليك بالفعل."],
  [/^Purchase not found/i, "لم يتم العثور على العملية."],
  [/^Evidence links|^Attach at most/i, "روابط الإثبات يجب أن تبدأ بـ https وألا تزيد عن 5."],
];

export function purchaseDisputeError(error: unknown, locale: OperationsLocale): string {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : String(error ?? "");
  if (locale === "ar") for (const [pattern, arabic] of arabicReasons) if (pattern.test(message)) return arabic;
  return describeServerError(error, locale);
}

export function disputeLabel(status: string, locale: OperationsLocale): string {
  const t = purchaseMoneyCopy[locale];
  if (status === "resolved_refund") return t.reportUpheld;
  if (status === "resolved_rejected") return t.reportRejected;
  return t.reportOpen;
}

// The customer's reports and refunds for the given purchases. A failed read is reported, never shown as "nothing".
export async function loadPurchaseMoney(type: PurchaseType, ids: string[]): Promise<{ disputes: PurchaseDispute[]; refunds: PurchaseRefund[] }> {
  if (ids.length === 0) return { disputes: [], refunds: [] };
  const [disputes, refunds] = await Promise.all([
    supabase.from("payment_disputes").select("id, purchase_id, status, disputed_amount_sar, created_at")
      .eq("purchase_type", type).in("purchase_id", ids).order("created_at", { ascending: false }).limit(200),
    supabase.from("refund_requests").select("id, purchase_id, status, value:amount, created_at")
      .eq("purchase_type", type).in("purchase_id", ids).order("created_at", { ascending: false }).limit(200),
  ]);
  if (disputes.error) throw disputes.error;
  if (refunds.error) throw refunds.error;
  return { disputes: (disputes.data ?? []) as PurchaseDispute[], refunds: (refunds.data ?? []) as unknown as PurchaseRefund[] };
}

export async function openPurchaseDispute(type: PurchaseType, id: string, reason: string): Promise<void> {
  const { data, error } = await supabase.rpc("open_purchase_dispute", { p_purchase_type: type, p_purchase_id: id, p_reason: reason });
  if (error) throw error;
  if ((data as { status?: string } | null)?.status !== "opened") throw new Error("The report was not recorded. Try again.");
}
