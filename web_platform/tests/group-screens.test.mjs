import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// G52 group booking: the screens are wired to the commands that exist (with the arguments they declare), say what the server said in
// both languages, use the shared dialogs, mirror under RTL, and open from one navigation entry per portal.
const here = fileURLToPath(new URL(".", import.meta.url));
const src = (...parts) => readFileSync(join(here, "..", "src", ...parts), "utf8");
const lib = src("lib", "group-booking.ts");
const migrationDir = join(here, "..", "..", "supabase", "migrations");
const migrations = ["20261008500000_group_booking_tables.sql", "20261008500100_group_booking_commands.sql"].map((f) => readFileSync(join(migrationDir, f), "utf8"));
const migration = migrations.join("\n");

// The reasons table is TypeScript: read the array as text and evaluate it without the type annotations.
const block = lib.slice(lib.indexOf("const reasons: Reason[] = ["), lib.indexOf("// The reasons create_booking itself gives"));
const innerBlock = lib.slice(lib.indexOf("const innerReasons"), lib.indexOf("// The server's reason in the screen's language"));
const reasons = new Function(`
  ${innerBlock.replace("const innerReasons: { match: RegExp; en: string; ar: string }[] =", "const innerReasons =").replace(/function innerReason\(message: string\): string \{/, "function innerReason(message) {")}
  ${block.replace("const reasons: Reason[] =", "const reasons =")}
  return reasons;`)();
const describe_ = (message, lang) => {
  for (const r of reasons) { const m = message.match(r.match); if (m) return lang === "ar" ? r.ar(m) : r.en || message; }
  return null;
};

