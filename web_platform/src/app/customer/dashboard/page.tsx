"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { BarChart, CommandHeader, KpiStrip, MetricCard, Panel, ProgressRow } from "@/components/control-center";

type BookingItem = {
  id: string;
  date: string;
  time: string;
  provider: string;
  service: string;
  status: string;
  price: number;
};

type Recommendation = {
  id: string;
  name: string;
  type: string;
  image: string;
  rating: string;
};

type BookingBranch = {
  providers?: { business_name_en?: string | null } | null;
};

type BookingService = {
  name_en?: string | null;
};

const fallbackBookings: BookingItem[] = [
  { id: "sample-1", date: "Tomorrow", time: "5:00 PM", provider: "Elite Salon", service: "Royal Massage & Moroccan Bath", status: "CONFIRMED", price: 320 },
  { id: "sample-2", date: "12 May 2026", time: "7:15 PM", provider: "Ahmed Barber", service: "Haircut + Beard", status: "COMPLETED", price: 145 },
  { id: "sample-3", date: "05 May 2026", time: "4:30 PM", provider: "Sara Hair", service: "Hair Coloring", status: "COMPLETED", price: 420 },
  { id: "sample-4", date: "28 Apr 2026", time: "6:00 PM", provider: "Leen Makeup", service: "Event Makeup", status: "COMPLETED", price: 280 },
];

