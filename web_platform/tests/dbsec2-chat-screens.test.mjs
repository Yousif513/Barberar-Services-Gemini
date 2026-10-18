import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// RT-H1: the web chat screens write only through the server commands (start_conversation, send_message,
// mark_conversation_read). The database refuses direct writes; these checks keep the screens from drifting back to them.
const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const DIRECT_WRITE = /from\(\s*["'](messages|conversations)["']\s*\)\s*\.(insert|update|upsert|delete)\b/;

describe("RT-H1 web chat screens", () => {
  for (const path of ["web_platform/src/app/customer/messages/page.tsx", "web_platform/src/app/provider/messages/page.tsx"]) {
    it(`${path} sends and marks read through the server`, () => {
      const code = read(path);
      assert.ok(!DIRECT_WRITE.test(code), "no direct write to messages or conversations");
      assert.match(code, /rpc\("send_message", \{ p_conversation_id: [a-zA-Z.]+, p_body: body \}\)/);
      assert.match(code, /rpc\("mark_conversation_read", \{ p_conversation_id: selectedId \}\)/);
      assert.ok(!/sender_id|sender_role:\s*"/.test(code.replace(/select\("[^"]*"\)/g, "")), "the screen never names a sender");
    });
  }
  it("the shop page opens a conversation through start_conversation", () => {
    const code = read("web_platform/src/app/shop/[id]/page.tsx");
    assert.ok(!DIRECT_WRITE.test(code));
    assert.match(code, /rpc\("start_conversation", \{ p_provider_id: shopId/);
  });
  it("a failed mark-read leaves the thread unread instead of claiming success", () => {
    for (const path of ["web_platform/src/app/customer/messages/page.tsx", "web_platform/src/app/provider/messages/page.tsx"]) {
      assert.match(read(path), /rpc\("mark_conversation_read"[^)]*\)\.then\(\(\{ error \}\) => \{\n\s*if \(error\) return;/);
    }
  });
});
