// supabase/functions/calculate-travel/index.ts
// Deno Edge Function to calculate travel time and traffic buffers for home services

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || ""
  const allowedOriginEnv = Deno.env.get("APP_ORIGIN")
  const isAllowed =
    (allowedOriginEnv && origin === allowedOriginEnv) ||
    origin === "http://localhost:3000" ||
    origin === "http://127.0.0.1:3000" ||
    origin.endsWith(".vercel.app") ||
    origin.endsWith("primora.sa")

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : (allowedOriginEnv || "http://localhost:3000"),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { providerLat, providerLng, customerLat, customerLng } = await req.json()

    if (!providerLat || !providerLng || !customerLat || !customerLng) {
      return new Response(
        JSON.stringify({ error: "Missing required coordinates (lat/lng) for calculation." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY")
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Google Maps API is not configured on this environment." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Query Google Maps Distance Matrix API
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${providerLat},${providerLng}&destinations=${customerLat},${customerLng}&key=${apiKey}`
    const response = await fetch(url)
    
    if (!response.ok) {
      const errText = await response.text()
      console.error("[Travel Engine] Google API Error:", errText)
      return new Response(
        JSON.stringify({ error: "Google Maps Distance Matrix request failed.", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const data = await response.json()
    const element = data.rows?.[0]?.elements?.[0]
    if (element?.status !== "OK") {
      return new Response(
        JSON.stringify({ error: `Distance calculation route unavailable: ${element?.status || 'NO_ROUTE'}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const travelDurationSeconds = element.duration.value
    const distanceText = element.distance.text

    // Add 20% traffic buffer for Riyadh congestion
    const trafficBufferMultiplier = 1.20;
    const finalDurationSeconds = Math.round(travelDurationSeconds * trafficBufferMultiplier);
    const finalDurationMinutes = Math.round(finalDurationSeconds / 60);

    return new Response(
      JSON.stringify({
        success: true,
        baseDurationMinutes: Math.round(travelDurationSeconds / 60),
        finalDurationMinutes,
        distanceText,
        trafficBufferApplied: "20%"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected travel calculation error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
