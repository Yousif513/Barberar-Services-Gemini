// Q2.1 / Q2.7 (docs/legal/2026-10-10-privacy-decision-memo.md): after the database erased a customer's data, the auth account
// (e-mail, phone, password, MFA factors) is deleted through the Supabase Auth admin API, and so is an account whose court hold was
// released (review H1) or that came back after a restore (deletion ledger). WhatsApp threads are erased under every phone the
// account held (review M7), each only inside the time the account held it (review N6: a number given to someone else later keeps
// that person's threads), and copy files of an erased customer are removed (review M6). Pure module: the Edge Function
// privacy-erase-account and the Node tests share it.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPORT_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/personal-data\.(json|pdf)$/i;

export type Due = {
  requests?: { request_id?: unknown; subject_id?: unknown; phone?: unknown; phones?: unknown; phone_tenures?: unknown }[];
  held_released?: { subject_id?: unknown; phones?: unknown; phone_tenures?: unknown }[];
  restored?: { subject_id?: unknown }[];
  export_files?: { request_id?: unknown; paths?: unknown }[];
  whatsapp_channels?: unknown[];
};
// A WhatsApp id with the time the account held that number: from is required, until is null for the number it holds now.
export type WaWindow = { waId: string; from: string; until: string | null };
export type Task =
  | { kind: "request"; requestId: string; subjectId: string; waWindows: WaWindow[] }
  | { kind: "held_released"; subjectId: string; waWindows: WaWindow[] }
  | { kind: "restored"; subjectId: string; waWindows: WaWindow[] };

// WhatsApp identifies a sender by the international number without "+" (the wa_id the receptionist hashed).
export function whatsappWaId(phone: unknown): string | null {
  if (typeof phone !== "string") return null;
  const digits = phone.trim().replace(/^\+/, "").replace(/[\s()-]/g, "");
  return /^[0-9]{6,20}$/.test(digits) ? digits : null;
}

// Every distinct, well-formed WhatsApp id among the phones the account held.
export function whatsappWaIds(...phones: unknown[]): string[] {
  const out = new Set<string>();
  for (const p of phones.flatMap((x) => (Array.isArray(x) ? x : [x]))) {
    const id = whatsappWaId(p);
    if (id) out.add(id);
  }
  return [...out];
}

const isoOrNull = (value: unknown): string | null | undefined => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
};

// The tenures privacy_phone_tenures recorded ([{phone, from, until}]), as WhatsApp windows. An entry without a valid number or
// start, or with an unreadable end, is dropped: nothing is erased under a number whose tenure is unknown.
export function whatsappWindows(tenures: unknown): WaWindow[] {
  const out = new Map<string, WaWindow>();
  for (const t of Array.isArray(tenures) ? tenures : []) {
    if (!t || typeof t !== "object") continue;
    const entry = t as { phone?: unknown; from?: unknown; until?: unknown };
    const waId = whatsappWaId(entry.phone);
    const from = isoOrNull(entry.from);
    const until = isoOrNull(entry.until);
    if (!waId || !from || until === undefined) continue;
    out.set(`${waId}|${from}|${until ?? ""}`, { waId, from, until });
  }
  return [...out.values()];
}

// What privacy_auth_erasures_due returned, as validated tasks: approved deletions first, then accounts a released court hold had
// kept, then accounts a restore brought back. One account is never listed twice.
export function planAuthErasures(due: Due): Task[] {
  const tasks: Task[] = [];
  const seen = new Set<string>();
  for (const r of due.requests ?? []) {
    const requestId = String(r.request_id ?? "");
    const subjectId = String(r.subject_id ?? "");
    if (!UUID.test(requestId) || !UUID.test(subjectId) || seen.has(subjectId)) continue;
    seen.add(subjectId);
    tasks.push({ kind: "request", requestId, subjectId, waWindows: whatsappWindows(r.phone_tenures) });
  }
  for (const r of due.held_released ?? []) {
    const subjectId = String(r.subject_id ?? "");
    if (!UUID.test(subjectId) || seen.has(subjectId)) continue;
    seen.add(subjectId);
    tasks.push({ kind: "held_released", subjectId, waWindows: whatsappWindows(r.phone_tenures) });
  }
  for (const r of due.restored ?? []) {
    const subjectId = String(r.subject_id ?? "");
    if (!UUID.test(subjectId) || seen.has(subjectId)) continue;
    seen.add(subjectId);
    tasks.push({ kind: "restored", subjectId, waWindows: [] });
  }
  return tasks;
}

// Copy files to remove from the private bucket: only paths of the shape the builder writes.
export function plannedExportRemovals(due: Due): { requestIds: string[]; paths: string[] } {
  const requestIds: string[] = [];
  const paths: string[] = [];
  for (const e of due.export_files ?? []) {
    const requestId = String(e.request_id ?? "");
    if (!UUID.test(requestId)) continue;
    const ok = (Array.isArray(e.paths) ? e.paths : []).map((p) => String(p ?? "")).filter((p) => EXPORT_PATH.test(p));
    requestIds.push(requestId);
    paths.push(...ok);
  }
  return { requestIds, paths };
}

export function whatsappChannelKeys(due: Due): string[] {
  return (due.whatsapp_channels ?? []).map((c) => String(c ?? "")).filter((c) => /^[0-9]{5,25}$/.test(c));
}

// The Auth admin API's answer to deleteUser: done, already gone (a retry after a timeout), or retry later.
export function classifyAuthDelete(error: { status?: number; message?: string; code?: string } | null): "deleted" | "already_gone" | "retry" {
  if (!error) return "deleted";
  if (error.status === 404 || error.code === "user_not_found" || /user not found/i.test(error.message ?? "")) return "already_gone";
  return "retry";
}
