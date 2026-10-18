import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HINT_TEXT, PERMISSION_LABELS, describeConsoleError } from "../src/lib/console-errors.mjs";

// Gap ux2-arabic-console-shows-english-server-refusals: the Arabic console showed the server's English refusal (a held
// profile clear, a renewal by an owner who already renewed, an invalid awareness time). Every HINT the migrations raise must
// have an Arabic sentence, and the frequent refusals without a HINT must be translated too.
const here = fileURLToPath(new URL(".", import.meta.url));
const migrationsDir = join(here, "..", "..", "supabase", "migrations");
const migrations = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).map((name) => readFileSync(join(migrationsDir, name), "utf8")).join("\n");
const hints = [...new Set([...migrations.matchAll(/HINT = '([a-z_]+)'/g)].map((m) => m[1]))].sort();
const isArabic = (text) => /[؀-ۿ]/.test(text) && !/[A-Za-z]{4,}/.test(text.replace(/⁨[^⁩]*⁩/g, ""));

describe("describeConsoleError", () => {
  it("has an Arabic sentence for every HINT the migrations raise", () => {
    assert.ok(hints.length > 40, `found ${hints.length} hints`);
    const missing = hints.filter((hint) => !HINT_TEXT[hint] || !HINT_TEXT[hint].ar);
    assert.deepEqual(missing, []);
    for (const hint of hints) {
      const text = describeConsoleError({ code: "22023", hint, message: "An active legal hold (CRT-1 Riyadh court) renewed 4 times", details: "operations.write" }, "ar");
      assert.ok(isArabic(text), `${hint}: ${text}`);
    }
  });

  it("names the missing console permission in both languages", () => {
    const refusal = { code: "42501", hint: "missing_permission", details: "settings.manage", message: "Your console role does not include the settings.manage permission, so nothing was changed" };
    assert.match(describeConsoleError(refusal, "en"), /does not include platform settings \(settings\.manage\)/);
    assert.match(describeConsoleError(refusal, "ar"), /إعدادات المنصة/);
    for (const lang of ["en", "ar"]) assert.equal(Object.keys(PERMISSION_LABELS[lang]).length, 20);
  });

  it("translates the three refusals the UX round named, keeping the case reference", () => {
    const held = describeConsoleError({ code: "22023", hint: "legal_hold_active", message: "An active legal hold (CRT-2026-0412 Riyadh Commercial Court) keeps this customer's account; the profile cannot be cleared until the hold is released" }, "ar");
    assert.match(held, /حجز قانوني نشط/);
    assert.ok(held.includes("CRT-2026-0412"), "the case reference stays, isolated");
    assert.match(describeConsoleError({ code: "42501", hint: "fresh_owner_required", message: "A hold renewed 3 times is kept only with an owner who has never proposed, approved or renewed it" }, "ar"), /٣ مرات/);
    assert.match(describeConsoleError({ code: "22023", message: "The awareness time must be after the discovery and not in the future" }, "ar"), /وقت العلم/);
  });

  it("keeps an unknown reason visible after an Arabic lead-in, and the server's English as it is in English", () => {
    const unknown = { code: "22023", message: "Something new went wrong" };
    assert.equal(describeConsoleError(unknown, "en"), "Something new went wrong");
    const ar = describeConsoleError(unknown, "ar");
    assert.match(ar, /^لم يقبل الخادم هذه القيمة، ولم يتغير شيء: /);
    assert.ok(ar.includes("⁨Something new went wrong⁩"), "the English detail is bidi-isolated");
  });

  it("says plainly when the server could not be reached or the session ended", () => {
    assert.match(describeConsoleError(new TypeError("Failed to fetch"), "ar"), /تعذر الوصول إلى الخادم/);
    assert.match(describeConsoleError({ message: "JWT expired", code: "PGRST301" }, "en"), /session ended/);
    assert.equal(describeConsoleError(null, "en"), "The request failed and nothing was changed. Try again.");
  });
});
