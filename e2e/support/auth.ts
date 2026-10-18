// Test accounts through the local GoTrue admin API, sessions through GoTrue's own endpoints, and the TOTP factor every
// console account needs (GOV-1 / Q6: the database refuses administrator sessions below aal2).
//
// Every account is created fresh for the test that uses it (unique e-mail, random password held only in memory) and is
// deleted afterwards. The seeded console accounts (admin.owner@primora.local and the others) are never used or changed.

import { randomBytes, randomUUID } from "node:crypto";
import { lit, sql } from "./db";
import { stack } from "./stack";
import { totp } from "./totp";

export type Session = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  user: Record<string, unknown>;
};

export type Factor = { id: string; secret: string };

export type Account = {
  id: string;
  email: string;
  password: string;
  label: string;
  factor?: Factor;
};

type Reply = { status: number; json: any };

export async function gotrue(method: string, path: string, init: { token?: string; admin?: boolean; body?: unknown } = {}): Promise<Reply> {
  const s = stack();
  const key = init.admin ? s.serviceKey : s.anonKey;
  const response = await fetch(`${s.apiUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${init.admin ? s.serviceKey : init.token ?? s.anonKey}`,
      "content-type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: response.status, json };
}

function expectOk(reply: Reply, what: string): any {
  if (reply.status < 200 || reply.status >= 300) {
    // Only the error code and message: a reply body never carries a password, but a token could.
    const reason = reply.json && typeof reply.json === "object" ? `${reply.json.error_code ?? reply.json.code ?? ""} ${reply.json.msg ?? reply.json.message ?? reply.json.error_description ?? ""}` : "";
    throw new Error(`${what} failed with ${reply.status}: ${reason.trim()}`);
  }
  return reply.json;
}

const runId = randomBytes(3).toString("hex");
let serial = 0;

export function uniqueEmail(label: string): string {
  serial += 1;
  return `e2e.${label}.${runId}${process.env.TEST_PARALLEL_INDEX ?? "0"}${serial}.${randomBytes(2).toString("hex")}@primora.test`;
}

/** A phone number unique to this test in the Saudi mobile range (+9665XXXXXXXX). */
export function uniquePhone(): string {
  const digits = (BigInt(`0x${randomBytes(6).toString("hex")}`) % 100_000_000n).toString().padStart(8, "0");
  return `+9665${digits}`;
}

export async function createAccount(label: string): Promise<Account> {
  const email = uniqueEmail(label);
  const password = `E2e-${randomUUID()}`;
  const created = expectOk(await gotrue("POST", "/auth/v1/admin/users", { admin: true, body: { email, password, email_confirm: true } }), `creating the ${label} account`);
  return { id: created.id, email, password, label };
}

export async function deleteAccount(id: string): Promise<void> {
  await gotrue("DELETE", `/auth/v1/admin/users/${id}`, { admin: true }).catch(() => undefined);
}

function withExpiry(json: any): Session {
  const expiresAt = typeof json.expires_at === "number" ? json.expires_at : Math.floor(Date.now() / 1000) + Number(json.expires_in ?? 900);
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    token_type: json.token_type ?? "bearer",
    expires_in: Number(json.expires_in ?? 900),
    expires_at: expiresAt,
    user: json.user,
  };
}

export async function passwordSession(account: Account): Promise<Session> {
  const json = expectOk(await gotrue("POST", "/auth/v1/token?grant_type=password", { body: { email: account.email, password: account.password } }), `signing in ${account.label}`);
  return withExpiry(json);
}

export async function refreshSession(session: Session): Promise<Session> {
  const json = expectOk(await gotrue("POST", "/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: session.refresh_token } }), "refreshing a session");
  return withExpiry(json);
}

/** Enrols a TOTP factor and keeps its secret on the account (memory only), without verifying it. */
export async function enrolTotp(account: Account, session: Session): Promise<Factor> {
  const json = expectOk(await gotrue("POST", "/auth/v1/factors", { token: session.access_token, body: { factor_type: "totp", friendly_name: `e2e ${randomUUID().slice(0, 8)}` } }), "enrolling a TOTP factor");
  account.factor = { id: json.id, secret: json.totp.secret };
  return account.factor;
}

/** Challenge and verify the account's factor; returns the aal2 session GoTrue issues. */
export async function verifyTotp(account: Account, session: Session): Promise<Session> {
  if (!account.factor) throw new Error(`${account.label} has no TOTP factor`);
  const challenge = expectOk(await gotrue("POST", `/auth/v1/factors/${account.factor.id}/challenge`, { token: session.access_token, body: {} }), "a TOTP challenge");
  const json = expectOk(await gotrue("POST", `/auth/v1/factors/${account.factor.id}/verify`, {
    token: session.access_token, body: { challenge_id: challenge.id, code: totp(account.factor.secret) },
  }), "a TOTP verification");
  return withExpiry(json);
}

/** Password sign-in, TOTP enrolment (first time) and verification: an aal2 console session. */
export async function aal2Session(account: Account): Promise<Session> {
  const aal1 = await passwordSession(account);
  if (!account.factor) await enrolTotp(account, aal1);
  return verifyTotp(account, aal1);
}

export function jwtClaims(accessToken: string): Record<string, any> {
  return JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"));
}

/**
 * Makes the session's last authenticator verification `minutes` old, then refreshes it, so the new access token carries the
 * old TOTP time in its amr claim. This is how a test reaches "verified more than 5 minutes ago" (the step-up rule) without
 * waiting: the time is controlled on the server record GoTrue builds the claim from.
 */
export async function ageAuthenticatorVerification(session: Session, minutes: number): Promise<Session> {
  const sessionId = jwtClaims(session.access_token).session_id;
  sql(`update auth.mfa_amr_claims set created_at = now() - make_interval(mins => ${Number(minutes)}),
                                      updated_at = now() - make_interval(mins => ${Number(minutes)})
       where session_id = ${lit(sessionId)}::uuid;`);
  return refreshSession(session);
}
