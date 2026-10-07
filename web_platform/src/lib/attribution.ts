// G61 Distribution: remember where a visitor to a shop page came from, and tell the server once the booking exists.
//
// The shop layout captures the landing (address bar labels and referrer host) into sessionStorage, per shop. After a booking is created the shop page calls
// recordBookingAttribution, which sends the labels to the record_booking_attribution command. Attribution is analytics only: it never decides a fee. The fee
// follows the provider's share key (`?ref=`), which the page forwards as request_source_token (see attributionRefToken).
//
// Nothing personal is stored: no address, no user agent, no full URL; the path is kept without its query string and the referrer as a host name.
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAttributionParams } from "@/lib/distribution.mjs";

const STORAGE_KEY = "primora_attribution_v1";
const MAX_SHOPS = 10;
const SHOP_PATH = /^\/shop\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export type StoredAttribution = {
  channel: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_path: string | null;
  referrer_host: string | null;
  ref: string | null;
  savedAt: number;
};

function readAll(): Record<string, StoredAttribution> {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, StoredAttribution>) {
  try {
    const keep = Object.entries(all).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, MAX_SHOPS);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch {
    // Storage can be blocked (private window): the booking still works, it is just not attributed.
  }
}

/** Called when a shop page opens. A landing that carries labels or a share key replaces what was stored; a bare landing only fills an empty slot. */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  const shop = SHOP_PATH.exec(window.location.pathname);
  if (!shop) return;
  const providerId = shop[1].toLowerCase();
  const landing = parseAttributionParams({
    search: window.location.search,
    pathname: window.location.pathname,
    referrer: document.referrer,
    ownHost: window.location.hostname.toLowerCase(),
  });
  const all = readAll();
  if (all[providerId] && !landing.explicit) return;
  all[providerId] = {
    channel: landing.channel,
    utm_source: landing.utm_source,
    utm_medium: landing.utm_medium,
    utm_campaign: landing.utm_campaign,
    landing_path: landing.landing_path,
    referrer_host: landing.referrer_host,
    ref: landing.ref ?? all[providerId]?.ref ?? null,
    savedAt: Date.now(),
  };
  writeAll(all);
}

/** The provider's share key from the link the visitor followed, for the booking command's request_source_token. */
export function attributionRefToken(providerId: string): string | null {
  if (typeof window === "undefined") return null;
  return readAll()[providerId.toLowerCase()]?.ref ?? null;
}

/**
 * Tells the server where the booking came from. Best effort by design: it runs after the booking exists and a failure must never undo or block it, so the
 * outcome is returned (and logged) instead of thrown.
 */
export async function recordBookingAttribution(
  client: Pick<SupabaseClient, "rpc">,
  bookingId: string,
  providerId: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (typeof window === "undefined") return { ok: false, reason: "no browser" };
  const stored = readAll()[providerId.toLowerCase()];
  const { error } = await client.rpc("record_booking_attribution", {
    p_booking_id: bookingId,
    p_channel: stored?.channel ?? "direct",
    p_utm_source: stored?.utm_source ?? null,
    p_utm_medium: stored?.utm_medium ?? null,
    p_utm_campaign: stored?.utm_campaign ?? null,
    p_landing_path: stored?.landing_path ?? null,
    p_referrer_host: stored?.referrer_host ?? null,
  });
  if (error) {
    console.warn("[attribution] could not record the booking source:", error.message);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}
