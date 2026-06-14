"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BecomeProviderRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/become-provider");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#070B12] text-white flex items-center justify-center font-sans relative overflow-hidden">
      {/* Background Radial Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(209,175,71,0.08)_0%,rgba(7,11,18,0)_70%)] pointer-events-none" />
      
      {/* Subtle Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      <div className="relative z-10 max-w-sm w-full mx-4 p-8 rounded-[24px] bg-[#0D1422]/60 border border-white/[0.06] backdrop-blur-xl shadow-[inset_0_0_20px_rgba(255,255,255,0.01),0_0_30px_rgba(0,0,0,0.5),0_0_40px_rgba(209,175,71,0.05)] text-center transition-all duration-300">
        <div className="relative flex items-center justify-center w-16 h-16 mx-auto mb-6">
          {/* Outer glowing pulsing ring */}
          <div className="absolute inset-0 rounded-full border border-[#D1AF47]/20 animate-ping opacity-75"></div>
          {/* Inner spinning gold ring */}
          <div className="absolute inset-1.5 rounded-full border-2 border-transparent border-t-[#D1AF47] border-r-[#D1AF47] animate-spin"></div>
          {/* Central gold logo/dot */}
          <div className="w-5 h-5 bg-gradient-to-tr from-[#D1AF47] to-[#E0C46A] rounded-full shadow-[0_0_20px_rgba(209,175,71,0.6)] flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-[#070B12] rounded-full"></div>
          </div>
        </div>

        <div className="space-y-3">
          <span className="text-sm font-serif font-black tracking-widest bg-gradient-to-r from-[#D1AF47] via-[#E0C46A] to-[#D1AF47] bg-clip-text text-transparent block">
            PRIMORA
          </span>
          <div className="h-px w-12 bg-gradient-to-r from-transparent via-[#D1AF47]/30 to-transparent mx-auto my-2" />
          <p className="text-[11px] text-[#B8C0D4] font-bold uppercase tracking-widest">
            Redirecting to Join Board...
          </p>
          <p className="text-[11px] text-[#7B859C] font-semibold tracking-wide" dir="rtl">
            جاري تحويلك إلى لوحة الانضمام...
          </p>
        </div>
      </div>
    </div>
  );
}

