import {notFound} from "next/navigation";
import {BookingPilot} from "@/components/customer-pilot/booking-pilot";
export const dynamic="force-dynamic";
export default function PilotBookingPage(){if(process.env.PRIMORA_PILOT_LOCAL_MODE!=="enabled"||process.env.VERCEL)notFound();return <BookingPilot/>;}
