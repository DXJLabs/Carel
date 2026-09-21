import type {
  AgentPlan,
} from "@/lib/agent/plan";

import {
  failAgentStage,
  getAgentRuntimeStage,
} from "@/lib/agent/state-machine";

import {
  confirmAgentStageExecution,
  createAgentStageExecutorRegistry,
  type AgentExecutionSession,
  type AgentStageExecutionContext,
  type AgentStageExecutionInput,
  type AgentStageExecutionReceipt,
  type AgentStageExecutor,
  type AgentStageExecutorRegistry,
} from "@/lib/agent/executor";


export type GardenBridgeProviderState =
  | "awaiting-deposit"
  | "confirming"
  | "exchanging"
  | "settling"
  | "completed"
  | "expired"
  | "refunding"
  | "refunded";


export type CreateGardenAgentOrderInput =
  Readonly<{
    executionKey:
      string;

    connectedChainId:
      string;

    account:
      string;

    sourceChainId:
      string;

    destinationChainId:
      string;

    sourceAssetSymbol:
      string;

    destinationAssetSymbol:
      string;

    amountText:
      string;

    signal?:
      AbortSignal;
  }>;


export type GardenAgentOrderObservation =
  Readonly<{
    state:
      GardenBridgeProviderState;

    destinationAssetSymbol?:
      string;

    destinationAmountText?:
      string;
  }>;


export type GardenBridgeRuntimeDependencies =
  Readonly<{
    createOrder(
      input:
        CreateGardenAgentOrderInput,
    ):
      Promise<
        Readonly<{
          orderId:
            string;
        }>
      >;

    readOrder(
      input:
        Readonly<{
          orderId:
            string;

          account:
            string;

          signal?:
            AbortSignal;
        }>,
    ):
      Promise<
        GardenAgentOrderObservation
      >;
  }>;


export type GardenBridgeAgentRuntime =
  Readonly<{
    registry:
      AgentStageExecutorRegistry;

    confirmSubmittedStage(
      plan:
        AgentPlan,

      session:
        AgentExecutionSession,

      stageId:
        string,

      context:
        AgentStageExecutionContext,
    ):
      Promise<
        AgentExecutionSession
      >;
  }>;


function positiveAmountText(
  value: string,
): boolean {
  const normalized =
    value.trim();

  return (
    /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(
      normalized,
    ) &&
    /[1-9]/.test(
      normalized,
    )
  );
}


function requireGardenOrderId(
  value: string,
): string {
  const id =
    value
      .trim()
      .toLowerCase();

  if (
    !/^[0-9a-f]{64}$/.test(
      id,
    )
  ) {
    throw new Error(
      "Garden returned an invalid bridge order id.",
    );
  }

  return id;
}


function requireBridgeInput(
  input:
    AgentStageExecutionInput,
) {
  if (
    input.stage.action !==
      "bridge"
  ) {
    throw new Error(
      "Garden Agent executor only accepts Bridge stages.",
    );
  }

  const destinationChainId =
    input.stage
      .destinationChainId;

  const sourceSymbol =
    input.stage
      .inputAssetSymbol;

  const destinationSymbol =
    input.stage
      .outputAssetSymbol;

  const amountText =
    input.resolvedAmountText;

  if (
    !destinationChainId ||
    !sourceSymbol ||
    !destinationSymbol ||
    !amountText ||
    !positiveAmountText(
      amountText,
    )
  ) {
    throw new Error(
      "Bridge stage is missing reviewed cross-chain execution data.",
    );
  }

  if (
    input.stage
      .sourceChainId ===
      destinationChainId
  ) {
    throw new Error(
      "Bridge source and destination chains must be different.",
    );
  }

  if (
    input.stage
      .privacyBefore !==
      "public" ||
    input.stage
      .privacyAfter !==
      "public"
  ) {
    throw new Error(
      "Garden Agent runtime currently accepts public Bridge stages only.",
    );
  }

  return {
    destinationChainId,
    sourceSymbol,
    destinationSymbol,
    amountText,
  };
}


