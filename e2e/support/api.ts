// PostgREST as a signed-in person (their own access token and the public key), for server-side negative checks: what the
// browser hides must also be refused by the database when called directly.

import { stack } from "./stack";

export type ApiReply = { status: number; json: any };

export async function rpc(name: string, args: Record<string, unknown>, accessToken?: string): Promise<ApiReply> {
  const s = stack();
  const response = await fetch(`${s.apiUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: s.anonKey, authorization: `Bearer ${accessToken ?? s.anonKey}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await response.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: response.status, json };
}

/** service_role call, standing in for a server job (the Tap webhook, a scheduler). */
export async function serviceRpc(name: string, args: Record<string, unknown>): Promise<ApiReply> {
  const s = stack();
  const response = await fetch(`${s.apiUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: s.serviceKey, authorization: `Bearer ${s.serviceKey}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await response.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: response.status, json };
}
