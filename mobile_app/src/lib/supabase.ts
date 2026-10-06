import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import { createChunkedStorage } from "./chunked-storage";

const expectedProjectRef =
  process.env.EXPO_PUBLIC_SUPABASE_PROJECT_REF || "vpszcnxsgmoavkqorjzt";

const derivedRemoteUrl = `https://${expectedProjectRef}.supabase.co`;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || derivedRemoteUrl;
const fallbackAnonKey = "sb_publishable_0TVT_3pEcOWYmtIaDA730A_qqb5JrJO";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || fallbackAnonKey;

if (new URL(supabaseUrl).hostname !== `${expectedProjectRef}.supabase.co` &&
    !new URL(supabaseUrl).hostname.includes("localhost") &&
    !new URL(supabaseUrl).hostname.includes("127.0.0.1")) {
  throw new Error(
    `Supabase project mismatch: this Barberar workspace expects ${expectedProjectRef}.`
  );
}

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
