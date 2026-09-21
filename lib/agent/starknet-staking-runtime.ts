import {
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  findCarelAssetBySymbol,
} from "@/lib/carel/assets";

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


export type StakingWalletTransactionResult =
  Readonly<{
    hash: string;

    status:
      | "submitted"
      | "confirmed";
  }>;


export type PreparePublicStakeInput =
  Readonly<{
    executionKey:
      string;

    chainId:
      string;

    owner:
      string;

    assetId:
      string;

    assetSymbol:
      string;

    amountText:
      string;

    signal?:
      AbortSignal;
  }>;


export type PreparedPublicStake =
  Readonly<{
    label:
      string;

    assetId:
      string;

    assetSymbol:
      string;

    decimals:
      number;

    amountUnits:
      bigint;

    readPosition(
      signal?:
        AbortSignal,
    ):
      Promise<bigint>;

    execute():
      Promise<
        StakingWalletTransactionResult
      >;
  }>;


export type PrepareShieldStakeInput =
  Readonly<{
    executionKey:
      string;

    chainId:
      string;

    owner:
      string;

    assetId:
      string;

    assetSymbol:
      string;

    outputAssetSymbol?:
      string;

    amountText:
      string;

    signal?:
      AbortSignal;
  }>;


export type PreparedShieldStake =
  Readonly<{
    label:
      string;

    execute():
      Promise<
        StakingWalletTransactionResult
      >;
  }>;


export type ReadStakingPublicBalanceInput =
  Readonly<{
    chainId:
      string;

    account:
      string;

    assetId:
      string;

    signal?:
      AbortSignal;
  }>;


export type WaitStakingTransactionInput =
  Readonly<{
    chainId:
      string;

    transactionId:
      string;

    signal?:
      AbortSignal;
  }>;


export type StarknetStakingRuntimeDependencies =
  Readonly<{
    preparePublicStake(
      input:
        PreparePublicStakeInput,
    ):
      Promise<
        PreparedPublicStake
      >;

    prepareShieldStake(
      input:
        PrepareShieldStakeInput,
    ):
      Promise<
        PreparedShieldStake
      >;

    executeUnshieldAsset(
      assetId:
        string,

      amountText:
        string,

      label:
        string,
    ):
      Promise<
        StakingWalletTransactionResult
      >;

    readPublicBalance(
      input:
        ReadStakingPublicBalanceInput,
    ):
      Promise<bigint>;

    waitForTransaction(
      input:
        WaitStakingTransactionInput,
    ):
      Promise<void>;
  }>;


type PublicStakeSnapshot =
  Readonly<{
    kind:
      "public-stake";

    executionKey:
      string;

    transactionId:
      string;

    amountUnits:
      bigint;

    positionBefore:
      bigint;

    readPosition(
      signal?:
        AbortSignal,
    ):
      Promise<bigint>;
  }>;


type UnshieldSnapshot =
  Readonly<{
    kind:
      "unshield";

    executionKey:
      string;

    transactionId:
      string;

    chainId:
      string;

    account:
      string;

    assetId:
      string;

    assetSymbol:
      string;

    decimals:
      number;

    publicBefore:
      bigint;

    amountUnits:
      bigint;
  }>;


type StakingSnapshot =
  | PublicStakeSnapshot
  | UnshieldSnapshot;


export type StarknetStakingRuntime =
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
    return amount
      .toString();
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


function requireHash(
  value:
    string,
): string {
  if (
    !/^0x[0-9a-f]{1,64}$/i.test(
      value,
    )
  ) {
    throw new Error(
      "Staking executor returned an invalid transaction hash.",
    );
  }

  return value;
}


function executionKey(
  runId:
    string,

  stageId:
    string,
): string {
  return `${runId}:${stageId}`;
}


function snapshotKey(
  key:
    string,

  transactionId:
    string,
): string {
  return `${key}:${transactionId}`;
}


function requireStakeInput(
  input:
    AgentStageExecutionInput,
) {
  if (
    input.stage.action !==
      "stake"
  ) {
    throw new Error(
      "Staking executor only accepts Stake stages.",
    );
  }

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
      "Stake stage is missing reviewed execution data.",
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
      "Stake amount must be greater than zero.",
    );
  }

  return {
    asset,
    amountText,
    amountUnits,
  };
}


