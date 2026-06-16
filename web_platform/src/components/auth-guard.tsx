"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { devRoleHome, getDevRole } from "@/lib/dev-access";

type UserRole = "customer" | "provider_owner" | "provider_employee" | "admin";

const roleHome: Record<UserRole, string> = {
  customer: "/customer/dashboard",
  provider_owner: "/provider/dashboard",
  provider_employee: "/provider/dashboard",
  admin: "/admin",
};

export function AuthGuard({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}) {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const allowedRolesKey = allowedRoles.join(",");

  useEffect(() => {
    let active = true;

    const authorize = async () => {
      const devRole = getDevRole();
      if (devRole) {
        if (!allowedRolesKey.split(",").includes(devRole)) {
          router.replace(devRoleHome[devRole]);
          return;
        }

        if (active) setIsAuthorized(true);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (error || !profile) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      const role = profile.role as UserRole;
      if (!allowedRolesKey.split(",").includes(role)) {
        router.replace(roleHome[role] ?? "/");
        return;
      }

      if (active) {
        setIsAuthorized(true);
      }
    };

    void authorize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.replace("/login");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [allowedRolesKey, router]);

  if (!isAuthorized) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#F7F7F5] text-sm font-semibold text-[#667085]">
        Verifying secure session...
      </div>
    );
  }

  return children;
}
