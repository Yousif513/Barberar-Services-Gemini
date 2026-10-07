"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { CommandResult, ForbiddenNotice, useOperationsLocale } from "@/components/operations-ui";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { oneOf, writeUrlState } from "@/lib/url-state";
import {
  API_KEY_COLUMNS, API_SETTING_KEYS, ENDPOINT_COLUMNS, readApiSettings,
  type ApiKeyRow, type ApiSettings, type EndpointRow,
} from "@/lib/developer-api";
import { useProviderContext } from "../_components/provider-context";
import { developerCopy } from "./copy";
import { KeysTab, type Branch, type CreatedKey, type LoadState } from "./keys-tab";
import { WebhooksTab, type SecretToShow } from "./webhooks-tab";
import { ReferenceTab } from "./reference-tab";
import { LimitsTab } from "./limits-tab";
import { SecretDialog, secondaryButton } from "./shared";

const TABS = ["keys", "webhooks", "reference", "limits"] as const;
type Tab = (typeof TABS)[number];

type Config = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; settings: ApiSettings; branches: Branch[] };

function DeveloperConsole({ providerId }: { providerId: string }) {
  const locale = useOperationsLocale();
  const t = developerCopy[locale];
  // Mounted only after the provider context has loaded in the browser, so the address bar can be read directly.
  const [tab, setTab] = useState<Tab>(() => (typeof window === "undefined" ? "keys" : oneOf(new URLSearchParams(window.location.search).get("tab"), TABS, "keys")));
  const [config, setConfig] = useState<Config>({ status: "loading" });
  const [keys, setKeys] = useState<LoadState<ApiKeyRow>>({ status: "loading" });
  const [endpoints, setEndpoints] = useState<LoadState<EndpointRow>>({ status: "loading" });
  const [secret, setSecret] = useState<SecretToShow | null>(null);
  const [result, setResult] = useState("");
  const [versions, setVersions] = useState({ config: 0, keys: 0, endpoints: 0 });
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // The address bar keeps the open tab.
  const chooseTab = (next: Tab) => {
    setTab(next);
    writeUrlState({ tab: next === "keys" ? "" : next });
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      const [settingRows, branchRows] = await Promise.all([
        supabase.from("platform_settings").select("key, value").in("key", [...API_SETTING_KEYS]),
        supabase.from("branches").select("id, name_en, name_ar").eq("provider_id", providerId).order("created_at", { ascending: true }),
      ]);
      if (!live) return;
      const failure = settingRows.error ?? branchRows.error;
      if (failure) { setConfig({ status: "error", message: errorMessage(failure) }); return; }
      setConfig({ status: "ready", settings: readApiSettings((settingRows.data ?? []) as Array<{ key: string; value: unknown }>), branches: (branchRows.data ?? []) as Branch[] });
    })();
    return () => { live = false; };
  }, [providerId, versions.config]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error } = await supabase.from("api_keys").select(API_KEY_COLUMNS).eq("provider_id", providerId).order("created_at", { ascending: false });
      if (!live) return;
      setKeys(error ? { status: "error", message: errorMessage(error) } : { status: "ready", rows: (data ?? []) as unknown as ApiKeyRow[] });
    })();
    return () => { live = false; };
  }, [providerId, versions.keys]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error } = await supabase.from("webhook_subscriptions").select(ENDPOINT_COLUMNS).eq("provider_id", providerId).order("created_at", { ascending: false });
      if (!live) return;
      setEndpoints(error ? { status: "error", message: errorMessage(error) } : { status: "ready", rows: (data ?? []) as unknown as EndpointRow[] });
    })();
    return () => { live = false; };
  }, [providerId, versions.endpoints]);

  const reload = (which: "config" | "keys" | "endpoints") => setVersions((v) => ({ ...v, [which]: v[which] + 1 }));
  const reloadKeys = useCallback(() => setVersions((v) => ({ ...v, keys: v.keys + 1 })), []);
  const onCreated = (created: CreatedKey) => setSecret({ title: t.keyCreatedTitle, warning: t.keyCreatedWarning, label: t.keyLabel, value: created.key });

  const onTabKey = (event: React.KeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" ? (locale === "ar" ? -1 : 1) : event.key === "ArrowLeft" ? (locale === "ar" ? 1 : -1) : 0;
    if (step === 0 && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : (index + step + TABS.length) % TABS.length;
    chooseTab(TABS[next]);
    tabRefs.current[TABS[next]]?.focus();
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl font-black text-[#101828]">{t.title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#475467]">{t.subtitle}</p>
      </header>

      <div role="tablist" aria-label={t.tabsLabel} className="flex flex-wrap gap-2 border-b border-[#E0C46A]/40 pb-2">
        {TABS.map((id, index) => (
          <button
            key={id}
            ref={(node) => { tabRefs.current[id] = node; }}
            type="button"
            role="tab"
            id={`dev-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`dev-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => chooseTab(id)}
            onKeyDown={(event) => onTabKey(event, index)}
            className={`rounded-xl px-4 py-2 text-sm font-black outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] ${tab === id ? "bg-[#101828] text-white" : "bg-white text-[#344054] hover:bg-[#F9F7F1]"}`}
          >
            {t.tabs[id]}
          </button>
        ))}
      </div>

      {config.status === "loading" && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
      {config.status === "error" && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-bold">{t.loadFailed}</p>
          <p className="mt-1 break-words">{config.message}</p>
          <button type="button" onClick={() => reload("config")} className={`${secondaryButton} mt-3`}>{t.retry}</button>
        </div>
      )}

      {config.status === "ready" && (
        <div role="tabpanel" id={`dev-panel-${tab}`} aria-labelledby={`dev-tab-${tab}`} tabIndex={0} className="outline-none focus-visible:outline-2 focus-visible:outline-[#9B7928]">
          {tab === "keys" && (
            <KeysTab locale={locale} t={t} providerId={providerId} branches={config.branches} settings={config.settings} state={keys}
              onReload={reloadKeys} onCreated={onCreated} onResult={setResult} />
          )}
          {tab === "webhooks" && (
            <WebhooksTab locale={locale} t={t} providerId={providerId} branches={config.branches} settings={config.settings} state={endpoints}
              onReload={() => reload("endpoints")} onSecret={setSecret} onResult={setResult} />
          )}
          {tab === "reference" && <ReferenceTab locale={locale} t={t} />}
          {tab === "limits" && <LimitsTab locale={locale} t={t} settings={config.settings} />}
        </div>
      )}

      {secret && <SecretDialog locale={locale} t={t} title={secret.title} warning={secret.warning} label={secret.label} value={secret.value} onClose={() => setSecret(null)} />}
      <CommandResult success={result} locale={locale} onDismiss={() => setResult("")} />
    </div>
  );
}

export default function DeveloperPage() {
  const locale = useOperationsLocale();
  const t = developerCopy[locale];
  const state = useProviderContext();
  if (state.status === "loading") return <p role="status" className="text-sm text-[#667085]">{t.loading}</p>;
  if (state.status === "error") {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <p className="font-bold">{t.loadFailed}</p>
        <p className="mt-1 break-words">{state.message}</p>
        <button type="button" onClick={state.retry} className={`${secondaryButton} mt-3`}>{t.retry}</button>
      </div>
    );
  }
  // Keys and webhook endpoints are managed by the owner only (the database enforces it; this just says so plainly).
  if (state.context.role !== "owner" || !state.context.providerId) {
    return <><ForbiddenNotice locale={locale} /><p className="mt-3 text-sm text-[#475467]">{t.ownersOnly}</p></>;
  }
  return <DeveloperConsole providerId={state.context.providerId} />;
}
