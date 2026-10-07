import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createChunkedStorage, PART_SIZE } from "../src/lib/chunked-storage.ts";

// An in-memory stand-in for the platform keychain that, like the real one, rejects a value above 2048 bytes.
function fakeKeychain() {
  const map = new Map();
  return {
    map,
    async getItemAsync(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async setItemAsync(key, value) {
      if (Buffer.byteLength(value, "utf8") > 2048) throw new Error(`value for ${key} is larger than 2048 bytes`);
      map.set(key, value);
    },
    async deleteItemAsync(key) {
      map.delete(key);
    },
  };
}

const KEY = "sb-project-auth-token";

describe("the auth session storage for the phone", () => {
  it("returns nothing before anything was stored", async () => {
    const storage = createChunkedStorage(fakeKeychain());
    assert.equal(await storage.getItem(KEY), null);
  });

  it("round-trips a small value", async () => {
    const storage = createChunkedStorage(fakeKeychain());
    await storage.setItem(KEY, '{"a":1}');
    assert.equal(await storage.getItem(KEY), '{"a":1}');
  });

  it("round-trips a session far larger than the keychain limit", async () => {
    const keychain = fakeKeychain();
    const storage = createChunkedStorage(keychain);
    const session = JSON.stringify({ access_token: "a".repeat(5000), refresh_token: "r".repeat(40), user: { id: "u", meta: "m".repeat(3000) } });
    await storage.setItem(KEY, session);
    assert.equal(await storage.getItem(KEY), session);
    assert.ok(keychain.map.size > 3, "the value was split into parts");
  });

  it("keeps every part under the limit even for Arabic text", async () => {
    const keychain = fakeKeychain();
    const storage = createChunkedStorage(keychain);
    const arabic = JSON.stringify({ name: "ي".repeat(PART_SIZE * 4) });
    await storage.setItem(KEY, arabic);
    assert.equal(await storage.getItem(KEY), arabic);
  });

  it("does not leave stale parts behind when a shorter value replaces a longer one", async () => {
    const keychain = fakeKeychain();
    const storage = createChunkedStorage(keychain);
    await storage.setItem(KEY, "x".repeat(PART_SIZE * 5));
    await storage.setItem(KEY, "short");
    assert.equal(await storage.getItem(KEY), "short");
    assert.deepEqual([...keychain.map.keys()].sort(), [`${KEY}.0`, `${KEY}.parts`]);
  });

  it("removes every part", async () => {
    const keychain = fakeKeychain();
    const storage = createChunkedStorage(keychain);
    await storage.setItem(KEY, "x".repeat(PART_SIZE * 3));
    await storage.removeItem(KEY);
    assert.equal(keychain.map.size, 0);
    assert.equal(await storage.getItem(KEY), null);
  });

  it("treats a write that was cut short as signed out instead of returning a corrupt session", async () => {
    const keychain = fakeKeychain();
    const storage = createChunkedStorage(keychain);
    await storage.setItem(KEY, "x".repeat(PART_SIZE * 3));
    keychain.map.delete(`${KEY}.1`);
    assert.equal(await storage.getItem(KEY), null);
  });

  it("ignores a part count that is not a positive whole number", async () => {
    const keychain = fakeKeychain();
    const storage = createChunkedStorage(keychain);
    keychain.map.set(`${KEY}.parts`, "banana");
    assert.equal(await storage.getItem(KEY), null);
    keychain.map.set(`${KEY}.parts`, "-2");
    assert.equal(await storage.getItem(KEY), null);
  });

  it("keeps two keys apart", async () => {
    const storage = createChunkedStorage(fakeKeychain());
    await storage.setItem("one", "1".repeat(PART_SIZE + 5));
    await storage.setItem("two", "2");
    assert.equal(await storage.getItem("one"), "1".repeat(PART_SIZE + 5));
    assert.equal(await storage.getItem("two"), "2");
    await storage.removeItem("one");
    assert.equal(await storage.getItem("two"), "2");
  });

  it("never cuts an emoji in half when it falls on a part boundary", async () => {
    const keychain = fakeKeychain();
    const storage = createChunkedStorage(keychain);
    for (let pad = PART_SIZE - 3; pad <= PART_SIZE + 1; pad += 1) {
      const value = "a".repeat(pad) + "\u{1F600}\u{1F600}" + "b".repeat(20);
      await storage.setItem(KEY, value);
      assert.equal(await storage.getItem(KEY), value, `pad ${pad}`);
      for (const [name, part] of keychain.map) {
        if (name.endsWith(".parts")) continue;
        assert.ok(!/[\ud800-\udbff]$/.test(part) && !/^[\udc00-\udfff]/.test(part), `${name} has a lone surrogate half`);
      }
    }
  });

  it("stores an empty string as an empty string, not as signed out", async () => {
    const storage = createChunkedStorage(fakeKeychain());
    await storage.setItem(KEY, "");
    assert.equal(await storage.getItem(KEY), "");
  });

  it("refuses a nonsensical part size", () => {
    assert.throws(() => createChunkedStorage(fakeKeychain(), undefined, 0));
  });
});
