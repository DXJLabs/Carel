import {
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  findCarelAssetBySymbol,
} from "@/lib/carel/assets";

import type {
  VesuBorrowExecutionPayload,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/borrow";

import type {
  AgentPlan,
} from "@/lib/agent/plan";

import {
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
  type AgentVerifiedStageOutput,
} from "@/lib/agent/executor";


export type AgentWalletTransactionResult =
  Readonly<{
    hash: string;

    status:
      | "submitted"
      | "confirmed";
  }>;


export type PrepareAgentBorrowInput =
  Readonly<{
    executionKey: string;

    owner: string;

    collateralAssetId:
      string;

    debtAssetId:
      string;

    collateralAmountText:
      string;

    borrowAmountText:
      string;

    signal?:
      AbortSignal;
  }>;


export type PreparedAgentBorrow =
  Readonly<{
    execution:
      VesuBorrowExecutionPayload;

    label:
      string;
  }>;


export type ReadAgentPublicBalanceInput =
  Readonly<{
    chainId: string;

    account: string;

    assetId: string;

    signal?:
      AbortSignal;
  }>;


export type WaitAgentTransactionInput =
  Readonly<{
    chainId: string;

    transactionId: string;

    signal?:
      AbortSignal;
  }>;


export type StarknetBorrowShieldDependencies =
  Readonly<{
    prepareBorrow(
      input:
        PrepareAgentBorrowInput,
    ):
      Promise<PreparedAgentBorrow>;

    executeBorrow(
      execution:
        VesuBorrowExecutionPayload,
      label:
        string,
    ):
      Promise<AgentWalletTransactionResult>;

    executeShieldAsset(
      assetId: string,
      amountText: string,
      label: string,
    ):
      Promise<AgentWalletTransactionResult>;

    readPublicBalance(
      input:
        ReadAgentPublicBalanceInput,
    ):
      Promise<bigint>;

    waitForTransaction(
      input:
        WaitAgentTransactionInput,
    ):
      Promise<void>;
  }>;


type BorrowSnapshot =
  Readonly<{
    executionKey: string;

    transactionId: string;

    chainId: string;

    account: string;

    assetId: string;

    assetSymbol: string;

    amountText: string;

    amountUnits: bigint;

    publicBefore: bigint;
  }>;


export type StarknetBorrowShieldRuntime =
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
      Promise<AgentExecutionSession>;
  }>;


function exactAmountText(
  amount:
    bigint,
  decimals:
    number,
): string {
  if (
    amount < 0n
  ) {
    throw new Error(
      "Agent amount cannot be negative.",
    );
  }

  if (
    decimals === 0
  ) {
    return amount.toString();
  }

  const digits =
    amount
      .toString()
      .padStart(
        decimals + 1,
        "0",
      );

  const whole =
    digits.slice(
      0,
      -decimals,
    );

  const fraction =
    digits
      .slice(
        -decimals,
      )
      .replace(
        /0+$/,
        "",
      );

  return fraction
    ? `${whole}.${fraction}`
    : whole;
}


function requireTransactionHash(
  hash:
    string,
): string {
  if (
    !/^0x[0-9a-f]{1,64}$/i.test(
      hash,
    )
  ) {
    throw new Error(
      "Live Agent executor received an invalid transaction hash.",
    );
  }

  return hash;
}


function borrowSnapshotKey(
  executionKey:
    string,
  transactionId:
    string,
): string {
  return `${executionKey}:${transactionId}`;
}


function stageExecutionKey(
  runId:
    string,
  stageId:
    string,
): string {
  return `${runId}:${stageId}`;
}


function requireBorrowInput(
  input:
    AgentStageExecutionInput,
) {
  if (
    input.stage.action !==
      "borrow"
  ) {
    throw new Error(
      "Vesu Agent executor only accepts Borrow stages.",
    );
  }

  const collateral =
    input.stage.collateral;

  const collateralSymbol =
    collateral?.symbol;

  const debtSymbol =
    input.stage
      .outputAssetSymbol;

  const borrowAmountText =
    input.resolvedAmountText;

  if (
    !collateral ||
    !collateralSymbol ||
    !debtSymbol ||
    !borrowAmountText
  ) {
    throw new Error(
      "Borrow stage is missing reviewed execution data.",
    );
  }

  const collateralAsset =
    findCarelAssetBySymbol(
      input.context.chainId,
      collateralSymbol,
    );

  const debtAsset =
    findCarelAssetBySymbol(
      input.context.chainId,
      debtSymbol,
    );

  if (
    !collateralAsset ||
    !debtAsset
  ) {
    throw new Error(
      "Borrow stage references an unregistered CAREL asset.",
    );
  }

  const collateralUnits =
    parseUnits(
      collateral.amountText,
      collateralAsset.decimals,
    );

  const borrowUnits =
    parseUnits(
      borrowAmountText,
      debtAsset.decimals,
    );

  if (
    collateralUnits <= 0n ||
    borrowUnits <= 0n
  ) {
    throw new Error(
      "Borrow amounts must be greater than zero.",
    );
  }

  return {
    collateral,
    collateralAsset,
    debtAsset,
    borrowAmountText,
    collateralUnits,
    borrowUnits,
  };
}


