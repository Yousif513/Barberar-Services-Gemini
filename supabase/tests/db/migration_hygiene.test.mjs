import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MIGRATIONS_DIR } from "./harness.mjs";

// Rules a migration must follow so that every way of applying it behaves the same. PGlite and psql send a whole file to the
// server; the Supabase CLI (supabase db push / db reset / start) splits a file into statements itself with a lexer that does
// not understand backslash escapes inside E'...' strings, cuts a statement in the middle of such a string and the server
// answers "unterminated quoted string". Dollar quoting ($q$...$q$) has no escapes and works everywhere.

const migrations = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
// Applied before this rule existed; they apply cleanly (checked on the real stack) and cannot be edited after being applied.
const GRANDFATHERED = new Set([]);

const code = (sql) => sql.replace(/\r\n/g, "\n").split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");

// An E-string that contains a backslash-escaped quote: E' ... \' ... ' (other escapes such as \n split correctly)
const BACKSLASH_E_STRING = /(^|[^A-Za-z0-9_$])[Ee]'(?:[^'\\]|''|\\[^'])*?\\'/;

describe("migration hygiene", () => {
  it("uses no E'...' string with a backslash-escaped quote (the Supabase CLI splits statements inside them)", () => {
    const offenders = migrations
      .filter((name) => !GRANDFATHERED.has(name))
      .filter((name) => BACKSLASH_E_STRING.test(code(readFileSync(join(MIGRATIONS_DIR, name), "utf8"))));
    assert.deepEqual(offenders, [], "use dollar quoting instead of an E-string with backslashes");
  });

  // Review N9 (docs/reviews/2026-10-11-security-priv-recheck.md): a scratch patch (.sql.tmp) was committed next to the migrations.
  // The CLI skips it, so it looks applied in a review and is not; only migrations and nothing else live in this folder.
  it("holds only <version>_<name>.sql migration files, no scratch, backup or editor files", () => {
    const entries = readdirSync(MIGRATIONS_DIR, { withFileTypes: true });
    const strays = entries.filter((e) => !e.isFile() || !/^[0-9]{14}_[a-z0-9_]+\.sql$/.test(e.name)).map((e) => e.name);
    assert.deepEqual(strays, [], "move scratch files out of supabase/migrations");
  });

  it("has unique, ordered timestamps", () => {
    const stamps = migrations.map((name) => name.split("_")[0]);
    assert.equal(new Set(stamps).size, stamps.length, "two migrations share a version, the CLI would refuse the second");
    assert.deepEqual(stamps, [...stamps].sort());
  });
});
