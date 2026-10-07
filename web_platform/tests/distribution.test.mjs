// G61 Distribution: link building with UTM labels, attribution capture parsing, and the structured data of the public shop page.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildDeepLink, buildProviderJsonLd, buildShareLink, channelFromReferrerHost, openingHoursFromShifts, parseAttributionParams, priceRangeFrom,
  referrerHost, sanitizeLabel, serializeJsonLd, whatsappShareUrl,
} from "../src/lib/distribution.mjs";

const ORIGIN = "https://primora.example";
const PROVIDER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const SERVICE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const PRO = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const TOKEN = "0123456789abcdef".repeat(4);
const DB_LABEL = /^[a-z0-9][a-z0-9_.-]{0,63}$/; // the pattern the booking_attribution CHECK constraints enforce

describe("sanitizeLabel", () => {
  it("produces only what the database accepts, or null", () => {
    for (const input of ["Spring Sale 2026", "  IG Story #4 ", "a_b.c-d", "x".repeat(200), "---a", "a---", "ٱلحجز", "a b\nc", "<script>alert(1)</script>", "0"]) {
      const label = sanitizeLabel(input);
      assert.ok(label === null || DB_LABEL.test(label), `${JSON.stringify(input)} -> ${label}`);
    }
    assert.equal(sanitizeLabel("Spring Sale 2026"), "spring-sale-2026");
    assert.equal(sanitizeLabel("x".repeat(200))?.length, 64);
    assert.equal(sanitizeLabel("عرض"), null);
    assert.equal(sanitizeLabel(""), null);
    assert.equal(sanitizeLabel(undefined), null);
    assert.equal(sanitizeLabel("<b>"), "b");
  });
});

describe("buildShareLink", () => {
  it("carries the share key, the channel, default labels and the chosen target", () => {
    const url = new URL(buildShareLink({ origin: ORIGIN, providerId: PROVIDER, token: TOKEN, channel: "instagram", serviceId: SERVICE, employeeId: PRO, campaign: "Spring Sale" }));
    assert.equal(url.origin + url.pathname, `${ORIGIN}/shop/${PROVIDER}`);
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      ref: TOKEN, src: "instagram", utm_source: "instagram", utm_medium: "social", utm_campaign: "spring-sale", service: SERVICE, pro: PRO,
    });
  });

  it("lets the provider override source and medium, and drops labels that sanitise to nothing", () => {
    const url = new URL(buildShareLink({ origin: ORIGIN, providerId: PROVIDER, token: TOKEN, channel: "qr", source: "Flyer", medium: "عربي", campaign: "!!!" }));
    assert.equal(url.searchParams.get("utm_source"), "flyer");
    assert.equal(url.searchParams.get("utm_medium"), "print", "an unusable medium falls back to the default");
    assert.equal(url.searchParams.has("utm_campaign"), false);
    assert.equal(url.searchParams.has("service"), false);
    assert.equal(url.searchParams.has("pro"), false);
  });

  it("uses a different default medium for every share channel", () => {
    const mediums = ["link", "qr", "whatsapp", "instagram"].map((channel) => new URL(buildShareLink({ origin: ORIGIN, providerId: PROVIDER, token: TOKEN, channel })).searchParams.get("utm_medium"));
    assert.deepEqual(mediums, ["referral", "print", "messaging", "social"]);
  });

  it("tolerates a trailing slash or a path on the origin and encodes nothing unsafe", () => {
    assert.ok(buildShareLink({ origin: `${ORIGIN}/`, providerId: PROVIDER, token: TOKEN, channel: "link" }).startsWith(`${ORIGIN}/shop/${PROVIDER}?`));
    assert.ok(buildShareLink({ origin: `${ORIGIN}/ignored/path?x=1`, providerId: PROVIDER, token: TOKEN, channel: "link" }).startsWith(`${ORIGIN}/shop/${PROVIDER}?`));
  });

  it("refuses anything that is not a real id, key, channel or origin", () => {
    const ok = { origin: ORIGIN, providerId: PROVIDER, token: TOKEN, channel: "link" };
    assert.throws(() => buildShareLink({ ...ok, origin: "javascript:alert(1)" }), /origin/);
    assert.throws(() => buildShareLink({ ...ok, origin: "not a url" }), /origin/);
    assert.throws(() => buildShareLink({ ...ok, providerId: "1; drop table" }), /provider id/);
    assert.throws(() => buildShareLink({ ...ok, serviceId: "../x" }), /service id/);
    assert.throws(() => buildShareLink({ ...ok, employeeId: "x" }), /professional id/);
    assert.throws(() => buildShareLink({ ...ok, token: "short" }), /share key/);
    assert.throws(() => buildShareLink({ ...ok, channel: "google" }), /link, qr, whatsapp or instagram/);
    assert.throws(() => buildDeepLink({ ...ok, channel: "myspace" }), /channel/);
  });

  it("builds the structured-data deep link for Google without a share key", () => {
    const url = new URL(buildDeepLink({ origin: ORIGIN, providerId: PROVIDER, channel: "google", medium: "structured-data" }));
    assert.deepEqual(Object.fromEntries(url.searchParams), { src: "google", utm_source: "google", utm_medium: "structured-data" });
  });

  it("wraps a message for WhatsApp with the link encoded", () => {
    const link = buildShareLink({ origin: ORIGIN, providerId: PROVIDER, token: TOKEN, channel: "whatsapp" });
    const share = whatsappShareUrl(`Book with us: ${link}`);
    assert.ok(share.startsWith("https://wa.me/?text="));
    assert.equal(decodeURIComponent(share.slice("https://wa.me/?text=".length)), `Book with us: ${link}`);
  });
});

