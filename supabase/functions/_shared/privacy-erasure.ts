// Q2.1 / Q2.7 (docs/legal/2026-10-10-privacy-decision-memo.md): after the database erased a customer's data, the auth account
// (e-mail, phone, password, MFA factors) is deleted through the Supabase Auth admin API, and so is an account that came back after
// a restore (deletion ledger). Pure module: the Edge Function privacy-erase-account and the Node tests share it.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Due = {
  requests?: { request_id?: unknown; subject_id?: unknown; phone?: unknown }[];
  restored?: { subject_id?: unknown }[];
  whatsapp_channels?: unknown[];
};
export type Task = { kind: "request"; requestId: string; subjectId: string; waId: string | null } | { kind: "restored"; subjectId: string };

// WhatsApp identifies a sender by the international number without "+" (the wa_id the receptionist hashed).
export function whatsappWaId(phone: unknown): string | null {
  if (typeof phone !== "string") return null;
  const digits = phone.trim().replace(/^\+/, "");
  return /^[0-9]{6,20}$/.test(digits) ? digits : null;
}

// What privacy_auth_erasures_due returned, as validated tasks: approved deletions first, then accounts a restore brought back.
export function planAuthErasures(due: Due): Task[] {
  const tasks: Task[] = [];
  const seen = new Set<string>();
  for (const r of due.requests ?? []) {
    const requestId = String(r.request_id ?? "");
    const subjectId = String(r.subject_id ?? "");
    if (!UUID.test(requestId) || !UUID.test(subjectId) || seen.has(subjectId)) continue;
    seen.add(subjectId);
    tasks.push({ kind: "request", requestId, subjectId, waId: whatsappWaId(r.phone) });
  }
  for (const r of due.restored ?? []) {
    const subjectId = String(r.subject_id ?? "");
    if (!UUID.test(subjectId) || seen.has(subjectId)) continue;
    seen.add(subjectId);
    tasks.push({ kind: "restored", subjectId });
  }
  return tasks;
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
