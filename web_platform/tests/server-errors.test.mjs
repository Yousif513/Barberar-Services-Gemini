import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The P3 screens show the server's reason in the reader's language (C-D28). The map is TypeScript, so it is read as text here
// and evaluated after stripping its type annotations, which keeps the test free of a TypeScript runner.
const here = fileURLToPath(new URL(".", import.meta.url));
const source = readFileSync(join(here, "..", "src", "app", "provider", "_components", "server-errors.ts"), "utf8");
const js = source
  .replace(/^type Lang = .*$/m, "")
  .replace(/const known: Array<\[RegExp, string\]> =/, "const known =")
  .replace(/function rawMessage\(error: unknown\): string/, "function rawMessage(error)")
  .replace(/\(error as \{ message: unknown \}\)/, "(error)")
  .replace(/export function describeServerError\(error: unknown, lang: Lang\): string/, "function describeServerError(error, lang)");
const describeServerError = new Function(`${js}\nreturn describeServerError;`)();

// Every message the P3 commands can raise must have an Arabic form: they are read from the migrations themselves.
const migrations = ["20261005060000_enterprise_inventory_and_supply.sql", "20261005070000_inventory_controls_and_chain_operations.sql"]
  .map((name) => readFileSync(join(here, "..", "..", "supabase", "migrations", name), "utf8")).join("\n");
const raised = [...new Set([...migrations.matchAll(/RAISE EXCEPTION '((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'")))];

describe("describeServerError (C-D28)", () => {
  it("returns the server's reason unchanged in English", () => {
    assert.equal(describeServerError({ message: "Insufficient unreserved stock", code: "22023" }, "en"), "Insufficient unreserved stock");
  });
  it("translates every reason the inventory and chain commands raise", () => {
    assert.ok(raised.length > 30, `found ${raised.length} messages`);
    const untranslated = raised.filter((message) => describeServerError({ message }, "ar").startsWith("رفض الخادم العملية:"));
    assert.deepEqual(untranslated, []);
  });
  it("keeps an unknown reason visible after an Arabic lead-in instead of hiding it", () => {
    assert.equal(describeServerError(new Error("Something new went wrong"), "ar"), "رفض الخادم العملية: Something new went wrong");
  });
  it("copes with empty and non-object errors", () => {
    assert.equal(describeServerError(null, "ar"), "تعذر تنفيذ العملية.");
    assert.equal(describeServerError("boom", "en"), "boom");
  });
});
