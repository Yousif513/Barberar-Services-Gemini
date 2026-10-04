"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// The request board lives in the signed-in portals, where posts and offers are stored and
// bid decisions run on the server (accept_job_bid). This public route forwards by role.
export default function ServiceBoardRedirect() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      const role = profile?.role || "customer";
      router.replace(role === "provider_owner" || role === "provider_employee" ? "/provider/jobs" : "/customer/jobs");
    })();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="w-8 h-8 border-4 border-stone-300 border-t-stone-900 rounded-full animate-spin" />
    </div>
  );
}
