// Role-trimmed navigation (GOV-1): each console role is offered exactly the screens it can read, a hidden screen reached by
// its address shows the access notice instead of data, and the database refuses the hidden screen's read when it is called
// directly with that role's session. The expected screens per role are written out here from the role catalogue
// (admin_role_permissions), independently of the console's own code.

import { test, expect, consoleReady, type ConsoleRole } from "../fixtures";
import { rows } from "../support/db";
import { rpc } from "../support/api";

const OPEN_TO_EVERY_ROLE = [
  "/admin", "/admin/services", "/admin/packages", "/admin/approvals", "/admin/reports", "/admin/branches", "/admin/supply",
  "/admin/whatsapp", "/admin/sponsored", "/admin/taxes", "/admin/coupons", "/admin/roles", "/admin/ropa", "/admin/activity",
  "/admin/integrations",
];

const EXPECTED: Record<ConsoleRole, string[]> = {
  owner: [
    ...OPEN_TO_EVERY_ROLE, "/admin/bookings", "/admin/providers", "/admin/customers", "/admin/reviews", "/admin/disputes", "/admin/ledger",
    "/admin/refunds", "/admin/reconciliation", "/admin/employees", "/admin/platform-rules", "/admin/privacy", "/admin/incidents",
    "/admin/notifications", "/admin/audit-logs", "/admin/settings",
  ],
  finance: [
    ...OPEN_TO_EVERY_ROLE, "/admin/bookings", "/admin/disputes", "/admin/ledger", "/admin/refunds", "/admin/reconciliation",
    "/admin/employees", "/admin/platform-rules", "/admin/settings",
  ],
  operations: [
    ...OPEN_TO_EVERY_ROLE, "/admin/bookings", "/admin/providers", "/admin/customers", "/admin/reviews", "/admin/disputes",
    "/admin/employees", "/admin/privacy", "/admin/notifications",
  ],
  analyst: [...OPEN_TO_EVERY_ROLE],
};

// A screen each role must not open, and the server read behind it.
const HIDDEN: Record<Exclude<ConsoleRole, "owner">, { path: string; rpc: string; args: Record<string, unknown> }> = {
  finance: { path: "/admin/customers", rpc: "admin_customer_overview", args: { p_search: null, p_limit: 5, p_offset: 0, p_purpose: "customer_support" } },
  operations: { path: "/admin/ledger", rpc: "admin_list_ledger_entries", args: { p_from: null, p_to: null, p_provider_id: null, p_payout_status: null, p_limit: 5, p_offset: 0, p_purpose: "finance_operations" } },
  analyst: { path: "/admin/audit-logs", rpc: "admin_list_audit_events", args: { p_limit: 5, p_offset: 0, p_purpose: "audit_review" } },
};

test("the role catalogue still matches the expectations written in this spec", () => {
  const catalogue = rows<{ admin_role: string; permissions: string[] }>(
    "select admin_role, array_agg(permission order by permission) as permissions from public.admin_role_permissions group by 1 order by 1",
  );
  const byRole = Object.fromEntries(catalogue.map((row) => [row.admin_role, row.permissions]));
  expect(byRole.finance).toEqual(["break_glass.review", "iban.approve", "iban.reveal", "money.config", "money.ledger", "money.payout", "money.refund"]);
  expect(byRole.operations).toEqual(["operations.write", "personal.read", "privacy.manage"]);
  expect(byRole.analyst ?? []).toEqual([]);
  expect(byRole.owner).toEqual(expect.arrayContaining(["audit.read", "incident.manage", "personal.read", "money.ledger", "privacy.approve", "settings.manage", "roles.manage"]));
});

for (const role of ["owner", "finance", "operations", "analyst"] as const) {
  test(`${role}: the navigation offers exactly the screens the role can read`, async ({ factory, openAs }) => {
    const person = await factory.consoleUser(role);
    const { page, errors } = await openAs(person, { locale: "en", width: "desktop" });
    await page.goto("/admin");
    await consoleReady(page);
    const nav = page.getByRole("navigation", { name: "Console navigation" });
    // The navigation fills in once the console role is known.
    await expect(nav.getByRole("link", { name: "Approvals" })).toBeVisible();
    const offered = await nav.getByRole("link").evaluateAll((links) => links.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
    expect([...offered].sort()).toEqual([...EXPECTED[role]].sort());

    if (role !== "owner") {
      const hidden = HIDDEN[role];
      await page.goto(hidden.path);
      await expect(page.getByText("You do not have access to this screen")).toBeVisible();
      const refused = await rpc(hidden.rpc, hidden.args, person.session.access_token);
      expect(refused.status, `${hidden.rpc} answered the ${role} role`).toBeGreaterThanOrEqual(400);
    }
    expect(errors.unexpected()).toEqual([]);
  });
}

test("Arabic on a phone: the drawer offers the analyst only the screens open to every role", async ({ factory, openAs }) => {
  const person = await factory.consoleUser("analyst");
  const { page, errors } = await openAs(person, { locale: "ar", width: "phone" });
  await page.goto("/admin");
  await consoleReady(page);
  await page.getByRole("button", { name: "فتح القائمة" }).click();
  const drawer = page.getByRole("dialog", { name: "قائمة تنقل لوحة الإدارة" });
  await expect(drawer.getByRole("link", { name: "الاعتمادات" })).toBeVisible();
  const offered = await drawer.getByRole("navigation").getByRole("link").evaluateAll((links) => links.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
  expect([...offered].sort()).toEqual([...EXPECTED.analyst].sort());
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  expect(errors.unexpected()).toEqual([]);
});
