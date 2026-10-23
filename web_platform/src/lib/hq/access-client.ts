import type { HqSession } from "./contracts";

export type AccessPurpose = "enroll" | "recover" | "rotate";
export interface AccessStatus { state: "access_required" | "authenticated" | "bootstrap_required"; enrolled?: boolean; session?: HqSession; }
export interface AccessOperation { operationId: string; operationProof: string; purpose: AccessPurpose | "signout" | "revoke"; expiresAt?: string; }
export interface AccessStage extends AccessOperation { credential: string; purpose: AccessPurpose; expiresAt: string; }
export interface AccessReceipt { operationId: string; purpose: string; state: "pending" | "committed" | "cancelled" | "expired"; at: string; priorGeneration: number; generation: number; }
export interface AccessResult { receipt: AccessReceipt; session?: HqSession; returnTo?: string; }
type Fetcher = typeof fetch;
const errorCodes = new Set(["access_mode_required","storage_not_initialized","storage_missing","storage_identity_changed","storage_guard_invalid","storage_unsafe","storage_corrupt","unsupported_schema","inert_restore","storage_unavailable","access_required","session_required","proof_invalid","operation_conflict","operation_expired","rate_limited","invalid_input","request_too_large","csrf_failed","origin_forbidden","return_forbidden"]);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const validDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const opaque = (value: unknown): value is string => typeof value === "string" && value.length >= 16 && value.length <= 1024;

export class HqAccessError extends Error {
  code: string; status: number; definitive: boolean; diagnosticId?: string;
  constructor(code: string, status = 0, diagnosticId?: string) {
    super(code); this.name = "HqAccessError"; this.code = code; this.status = status; this.definitive = status >= 400 && status < 500;
    if (diagnosticId && uuid.test(diagnosticId)) this.diagnosticId = diagnosticId;
  }
}

/** Only existing HQ destinations are accepted. Queries, fragments and encoded paths never carry access material. */
export function safeHqReturn(value: string | null | undefined): string | null {
  if (value == null || value === "") return "/hq";
  if (["/hq","/hq/tasks","/hq/projects","/hq/council","/hq/decisions","/hq/knowledge","/hq/agents"].includes(value)) return value;
  const detail = value.match(/^\/hq\/(tasks|projects|council|decisions|knowledge)\/([^/]+)$/);
  if (detail && uuid.test(detail[2])) return value;
  const agent = value.match(/^\/hq\/agents\/([a-z][a-z0-9-]{0,79})$/);
  if (agent && ["alexander","adam","nora","sarah","victoria","emma","maya","ethan","daniel","sophia","layla","omar","olivia","lina","rayan"].includes(agent[1])) return value;
  return null;
}

