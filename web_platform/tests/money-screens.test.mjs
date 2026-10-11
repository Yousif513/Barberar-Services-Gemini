import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { feeExample, parseReconciliationRows, validVatNumber } from "../src/lib/money-display.ts";

// MONEY package (D-Q7, D-Q8, D-Q9, D-D3): pure helpers and the wiring of the money screens to their server commands.
const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, "../src", path), "utf8");

describe("feeExample (D-D3 worked example)", () => {
  it("applies the percentage, then the minimum and maximum, then VAT on the fee", () => {
    assert.deepEqual(feeExample({ fee_percentage: 20, min_fee_sar: 10, max_fee_sar: 40 }, 150, 15), { amount: 150, fee: 30, vat: 4.5, net: 115.5 });
    assert.deepEqual(feeExample({ fee_percentage: 20, min_fee_sar: 10, max_fee_sar: 40 }, 30, 15), { amount: 30, fee: 10, vat: 1.5, net: 18.5 }, "minimum");
    assert.deepEqual(feeExample({ fee_percentage: 20, min_fee_sar: 10, max_fee_sar: 40 }, 500, 15), { amount: 500, fee: 40, vat: 6, net: 454 }, "maximum");
    assert.deepEqual(feeExample({ fee_percentage: "12.5", min_fee_sar: "0", max_fee_sar: null }, 99.99, 15), { amount: 99.99, fee: 12.5, vat: 1.88, net: 85.61 });
    assert.deepEqual(feeExample({ fee_percentage: 0, min_fee_sar: 0, max_fee_sar: 0 }, 100, 15), { amount: 100, fee: 0, vat: 0, net: 100 });
  });
  it("never shows an example for an empty or invalid amount, and the fee never exceeds the amount", () => {
    assert.equal(feeExample({ fee_percentage: 20, min_fee_sar: 10, max_fee_sar: 40 }, 0, 15), null);
    assert.equal(feeExample({ fee_percentage: 20, min_fee_sar: 10, max_fee_sar: 40 }, Number.NaN, 15), null);
    assert.equal(feeExample({ fee_percentage: 20, min_fee_sar: 10, max_fee_sar: 40 }, 5, null).fee, 5);
  });
});

describe("parseReconciliationRows", () => {
  it("reads settlement and bank lines, skips a header and refuses malformed or duplicate lines", () => {
    const settlement = parseReconciliationRows("settlement_id,amount\nstl_1,500\nstl_2,12.5", "tap_settlement_file");
    assert.deepEqual(settlement.rows.map((r) => [r.object_type, r.tap_object_id, r.amount]), [["settlement", "stl_1", "500.00"], ["settlement", "stl_2", "12.50"]]);
    const bank = parseReconciliationRows("line-1,495.00,stl_1\nline-1,1,stl_2\nbad line\nline-3,1.234,stl_3", "bank_statement");
    assert.equal(bank.rows.length, 1);
    assert.deepEqual(bank.errors.map((e) => e.line), [2, 3, 4]);
    assert.equal(bank.rows[0].reference, "stl_1");
  });
});

describe("validVatNumber", () => {
  it("accepts 15 digits starting and ending with 3 only", () => {
    assert.equal(validVatNumber("300000000000003"), true);
    for (const bad of ["300000000000004", "200000000000003", "30000000000003", "3000000000000003", "30000000000000a"]) assert.equal(validVatNumber(bad), false, bad);
  });
});

describe("money screens call their server commands", () => {
  it("D-Q8: fee changes are proposals with a start date, settlement needs a bank reference", () => {
    const rules = read("app/admin/platform-rules/page.tsx");
    assert.match(rules, /rpc\("admin_propose_fee_rule_change"/);
    assert.match(rules, /p_effective_from/);
    assert.match(rules, /rpc\("admin_fee_rule_versions"\)/);
    assert.doesNotMatch(rules, /admin_save_fee_rule/);
    const ledger = read("app/admin/ledger/page.tsx");
    assert.match(ledger, /p_bank_reference/);
    assert.match(ledger, /releasePendingMsg/);
  });

  it("D-Q7: programmes change only through proposals; customers accept the published terms", () => {
    const settings = read("app/admin/settings/page.tsx");
    assert.doesNotMatch(settings, /"loyalty_program"|"referral_program"/, "no direct save of programme values");
    const panel = read("app/admin/settings/reward-programmes.tsx");
    for (const command of ["admin_reward_programs", "admin_propose_reward_program", "admin_publish_reward_terms"]) assert.match(panel, new RegExp(`rpc\\("${command}"`));
    assert.match(panel, /soloWarning/);
    const terms = read("components/reward-terms.tsx");
    assert.match(terms, /rpc\("reward_program_status"/);
    assert.match(terms, /rpc\("accept_reward_terms"/);
    assert.match(read("app/customer/wallet/page.tsx"), /<RewardTerms program="referral"/);
  });

  it("D-Q9: the reconciliation screen runs, imports, proposes corrections and checks with Tap", () => {
    const page = read("app/admin/reconciliation/page.tsx");
    for (const call of ['rpc("admin_reconciliation_overview"', 'rpc("run_tap_reconciliation"', 'rpc("admin_import_reconciliation_file"',
      'rpc("admin_propose_break_resolution"', 'invoke("check-refund-status"', 'invoke("reconcile-psp"']) assert.ok(page.includes(call), call);
    assert.doesNotMatch(page, /\.from\("(reconciliation_breaks|tap_reconciliation_events|transactional_ledger)"\)\s*\.(insert|update|delete|upsert)/);
    assert.match(read("app/admin/layout.tsx"), /\/admin\/reconciliation/);
  });

  it("D-D3: no free-standing commission percentage; the effective fee terms are shown instead", () => {
    const pricing = read("app/provider/pricing/page.tsx");
    assert.match(pricing, /<EffectiveFeeTerms locale=\{locale\} mode="provider" \/>/);
    for (const invented of ["20% commission", "Custom Platform Commission", "(Discounted!)", "remaining 85%", "width: \"15%\""]) {
      assert.ok(!pricing.includes(invented), `${invented} is gone`);
    }
    const providers = read("app/admin/providers/provider-management.tsx");
    assert.match(providers, /<EffectiveFeeTerms /);
    assert.doesNotMatch(providers, /\{t\.recordedCommission\}|\[t\.recordedCommission,/);
    const component = read("components/effective-fee-terms.tsx");
    assert.match(component, /rpc\("provider_effective_fee_terms"/);
    assert.match(component, /rpc\("provider_set_vat_status"/);
    assert.match(component, /VAT/);
    assert.match(component, /ضريبة القيمة المضافة/);
    const onboarding = read("app/become-provider/page.tsx");
    assert.match(onboarding, /vat_registration_status: appForm\.vatStatus/);
  });
});
