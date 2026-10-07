"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CommandDialog } from "@/components/modal";
import GroupBookingForm from "@/components/group-booking-form";
import { CommandResult, operationsButton, operationsDate, sar, useOperationsLocale } from "@/components/operations-ui";
import {
  GROUP_PAGE_SIZE, bookingStatusLabel, describeGroupError, groupCopy,
  type GroupCancelled,
} from "@/lib/group-booking";

type Names = { name_en: string; name_ar: string | null } | null;
type MemberRow = {
  sequence: number;
  guest_label: string;
  booking_id: string;
  bookings: { id: string; status: string; scheduled_at: string; deposit_required: number; employees: Names } | null;
};
type GroupRow = {
  id: string;
  event_date: string;
  occasion: string;
  headcount: number;
  notes: string | null;
  status: "active" | "cancelled";
  payment_due_at: string | null;
  created_at: string;
  providers: { business_name_en: string; business_name_ar: string | null } | null;
  group_booking_members: MemberRow[];
};
type SummaryRow = {
  group_id: string;
  member_count: number;
  awaiting_payment_count: number;
  confirmed_count: number;
  cancelled_count: number;
  deposit_due: number;
  total_with_vat: number;
  effective_status: "active" | "cancelled";
};
type CancelTarget = { group: GroupRow; member: MemberRow | null };

const SELECT = `id, event_date, occasion, headcount, notes, status, payment_due_at, created_at,
  providers ( business_name_en, business_name_ar ),
  group_booking_members ( sequence, guest_label, booking_id, bookings ( id, status, scheduled_at, deposit_required, employees ( name_en, name_ar ) ) )`;

