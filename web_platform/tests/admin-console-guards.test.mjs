import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Admin console guards: operator screens act through audited server commands, keep history instead of
// deleting it, and read live sources. Database behaviour behind these commands is tested in
// supabase/tests/db; this file keeps the screens wired to those commands.
const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const ADMIN_ROOT = "web_platform/src/app/admin";

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const files = sourceFiles(join(repoRoot, ADMIN_ROOT))
  .map((path) => ({ path: relative(repoRoot, path).replace(/\\/g, "/"), code: readFileSync(path, "utf8") }));
const read = (path) => readFileSync(join(repoRoot, path), "utf8");
const page = (route) => files.find((f) => f.path === `${ADMIN_ROOT}${route}/page.tsx`).code;

describe("admin console guards", () => {
  it("deactivates instead of deleting records that carry history", () => {
    const deletes = files
      .filter((f) => /\.from\("(providers|services|promotional_codes|integrations)"\)\s*\.delete\(/.test(f.code))
      .map((f) => f.path);
    assert.deepEqual(deletes, [], `deletes in: ${deletes.join(", ")}`);
  });

  it("settings and taxes never report a save that did not happen", () => {
    for (const route of ["/settings", "/taxes"]) {
      assert.ok(!/setTimeout\(\(\) => setSuccess/.test(page(route)), `${route} must not announce a save that never ran`);
    }
    assert.ok(page("/settings").includes('rpc("admin_update_platform_setting"'), "settings save through the audited command");
    assert.ok(page("/taxes").includes('from("fee_rules")'), "taxes show the fee rules the server applies");
  });

  it("the audit log is a real screen that the old log routes lead to", () => {
    const audit = page("/audit-logs");
    assert.ok(audit.includes('from("admin_audit_logs")') && !audit.includes('router.replace("/admin/activity")'));
    const config = read("web_platform/next.config.ts");
    for (const route of ["system-logs", "webhooks"]) {
      assert.ok(config.includes(`source: "/admin/${route}", destination: "/admin/audit-logs"`), `/admin/${route} must lead to the audit log, not the booking feed`);
    }
  });

  it("retired admin addresses redirect on the server instead of shipping redirect-only pages", () => {
    const config = read("web_platform/next.config.ts");
    const sources = [...config.matchAll(/source: "(\/admin\/[a-z-]+)"/g)].map((match) => match[1]);
    assert.ok(sources.length >= 10, "the redirect table lists the retired addresses");
    for (const source of sources) {
      assert.ok(!existsSync(join(repoRoot, ADMIN_ROOT, source.replace("/admin/", ""), "page.tsx")), `${source} must not also be a page`);
    }
    const clientRedirects = files.filter((f) => /router\.replace\("\/admin\//.test(f.code) && f.code.split("\n").length < 25).map((f) => f.path);
    assert.deepEqual(clientRedirects, [], `client-side redirect pages remain: ${clientRedirects.join(", ")}`);
  });

  it("every page is sent with browser security headers", () => {
    const config = read("web_platform/next.config.ts");
    for (const header of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Strict-Transport-Security", "Permissions-Policy"]) {
      assert.ok(config.includes(`key: "${header}"`), `${header} must be set`);
    }
    assert.ok(config.includes('value: "DENY"'), "no page may be framed");
  });

  it("every operator screen with its own page is reachable from the sidebar or the dashboard", () => {
    const layout = read(`${ADMIN_ROOT}/layout.tsx`);
    const dashboard = read(`${ADMIN_ROOT}/page.tsx`);
    for (const route of ["notifications", "help", "refunds", "audit-logs", "supply"]) {
      assert.ok(layout.includes(`"/admin/${route}"`) || dashboard.includes(`"/admin/${route}"`), `/admin/${route} must be linked`);
    }
  });

  it("money actions reuse idempotency keys and review payouts on the server", () => {
    const ledger = page("/ledger");
    assert.ok(!/idempotencyKey = `[^`]*Date\.now\(\)/.test(ledger), "a retry must reuse the same idempotency key");
    assert.ok(ledger.includes('rpc("admin_review_payout_request"'), "payout review goes through the server command");
  });

  it("booking commands run on the server with a reason", () => {
    const bookings = page("/bookings");
    for (const command of ["cancel_booking", "mark_booking_no_show", "employee_update_booking_status", "admin_release_expired_holds"]) {
      assert.ok(bookings.includes(`rpc("${command}"`), `bookings must use ${command}`);
    }
  });

  it("local developer access is opt-in and limited to the role's dashboards", () => {
    const devAccess = read("web_platform/src/lib/dev-access.ts");
    assert.ok(devAccess.includes('NEXT_PUBLIC_ENABLE_DEV_ACCESS === "true"') && devAccess.includes('NODE_ENV === "production"'));
    assert.ok(!devAccess.includes('setItem(storageKey, "customer")'), "no role is assigned automatically");
    const guard = read("web_platform/src/components/auth-guard.tsx");
    assert.ok(guard.includes("allowedRolesKey.split(\",\").includes(devRole)"), "a dev role only opens its own dashboards");
  });

  it("the landing page and refund queue read live data", () => {
    const dashboard = files.find((f) => f.path === `${ADMIN_ROOT}/page.tsx`).code;
    assert.ok(dashboard.includes('rpc("admin_dashboard_overview")'), "dashboard figures come from the server summary");
    assert.ok(!/May 1\d|Emma Johnson|Liam Johnson|Olivia Brown|chartPoints/.test(dashboard), "no invented people, dates or chart points");
    const refunds = page("/refunds");
    assert.ok(refunds.includes('from("refund_requests")'), "the refund queue reads refund_requests");
    assert.ok(refunds.includes('rpc("admin_retry_refund_request"'), "a retry is recorded with a reason first");
    assert.ok(refunds.includes('functions.invoke("process-refund"'), "money moves only through process-refund");
    assert.ok(refunds.includes('rpc("admin_reopen_stuck_refund"'), "a refund stuck in progress can be reopened by an operator");
  });

  it("customer figures come from one server-computed page, not from the browser", () => {
    const customers = page("/customers");
    assert.ok(customers.includes('rpc("admin_customer_overview"'), "the directory reads a server-computed page of customers");
    assert.ok(!customers.includes('.from("profiles")') && !customers.includes('.from("bookings")'), "the browser must not pull every profile or booking to total them");
    assert.ok(!/client_id|hashCode/.test(customers), "no figures from a column that does not exist or from an identifier");
    assert.ok(customers.includes("customersError") && customers.includes("t.loadFailed"), "a failed load says so instead of showing zeros");
  });

  it("data requests and phone verification change only through commands that take the operator's own words", () => {
    const customers = page("/customers");
    assert.ok(customers.includes('rpc("admin_update_data_request"') && customers.includes('rpc("admin_set_phone_verified"'), "both run on the server");
    assert.ok(!/\.from\("data_subject_requests"\)\s*\.update/.test(customers) && !customers.includes('.update({'), "no direct writes to requests or profiles");
    assert.ok(!/Fulfilled per customer request|Rejected per statutory exceptions/.test(customers), "no canned note stands in for the operator's");
    assert.ok(!/Data Portability Export|JSON\.stringify\(report/.test(customers), "a partial profile summary is not offered as a PDPL export");
    assert.ok(customers.includes('rpc("admin_clear_customer_profile"') && customers.includes('kind: "clear"'), "clearing profile details is reachable from the table");
  });

  it("provider management shows recorded figures and changes status through one audited command", () => {
    const providers = files.find((f) => f.path === `${ADMIN_ROOT}/providers/provider-management.tsx`).code;
    for (const source of ['from("admin_branch_performance")', 'from("admin_employee_performance")']) {
      assert.ok(providers.includes(source), `performance figures must come from ${source}`);
    }
    assert.ok(providers.includes('rpc("admin_set_provider_status"'), "approve, reject, suspend and reactivate run as a server command with a reason");
    assert.ok(!/\.update\(\{[^}]*status/.test(providers), "the screen must not write providers.status directly");
    // Nothing is derived from an identifier, estimated from a percentage, or invented when data is missing.
    for (const [pattern, why] of [
      [/hashText|makeEmployee|employeePhotos|unsplash\.com/, "figures or photos derived from identifiers"],
      [/utilizationRate|monthlyRevenue|netToProvider|employeeCommissionShare/, "estimated utilization, monthly revenue or net-to-provider figures"],
      [/commissionPercentage\s*\/\s*100|\*\s*provider\.commission/, "commission computed from the stored percentage"],
      [/@primora\.provider|address_text_en:\s*"Riyadh"|setApprovalCommission|openAdd/, "invented contact details, branches or an admin-created provider"],
    ]) {
      assert.ok(!pattern.test(providers), `provider management must not contain ${why}`);
    }
  });

  it("provider edits write only the fields the operator changed and keep the dialog open on failure", () => {
    const providers = files.find((f) => f.path === `${ADMIN_ROOT}/providers/provider-management.tsx`).code;
    assert.ok(providers.includes("payload.contact_email =") && providers.includes("!== editing.contactEmail"), "unchanged values are not rewritten");
    assert.ok(providers.includes("setDraftError(errorMessage(updateError))"), "a failed save is shown inside the dialog");
  });

  it("a failed applications query is reported, not shown as an empty queue", () => {
    const providers = files.find((f) => f.path === `${ADMIN_ROOT}/providers/provider-management.tsx`).code;
    assert.ok(providers.includes("setAppsError(errorMessage(loadError))") && providers.includes("t.applicationsFailed"), "an outage must not read as 'no applications'");
  });

  it("Arabic copy in operator screens is stored as Arabic, not mis-decoded bytes", () => {
    const garbled = files.filter((f) => /[ØÙ][\u0080-¿Œ-ƒˆ-˜–-›€™]/.test(f.code)).map((f) => f.path);
    assert.deepEqual(garbled, [], `mis-decoded Arabic in: ${garbled.join(", ")}`);
  });

  it("report exports are real files, audited before delivery, and never cut a period short", () => {
    const reports = page("/reports");
    assert.ok(reports.includes("downloadCsv(") && reports.includes("toCsv("), "an export builds a CSV file");
    const audited = reports.indexOf('rpc("admin_record_export"');
    assert.ok(audited > 0 && audited < reports.indexOf("downloadCsv(file"), "the audit entry is written before the file is handed out");
    assert.ok(reports.includes("throw auditError"), "a failed audit entry stops the download");
    assert.ok(reports.includes("TooManyRows") && reports.includes("MAX_ROWS"), "a period with too many rows is refused rather than truncated");
    assert.ok(!/setTimeout\(\(\) => setSuccess|initiated/.test(reports), "no success message without a file");
    for (const source of ["transactional_ledger", "monthly_vat_summary", "provider_settlement_summary"]) {
      assert.ok(reports.includes(`.from("${source}")`), `${source} feeds an export`);
    }
  });

  it("the employee directory reads live staff and figures and offers no edits that go nowhere", () => {
    const employees = page("/employees");
    assert.ok(employees.includes('.from("employees")') && employees.includes('.from("admin_employee_performance")'), "staff and figures come from the database");
    assert.ok(!/demoEmployees|deleteEmployee|saveEmployee|openAdd/.test(employees), "no invented staff or local-only editing");
    assert.ok(employees.includes(".range(") && employees.includes('count: "exact"'), "the list is paginated on the server");
  });

  it("clearing a customer profile is one audited server command that claims no more than it does", () => {
    const customers = page("/customers");
    assert.ok(customers.includes('rpc("admin_clear_customer_profile"'), "clearing runs on the server");
    assert.ok(!/anonymized per PDPL/.test(customers), "the screen must not claim a completed PDPL erasure");
  });

  it("clearing a customer profile names the customer, lists what is removed and needs the ID typed", () => {
    const customers = page("/customers");
    assert.ok(customers.includes("confirmWord={customer.id.slice(0, 8)}"), "the operator types the customer's ID prefix to confirm");
    assert.ok(customers.includes("clearEffects") && customers.includes("factEmail") && customers.includes("factId"), "the dialog states who and what is affected");
    assert.ok(customers.includes('tone="danger"'), "the irreversible command looks different from routine ones");
  });

  it("operator commands collect their reason in a dialog that names the target, never in a native prompt", () => {
    for (const route of ["/bookings", "/customers", "/refunds"]) {
      const code = page(route);
      assert.ok(!/window\.(prompt|confirm)\(/.test(code), `${route} must not ask for a reason through a native prompt`);
      assert.ok(code.includes("<CommandDialog"), `${route} uses the shared command dialog`);
    }
    const providers = files.find((f) => f.path === `${ADMIN_ROOT}/providers/provider-management.tsx`).code;
    assert.ok(!/window\.(prompt|confirm)\(/.test(providers) && providers.includes("<CommandDialog"), "provider status changes use the shared command dialog");
  });

  it("one dialog behaviour serves every modal surface: focus in, Escape out, page inert, focus restored", () => {
    const modal = read("web_platform/src/components/modal.tsx");
    for (const needle of ['"Escape"', 'setAttribute("inert"', 'event.key !== "Tab"', "opener.focus()", 'aria-modal="true"']) {
      assert.ok(modal.includes(needle), `the dialog primitive must handle ${needle}`);
    }
    const providers = files.find((f) => f.path === `${ADMIN_ROOT}/providers/provider-management.tsx`).code;
    assert.equal((providers.match(/<ModalOverlay /g) ?? []).length, 3, "edit, reject and detail surfaces use it");
    assert.ok(providers.includes("<CommandDialog") && providers.includes("approvalModalApp &&"), "approval uses the command dialog, which uses it too");
    assert.ok(providers.includes('aria-labelledby="provider-reject-title"'), "the rejection dialog has a name");
    assert.ok(page("/bookings").includes("<ModalOverlay"), "the invoice uses it too");
  });

  it("an invoice is never sent to an outside service to draw a QR image", () => {
    for (const f of files) assert.ok(!/api\.qrserver\.com/.test(f.code), `${f.path} must not call a third-party QR service`);
    const bookings = page("/bookings");
    assert.ok(bookings.includes("invoiceFailed") && bookings.includes("invoiceError"), "a failed invoice read is reported, not shown as 'no invoice issued'");
  });

  it("the admin shell has a language switch, a skip link, a drawer that traps focus and a local sign-out that reports failure", () => {
    const layout = read(`${ADMIN_ROOT}/layout.tsx`);
    assert.ok(layout.includes("toggleLanguage") && layout.includes('localStorage.setItem("primora_lang"'), "the operator can switch language");
    assert.ok(layout.includes('href="#admin-main"') && layout.includes('id="admin-main"'), "keyboard users can skip the navigation");
    assert.ok(layout.includes("inert={!mobileMenuOpen}") && layout.includes('"Escape"'), "the closed phone drawer is out of the tab order and Escape closes the open one");
    assert.ok(layout.includes('signOut({ scope: "local" })') && layout.includes("setSignOutError(true)"), "signing out ends this device's session and says so when it fails");
    assert.ok(layout.includes("document.title"), "each route sets its own document title");
    const guard = read("web_platform/src/components/auth-guard.tsx");
    assert.ok(guard.includes('error.code !== "PGRST116"') && guard.includes("setCheckFailed(true)"), "a failed profile read is an error with a retry, not a sign-out");
  });

  it("shells show no counts, assistants or search boxes that are not bound to anything", () => {
    const customerShell = read("web_platform/src/app/customer/layout.tsx");
    const providerShell = read("web_platform/src/app/provider/layout.tsx");
    assert.ok(!/badge: 3|I found 2 slots|Primora AI Assistant/.test(customerShell), "no invented unread count or assistant card");
    assert.ok(customerShell.includes("unread_for_customer") && providerShell.includes("unread_for_provider"), "unread counts come from conversations");
    assert.ok(!/<input\s+type="text"/.test(customerShell) && !/<input\s+type="text"/.test(providerShell), "no search box that does nothing");
  });

  it("filters and tabs live in the address bar and dashboard drill-downs open the view they count", () => {
    const dashboard = page("");
    for (const link of ["tab=applications&appStatus=pending", "tab=requests", "status=pending_payment"]) {
      assert.ok(dashboard.includes(link), `a dashboard queue opens ${link}`);
    }
    assert.ok(page("/bookings").includes("writeUrlState") && page("/customers").includes("writeUrlState"), "bookings and customers write their filters to the address bar");
    assert.ok(files.find((f) => f.path === `${ADMIN_ROOT}/providers/provider-management.tsx`).code.includes("writeUrlState"), "providers do too");
  });

  it("paginated lists end their sort on the row ID so rows that share a time are neither repeated nor skipped", () => {
    for (const route of ["/audit-logs", "/refunds"]) {
      assert.ok(/\.order\("id"/.test(page(route)), `${route} breaks ties on id`);
    }
    assert.ok(read("supabase/migrations/20261005180000_admin_booking_directory.sql").includes("ORDER BY scheduled_at DESC, id"), "the booking directory breaks ties on id on the server");
  });

  it("every operator screen has a level-one heading and the dialog titles are headings too", () => {
    for (const route of ["", "/audit-logs", "/bookings", "/customers", "/employees", "/refunds", "/reports", "/settings", "/taxes"]) {
      assert.ok(page(route).includes("<h1"), `${route || "/"} names itself with a level-one heading`);
    }
    const providers = files.find((f) => f.path === `${ADMIN_ROOT}/providers/provider-management.tsx`).code;
    assert.ok(providers.includes("<h1"), "providers too");
  });

  it("no admin control hides its keyboard focus ring", () => {
    const hidden = files.filter((f) => /(?<![:\w-])outline-none/.test(f.code)).map((f) => f.path);
    assert.deepEqual(hidden, [], `outline-none without a replacement ring in: ${hidden.join(", ")}`);
    const css = read("web_platform/src/app/globals.css");
    assert.ok(css.includes(".primora-dashboard-sidebar nav a:focus-visible"), "the link for the current page still shows a focus ring");
    assert.ok(css.includes(':not([role="dialog"])'), "dialog panels are not clipped by the card skin, so their content can scroll");
  });

  it("row actions are named after the row they act on", () => {
    assert.ok(page("/bookings").includes("aria-label={fill(t.cancelFor, shortId(b))}") && page("/bookings").includes("aria-label={fill(t.invoiceFor, shortId(b))}"), "booking actions name the booking");
    assert.ok(page("/refunds").includes("aria-label={fill(t.retryFor") && page("/refunds").includes("aria-label={fill(t.reopenFor"), "refund actions name the refund");
    assert.ok(page("/customers").includes("aria-label={`${t.clearBtn}: ${customerLabel(customer)}`}"), "customer actions name the customer");
    assert.ok(page("/audit-logs").includes("aria-label={`${expanded === row.id ? t.hide : t.show}: ${row.action}"), "audit rows name the entry they open");
    assert.ok(page("/reports").includes("aria-label={fill(t.downloadFor"), "each report download names its report");
    const providers = files.find((f) => f.path === `${ADMIN_ROOT}/providers/provider-management.tsx`).code;
    assert.ok(providers.includes("aria-label={`${t.suspend}: ${displayProviderName(provider)}`}"), "provider actions name the provider");
  });

  it("the providers screen keeps its filters reachable on a phone and says which filter is on", () => {
    const providers = files.find((f) => f.path === `${ADMIN_ROOT}/providers/provider-management.tsx`).code;
    assert.ok(providers.includes('isRTL ? "lg:flex-row-reverse" : "lg:flex-row"'), "the filter bar changes direction only on wide screens, so its chips wrap instead of being clipped");
    assert.ok(providers.includes("aria-pressed={appFilter === st}") && providers.includes("aria-pressed={statusFilter === value}"), "both sets of status chips expose their state");
    assert.ok(providers.includes("<CommandDialog") && providers.includes("<CommandResult"), "status changes use the shared dialog and results are anchored to the viewport");
  });

  it("the admin menu names match what the screens do", () => {
    const layout = read(`${ADMIN_ROOT}/layout.tsx`);
    assert.ok(layout.includes('employees: "الموظفون",'), "the Arabic staff label does not promise permission management");
    assert.ok(layout.includes('href="/admin/help"'), "the help card leads to the help centre");
  });

  it("no admin screen asks for anything through a native prompt or confirm", () => {
    const native = files.filter((f) => /(?<![\w.])(?:window\.)?(prompt|confirm|alert)\(/.test(f.code)).map((f) => f.path);
    assert.deepEqual(native, [], `native dialogs in: ${native.join(", ")}`);
  });

  it("money, role and approval commands send the operator's reason and name their target", () => {
    const ledger = page("/ledger");
    for (const needle of ['"admin_release_ledger_item"', '"admin_release_payout"', '"admin_review_payout_request"']) {
      assert.ok(ledger.includes(needle), `the ledger runs ${needle}`);
    }
    assert.equal((ledger.match(/p_reason: reason/g) ?? []).length, 3, "all three ledger commands send the reason from the dialog");
    assert.ok(ledger.includes("confirmWord={Number(request.amount || 0).toFixed(2)}"), "paying out needs the amount typed");
    assert.ok(page("/disputes").includes("<CommandDialog") && page("/reviews").includes("<CommandDialog"), "dispute decisions and review moderation use the dialog");
    const providers = files.find((f) => f.path === `${ADMIN_ROOT}/providers/provider-management.tsx`).code;
    assert.ok(providers.includes('"approve_provider_application", { p_application_id: appId, p_reason: reason }'), "approving an application sends a reason");
  });

  it("the bookings screen reads one server-computed page and can find a booking of any age", () => {
    const bookings = page("/bookings");
    assert.ok(bookings.includes('rpc("admin_booking_directory"'), "the list comes from the directory command");
    assert.ok(!bookings.includes('.from("bookings")') && !bookings.includes(".limit(500)"), "no unbounded browser query of every booking");
    for (const needle of ["searchLabel", "fromLabel", "PAGE_SIZE", "total_value"]) assert.ok(bookings.includes(needle), `bookings has ${needle}`);
  });

  it("a provider cancels from the calendar through the command, never by writing the status", () => {
    const calendar = read("web_platform/src/app/provider/calendar/page.tsx");
    assert.ok(calendar.includes('rpc("cancel_booking"') && !/from\("bookings"\)\s*\.update/.test(calendar));
  });

  it("the two legacy payout functions are retired and cannot move money", () => {
    for (const name of ["process-payout", "request-payout"]) {
      const code = read(`supabase/functions/${name}/index.ts`);
      assert.ok(code.includes("status: 410"), `${name} answers 410 Gone`);
      assert.ok(!/from\("transactional_ledger"\)|from\("payout_requests"\)/.test(code), `${name} no longer touches the ledger or payout requests`);
    }
    assert.ok(read("supabase/functions/process-payout/index.ts").includes('profile?.role !== "admin"'), "the administrator check stays in front of it");
  });

  it("the open phone drawer makes the rest of the page inert, and the window closes it when it becomes wide", () => {
    const layout = read(`${ADMIN_ROOT}/layout.tsx`);
    assert.equal((layout.match(/inert=\{mobileMenuOpen\}/g) ?? []).length, 3, "the header, the desktop sidebar and the content are inert while the drawer is open");
    assert.ok(layout.includes('matchMedia("(min-width: 768px)")'), "a wide window closes the drawer");
  });

  it("a refused request is told apart from an outage on the screens operators rely on", () => {
    for (const route of ["", "/refunds", "/audit-logs", "/customers", "/employees", "/settings", "/taxes", "/bookings"]) {
      const code = page(route);
      assert.ok(code.includes("isForbidden") && code.includes("ForbiddenNotice"), `${route || "/"} shows a forbidden state with no retry loop`);
    }
  });
});
