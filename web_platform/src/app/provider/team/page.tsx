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
    sunday: "Sunday"
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
    sunday: "الأحد"
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
    <div className="space-y-8">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[hsl(45,60%,55%)]">{t.teamTitle}</h2>
          <p className="text-sm text-[hsl(210,8%,65%)] mt-1">{t.subtitle}</p>
        </div>
        <button className="px-4 py-2 bg-[hsl(45,60%,55%)] text-[hsl(220,15%,8%)] font-bold text-sm rounded-lg hover:bg-[hsl(45,60%,45%)] transition duration-200 self-start">
          {t.addStaff}
        </button>
      </div>

      {/* Roster Table */}
      <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-[hsla(0,0%,100%,0.08)] text-[hsl(210,8%,65%)] text-xs uppercase bg-[hsla(0,0%,100%,0.02)]">
                <th className="py-4 px-6 text-start">{t.stylist}</th>
                <th className="py-4 px-6 text-start">{t.title}</th>
                <th className="py-4 px-6 text-start">{t.status}</th>
                <th className="py-4 px-6 text-start">{t.assignedServices}</th>
                <th className="py-4 px-6 text-start">{t.weeklyAvailability}</th>
                <th className="py-4 px-6 text-center">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsla(0,0%,100%,0.03)]">
              {staffMembers.map((member) => (
                <tr key={member.id} className="hover:bg-[hsla(0,0%,100%,0.01)] transition-colors duration-200">
                  {/* Name and Avatar */}
                  <td className="py-5 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[hsla(0,0%,100%,0.05)] border border-[hsla(0,0%,100%,0.08)] text-[hsl(45,60%,55%)] font-bold flex items-center justify-center">
                        {member.avatar}
                      </div>
                      <div className="font-semibold text-sm">{member.name}</div>
                    </div>
                  </td>

                  {/* Title */}
                  <td className="py-5 px-6 text-[hsl(210,8%,65%)] text-xs">
                    {member.title}
                  </td>

                  {/* Status */}
                  <td className="py-5 px-6">
                    <span className={`px-2.5 py-1.5 rounded-full text-xs font-semibold ${member.statusColor}`}>
                      {member.statusLabel}
                    </span>
                  </td>

                  {/* Assigned Services */}
                  <td className="py-5 px-6 text-xs">
                    <span className="font-medium text-[hsl(0,0%,98%)]">{member.servicesCount} services</span>
                    <button className="block text-[hsl(45,60%,55%)] hover:underline mt-1">
                      {t.editServices}
                    </button>
                  </td>

                  {/* Availability */}
                  <td className="py-5 px-6 text-xs text-[hsl(210,8%,65%)] font-medium">
                    {member.availability}
                  </td>

                  {/* Actions */}
                  <td className="py-5 px-6">
                    <div className="flex gap-2 justify-center">
                      <button className="px-3 py-1.5 bg-[hsla(0,0%,100%,0.03)] border border-[hsla(0,0%,100%,0.08)] rounded-lg text-xs font-bold hover:border-[hsl(45,60%,55%)] hover:text-[hsl(45,60%,55%)] transition duration-150">
                        {t.editShifts}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
