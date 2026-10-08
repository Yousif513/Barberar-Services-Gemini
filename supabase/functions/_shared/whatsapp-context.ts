// Maps the JSON that whatsapp_provider_context() returns onto the engine's EngineContext. Pure; shared by the Edge Function and the tests so
// the shape the database produces and the shape the engine reads cannot drift apart.
import type { EngineContext } from "./whatsapp-engine.ts"

// deno-lint-ignore no-explicit-any
export function toEngineContext(raw: any): EngineContext {
  return {
    provider: { id: raw.provider.id, name_ar: raw.provider.name_ar, name_en: raw.provider.name_en, bookable: raw.provider.bookable === true },
    handoffEnabled: raw.channel?.handoff_enabled !== false,
    // deno-lint-ignore no-explicit-any
    services: (raw.services ?? []).map((s: any) => ({ id: s.id, name_ar: s.name_ar, name_en: s.name_en, price: s.price ?? null })),
    // deno-lint-ignore no-explicit-any
    branches: (raw.branches ?? []).map((b: any) => ({
      id: b.id, name_ar: b.name_ar, name_en: b.name_en, address_ar: b.address_ar ?? null, address_en: b.address_en ?? null,
      latitude: b.latitude, longitude: b.longitude, hours: Array.isArray(b.hours) ? b.hours : [],
    })),
    publicAppUrl: typeof raw.public_app_url === "string" && raw.public_app_url ? raw.public_app_url : null,
  }
}
