"use client";

import React, { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Booking happens on the provider's shop page, which reads live services, staff and slots.
// This route only forwards old links: a provider id goes to its shop, anything else to discovery.
function BookingRedirect() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const providerId = searchParams.get("id") || "";

  useEffect(() => {
    router.replace(UUID_RE.test(providerId) ? `/shop/${providerId}` : "/discover");
  }, [providerId, router]);

  return (
    <div className="min-h-[400px] flex items-center justify-center bg-[#F2EEE6] rounded-3xl p-12">
      <div className="w-8 h-8 border-4 border-[#C29A4C] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={null}>
      <BookingRedirect />
    </Suspense>
  );
}
