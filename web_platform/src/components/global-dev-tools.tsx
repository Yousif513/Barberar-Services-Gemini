"use client";

import { usePathname } from "next/navigation";
import { DevRoleSwitcher } from "@/components/dev-role-switcher";

export function GlobalDevTools() {
  const pathname = usePathname();
  if (pathname === "/hq" || pathname.startsWith("/hq/") || pathname === "/pilot/booking") return null;
  return <DevRoleSwitcher />;
}