describe("group booking reasons", () => {
  // Never shown to a person: raised for the scheduler or an administrator, or an internal consistency check the screens cannot reach.
  const internalOnly = new Set([
    "Administrator access required",
    "The enabled flag is required",
    "An idempotency key of 8 to 128 characters is required",
    "Guest % could not be booked: %",
  ]);
  const raised = [...new Set([...migration.matchAll(/RAISE EXCEPTION '((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'")))]
    .filter((m) => !internalOnly.has(m));

  it("translates every static reason the commands can raise into Arabic", () => {
    assert.ok(raised.length > 20, "the migrations raise their reasons as plain text");
    for (const message of raised.filter((m) => !m.includes("%"))) {
      const arabic = describe_(message, "ar");
      assert.ok(arabic && /[؀-ۿ]/.test(arabic), `no Arabic form for: ${message}`);
    }
  });

  it("translates the reasons that carry numbers", () => {
    assert.match(describe_("This provider allows at most 6 guests in a group", "ar"), /6/);
    assert.match(describe_("Guest 3 must be booked on the event date", "ar"), /3/);
    assert.match(describe_("Guest 2 needs between 1 and 6 services", "ar"), /2/);
    const clash = describe_("Guest 2 could not be booked: Selected time is no longer available", "ar");
    assert.match(clash, /2/);
    assert.match(clash, /لم يعد متاحاً/);
    assert.ok(raised.some((m) => m.startsWith("Guest %")), "the migration still names the guest that failed");
  });

  it("has an English form for the reasons that are not self-explanatory", () => {
    assert.match(describe_("This provider does not offer group bookings", "en"), /group bookings/);
    assert.match(describe_("Group booking not found", "en"), /not found/);
  });

  it("shows an unknown reason as the server wrote it", () => {
    assert.equal(describe_("something new", "en"), null, "unknown reasons fall through to the raw message in describeGroupError");
    assert.match(lib, /return locale === "ar" \? `[^`]*\$\{message\}` : message;/);
  });
});

describe("group booking screens", () => {
  const files = {
    form: src("components", "group-booking-form.tsx"),
    customer: src("app", "customer", "group", "page.tsx"),
    provider: src("app", "provider", "groups", "page.tsx"),
  };
  const commandArgs = (name) => {
    const at = migration.indexOf(`FUNCTION public.${name}(`);
    assert.ok(at >= 0, `${name} is created by the migrations`);
    const head = migration.slice(at, migration.indexOf("RETURNS", at));
    return new Set([...head.matchAll(/\b(p_[a-z_]+)\b/g)].map((m) => m[1]));
  };

  it("call only commands the migrations create, with the arguments they declare", () => {
    const calls = Object.values(files).flatMap((f) => [...f.matchAll(/\.rpc\(\s*"([a-z_]+)"(?:,\s*(\{[\s\S]*?\}))?\s*\)/g)].map((m) => ({ name: m[1], args: m[2] ?? "" })));
    assert.deepEqual([...new Set(calls.map((c) => c.name))].sort(),
      ["cancel_group_booking", "cancel_group_member", "create_group_booking", "list_group_booking_providers", "preview_group_booking", "set_provider_group_settings"]);
    for (const call of calls) {
      const declared = commandArgs(call.name);
      for (const key of [...call.args.matchAll(/\b(p_[a-z_]+):/g)].map((m) => m[1])) {
        assert.ok(declared.has(key), `${call.name} has no argument ${key}`);
      }
    }
    assert.match(files.form, /p_idempotency_key: idempotencyKey\.current/);
    assert.match(files.form, /idempotencyKey\.current = crypto\.randomUUID\(\)/);
  });

  it("book exactly the reviewed assignment, and nothing when a guest cannot be booked", () => {
    assert.match(files.form, /preview\.can_create/);
    assert.match(files.form, /employee_id: preview\.guests\[i\]\.employee_id/);
    assert.match(files.form, /scheduled_at: preview\.guests\[i\]\.scheduled_at/);
    assert.match(files.form, /setStage\(\(s\) => \(s === "review" \? "edit" : s\)\)/, "an edit after the review sends the host back to checking");
  });

  it("read only tables and columns the migrations create", () => {
    const text = Object.values(files).join("\n");
    for (const table of ["group_bookings", "group_booking_payment_summary", "provider_group_settings"]) {
      assert.match(text, new RegExp(`\\.from\\("${table}"\\)`), table);
      assert.ok(migration.includes(table), table);
    }
    assert.match(files.customer, /\.eq\("host_id"/);
    assert.match(files.provider, /\.eq\("provider_id", providerId\)/);
  });

  it("use the shared dialogs and never the native ones", () => {
    for (const [name, text] of Object.entries(files)) {
      assert.ok(!/\b(window\.)?(alert|confirm|prompt)\(/.test(text), `${name} uses a native dialog`);
    }
    assert.match(files.customer, /<CommandDialog/);
    assert.match(files.provider, /<CommandDialog/);
    assert.match(files.provider, /reasonRequired\s/, "a provider's cancellation needs a reason, as the server requires");
  });

  it("limit what they read from the server and show loading, empty and error states", () => {
    for (const text of [files.customer, files.provider]) {
      assert.match(text, /\.range\(/);
      assert.match(text, /role="status"/);
      assert.match(text, /role="alert"/);
    }
    assert.match(files.customer, /t\.emptyTitle/);
    assert.match(files.provider, /t\.noGroups/);
    assert.match(files.form, /t\.noProviders/);
    assert.match(files.form, /t\.providersFailed/);
  });

  it("mirror under right-to-left and format money and time through the shared formatters", () => {
    assert.match(files.customer, /dir=\{locale === "ar" \? "rtl" : "ltr"\}/);
    assert.match(files.provider, /dir=\{locale === "ar" \? "rtl" : "ltr"\}/);
    for (const text of Object.values(files)) {
      assert.ok(!/\b(ml|mr|pl|pr|left|right)-\d/.test(text.replace(/dir-[a-z]+/g, "")), "physical-direction utility classes break RTL");
      assert.ok(!/\$\{?[^`]*toFixed\(/.test(text), "money goes through sar()");
    }
    assert.match(files.form, /sar\(/);
    assert.match(files.customer, /sar\(/);
    assert.match(files.customer, /operationsDate\(/);
    assert.match(lib, /riyadhInstant[\s\S]*\+03:00/);
    assert.match(lib, /3 \* 3600000/);
  });

  it("send money to the existing per-booking payment flow and never collect card details", () => {
    assert.match(files.customer, /functions\.invoke\("payment-checkout", \{ body: \{ bookingId \} \}\)/);
    for (const text of Object.values(files)) assert.ok(!/card ?number|cvv|cvc/i.test(text));
  });

  it("open from one navigation entry per portal", () => {
    assert.equal((src("app", "customer", "layout.tsx").match(/\/customer\/group"/g) || []).length, 1);
    assert.equal((src("app", "provider", "layout.tsx").match(/\/provider\/groups"/g) || []).length, 1);
    assert.ok(existsSync(join(here, "..", "src", "app", "customer", "group", "page.tsx")));
    assert.ok(existsSync(join(here, "..", "src", "app", "provider", "groups", "page.tsx")));
    assert.ok(!/customer\/group/.test(src("app", "shop", "[id]", "page.tsx")), "the shop page is not edited");
  });

  it("keep both languages for every string of the shared copy", () => {
    const en = lib.slice(lib.indexOf("  en: {"), lib.indexOf("  ar: {"));
    const ar = lib.slice(lib.indexOf("  ar: {"), lib.indexOf("} as const;"));
    const keys = (s) => [...s.matchAll(/^    ([A-Za-z]+):/gm)].map((m) => m[1]).sort();
    assert.deepEqual(keys(ar), keys(en));
    assert.ok(keys(en).length > 100);
    const used = new Set(Object.values(files).flatMap((f) => [...f.matchAll(/\bt\.([A-Za-z]+)/g)].map((m) => m[1])));
    for (const key of used) assert.ok(keys(en).includes(key), `the screens use t.${key} but the copy has no such key`);
  });
});
