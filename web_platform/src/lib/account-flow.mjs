import { safeInternalPath } from "./safe-redirect.mjs";
import { requireRows } from "./write-result.mjs";

export const SIGNUP_DRAFT_KEY = "primora_signup_choices_v1";
const DRAFT_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** A requested destination never grants access; the destination's own authorization still applies. */
export function accountDestination(role, portal, returnUrl) {
  const destination = safeInternalPath(returnUrl, "");
  if (destination) return destination.replace(/^\/provider\/become(?=[?#]|$)/, "/become-provider");
  if (role === "admin") return "/admin";
  if (role === "provider_owner" || role === "provider_employee") return "/provider/dashboard";
  return portal === "provider" ? "/become-provider" : "/customer/dashboard";
}

export function accountLoginPath(returnUrl, portal = "customer", completeSignup = false) {
  const query = new URLSearchParams();
  const destination = safeInternalPath(returnUrl, "");
  if (destination && !/^\/login(?:[/?#]|$)/.test(destination)) query.set("returnUrl", destination);
  if (portal === "provider") query.set("portal", "provider");
  if (completeSignup) query.set("completeSignup", "1");
  return `/login${query.size ? `?${query}` : ""}`;
}

export function providerApplicationType(type) {
  if (type === "freelancer") return "freelancer";
  if (["salon", "barbershop", "spa"].includes(type)) return "salon_barber_shop";
  throw new Error("Unsupported provider type");
}

/** @returns {{ channel: "sms", shouldCreateUser: boolean }} */
export function phoneOtpOptions(mode) {
  return { channel: "sms", shouldCreateUser: mode === "signup" };
}

// Only optional choices and the displayed document version are retained. No identity, password, token or accepted-terms
// flag is stored. A person must review the choices and explicitly accept the current published terms after confirmation.
export function signupChoiceDraft(version, whatsapp, marketing, now = Date.now()) {
  return JSON.stringify({ version, whatsapp: whatsapp === true, marketing: marketing === true, expiresAt: now + DRAFT_LIFETIME_MS });
}

export function readSignupChoiceDraft(raw, version, now = Date.now()) {
  try {
    const draft = JSON.parse(raw);
    if (draft?.version !== version || !Number.isFinite(draft.expiresAt) || draft.expiresAt <= now || draft.expiresAt > now + DRAFT_LIFETIME_MS) return null;
    if (typeof draft.whatsapp !== "boolean" || typeof draft.marketing !== "boolean") return null;
    return { whatsapp: draft.whatsapp, marketing: draft.marketing };
  } catch {
    return null;
  }
}

/** Save only the authenticated person's profile, and use the trigger-adjusted answer as the displayed saved state. */
export async function persistCustomerProfile(client, userId, profile, locale) {
  const answer = await client.from("profiles").update({
    first_name: profile.firstName.trim(),
    last_name: profile.lastName.trim(),
    phone_number: profile.phone.trim() || null,
  }).eq("id", userId).select("first_name, last_name, phone_number, phone_verified");
  const [row] = requireRows(answer, { expected: 1, lang: locale });
  return { firstName: row.first_name || "", lastName: row.last_name || "", phone: row.phone_number || "", phoneVerified: row.phone_verified === true };
}
