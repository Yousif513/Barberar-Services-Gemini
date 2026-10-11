"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePageLocale } from "@/lib/use-page-locale";
import { CommandResult } from "@/components/operations-ui";
import {
  dayLabel, describeProfessionalError, languageLabel, pick, publicCopy,
  type ProfessionalRedirect, type PublicProfessional,
} from "@/lib/professional-identity";

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "missing" }
  | { status: "ready"; profile: PublicProfessional };

const focusRing = "outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928]";
const goldButton = `rounded-xl bg-[#D1AF47] px-5 py-3 text-sm font-black text-[#070B12] transition hover:bg-[#E0C46A] disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;
const lineButton = `rounded-xl border border-[#D0D5DD] bg-white px-4 py-2.5 text-sm font-bold text-[#344054] transition hover:border-[#D1AF47]/60 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

export default function ProfessionalPublicPage() {
  const params = useParams<{ handle: string }>();
  const handle = typeof params?.handle === "string" ? params.handle : "";
  const router = useRouter();
  const [locale, setLocale] = usePageLocale();
  const t = publicCopy[locale];
  const dir = locale === "ar" ? "rtl" : "ltr";
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reload, setReload] = useState(0);
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ error?: string; success?: string }>({});
  const dismiss = useCallback(() => setResult({}), []);

  useEffect(() => {
    if (!handle) return;
    let live = true;
    void (async () => {
      const { data, error } = await supabase.rpc("public_professional_profile", { p_handle: handle });
      if (!live) return;
      if (error) { setState({ status: "error", error }); return; }
      if (!data) { setState({ status: "missing" }); return; }
      const moved = (data as ProfessionalRedirect).redirect_to;
      if (typeof moved === "string") { router.replace(`/pro/${moved}`); return; }
      const profile = data as PublicProfessional;
      setNotify(profile.viewer.notify_on_move);
      setState({ status: "ready", profile });
    })();
    return () => { live = false; };
  }, [handle, reload, router]);

  const toggleFollow = async (profile: PublicProfessional) => {
    setBusy(true);
    setResult({});
    const { error } = profile.viewer.follows
      ? await supabase.rpc("unfollow_professional", { p_handle: profile.handle })
      : await supabase.rpc("follow_professional", { p_handle: profile.handle, p_notify_on_move: notify });
    setBusy(false);
    if (error) { setResult({ error: describeProfessionalError(error, locale) }); return; }
    setResult({ success: profile.viewer.follows ? t.unfollowed : t.followed });
    setReload((n) => n + 1);
  };

  const changeNotify = async (profile: PublicProfessional, next: boolean) => {
    const previous = notify;
    setNotify(next);
    if (!profile.viewer.follows) return;
    setBusy(true);
    setResult({});
    const { error } = await supabase.rpc("follow_professional", { p_handle: profile.handle, p_notify_on_move: next });
    setBusy(false);
    if (error) { setNotify(previous); setResult({ error: describeProfessionalError(error, locale) }); return; }
    setResult({ success: t.notifyUpdated });
  };

  return (
    <div dir={dir} lang={locale} className="min-h-screen bg-[#F7F3EA] text-[#101828]">
      <CommandResult error={result.error} success={result.success} locale={locale} onDismiss={dismiss} />
      <header className="border-b border-[#D1AF47]/30 bg-white/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className={`font-serif text-xl font-bold tracking-wide ${focusRing}`}>{t.brand}</Link>
          <button type="button" onClick={() => setLocale(locale === "ar" ? "en" : "ar")} className={lineButton} lang={locale === "ar" ? "en" : "ar"}>
            {t.switchLanguage}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {state.status === "loading" && <p role="status" className="py-16 text-center text-sm text-[#667085]">{t.loading}</p>}

        {state.status === "error" && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <span>{t.loadFailed}{describeProfessionalError(state.error, locale)}</span>
            <button type="button" className={lineButton} onClick={() => { setState({ status: "loading" }); setReload((n) => n + 1); }}>{t.retry}</button>
          </div>
        )}

        {state.status === "missing" && (
          <section className="rounded-3xl border border-[#D1AF47]/35 bg-white p-8 text-center">
            <h1 className="font-serif text-2xl font-bold">{t.notFoundTitle}</h1>
            <p className="mt-3 text-sm text-[#667085]">{t.notFoundBody}</p>
            <Link href="/" className={`mt-6 inline-block ${goldButton}`}>{t.home}</Link>
          </section>
        )}

        {state.status === "ready" && (() => {
          const profile = state.profile;
          const name = pick(locale, profile.display_name_en, profile.display_name_ar);
          const headline = pick(locale, profile.headline_en, profile.headline_ar);
          const bio = pick(locale, profile.bio_en, profile.bio_ar);
          const viewer = profile.viewer;
          return (
            <div className="space-y-6">
              <section className="rounded-3xl border border-[#D1AF47]/35 bg-white p-6 shadow-[0_8px_24px_rgba(56,44,16,0.06)]">
                <p className="text-xs font-bold text-[#725517]" dir="ltr">/pro/{profile.handle}</p>
                <h1 className="mt-1 font-serif text-3xl font-bold">{name}</h1>
                <p className="mt-1 text-base text-[#475467]">{headline || t.headlineFallback}</p>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {viewer.is_self ? (
                    <>
                      <span className="text-sm font-semibold text-[#344054]">{t.self}</span>
                      <Link href="/provider/identity" className={lineButton}>{t.editMine}</Link>
                    </>
                  ) : viewer.signed_in ? (
                    <>
                      <button type="button" aria-pressed={viewer.follows} disabled={busy} onClick={() => void toggleFollow(profile)}
                        className={viewer.follows ? lineButton : goldButton}>
                        {busy ? t.saving : viewer.follows ? `${t.following} · ${t.unfollow}` : t.follow}
                      </button>
                      <label className="flex items-center gap-2 text-sm text-[#344054]">
                        <input type="checkbox" checked={notify} disabled={busy} onChange={(event) => void changeNotify(profile, event.target.checked)}
                          className={`h-4 w-4 accent-[#9B7928] ${focusRing}`} />
                        <span>{t.notifyOnMove}</span>
                      </label>
                    </>
                  ) : (
                    <Link href={`/login?returnUrl=${encodeURIComponent(`/pro/${profile.handle}`)}`} className={goldButton}>{t.followSignIn}</Link>
                  )}
                </div>
                {!viewer.is_self && <p className="mt-3 text-xs text-[#667085]">{t.followNote}</p>}
              </section>

              <section aria-labelledby="where-to-book" className="rounded-3xl border border-[#D1AF47]/35 bg-white p-6">
                <h2 id="where-to-book" className="font-serif text-xl font-bold">{t.workplaces}</h2>
                {profile.workplaces.length === 0 ? (
                  <p className="mt-3 text-sm text-[#667085]">{t.noWorkplace}</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {profile.workplaces.map((place) => (
                      <li key={place.shop_url} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#ECECEC] p-4">
                        <div className="min-w-0">
                          <p className="font-bold">{pick(locale, place.name_en, place.name_ar)}</p>
                          <p className="text-sm text-[#667085]">{[place.city, t.since(dayLabel(place.since, locale))].filter(Boolean).join(" · ")}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link href={place.shop_url} className={lineButton}>{t.viewShop}</Link>
                          <Link href={place.book_url} className={goldButton}>{t.book}</Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {bio && (
                <section aria-labelledby="about" className="rounded-3xl border border-[#D1AF47]/35 bg-white p-6">
                  <h2 id="about" className="font-serif text-xl font-bold">{t.about}</h2>
                  <p className="mt-3 whitespace-pre-line text-sm leading-7 text-[#344054]">{bio}</p>
                </section>
              )}

              {(profile.specialties.length > 0 || profile.languages.length > 0) && (
                <section className="grid gap-6 rounded-3xl border border-[#D1AF47]/35 bg-white p-6 sm:grid-cols-2">
                  {profile.specialties.length > 0 && (
                    <div>
                      <h2 className="font-serif text-xl font-bold">{t.specialties}</h2>
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {profile.specialties.map((item) => <li key={item} className="rounded-full bg-[#F8F3E4] px-3 py-1 text-sm font-semibold text-[#725517]">{item}</li>)}
                      </ul>
                    </div>
                  )}
                  {profile.languages.length > 0 && (
                    <div>
                      <h2 className="font-serif text-xl font-bold">{t.languages}</h2>
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {profile.languages.map((code) => <li key={code} className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-[#344054]">{languageLabel(code, locale)}</li>)}
                      </ul>
                    </div>
                  )}
                </section>
              )}

              {profile.portfolio.length > 0 && (
                <section aria-labelledby="portfolio" className="rounded-3xl border border-[#D1AF47]/35 bg-white p-6">
                  <h2 id="portfolio" className="font-serif text-xl font-bold">{t.portfolio}</h2>
                  <ul className="mt-3 space-y-2">
                    {profile.portfolio.filter((item) => item.url.startsWith("https://")).map((item) => (
                      <li key={item.url}>
                        <a href={item.url} target="_blank" rel="noopener noreferrer nofollow ugc" aria-label={`${pick(locale, item.title_en, item.title_ar) || item.url} (${t.portfolioOpens})`}
                          className={`break-all text-sm font-semibold text-[#725517] underline ${focusRing}`}>
                          {pick(locale, item.title_en, item.title_ar) || item.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <p className="px-1 text-xs leading-6 text-[#667085]">{t.identityNote}</p>
            </div>
          );
        })()}
      </main>
    </div>
  );
}
