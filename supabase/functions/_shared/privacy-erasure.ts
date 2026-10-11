// Q2.1 / Q2.7 (docs/legal/2026-10-10-privacy-decision-memo.md): after the database erased a customer's data, the auth account
// (e-mail, phone, password, MFA factors) is deleted through the Supabase Auth admin API, and so is an account whose court hold was
// released (review H1) or that came back after a restore (deletion ledger). WhatsApp threads are erased under every phone the
// account held (review M7), and copy files of an erased customer are removed (review M6). Pure module: the Edge Function
// privacy-erase-account and the Node tests share it.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPORT_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/personal-data\.(json|pdf)$/i;

export type Due = {
  requests?: { request_id?: unknown; subject_id?: unknown; phone?: unknown; phones?: unknown }[];
  held_released?: { subject_id?: unknown; phones?: unknown }[];
  restored?: { subject_id?: unknown }[];
  export_files?: { request_id?: unknown; paths?: unknown }[];
  whatsapp_channels?: unknown[];
};
export type Task =
  | { kind: "request"; requestId: string; subjectId: string; waIds: string[] }
  | { kind: "held_released"; subjectId: string; waIds: string[] }
  | { kind: "restored"; subjectId: string; waIds: string[] };

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
    tasks.push({ kind: "request", requestId, subjectId, waIds: whatsappWaIds(r.phone, r.phones) });
  }
  for (const r of due.held_released ?? []) {
    const subjectId = String(r.subject_id ?? "");
    if (!UUID.test(subjectId) || seen.has(subjectId)) continue;
    seen.add(subjectId);
    tasks.push({ kind: "held_released", subjectId, waIds: whatsappWaIds(r.phones) });
  }
  for (const r of due.restored ?? []) {
    const subjectId = String(r.subject_id ?? "");
    if (!UUID.test(subjectId) || seen.has(subjectId)) continue;
    seen.add(subjectId);
    tasks.push({ kind: "restored", subjectId, waIds: [] });
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
