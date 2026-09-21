import {
  NextResponse,
} from "next/server";

import {
  createSignedAgentFeeQuote,
} from "@/lib/agent/server-fee";

import {
  getAgentFeeStore,
} from "@/lib/agent/server-fee-store";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";


export async function POST(
  request:
    Request,
) {
  try {
    const raw:
      unknown =
      await request.json();


    if (
      !raw ||
      typeof raw !==
        "object" ||
      Array.isArray(
        raw,
      )
    ) {
      throw new Error(
        "Invalid Agent fee quote request.",
      );
    }


    const body =
      raw as Record<
        string,
        unknown
      >;


    if (
      typeof body.runId !==
        "string" ||
      typeof body.planDigest !==
        "string" ||
      typeof body.chainId !==
        "string" ||
      typeof body.payer !==
        "string"
    ) {
      throw new Error(
        "Agent fee quote requires runId, planDigest, chainId and payer.",
      );
    }


    const signed =
      createSignedAgentFeeQuote({
        runId:
          body.runId,

        planDigest:
          body.planDigest,

        chainId:
          body.chainId,

        payer:
          body.payer,
      });


    /*
     * Redis is now the durable run-level idempotency boundary.
     * The quote does not leave CAREL until runId is atomically bound.
     */
    await getAgentFeeStore()
      .bindRun(
        signed.quote,
      );


    return NextResponse.json(
      signed,
      {
        headers: {
          "Cache-Control":
            "no-store",

          "X-Content-Type-Options":
            "nosniff",
        },
      },
    );
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : "Could not prepare CAREL Agent fee.";


    const unavailable =
      /not configured|signing secret|recipient|fee amount|redis store/i.test(
        message,
      );


    return NextResponse.json(
      {
        code:
          unavailable
            ? "AGENT_FEE_NOT_CONFIGURED"
            : "AGENT_FEE_QUOTE_REJECTED",

        error:
          message,
      },
      {
        status:
          unavailable
            ? 503
            : 400,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }
}
