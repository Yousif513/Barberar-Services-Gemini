"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";

// Which business the signed-in person works for and as what, from the database (my_provider_context), not from
// providers.owner_id: an employee owns nothing but works for a business.
export type ProviderContext = {
  role: "owner" | "employee" | "none";
  providerId: string | null;
  businessNameEn: string;
  businessNameAr: string;
  employeeId: string | null;
  employeeNameEn: string;
  employeeNameAr: string;
  branchId: string | null;
  membershipRole: string | null;
  permissions: Record<string, unknown>;
};

export type ProviderContextState =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; context: ProviderContext };

const Ctx = createContext<ProviderContextState>({ status: "loading" });

export function parseProviderContext(raw: unknown): ProviderContext {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const role = row.role === "owner" || row.role === "employee" ? row.role : "none";
  return {
    role,
    providerId: typeof row.provider_id === "string" ? row.provider_id : null,
    businessNameEn: text(row.business_name_en),
    businessNameAr: text(row.business_name_ar),
    employeeId: typeof row.employee_id === "string" ? row.employee_id : null,
    employeeNameEn: text(row.employee_name_en),
    employeeNameAr: text(row.employee_name_ar),
    branchId: typeof row.branch_id === "string" ? row.branch_id : null,
    membershipRole: typeof row.membership_role === "string" ? row.membership_role : null,
    permissions: row.permissions && typeof row.permissions === "object" ? (row.permissions as Record<string, unknown>) : {},
  };
}

export function ProviderContextProvider({ children }: { children: React.ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ProviderContextState>({ status: "loading" });
  const retry = useCallback(() => { setState({ status: "loading" }); setAttempt((value) => value + 1); }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!live) return;
      if (!user) { setState({ status: "ready", context: parseProviderContext(null) }); return; }
      const { data, error } = await supabase.rpc("my_provider_context");
      if (!live) return;
      if (error) setState({ status: "error", message: errorMessage(error), retry });
      else setState({ status: "ready", context: parseProviderContext(data) });
    })();
    return () => { live = false; };
  }, [attempt, retry]);

  const value = useMemo(() => state, [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProviderContext(): ProviderContextState {
  return useContext(Ctx);
}
