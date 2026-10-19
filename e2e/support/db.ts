// SQL against the local stack's Postgres, as the superuser inside the Docker container (the same channel
// scripts/smoke-local-supabase.mjs uses). Only fixtures use it: to arrange rows a test needs and to read back what the
// app wrote. The SQL goes in on stdin, so quotes and Arabic text never pass through a shell.

import { execFileSync } from "node:child_process";
import { stack } from "./stack";

export type SqlValue = string | number | boolean | null | undefined | Date | string[];

/** A SQL literal. Strings are single-quoted with quotes doubled; arrays become text[]; null/undefined become NULL. */
export function lit(value: SqlValue): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("not a finite number");
    return String(value);
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return `'${value.toISOString()}'::timestamptz`;
  if (Array.isArray(value)) return `ARRAY[${value.map((v) => lit(v)).join(", ")}]::text[]`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Runs SQL and returns psql's unaligned, tuples-only output. */
export function sql(text: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", stack().dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-A", "-t", "-f", "-"],
    { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 },
  ).trim();
}

/** Runs one SELECT and returns its rows as objects (the query is wrapped in json_agg). */
export function rows<T = Record<string, unknown>>(query: string): T[] {
  const out = sql(`select coalesce(json_agg(q), '[]'::json) from (${query}) q;`);
  return JSON.parse(out) as T[];
}

/**
 * Runs a write whose last output is one JSON value (an INSERT ... RETURNING json_build_object(...), or a data-modifying WITH
 * that ends in SELECT json_build_object(...)) and returns it parsed. Writes cannot be wrapped like rows() reads are.
 */
export function written<T = Record<string, unknown>>(statement: string): T {
  // Fixture writes run as the service role, the identity server jobs use (supabase/seed.sql does the same), so the guards that
  // stop a browser session from setting control fields (verification, status, owner) leave arranged rows as written.
  const lines = sql(`select set_config('request.jwt.claims', '{"role":"service_role"}', false);\n${statement}`).split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "");
  return JSON.parse(lines[lines.length - 1]) as T;
}

export function one<T = Record<string, unknown>>(query: string): T {
  const found = rows<T>(query);
  if (found.length !== 1) throw new Error(`expected one row, got ${found.length}`);
  return found[0];
}

/** The database clock: tests derive every time they need from it, never from the test machine's calendar. */
export function dbNow(): Date {
  return new Date(one<{ now: string }>("select now() as now").now);
}