const fallbackRecommendations: Recommendation[] = [
  { id: "rec-1", name: "Leen Makeup", type: "Makeup Artist", rating: "4.9", image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop" },
  { id: "rec-2", name: "Salman Hair", type: "Hair Stylist", rating: "4.8", image: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=200&auto=format&fit=crop" },
  { id: "rec-3", name: "Noura Nails", type: "Nail Artist", rating: "4.9", image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop" },
];

export default function CustomerDashboard() {
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const [search, setSearch] = useState("");
  const [userName, setUserName] = useState("Yousif");
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const syncLocale = () => setLocale(document.documentElement.lang === "ar" ? "ar" : "en");
    syncLocale();
    const observer = new MutationObserver(syncLocale);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [{ data: profile }, { data: bookingRows }, { data: providerRows }] = await Promise.all([
          supabase.from("profiles").select("first_name").eq("id", user.id).maybeSingle(),
          supabase
            .from("bookings")
            .select("id, scheduled_at, status, total_price, services(name_en), branches(providers(business_name_en))")
            .eq("customer_id", user.id)
            .order("scheduled_at", { ascending: false })
            .limit(8),
          supabase
            .from("providers")
            .select("id, business_name_en, type, logo_url")
            .eq("is_verified", true)
            .limit(3),
        ]);

        if (profile?.first_name) setUserName(profile.first_name);
        if (bookingRows?.length) {
          setBookings(bookingRows.map((booking) => {
            const scheduled = new Date(booking.scheduled_at);
            return {
              id: booking.id,
              date: scheduled.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
              time: scheduled.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
              provider: (booking.branches as unknown as BookingBranch | null)?.providers?.business_name_en ?? "Primora Provider",
              service: (booking.services as unknown as BookingService | null)?.name_en ?? "Beauty Service",
              status: booking.status.replaceAll("_", " ").toUpperCase(),
              price: Number(booking.total_price ?? 0),
            };
          }));
        }
        if (providerRows?.length) {
          setRecommendations(providerRows.map((provider, index) => ({
            id: provider.id,
            name: provider.business_name_en,
            type: provider.type === "freelancer" ? "Independent Specialist" : "Premium Salon",
            rating: (4.7 + index * 0.1).toFixed(1),
            image: provider.logo_url || fallbackRecommendations[index]?.image || fallbackRecommendations[0].image,
          })));
        }
      } catch (error) {
        console.warn("Using customer dashboard fallback data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const bookingList = bookings.length ? bookings : fallbackBookings;
  const recommendationList = recommendations.length ? recommendations : fallbackRecommendations;
  const upcoming = bookingList.find((booking) => booking.status === "CONFIRMED" || booking.status === "PENDING PAYMENT") ?? bookingList[0];
  const completed = bookingList.filter((booking) => booking.status === "COMPLETED").length;
  const totalSpent = useMemo(() => bookingList.reduce((sum, booking) => sum + booking.price, 0), [bookingList]);
  const isRTL = locale === "ar";

  return (
    <div className={`min-h-screen space-y-8 bg-[#F7F7F5] text-[#101828] ${isRTL ? "text-right" : "text-left"}`} dir={isRTL ? "rtl" : "ltr"}>
      <CommandHeader
        eyebrow="Customer care command center"
        title={`Good morning, ${userName}`}
        subtitle="Your appointments, rewards, and preferred specialists in one place"
        initials={userName.slice(0, 2).toUpperCase()}
        searchPlaceholder="Search services, salons, or specialists..."
        searchValue={search}
        onSearchChange={setSearch}
        actionLabel="Book Service"
        actionHref="/customer/book"
      />

      <KpiStrip items={[
        { label: "Next Appointment", value: upcoming.date, change: upcoming.time, tone: "gold" },
        { label: "Completed Visits", value: String(completed || 3), change: "+2 this month", tone: "green" },
        { label: "Primora Points", value: "2,480", change: "+320", tone: "green" },
        { label: "Wallet Balance", value: "185 SAR", change: "Ready", tone: "gold" },
        { label: "Active Packages", value: "2", change: "8 sessions", tone: "slate" },
        { label: "Lifetime Spend", value: `${totalSpent.toLocaleString()} SAR`, change: "Gold tier", tone: "gold" },
      ]} />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Care Status" value="Gold Member" detail="680 points to Platinum" tone="gold" />
        <MetricCard label="Upcoming Visits" value="2" detail="Next visit tomorrow" tone="green" />
        <MetricCard label="Saved Providers" value="8" detail="3 recently active" tone="blue" />
        <MetricCard label="Rewards Expiring" value="120 pts" detail="Use before 30 Jun" tone="red" />
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <Panel
          title="Upcoming Appointment"
          badge={loading ? "Syncing" : "Confirmed"}
          className="xl:col-span-7"
          footer={<div className="flex justify-between"><span>Reminder scheduled 2 hours before visit</span><Link href="/customer/bookings" className="font-black text-[#D1AF47]">Manage booking</Link></div>}
        >
          <div className="rounded-2xl border border-[#EAEAEA] bg-[#F7F7F5] p-5">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[#B8952E]">Next in your care plan</span>
                <h4 className="mt-2 font-serif text-xl font-black text-[#101828]">{upcoming.provider}</h4>
                <p className="mt-1 text-xs font-semibold text-[#667085]">{upcoming.service}</p>
              </div>
              <div className="rounded-2xl border border-[#D1AF47]/20 bg-white px-5 py-4 text-center shadow-sm">
                <span className="block text-[9px] font-black uppercase text-[#667085]">{upcoming.date}</span>
                <strong className="mt-1 block font-serif text-xl font-black text-[#D1AF47]">{upcoming.time}</strong>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[["Status", upcoming.status], ["Price", `${upcoming.price} SAR`], ["Arrival", "10 min early"], ["Payment", "Wallet + Card"]].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-[#EAEAEA] bg-white p-3">
                  <span className="block text-[8px] font-black uppercase text-[#667085]">{label}</span>
                  <span className="mt-1 block text-[10px] font-black text-[#101828]">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Care Journey" badge="This year" className="xl:col-span-5" footer="Your consistency score improved 12% this month">
          <BarChart values={[35, 52, 42, 68, 57, 82, 74, 90]} labels={["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"]} />
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[["Visits", "18"], ["Avg. Ticket", "214 SAR"], ["Rating Given", "4.9"]].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] p-3 text-center">
                <span className="block text-[8px] font-black uppercase text-[#667085]">{label}</span>
                <strong className="mt-1 block font-serif text-sm font-black">{value}</strong>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
        <Panel title="Reward Intelligence" badge="Gold tier" footer={<Link href="/customer/wallet" className="font-black text-[#D1AF47]">Open wallet and rewards</Link>}>
          <div className="space-y-5">
            <ProgressRow label="Platinum progress" value={72} detail="2,480 / 3,400 pts" />
            <ProgressRow label="Monthly care goal" value={64} detail="3 / 5 services" />
            <ProgressRow label="Referral rewards" value={40} detail="2 / 5 friends" />
            <div className="rounded-2xl bg-[#101828] p-4 text-white">
              <span className="text-[8px] font-black uppercase tracking-wider text-[#D1AF47]">Smart recommendation</span>
              <p className="mt-2 text-[10px] font-semibold leading-5 text-[#B8C0D4]">Book one wellness service this week to unlock a 75 SAR package credit.</p>
            </div>
          </div>
        </Panel>

        <Panel title="Recommended Specialists" badge="For you" footer={<Link href="/customer/search" className="font-black text-[#D1AF47]">Explore all providers</Link>}>
          <div className="space-y-3">
            {recommendationList.map((provider) => (
              <div key={provider.id} className="flex items-center justify-between rounded-2xl border border-[#EAEAEA] bg-[#F7F7F5] p-3 transition hover:border-[#D1AF47]/40">
                <div className="flex min-w-0 items-center gap-3">
                  <Image src={provider.image} alt="" width={44} height={44} unoptimized className="h-11 w-11 flex-shrink-0 rounded-xl object-cover" />
                  <div className="min-w-0">
                    <strong className="block truncate font-serif text-sm font-black">{provider.name}</strong>
                    <span className="mt-0.5 block truncate text-[9px] font-semibold text-[#667085]">{provider.type}</span>
                  </div>
                </div>
                <span className="rounded-full bg-[#F4E7B6]/60 px-2 py-1 text-[9px] font-black text-[#B8952E]">{provider.rating} / 5</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Packages & Dependents" badge="Family care" footer={<Link href="/customer/packages" className="font-black text-[#D1AF47]">Manage packages</Link>}>
          <div className="space-y-3">
            {[
              { name: "Royal Grooming Pack", detail: "4 of 6 sessions remaining", value: 66 },
              { name: "Monthly Wellness", detail: "4 of 8 sessions remaining", value: 50 },
            ].map((pack) => (
              <div key={pack.name} className="rounded-2xl border border-[#EAEAEA] bg-[#F7F7F5] p-4">
                <div className="flex justify-between gap-3">
                  <strong className="font-serif text-sm font-black">{pack.name}</strong>
                  <span className="text-[9px] font-black text-[#D1AF47]">{pack.value}%</span>
                </div>
                <p className="mt-1 text-[9px] font-semibold text-[#667085]">{pack.detail}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#E8E8E8]"><div className="h-full rounded-full bg-[#D1AF47]" style={{ width: `${pack.value}%` }} /></div>
              </div>
            ))}
            <Link href="/customer/dependents" className="block rounded-2xl border border-dashed border-[#D1AF47]/40 p-4 text-center text-[10px] font-black text-[#B8952E]">Manage family & dependents</Link>
          </div>
        </Panel>
      </div>

      <Panel title="Recent Booking Activity" badge="Live history" footer={<div className="flex justify-between"><span>All transactions are protected by Primora payment controls</span><Link href="/customer/bookings" className="font-black text-[#D1AF47]">View all bookings</Link></div>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs rtl:text-right">
            <thead><tr className="border-b border-[#EAEAEA] text-[8px] font-black uppercase tracking-wider text-[#667085]"><th className="px-3 py-3">Date</th><th className="px-3 py-3">Provider</th><th className="px-3 py-3">Service</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Value</th></tr></thead>
            <tbody className="divide-y divide-[#EAEAEA]">
              {bookingList.slice(0, 5).map((booking) => (
                <tr key={booking.id} className="transition hover:bg-[#F7F7F5]">
                  <td className="px-3 py-4 font-semibold text-[#667085]">{booking.date} · {booking.time}</td>
                  <td className="px-3 py-4 font-serif font-black">{booking.provider}</td>
                  <td className="px-3 py-4 font-semibold text-[#667085]">{booking.service}</td>
                  <td className="px-3 py-4"><span className="rounded-full border border-[#22C55E]/20 bg-[#22C55E]/10 px-2 py-1 text-[8px] font-black text-[#22C55E]">{booking.status}</span></td>
                  <td className="px-3 py-4 font-black">{booking.price} SAR</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
