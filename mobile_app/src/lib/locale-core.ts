// The language choice, free of React Native so a node test can exercise it.
export type Lang = "en" | "ar";

export const LANG_STORAGE_KEY = "primora.language";
export const DEFAULT_LANG: Lang = "ar";

export type LangStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
};

/** Anything but an exact "en" or "ar" (missing, damaged, from another version) falls back to the default. */
export function parseLang(value: unknown): Lang {
  return value === "en" || value === "ar" ? value : DEFAULT_LANG;
}

export async function loadLang(store: LangStore): Promise<Lang> {
  try {
    return parseLang(await store.getItemAsync(LANG_STORAGE_KEY));
  } catch {
    return DEFAULT_LANG;
  }
}

/** Resolves false (never throws) when the choice could not be kept; the screen still switches for this session. */
export async function saveLang(store: LangStore, lang: Lang): Promise<boolean> {
  try {
    await store.setItemAsync(LANG_STORAGE_KEY, parseLang(lang));
    return true;
  } catch {
    return false;
  }
}

export const TAB_LABELS: Record<Lang, { home: string; explore: string; bookings: string; messages: string; board: string; profile: string }> = {
  en: { home: "Home", explore: "Explore", bookings: "Bookings", messages: "Messages", board: "Board", profile: "Profile" },
  ar: { home: "الرئيسية", explore: "استكشف", bookings: "الحجوزات", messages: "الرسائل", board: "اللوحة", profile: "حسابي" },
};
