"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { BarChart, CommandHeader, KpiStrip, MetricCard, Panel, ProgressRow } from "@/components/control-center";

type AuditItem = {
  id: string;
  business_name_en: string;
  type: string;
  created_at: string;
};

const fallbackAudits: AuditItem[] = [
  { id: "audit-1", business_name_en: "Jeddah Grooming Palace", type: "salon", created_at: new Date().toISOString() },
  { id: "audit-2", business_name_en: "Maha Stylist & Artist", type: "freelancer", created_at: new Date().toISOString() },
  { id: "audit-3", business_name_en: "Riyadh Wellness House", type: "salon", created_at: new Date().toISOString() },
];

export default function AdminDashboard() {
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingAudits, setPendingAudits] = useState<AuditItem[]>([]);
  const [stats, setStats] = useState({
    gmv: 425840,
    revenue: 63876,
    providers: 186,
    bookings: 9178,
    disputes: 3,
  });

  useEffect(() => {
    const syncLocale = () => setLocale(document.documentElement.lang === "ar" ? "ar" : "en");
    syncLocale();
    const observer = new MutationObserver(syncLocale);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    async function loadAdminData() {
      try {
        setLoading(true);
        const [{ data: providers }, { count: providerCount }, { count: bookingCount }, { count: disputeCount }] = await Promise.all([
          supabase.from("providers").select("id, business_name_en, type, created_at").eq("is_verified", false).order("created_at", { ascending: false }).limit(5),
          supabase.from("providers").select("id", { count: "exact", head: true }).eq("is_verified", true),
          supabase.from("bookings").select("id", { count: "exact", head: true }),
          supabase.from("disputes").select("id", { count: "exact", head: true }).in("status", ["open", "under_review"]),
        ]);

        if (providers?.length) setPendingAudits(providers);
        setStats((current) => ({
          ...current,
          providers: providerCount ?? current.providers,
          bookings: bookingCount ?? current.bookings,
          disputes: disputeCount ?? current.disputes,
        }));
      } catch (error) {
        console.warn("Using admin dashboard fallback data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadAdminData();
  }, []);

  const audits = pendingAudits.length ? pendingAudits : fallbackAudits;
  const isRTL = locale === "ar";

  return (
    <div className={`min-h-screen space-y-8 bg-[#F7F7F5] text-[#101828] ${isRTL ? "text-right" : "text-left"}`} dir={isRTL ? "rtl" : "ltr"}>
      <CommandHeader
        eyebrow="Primora marketplace command"
        title="Platform Operations Control Center"
        subtitle="Live marketplace performance, compliance, finance, and risk operations"
        initials="PA"
        searchPlaceholder="Search providers, bookings, transactions, or cases..."
        searchValue={search}
        onSearchChange={setSearch}
        actionLabel="Review Providers"
        actionHref="/admin/providers"
      />

      <KpiStrip items={[
        { label: "Captured GMV", value: `${stats.gmv.toLocaleString()} SAR`, change: "+12.4%", tone: "green" },
        { label: "Net Revenue", value: `${stats.revenue.toLocaleString()} SAR`, change: "+9.8%", tone: "green" },
        { label: "Total Bookings", value: stats.bookings.toLocaleString(), change: "+8.1%", tone: "green" },
        { label: "Verified Providers", value: stats.providers.toLocaleString(), change: "+14", tone: "green" },
        { label: "Pending Audits", value: String(audits.length), change: "Review", tone: "gold" },
        { label: "Open Disputes", value: String(stats.disputes), change: "Action", tone: "red" },
        { label: "Payout Success", value: "99.6%", change: "+0.2%", tone: "green" },
      ]} />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Marketplace Health" value="98.4%" detail="All core services operational" tone="green" />
        <MetricCard label="Risk Exposure" value="12,840 SAR" detail="3 cases require attention" tone="red" />
        <MetricCard label="Provider SLA" value="94.8%" detail="+2.1% this week" tone="blue" />
        <MetricCard label="Customer Trust" value="4.86 / 5" detail="18,442 verified reviews" tone="gold" />
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <Panel
          title="Marketplace Revenue Command"
          badge="Live settlement data"
          className="xl:col-span-7"
          footer={<div className="flex justify-between"><span>15% blended platform commission</span><Link href="/admin/ledger" className="font-black text-[#D1AF47]">Open financial ledger</Link></div>}
        >
          <BarChart values={[42, 58, 54, 68, 74, 66, 82, 92, 88, 96, 91, 100]} labels={["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"]} />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Today GMV", "24,820 SAR"], ["Settled", "21,640 SAR"], ["In Escrow", "3,180 SAR"], ["Refund Rate", "0.8%"]].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] p-3">
                <span className="block text-[8px] font-black uppercase text-[#667085]">{label}</span>
                <strong className="mt-1 block font-serif text-sm font-black">{value}</strong>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Live Operations Queue" badge="12 actions" className="xl:col-span-5" footer={<Link href="/admin/bookings" className="font-black text-[#D1AF47]">Open global scheduler</Link>}>
          <div className="space-y-3">
            {[
              { title: "High-value booking review", meta: "Booking #PR-10842 · 1,850 SAR", status: "Finance", tone: "bg-[#D1AF47]/10 text-[#B8952E]" },
              { title: "Provider verification pending", meta: "Jeddah Grooming Palace · 3 documents", status: "Compliance", tone: "bg-[#3B82F6]/10 text-[#3B82F6]" },
              { title: "Customer dispute escalated", meta: "Case #DS-2041 · 420 SAR escrow", status: "Risk", tone: "bg-[#EF4444]/10 text-[#EF4444]" },
              { title: "Payout batch ready", meta: "84 providers · 128,450 SAR", status: "Treasury", tone: "bg-[#22C55E]/10 text-[#22C55E]" },
            ].map((item) => (
              <div key={item.title} className="flex items-center justify-between gap-3 rounded-2xl border border-[#EAEAEA] bg-[#F7F7F5] p-4 transition hover:border-[#D1AF47]/30">
                <div className="min-w-0">
                  <strong className="block truncate font-serif text-sm font-black">{item.title}</strong>
                  <span className="mt-1 block truncate text-[9px] font-semibold text-[#667085]">{item.meta}</span>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2 py-1 text-[8px] font-black ${item.tone}`}>{item.status}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
        <Panel title="Verification Intelligence" badge={`${audits.length} pending`} footer={<Link href="/admin/providers" className="font-black text-[#D1AF47]">Open audit center</Link>}>
          <div className="space-y-3">
            {audits.slice(0, 4).map((audit) => (
              <div key={audit.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#EAEAEA] bg-[#F7F7F5] p-3">
                <div className="min-w-0">
                  <strong className="block truncate font-serif text-sm font-black">{audit.business_name_en}</strong>
                  <span className="mt-1 block text-[8px] font-black uppercase tracking-wider text-[#667085]">{audit.type} · {new Date(audit.created_at).toLocaleDateString()}</span>
                </div>
                <Link href="/admin/providers" className="rounded-lg bg-[#D1AF47] px-3 py-2 text-[8px] font-black text-white">AUDIT</Link>
              </div>
            ))}
            {loading && <p className="py-2 text-center text-[9px] font-semibold text-[#667085]">Synchronizing provider queue...</p>}
          </div>
        </Panel>

        <Panel title="Trust & Risk Center" badge="Controlled" footer={<Link href="/admin/disputes" className="font-black text-[#D1AF47]">Open dispute center</Link>}>
          <div className="space-y-5">
            <ProgressRow label="Identity verification coverage" value={96} detail="96.2%" />
            <ProgressRow label="Provider document freshness" value={88} detail="88.4%" />
            <ProgressRow label="Booking fraud controls" value={99} detail="99.1%" />
            <ProgressRow label="Dispute resolution SLA" value={82} detail="82.0%" />
            <div className="grid grid-cols-3 gap-2">
              {[["Flagged", "8"], ["Escalated", "3"], ["Resolved", "42"]].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] p-3 text-center">
                  <span className="text-[8px] font-black uppercase text-[#667085]">{label}</span>
                  <strong className="mt-1 block font-serif text-base font-black">{value}</strong>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Regional Marketplace Matrix" badge="KSA coverage" footer="Regional demand forecast refreshes every 30 minutes">
          <div className="space-y-3">
            {[
              { city: "Riyadh", providers: 82, bookings: "4,280", health: 96 },
              { city: "Jeddah", providers: 54, bookings: "2,940", health: 91 },
              { city: "Dammam", providers: 31, bookings: "1,426", health: 87 },
              { city: "Madinah", providers: 19, bookings: "532", health: 78 },
            ].map((region) => (
              <div key={region.city} className="rounded-2xl border border-[#EAEAEA] bg-[#F7F7F5] p-3.5">
                <div className="flex items-center justify-between">
                  <strong className="font-serif text-sm font-black">{region.city}</strong>
                  <span className="text-[9px] font-black text-[#D1AF47]">{region.health}% health</span>
                </div>
                <div className="mt-2 flex justify-between text-[8px] font-bold text-[#667085]">
                  <span>{region.providers} providers</span><span>{region.bookings} bookings</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E8E8E8]"><div className="h-full rounded-full bg-[#D1AF47]" style={{ width: `${region.health}%` }} /></div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <Panel title="Global Booking Dispatch" badge="Live marketplace" className="xl:col-span-8" footer={<Link href="/admin/bookings" className="font-black text-[#D1AF47]">View all platform bookings</Link>}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs rtl:text-right">
              <thead><tr className="border-b border-[#EAEAEA] text-[8px] font-black uppercase tracking-wider text-[#667085]"><th className="px-3 py-3">Booking</th><th className="px-3 py-3">Provider</th><th className="px-3 py-3">Region</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Value</th></tr></thead>
              <tbody className="divide-y divide-[#EAEAEA]">
                {[
                  ["#PR-10842", "Elite Salon", "Riyadh", "IN SERVICE", "1,850 SAR"],
                  ["#PR-10841", "Noura Nails", "Jeddah", "CONFIRMED", "320 SAR"],
                  ["#PR-10840", "Salman Hair", "Riyadh", "EN ROUTE", "245 SAR"],
                  ["#PR-10839", "Maha Artist", "Dammam", "COMPLETED", "480 SAR"],
                ].map((row) => (
                  <tr key={row[0]} className="transition hover:bg-[#F7F7F5]">
                    <td className="px-3 py-4 font-black text-[#D1AF47]">{row[0]}</td>
                    <td className="px-3 py-4 font-serif font-black">{row[1]}</td>
                    <td className="px-3 py-4 font-semibold text-[#667085]">{row[2]}</td>
                    <td className="px-3 py-4"><span className="rounded-full border border-[#22C55E]/20 bg-[#22C55E]/10 px-2 py-1 text-[8px] font-black text-[#22C55E]">{row[3]}</span></td>
                    <td className="px-3 py-4 font-black">{row[4]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Quick Operations" badge="Admin tools" className="xl:col-span-4" footer="All admin actions are written to the immutable audit log">
          <div className="space-y-3">
            {[
              ["/admin/disputes", "Arbitrate disputes", "Review escalations and refund appeals"],
              ["/admin/ledger", "Release payout batch", "Audit splits and provider settlements"],
              ["/admin/providers", "Verify providers", "Review documents and marketplace readiness"],
              ["/admin/bookings", "Inspect scheduler", "Monitor active bookings across KSA"],
            ].map(([href, title, detail]) => (
              <Link key={href} href={href} className="flex items-center justify-between gap-3 rounded-2xl border border-[#EAEAEA] bg-[#F7F7F5] p-4 transition hover:border-[#D1AF47]/40">
                <div>
                  <strong className="block font-serif text-sm font-black">{title}</strong>
                  <span className="mt-1 block text-[9px] font-semibold text-[#667085]">{detail}</span>
                </div>
                <span className="text-sm font-black text-[#D1AF47]">→</span>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
