import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  checkParams, filterEpochMs, isCalendarDate, isInstant, isUuid, parseDateParam, parseStatusParam, parseUuidParam, parseWhenParam,
} from "../../supabase/functions/_shared/api-params.ts";
import { decodeCursor, encodeCursor, paginate, parseLimit } from "../../supabase/functions/_shared/api-pagination.ts";
import { parseRateLimit, rateLimitHeaders, retryAfterSeconds } from "../../supabase/functions/_shared/api-rate-limit.ts";
import { ERROR_STATUS, errorBody, mapBackendError, newRequestId } from "../../supabase/functions/_shared/api-errors.ts";
import {
  API_SCOPES, BOOKING_STATUSES, PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX, WEBHOOK_EVENT_TYPES,
} from "../../supabase/functions/_shared/api-contract.ts";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

describe("contract constants", () => {
  it("keeps the scope list in step with the database", () => {
    const sql = readFileSync(new URL("../../supabase/migrations/20261006090000_api_keys.sql", import.meta.url), "utf8");
    const fn = sql.match(/FUNCTION public\.api_allowed_scopes\(\)[\s\S]*?ARRAY\[([^\]]+)\]/)[1];
    const inDatabase = [...fn.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual([...API_SCOPES], inDatabase);
    assert.ok(!API_SCOPES.some((s) => s.startsWith("webhooks")), "webhooks are managed in the console only");
  });

  it("keeps the booking statuses in step with the booking_status enum", () => {
    const init = readFileSync(new URL("../../supabase/migrations/20260613000000_init_schema.sql", import.meta.url), "utf8");
    const labels = [...init.match(/CREATE TYPE booking_status AS ENUM \(([^)]+)\)/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual([...BOOKING_STATUSES], labels);
  });

  it("has a sane page size contract and exactly the four booking events", () => {
    assert.ok(PAGE_SIZE_DEFAULT >= 1 && PAGE_SIZE_DEFAULT <= PAGE_SIZE_MAX);
    assert.deepEqual([...WEBHOOK_EVENT_TYPES], ["booking.created", "booking.confirmed", "booking.cancelled", "booking.completed"]);
  });
});

describe("query parameter parsing", () => {
  it("validates calendar dates, including leap days and month lengths", () => {
    for (const good of ["2026-10-07", "2028-02-29", "2000-02-29", "2026-12-31"]) assert.equal(isCalendarDate(good), true, good);
    for (const bad of ["2026-02-29", "2100-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-10-00", "26-10-07", "2026-1-7", "2026-10-07T00:00:00Z", "", "1969-12-31", "abc"]) {
      assert.equal(isCalendarDate(bad), false, bad);
    }
  });

  it("validates instants that state their offset", () => {
    for (const good of ["2026-10-07T09:30:00Z", "2026-10-07T09:30:00+03:00", "2026-10-07T09:30:00.123456+00:00", "2026-10-07T09:30Z", "2026-10-07T23:59:59-05:30"]) {
      assert.equal(isInstant(good), true, good);
    }
    for (const bad of ["2026-10-07T09:30:00", "2026-10-07 09:30:00Z", "2026-10-07T24:00:00Z", "2026-10-07T09:60:00Z", "2026-10-07T09:30:60Z", "2026-02-30T09:30:00Z", "2026-10-07T09:30:00+24:00", "2026-10-07T09:30:00+03", "2026-10-07T09:30:00.1234567Z", "2026-10-07"]) {
      assert.equal(isInstant(bad), false, bad);
    }
  });

  it("reads date-only filter values as midnight in Riyadh when comparing", () => {
    assert.equal(filterEpochMs("2026-10-07"), Date.UTC(2026, 9, 6, 21, 0, 0));
    assert.equal(filterEpochMs("2026-10-07T00:00:00+03:00"), filterEpochMs("2026-10-07"));
    assert.ok(filterEpochMs("2026-10-07") < filterEpochMs("2026-10-07T00:00:00Z"));
  });

  it("parses uuid, date, when and status parameters", () => {
    assert.deepEqual(parseUuidParam("service_id", ID.toUpperCase(), true), { ok: true, value: ID });
    assert.deepEqual(parseUuidParam("service_id", null, false), { ok: true, value: null });
    assert.equal(parseUuidParam("service_id", null, true).ok, false);
    assert.equal(parseUuidParam("service_id", "1; drop table", true).ok, false);
    assert.equal(isUuid(ID), true);
    assert.equal(parseDateParam("date", "2026-10-07", true).value, "2026-10-07");
    assert.equal(parseDateParam("date", "2026-10-07T00:00:00Z", true).ok, false);
    assert.equal(parseWhenParam("from", null).value, null);
    assert.equal(parseWhenParam("from", "2026-10-07").value, "2026-10-07");
    assert.equal(parseWhenParam("from", "07/10/2026").ok, false);
    assert.equal(parseStatusParam("no_show").value, "no_show");
    assert.equal(parseStatusParam(null).value, null);
    assert.equal(parseStatusParam("CONFIRMED").ok, false, "status values are case-sensitive");
    assert.equal(parseStatusParam("confirmed,cancelled").ok, false);
  });

  it("rejects unknown and repeated parameters", () => {
    assert.equal(checkParams(new URLSearchParams("limit=5"), ["limit", "cursor"]).ok, true);
    assert.equal(checkParams(new URLSearchParams("limt=5"), ["limit", "cursor"]).ok, false);
    assert.equal(checkParams(new URLSearchParams("limit=5&limit=6"), ["limit"]).ok, false);
    assert.match(checkParams(new URLSearchParams("x".repeat(200) + "=1"), ["limit"]).message.length < 80 ? "ok" : "long", /ok/, "echoed names are truncated");
  });
});

describe("pagination", () => {
  it("applies the page-size contract", () => {
    assert.deepEqual(parseLimit(null), { ok: true, value: PAGE_SIZE_DEFAULT });
    assert.equal(parseLimit("1").value, 1);
    assert.equal(parseLimit(String(PAGE_SIZE_MAX)).value, PAGE_SIZE_MAX);
    for (const bad of ["0", "00", "01", "-5", String(PAGE_SIZE_MAX + 1), "1e2", " 5", "5 ", "five", "", "9".repeat(7)]) {
      assert.equal(parseLimit(bad).ok, false, JSON.stringify(bad));
    }
  });

  it("round-trips a cursor and keeps the timestamp text exactly", () => {
    for (const t of [null, "2026-10-08T07:00:00+00:00", "2026-10-08T07:00:00.123456+00:00", "2026-10-08T10:00:00+03:00"]) {
      const encoded = encodeCursor({ t, i: ID });
      assert.match(encoded, /^[A-Za-z0-9_-]+$/, "URL-safe, no padding");
      assert.deepEqual(decodeCursor(encoded), { ok: true, value: { t, i: ID } });
    }
    assert.deepEqual(decodeCursor(null), { ok: true, value: null });
    assert.deepEqual(decodeCursor(""), { ok: true, value: null });
  });

  it("refuses forged, damaged and oversized cursors", () => {
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const bad = [
      "!!!", "abc", "a".repeat(300), enc({ v: 1 }), enc({ v: 2, t: null, i: ID }), enc({ v: 1, t: null, i: "not-a-uuid" }),
      enc({ v: 1, t: "yesterday", i: ID }), enc({ v: 1, t: 5, i: ID }), enc({ v: 1, t: "2026-10-08T07:00:00", i: ID }),
      enc([1, 2]), enc("text"), Buffer.from("not json").toString("base64url"), enc({ v: 1, t: null, i: ID + "'; --" }),
    ];
    for (const cursor of bad) assert.equal(decodeCursor(cursor).ok, false, cursor.slice(0, 30));
  });

  it("splits a fetch of limit+1 rows into a page and a cursor", () => {
    const rows = [1, 2, 3].map((n) => ({ id: `00000000-0000-4000-8000-00000000000${n}` }));
    const cursorOf = (r) => ({ t: null, i: r.id });
    const more = paginate(rows, 2, cursorOf);
    assert.equal(more.data.length, 2);
    assert.equal(more.pagination.has_more, true);
    assert.equal(decodeCursor(more.pagination.next_cursor).value.i, rows[1].id);
    const last = paginate(rows.slice(0, 2), 2, cursorOf);
    assert.deepEqual(last.pagination, { limit: 2, has_more: false, next_cursor: null });
    assert.deepEqual(paginate([], 5, cursorOf), { data: [], pagination: { limit: 5, has_more: false, next_cursor: null } });
  });
});

describe("rate-limit headers", () => {
  const state = { limit: 60, remaining: 41, reset_at: 1_000_060, exceeded: false };

  it("reports limit, remaining and the reset time of the window", () => {
    assert.deepEqual(rateLimitHeaders(state, 1_000_030), {
      "X-RateLimit-Limit": "60", "X-RateLimit-Remaining": "41", "X-RateLimit-Reset": "1000060",
    });
  });

  it("adds Retry-After only when the limit is used up, never below one second", () => {
    const over = { ...state, remaining: 0, exceeded: true };
    assert.equal(rateLimitHeaders(over, 1_000_030)["Retry-After"], "30");
    assert.equal(rateLimitHeaders(over, 1_000_059)["Retry-After"], "1");
    assert.equal(rateLimitHeaders(over, 1_000_060)["Retry-After"], "1", "at the boundary");
    assert.equal(rateLimitHeaders(over, 1_000_500)["Retry-After"], "1", "a clock that is ahead still gives a positive wait");
    assert.equal(retryAfterSeconds(over, 1_000_000), 60);
    assert.equal(rateLimitHeaders({ ...over, remaining: 5 }, 0)["X-RateLimit-Remaining"], "0", "an exceeded state never advertises remaining requests");
  });

  it("validates what the database returned", () => {
    assert.deepEqual(parseRateLimit(state), state);
    for (const bad of [null, "x", {}, { ...state, limit: 0 }, { ...state, remaining: -1 }, { ...state, remaining: 61 }, { ...state, reset_at: 1.5 }, { ...state, exceeded: "no" }]) {
      assert.equal(parseRateLimit(bad), null, JSON.stringify(bad));
    }
  });
});

describe("error taxonomy", () => {
  it("has the documented statuses", () => {
    assert.deepEqual(ERROR_STATUS, {
      invalid_request: 400, unauthorized: 401, forbidden: 403, not_found: 404, method_not_allowed: 405, rate_limited: 429, internal_error: 500,
    });
  });

  it("shapes errors as { error: { code, message, request_id } }", () => {
    assert.deepEqual(errorBody("not_found", "No such endpoint.", "req_1"), { error: { code: "not_found", message: "No such endpoint.", request_id: "req_1" } });
  });

  it("maps SQLSTATEs without forwarding the database message", () => {
    assert.equal(mapBackendError({ code: "28000", message: "Invalid API key" }).code, "unauthorized");
    assert.equal(mapBackendError({ code: "42501", message: "x" }).code, "forbidden");
    assert.equal(mapBackendError({ code: "P0002", message: "x" }).code, "not_found");
    assert.equal(mapBackendError({ code: "22023", message: "x" }).code, "invalid_request");
    assert.equal(mapBackendError({ code: "22P02", message: "x" }).code, "invalid_request");
    for (const e of [{ code: "XX000", message: "secret table name" }, { code: null, message: "secret" }, {}]) {
      const mapped = mapBackendError(e);
      assert.equal(mapped.code, "internal_error");
      assert.ok(!mapped.message.includes("secret"));
    }
  });

  it("generates unpredictable request ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newRequestId()));
    assert.equal(ids.size, 200);
    for (const id of ids) assert.match(id, /^req_[0-9a-f]{32}$/);
  });
});
