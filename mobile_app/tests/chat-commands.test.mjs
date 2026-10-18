import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// RT-H1: the mobile chat uses the same server commands as the web; the database refuses direct chat writes.
const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const DIRECT_WRITE = /from\(\s*["'](messages|conversations)["']\s*\)\s*\.(insert|update|upsert|delete)\b/;

describe("RT-H1 mobile chat", () => {
  it("messages screen sends with send_message and marks read with mark_conversation_read", () => {
    const code = read("src/app/messages.tsx");
    assert.ok(!DIRECT_WRITE.test(code));
    assert.match(code, /rpc\("send_message", \{ p_conversation_id: selectedThread\.id, p_body: body \}\)/);
    assert.match(code, /rpc\("mark_conversation_read", \{ p_conversation_id: thread\.id \}\)/);
    assert.match(code, /if \(!error\) setThreads/, "the thread is shown read only after the server stored it");
  });
  it("shop details opens the conversation with start_conversation", () => {
    const code = read("src/components/shop-details-modal.tsx");
    assert.ok(!DIRECT_WRITE.test(code));
    assert.match(code, /rpc\("start_conversation", \{ p_provider_id: shop\.providerId/);
  });
});
