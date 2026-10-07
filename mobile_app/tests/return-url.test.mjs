import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allowedAppReturnUrl, buildRedirectUrl, APP_RETURN_SCHEME } from "../../supabase/functions/_shared/return-url.ts";
import { readFileSync } from "node:fs";

const APP = "https://primora.sa";

describe("payment return address allow-list", () => {
  it("uses the scheme that mobile_app/app.json declares", () => {
    const config = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8"));
    assert.equal(config.expo.scheme, APP_RETURN_SCHEME);
  });

  it("accepts only the app's own screens", () => {
    assert.equal(allowedAppReturnUrl("mobileapp://bookings"), "mobileapp://bookings");
    for (const bad of [
      "https://evil.example/", "//evil.example", "mobileapp://evil", "mobileapp://bookings/../x", "mobileapp://bookings?x=1",
      "mobileapp://bookings#a", "mobileapp:bookings", "MOBILEAPP://bookings", " mobileapp://bookings", "javascript:alert(1)",
      "mobileapp://user@evil.example", "", null, undefined, 42, {}, ["mobileapp://bookings"],
    ]) assert.equal(allowedAppReturnUrl(bad), null, String(bad));
  });

  it("keeps the web default when no or a refused return address is sent", () => {
    assert.equal(buildRedirectUrl(APP, "/customer/bookings?payment=b1", undefined), `${APP}/customer/bookings?payment=b1`);
    assert.equal(buildRedirectUrl(APP, "/customer/bookings?payment=b1", "https://evil.example"), `${APP}/customer/bookings?payment=b1`);
  });

  it("sends the customer to the app screen and keeps the purchase query", () => {
    assert.equal(buildRedirectUrl(APP, "/customer/bookings?payment=b1", "mobileapp://bookings"), "mobileapp://bookings?payment=b1");
    assert.equal(buildRedirectUrl(APP, "/customer/bookings", "mobileapp://bookings"), "mobileapp://bookings");
  });
});
