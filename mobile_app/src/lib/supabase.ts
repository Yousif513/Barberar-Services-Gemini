import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import { createChunkedStorage } from "./chunked-storage";

// There is no baked-in project. A missing URL or key used to fall back to a project that no longer exists (and a URL on any
// other host made the app crash at start-up); now the app starts, `isSupabaseConfigured` is false and the screens can say so.
// Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (the local stack prints both with `npx supabase status -o env`).
const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const configuredAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(configuredUrl && configuredAnonKey);

const supabaseUrl = configuredUrl || "https://supabase-not-configured.invalid";
const supabaseAnonKey = configuredAnonKey || "supabase-not-configured";

// On a phone the session lives in the platform keychain (Keychain on iOS, Keystore-backed storage on Android) so a signed-in
// customer stays signed in after the app is closed. The keychain is not available when the app runs in a browser; there the
// default browser storage is used.
const phoneStorage = Platform.OS === "web"
  ? undefined
  : createChunkedStorage(SecureStore, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(phoneStorage ? { storage: phoneStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh the session only while the app is in the foreground, as Supabase recommends for React Native.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
