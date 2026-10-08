// Country configuration for NEW code (G70). The country, its currency, its time zone and its VAT rate live in the `countries`
// table and on `branches.country_code`; nothing here names a country. Existing screens still format SAR and Asia/Riyadh through
// operations-ui.tsx and are not changed: Saudi Arabia is the only open country today and gives the same output (see
// web_platform/tests/country.test.mjs, which compares this helper with those formatters for Saudi Arabia).
//
// Read the table with `supabase.from("countries").select(COUNTRY_COLUMNS)` and pass the rows to `parseCountries`.

export type CountryLocale = "ar" | "en";

export type CountryConfig = {
  code: string;
  name_en: string;
  name_ar: string;
  currency_code: string;
  currency_minor_units: number;
  timezone: string;
  vat_rate_percent: number;
  phone_dial_code: string;
  active: boolean;
};

export const COUNTRY_COLUMNS = "code, name_en, name_ar, currency_code, currency_minor_units, timezone, vat_rate_percent, phone_dial_code, active";

/** Validates rows read from the `countries` table. A row that is not a complete country is dropped, never guessed. */
export function parseCountries(rows: unknown): CountryConfig[] {
  if (!Array.isArray(rows)) return [];
  const out: CountryConfig[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const vat = Number(r.vat_rate_percent);
    const minor = Number(r.currency_minor_units);
    if (
      typeof r.code !== "string" || !/^[A-Z]{2}$/.test(r.code) ||
      typeof r.name_en !== "string" || typeof r.name_ar !== "string" ||
      typeof r.currency_code !== "string" || !/^[A-Z]{3}$/.test(r.currency_code) ||
      typeof r.timezone !== "string" || typeof r.phone_dial_code !== "string" ||
      !Number.isFinite(vat) || !Number.isInteger(minor) || minor < 0 || minor > 4
    ) continue;
    out.push({
      code: r.code, name_en: r.name_en, name_ar: r.name_ar, currency_code: r.currency_code, currency_minor_units: minor,
      timezone: r.timezone, vat_rate_percent: vat, phone_dial_code: r.phone_dial_code, active: r.active === true,
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

export function countryByCode(countries: readonly CountryConfig[], code: string | null | undefined): CountryConfig | null {
  if (!code) return null;
  const wanted = code.trim().toUpperCase();
  return countries.find((c) => c.code === wanted) ?? null;
}

export function countryName(country: CountryConfig, locale: CountryLocale): string {
  return locale === "ar" ? country.name_ar : country.name_en;
}

/** Amounts in the country's currency, with the country's own number of minor units. */
export function formatMoney(amount: number | string, country: CountryConfig, locale: CountryLocale): string {
  return new Intl.NumberFormat(locale === "ar" ? `ar-${country.code}` : `en-${country.code}`, {
    style: "currency",
    currency: country.currency_code,
    minimumFractionDigits: country.currency_minor_units,
    maximumFractionDigits: country.currency_minor_units,
  }).format(Number(amount));
}

/** A date and time on the country's clock (or a branch's own time zone when it overrides the country's). */
export function formatDateTime(value: string | number | Date, country: CountryConfig, locale: CountryLocale, timeZone?: string | null): string {
  return new Intl.DateTimeFormat(locale === "ar" ? `ar-${country.code}-u-ca-gregory` : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timeZone || country.timezone,
  }).format(new Date(value));
}

/** The VAT on a taxable amount at the country's rate, rounded to the currency's minor units (half away from zero, like SQL ROUND). */
export function vatAmount(taxable: number, country: CountryConfig): number {
  const scale = 10 ** country.currency_minor_units;
  const raw = (taxable * country.vat_rate_percent) / 100;
  return (Math.sign(raw) * Math.round(Math.abs(raw) * scale + Number.EPSILON * scale)) / scale;
}
