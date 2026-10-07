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
    assert.match(push, /authorization !== `Bearer \$\{serviceKey\}`/);
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
