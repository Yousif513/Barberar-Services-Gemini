// Checks that what the screens ask the database for exists in the database.
//
//   node scripts/verify-ui-schema.mjs [--root <dir>] [--json] [--update-baseline]
//
// It migrates an in-memory Postgres (PGlite) from <root>/supabase/migrations with the test harness, then reads every
// web_platform/src and mobile_app/src file under <root> and checks, statically:
//   * .rpc("name", { args }): the function exists and one overload accepts exactly those argument names;
//   * .from("table").select("...") strings, including embedded resources: every column and embed resolves;
//   * .eq/.order/... filter columns and the keys of .insert/.update/.upsert object literals: columns of that table.
// The 156 web tests only read source text; this is the check that found screens that cannot load against the real schema.
//
// scripts/ui-schema-baseline.json lists mismatches that are known and not fixed yet. The run fails when a mismatch is
// not in the baseline, and ALSO when a baseline entry no longer occurs (so a fix must remove its entry: the baseline can only shrink).

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const rootArg = args.indexOf("--root");
const root = resolve(rootArg >= 0 ? args[rootArg + 1] : join(here, ".."));
const asJson = args.includes("--json");
const updateBaseline = args.includes("--update-baseline");
const baselinePath = join(here, "ui-schema-baseline.json");

// ---- the migrated schema ----------------------------------------------------------------------------------------
async function loadSchema() {
  const harness = await import(pathToFileURL(join(root, "supabase/tests/db/harness.mjs")).href);
  const db = await harness.createMigratedDb();
  const q = async (sql) => (await db.query(sql)).rows;
  const columns = await q(`select c.table_name, c.column_name from information_schema.columns c where c.table_schema = 'public'`);
  const tables = await q(`select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','v','m','p')`);
  const funcs = await q(`select p.proname as name, pg_get_function_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind in ('f','p')`);
  const fks = await q(`select conrelid::regclass::text as tbl, pg_get_constraintdef(oid) as def from pg_constraint where connamespace = 'public'::regnamespace and contype = 'f'`);
  await db.close();
  return { columns, tables, funcs, fks };
}

