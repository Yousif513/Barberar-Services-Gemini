import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// QAFIX (docs/reviews/2026-10-17-qa-release-gate.md). The screens are read as text: the behaviour of the judgement they use is
// tested in write-result.test.mjs and the commands in supabase/tests/db/qafix_console_commands.test.mjs; this file keeps the
// screens wired to them, so a refused write can never again be shown as saved.
const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(repoRoot, path), "utf8");

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}
const portalFiles = ["web_platform/src/app/admin", "web_platform/src/app/provider"]
  .flatMap((dir) => sourceFiles(join(repoRoot, dir)))
  .map((path) => ({ path: relative(repoRoot, path).replace(/\\/g, "/"), code: readFileSync(path, "utf8") }));

// Every direct UPDATE or DELETE statement on a table, from `.from(` to the end of the statement.
function directWrites(code) {
  const found = [];
  const pattern = /\.from\("([a-z_]+)"\)/g;
  let match;
  while ((match = pattern.exec(code))) {
    const end = code.indexOf(";", match.index);
    const statement = code.slice(match.index, end === -1 ? undefined : end);
    if (!/\.(update|delete)\(/.test(statement)) continue;
    found.push({ table: match[1], statement, before: code.slice(Math.max(0, match.index - 260), match.index) });
  }
  return found;
}

// Deliberate exceptions, each with its reason.
const NO_ROW_IS_A_VALID_ANSWER = [
  // The staff member's service assignments are replaced: the old rows are deleted (there may be none), then the new ones are
  // inserted; an insert refused by the row policy raises.
  ["web_platform/src/app/provider/employees/page.tsx", "employee_services"],
];

describe("direct table writes in the console and the provider portal", () => {
  it("no console screen writes the catalogue, branch, package, integration or payment-method tables directly", () => {
    const tables = ["services", "branches", "packages", "integrations", "integration_audit_log", "payment_methods"];
    const offenders = portalFiles
      .filter((f) => f.path.startsWith("web_platform/src/app/admin/"))
      .flatMap((f) => directWrites(f.code).filter((w) => tables.includes(w.table)).map((w) => `${f.path}: ${w.table}`));
    const inserts = portalFiles
      .filter((f) => f.path.startsWith("web_platform/src/app/admin/"))
      .filter((f) => new RegExp(`\\.from\\("(${tables.join("|")})"\\)\\s*\\.(insert|upsert)\\(`).test(f.code))
      .map((f) => f.path);
    assert.deepEqual([...offenders, ...inserts], []);
  });

  it("every other direct update or delete names the rows it changed and treats zero rows as a refusal", () => {
    const unchecked = [];
    for (const f of portalFiles) {
      for (const w of directWrites(f.code)) {
        if (NO_ROW_IS_A_VALID_ANSWER.some(([path, table]) => path === f.path && table === w.table)) continue;
        const asksForRows = /\.select\(/.test(w.statement);
        const compact = w.before.replace(/\s+/g, "");
        const judged = /(checkedWrite|tableWriteOutcome|requireRows)\((await)?supabase$/.test(compact)
          || /run\(\(\)=>supabase$/.test(compact)
          || /\.then\(\(answer\) =>[\s\S]*checkedWrite\(answer/.test(w.statement);
        if (!asksForRows || !judged) unchecked.push(`${f.path}: ${w.table}${asksForRows ? "" : " (no .select)"}`);
      }
    }
    assert.deepEqual(unchecked, [], "a write the row policy refuses matches no row and raises nothing");
  });

  it("the provider services form writes the status, because the trigger derives is_active from it", () => {
    const code = read("web_platform/src/app/provider/services/page.tsx");
    assert.ok(code.includes('status: serviceForm.isActive ? "active" : "draft"'));
    assert.ok(!/update\(\{ is_active: false \}\)[^;]*\.eq\("id", service\.id\)/.test(code), "archiving writes the status, not is_active");
  });
});

describe("the console screens call the commands and believe only their answer", () => {
  const screens = {
    "web_platform/src/app/admin/services/page.tsx": ["admin_save_service"],
    "web_platform/src/app/admin/branches/page.tsx": ["admin_set_branch_active"],
    "web_platform/src/app/admin/packages/page.tsx": ["admin_set_package_active"],
    "web_platform/src/app/admin/integrations/page.tsx": ["admin_set_integration_state", "admin_save_integration"],
    "web_platform/src/app/admin/ledger/page.tsx": ["admin_set_payment_method", "admin_set_default_payment_method"],
  };
  for (const [path, commands] of Object.entries(screens)) {
    it(`${path.split("/").slice(-2, -1)[0]} calls ${commands.join(" and ")} through commandOutcome`, () => {
      const code = read(path);
      for (const command of commands) assert.ok(code.includes(`"${command}"`), `${command} is called`);
      assert.ok(/commandOutcome|optimisticWrite/.test(code), "the answer is judged");
      assert.ok(code.includes("describeConsoleError("), "a refusal is shown in the reader's language");
      assert.ok(!/setSuccess\([^)]*\)\s*;\s*\n\s*\}\s*catch/.test(code), "no success before the answer is known");
    });
  }

  it("the integration history is written by the server, not by the screen", () => {
    const code = read("web_platform/src/app/admin/integrations/page.tsx");
    assert.ok(!code.includes('from("integration_audit_log")'));
  });

  it("the services price is saved when the operator leaves the field, not on every keystroke", () => {
    const code = read("web_platform/src/app/admin/services/page.tsx");
    assert.ok(code.includes("onBlur={() => void commitPrice(item)}"));
    assert.ok(!/onChange=\{\(e\) => handlePriceChange/.test(code));
  });
});
