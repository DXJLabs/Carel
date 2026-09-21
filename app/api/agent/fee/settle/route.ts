import {
  NextResponse,
} from "next/server";

import {
  verifyAgentFeeSettlement,
  type SignedAgentFeeQuote,
} from "@/lib/agent/server-fee";


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
        "Invalid Agent fee settlement request.",
      );
    }


    const body =
      raw as Record<
        string,
        unknown
      >;


    if (
      !body.signedQuote ||
      typeof body.signedQuote !==
        "object" ||
      Array.isArray(
        body.signedQuote,
      ) ||
      typeof body.transactionHash !==
        "string"
    ) {
      throw new Error(
        "Agent fee settlement requires signedQuote and transactionHash.",
      );
    }


    await verifyAgentFeeSettlement({
      signedQuote:
        body.signedQuote as
          SignedAgentFeeQuote,

      transactionHash:
        body.transactionHash,
    });


    return NextResponse.json(
      {
        settled:
          true,

        executionReference: {
          kind:
            "transaction",

          id:
            body.transactionHash,
        },
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
  } catch (cause) {
    return NextResponse.json(
      {
        settled:
          false,

        error:
          cause instanceof Error
            ? cause.message
            : "Could not verify CAREL Agent fee settlement.",
      },
      {
        status:
          400,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }
}
