"use client";

import React, { useEffect, useMemo, useState } from "react";

type WorkType = "remote" | "in_shop" | "both";
type Employee = {
  id: string;
  nameEn: string;
  nameAr: string;
  roleEn: string;
  roleAr: string;
  photoUrl: string;
  phone: string;
  email: string;
  assignedServices: string[];
  workType: WorkType;
  isAvailable: boolean;
  totalEarnings: number;
  rating: number;
  completedBookings: number;
};

const copy = {
  en: {
    title: "Employees",
    subtitle: "Manage provider employees, availability, work modes, service assignments, and performance.",
    add: "+ Add Employee",
    totalEarnings: "Total earned",
    completed: "Completed bookings",
    averageRating: "Average rating",
    best: "Best-performing employee",
    active: "Active employees",
    remote: "Remote employees",
    inShop: "In-shop employees",
    employee: "Employee",
    status: "Status",
    workType: "Work type",
    services: "Assigned services",
    earnings: "Earnings",
    rating: "Rating",
    bookings: "Bookings",
    actions: "Actions",
    activeLabel: "Active",
    inactiveLabel: "Inactive",
    remoteLabel: "Remote",
    inShopLabel: "In-shop",
    bothLabel: "Remote + in-shop",
    view: "View",
    edit: "Edit",
    delete: "Delete",
    save: "Save",
    cancel: "Cancel",
    nameEn: "English name",
    nameAr: "Arabic name",
    roleEn: "English role",
    roleAr: "Arabic role",
    photoUrl: "Photo URL",
    phone: "Phone",
    email: "Email",
    servicesCsv: "Assigned services, comma separated",
    available: "Employee available",
    formTitleAdd: "Add employee",
    formTitleEdit: "Edit employee",
    details: "Employee details",
    confirmDelete: "Delete {name}? This cannot be undone in this local admin view.",
  },
  ar: {
    title: "الموظفون",
    subtitle: "إدارة موظفي المزودين والتوفر ونوع العمل والخدمات والأداء.",
    add: "+ إضافة موظف",
    totalEarnings: "إجمالي الأرباح",
    completed: "الحجوزات المكتملة",
    averageRating: "متوسط التقييم",
    best: "أفضل موظف أداء",
    active: "الموظفون النشطون",
    remote: "موظفو العمل عن بعد",
    inShop: "موظفو المحل",
    employee: "الموظف",
    status: "الحالة",
    workType: "نوع العمل",
    services: "الخدمات المعينة",
    earnings: "الأرباح",
    rating: "التقييم",
    bookings: "الحجوزات",
    actions: "الإجراءات",
    activeLabel: "نشط",
    inactiveLabel: "غير نشط",
    remoteLabel: "عن بعد",
    inShopLabel: "داخل المحل",
    bothLabel: "عن بعد وداخل المحل",
    view: "عرض",
    edit: "تعديل",
    delete: "حذف",
    save: "حفظ",
    cancel: "إلغاء",
    nameEn: "الاسم بالإنجليزية",
    nameAr: "الاسم بالعربية",
    roleEn: "الدور بالإنجليزية",
    roleAr: "الدور بالعربية",
    photoUrl: "رابط الصورة",
    phone: "الهاتف",
    email: "البريد الإلكتروني",
    servicesCsv: "الخدمات المعينة مفصولة بفواصل",
    available: "الموظف متاح",
    formTitleAdd: "إضافة موظف",
    formTitleEdit: "تعديل موظف",
    details: "تفاصيل الموظف",
    confirmDelete: "حذف {name}؟ لا يمكن التراجع عن ذلك في عرض الإدارة المحلي.",
  }
};