const schema = await loadSchema();
const tables = new Set(schema.tables.map((t) => t.name));
const cols = new Map();
for (const c of schema.columns) {
  if (!cols.has(c.table_name)) cols.set(c.table_name, new Set());
  cols.get(c.table_name).add(c.column_name);
}
const fkMap = new Map();
for (const f of schema.fks) {
  const m = f.def.match(/FOREIGN KEY \((\w+)\) REFERENCES (\w+)\(/);
  if (m) fkMap.set(`${f.tbl.replace("public.", "")}.${m[1]}`, m[2]);
}
// every foreign key as an edge between two tables: an embed between two tables that have more than one is ambiguous (PostgREST answers 300)
const edges = [];
for (const f of schema.fks) {
  const m = f.def.match(/FOREIGN KEY \((\w+)\) REFERENCES (\w+)\(/);
  if (m) edges.push({ from: f.tbl.replace("public.", ""), to: m[2] });
}
const relationshipsBetween = (a, b) => edges.filter((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a)).length;
const funcs = new Map();
for (const f of schema.funcs) {
  const parts = splitTop(f.args);
  const names = parts.map((a) => (a.match(/^(?:IN |OUT |INOUT |VARIADIC )?([a-z_0-9]+)\s/i) ?? [])[1] ?? a);
  const hasDefault = parts.map((a) => /\bDEFAULT\b/i.test(a));
  if (!funcs.has(f.name)) funcs.set(f.name, []);
  funcs.get(f.name).push({ names, hasDefault, raw: f.args });
}

// ---- small parsing helpers --------------------------------------------------------------------------------------
function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if ("([{".includes(ch)) depth += 1;
    if (")]}".includes(ch)) depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function balanced(src, start, open = "{", close = "}") {
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === open) depth += 1;
    else if (src[i] === close) {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return src.slice(start);
}

// Keys at depth 1 of an object literal. `unchecked` is set when a spread or computed key makes the list incomplete.
function objectKeys(obj) {
  const keys = [];
  let unchecked = false;
  let depth = 0;
  for (let i = 0; i < obj.length; i += 1) {
    const ch = obj[i];
    if ("{[(".includes(ch)) depth += 1;
    else if ("}])".includes(ch)) depth -= 1;
    if (depth === 1 && (ch === "{" || ch === ",")) {
      const rest = obj.slice(i + 1);
      if (/^\s*\.\.\./.test(rest) || /^\s*\[/.test(rest)) unchecked = true;
      const m = rest.match(/^\s*(?:"([A-Za-z_0-9]+)"|([A-Za-z_][A-Za-z_0-9]*))\s*(:|,|\})/);
      if (m) keys.push(m[1] || m[2]);
    }
  }
  return { keys, unchecked };
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

function checkSelect(table, sel, where, problems) {
  for (const item of splitTop(sel)) {
    const m = item.match(/^([^(]*)\(([\s\S]*)\)$/);
    if (m) {
      let head = m[1].trim();
      if (head.includes(":")) head = head.split(":")[1].trim();
      const [name] = head.split("!");
      let ref = null;
      if (tables.has(name)) {
        ref = name;
        if (!head.includes("!") && relationshipsBetween(table, name) > 1) {
          problems.push({ where, call: `from("${table}").select`, problem: `embed "${name}" is ambiguous: ${relationshipsBetween(table, name)} foreign keys link ${table} and ${name}; name one with ${name}!<constraint>` });
        }
      }
      else if (fkMap.has(`${table}.${name}`)) ref = fkMap.get(`${table}.${name}`);
      else {
        problems.push({ where, call: `from("${table}").select`, problem: `embed "${name}" does not resolve to a table` });
        continue;
      }
      checkSelect(ref, m[2], where, problems);
      continue;
    }
    let col = item.trim();
    if (!col || col === "*") continue;
    if (col.includes(":")) col = col.split(":").pop().trim();
    col = col.split("::")[0].split("->")[0].trim();
    if (/^count\b/.test(col) || !/^[a-z_0-9]+$/.test(col)) continue;
    if (!cols.get(table)?.has(col)) problems.push({ where, call: `from("${table}").select`, problem: `column "${col}" is not in ${table}` });
  }
}

// ---- the checks -------------------------------------------------------------------------------------------------
const problems = [];
let unchecked = 0;
let rpcCalls = 0;
let selects = 0;

for (const file of [...walk(join(root, "web_platform/src")), ...walk(join(root, "mobile_app/src"))]) {
  const src = readFileSync(file, "utf8");
  const rel = relative(root, file).replaceAll("\\", "/");
  const lineOf = (idx) => src.slice(0, idx).split("\n").length;

  // rpc argument names
  for (const m of src.matchAll(/\.rpc\(\s*(["'`])([a-z_0-9]+)\1\s*(?:,\s*)?/g)) {
    const name = m[2];
    const after = m.index + m[0].length;
    const where = `${rel}:${lineOf(m.index)}`;
    const overloads = funcs.get(name);
    rpcCalls += 1;
    if (!overloads) {
      problems.push({ where, call: `rpc("${name}")`, problem: "the function does not exist" });
      continue;
    }
    if (src[after] !== "{") {
      unchecked += 1;
      continue;
    }
    const { keys, unchecked: partial } = objectKeys(balanced(src, after));
    if (partial) {
      unchecked += 1;
      continue;
    }
    const ok = overloads.some((o) => keys.every((k) => o.names.includes(k)) && o.names.every((n, i) => o.hasDefault[i] || keys.includes(n)));
    if (!ok) problems.push({ where, call: `rpc("${name}")`, problem: `arguments [${keys.join(", ")}] do not match ${overloads.map((o) => `(${o.raw})`).join(" | ")}` });
  }

  // select strings, filters and write keys
  for (const m of src.matchAll(/\.from\(\s*(["'`])([a-z_0-9]+)\1\s*\)/g)) {
    const table = m[2];
    const where = `${rel}:${lineOf(m.index)}`;
    if (!tables.has(table)) {
      problems.push({ where, call: `from("${table}")`, problem: "the table or view does not exist" });
      continue;
    }
    let end = m.index + m[0].length;
    let depth = 0;
    for (; end < src.length && end < m.index + 1800; end += 1) {
      const ch = src[end];
      if ("([{".includes(ch)) depth += 1;
      else if (")]}".includes(ch)) depth -= 1;
      if (depth < 0) break;
      if (ch === ";" && depth === 0) break;
    }
    let chain = src.slice(m.index + m[0].length, end);
    const cut = chain.search(/\.from\(|supabase\s*\./);
    if (cut > -1) chain = chain.slice(0, cut);

    const sel = chain.match(/^\s*\.select\(\s*(["'`])([\s\S]*?)\1/);
    if (sel) {
      selects += 1;
      checkSelect(table, sel[2], where, problems);
    }
    for (const fm of chain.matchAll(/\.(eq|neq|gt|gte|lt|lte|in|is|ilike|like|order|contains|not|filter)\(\s*["'`]([A-Za-z_0-9.]+)["'`]/g)) {
      if (fm[2].includes(".")) continue;
      if (!cols.get(table).has(fm[2])) problems.push({ where, call: `from("${table}").${fm[1]}`, problem: `"${fm[2]}" is not a column of ${table}` });
    }
    for (const im of chain.matchAll(/\.(insert|update|upsert)\(\s*(\[\s*)?\{/g)) {
      const { keys, unchecked: partial } = objectKeys(balanced(chain, chain.indexOf("{", im.index)));
      if (partial) unchecked += 1;
      for (const k of keys) {
        if (!cols.get(table).has(k)) problems.push({ where, call: `from("${table}").${im[1]}`, problem: `key "${k}" is not a column of ${table}` });
      }
    }
  }
}

// ---- compare with the baseline ----------------------------------------------------------------------------------
const keyOf = (p) => `${p.where.replace(/:\d+$/, "")} | ${p.call} | ${p.problem}`;
const found = [...new Set(problems.map(keyOf))].sort();
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : [];

if (updateBaseline) {
  writeFileSync(baselinePath, JSON.stringify(found, null, 2) + "\n");
  console.log(`baseline written: ${found.length} known mismatches`);
  process.exit(0);
}

const fresh = found.filter((k) => !baseline.includes(k));
const fixed = baseline.filter((k) => !found.includes(k));

if (asJson) {
  console.log(JSON.stringify({ rpcCalls, selects, unchecked, mismatches: problems, fresh, fixed }, null, 2));
} else {
  console.log(`checked ${rpcCalls} rpc calls and ${selects} select strings (${unchecked} dynamic calls not checked); ${found.length} mismatches, ${baseline.length} in the baseline`);
  for (const p of problems) {
    if (fresh.includes(keyOf(p))) console.log(`  NEW   ${p.where}  ${p.call}: ${p.problem}`);
  }
  for (const k of fixed) console.log(`  FIXED ${k}  -> remove it from scripts/ui-schema-baseline.json`);
}
process.exit(fresh.length || fixed.length ? 1 : 0);
