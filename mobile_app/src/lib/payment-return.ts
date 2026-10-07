import * as WebBrowser from "expo-web-browser";

// The address payment-checkout is allowed to send the customer back to (see supabase/functions/_shared/return-url.ts).
// The scheme is the one in app.json; the function refuses anything that is not on its own allow-list.
export const PAYMENT_RETURN_URL = "mobileapp://bookings";

type Listener = () => void;
const bookingListeners = new Set<Listener>();

/** Tells every mounted bookings list to reload (a booking was created or a payment sheet was closed). */
export function notifyBookingsChanged(): void {
  bookingListeners.forEach((listener) => listener());
}

export function subscribeBookingsChanged(listener: Listener): () => void {
  bookingListeners.add(listener);
  return () => {
    bookingListeners.delete(listener);
  };
}

/**
 * Opens the hosted checkout in an in-app browser session that closes itself when the provider redirects back to the app.
 * Whatever the outcome (paid, cancelled, dismissed) the bookings are reloaded: only the server's webhook confirms money,
 * so the list, not this result, tells the customer what happened.
 */
export async function openCheckout(checkoutUrl: string): Promise<void> {
  try {
    await WebBrowser.openAuthSessionAsync(checkoutUrl, PAYMENT_RETURN_URL);
  } finally {
    notifyBookingsChanged();
  }
}
