// G61 Distribution: pure helpers for the provider share kit, the public shop's structured data and the attribution capture.
// Plain ES module with JSDoc types so the web tests run it directly (like qr-svg.mjs). Nothing here touches the network, the DOM or storage.

export const SHARE_CHANNELS = /** @type {const} */ (["link", "qr", "whatsapp", "instagram"]);
export const ATTRIBUTION_CHANNELS = /** @type {const} */ (["google", "instagram", "whatsapp", "facebook", "tiktok", "snapchat", "qr", "direct", "other"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{64}$/i;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** @param {unknown} value */
export const isUuid = (value) => typeof value === "string" && UUID_RE.test(value);
/** @param {unknown} value */
export const isShareToken = (value) => typeof value === "string" && TOKEN_RE.test(value);

/**
 * A short ASCII label for a campaign, source or medium: lower case, letters digits dot dash underscore, starting with a letter or digit, 64 characters at most.
 * Anything else (spaces, Arabic letters, symbols) becomes a dash; nothing usable left means null. The database enforces the same pattern.
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string | null}
 */
export function sanitizeLabel(value, max = 64) {
  const cleaned = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[-.]+$/, "")
    .slice(0, max)
    .replace(/[-.]+$/, "");
  return cleaned ? cleaned : null;
}

/** The labels a share link carries when the provider does not choose their own. @param {string} channel */
export function defaultUtm(channel) {
  const medium = { instagram: "social", whatsapp: "messaging", qr: "print", link: "referral", google: "organic" }[channel] ?? "referral";
  return { source: channel, medium };
}

/**
 * @param {unknown} origin
 * @returns {string | null} scheme and host of an http(s) origin, without a trailing slash
 */
export function normalizeOrigin(origin) {
  try {
    const url = new URL(String(origin));
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * The booking deep link of a shop. `ref` is the provider's own share token (it decides the booking source and fee on the server); `src` and the utm labels
 * are analytics labels only.
 * @param {{ origin: string, providerId: string, token?: string | null, channel: string, serviceId?: string | null, employeeId?: string | null,
 *           campaign?: string | null, source?: string | null, medium?: string | null }} input
 * @returns {string}
 */
export function buildDeepLink({ origin, providerId, token = null, channel, serviceId = null, employeeId = null, campaign = null, source = null, medium = null }) {
  const base = normalizeOrigin(origin);
  if (!base) throw new Error("The site address must be an http or https origin");
  if (!isUuid(providerId)) throw new Error("The provider id is not valid");
  if (!ATTRIBUTION_CHANNELS.includes(/** @type {never} */ (channel)) && !SHARE_CHANNELS.includes(/** @type {never} */ (channel))) throw new Error("The channel is not valid");
  if (serviceId && !isUuid(serviceId)) throw new Error("The service id is not valid");
  if (employeeId && !isUuid(employeeId)) throw new Error("The professional id is not valid");
  if (token && !isShareToken(token)) throw new Error("The share key is not valid");
  const defaults = defaultUtm(channel);
  const params = new URLSearchParams();
  if (token) params.set("ref", token.toLowerCase());
  params.set("src", channel);
  params.set("utm_source", sanitizeLabel(source) ?? defaults.source);
  params.set("utm_medium", sanitizeLabel(medium) ?? defaults.medium);
  const label = sanitizeLabel(campaign);
  if (label) params.set("utm_campaign", label);
  if (serviceId) params.set("service", serviceId);
  if (employeeId) params.set("pro", employeeId);
  return `${base}/shop/${providerId}?${params.toString()}`;
}

/**
 * A link the provider shares: only the four share channels, and a live share key is expected.
 * @param {Parameters<typeof buildDeepLink>[0]} input
 */
export function buildShareLink(input) {
  if (!SHARE_CHANNELS.includes(/** @type {never} */ (input.channel))) throw new Error("A share link uses the link, qr, whatsapp or instagram channel");
  return buildDeepLink(input);
}

/** @param {string} text a message with the link in it */
export function whatsappShareUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// ---------------------------------------------------------------------------
// Attribution capture
// ---------------------------------------------------------------------------
const CHANNEL_ALIASES = {
  ig: "instagram", insta: "instagram", instagram: "instagram",
  wa: "whatsapp", whatsapp: "whatsapp",
  fb: "facebook", facebook: "facebook",
  tiktok: "tiktok", tt: "tiktok",
  snap: "snapchat", snapchat: "snapchat",
  google: "google", gmb: "google", gbp: "google", maps: "google", googlemaps: "google", "google-maps": "google", "google_maps": "google",
  qr: "qr", direct: "direct", link: "direct", other: "other",
};

/** @param {unknown} value @returns {string | null} */
function aliasChannel(value) {
  const key = String(value ?? "").trim().toLowerCase();
  return /** @type {Record<string, string>} */ (CHANNEL_ALIASES)[key] ?? null;
}

/**
 * The channel a referring host stands for. A host that is not recognised is "other"; no host, or the shop's own site, is "direct".
 * @param {string | null} host
 * @param {string | null} ownHost
 */
export function channelFromReferrerHost(host, ownHost = null) {
  if (!host) return "direct";
  if (ownHost && (host === ownHost || host.endsWith(`.${ownHost}`))) return "direct";
  const is = (/** @type {string} */ domain) => host === domain || host.endsWith(`.${domain}`);
  if (is("instagram.com")) return "instagram";
  if (is("facebook.com") || is("fb.com") || is("fb.me")) return "facebook";
  if (is("whatsapp.com") || is("wa.me")) return "whatsapp";
  if (is("tiktok.com")) return "tiktok";
  if (is("snapchat.com")) return "snapchat";
  if (/(^|\.)google\.[a-z.]{2,6}$/.test(host) || is("goo.gl") || is("g.page") || is("maps.app.goo.gl")) return "google";
  return "other";
}

/**
 * The host of a referrer URL, lower case, nothing else (no path, no query, no credentials). Null for a missing or unusable referrer.
 * @param {unknown} referrer
 * @returns {string | null}
 */
export function referrerHost(referrer) {
  try {
    const raw = String(referrer ?? "").trim();
    if (!raw) return null;
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase();
    return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host) && host.length <= 253 ? host : null;
  } catch {
    return null;
  }
}

/**
 * What a landing on a shop page tells us, from the address bar and the referrer. Everything is optional and validated: a bad label is dropped, never
 * stored, and the path is kept without its query string.
 * @param {{ search: string, pathname: string, referrer?: string | null, ownHost?: string | null }} input
 * @returns {{ channel: string, utm_source: string | null, utm_medium: string | null, utm_campaign: string | null, landing_path: string | null,
 *             referrer_host: string | null, ref: string | null, explicit: boolean }}
 */
export function parseAttributionParams({ search, pathname, referrer = null, ownHost = null }) {
  const params = new URLSearchParams(String(search ?? "").replace(/^\?/, ""));
  const utmSource = sanitizeLabel(params.get("utm_source"));
  const utmMedium = sanitizeLabel(params.get("utm_medium"));
  const utmCampaign = sanitizeLabel(params.get("utm_campaign"));
  const refRaw = params.get("ref");
  const ref = isShareToken(refRaw) ? String(refRaw).toLowerCase() : null;
  const host = referrerHost(referrer);
  const path = typeof pathname === "string" && /^\/[A-Za-z0-9/_.~-]{0,199}$/.test(pathname) ? pathname : null;

  const fromSrc = aliasChannel(params.get("src"));
  const fromUtm = aliasChannel(utmSource);
  const channel = fromSrc ?? fromUtm ?? channelFromReferrerHost(host, ownHost);
  const explicit = Boolean(fromSrc || utmSource || utmMedium || utmCampaign || ref);
  return { channel, utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign, landing_path: path, referrer_host: host, ref, explicit };
}

// ---------------------------------------------------------------------------
// Structured data (schema.org) for the public shop page
// ---------------------------------------------------------------------------

/**
 * JSON for a <script type="application/ld+json"> element. JSON.stringify does not make text safe inside a script element, so the characters that can
 * close it or break the parser are written as unicode escapes (the business name and description are typed by the owner).
 * @param {unknown} value
 */
export function serializeJsonLd(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** @param {unknown} value @returns {number | null} minutes after midnight */
function minutesOf(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ""));
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes <= 1440 ? minutes : null;
}

/** @param {number} minutes */
function clock(minutes) {
  const capped = Math.min(minutes, 1439);
  return `${String(Math.floor(capped / 60)).padStart(2, "0")}:${String(capped % 60).padStart(2, "0")}`;
}

/**
 * Opening hours stated as schema.org OpeningHoursSpecification: the hours at which at least one professional of the branch is scheduled (the union of their
 * shifts per weekday; shifts that touch or overlap are joined, a lunch gap stays a gap, a shift past midnight continues into the next day).
 * @param {Array<{ day_of_week: number, start_time: string, end_time: string, is_working_day?: boolean | null,
 *                 has_second_shift?: boolean | null, second_start_time?: string | null, second_end_time?: string | null }>} shifts
 */
export function openingHoursFromShifts(shifts) {
  /** @type {Array<Array<[number, number]>>} */
  const byDay = [[], [], [], [], [], [], []];
  /** @param {number} day @param {unknown} start @param {unknown} end */
  const add = (day, start, end) => {
    const s = minutesOf(start);
    const e = minutesOf(end);
    if (s === null || e === null || s === e) return;
    if (e > s) byDay[day].push([s, e]);
    else {
      byDay[day].push([s, 1440]);
      if (e > 0) byDay[(day + 1) % 7].push([0, e]);
    }
  };
  for (const row of shifts || []) {
    const day = Number(row.day_of_week);
    if (!Number.isInteger(day) || day < 0 || day > 6 || row.is_working_day === false) continue;
    add(day, row.start_time, row.end_time);
    if (row.has_second_shift && row.second_start_time && row.second_end_time) add(day, row.second_start_time, row.second_end_time);
  }
  const specs = [];
  for (let day = 0; day < 7; day += 1) {
    const sorted = byDay[day].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    /** @type {Array<[number, number]>} */
    const merged = [];
    for (const [s, e] of sorted) {
      const last = merged[merged.length - 1];
      if (last && s <= last[1]) last[1] = Math.max(last[1], e);
      else merged.push([s, e]);
    }
    for (const [s, e] of merged) {
      specs.push({ "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${DAY_NAMES[day]}`, opens: clock(s), closes: clock(e) });
    }
  }
  return specs;
}

/** @param {number} value */
const amount = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

/**
 * "SAR 50-200" from the active services' base prices, or null when there is none to state.
 * @param {Array<number | string | null | undefined>} prices
 */
export function priceRangeFrom(prices) {
  const numbers = (prices || []).map((p) => Number(p)).filter((p) => Number.isFinite(p) && p > 0);
  if (!numbers.length) return null;
  const low = Math.min(...numbers);
  const high = Math.max(...numbers);
  return low === high ? `SAR ${amount(low)}` : `SAR ${amount(low)}-${amount(high)}`;
}

/** @param {unknown} value @returns {string | null} an absolute http(s) URL or null */
function absoluteUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** @param {unknown} value @param {number} max @returns {string | undefined} */
function text(value, max) {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}

/**
 * schema.org HealthAndBeautyBusiness for a verified shop. It states only what the database holds: names, description, images, the first branch's public
 * address and coordinates, aggregate rating of published reviews, a price range computed from the active services and the hours from the staff schedules,
 * plus a ReserveAction whose target is the shop's booking deep link. No phone or e-mail (those are private contact details) and no country (not stored).
 * @param {{ origin: string, providerId: string,
 *   provider: { business_name_en?: string | null, business_name_ar?: string | null, description_en?: string | null, description_ar?: string | null, logo_url?: string | null, cover_image_url?: string | null },
 *   branch?: { address_text_en?: string | null, address_text_ar?: string | null, city?: string | null, latitude?: number | string | null, longitude?: number | string | null } | null,
 *   rating?: { rating: number | string, reviews: number | string } | null,
 *   prices?: Array<number | string | null | undefined>,
 *   shifts?: Parameters<typeof openingHoursFromShifts>[0] }} input
 * @returns {Record<string, unknown>}
 */
export function buildProviderJsonLd({ origin, providerId, provider, branch = null, rating = null, prices = [], shifts = [] }) {
  const base = normalizeOrigin(origin);
  if (!base || !isUuid(providerId)) throw new Error("A valid site origin and provider id are required");
  const shopUrl = `${base}/shop/${providerId}`;
  const nameAr = text(provider.business_name_ar, 150);
  const nameEn = text(provider.business_name_en, 150);
  const name = nameAr || nameEn;
  if (!name) throw new Error("A shop without a name cannot be described");

  const images = [absoluteUrl(provider.cover_image_url), absoluteUrl(provider.logo_url)].filter(Boolean);
  const lat = branch && branch.latitude !== null && branch.latitude !== undefined ? Number(branch.latitude) : NaN;
  const lng = branch && branch.longitude !== null && branch.longitude !== undefined ? Number(branch.longitude) : NaN;
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  const street = text(branch?.address_text_ar, 300) || text(branch?.address_text_en, 300);
  const city = text(branch?.city, 100);
  const reviews = rating ? Number(rating.reviews) : 0;
  const ratingValue = rating ? Number(rating.rating) : NaN;
  const priceRange = priceRangeFrom(prices);
  const hours = openingHoursFromShifts(shifts);

  /** @type {Record<string, unknown>} */
  const data = {
    "@context": "https://schema.org",
    "@type": "HealthAndBeautyBusiness",
    "@id": `${shopUrl}#business`,
    url: shopUrl,
    name,
    ...(nameEn && nameAr && nameEn !== nameAr ? { alternateName: nameEn } : {}),
    ...(text(provider.description_ar, 500) || text(provider.description_en, 500) ? { description: text(provider.description_ar, 500) || text(provider.description_en, 500) } : {}),
    ...(images.length ? { image: images } : {}),
    ...(absoluteUrl(provider.logo_url) ? { logo: absoluteUrl(provider.logo_url) } : {}),
    ...(street || city ? { address: { "@type": "PostalAddress", ...(street ? { streetAddress: street } : {}), ...(city ? { addressLocality: city } : {}) } } : {}),
    ...(hasGeo ? { geo: { "@type": "GeoCoordinates", latitude: lat, longitude: lng } } : {}),
    ...(reviews > 0 && Number.isFinite(ratingValue) && ratingValue >= 1 && ratingValue <= 5
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue, reviewCount: reviews, bestRating: 5, worstRating: 1 } }
      : {}),
    ...(priceRange ? { priceRange } : {}),
    ...(hours.length ? { openingHoursSpecification: hours } : {}),
    potentialAction: {
      "@type": "ReserveAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: buildDeepLink({ origin: base, providerId, channel: "google", medium: "structured-data" }),
        actionPlatform: ["http://schema.org/DesktopWebPlatform", "http://schema.org/MobileWebPlatform", "http://schema.org/IOSPlatform", "http://schema.org/AndroidPlatform"],
      },
    },
  };
  return data;
}
