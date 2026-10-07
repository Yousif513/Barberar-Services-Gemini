"use client";

import React from "react";
import { ModalOverlay, ModalPortal } from "@/components/modal";

/**
 * The dialog frame for the public pages (booking page waitlist and phone verification): portalled to <body>, the page behind it
 * inert, focus moved in and trapped, Escape closes it, focus returns to the control that opened it (all from ModalOverlay),
 * and the panel is a named modal dialog for screen readers.
 */
export function PublicDialog({
  label,
  onClose,
  canClose = true,
  panelClass = "max-w-md",
  children,
}: {
  label: string;
  onClose: () => void;
  canClose?: boolean;
  panelClass?: string;
  children: React.ReactNode;
}) {
  return (
    <ModalPortal>
      <ModalOverlay onClose={onClose} canClose={canClose} className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          className={`max-h-full w-full overflow-y-auto rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl sm:p-8 ${panelClass}`}
        >
          {children}
        </div>
      </ModalOverlay>
    </ModalPortal>
  );
}
