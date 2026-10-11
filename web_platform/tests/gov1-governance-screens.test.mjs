import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// GOV-1 (D-Q5, Q6, Q3): the console screens call the governance commands the database enforces. These checks keep the wiring;
// the authorization itself is tested against the migrated schema in supabase/tests/db/gov1_*.test.mjs.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

describe("MFA: aal2 for administrators, enrolment and challenge, step-up", () => {
  const guard = read("web_platform/src/components/auth-guard.tsx");
  const mfa = read("web_platform/src/app/login/mfa/page.tsx");
  const client = read("web_platform/src/lib/supabase.ts");
  const dialog = read("web_platform/src/components/step-up-dialog.tsx");
  const layout = read("web_platform/src/app/admin/layout.tsx");

  it("sends an administrator without an aal2 session to the MFA screen instead of erroring", () => {
    assert.match(guard, /getAuthenticatorAssuranceLevel\(\)/);
    assert.match(guard, /currentLevel !== "aal2"/);
    assert.match(guard, /router\.replace\(`\/login\/mfa\?next=/);
  });

  it("enrols a TOTP factor, verifies it, shows the lockout state, and follows only same-site next paths", () => {
    assert.match(mfa, /mfa\.enroll\(\{ factorType: "totp"/);
    assert.match(mfa, /mfa\.challengeAndVerify\(\{ factorId, code: digits \}\)/);
    assert.match(mfa, /rpc\("admin_session_state"\)/);
    assert.match(mfa, /value\.startsWith\("\/"\) && !value\.startsWith\("\/\/"\)/);
    assert.match(mfa, /enrolTitle: "إعداد تطبيق المصادقة"/, "Arabic copy");
  });

  it("asks for a fresh code when the database answers step_up_required, and repeats the request once", () => {
    assert.match(client, /global: \{ fetch: stepUpAwareFetch \}/);
    assert.match(client, /\(await responseHint\(response\)\) !== "step_up_required"/);
    assert.match(dialog, /registerStepUpHandler/);
    assert.match(dialog, /challengeAndVerify/);
    assert.match(layout, /<StepUpDialog \/>/);
  });

  it("ends an idle console session after 30 minutes and labels the console role", () => {
    assert.match(layout, /const IDLE_MS = 30 \* 60 \* 1000;/);
    assert.match(layout, /rpc\("admin_session_state"\)/);
    assert.match(layout, /\{ nameKey: "approvals", path: "\/admin\/approvals" \}/);
  });
});

describe("maker-checker inbox", () => {
  const approvals = read("web_platform/src/app/admin/approvals/page.tsx");
  it("lists through admin_approval_inbox and decides only through the governance commands", () => {
    for (const command of ["admin_approval_inbox", "admin_decide_approval", "admin_cancel_approval", "admin_break_glass_execute",
      "admin_sign_off_break_glass", "admin_request_setting_change", "admin_acknowledge_security_alert"]) {
      assert.ok(approvals.includes(`rpc("${command}"`), command);
    }
    assert.doesNotMatch(approvals, /\.from\("(admin_approval_requests|governance_settings|break_glass_reviews)"\)/);
    assert.match(approvals, /minReasonLength: 20/, "break-glass needs a 20-character justification");
    assert.match(approvals, /const refused = await decide\(row, "approve", reason\)/, "bulk approval is per item with per-item results");
    assert.match(approvals, /title: "الاعتمادات"/, "Arabic copy");
  });
});

describe("IBAN masking, reveal and change", () => {
  const ledger = read("web_platform/src/app/admin/ledger/page.tsx");
  const wallet = read("web_platform/src/app/provider/wallet/page.tsx");
  it("never selects the full IBAN, reveals it once for at most 60 seconds, and keeps it out of storage", () => {
    for (const screen of [ledger, wallet]) {
      assert.doesNotMatch(screen, /select\([^)]*\biban\b(?!_masked)/);
      assert.match(screen, /iban_masked/);
    }
    assert.match(ledger, /Date\.now\(\) \+ 60000/);
    assert.doesNotMatch(ledger, /localStorage|sessionStorage/);
  });

  it("changes the provider's account through the approved command, asking for a fresh sign-in, with no invented account", () => {
    assert.match(wallet, /rpc\("provider_request_payout_destination"/);
    assert.match(wallet, /rpc\("provider_payout_destination_summary"/);
    assert.match(wallet, /isReauthRequired\(rpcError\)/);
    assert.doesNotMatch(wallet, /SA82 2000/, "the placeholder IBAN is gone");
    assert.match(wallet, /p_iban: null/, "a payout request uses the approved account");
  });
});
