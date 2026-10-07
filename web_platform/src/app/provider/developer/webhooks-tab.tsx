"use client";

import React, { useCallback, useEffect, useId, useState } from "react";
import { CommandDialog } from "@/components/modal";
import { OperationsPanel, operationsDate, type OperationsLocale } from "@/components/operations-ui";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import {
  API_SETTING_KEYS, DELIVERY_COLUMNS, DELIVERY_LOG_PAGE, WEBHOOK_EVENTS, webhookDeliveryEnabled,
  type ApiSettings, type DeliveryRow, type EndpointRow,
} from "@/lib/developer-api";
import type { DeveloperCopy } from "./copy";
import { branchName, type Branch, type LoadState } from "./keys-tab";
import { dangerButton, explainError, FieldError, fieldClass, FormDialog, primaryButton, secondaryButton, StatusBadge } from "./shared";

export type SecretToShow = { title: string; warning: string; label: string; value: string };

function endpointState(e: EndpointRow, t: DeveloperCopy): { tone: "good" | "warn" | "bad" | "muted"; label: string } {
  if (e.disabled_reason === "retired") return { tone: "muted", label: t.endpointState.retired };
  if (!e.is_active && e.disabled_reason === "consecutive_failures") return { tone: "bad", label: t.endpointState.failing };
  if (!e.is_active) return { tone: "muted", label: t.endpointState.paused };
  if (e.consecutive_failures > 0) return { tone: "warn", label: t.failureStreak.replace("{n}", String(e.consecutive_failures)) };
  if (!e.last_success_at && !e.last_failure_at) return { tone: "muted", label: t.endpointState.idle };
  return { tone: "good", label: t.endpointState.ok };
}

function EventPicker({ t, value, onChange, error, id }: { t: DeveloperCopy; value: string[]; onChange: (next: string[]) => void; error: string; id: string }) {
  return (
    <fieldset>
      <legend className="text-xs font-black text-[#344054]">{t.fieldEvents}</legend>
      <div className="mt-2 space-y-2">
        {WEBHOOK_EVENTS.map((event) => (
          <label key={event} className="flex items-start gap-2.5 text-sm text-[#344054]">
            <input type="checkbox" checked={value.includes(event)} className="mt-1 h-4 w-4 shrink-0 accent-[#9B7928]"
              onChange={(e) => onChange(e.target.checked ? [...value, event] : value.filter((v) => v !== event))} />
            <span>
              <bdi dir="ltr" className="rounded bg-[#F2F4F7] px-1.5 py-0.5 font-mono text-xs">{event}</bdi>
              <span className="ms-2 text-xs text-[#667085]">{t.eventHelp[event]}</span>
            </span>
          </label>
        ))}
      </div>
      {error && <FieldError id={id}>{error}</FieldError>}
    </fieldset>
  );
}

