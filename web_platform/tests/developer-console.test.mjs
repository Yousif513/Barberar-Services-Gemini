import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as contract from "../../supabase/functions/_shared/api-contract.ts";
import * as ui from "../src/lib/developer-api.ts";

// G69 developer console: it must stay in step with the API contract and the migrations, never hold or recompute a
// credential in the browser, and speak both languages.

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const consoleDir = join(here, "../src/app/provider/developer");
const read = (path) => readFileSync(path, "utf8");
const consoleFiles = readdirSync(consoleDir).filter((f) => /\.(tsx|ts)$/.test(f));
const source = Object.fromEntries(consoleFiles.map((f) => [f, read(join(consoleDir, f))]));
const allSource = Object.values(source).join("\n");
const migrations = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).map((f) => read(join(root, "supabase/migrations", f))).join("\n");

describe("contract constants shown by the console", () => {
  it("equal the ones the Edge Functions enforce", () => {
    assert.deepEqual([...ui.API_SCOPES], [...contract.API_SCOPES]);
    assert.deepEqual([...ui.WEBHOOK_EVENTS], [...contract.WEBHOOK_EVENT_TYPES]);
    assert.deepEqual([...ui.BOOKING_STATUSES], [...contract.BOOKING_STATUSES]);
    assert.equal(ui.PAGE_SIZE_DEFAULT, contract.PAGE_SIZE_DEFAULT);
    assert.equal(ui.PAGE_SIZE_MAX, contract.PAGE_SIZE_MAX);
    assert.equal(ui.RATE_LIMIT_WINDOW_SECONDS, contract.RATE_LIMIT_WINDOW_SECONDS);
    assert.equal(ui.SIGNATURE_TOLERANCE_SECONDS, contract.SIGNATURE_TOLERANCE_SECONDS);
    assert.equal(ui.DELIVERY_TIMEOUT_SECONDS * 1000, contract.DELIVERY_TIMEOUT_MS);
    assert.equal(ui.MAX_URL_LENGTH, contract.MAX_URL_LENGTH);
  });

  it("equal the lease and back-off cap the database applies", () => {
    assert.ok(migrations.includes(`next_attempt_at = now() + interval '${ui.LEASE_MINUTES} minutes'`));
    assert.ok(migrations.includes(`power(2, LEAST(p_attempt - 1, 30)), ${ui.BACKOFF_CAP_HOURS * 3600})`));
  });

  it("list the same settings the database seeds", () => {
    for (const key of ui.API_SETTING_KEYS) assert.ok(migrations.includes(`'${key}'`), key);
    assert.equal([...migrations.matchAll(/\('api\.[a-z_]+', 'null'::jsonb/g)].length, ui.API_SETTING_KEYS.length);
  });
});

describe("helpers", () => {
  it("treat only a positive whole number as a set setting", () => {
    const s = ui.readApiSettings([
      { key: "api.max_requests_per_minute", value: 600 }, { key: "api.webhook_max_attempts", value: null }, { key: "api.webhook_retry_base_seconds", value: "30" },
      { key: "api.max_key_lifetime_days", value: 1.5 }, { key: "api.webhook_disable_after_failures", value: 0 }, { key: "booking_hold_minutes", value: 15 },
    ]);
    assert.deepEqual(s, {
      "api.max_requests_per_minute": 600, "api.max_key_lifetime_days": null, "api.webhook_max_attempts": null,
      "api.webhook_retry_base_seconds": null, "api.webhook_disable_after_failures": null,
    });
    assert.equal(ui.keysEnabled(s), true);
    assert.equal(ui.webhookDeliveryEnabled(s), false);
    assert.equal(ui.keysEnabled(ui.readApiSettings([])), false);
    assert.equal(ui.webhookDeliveryEnabled({ ...s, "api.webhook_max_attempts": 3, "api.webhook_retry_base_seconds": 30 }), true);
  });

  it("show a stored key only as prefix and last four", () => {
    assert.equal(ui.maskKey("prm_live_a", "f3c9"), "prm_live_a…f3c9");
  });

  it("turn a chosen day into the last second of that day in Riyadh", () => {
    assert.equal(ui.endOfDayRiyadh("2026-10-07"), "2026-10-07T20:59:59.000Z");
    for (const bad of ["", "07/10/2026", "2026-13-40", "2026-10-07T00:00"]) assert.equal(ui.endOfDayRiyadh(bad), null, bad);
  });

  it("bound the expiry between today and the optional lifetime ceiling, counting days in Riyadh", () => {
    const at = new Date("2026-10-07T22:00:00Z"); // already the 8th in Riyadh
    assert.deepEqual(ui.expiryBounds(at, null), { min: "2026-10-08", max: null });
    const bounds = ui.expiryBounds(at, 30);
    assert.deepEqual(bounds, { min: "2026-10-08", max: "2026-11-06" });
    // The last offered day ends before now + 30 days, so the database's ceiling never refuses what the screen offers.
    assert.ok(new Date(ui.endOfDayRiyadh(bounds.max)).getTime() < at.getTime() + 30 * 86400000);
    assert.ok(new Date(ui.endOfDayRiyadh(ui.expiryBounds(at, 1).max)).getTime() < at.getTime() + 86400000);
  });

  it("classifies a key as active, expired or revoked", () => {
    const now = new Date("2026-10-07T00:00:00Z");
    assert.equal(ui.keyState({ revoked_at: null, expires_at: "2026-10-08T00:00:00Z" }, now), "active");
    assert.equal(ui.keyState({ revoked_at: null, expires_at: "2026-10-06T00:00:00Z" }, now), "expired");
    assert.equal(ui.keyState({ revoked_at: "2026-10-01T00:00:00Z", expires_at: "2026-10-08T00:00:00Z" }, now), "revoked");
  });
});

describe("wording", () => {
  const copyModule = source["copy.ts"];
  it("has the same keys in English and Arabic, and no empty text", async () => {
    const { developerCopy } = await import("../src/app/provider/developer/copy.ts");
    const shape = (value, path = "") => {
      if (typeof value === "string") return [`${path}:${[...value.matchAll(/\{[a-z]+\}/g)].map((m) => m[0]).sort().join("")}`];
      if (Array.isArray(value)) return value.flatMap((v, i) => shape(v, `${path}[${i}]`));
      return Object.entries(value).flatMap(([k, v]) => shape(v, `${path}.${k}`));
    };
    assert.deepEqual(shape(developerCopy.ar), shape(developerCopy.en), "same keys and same placeholders in both languages");
    const empty = (value) => (typeof value === "string" ? value.trim() === "" : Object.values(value).some(empty));
    assert.equal(empty(developerCopy.en) || empty(developerCopy.ar), false);
    const arabic = (value) => (typeof value === "string" ? /[؀-ۿ]/.test(value) : Object.values(value).some(arabic));
    assert.ok(arabic(developerCopy.ar.tabs) && arabic(developerCopy.ar.state) && arabic(developerCopy.ar.deliveryState));
    assert.ok(copyModule.length > 0);
  });

  it("gives every scope and event a label and help text in both languages", async () => {
    const { developerCopy } = await import("../src/app/provider/developer/copy.ts");
    for (const lang of ["en", "ar"]) {
      for (const scope of ui.API_SCOPES) assert.ok(developerCopy[lang].scope[scope] && developerCopy[lang].scopeHelp[scope], `${lang} ${scope}`);
      for (const event of ui.WEBHOOK_EVENTS) assert.ok(developerCopy[lang].eventHelp[event], `${lang} ${event}`);
      for (const key of ui.API_SETTING_KEYS) assert.ok(developerCopy[lang].settingLabel[key] && developerCopy[lang].settingUnset[key], `${lang} ${key}`);
    }
  });

  it("explains every address rejection reason the database can give", async () => {
    const { developerCopy } = await import("../src/app/provider/developer/copy.ts");
    const vectors = JSON.parse(read(join(root, "supabase/tests/fixtures/webhook-url-vectors.json")));
    const reasons = new Set(vectors.filter((v) => !v.ok).map((v) => v.reason));
    for (const reason of reasons) {
      assert.ok(developerCopy.en.urlProblem[reason] && developerCopy.ar.urlProblem[reason], reason);
    }
  });
});

describe("what the screens may and may not do", () => {
  it("never create, hash, store or recompute a credential in the browser", () => {
    for (const forbidden of ["crypto.subtle", "getRandomValues", "hashToken", "api_tokens", "token_hash", "pk_live_", "localStorage", "sessionStorage", "webhook_subscription_secrets", "api_key_hashes"]) {
      assert.ok(!allSource.includes(forbidden), `the console must not contain ${forbidden}`);
    }
    assert.ok(!/from\("(api_keys|webhook_subscriptions|webhook_deliveries)"\)\s*\.(insert|update|delete|upsert)/.test(allSource), "writes go through commands");
    assert.ok(!/select\(\s*["']\*["']/.test(allSource), "no select(*): the screens list their columns");
  });

  it("uses the shared dialogs and no native ones", () => {
    assert.ok(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(allSource), "no native alert, confirm or prompt");
    assert.ok(source["keys-tab.tsx"].includes("CommandDialog") && source["keys-tab.tsx"].includes('"revoke_api_key"'), "revoking is confirmed through the shared dialog");
    assert.ok(source["shared.tsx"].includes("ModalOverlay") && source["page.tsx"].includes("SecretDialog"));
  });

  it("shows the new secret in a dialog that cannot be dismissed before the owner confirms they stored it", () => {
    const dialog = source["shared.tsx"].slice(source["shared.tsx"].indexOf("export function SecretDialog"));
    assert.ok(dialog.includes("canClose={acknowledged}") && dialog.includes("disabled={!acknowledged}"));
    assert.ok(dialog.includes("navigator.clipboard.writeText"));
  });

  it("mirrors under right-to-left: logical spacing and alignment, no physical left/right classes", () => {
    const physical = allSource.match(/\b(?:ml|mr|pl|pr|text-left|text-right|left|right|border-l|border-r|rounded-l|rounded-r)-[\w[\]./-]+/g) ?? [];
    assert.deepEqual(physical.filter((c) => !/^(left|right)-\[?0/.test(c)), [], "use ms-/me-/ps-/pe-/text-start/text-end");
  });

  it("calls only commands that exist, with the argument names the migrations declare", () => {
    const calls = [...allSource.matchAll(/rpc\("([a-z_]+)",\s*\{([^}]*)\}/g)];
    assert.ok(calls.length >= 8, `found ${calls.length} command calls`);
    const names = new Set();
    for (const [, name, body] of calls) {
      names.add(name);
      const definition = migrations.match(new RegExp(`FUNCTION public\\.${name}\\(([\\s\\S]*?)\\)\\s*(?:RETURNS|\\n\\s*RETURNS)`, "i"));
      assert.ok(definition, `${name} is defined in a migration`);
      const declared = [...definition[1].matchAll(/\b(p_[a-z_]+)\b/g)].map((m) => m[1]);
      const used = [...body.matchAll(/\b(p_[a-z_]+)\s*:/g)].map((m) => m[1]);
      assert.deepEqual([...used].sort(), [...declared].sort(), `${name} arguments`);
    }
    for (const expected of ["create_api_key", "revoke_api_key", "create_webhook_endpoint", "update_webhook_endpoint", "set_webhook_endpoint_active", "rotate_webhook_secret", "delete_webhook_endpoint", "retry_webhook_delivery"]) {
      assert.ok(names.has(expected), `the console calls ${expected}`);
    }
  });

  it("selects only columns the tables have", () => {
    const columnsOf = (table) => {
      const created = migrations.match(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
      const added = [...migrations.matchAll(new RegExp(`ALTER TABLE public\\.${table}\\s+([\\s\\S]*?);`, "g"))].flatMap((m) => [...m[1].matchAll(/ADD COLUMN IF NOT EXISTS (\w+)/g)].map((c) => c[1]));
      const base = created ? [...created[1].matchAll(/^\s+(\w+) [A-Z]/gm)].map((c) => c[1]) : [];
      return new Set([...base, ...added]);
    };
    const list = (text) => text.split(",").map((c) => c.trim());
    for (const [table, columns] of [["api_keys", ui.API_KEY_COLUMNS], ["webhook_subscriptions", ui.ENDPOINT_COLUMNS], ["webhook_deliveries", ui.DELIVERY_COLUMNS]]) {
      const have = columnsOf(table);
      for (const column of list(columns)) assert.ok(have.has(column), `${table}.${column}`);
    }
  });

  it("is reachable from the provider menu and the old address redirects there", () => {
    const layout = read(join(here, "../src/app/provider/layout.tsx"));
    assert.ok(layout.includes('path: "/provider/developer"'));
    assert.ok(layout.includes('developer: "Developer API"') && layout.includes('developer: "واجهة المطورين"'));
    const old = read(join(here, "../src/app/developer/page.tsx"));
    assert.ok(old.includes('redirect("/provider/developer")'));
    const customer = read(join(here, "../src/app/customer/settings/page.tsx"));
    assert.ok(!customer.includes('"/developer"'), "customers no longer get a link to a console that is not theirs");
  });

  it("reads delivery status and settings only through readable tables", () => {
    assert.ok(source["page.tsx"].includes('from("platform_settings")'));
    assert.ok(source["webhooks-tab.tsx"].includes('from("webhook_deliveries")') && source["webhooks-tab.tsx"].includes(".range("), "the delivery log is paged on the server");
  });
});
