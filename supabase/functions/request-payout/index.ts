import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1"

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !serviceKey) {
      throw new Error("Missing database configuration.")
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const supabase = createClient(supabaseUrl, serviceKey)
    
    // Get user from token
    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid credentials." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const { providerId, amount, bankName, iban } = await req.json()
    if (!providerId || !amount || !bankName || !iban) {
      return new Response(JSON.stringify({ error: "Missing required parameters." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // 1. Verify user owns the provider profile
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id")
      .eq("id", providerId)
      .eq("owner_id", user.id)
      .single()

    if (providerError || !provider) {
      return new Response(JSON.stringify({ error: "Access denied. You do not own this provider." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const { data: ledgerRows, error: ledgerError } = await supabase
      .from("transactional_ledger")
      .select(`
        provider_share,
        bookings!inner (
          branches!inner (
            provider_id
          )
        )
      `)
      .eq("payout_status", "pending")
      .eq("bookings.branches.provider_id", providerId)

    if (ledgerError) throw ledgerError;

    const ledgerAvailableAmount = (ledgerRows || []).reduce((sum, r) => sum + Number(r.provider_share || 0), 0);

    const { data: openRequests, error: openRequestsError } = await supabase
      .from("payout_requests")
      .select("amount")
      .eq("provider_id", providerId)
      .in("status", ["requested", "processing"])

    if (openRequestsError) throw openRequestsError;

    const alreadyRequestedAmount = (openRequests || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const availableAmount = Math.max(ledgerAvailableAmount - alreadyRequestedAmount, 0);
    const requestedAmount = Number(amount);

    if (requestedAmount > availableAmount) {
      return new Response(JSON.stringify({ 
        error: `Insufficient eligible funds. Available: ${availableAmount.toFixed(2)} SAR. Requested: ${requestedAmount.toFixed(2)} SAR.` 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // 3. Create the payout request
    const { data: payoutRequest, error: insertError } = await supabase
      .from("payout_requests")
      .insert({
        provider_id: providerId,
        requested_by: user.id,
        amount: requestedAmount,
        bank_name: bankName,
        iban,
        status: "requested"
      })
      .select()
      .single()

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, payoutRequest }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Payout request failure." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})
