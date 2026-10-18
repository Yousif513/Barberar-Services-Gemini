import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// PAY-WAVE2 source guards for the screens that changed. Behaviour (money, approvals, refusals) is executed against the migrated
// schema in supabase/tests/db/paywave2_*.test.mjs; these guards keep the wiring from breaking silently.
const webRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");
const count = (source, pattern) => (source.match(pattern) ?? []).length;

describe("refunds console: unknown refund outcomes (QA item 4)", () => {
  const page = read("src/app/admin/refunds/page.tsx");

  it("lists unknown refunds on their own filter and names the status in English and Arabic", () => {
    assert.match(page, /type Filter = "attention" \| "unknown"/);
    assert.equal(count(page, /unknown: "Outcome unknown"/g), 2, "filter and status label in English");
    assert.equal(count(page, /unknown: "النتيجة غير معروفة"/g), 2, "filter and status label in Arabic");
    assert.match(page, /row\.status === "unknown" && \(/, "the status cell explains an unknown outcome");
  });

  it("offers no retry for an unknown refund, only Check with Tap and a decision that a second person approves", () => {
    const actions = page.slice(page.indexOf('{row.status === "unknown" ? ('), page.indexOf(') : canRetry ? ('));
    assert.ok(actions.length > 0, "the unknown branch comes before the retry branch");
    assert.doesNotMatch(actions, /kind: "retry"/);
    assert.match(actions, /checkWithTap\(row\)/);
    assert.match(actions, /kind: "paidAtTap"/);
    assert.match(actions, /kind: "notPaidAtTap"/);
    assert.match(actions, /row\.pending_decision_id \?/, "a decision already waiting is shown instead of a second request");
    assert.match(page, /const canRetry = row\.status === "pending" \|\| row\.status === "failed";/);
  });

  it("calls only the audited commands and the read-only Tap check; the decision cites the Tap refund id", () => {
    assert.match(page, /functions\.invoke\("check-refund-status"/);
    assert.match(page, /rpc\("admin_request_refund_outcome_decision"/);
    assert.match(page, /p_tap_refund_id: outcome === "refunded_at_tap" \? tapId\.trim\(\) : null/);
    assert.match(page, /field=\{paid \? \{ label: t\.tapIdLabel[^}]*pattern: TAP_REFUND_ID/);
    assert.match(page, /minReasonLength=\{10\}/);
    assert.match(page, /status !== "pending_approval"\) return t\.noOutcome/, "nothing is reported as done unless the request was recorded");
    assert.doesNotMatch(page, /from\("refund_requests"\)/);
    assert.match(page, /outcome\?\.status === "unknown"\) setNotice\(\{ error: t\.unknownOutcome \}\)/);
  });

  it("a stuck refund is marked unknown, not reopened for a retry", () => {
    assert.match(page, /reopen: "Mark outcome unknown"/);
    assert.doesNotMatch(page, /Reopening lets the refund be retried/);
    assert.match(page, /rpc\("admin_reopen_stuck_refund"/);
  });
});
