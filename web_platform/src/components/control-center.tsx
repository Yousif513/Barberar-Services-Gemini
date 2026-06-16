import Link from "next/link";
import type { ReactNode } from "react";

export type KpiItem = {
  label: string;
  value: string;
  change?: string;
  tone?: "green" | "gold" | "red" | "slate";
};

export function CommandHeader({
  eyebrow,
  title,
  subtitle,
  initials,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  actionLabel,
  actionHref,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  initials: string;
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  actionLabel: string;
  actionHref: string;
}) {
  return (
    <div className="flex flex-col items-stretch justify-between gap-5 rounded-[24px] border border-[#EAEAEA] bg-white p-5 shadow-[0_12px_30px_rgba(0,0,0,0.04)] xl:flex-row xl:items-center">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#D1AF47] to-[#E0C46A] text-xs font-black text-[#101828] shadow-[0_0_20px_rgba(209,175,71,0.18)]">
          {initials}
        </div>
        <div className="min-w-0">
          <span className="block text-[8px] font-black uppercase tracking-[0.2em] text-[#B8952E]">{eyebrow}</span>
          <h2 className="truncate font-serif text-lg font-black text-[#101828]">{title}</h2>
          <p className="mt-0.5 truncate text-[10px] font-semibold text-[#667085]">{subtitle}</p>
        </div>
      </div>

      <label className="flex w-full items-center gap-3 rounded-2xl border border-[#EAEAEA] bg-[#F7F7F5] px-4 py-2.5 transition focus-within:border-[#D1AF47]/50 xl:max-w-sm">
        <svg className="h-4 w-4 flex-shrink-0 text-[#667085]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="w-full border-none bg-transparent text-xs text-[#101828] outline-none placeholder:text-[#667085]/60"
        />
      </label>

      <div className="flex items-center justify-end gap-2">
        <Link href={actionHref} className="rounded-xl bg-[#D1AF47] px-5 py-2.5 text-xs font-black text-white shadow-md shadow-[#D1AF47]/10 transition hover:bg-[#E0C46A]">
          + {actionLabel}
        </Link>
        <button aria-label="Notifications" className="relative rounded-xl border border-[#EAEAEA] bg-white p-2.5 text-[#667085] transition hover:bg-[#F7F7F5]">
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#EF4444]" />
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function KpiStrip({ items }: { items: KpiItem[] }) {
  const tone = {
    green: "text-[#22C55E]",
    gold: "text-[#B8952E]",
    red: "text-[#EF4444]",
    slate: "text-[#667085]",
  };

  return (
    <div className="overflow-x-auto rounded-[24px] border border-[#EAEAEA] bg-white p-4 shadow-[0_12px_30px_rgba(0,0,0,0.04)]">
      <div className="flex min-w-max divide-x divide-[#EAEAEA] rtl:divide-x-reverse">
        {items.map((item) => (
          <div key={item.label} className="min-w-[155px] px-5 first:ps-1 last:pe-1">
            <span className="block text-[8px] font-black uppercase tracking-[0.16em] text-[#667085]">{item.label}</span>
            <div className="mt-1.5 flex items-baseline gap-2">
              <strong className="font-serif text-base font-black text-[#101828]">{item.value}</strong>
              {item.change && <span className={`text-[9px] font-black ${tone[item.tone ?? "green"]}`}>{item.change}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Panel({
  title,
  badge,
  children,
  footer,
  className = "",
}: {
  title: string;
  badge?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col rounded-[24px] border border-[#EAEAEA] bg-white p-6 shadow-[0_12px_30px_rgba(0,0,0,0.06)] ${className}`}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h3 className="font-serif text-base font-black text-[#101828]">{title}</h3>
        {badge && <span className="rounded-full border border-[#D1AF47]/20 bg-[#F4E7B6]/40 px-2.5 py-1 text-[8px] font-black uppercase tracking-wider text-[#B8952E]">{badge}</span>}
      </div>
      <div className="flex-1">{children}</div>
      {footer && <div className="mt-5 border-t border-[#EAEAEA] pt-3 text-[10px] font-semibold text-[#667085]">{footer}</div>}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "gold",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "gold" | "green" | "red" | "blue";
}) {
  const styles = {
    gold: "bg-[#F4E7B6]/30 text-[#B8952E]",
    green: "bg-[#22C55E]/10 text-[#22C55E]",
    red: "bg-[#EF4444]/10 text-[#EF4444]",
    blue: "bg-[#3B82F6]/10 text-[#3B82F6]",
  };

  return (
    <div className="rounded-2xl border border-[#EAEAEA] bg-[#F7F7F5] p-4">
      <span className="block text-[8px] font-black uppercase tracking-wider text-[#667085]">{label}</span>
      <strong className="mt-2 block font-serif text-xl font-black text-[#101828]">{value}</strong>
      <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[8px] font-black ${styles[tone]}`}>{detail}</span>
    </div>
  );
}

export function BarChart({ values, labels }: { values: number[]; labels: string[] }) {
  return (
    <div className="flex h-44 items-end gap-2 rounded-2xl border border-[#EAEAEA] bg-[#F7F7F5] px-4 pb-3 pt-6">
      {values.map((value, index) => (
        <div key={`${labels[index]}-${index}`} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
          <div className="w-full max-w-8 rounded-t-lg bg-gradient-to-t from-[#D1AF47] to-[#E0C46A] transition-all hover:opacity-80" style={{ height: `${value}%` }} />
          <span className="text-[8px] font-bold text-[#667085]">{labels[index]}</span>
        </div>
      ))}
    </div>
  );
}

export function ProgressRow({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold">
        <span className="text-[#101828]">{label}</span>
        <span className="text-[#667085]">{detail}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#E8E8E8]">
        <div className="h-full rounded-full bg-gradient-to-r from-[#D1AF47] to-[#E0C46A]" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
