// Every admin route loads for a console owner (the role that can open all of them) with zero browser console errors and no
// uncaught exception, in English and Arabic, at 375 px and 1440 px. The old addresses the console replaced redirect on the
// server to the screen that took over their job.

import { test as base, expect, consoleReady, type Locale, type Width } from "../fixtures";
import { aal2Session, createAccount, deleteAccount, type Account } from "../support/auth";
import { lit, sql } from "../support/db";
import { trackNetwork } from "../support/settle";
import { stack } from "../support/stack";

const ADMIN_ROUTES = [
  "/admin", "/admin/bookings", "/admin/providers", "/admin/customers", "/admin/services", "/admin/packages", "/admin/reviews",
  "/admin/disputes", "/admin/approvals", "/admin/ledger", "/admin/refunds", "/admin/reconciliation", "/admin/reports",
  "/admin/employees", "/admin/branches", "/admin/supply", "/admin/whatsapp", "/admin/sponsored", "/admin/taxes", "/admin/coupons",
  "/admin/roles", "/admin/platform-rules", "/admin/privacy", "/admin/incidents", "/admin/ropa", "/admin/activity",
  "/admin/notifications", "/admin/audit-logs", "/admin/integrations", "/admin/settings", "/admin/help",
];

const REDIRECTS: Record<string, string> = {
  "/admin/analytics": "/admin/reports", "/admin/commissions": "/admin/taxes", "/admin/locations": "/admin/branches",
  "/admin/orders": "/admin/bookings", "/admin/payments": "/admin/ledger", "/admin/rooms": "/admin/branches",
  "/admin/system-logs": "/admin/audit-logs", "/admin/teams": "/admin/employees", "/admin/webhooks": "/admin/audit-logs",
};

// One console owner per worker; every test signs it in afresh (its own session), so no two tests share a session.
const test = base.extend<{}, { sweepOwner: Account }>({
  sweepOwner: [async ({}, use) => {
    const account = await createAccount("sweep-owner");
    sql(`update public.profiles set role = 'admin', first_name = 'Sweep', last_name = 'Owner' where id = ${lit(account.id)};
         insert into public.admin_role_assignments (user_id, admin_role, reason) values (${lit(account.id)}, 'owner', 'End-to-end route sweep (throw-away)')
         on conflict (user_id) do update set admin_role = excluded.admin_role;`);
    await use(account);
    await deleteAccount(account.id);
  }, { scope: "worker" }],
});

for (const route of ADMIN_ROUTES) {
  for (const locale of ["en", "ar"] as Locale[]) {
    for (const width of ["phone", "desktop"] as Width[]) {
      test(`${route} loads cleanly (${locale.toUpperCase()}, ${width === "phone" ? 375 : 1440} px)`, async ({ sweepOwner, openAs }) => {
        const person = { ...sweepOwner, session: await aal2Session(sweepOwner) };
        const { page, errors } = await openAs(person, { locale, width });
        const settled = trackNetwork(page);
        await page.goto(route);
        await consoleReady(page);
        await settled();
        expect.soft(errors.unexpected(), `console errors on ${route}`).toEqual([]);
        await expect.soft(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
        await expect.soft(page.locator("#admin-main").getByRole("heading").first()).toBeVisible();
        await expect.soft(page.getByText(locale === "ar" ? "ليس لديك صلاحية الوصول إلى هذه الشاشة" : "You do not have access to this screen")).toHaveCount(0);
      });
    }
  }
}

// APP DEFECT (accessibility, WCAG 2.4.6 / 1.3.1): these screens title themselves with an h2 and have no h1, unlike the rest
// of the console. Expected to fail until they get a page heading; when it starts passing, remove test.fail.
const SCREENS_WITHOUT_H1 = ["/admin/services", "/admin/packages", "/admin/reviews", "/admin/branches", "/admin/coupons",
  "/admin/activity", "/admin/notifications", "/admin/integrations", "/admin/help"];

test("every admin screen has one page heading (h1)", async ({ sweepOwner, openAs }) => {
  test.fail(true, `APP DEFECT: no h1 on ${SCREENS_WITHOUT_H1.join(", ")}`);
  test.setTimeout(600_000);
  const person = { ...sweepOwner, session: await aal2Session(sweepOwner) };
  const { page } = await openAs(person, { locale: "en", width: "desktop" });
  const settled = trackNetwork(page);
  const missing: string[] = [];
  for (const route of ADMIN_ROUTES) {
    await page.goto(route);
    await consoleReady(page);
    await settled();
    if ((await page.locator("#admin-main h1").count()) !== 1) missing.push(route);
  }
  expect(missing).toEqual([]);
});

test("the old admin addresses redirect on the server to the screen that replaced them", async ({ request }) => {
  for (const [from, to] of Object.entries(REDIRECTS)) {
    const reply = await request.get(`${stack().baseURL}${from}`, { maxRedirects: 0 });
    expect(reply.status(), from).toBe(307);
    expect(new URL(reply.headers().location, stack().baseURL).pathname, from).toBe(to);
  }
});
