// Pure money helpers for the console and provider screens (no React, no Supabase), tested in tests/money-screens.test.mjs.

export type FeeTerms = { fee_percentage: number | string; min_fee_sar: number | string; max_fee_sar: number | string | null };
export type FeeExample = { amount: number; fee: number; vat: number; net: number };

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

// D-D3 worked example: the platform fee the fee rule charges on a booking amount (percentage, then the minimum and maximum, the
// same order as calculate_booking_platform_commission), VAT on that fee at the given rate, and what the provider keeps.
export function feeExample(terms: FeeTerms, amount: number, vatPercent: number | null): FeeExample | null {
  const pct = Number(terms.fee_percentage);
  const min = Number(terms.min_fee_sar);
  const max = terms.max_fee_sar === null || terms.max_fee_sar === undefined ? null : Number(terms.max_fee_sar);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(pct) || !Number.isFinite(min)) return null;
  let fee = Math.max(min, round2((amount * pct) / 100));
  if (max !== null && Number.isFinite(max)) fee = Math.min(max, fee);
  fee = round2(Math.min(fee, amount));
  const vat = vatPercent === null || !Number.isFinite(vatPercent) ? 0 : round2((fee * vatPercent) / 100);
  return { amount: round2(amount), fee, vat, net: round2(amount - fee - vat) };
}

export type ImportSource = "tap_settlement_file" | "bank_statement";
export type ImportRow = { object_type: "settlement" | "bank_credit"; tap_object_id: string; reference: string | null; amount: string; currency: "SAR" };
export type ParsedImport = { rows: ImportRow[]; errors: { line: number; text: string }[] };

// Parses pasted CSV lines for the reconciliation import. Settlement report: "settlement_id,amount". Bank statement:
// "bank_line_id,amount,settlement_id". Amounts are SAR with at most two decimals; a header line is skipped.
export function parseReconciliationRows(text: string, source: ImportSource): ParsedImport {
  const rows: ImportRow[] = [];
  const errors: { line: number; text: string }[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const cells = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
    if (index === 0 && cells.some((cell) => /[a-z]/i.test(cell) && /id|amount|reference/i.test(cell)) && !/\d/.test(cells[1] ?? "")) return;
    const [id, amount, reference] = cells;
    const expected = source === "bank_statement" ? 3 : 2;
    if (cells.length !== expected || !/^[A-Za-z0-9_-]{3,128}$/.test(id ?? "") || !/^-?\d+(\.\d{1,2})?$/.test(amount ?? "")
        || (source === "bank_statement" && !/^[A-Za-z0-9_-]{3,128}$/.test(reference ?? ""))) {
      errors.push({ line: index + 1, text: raw });
      return;
    }
    if (seen.has(id)) {
      errors.push({ line: index + 1, text: raw });
      return;
    }
    seen.add(id);
    rows.push({
      object_type: source === "bank_statement" ? "bank_credit" : "settlement",
      tap_object_id: id,
      reference: source === "bank_statement" ? reference : null,
      amount: Number(amount).toFixed(2),
      currency: "SAR",
    });
  });
  return { rows, errors };
}

// The Saudi VAT number format: 15 digits starting and ending with 3 (format only; ZATCA confirms the registration).
export function validVatNumber(value: string): boolean {
  return /^3\d{13}3$/.test(value.trim());
}
