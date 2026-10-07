"use client";

import React, { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { DialogError, ProviderDialog, providerGhostButton, providerPrimaryButton } from "./dialog";

type Lang = "en" | "ar";

export type DayKey = "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
export const DAY_KEYS: DayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
export type DayHours = { open: string; close: string; isClosed: boolean };
export type WeeklyHours = Record<DayKey, DayHours>;
export type StaffRow = { day_of_week: number; start_time: string; end_time: string; is_working_day: boolean | null };
export type StaffHours = { id: string; name: string; rows: StaffRow[] };

const hhmm = (value: string) => String(value || "").slice(0, 5);

// A closing time at or before the opening time on the same row means the shift runs past midnight (21:00 to 02:00).
export const isOvernight = (day: DayHours) => !day.isClosed && day.open !== "" && day.close !== "" && day.close < day.open;

export type StaffKind = "none" | "same" | "custom";

// "same": every weekday already matches the hours the form was loaded with, so applying the new hours replaces nothing
// the professional set for themselves. "custom": at least one day differs, i.e. they have their own schedule.
export function classifyStaff(staff: StaffHours, loaded: WeeklyHours): StaffKind {
  if (staff.rows.length === 0) return "none";
  const matches = DAY_KEYS.every((key, dow) => {
    const row = staff.rows.find((item) => item.day_of_week === dow);
    const template = loaded[key];
    const working = Boolean(row && row.is_working_day !== false);
    if (template.isClosed) return !working;
    return working && hhmm(row!.start_time) === template.open && hhmm(row!.end_time) === template.close;
  });
  return matches ? "same" : "custom";
}

const copy = {
  en: {
    title: "Apply these hours to your team",
    intro: "Opening hours are stored per professional. Choose who gets the new weekly hours. People who set their own schedule are left unticked so their shifts are not overwritten.",
    none: "No schedule yet: will get the new hours",
    same: "Same as the old hours: will be updated",
    custom: "Has their own schedule: left as it is unless you tick them",
    willChange: "{n} will change",
    keep: "{n} keep their current schedule",
    nobody: "Nobody is selected, so no schedule will change.",
    apply: "Apply to selected",
    applying: "Applying…",
    cancel: "Cancel",
    failed: "The hours were not applied: ",
    applied: "Weekly hours applied to {n} professionals.",
    overnight: "Overnight: runs past midnight",
    summary: "New weekly hours",
    closed: "Closed",
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  },
  ar: {
    title: "تطبيق هذه الساعات على فريقك",
    intro: "تُحفظ ساعات العمل لكل أخصائي على حدة. اختر من يحصل على الساعات الأسبوعية الجديدة. من وضع جدولاً خاصاً به يبقى غير محدد حتى لا تُستبدل مناوباته.",
    none: "لا جدول بعد: سيحصل على الساعات الجديدة",
    same: "مطابق للساعات القديمة: سيتم تحديثه",
    custom: "لديه جدول خاص: يبقى كما هو ما لم تحدده",
    willChange: "سيتغير جدول {n}",
    keep: "يحتفظ {n} بجدولهم الحالي",
    nobody: "لم يُحدد أحد، لذلك لن يتغير أي جدول.",
    apply: "تطبيق على المحددين",
    applying: "جارٍ التطبيق…",
    cancel: "إلغاء",
    failed: "لم تُطبق الساعات: ",
    applied: "تم تطبيق الساعات الأسبوعية على {n} من الأخصائيين.",
    overnight: "وردية ليلية: تمتد بعد منتصف الليل",
    summary: "الساعات الأسبوعية الجديدة",
    closed: "مغلق",
    days: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  },
};

export function HoursApplyDialog({ lang, hours, loaded, staff, onClose, onApplied }: {
  lang: Lang; hours: WeeklyHours; loaded: WeeklyHours; staff: StaffHours[]; onClose: () => void; onApplied: (message: string) => void;
}) {
  const t = copy[lang];
  const kinds = useMemo(() => Object.fromEntries(staff.map((member) => [member.id, classifyStaff(member, loaded)])) as Record<string, StaffKind>, [staff, loaded]);
  const [selected, setSelected] = useState<Record<string, boolean>>(() => Object.fromEntries(staff.map((member) => [member.id, kinds[member.id] !== "custom"])));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const chosen = staff.filter((member) => selected[member.id]);

  const apply = async () => {
    if (busy || chosen.length === 0) return;
    setBusy(true);
    setFailure("");
    const rows = chosen.flatMap((member) => DAY_KEYS.flatMap((key, dow) => {
      const day = hours[key];
      if (day.isClosed) {
        // A closed day keeps the professional's old times and is switched off; with no old row there is nothing to switch off.
        const old = member.rows.find((row) => row.day_of_week === dow);
        return old ? [{ employee_id: member.id, day_of_week: dow, start_time: hhmm(old.start_time), end_time: hhmm(old.end_time), is_working_day: false }] : [];
      }
      return [{ employee_id: member.id, day_of_week: dow, start_time: day.open, end_time: day.close, is_working_day: true }];
    }));
    const { error } = await supabase.from("employee_availability").upsert(rows, { onConflict: "employee_id,day_of_week" });
    setBusy(false);
    if (error) { setFailure(t.failed + errorMessage(error)); return; }
    onApplied(t.applied.replace("{n}", String(chosen.length)));
    onClose();
  };

  return (
    <ProviderDialog label={t.title} onClose={onClose} canClose={!busy} wide>
      <h2 className="font-serif text-xl font-black text-[#101828]">{t.title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#475467]">{t.intro}</p>

      <div className="mt-4 rounded-xl border border-[#ECECEC] bg-[#F9F7F1] p-3 text-xs text-[#344054]">
        <p className="font-black">{t.summary}</p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {DAY_KEYS.map((key, dow) => (
            <li key={key} className="flex justify-between gap-3">
              <span className="font-semibold">{t.days[dow]}</span>
              <span dir="ltr" className="font-mono">
                {hours[key].isClosed ? t.closed : `${hours[key].open} - ${hours[key].close}`}
                {isOvernight(hours[key]) ? ` (${t.overnight})` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <fieldset className="mt-4">
        <legend className="text-xs font-black text-[#344054]">{t.apply}</legend>
        <ul className="mt-2 space-y-2">
          {staff.map((member) => (
            <li key={member.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#ECECEC] bg-white p-3 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#9B7928]" checked={Boolean(selected[member.id])} disabled={busy}
                  onChange={(event) => setSelected((current) => ({ ...current, [member.id]: event.target.checked }))} />
                <span className="min-w-0">
                  <span className="block font-bold text-[#101828]">{member.name}</span>
                  <span className="block text-xs text-[#667085]">{t[kinds[member.id]]}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <p className="mt-3 text-xs font-semibold text-[#344054]" role="status">
        {chosen.length === 0 ? t.nobody : `${t.willChange.replace("{n}", String(chosen.length))}${staff.length - chosen.length > 0 ? `; ${t.keep.replace("{n}", String(staff.length - chosen.length))}` : ""}`}
      </p>
      <DialogError message={failure} />
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} disabled={busy} className={providerGhostButton}>{t.cancel}</button>
        <button type="button" onClick={() => void apply()} disabled={busy || chosen.length === 0} className={providerPrimaryButton}>{busy ? t.applying : t.apply}</button>
      </div>
    </ProviderDialog>
  );
}
