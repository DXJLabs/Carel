import {
  NextResponse,
} from "next/server";

import {
  agentFeePolicyConfigured,
} from "@/lib/agent/server-fee";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";


export async function GET() {
  return NextResponse.json(
    {
      enabled:
        agentFeePolicyConfigured(),
    },
    {
      headers: {
        "Cache-Control":
          "no-store",

        "X-Content-Type-Options":
          "nosniff",
      },
    },
  );
}
