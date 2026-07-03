"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The old static "Store / Discover" catalog was replaced by the admin-driven
// /services page (Phase 2 rename). Keep this route as a redirect for old links.
export default function StoreRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/services");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#F2EEE6] text-[#211A12] flex items-center justify-center font-sans">
      <div className="text-center space-y-2">
        <p className="text-xs text-[#8A7F6C] font-bold uppercase tracking-widest animate-pulse">Redirecting to PRIMORA Services...</p>
      </div>
    </div>
  );
}
