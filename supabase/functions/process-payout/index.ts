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

    // Verify user is administrator
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profileError || profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden. Administrative access required." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const { requestId, status, adminNote, bankReference } = await req.json()
    if (!requestId || !status) {
      return new Response(JSON.stringify({ error: "Missing requestId or status parameter." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    if (!['processing', 'paid', 'rejected'].includes(status)) {
      return new Response(JSON.stringify({ error: "Invalid status state transition." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // 1. Fetch the payout request
    const { data: request, error: fetchError } = await supabase
      .from("payout_requests")
      .select("*")
      .eq("id", requestId)
      .single()

    if (fetchError || !request) {
      return new Response(JSON.stringify({ error: "Payout request not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // If request is already paid/closed, return bad request
    if (request.status === "paid" || request.status === "rejected") {
      return new Response(JSON.stringify({ error: "Payout request is already finalized." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // 2. If transitioning to "paid", release matching ledger rows first
    if (status === "paid") {
      const { data: pendingLedger, error: ledgerError } = await supabase
        .from("transactional_ledger")
        .select(`
          id,
          provider_share,
          created_at,
          bookings!inner (
            branches!inner (
              provider_id
            )
          )
        `)
        .eq("payout_status", "pending")
        .eq("bookings.branches.provider_id", request.provider_id)
        .order("created_at", { ascending: true });

      if (ledgerError) throw ledgerError;

      const targetAmount = Number(request.amount || 0);
      let coveredAmount = 0;
      const ledgerIdsToRelease: string[] = [];

      for (const entry of (pendingLedger || [])) {
        if (coveredAmount >= targetAmount) break;
        ledgerIdsToRelease.push(entry.id);
        coveredAmount += Number(entry.provider_share || 0);
      }

      if (ledgerIdsToRelease.length > 0) {
        const { error: releaseError } = await supabase
          .from("transactional_ledger")
          .update({ 
            payout_status: "released",
            payout_request_id: request.id
          })
          .in("id", ledgerIdsToRelease);

        if (releaseError) throw releaseError;
      }
    }

    // 3. Update the payout request
    const { data: updatedRequest, error: updateError } = await supabase
      .from("payout_requests")
      .update({
        status,
        processed_at: new Date().toISOString(),
        processed_by: user.id,
        bank_reference: bankReference || null,
        admin_note: adminNote || `Status updated to ${status} by admin.`
      })
      .eq("id", requestId)
      .select()
      .single()

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, updatedRequest }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Process payout failure." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})
