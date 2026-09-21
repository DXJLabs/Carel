import {
  NextResponse,
} from "next/server";

import {
  createSignedAgentFeeSettlementReceipt,
  verifyAgentFeeSettlement,
  type SignedAgentFeeQuote,
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


    const quote =
      await verifyAgentFeeSettlement({
        signedQuote:
          body.signedQuote as
            SignedAgentFeeQuote,

        transactionHash:
          body.transactionHash,
      });


    const settlementReceipt =
      createSignedAgentFeeSettlementReceipt({
        quote,

        transactionHash:
          body.transactionHash,
      });


    /*
     * SET NX makes the first verified fee transaction canonical.
     *
     * Retrying the same transaction is idempotent.
     * A different transaction for the same run is rejected.
     */
    const durable =
      await getAgentFeeStore()
        .persistSettlement(
          settlementReceipt,
        );


    return NextResponse.json(
      {
        settled:
          true,

        settlementReceipt:
          durable
            .settlementReceipt,

        executionReference: {
          kind:
            "transaction",

          id:
            durable
              .transactionHash,
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
