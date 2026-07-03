"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/bookings");
  }, [router]);

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-[#D1AF47] border-t-transparent animate-spin" />
    </div>
  );
}
