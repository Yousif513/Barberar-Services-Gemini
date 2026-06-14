"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DiscoverRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/store");
  }, [router]);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex items-center justify-center font-sans">
      <div className="text-center space-y-2">
        <p className="text-xs text-stone-400 font-bold uppercase tracking-widest animate-pulse">Redirecting to Primora Store...</p>
      </div>
    </div>
  );
}
