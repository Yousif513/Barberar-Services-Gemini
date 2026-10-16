import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { adminSessionAllows, bearerToken, corsHeaders, json, MissingConfigError, resolveCaller, serviceClient } from "../_shared/http.ts"
import { consoleCallerDecision, FUNCTION_PERMISSIONS } from "../_shared/console-permission.ts"
import { classifyAuthDelete, planAuthErasures, plannedExportRemovals, whatsappChannelKeys, type Due } from "../_shared/privacy-erasure.ts"
import { hashCustomerId } from "../_shared/whatsapp-signature.ts"

// PRIV-3 (Q2.1, Q2.7): deletes auth accounts through the Supabase Auth admin API.
//   {}   handle every approved deletion whose data the database already erased, every account a released court hold had kept,
//        and every account a restore brought back; remove the copy files of erased customers
// Caller: the scheduler (service key) or a console session holding privacy.approve (the approver's console calls it right after
// approving). It first erases the WhatsApp receptionist messages under every number the customer's account held, only inside the
// time it held that number (the peppered hash only this function can compute, WHATSAPP_CONTACT_PEPPER), then deletes the auth account (e-mail, phone, password,
// MFA factors), then privacy_record_auth_erasure confirms against auth.users, completes the request and queues the completion
// notice. Nothing personal is logged or returned.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) })
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405)
  try {
    const caller = await resolveCaller(req)
    const decision = await consoleCallerDecision(caller?.kind ?? null, true, FUNCTION_PERMISSIONS["privacy-erase-account"],
      (permission) => adminSessionAllows(bearerToken(req), permission))
    if (!decision.allowed) return json(req, { error: decision.error }, decision.status)

    const db = serviceClient()
    const { data, error } = await db.rpc("privacy_auth_erasures_due")
    if (error) throw error
    const due = (data ?? {}) as Due
    const tasks = planAuthErasures(due)
    const channels = whatsappChannelKeys(due)
    const pepper = Deno.env.get("WHATSAPP_CONTACT_PEPPER") ?? ""

    const results: { kind: string; status: string; request_id?: string }[] = []
    for (const task of tasks) {
      const requestId = task.kind === "request" ? task.requestId : undefined
      if (task.waWindows.length && channels.length) {
        if (!pepper) {
          results.push({ kind: task.kind, request_id: requestId, status: "waiting: WHATSAPP_CONTACT_PEPPER not configured" })
          continue
        }
        const windows = await Promise.all(task.waWindows.flatMap((w) => channels.map(async (channel) =>
          ({ hash: await hashCustomerId(pepper, channel, w.waId), from: w.from, until: w.until }))))
        const { error: waError } = await db.rpc("privacy_erase_whatsapp", { p_request_id: requestId ?? null, p_windows: windows })
        if (waError) throw waError
      }
      const { error: deleteError } = await db.auth.admin.deleteUser(task.subjectId)
      const outcome = classifyAuthDelete(deleteError as { status?: number; message?: string; code?: string } | null)
      if (outcome === "retry") {
        results.push({ kind: task.kind, request_id: requestId, status: "retry" })
        continue
      }
      const { error: recordError } = await db.rpc("privacy_record_auth_erasure", { p_request_id: requestId ?? null, p_subject_id: task.subjectId })
      if (recordError) throw recordError
      results.push({ kind: task.kind, request_id: requestId, status: outcome })
    }

    // Review M6: copy files of an erased customer are removed from the private bucket, then recorded as removed.
    const removals = plannedExportRemovals(due)
    let filesRemoved = 0
    if (removals.requestIds.length) {
      if (removals.paths.length) {
        const { error: removeError } = await db.storage.from("privacy-exports").remove(removals.paths)
        if (removeError) throw removeError
        filesRemoved = removals.paths.length
      }
      const { error: markError } = await db.rpc("privacy_record_export_files_removed", { p_request_ids: removals.requestIds })
      if (markError) throw markError
    }
    return json(req, { processed: results.length, results, copy_files_removed: filesRemoved })
  } catch (error) {
    if (error instanceof MissingConfigError) return json(req, { error: error.message }, 503)
    console.error("[privacy-erase-account] failure", error instanceof Error ? error.message : "unknown")
    return json(req, { error: error instanceof Error ? error.message : "Unexpected error." }, 500)
  }
})
