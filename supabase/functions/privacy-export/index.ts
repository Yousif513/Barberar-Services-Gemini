import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import * as pdfLib from "npm:pdf-lib@1.17.1"
import fontkit from "npm:@pdf-lib/fontkit@1.1.1"
import { adminSessionAllows, bearerToken, corsHeaders, json, MissingConfigError, resolveCaller, serviceClient } from "../_shared/http.ts"
import { consoleCallerDecision, FUNCTION_PERMISSIONS } from "../_shared/console-permission.ts"
import { buildExportJson, buildExportPdf, exportPaths, fontsFromBase64, sha256Hex } from "../_shared/privacy-export-document.ts"
import { FONT_BASE64 as ARABIC_FONT } from "../_shared/fonts/ibm-plex-sans-arabic-regular-arabic.ts"
import { FONT_BASE64 as LATIN_FONT } from "../_shared/fonts/ibm-plex-sans-arabic-regular-latin.ts"

// PRIV-2 (Q1.5): builds the approved personal-data copies and removes expired ones.
//   { "request_id": "<uuid>" }  build one approved copy (the approver's console calls it right after approving)
//   {}                          build every approved copy still waiting, then remove the files of expired copies (scheduler)
// Caller: the scheduler (service key) or a console session holding privacy.approve. The package comes from
// privacy_export_payload (service key only); files go to the private bucket privacy-exports; privacy_export_record_built records
// both SHA-256 digests, completes the request and tells the customer. Nothing personal is logged.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) })
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405)

  try {
    const caller = await resolveCaller(req)
    const decision = await consoleCallerDecision(caller?.kind ?? null, true, FUNCTION_PERMISSIONS["privacy-export"],
      (permission) => adminSessionAllows(bearerToken(req), permission))
    if (!decision.allowed) return json(req, { error: decision.error }, decision.status)

    const body = await req.json().catch(() => ({}))
    const db = serviceClient()
    let queue: { request_id: string; subject_id: string }[]
    if (typeof body?.request_id === "string") {
      const { data, error } = await db.from("privacy_exports").select("request_id, subject_id, status").eq("request_id", body.request_id).maybeSingle()
      if (error) throw error
      if (!data || !["awaiting_build", "failed"].includes(data.status)) return json(req, { error: "No approved copy is waiting for this request." }, 404)
      queue = [{ request_id: data.request_id, subject_id: data.subject_id }]
    } else {
      const { data, error } = await db.rpc("privacy_exports_to_build", { p_limit: 10 })
      if (error) throw error
      queue = (data ?? []) as { request_id: string; subject_id: string }[]
    }

    const fonts = fontsFromBase64(ARABIC_FONT, LATIN_FONT)
    const results: { request_id: string; status: string; error?: string }[] = []
    for (const item of queue) {
      try {
        const { data: payload, error } = await db.rpc("privacy_export_payload", { p_request_id: item.request_id })
        if (error) throw error
        const paths = exportPaths(item.subject_id, item.request_id)
        const jsonBytes = new TextEncoder().encode(buildExportJson(payload))
        const pdfBytes = await buildExportPdf(pdfLib, fontkit, payload, fonts)
        const bucket = db.storage.from("privacy-exports")
        const up1 = await bucket.upload(paths.json, jsonBytes, { contentType: "application/json", upsert: true })
        if (up1.error) throw up1.error
        const up2 = await bucket.upload(paths.pdf, pdfBytes, { contentType: "application/pdf", upsert: true })
        if (up2.error) throw up2.error
        const counts = Object.fromEntries(Object.entries(payload as Record<string, unknown>)
          .filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length]))
        const { error: recordError } = await db.rpc("privacy_export_record_built", {
          p_request_id: item.request_id, p_json_path: paths.json, p_pdf_path: paths.pdf,
          p_json_sha256: await sha256Hex(jsonBytes), p_pdf_sha256: await sha256Hex(pdfBytes), p_row_counts: counts,
        })
        if (recordError) throw recordError
        results.push({ request_id: item.request_id, status: "built" })
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error"
        await db.rpc("privacy_export_record_failure", { p_request_id: item.request_id, p_error: message })
        results.push({ request_id: item.request_id, status: "failed", error: message })
      }
    }

    let removed = 0
    if (typeof body?.request_id !== "string") {
      const { data: expired, error } = await db.rpc("privacy_expire_exports")
      if (error) throw error
      const paths = ((expired ?? []) as { paths: string[] }[]).flatMap((e) => e.paths.filter(Boolean))
      if (paths.length) {
        const { error: removeError } = await db.storage.from("privacy-exports").remove(paths)
        if (removeError) throw removeError
        removed = paths.length
      }
    }
    return json(req, { processed: results.length, results, expired_files_removed: removed })
  } catch (error) {
    if (error instanceof MissingConfigError) return json(req, { error: error.message }, 503)
    console.error("[privacy-export] failure", error instanceof Error ? error.message : "unknown")
    return json(req, { error: error instanceof Error ? error.message : "Unexpected error." }, 500)
  }
})
