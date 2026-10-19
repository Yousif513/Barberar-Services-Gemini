// Maker-checker (GOV-1, H-2): a console role grant requested by one owner waits for a different owner. The maker is offered
// no decision and the server refuses one; the checker decides on the Approvals screen, and because the checker's last
// authenticator code is older than 5 minutes, the database asks for a fresh one (step-up) before the decision runs.
// "Older than 5 minutes" is reached by ageing the checker's verification record on the server, not by waiting.

import { randomBytes } from "node:crypto";
import { test, expect, consoleReady } from "../fixtures";
import { ageAuthenticatorVerification } from "../support/auth";
import { one } from "../support/db";
import { rpc } from "../support/api";
import { totp } from "../support/totp";

// The step-up refusal the checker's first attempt receives is designed: the browser logs it as a resource error.
const STEP_UP_REFUSAL = [/status of 403.*\/rest\/v1\/rpc\/admin_decide_approval/];

test("a second owner approves a console role grant after a fresh authenticator code; the maker cannot", async ({ factory, openAs }) => {
  const tag = randomBytes(3).toString("hex");
  const maker = await factory.consoleUser("owner", { firstName: "Maker" });
  const checker = await factory.consoleUser("owner", { firstName: "Checker" });
  const target = await factory.customer({ firstName: "Target", lastName: `Grant${tag}` });
  const targetName = `Target Grant${tag}`;

  const requested = await rpc("admin_set_console_role", { p_user_id: target.id, p_admin_role: "finance", p_reason: `Finance cover for month end ${tag}` }, maker.session.access_token);
  expect(requested.status, JSON.stringify(requested.json)).toBe(200);
  const approvalId = String(requested.json.approval_id);
  expect(one<{ admin_role: string | null }>(`select (select admin_role from public.admin_role_assignments where user_id = '${target.id}') as admin_role`).admin_role).toBeNull();

  // The maker sees the request but is offered no decision, and the server refuses one.
  {
    const { page, errors } = await openAs(maker, { locale: "en", width: "desktop" });
    await page.goto("/admin/approvals");
    await consoleReady(page);
    const row = page.getByRole("row").filter({ hasText: targetName });
    await expect(row).toContainText("Console role grant");
    await expect(row.getByRole("button", { name: /^Approve/ })).toHaveCount(0);
    const refused = await rpc("admin_decide_approval", { p_request_id: approvalId, p_decision: "approve", p_reason: "Approving my own request" }, maker.session.access_token);
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(errors.unexpected()).toEqual([]);
  }

  // The checker last verified a code 10 minutes ago: approving asks for a fresh one first.
  checker.session = await ageAuthenticatorVerification(checker.session, 10);
  const { page, errors } = await openAs(checker, { locale: "en", width: "desktop" });
  await page.goto("/admin/approvals");
  await consoleReady(page);
  const row = page.getByRole("row").filter({ hasText: targetName });
  await row.getByRole("button", { name: "Approve: Console role grant" }).click();
  const decision = page.getByRole("dialog", { name: "Approve: Console role grant" });
  await expect(decision).toContainText(targetName);
  await decision.getByLabel("Why are you deciding this way?").fill(`Checked with the finance lead ${tag}`);
  await decision.getByRole("button", { name: "Approve", exact: true }).click();

  const stepUp = page.getByRole("dialog", { name: "Confirm it is you" });
  await expect(stepUp).toBeVisible();
  await stepUp.getByLabel("6-digit code from your authenticator app").fill(totp(checker.factor!.secret));
  await stepUp.getByRole("button", { name: "Confirm" }).click();
  await expect(stepUp).toHaveCount(0);
  await expect(decision).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: targetName })).toHaveCount(0);

  const state = one<{ status: string; decided_by: string; admin_role: string; role: string }>(`
    select r.status, r.decided_by::text as decided_by, a.admin_role, p.role::text as role
      from public.admin_approval_requests r
      join public.admin_role_assignments a on a.user_id = '${target.id}'
      join public.profiles p on p.id = '${target.id}'
     where r.id = '${approvalId}'`);
  expect(state).toMatchObject({ decided_by: checker.id, admin_role: "finance", role: "admin" });
  expect(["approved", "executed"]).toContain(state.status);
  expect(errors.unexpected(STEP_UP_REFUSAL)).toEqual([]);
});

test("Arabic on a phone: a second owner rejects a role grant and nothing is granted", async ({ factory, openAs }) => {
  const tag = randomBytes(3).toString("hex");
  const maker = await factory.consoleUser("owner", { firstName: "Maker" });
  const checker = await factory.consoleUser("owner", { firstName: "Checker" });
  const target = await factory.customer({ firstName: "Target", lastName: `Reject${tag}` });
  const requested = await rpc("admin_set_console_role", { p_user_id: target.id, p_admin_role: "owner", p_reason: `Second owner cover ${tag} please` }, maker.session.access_token);
  expect(requested.status, JSON.stringify(requested.json)).toBe(200);

  const { page, errors } = await openAs(checker, { locale: "ar", width: "phone" });
  await page.goto("/admin/approvals");
  await consoleReady(page);
  const item = page.getByRole("listitem").filter({ hasText: `Target Reject${tag}` });
  await item.getByRole("button", { name: "رفض: منح دور في لوحة الإدارة" }).click();
  const decision = page.getByRole("dialog", { name: /منح دور في لوحة الإدارة/ });
  await decision.getByLabel("ما سبب قرارك؟").fill(`لا حاجة لهذا الدور الآن ${tag}`);
  await decision.getByRole("button", { name: "رفض", exact: true }).click();
  await expect(decision).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ hasText: `Target Reject${tag}` })).toHaveCount(0);

  const state = one<{ status: string; admin_role: string | null; role: string }>(`
    select r.status, (select admin_role from public.admin_role_assignments where user_id = '${target.id}') as admin_role, p.role::text as role
      from public.admin_approval_requests r join public.profiles p on p.id = '${target.id}'
     where r.id = '${requested.json.approval_id}'`);
  expect(state).toEqual({ status: "rejected", admin_role: null, role: "customer" });
  expect(errors.unexpected()).toEqual([]);
});
