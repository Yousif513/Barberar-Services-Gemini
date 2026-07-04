"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { supabase } from "@/lib/supabase";

interface Conversation {
  id: string;
  name: string;
  lastMessage: string;
  time: string;
  unread: boolean;
  online: boolean;
  role: string;
  avatar: string;
}

interface Message {
  sender: string;
  text: string;
  time: string;
}

interface MessagesState {
  [key: string]: Message[];
}

export default function ProviderMessages() {
  const [conversations, setConversations] = useState<Conversation[]>([
    { id: "1", name: "Yousif PC", lastMessage: "Yes, I will arrive 10 minutes early.", time: "10:30 AM", unread: false, online: true, role: "Client", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=100&auto=format&fit=crop" },
    { id: "2", name: "Sara Al-Saud", lastMessage: "Can we reschedule to 6 PM?", time: "Yesterday", unread: true, online: true, role: "Client", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=100&auto=format&fit=crop" },
    { id: "3", name: "Mohammed Al-Otaibi", lastMessage: "Thanks for the discount coupon.", time: "3 days ago", unread: false, online: false, role: "Client", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=100&auto=format&fit=crop" }
  ]);

  const [selectedConv, setSelectedConv] = useState<Conversation>(conversations[0]);
  const [messages, setMessages] = useState<MessagesState>({
    "1": [
      { sender: "provider", text: "Hello Yousif, thanks for booking the Haircut + Beard Detail package.", time: "10:15 AM" },
      { sender: "customer", text: "Hi Ahmed! Just wanted to confirm if you are doing home service in Al-Malqa?", time: "10:20 AM" },
      { sender: "provider", text: "Yes, I cover all of Al-Malqa. I will arrive 10 minutes early.", time: "10:30 AM" }
    ],
    "2": [
      { sender: "customer", text: "Hello, my booking for Saturday is at 4 PM. Can we reschedule to 6 PM?", time: "Yesterday" }
    ],
    "3": [
      { sender: "provider", text: "Thanks for visiting us today. Here is a 10% loyalty discount for your next spa visit.", time: "3 days ago" },
      { sender: "customer", text: "Thanks for the discount coupon.", time: "3 days ago" }
    ]
  });

  const [inputMessage, setInputMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typingConvId, setTypingConvId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedConv, typingConvId]);

  const handleSend = () => {
    if (!inputMessage.trim()) return;

    const currentConvId = selectedConv.id;
    const newMsg: Message = {
      sender: "provider",
      text: inputMessage,
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    };

    setMessages((prev: MessagesState) => ({
      ...prev,
      [currentConvId]: [...(prev[currentConvId] || []), newMsg]
    }));

    setConversations((prev) =>
      prev.map((c) =>
        c.id === currentConvId ? { ...c, lastMessage: inputMessage, time: "Just now" } : c
      )
    );

    setInputMessage("");

    // Simulate typing status starting in 400ms
    setTimeout(() => {
      setTypingConvId(currentConvId);
    }, 400);

    // Simulate auto client response after 1.5 seconds
    setTimeout(() => {
      const autoReply: Message = {
        sender: "customer",
        text: `Got it! Thanks for the quick response.`,
        time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
      };
      setMessages((prev: MessagesState) => ({
        ...prev,
        [currentConvId]: [...(prev[currentConvId] || []), autoReply]
      }));
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentConvId ? { ...c, lastMessage: autoReply.text, time: "Just now" } : c
        )
      );
      setTypingConvId(null);
    }, 1500);
  };

  // Get currently active conversation details with the updated lastMessage and time
  const activeConv = conversations.find((c) => c.id === selectedConv.id) || selectedConv;

  const filteredConversations = conversations.filter(conv =>
    conv.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] rounded-[28px] overflow-hidden flex h-[calc(100vh-12rem)] min-h-[550px] text-[#101828]">
      
      {/* 1. CHATS SIDEBAR PANEL */}
      <div className="w-80 border-r border-[#ECECEC] flex flex-col justify-between bg-white flex-shrink-0">
        
        {/* Sidebar Header */}
        <div className="p-5 border-b border-[#ECECEC] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-[10px] text-[#D1AF47] uppercase tracking-[0.2em]">Client Inbox</h3>
            <div className="w-2 h-2 rounded-full bg-[#D1AF47] shadow-[0_0_10px_#D1AF47] animate-pulse"></div>
          </div>
          
          {/* Search bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-[#ECECEC] rounded-xl px-4 py-2.5 pl-9 text-xs text-[#101828] placeholder-[#7B859C] outline-none focus:border-[#D1AF47]/40 focus:bg-white shadow-[0_4px_12px_rgba(0,0,0,0.015)] transition-all duration-300"
            />
            <svg className="absolute left-3.5 top-3 w-3.5 h-3.5 text-[#667085]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")} 
                className="absolute right-3 top-3 text-[#667085] hover:text-[#101828] transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
        
        {/* Chats list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-white/5 scrollbar-track-transparent">
          {filteredConversations.length > 0 ? (
            filteredConversations.map((conv) => {
              const isSelected = selectedConv.id === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    setSelectedConv(conv);
                    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread: false } : c));
                  }}
                  className={`relative p-3.5 rounded-2xl cursor-pointer transition-all duration-300 flex items-center gap-3 border group ${
                    isSelected 
                      ? "bg-[#D1AF47]/5 border-[#D1AF47]/20 shadow-[0_4px_12px_rgba(209,175,71,0.04)]" 
                      : "border-transparent bg-transparent hover:bg-gray-50/50 hover:border-[#ECECEC]"
                  }`}
                >
                  {/* Avatar wrapper */}
                  <div className="relative flex-shrink-0">
                    <div className={`p-[2px] rounded-full transition-all duration-300 ${
                      isSelected ? "bg-[#D1AF47]" : "bg-transparent group-hover:bg-[#D1AF47]/40"
                    }`}>
                      <img src={conv.avatar} alt={conv.name} className="w-10 h-10 rounded-full object-cover bg-white border border-[#ECECEC]" />
                    </div>
                    {conv.online && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#3DDC84] border-2 border-white shadow-[0_0_8px_rgba(61,220,132,0.6)]">
                        <span className="absolute inset-0 rounded-full bg-[#3DDC84] opacity-75 animate-ping"></span>
                      </span>
                    )}
                  </div>
                  
                  {/* Info details */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className={`font-bold text-xs truncate transition-colors duration-300 ${
                        isSelected ? "text-[#101828]" : "text-[#344054] group-hover:text-[#101828]"
                      }`}>{conv.name}</h4>
                      <span className="text-[9px] font-semibold text-[#667085] flex-shrink-0">{conv.time}</span>
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-extrabold tracking-wider uppercase bg-[#D1AF47]/10 text-[#D1AF47] border border-[#D1AF47]/20">
                        {conv.role}
                      </span>
                      {conv.unread && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-[#FF5D73]/15 text-[#EF4444] border border-[#FF5D73]/30 tracking-wider">
                          New
                        </span>
                      )}
                    </div>
                    
                    <p className={`text-[10.5px] truncate mt-1 ${
                      conv.unread ? "text-[#101828] font-medium" : "text-[#667085]"
                    }`}>
                      {conv.lastMessage}
                    </p>
                  </div>
                  
                  {conv.unread && (
                    <span className="w-2.5 h-2.5 bg-[#D1AF47] rounded-full shadow-[0_0_10px_#D1AF47] flex-shrink-0"></span>
                  )}
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center px-4">
              <svg className="w-8 h-8 text-[#667085] mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-xs text-[#667085] font-medium">No conversations found</p>
            </div>
          )}
        </div>
      </div>

      {/* 2. CHAT CONSOLE PANEL */}
      <div className="flex-1 flex flex-col justify-between bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] min-w-0">
        
        {/* Header */}
        <div className="h-20 px-6 border-b border-[#ECECEC] flex items-center justify-between bg-white/90 backdrop-blur-md flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="p-[2px] rounded-full bg-gradient-to-tr from-[#D1AF47] to-[#B8952E] shadow-[0_0_15px_rgba(209,175,71,0.2)]">
                <img src={activeConv.avatar} alt={activeConv.name} className="w-10 h-10 rounded-full object-cover bg-white border border-[#ECECEC]" />
              </div>
              {activeConv.online && (
                <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#3DDC84] border-2 border-white shadow-[0_0_8px_rgba(61,220,132,0.6)]">
                  <span className="absolute inset-0 rounded-full bg-[#3DDC84] opacity-75 animate-ping"></span>
                </span>
              )}
            </div>
            <div>
              <h4 className="font-bold text-sm text-[#101828] tracking-wide">{activeConv.name}</h4>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${activeConv.online ? "bg-[#3DDC84]" : "bg-[#7B859C]"}`} />
                <p className="text-[10px] text-[#344054] font-semibold tracking-wider uppercase">
                  {activeConv.online ? "Online" : "Offline"} | {activeConv.role}
                </p>
              </div>
            </div>
          </div>
          
          <Link href="/provider/customers" className="flex items-center gap-2 px-4 py-2 border border-[#D1AF47]/30 hover:border-[#D1AF47] text-[#D1AF47] hover:bg-[#D1AF47]/10 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all duration-300 bg-transparent shadow-[0_0_15px_rgba(209,175,71,0.03)] hover:shadow-[0_0_20px_rgba(209,175,71,0.1)] cursor-pointer">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Client Profile
          </Link>
        </div>

        {/* Message stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#FBFAF9] scrollbar-thin scrollbar-thumb-white/5 scrollbar-track-transparent">
          {(messages[activeConv.id] || []).length > 0 ? (
            (messages[activeConv.id] || []).map((msg: Message, i: number) => {
              const isProvider = msg.sender === "provider";
              return (
                <div
                  key={i}
                  className={`flex w-full items-end gap-3 ${isProvider ? "justify-end" : "justify-start"}`}
                >
                  {/* Avatar for Customer */}
                  {!isProvider && (
                    <img
                      src={activeConv.avatar}
                      alt={activeConv.name}
                      className="w-7 h-7 rounded-full object-cover border border-[#ECECEC] flex-shrink-0 shadow-sm"
                    />
                  )}
                  
                  <div className={`flex flex-col ${isProvider ? "items-end" : "items-start"} max-w-[70%]`}>
                    <div
                      className={`rounded-[20px] px-5 py-3.5 border transition-all duration-300 ${
                        isProvider
                          ? "bg-gradient-to-r from-[#D1AF47] to-[#B8952E] text-slate-950 border-transparent font-medium shadow-[0_4px_20px_rgba(209,175,71,0.1)] rounded-br-none"
                          : "bg-white border border-[#ECECEC] text-[#101828] shadow-[0_4px_12px_rgba(0,0,0,0.02)] rounded-bl-none"
                      }`}
                    >
                      <p className="text-xs leading-relaxed tracking-wide font-light">{msg.text}</p>
                    </div>
                    <span className="text-[9px] mt-1.5 font-medium tracking-wider text-[#667085]">
                      {msg.time}
                    </span>
                  </div>

                  {/* Avatar for Provider ( Ahmed ) */}
                  {isProvider && (
                    <div className="w-7 h-7 rounded-full bg-[#FBFAF7] border border-[#ECECEC] flex items-center justify-center flex-shrink-0 shadow-sm">
                      <span className="text-[10px] text-[#D1AF47] font-bold">P</span>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-50 py-12">
              <svg className="w-12 h-12 text-[#667085] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <h5 className="font-bold text-sm text-[#101828] tracking-wide">Start the Conversation</h5>
              <p className="text-xs text-[#667085] mt-1">Send a message to begin chatting with {activeConv.name}</p>
            </div>
          )}

          {/* Typing Simulator Bubble */}
          {typingConvId === activeConv.id && (
            <div className="flex w-full items-end gap-3 justify-start">
              <img
                src={activeConv.avatar}
                alt={activeConv.name}
                className="w-7 h-7 rounded-full object-cover border border-[#ECECEC] flex-shrink-0 shadow-sm"
              />
              <div className="flex flex-col items-start max-w-[70%]">
                <div className="bg-white border border-[#ECECEC] text-[#344054] shadow-md rounded-[20px] rounded-bl-none px-5 py-3.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D1AF47] animate-bounce" style={{ animationDelay: "0ms" }}></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D1AF47] animate-bounce" style={{ animationDelay: "150ms" }}></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D1AF47] animate-bounce" style={{ animationDelay: "300ms" }}></span>
                </div>
                <span className="text-[9px] mt-1.5 font-medium tracking-wider text-[#667085]">
                  {activeConv.name} is typing...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Footer Input */}
        <div className="p-5 border-t border-[#ECECEC] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.015)]/90 backdrop-blur-md flex items-center gap-3 flex-shrink-0">
          <button className="p-3 text-[#667085] hover:text-[#D1AF47] hover:bg-[#F3F4F6] border border-[#ECECEC] rounded-2xl transition-all duration-300 active:scale-95 cursor-pointer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder={`Type a message to ${activeConv.name}...`}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              className="w-full bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] rounded-2xl px-5 py-3.5 pr-12 text-xs outline-none focus:border-[#D1AF47]/40 text-[#101828] placeholder-[#7B859C] font-normal transition-all duration-300 focus:shadow-[0_0_20px_rgba(209,175,71,0.06)]"
            />
          </div>

          <button
            onClick={handleSend}
            className="px-6 py-3.5 bg-gradient-to-r from-[#D1AF47] to-[#B8952E] hover:from-[#E0C46A] hover:to-[#D1AF47] text-slate-950 rounded-2xl text-xs font-extrabold uppercase tracking-wider transition-all duration-300 shadow-[0_0_20px_rgba(209,175,71,0.15)] hover:shadow-[0_0_25px_rgba(209,175,71,0.25)] active:scale-95 flex items-center gap-2 cursor-pointer"
          >
            <span>Send</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>

      </div>

    </div>
  );
}