describe("parseAttributionParams (capture)", () => {
  const path = `/shop/${PROVIDER}`;
  it("reads the share link labels exactly as the share kit wrote them", () => {
    const link = new URL(buildShareLink({ origin: ORIGIN, providerId: PROVIDER, token: TOKEN, channel: "instagram", campaign: "Spring Sale" }));
    const parsed = parseAttributionParams({ search: link.search, pathname: link.pathname, referrer: "https://l.instagram.com/?u=secret", ownHost: "primora.example" });
    assert.deepEqual(parsed, {
      channel: "instagram", utm_source: "instagram", utm_medium: "social", utm_campaign: "spring-sale",
      landing_path: path, referrer_host: "l.instagram.com", ref: TOKEN, explicit: true,
    });
  });

  it("falls back from src to utm_source to the referrer host", () => {
    assert.equal(parseAttributionParams({ search: "?src=wa", pathname: path }).channel, "whatsapp");
    assert.equal(parseAttributionParams({ search: "?utm_source=Facebook", pathname: path }).channel, "facebook");
    assert.equal(parseAttributionParams({ search: "?src=gbp", pathname: path }).channel, "google");
    assert.equal(parseAttributionParams({ search: "?src=nonsense&utm_source=tiktok", pathname: path }).channel, "tiktok");
    assert.equal(parseAttributionParams({ search: "", pathname: path, referrer: "https://www.google.com.sa/" }).channel, "google");
    assert.equal(parseAttributionParams({ search: "", pathname: path, referrer: "https://t.snapchat.com/x" }).channel, "snapchat");
    assert.equal(parseAttributionParams({ search: "", pathname: path, referrer: "https://news.example.org/a" }).channel, "other");
    assert.equal(parseAttributionParams({ search: "", pathname: path, referrer: "" }).channel, "direct");
    assert.equal(parseAttributionParams({ search: "", pathname: path, referrer: "https://primora.example/services", ownHost: "primora.example" }).channel, "direct");
  });

  it("is not explicit without labels or a key, and the share link channel 'link' counts as direct", () => {
    assert.equal(parseAttributionParams({ search: "?service=" + SERVICE, pathname: path }).explicit, false);
    assert.equal(parseAttributionParams({ search: "?src=link", pathname: path }).channel, "direct");
  });

  it("drops what the database would refuse: bad labels, a bad key, a path with a query, a referrer with credentials or a non-http scheme", () => {
    const parsed = parseAttributionParams({
      search: "?utm_source=%3Cscript%3E&utm_campaign=" + "x".repeat(100) + "&utm_medium=%D8%B9%D8%B1%D8%A8%D9%8A&ref=not-a-key",
      pathname: "/shop/x?y=1", referrer: "javascript:alert(1)",
    });
    assert.equal(parsed.utm_source, "script");
    assert.equal(parsed.utm_campaign?.length, 64);
    assert.equal(parsed.utm_medium, null);
    assert.equal(parsed.ref, null);
    assert.equal(parsed.landing_path, null);
    assert.equal(parsed.referrer_host, null);
    for (const value of [parsed.utm_source, parsed.utm_campaign]) assert.match(value ?? "", DB_LABEL);
  });

  it("keeps only the host of a referrer: no path, query, port or credentials", () => {
    assert.equal(referrerHost("https://user:pass@WWW.Example.COM:8443/a/b?token=1#x"), "www.example.com");
    assert.equal(referrerHost("ftp://example.com"), null);
    assert.equal(referrerHost("garbage"), null);
    assert.equal(referrerHost(null), null);
    assert.equal(channelFromReferrerHost("m.facebook.com", "primora.example"), "facebook");
    assert.equal(channelFromReferrerHost("maps.google.com", null), "google");
    assert.equal(channelFromReferrerHost("notgoogle.com", null), "other");
    assert.equal(channelFromReferrerHost("wa.me", null), "whatsapp");
  });
});

