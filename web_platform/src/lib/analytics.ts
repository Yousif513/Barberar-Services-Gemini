/**
 * PRIMORA Analytics & Error Tracking Module (G15)
 * Taxonomy conforms to docs/competitive-research/17-kpi-and-success-framework.md §5
 */

export type FunnelEventName =
  | "search_performed"
  | "provider_viewed"
  | "slot_selected"
  | "auth_started"
  | "auth_completed"
  | "payment_started"
  | "payment_succeeded"
  | "payment_failed"
  | "booking_confirmed"
  | "booking_completed"
  | "booking_cancelled"
  | "booking_no_show"
  | "reminder_sent"
  | "reminder_action"
  | "review_submitted"
  | "provider_applied"
  | "provider_live";

export interface EventPropertiesMap {
  search_performed: {
    query?: string;
    district?: string;
    category?: string;
    gender_segment?: string;
    results_count: number;
  };
  provider_viewed: {
    provider_id: string;
    source: "search" | "link" | "qr" | "whatsapp" | "ad" | "seo" | "direct";
  };
  slot_selected: {
    provider_id: string;
    professional_id?: string | "any";
    service_id: string;
    date_offset: number;
    hour: number;
  };
  auth_started: {
    method: "phone_otp" | "email";
    step?: string;
  };
  auth_completed: {
    method: "phone_otp" | "email";
    user_id?: string;
  };
  payment_started: {
    method: "mada" | "apple_pay" | "card" | "bnpl";
    amount: number;
    booking_id?: string;
  };
  payment_succeeded: {
    method: "mada" | "apple_pay" | "card" | "bnpl";
    amount: number;
    charge_id: string;
    booking_id?: string;
  };
  payment_failed: {
    method: "mada" | "apple_pay" | "card" | "bnpl";
    amount: number;
    error_code?: string;
    booking_id?: string;
  };
  booking_confirmed: {
    booking_id: string;
    provider_id: string;
    source?: string;
    total_price: number;
  };
  booking_completed: {
    booking_id: string;
    provider_id: string;
    actor: "provider" | "admin" | "system";
  };
  booking_cancelled: {
    booking_id: string;
    actor: "customer" | "provider" | "admin" | "hold_expiry";
    policy_applied?: string;
    fee_charged?: number;
  };
  booking_no_show: {
    booking_id: string;
    provider_id: string;
    deposit_retained?: number;
  };
  reminder_sent: {
    booking_id: string;
    channel: "whatsapp" | "sms" | "in_app";
    template: string;
  };
  reminder_action: {
    booking_id: string;
    action: "confirm" | "reschedule" | "cancel";
  };
  review_submitted: {
    booking_id: string;
    provider_id: string;
    rating: number;
    has_text: boolean;
  };
  provider_applied: {
    channel: string;
    segment: string;
    district?: string;
  };
  provider_live: {
    provider_id: string;
    district?: string;
    segment?: string;
  };
}

class AnalyticsService {
  private isDev = process.env.NODE_ENV !== "production";
  private posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  private posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";
  private sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  /**
   * Track one of the 15 funnel events
   */
  trackEvent<E extends FunnelEventName>(
    event: E,
    properties: E extends keyof EventPropertiesMap ? EventPropertiesMap[E] : Record<string, unknown>
  ): void {
    if (this.isDev) {
      console.log(`[PRIMORA Analytics] ${event}`, properties);
    }

    if (typeof window !== "undefined") {
      // If PostHog is loaded on window
      const posthog = (window as unknown as { posthog?: { capture: (ev: string, props: unknown) => void } }).posthog;
      if (posthog && typeof posthog.capture === "function") {
        posthog.capture(event, properties);
      }
    }
  }

  /**
   * Capture exceptions / error boundary events
   */
  captureError(error: Error | unknown, context?: Record<string, unknown>): void {
    if (this.isDev) {
      console.error("[PRIMORA Error Captured]", error, context);
    }

    if (typeof window !== "undefined") {
      const sentry = (window as unknown as { Sentry?: { captureException: (err: unknown, ctx?: unknown) => void } }).Sentry;
      if (sentry && typeof sentry.captureException === "function") {
        sentry.captureException(error, { extra: context });
      }
    }
  }

  /**
   * Identify authenticated customer or provider
   */
  identifyUser(userId: string, traits?: Record<string, unknown>): void {
    if (this.isDev) {
      console.log("[PRIMORA Analytics Identify]", userId, traits);
    }

    if (typeof window !== "undefined") {
      const posthog = (window as unknown as { posthog?: { identify: (id: string, tr?: unknown) => void } }).posthog;
      if (posthog && typeof posthog.identify === "function") {
        posthog.identify(userId, traits);
      }
    }
  }
}

export const analytics = new AnalyticsService();
export const trackEvent = analytics.trackEvent.bind(analytics);
export const captureError = analytics.captureError.bind(analytics);
export const identifyUser = analytics.identifyUser.bind(analytics);
