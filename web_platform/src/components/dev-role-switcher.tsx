"use client";

import { useEffect, useRef, useState } from "react";
import {
  type DevRole,
  devRoleHome,
  getDevRole,
  isLocalDevAccessEnabled,
  setDevRole,
} from "@/lib/dev-access";

const roles: { id: DevRole; label: string }[] = [
  { id: "customer", label: "Customer" },
  { id: "provider_owner", label: "Provider" },
  { id: "admin", label: "Admin" },
];

export function DevRoleSwitcher() {
  const [mounted, setMounted] = useState(false);
  const [current, setCurrent] = useState<DevRole | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const didDrag = useRef(false);

  useEffect(() => {
    setMounted(true);
    setCurrent(getDevRole());
  }, []);

  // Global mouse/touch move + up handlers
  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragStart.current) return;
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      const dx = clientX - dragStart.current.px;
      const dy = clientY - dragStart.current.py;

      // Only start dragging if moved more than 5px (avoids blocking clicks)
      if (!didDrag.current && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;

      didDrag.current = true;
      setIsDragging(true);

      const newX = Math.max(0, Math.min(window.innerWidth - 50, dragStart.current.x + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 40, dragStart.current.y + dy));
      setPos({ x: newX, y: newY });
    };

    const onUp = () => {
      dragStart.current = null;
      // Reset didDrag after a tick so click handlers can check it
      setTimeout(() => {
        didDrag.current = false;
        setIsDragging(false);
      }, 0);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, []);

  if (!mounted || !isLocalDevAccessEnabled()) return null;

  const onDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    didDrag.current = false;
    dragStart.current = {
      x: rect.left,
      y: rect.top,
      px: clientX,
      py: clientY,
    };
  };

  const switchTo = (role: DevRole) => {
    if (didDrag.current) return; // Was a drag, not a click
    if (role === current) return;
    if (!setDevRole(role)) return;
    setCurrent(role);
    window.location.href = devRoleHome[role];
  };

  const toggleCollapse = () => {
    if (didDrag.current) return;
    setCollapsed((c) => !c);
  };

  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { right: 20, bottom: 20 };

  return (
    <div
      ref={containerRef}
      onMouseDown={onDragStart}
      onTouchStart={onDragStart}
      className="fixed z-[9999] select-none"
      style={{
        ...style,
        cursor: isDragging ? "grabbing" : "grab",
      }}
    >
      <div className="flex items-center gap-1 rounded-full border border-[#D1AF47]/30 bg-white/95 p-1 shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur-md">
        {/* Collapse / expand toggle */}
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={toggleCollapse}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[#B8952E] hover:bg-[#F4E7B6]/40 transition"
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ) : (
            <span className="text-[8px] font-black uppercase tracking-[0.15em]">Dev</span>
          )}
        </button>

        {/* Role buttons */}
        {!collapsed && roles.map((role) => {
          const active = current === role.id;
          return (
            <button
              key={role.id}
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => switchTo(role.id)}
              className={`rounded-full px-3 py-1.5 text-[10px] font-black transition ${
                active
                  ? "bg-[#D1AF47] text-white shadow-sm shadow-[#D1AF47]/30"
                  : "text-[#667085] hover:bg-[#F7F7F5] hover:text-[#101828]"
              }`}
            >
              {role.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
