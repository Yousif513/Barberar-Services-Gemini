import { handlePilot } from "@/lib/customer-pilot/server/handler.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handlePilot(request); }
export async function POST(request: Request) { return handlePilot(request); }
