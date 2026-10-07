"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  OperationsField as Field, operationsButton as button, operationsDate, operationsInput as input, sar, useOperationsLocale,
} from "@/components/operations-ui";
import {
  GUEST_LABEL_MAX_LENGTH, MAX_GROUP_SIZE, MAX_SERVICES_PER_GUEST, MIN_GROUP_SIZE, NOTES_MAX_LENGTH, OCCASIONS,
  describeGroupError, groupCopy, riyadhInstant, riyadhToday,
  type GroupCreated, type GroupPreview, type GuestInput, type Occasion,
} from "@/lib/group-booking";

type ProviderOffer = { provider_id: string; business_name_en: string; business_name_ar: string; max_group_size: number; payment_hold_hours: number | null };
type BranchRow = { id: string; name_en: string | null; name_ar: string | null; city: string | null; district: string | null };
type EmployeeRow = { id: string; name_en: string; name_ar: string | null; title_en: string | null; title_ar: string | null };
type ServiceRow = { id: string; name_en: string; name_ar: string | null; base_price: number; base_duration_minutes: number };
type ProfileRow = { id: string; name: string; type: string };
type GuestDraft = { uid: string; label: string; profileId: string; employeeId: string; serviceIds: string[]; time: string };

type Load<T> = { status: "idle" | "loading" | "error" | "ready"; data: T };

const primaryButton = "rounded-xl bg-[#101828] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#1f2a44] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928] disabled:cursor-not-allowed disabled:opacity-50";
const card = "rounded-[24px] border border-[#D1AF47]/35 bg-white/90 p-5 shadow-[0_8px_24px_rgba(56,44,16,0.06)]";
let draftCounter = 0;
const emptyCatalogue = () => ({ employees: [] as EmployeeRow[], services: [] as ServiceRow[], offers: new Set<string>() });
const newDraft = (): GuestDraft => ({ uid: `guest-${++draftCounter}`, label: "", profileId: "", employeeId: "", serviceIds: [], time: "" });

