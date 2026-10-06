"use client";

import { Suspense } from "react";
import AdminProviderManagement from "./provider-management";

// The screen reads its tab and filters from the address bar, which needs a Suspense boundary while the page is prerendered.
export default function AdminProvidersPage() {
  return (
    <Suspense fallback={null}>
      <AdminProviderManagement />
    </Suspense>
  );
}
