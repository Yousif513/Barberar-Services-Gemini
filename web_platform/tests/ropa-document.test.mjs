import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// X2: the console shows the RoPA read-only; the controlled source is the versioned document. The bundled copy must match it.
describe("RoPA in the console", () => {
  it("is the versioned document, byte for byte", () => {
    const source = readFileSync(new URL("../../docs/privacy/ropa.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const bundled = readFileSync(new URL("../src/lib/ropa-document.ts", import.meta.url), "utf8");
    const sha = createHash("sha256").update(source).digest("hex");
    assert.ok(bundled.includes(`ROPA_SHA256 = "${sha}"`), "run node scripts/build-ropa.mjs after editing docs/privacy/ropa.md");
    assert.ok(bundled.includes(`ROPA_MARKDOWN = ${JSON.stringify(source)}`));
  });

  it("marks what the owner must complete instead of inventing legal facts, and names the processors", () => {
    const source = readFileSync(new URL("../../docs/privacy/ropa.md", import.meta.url), "utf8");
    assert.ok((source.match(/OWNER MUST COMPLETE/g) ?? []).length >= 10);
    for (const name of ["Supabase", "Tap Payments", "WhatsApp"]) assert.ok(source.includes(name), name);
  });

  it("the page has no editing control", () => {
    const page = readFileSync(new URL("../src/app/admin/ropa/page.tsx", import.meta.url), "utf8");
    assert.ok(page.includes("ROPA_MARKDOWN"));
    assert.doesNotMatch(page, /supabase\.(rpc|from)\(/);
    assert.doesNotMatch(page, /<(input|textarea|form)\b/);
  });
});
