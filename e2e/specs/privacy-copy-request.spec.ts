// A customer's request for a copy of their data (PRIV, Q1/Q2): the server accepts it only after a sign-in by one-time code
// to the account's verified e-mail in the last 10 minutes, so the screen asks for the code (read here from the local
// Mailpit), refuses a wrong one, then sends the request; it is recorded with a 30-day answer date and shows in "My requests".
// The answer date is checked against the database's own received time, never against the test machine's calendar.

import { test, expect } from "../fixtures";
import { one } from "../support/db";
import { mailCount, nextEmailCode } from "../support/mailpit";

// The wrong code below is refused on purpose by GoTrue's /verify; the browser logs that refused request.
const WRONG_CODE_REFUSAL = [/status of 4\d\d.*\/auth\/v1\/verify/];

type Recorded = { request_type: string; status: string; days: number; channel: string };
const recorded = (customerId: string) => one<Recorded>(`
  select request_type, status::text as status, channel::text as channel,
         round(extract(epoch from (due_at - received_at)) / 86400)::int as days
    from public.privacy_requests where subject_id = '${customerId}'`);

test("copy request: code required, a wrong code refused, the mailed code sends it (EN, 1440 px)", async ({ factory, openAs }) => {
  const customer = await factory.customer();
  const { page, errors } = await openAs(customer, { locale: "en", width: "desktop" });
  await page.goto("/customer/privacy");
  await expect(page.getByRole("heading", { name: "Privacy & my data", level: 1 })).toBeVisible();
  await expect(page.getByText("You have not made any privacy request.")).toBeVisible();

  await page.getByRole("radio", { name: "A copy of my data (JSON and PDF)" }).check();
  await page.getByRole("button", { name: "Send the request" }).click();
  const verify = page.getByRole("region", { name: "Confirm it is you" });
  await expect(verify).toContainText(customer.email);
  const seen = await mailCount(customer.email);
  await verify.getByRole("button", { name: "Send the code" }).click();
  const code = await nextEmailCode(customer.email, seen);

  const wrong = `${code.slice(0, 5)}${(Number(code[5]) + 1) % 10}`;
  await verify.getByLabel("6-digit code").fill(wrong);
  await verify.getByRole("button", { name: "Confirm" }).click();
  await expect(verify.getByRole("alert")).toBeVisible();
  // Nothing was recorded on a wrong code.
  expect(one<{ n: number }>(`select count(*)::int as n from public.privacy_requests where subject_id = '${customer.id}'`).n).toBe(0);

  await verify.getByLabel("6-digit code").fill(code);
  await verify.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("status")).toHaveText(/^We received your Copy request\. We will answer by .+; it is free of charge\.$/);
  await expect(verify).toHaveCount(0);

  expect(recorded(customer.id)).toMatchObject({ request_type: "copy", days: 30 });
  await expect(page.getByRole("heading", { name: "My requests" })).toBeVisible();
  await expect(page.getByText("You have not made any privacy request.")).toHaveCount(0);
  expect(errors.unexpected(WRONG_CODE_REFUSAL)).toEqual([]);
});

test("copy request in Arabic on a phone: the code step and the confirmation read in Arabic", async ({ factory, openAs }) => {
  const customer = await factory.customer();
  const { page, errors } = await openAs(customer, { locale: "ar", width: "phone" });
  await page.goto("/customer/privacy");
  await expect(page.getByRole("heading", { name: "الخصوصية وبياناتي", level: 1 })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  await page.getByRole("radio", { name: "نسخة من بياناتي (JSON وPDF)" }).check();
  await page.getByRole("button", { name: "إرسال الطلب" }).click();
  const verify = page.getByRole("region", { name: "تأكيد هويتك" });
  const seen = await mailCount(customer.email);
  await verify.getByRole("button", { name: "إرسال الرمز" }).click();
  const code = await nextEmailCode(customer.email, seen);
  await verify.getByLabel("رمز من ٦ أرقام").fill(code);
  await verify.getByRole("button", { name: "تأكيد" }).click();
  await expect(page.getByRole("status")).toHaveText(/^استلمنا طلب نسخة\. سنرد قبل .+، والطلب مجاني\.$/);

  expect(recorded(customer.id)).toMatchObject({ request_type: "copy", days: 30 });
  expect(errors.unexpected()).toEqual([]);
});
