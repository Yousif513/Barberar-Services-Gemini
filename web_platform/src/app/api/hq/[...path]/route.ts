import { handleHq } from "@/lib/hq/server/handler.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handleHq(request); }
export async function POST(request: Request) { return handleHq(request); }
