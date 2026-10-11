"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  CommandResult, OperationsPanel as Panel, operationsButton as button, useOperationsLocale,
} from "@/components/operations-ui";
import { useConfirm } from "@/components/modal";
import {
  dayLabel, describeProfessionalError, identityCopy, pick, profilePath,
  type MyIdentity, type OwnWorkplace,
} from "@/lib/professional-identity";
import { ProfileForm } from "./_components/profile-form";
import { PortfolioPanel } from "./_components/portfolio-panel";

type LoadState = { status: "loading" } | { status: "error"; error: unknown } | { status: "ready"; data: MyIdentity };

const primary = "rounded-xl bg-[#D1AF47] px-5 py-2.5 text-sm font-black text-[#070B12] transition hover:bg-[#E0C46A] focus-visible:outline-2 focus-visible:outline-[#9B7928] disabled:cursor-not-allowed disabled:opacity-60";

export default function ProfessionalIdentityPage() {
  const locale = useOperationsLocale();
  const t = identityCopy[locale];
  const [confirmNode, ask] = useConfirm(locale);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<{ error?: string; success?: string }>({});
  const [busy, setBusy] = useState("");
  const dismiss = useCallback(() => setResult({}), []);
  const refresh = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error } = await supabase.rpc("my_professional_identity");
      if (!live) return;
      if (error) { setState({ status: "error", error }); return; }
      setState({ status: "ready", data: data as MyIdentity });
    })();
    return () => { live = false; };
  }, [reload]);

  const run = useCallback(async (key: string, success: string, call: () => PromiseLike<{ error: unknown }>) => {
    setBusy(key);
    setResult({});
    const { error } = await call();
    setBusy("");
    if (error) { setResult({ error: `${t.commandFailed}${describeProfessionalError(error, locale)}` }); return false; }
    setResult({ success });
    refresh();
    return true;
  }, [locale, refresh, t.commandFailed]);

  const setPublished = async (publish: boolean) => {
    const ok = await ask({
      title: publish ? t.publishTitle : t.unpublishTitle,
      intro: publish ? t.publishIntro : t.unpublishIntro,
      confirmLabel: publish ? t.publish : t.unpublish,
    });
    if (!ok) return;
    await run("publish", publish ? t.published_ok : t.unpublished_ok, () => supabase.rpc("publish_professional_profile", { p_publish: publish }));
  };

  const respond = async (id: string, accept: boolean) => {
    const ok = await ask({
      title: accept ? t.acceptTitle : t.declineTitle,
      intro: accept ? t.acceptIntro : t.declineIntro,
      confirmLabel: accept ? t.accept : t.decline,
      tone: accept ? "default" : "danger",
    });
    if (!ok) return;
    await run(`respond-${id}`, accept ? t.accepted : t.declined, () => supabase.rpc("respond_professional_invitation", { p_workplace_id: id, p_accept: accept }));
  };

  const endLink = async (place: OwnWorkplace) => {
    const ok = await ask({
      title: t.endTitle,
      intro: t.endIntro,
      facts: [{ label: t.workplaces, value: pick(locale, place.name_en, place.name_ar) }],
      confirmLabel: t.endLink,
      tone: "danger",
    });
    if (!ok) return;
    await run(`end-${place.id}`, t.ended, () => supabase.rpc("end_professional_link", { p_workplace_id: place.id }));
  };

  const closedLabel = (place: OwnWorkplace) =>
    place.closed_by === "professional" ? t.endedByYou : place.closed_by === "provider" ? t.endedBySalon : place.closed_by === "admin" ? t.endedByAdmin : t.endedBySystem;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8" dir={locale === "ar" ? "rtl" : "ltr"}>
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
          <button type="button" className={button} onClick={() => { setState({ status: "loading" }); refresh(); }}>{t.retry}</button>
        </div>
      )}

      {state.status === "ready" && (() => {
        const data = state.data;
        const profile = data.profile;
        const current = data.workplaces.filter((w) => w.status === "active");
        const past = data.workplaces.filter((w) => w.status === "former");

        if (!profile && !data.can_create) {
          return (
            <Panel title={t.notAvailableTitle}>
              <p className="text-sm text-[#475467]">{t.notAvailableBody}</p>
            </Panel>
          );
        }

        return (
          <>
            <p className="rounded-2xl border border-[#D1AF47]/35 bg-[#F8F3E4] p-4 text-sm leading-6 text-[#5C4513]"><strong>{t.stays}.</strong> {t.staysBody}</p>

            <Panel title={profile ? t.profile : t.createProfile}>
              <ProfileForm
                locale={locale}
                data={data}
                onSaved={(created) => { setResult({ success: created ? t.created : t.saved }); refresh(); }}
              />
            </Panel>

            {profile && (
              <>
                <Panel title={t.status}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#344054]">{profile.hidden ? t.hiddenByAdmin : profile.is_published ? t.published : t.draft}</p>
                    {!profile.hidden && (
                      <button type="button" className={profile.is_published ? button : primary} disabled={busy === "publish"} onClick={() => void setPublished(!profile.is_published)}>
                        {busy === "publish" ? t.saving : profile.is_published ? t.unpublish : t.publish}
                      </button>
                    )}
                  </div>
                  {profile.hidden && <p role="status" className="mt-3 text-sm text-red-800">{t.hiddenBody}</p>}
                  {profile.is_published && !profile.hidden && (
                    <Link href={profilePath(profile.handle)} className="mt-3 inline-block text-sm font-semibold text-[#725517] underline focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.viewPublic}</Link>
                  )}
                </Panel>

                <PortfolioPanel locale={locale} items={data.portfolio} onChanged={(message) => { setResult({ success: message }); refresh(); }} ask={ask} />

                <Panel title={t.invitations}>
                  {data.invitations.length === 0 ? (
                    <p className="text-sm text-[#667085]">{t.invitationsEmpty}</p>
                  ) : (
                    <ul className="space-y-3">
                      {data.invitations.map((invite) => (
                        <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#ECECEC] p-4">
                          <div className="min-w-0">
                            <p className="font-bold text-[#101828]">{t.invitedBy(pick(locale, invite.name_en, invite.name_ar))}</p>
                            <p className="text-sm text-[#667085]">{[invite.city, dayLabel(invite.invited_at, locale)].filter(Boolean).join(" · ")}</p>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" className={primary} disabled={busy === `respond-${invite.id}`} onClick={() => void respond(invite.id, true)}>{t.accept}</button>
                            <button type="button" className={button} disabled={busy === `respond-${invite.id}`} onClick={() => void respond(invite.id, false)}>{t.decline}</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel title={t.workplaces}>
                  {data.workplaces.length === 0 && <p className="text-sm text-[#667085]">{t.workplacesEmpty}</p>}
                  {current.length > 0 && (
                    <>
                      <h3 className="mb-2 text-xs font-bold uppercase text-[#667085]">{t.current}</h3>
                      <ul className="space-y-3">
                        {current.map((place) => (
                          <li key={place.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-green-200 bg-green-50/50 p-4">
                            <div className="min-w-0">
                              <p className="font-bold text-[#101828]">{pick(locale, place.name_en, place.name_ar)}</p>
                              <p className="text-sm text-[#667085]">{[place.city, t.startedOn(dayLabel(place.started_at, locale))].filter(Boolean).join(" · ")}</p>
                            </div>
                            <button type="button" className={button} disabled={busy === `end-${place.id}`} onClick={() => void endLink(place)}>{t.endLink}</button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {past.length > 0 && (
                    <>
                      <h3 className="mb-2 mt-5 text-xs font-bold uppercase text-[#667085]">{t.former}</h3>
                      <ul className="space-y-2">
                        {past.map((place) => (
                          <li key={place.id} className="rounded-2xl border border-[#ECECEC] p-3 text-sm">
                            <p className="font-semibold text-[#101828]">{pick(locale, place.name_en, place.name_ar)}</p>
                            <p className="text-[#667085]">{t.endedOn(dayLabel(place.started_at, locale), dayLabel(place.ended_at, locale))} · {closedLabel(place)}</p>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </Panel>

                <Panel title={t.followers}>
                  <p className="text-2xl font-black text-[#101828]">{t.followersCount(data.follower_count)}</p>
                  <p className="mt-1 text-sm text-[#667085]">{t.followersNote}</p>
                </Panel>
              </>
            )}
          </>
        );
      })()}
    </div>
  );
}
