import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Provider-portal guard (package FIX-PROV): the provider screens must not invent records, call a third party for
// something the page can do itself, or use native dialogs. These read the source because the screens are client pages.
const webRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const providerRoot = join(webRoot, "src", "app", "provider");

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const files = sourceFiles(providerRoot).map((path) => ({
  path: relative(webRoot, path).replace(/\\/g, "/"),
  code: readFileSync(path, "utf8"),
}));
const byPath = (suffix) => files.find((file) => file.path.endsWith(suffix));

describe("provider portal contains no invented records", () => {
  const rules = [
    { pattern: /demoStaffMembers|demoServiceOptions|demoProfileFor|\bdemo-(omar|yousef|karim|classic|beard|facial|spa|branch)\b/, why: "invented staff or services (R8)" },
    { pattern: /images\.unsplash\.com/, why: "stock photos presented as a person" },
    { pattern: /api\.qrserver\.com/, why: "a third-party QR service (D-09)" },
    { pattern: /elite-barbershop|Elite Barbershop/, why: "an invented business or share link (D-28)" },
    { pattern: /G43 Verified|15% Saved|Commission Guarantee/, why: "ticket labels and unbacked rates on the dashboard" },
  ];
  for (const rule of rules) {
    it(`has no ${rule.why}`, () => {
      const hits = files.filter((file) => rule.pattern.test(file.code)).map((file) => file.path);
      assert.deepEqual(hits, [], `${rule.why} found in: ${hits.join(", ")}`);
    });
  }
});

describe("employees screen (R8, R50, C-D13)", () => {
  const page = byPath("employees/page.tsx").code;
  it("renders an empty state with a call to add the first professional", () => {
    assert.match(page, /emptyHeading/);
    assert.match(page, /Add your first professional/);
    assert.match(page, /أضف أول أخصائي لديك/);
  });
  it("edits the profile columns the shop page needs", () => {
    for (const column of ["bio_en", "bio_ar", "years_of_experience", "specialties", "instagram_handle"]) {
      assert.ok(page.includes(column), `${column} is read and written`);
    }
  });
  it("reads earnings from the earnings view instead of computing them from nothing", () => {
    assert.ok(page.includes("employee_earnings_summary"));
  });
  it("has a pay-rules editor and a consented portfolio uploader", () => {
    const extras = byPath("_components/employee-extras.tsx").code;
    assert.ok(extras.includes("employee_commission_rules"));
    assert.ok(extras.includes("employee_portfolios"));
    assert.match(extras, /customer_consent_confirmed: true/);
    assert.match(extras, /consentRequired/);
  });
});

describe("provider dialogs", () => {
  it("share one accessible shell", () => {
    const dialog = byPath("_components/dialog.tsx").code;
    assert.match(dialog, /role="dialog"/);
    assert.match(dialog, /aria-modal="true"/);
    assert.ok(existsSync(join(webRoot, "src", "components", "modal.tsx")));
  });
});

describe("who the portal is for (R18, R5/R6 follow-ups, D-27, R16 hours)", () => {
  it("asks the database for the business and role instead of owner_id in the layout", () => {
    const layout = byPath("provider/layout.tsx").code;
    assert.ok(!layout.includes('eq("owner_id"'), "the layout no longer looks the business up by owner_id");
    assert.ok(byPath("_components/provider-context.tsx").code.includes('rpc("my_provider_context")'));
    assert.match(layout, /\/provider\/my-day/);
  });
  it("has one employee screen that acts only through the status command and reads own earnings", () => {
    const page = byPath("my-day/page.tsx").code;
    assert.ok(page.includes("employee_update_booking_status"));
    assert.ok(page.includes("employee_earnings_summary"));
    assert.ok(!/from\("bookings"\)\s*\.update/.test(page), "no direct booking status write");
  });
  it("reads private columns only through the owner commands", () => {
    assert.ok(byPath("settings/page.tsx").code.includes('rpc("get_provider_private_profile"'));
    assert.ok(!/select\([^)]*contact_phone/.test(byPath("settings/page.tsx").code));
    const employees = byPath("employees/page.tsx").code;
    assert.ok(employees.includes('rpc("get_provider_staff_contacts"'));
    assert.ok(!/\.select\(`[^`]*\bphone\b/.test(employees), "employees.phone is no longer selected");
  });
  it("saves the booking policy through its command and never invents a default", () => {
    const card = byPath("_components/booking-policy-card.tsx").code;
    assert.ok(card.includes('rpc("set_provider_booking_policy"'));
    assert.ok(!/useState\(\s*(20|24|50|100)\s*\)/.test(card));
    assert.ok(!byPath("settings/page.tsx").code.includes("depositPercentage"));
  });
  it("lets the hours form express an overnight shift and asks whom it applies to", () => {
    const apply = byPath("_components/hours-apply.tsx").code;
    assert.match(apply, /close < day\.open|day\.close < day\.open/);
    assert.match(apply, /custom/);
    const settings = byPath("settings/page.tsx").code;
    assert.ok(!settings.includes("Closing time must be after opening time"));
    assert.ok(settings.includes("HoursApplyDialog"));
  });
});