export function createStarknetBorrowShieldRuntime(
  dependencies:
    StarknetBorrowShieldDependencies,
): StarknetBorrowShieldRuntime {
  const snapshots =
    new Map<
      string,
      BorrowSnapshot
    >();


  async function verifyBorrowOutput(
    snapshot:
      BorrowSnapshot,
    signal?:
      AbortSignal,
  ):
    Promise<AgentVerifiedStageOutput> {
    const current =
      await dependencies
        .readPublicBalance({
          chainId:
            snapshot.chainId,

          account:
            snapshot.account,

          assetId:
            snapshot.assetId,

          ...(signal
            ? {
                signal,
              }
            : {}),
        });

    const minimum =
      snapshot.publicBefore +
      snapshot.amountUnits;

    if (
      current <
      minimum
    ) {
      throw new Error(
        `Confirmed Borrow output is not visible in public ${snapshot.assetSymbol} balance yet.`,
      );
    }

    return {
      assetSymbol:
        snapshot.assetSymbol,

      amountText:
        snapshot.amountText,

      amountUnits:
        snapshot
          .amountUnits
          .toString(),
    };
  }


  const borrowExecutor:
    AgentStageExecutor = {
    id:
      "starknet:vesu:agent-borrow",

    actions:
      ["borrow"],

    supports(
      input,
    ) {
      return (
        input.stage.action ===
          "borrow" &&
        input.stage
          .sourceChainId ===
          input.context.chainId &&
        Boolean(
          input.stage.collateral &&
          input.stage
            .outputAssetSymbol &&
          input.resolvedAmountText,
        )
      );
    },

    async execute(
      input,
    ):
      Promise<AgentStageExecutionReceipt> {
      const {
        collateral,
        collateralAsset,
        debtAsset,
        borrowAmountText,
        collateralUnits,
        borrowUnits,
      } =
        requireBorrowInput(
          input,
        );

      const prepared =
        await dependencies
          .prepareBorrow({
            executionKey:
              input.executionKey,

            owner:
              input.context.account,

            collateralAssetId:
              collateralAsset.id,

            debtAssetId:
              debtAsset.id,

            collateralAmountText:
              collateral.amountText,

            borrowAmountText,

            ...(input.context.signal
              ? {
                  signal:
                    input.context
                      .signal,
                }
              : {}),
          });

      const execution =
        prepared.execution;

      if (
        execution.chainId !==
          input.context.chainId
      ) {
        throw new Error(
          "Prepared Vesu Borrow belongs to another network.",
        );
      }

      if (
        execution.collateralAssetId !==
          collateralAsset.id ||
        execution.debtAssetId !==
          debtAsset.id
      ) {
        throw new Error(
          "Prepared Vesu Borrow asset pair does not match the Agent stage.",
        );
      }

      let preparedCollateral:
        bigint;

      let preparedBorrow:
        bigint;

      try {
        preparedCollateral =
          BigInt(
            execution
              .collateralAmount,
          );

        preparedBorrow =
          BigInt(
            execution
              .borrowAmount,
          );
      } catch {
        throw new Error(
          "Prepared Vesu Borrow contains invalid amounts.",
        );
      }

      if (
        preparedCollateral !==
          collateralUnits ||
        preparedBorrow !==
          borrowUnits
      ) {
        throw new Error(
          "Prepared Vesu Borrow amount does not match the reviewed Agent stage.",
        );
      }

      const publicBefore =
        await dependencies
          .readPublicBalance({
            chainId:
              input.context.chainId,

            account:
              input.context.account,

            assetId:
              debtAsset.id,

            ...(input.context.signal
              ? {
                  signal:
                    input.context
                      .signal,
                }
              : {}),
          });

      const transaction =
        await dependencies
          .executeBorrow(
            execution,
            prepared.label,
          );

      const transactionId =
        requireTransactionHash(
          transaction.hash,
        );

      const snapshot:
        BorrowSnapshot = {
        executionKey:
          input.executionKey,

        transactionId,

        chainId:
          input.context.chainId,

        account:
          input.context.account,

        assetId:
          debtAsset.id,

        assetSymbol:
          debtAsset.symbol,

        amountText:
          exactAmountText(
            preparedBorrow,
            debtAsset.decimals,
          ),

        amountUnits:
          preparedBorrow,

        publicBefore,
      };

      snapshots.set(
        borrowSnapshotKey(
          input.executionKey,
          transactionId,
        ),
        snapshot,
      );

      if (
        transaction.status ===
          "confirmed"
      ) {
        const output =
          await verifyBorrowOutput(
            snapshot,
            input.context.signal,
          );

        snapshots.delete(
          borrowSnapshotKey(
            input.executionKey,
            transactionId,
          ),
        );

        return {
          transactionId,

          status:
            "confirmed",

          output,
        };
      }

      return {
        transactionId,

        status:
          "submitted",
      };
    },
  };


  const shieldExecutor:
    AgentStageExecutor = {
    id:
      "starknet:strk20:agent-shield",

    actions:
      ["shield"],

    supports(
      input,
    ) {
      return (
        input.stage.action ===
          "shield" &&
        input.stage
          .sourceChainId ===
          input.context.chainId &&
        input.stage
          .privacyBefore ===
          "public" &&
        input.stage
          .privacyAfter ===
          "private" &&
        Boolean(
          input.stage
            .inputAssetSymbol &&
          input.resolvedAmountText,
        )
      );
    },

    async execute(
      input,
    ):
      Promise<AgentStageExecutionReceipt> {
      const symbol =
        input.stage
          .inputAssetSymbol;

      const amountText =
        input.resolvedAmountText;

      if (
        !symbol ||
        !amountText
      ) {
        throw new Error(
          "Shield stage requires a verified public asset amount.",
        );
      }

      const asset =
        findCarelAssetBySymbol(
          input.context.chainId,
          symbol,
        );

      if (!asset) {
        throw new Error(
          `CAREL does not recognize ${symbol} on this Starknet network.`,
        );
      }

      const amountUnits =
        parseUnits(
          amountText,
          asset.decimals,
        );

      if (
        amountUnits <= 0n
      ) {
        throw new Error(
          "Shield amount must be greater than zero.",
        );
      }

      const result =
        await dependencies
          .executeShieldAsset(
            asset.id,

            amountText,

            `Shield borrowed ${amountText} ${asset.symbol}`,
          );

      return {
        transactionId:
          requireTransactionHash(
            result.hash,
          ),

        status:
          result.status,
      };
    },
  };


  const registry =
    createAgentStageExecutorRegistry(
      [
        borrowExecutor,
        shieldExecutor,
      ],
    );


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
    Promise<AgentExecutionSession> {
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
        "submitted" ||
      !runtimeStage.txHash
    ) {
      throw new Error(
        `Agent stage ${stageId} is not awaiting confirmation.`,
      );
    }

    const planStage =
      plan.stages.find(
        (stage) =>
          stage.id ===
            stageId,
      );

    if (!planStage) {
      throw new Error(
        `Unknown Agent stage: ${stageId}.`,
      );
    }

    await dependencies
      .waitForTransaction({
        chainId:
          context.chainId,

        transactionId:
          runtimeStage.txHash,

        ...(context.signal
          ? {
              signal:
                context.signal,
            }
          : {}),
      });

    if (
      planStage.action !==
        "borrow"
    ) {
      return confirmAgentStageExecution(
        plan,
        session,
        stageId,
      );
    }

    const executionKey =
      stageExecutionKey(
        session.runId,
        stageId,
      );

    const key =
      borrowSnapshotKey(
        executionKey,
        runtimeStage.txHash,
      );

    const snapshot =
      snapshots.get(
        key,
      );

    if (!snapshot) {
      throw new Error(
        "CAREL cannot verify this Borrow because its execution snapshot is unavailable.",
      );
    }

    const output =
      await verifyBorrowOutput(
        snapshot,
        context.signal,
      );

    const next =
      confirmAgentStageExecution(
        plan,
        session,
        stageId,
        output,
      );

    snapshots.delete(
      key,
    );

    return next;
  }


  return {
    registry,
    confirmSubmittedStage,
  };
}