export function createStarknetStakingRuntime(
  dependencies:
    StarknetStakingRuntimeDependencies,
): StarknetStakingRuntime {
  const snapshots =
    new Map<
      string,
      StakingSnapshot
    >();


  const stakeExecutor:
    AgentStageExecutor = {
    id:
      "starknet:agent:staking",

    actions:
      ["stake"],

    supports(
      input,
    ) {
      return (
        input.stage.action ===
          "stake" &&
        input.stage
          .sourceChainId ===
          input.context.chainId &&
        input.stage
          .privacyBefore ===
          "public" &&
        Boolean(
          input.stage
            .inputAssetSymbol &&
          input.resolvedAmountText,
        ) &&
        (
          input.stage
            .privacyAfter ===
            "public" ||
          input.stage
            .privacyAfter ===
            "private"
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
        asset,
        amountText,
        amountUnits,
      } =
        requireStakeInput(
          input,
        );


      /*
       * Normal/Unshield continuation:
       * public STRK -> public staking position.
       */
      if (
        input.stage
          .privacyAfter ===
          "public"
      ) {
        const prepared =
          await dependencies
            .preparePublicStake({
              executionKey:
                input.executionKey,

              chainId:
                input.context
                  .chainId,

              owner:
                input.context
                  .account,

              assetId:
                asset.id,

              assetSymbol:
                asset.symbol,

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


        if (
          prepared.assetId !==
            asset.id ||
          prepared.assetSymbol
            .trim()
            .toUpperCase() !==
            asset.symbol
              .trim()
              .toUpperCase() ||
          prepared.decimals !==
            asset.decimals ||
          prepared.amountUnits !==
            amountUnits
        ) {
          throw new Error(
            "Fresh staking review does not match the Agent stage.",
          );
        }


        const positionBefore =
          await prepared
            .readPosition(
              input.context
                .signal,
            );


        const transaction =
          await prepared
            .execute();

        const transactionId =
          requireHash(
            transaction.hash,
          );


        snapshots.set(
          snapshotKey(
            input.executionKey,
            transactionId,
          ),
          {
            kind:
              "public-stake",

            executionKey:
              input.executionKey,

            transactionId,

            amountUnits,

            positionBefore,

            readPosition:
              prepared
                .readPosition,
          },
        );


        /*
         * Even if the wallet already observed confirmation, Agent state stays
         * submitted until the public staking position increase is verified.
         */
        return {
          transactionId,

          status:
            "submitted",
        };
      }


      /*
       * Shield Stake:
       *
       * Public STRK -> Endur privacy-aware staking -> private xSTRK.
       * This is still one Stake stage. STRK20/Endur owns its private receipt
       * mechanics; Agent Core only owns lifecycle.
       */
      const prepared =
        await dependencies
          .prepareShieldStake({
            executionKey:
              input.executionKey,

            chainId:
              input.context
                .chainId,

            owner:
              input.context
                .account,

            assetId:
              asset.id,

            assetSymbol:
              asset.symbol,

            outputAssetSymbol:
              input.stage
                .outputAssetSymbol,

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


      const transaction =
        await prepared
          .execute();


      return {
        transactionId:
          requireHash(
            transaction.hash,
          ),

        /*
         * Confirm explicitly through the Agent lifecycle.
         */
        status:
          "submitted",
      };
    },
  };


  const unshieldExecutor:
    AgentStageExecutor = {
    id:
      "starknet:strk20:agent-staking-unshield",

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
          "Unshield Staking requires an exact private input amount.",
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
              input.context
                .chainId,

            account:
              input.context
                .account,

            assetId:
              asset.id,

            ...(input.context
              .signal
              ? {
                  signal:
                    input.context
                      .signal,
                }
              : {}),
          });


      const transaction =
        await dependencies
          .executeUnshieldAsset(
            asset.id,

            amountText,

            `Unshield ${amountText} ${asset.symbol} before Staking`,
          );


      const transactionId =
        requireHash(
          transaction.hash,
        );


      snapshots.set(
        snapshotKey(
          input.executionKey,
          transactionId,
        ),
        {
          kind:
            "unshield",

          executionKey:
            input.executionKey,

          transactionId,

          chainId:
            input.context
              .chainId,

          account:
            input.context
              .account,

          assetId:
            asset.id,

          assetSymbol:
            asset.symbol,

          decimals:
            asset.decimals,

          publicBefore,

          amountUnits,
        },
      );


      return {
        transactionId,

        status:
          "submitted",
      };
    },
  };


  const registry =
    createAgentStageExecutorRegistry(
      [
        stakeExecutor,
        unshieldExecutor,
      ],
    );


  async function verifyUnshield(
    snapshot:
      UnshieldSnapshot,

    signal?:
      AbortSignal,
  ):
    Promise<
      AgentVerifiedStageOutput
    > {
    const publicAfter =
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
      publicAfter -
      snapshot.publicBefore;


    if (
      increase <
        snapshot.amountUnits
    ) {
      throw new Error(
        `Confirmed Unshield output is not visible in public ${snapshot.assetSymbol} balance yet.`,
      );
    }


    return {
      assetSymbol:
        snapshot.assetSymbol,

      amountText:
        exactAmountText(
          snapshot.amountUnits,
          snapshot.decimals,
        ),

      amountUnits:
        snapshot
          .amountUnits
          .toString(),
    };
  }


  async function verifyPublicStake(
    snapshot:
      PublicStakeSnapshot,

    signal?:
      AbortSignal,
  ) {
    const positionAfter =
      await snapshot
        .readPosition(
          signal,
        );


    const increase =
      positionAfter -
      snapshot.positionBefore;


    if (
      increase <
        snapshot.amountUnits
    ) {
      throw new Error(
        "Confirmed staking transaction is not visible in the public staking position yet.",
      );
    }
  }


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
        `Agent stage ${stageId} is not awaiting staking confirmation.`,
      );
    }


    const stage =
      plan.stages.find(
        (candidate) =>
          candidate.id ===
            stageId,
      );


    if (!stage) {
      throw new Error(
        `Unknown Staking Agent stage: ${stageId}.`,
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


    /*
     * Private Endur output is provider/privacy owned.
     * We confirm the reviewed transaction without fabricating xSTRK output.
     */
    if (
      stage.action ===
        "stake" &&
      stage.privacyAfter ===
        "private"
    ) {
      return confirmAgentStageExecution(
        plan,
        session,
        stageId,
      );
    }


    const key =
      snapshotKey(
        executionKey(
          session.runId,
          stageId,
        ),
        runtimeStage.txHash,
      );


    const snapshot =
      snapshots.get(
        key,
      );


    if (!snapshot) {
      throw new Error(
        "CAREL cannot verify this Staking stage because its execution snapshot is unavailable.",
      );
    }


    if (
      snapshot.kind ===
        "unshield"
    ) {
      const output =
        await verifyUnshield(
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


    await verifyPublicStake(
      snapshot,
      context.signal,
    );


    const next =
      confirmAgentStageExecution(
        plan,
        session,
        stageId,
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
