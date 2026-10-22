"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { ForbiddenNotice, isForbidden, operationsButton, operationsDate, operationsInput, sar, useOperationsLocale } from "@/components/operations-ui";
import { HELD_CHECKOUT_MAX_OFFSET, HELD_CHECKOUT_PAGE_SIZE, HELD_CHECKOUT_PURCHASE_TYPES, HELD_CHECKOUT_STATUSES, elapsedCheckoutMinutes, heldCheckoutArgs, parseHeldCheckoutDetail, parseHeldCheckoutList, type HeldCheckoutDetail, type HeldCheckoutFilters, type HeldCheckoutList } from "@/lib/held-checkout-client.mjs";

const EMPTY_FILTERS: HeldCheckoutFilters = { status: "", purchaseType: "", attemptId: "", targetId: "" };
const copy = {
  en: {
    title: "Held checkout attempts", intro: "Read-only records awaiting investigation: submissions with no final outcome, unknown submissions, and attempts flagged for reconciliation. A captured status alone does not prove settlement or entitlement.",
    hold: "This queue cannot retry a charge, issue a refund, resolve an attempt or move money. Provider-backed resolution remains subject to its approval and evidence requirements.",
    filterTitle: "Find an attempt", all: "All", status: "Recorded status", purchaseType: "Purchase type", attemptId: "Exact attempt ID", targetId: "Exact payable ID", apply: "Apply filters", reset: "Clear filters", refresh: "Refresh queue", retry: "Retry read", loading: "Loading recorded attempts…", empty: "There are no held checkout attempts.", filteredEmpty: "No held attempts match these filters. Clear filters to see the queue.",
    emptyPage: "This page no longer contains attempts, but matches remain on earlier pages. Return to the first page or narrow the filters.", firstPage: "First page", draftNote: "Results use the last applied filters. Editing a field does not change the results until you apply it.",
    invalidId: "Enter a complete UUID or leave the field empty.", invalidFilter: "Choose one of the listed filters.", invalidPaging: "This page is outside the supported range. Clear filters to return to the first page.", invalidResponse: "The server returned an unexpected checkout response. No records are shown. Refresh the read; if the problem continues, ask engineering to check the API and migration.", failed: "The read failed: {reason}", snapshot: "Snapshot at {time} (Riyadh). Refresh to check for changes.", order: "Oldest created first. Elapsed time is measured at the snapshot; it is not a resolution deadline.", rows: "{start}–{end} of {total} matching attempts", previous: "Previous page", next: "Next page", pageLimit: "Further pages exceed this queue’s browsing limit. Narrow the filters.",
    colAttempt: "Attempt", colPayable: "Payable", amount: "Amount (SAR)", age: "Elapsed since creation", flags: "Reconciliation / current", actions: "Details", view: "View attempt {id}", minutes: "{n} minutes", unknownAge: "Elapsed time unavailable", yes: "Yes", no: "No", reconciliation: "Reconciliation required", current: "Current attempt", scroll: "The table scrolls horizontally. Focus it and use the arrow keys to see every column.",
    detail: "Attempt details", close: "Close details", refreshDetail: "Refresh details", detailLoading: "Loading this attempt…", missing: "This attempt is no longer held or is unavailable in this queue. Refresh the queue to check its current visibility.", created: "Created (Riyadh)", updated: "Updated (Riyadh)", unknownAt: "Marked unknown (Riyadh)", notRecorded: "Not recorded", historyNote: "These are the current minimized attempt fields. This view does not contain provider evidence, payment contact details or a full event history.",
    statuses: { submitting: "Submitting — outcome pending", unknown: "Unknown outcome", captured: "Capture recorded", failed: "Failure recorded" } as Record<string, string>,
    types: { booking: "Booking", gift_card: "Gift card", package: "Package", membership: "Membership", tip: "Tip", subscription: "Provider subscription" } as Record<string, string>,
  },
  ar: {
    title: "محاولات الدفع المعلّقة", intro: "سجلات للقراءة فقط بانتظار التحقيق: الإرسالات التي لم تُحسم نتيجتها، والإرسالات مجهولة النتيجة، والمحاولات المؤشّر عليها للتسوية. حالة القبض وحدها لا تثبت التسوية أو الاستحقاق.",
    hold: "لا تتيح هذه القائمة إعادة إرسال دفعة أو إصدار استرداد أو حسم محاولة أو تحريك الأموال. يبقى الحسم المستند إلى دليل مزوّد الدفع خاضعاً لشروط الإثبات والاعتماد الخاصة به.",
    filterTitle: "البحث عن محاولة", all: "الكل", status: "الحالة المسجّلة", purchaseType: "نوع الشراء", attemptId: "معرّف المحاولة الكامل", targetId: "معرّف المستحق الكامل", apply: "تطبيق المرشحات", reset: "مسح المرشحات", refresh: "تحديث القائمة", retry: "إعادة القراءة", loading: "جارٍ تحميل المحاولات المسجّلة…", empty: "لا توجد محاولات دفع معلّقة.", filteredEmpty: "لا توجد محاولات معلّقة تطابق هذه المرشحات. امسح المرشحات لعرض القائمة.",
    emptyPage: "لم تعد هذه الصفحة تحتوي على محاولات، لكن توجد نتائج مطابقة في صفحات سابقة. ارجع إلى الصفحة الأولى أو ضيّق المرشحات.", firstPage: "الصفحة الأولى", draftNote: "تعتمد النتائج على آخر مرشحات مطبّقة. تعديل الحقل لا يغيّر النتائج حتى تطبّقه.",
    invalidId: "أدخل معرّف UUID كاملاً أو اترك الحقل فارغاً.", invalidFilter: "اختر أحد المرشحات المدرجة.", invalidPaging: "هذه الصفحة خارج النطاق المدعوم. امسح المرشحات للعودة إلى الصفحة الأولى.", invalidResponse: "أعاد الخادم استجابة دفع غير متوقعة، لذلك لا تُعرض سجلات. أعد القراءة؛ وإذا استمر الخطأ، اطلب من فريق التطوير فحص الواجهة والترحيل.", failed: "تعذّرت القراءة: {reason}", snapshot: "لقطة بتاريخ {time} (الرياض). حدّث للتحقق من التغييرات.", order: "الأقدم إنشاءً أولاً. تُحسب المدة عند وقت اللقطة، وهي ليست مهلة للحسم.", rows: "{start}–{end} من {total} محاولة مطابقة", previous: "الصفحة السابقة", next: "الصفحة التالية", pageLimit: "الصفحات التالية تتجاوز حدّ التصفح لهذه القائمة. ضيّق نطاق المرشحات.",
    colAttempt: "المحاولة", colPayable: "المستحق", amount: "المبلغ (ر.س)", age: "المدة منذ الإنشاء", flags: "التسوية / الحالية", actions: "التفاصيل", view: "عرض المحاولة {id}", minutes: "{n} دقيقة", unknownAge: "المدة غير متاحة", yes: "نعم", no: "لا", reconciliation: "التسوية مطلوبة", current: "المحاولة الحالية", scroll: "يمكن تمرير الجدول أفقياً. ضع التركيز عليه واستخدم مفاتيح الأسهم لرؤية جميع الأعمدة.",
    detail: "تفاصيل المحاولة", close: "إغلاق التفاصيل", refreshDetail: "تحديث التفاصيل", detailLoading: "جارٍ تحميل هذه المحاولة…", missing: "لم تعد هذه المحاولة معلّقة أو لم تعد متاحة في هذه القائمة. حدّث القائمة للتحقق من ظهورها الحالي.", created: "الإنشاء (الرياض)", updated: "التحديث (الرياض)", unknownAt: "تسجيل النتيجة المجهولة (الرياض)", notRecorded: "غير مسجّل", historyNote: "هذه هي الحقول الحالية المحدودة للمحاولة. لا يتضمن هذا العرض أدلة مزوّد الدفع أو بيانات التواصل الخاصة بالدفع أو سجل الأحداث الكامل.",
    statuses: { submitting: "جارٍ الإرسال — النتيجة معلّقة", unknown: "النتيجة مجهولة", captured: "القبض مسجّل", failed: "الفشل مسجّل" } as Record<string, string>,
    types: { booking: "حجز", gift_card: "بطاقة هدية", package: "باقة", membership: "عضوية", tip: "إكرامية", subscription: "اشتراك مزوّد الخدمة" } as Record<string, string>,
  },
};
const fill = (text: string, values: Record<string, string | number>) => Object.entries(values).reduce((out, [key, value]) => out.replace(`{${key}}`, String(value)), text);
type ReadError = { forbidden: boolean; reason: string; invalidResponse: boolean };
const readError = (error: unknown): ReadError => ({ forbidden: isForbidden(error), reason: errorMessage(error), invalidResponse: error instanceof Error && error.message === "response" });

