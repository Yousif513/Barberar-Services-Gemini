// The payroll summary a provider downloads from the reports screen (C-D13). It is a summary of what each professional earned in the
// period from the pay rules the owner set. It is NOT a Wage Protection System file: that bank layout is not built, so nothing here
// is named or laid out as one. A professional without pay rules is flagged and gets no amounts (no invented commission, no zero
// presented as an agreement). Cells go through the shared escaper, so a name with a comma, a quote or a leading = is safe.
// Salary IBANs appear masked (GOV-FIX M-5): the full number is shown only by the audited reveal in the pay-rules dialog.
//
// Plain ES module with JSDoc types so the web tests run it directly.
import { csvCell } from "./csv.mjs";

const HEADERS = {
  en: ["Employee ID", "Name (EN)", "Name (AR)", "Title", "Branch", "IBAN (masked)", "Completed bookings", "Service revenue (SAR)", "Commission rate (%)", "Commission (SAR)", "Tips (SAR)", "Base salary (SAR)", "Total payout (SAR)", "Status"],
  ar: ["رقم الموظف", "الاسم (إنجليزي)", "الاسم (عربي)", "المسمى", "الفرع", "الآيبان (مخفي جزئياً)", "الحجوزات المكتملة", "إيراد الخدمات (ريال)", "نسبة العمولة (%)", "العمولة (ريال)", "الإكراميات (ريال)", "الراتب الأساسي (ريال)", "إجمالي المستحق (ريال)", "الحالة"],
};
const STATUS = {
  en: { configured: "Pay rules set", missing: "No pay rules: left out of the amounts" },
  ar: { configured: "قواعد الأجر محددة", missing: "لا توجد قواعد أجر: مستبعد من المبالغ" },
};

/**
 * @param {Array<Record<string, unknown>>} entries payroll_entries from calculate_staff_payroll
 * @param {"en" | "ar"} locale
 * @returns {string} the file's text, starting with a byte-order mark so Arabic opens correctly in Excel
 */
export function payrollSummaryCsv(entries, locale) {
  const lang = locale === "ar" ? "ar" : "en";
  const text = (value) => (value === null || value === undefined ? "" : String(value));
  const rows = entries.map((entry) => {
    const configured = entry.rule_configured === true;
    // Amounts that depend on the pay rules are blank when there are none; revenue, bookings and tips are facts and always shown.
    const rule = (value) => (configured && value !== null && value !== undefined ? Number(value) : "");
    return [
      text(entry.employee_id), text(entry.name_en), text(entry.name_ar), text(entry.title_en), text(entry.branch), text(entry.wps_iban_masked),
      Number(entry.completed_bookings ?? 0), Number(entry.service_revenue_sar ?? 0),
      rule(entry.commission_rate_pct), rule(entry.commission_earned_sar), Number(entry.tips_earned_sar ?? 0), rule(entry.base_salary_sar), rule(entry.total_payout_sar),
      configured ? STATUS[lang].configured : STATUS[lang].missing,
    ];
  });
  return `﻿${[HEADERS[lang], ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
