"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { CommandDialog } from "@/components/modal";
import {
  CommandResult, ForbiddenNotice, OperationsField as Field, OperationsPanel as Panel, isForbidden,
  operationsButton as button, operationsDate, operationsInput as input, useOperationsLocale,
} from "@/components/operations-ui";
import {
  GROUP_PAGE_SIZE, MAX_GROUP_SIZE, MIN_GROUP_SIZE, bookingStatusLabel, describeGroupError, groupCopy,
  type GroupCancelled, type GroupSettings,
} from "@/lib/group-booking";
import { useProviderContext } from "../_components/provider-context";

type Names = { name_en: string; name_ar: string | null } | null;
type MemberRow = {
  sequence: number;
  guest_label: string;
  booking_id: string;
  bookings: { id: string; status: string; scheduled_at: string; employees: Names; services: Names } | null;
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
  profiles: { first_name: string | null; last_name: string | null } | null;
  group_booking_members: MemberRow[];
};
type CancelTarget = { group: GroupRow; member: MemberRow | null };

const SELECT = `id, event_date, occasion, headcount, notes, status, payment_due_at, created_at,
  profiles ( first_name, last_name ),
  group_booking_members ( sequence, guest_label, booking_id, bookings ( id, status, scheduled_at, employees ( name_en, name_ar ), services ( name_en, name_ar ) ) )`;

