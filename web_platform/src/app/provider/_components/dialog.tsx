"use client";

import React from "react";
import { ModalOverlay, ModalPortal } from "@/components/modal";

// One dialog shell for the provider portal: focus moves in, Tab stays inside, Escape closes, the page behind is inert
// (ModalOverlay) and the panel is named for screen readers. It replaces the hand-made `fixed inset-0` layers.
export function ProviderDialog({ label, onClose, canClose = true, wide = false, flush = false, children }: {
  label: string; onClose: () => void; canClose?: boolean; wide?: boolean; flush?: boolean; children: React.ReactNode;
}) {
  return (
    <ModalPortal>
      <ModalOverlay onClose={onClose} canClose={canClose} className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#101828]/45 px-4 py-8 backdrop-blur-sm">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          className={`max-h-full w-full overflow-y-auto rounded-[28px] border border-[#ECECEC] bg-white text-start shadow-2xl ${flush ? "" : "p-6"} ${wide ? "max-w-2xl" : "max-w-lg"}`}
        >
          {children}
        </div>
      </ModalOverlay>
    </ModalPortal>
  );
}

export const providerFieldClass =
  "w-full rounded-xl border border-[#D0D5DD] bg-white px-3 py-2.5 text-sm text-[#101828] outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] disabled:opacity-60";
export const providerLabelClass = "block text-xs font-bold text-[#344054]";
export const providerPrimaryButton =
  "rounded-xl bg-[#D1AF47] px-5 py-2.5 text-sm font-black text-[#070B12] outline-2 outline-offset-2 outline-transparent transition hover:bg-[#E0C46A] focus-visible:outline-[#9B7928] disabled:cursor-not-allowed disabled:opacity-60";
export const providerGhostButton =
  "rounded-xl border border-[#D0D5DD] bg-white px-4 py-2.5 text-sm font-bold text-[#344054] outline-2 outline-offset-2 outline-transparent hover:border-[#D1AF47]/60 focus-visible:outline-[#9B7928] disabled:opacity-50";

export function DialogError({ message }: { message: string }) {
  if (!message) return null;
  return <div role="alert" className="mt-4 rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2.5 text-sm font-semibold text-[#B42318]">{message}</div>;
}
