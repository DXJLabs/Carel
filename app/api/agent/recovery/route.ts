import {
  NextResponse,
} from "next/server";

import {
  agentRecoveryPolicyConfigured,
  bindAgentRecoveryTransaction,
  sealAgentRecoveryDraft,
  verifyAgentRecoveryCapsule,
} from "@/lib/agent/server-recovery";

import type {
  AgentRecoveryKind,
  SignedAgentRecoveryCapsule,
  SignedAgentRecoveryDraft,
} from "@/lib/agent/recovery-types";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";


export async function GET() {
  return NextResponse.json(
    {
      enabled:
        agentRecoveryPolicyConfigured(),
    },
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}


function object(
  value:
    unknown,
): Record<
  string,
  unknown
> {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new Error(
      "Invalid Agent recovery request.",
    );
  }


  return value as Record<
    string,
    unknown
  >;
}


export async function POST(
  request:
    Request,
) {
  try {
    const body =
      object(
        await request.json(),
      );


    if (
      body.action ===
        "seal"
    ) {
      const input =
        object(
          body.snapshot,
        );


      const draft =
        sealAgentRecoveryDraft({
          kind:
            input.kind as
              AgentRecoveryKind,

          runId:
            String(
              input.runId ??
              "",
            ),

          stageId:
            String(
              input.stageId ??
              "",
            ),

          executionKey:
            String(
              input.executionKey ??
              "",
            ),

          chainId:
            String(
              input.chainId ??
              "",
            ),

          account:
            String(
              input.account ??
              "",
            ),

          data:
            object(
              input.data,
            ) as
              Record<
                string,
                string
              >,
        });


      return NextResponse.json(
        {
          draft,
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }


    if (
      body.action ===
        "bind"
    ) {
      const capsule =
        bindAgentRecoveryTransaction({
          draft:
            body.draft as
              SignedAgentRecoveryDraft,

          transactionId:
            String(
              body.transactionId ??
              "",
            ),
        });


      return NextResponse.json(
        {
          capsule,
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }


    if (
      body.action ===
        "verify"
    ) {
      const payload =
        verifyAgentRecoveryCapsule(
          body.capsule as
            SignedAgentRecoveryCapsule,
        );


      return NextResponse.json(
        {
          payload,
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }


    throw new Error(
      "Unknown Agent recovery action.",
    );
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : "Agent recovery request failed.";


    return NextResponse.json(
      {
        error:
          message,
      },
      {
        status:
          /not configured/i.test(
            message,
          )
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
