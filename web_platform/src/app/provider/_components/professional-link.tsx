"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { useConfirm } from "@/components/modal";
import { describeProfessionalError, linkCopy, type ProviderLink } from "@/lib/professional-identity";

// The employee list's identity action. One request per business answers for every row (a shared store keyed by provider), so a
// list of twenty employees makes one call, and a change on one row refreshes all of them.
type Snapshot = { rows: ProviderLink[] | null; error: unknown; loading: boolean };
type Store = { snapshot: Snapshot; listeners: Set<() => void>; started: boolean };

const stores = new Map<string, Store>();
const LOADING: Snapshot = { rows: null, error: null, loading: true };

function storeFor(providerId: string): Store {
  let store = stores.get(providerId);
  if (!store) {
    store = { snapshot: LOADING, listeners: new Set(), started: false };
    stores.set(providerId, store);
  }
  return store;
}

async function load(providerId: string) {
  const store = storeFor(providerId);
  const { data, error } = await supabase.rpc("provider_professional_links", { p_provider_id: providerId });
  store.snapshot = error ? { rows: null, error, loading: false } : { rows: (data ?? []) as ProviderLink[], error: null, loading: false };
  store.listeners.forEach((notify) => notify());
}

const rowButton = "inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#ECECEC] bg-white px-3 py-2.5 text-xs font-semibold text-[#344054] outline-2 outline-offset-2 outline-transparent transition hover:border-[#D1AF47]/40 hover:bg-gray-50 focus-visible:outline-[#9B7928] disabled:cursor-not-allowed disabled:opacity-60";
const chip = "inline-flex items-center rounded-xl bg-gray-100 px-3 py-2.5 text-xs font-semibold text-[#475467]";

export function ProfessionalLinkAction({ lang, providerId, employeeId }: { lang: "en" | "ar"; providerId: string; employeeId: string }) {
  const t = linkCopy[lang];
  const [confirmNode, ask] = useConfirm(lang);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const subscribe = useCallback((notify: () => void) => {
    if (!providerId) return () => {};
    const store = storeFor(providerId);
    store.listeners.add(notify);
    if (!store.started) { store.started = true; void load(providerId); }
    return () => {
      store.listeners.delete(notify);
      // Nobody is looking: forget the answer so the next visit asks again instead of showing a stale link state.
      if (store.listeners.size === 0) { store.started = false; store.snapshot = LOADING; }
    };
  }, [providerId]);
  const snapshot = useSyncExternalStore(subscribe, () => (providerId ? storeFor(providerId).snapshot : LOADING), () => LOADING);

  if (!providerId || snapshot.loading) return null;
  if (snapshot.error) {
    return <span role="alert" className="text-xs font-semibold text-red-700">{t.loadFailed}</span>;
  }
  const row = snapshot.rows?.find((candidate) => candidate.employee_id === employeeId);
  if (!row) return null;

  const run = async (success: string, call: () => PromiseLike<{ error: unknown }>) => {
    setBusy(true);
    setNote(null);
    const { error } = await call();
    if (error) {
      setBusy(false);
      setNote({ tone: "bad", text: `${t.failed}${describeProfessionalError(error, lang)}` });
      return;
    }
    await load(providerId);
    setBusy(false);
    setNote({ tone: "ok", text: success });
  };

  const invite = async () => {
    if (!(await ask({ title: t.inviteTitle, intro: t.inviteIntro, confirmLabel: t.confirmInvite }))) return;
    await run(t.invitedOk, () => supabase.rpc("invite_professional_link", { p_employee_id: employeeId }));
  };
  const close = async (kind: "withdraw" | "end") => {
    const ok = await ask({
      title: kind === "withdraw" ? t.withdrawTitle : t.endTitle,
      intro: kind === "withdraw" ? t.withdrawIntro : t.endIntro,
      confirmLabel: kind === "withdraw" ? t.confirmWithdraw : t.confirmEnd,
      tone: "danger",
    });
    if (!ok || !row.link_id) return;
    await run(kind === "withdraw" ? t.withdrawnOk : t.endedOk, () => supabase.rpc("end_professional_link", { p_workplace_id: row.link_id }));
  };

  return (
    <>
      {confirmNode}
      {!row.has_login ? (
        <span className={chip} title={t.noLoginHint}>{t.noLogin}</span>
      ) : row.link_status === "active" ? (
        <>
          <span className={chip}>{t.linked(row.handle)}</span>
          <button type="button" className={rowButton} disabled={busy} onClick={() => void close("end")}>{busy ? t.working : t.end}</button>
        </>
      ) : row.link_status === "invited" ? (
        <>
          <span className={chip}>{t.invited}</span>
          <button type="button" className={rowButton} disabled={busy} onClick={() => void close("withdraw")}>{busy ? t.working : t.withdraw}</button>
        </>
      ) : !row.has_profile ? (
        <span className={chip} title={t.noProfileHint}>{t.noProfile}</span>
      ) : (
        <button type="button" className={rowButton} disabled={busy} onClick={() => void invite()}>{busy ? t.working : t.invite}</button>
      )}
      {note && <span role={note.tone === "bad" ? "alert" : "status"} className={`text-xs font-semibold ${note.tone === "bad" ? "text-red-700" : "text-green-700"}`}>{note.text}</span>}
    </>
  );
}
