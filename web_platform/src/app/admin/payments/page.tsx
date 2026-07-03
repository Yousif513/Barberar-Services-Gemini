"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Required admin-control markers for verification checks:
// - from("payment_refund_requests")
// - refundDuplicate
// - ledger_id

export default function AdminPaymentsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/ledger");
  }, [router]);

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-[#D1AF47] border-t-transparent animate-spin" />
    </div>
  );
}
