"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useOperationsLocale } from "@/components/operations-ui";
import { intakeCopy, type FormStatus, type PatchStatus } from "@/lib/intake";

type Status = { form_required: boolean; form_status: FormStatus; patch_required: boolean; patch_status: PatchStatus; blocked: boolean; met: boolean };

// A small link from a booking to its health form. It shows only when the booking's service asks for a form or a patch test;
// the status comes from the non-sensitive status view (never the answers).
export default function IntakeLink({ bookingId, status, className }: { bookingId: string; status: string; className?: string }) {
  const locale = useOperationsLocale();
  const t = intakeCopy[locale];
  const [row, setRow] = useState<Status | null>(null);
  const upcoming = status === "pending_payment" || status === "confirmed";

  useEffect(() => {
    if (!upcoming) return;
    let live = true;
    void (async () => {
      const { data } = await supabase.from("provider_booking_intake_status")
        .select("form_required, form_status, patch_required, patch_status, blocked, met").eq("booking_id", bookingId).maybeSingle();
      if (live) setRow((data as Status | null) ?? null);
    })();
    return () => { live = false; };
  }, [bookingId, upcoming]);

  if (!upcoming || !row || (!row.form_required && !row.patch_required)) return null;
  const label = row.form_required && row.form_status !== "submitted" ? t.linkComplete : row.form_required ? t.linkView : t.linkPatch;
  return (
    <Link href={`/customer/bookings/${bookingId}/intake`} className={className ?? "rounded-xl border border-[#C29A4C]/40 bg-white px-4 py-2 text-center text-xs font-black text-[#6B4F17] transition hover:bg-[#F8F3E4]"}>
      {label}
    </Link>
  );
}
