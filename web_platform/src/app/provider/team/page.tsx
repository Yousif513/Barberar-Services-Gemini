"use client";

import React, { useState, useEffect } from "react";

const translations = {
  en: {
    teamTitle: "Team & Staff Roster",
    subtitle: "Manage your beauty specialists, assign services, and edit weekly availability",
    addStaff: "+ Add Staff",
    stylist: "Stylist",
    title: "Title / Role",
    status: "Status",
    assignedServices: "Assigned Services",
    weeklyAvailability: "Weekly Availability",
    actions: "Actions",
    active: "Active",
    inactive: "Inactive",
    onBreak: "On Break",
    editShifts: "Edit Shifts",
    editServices: "Edit Services",
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
    totalStaff: "Total Specialists",
    activeStaff: "Active Duty",
    breakStaff: "On Break"
  },
  ar: {
    teamTitle: "فريق العمل والموظفين",
    subtitle: "إدارة أخصائيي التجميل وتعيين الخدمات وتعديل المناوبات الأسبوعية",
    addStaff: "+ إضافة موظف",
    stylist: "الموظف",
    title: "المسمى الوظيفي / الدور",
    status: "الحالة",
    assignedServices: "الخدمات المعينة",
    weeklyAvailability: "الدوام الأسبوعي",
    actions: "الإجراءات",
    active: "نشط",
    inactive: "غير نشط",
    onBreak: "في استراحة",
    editShifts: "تعديل المناوبات",
    editServices: "تعديل الخدمات",
    monday: "الاثنين",
    tuesday: "الثلاثاء",
    wednesday: "الأربعاء",
    thursday: "الخميس",
    friday: "الجمعة",
    saturday: "السبت",
    sunday: "الأحد",
    totalStaff: "إجمالي الأخصائيين",
    activeStaff: "على رأس العمل",
    breakStaff: "في استراحة"
  }
};

