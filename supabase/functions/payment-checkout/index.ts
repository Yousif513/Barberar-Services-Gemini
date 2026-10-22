import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, json, MissingConfigError, resolveCaller, serviceClient } from "../_shared/http.ts"
import { buildRedirectUrl } from "../_shared/return-url.ts"
import { checkoutGatewayContext, dispatchCheckoutAttempt, recoverCheckoutAttempt, type CheckoutAttempt } from "../_shared/checkout-attempts.ts"

// Creates a Tap charge for something the signed-in user owes. The amount always comes from the
// database record, never from the browser.
//   { "bookingId": "<uuid>" }                                   booking deposit
//   { "purchaseType": "gift_card" | "package" | "membership" | "tip" | "subscription", "purchaseId": "<uuid>" }
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
    const purchaseType = body?.bookingId ? "booking" : String(body?.purchaseType || "")
    const targetId = body?.bookingId || body?.purchaseId
    if (typeof targetId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)
      || !["booking", "gift_card", "package", "membership", "tip", "subscription"].includes(purchaseType)
      || (body?.bookingId && (body?.purchaseId || body?.purchaseType))
      || (body?.action !== undefined && body.action !== "recover")) {
      return json(req, { error: "Choose one valid payable target.", code: "invalid_checkout_target" }, 400)
    }
    const gatewayContext = await checkoutGatewayContext(apiKey, Deno.env.get("SUPABASE_URL") || "")
    const { data: previous, error: readError } = await db.rpc("read_checkout_attempt", {
      p_actor_id: userId, p_purchase_type: purchaseType, p_target_id: targetId, p_gateway_context: gatewayContext,
    })
    if (readError) return readError.code === "P0002"
      ? json(req, { error: "Payable not found.", code: "checkout_not_found" }, 404)
      : json(req, { error: "Unable to check the existing payment attempt.", code: "checkout_recovery_unavailable" }, 503)
    let recovered: CheckoutAttempt | null = null
    if (previous && (previous.status !== "failed" || body?.action === "recover")) {
      recovered = await recoverCheckoutAttempt({ db, apiKey, gatewayContext, attempt: previous as CheckoutAttempt, fetchImpl: fetch })
      if (recovered.status !== "ready") return checkoutResult(req, recovered)
      // An existing checkout URL is offered only while this payable and seller remain eligible below.
    } else if (body?.action === "recover") {
      return json(req, { error: "No checkout attempt was found.", code: "checkout_not_found" }, 404)
    }
    let payable: Payable | null = null

    if (body?.bookingId) {
      const { data: booking, error: bookingError } = await db
        .from("bookings")
        .select("id, customer_id, branch_id, deposit_required, status")
        .eq("id", body.bookingId)
        .eq("customer_id", userId)
        .maybeSingle()
      if (bookingError) return json(req, { error: "Unable to verify this booking. Please try again." }, 503)
      if (!booking) return json(req, { error: "Booking not found." }, 404)
      if (booking.status !== "pending_payment") return json(req, { error: "Booking is not awaiting payment." }, 409)
      const { data: branch, error: branchError } = await db.from("branches")
        .select("provider_id").eq("id", booking.branch_id).maybeSingle()
      if (branchError) return json(req, { error: "Unable to verify this salon. Please try again." }, 503)
      if (!(await providerIsSelling(db, branch?.provider_id))) {
        return json(req, { error: "This salon is not taking payments right now, so nothing was charged." }, 409)
      }
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
          const { data } = await db.from("user_packages").select("id, amount_paid, status, provider_id")
            .eq("id", id).eq("customer_id", userId).maybeSingle()
          // RT-M3: only an active, verified provider takes payment for a package or a membership.
          if (data?.status === "pending_payment" && !(await providerIsSelling(db, data.provider_id))) {
            return json(req, { error: "This salon is not taking payments right now, so nothing was charged." }, 409)
          }
          if (data?.status === "pending_payment") {
            payable = { amount: Number(data.amount_paid), description: `Package ${data.id}`,
              metadata: { purchase_type: "package", purchase_id: data.id }, redirectPath: `/customer/packages?purchase=${data.id}` }
          }
          break
        }
        case "membership": {
          // The amount is the price snapshotted on the membership row when it was bought, never anything from the request.
          const { data } = await db.from("memberships").select("id, amount_due, status, provider_id")
            .eq("id", id).eq("customer_id", userId).maybeSingle()
          if (data?.status === "pending_payment" && !(await providerIsSelling(db, data.provider_id))) {
            return json(req, { error: "This salon is not taking payments right now, so nothing was charged." }, 409)
          }
          if (data?.status === "pending_payment") {
            payable = { amount: Number(data.amount_due), description: `Membership ${data.id}`,
              metadata: { purchase_type: "membership", purchase_id: data.id }, redirectPath: `/customer/memberships?purchase=${data.id}` }
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

    if (!Number.isFinite(payable.amount) || !(payable.amount > 0)) return json(req, { error: "Nothing to pay." }, 409)

    const { data: profile } = await db.from("profiles")
      .select("email, phone_number, first_name, last_name").eq("id", userId).single()

    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string
    const webhookUrl = Deno.env.get("PAYMENT_WEBHOOK_URL") || `${supabaseUrl}/functions/v1/payment-webhook`
    const appUrl = Deno.env.get("APP_URL") || "https://primora.sa"

    // payments_marketplace_split stays OFF until the owner confirms the legal opinion on fund custody;
    // no split destinations are sent while it is off.
    const { data: flag, error: flagError } = await db.from("platform_feature_flags").select("is_enabled")
      .eq("flag_key", "payments_marketplace_split").maybeSingle()
    if (flagError || typeof flag?.is_enabled !== "boolean") {
      return json(req, { error: "Payment routing configuration is unavailable. Please try again." }, 503)
    }
    if (flag.is_enabled) {
      return json(req, { error: "Marketplace split is enabled but sub-merchant destinations are not configured yet." }, 503)
    }

    if (recovered) {
      // Resume only after the canonical locked command rechecks the frozen amount/provider and current eligibility.
      // Reusing this exact persisted identity can never acquire a new dispatch claim.
      const { data: checked, error: checkError } = await db.rpc("claim_checkout_attempt", {
        p_actor_id: userId, p_purchase_type: purchaseType, p_target_id: targetId,
        p_attempt_id: recovered.id, p_request: recovered.request_text, p_gateway_context: gatewayContext,
      })
      if (checkError || !checked || checked.dispatch !== false) return checkoutResult(req, { ...recovered, status: "unknown" })
      const latest = checked.status === "captured"
        ? await recoverCheckoutAttempt({ db, apiKey, gatewayContext, attempt: checked as CheckoutAttempt, fetchImpl: fetch })
        : checked as CheckoutAttempt
      return checkoutResult(req, latest)
    }

    const attemptId = crypto.randomUUID()
    const requestText = JSON.stringify({
      amount: payable.amount,
      currency: "SAR",
      threeDSecure: true,
      save_card: false,
      description: payable.description,
      reference: { transaction: attemptId, order: targetId, idempotent: attemptId },
      metadata: { ...payable.metadata, checkout_attempt_id: attemptId },
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
      redirect: { url: buildRedirectUrl(appUrl, payable.redirectPath, body?.returnUrl) },
    })
    const { data: claimed, error: claimError } = await db.rpc("claim_checkout_attempt", {
      p_actor_id: userId, p_purchase_type: purchaseType, p_target_id: targetId,
      p_attempt_id: attemptId, p_request: requestText, p_gateway_context: gatewayContext,
    })
    if (claimError || !claimed) {
      return json(req, { error: "Payment could not be safely started. Check its status before trying again.", code: "checkout_claim_unavailable" }, 503)
    }
    const outcome = claimed.dispatch === true
      ? await dispatchCheckoutAttempt({ db, apiKey, gatewayContext, attempt: claimed as CheckoutAttempt, fetchImpl: fetch })
      : await recoverCheckoutAttempt({ db, apiKey, gatewayContext, attempt: claimed as CheckoutAttempt, fetchImpl: fetch })
    return checkoutResult(req, outcome)
  } catch (error) {
    if (error instanceof MissingConfigError) return json(req, { error: error.message }, 503)
    console.error("[payment-checkout] failure", error)
    return json(req, { error: error instanceof Error ? error.message : "Unexpected checkout error." }, 500)
  }
})

// The same rule as public.provider_is_selling: an active, verified provider.
async function providerIsSelling(db: ReturnType<typeof serviceClient>, providerId: string | null | undefined): Promise<boolean> {
  if (!providerId) return false
  const { data, error } = await db.rpc("provider_is_selling", { p_provider_id: providerId })
  if (error) throw error
  return data === true
}


function checkoutResult(req: Request, attempt: CheckoutAttempt): Response {
  if (attempt.status === "ready" && attempt.checkout_url && !attempt.reconciliation_required) {
    return json(req, { success: true, state: "ready", attemptId: attempt.id, checkoutUrl: attempt.checkout_url, chargeId: attempt.charge_id })
  }
  if (attempt.status === "failed" && !attempt.reconciliation_required) {
    return json(req, { success: false, state: "failed", attemptId: attempt.id, code: "checkout_failed", error: "The payment provider verified that this attempt failed. You may explicitly try again." }, 409)
  }
  const state = attempt.status === "captured" ? "captured" : attempt.status === "submitting" ? "submitting" : "unknown"
  return json(req, { success: false, state, attemptId: attempt.id, recoverable: true,
    code: state === "captured" ? "payment_received" : state === "submitting" ? "checkout_pending" : "checkout_unknown" }, 202)
}