const demoEmployees: Employee[] = [
  {
    id: "emp-omar",
    nameEn: "Omar Khaled",
    nameAr: "عمر خالد",
    roleEn: "Master Barber",
    roleAr: "حلاق خبير",
    photoUrl: "https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=400&auto=format&fit=crop",
    phone: "+966 55 418 2031",
    email: "omar.khaled@primora.team",
    assignedServices: ["Classic Haircut", "Beard Sculpt", "Hot Towel Shave"],
    workType: "both",
    isAvailable: true,
    totalEarnings: 28450,
    rating: 4.9,
    completedBookings: 186
  },
  {
    id: "emp-yousef",
    nameEn: "Yousef Adel",
    nameAr: "يوسف عادل",
    roleEn: "Beard Specialist",
    roleAr: "أخصائي لحية",
    photoUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&auto=format&fit=crop",
    phone: "+966 54 209 4488",
    email: "yousef.adel@primora.team",
    assignedServices: ["Beard Sculpt", "Royal Shave Ritual"],
    workType: "in_shop",
    isAvailable: true,
    totalEarnings: 19380,
    rating: 4.8,
    completedBookings: 132
  },
  {
    id: "emp-lina",
    nameEn: "Lina Nasser",
    nameAr: "لينا ناصر",
    roleEn: "Spa & Skincare Specialist",
    roleAr: "أخصائية سبا وبشرة",
    photoUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=400&auto=format&fit=crop",
    phone: "+966 56 771 0430",
    email: "lina.nasser@primora.team",
    assignedServices: ["Express Facial", "Moroccan Bath", "Aromatherapy Massage"],
    workType: "remote",
    isAvailable: false,
    totalEarnings: 22110,
    rating: 4.7,
    completedBookings: 118
  }
];

const blankEmployee = (): Employee => ({
  id: "",
  nameEn: "",
  nameAr: "",
  roleEn: "Specialist",
  roleAr: "أخصائي",
  photoUrl: "",
  phone: "",
  email: "",
  assignedServices: [],
  workType: "in_shop",
  isAvailable: true,
  totalEarnings: 0,
  rating: 4.7,
  completedBookings: 0
});

