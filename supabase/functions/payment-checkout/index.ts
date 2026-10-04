import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, json, MissingConfigError, resolveCaller, serviceClient } from "../_shared/http.ts"

// Creates a Tap charge for something the signed-in user owes. The amount always comes from the
// database record, never from the browser.
//   { "bookingId": "<uuid>" }                                   booking deposit
//   { "purchaseType": "gift_card" | "package" | "tip" | "subscription", "purchaseId": "<uuid>" }
type Payable = { amount: number; description: string; metadata: Record<string, string>; redirectPath: string }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) })
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405)

  try {
    const caller = await resolveCaller(req)
    if (!caller || caller.kind === "service") return json(req, { error: "Authentication required." }, 401)
    const userId = caller.userId

    const apiKey = Deno.env.get("TAP_SECRET_KEY")
    if (!apiKey) return json(req, { error: "Payment gateway is not configured." }, 503)

    const body = await req.json().catch(() => ({}))
    const db = serviceClient()
    let payable: Payable | null = null

    if (body?.bookingId) {
      const { data: booking } = await db
        .from("bookings")
        .select("id, customer_id, deposit_required, status")
        .eq("id", body.bookingId)
        .eq("customer_id", userId)
        .maybeSingle()
      if (!booking) return json(req, { error: "Booking not found." }, 404)
      if (booking.status !== "pending_payment") return json(req, { error: "Booking is not awaiting payment." }, 409)
      if (!(Number(booking.deposit_required) > 0)) return json(req, { error: "Nothing to pay online for this booking." }, 409)
      payable = {
        amount: Number(booking.deposit_required),
        description: `Booking deposit ${booking.id}`,
        metadata: { purchase_type: "booking", booking_id: booking.id },
        redirectPath: `/customer/bookings?payment=${booking.id}`,
      }
    } else if (body?.purchaseType && body?.purchaseId) {
      const id = String(body.purchaseId)
      switch (body.purchaseType) {
        case "gift_card": {
          const { data } = await db.from("gift_cards").select("id, original_amount, status")
            .eq("id", id).eq("purchaser_id", userId).maybeSingle()
          if (data?.status === "pending_payment") {
            payable = { amount: Number(data.original_amount), description: `Gift card ${data.id}`,
              metadata: { purchase_type: "gift_card", purchase_id: data.id }, redirectPath: `/customer/wallet?gift=${data.id}` }
          }
          break
        }
        case "package": {
          const { data } = await db.from("user_packages").select("id, amount_paid, status")
            .eq("id", id).eq("customer_id", userId).maybeSingle()
          if (data?.status === "pending_payment") {
            payable = { amount: Number(data.amount_paid), description: `Package ${data.id}`,
              metadata: { purchase_type: "package", purchase_id: data.id }, redirectPath: `/customer/packages?purchase=${data.id}` }
          }
          break
        }
        case "tip": {
          const { data } = await db.from("booking_tips").select("id, amount, status, booking_id")
            .eq("id", id).eq("customer_id", userId).maybeSingle()
          if (data?.status === "pending") {
            payable = { amount: Number(data.amount), description: `Tip for booking ${data.booking_id}`,
              metadata: { purchase_type: "tip", purchase_id: data.id }, redirectPath: `/customer/bookings?tip=${data.id}` }
          }
          break
        }
        case "subscription": {
          const { data } = await db.from("subscription_payments").select("id, amount, status, provider_id, providers!inner(owner_id)")
            .eq("id", id).eq("providers.owner_id", userId).maybeSingle()
          if (data?.status === "pending_payment") {
            payable = { amount: Number(data.amount), description: `PRIMORA plan ${data.id}`,
              metadata: { purchase_type: "subscription", purchase_id: data.id }, redirectPath: `/provider/pricing?payment=${data.id}` }
          }
          break
        }
        default:
          return json(req, { error: "Unknown purchase type." }, 400)
      }
      if (!payable) return json(req, { error: "Nothing awaiting payment was found." }, 404)
    } else {
      return json(req, { error: "Missing bookingId or purchaseType/purchaseId." }, 400)
    }

    if (!(payable.amount > 0)) return json(req, { error: "Nothing to pay." }, 409)

    const { data: profile } = await db.from("profiles")
      .select("email, phone_number, first_name, last_name").eq("id", userId).single()

    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string
    const webhookUrl = Deno.env.get("PAYMENT_WEBHOOK_URL") || `${supabaseUrl}/functions/v1/payment-webhook`
    const appUrl = Deno.env.get("APP_URL") || "https://primora.sa"

    // payments_marketplace_split stays OFF until the owner confirms the legal opinion on fund custody;
    // no split destinations are sent while it is off.
    const { data: flag } = await db.from("platform_feature_flags").select("is_enabled")
      .eq("flag_key", "payments_marketplace_split").maybeSingle()
    if (flag?.is_enabled) {
      return json(req, { error: "Marketplace split is enabled but sub-merchant destinations are not configured yet." }, 503)
    }

    const response = await fetch("https://api.tap.company/v2/charges", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: payable.amount,
        currency: "SAR",
        threeDSecure: true,
        save_card: false,
        description: payable.description,
        metadata: payable.metadata,
        customer: {
          first_name: profile?.first_name || "PRIMORA",
          last_name: profile?.last_name || "Customer",
          ...(profile?.email ? { email: profile.email } : {}),
          ...(profile?.phone_number
            ? { phone: { country_code: "966", number: String(profile.phone_number).replace(/^\+966/, "") } }
            : {}),
        },
        source: { id: "src_all" },
        post: { url: webhookUrl },
        redirect: { url: `${appUrl}${payable.redirectPath}` },
      }),
    })
    const charge = await response.json().catch(() => ({}))
    if (!response.ok || !charge?.id || !charge?.transaction?.url) {
      console.error("[payment-checkout] Tap rejected the charge", response.status, JSON.stringify(charge).slice(0, 500))
      return json(req, { error: "Unable to initialize payment." }, 502)
    }
    return json(req, { success: true, checkoutUrl: charge.transaction.url, chargeId: charge.id })
  } catch (error) {
    if (error instanceof MissingConfigError) return json(req, { error: error.message }, 503)
    console.error("[payment-checkout] failure", error)
    return json(req, { error: error instanceof Error ? error.message : "Unexpected checkout error." }, 500)
  }
})
