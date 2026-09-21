import {
  NextResponse,
} from "next/server";

import {
  normalizeStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";

import {
  verifySignedAgentFeeSettlementReceipt,
  type SignedAgentFeeSettlementReceipt,
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
        "Invalid Agent fee resume request.",
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
        "string" ||
      !body.settlementReceipt ||
      typeof body.settlementReceipt !==
        "object"
    ) {
      throw new Error(
        "Agent fee resume requires runId, planDigest, chainId, payer and settlementReceipt.",
      );
    }


    const receipt =
      verifySignedAgentFeeSettlementReceipt(
        body.settlementReceipt as
          SignedAgentFeeSettlementReceipt,
      );


    if (
      receipt.runId !==
        body.runId.trim() ||
      receipt.planDigest !==
        body.planDigest
          .trim()
          .toLowerCase() ||
      receipt.chainId !==
        body.chainId.trim() ||
      receipt.payer !==
        normalizeStarknetAddress(
          body.payer,
        )
    ) {
      throw new Error(
        "Agent fee settlement receipt belongs to another execution.",
      );
    }


    return NextResponse.json(
      {
        settled:
          true,

        runId:
          receipt.runId,

        executionReference: {
          kind:
            "transaction",

          id:
            receipt.transactionHash,
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
            : "Could not restore CAREL Agent fee authorization.",
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
