"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ModalOverlay, ModalPortal } from "@/components/modal";
import {
  CommandResult, ForbiddenNotice, OperationsField as Field, OperationsPanel as Panel, isForbidden,
  operationsButton as button, operationsDate, operationsInput as input, useOperationsLocale,
} from "@/components/operations-ui";
import {
  WHATSAPP_PAGE_SIZE, WHATSAPP_REPLY_MAX, WHATSAPP_TRANSCRIPT_LIMIT, connectionState, describeWhatsappError, whatsappCopy,
  type ChannelRow, type ConversationRow, type Transcript,
} from "@/lib/whatsapp-receptionist";
import { useProviderContext } from "../_components/provider-context";

type Filter = "awaiting_human" | "bot" | "closed";
const FILTERS: Filter[] = ["awaiting_human", "bot", "closed"];

export default function ProviderWhatsappPage() {
  const locale = useOperationsLocale();
  const t = whatsappCopy[locale];
  const provider = useProviderContext();
  const providerId = provider.status === "ready" ? provider.context.providerId : null;
  const isOwner = provider.status === "ready" && provider.context.role === "owner";

  const [channel, setChannel] = useState<ChannelRow | null>(null);
  const [channelLoaded, setChannelLoaded] = useState(false);
  const [channelError, setChannelError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [windowHours, setWindowHours] = useState<number | null>(null);
  const [phoneId, setPhoneId] = useState("");
  const [display, setDisplay] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [ai, setAi] = useState(false);
  const [handoff, setHandoff] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<{ phone?: string; display?: string }>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ error?: string; success?: string }>({});
  const [reloadChannel, setReloadChannel] = useState(0);

  const [filter, setFilter] = useState<Filter>("awaiting_human");
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [reloadList, setReloadList] = useState(0);

  const [openId, setOpenId] = useState<string | null>(null);
  const [openLast4, setOpenLast4] = useState("");
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState("");
  const [reply, setReply] = useState("");
  const [replyError, setReplyError] = useState("");
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  // One key per message being composed: a double click or a retry after a lost response can never queue the reply twice.
  const replyKey = useRef<string>("");

  useEffect(() => {
    if (!providerId) return;
    let live = true;
    void (async () => {
      const [channelResult, settingResult] = await Promise.all([
        supabase.from("whatsapp_channels").select("id, provider_id, phone_number_id, display_number, enabled, ai_enabled, handoff_enabled, verified_at, last_inbound_at").eq("provider_id", providerId).maybeSingle(),
        supabase.from("platform_settings").select("value").eq("key", "whatsapp.session_window_hours").maybeSingle(),
      ]);
      if (!live) return;
      if (channelResult.error) {
        setForbidden(isForbidden(channelResult.error));
        setChannelError(describeWhatsappError(channelResult.error, locale));
        setChannelLoaded(true);
        return;
      }
      const current = (channelResult.data as ChannelRow | null) ?? null;
      setChannel(current);
      setPhoneId(current?.phone_number_id ?? "");
      setDisplay(current?.display_number ?? "");
      setEnabled(current?.enabled ?? false);
      setAi(current?.ai_enabled ?? false);
      setHandoff(current?.handoff_enabled ?? true);
      const value = settingResult.data?.value;
      setWindowHours(typeof value === "number" ? value : null);
      setChannelError("");
      setChannelLoaded(true);
    })();
    return () => { live = false; };
  }, [providerId, reloadChannel, locale]);

  useEffect(() => {
    if (!providerId) return;
    let live = true;
    void (async () => {
      setLoading(true);
      setListError("");
      const from = page * WHATSAPP_PAGE_SIZE;
      const { data, error, count } = await supabase.from("whatsapp_conversations").select("id, customer_last4, status, handoff_reason, locale, last_inbound_at, opted_out_at, updated_at", { count: "exact" })
        .eq("provider_id", providerId).eq("status", filter)
        .order("last_inbound_at", { ascending: false, nullsFirst: false })
        .range(from, from + WHATSAPP_PAGE_SIZE - 1);
      if (!live) return;
      if (error) { setRows([]); setTotal(0); setForbidden((f) => f || isForbidden(error)); setListError(describeWhatsappError(error, locale)); }
      else { setRows((data ?? []) as ConversationRow[]); setTotal(count ?? 0); }
      setLoading(false);
    })();
    return () => { live = false; };
  }, [providerId, filter, page, reloadList, locale]);

  const loadTranscript = useCallback(async (id: string) => {
    setTranscriptLoading(true);
    setTranscriptError("");
    const { data, error } = await supabase.rpc("provider_open_whatsapp_conversation", { p_conversation_id: id, p_limit: WHATSAPP_TRANSCRIPT_LIMIT });
    if (error) { setTranscript(null); setTranscriptError(describeWhatsappError(error, locale)); }
    else setTranscript(data as Transcript);
    setTranscriptLoading(false);
  }, [locale]);

  const openConversation = (row: ConversationRow) => {
    setOpenId(row.id);
    setOpenLast4(row.customer_last4);
    setTranscript(null);
    setReply("");
    setReplyError("");
    replyKey.current = crypto.randomUUID();
    void loadTranscript(row.id);
  };
  const closeConversation = () => { setOpenId(null); setTranscript(null); };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!providerId || saving) return;
    const errors: { phone?: string; display?: string } = {};
    if (!/^[0-9]{5,25}$/.test(phoneId.trim())) errors.phone = t.phoneIdInvalid;
    if (display.trim() !== "" && !/^[+]?[0-9 ()-]{6,24}$/.test(display.trim())) errors.display = t.displayInvalid;
    setFieldErrors(errors);
    if (errors.phone || errors.display) return;
    setSaving(true);
    const { error } = await supabase.rpc("provider_save_whatsapp_channel", {
      p_provider_id: providerId, p_phone_number_id: phoneId.trim(), p_display_number: display.trim() === "" ? null : display.trim(),
      p_enabled: enabled, p_ai_enabled: ai, p_handoff_enabled: handoff,
    });
    setSaving(false);
    if (error) { setResult({ error: describeWhatsappError(error, locale) }); return; }
    setResult({ success: t.saved });
    setReloadChannel((n) => n + 1);
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!openId || sending) return;
    const text = reply.trim();
    if (text === "") { setReplyError(t.replyEmpty); return; }
    if (text.length > WHATSAPP_REPLY_MAX) { setReplyError(t.replyTooLong(WHATSAPP_REPLY_MAX)); return; }
    setReplyError("");
    setSending(true);
    const { error } = await supabase.rpc("provider_send_whatsapp_reply", { p_conversation_id: openId, p_text: text, p_idempotency_key: replyKey.current });
    setSending(false);
    // On failure the typed reply stays in the box and the same key is kept, so a retry is the same request.
    if (error) { setReplyError(describeWhatsappError(error, locale)); return; }
    setReply("");
    replyKey.current = crypto.randomUUID();
    setResult({ success: t.sent });
    void loadTranscript(openId);
    setReloadList((n) => n + 1);
  };

  const resolve = async () => {
    if (!openId || resolving) return;
    setResolving(true);
    const { error } = await supabase.rpc("provider_resolve_whatsapp_conversation", { p_conversation_id: openId });
    setResolving(false);
    if (error) { setReplyError(describeWhatsappError(error, locale)); return; }
    setResult({ success: t.resolved });
    closeConversation();
    setReloadList((n) => n + 1);
  };

  const state = connectionState(channel);
  const pages = Math.max(1, Math.ceil(total / WHATSAPP_PAGE_SIZE));
  const reasonOf = (row: ConversationRow) => (row.opted_out_at ? t.optedOut : row.handoff_reason ? (t.reasons[row.handoff_reason] ?? row.handoff_reason) : "");
  const controlsOff = !isOwner || saving || !channelLoaded;

  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} className="space-y-6 text-[#101828]">
      <header>
        <h1 className="font-serif text-3xl font-bold">{t.title}</h1>
        <p className="mt-2 text-sm text-[#667085]">{t.subtitle}</p>
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
          <Panel title={t.connectionTitle}>
            {!channelLoaded && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
            {channelError && !forbidden && (
              <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <span>{channelError}</span><button type="button" className={button} onClick={() => setReloadChannel((n) => n + 1)}>{t.retry}</button>
              </div>
            )}
            {channelLoaded && !channelError && (
              <>
                <p className="mb-2 text-sm"><span className="font-semibold">{t.status}: </span>
                  <span data-testid="whatsapp-status">{t.state[state]}{state === "receiving" && channel?.last_inbound_at ? ` ${operationsDate(channel.last_inbound_at, locale)}` : ""}</span>
                </p>
                <p className="mb-4 text-xs text-[#667085]">{windowHours === null ? t.windowUnset : t.windowSet(windowHours)}</p>
                <form onSubmit={save} className="grid gap-4 md:max-w-xl" noValidate>
                  <Field label={t.phoneIdLabel}>
                    <input className={input} inputMode="numeric" dir="ltr" value={phoneId} disabled={controlsOff} aria-invalid={Boolean(fieldErrors.phone)}
                      aria-describedby="wa-phone-help" onChange={(e) => setPhoneId(e.target.value)} />
                    <span id="wa-phone-help" className={fieldErrors.phone ? "text-red-700" : "font-normal"}>{fieldErrors.phone ?? t.phoneIdHelp}</span>
                  </Field>
                  <Field label={t.displayLabel}>
                    <input className={input} inputMode="tel" dir="ltr" value={display} disabled={controlsOff} aria-invalid={Boolean(fieldErrors.display)}
                      aria-describedby="wa-display-help" onChange={(e) => setDisplay(e.target.value)} />
                    <span id="wa-display-help" className={fieldErrors.display ? "text-red-700" : "font-normal"}>{fieldErrors.display ?? t.displayHelp}</span>
                  </Field>
                  <label className="flex items-start gap-3 text-sm">
                    <input type="checkbox" role="switch" className="mt-1 h-4 w-4" checked={enabled} disabled={controlsOff}
                      onChange={(e) => { setEnabled(e.target.checked); if (!e.target.checked) setAi(false); }} />
                    <span><span className="font-semibold">{t.enableLabel}</span><span className="block text-xs text-[#667085]">{t.enableHelp}</span></span>
                  </label>
                  <label className="flex items-start gap-3 text-sm">
                    <input type="checkbox" role="switch" className="mt-1 h-4 w-4" checked={ai} disabled={controlsOff || !enabled} aria-describedby="wa-ai-help"
                      onChange={(e) => setAi(e.target.checked)} />
                    <span><span className="font-semibold">{t.aiLabel}</span><span id="wa-ai-help" className="block text-xs text-[#667085]">{enabled ? t.aiHelp : t.aiNeedsEnabled}</span></span>
                  </label>
                  <label className="flex items-start gap-3 text-sm">
                    <input type="checkbox" role="switch" className="mt-1 h-4 w-4" checked={handoff} disabled={controlsOff} onChange={(e) => setHandoff(e.target.checked)} />
                    <span><span className="font-semibold">{t.handoffLabel}</span><span className="block text-xs text-[#667085]">{t.handoffHelp}</span></span>
                  </label>
                  {isOwner
                    ? <div><button className={button} disabled={saving}>{saving ? t.saving : t.save}</button></div>
                    : <p className="text-sm text-[#667085]">{t.ownerOnly}</p>}
                </form>
              </>
            )}
          </Panel>

          <Panel title={t.inboxTitle}>
            <div role="group" aria-label={t.filterLabel} className="mb-4 flex flex-wrap gap-2">
              {FILTERS.map((value) => (
                <button key={value} type="button" aria-pressed={filter === value} className={`${button} ${filter === value ? "ring-2 ring-[#9B7928]" : ""}`}
                  onClick={() => { setFilter(value); setPage(0); }}>
                  {t.filters[value]}
                </button>
              ))}
            </div>
            {loading && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
            {!loading && listError && !forbidden && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <span>{t.listFailed} {listError}</span><button type="button" className={button} onClick={() => setReloadList((n) => n + 1)}>{t.retry}</button>
              </div>
            )}
            {!loading && !listError && rows.length === 0 && <p className="text-sm text-[#667085]">{t.inboxEmpty[filter]}</p>}
            {!loading && rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-start text-sm">
                  <caption className="sr-only">{t.filters[filter]}</caption>
                  <thead>
                    <tr className="text-xs text-[#667085]">
                      <th scope="col" className="py-2 pe-3 text-start">{t.customer}</th>
                      <th scope="col" className="py-2 pe-3 text-start">{t.reason}</th>
                      <th scope="col" className="py-2 pe-3 text-start">{t.lastMessage}</th>
                      <th scope="col" className="py-2 text-start"><span className="sr-only">{t.open}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-[#EEE8D6] align-top">
                        <td className="py-3 pe-3 font-semibold">{t.endingIn(row.customer_last4)}</td>
                        <td className="py-3 pe-3">{reasonOf(row)}</td>
                        <td className="py-3 pe-3">{row.last_inbound_at ? operationsDate(row.last_inbound_at, locale) : ""}</td>
                        <td className="py-3"><button type="button" className={button} aria-label={t.openLabel(row.customer_last4)} onClick={() => openConversation(row)}>{t.open}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && !listError && total > WHATSAPP_PAGE_SIZE && (
              <nav aria-label={t.inboxTitle} className="mt-4 flex items-center justify-between gap-3">
                <button type="button" className={button} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t.prev}</button>
                <span className="text-sm text-[#667085]">{t.page(page + 1, pages)}</span>
                <button type="button" className={button} disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>{t.next}</button>
              </nav>
            )}
          </Panel>
        </>
      )}

      {openId && (
        <ModalPortal>
          <ModalOverlay onClose={closeConversation} canClose={!sending && !resolving} className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#101828]/40 px-4 py-6 backdrop-blur-sm">
            <div role="dialog" aria-modal="true" aria-labelledby="wa-dialog-title" dir={locale === "ar" ? "rtl" : "ltr"} tabIndex={-1}
              className="flex max-h-full w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-3xl border border-[#ECECEC] bg-white p-6 text-sm text-gray-700">
              <h2 id="wa-dialog-title" className="font-serif text-lg font-black text-gray-900">{t.transcriptTitle(openLast4)}</h2>
              <p className="text-xs text-[#667085]">{t.transcriptNote}</p>
              {transcriptLoading && <p role="status">{t.transcriptLoading}</p>}
              {transcriptError && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
                  <span>{t.transcriptFailed} {transcriptError}</span><button type="button" className={button} onClick={() => void loadTranscript(openId)}>{t.retry}</button>
                </div>
              )}
              {transcript && (
                <>
                  {transcript.messages.length === 0 && <p>{t.noMessages}</p>}
                  <ol aria-label={t.transcriptTitle(openLast4)} className="space-y-3">
                    {transcript.messages.map((m) => (
                      <li key={m.id} className={`rounded-2xl border p-3 ${m.sender === "customer" ? "border-[#E8DDC0] bg-[#FBF8EF]" : "border-[#D8D2C5] bg-white"}`}>
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[#667085]">
                          <span className="font-bold text-[#101828]">{t.senders[m.sender]}</span>
                          <span>{operationsDate(m.created_at, locale)}{m.delivery_status ? ` · ${t.delivery[m.delivery_status]}` : ""}</span>
                        </div>
                        <p className="whitespace-pre-wrap break-words" dir="auto">
                          {m.body ?? (m.message_type === "text" ? t.bodyGone : t.nonText)}
                        </p>
                      </li>
                    ))}
                  </ol>
                  {!transcript.can_reply && transcript.reply_blocked_reason && (
                    <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
                      {t.cannotReply[transcript.reply_blocked_reason] ?? transcript.reply_blocked_reason}
                    </p>
                  )}
                  <form onSubmit={send} className="grid gap-2" noValidate>
                    <Field label={t.replyLabel}>
                      <textarea className={input} rows={3} dir="auto" maxLength={WHATSAPP_REPLY_MAX + 200} value={reply} disabled={sending || !transcript.can_reply}
                        aria-invalid={Boolean(replyError)} aria-describedby="wa-reply-help" onChange={(e) => setReply(e.target.value)} />
                      <span id="wa-reply-help" className={replyError ? "text-red-700" : "font-normal"} role={replyError ? "alert" : undefined}>
                        {replyError || t.replyHelp(WHATSAPP_REPLY_MAX)}
                      </span>
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <button className={button} disabled={sending || !transcript.can_reply}>{sending ? t.sending : t.send}</button>
                      {transcript.conversation.status !== "closed" && (
                        <button type="button" className={button} disabled={resolving || sending} onClick={() => void resolve()}>{resolving ? t.resolving : t.resolve}</button>
                      )}
                    </div>
                  </form>
                </>
              )}
              <div><button type="button" data-autofocus className={button} onClick={closeConversation} disabled={sending || resolving}>{t.close}</button></div>
            </div>
          </ModalOverlay>
        </ModalPortal>
      )}
    </div>
  );
}
