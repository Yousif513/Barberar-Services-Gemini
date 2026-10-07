"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type PageLocale = "en" | "ar";

const STORAGE_KEY = "primora_lang";
const listeners = new Set<() => void>();
let chosenInMemory: PageLocale | null = null;

function readLocale(): PageLocale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ar" || saved === "en") return saved;
  } catch {
    // Storage blocked: fall back to the choice made on this page load.
  }
  return chosenInMemory ?? "en";
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

/**
 * The page language for a public screen: the choice saved under `primora_lang` (shared with every other page), English
 * until a choice exists. It also keeps `<html lang dir>` in step so native controls and scrollbars mirror. Reading goes
 * through useSyncExternalStore, so the server render and the first client render agree and there is no timer to poll with.
 * The planned global locale provider replaces this hook without touching its callers.
 */
export function usePageLocale(): [PageLocale, (next: PageLocale) => void] {
  const locale = useSyncExternalStore(subscribe, readLocale, (): PageLocale => "en");

  const setLocale = useCallback((next: PageLocale) => {
    chosenInMemory = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be blocked (private window); the choice then lasts until the page closes.
    }
    listeners.forEach((notify) => notify());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  return [locale, setLocale];
}