export default function AdminEmployeesPage() {
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [employees, setEmployees] = useState<Employee[]>(demoEmployees);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeEmployee, setActiveEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<Employee>(() => blankEmployee());
  const t = copy[lang];
  const isRTL = lang === "ar";

  useEffect(() => {
    const sync = () => setLang(document.documentElement.lang === "ar" ? "ar" : "en");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);

  const labelForWorkType = (workType: WorkType) => {
    if (workType === "remote") return t.remoteLabel;
    if (workType === "both") return t.bothLabel;
    return t.inShopLabel;
  };

  const metrics = useMemo(() => {
    const totalEarnings = employees.reduce((sum, employee) => sum + employee.totalEarnings, 0);
    const completed = employees.reduce((sum, employee) => sum + employee.completedBookings, 0);
    const averageRating = employees.length ? employees.reduce((sum, employee) => sum + employee.rating, 0) / employees.length : 0;
    const best = employees.reduce<Employee | null>((winner, employee) => {
      if (!winner) return employee;
      return employee.totalEarnings + employee.completedBookings * 35 > winner.totalEarnings + winner.completedBookings * 35 ? employee : winner;
    }, null);

    return {
      totalEarnings,
      completed,
      averageRating,
      best,
      active: employees.filter((employee) => employee.isAvailable).length,
      remote: employees.filter((employee) => employee.workType === "remote" || employee.workType === "both").length,
      inShop: employees.filter((employee) => employee.workType === "in_shop" || employee.workType === "both").length
    };
  }, [employees]);

  const displayName = (employee: Employee) => isRTL ? employee.nameAr || employee.nameEn : employee.nameEn || employee.nameAr;
  const displayRole = (employee: Employee) => isRTL ? employee.roleAr || employee.roleEn : employee.roleEn || employee.roleAr;
  const money = (value: number) => `${value.toLocaleString(isRTL ? "ar-SA" : "en-US")} SAR`;

  const openAdd = () => {
    setForm(blankEmployee());
    setModalOpen(true);
  };

  const openEdit = (employee: Employee) => {
    setForm(employee);
    setModalOpen(true);
  };

  const openDetails = (employee: Employee) => {
    setActiveEmployee(employee);
    setDetailsOpen(true);
  };

  const saveEmployee = () => {
    const normalized: Employee = {
      ...form,
      id: form.id || `emp-${Date.now()}`,
      assignedServices: form.assignedServices.map((service) => service.trim()).filter(Boolean),
      totalEarnings: Number(form.totalEarnings) || 0,
      rating: Number(form.rating) || 0,
      completedBookings: Number(form.completedBookings) || 0
    };
    setEmployees((current) => current.some((employee) => employee.id === normalized.id)
      ? current.map((employee) => employee.id === normalized.id ? normalized : employee)
      : [normalized, ...current]);
    setModalOpen(false);
  };

  const deleteEmployee = (employee: Employee) => {
    const message = t.confirmDelete.replace("{name}", displayName(employee));
    if (typeof window !== "undefined" && !window.confirm(message)) return;
    setEmployees((current) => current.filter((item) => item.id !== employee.id));
  };

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-7 text-[#17130D] ${isRTL ? "text-right" : "text-left"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-black text-[#17130D]">{t.title}</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium text-[#6F6759]">{t.subtitle}</p>
        </div>
        <button onClick={openAdd} className="rounded-2xl bg-[#D1AF47] px-5 py-3 text-sm font-black text-[#11100B] shadow-[0_14px_34px_rgba(209,175,71,0.25)] transition hover:bg-[#E0C46A]">
          {t.add}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {[
          { label: t.totalEarnings, value: money(metrics.totalEarnings) },
          { label: t.completed, value: metrics.completed.toLocaleString(isRTL ? "ar-SA" : "en-US") },
          { label: t.averageRating, value: metrics.averageRating.toFixed(1) },
          { label: t.best, value: metrics.best ? displayName(metrics.best) : "—" },
          { label: t.active, value: metrics.active.toLocaleString(isRTL ? "ar-SA" : "en-US") },
          { label: t.remote, value: metrics.remote.toLocaleString(isRTL ? "ar-SA" : "en-US") },
          { label: t.inShop, value: metrics.inShop.toLocaleString(isRTL ? "ar-SA" : "en-US") }
        ].map((metric) => (
          <div key={metric.label} className="rounded-[24px] border border-[#D1AF47]/20 bg-white/78 p-5 shadow-[0_18px_44px_rgba(17,16,11,0.07)] backdrop-blur">
            <span className="block text-[9px] font-black uppercase tracking-[0.2em] text-[#8B806B]">{metric.label}</span>
            <strong className="mt-2 block truncate text-xl font-black text-[#17130D]">{metric.value}</strong>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-[28px] border border-[#D1AF47]/20 bg-white/82 shadow-[0_20px_60px_rgba(17,16,11,0.08)]">
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-[#17130D] text-[#F4E7B6]">
              <tr>
                {[t.employee, t.status, t.workType, t.services, t.earnings, t.rating, t.bookings, t.actions].map((head) => (
                  <th key={head} className="px-5 py-4 text-start text-[10px] font-black uppercase tracking-[0.18em]">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#17130D]/8">
              {employees.map((employee) => (
                <tr key={employee.id} className="transition hover:bg-[#F7F3E8]">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <img src={employee.photoUrl} alt={displayName(employee)} className="h-11 w-11 rounded-2xl object-cover" />
                      <div>
                        <p className="font-black text-[#17130D]">{displayName(employee)}</p>
                        <p className="text-xs font-semibold text-[#8B806B]">{displayRole(employee)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-3 py-1 text-[10px] font-black ${employee.isAvailable ? "bg-[#16A34A]/10 text-[#15803D]" : "bg-[#EF4444]/10 text-[#B91C1C]"}`}>
                      {employee.isAvailable ? t.activeLabel : t.inactiveLabel}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-bold text-[#6F6759]">{labelForWorkType(employee.workType)}</td>
                  <td className="px-5 py-4 text-xs font-semibold text-[#6F6759]">{employee.assignedServices.slice(0, 3).join(", ")}</td>
                  <td className="px-5 py-4 font-black text-[#B68B2C]">{money(employee.totalEarnings)}</td>
                  <td className="px-5 py-4 font-black text-[#17130D]">★ {employee.rating.toFixed(1)}</td>
                  <td className="px-5 py-4 font-black text-[#17130D]">{employee.completedBookings}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => openDetails(employee)} className="rounded-xl border border-[#17130D]/10 px-3 py-2 text-xs font-black text-[#17130D] hover:border-[#D1AF47]/45">{t.view}</button>
                      <button onClick={() => openEdit(employee)} className="rounded-xl border border-[#D1AF47]/35 bg-[#D1AF47]/10 px-3 py-2 text-xs font-black text-[#9A741F] hover:bg-[#D1AF47]/20">{t.edit}</button>
                      <button onClick={() => deleteEmployee(employee)} className="rounded-xl border border-[#EF4444]/20 bg-[#EF4444]/10 px-3 py-2 text-xs font-black text-[#B91C1C] hover:bg-[#EF4444]/15">{t.delete}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 p-4 lg:hidden">
          {employees.map((employee) => (
            <div key={employee.id} className="rounded-3xl border border-[#17130D]/10 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <img src={employee.photoUrl} alt={displayName(employee)} className="h-14 w-14 rounded-2xl object-cover" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-black text-[#17130D]">{displayName(employee)}</h3>
                  <p className="text-xs font-semibold text-[#8B806B]">{displayRole(employee)}</p>
                  <p className="mt-2 text-xs font-bold text-[#B68B2C]">{money(employee.totalEarnings)} · ★ {employee.rating.toFixed(1)}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#17130D]/6 px-3 py-1 text-[10px] font-black text-[#17130D]">{labelForWorkType(employee.workType)}</span>
                <span className={`rounded-full px-3 py-1 text-[10px] font-black ${employee.isAvailable ? "bg-[#16A34A]/10 text-[#15803D]" : "bg-[#EF4444]/10 text-[#B91C1C]"}`}>
                  {employee.isAvailable ? t.activeLabel : t.inactiveLabel}
                </span>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => openDetails(employee)} className="flex-1 rounded-xl border border-[#17130D]/10 py-2 text-xs font-black">{t.view}</button>
                <button onClick={() => openEdit(employee)} className="flex-1 rounded-xl bg-[#D1AF47] py-2 text-xs font-black text-[#11100B]">{t.edit}</button>
                <button onClick={() => deleteEmployee(employee)} className="flex-1 rounded-xl bg-[#EF4444]/10 py-2 text-xs font-black text-[#B91C1C]">{t.delete}</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17130D]/55 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[28px] border border-[#D1AF47]/25 bg-[#F9F7F1] p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-serif text-2xl font-black text-[#17130D]">{form.id ? t.formTitleEdit : t.formTitleAdd}</h2>
              <button onClick={() => setModalOpen(false)} className="rounded-full border border-[#17130D]/10 px-3 py-1 text-xs font-black text-[#6F6759]">{t.cancel}</button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                ["nameEn", t.nameEn],
                ["nameAr", t.nameAr],
                ["roleEn", t.roleEn],
                ["roleAr", t.roleAr],
                ["photoUrl", t.photoUrl],
                ["phone", t.phone],
                ["email", t.email],
              ].map(([key, label]) => (
                <label key={key} className="space-y-2 text-xs font-black uppercase tracking-widest text-[#8B806B]">
                  {label}
                  <input value={String(form[key as keyof Employee] ?? "")} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-2xl border border-[#17130D]/10 bg-white px-4 py-3 text-sm normal-case tracking-normal text-[#17130D] outline-none focus:border-[#D1AF47]/60" />
                </label>
              ))}
              <label className="space-y-2 text-xs font-black uppercase tracking-widest text-[#8B806B]">
                {t.workType}
                <select value={form.workType} onChange={(event) => setForm((current) => ({ ...current, workType: event.target.value as WorkType }))} className="w-full rounded-2xl border border-[#17130D]/10 bg-white px-4 py-3 text-sm normal-case tracking-normal text-[#17130D] outline-none focus:border-[#D1AF47]/60">
                  <option value="in_shop">{t.inShopLabel}</option>
                  <option value="remote">{t.remoteLabel}</option>
                  <option value="both">{t.bothLabel}</option>
                </select>
              </label>
              <label className="space-y-2 text-xs font-black uppercase tracking-widest text-[#8B806B]">
                {t.earnings}
                <input type="number" value={form.totalEarnings} onChange={(event) => setForm((current) => ({ ...current, totalEarnings: Number(event.target.value) }))} className="w-full rounded-2xl border border-[#17130D]/10 bg-white px-4 py-3 text-sm normal-case tracking-normal text-[#17130D] outline-none focus:border-[#D1AF47]/60" />
              </label>
              <label className="space-y-2 text-xs font-black uppercase tracking-widest text-[#8B806B]">
                {t.rating}
                <input type="number" step="0.1" value={form.rating} onChange={(event) => setForm((current) => ({ ...current, rating: Number(event.target.value) }))} className="w-full rounded-2xl border border-[#17130D]/10 bg-white px-4 py-3 text-sm normal-case tracking-normal text-[#17130D] outline-none focus:border-[#D1AF47]/60" />
              </label>
              <label className="space-y-2 text-xs font-black uppercase tracking-widest text-[#8B806B]">
                {t.bookings}
                <input type="number" value={form.completedBookings} onChange={(event) => setForm((current) => ({ ...current, completedBookings: Number(event.target.value) }))} className="w-full rounded-2xl border border-[#17130D]/10 bg-white px-4 py-3 text-sm normal-case tracking-normal text-[#17130D] outline-none focus:border-[#D1AF47]/60" />
              </label>
              <label className="space-y-2 text-xs font-black uppercase tracking-widest text-[#8B806B] sm:col-span-2">
                {t.servicesCsv}
                <input value={form.assignedServices.join(", ")} onChange={(event) => setForm((current) => ({ ...current, assignedServices: event.target.value.split(",") }))} className="w-full rounded-2xl border border-[#17130D]/10 bg-white px-4 py-3 text-sm normal-case tracking-normal text-[#17130D] outline-none focus:border-[#D1AF47]/60" />
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-[#17130D]/10 bg-white px-4 py-3 text-sm font-black text-[#17130D] sm:col-span-2">
                {t.available}
                <input type="checkbox" checked={form.isAvailable} onChange={(event) => setForm((current) => ({ ...current, isAvailable: event.target.checked }))} className="h-5 w-5 accent-[#D1AF47]" />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setModalOpen(false)} className="rounded-xl border border-[#17130D]/10 px-5 py-2.5 text-xs font-black text-[#6F6759]">{t.cancel}</button>
              <button onClick={saveEmployee} className="rounded-xl bg-[#D1AF47] px-5 py-2.5 text-xs font-black text-[#11100B] hover:bg-[#E0C46A]">{t.save}</button>
            </div>
          </div>
        </div>
      )}

      {detailsOpen && activeEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17130D]/55 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[28px] border border-[#D1AF47]/25 bg-[#F9F7F1] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <img src={activeEmployee.photoUrl} alt={displayName(activeEmployee)} className="h-20 w-20 rounded-3xl object-cover" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#B68B2C]">{t.details}</p>
                  <h2 className="mt-1 font-serif text-2xl font-black text-[#17130D]">{displayName(activeEmployee)}</h2>
                  <p className="text-sm font-semibold text-[#6F6759]">{displayRole(activeEmployee)}</p>
                </div>
              </div>
              <button onClick={() => setDetailsOpen(false)} className="rounded-full border border-[#17130D]/10 px-3 py-1 text-xs font-black text-[#6F6759]">{t.cancel}</button>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[#17130D]/10 bg-white p-4"><span className="text-[9px] font-black uppercase text-[#8B806B]">{t.earnings}</span><strong className="mt-1 block text-lg text-[#B68B2C]">{money(activeEmployee.totalEarnings)}</strong></div>
              <div className="rounded-2xl border border-[#17130D]/10 bg-white p-4"><span className="text-[9px] font-black uppercase text-[#8B806B]">{t.rating}</span><strong className="mt-1 block text-lg text-[#17130D]">★ {activeEmployee.rating.toFixed(1)}</strong></div>
              <div className="rounded-2xl border border-[#17130D]/10 bg-white p-4"><span className="text-[9px] font-black uppercase text-[#8B806B]">{t.bookings}</span><strong className="mt-1 block text-lg text-[#17130D]">{activeEmployee.completedBookings}</strong></div>
              <div className="rounded-2xl border border-[#17130D]/10 bg-white p-4"><span className="text-[9px] font-black uppercase text-[#8B806B]">{t.workType}</span><strong className="mt-1 block text-sm text-[#17130D]">{labelForWorkType(activeEmployee.workType)}</strong></div>
            </div>
            <div className="mt-4 rounded-2xl border border-[#17130D]/10 bg-white p-4 text-sm font-semibold text-[#6F6759]">
              <p>{activeEmployee.phone}</p>
              <p>{activeEmployee.email}</p>
              <p className="mt-3">{activeEmployee.assignedServices.join(", ")}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
