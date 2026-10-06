"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { devRoleHome, getDevRole } from "@/lib/dev-access";
import { useOperationsLocale } from "@/components/operations-ui";

type UserRole = "customer" | "provider_owner" | "provider_employee" | "admin";

const roleHome: Record<UserRole, string> = {
  customer: "/customer/dashboard",
  provider_owner: "/provider/dashboard",
  provider_employee: "/provider/dashboard",
  admin: "/admin",
};

const guardCopy = {
  en: { verifying: "Verifying secure session...", failed: "Your session could not be checked. You are still signed in.", retry: "Try again" },
  ar: { verifying: "جارٍ التحقق من الجلسة الآمنة...", failed: "تعذّر التحقق من الجلسة. أنت ما زلت مسجلاً.", retry: "إعادة المحاولة" },
};

export function AuthGuard({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}) {
  const router = useRouter();
  const copy = guardCopy[useOperationsLocale()];
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const allowedRolesKey = allowedRoles.join(",");

  useEffect(() => {
    let active = true;

    const authorize = async () => {
      const devRole = getDevRole();
      if (devRole) {
        // A local dev role opens only the dashboards that role may use, like a real session.
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

      // A transient read failure must not end the session (nor, with the default scope, every session the person
      // holds on other devices): only a profile that truly does not exist sends the person back to sign in.
      if (error && error.code !== "PGRST116") {
        if (active) setCheckFailed(true);
        return;
      }
      if (!profile) {
        await supabase.auth.signOut({ scope: "local" });
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
  }, [allowedRolesKey, router, attempt]);

  if (checkFailed) {
    return (
      <div role="alert" className="min-h-screen grid place-items-center bg-[#F7F7F5] px-6 text-center text-sm font-semibold text-[#667085]">
        <div className="space-y-3">
          <p>{copy.failed}</p>
          <button
            type="button"
            onClick={() => {
              setCheckFailed(false);
              setAttempt((count) => count + 1);
            }}
            className="rounded-xl border border-[#D1AF47]/50 bg-white px-4 py-2 text-sm font-bold text-[#725517] focus-visible:outline-2 focus-visible:outline-[#9B7928]"
          >
            {copy.retry}
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div role="status" className="min-h-screen grid place-items-center bg-[#F7F7F5] text-sm font-semibold text-[#667085]">
        {copy.verifying}
      </div>
    );
  }

  return children;
}
