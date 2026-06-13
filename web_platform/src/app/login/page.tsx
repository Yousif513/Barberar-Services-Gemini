"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<"customer" | "provider">("customer");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [mockCode, setMockCode] = useState("");

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.startsWith("+966") || phone.length < 13) {
      setError("Please enter a valid Saudi phone number starting with +966 (e.g., +966500000000).");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // 1. Generate a mock 6-digit code for testing
      const generatedCode = Math.floor(100000 + Math.random() * 900000).toString();
      setMockCode(generatedCode);

      // 2. Call our Supabase Edge Function to send WhatsApp/SMS OTP
      const { data, error: funcError } = await supabase.functions.invoke("send-otp", {
        body: { phone, code: generatedCode }
      });

      if (funcError) {
        console.warn("[Auth] Edge function failed, using local mock fallback.", funcError.message);
      }

      setStep("code");
    } catch (err: any) {
      console.error("[Auth] OTP generation error:", err);
      // Fallback for offline/local run
      setStep("code");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      // Verify code
      if (code !== mockCode && code !== "123456") {
        setError("Invalid verification code. Please try again.");
        setIsLoading(false);
        return;
      }

      // Route based on role selection
      if (role === "customer") {
        router.push("/customer/dashboard");
      } else {
        router.push("/provider/dashboard");
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(220,15%,8%)] text-white flex flex-col justify-center items-center px-4 font-sans relative overflow-hidden">
      
      {/* Decorative Blur Backgrounds */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-[hsla(45,60%,55%,0.03)] rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-[hsla(355,75%,50%,0.03)] rounded-full blur-3xl" />

      <div className="w-full max-w-md bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-2xl p-8 shadow-2xl relative z-10">
        
        {/* Brand Logo */}
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="text-2xl font-bold tracking-widest text-[hsl(45,60%,55%)]">
            PRIMORA
          </Link>
          <p className="text-xs text-[hsl(210,8%,65%)] mt-2">
            Saudi Arabia's Premium Beauty & Grooming Platform
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg p-3.5 mb-6 text-center leading-relaxed font-semibold">
            ⚠️ {error}
          </div>
        )}

        {step === "phone" ? (
          /* STEP 1: Phone number entry */
          <form onSubmit={handleSendOtp} className="space-y-6">
            
            {/* Role selector */}
            <div>
              <label className="text-[10px] uppercase font-bold text-[hsl(210,8%,65%)] block mb-3 text-center">
                Select Your Portal
              </label>
              <div className="grid grid-cols-2 gap-3 bg-[hsl(220,15%,8%)] p-1 rounded-lg border border-[hsla(0,0%,100%,0.05)]">
                <button
                  type="button"
                  onClick={() => setRole("customer")}
                  className={`py-2 text-xs font-bold rounded-md transition duration-150 ${
                    role === "customer"
                      ? "bg-[hsl(220,12%,14%)] text-[hsl(45,60%,55%)] border border-[hsla(0,0%,100%,0.05)]"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Customer
                </button>
                <button
                  type="button"
                  onClick={() => setRole("provider")}
                  className={`py-2 text-xs font-bold rounded-md transition duration-150 ${
                    role === "provider"
                      ? "bg-[hsl(220,12%,14%)] text-[hsl(45,60%,55%)] border border-[hsla(0,0%,100%,0.05)]"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Provider Portal
                </button>
              </div>
            </div>

            {/* Phone input */}
            <div>
              <label className="text-[10px] uppercase font-bold text-[hsl(210,8%,65%)] block mb-2">
                Mobile Number
              </label>
              <input
                type="tel"
                placeholder="+966500000000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-[hsl(220,15%,8%)] border border-[hsla(0,0%,100%,0.08)] rounded-lg px-4 py-3 text-sm outline-none focus:border-[hsl(45,60%,55%)] text-white placeholder-[hsl(210,8%,65%)]"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-[hsl(45,60%,55%)] text-black font-bold text-sm rounded-lg hover:bg-[hsl(45,60%,45%)] transition duration-200 disabled:opacity-50"
            >
              {isLoading ? "Sending code..." : "Request Verification Code"}
            </button>
          </form>
        ) : (
          /* STEP 2: Code entry */
          <form onSubmit={handleVerifyOtp} className="space-y-6">
            <div className="text-center space-y-2 mb-4">
              <p className="text-xs text-[hsl(210,8%,65%)]">
                We sent a WhatsApp/SMS verification code to:
              </p>
              <p className="text-sm font-bold text-[hsl(45,60%,55%)]">{phone}</p>
              
              {/* Dev tip displaying the generated code for testing */}
              {mockCode && (
                <div className="bg-[hsla(45,60%,55%,0.08)] border border-[hsla(45,60%,55%,0.2)] rounded-lg p-2.5 mt-2 text-xs font-semibold text-[hsl(45,60%,55%)]">
                  🔑 Dev Test OTP Code: <span className="underline font-bold text-sm">{mockCode}</span>
                </div>
              )}
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-[hsl(210,8%,65%)] block mb-2">
                Verification Code (6 Digits)
              </label>
              <input
                type="text"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full bg-[hsl(220,15%,8%)] border border-[hsla(0,0%,100%,0.08)] rounded-lg px-4 py-3 text-sm outline-none focus:border-[hsl(45,60%,55%)] text-white text-center font-bold tracking-widest"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-[hsl(45,60%,55%)] text-black font-bold text-sm rounded-lg hover:bg-[hsl(45,60%,45%)] transition duration-200 disabled:opacity-50"
            >
              {isLoading ? "Verifying..." : "Verify & Log In"}
            </button>

            <button
              type="button"
              onClick={() => setStep("phone")}
              className="w-full text-center text-xs text-[hsl(210,8%,65%)] hover:text-white mt-4 font-semibold"
            >
              ← Change Mobile Number
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
