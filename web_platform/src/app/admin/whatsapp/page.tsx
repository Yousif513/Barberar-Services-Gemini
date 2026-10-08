"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CommandDialog } from "@/components/modal";
import {
  CommandResult, ForbiddenNotice, OperationsPanel as Panel, isForbidden, operationsButton as button, operationsDate, useOperationsLocale,
} from "@/components/operations-ui";
import { describeWhatsappError, whatsappCopy, type AdminOverview } from "@/lib/whatsapp-receptionist";

type Pending = AdminOverview["pending_channels"][number];

function Count({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-[#E8DDC0] bg-[#FBF8EF] p-4">
      <dt className="text-xs font-semibold text-[#667085]">{label}</dt>
      <dd className="mt-1 text-2xl font-black text-[#101828]">{value}</dd>
    </div>
  );
}

export default function AdminWhatsappPage() {
  const locale = useOperationsLocale();
  const t = whatsappCopy[locale];
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<{ error?: string; success?: string }>({});
  const [verifyTarget, setVerifyTarget] = useState<Pending | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      setLoading(true);
      const { data, error: rpcError } = await supabase.rpc("admin_whatsapp_overview");
      if (!live) return;
      if (rpcError) { setOverview(null); setForbidden(isForbidden(rpcError)); setError(describeWhatsappError(rpcError, locale)); }
      else { setOverview(data as AdminOverview); setForbidden(false); setError(""); }
      setLoading(false);
    })();
    return () => { live = false; };
  }, [reload, locale]);

  const verify = async (reason: string): Promise<string | null> => {
    if (!verifyTarget) return null;
    const { error: rpcError } = await supabase.rpc("admin_set_whatsapp_channel_verified", { p_channel_id: verifyTarget.id, p_verified: true, p_reason: reason.trim() });
    if (rpcError) return describeWhatsappError(rpcError, locale);
    setResult({ success: t.verified });
    setReload((n) => n + 1);
    return null;
  };

  const businessName = (p: Pending) => (locale === "ar" ? p.provider_name_ar || p.provider_name_en : p.provider_name_en);
  const setting = (value: number | null) => (value === null ? t.unsetValue : String(value));

  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} className="space-y-6 text-[#101828]">
      <header>
        <h1 className="font-serif text-3xl font-bold">{t.adminTitle}</h1>
        <p className="mt-2 text-sm text-[#667085]">{t.adminSubtitle}</p>
      </header>
      <CommandResult error={result.error} success={result.success} locale={locale} onDismiss={() => setResult({})} />
      {loading && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
      {forbidden && <ForbiddenNotice locale={locale} />}
      {!loading && error && !forbidden && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{t.adminLoadFailed} {error}</span><button type="button" className={button} onClick={() => setReload((n) => n + 1)}>{t.retry}</button>
        </div>
      )}
      {overview && (
        <>
          <Panel title={t.adminChannels}>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Count label={t.channelsTotal} value={overview.channels.total} />
              <Count label={t.channelsEnabled} value={overview.channels.enabled} />
              <Count label={t.channelsReceptionist} value={overview.channels.receptionist_on} />
              <Count label={t.channelsVerified} value={overview.channels.verified} />
              <Count label={t.channelsPending} value={overview.channels.pending_verification} />
            </dl>
          </Panel>
          <Panel title={t.adminConversations}>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Count label={t.convTotal} value={overview.conversations.total} />
              <Count label={t.convBot} value={overview.conversations.bot} />
              <Count label={t.convHuman} value={overview.conversations.awaiting_human} />
              <Count label={t.convClosed} value={overview.conversations.closed} />
              <Count label={t.convOptedOut} value={overview.conversations.opted_out} />
            </dl>
          </Panel>
          <Panel title={t.adminMessages}>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Count label={t.messagesIn} value={overview.messages_7d.inbound} />
              <Count label={t.messagesOut} value={overview.messages_7d.outbound} />
            </dl>
          </Panel>
          <Panel title={t.adminSettings}>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Count label={t.settingWindow} value={setting(overview.settings.session_window_hours)} />
              <Count label={t.settingRetention} value={setting(overview.settings.message_retention_days)} />
            </dl>
            <p className="mt-3 text-xs text-[#667085]">{t.settingsHint}</p>
          </Panel>
          <Panel title={t.pendingTitle}>
            {overview.pending_channels.length === 0 ? <p className="text-sm text-[#667085]">{t.pendingEmpty}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-start text-sm">
                  <caption className="sr-only">{t.pendingTitle}</caption>
                  <thead>
                    <tr className="text-xs text-[#667085]">
                      <th scope="col" className="py-2 pe-3 text-start">{t.business}</th>
                      <th scope="col" className="py-2 pe-3 text-start">{t.phoneId}</th>
                      <th scope="col" className="py-2 pe-3 text-start">{t.requested}</th>
                      <th scope="col" className="py-2 text-start"><span className="sr-only">{t.verify}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.pending_channels.map((p) => (
                      <tr key={p.id} className="border-t border-[#EEE8D6] align-top">
                        <td className="py-3 pe-3 font-semibold">{businessName(p)}</td>
                        <td className="py-3 pe-3" dir="ltr">{p.phone_number_id}{p.display_number ? ` · ${p.display_number}` : ""}</td>
                        <td className="py-3 pe-3">{operationsDate(p.created_at, locale)}</td>
                        <td className="py-3"><button type="button" className={button} aria-label={t.verifyLabel(businessName(p))} onClick={() => setVerifyTarget(p)}>{t.verify}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
      {verifyTarget && (
        <CommandDialog
          locale={locale}
          title={t.verifyTitle}
          intro={t.verifyIntro}
          facts={[{ label: t.business, value: businessName(verifyTarget) }, { label: t.phoneId, value: verifyTarget.phone_number_id }]}
          reasonLabel={t.verifyReason}
          reasonRequired
          confirmLabel={t.verifyConfirm}
          onConfirm={verify}
          onClose={() => setVerifyTarget(null)}
        />
      )}
    </div>
  );
}
