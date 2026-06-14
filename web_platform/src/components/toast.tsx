"use client";

import React, { useEffect } from "react";

export interface ToastProps {
  message: string;
  type: "success" | "info" | "error";
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type, onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const typeStyles = {
    success: "bg-white border-l-4 border-emerald-600 text-stone-900 shadow-xl",
    info: "bg-white border-l-4 border-[hsl(45,60%,50%)] text-stone-900 shadow-xl",
    error: "bg-white border-l-4 border-rose-600 text-stone-900 shadow-xl",
  };

  const icons = {
    success: (
      <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5 text-[hsl(45,60%,50%)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
  };

  return (
    <div className={`flex items-center gap-3.5 px-4 py-3 rounded-xl border border-stone-200/60 max-w-sm w-full font-sans ${typeStyles[type]}`}>
      <div className="flex-shrink-0">{icons[type]}</div>
      <div className="flex-grow text-xs font-bold tracking-normal leading-relaxed">
        {message}
      </div>
      <button
        onClick={onClose}
        className="flex-shrink-0 text-stone-400 hover:text-stone-950 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type: "success" | "info" | "error" }>;
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 w-full max-w-xs pointer-events-auto">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </div>
  );
}
