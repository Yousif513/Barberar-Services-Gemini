import { test, expect } from "../fixtures";

test("a customer selecting the provider portal reaches public onboarding after signing in", async ({ factory, openAs }) => {
  const customer = await factory.customer();
  const { page, errors } = await openAs(null, { locale: "en" });
  await page.goto("/login?portal=provider");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(customer.email);
  await page.getByLabel("Password", { exact: true }).fill(customer.password);
  await page.getByRole("button", { name: "Enter portal" }).click();
  await expect(page).toHaveURL(/\/become-provider$/);
  expect(errors.unexpected()).toEqual([]);
});

test("a protected destination survives sign-in, profile changes survive reload, and sign-out ends local access", async ({ factory, openAs }) => {
  const customer = await factory.customer();
  const { page, errors } = await openAs(null, { locale: "en" });
  await page.goto("/customer/settings?from=booking");
  await expect(page).toHaveURL(/\/login\?returnUrl=/);
  expect(new URL(page.url()).searchParams.get("returnUrl")).toBe("/customer/settings?from=booking");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(customer.email);
  await page.getByLabel("Password", { exact: true }).fill(customer.password);
  await page.getByRole("button", { name: "Enter portal" }).click();
  await expect(page).toHaveURL(/\/customer\/settings\?from=booking$/);
  await page.getByLabel("First Name", { exact: true }).fill("Amal");
  await page.getByRole("button", { name: "Save Profile Settings" }).click();
  await expect(page.getByText("Settings updated successfully.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("First Name", { exact: true })).toHaveValue("Amal");
  await page.getByRole("button", { name: "Log Out", exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await page.goto("/customer/settings");
  await expect(page).toHaveURL(/\/login\?returnUrl=/);
  expect(errors.unexpected()).toEqual([]);
});
