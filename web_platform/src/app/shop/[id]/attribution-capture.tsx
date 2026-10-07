"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureAttribution } from "@/lib/attribution";

// Remembers, for this browser session, which link or site brought the visitor to this shop (labels and referrer host only).
// It renders nothing. The booking command reads it later; see lib/attribution.ts.
export function AttributionCapture() {
  const pathname = usePathname();
  useEffect(() => {
    captureAttribution();
  }, [pathname]);
  return null;
}