export default function CustomerGroupPage() {
  const locale = useOperationsLocale();
  const t = groupCopy[locale];
  const [rows, setRows] = useState<GroupRow[]>([]);
  const [summaries, setSummaries] = useState<Record<string, SummaryRow>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  // The clock the screen judges 'upcoming' by: read when the list is loaded, not on every render.
  const [now, setNow] = useState(() => Date.now());
  const [payingId, setPayingId] = useState("");
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [result, setResult] = useState<{ error?: string; success?: string }>({});

  useEffect(() => {
    let live = true;
    void (async () => {
      setLoading(true);
      setLoadError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!live) return;
      if (!user) { setRows([]); setTotal(0); setLoading(false); return; }
      const from = page * GROUP_PAGE_SIZE;
      const { data, error, count } = await supabase
        .from("group_bookings")
        .select(SELECT, { count: "exact" })
        .eq("host_id", user.id)
        .order("created_at", { ascending: false })
        .range(from, from + GROUP_PAGE_SIZE - 1);
      if (!live) return;
      if (error) { setRows([]); setTotal(0); setLoadError(describeGroupError(error, locale)); setLoading(false); return; }
      const groups = (data ?? []) as unknown as GroupRow[];
      let bySummary: Record<string, SummaryRow> = {};
      if (groups.length > 0) {
        const summary = await supabase
          .from("group_booking_payment_summary")
          .select("group_id, member_count, awaiting_payment_count, confirmed_count, cancelled_count, deposit_due, total_with_vat, effective_status")
          .in("group_id", groups.map((g) => g.id));
        if (!live) return;
        if (summary.error) { setRows([]); setTotal(0); setLoadError(describeGroupError(summary.error, locale)); setLoading(false); return; }
        bySummary = Object.fromEntries(((summary.data ?? []) as SummaryRow[]).map((s) => [s.group_id, s]));
      }
      setRows(groups);
      setSummaries(bySummary);
      setTotal(count ?? 0);
      setNow(Date.now());
      setLoading(false);
    })();
    return () => { live = false; };
  }, [page, reload, locale]);

  const refresh = useCallback(() => { setPage(0); setReload((n) => n + 1); }, []);

  const pay = useCallback(async (bookingId: string) => {
    setPayingId(bookingId);
    try {
      const { data, error } = await supabase.functions.invoke("payment-checkout", { body: { bookingId } });
      if (error || !data?.checkoutUrl) throw new Error("no checkout url");
      window.location.assign(data.checkoutUrl);
    } catch {
      setResult({ error: t.payFailed });
      setPayingId("");
    }
  }, [t.payFailed]);

  const cancel = async (reason: string): Promise<string | null> => {
    if (!cancelTarget) return null;
    const trimmed = reason.trim() || null;
    const { data, error } = cancelTarget.member
      ? await supabase.rpc("cancel_group_member", { p_booking_id: cancelTarget.member.booking_id, p_reason: trimmed })
      : await supabase.rpc("cancel_group_booking", { p_group_id: cancelTarget.group.id, p_reason: trimmed });
    if (error) return describeGroupError(error, locale);
    const done = data as GroupCancelled;
    setResult(done.failed > 0 ? { error: t.cancelPartial(done.cancelled, done.failed) } : { success: t.cancelledDone(done.cancelled) });
    setReload((n) => n + 1);
    return null;
  };

  const pages = Math.max(1, Math.ceil(total / GROUP_PAGE_SIZE));
  const isLive = (status: string | undefined) => status === "pending_payment" || status === "confirmed";
  const upcoming = (m: MemberRow) => Boolean(m.bookings) && isLive(m.bookings?.status) && new Date(m.bookings?.scheduled_at ?? 0).getTime() > now;
  const name = (n: Names) => (n ? (locale === "ar" ? n.name_ar || n.name_en : n.name_en) : "");

  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} className="space-y-6 text-[#101828]">
      <header>
        <h1 className="font-serif text-3xl font-bold">{t.title}</h1>
        <p className="mt-2 text-sm text-[#667085]">{t.subtitle}</p>
      </header>
      <CommandResult error={result.error} success={result.success} locale={locale} onDismiss={() => setResult({})} />

      <GroupBookingForm onCreated={refresh} />

      <h2 className="font-serif text-2xl font-bold">{t.listTitle}</h2>
      {loading && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
      {!loading && loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{t.listLoadFailed} {loadError}</span>
          <button type="button" className={operationsButton} onClick={() => setReload((n) => n + 1)}>{t.retry}</button>
        </div>
      )}
      {!loading && !loadError && rows.length === 0 && (
        <div className="rounded-2xl border border-[#D1AF47]/35 bg-white p-8 text-center">
          <h3 className="font-serif text-xl font-bold">{t.emptyTitle}</h3>
          <p className="mt-2 text-sm text-[#667085]">{t.emptyBody}</p>
        </div>
      )}

      {!loading && !loadError && rows.map((group) => {
        const members = [...group.group_booking_members].sort((a, b) => a.sequence - b.sequence);
        const summary = summaries[group.id];
        const state = summary?.effective_status ?? group.status;
        const anyUpcoming = state === "active" && members.some(upcoming);
        const provider = group.providers ? (locale === "ar" ? group.providers.business_name_ar || group.providers.business_name_en : group.providers.business_name_en) : "";
        const heading = `${t.occasion[group.occasion] ?? group.occasion} · ${provider}`;
        return (
          <section key={group.id} aria-label={heading} className="rounded-[24px] border border-[#D1AF47]/35 bg-white/90 p-5 shadow-[0_8px_24px_rgba(56,44,16,0.06)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-serif text-xl font-bold">{heading}</h3>
                <p className="mt-1 text-sm text-[#667085]">
                  {new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${group.event_date}T00:00:00Z`))} · {t.guestsCount(group.headcount)}
                </p>
                {group.notes && <p className="mt-1 text-sm text-[#344054]">{group.notes}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#E8DDC0] bg-[#F7F3EA] px-3 py-1 text-xs font-bold">{t.groupState[state] ?? state}</span>
                {anyUpcoming && <button type="button" className={operationsButton} onClick={() => setCancelTarget({ group, member: null })}>{t.cancelGroup}</button>}
              </div>
            </div>

            {summary && (
              <div className="mt-4 grid gap-3 rounded-2xl border border-[#E8DDC0] bg-[#FBF8EF] p-4 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold text-[#667085]">{t.depositDue}</p>
                  <p className="text-lg font-bold">{sar(Number(summary.deposit_due), locale)}</p>
                  {group.payment_due_at && summary.awaiting_payment_count > 0 && state === "active" && (
                    <p className="text-xs text-amber-800">{t.payBefore}: {operationsDate(group.payment_due_at, locale)}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#667085]">{t.totalWithVat}</p>
                  <p className="text-lg font-bold">{sar(Number(summary.total_with_vat), locale)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#667085]">{t.paymentTitle}</p>
                  <p>{t.awaitingN(summary.awaiting_payment_count)} · {t.confirmedN(summary.confirmed_count)} · {t.cancelledN(summary.cancelled_count)}</p>
                </div>
              </div>
            )}

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-start text-sm">
                <caption className="sr-only">{heading}</caption>
                <thead>
                  <tr className="text-xs text-[#667085]">
                    <th scope="col" className="py-2 pe-3 text-start">{t.guest}</th>
                    <th scope="col" className="py-2 pe-3 text-start">{t.time}</th>
                    <th scope="col" className="py-2 pe-3 text-start">{t.colProfessional}</th>
                    <th scope="col" className="py-2 pe-3 text-start">{t.status}</th>
                    <th scope="col" className="py-2 text-start"><span className="sr-only">{t.cancelGuest}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const awaiting = m.bookings?.status === "pending_payment" && state === "active";
                    return (
                      <tr key={m.booking_id} className="border-t border-[#EEE8D6] align-top">
                        <td className="py-3 pe-3 font-semibold">{m.guest_label}</td>
                        <td className="py-3 pe-3">{m.bookings ? operationsDate(m.bookings.scheduled_at, locale) : ""}</td>
                        <td className="py-3 pe-3">{name(m.bookings?.employees ?? null)}</td>
                        <td className="py-3 pe-3">
                          <span className="font-semibold">{bookingStatusLabel(m.bookings?.status, locale)}</span>
                          {awaiting && m.bookings && <span className="block text-xs text-amber-800">{t.amount}: {sar(Number(m.bookings.deposit_required), locale)}</span>}
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-2">
                            {awaiting && (
                              <button type="button" className={operationsButton} disabled={payingId === m.booking_id} onClick={() => void pay(m.booking_id)}>
                                {payingId === m.booking_id ? t.paying : t.payDeposit}
                              </button>
                            )}
                            {upcoming(m) && (
                              <button type="button" className={operationsButton} aria-label={`${t.cancelGuest}: ${m.guest_label}`} onClick={() => setCancelTarget({ group, member: m })}>
                                {t.cancelGuest}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {!loading && !loadError && total > GROUP_PAGE_SIZE && (
        <nav aria-label={t.listTitle} className="flex items-center justify-between gap-3">
          <button type="button" className={operationsButton} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t.prev}</button>
          <span className="text-sm text-[#667085]">{t.page(page + 1, pages)}</span>
          <button type="button" className={operationsButton} disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>{t.next}</button>
        </nav>
      )}

      {cancelTarget && (
        <CommandDialog
          locale={locale}
          tone="danger"
          title={cancelTarget.member ? t.cancelGuestTitle : t.cancelGroupTitle}
          intro={cancelTarget.member ? t.cancelGuestIntro : t.cancelGroupIntro}
          facts={cancelTarget.member?.bookings
            ? [{ label: t.guest, value: cancelTarget.member.guest_label }, { label: t.time, value: operationsDate(cancelTarget.member.bookings.scheduled_at, locale) }]
            : [{ label: t.guest, value: t.guestsCount(cancelTarget.group.headcount) }]}
          reasonLabel={t.cancelReason}
          reasonRequired={false}
          confirmLabel={cancelTarget.member ? t.cancelConfirmGuest : t.cancelConfirmGroup}
          onConfirm={cancel}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}
