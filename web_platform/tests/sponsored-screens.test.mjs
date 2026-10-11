import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// G63 sponsored placement: the screens call the commands the migrations declare, say the server's reasons in Arabic, use the shared dialogs,
// mirror under RTL, show the visible label above the organic results and open from one navigation entry per portal.
const here = fileURLToPath(new URL(".", import.meta.url));
const src = (...parts) => readFileSync(join(here, "..", "src", ...parts), "utf8");
const migrationDir = join(here, "..", "..", "supabase", "migrations");
const migration = ["20261008800000_sponsored_placement_tables.sql", "20261008800100_sponsored_placement_commands.sql"]
  .map((f) => readFileSync(join(migrationDir, f), "utf8")).join("\n");

const lib = src("lib", "sponsored.ts");
const provider = src("app", "provider", "promote", "page.tsx");
const admin = src("app", "admin", "sponsored", "page.tsx");
const block = src("components", "sponsored-placements.tsx");
const discover = src("app", "discover", "page.tsx");
const screens = { provider, admin, block };

// The reasons table is TypeScript: evaluate the array without its type annotation.
const reasonsSource = lib.slice(lib.indexOf("const arabicReasons"), lib.indexOf("export function sponsoredError"));
const reasons = new Function(`${reasonsSource.replace("const arabicReasons: Array<[RegExp, string]> =", "const arabicReasons =")}; return arabicReasons;`)();
const arabic = (message) => reasons.find(([pattern]) => pattern.test(message))?.[1] ?? null;

// The keys of the en and ar objects of `const copy = { en: {...}, ar: {...} }`, read from the syntax tree.
function copyKeys(text) {
  const file = ts.createSourceFile("screen.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out = {};
  file.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const decl of node.declarationList.declarations) {
      if (decl.name.getText() !== "copy" || !decl.initializer) continue;
      let literal = decl.initializer;
      if (ts.isAsExpression(literal)) literal = literal.expression;
      for (const prop of literal.properties) out[prop.name.getText()] = new Set(prop.initializer.properties.map((p) => p.name.getText()));
    }
  });
  assert.ok(out.en && out.ar && out.en.size > 20, "the copy table has both languages");
  return out;
}

