import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LANG, LANG_STORAGE_KEY, loadLang, parseLang, saveLang } from "../src/lib/locale-core.ts";

function fakeStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    async getItemAsync(key) { return map.has(key) ? map.get(key) : null; },
    async setItemAsync(key, value) { map.set(key, value); },
  };
}

describe("language choice", () => {
  it("defaults to Arabic and ignores anything that is not a supported code", () => {
    assert.equal(DEFAULT_LANG, "ar");
    for (const bad of [null, undefined, "", "fr", "EN", "ar ", 1, {}]) assert.equal(parseLang(bad), "ar");
    assert.equal(parseLang("en"), "en");
  });

  it("keeps the choice across a restart (a new read of the same store)", async () => {
    const store = fakeStore();
    assert.equal(await loadLang(store), "ar");
    assert.equal(await saveLang(store, "en"), true);
    assert.equal(store.map.get(LANG_STORAGE_KEY), "en");
    assert.equal(await loadLang(store), "en");
  });

  it("falls back and does not throw when the storage fails", async () => {
    const broken = {
      async getItemAsync() { throw new Error("keychain locked"); },
      async setItemAsync() { throw new Error("keychain locked"); },
    };
    assert.equal(await loadLang(broken), "ar");
    assert.equal(await saveLang(broken, "en"), false);
  });

  it("repairs a damaged stored value", async () => {
    assert.equal(await loadLang(fakeStore({ [LANG_STORAGE_KEY]: "klingon" })), "ar");
  });
});
