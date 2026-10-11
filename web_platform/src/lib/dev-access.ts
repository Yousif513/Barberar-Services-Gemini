export type DevRole = "customer" | "provider_owner" | "admin";

const storageKey = "barberar_dev_role";

export function isLocalDevAccessEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  // Opt-in only, never in a production build, and only on this machine. The database (RLS) remains the
  // authorization boundary; this only lets developers view dashboards without signing in.
  if (process.env.NODE_ENV === "production") return false;
  const isLocalHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(window.location.hostname);
  return isLocalHost && process.env.NEXT_PUBLIC_ENABLE_DEV_ACCESS === "true";
}

export function getDevRole(): DevRole | null {
  if (!isLocalDevAccessEnabled()) return null;

  const role = window.localStorage.getItem(storageKey);
  if (role === "customer" || role === "provider_owner" || role === "admin") {
    return role;
  }
  // No role is assigned automatically: a developer picks one explicitly on the login page or switcher.
  return null;
}

export function setDevRole(role: DevRole) {
  if (!isLocalDevAccessEnabled()) return false;
  window.localStorage.setItem(storageKey, role);
  return true;
}

export function clearDevRole() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(storageKey);
  }
}

export const devRoleHome: Record<DevRole, string> = {
  customer: "/customer/dashboard",
  provider_owner: "/provider/dashboard",
  admin: "/admin",
};
