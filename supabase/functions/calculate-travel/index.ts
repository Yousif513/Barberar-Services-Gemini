// supabase/functions/calculate-travel/index.ts
// Deno Edge Function to calculate travel time and traffic buffers for home services

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
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
    let travelDurationSeconds = 1200; // 20 minutes default fallback
    let distanceText = "10 km";

    if (apiKey) {
      // Query Google Maps Distance Matrix API
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${providerLat},${providerLng}&destinations=${customerLat},${customerLng}&key=${apiKey}`
      const response = await fetch(url)
      
      if (response.ok) {
        const data = await response.json()
        if (data.rows?.[0]?.elements?.[0]?.status === "OK") {
          travelDurationSeconds = data.rows[0].elements[0].duration.value
          distanceText = data.rows[0].elements[0].distance.text
        }
      } else {
        console.warn("[Travel Engine] Google API responded with error, using fallback duration.")
      }
    }

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