describe("sponsored placement reasons", () => {
  // Raised for the scheduler or an administrator who is never on these screens, or an input the screens cannot send.
  const internalOnly = new Set([
    "Authentication required",
    "Administrator access required",
    "Only administrators or the scheduler can read sponsored fees",
    "A provider and a month are required",
  ]);
  const raised = [...new Set([...migration.matchAll(/RAISE EXCEPTION '((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'")))]
    .filter((m) => !internalOnly.has(m) && !m.includes("%"));

  it("translates every static reason the commands and the settings can raise into Arabic", () => {
    assert.ok(raised.length > 15, "the migrations raise their reasons as plain text");
    for (const message of raised) {
      const text = arabic(message);
      assert.ok(text && /[؀-ۿ]/.test(text), `no Arabic form for: ${message}`);
    }
  });
});

describe("sponsored placement screens", () => {
  it("call commands that exist in the migrations, with the arguments they declare", () => {
    const calls = [
      ...provider.matchAll(/\.rpc\("([a-z_]+)"/g), ...admin.matchAll(/\.rpc\("([a-z_]+)"/g), ...block.matchAll(/\.rpc\("([a-z_]+)"/g),
    ].map((m) => m[1]);
    for (const name of new Set(calls)) {
      if (["sponsored_config"].includes(name)) assert.match(migration, new RegExp(`FUNCTION public\\.${name}\\(`));
      else if (name === "admin_update_platform_setting") assert.match(migration, /sponsored\.price_per_new_client_sar/);
      else assert.match(migration, new RegExp(`FUNCTION public\\.${name}\\(`), `${name} is not defined`);
    }
    for (const arg of ["p_provider_id", "p_branch_id", "p_city", "p_category_slug", "p_monthly_budget_cap_sar", "p_starts_on", "p_ends_on", "p_reason"]) {
      assert.match(provider, new RegExp(arg));
      assert.match(migration, new RegExp(`CREATE OR REPLACE FUNCTION public\\.create_sponsored_campaign\\([^)]*${arg}`));
    }
    assert.match(provider, /set_sponsored_campaign_status/);
    assert.match(provider, /update_sponsored_campaign/);
    assert.match(provider, /sponsored_statement/);
    assert.match(admin, /admin_sponsored_overview/);
    assert.match(admin, /admin_void_sponsored_attribution/);
  });

  it("change state only through reasoned dialogs, never a native prompt", () => {
    for (const [name, text] of Object.entries(screens)) {
      assert.doesNotMatch(text, /\b(window\.)?(confirm|alert|prompt)\(/, `${name} uses a native dialog`);
    }
    assert.match(provider, /CommandDialog/);
    assert.match(admin, /CommandDialog/);
    // Activation is the provider accepting a price: it needs the explicit acknowledgement.
    assert.match(provider, /acknowledgement=/);
    assert.match(admin, /tone=\{isVoid \? "danger"/);
  });

  it("carry both languages for every copy key and mirror under RTL", () => {
    for (const [name, text] of Object.entries({ provider, admin })) {
      const { en: enKeys, ar: arKeys } = copyKeys(text);
      for (const key of enKeys) assert.ok(arKeys.has(key), `${name}: ${key} has no Arabic`);
      for (const key of arKeys) assert.ok(enKeys.has(key), `${name}: ${key} has no English`);
      assert.match(text, /dir=\{(dir|locale === "ar" \? "rtl" : "ltr")\}/, `${name} sets the direction`);
    }
    for (const [name, text] of Object.entries(screens)) {
      assert.doesNotMatch(text, /\b(text-left|text-right|ml-\d|mr-\d|pl-\d|pr-\d)\b/, `${name} uses a physical direction class`);
    }
  });

  it("states loading, empty and error separately and never substitutes sample data", () => {
    for (const text of [provider, admin]) {
      assert.match(text, /role="status"/);
      assert.match(text, /role="alert"/);
    }
    assert.match(provider, /campaignsEmpty/);
    assert.match(provider, /linesEmpty/);
    assert.match(admin, /feesEmpty/);
    for (const [name, text] of Object.entries(screens)) {
      assert.doesNotMatch(text, /mock|sample|lorem|dummy|placeholder data/i, `${name} mentions invented data`);
    }
  });

  it("takes the price, the window and the slot count from the database, never from the screen", () => {
    for (const text of [provider, admin, block]) {
      assert.doesNotMatch(text, /\b(price|fee|window|slots?)\w*\s*[:=]\s*\d/i);
    }
    assert.match(provider, /sponsored_config/);
    assert.match(admin, /config\.price_per_new_client_sar/);
  });
});

describe("the labelled block and the navigation", () => {
  it("shows the visible Sponsored / إعلان badge on every place, in its own region", () => {
    assert.match(block, /Sponsored \/ إعلان/);
    assert.match(block, /<section aria-label/);
    assert.match(block, /get_sponsored_placements/);
    assert.match(block, /record_sponsored_click/);
    // the badge is inside the loop that draws each place
    const loop = block.slice(block.indexOf("answer.placements.map"));
    assert.ok(loop.indexOf("t.badge") > 0, "the badge is drawn with each place");
    // nothing is drawn while the database returns no place
    assert.match(block, /answer\.placements\.length === 0\) return null/);
  });

  it("is added to the discover page above the organic results with one import and one element", () => {
    assert.equal(discover.split("SponsoredPlacements").length - 1, 2);
    const at = discover.indexOf("<SponsoredPlacements");
    assert.ok(at > 0);
    assert.ok(at < discover.indexOf("branches.length === 0 ?"), "the block precedes the organic list");
    assert.match(discover, /<SponsoredPlacements locale=\{locale\} city=\{selectedCity\} category=\{selectedCategory\} \/>/);
  });

  it("opens from one navigation entry per portal, in both languages", () => {
    const providerLayout = src("app", "provider", "layout.tsx");
    const adminLayout = src("app", "admin", "layout.tsx");
    assert.equal(providerLayout.split("/provider/promote").length - 1, 1);
    assert.equal(adminLayout.split("/admin/sponsored").length - 1, 1);
    assert.match(providerLayout, /promote: "Promote"/);
    assert.match(providerLayout, /promote: "الترويج"/);
    assert.match(adminLayout, /sponsored: "Sponsored placement"/);
    assert.match(adminLayout, /sponsored: "الأماكن المموّلة"/);
  });
});
