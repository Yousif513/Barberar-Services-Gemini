import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ADM1: the screens and Edge Functions call the reasoned commands the database provides, and nothing writes the tables directly.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

describe("ADM1 item 1: commercial registration is cleared before an application is approved", () => {
  const screen = read("web_platform/src/app/admin/providers/provider-management.tsx");
  const wathq = read("supabase/functions/wathq-verify/index.ts");

  it("the application list offers the Wathq check and the manual review and shows the check state", () => {
    assert.match(screen, /cr_verification_status\?: string \| null/);
    assert.match(screen, /admin_confirm_application_cr/);
    assert.match(screen, /applicationId: app\.id/);
    assert.match(screen, /crIsCleared\(approvalModalApp\)/);
  });

  it("wathq-verify records applications through record_wathq_application_check and passes the registered name", () => {
    assert.match(wathq, /record_wathq_application_check/);
    assert.match(wathq, /record_wathq_cr_verification/);
    assert.match(wathq, /crName:/);
    assert.match(wathq, /applicationId/);
    assert.match(wathq, /name_mismatch/);
  });
});

describe("ADM1 item 2: send-push sends only what claim_push_batch returns", () => {
  const push = read("supabase/functions/send-push/index.ts");
  it("claims a batch, reports every outcome and keeps the service-role caller check", () => {
    assert.match(push, /claim_push_batch/);
    assert.match(push, /complete_push_delivery/);
    assert.match(push, /!serviceKeyMatches\(/); // P-13: a timing-safe comparison of the service key, never ===
    assert.doesNotMatch(push, /const \{ title, body, token, data \}/, "the caller no longer chooses recipient or text");
  });
});

describe("ADM1 item 3: failed financial lists are errors with a retry, not empty tables", () => {
  const ledger = read("web_platform/src/app/admin/ledger/page.tsx");
  const notifications = read("web_platform/src/app/admin/notifications/page.tsx");
  it("the ledger records each list failure and offers a retry for payout requests, reconciliation runs and fee invoices", () => {
    for (const [state, loader] of [["requestsError", "loadPayoutRequests"], ["reconError", "loadReconciliationRuns"], ["feeInvoicesError", "loadFeeInvoices"]]) {
      assert.ok(ledger.includes(`set${state[0].toUpperCase()}${state.slice(1)}(errorMessage(err))`), `${state} is set from the failure`);
      assert.ok(ledger.includes(`onClick={() => void ${loader}()}`), `${loader} is the retry`);
    }
    assert.doesNotMatch(ledger, /console\.warn\("(Payout request|Reconciliation runs|Fee invoices) load warning/);
    assert.match(ledger, /listFailed: "تعذّر/);
  });
  it("the message log reads every query's error and shows it with a retry", () => {
    assert.match(notifications, /if \(logsFailure\) throw logsFailure/);
    assert.match(notifications, /setLogsError\(/);
    assert.match(notifications, /onClick=\{\(\) => void loadData\(\)\}/);
    assert.doesNotMatch(notifications, /console\.warn\("Failed to load message log data/);
    assert.match(notifications, /logsFailed: "تعذّر/);
  });
});

describe("ADM1 item 4: coupons change only through the reasoned commands", () => {
  const coupons = read("web_platform/src/app/admin/coupons/page.tsx");
  it("saves and switches codes through admin_save_promo_code and admin_set_promo_code_active, never by table write", () => {
    assert.match(coupons, /rpc\("admin_save_promo_code"/);
    assert.match(coupons, /rpc\("admin_set_promo_code_active"/);
    assert.doesNotMatch(coupons, /from\("promotional_codes"\)\s*\.(insert|update|delete|upsert)/);
    assert.match(coupons, /p_per_customer_limit/);
    assert.match(coupons, /p_first_booking_only/);
    assert.match(coupons, /<CommandDialog/);
    assert.match(coupons, /perCustomerLabel: "مرات الاستخدام لكل عميل"/, "Arabic copy for the new fields");
  });
});

describe("ADM1 item 5 and 7: roles, flags and fee rules are screens over the commands, reachable from the navigation", () => {
  const roles = read("web_platform/src/app/admin/roles/page.tsx");
  const rules = read("web_platform/src/app/admin/platform-rules/page.tsx");
  const layout = read("web_platform/src/app/admin/layout.tsx");
  const config = read("web_platform/next.config.ts");

  it("the role screen lists through admin_role_directory and changes roles through set_user_role with the reason", () => {
    assert.match(roles, /rpc\("admin_role_directory"/);
    assert.match(roles, /rpc\("set_user_role", \{ target_user_id: person\.id, target_role: next, p_reason: reason \}\)/);
    assert.doesNotMatch(roles, /\.from\("profiles"\)\s*\.(update|upsert|insert)/);
    assert.match(roles, /<CommandDialog/);
    assert.match(roles, /selfHint: "لا يمكنك/, "Arabic copy for the self-change refusal");
  });

  it("flags, fee rules and API settings change only through their commands", () => {
    for (const command of ["admin_set_feature_flag", "admin_save_fee_rule", "admin_set_api_setting"]) assert.ok(rules.includes(`rpc("${command}"`), command);
    assert.doesNotMatch(rules, /\.from\("(platform_feature_flags|fee_rules|platform_settings)"\)\s*\.(update|upsert|insert|delete)/);
    assert.match(rules, /confirmWord=\{flagPending\.next/, "turning a flag on needs the flag name typed");
    assert.match(rules, /retry/i);
    assert.match(rules, /apiIntro: "حدود/);
  });

  it("both screens are in the navigation in both languages and /admin/roles is no longer redirected away", () => {
    assert.match(layout, /nameKey: "roles", path: "\/admin\/roles"/);
    assert.match(layout, /nameKey: "platformRules", path: "\/admin\/platform-rules"/);
    assert.match(layout, /platformRules: "Platform Rules"/);
    assert.match(layout, /platformRules: "قواعد المنصة"/);
    assert.doesNotMatch(config, /source: "\/admin\/roles"/);
  });
});

describe("ADM1 item 6: the funnel is a read-only card on the reports screen", () => {
  const reports = read("web_platform/src/app/admin/reports/page.tsx");
  it("reads admin_get_event_counts for the chosen period, shows failures with a retry and both languages", () => {
    assert.match(reports, /rpc\("admin_get_event_counts", \{ p_start_date: range\.from, p_end_date: range\.to \}\)/);
    assert.match(reports, /<FunnelSection range=\{range\} lang=\{lang\} \/>/);
    assert.match(reports, /failed: "تعذّر تحميل الأحداث/);
    assert.match(reports, /t\.retry/);
    assert.doesNotMatch(reports, /from\("analytics_events"\)/, "the card uses the command, not the table");
  });
});