export default function ProviderTeamPage() {
  const [lang, setLang] = useState<"en" | "ar">("ar");

  useEffect(() => {
    const checkLang = () => {
      const currentLang = document.documentElement.lang as "en" | "ar";
      if (currentLang && currentLang !== lang) {
        setLang(currentLang);
      }
    };
    checkLang();
    const observer = new MutationObserver(checkLang);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, [lang]);

  const t = translations[lang];

  // Mock staff list
  const staffMembers = [
    {
      id: "1",
      name: "Ali Al-Harbi",
      title: lang === "ar" ? "أخصائي حلاقة شعر ورأس" : "Master Barber & Beard Stylist",
      status: "active",
      statusLabel: t.active,
      statusColor: "text-[hsl(150,60%,40%)] bg-[hsla(150,60%,40%,0.08)]",
      servicesCount: 6,
      avatar: "A",
      availability: lang === "ar" ? "السبت - الخميس (09:00 ص - 09:00 م)" : "Sat - Thu (09:00 AM - 09:00 PM)"
    },
    {
      id: "2",
      name: "Elena Rostova",
      title: lang === "ar" ? "أخصائية تسريح وصبغ الشعر" : "Senior Hair Stylist & Color Specialist",
      status: "break",
      statusLabel: t.onBreak,
      statusColor: "text-[hsl(45,60%,55%)] bg-[hsla(45,60%,55%,0.08)]",
      servicesCount: 8,
      avatar: "E",
      availability: lang === "ar" ? "السبت - الخميس (10:00 ص - 08:00 م)" : "Sat - Thu (10:00 AM - 08:00 PM)"
    },
    {
      id: "3",
      name: "Tariq Mahmood",
      title: lang === "ar" ? "مصفف شعر أطفال" : "Junior Groomer & Kids Barber",
      status: "active",
      statusLabel: t.active,
      statusColor: "text-[hsl(150,60%,40%)] bg-[hsla(150,60%,40%,0.08)]",
      servicesCount: 4,
      avatar: "T",
      availability: lang === "ar" ? "السبت - الخميس (01:00 م - 09:00 م)" : "Sat - Thu (01:00 PM - 09:00 PM)"
    }
  ];

  return (
    <div className="space-y-8 text-start">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 pb-2">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#D1AF47] via-[#E0C46A] to-[#B8952E] bg-clip-text text-transparent">
            {t.teamTitle}
          </h2>
          <p className="text-sm text-[#B8C0D4] mt-2 max-w-xl leading-relaxed">
            {t.subtitle}
          </p>
        </div>
        <button className="inline-flex items-center justify-center px-6 py-3 bg-[#D1AF47] hover:bg-[#E0C46A] active:scale-[0.98] text-[#070B12] font-bold text-sm rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(209,175,71,0.2)] hover:shadow-[0_0_25px_rgba(209,175,71,0.35)] self-start">
          <svg className="w-4 h-4 me-2" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t.addStaff}
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* Total Specialists Card */}
        <div className="group relative rounded-[24px] bg-gradient-to-b from-[#111827] to-[#0D1422] border border-[rgba(255,255,255,0.06)] hover:border-[#D1AF47]/20 p-6 flex items-center justify-between transition-all duration-300 shadow-xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#D1AF47]/[0.02] to-transparent pointer-events-none" />
          <div className="space-y-1 z-10">
            <span className="text-[10px] text-[#7B859C] font-bold tracking-wider uppercase">{t.totalStaff}</span>
            <div className="text-3xl font-black text-white">{staffMembers.length}</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#D1AF47]/10 to-[#B8952E]/5 border border-[#D1AF47]/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 z-10">
            <svg className="w-6 h-6 text-[#D1AF47]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
        </div>

        {/* Active Duty Card */}
        <div className="group relative rounded-[24px] bg-gradient-to-b from-[#111827] to-[#0D1422] border border-[rgba(255,255,255,0.06)] hover:border-[#3DDC84]/20 p-6 flex items-center justify-between transition-all duration-300 shadow-xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#3DDC84]/[0.01] to-transparent pointer-events-none" />
          <div className="space-y-1 z-10">
            <span className="text-[10px] text-[#7B859C] font-bold tracking-wider uppercase">{t.activeStaff}</span>
            <div className="text-3xl font-black text-[#3DDC84] flex items-center gap-2">
              {staffMembers.filter(m => m.status === 'active').length}
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3DDC84] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#3DDC84]"></span>
              </span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#3DDC84]/15 to-[#3DDC84]/5 border border-[#3DDC84]/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 z-10">
            <svg className="w-6 h-6 text-[#3DDC84]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* On Break Card */}
        <div className="group relative rounded-[24px] bg-gradient-to-b from-[#111827] to-[#0D1422] border border-[rgba(255,255,255,0.06)] hover:border-[#F5B041]/20 p-6 flex items-center justify-between transition-all duration-300 shadow-xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#F5B041]/[0.01] to-transparent pointer-events-none" />
          <div className="space-y-1 z-10">
            <span className="text-[10px] text-[#7B859C] font-bold tracking-wider uppercase">{t.breakStaff}</span>
            <div className="text-3xl font-black text-[#F5B041]">
              {staffMembers.filter(m => m.status === 'break').length}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#F5B041]/15 to-[#F5B041]/5 border border-[#F5B041]/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 z-10">
            <svg className="w-6 h-6 text-[#F5B041]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
            </svg>
          </div>
        </div>
      </div>

      {/* Roster Layout (Grid of Premium Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
        {staffMembers.map((member) => {
          const isActive = member.status === "active";
          const isBreak = member.status === "break";
          
          let statusBadgeClass = "";
          let dotColorClass = "";
          let hoverBorderClass = "";
          
          if (isActive) {
            statusBadgeClass = "bg-[#3DDC84]/10 text-[#3DDC84] border border-[#3DDC84]/20";
            dotColorClass = "bg-[#3DDC84]";
            hoverBorderClass = "hover:border-[#3DDC84]/30";
          } else if (isBreak) {
            statusBadgeClass = "bg-[#F5B041]/10 text-[#F5B041] border border-[#F5B041]/20";
            dotColorClass = "bg-[#F5B041]";
            hoverBorderClass = "hover:border-[#F5B041]/30";
          } else {
            statusBadgeClass = "bg-[#FF5D73]/10 text-[#FF5D73] border border-[#FF5D73]/20";
            dotColorClass = "bg-[#FF5D73]";
            hoverBorderClass = "hover:border-[#FF5D73]/30";
          }

          return (
            <div
              key={member.id}
              className={`group relative rounded-[24px] bg-gradient-to-b from-[#111827] to-[#0D1422] border border-[rgba(255,255,255,0.06)] ${hoverBorderClass} p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-[0_0_30px_rgba(209,175,71,0.1)] hover:-translate-y-1 overflow-hidden`}
            >
              {/* Decorative subtle gold light inside the card */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#D1AF47]/[0.02] to-transparent pointer-events-none" />
              
              <div>
                {/* Card Top Header: Avatar, Name, Status */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1A2236] to-[#0D1422] border-2 border-[#D1AF47]/30 flex items-center justify-center text-[#D1AF47] font-bold text-lg tracking-wider group-hover:border-[#D1AF47] transition-all duration-300">
                        {member.avatar}
                      </div>
                      {/* Avatar Status Dot */}
                      <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-[#0D1422] ${dotColorClass} ${isActive ? "animate-pulse" : ""}`} />
                    </div>
                    
                    <div>
                      <h3 className="font-bold text-base text-white tracking-wide group-hover:text-[#D1AF47] transition-colors duration-300">
                        {member.name}
                      </h3>
                      <p className="text-xs text-[#7B859C] mt-0.5 font-medium leading-tight">
                        {member.title}
                      </p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusBadgeClass}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColorClass} ${isActive ? "animate-pulse" : ""}`} />
                    {member.statusLabel}
                  </span>
                </div>

                {/* Divider */}
                <div className="h-[1px] bg-[rgba(255,255,255,0.06)] my-5" />

                {/* Details Section */}
                <div className="space-y-4">
                  {/* Assigned Services */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-[#7B859C]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121L19 19m-4.879-4.879l-4.121-4.12M14.121 14.121A3 3 0 1017.5 17.5a3 3 0 00-3.379-3.379zm-7 0A3 3 0 103 17.5a3 3 0 005.121-2.121l4.12-4.121m-4.12 4.121a3 3 0 11-3.38-3.38 3 3 0 013.38 3.38zm0-7a3 3 0 105.121-2.121L19 19m-9.879-9.879a3 3 0 00-3.379-3.379A3 3 0 003 9v.121m7 0A3 3 0 1010.5 3a3 3 0 00-3.379 3.379" />
                      </svg>
                      <span className="text-xs text-[#B8C0D4] font-medium">{t.assignedServices}</span>
                    </div>
                    <span className="text-xs text-white font-extrabold bg-[#172033] px-2.5 py-1 rounded-lg border border-[rgba(255,255,255,0.04)] shadow-inner">
                      {member.servicesCount}
                    </span>
                  </div>

                  {/* Availability */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-[#7B859C]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-xs text-[#B8C0D4] font-medium">{t.weeklyAvailability}</span>
                    </div>
                    <div className="text-xs text-[#B8C0D4] bg-[#070B12]/60 rounded-xl p-3 border border-[rgba(255,255,255,0.04)] font-medium leading-relaxed shadow-inner">
                      {member.availability}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="mt-6 pt-5 border-t border-[rgba(255,255,255,0.06)] flex gap-3">
                <button className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#0D1422]/60 hover:bg-[#172033] border border-[rgba(255,255,255,0.06)] hover:border-[#D1AF47]/30 rounded-xl text-xs font-semibold text-[#B8C0D4] hover:text-white transition-all duration-300">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.83 20.013a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                  </svg>
                  {t.editServices}
                </button>
                <button className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gradient-to-r from-[#D1AF47]/10 to-[#B8952E]/10 hover:from-[#D1AF47]/20 hover:to-[#B8952E]/20 border border-[#D1AF47]/20 hover:border-[#D1AF47]/50 rounded-xl text-xs font-semibold text-[#D1AF47] hover:text-[#E0C46A] transition-all duration-300">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  {t.editShifts}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
