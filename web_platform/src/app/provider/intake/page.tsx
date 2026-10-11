"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  CommandResult, ForbiddenNotice, OperationsPanel as Panel, isForbidden, operationsButton as button, operationsDate, useOperationsLocale,
} from "@/components/operations-ui";
import { CommandDialog, useConfirm } from "@/components/modal";
import {
  INTAKE_PAGE_SIZE, describeIntakeError, intakeCopy, personName, type FormStatus, type PatchStatus, type StatusRow,
} from "@/lib/intake";
import { useProviderContext } from "../_components/provider-context";
import { TemplateDialog, type TemplateRow } from "./_components/template-dialog";
import { AnswersDialog, PatchTestDialog, RequirementDialog, type RequirementValues } from "./_components/dialogs";

type ServiceRow = { id: string; name_en: string; name_ar: string; requirement: RequirementValues | null };
type PatchRow = {
  id: string;
  result: "negative" | "positive";
  tested_at: string;
  cleared_at: string | null;
  clear_reason: string | null;
  services: { name_en: string; name_ar: string } | null;
  profiles: { first_name: string | null; last_name: string | null } | null;
};

const STATUS_COLUMNS = "booking_id, provider_id, service_id, customer_id, scheduled_at, booking_status, service_name_en, service_name_ar, customer_first_name, customer_last_name, form_required, form_status, patch_required, patch_status, blocked, met";
const SERVICE_SELECT = "id, name_en, name_ar, intake_service_requirements ( template_id, form_required, patch_test_required, patch_validity_days, patch_min_hours_before )";
const PATCH_SELECT = "id, result, tested_at, cleared_at, clear_reason, services ( name_en, name_ar ), profiles!patch_test_results_customer_id_fkey ( first_name, last_name )";

function Pager({ page, total, label, locale, onPage }: { page: number; total: number; label: string; locale: "en" | "ar"; onPage: (page: number) => void }) {
  const t = intakeCopy[locale];
  const pages = Math.max(1, Math.ceil(total / INTAKE_PAGE_SIZE));
  if (total <= INTAKE_PAGE_SIZE) return null;
  return (
    <nav aria-label={label} className="mt-4 flex items-center justify-between gap-3">
      <button type="button" className={button} disabled={page === 0} onClick={() => onPage(page - 1)}>{t.prev}</button>
      <span className="text-sm text-[#667085]">{t.page(page + 1, pages)}</span>
      <button type="button" className={button} disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>{t.next}</button>
    </nav>
  );
}

function LoadError({ message, locale, onRetry }: { message: string; locale: "en" | "ar"; onRetry: () => void }) {
  const t = intakeCopy[locale];
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <span>{t.loadFailed} {message}</span><button type="button" className={button} onClick={onRetry}>{t.retry}</button>
    </div>
  );
}

const badge = (tone: "ok" | "warn" | "bad" | "idle") =>
  `inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${tone === "ok" ? "bg-green-100 text-green-800" : tone === "warn" ? "bg-amber-100 text-amber-900" : tone === "bad" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700"}`;
const formTone = (s: FormStatus) => (s === "submitted" ? "ok" : s === "not_required" ? "idle" : "warn");
const patchTone = (s: PatchStatus) => (s === "valid" ? "ok" : s === "not_required" ? "idle" : s === "blocked" ? "bad" : "warn");

