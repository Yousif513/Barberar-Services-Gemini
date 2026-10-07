"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CommandResult, operationsButton as button, useOperationsLocale } from "@/components/operations-ui";
import { useConfirm } from "@/components/modal";
import {
  describeProfessionalError, followingCopy, pick, profilePath, publicCopy,
  type FollowedProfessional,
} from "@/lib/professional-identity";

type LoadState = { status: "loading" } | { status: "error"; error: unknown } | { status: "ready"; items: FollowedProfessional[] };

export default function FollowingPage() {
  const locale = useOperationsLocale();
  const t = followingCopy[locale];
  const [confirmNode, ask] = useConfirm(locale);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<{ error?: string; success?: string }>({});
  const dismiss = useCallback(() => setResult({}), []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error } = await supabase.rpc("list_followed_professionals");
      if (!live) return;
      if (error) { setState({ status: "error", error }); return; }
      setState({ status: "ready", items: (data ?? []) as FollowedProfessional[] });
    })();
    return () => { live = false; };
  }, [reload]);

  const changeNotify = async (item: FollowedProfessional, next: boolean) => {
    if (state.status !== "ready") return;
    const before = state.items;
    setState({ status: "ready", items: before.map((row) => (row.handle === item.handle ? { ...row, notify_on_move: next } : row)) });
    setBusy(item.handle);
    setResult({});
    const { error } = await supabase.rpc("follow_professional", { p_handle: item.handle, p_notify_on_move: next });
    setBusy("");
    if (error) {
      setState({ status: "ready", items: before });
      setResult({ error: `${t.commandFailed}${describeProfessionalError(error, locale)}` });
      return;
    }
    setResult({ success: t.updated });
  };

  const unfollow = async (item: FollowedProfessional) => {
    const ok = await ask({
      title: t.unfollowTitle,
      intro: t.unfollowIntro,
      facts: [{ label: t.title, value: item.available ? pick(locale, item.display_name_en, item.display_name_ar) : item.handle }],
      confirmLabel: t.unfollow,
      tone: "danger",
    });
    if (!ok) return;
    setBusy(item.handle);
    setResult({});
    const { error } = await supabase.rpc("unfollow_professional", { p_handle: item.handle });
    setBusy("");
    if (error) { setResult({ error: `${t.commandFailed}${describeProfessionalError(error, locale)}` }); return; }
    setResult({ success: t.unfollowed });
    setReload((n) => n + 1);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8" dir={locale === "ar" ? "rtl" : "ltr"}>
      <CommandResult error={result.error} success={result.success} locale={locale} onDismiss={dismiss} />
      {confirmNode}
      <header>
        <h1 className="font-serif text-3xl font-bold text-[#101828]">{t.title}</h1>
        <p className="mt-1 text-sm text-[#667085]">{t.subtitle}</p>
      </header>

      {state.status === "loading" && <p role="status" className="py-10 text-center text-sm text-[#667085]">{t.loading}</p>}

      {state.status === "error" && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{t.loadFailed}{describeProfessionalError(state.error, locale)}</span>
          <button type="button" className={button} onClick={() => { setState({ status: "loading" }); setReload((n) => n + 1); }}>{t.retry}</button>
        </div>
      )}

      {state.status === "ready" && state.items.length === 0 && (
        <p className="rounded-2xl border border-[#D1AF47]/35 bg-white p-6 text-sm text-[#475467]">{t.empty}</p>
      )}

      {state.status === "ready" && state.items.length > 0 && (
        <ul className="space-y-4">
          {state.items.map((item) => (
            <li key={item.handle} className="rounded-3xl border border-[#D1AF47]/35 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  {item.available ? (
                    <>
                      <Link href={profilePath(item.handle)} className="font-serif text-xl font-bold text-[#101828] hover:underline focus-visible:outline-2 focus-visible:outline-[#9B7928]">
                        {pick(locale, item.display_name_en, item.display_name_ar)}
                      </Link>
                      <p className="text-sm text-[#667085]">{pick(locale, item.headline_en, item.headline_ar)}</p>
                    </>
                  ) : (
                    <>
                      <p className="font-bold text-[#101828]" dir="ltr">/pro/{item.handle}</p>
                      <p className="text-sm text-[#667085]">{t.unavailable}</p>
                    </>
                  )}
                </div>
                <button type="button" className={button} disabled={busy === item.handle} onClick={() => void unfollow(item)}
                  aria-label={`${t.unfollow}: ${item.available ? pick(locale, item.display_name_en, item.display_name_ar) : item.handle}`}>
                  {t.unfollow}
                </button>
              </div>

              {item.available && (
                <div className="mt-4 space-y-3">
                  {item.workplaces.length === 0 ? (
                    <p className="text-sm text-[#667085]">{t.notWorking}</p>
                  ) : (
                    <ul className="space-y-2">
                      {item.workplaces.map((place) => (
                        <li key={place.shop_url} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#ECECEC] p-3">
                          <span className="text-sm font-semibold text-[#101828]">
                            {pick(locale, place.name_en, place.name_ar)}{place.city ? ` · ${place.city}` : ""}
                          </span>
                          <Link href={place.book_url} className="rounded-xl bg-[#D1AF47] px-4 py-2 text-sm font-black text-[#070B12] hover:bg-[#E0C46A] focus-visible:outline-2 focus-visible:outline-[#9B7928]">
                            {publicCopy[locale].book}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <label className="flex items-center gap-2 text-sm text-[#344054]">
                    <input type="checkbox" className="h-4 w-4 accent-[#9B7928] focus-visible:outline-2 focus-visible:outline-[#9B7928]"
                      checked={item.notify_on_move} disabled={busy === item.handle} onChange={(event) => void changeNotify(item, event.target.checked)} />
                    <span>{t.notify}</span>
                  </label>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
