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

import {
  getAgentFeeStore,
} from "@/lib/agent/server-fee-store";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";


function sameExecution(
  receipt:
    Readonly<{
      runId:
        string;

      planDigest:
        string;

      chainId:
        string;

      payer:
        string;
    }>,

  body:
    Readonly<{
      runId:
        string;

      planDigest:
        string;

      chainId:
        string;

      payer:
        string;
    }>,
): boolean {
  return (
    receipt.runId ===
      body.runId.trim() &&
    receipt.planDigest ===
      body.planDigest
        .trim()
        .toLowerCase() &&
    receipt.chainId ===
      body.chainId.trim() &&
    receipt.payer ===
      normalizeStarknetAddress(
        body.payer,
      )
  );
}


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
        "string"
    ) {
      throw new Error(
        "Agent fee resume requires runId, planDigest, chainId and payer.",
      );
    }


    const execution = {
      runId:
        body.runId,

      planDigest:
        body.planDigest,

      chainId:
        body.chainId,

      payer:
        body.payer,
    };


    const store =
      getAgentFeeStore();


    const durable =
      await store
        .loadSettlement(
          execution,
        );


    if (durable) {
      const receipt =
        verifySignedAgentFeeSettlementReceipt(
          durable
            .settlementReceipt,
        );


      if (
        !sameExecution(
          receipt,
          execution,
        )
      ) {
        throw new Error(
          "Durable Agent fee settlement belongs to another execution.",
        );
      }


      return NextResponse.json(
        {
          settled:
            true,

          runId:
            receipt.runId,

          settlementReceipt:
            durable
              .settlementReceipt,

          executionReference: {
            kind:
              "transaction",

            id:
              receipt
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
    }


    /*
     * Migration path for runs settled before the Redis deployment.
     *
     * A valid server-signed legacy receipt can seed the durable store once.
     */
    if (
      body.settlementReceipt &&
      typeof body.settlementReceipt ===
        "object" &&
      !Array.isArray(
        body.settlementReceipt,
      )
    ) {
      const signed =
        body.settlementReceipt as
          SignedAgentFeeSettlementReceipt;


      const receipt =
        verifySignedAgentFeeSettlementReceipt(
          signed,
        );


      if (
        !sameExecution(
          receipt,
          execution,
        )
      ) {
        throw new Error(
          "Agent fee settlement receipt belongs to another execution.",
        );
      }


      const migrated =
        await store
          .persistSettlement(
            signed,
          );


      return NextResponse.json(
        {
          settled:
            true,

          runId:
            receipt.runId,

          settlementReceipt:
            migrated
              .settlementReceipt,

          executionReference: {
            kind:
              "transaction",

            id:
              migrated
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
    }


    throw new Error(
      "CAREL has no durable settled Agent fee for this run.",
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