function AddEndpointDialog({
  locale, t, providerId, branches, onCreated, onClose,
}: {
  locale: OperationsLocale; t: DeveloperCopy; providerId: string; branches: Branch[];
  onCreated: (secret: string) => void; onClose: () => void;
}) {
  const ids = { name: useId(), url: useId(), branch: useId(), events: useId() };
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [branchId, setBranchId] = useState("");
  const [events, setEvents] = useState<string[]>(["booking.created", "booking.confirmed"]);
  const [attempted, setAttempted] = useState(false);
  const problems = {
    name: name.trim().length < 3 || name.trim().length > 80 ? t.needName : "",
    url: !/^https:\/\/\S+$/i.test(url.trim()) ? t.needUrl : "",
    events: events.length === 0 ? t.needEvent : "",
  };
  return (
    <FormDialog
      locale={locale} title={t.addEndpointTitle} submitLabel={t.create} busyLabel={t.creating} cancelLabel={t.cancel} wide onClose={onClose}
      onSubmit={async () => {
        setAttempted(true);
        if (Object.values(problems).some(Boolean)) return null;
        const { data, error } = await supabase.rpc("create_webhook_endpoint", {
          p_provider_id: providerId, p_branch_id: branchId || null, p_name: name.trim(), p_url: url.trim(), p_event_types: events,
        });
        if (error) return explainError(error, locale, t);
        onCreated((data as { signing_secret: string }).signing_secret);
        return null;
      }}
    >
      <div>
        <label htmlFor={ids.name} className="block text-xs font-black text-[#344054]">{t.fieldName}</label>
        <input id={ids.name} data-autofocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off"
          aria-invalid={attempted && Boolean(problems.name)} className={fieldClass} />
        {attempted && problems.name && <FieldError id={`${ids.name}-err`}>{problems.name}</FieldError>}
      </div>
      <div>
        <label htmlFor={ids.url} className="block text-xs font-black text-[#344054]">{t.fieldUrl}</label>
        <input id={ids.url} type="url" dir="ltr" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" spellCheck={false}
          placeholder="https://hooks.example.com/primora" aria-invalid={attempted && Boolean(problems.url)} aria-describedby={`${ids.url}-hint`} className={fieldClass} />
        <p id={`${ids.url}-hint`} className="mt-1 text-xs text-[#667085]">{t.fieldUrlHint}</p>
        {attempted && problems.url && <FieldError id={`${ids.url}-err`}>{problems.url}</FieldError>}
      </div>
      <div>
        <label htmlFor={ids.branch} className="block text-xs font-black text-[#344054]">{t.fieldBranch}</label>
        <select id={ids.branch} value={branchId} onChange={(e) => setBranchId(e.target.value)} className={fieldClass}>
          <option value="">{t.allBranches}</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{branchName(branches, b.id, locale, t.allBranches)}</option>)}
        </select>
      </div>
      <EventPicker t={t} value={events} onChange={setEvents} error={attempted ? problems.events : ""} id={`${ids.events}-err`} />
    </FormDialog>
  );
}

function EditEndpointDialog({ locale, t, endpoint, onSaved, onClose }: {
  locale: OperationsLocale; t: DeveloperCopy; endpoint: EndpointRow; onSaved: () => void; onClose: () => void;
}) {
  const nameId = useId();
  const [name, setName] = useState(endpoint.name ?? "");
  const [events, setEvents] = useState<string[]>(endpoint.event_types);
  const [attempted, setAttempted] = useState(false);
  const problems = { name: name.trim().length < 3 || name.trim().length > 80 ? t.needName : "", events: events.length === 0 ? t.needEvent : "" };
  return (
    <FormDialog
      locale={locale} title={t.editEndpointTitle} submitLabel={t.save} busyLabel={t.saving} cancelLabel={t.cancel} onClose={onClose}
      onSubmit={async () => {
        setAttempted(true);
        if (Object.values(problems).some(Boolean)) return null;
        const { error } = await supabase.rpc("update_webhook_endpoint", { p_endpoint_id: endpoint.id, p_name: name.trim(), p_event_types: events });
        if (error) return explainError(error, locale, t);
        onSaved();
        onClose();
        return null;
      }}
    >
      <div>
        <label htmlFor={nameId} className="block text-xs font-black text-[#344054]">{t.fieldName}</label>
        <input id={nameId} data-autofocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off"
          aria-invalid={attempted && Boolean(problems.name)} className={fieldClass} />
        {attempted && problems.name && <FieldError id={`${nameId}-err`}>{problems.name}</FieldError>}
      </div>
      <EventPicker t={t} value={events} onChange={setEvents} error={attempted ? problems.events : ""} id={`${nameId}-events-err`} />
    </FormDialog>
  );
}

type Action = { kind: "pause" | "resume" | "rotate" | "delete"; endpoint: EndpointRow };