export function createGardenBridgeAgentRuntime(
  dependencies:
    GardenBridgeRuntimeDependencies,
): GardenBridgeAgentRuntime {
  const bridgeExecutor:
    AgentStageExecutor = {
    id:
      "crosschain:garden:agent-bridge",

    actions:
      ["bridge"],

    supports(
      input,
    ) {
      const destination =
        input.stage
          .destinationChainId;

      return (
        input.stage.action ===
          "bridge" &&
        Boolean(
          destination &&
          input.stage
            .inputAssetSymbol &&
          input.stage
            .outputAssetSymbol &&
          input.resolvedAmountText,
        ) &&
        (
          input.context.chainId ===
            input.stage
              .sourceChainId ||
          input.context.chainId ===
            destination
        )
      );
    },

    async execute(
      input,
    ):
      Promise<
        AgentStageExecutionReceipt
      > {
      const {
        destinationChainId,
        sourceSymbol,
        destinationSymbol,
        amountText,
      } =
        requireBridgeInput(
          input,
        );

      const created =
        await dependencies
          .createOrder({
            executionKey:
              input.executionKey,

            connectedChainId:
              input.context
                .chainId,

            account:
              input.context
                .account,

            sourceChainId:
              input.stage
                .sourceChainId,

            destinationChainId,

            sourceAssetSymbol:
              sourceSymbol,

            destinationAssetSymbol:
              destinationSymbol,

            amountText,

            ...(input.context
              .signal
              ? {
                  signal:
                    input.context
                      .signal,
                }
              : {}),
          });

      return {
        executionReference: {
          kind:
            "provider-order",

          id:
            requireGardenOrderId(
              created.orderId,
            ),
        },

        status:
          "submitted",
      };
    },
  };


  const registry =
    createAgentStageExecutorRegistry([
      bridgeExecutor,
    ]);


  async function confirmSubmittedStage(
    plan:
      AgentPlan,

    session:
      AgentExecutionSession,

    stageId:
      string,

    context:
      AgentStageExecutionContext,
  ):
    Promise<
      AgentExecutionSession
    > {
    if (
      context.runId !==
        session.runId
    ) {
      throw new Error(
        "Agent execution context belongs to another run.",
      );
    }

    const runtimeStage =
      getAgentRuntimeStage(
        session.run,
        stageId,
      );

    if (
      runtimeStage.status !==
        "submitted"
    ) {
      throw new Error(
        `Agent stage ${stageId} is not awaiting Garden settlement.`,
      );
    }

    const reference =
      runtimeStage
        .executionReference;

    if (
      !reference ||
      reference.kind !==
        "provider-order"
    ) {
      throw new Error(
        "Garden Bridge stage has no provider order reference.",
      );
    }

    const planStage =
      plan.stages.find(
        (stage) =>
          stage.id ===
            stageId,
      );

    if (
      !planStage ||
      planStage.action !==
        "bridge"
    ) {
      throw new Error(
        `Unknown Garden Bridge stage: ${stageId}.`,
      );
    }

    const observation =
      await dependencies
        .readOrder({
          orderId:
            reference.id,

          account:
            context.account,

          ...(context.signal
            ? {
                signal:
                  context.signal,
              }
            : {}),
        });

    if (
      observation.state ===
        "expired" ||
      observation.state ===
        "refunded"
    ) {
      return {
        ...session,

        run:
          failAgentStage(
            plan,
            session.run,
            stageId,
            observation.state ===
              "expired"
              ? "Garden Bridge order expired before destination delivery."
              : "Garden Bridge was refunded instead of delivered.",
          ),
      };
    }

    if (
      observation.state !==
        "completed"
    ) {
      throw new Error(
        `Garden Bridge is still ${observation.state}. Destination delivery is not confirmed yet.`,
      );
    }

    const assetSymbol =
      observation
        .destinationAssetSymbol
        ?.trim();

    const amountText =
      observation
        .destinationAmountText
        ?.trim();

    if (
      !assetSymbol ||
      !amountText ||
      !positiveAmountText(
        amountText,
      )
    ) {
      throw new Error(
        "Completed Garden order is missing a verified destination output.",
      );
    }

    return confirmAgentStageExecution(
      plan,
      session,
      stageId,
      {
        assetSymbol,
        amountText,
      },
    );
  }


  return {
    registry,
    confirmSubmittedStage,
  };
}
