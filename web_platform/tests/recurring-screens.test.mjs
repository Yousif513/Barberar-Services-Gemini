import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// G71 recurring appointments: the screens are wired to the commands that exist, say what the server said in both languages,
// open from one button on each entry screen, and use the shared dialogs.
const here = fileURLToPath(new URL(".", import.meta.url));
const src = (...parts) => readFileSync(join(here, "..", "src", ...parts), "utf8");
const lib = src("lib", "recurring.ts");
const migration = readFileSync(join(here, "..", "..", "supabase", "migrations", "20261008010000_recurring_appointments.sql"), "utf8");

// The reasons table is TypeScript: read the array as text and evaluate it without the type annotations.
const block = lib.slice(lib.indexOf("const reasons: Reason[] = ["), lib.indexOf("// The server's reason in the screen's language"));
const reasons = new Function(`${block.replace("const reasons: Reason[] =", "const reasons =")}\nreturn reasons;`)();
const describe_ = (message, lang) => {
  for (const r of reasons) { const m = message.match(r.match); if (m) return lang === "ar" ? r.ar(m) : r.en || message; }
  return null;
};

describe("recurring appointment reasons", () => {
  const internalOnly = new Set([
    "Only the scheduler or an administrator can send payment reminders",
    "The reminder window must be between 1 and 168 hours",
    "The enabled flag is required",
  ]);
  const raised = [...new Set([...migration.matchAll(/RAISE EXCEPTION '((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'")))]
    .filter((m) => !internalOnly.has(m));

  it("translates every static reason the commands can raise into Arabic", () => {
    for (const message of raised.filter((m) => !m.includes("%"))) {
      const arabic = describe_(message, "ar");
      assert.ok(arabic && /[\u0600-\u06FF]/.test(arabic), `no Arabic form for: ${message}`);
    }
  });

  it("translates the reasons that carry numbers or dates", () => {
    assert.match(describe_("This provider allows at most 6 appointments in a series", "ar"), /6/);
    assert.match(describe_("Appointment 3 on 2026-10-26 08:00 could not be booked: Selected time is no longer available", "ar"), /3.*2026-10-26 08:00/);
    assert.ok(raised.some((m) => m.startsWith("Appointment %")), "the migration still raises the per-date reason");
  });

  it("shows an unknown reason as the server wrote it", () => {
    assert.equal(describe_("something new", "en"), null, "unknown reasons fall through to the raw message in describeRecurringError");
    assert.match(lib, /return locale === "ar" \? `[^`]*\$\{message\}` : message;/);
  });
});

describe("recurring appointment screens", () => {
  const files = {
    dialog: src("components", "make-regular.tsx"),
    customer: src("app", "customer", "series", "page.tsx"),
    provider: src("app", "provider", "recurring", "page.tsx"),
  };

  it("call only commands the migration creates, with the arguments it declares", () => {
    const used = Object.values(files).flatMap((f) => [...f.matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]));
    assert.deepEqual([...new Set(used)].sort(),
      ["cancel_booking_series", "create_booking_series_from_booking", "preview_booking_series", "set_provider_recurring_settings"]);
    for (const name of used) assert.ok(migration.includes(`FUNCTION public.${name}(`), name);
    assert.match(files.dialog, /p_idempotency_key: attempt/);
    assert.match(files.dialog, /p_skip_unavailable: skip/);
  });

  it("use the shared dialogs and never the native ones", () => {
    for (const [name, text] of Object.entries(files)) {
      assert.ok(!/\b(window\.)?(alert|confirm|prompt)\(/.test(text), `${name} uses a native dialog`);
    }
    assert.match(files.customer, /<CommandDialog/);
    assert.match(files.dialog, /ModalOverlay/);
  });

  it("limit what they read from the server and show loading, empty and error states", () => {
    for (const text of [files.customer, files.provider]) {
      assert.match(text, /\.range\(/);
      assert.match(text, /role="status"/);
      assert.match(text, /role="alert"/);
    }
    assert.match(files.customer, /t\.emptyTitle/);
    assert.match(files.provider, /t\.noSeries/);
  });

  it("open from one button each on the bookings list and the confirmation page, with one navigation entry per portal", () => {
    for (const page of [src("app", "customer", "bookings", "page.tsx"), src("app", "customer", "bookings", "[id]", "confirmation", "page.tsx")]) {
      assert.equal((page.match(/import MakeRegularButton from "@\/components\/make-regular"/g) || []).length, 1);
      assert.equal((page.match(/<MakeRegularButton /g) || []).length, 1);
    }
    assert.equal((src("app", "customer", "layout.tsx").match(/\/customer\/series/g) || []).length, 1);
    assert.equal((src("app", "provider", "layout.tsx").match(/\/provider\/recurring/g) || []).length, 1);
    assert.ok(existsSync(join(here, "..", "src", "app", "customer", "series", "page.tsx")));
  });

  it("keep both languages for every string of the shared copy", () => {
    const en = lib.slice(lib.indexOf("  en: {"), lib.indexOf("  ar: {"));
    const ar = lib.slice(lib.indexOf("  ar: {"), lib.indexOf("} as const;"));
    const keys = (s) => [...s.matchAll(/^    ([A-Za-z]+):/gm)].map((m) => m[1]).sort();
    assert.deepEqual(keys(ar), keys(en));
    assert.ok(keys(en).length > 50);
  });
});