describe("serializeJsonLd", () => {
  it("cannot close the script element or smuggle markup", () => {
    const text = serializeJsonLd({ name: "</script><script>alert(1)</script> & <!-- \u2028 \u2029" });
    assert.equal(/<\/?script/i.test(text), false);
    assert.equal(text.includes("<"), false);
    assert.equal(text.includes(">"), false);
    assert.equal(text.includes("&"), false);
    assert.equal(text.includes(String.fromCharCode(0x2028)) || text.includes(String.fromCharCode(0x2029)), false);
    assert.equal(JSON.parse(text).name, "</script><script>alert(1)</script> & <!-- \u2028 \u2029", "the escapes decode back to the original text");
  });
});

describe("openingHoursFromShifts", () => {
  const spec = (day, opens, closes) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${day}`, opens, closes });
  it("joins overlapping and touching shifts, keeps a gap, and adds second shifts", () => {
    const hours = openingHoursFromShifts([
      { day_of_week: 1, start_time: "09:00:00", end_time: "13:00:00", is_working_day: true },
      { day_of_week: 1, start_time: "12:00:00", end_time: "15:00:00", is_working_day: true },
      { day_of_week: 1, start_time: "15:00:00", end_time: "17:00:00", is_working_day: true },
      { day_of_week: 2, start_time: "09:00:00", end_time: "12:00:00", is_working_day: true, has_second_shift: true, second_start_time: "16:00:00", second_end_time: "21:00:00" },
    ]);
    assert.deepEqual(hours, [spec("Monday", "09:00", "17:00"), spec("Tuesday", "09:00", "12:00"), spec("Tuesday", "16:00", "21:00")]);
  });

  it("skips days off, continues a shift past midnight into the next day and ignores unusable rows", () => {
    const hours = openingHoursFromShifts([
      { day_of_week: 0, start_time: "10:00:00", end_time: "20:00:00", is_working_day: false },
      { day_of_week: 5, start_time: "18:00:00", end_time: "02:00:00", is_working_day: true },
      { day_of_week: 9, start_time: "10:00:00", end_time: "20:00:00", is_working_day: true },
      { day_of_week: 3, start_time: "nonsense", end_time: "20:00:00", is_working_day: true },
      { day_of_week: 3, start_time: "10:00:00", end_time: "10:00:00", is_working_day: true },
    ]);
    assert.deepEqual(hours, [spec("Friday", "18:00", "23:59"), spec("Saturday", "00:00", "02:00")]);
    assert.deepEqual(openingHoursFromShifts([]), []);
  });
});

describe("priceRangeFrom", () => {
  it("states a range only when there are real prices", () => {
    assert.equal(priceRangeFrom([50, "120.00", 80.5]), "SAR 50-120");
    assert.equal(priceRangeFrom(["99.50", 99.5]), "SAR 99.5");
    assert.equal(priceRangeFrom([10.25, 30]), "SAR 10.25-30");
    assert.equal(priceRangeFrom([]), null);
    assert.equal(priceRangeFrom([0, null, undefined, "x"]), null);
  });
});

describe("buildProviderJsonLd", () => {
  const provider = { business_name_en: "Gold Barber", business_name_ar: "حلاق الذهب", description_en: "Classic cuts", description_ar: null, logo_url: "https://cdn.example/logo.png", cover_image_url: "https://cdn.example/cover.jpg" };
  const branch = { address_text_en: "King Fahd Rd", address_text_ar: "طريق الملك فهد", city: "Riyadh", latitude: "24.713600", longitude: 46.6753 };

  it("describes a complete shop with only facts the database holds and a ReserveAction to the booking deep link", () => {
    const data = buildProviderJsonLd({
      origin: ORIGIN, providerId: PROVIDER, provider, branch, rating: { rating: "4.6", reviews: "12" }, prices: [50, 200],
      shifts: [{ day_of_week: 1, start_time: "09:00", end_time: "17:00", is_working_day: true }],
    });
    assert.equal(data["@context"], "https://schema.org");
    assert.equal(data["@type"], "HealthAndBeautyBusiness");
    assert.equal(data.url, `${ORIGIN}/shop/${PROVIDER}`);
    assert.equal(data.name, "حلاق الذهب");
    assert.equal(data.alternateName, "Gold Barber");
    assert.equal(data.description, "Classic cuts");
    assert.deepEqual(data.image, ["https://cdn.example/cover.jpg", "https://cdn.example/logo.png"]);
    assert.deepEqual(data.address, { "@type": "PostalAddress", streetAddress: "طريق الملك فهد", addressLocality: "Riyadh" });
    assert.deepEqual(data.geo, { "@type": "GeoCoordinates", latitude: 24.7136, longitude: 46.6753 });
    assert.deepEqual(data.aggregateRating, { "@type": "AggregateRating", ratingValue: 4.6, reviewCount: 12, bestRating: 5, worstRating: 1 });
    assert.equal(data.priceRange, "SAR 50-200");
    assert.equal(data.openingHoursSpecification.length, 1);
    const action = data.potentialAction;
    assert.equal(action["@type"], "ReserveAction");
    const target = new URL(action.target.urlTemplate);
    assert.equal(target.origin + target.pathname, `${ORIGIN}/shop/${PROVIDER}`);
    assert.equal(target.searchParams.get("src"), "google");
    assert.equal(target.searchParams.has("ref"), false, "the public structured data never carries a provider's share key");
    assert.equal("telephone" in data, false);
    assert.equal("email" in data, false);
    assert.equal(JSON.stringify(data).includes("addressCountry"), false, "the country is not stored, so it is not stated");
  });

  it("states nothing it does not have: no rating without reviews, no price range, no hours, no geo, no images", () => {
    const data = buildProviderJsonLd({
      origin: ORIGIN, providerId: PROVIDER, provider: { business_name_en: "Only English" },
      branch: { latitude: 0, longitude: 0 }, rating: { rating: 0, reviews: 0 }, prices: [], shifts: [],
    });
    assert.equal(data.name, "Only English");
    for (const key of ["alternateName", "description", "image", "logo", "address", "geo", "aggregateRating", "priceRange", "openingHoursSpecification"]) {
      assert.equal(key in data, false, key);
    }
    assert.ok(data.potentialAction);
  });

  it("ignores a rating outside 1..5, non-http image addresses and an out-of-range position", () => {
    const data = buildProviderJsonLd({
      origin: ORIGIN, providerId: PROVIDER, provider: { business_name_ar: "س", logo_url: "javascript:alert(1)", cover_image_url: "data:text/html,x" },
      branch: { latitude: 91, longitude: 10 }, rating: { rating: 7, reviews: 3 },
    });
    assert.equal("image" in data, false);
    assert.equal("logo" in data, false);
    assert.equal("geo" in data, false);
    assert.equal("aggregateRating" in data, false);
  });

  it("refuses to describe a shop without a name or with a bad id", () => {
    assert.throws(() => buildProviderJsonLd({ origin: ORIGIN, providerId: PROVIDER, provider: { business_name_en: "  ", business_name_ar: "" } }), /name/);
    assert.throws(() => buildProviderJsonLd({ origin: ORIGIN, providerId: "nope", provider }), /provider id/);
  });
});

describe("wiring", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

  it("the shop page forwards the share key and records the attribution after the booking exists", () => {
    const page = read("../src/app/shop/[id]/page.tsx");
    assert.match(page, /from "@\/lib\/attribution"/);
    assert.equal((page.match(/request_source_token: attributionRefToken\(shop\.id\)/g) || []).length, 2, "single and multi-service bookings both forward the key");
    assert.match(page, /recordBookingAttribution\(supabase, bookedBookingId, shop\.id\)/);
    assert.ok(page.indexOf("bookedBookingId = booking.id") < page.indexOf("recordBookingAttribution("), "recorded after the booking id is known");
  });

  it("the shop layout captures the landing, emits the structured data escaped, and publishes social and language metadata", () => {
    const layout = read("../src/app/shop/[id]/layout.tsx");
    assert.match(layout, /<AttributionCapture \/>/);
    assert.match(layout, /application\/ld\+json/);
    assert.match(layout, /serializeJsonLd\(/);
    assert.doesNotMatch(layout, /JSON\.stringify\(jsonLd\)/);
    for (const needle of ["canonical", "languages", "twitter", "openGraph", "x-default"]) assert.ok(layout.includes(needle), needle);
  });

  it("the share kit calls the real commands, has both languages and no native dialogs", () => {
    const page = read("../src/app/provider/share/page.tsx");
    for (const rpc of ["create_provider_share_token", "revoke_provider_share_token", "provider_bookings_by_channel"]) assert.ok(page.includes(`"${rpc}"`), rpc);
    assert.match(page, /ar: \{/);
    assert.match(page, /en: \{/);
    assert.doesNotMatch(page, /\b(window\.)?(confirm|alert|prompt)\(/);
    assert.match(page, /qrSvgPath/);
  });

  it("the provider layout links to the share kit in both languages", () => {
    const layout = read("../src/app/provider/layout.tsx");
    assert.match(layout, /path: "\/provider\/share"/);
    assert.match(layout, /share: "Share & Reach"/);
    assert.match(layout, /share: "[^"]*[؀-ۿ][^"]*"/);
  });

  it("the sitemap pages through every verified shop instead of trusting one capped query", () => {
    const sitemap = read("../src/app/sitemap.ts");
    assert.match(sitemap, /\.range\(/);
  });
});
