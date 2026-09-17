import { NextRequest, NextResponse } from "next/server";
import { BridgeError, object } from "@/lib/garden/protocol";
import { createOrder, fundingCalls, getCatalog, getOrder, getOrders, getQuote, requestRefund } from "@/lib/garden/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };
function reply(data: unknown) { return NextResponse.json(data, { headers }); }
function failure(error: unknown) {
  const known = error instanceof BridgeError;
  return NextResponse.json({ error: known ? error.message : "The Garden bridge request could not be completed.", code: known ? error.code : "BRIDGE_ERROR" }, { status: known ? error.status : 502, headers });
}
export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams;
    switch (query.get("action")) {
      case "catalog": return reply(await getCatalog());
      case "order": return reply(await getOrder(query.get("id"), query.get("owner")));
      case "history": return reply(await getOrders(query.get("owner")));
      default: throw new BridgeError("Unknown bridge request.");
    }
  } catch (error) { return failure(error); }
}
// Per-instance burst protection; never used as an authorization boundary.
const buckets = new Map<string, { count: number; reset: number }>();
export async function POST(request: NextRequest) {
  try {
    // NextURL normalizes loopback hosts; use the incoming Host so local development
    // and custom deployment domains match the browser's Origin exactly.
    let expectedOrigin = request.nextUrl.origin;
    try {
      const host = request.headers.get("host");
      if (host) expectedOrigin = new URL(`${request.nextUrl.protocol}//${host}`).origin;
    } catch { throw new BridgeError("Invalid CAREL request origin.", 403); }
    if (request.headers.get("origin") !== expectedOrigin) throw new BridgeError("Bridge requests must originate from CAREL.", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new BridgeError("Use a JSON bridge request.", 415);
    if (Number(request.headers.get("content-length") || 0) > 4096) throw new BridgeError("Request is too large.", 413);
    const raw = await request.text();
    if (raw.length > 4096) throw new BridgeError("Request is too large.", 413);
    let body: Record<string, unknown>;
    try { body = object(JSON.parse(raw)); } catch { throw new BridgeError("Invalid bridge request."); }
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const now = Date.now();
    for (const [key, item] of buckets) if (item.reset <= now) buckets.delete(key);
    const bucket = buckets.get(ip) || { count: 0, reset: now + 60_000 };
    if (bucket.count >= 30 || buckets.size >= 10_000) throw new BridgeError("Please wait a moment before trying again.", 429);
    bucket.count++; buckets.set(ip, bucket);
    switch (body.action) {
      case "quote": return reply(await getQuote(body));
      case "create": return reply(await createOrder(body));
      case "fund": return reply(await fundingCalls(body.id, body.owner));
      case "refund": return reply(await requestRefund(body.id, body.owner));
      default: throw new BridgeError("Unknown bridge request.");
    }
  } catch (error) { return failure(error); }
}
