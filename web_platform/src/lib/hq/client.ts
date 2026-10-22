import type { HqCitation, HqCommand, HqReceipt, HqSession, HqSource, HqView } from "./contracts";

export class HqApiError extends Error {
  code: string;
  status: number;
  definitive: boolean;
  constructor(code: string, status = 0, definitive = false) { super(code); this.name = "HqApiError"; this.code = code; this.status = status; this.definitive = definitive; }
}
type Fetcher = typeof fetch;
const flights = new Map<string, { fingerprint: string; promise: Promise<HqReceipt> }>();
async function request(path: string, init: RequestInit, fetcher: Fetcher): Promise<{body: Record<string, unknown>; status: number}> {
  try {
    const response = await fetcher(path, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15000), ...init });
    const body = await response.json();
    if (!body || typeof body !== "object") throw new HqApiError("unknown_receipt");
    return {body, status: response.status};
  } catch (failure) {
    if (failure instanceof HqApiError) throw failure;
    throw new HqApiError("unknown_receipt");
  }
}
function refusal(body: Record<string, unknown>, status: number, definitive = false): never {
  const error = body.error as { code?: unknown } | undefined;
  throw new HqApiError(typeof error?.code === "string" ? error.code : "unknown_receipt", status, definitive && status >= 400 && status < 500);
}
export async function openHqSession(fetcher: Fetcher = fetch): Promise<HqSession> {
  const {body,status} = await request("/api/hq/session", {method:"POST", headers:{"content-type":"application/json"}, body:"{}"}, fetcher);
  if (body.ok !== true) refusal(body,status);
  const session = body.session as HqSession;
  if (!session || !session.workspaceId || !session.actorId || !session.csrfToken || session.mode !== "local-development" || session.employeesActive !== false) throw new HqApiError("invalid_response");
  return session;
}
export async function loadHqState<T>(view: HqView, filters: Record<string, string | number | undefined> = {}, fetcher: Fetcher = fetch): Promise<T> {
  const query = new URLSearchParams({view});
  for (const [key,value] of Object.entries(filters)) if (value !== undefined && value !== "") query.set(key,String(value));
  const {body,status} = await request(`/api/hq/state?${query}`, {method:"GET"}, fetcher);
  if (body.ok !== true) refusal(body,status);
  if (!body.data || typeof body.data !== "object") throw new HqApiError("invalid_response");
  return body.data as T;
}
function checkedReceipt(body: Record<string, unknown>, command: HqCommand): HqReceipt {
  const receipt = body.receipt as HqReceipt;
  if (!receipt || receipt.commandId !== command.commandId || receipt.type !== command.type || receipt.effect !== "record-only" ||
      !receipt.entityId || !receipt.entityType || !Number.isSafeInteger(receipt.revision) || receipt.revision < 1 || !receipt.recordIds ||
      !Number.isFinite(Date.parse(receipt.recordedAt))) throw new HqApiError("unknown_receipt");
  return receipt;
}
export async function submitHqCommand(session: HqSession, command: HqCommand, fetcher: Fetcher = fetch): Promise<HqReceipt> {
  const key = `${session.workspaceId}:${command.commandId}`;
  const fingerprint = JSON.stringify(command);
  const existing = flights.get(key);
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new HqApiError("command_conflict",409);
    return existing.promise;
  }
  const promise = (async () => {
    const recovered = await request(`/api/hq/commands/${encodeURIComponent(command.commandId)}`, {method:"GET"}, fetcher);
    if (recovered.body.ok === true) return checkedReceipt(recovered.body,command);
    const recoveryError = recovered.body.error as {code?: string} | undefined;
    if (recovered.status !== 404 || recoveryError?.code !== "not_found") refusal(recovered.body,recovered.status);
    const response = await request("/api/hq/commands", {method:"POST", headers:{"content-type":"application/json","x-hq-csrf":session.csrfToken}, body:JSON.stringify(command)}, fetcher);
    if (response.body.ok !== true) refusal(response.body,response.status,true);
    return checkedReceipt(response.body,command);
  })();
  flights.set(key,{fingerprint,promise});
  try { return await promise; } finally { if (flights.get(key)?.promise === promise) flights.delete(key); }
}

export function citationFromSelection(source: Pick<HqSource,"id"|"version"|"sha256"|"body">, start: number, end: number): HqCitation | null {
  const displayed = source.body.replace(/\r\n?/g,"\n");
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > displayed.length) return null;
  const originalOffset = (offset: number) => {
    let original=0, visible=0;
    while (visible < offset) { original += source.body[original] === "\r" && source.body[original+1] === "\n" ? 2 : 1; visible++; }
    return original;
  };
  const from=originalOffset(start), to=originalOffset(end);
  return {sourceId:source.id,version:source.version,sha256:source.sha256,start:from,end:to,quote:source.body.slice(from,to)};
}
