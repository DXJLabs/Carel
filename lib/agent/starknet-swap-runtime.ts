import {
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  findCarelAssetBySymbol,
} from "@/lib/carel/assets";

import type {
  AgentPlan,
} from "@/lib/agent/plan";

import type {
  AgentRecoveryBoundPayload,
  AgentRecoveryData,
} from "@/lib/agent/recovery-types";

import type {
  AgentRuntimeRecovery,
} from "@/lib/agent/runtime-recovery";

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


export type PrepareAgentSwapInput =
  Readonly<{
    executionKey: string;

    chainId: string;

    owner: string;

    fromAssetId: string;

    toAssetId: string;

    amountText: string;

    signal?:
      AbortSignal;
  }>;


export type PreparedAgentSwap =
  Readonly<{
    label: string;

    outputAssetId:
      string;

    outputAssetSymbol:
      string;

    outputDecimals:
      number;

    /**
     * Fresh quote slippage floor.
     *
     * This is only a verification minimum.
     * The confirmed output stored in Agent session is the observed
     * public balance delta, not this estimate.
     */
    minimumOutputUnits:
      bigint;

    execute():
      Promise<
        AgentWalletTransactionResult
      >;
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

    transactionId:
      string;

    signal?:
      AbortSignal;
  }>;


export type StarknetSwapRuntimeDependencies =
  Readonly<{
    prepareSwap(
      input:
        PrepareAgentSwapInput,
    ):
      Promise<
        PreparedAgentSwap
      >;

    executeShieldAsset(
      assetId: string,
      amountText: string,
      label: string,
    ):
      Promise<
        AgentWalletTransactionResult
      >;

    executeUnshieldAsset(
      assetId: string,
      amountText: string,
      label: string,
    ):
      Promise<
        AgentWalletTransactionResult
      >;

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

    recovery?:
      AgentRuntimeRecovery;
  }>;


type PublicOutputSnapshot =
  Readonly<{
    executionKey: string;

    transactionId: string;

    chainId: string;

    account: string;

    assetId: string;

    assetSymbol: string;

    decimals: number;

    publicBefore: bigint;

    minimumIncreaseUnits:
      bigint;

    /**
     * Unshield has an exact known output amount.
     * Swap deliberately leaves this undefined because its authoritative
     * result is the observed post-confirmation balance delta.
     */
    exactOutputUnits?:
      bigint;

    actionLabel:
      | "Swap"
      | "Unshield";
  }>;


export type StarknetSwapRuntime =
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


function exactAmountText(
  amount: bigint,
  decimals: number,
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
  hash: string,
): string {
  if (
    !/^0x[0-9a-f]{1,64}$/i.test(
      hash,
    )
  ) {
    throw new Error(
      "Live Swap Agent executor received an invalid transaction hash.",
    );
  }

  return hash;
}


function snapshotKey(
  executionKey: string,
  transactionId: string,
): string {
  return `${executionKey}:${transactionId}`;
}


function stageExecutionKey(
  runId: string,
  stageId: string,
): string {
  return `${runId}:${stageId}`;
}


function requireSwapInput(
  input:
    AgentStageExecutionInput,
) {
  if (
    input.stage.action !==
      "swap"
  ) {
    throw new Error(
      "Swap Agent executor only accepts Swap stages.",
    );
  }

  const fromSymbol =
    input.stage
      .inputAssetSymbol;

  const toSymbol =
    input.stage
      .outputAssetSymbol;

  const amountText =
    input.resolvedAmountText;

  if (
    !fromSymbol ||
    !toSymbol ||
    !amountText
  ) {
    throw new Error(
      "Swap stage is missing reviewed execution data.",
    );
  }

  const fromAsset =
    findCarelAssetBySymbol(
      input.context.chainId,
      fromSymbol,
    );

  const toAsset =
    findCarelAssetBySymbol(
      input.context.chainId,
      toSymbol,
    );

  if (
    !fromAsset ||
    !toAsset
  ) {
    throw new Error(
      "Swap stage references an unregistered CAREL asset.",
    );
  }

  if (
    fromAsset.id ===
      toAsset.id
  ) {
    throw new Error(
      "Swap assets must be different.",
    );
  }

  const amountUnits =
    parseUnits(
      amountText,
      fromAsset.decimals,
    );

  if (
    amountUnits <= 0n
  ) {
    throw new Error(
      "Swap amount must be greater than zero.",
    );
  }

  return {
    fromAsset,
    toAsset,
    amountText,
    amountUnits,
  };
}


