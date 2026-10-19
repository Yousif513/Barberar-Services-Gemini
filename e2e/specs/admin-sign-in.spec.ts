// Admin sign-in with an authenticator app (GOV-1 / Q6): password, then TOTP enrolment on first sign-in, a TOTP challenge
// on every later sign-in, and the database refusing any console session that has not verified a code (aal1).

import { test, expect, consoleReady } from "../fixtures";
import { aal2Session, passwordSession } from "../support/auth";
import { one } from "../support/db";
import { rpc } from "../support/api";
import { totp, wrongTotp } from "../support/totp";

// The wrong code below is refused on purpose; the browser logs that refused request as a resource error.
const DESIGNED_REFUSAL = [/status of 4\d\d.*\/auth\/v1\/factors\/[^/]+\/verify/];

test("first sign-in: password, authenticator enrolment with a refused wrong code, then the console", async ({ factory, openAs }) => {
  const account = await factory.consoleAccount("owner");
  const { page, errors } = await openAs(null, { locale: "en", width: "desktop" });

  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Enter portal" }).click();

  // The console sends an administrator without a verified code to enrol one.
  await expect(page).toHaveURL(/\/login\/mfa\?next=%2Fadmin|\/login\/mfa\?next=\/admin/);
  await expect(page.getByRole("heading", { name: "Set up your authenticator app" })).toBeVisible();
  const secret = (await page.locator("main code").innerText()).trim();
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);

  const code = page.getByLabel("6-digit code");
  await code.fill(wrongTotp(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login\/mfa/);

  await code.fill(totp(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await consoleReady(page);
  await expect(page.getByRole("navigation", { name: "Console navigation" }).first()).toBeVisible();

  const factor = one<{ status: string }>(`select status::text as status from auth.mfa_factors where user_id = '${account.id}'`);
  expect(factor.status).toBe("verified");
  expect(errors.unexpected(DESIGNED_REFUSAL)).toEqual([]);
});

test("later sign-in in Arabic on a phone: the enrolled authenticator is challenged, then the console opens", async ({ factory, openAs }) => {
  const account = await factory.consoleAccount("finance");
  await aal2Session(account); // enrols and verifies the factor once, as the first sign-in would
  const { page, errors } = await openAs(null, { locale: "ar", width: "phone" });

  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("button", { name: "البريد", exact: true }).click();
  await page.getByLabel("البريد الإلكتروني").fill(account.email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "دخول البوابة" }).click();

  await expect(page.getByRole("heading", { name: "أدخل رمز تطبيق المصادقة" })).toBeVisible();
  // No new secret is shown once a factor is verified.
  await expect(page.locator("main code")).toHaveCount(0);
  await page.getByLabel("الرمز المكوّن من ٦ أرقام").fill(totp(account.factor!.secret));
  await page.getByRole("button", { name: "تحقق" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await consoleReady(page);
  await expect(page.getByRole("button", { name: "فتح القائمة" })).toBeVisible();
  expect(errors.unexpected()).toEqual([]);
});

test("the database refuses a console session that signed in with a password only (aal1)", async ({ factory }) => {
  const account = await factory.consoleAccount("owner");
  await aal2Session(account);
  const aal1 = await passwordSession(account);
  for (const [name, args] of [["admin_dashboard_overview", {}], ["admin_booking_directory", { p_limit: 5 }], ["admin_list_audit_events", { p_limit: 1, p_purpose: "audit_review" }]] as const) {
    const reply = await rpc(name, args, aal1.access_token);
    expect(reply.status, `${name} answered an aal1 session`).toBeGreaterThanOrEqual(400);
  }
  const aal2 = await aal2Session(account);
  expect((await rpc("admin_dashboard_overview", {}, aal2.access_token)).status).toBe(200);
});
