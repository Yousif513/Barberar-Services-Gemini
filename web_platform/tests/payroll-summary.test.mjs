import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { payrollSummaryCsv } from "../src/lib/payroll-summary.mjs";

const configured = {
  employee_id: "e1", name_en: "Omar, \"Ace\" Khaled", name_ar: "عمر خالد", title_en: "Barber", branch: "Olaya", rule_configured: true, wps_iban_masked: "SA** **** **** **** **** 7519",
  completed_bookings: 12, service_revenue_sar: 1800, commission_rate_pct: 20, commission_earned_sar: 360, tips_earned_sar: 45, base_salary_sar: 3000, total_payout_sar: 3405,
};
const unconfigured = {
  employee_id: "e2", name_en: "=HYPERLINK(\"http://x\")", name_ar: "سارة", title_en: null, branch: "Olaya", rule_configured: false, wps_iban_masked: null,
  completed_bookings: 4, service_revenue_sar: 600, commission_rate_pct: null, commission_earned_sar: null, tips_earned_sar: 10, base_salary_sar: null, total_payout_sar: null,
};

describe("payrollSummaryCsv (C-D13)", () => {
  const csv = payrollSummaryCsv([configured, unconfigured], "en");
  const lines = csv.split("\r\n");

  it("starts with a byte-order mark and ends with a line break", () => {
    assert.ok(csv.startsWith("﻿"));
    assert.ok(csv.endsWith("\r\n"));
  });
  it("escapes commas and quotes in a name, and keeps a leading = from running as a formula", () => {
    assert.ok(lines[1].includes('"Omar, ""Ace"" Khaled"'));
    assert.ok(lines[2].includes("\"'=HYPERLINK(\"\"http://x\"\")\""));
  });
  it("flags a professional with no pay rules and leaves their rule-based amounts blank, never zero or 'null'", () => {
    assert.ok(!csv.includes("null") && !csv.includes("undefined"));
    const cells = lines[2].split(",");
    assert.ok(lines[2].endsWith("No pay rules: left out of the amounts"));
    assert.ok(cells.slice(-5, -1).join(",").includes(",,"), "commission rate, commission, base salary and total are blank");
    assert.ok(lines[2].includes(",4,600,"), "bookings and revenue are facts and stay");
  });
  it("shows the configured professional's amounts as numbers", () => {
    assert.ok(lines[1].includes(",12,1800,20,360,45,3000,3405,Pay rules set"));
  });
  it("carries the salary IBAN only in its masked form (GOV-FIX M-5)", () => {
    assert.ok(lines[1].includes("SA** **** **** **** **** 7519"));
    assert.ok(!/SA\d{22}/.test(csv));
    assert.ok(lines[0].includes("IBAN (masked)"));
  });
  it("is not presented as a WPS file", () => {
    assert.ok(!/wps|mudad/i.test(csv.split("\r\n")[0]));
  });
  it("has Arabic headers and statuses in Arabic", () => {
    const ar = payrollSummaryCsv([unconfigured], "ar");
    assert.ok(ar.includes("الحجوزات المكتملة"));
    assert.ok(ar.includes("لا توجد قواعد أجر"));
  });
  it("returns only the header for an empty list", () => {
    assert.equal(payrollSummaryCsv([], "en").trim().split("\r\n").length, 1);
  });
});