export default function ProviderIntakePage() {
  const locale = useOperationsLocale();
  const t = intakeCopy[locale];
  const provider = useProviderContext();
  const providerId = provider.status === "ready" ? provider.context.providerId : null;
  const isOwner = provider.status === "ready" && provider.context.role === "owner";
  const [confirmNode, ask] = useConfirm(locale);
  const [result, setResult] = useState<{ error?: string; success?: string }>({});
  const [forbidden, setForbidden] = useState(false);
  const dismiss = useCallback(() => setResult({}), []);

  // enforcement
  const [enforce, setEnforce] = useState<boolean | null>(null);
  const [enforceError, setEnforceError] = useState("");
  const [enforceBusy, setEnforceBusy] = useState(false);
  const [enforceReload, setEnforceReload] = useState(0);

  // forms
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateTotal, setTemplateTotal] = useState(0);
  const [templatePage, setTemplatePage] = useState(0);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState("");
  const [templatesReload, setTemplatesReload] = useState(0);
  const [activeTemplates, setActiveTemplates] = useState<{ id: string; name_en: string; name_ar: string }[]>([]);
  const [editing, setEditing] = useState<TemplateRow | "new" | null>(null);

  // services
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [serviceTotal, setServiceTotal] = useState(0);
  const [servicePage, setServicePage] = useState(0);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState("");
  const [servicesReload, setServicesReload] = useState(0);
  const [requirementFor, setRequirementFor] = useState<ServiceRow | null>(null);

  // upcoming bookings
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [rows, setRows] = useState<StatusRow[]>([]);
  const [rowTotal, setRowTotal] = useState(0);
  const [rowPage, setRowPage] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [rowsError, setRowsError] = useState("");
  const [rowsReload, setRowsReload] = useState(0);
  const [patchFor, setPatchFor] = useState<StatusRow | null>(null);
  const [answersFor, setAnswersFor] = useState<StatusRow | null>(null);

  // patch-test log
  const [patches, setPatches] = useState<PatchRow[]>([]);
  const [patchTotal, setPatchTotal] = useState(0);
  const [patchPage, setPatchPage] = useState(0);
  const [patchesLoading, setPatchesLoading] = useState(true);
  const [patchesError, setPatchesError] = useState("");
  const [patchesReload, setPatchesReload] = useState(0);
  const [clearing, setClearing] = useState<PatchRow | null>(null);

  const refreshAll = () => { setRowsReload((n) => n + 1); setPatchesReload((n) => n + 1); };

  useEffect(() => {
    if (!providerId) return;
    let live = true;
    void (async () => {
      const { data, error } = await supabase.from("provider_intake_settings").select("enforce_requirements").eq("provider_id", providerId).maybeSingle();
      if (!live) return;
      if (error) { setForbidden((f) => f || isForbidden(error)); setEnforceError(describeIntakeError(error, locale)); return; }
      setEnforceError("");
      setEnforce(Boolean(data?.enforce_requirements));
    })();
    return () => { live = false; };
  }, [providerId, enforceReload, locale]);

  useEffect(() => {
    if (!providerId) return;
    let live = true;
    void (async () => {
      setTemplatesLoading(true);
      const from = templatePage * INTAKE_PAGE_SIZE;
      const { data, error, count } = await supabase.from("intake_form_templates").select("id, name_en, name_ar, is_active, current_version", { count: "exact" })
        .eq("provider_id", providerId).order("updated_at", { ascending: false }).range(from, from + INTAKE_PAGE_SIZE - 1);
      if (!live) return;
      if (error) { setTemplates([]); setTemplateTotal(0); setTemplatesError(describeIntakeError(error, locale)); }
      else { setTemplates((data ?? []) as TemplateRow[]); setTemplateTotal(count ?? 0); setTemplatesError(""); }
      setTemplatesLoading(false);
    })();
    return () => { live = false; };
  }, [providerId, templatePage, templatesReload, locale]);

  useEffect(() => {
    if (!providerId) return;
    let live = true;
    void (async () => {
      const { data } = await supabase.from("intake_form_templates").select("id, name_en, name_ar").eq("provider_id", providerId).eq("is_active", true)
        .order("name_en", { ascending: true }).range(0, 99);
      if (live) setActiveTemplates((data ?? []) as { id: string; name_en: string; name_ar: string }[]);
    })();
    return () => { live = false; };
  }, [providerId, templatesReload]);

  useEffect(() => {
    if (!providerId) return;
    let live = true;
    void (async () => {
      setServicesLoading(true);
      const from = servicePage * INTAKE_PAGE_SIZE;
      const { data, error, count } = await supabase.from("services").select(SERVICE_SELECT, { count: "exact" })
        .eq("provider_id", providerId).order("name_en", { ascending: true }).range(from, from + INTAKE_PAGE_SIZE - 1);
      if (!live) return;
      if (error) { setServices([]); setServiceTotal(0); setServicesError(describeIntakeError(error, locale)); }
      else {
        setServices(((data ?? []) as unknown as { id: string; name_en: string; name_ar: string; intake_service_requirements: RequirementValues | RequirementValues[] | null }[]).map((s) => ({
          id: s.id, name_en: s.name_en, name_ar: s.name_ar,
          requirement: Array.isArray(s.intake_service_requirements) ? (s.intake_service_requirements[0] ?? null) : s.intake_service_requirements,
        })));
        setServiceTotal(count ?? 0);
        setServicesError("");
      }
      setServicesLoading(false);
    })();
    return () => { live = false; };
  }, [providerId, servicePage, servicesReload, locale]);

  useEffect(() => {
    if (!providerId) return;
    let live = true;
    void (async () => {
      setRowsLoading(true);
      const from = rowPage * INTAKE_PAGE_SIZE;
      let query = supabase.from("provider_booking_intake_status").select(STATUS_COLUMNS, { count: "exact" })
        .eq("provider_id", providerId).in("booking_status", ["pending_payment", "confirmed"]).gte("scheduled_at", new Date().toISOString());
      if (onlyMissing) query = query.eq("met", false);
      const { data, error, count } = await query.order("scheduled_at", { ascending: true }).range(from, from + INTAKE_PAGE_SIZE - 1);
      if (!live) return;
      if (error) { setRows([]); setRowTotal(0); setRowsError(describeIntakeError(error, locale)); }
      else { setRows((data ?? []) as StatusRow[]); setRowTotal(count ?? 0); setRowsError(""); }
      setRowsLoading(false);
    })();
    return () => { live = false; };
  }, [providerId, rowPage, onlyMissing, rowsReload, locale]);

  useEffect(() => {
    if (!providerId) return;
    let live = true;
    void (async () => {
      setPatchesLoading(true);
      const from = patchPage * INTAKE_PAGE_SIZE;
      const { data, error, count } = await supabase.from("patch_test_results").select(PATCH_SELECT, { count: "exact" })
        .eq("provider_id", providerId).order("tested_at", { ascending: false }).range(from, from + INTAKE_PAGE_SIZE - 1);
      if (!live) return;
      if (error) { setPatches([]); setPatchTotal(0); setPatchesError(describeIntakeError(error, locale)); }
      else { setPatches((data ?? []) as unknown as PatchRow[]); setPatchTotal(count ?? 0); setPatchesError(""); }
      setPatchesLoading(false);
    })();
    return () => { live = false; };
  }, [providerId, patchPage, patchesReload, locale]);

  const toggleEnforcement = async (next: boolean) => {
    if (!providerId || enforceBusy) return;
    const yes = await ask({
      title: next ? t.enforceOnTitle : t.enforceOffTitle, intro: next ? t.enforceOnIntro : t.enforceOffIntro,
      confirmLabel: next ? t.enforceOn : t.enforceOff, tone: next ? "default" : "danger",
    });
    if (!yes) return;
    setEnforceBusy(true);
    const { error } = await supabase.rpc("set_provider_intake_enforcement", { p_provider_id: providerId, p_enabled: next });
    setEnforceBusy(false);
    if (error) { setResult({ error: describeIntakeError(error, locale) }); return; }
    setEnforce(next);
    setEnforceReload((n) => n + 1);
  };

  const removeRequirement = async (service: ServiceRow) => {
    const yes = await ask({
      title: t.removeRequirementTitle, intro: t.removeRequirementIntro, confirmLabel: t.removeRequirement, tone: "danger",
      facts: [{ label: t.service, value: locale === "ar" ? service.name_ar : service.name_en }],
    });
    if (!yes) return;
    const { error } = await supabase.rpc("remove_service_intake_requirement", { p_service_id: service.id });
    if (error) { setResult({ error: describeIntakeError(error, locale) }); return; }
    setResult({ success: t.requirementRemoved });
    setServicesReload((n) => n + 1);
    setRowsReload((n) => n + 1);
  };

  const requirementSummary = (r: RequirementValues | null) => {
    if (!r || (!r.form_required && !r.patch_test_required)) return t.none;
    const parts: string[] = [];
    if (r.form_required) parts.push(t.summaryForm);
    if (r.patch_test_required && r.patch_validity_days != null) parts.push(t.summaryPatch(r.patch_validity_days, r.patch_min_hours_before));
    return parts.join(" · ");
  };

  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} className="space-y-6 text-[#101828]">
      {confirmNode}
      <header>
        <h1 className="font-serif text-3xl font-bold">{t.providerTitle}</h1>
        <p className="mt-2 max-w-3xl text-sm text-[#667085]">{t.providerSubtitle}</p>
      </header>
      <CommandResult error={result.error} success={result.success} locale={locale} onDismiss={dismiss} />

      {provider.status === "loading" && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
      {provider.status === "error" && <LoadError message={provider.message} locale={locale} onRetry={provider.retry} />}
      {provider.status === "ready" && !providerId && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">{t.noProvider}</p>}
      {forbidden && <ForbiddenNotice locale={locale} />}

      {providerId && (
        <>
          <Panel title={t.enforceTitle}>
            {enforceError && !forbidden && <LoadError message={enforceError} locale={locale} onRetry={() => setEnforceReload((n) => n + 1)} />}
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" role="switch" className="mt-1 h-4 w-4" checked={enforce === true} disabled={!isOwner || enforce === null || enforceBusy}
                aria-describedby="enforce-help" onChange={(e) => void toggleEnforcement(e.target.checked)} />
              <span>
                <span className="font-semibold">{t.enforceLabel}</span>
                <span id="enforce-help" className="block text-xs text-[#667085]">{t.enforceHelp}</span>
                {enforce !== null && <span className="mt-1 block text-xs font-bold">{t.enforcementNow}: {enforce ? t.on : t.off}</span>}
              </span>
            </label>
            {!isOwner && <p className="mt-3 text-sm text-[#667085]">{t.ownerOnly}</p>}
          </Panel>

          <Panel title={t.templatesTitle}>
            {isOwner && <div className="mb-4"><button type="button" className={button} onClick={() => setEditing("new")}>{t.newForm}</button></div>}
            {templatesLoading && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
            {!templatesLoading && templatesError && <LoadError message={templatesError} locale={locale} onRetry={() => setTemplatesReload((n) => n + 1)} />}
            {!templatesLoading && !templatesError && templates.length === 0 && <p className="text-sm text-[#667085]">{t.noForms}</p>}
            {!templatesLoading && templates.length > 0 && (
              <ul className="divide-y divide-[#EEE8D6]">
                {templates.map((tpl) => (
                  <li key={tpl.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-semibold">{locale === "ar" ? tpl.name_ar : tpl.name_en}</p>
                      <p className="text-xs text-[#667085]">{t.version(tpl.current_version)} · <span className={badge(tpl.is_active ? "ok" : "idle")}>{tpl.is_active ? t.activeBadge : t.archived}</span></p>
                    </div>
                    {isOwner && <button type="button" className={button} aria-label={`${t.editForm}: ${locale === "ar" ? tpl.name_ar : tpl.name_en}`} onClick={() => setEditing(tpl)}>{t.editForm}</button>}
                  </li>
                ))}
              </ul>
            )}
            <Pager page={templatePage} total={templateTotal} label={t.templatesTitle} locale={locale} onPage={setTemplatePage} />
          </Panel>

          <Panel title={t.servicesTitle}>
            <p className="mb-4 text-sm text-[#667085]">{t.servicesHelp}</p>
            {servicesLoading && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
            {!servicesLoading && servicesError && <LoadError message={servicesError} locale={locale} onRetry={() => setServicesReload((n) => n + 1)} />}
            {!servicesLoading && !servicesError && services.length === 0 && <p className="text-sm text-[#667085]">{t.noServices}</p>}
            {!servicesLoading && services.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-start text-sm">
                  <caption className="sr-only">{t.servicesTitle}</caption>
                  <thead><tr className="text-xs text-[#667085]">
                    <th scope="col" className="py-2 pe-3 text-start">{t.service}</th>
                    <th scope="col" className="py-2 pe-3 text-start">{t.requirement}</th>
                    <th scope="col" className="py-2 text-start">{t.actions}</th>
                  </tr></thead>
                  <tbody>
                    {services.map((s) => {
                      const name = locale === "ar" ? s.name_ar : s.name_en;
                      return (
                        <tr key={s.id} className="border-t border-[#EEE8D6] align-top">
                          <td className="py-3 pe-3 font-semibold">{name}</td>
                          <td className="py-3 pe-3">{requirementSummary(s.requirement)}</td>
                          <td className="py-3">
                            {isOwner && (
                              <div className="flex flex-wrap gap-2">
                                <button type="button" className={button} aria-label={`${s.requirement ? t.editRequirement : t.setRequirement}: ${name}`} onClick={() => setRequirementFor(s)}>{s.requirement ? t.editRequirement : t.setRequirement}</button>
                                {s.requirement && <button type="button" className={button} aria-label={`${t.removeRequirement}: ${name}`} onClick={() => void removeRequirement(s)}>{t.removeRequirement}</button>}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pager page={servicePage} total={serviceTotal} label={t.servicesTitle} locale={locale} onPage={setServicePage} />
          </Panel>

          <Panel title={t.missingTitle}>
            <p className="mb-3 text-sm text-[#667085]">{t.missingHelp}</p>
            <label className="mb-4 flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={onlyMissing} onChange={(e) => { setOnlyMissing(e.target.checked); setRowPage(0); }} />{t.onlyMissing}
            </label>
            {rowsLoading && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
            {!rowsLoading && rowsError && <LoadError message={rowsError} locale={locale} onRetry={() => setRowsReload((n) => n + 1)} />}
            {!rowsLoading && !rowsError && rows.length === 0 && <p className="text-sm text-[#667085]">{onlyMissing ? t.noMissing : t.noUpcoming}</p>}
            {!rowsLoading && rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-start text-sm">
                  <caption className="sr-only">{t.missingTitle}</caption>
                  <thead><tr className="text-xs text-[#667085]">
                    <th scope="col" className="py-2 pe-3 text-start">{t.client}</th>
                    <th scope="col" className="py-2 pe-3 text-start">{t.service}</th>
                    <th scope="col" className="py-2 pe-3 text-start">{t.when}</th>
                    <th scope="col" className="py-2 pe-3 text-start">{t.formCol}</th>
                    <th scope="col" className="py-2 pe-3 text-start">{t.patchCol}</th>
                    <th scope="col" className="py-2 text-start">{t.actions}</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((r) => {
                      const who = personName(r.customer_first_name, r.customer_last_name) || r.customer_id.slice(0, 8);
                      const service = locale === "ar" ? r.service_name_ar : r.service_name_en;
                      return (
                        <tr key={r.booking_id} className="border-t border-[#EEE8D6] align-top">
                          <td className="py-3 pe-3 font-semibold">{who}</td>
                          <td className="py-3 pe-3">{service}</td>
                          <td className="py-3 pe-3">{operationsDate(r.scheduled_at, locale)}</td>
                          <td className="py-3 pe-3"><span className={badge(formTone(r.form_status))}>{t.formStatus[r.form_status]}</span></td>
                          <td className="py-3 pe-3"><span className={badge(patchTone(r.patch_status))}>{t.patchStatus[r.patch_status]}</span></td>
                          <td className="py-3">
                            <div className="flex flex-wrap gap-2">
                              {r.form_status === "submitted" && <button type="button" className={button} aria-label={`${t.viewAnswers}: ${who}`} onClick={() => setAnswersFor(r)}>{t.viewAnswers}</button>}
                              {r.patch_required && <button type="button" className={button} aria-label={`${t.recordPatch}: ${who}`} onClick={() => setPatchFor(r)}>{t.recordPatch}</button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pager page={rowPage} total={rowTotal} label={t.missingTitle} locale={locale} onPage={setRowPage} />
          </Panel>

          <Panel title={t.patchLogTitle}>
            {patchesLoading && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
            {!patchesLoading && patchesError && <LoadError message={patchesError} locale={locale} onRetry={() => setPatchesReload((n) => n + 1)} />}
            {!patchesLoading && !patchesError && patches.length === 0 && <p className="text-sm text-[#667085]">{t.noPatchTests}</p>}
            {!patchesLoading && patches.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-start text-sm">
                  <caption className="sr-only">{t.patchLogTitle}</caption>
                  <thead><tr className="text-xs text-[#667085]">
                    <th scope="col" className="py-2 pe-3 text-start">{t.client}</th>
                    <th scope="col" className="py-2 pe-3 text-start">{t.service}</th>
                    <th scope="col" className="py-2 pe-3 text-start">{t.testedCol}</th>
                    <th scope="col" className="py-2 pe-3 text-start">{t.resultCol}</th>
                    <th scope="col" className="py-2 text-start">{t.actions}</th>
                  </tr></thead>
                  <tbody>
                    {patches.map((p) => {
                      const who = personName(p.profiles?.first_name, p.profiles?.last_name);
                      const blocking = p.result === "positive" && !p.cleared_at;
                      return (
                        <tr key={p.id} className="border-t border-[#EEE8D6] align-top">
                          <td className="py-3 pe-3 font-semibold">{who}</td>
                          <td className="py-3 pe-3">{p.services ? (locale === "ar" ? p.services.name_ar : p.services.name_en) : ""}</td>
                          <td className="py-3 pe-3">{operationsDate(p.tested_at, locale)}</td>
                          <td className="py-3 pe-3">
                            <span className={badge(p.result === "negative" ? "ok" : blocking ? "bad" : "idle")}>{p.result === "negative" ? t.negative : t.positive}</span>
                            <span className="mt-1 block text-xs text-[#667085]">{blocking ? t.activeBlock : p.cleared_at ? `${t.cleared}: ${p.clear_reason ?? ""}` : ""}</span>
                          </td>
                          <td className="py-3">
                            {blocking && isOwner && <button type="button" className={button} aria-label={`${t.clearBlock}: ${who}`} onClick={() => setClearing(p)}>{t.clearBlock}</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pager page={patchPage} total={patchTotal} label={t.patchLogTitle} locale={locale} onPage={setPatchPage} />
          </Panel>
        </>
      )}

      {providerId && editing && (
        <TemplateDialog providerId={providerId} template={editing === "new" ? null : editing} locale={locale}
          onSaved={() => { setResult({ success: t.formSaved }); setTemplatesReload((n) => n + 1); }} onClose={() => setEditing(null)} />
      )}
      {requirementFor && (
        <RequirementDialog service={requirementFor} current={requirementFor.requirement} templates={activeTemplates} locale={locale}
          onSaved={() => { setResult({ success: t.requirementSaved }); setServicesReload((n) => n + 1); setRowsReload((n) => n + 1); }} onClose={() => setRequirementFor(null)} />
      )}
      {patchFor && (
        <PatchTestDialog row={patchFor} locale={locale} onSaved={() => { setResult({ success: t.patchSaved }); refreshAll(); }} onClose={() => setPatchFor(null)} />
      )}
      {answersFor && <AnswersDialog row={answersFor} locale={locale} onClose={() => setAnswersFor(null)} />}
      {clearing && (
        <CommandDialog
          locale={locale}
          title={t.clearTitle}
          intro={t.clearIntro}
          facts={[{ label: t.client, value: personName(clearing.profiles?.first_name, clearing.profiles?.last_name) }, { label: t.service, value: clearing.services ? (locale === "ar" ? clearing.services.name_ar : clearing.services.name_en) : "" }]}
          reasonLabel={t.clearReason}
          confirmLabel={t.clearConfirm}
          onConfirm={async (reason) => {
            const { error } = await supabase.rpc("clear_patch_test_block", { p_result_id: clearing.id, p_reason: reason });
            if (error) return describeIntakeError(error, locale);
            setResult({ success: t.blockCleared });
            refreshAll();
            return null;
          }}
          onClose={() => setClearing(null)}
        />
      )}
    </div>
  );
}
