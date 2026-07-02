"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function CustomerMessages() {
  const [conversations, setConversations] = useState<any[]>([
    { id: "1", name: "Ahmed Barber", lastMessage: "Yes, I will arrive 10 minutes early.", time: "10:30 AM", unread: true, online: true, role: "Senior Stylist", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=100&auto=format&fit=crop" },
    { id: "2", name: "Sara Spa & Wellness", lastMessage: "Your booking for the Swedish Massage is confirmed.", time: "Yesterday", unread: false, online: false, role: "Salon Concierge", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=100&auto=format&fit=crop" },
    { id: "3", name: "Leen Makeup Studio", lastMessage: "Can you send the location details?", time: "2 days ago", unread: false, online: true, role: "Makeup Artist", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=100&auto=format&fit=crop" }
  ]);
  
  const [selectedConv, setSelectedConv] = useState<any>(conversations[0]);
  const [messages, setMessages] = useState<any>({
    "1": [
      { sender: "provider", text: "Hello Yousif, thanks for booking the Haircut + Beard Detail package.", time: "10:15 AM" },
      { sender: "customer", text: "Hi Ahmed! Just wanted to confirm if you are doing home service in Al-Malqa?", time: "10:20 AM" },
      { sender: "provider", text: "Yes, I cover all of Al-Malqa. I will arrive 10 minutes early.", time: "10:30 AM" }
    ],
    "2": [
      { sender: "provider", text: "Welcome to Sara Spa. Your booking for the Swedish Massage is confirmed.", time: "Yesterday" }
    ],
    "3": [
      { sender: "provider", text: "Hi, looking forward to our session on Saturday.", time: "2 days ago" },
      { sender: "customer", text: "Awesome! Let me know if you need anything from my side.", time: "2 days ago" },
      { sender: "provider", text: "Can you send the location details?", time: "2 days ago" }
    ]
  });

  const [inputMessage, setInputMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedConv]);

  const handleSend = () => {
    if (!inputMessage.trim()) return;

    const currentConvId = selectedConv.id;
    const newMsg = {
      sender: "customer",
      text: inputMessage,
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    };

    // Update messages
    setMessages((prev: any) => ({
      ...prev,
      [currentConvId]: [...(prev[currentConvId] || []), newMsg]
    }));

    // Update last message in conversation sidebar
    setConversations((prev) =>
      prev.map((c) =>
        c.id === currentConvId ? { ...c, lastMessage: inputMessage, time: "Just now" } : c
      )
    );

    setInputMessage("");

    // Simulate auto-reply response after 1.5 seconds
    setTimeout(() => {
      const autoReply = {
        sender: "provider",
        text: `Thank you for your message! This is a simulated responder for ${selectedConv.name}. We will get back to you shortly.`,
        time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
      };
      setMessages((prev: any) => ({
        ...prev,
        [currentConvId]: [...(prev[currentConvId] || []), autoReply]
      }));
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentConvId ? { ...c, lastMessage: autoReply.text, time: "Just now" } : c
        )
      );
    }, 1500);
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm flex h-[calc(100vh-12rem)] min-h-[500px]">
      
      {/* 1. CHATS SIDEBAR PANEL */}
      <div className="w-80 border-r border-stone-200 flex flex-col justify-between bg-stone-50/50 flex-shrink-0">
        <div className="p-4 border-b border-stone-200">
          <h3 className="font-extrabold text-sm text-stone-900 uppercase tracking-wider">Conversations</h3>
        </div>
        
        {/* Chats list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map((conv) => {
            const isSelected = selectedConv.id === conv.id;
            return (
              <div
                key={conv.id}
                onClick={() => {
                  setSelectedConv(conv);
                  // clear unread status
                  setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread: false } : c));
                }}
                className={`p-3.5 rounded-xl cursor-pointer transition flex items-start gap-3 border ${
                  isSelected 
                    ? "bg-white border-stone-200 shadow-sm" 
                    : "border-transparent hover:bg-stone-100/60"
                }`}
              >
                <div className="relative">
                  <img src={conv.avatar} alt={conv.name} className="w-10 h-10 rounded-full object-cover bg-stone-200" />
                  {conv.online && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white"></span>
                  )}
                </div>
                
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs text-stone-900 truncate">{conv.name}</h4>
                    <span className="text-[9px] font-semibold text-stone-400">{conv.time}</span>
                  </div>
                  <p className="text-[9px] text-amber-700 font-extrabold uppercase tracking-wider">{conv.role}</p>
                  <p className="text-[10px] text-stone-500 truncate mt-0.5">{conv.lastMessage}</p>
                </div>
                
                {conv.unread && (
                  <span className="w-2.5 h-2.5 bg-amber-500 rounded-full mt-1.5 flex-shrink-0"></span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. CHAT CONSOLE PANEL */}
      <div className="flex-1 flex flex-col justify-between bg-white min-w-0">
        
        {/* Header */}
        <div className="h-16 px-6 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <img src={selectedConv.avatar} alt={selectedConv.name} className="w-9 h-9 rounded-full object-cover bg-stone-200" />
            <div>
              <h4 className="font-bold text-xs text-stone-900">{selectedConv.name}</h4>
              <p className="text-[9px] text-stone-400 font-semibold uppercase tracking-wider">
                {selectedConv.online ? "Online" : "Away"} | {selectedConv.role}
              </p>
            </div>
          </div>
          
          <Link href="/customer/bookings" className="px-3.5 py-1.5 border border-stone-200 hover:border-stone-400 rounded-lg text-[10px] font-bold uppercase tracking-wider transition">
            View Details
          </Link>
        </div>

        {/* Message stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-stone-50/20">
          {(messages[selectedConv.id] || []).map((msg: any, i: number) => {
            const isCustomer = msg.sender === "customer";
            return (
              <div
                key={i}
                className={`flex w-full ${isCustomer ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-3 border shadow-sm ${
                    isCustomer
                      ? "bg-stone-900 text-stone-50 border-stone-850"
                      : "bg-white text-stone-800 border-stone-200"
                  }`}
                >
                  <p className="text-xs leading-relaxed font-light">{msg.text}</p>
                  <span className={`text-[8px] block mt-1.5 text-right font-medium ${
                    isCustomer ? "text-stone-400" : "text-stone-400"
                  }`}>
                    {msg.time}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Footer Input */}
        <div className="p-4 border-t border-stone-200 bg-white flex items-center gap-3 flex-shrink-0">
          {/* Attach Button */}
          <button className="p-2.5 text-stone-400 hover:text-stone-700 transition border border-stone-200 rounded-xl">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          
          <input
            type="text"
            placeholder={`Type a message to ${selectedConv.name}...`}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-stone-400 font-semibold text-stone-700 placeholder-stone-400"
          />

          <button
            onClick={handleSend}
            className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-stone-50 rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-sm"
          >
            Send
          </button>
        </div>

      </div>

    </div>
  );
}
