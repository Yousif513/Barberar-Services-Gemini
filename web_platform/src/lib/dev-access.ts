export type DevRole = "customer" | "provider_owner" | "admin";

const storageKey = "barberar_dev_role";

export function isLocalDevAccessEnabled() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.NEXT_PUBLIC_ENABLE_DEV_ACCESS !== "true" ||
    typeof window === "undefined"
  ) {
    return false;
  }

  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export function getDevRole(): DevRole | null {
  if (!isLocalDevAccessEnabled()) return null;

  const role = window.localStorage.getItem(storageKey);
  if (role === "customer" || role === "provider_owner" || role === "admin") {
    return role;
  }

  // Auto-initialize a default dev role so pages don't get stuck
  // on "Verifying secure session..." when no role is set yet.
  window.localStorage.setItem(storageKey, "customer");
  return "customer";
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
