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

describe("memberships and packages: refunds on cancellation and the customer's dispute path (RT-H2, RT-M3)", () => {
  const customerMemberships = read("src/app/customer/memberships/page.tsx");
  const customerPackages = read("src/app/customer/packages/page.tsx");
  const providerMemberships = read("src/app/provider/memberships/page.tsx");
  const shared = read("src/lib/purchase-disputes.ts");

  it("customers report a problem through the server command only, in English and Arabic, with a 10-character reason", () => {
    assert.match(shared, /rpc\("open_purchase_dispute", \{ p_purchase_type: type, p_purchase_id: id, p_reason: reason \}\)/);
    assert.match(shared, /status !== "opened"\) throw/, "a report is shown as sent only when the server recorded it");
    assert.match(shared, /report: "Report a problem"/);
    assert.match(shared, /report: "الإبلاغ عن مشكلة"/);
    for (const page of [customerMemberships, customerPackages]) {
      assert.match(page, /openPurchaseDispute\("(membership|package)"/);
      assert.match(page, /minReasonLength=\{10\}/);
      assert.match(page, /loadPurchaseMoney\("(membership|package)"/);
      assert.match(page, /disputeLabel\(d\.status, locale\)/);
      assert.match(page, /refundStates\[r\.status\]/);
      assert.doesNotMatch(page, /from\("payment_disputes"\)\s*\.(insert|update|upsert|delete)/);
    }
    assert.match(shared, /if \(disputes\.error\) throw disputes\.error;/, "a failed read is an error, not an empty list");
  });

  it("cancelling shows the refund the server will make before the person confirms, and reports what was refunded", () => {
    for (const page of [customerMemberships, providerMemberships]) {
      assert.match(page, /rpc\("preview_membership_cancellation", \{ p_membership_id: /);
      assert.match(page, /refund_amount/);
      assert.match(page, /rpc\("cancel_membership"/);
    }
    assert.doesNotMatch(customerMemberships, /does not refund a payment/);
    assert.doesNotMatch(providerMemberships, /does not refund a payment/);
    assert.match(customerMemberships, /cancelIntro: "يُنهي الإلغاء عضويتك الآن/);
    assert.match(providerMemberships, /greater of the unused visits and the unused time/);
  });

  it("a bought package shows the terms it was bought with, not the package's live row", () => {
    assert.match(customerPackages, /const totalSessions = item\.session_count \|\| 1;/);
    assert.match(customerPackages, /item\.package_name_ar \|\| item\.package_name_en/);
    assert.match(customerPackages, /sar\(Number\(item\.amount_paid\), locale\)/);
  });

  it("the console names purchase disputes and the two new approval kinds in both languages", () => {
    const disputes = read("src/app/admin/disputes/page.tsx");
    assert.match(disputes, /subjectMembership: "Membership"/);
    assert.match(disputes, /subjectMembership: "العضوية"/);
    const approvals = read("src/app/admin/approvals/page.tsx");
    for (const kind of ["refund_outcome", "membership_cancellation"]) {
      assert.equal(count(approvals, new RegExp(`${kind}: "`, "g")), 2, `${kind} has an English and an Arabic label`);
      assert.match(approvals, new RegExp(`row\.kind === "${kind}"`));
    }
  });
});
