import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { I18nManager, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { DEFAULT_LANG, loadLang, saveLang, type Lang, type LangStore } from "./locale-core";

// Layout direction is handled screen by screen (explicit row-reverse and right-aligned text for Arabic), so the platform's own
// mirroring is switched off. Left on, an Arabic-locale phone mirrored every row a second time and the screens read backwards.
// Native RTL (forceRTL) needs an app restart and a new pass over every screen, and cannot be tried without a device.
if (Platform.OS !== "web") {
  I18nManager.allowRTL(false);
  I18nManager.swapLeftAndRightInRTL(false);
}

// A language code is not a secret; the keychain is used because it is already a dependency and works on both phone platforms.
// In a browser (the web build of the app) there is no keychain, so the choice is kept in localStorage when it exists.
const webStore: LangStore = {
  async getItemAsync(key) {
    return globalThis.localStorage?.getItem(key) ?? null;
  },
  async setItemAsync(key, value) {
    globalThis.localStorage?.setItem(key, value);
  },
};
const store: LangStore = Platform.OS === "web" ? webStore : SecureStore;

type LocaleValue = {
  lang: Lang;
  isRTL: boolean;
  setLang: React.Dispatch<React.SetStateAction<Lang>>;
  toggleLang: () => void;
};

const LocaleContext = createContext<LocaleValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void loadLang(store).then((saved) => {
      if (!active) return;
      setLangState(saved);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const setLang = useCallback<React.Dispatch<React.SetStateAction<Lang>>>((next) => {
    setLangState((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      void saveLang(store, resolved);
      return resolved;
    });
  }, []);

  const toggleLang = useCallback(() => setLang((current) => (current === "en" ? "ar" : "en")), [setLang]);
  const value = useMemo<LocaleValue>(() => ({ lang, isRTL: lang === "ar", setLang, toggleLang }), [lang, setLang, toggleLang]);

  // Wait for the saved choice so the app never flashes the wrong language first.
  if (!ready) return null;
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** The one language shared by every screen and the tab bar. */
export function useLocale(): LocaleValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}
