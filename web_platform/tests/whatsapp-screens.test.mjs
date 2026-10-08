import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Guards for the WhatsApp receptionist screens (G60): wiring to the real commands, both languages, no native dialogs, honest states.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const provider = read("src/app/provider/whatsapp/page.tsx");
const admin = read("src/app/admin/whatsapp/page.tsx");
const copySource = read("src/lib/whatsapp-receptionist.ts");
const migration = [read("../supabase/migrations/20261008700000_whatsapp_receptionist_tables.sql"), read("../supabase/migrations/20261008700100_whatsapp_receptionist_commands.sql")].join("\n");

// Pulls the object literal of one language out of the copy file and returns its top-level keys.
function keysOf(language) {
  const start = copySource.indexOf(`  ${language}: {`);
  assert.ok(start >= 0, `${language} copy present`);
  const end = copySource.indexOf("\n  },", start);
  const block = copySource.slice(start, end);
  return [...block.matchAll(/^    ([a-zA-Z0-9_]+):/gm)].map((m) => m[1]).sort();
}

describe("WhatsApp receptionist screens", () => {
  it("every string exists in Arabic and English", () => {
    const en = keysOf("en");
    const ar = keysOf("ar");
    assert.ok(en.length > 60);
    assert.deepEqual(ar, en);
  });
  it("the provider screen calls the real commands with the argument names the database declares", () => {
    for (const [rpc, args] of [
      ["provider_save_whatsapp_channel", ["p_provider_id", "p_phone_number_id", "p_display_number", "p_enabled", "p_ai_enabled", "p_handoff_enabled"]],
      ["provider_open_whatsapp_conversation", ["p_conversation_id", "p_limit"]],
      ["provider_send_whatsapp_reply", ["p_conversation_id", "p_text", "p_idempotency_key"]],
      ["provider_resolve_whatsapp_conversation", ["p_conversation_id"]],
    ]) {
      assert.ok(provider.includes(`"${rpc}"`), `${rpc} is called`);
      const declared = new RegExp(String.raw`FUNCTION public\.${rpc}\(([\s\S]*?)\)\s*RETURNS`).exec(migration)?.[1] ?? "";
      for (const arg of args) {
        assert.ok(declared.includes(arg), `${rpc} declares ${arg}`);
        assert.ok(provider.includes(arg), `the screen passes ${arg}`);
      }
    }
    assert.ok(admin.includes('"admin_whatsapp_overview"') && admin.includes('"admin_set_whatsapp_channel_verified"'));
  });
  it("reads only the columns a client may select, never the hash, the state or a message table", () => {
    assert.ok(!/customer_hash|\bstate\b.*whatsapp_conversations|from\("whatsapp_messages"\)|from\("whatsapp_contact_addresses"\)/.test(provider + admin));
    assert.ok(provider.includes('from("whatsapp_conversations")') && provider.includes('from("whatsapp_channels")'));
    assert.ok(migration.includes("GRANT SELECT (id, provider_id, channel_id, customer_last4"));
  });
  it("uses no native dialogs and no mock data", () => {
    for (const source of [provider, admin]) {
      assert.ok(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(source));
      assert.ok(!/mock|sample data|lorem|placeholder=/i.test(source));
    }
  });
  it("shows loading, empty and error states and mirrors under Arabic", () => {
    for (const marker of ['role="status"', 'role="alert"', "inboxEmpty", "listFailed", 'dir={locale === "ar" ? "rtl" : "ltr"}', "aria-label"]) {
      assert.ok(provider.includes(marker), `provider screen has ${marker}`);
    }
    assert.ok(admin.includes("pendingEmpty") && admin.includes("adminLoadFailed") && admin.includes('dir={locale === "ar" ? "rtl" : "ltr"}'));
    assert.ok(!/\b(ml|mr|pl|pr|left|right)-\d/.test(provider.replace(/pe-|ps-/g, "")), "logical spacing only");
  });
  it("sends a reply with one idempotency key per composed message and keeps the text when sending fails", () => {
    assert.ok(provider.includes("replyKey.current = crypto.randomUUID()"));
    const send = provider.slice(provider.indexOf("const send = async"), provider.indexOf("const resolve = async"));
    const failure = send.indexOf("if (error) { setReplyError");
    const clear = send.indexOf('setReply("")');
    assert.ok(failure > 0 && clear > failure, "the reply box is cleared only after the success check");
  });
  it("renders message text as text, never as markup", () => {
    assert.ok(!provider.includes("dangerouslySetInnerHTML"));
  });
  it("adds exactly one navigation entry to each portal, with both languages", () => {
    for (const [file, path] of [["src/app/provider/layout.tsx", "/provider/whatsapp"], ["src/app/admin/layout.tsx", "/admin/whatsapp"]]) {
      const source = read(file);
      assert.equal(source.split(path).length - 1, 1, `${file} links ${path} once`);
      assert.equal((source.match(/whatsapp: "/g) ?? []).length, 2, `${file} names it in English and Arabic`);
    }
  });
});
