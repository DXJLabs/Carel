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
  SignedAgentRecoveryDraft,
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


export type ReadPublicStakePositionInput =
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

    readPublicStakePosition(
      input:
        ReadPublicStakePositionInput,
    ):
      Promise<bigint>;

    waitForTransaction(
      input:
        WaitStakingTransactionInput,
    ):
      Promise<void>;

    recovery?:
      AgentRuntimeRecovery;
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

    chainId:
      string;

    account:
      string;

    assetId:
      string;
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
      `Recovered Staking snapshot contains invalid ${key}.`,
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
      `Recovered Staking snapshot contains invalid ${key}.`,
    );
  }


  return value;
}


function recoveredStakingSnapshot(
  payload:
    AgentRecoveryBoundPayload,

  action:
    "stake" |
    "unshield",
): StakingSnapshot {
  const data =
    payload.data;


  if (
    data.action !==
      action
  ) {
    throw new Error(
      "Recovered Staking snapshot does not match the submitted Agent stage.",
    );
  }


  if (
    action ===
      "stake"
  ) {
    if (
      data.kind !==
        "public-stake" ||
      !data.assetId
    ) {
      throw new Error(
        "Recovered public Staking snapshot is incomplete.",
      );
    }


    return {
      kind:
        "public-stake",

      executionKey:
        payload.executionKey,

      transactionId:
        payload.transactionId,

      amountUnits:
        recoveryBigInt(
          data,
          "amountUnits",
          true,
        ),

      positionBefore:
        recoveryBigInt(
          data,
          "positionBefore",
        ),

      chainId:
        payload.chainId,

      account:
        payload.account,

      assetId:
        data.assetId,
    };
  }


  if (
    !data.assetId ||
    !data.assetSymbol
  ) {
    throw new Error(
      "Recovered Unshield Staking snapshot is incomplete.",
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
      "Recovered Unshield Staking snapshot has invalid decimals.",
    );
  }


  return {
    kind:
      "unshield",

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

    publicBefore:
      recoveryBigInt(
        data,
        "publicBefore",
      ),

    amountUnits:
      recoveryBigInt(
        data,
        "amountUnits",
        true,
      ),
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


  async function sealRecovery(
    input:
      AgentStageExecutionInput,

    data:
      AgentRecoveryData,
  ): Promise<
    SignedAgentRecoveryDraft | null
  > {
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
       * Recovery availability must not block a reviewed Staking transaction.
       */
      return null;
    }
  }


  async function bindRecovery(
    draft:
      SignedAgentRecoveryDraft | null,

    transactionId:
      string,
  ): Promise<void> {
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
       * The wallet already returned a tx hash. Never convert a persistence
       * error into an execution failure or invite a duplicate Stake.
       */
    }
  }


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


        const recoveryDraft =
          await sealRecovery(
            input,
            {
              action:
                "stake",

              kind:
                "public-stake",

              assetId:
                asset.id,

              amountUnits:
                amountUnits
                  .toString(),

              positionBefore:
                positionBefore
                  .toString(),
            },
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

            chainId:
              input.context
                .chainId,

            account:
              input.context
                .account,

            assetId:
              asset.id,
          },
        );


        await bindRecovery(
          recoveryDraft,
          transactionId,
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


      const recoveryDraft =
        await sealRecovery(
          input,
          {
            action:
              "stake",

            kind:
              "private-stake",

            assetId:
              asset.id,

            amountUnits:
              amountUnits
                .toString(),
          },
        );


      const transaction =
        await prepared
          .execute();


      const transactionId =
        requireHash(
          transaction.hash,
        );


      await bindRecovery(
        recoveryDraft,
        transactionId,
      );


      return {
        transactionId,

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

            amountUnits:
              amountUnits
                .toString(),
          },
        );


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
      await dependencies
        .readPublicStakePosition({
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
              executionKey(
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
        const recoverableAction =
          stage.action;


        if (
          recoverableAction !==
            "stake" &&
          recoverableAction !==
            "unshield"
        ) {
          throw new Error(
            "Recovered Staking capsule belongs to an unsupported Agent stage.",
          );
        }


        snapshot =
          recoveredStakingSnapshot(
            recovered,
            recoverableAction,
          );


        snapshots.set(
          key,
          snapshot,
        );
      }
    }


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
