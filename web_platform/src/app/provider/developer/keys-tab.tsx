"use client";

import React, { useId, useState } from "react";
import { CommandDialog } from "@/components/modal";
import { OperationsPanel, operationsDate, type OperationsLocale } from "@/components/operations-ui";
import { supabase } from "@/lib/supabase";
import {
  API_SCOPES, endOfDayRiyadh, expiryBounds, keyState, keysEnabled, maskKey,
  type ApiKeyRow, type ApiSettings,
} from "@/lib/developer-api";
import type { DeveloperCopy } from "./copy";
import { dangerButton, explainError, FieldError, fieldClass, FormDialog, primaryButton, StatusBadge } from "./shared";

export type Branch = { id: string; name_en: string | null; name_ar: string | null };
export type LoadState<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; rows: T[] };

export function branchName(branches: Branch[], id: string | null, locale: OperationsLocale, all: string): string {
  if (!id) return all;
  const branch = branches.find((b) => b.id === id);
  return (locale === "ar" ? branch?.name_ar || branch?.name_en : branch?.name_en || branch?.name_ar) ?? id.slice(0, 8);
}

export type CreatedKey = { id: string; key: string };

function CreateKeyDialog({
  locale, t, providerId, branches, settings, onCreated, onClose,
}: {
  locale: OperationsLocale;
  t: DeveloperCopy;
  providerId: string;
  branches: Branch[];
  settings: ApiSettings;
  onCreated: (created: CreatedKey) => void;
  onClose: () => void;
}) {
  const ids = { name: useId(), branch: useId(), expiry: useId(), limit: useId(), scopes: useId() };
  const ceiling = settings["api.max_requests_per_minute"] ?? 1;
  const bounds = expiryBounds(new Date(), settings["api.max_key_lifetime_days"]);
  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiry, setExpiry] = useState("");
  const [limit, setLimit] = useState("");
  const [attempted, setAttempted] = useState(false);

  const limitNumber = Number(limit);
  const problems = {
    name: name.trim().length < 3 || name.trim().length > 80 ? t.needName : "",
    scopes: scopes.length === 0 ? t.needScope : "",
    expiry: !expiry || expiry < bounds.min || (bounds.max !== null && expiry > bounds.max) ? t.needExpiry : "",
    limit: !/^[0-9]+$/.test(limit) || limitNumber < 1 || limitNumber > ceiling ? t.needLimit.replace("{max}", String(ceiling)) : "",
  };

  return (
    <FormDialog
      locale={locale}
      title={t.createKeyTitle}
      submitLabel={t.create}
      busyLabel={t.creating}
      cancelLabel={t.cancel}
      wide
      onClose={onClose}
      onSubmit={async () => {
        setAttempted(true);
        if (Object.values(problems).some(Boolean)) return null;
        const { data, error } = await supabase.rpc("create_api_key", {
          p_provider_id: providerId,
          p_branch_id: branchId || null,
          p_name: name.trim(),
          p_scopes: scopes,
          p_expires_at: endOfDayRiyadh(expiry),
          p_requests_per_minute: limitNumber,
        });
        if (error) return explainError(error, locale, t);
        const created = data as { id: string; key: string };
        onCreated({ id: created.id, key: created.key });
        return null;
      }}
    >
      <div>
        <label htmlFor={ids.name} className="block text-xs font-black text-[#344054]">{t.fieldName}</label>
        <input id={ids.name} data-autofocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off"
          aria-invalid={attempted && Boolean(problems.name)} aria-describedby={`${ids.name}-hint`} className={fieldClass} />
        <p id={`${ids.name}-hint`} className="mt-1 text-xs text-[#667085]">{t.fieldNameHint}</p>
        {attempted && problems.name && <FieldError id={`${ids.name}-err`}>{problems.name}</FieldError>}
      </div>
      <div>
        <label htmlFor={ids.branch} className="block text-xs font-black text-[#344054]">{t.fieldBranch}</label>
        <select id={ids.branch} value={branchId} onChange={(e) => setBranchId(e.target.value)} aria-describedby={`${ids.branch}-hint`} className={fieldClass}>
          <option value="">{t.allBranches}</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{branchName(branches, b.id, locale, t.allBranches)}</option>)}
        </select>
        <p id={`${ids.branch}-hint`} className="mt-1 text-xs text-[#667085]">{t.fieldBranchHint}</p>
      </div>
      <fieldset aria-describedby={`${ids.scopes}-hint`}>
        <legend className="text-xs font-black text-[#344054]">{t.fieldScopes}</legend>
        <p id={`${ids.scopes}-hint`} className="mt-1 text-xs text-[#667085]">{t.fieldScopesHint}</p>
        <div className="mt-2 space-y-2">
          {API_SCOPES.map((scope) => (
            <label key={scope} className="flex items-start gap-2.5 text-sm text-[#344054]">
              <input type="checkbox" checked={scopes.includes(scope)} className="mt-1 h-4 w-4 shrink-0 accent-[#9B7928]"
                onChange={(e) => setScopes((prev) => (e.target.checked ? [...prev, scope] : prev.filter((s) => s !== scope)))} />
              <span>
                <span className="font-bold">{t.scope[scope]}</span>
                <bdi dir="ltr" className="ms-2 rounded bg-[#F2F4F7] px-1.5 py-0.5 font-mono text-xs">{scope}</bdi>
                <span className="block text-xs text-[#667085]">{t.scopeHelp[scope]}</span>
              </span>
            </label>
          ))}
        </div>
        {attempted && problems.scopes && <FieldError id={`${ids.scopes}-err`}>{problems.scopes}</FieldError>}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.expiry} className="block text-xs font-black text-[#344054]">{t.fieldExpiry}</label>
          <input id={ids.expiry} type="date" value={expiry} min={bounds.min} max={bounds.max ?? undefined} onChange={(e) => setExpiry(e.target.value)}
            aria-invalid={attempted && Boolean(problems.expiry)} aria-describedby={`${ids.expiry}-hint`} className={fieldClass} />
          <p id={`${ids.expiry}-hint`} className="mt-1 text-xs text-[#667085]">{bounds.max ? t.fieldExpiryHint.replace("{max}", bounds.max) : t.fieldExpiryHintOpen}</p>
          {attempted && problems.expiry && <FieldError id={`${ids.expiry}-err`}>{problems.expiry}</FieldError>}
        </div>
        <div>
          <label htmlFor={ids.limit} className="block text-xs font-black text-[#344054]">{t.fieldLimit}</label>
          <input id={ids.limit} inputMode="numeric" dir="ltr" value={limit} onChange={(e) => setLimit(e.target.value.trim())}
            aria-invalid={attempted && Boolean(problems.limit)} aria-describedby={`${ids.limit}-hint`} className={fieldClass} />
          <p id={`${ids.limit}-hint`} className="mt-1 text-xs text-[#667085]">{t.fieldLimitHint.replace("{max}", String(ceiling))}</p>
          {attempted && problems.limit && <FieldError id={`${ids.limit}-err`}>{problems.limit}</FieldError>}
        </div>
      </div>
    </FormDialog>
  );
}

