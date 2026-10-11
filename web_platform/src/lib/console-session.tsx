"use client";

import { createContext, useContext } from "react";

// The signed-in console account as the database describes it (admin_session_state): its console role, the permissions that
// role holds and which role holds which permission. The console uses it only to leave out what the role cannot use (navigation
// entries, screens, row actions) and to say who could grant a refused screen. It authorizes nothing: every read and command is
// still decided by the database, and a screen reached by URL without the permission gets the database's refusal.

export type ConsoleSession = {
  loaded: boolean;
  signedIn: boolean;
  isAdminAccount: boolean;
  role: string | null;
  permissions: string[];
  rolePermissions: Record<string, string[]>;
  mfaAttemptsLeft: number | null;
};

export const EMPTY_CONSOLE_SESSION: ConsoleSession = {
  loaded: false, signedIn: false, isAdminAccount: false, role: null, permissions: [], rolePermissions: {}, mfaAttemptsLeft: null,
};

export function consoleSessionFrom(data: unknown): ConsoleSession {
  const s = (data ?? {}) as Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : []);
  const catalogue: Record<string, string[]> = {};
  if (s.role_permissions && typeof s.role_permissions === "object") {
    for (const [role, perms] of Object.entries(s.role_permissions as Record<string, unknown>)) catalogue[role] = list(perms);
  }
  return {
    loaded: true,
    signedIn: s.signed_in === true,
    isAdminAccount: s.is_admin_account === true,
    role: typeof s.console_role === "string" ? s.console_role : null,
    permissions: list(s.permissions),
    rolePermissions: catalogue,
    mfaAttemptsLeft: typeof s.mfa_attempts_left === "number" ? s.mfa_attempts_left : null,
  };
}

export const ConsoleSessionContext = createContext<ConsoleSession>(EMPTY_CONSOLE_SESSION);
export const useConsoleSession = () => useContext(ConsoleSessionContext);

// The permissions a console screen reads with (any one is enough), taken from the server functions each screen calls
// (gov2_require_read / admin_can in the migrations). A screen not listed reads with is_admin() alone.
export const SCREEN_PERMISSIONS: Record<string, string[]> = {
  "/admin/bookings": ["personal.read", "money.ledger"],
  "/admin/providers": ["personal.read"],
  "/admin/customers": ["personal.read"],
  "/admin/reviews": ["operations.write", "personal.read"],
  "/admin/disputes": ["money.refund", "personal.read"],
  "/admin/ledger": ["money.ledger"],
  "/admin/refunds": ["money.ledger", "money.refund"],
  "/admin/reconciliation": ["money.ledger"],
  "/admin/employees": ["personal.read", "money.ledger"],
  "/admin/platform-rules": ["money.config", "settings.manage"],
  "/admin/privacy": ["privacy.manage", "privacy.approve"],
  "/admin/incidents": ["incident.manage"],
  "/admin/notifications": ["personal.read"],
  "/admin/audit-logs": ["audit.read"],
  "/admin/settings": ["settings.manage", "money.config", "rewards.approve"],
};

export function screenPermissions(pathname: string): string[] {
  const match = Object.keys(SCREEN_PERMISSIONS)
    .filter((path) => pathname === path || pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? SCREEN_PERMISSIONS[match] : [];
}

// True when the session holds any of the permissions (an empty list needs none). Before the session is known, and for a
// local developer role without a session, nothing is hidden: the database still refuses.
export function holdsAny(session: ConsoleSession, permissions: string[]): boolean {
  if (permissions.length === 0) return true;
  if (!session.loaded || !session.signedIn) return true;
  return permissions.some((permission) => session.permissions.includes(permission));
}

// True only when the session is known and holds one of the permissions: for controls that must not show before it is known.
export function knownToHold(session: ConsoleSession, permissions: string[]): boolean {
  return session.loaded && session.signedIn && permissions.some((permission) => session.permissions.includes(permission));
}

export function rolesGranting(session: ConsoleSession, permissions: string[]): string[] {
  return Object.entries(session.rolePermissions)
    .filter(([, perms]) => permissions.some((permission) => perms.includes(permission)))
    .map(([role]) => role)
    .sort();
}

export const consoleRoleNames: Record<"en" | "ar", Record<string, string>> = {
  en: { owner: "Owner", finance: "Finance", operations: "Operations", analyst: "Analyst (read-only)" },
  ar: { owner: "المالك", finance: "المالية", operations: "العمليات", analyst: "محلل (قراءة فقط)" },
};
