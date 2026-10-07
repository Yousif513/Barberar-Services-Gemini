import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// G72 intake forms and patch tests: the screens are wired to the commands that exist, say what the server said in both
// languages, never show an answer to anyone but the staff command and the client, use the shared dialogs and open from one
// entry point each.
const here = fileURLToPath(new URL(".", import.meta.url));
const src = (...parts) => readFileSync(join(here, "..", "src", ...parts), "utf8");
const lib = src("lib", "intake.ts");
const migrationDir = join(here, "..", "..", "supabase", "migrations");
const migration = readdirSync(migrationDir).filter((f) => /^202610082001|^202610082002/.test(f)).map((f) => readFileSync(join(migrationDir, f), "utf8")).join("\n");

const block = lib.slice(lib.indexOf("const reasons: Reason[] = ["), lib.indexOf("// The server's reason in the screen's language"));
const reasons = new Function(`${block.replace("const reasons: Reason[] =", "const reasons =")}\nreturn reasons;`)();
const describe_ = (message, lang) => {
  for (const r of reasons) { const m = message.match(r.match); if (m) return lang === "ar" ? r.ar(m) : r.en || message; }
  return null;
};

describe("intake reasons", () => {
  const internalOnly = new Set(["Only the scheduled job can run the intake purge"]);
  const raised = [...new Set([...migration.matchAll(/RAISE EXCEPTION '((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'")))]
    .filter((m) => !internalOnly.has(m));

  it("translates every reason the commands can raise into Arabic", () => {
    assert.ok(raised.length > 50);
    for (const message of raised) {
      const sample = message.replace(/%/g, "name").replace("(name)", "(missing)");
      const arabic = describe_(sample, "ar");
      assert.ok(arabic && /[؀-ۿ]/.test(arabic), `no Arabic form for: ${message}`);
    }
  });

  it("shows an unknown reason as the server wrote it", () => {
    assert.equal(describe_("something new", "en"), null);
    assert.match(lib, /return locale === "ar" \? `[^`]*\$\{message\}` : message;/);
  });
});

describe("intake screens", () => {
  const files = {
    customer: src("app", "customer", "bookings", "[id]", "intake", "page.tsx"),
    provider: src("app", "provider", "intake", "page.tsx"),
    templateDialog: src("app", "provider", "intake", "_components", "template-dialog.tsx"),
    dialogs: src("app", "provider", "intake", "_components", "dialogs.tsx"),
    form: src("components", "intake-form.tsx"),
    link: src("components", "intake-link.tsx"),
  };

  it("call only commands the migrations create", () => {
    const used = Object.values(files).flatMap((f) => [...f.matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]));
    const own = [...new Set(used)].sort();
    assert.deepEqual(own, ["clear_patch_test_block", "delete_booking_intake", "get_booking_intake", "read_booking_intake_answers", "record_consent", "record_patch_test",
      "remove_service_intake_requirement", "save_intake_template", "set_provider_intake_enforcement", "set_service_intake_requirement", "submit_booking_intake", "withdraw_health_data_consent"]);
    for (const name of own.filter((n) => n !== "record_consent")) assert.ok(migration.includes(`FUNCTION public.${name}(`), name);
  });

  it("ask for the health-data consent through the consent command before saving answers", () => {
    assert.match(files.customer, /p_purpose: "health_data"/);
    assert.match(files.customer, /!data\.consent_active/);
    assert.ok(files.customer.indexOf("giveConsent") < files.customer.indexOf("submit_booking_intake"));
  });

  it("never read the answers table from a screen", () => {
    for (const [name, text] of Object.entries(files)) assert.ok(!/from\("intake_answers"\)/.test(text), `${name} reads intake_answers directly`);
    assert.match(files.dialogs, /read_booking_intake_answers/);
    assert.ok(!/from\("intake_answers"\)/.test(src("app", "provider", "intake", "page.tsx")));
  });

  it("use the shared dialogs and never the native ones", () => {
    for (const [name, text] of Object.entries(files)) assert.ok(!/\b(window\.)?(alert|confirm|prompt)\(/.test(text), `${name} uses a native dialog`);
    assert.match(files.provider, /<CommandDialog/);
    assert.match(files.provider, /useConfirm/);
    assert.match(files.customer, /useConfirm/);
    for (const text of [files.templateDialog, files.dialogs]) assert.match(text, /ModalOverlay/);
  });

  it("limit what they read from the server and show loading, empty and error states", () => {
    assert.ok((files.provider.match(/\.range\(/g) || []).length >= 5);
    for (const text of [files.customer, files.provider]) {
      assert.match(text, /role="status"/);
      assert.match(text, /role="alert"/);
    }
    assert.match(files.provider, /t\.noMissing/);
    assert.match(files.provider, /t\.noPatchTests/);
  });

  it("keep what the client typed when a request fails", () => {
    assert.match(files.customer, /A refusal keeps everything the client typed/);
    assert.match(files.templateDialog, /A refusal keeps the dialog and everything typed in it/);
  });

  it("mirror under right-to-left and avoid left/right utilities", () => {
    for (const [name, text] of Object.entries(files)) {
      assert.ok(!/\b(ml|mr|pl|pr|text-left|text-right)-/.test(text), `${name} uses a physical direction class`);
    }
    for (const name of ["customer", "provider"]) assert.match(files[name], /dir=\{locale === "ar" \? "rtl" : "ltr"\}/);
  });

  it("open from one link each on the bookings list and the confirmation page, with one navigation entry", () => {
    for (const page of [src("app", "customer", "bookings", "page.tsx"), src("app", "customer", "bookings", "[id]", "confirmation", "page.tsx")]) {
      assert.equal((page.match(/import IntakeLink from "@\/components\/intake-link"/g) || []).length, 1);
      assert.equal((page.match(/<IntakeLink /g) || []).length, 1);
    }
    assert.equal((src("app", "provider", "layout.tsx").match(/\/provider\/intake/g) || []).length, 1);
    assert.ok(existsSync(join(here, "..", "src", "app", "provider", "intake", "page.tsx")));
  });

  it("keep both languages for every string of the shared copy", () => {
    const en = lib.slice(lib.indexOf("  en: {"), lib.indexOf("  ar: {"));
    const ar = lib.slice(lib.indexOf("  ar: {"), lib.indexOf("type Reason"));
    const keys = (s) => [...s.matchAll(/^    ([A-Za-z]+):/gm)].map((m) => m[1]).sort();
    assert.deepEqual(keys(ar), keys(en));
    assert.ok(keys(en).length > 100);
  });
});
