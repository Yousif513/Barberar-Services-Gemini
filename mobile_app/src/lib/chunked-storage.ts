// Storage adapter for the Supabase auth session on a phone.
//
// Supabase hands the whole session (access token, refresh token and the user record) to its storage as one string.
// The platform keychain stores that safely, but it refuses or misbehaves on values of about 2 KB and more, and a session
// with a user record is often larger. This adapter splits the string into parts, writes the parts first and the part count
// last, so a write that is cut short is read back as "no session" instead of as a corrupt one.
//
// It takes the keychain as an argument so it can be tested without a phone.

export type KeychainLike = {
  getItemAsync(key: string, options?: unknown): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: unknown): Promise<void>;
  deleteItemAsync(key: string, options?: unknown): Promise<void>;
};

export type AuthStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

// UTF-16 units per part. A unit takes at most three bytes in UTF-8 (Arabic letters take two, an emoji takes four bytes for two
// units), so 600 units stay under the 2 KB the keychain tolerates for any text a session can contain.
export const PART_SIZE = 600;

const countKey = (key: string) => `${key}.parts`;
const partKey = (key: string, index: number) => `${key}.${index}`;

export function createChunkedStorage(keychain: KeychainLike, storeOptions?: unknown, partSize: number = PART_SIZE): AuthStorage {
  if (!Number.isInteger(partSize) || partSize < 1) throw new Error("partSize must be a positive integer");

  async function readCount(key: string): Promise<number> {
    const raw = await keychain.getItemAsync(countKey(key), storeOptions);
    const count = raw === null ? 0 : Number(raw);
    return Number.isInteger(count) && count > 0 ? count : 0;
  }

  return {
    async getItem(key) {
      const count = await readCount(key);
      if (count === 0) return null;
      const parts: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const part = await keychain.getItemAsync(partKey(key, index), storeOptions);
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join("");
    },

    async setItem(key, value) {
      const previous = await readCount(key);
      const parts: string[] = [];
      // Never cut between the two halves of a surrogate pair (an emoji in the user's name, for example): a part that ends in a
      // lone half would come back corrupted when the parts are joined.
      for (let start = 0; start < value.length;) {
        let end = Math.min(start + partSize, value.length);
        const last = value.charCodeAt(end - 1);
        if (end < value.length && last >= 0xd800 && last <= 0xdbff && end - start > 1) end -= 1;
        parts.push(value.slice(start, end));
        start = end;
      }
      if (parts.length === 0) parts.push("");
      for (let index = 0; index < parts.length; index += 1) {
        await keychain.setItemAsync(partKey(key, index), parts[index], storeOptions);
      }
      await keychain.setItemAsync(countKey(key), String(parts.length), storeOptions);
      // A shorter value than before leaves parts that no count points to any more; remove them.
      for (let index = parts.length; index < previous; index += 1) {
        await keychain.deleteItemAsync(partKey(key, index), storeOptions);
      }
    },

    async removeItem(key) {
      const count = await readCount(key);
      await keychain.deleteItemAsync(countKey(key), storeOptions);
      for (let index = 0; index < count; index += 1) {
        await keychain.deleteItemAsync(partKey(key, index), storeOptions);
      }
    },
  };
}
