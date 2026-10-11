import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COUNTRY_COLUMNS, countryByCode, countryName, formatDateTime, formatMoney, parseCountries, vatAmount } from "../src/lib/country.ts";

// The row the database seeds for Saudi Arabia (supabase/migrations/20261008900000_gcc_country_configuration.sql).
const SA_ROW = {
  code: "SA", name_en: "Saudi Arabia", name_ar: "المملكة العربية السعودية", currency_code: "SAR", currency_minor_units: 2,
  timezone: "Asia/Riyadh", vat_rate_percent: "15.00", phone_dial_code: "+966", active: true,
};

describe("country helper (G70)", () => {
  const [sa] = parseCountries([SA_ROW]);

  it("reads a country row and drops anything that is not a complete country", () => {
    assert.equal(sa.vat_rate_percent, 15);
    assert.equal(sa.active, true);
    assert.deepEqual(parseCountries([{ ...SA_ROW, code: "SAU" }, { ...SA_ROW, currency_code: "sar" }, { ...SA_ROW, currency_minor_units: 7 }, null, "x"]), []);
    assert.deepEqual(parseCountries(null), []);
    assert.equal(countryByCode([sa], " sa ")?.code, "SA");
    assert.equal(countryByCode([sa], "AE"), null);
    assert.equal(countryName(sa, "ar"), SA_ROW.name_ar);
    assert.equal(countryName(sa, "en"), "Saudi Arabia");
    assert.ok(COUNTRY_COLUMNS.split(",").every((c) => c.trim() in SA_ROW));
  });

  it("formats exactly what the Saudi screens format today", () => {
    // These two expressions are the bodies of sar() and operationsDate() in components/operations-ui.tsx.
    const sarToday = (value, locale) => new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", { style: "currency", currency: "SAR" }).format(Number(value));
    const dateToday = (value, locale) => new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value));
    for (const locale of ["ar", "en"]) {
      for (const amount of [0, 0.05, 99.99, 1234.5, "230.00"]) assert.equal(formatMoney(amount, sa, locale), sarToday(amount, locale));
      assert.equal(formatDateTime("2026-10-10T20:30:00Z", sa, locale), dateToday("2026-10-10T20:30:00Z", locale));
    }
  });

  it("follows another country's currency, minor units, VAT and clock", () => {
    const [kw] = parseCountries([{ ...SA_ROW, code: "ZZ", currency_code: "KWD", currency_minor_units: 3, timezone: "Asia/Dubai", vat_rate_percent: 5 }]);
    assert.match(formatMoney(12.5, kw, "en"), /12\.500/);
    assert.notEqual(formatDateTime("2026-10-10T20:30:00Z", kw, "en"), formatDateTime("2026-10-10T20:30:00Z", sa, "en"));
    assert.match(formatDateTime("2026-10-10T20:30:00Z", kw, "en"), /11 Oct 2026/);
    assert.match(formatDateTime("2026-10-10T20:30:00Z", sa, "en"), /10 Oct 2026/);
    assert.match(formatDateTime("2026-10-10T20:30:00Z", sa, "en", "Asia/Dubai"), /11 Oct 2026/, "a branch's own time zone wins");
    assert.equal(vatAmount(200, kw), 10);
    assert.equal(vatAmount(0.05, sa), 0.01);
    assert.equal(vatAmount(99.99, sa), 15);
    assert.equal(vatAmount(33.33, sa), 5);
    assert.equal(vatAmount(1234.57, sa), 185.19);
  });

  it("names no country itself", () => {
    const lines = readFileSync(new URL("../src/lib/country.ts", import.meta.url), "utf8").split(/\r?\n/);
    const source = lines.filter((line) => !line.trim().startsWith("//")).join(" ");
    assert.equal(/Asia\/Riyadh|["']SAR["']|["']SA["']/.test(source), false);
  });
});