export default function ProviderGroupsPage() {
  const locale = useOperationsLocale();
  const t = groupCopy[locale];
  const provider = useProviderContext();
  const providerId = provider.status === "ready" ? provider.context.providerId : null;
  const isOwner = provider.status === "ready" && provider.context.role === "owner";

  const [settings, setSettings] = useState<GroupSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [max, setMax] = useState("");
  const [hold, setHold] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ max?: string; hold?: string }>({});
  const [result, setResult] = useState<{ error?: string; success?: string }>({});

  const [rows, setRows] = useState<GroupRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [reload, setReload] = useState(0);
  // The clock the screen judges 'upcoming' by: read when the list is loaded, not on every render.
  const [now, setNow] = useState(() => Date.now());
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);

  useEffect(() => {
    if (!providerId) return;
    let live = true;
    void (async () => {
      const { data, error } = await supabase.from("provider_group_settings")
        .select("enabled, max_group_size, payment_hold_hours").eq("provider_id", providerId).maybeSingle();
      if (!live) return;
      if (error) { setForbidden(isForbidden(error)); setSettingsError(describeGroupError(error, locale)); return; }
      const current = (data as GroupSettings | null) ?? { enabled: false, max_group_size: null, payment_hold_hours: null };
      setSettings(current);
      setEnabled(current.enabled);
      setMax(current.max_group_size == null ? "" : String(current.max_group_size));
      setHold(current.payment_hold_hours == null ? "" : String(current.payment_hold_hours));
      setSettingsError("");
    })();
    return () => { live = false; };
  }, [providerId, reload, locale]);

  useEffect(() => {
    if (!providerId) return;
    let live = true;
    void (async () => {
      setLoading(true);
      setListError("");
      const from = page * GROUP_PAGE_SIZE;
      const { data, error, count } = await supabase.from("group_bookings").select(SELECT, { count: "exact" })
        .eq("provider_id", providerId)
        .order("event_date", { ascending: false })
        .range(from, from + GROUP_PAGE_SIZE - 1);
      if (!live) return;
      if (error) { setRows([]); setTotal(0); setListError(describeGroupError(error, locale)); }
      else { setRows((data ?? []) as unknown as GroupRow[]); setTotal(count ?? 0); }
      setNow(Date.now());
      setLoading(false);
    })();
    return () => { live = false; };
  }, [providerId, page, reload, locale]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!providerId || saving) return;
    const errors: { max?: string; hold?: string } = {};
    const maxNumber = max.trim() === "" ? null : Number(max);
    const holdNumber = hold.trim() === "" ? null : Number(hold);
    if (enabled && (maxNumber == null || !Number.isInteger(maxNumber) || maxNumber < MIN_GROUP_SIZE || maxNumber > MAX_GROUP_SIZE)) errors.max = t.maxInvalid;
    if (maxNumber != null && !errors.max && (!Number.isInteger(maxNumber) || maxNumber < MIN_GROUP_SIZE || maxNumber > MAX_GROUP_SIZE)) errors.max = t.maxInvalid;
    if (holdNumber != null && (!Number.isInteger(holdNumber) || holdNumber < 1 || holdNumber > 168)) errors.hold = t.holdInvalid;
    setFieldErrors(errors);
    if (errors.max || errors.hold) return;
    setSaving(true);
    const { error } = await supabase.rpc("set_provider_group_settings", {
      p_provider_id: providerId, p_enabled: enabled, p_max_group_size: maxNumber, p_payment_hold_hours: holdNumber, p_reason: null,
    });
    setSaving(false);
    if (error) { setResult({ error: describeGroupError(error, locale) }); return; }
    setResult({ success: t.saved });
    setReload((n) => n + 1);
  };

  const cancel = async (reason: string): Promise<string | null> => {
    if (!cancelTarget) return null;
    const { data, error } = cancelTarget.member
      ? await supabase.rpc("cancel_group_member", { p_booking_id: cancelTarget.member.booking_id, p_reason: reason.trim() })
      : await supabase.rpc("cancel_group_booking", { p_group_id: cancelTarget.group.id, p_reason: reason.trim() });
    if (error) return describeGroupError(error, locale);
    const done = data as GroupCancelled;
    setResult(done.failed > 0 ? { error: t.cancelPartial(done.cancelled, done.failed) } : { success: t.cancelledDone(done.cancelled) });
    setReload((n) => n + 1);
    return null;
  };

  const pages = Math.max(1, Math.ceil(total / GROUP_PAGE_SIZE));
  const name = (n: Names) => (n ? (locale === "ar" ? n.name_ar || n.name_en : n.name_en) : "");
  const isLive = (status: string | undefined) => status === "pending_payment" || status === "confirmed";
  const upcoming = (m: MemberRow) => Boolean(m.bookings) && isLive(m.bookings?.status) && new Date(m.bookings?.scheduled_at ?? 0).getTime() > now;
  const stateOf = (g: GroupRow) =>
    g.status === "cancelled" || (g.group_booking_members.length > 0 && g.group_booking_members.every((m) => m.bookings?.status === "cancelled")) ? "cancelled" : "active";

  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} className="space-y-6 text-[#101828]">
      <header>
        <h1 className="font-serif text-3xl font-bold">{t.providerTitle}</h1>
        <p className="mt-2 text-sm text-[#667085]">{t.providerSubtitle}</p>
      </header>
      <CommandResult error={result.error} success={result.success} locale={locale} onDismiss={() => setResult({})} />

      {provider.status === "loading" && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
      {provider.status === "error" && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{provider.message}</span><button type="button" className={button} onClick={provider.retry}>{t.retry}</button>
        </div>
      )}
      {provider.status === "ready" && !providerId && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">{t.noProvider}</p>}
      {forbidden && <ForbiddenNotice locale={locale} />}

      {providerId && (
        <>
          <Panel title={t.settingsTitle}>
            {settingsError && !forbidden && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{t.settingsFailed} {settingsError}</p>}
            <form onSubmit={save} className="grid gap-4 md:max-w-xl" noValidate>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" role="switch" className="mt-1 h-4 w-4" checked={enabled} disabled={!isOwner || saving || !settings} onChange={(e) => setEnabled(e.target.checked)} />
                <span><span className="font-semibold">{t.enable}</span><span className="block text-xs text-[#667085]">{t.enableHelp}</span></span>
              </label>
              <Field label={t.maxLabel}>
                <input className={input} type="number" inputMode="numeric" min={MIN_GROUP_SIZE} max={MAX_GROUP_SIZE} value={max} disabled={!isOwner || saving || !settings}
                  aria-invalid={Boolean(fieldErrors.max)} aria-describedby="group-max-help" onChange={(e) => setMax(e.target.value)} />
                <span id="group-max-help" className={fieldErrors.max ? "text-red-700" : "font-normal"}>{fieldErrors.max ?? t.maxHelp}</span>
              </Field>
              <Field label={t.holdLabel}>
                <input className={input} type="number" inputMode="numeric" min={1} max={168} value={hold} disabled={!isOwner || saving || !settings}
                  aria-invalid={Boolean(fieldErrors.hold)} aria-describedby="group-hold-help" onChange={(e) => setHold(e.target.value)} />
                <span id="group-hold-help" className={fieldErrors.hold ? "text-red-700" : "font-normal"}>{fieldErrors.hold ?? t.holdHelp}</span>
              </Field>
              {isOwner
                ? <div><button className={button} disabled={saving || !settings}>{saving ? t.saving : t.save}</button></div>
                : <p className="text-sm text-[#667085]">{t.ownerOnly}</p>}
            </form>
          </Panel>

          <Panel title={t.groupsTitle}>
            {loading && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
            {!loading && listError && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <span>{t.listLoadFailed} {listError}</span><button type="button" className={button} onClick={() => setReload((n) => n + 1)}>{t.retry}</button>
              </div>
            )}
            {!loading && !listError && rows.length === 0 && <p className="text-sm text-[#667085]">{t.noGroups}</p>}
            {!loading && rows.length > 0 && (
              <div className="space-y-5">
                {rows.map((group) => {
                  const members = [...group.group_booking_members].sort((a, b) => a.sequence - b.sequence);
                  const state = stateOf(group);
                  const host = [group.profiles?.first_name, group.profiles?.last_name].filter(Boolean).join(" ") || t.hostUnknown;
                  const heading = `${t.occasion[group.occasion] ?? group.occasion} · ${host}`;
                  return (
                    <section key={group.id} aria-label={heading} className="rounded-2xl border border-[#E8DDC0] bg-[#FBF8EF] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-serif text-lg font-bold">{heading}</h3>
                          <p className="text-sm text-[#667085]">
                            {t.event}: {new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${group.event_date}T00:00:00Z`))} · {t.guestsCount(group.headcount)}
                          </p>
                          {group.notes && <p className="mt-1 text-sm text-[#344054]">{group.notes}</p>}
                          {group.payment_due_at && state === "active" && <p className="mt-1 text-xs text-amber-800">{t.payBefore}: {operationsDate(group.payment_due_at, locale)}</p>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[#E8DDC0] bg-white px-3 py-1 text-xs font-bold">{t.groupState[state] ?? state}</span>
                          {state === "active" && members.some(upcoming) && <button type="button" className={button} onClick={() => setCancelTarget({ group, member: null })}>{t.cancelGroup}</button>}
                        </div>
                      </div>
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full min-w-[640px] text-start text-sm">
                          <caption className="sr-only">{heading}</caption>
                          <thead>
                            <tr className="text-xs text-[#667085]">
                              <th scope="col" className="py-2 pe-3 text-start">{t.guest}</th>
                              <th scope="col" className="py-2 pe-3 text-start">{t.serviceCol}</th>
                              <th scope="col" className="py-2 pe-3 text-start">{t.professionalCol}</th>
                              <th scope="col" className="py-2 pe-3 text-start">{t.time}</th>
                              <th scope="col" className="py-2 text-start">{t.status}</th>
                              <th scope="col" className="py-2 text-start"><span className="sr-only">{t.cancelGuest}</span></th>
                            </tr>
                          </thead>
                          <tbody>
                            {members.map((m) => (
                              <tr key={m.booking_id} className="border-t border-[#EEE8D6] align-top">
                                <td className="py-3 pe-3 font-semibold">{m.guest_label}</td>
                                <td className="py-3 pe-3">{name(m.bookings?.services ?? null)}</td>
                                <td className="py-3 pe-3">{name(m.bookings?.employees ?? null)}</td>
                                <td className="py-3 pe-3">{m.bookings ? operationsDate(m.bookings.scheduled_at, locale) : ""}</td>
                                <td className="py-3 pe-3 font-semibold">{bookingStatusLabel(m.bookings?.status, locale)}</td>
                                <td className="py-3">
                                  {upcoming(m) && (
                                    <button type="button" className={button} aria-label={`${t.cancelGuest}: ${m.guest_label}`} onClick={() => setCancelTarget({ group, member: m })}>
                                      {t.cancelGuest}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  );
                })}
                <div><Link href="/provider/bookings" className={button}>{t.viewBookings}</Link></div>
              </div>
            )}
            {!loading && !listError && total > GROUP_PAGE_SIZE && (
              <nav aria-label={t.groupsTitle} className="mt-4 flex items-center justify-between gap-3">
                <button type="button" className={button} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t.prev}</button>
                <span className="text-sm text-[#667085]">{t.page(page + 1, pages)}</span>
                <button type="button" className={button} disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>{t.next}</button>
              </nav>
            )}
          </Panel>
        </>
      )}

      {cancelTarget && (
        <CommandDialog
          locale={locale}
          tone="danger"
          title={cancelTarget.member ? t.cancelByProviderGuestTitle : t.cancelByProviderTitle}
          intro={cancelTarget.member ? t.cancelByProviderGuestIntro : t.cancelByProviderIntro}
          facts={cancelTarget.member?.bookings
            ? [{ label: t.guest, value: cancelTarget.member.guest_label }, { label: t.time, value: operationsDate(cancelTarget.member.bookings.scheduled_at, locale) }]
            : [{ label: t.guest, value: t.guestsCount(cancelTarget.group.headcount) }]}
          reasonLabel={t.providerReason}
          reasonRequired
          confirmLabel={cancelTarget.member ? t.cancelConfirmGuest : t.cancelConfirmGroup}
          onConfirm={cancel}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}