export default function GroupBookingForm({ onCreated }: { onCreated: () => void }) {
  const locale = useOperationsLocale();
  const t = groupCopy[locale];
  const pick = (en: string | null | undefined, ar: string | null | undefined) => (locale === "ar" ? ar || en || "" : en || ar || "");

  const [providers, setProviders] = useState<Load<ProviderOffer[]>>({ status: "loading", data: [] });
  const [providerId, setProviderId] = useState("");
  const [branches, setBranches] = useState<Load<BranchRow[]>>({ status: "idle", data: [] });
  const [branchId, setBranchId] = useState("");
  const [catalogue, setCatalogue] = useState<Load<ReturnType<typeof emptyCatalogue>>>({ status: "idle", data: emptyCatalogue() });
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [date, setDate] = useState("");
  const [occasion, setOccasion] = useState<Occasion>("wedding");
  const [notes, setNotes] = useState("");
  const [guests, setGuests] = useState<GuestDraft[]>(() => [newDraft(), newDraft()]);
  const [errors, setErrors] = useState<string[]>([]);
  const [stage, setStage] = useState<"edit" | "review" | "created">("edit");
  const [working, setWorking] = useState(false);
  const [serverError, setServerError] = useState("");
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [created, setCreated] = useState<GroupCreated | null>(null);
  const [reloadProviders, setReloadProviders] = useState(0);
  // One key per reviewed plan: a retry after a dropped connection repeats the same request, so it can never book twice.
  const idempotencyKey = useRef("");

  const provider = providers.data.find((p) => p.provider_id === providerId) ?? null;
  const maxGuests = provider ? Math.min(provider.max_group_size, MAX_GROUP_SIZE) : MAX_GROUP_SIZE;

  useEffect(() => {
    let live = true;
    void (async () => {
      setProviders((p) => ({ ...p, status: "loading" }));
      const { data, error } = await supabase.rpc("list_group_booking_providers");
      if (!live) return;
      if (error) { setProviders({ status: "error", data: [] }); return; }
      setProviders({ status: "ready", data: (data ?? []) as ProviderOffer[] });
    })();
    return () => { live = false; };
  }, [reloadProviders]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!live || !user) return;
      const { data } = await supabase.from("client_profiles").select("id, name, type").eq("client_id", user.id);
      if (live) setProfiles((data ?? []) as ProfileRow[]);
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!providerId) return;
    let live = true;
    void (async () => {
      const { data, error } = await supabase.from("branches").select("id, name_en, name_ar, city, district, is_active")
        .eq("provider_id", providerId).order("created_at", { ascending: true });
      if (!live) return;
      if (error) { setBranches({ status: "error", data: [] }); return; }
      const active = ((data ?? []) as (BranchRow & { is_active: boolean | null })[]).filter((b) => b.is_active !== false);
      setBranches({ status: "ready", data: active });
      if (active.length === 1) { setBranchId(active[0].id); setCatalogue({ status: "loading", data: emptyCatalogue() }); }
    })();
    return () => { live = false; };
  }, [providerId]);

  useEffect(() => {
    if (!branchId || !providerId) return;
    let live = true;
    void (async () => {
      const [employeeRes, serviceRes] = await Promise.all([
        supabase.from("employees").select("id, name_en, name_ar, title_en, title_ar").eq("branch_id", branchId).eq("is_active", true),
        supabase.from("services").select("id, name_en, name_ar, base_price, base_duration_minutes")
          .eq("provider_id", providerId).eq("is_active", true).order("sort_order", { ascending: true }),
      ]);
      if (!live) return;
      if (employeeRes.error || serviceRes.error) { setCatalogue({ status: "error", data: emptyCatalogue() }); return; }
      const employees = (employeeRes.data ?? []) as EmployeeRow[];
      let offers = new Set<string>();
      if (employees.length > 0) {
        const offerRes = await supabase.from("employee_services").select("employee_id, service_id").in("employee_id", employees.map((e) => e.id));
        if (!live) return;
        if (offerRes.error) { setCatalogue({ status: "error", data: emptyCatalogue() }); return; }
        offers = new Set(((offerRes.data ?? []) as { employee_id: string; service_id: string }[]).map((o) => `${o.employee_id}:${o.service_id}`));
      }
      setCatalogue({ status: "ready", data: { employees, services: (serviceRes.data ?? []) as ServiceRow[], offers } });
    })();
    return () => { live = false; };
  }, [branchId, providerId]);

  // Any edit to the request makes the reviewed plan stale: go back to editing so nobody confirms a plan they did not see.
  const edited = useCallback(() => { setStage((s) => (s === "review" ? "edit" : s)); setPreview(null); setServerError(""); }, []);
  const patchGuest = (uid: string, patch: Partial<GuestDraft>) => {
    setGuests((list) => list.map((g) => (g.uid === uid ? { ...g, ...patch } : g)));
    edited();
  };
  const clearGuestChoices = () => setGuests((list) => list.map((g) => ({ ...g, employeeId: "", serviceIds: [] })));
  const selectProvider = (id: string) => {
    setProviderId(id);
    setBranchId("");
    setBranches({ status: id ? "loading" : "idle", data: [] });
    setCatalogue({ status: "idle", data: emptyCatalogue() });
    clearGuestChoices();
    edited();
  };
  const selectBranch = (id: string) => {
    setBranchId(id);
    setCatalogue({ status: id ? "loading" : "idle", data: emptyCatalogue() });
    clearGuestChoices();
    edited();
  };
  const servicesFor = (employeeId: string) =>
    catalogue.data.services.filter((s) => !employeeId || catalogue.data.offers.has(`${employeeId}:${s.id}`));
  const changeEmployee = (guest: GuestDraft, employeeId: string) => {
    const allowed = new Set(servicesFor(employeeId).map((s) => s.id));
    patchGuest(guest.uid, { employeeId, serviceIds: guest.serviceIds.filter((id) => allowed.has(id)) });
  };
  const toggleService = (guest: GuestDraft, serviceId: string) => {
    const has = guest.serviceIds.includes(serviceId);
    if (!has && guest.serviceIds.length >= MAX_SERVICES_PER_GUEST) return;
    patchGuest(guest.uid, { serviceIds: has ? guest.serviceIds.filter((id) => id !== serviceId) : [...guest.serviceIds, serviceId] });
  };

  const guestName = (g: GuestDraft) => g.label.trim() || profiles.find((p) => p.id === g.profileId)?.name || "";
  const toInput = (g: GuestDraft): GuestInput => ({
    ...(g.label.trim() ? { label: g.label.trim() } : {}),
    ...(g.profileId ? { client_profile_id: g.profileId } : {}),
    services: g.serviceIds.map((service_id) => ({ service_id })),
    ...(g.employeeId ? { employee_id: g.employeeId } : {}),
    ...(g.time ? { scheduled_at: riyadhInstant(date, g.time) } : {}),
  });

  const validate = (): string[] => {
    const problems: string[] = [];
    if (!providerId) problems.push(t.providerRequired);
    if (providerId && !branchId) problems.push(t.branchRequired);
    if (!date || date < riyadhToday()) problems.push(t.dateRequired);
    if (guests.length < MIN_GROUP_SIZE) problems.push(t.minGuests);
    guests.forEach((g, i) => {
      if (!guestName(g)) problems.push(`${t.guestN(i + 1)}: ${t.nameOrProfile}`);
      if (g.serviceIds.length < 1 || g.serviceIds.length > MAX_SERVICES_PER_GUEST) problems.push(`${t.guestN(i + 1)}: ${t.servicesRequired}`);
    });
    return problems;
  };

  const check = async () => {
    if (working) return;
    const problems = validate();
    setErrors(problems);
    setServerError("");
    if (problems.length > 0) return;
    setWorking(true);
    const { data, error } = await supabase.rpc("preview_group_booking", { p_branch_id: branchId, p_event_date: date, p_guests: guests.map(toInput) });
    setWorking(false);
    if (error) { setServerError(describeGroupError(error, locale)); return; }
    idempotencyKey.current = crypto.randomUUID();
    setPreview(data as GroupPreview);
    setStage("review");
  };

  const bookGroup = async () => {
    if (working || !preview || !preview.can_create) return;
    setWorking(true);
    setServerError("");
    // The reviewed assignment is what gets booked: each guest's suggested professional and time.
    const plan = guests.map((g, i) => ({ ...toInput(g), employee_id: preview.guests[i].employee_id as string, scheduled_at: preview.guests[i].scheduled_at as string }));
    const { data, error } = await supabase.rpc("create_group_booking", {
      p_branch_id: branchId, p_event_date: date, p_occasion: occasion, p_notes: notes.trim() || null,
      p_guests: plan, p_idempotency_key: idempotencyKey.current,
    });
    setWorking(false);
    if (error) { setServerError(describeGroupError(error, locale)); return; }
    setCreated(data as GroupCreated);
    setStage("created");
    onCreated();
  };

  const startOver = () => {
    setGuests([newDraft(), newDraft()]);
    setNotes("");
    setPreview(null);
    setCreated(null);
    setErrors([]);
    setServerError("");
    setStage("edit");
  };

  const serviceName = (id: string) => pick(catalogue.data.services.find((s) => s.id === id)?.name_en, catalogue.data.services.find((s) => s.id === id)?.name_ar);
  const employeeName = (id: string | null) => (id ? pick(catalogue.data.employees.find((e) => e.id === id)?.name_en, catalogue.data.employees.find((e) => e.id === id)?.name_ar) : "");
  const locked = stage === "created";
  const providerLabel = (p: ProviderOffer) => pick(p.business_name_en, p.business_name_ar);

  return (
    <section aria-label={t.title} className="space-y-5">
      {stage === "created" && created && (
        <div role="status" className="rounded-2xl border border-green-300 bg-green-50 p-5 text-sm text-green-900">
          <h2 className="font-serif text-xl font-bold">{t.createdTitle}</h2>
          <p className="mt-1">{created.replayed ? t.createdReplay : t.createdBody(created.headcount)}</p>
          {created.payment.awaiting_payment > 0 && <p className="mt-1">{t.createdPay}</p>}
          <button type="button" className={`${button} mt-3`} onClick={startOver}>{t.title}</button>
        </div>
      )}

      <div className={card}>
        <h2 className="mb-4 font-serif text-xl font-bold">{t.detailsTitle}</h2>
        {providers.status === "loading" && <p role="status" className="text-sm text-[#667085]">{t.providersLoading}</p>}
        {providers.status === "error" && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <span>{t.providersFailed}</span>
            <button type="button" className={button} onClick={() => setReloadProviders((n) => n + 1)}>{t.retry}</button>
          </div>
        )}
        {providers.status === "ready" && providers.data.length === 0 && <p className="text-sm text-[#667085]">{t.noProviders}</p>}
        {providers.status === "ready" && providers.data.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t.provider}>
              <select className={input} value={providerId} disabled={locked} onChange={(e) => selectProvider(e.target.value)}>
                <option value="">{t.providerChoose}</option>
                {providers.data.map((p) => <option key={p.provider_id} value={p.provider_id}>{providerLabel(p)}</option>)}
              </select>
            </Field>
            {providerId && branches.status === "ready" && branches.data.length > 1 && (
              <Field label={t.branch}>
                <select className={input} value={branchId} disabled={locked} onChange={(e) => selectBranch(e.target.value)}>
                  <option value="">{t.branchChoose}</option>
                  {branches.data.map((b) => <option key={b.id} value={b.id}>{pick(b.name_en, b.name_ar) || [b.city, b.district].filter(Boolean).join(" - ")}</option>)}
                </select>
              </Field>
            )}
            <Field label={t.date}>
              <input type="date" className={input} value={date} min={riyadhToday()} disabled={locked} onChange={(e) => { setDate(e.target.value); edited(); }} />
            </Field>
            <Field label={t.occasionLabel}>
              <select className={input} value={occasion} disabled={locked} onChange={(e) => { setOccasion(e.target.value as Occasion); edited(); }}>
                {OCCASIONS.map((o) => <option key={o} value={o}>{t.occasion[o]}</option>)}
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field label={t.notes}>
                <textarea className={input} rows={2} maxLength={NOTES_MAX_LENGTH} value={notes} disabled={locked} onChange={(e) => { setNotes(e.target.value); edited(); }} />
              </Field>
              <p className="mt-1 text-xs text-[#667085]">{t.notesHelp}</p>
            </div>
          </div>
        )}
        {branches.status === "error" && <p role="alert" className="mt-3 text-sm text-red-800">{t.providersFailed}</p>}
      </div>

      {providerId && branchId && (
        <div className={card}>
          <h2 className="font-serif text-xl font-bold">{t.guestsTitle}</h2>
          <p className="mb-4 mt-1 text-sm text-[#667085]">{t.guestLimit(maxGuests)}</p>
          {catalogue.status === "loading" && <p role="status" className="text-sm text-[#667085]">{t.servicesLoading}</p>}
          {catalogue.status === "error" && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{t.servicesFailed}</p>}
          {catalogue.status === "ready" && catalogue.data.services.length === 0 && <p className="text-sm text-[#667085]">{t.noServices}</p>}
          {catalogue.status === "ready" && catalogue.data.services.length > 0 && (
            <div className="space-y-4">
              {guests.map((g, index) => {
                const available = servicesFor(g.employeeId);
                return (
                  <fieldset key={g.uid} disabled={locked} className="rounded-2xl border border-[#E8DDC0] bg-[#FBF8EF] p-4">
                    <legend className="px-2 text-sm font-bold">{t.guestN(index + 1)}</legend>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label={t.guestName}>
                        <input className={input} maxLength={GUEST_LABEL_MAX_LENGTH} value={g.label} onChange={(e) => patchGuest(g.uid, { label: e.target.value })} />
                      </Field>
                      {profiles.length > 0 && (
                        <Field label={t.guestProfile}>
                          <select className={input} value={g.profileId} onChange={(e) => patchGuest(g.uid, { profileId: e.target.value })}>
                            <option value="">{t.guestProfileNone}</option>
                            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </Field>
                      )}
                      <Field label={t.professional}>
                        <select className={input} value={g.employeeId} onChange={(e) => changeEmployee(g, e.target.value)}>
                          <option value="">{t.anyProfessional}</option>
                          {catalogue.data.employees.map((e) => <option key={e.id} value={e.id}>{pick(e.name_en, e.name_ar)}</option>)}
                        </select>
                      </Field>
                      <div>
                        <Field label={t.preferredTime}>
                          <input type="time" className={input} value={g.time} onChange={(e) => patchGuest(g.uid, { time: e.target.value })} />
                        </Field>
                        <p className="mt-1 text-xs text-[#667085]">{t.preferredTimeHelp}</p>
                      </div>
                      <fieldset className="md:col-span-2">
                        <legend className="mb-2 text-xs font-semibold text-[#667085]">{t.services}</legend>
                        {available.length === 0 ? (
                          <p className="text-sm text-[#667085]">{t.noServicesFor}</p>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {available.map((s) => (
                              <label key={s.id} className="flex items-start gap-2 rounded-xl border border-[#E8DDC0] bg-white px-3 py-2 text-sm">
                                <input type="checkbox" className="mt-1" checked={g.serviceIds.includes(s.id)} onChange={() => toggleService(g, s.id)} />
                                <span>
                                  <span className="font-semibold">{pick(s.name_en, s.name_ar)}</span>
                                  <span className="block text-xs text-[#667085]">{sar(Number(s.base_price), locale)} · {s.base_duration_minutes} {locale === "ar" ? "دقيقة" : "min"}</span>
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </fieldset>
                    </div>
                    {guests.length > MIN_GROUP_SIZE && !locked && (
                      <button type="button" className={`${button} mt-3`} onClick={() => { setGuests((l) => l.filter((x) => x.uid !== g.uid)); edited(); }}>
                        {t.removeGuest(index + 1)}
                      </button>
                    )}
                  </fieldset>
                );
              })}
              {!locked && guests.length < maxGuests && (
                <button type="button" className={button} onClick={() => { setGuests((l) => [...l, newDraft()]); edited(); }}>{t.addGuest}</button>
              )}
            </div>
          )}

          {errors.length > 0 && (
            <ul role="alert" className="mt-4 list-disc space-y-1 rounded-xl border border-red-200 bg-red-50 p-4 ps-8 text-sm text-red-800">
              {errors.map((message) => <li key={message}>{message}</li>)}
            </ul>
          )}
          {serverError && stage === "edit" && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{serverError}</p>}
          {catalogue.status === "ready" && !locked && (
            <div className="mt-5">
              <button type="button" className={primaryButton} disabled={working} onClick={() => void check()}>{working && stage === "edit" ? t.checking : t.check}</button>
            </div>
          )}
        </div>
      )}

      {stage !== "edit" && preview && (
        <div className={card}>
          <h2 className="mb-4 font-serif text-xl font-bold">{t.reviewTitle}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-start text-sm">
              <caption className="sr-only">{t.reviewTitle}</caption>
              <thead>
                <tr className="text-xs text-[#667085]">
                  <th scope="col" className="py-2 pe-3 text-start">{t.colGuest}</th>
                  <th scope="col" className="py-2 pe-3 text-start">{t.colServices}</th>
                  <th scope="col" className="py-2 pe-3 text-start">{t.colProfessional}</th>
                  <th scope="col" className="py-2 pe-3 text-start">{t.colTime}</th>
                  <th scope="col" className="py-2 text-start">{t.colStatus}</th>
                </tr>
              </thead>
              <tbody>
                {preview.guests.map((p, i) => {
                  const draft = guests[i];
                  return (
                    <tr key={p.sequence} className="border-t border-[#EEE8D6] align-top">
                      <td className="py-3 pe-3 font-semibold">{draft ? guestName(draft) : p.label}</td>
                      <td className="py-3 pe-3">{draft?.serviceIds.map(serviceName).join(", ")}</td>
                      <td className="py-3 pe-3">{employeeName(p.employee_id) || "-"}</td>
                      <td className="py-3 pe-3">{p.scheduled_at ? operationsDate(p.scheduled_at, locale) : "-"}</td>
                      <td className="py-3">
                        {!p.available && <span className="font-semibold text-red-800">{t.noAvailability}</span>}
                        {p.available && p.matched_preference && <span className="font-semibold text-green-800">{t.available}</span>}
                        {p.available && !p.matched_preference && <span className="font-semibold text-amber-800">{t.preferredMoved}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {preview.can_create ? (
            <div className="mt-4 space-y-2 text-sm text-[#344054]">
              <p className="font-semibold">{t.subtotal}: {sar(preview.subtotal_sar, locale)}</p>
              <p>{preview.payment_hold_hours ? t.holdLong(preview.payment_hold_hours) : t.holdStandard(preview.standard_hold_minutes)}</p>
              {preview.requires_full_prepayment && <p>{t.fullPrepayment}</p>}
              <p>{t.allOrNothing}</p>
            </div>
          ) : (
            <p role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{t.fixGuests}</p>
          )}
          {serverError && stage === "review" && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{serverError}</p>}
          {stage === "review" && (
            <div className="mt-5 flex flex-wrap gap-3">
              {preview.can_create && <button type="button" className={primaryButton} disabled={working} onClick={() => void bookGroup()}>{working ? t.booking : t.confirm}</button>}
              <button type="button" className={button} disabled={working} onClick={() => { setStage("edit"); setPreview(null); }}>{t.editDetails}</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