function recoveryBigInt(
  data:
    AgentRecoveryData,

  key:
    string,

  positive =
    false,
): bigint {
  const raw =
    data[key];


  if (
    typeof raw !==
      "string" ||
    !/^\d+$/.test(
      raw,
    )
  ) {
    throw new Error(
      `Recovered Swap snapshot contains invalid ${key}.`,
    );
  }


  const value =
    BigInt(
      raw,
    );


  if (
    positive &&
    value <= 0n
  ) {
    throw new Error(
      `Recovered Swap snapshot contains invalid ${key}.`,
    );
  }


  return value;
}


function recoveredPublicOutputSnapshot(
  payload:
    AgentRecoveryBoundPayload,

  expectedAction:
    "swap" |
    "unshield",
): PublicOutputSnapshot {
  const data =
    payload.data;


  if (
    data.action !==
      expectedAction ||
    !data.assetId ||
    !data.assetSymbol
  ) {
    throw new Error(
      "Recovered Swap snapshot does not match the submitted Agent stage.",
    );
  }


  const decimals =
    Number(
      data.decimals,
    );


  if (
    !Number.isInteger(
      decimals,
    ) ||
    decimals < 0 ||
    decimals > 255
  ) {
    throw new Error(
      "Recovered Swap snapshot contains invalid asset decimals.",
    );
  }


  const minimumIncreaseUnits =
    recoveryBigInt(
      data,
      "minimumIncreaseUnits",
      true,
    );


  const publicBefore =
    recoveryBigInt(
      data,
      "publicBefore",
    );


  const exactOutputUnits =
    expectedAction ===
      "unshield"
      ? recoveryBigInt(
          data,
          "exactOutputUnits",
          true,
        )
      : undefined;


  return {
    executionKey:
      payload.executionKey,

    transactionId:
      payload.transactionId,

    chainId:
      payload.chainId,

    account:
      payload.account,

    assetId:
      data.assetId,

    assetSymbol:
      data.assetSymbol,

    decimals,

    publicBefore,

    minimumIncreaseUnits,

    ...(exactOutputUnits !==
      undefined
      ? {
          exactOutputUnits,
        }
      : {}),

    actionLabel:
      expectedAction ===
        "swap"
        ? "Swap"
        : "Unshield",
  };
}


