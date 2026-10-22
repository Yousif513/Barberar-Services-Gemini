import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { browserCheckoutStorage, type CheckoutStorage } from "./payment-checkout.js";

// Opaque purchase identities survive app restarts; payment details and recipient data stay on the server.
export const checkoutStorage: CheckoutStorage = Platform.OS === "web" ? browserCheckoutStorage : {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};
