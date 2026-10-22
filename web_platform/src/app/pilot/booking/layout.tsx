import type {Metadata} from "next";
import {notFound} from "next/navigation";
import "@/components/customer-pilot/pilot.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"PRIMORA · Local pilot",robots:{index:false,follow:false}};
export default function PilotLayout({children}:{children:React.ReactNode}){if(process.env.PRIMORA_PILOT_LOCAL_MODE!=="enabled"||process.env.VERCEL)notFound();return children;}