export default function HeldCheckoutQueue() {
  const lang = useOperationsLocale();
  const t = copy[lang];
  const [draft, setDraft] = useState<HeldCheckoutFilters>({ ...EMPTY_FILTERS });
  const [request, setRequest] = useState({ filters: { ...EMPTY_FILTERS }, offset: 0 });
  const [validation, setValidation] = useState("");
  const [view, setView] = useState<HeldCheckoutList | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ReadError | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HeldCheckoutDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailFailure, setDetailFailure] = useState<ReadError | null>(null);
  const listSequence = useRef(0);
  const detailSequence = useRef(0);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const sourceButton = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async (filters: HeldCheckoutFilters, offset: number) => {
    const sequence = ++listSequence.current;
    ++detailSequence.current;
    setSelectedId(null); setDetail(null); setDetailFailure(null); setDetailLoading(false);
    setLoading(true); setFailure(null); setView(null);
    try {
      const { data, error } = await supabase.rpc("admin_list_held_checkout_attempts", heldCheckoutArgs(filters, offset));
      if (error) throw error;
      const next = parseHeldCheckoutList(data, offset);
      if (sequence === listSequence.current) setView(next);
    } catch (error) {
      if (sequence === listSequence.current) setFailure(readError(error));
    } finally {
      if (sequence === listSequence.current) setLoading(false);
    }
  }, []);

  const invalidateReads = useCallback(() => { ++listSequence.current; ++detailSequence.current; }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(request.filters, request.offset), 0);
    return () => { window.clearTimeout(timer); invalidateReads(); };
  }, [request, load, invalidateReads]);
  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setTimeout(() => { detailHeading.current?.focus(); detailHeading.current?.scrollIntoView({ block: "nearest" }); }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedId]);

  const loadDetail = async (id: string, button?: HTMLButtonElement) => {
    const sequence = ++detailSequence.current;
    if (button) sourceButton.current = button;
    setSelectedId(id); setDetail(null); setDetailFailure(null); setDetailLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_get_held_checkout_attempt", { p_attempt_id: id });
      if (error) throw error;
      const next = parseHeldCheckoutDetail(data, id);
      if (sequence === detailSequence.current) setDetail(next);
    } catch (error) {
      if (sequence === detailSequence.current) {
        const problem = readError(error);
        setDetailFailure(problem);
        if (problem.forbidden) { ++listSequence.current; setView(null); setFailure(problem); setLoading(false); }
      }
    } finally {
      if (sequence === detailSequence.current) setDetailLoading(false);
    }
  };
  const closeDetail = () => { ++detailSequence.current; setSelectedId(null); setDetail(null); setDetailFailure(null); setDetailLoading(false); sourceButton.current?.focus(); };
  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    try { heldCheckoutArgs(draft, 0); setValidation(""); setRequest({ filters: { ...draft }, offset: 0 }); }
    catch (error) { setValidation(error instanceof Error ? error.message : "status"); }
  };
  const clear = () => { setDraft({ ...EMPTY_FILTERS }); setValidation(""); setRequest({ filters: { ...EMPTY_FILTERS }, offset: 0 }); };
  const number = (value: number) => value.toLocaleString(lang === "ar" ? "ar-SA" : "en-US");
  const date = (value: string | null) => value === null ? t.notRecorded : operationsDate(value, lang);
  const explanation = (error: ReadError) => error.invalidResponse ? t.invalidResponse : fill(t.failed, { reason: error.reason });
  const filtered = Object.values(request.filters).some((value) => value.trim() !== "");
  const item = detail?.attempt;
  const cell = "px-3 py-3 text-start align-top";
  const card = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)]";
  const idClass = "break-all font-mono text-xs";
  const age = (created: { created_at: string }, asOf: string) => {
    const minutes = elapsedCheckoutMinutes(created, asOf);
    return minutes === null ? t.unknownAge : fill(t.minutes, { n: number(minutes) });
  };

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} className="min-w-0 space-y-5 text-start">
      <header className="space-y-2">
        <h1 className="font-serif text-2xl font-black text-gray-900">{t.title}</h1>
        <p className="max-w-4xl text-sm text-gray-600">{t.intro}</p>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{t.hold}</p>
      </header>
      <form onSubmit={apply} className={`${card} space-y-4`} aria-labelledby="checkout-filters-title">
        <h2 id="checkout-filters-title" className="text-base font-bold text-gray-900">{t.filterTitle}</h2>
        <p className="text-sm text-gray-600">{t.draftNote}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold text-gray-600"><span>{t.status}</span><select className={operationsInput} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="">{t.all}</option>{HELD_CHECKOUT_STATUSES.map((value) => <option key={value} value={value}>{t.statuses[value]}</option>)}</select></label>
          <label className="space-y-1 text-sm font-semibold text-gray-600"><span>{t.purchaseType}</span><select className={operationsInput} value={draft.purchaseType} onChange={(e) => setDraft({ ...draft, purchaseType: e.target.value })}><option value="">{t.all}</option>{HELD_CHECKOUT_PURCHASE_TYPES.map((value) => <option key={value} value={value}>{t.types[value]}</option>)}</select></label>
          <label className="space-y-1 text-sm font-semibold text-gray-600"><span>{t.attemptId}</span><input dir="ltr" autoComplete="off" spellCheck={false} className={operationsInput} value={draft.attemptId} aria-invalid={validation === "attemptId"} aria-describedby={validation === "attemptId" ? "checkout-filter-error" : undefined} onChange={(e) => setDraft({ ...draft, attemptId: e.target.value })} /></label>
          <label className="space-y-1 text-sm font-semibold text-gray-600"><span>{t.targetId}</span><input dir="ltr" autoComplete="off" spellCheck={false} className={operationsInput} value={draft.targetId} aria-invalid={validation === "targetId"} aria-describedby={validation === "targetId" ? "checkout-filter-error" : undefined} onChange={(e) => setDraft({ ...draft, targetId: e.target.value })} /></label>
        </div>
        {validation ? <p id="checkout-filter-error" role="alert" className="text-sm font-semibold text-red-800">{validation === "attemptId" || validation === "targetId" ? t.invalidId : validation === "offset" ? t.invalidPaging : t.invalidFilter}</p> : null}
        <div className="flex flex-wrap gap-2"><button type="submit" className={operationsButton}>{t.apply}</button><button type="button" className={operationsButton} onClick={clear}>{t.reset}</button><button type="button" className={operationsButton} onClick={() => void load(request.filters, request.offset)}>{t.refresh}</button></div>
      </form>
      {failure?.forbidden ? <ForbiddenNotice locale={lang} permissions={["money.ledger"]} /> : (
        <section className={`${card} min-w-0 space-y-4`} aria-labelledby="checkout-queue-title" aria-busy={loading}>
          <h2 id="checkout-queue-title" className="text-base font-bold text-gray-900">{t.title}</h2>
          <p className="text-sm text-gray-600">{t.order}</p>
          {loading ? <p role="status">{t.loading}</p> : failure ? <div role="alert" className="space-y-2 text-sm text-red-800"><p>{explanation(failure)}</p><button className={operationsButton} type="button" onClick={() => void load(request.filters, request.offset)}>{t.retry}</button></div> : view ? (
            <>
              <p className="text-sm text-gray-600">{fill(t.snapshot, { time: date(view.as_of) })}</p>
              {view.items.length === 0 ? <p role="status" className="text-sm text-gray-600">{view.total > 0 ? t.emptyPage : filtered ? t.filteredEmpty : t.empty}</p> : (
                <>
                  <p id="checkout-scroll-hint" className="text-sm text-gray-600">{t.scroll}</p>
                  <div tabIndex={0} role="region" aria-labelledby="checkout-queue-title" aria-describedby="checkout-scroll-hint" className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-[#9B7928]">
                    <table className="w-full min-w-[1100px] text-xs">
                      <caption className="sr-only">{t.title}</caption>
                      <thead className="border-b bg-[#FAF9F6] font-bold text-gray-600"><tr>{[t.colAttempt, t.colPayable, t.amount, t.status, t.age, t.flags, t.actions].map((text) => <th key={text} scope="col" className={cell}>{text}</th>)}</tr></thead>
                      <tbody className="divide-y text-gray-800">{view.items.map((attempt) => <tr key={attempt.id}>
                        <th scope="row" className={`${cell} font-normal`}><bdi dir="ltr" className={idClass}>{attempt.id}</bdi></th>
                        <td className={cell}><span className="mb-1 block font-semibold">{t.types[attempt.purchase_type]}</span><bdi dir="ltr" className={idClass}>{attempt.target_id}</bdi></td>
                        <td className={`${cell} whitespace-nowrap`}><bdi>{sar(attempt.amount_sar, lang)}</bdi></td>
                        <td className={cell}>{t.statuses[attempt.status]}</td>
                        <td className={cell}>{age(attempt, view.as_of)}</td>
                        <td className={cell}><span className="block">{t.reconciliation}: {attempt.reconciliation_required ? t.yes : t.no}</span><span className="mt-1 block">{t.current}: {attempt.is_current ? t.yes : t.no}</span></td>
                        <td className={cell}><button type="button" className={operationsButton} aria-label={fill(t.view, { id: attempt.id })} onClick={(e) => void loadDetail(attempt.id, e.currentTarget)}>{t.actions}</button></td>
                      </tr>)}</tbody>
                    </table>
                  </div>
                </>
              )}
              <p role="status" className="text-sm text-gray-600">{fill(t.rows, { start: number(view.items.length ? view.offset + 1 : 0), end: number(view.items.length ? view.offset + view.items.length : 0), total: number(view.total) })}</p>
              {view.items.length === 0 && request.offset > 0 ? <button type="button" className={operationsButton} onClick={() => setRequest({ ...request, offset: 0 })}>{t.firstPage}</button> : null}
              <div className="flex flex-wrap gap-2"><button type="button" className={operationsButton} disabled={request.offset === 0} onClick={() => setRequest({ ...request, offset: Math.max(0, request.offset - HELD_CHECKOUT_PAGE_SIZE) })}>{t.previous}</button><button type="button" className={operationsButton} disabled={request.offset + HELD_CHECKOUT_PAGE_SIZE >= view.total || request.offset + HELD_CHECKOUT_PAGE_SIZE > HELD_CHECKOUT_MAX_OFFSET} onClick={() => setRequest({ ...request, offset: request.offset + HELD_CHECKOUT_PAGE_SIZE })}>{t.next}</button></div>
              {request.offset + HELD_CHECKOUT_PAGE_SIZE > HELD_CHECKOUT_MAX_OFFSET && request.offset + HELD_CHECKOUT_PAGE_SIZE < view.total ? <p className="text-sm text-amber-900">{t.pageLimit}</p> : null}
            </>
          ) : null}
        </section>
      )}
      {selectedId && !failure?.forbidden ? <section className={`${card} space-y-4`} aria-labelledby="checkout-detail-title" aria-busy={detailLoading}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="checkout-detail-title" ref={detailHeading} tabIndex={-1} className="text-base font-bold text-gray-900 focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.detail}</h2><button type="button" className={operationsButton} onClick={closeDetail}>{t.close}</button></div>
        <p><bdi dir="ltr" className={idClass}>{selectedId}</bdi></p>
        {detailLoading ? <p role="status">{t.detailLoading}</p> : detailFailure ? <div role="alert" className="space-y-2 text-sm text-red-800"><p>{explanation(detailFailure)}</p><button type="button" className={operationsButton} onClick={() => void loadDetail(selectedId)}>{t.retry}</button></div> : detail ? <>
          <p className="text-sm text-gray-600">{fill(t.snapshot, { time: date(detail.as_of) })}</p>
          {!item ? <p role="status" className="text-sm text-gray-600">{t.missing}</p> : <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
            {[[t.colAttempt, <bdi key="id" dir="ltr" className={idClass}>{item.id}</bdi>], [t.purchaseType, t.types[item.purchase_type]], [t.targetId, <bdi key="target" dir="ltr" className={idClass}>{item.target_id}</bdi>], [t.amount, sar(item.amount_sar, lang)], [t.status, t.statuses[item.status]], [t.age, age(item, detail.as_of)], [t.reconciliation, item.reconciliation_required ? t.yes : t.no], [t.current, item.is_current ? t.yes : t.no], [t.created, date(item.created_at)], [t.updated, date(item.updated_at)], [t.unknownAt, date(item.unknown_at)]].map(([label, value]) => <div key={String(label)} className="min-w-0 space-y-1"><dt className="text-sm font-bold text-gray-600">{label}</dt><dd className="break-words text-sm text-gray-900">{value}</dd></div>)}
          </dl>}
          <p className="text-sm text-gray-600">{t.historyNote}</p>
          <div className="flex flex-wrap gap-2"><button type="button" className={operationsButton} onClick={() => void loadDetail(selectedId)}>{t.refreshDetail}</button><button type="button" className={operationsButton} onClick={() => void load(request.filters, request.offset)}>{t.refresh}</button></div>
        </> : null}
      </section> : null}
    </div>
  );
}
