import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { handleApiRequest } from "../_shared/api-router.ts"
import { serviceClient } from "../_shared/http.ts"

// Read-only public API of PRIMORA for provider integrations (G69).
//
//   GET /v1/services | /v1/employees | /v1/availability | /v1/bookings      Authorization: Bearer prm_live_...
//
// All behaviour (routing, key check, rate limit, scopes, parameters, pagination, errors) lives in
// _shared/api-router.ts, which has no Deno dependency and is tested in Node. This file only adapts the request and
// the database client. It is deployed with verify_jwt = false (config.toml): a provider API key is not a Supabase JWT,
// and the function authenticates every request itself through authenticate_api_key.
//
// There are deliberately no CORS headers and no preflight handling: this is a server-to-server API and a browser must
// never hold a key. The service-role client is created per request and never leaves this function.
serve(async (req) => {
  try {
    const db = serviceClient()
    const response = await handleApiRequest(
      req,
      { rpc: (fn, args) => db.rpc(fn, args) },
      {
        log: (event) => console.log(JSON.stringify({ fn: "public-api", ...event })),
      },
    )
    return new Response(JSON.stringify(response.body), { status: response.status, headers: response.headers })
  } catch (error) {
    // Configuration problems (missing service key) and anything unforeseen: no detail leaves the function.
    console.error("[public-api] failure", error instanceof Error ? error.name : "unknown")
    return new Response(
      JSON.stringify({ error: { code: "internal_error", message: "Something went wrong on our side.", request_id: "unavailable" } }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } },
    )
  }
})