async function request(endpoint: string, payload: Record<string, unknown> | undefined, session: HqSession | undefined, fetcher: Fetcher): Promise<Record<string, unknown>> {
  let body: string | undefined;
  if (payload !== undefined) {
    body = JSON.stringify(payload);
    if (new TextEncoder().encode(body).length > 4096) throw new HqAccessError("request_too_large", 413);
  }
  try {
    const response = await fetcher(`/api/hq/access/${endpoint}`, {method: payload === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15000), headers: payload === undefined ? undefined : {"content-type":"application/json", ...(session ? {"x-hq-csrf":session.csrfToken} : {})}, ...(body !== undefined ? {body} : {})});
    const value: unknown = await response.json();
    if (!record(value)) throw new HqAccessError("unknown_result");
    if (!response.ok || value.ok !== true) {
      const error = record(value.error) ? value.error : {};
      const code = typeof error.code === "string" && errorCodes.has(error.code) ? error.code : "unknown_result";
      throw new HqAccessError(code, response.status, typeof error.diagnosticId === "string" ? error.diagnosticId : undefined);
    }
    return value;
  } catch (failure) {
    if (failure instanceof HqAccessError) throw failure;
    throw new HqAccessError("unknown_result");
  }
}
function checkedSession(value: unknown): HqSession {
  if (!record(value) || typeof value.workspaceId !== "string" || typeof value.actorId !== "string" || typeof value.actorLabel !== "string" || !opaque(value.csrfToken) || value.mode !== "local-development" || value.employeesActive !== false) throw new HqAccessError("unknown_result");
  return value as unknown as HqSession;
}
function checkedReceipt(value: unknown, operation?: AccessOperation): AccessReceipt {
  if (!record(value) || typeof value.operationId !== "string" || !uuid.test(value.operationId) || typeof value.purpose !== "string" || !["pending","committed","cancelled","expired"].includes(String(value.state)) || !validDate(value.at) || !Number.isSafeInteger(value.priorGeneration) || !Number.isSafeInteger(value.generation) || Number(value.priorGeneration) < 0 || Number(value.generation) < 0 || (operation && (value.operationId !== operation.operationId || value.purpose !== operation.purpose))) throw new HqAccessError("unknown_result");
  return value as unknown as AccessReceipt;
}
export async function getAccessStatus(fetcher: Fetcher = fetch): Promise<AccessStatus> {
  const value = (await request("status", undefined, undefined, fetcher)).access;
  if (!record(value) || !["access_required","authenticated","bootstrap_required"].includes(String(value.state))) throw new HqAccessError("unknown_result");
  if (value.state === "authenticated") {
    if (typeof value.enrolled !== "boolean") throw new HqAccessError("unknown_result");
    return {state:"authenticated",enrolled:value.enrolled,session:checkedSession(value.session)};
  }
  if ("session" in value || "enrolled" in value) throw new HqAccessError("unknown_result");
  return {state:value.state as "access_required" | "bootstrap_required"};
}
export async function prepareAccess(purpose: AccessPurpose, secret: string, status: AccessStatus, fetcher: Fetcher = fetch): Promise<AccessStage> {
  let challenge: string | undefined;
  if (purpose === "recover" || (purpose === "enroll" && status.state === "bootstrap_required")) {
    const response = await request("challenge", {}, undefined, fetcher);
    if (!opaque(response.challenge) || !validDate(response.expiresAt)) throw new HqAccessError("unknown_result");
    challenge = response.challenge;
  }
  const response = await request("stage", {purpose, ...(purpose === "enroll" ? {permit:secret} : {credential:secret}), ...(challenge ? {challenge} : {})}, status.session, fetcher);
  if (typeof response.operationId !== "string" || !uuid.test(response.operationId) || !opaque(response.operationProof) || !opaque(response.credential) || !validDate(response.expiresAt) || response.purpose !== purpose) throw new HqAccessError("unknown_result");
  return {operationId:response.operationId,operationProof:response.operationProof,credential:response.credential,expiresAt:response.expiresAt,purpose};
}
export async function confirmAccess(operation: AccessOperation, credential: string, returnTo: string, fetcher: Fetcher = fetch): Promise<AccessResult> {
  const destination = safeHqReturn(returnTo);
  if (!destination) throw new HqAccessError("return_forbidden", 400);
  const value = await request("confirm", {operationId:operation.operationId,operationProof:operation.operationProof,credential,returnTo:destination}, undefined, fetcher);
  const receipt = checkedReceipt(value.receipt, operation);
  if (receipt.state !== "committed" || (value.returnTo !== undefined && safeHqReturn(String(value.returnTo)) !== value.returnTo)) throw new HqAccessError("unknown_result");
  return {receipt,...(value.session ? {session:checkedSession(value.session)} : {}),...(typeof value.returnTo === "string" ? {returnTo:value.returnTo} : {})};
}
export async function checkAccessReceipt(operation: AccessOperation, fetcher: Fetcher = fetch): Promise<AccessReceipt> {
  return checkedReceipt((await request("receipt", {operationId:operation.operationId,operationProof:operation.operationProof}, undefined, fetcher)).receipt, operation);
}
export async function cancelAccess(operation: AccessOperation, fetcher: Fetcher = fetch): Promise<AccessReceipt> {
  const receipt = checkedReceipt((await request("cancel", {operationId:operation.operationId,operationProof:operation.operationProof}, undefined, fetcher)).receipt, operation);
  if (!["cancelled","expired","committed"].includes(receipt.state)) throw new HqAccessError("unknown_result");
  return receipt;
}
export function newRevocationOperation(all: boolean): AccessOperation {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const operationProof = btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
  return {operationId:crypto.randomUUID(),operationProof,purpose:all?"revoke":"signout"};
}
export async function revokeAccess(session: HqSession, operation: AccessOperation, credential?: string, fetcher: Fetcher = fetch): Promise<AccessReceipt> {
  if (operation.purpose !== (credential === undefined ? "signout" : "revoke")) throw new HqAccessError("invalid_input", 400);
  const receipt = checkedReceipt((await request(operation.purpose, {operationId:operation.operationId,operationProof:operation.operationProof,...(credential === undefined ? {} : {credential,confirmed:true})}, session, fetcher)).receipt, operation);
  if (receipt.state !== "committed") throw new HqAccessError("unknown_result");
  return receipt;
}