describe("closures, seasons and leave (R16)", () => {
  it("has screens for all three tables and reaches them from the settings page", () => {
    const sections = byPath("_components/time-off-sections.tsx").code;
    for (const table of ["provider_closures", "seasonal_schedules", "employee_time_off"]) assert.ok(sections.includes(table), table);
    assert.ok(byPath("time-off/page.tsx").code.includes("ClosuresSection"));
    assert.ok(byPath("settings/page.tsx").code.includes("/provider/time-off"));
  });
  it("warns before closing over existing bookings and confirms deletions with the shared dialog", () => {
    const sections = byPath("_components/time-off-sections.tsx").code;
    assert.match(sections, /affectedTitle/);
    assert.match(sections, /useConfirm/);
  });
  it("sends a professional's own leave request as pending, never relying on the default", () => {
    assert.match(byPath("_components/my-leave.tsx").code, /status: "pending"/);
    assert.ok(byPath("my-day/page.tsx").code.includes("MyLeaveSection"));
  });
});

describe("calendar (R4, C-D15)", () => {
  const calendar = () => byPath("calendar/page.tsx").code;
  it("moves an appointment only through reschedule_booking and never edits the list on drop", () => {
    assert.ok(calendar().includes('rpc("reschedule_booking"'));
    const drop = calendar().slice(calendar().indexOf("onDrop="), calendar().indexOf("onDrop=") + 600);
    assert.ok(drop.includes("moveAppointment") && !drop.includes("setAppointments"), "a drop calls the command and does not change the list itself");
    assert.match(calendar(), /id="move-slot"/, "a keyboard path exists in the details dialog");
  });
  it("sends the phone, payment method and notes of a walk-in and has no English-only fallback", () => {
    const code = calendar();
    assert.match(code, /p_customer_phone: phone/);
    assert.match(code, /p_payment_method: bookPayment/);
    assert.match(code, /p_notes: bookNotes/);
    assert.ok(!code.includes("Walk-in Customer") && !code.includes('p_payment_method: "cash"'));
  });
  it("offers only this business's past customers and asks why before cancelling", () => {
    const code = calendar();
    assert.ok(!/\.eq\("role", "customer"\)/.test(code), "the platform's customers are not listed");
    assert.match(code, /<CommandDialog/);
    assert.ok(!/flex-row-reverse/.test(code), "no double mirroring");
  });
});

describe("dashboard honesty and the real QR (D-28, R27, D-09)", () => {
  const dashboard = () => byPath("dashboard/page.tsx").code;
  it("reads figures from one server summary, not from every booking in the browser", () => {
    assert.ok(dashboard().includes('rpc("get_provider_dashboard_summary"'));
    assert.ok(!dashboard().includes('from("bookings")'), "no booking rows are pulled into the page");
  });
  it("starts every checklist step unticked and derives each from rows", () => {
    assert.match(dashboard(), /hasHours: false,\s*servicesCount: 0,\s*staffCount: 0,\s*hasPolicy: false,\s*linkShared: false/);
    assert.ok(!/hasPolicy: true|hasHours: true|servicesCount: 3|staffCount: 4/.test(dashboard()));
    assert.ok(dashboard().includes('rpc("record_share_kit_use"'));
  });
  it("draws the QR locally and builds links only for a real business id", () => {
    assert.ok(dashboard().includes("qrSvgPath"));
    assert.ok(dashboard().includes("printableQrHtml"));
    assert.match(dashboard(), /const shareBase = providerId && origin/);
    assert.ok(!dashboard().includes("document.write(`<html>"), "the print page is built by the escaping helper");
  });
});

describe("promo codes (R9)", () => {
  const promotions = () => byPath("promotions/page.tsx").code;
  it("creates, lists and switches codes through the owner commands that write the table checkout reads", () => {
    for (const command of ["create_provider_promo_code", "list_provider_promo_codes", "set_provider_promo_code_active"]) {
      assert.ok(promotions().includes(command), command);
    }
    assert.ok(!promotions().includes("provider_promos"), "the unread table is not written");
    assert.ok(!/from\("promotional_codes"\)/.test(promotions()), "no direct table access");
  });
  it("offers no audience that checkout cannot enforce and estimates no revenue", () => {
    assert.ok(!/target_segment|targetSegment|Est\. Revenue Lift|\* 180/.test(promotions()));
  });
  it("shows a failed toggle instead of flipping the row in memory", () => {
    assert.ok(!/setPromos\(prev => prev\.map/.test(promotions()));
  });
});

describe("client import and blocking (R36, C-D26)", () => {
  const customers = () => byPath("customers/page.tsx").code;
  it("reads the file with the shared parser and sends only rows with a normalized phone", () => {
    assert.ok(customers().includes("parseClientCsv"));
    assert.match(customers(), /type="file"/);
    assert.ok(!/split\("\n"\)/.test(customers()), "no line-and-comma splitting on the page");
    assert.ok(!customers().includes("CSV Data (Name, Phone, Notes)"), "the label is translated");
    assert.ok(!/Please paste client data|No valid rows found|Provider account not found/.test(customers()), "the error strings are translated");
  });
  it("asks for a reason before blocking and records it, with no constant reason", () => {
    assert.match(customers(), /<CommandDialog/);
    assert.ok(!customers().includes("Policy violations / no-show protection"));
    assert.match(customers(), /p_reason: blockTarget\.blocked \? "" : reason/);
  });
});