export function createStarknetSwapRuntime(
  dependencies:
    StarknetSwapRuntimeDependencies,
): StarknetSwapRuntime {
  const snapshots =
    new Map<
      string,
      PublicOutputSnapshot
    >();


  async function sealRecovery(
    input:
      AgentStageExecutionInput,

    data:
      AgentRecoveryData,
  ) {
    if (
      !dependencies.recovery
    ) {
      return null;
    }


    try {
      return await dependencies
        .recovery
        .seal({
          runId:
            input.context.runId,

          stageId:
            input.stage.id,

          executionKey:
            input.executionKey,

          chainId:
            input.context.chainId,

          account:
            input.context.account,

          data,
        });
    } catch {
      /*
       * Recovery availability must never prevent the protocol transaction.
       */
      return null;
    }
  }


  async function bindRecovery(
    draft:
      Awaited<
        ReturnType<
          NonNullable<
            StarknetSwapRuntimeDependencies[
              "recovery"
            ]
          >["seal"]
        >
      >,

    transactionId:
      string,
  ) {
    if (
      !draft ||
      !dependencies.recovery
    ) {
      return;
    }


    try {
      await dependencies
        .recovery
        .bind(
          draft,
          transactionId,
        );
    } catch {
      /*
       * Transaction already exists. A persistence failure must never invite
       * the user to submit the Swap again.
       */
    }
  }



  async function verifyPublicOutput(
    snapshot:
      PublicOutputSnapshot,

    signal?:
      AbortSignal,
  ):
    Promise<
      AgentVerifiedStageOutput
    > {
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

    const increase =
      current -
      snapshot.publicBefore;

    if (
      increase <
        snapshot
          .minimumIncreaseUnits
    ) {
      throw new Error(
        `Confirmed ${snapshot.actionLabel} output is not visible in public ${snapshot.assetSymbol} balance yet.`,
      );
    }

    const outputUnits =
      snapshot
        .exactOutputUnits ??
      increase;

    if (
      outputUnits <= 0n
    ) {
      throw new Error(
        `Confirmed ${snapshot.actionLabel} produced no verifiable ${snapshot.assetSymbol} output.`,
      );
    }

    return {
      assetSymbol:
        snapshot.assetSymbol,

      amountText:
        exactAmountText(
          outputUnits,
          snapshot.decimals,
        ),

      amountUnits:
        outputUnits.toString(),
    };
  }


  const swapExecutor:
    AgentStageExecutor = {
    id:
      "starknet:avnu:agent-swap",

    actions:
      ["swap"],

    supports(
      input,
    ) {
      return (
        input.stage.action ===
          "swap" &&
        input.stage
          .sourceChainId ===
          input.context.chainId &&
        input.stage
          .privacyBefore ===
          "public" &&
        input.stage
          .privacyAfter ===
          "public" &&
        Boolean(
          input.stage
            .inputAssetSymbol &&
          input.stage
            .outputAssetSymbol &&
          input.resolvedAmountText,
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
        fromAsset,
        toAsset,
        amountText,
      } =
        requireSwapInput(
          input,
        );

      /*
       * AVNU quote preparation happens here, immediately before signing.
       * No quote/calldata is stored in the initial Agent plan.
       */
      const prepared =
        await dependencies
          .prepareSwap({
            executionKey:
              input.executionKey,

            chainId:
              input.context.chainId,

            owner:
              input.context.account,

            fromAssetId:
              fromAsset.id,

            toAssetId:
              toAsset.id,

            amountText,

            ...(input.context.signal
              ? {
                  signal:
                    input.context
                      .signal,
                }
              : {}),
          });

      if (
        prepared.outputAssetId !==
          toAsset.id ||
        prepared.outputAssetSymbol
          .trim()
          .toUpperCase() !==
          toAsset.symbol
            .trim()
            .toUpperCase() ||
        prepared.outputDecimals !==
          toAsset.decimals
      ) {
        throw new Error(
          "Prepared AVNU Swap output does not match the Agent stage.",
        );
      }

      if (
        prepared
          .minimumOutputUnits <=
        0n
      ) {
        throw new Error(
          "Prepared AVNU Swap has an invalid minimum output.",
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
              toAsset.id,

            ...(input.context.signal
              ? {
                  signal:
                    input.context
                      .signal,
                }
              : {}),
          });

      const recoveryDraft =
        await sealRecovery(
          input,
          {
            action:
              "swap",

            assetId:
              toAsset.id,

            assetSymbol:
              toAsset.symbol,

            decimals:
              toAsset.decimals
                .toString(),

            publicBefore:
              publicBefore
                .toString(),

            minimumIncreaseUnits:
              prepared
                .minimumOutputUnits
                .toString(),
          },
        );


      const transaction =
        await prepared
          .execute();

      const transactionId =
        requireTransactionHash(
          transaction.hash,
        );

      snapshots.set(
        snapshotKey(
          input.executionKey,
          transactionId,
        ),
        {
          executionKey:
            input.executionKey,

          transactionId,

          chainId:
            input.context.chainId,

          account:
            input.context.account,

          assetId:
            toAsset.id,

          assetSymbol:
            toAsset.symbol,

          decimals:
            toAsset.decimals,

          publicBefore,

          minimumIncreaseUnits:
            prepared
              .minimumOutputUnits,

          actionLabel:
            "Swap",
        },
      );


      await bindRecovery(
        recoveryDraft,
        transactionId,
      );


      /*
       * Always record the transaction before output verification.
       *
       * This prevents a slow RPC/balance refresh from causing CAREL to
       * invite an unsafe duplicate swap.
       */
      return {
        transactionId,

        status:
          "submitted",
      };
    },
  };


  const unshieldExecutor:
    AgentStageExecutor = {
    id:
      "starknet:strk20:agent-swap-unshield",

    actions:
      ["unshield"],

    supports(
      input,
    ) {
      return (
        input.stage.action ===
          "unshield" &&
        input.stage
          .sourceChainId ===
          input.context.chainId &&
        input.stage
          .privacyBefore ===
          "private" &&
        input.stage
          .privacyAfter ===
          "public" &&
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
      Promise<
        AgentStageExecutionReceipt
      > {
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
          "Unshield Swap stage requires an exact private input amount.",
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
          "Unshield amount must be greater than zero.",
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
              asset.id,

            ...(input.context.signal
              ? {
                  signal:
                    input.context
                      .signal,
                }
              : {}),
          });

      const recoveryDraft =
        await sealRecovery(
          input,
          {
            action:
              "unshield",

            assetId:
              asset.id,

            assetSymbol:
              asset.symbol,

            decimals:
              asset.decimals
                .toString(),

            publicBefore:
              publicBefore
                .toString(),

            minimumIncreaseUnits:
              amountUnits
                .toString(),

            exactOutputUnits:
              amountUnits
                .toString(),
          },
        );


      const transaction =
        await dependencies
          .executeUnshieldAsset(
            asset.id,

            amountText,

            `Unshield ${amountText} ${asset.symbol} for Swap`,
          );

      const transactionId =
        requireTransactionHash(
          transaction.hash,
        );

      snapshots.set(
        snapshotKey(
          input.executionKey,
          transactionId,
        ),
        {
          executionKey:
            input.executionKey,

          transactionId,

          chainId:
            input.context.chainId,

          account:
            input.context.account,

          assetId:
            asset.id,

          assetSymbol:
            asset.symbol,

          decimals:
            asset.decimals,

          publicBefore,

          minimumIncreaseUnits:
            amountUnits,

          exactOutputUnits:
            amountUnits,

          actionLabel:
            "Unshield",
        },
      );


      await bindRecovery(
        recoveryDraft,
        transactionId,
      );


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
      "starknet:strk20:agent-swap-shield",

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
      Promise<
        AgentStageExecutionReceipt
      > {
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
          "Shield Swap stage requires verified public Swap output.",
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

      const recoveryDraft =
        await sealRecovery(
          input,
          {
            action:
              "shield",

            assetId:
              asset.id,

            assetSymbol:
              asset.symbol,

            amountUnits:
              amountUnits
                .toString(),
          },
        );


      const result =
        await dependencies
          .executeShieldAsset(
            asset.id,

            amountText,

            `Shield Swap output ${amountText} ${asset.symbol}`,
          );

      const transactionId =
        requireTransactionHash(
          result.hash,
        );


      await bindRecovery(
        recoveryDraft,
        transactionId,
      );


      return {
        transactionId,

        status:
          result.status,
      };
    },
  };


  const registry =
    createAgentStageExecutorRegistry(
      [
        swapExecutor,
        unshieldExecutor,
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
        "swap" &&
      planStage.action !==
        "unshield"
    ) {
      return confirmAgentStageExecution(
        plan,
        session,
        stageId,
      );
    }

    const key =
      snapshotKey(
        stageExecutionKey(
          session.runId,
          stageId,
        ),
        runtimeStage.txHash,
      );

    let snapshot =
      snapshots.get(
        key,
      );


    if (
      !snapshot &&
      dependencies.recovery
    ) {
      const recovered =
        await dependencies
          .recovery
          .load({
            runId:
              session.runId,

            stageId,

            executionKey:
              stageExecutionKey(
                session.runId,
                stageId,
              ),

            chainId:
              context.chainId,

            account:
              context.account,

            transactionId:
              runtimeStage.txHash,
          });


      if (recovered) {
        snapshot =
          recoveredPublicOutputSnapshot(
            recovered,
            planStage.action,
          );


        snapshots.set(
          key,
          snapshot,
        );
      }
    }


    if (!snapshot) {
      throw new Error(
        `CAREL cannot verify this ${planStage.action} stage because its execution snapshot is unavailable.`,
      );
    }


    const output =
      await verifyPublicOutput(
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