export function WebhooksTab({
  locale, t, providerId, branches, settings, state, onReload, onSecret, onResult,
}: {
  locale: OperationsLocale;
  t: DeveloperCopy;
  providerId: string;
  branches: Branch[];
  settings: ApiSettings;
  state: LoadState<EndpointRow>;
  onReload: () => void;
  onSecret: (secret: SecretToShow) => void;
  onResult: (message: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<EndpointRow | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [logFor, setLogFor] = useState<string | null>(null);
  const deliveryOn = webhookDeliveryEnabled(settings);
  const missing = API_SETTING_KEYS.filter((k) => k.startsWith("api.webhook_") && k !== "api.webhook_disable_after_failures" && settings[k] === null);

  const endpoints = state.status === "ready" ? state.rows : [];
  const selected = logFor ? endpoints.find((e) => e.id === logFor) ?? null : null;

  return (
    <div className="space-y-6">
      <OperationsPanel title={t.webhooksTitle}>
        <p className="max-w-3xl text-sm leading-6 text-[#475467]">{t.webhooksIntro}</p>
        {!deliveryOn && (
          <div role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-black">{t.deliveryOffTitle}</p>
            <p className="mt-1 leading-6">{t.deliveryOffBody.replace("{missing}", missing.join(", "))}</p>
          </div>
        )}
        <div className="mt-4"><button type="button" className={primaryButton} onClick={() => setAdding(true)}>{t.addEndpoint}</button></div>

        <div className="mt-5">
          {state.status === "loading" && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
          {state.status === "error" && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <p className="font-bold">{t.endpointsLoadFailed}</p>
              <p className="mt-1 break-words">{state.message}</p>
              <button type="button" onClick={onReload} className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-black">{t.retry}</button>
            </div>
          )}
          {state.status === "ready" && endpoints.length === 0 && <p className="rounded-xl border border-dashed border-[#D0D5DD] p-6 text-center text-sm text-[#667085]">{t.noEndpoints}</p>}
          {endpoints.length > 0 && (
            <ul className="space-y-3">
              {endpoints.map((e) => {
                const s = endpointState(e, t);
                const label = e.name ?? e.target_url;
                const aria = (a: string) => t.endpointAria.replace("{action}", a).replace("{name}", label);
                return (
                  <li key={e.id} className="rounded-2xl border border-[#ECECEC] bg-[#FDFCF8] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-[#101828]">{label}</p>
                        <p dir="ltr" className="mt-0.5 break-all text-start font-mono text-xs text-[#475467]">{e.target_url}</p>
                        <p className="mt-1 text-xs text-[#667085]">{branchName(branches, e.branch_id, locale, t.allBranches)}</p>
                      </div>
                      <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t.colEvents}>
                      {e.event_types.map((ev) => <li key={ev}><bdi dir="ltr" className="rounded bg-[#F2F4F7] px-1.5 py-0.5 font-mono text-xs">{ev}</bdi></li>)}
                    </ul>
                    <p className="mt-2 text-xs text-[#667085]">
                      {e.last_success_at ? t.lastSuccess.replace("{when}", operationsDate(e.last_success_at, locale)) : ""}
                      {e.last_success_at && e.last_failure_at ? " · " : ""}
                      {e.last_failure_at ? t.lastFailure.replace("{when}", operationsDate(e.last_failure_at, locale)) : ""}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className={secondaryButton} aria-label={aria(t.viewLog)} onClick={() => setLogFor(e.id)}>{t.viewLog}</button>
                      <button type="button" className={secondaryButton} aria-label={aria(t.edit)} onClick={() => setEditing(e)}>{t.edit}</button>
                      {e.is_active
                        ? <button type="button" className={secondaryButton} aria-label={aria(t.pause)} onClick={() => setAction({ kind: "pause", endpoint: e })}>{t.pause}</button>
                        : <button type="button" className={secondaryButton} aria-label={aria(t.resume)} onClick={() => setAction({ kind: "resume", endpoint: e })}>{t.resume}</button>}
                      <button type="button" className={secondaryButton} aria-label={aria(t.rotate)} onClick={() => setAction({ kind: "rotate", endpoint: e })}>{t.rotate}</button>
                      <button type="button" className={dangerButton} aria-label={aria(t.remove)} onClick={() => setAction({ kind: "delete", endpoint: e })}>{t.remove}</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </OperationsPanel>

      <DeliveryLog locale={locale} t={t} providerId={providerId} endpoints={endpoints} selected={selected} onShowAll={() => setLogFor(null)} onResult={onResult} />

      {adding && (
        <AddEndpointDialog locale={locale} t={t} providerId={providerId} branches={branches} onClose={() => setAdding(false)}
          onCreated={(secret) => { setAdding(false); onReload(); onSecret({ title: t.secretCreatedTitle, warning: t.secretCreatedWarning, label: t.secretLabel, value: secret }); }} />
      )}
      {editing && <EditEndpointDialog locale={locale} t={t} endpoint={editing} onClose={() => setEditing(null)} onSaved={() => { onResult(t.endpointSaved); onReload(); }} />}
      {action && (
        <CommandDialog
          locale={locale}
          tone={action.kind === "delete" ? "danger" : "default"}
          title={{ pause: t.pauseTitle, resume: t.resumeTitle, rotate: t.rotateTitle, delete: t.deleteTitle }[action.kind]}
          intro={{ pause: t.pauseIntro, resume: t.resumeIntro, rotate: t.rotateIntro, delete: t.deleteIntro }[action.kind]}
          facts={[{ label: t.fieldName, value: action.endpoint.name ?? action.endpoint.target_url }, { label: t.fieldUrl, value: action.endpoint.target_url }]}
          reasonLabel={{ pause: t.pauseReason, resume: t.resumeReason, rotate: t.rotateReason, delete: t.deleteReason }[action.kind]}
          confirmLabel={{ pause: t.pause, resume: t.resume, rotate: t.rotate, delete: t.remove }[action.kind]}
          onConfirm={async (reason) => {
            const id = action.endpoint.id;
            if (action.kind === "rotate") {
              const { data, error } = await supabase.rpc("rotate_webhook_secret", { p_endpoint_id: id, p_reason: reason });
              if (error) return explainError(error, locale, t);
              onSecret({ title: t.secretRotatedTitle, warning: t.secretCreatedWarning, label: t.secretLabel, value: (data as { signing_secret: string }).signing_secret });
            } else if (action.kind === "delete") {
              const { error } = await supabase.rpc("delete_webhook_endpoint", { p_endpoint_id: id, p_reason: reason });
              if (error) return explainError(error, locale, t);
              if (logFor === id) setLogFor(null);
              onResult(t.deleted);
            } else {
              const { error } = await supabase.rpc("set_webhook_endpoint_active", { p_endpoint_id: id, p_active: action.kind === "resume", p_reason: reason });
              if (error) return explainError(error, locale, t);
              onResult(action.kind === "resume" ? t.resumed : t.paused);
            }
            onReload();
            return null;
          }}
          onClose={() => setAction(null)}
        />
      )}
    </div>
  );
}

function DeliveryLog({ locale, t, providerId, endpoints, selected, onShowAll, onResult }: {
  locale: OperationsLocale; t: DeveloperCopy; providerId: string; endpoints: EndpointRow[]; selected: EndpointRow | null;
  onShowAll: () => void; onResult: (message: string) => void;
}) {
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retrying, setRetrying] = useState<DeliveryRow | null>(null);
  const [version, setVersion] = useState(0);
  const selectedId = selected?.id ?? null;

  const fetchPage = useCallback(async (from: number) => {
    let query = supabase.from("webhook_deliveries").select(DELIVERY_COLUMNS).eq("provider_id", providerId);
    if (selectedId) query = query.eq("subscription_id", selectedId);
    // One extra row tells whether another page exists.
    return query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, from + DELIVERY_LOG_PAGE);
  }, [providerId, selectedId]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error } = await fetchPage(0);
      if (!live) return;
      if (error) { setStatus("error"); setMessage(errorMessage(error)); return; }
      const page = (data ?? []) as unknown as DeliveryRow[];
      setRows(page.slice(0, DELIVERY_LOG_PAGE));
      setMore(page.length > DELIVERY_LOG_PAGE);
      setStatus("ready");
    })();
    return () => { live = false; };
  }, [fetchPage, version]);

  const loadMore = async () => {
    setLoadingMore(true);
    const { data, error } = await fetchPage(rows.length);
    setLoadingMore(false);
    if (error) { setStatus("error"); setMessage(errorMessage(error)); return; }
    const page = (data ?? []) as unknown as DeliveryRow[];
    setRows((prev) => [...prev, ...page.slice(0, DELIVERY_LOG_PAGE)]);
    setMore(page.length > DELIVERY_LOG_PAGE);
  };

  const nameOf = (id: string) => {
    const e = endpoints.find((x) => x.id === id);
    return e ? e.name ?? e.target_url : id.slice(0, 8);
  };
  const tone = (s: DeliveryRow["status"]) => (s === "delivered" ? "good" : s === "failed" ? "bad" : s === "skipped" ? "muted" : "warn");

  return (
    <OperationsPanel title={t.logTitle}>
      <p className="max-w-3xl text-sm leading-6 text-[#475467]">{t.logIntro}</p>
      <p className="mt-2 text-xs font-semibold text-[#667085]">
        {selected ? t.logFor.replace("{name}", selected.name ?? selected.target_url) : t.logAll}
        {selected && <button type="button" onClick={onShowAll} className={`${secondaryButton} ms-3`}>{t.showAll}</button>}
      </p>
      <div className="mt-4" aria-live="polite">
        {status === "loading" && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
        {status === "error" && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-bold">{t.deliveriesLoadFailed}</p>
            <p className="mt-1 break-words">{message}</p>
            <button type="button" onClick={() => { setStatus("loading"); setVersion((v) => v + 1); }} className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-black">{t.retry}</button>
          </div>
        )}
        {status === "ready" && rows.length === 0 && <p className="rounded-xl border border-dashed border-[#D0D5DD] p-6 text-center text-sm text-[#667085]">{t.noDeliveries}</p>}
        {status === "ready" && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-start text-sm">
              <caption className="sr-only">{t.logTitle}</caption>
              <thead>
                <tr className="border-b border-[#ECECEC] text-xs font-black text-[#667085]">
                  {[t.colEvent, t.colUrl, t.colWhen, t.colAttempts, t.colResult, t.colNext, t.colActions].map((h) => <th key={h} scope="col" className="px-2 py-2 text-start">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="border-b border-[#F2F4F7] align-top">
                    <th scope="row" className="px-2 py-3 text-start"><bdi dir="ltr" className="font-mono text-xs font-bold">{d.event_type}</bdi></th>
                    <td className="px-2 py-3 text-xs">{nameOf(d.subscription_id)}</td>
                    <td className="px-2 py-3">{operationsDate(d.created_at, locale)}</td>
                    <td className="px-2 py-3">{new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA").format(d.attempt_count)}</td>
                    <td className="px-2 py-3">
                      <StatusBadge tone={tone(d.status)}>{t.deliveryState[d.status]}</StatusBadge>
                      {d.last_status_code !== null && <span className="ms-2 text-xs text-[#667085]">{t.httpStatus.replace("{n}", String(d.last_status_code))}</span>}
                      {d.last_error && <p className="mt-1 max-w-xs break-words text-xs text-[#667085]">{d.last_error}</p>}
                    </td>
                    <td className="px-2 py-3">{d.status === "pending" ? operationsDate(d.next_attempt_at, locale) : "—"}</td>
                    <td className="px-2 py-3">
                      {(d.status === "failed" || d.status === "skipped") && (
                        <button type="button" className={secondaryButton} aria-label={t.retryAria.replace("{event}", d.event_type)} onClick={() => setRetrying(d)}>{t.retryDelivery}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {status === "ready" && more && (
          <div className="mt-4"><button type="button" className={secondaryButton} disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? t.loadingMore : t.loadMore}</button></div>
        )}
      </div>
      {retrying && (
        <CommandDialog
          locale={locale}
          title={t.retryTitle}
          intro={t.retryIntro}
          facts={[{ label: t.colEvent, value: retrying.event_type }, { label: t.colUrl, value: nameOf(retrying.subscription_id) }, { label: t.colWhen, value: operationsDate(retrying.created_at, locale) }]}
          reasonLabel={t.retryReason}
          confirmLabel={t.retryDelivery}
          onConfirm={async (reason) => {
            const { error } = await supabase.rpc("retry_webhook_delivery", { p_delivery_id: retrying.id, p_reason: reason });
            if (error) return explainError(error, locale, t);
            onResult(t.retried);
            setVersion((v) => v + 1);
            return null;
          }}
          onClose={() => setRetrying(null)}
        />
      )}
    </OperationsPanel>
  );
}