export function KeysTab({
  locale, t, providerId, branches, settings, state, onReload, onCreated, onResult,
}: {
  locale: OperationsLocale;
  t: DeveloperCopy;
  providerId: string;
  branches: Branch[];
  settings: ApiSettings;
  state: LoadState<ApiKeyRow>;
  onReload: () => void;
  onCreated: (created: CreatedKey) => void;
  onResult: (message: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiKeyRow | null>(null);
  const enabled = keysEnabled(settings);
  const now = new Date();

  return (
    <OperationsPanel title={t.keysTitle}>
      <p className="max-w-3xl text-sm leading-6 text-[#475467]">{t.keysIntro}</p>
      {!enabled && (
        <div role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-black">{t.keysDisabledTitle}</p>
          <p className="mt-1 leading-6">{t.keysDisabledBody}</p>
        </div>
      )}
      <div className="mt-4">
        <button type="button" className={primaryButton} disabled={!enabled} onClick={() => setCreating(true)}>{t.createKey}</button>
      </div>

      <div className="mt-5">
        {state.status === "loading" && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
        {state.status === "error" && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-bold">{t.keysLoadFailed}</p>
            <p className="mt-1 break-words">{state.message}</p>
            <button type="button" onClick={onReload} className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-black">{t.retry}</button>
          </div>
        )}
        {state.status === "ready" && state.rows.length === 0 && <p className="rounded-xl border border-dashed border-[#D0D5DD] p-6 text-center text-sm text-[#667085]">{t.noKeys}</p>}
        {state.status === "ready" && state.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-start text-sm">
              <caption className="sr-only">{t.keysTitle}</caption>
              <thead>
                <tr className="border-b border-[#ECECEC] text-xs font-black text-[#667085]">
                  {[t.colName, t.colKey, t.colScopes, t.colBranch, t.colExpires, t.colLastUsed, t.colLimit, t.colStatus, t.colActions].map((h) => (
                    <th key={h} scope="col" className="px-2 py-2 text-start">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.rows.map((key) => {
                  const status = keyState(key, now);
                  return (
                    <tr key={key.id} className="border-b border-[#F2F4F7] align-top">
                      <th scope="row" className="px-2 py-3 text-start font-bold text-[#101828]">{key.name}</th>
                      <td className="px-2 py-3"><bdi dir="ltr" className="font-mono text-xs">{maskKey(key.key_prefix, key.key_last4)}</bdi></td>
                      <td className="px-2 py-3">
                        <ul className="space-y-1">{key.scopes.map((s) => <li key={s}><bdi dir="ltr" className="rounded bg-[#F2F4F7] px-1.5 py-0.5 font-mono text-xs">{s}</bdi></li>)}</ul>
                      </td>
                      <td className="px-2 py-3">{branchName(branches, key.branch_id, locale, t.allBranches)}</td>
                      <td className="px-2 py-3">{operationsDate(key.expires_at, locale)}</td>
                      <td className="px-2 py-3">{key.last_used_at ? operationsDate(key.last_used_at, locale) : t.never}</td>
                      <td className="px-2 py-3">{t.perMinute.replace("{n}", new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA").format(key.requests_per_minute))}</td>
                      <td className="px-2 py-3"><StatusBadge tone={status === "active" ? "good" : status === "expired" ? "warn" : "bad"}>{t.state[status]}</StatusBadge></td>
                      <td className="px-2 py-3">
                        {status !== "revoked" && (
                          <button type="button" className={dangerButton} aria-label={t.revokeAria.replace("{name}", key.name)} onClick={() => setRevoking(key)}>{t.revoke}</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <CreateKeyDialog
          locale={locale} t={t} providerId={providerId} branches={branches} settings={settings}
          onCreated={(created) => { setCreating(false); onCreated(created); onReload(); }}
          onClose={() => setCreating(false)}
        />
      )}
      {revoking && (
        <CommandDialog
          locale={locale}
          tone="danger"
          title={t.revokeTitle}
          intro={t.revokeIntro}
          facts={[
            { label: t.colName, value: revoking.name },
            { label: t.factKey, value: maskKey(revoking.key_prefix, revoking.key_last4) },
            { label: t.factScopes, value: revoking.scopes.join(", ") },
            { label: t.factLastUsed, value: revoking.last_used_at ? operationsDate(revoking.last_used_at, locale) : t.never },
          ]}
          reasonLabel={t.revokeReason}
          confirmLabel={t.revokeConfirm}
          onConfirm={async (reason) => {
            const { error } = await supabase.rpc("revoke_api_key", { p_key_id: revoking.id, p_reason: reason });
            if (error) return explainError(error, locale, t);
            onResult(t.revoked);
            onReload();
            return null;
          }}
          onClose={() => setRevoking(null)}
        />
      )}
    </OperationsPanel>
  );
}
