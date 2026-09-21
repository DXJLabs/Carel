import {
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  getVesuLendAssetBySymbol,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/lending";

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


export type LendWalletTransactionResult =
  Readonly<{
    hash:
      string;

    status:
      | "submitted"
      | "confirmed";
  }>;


export type PreparePublicLendInput =
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


export type PreparedPublicLend =
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

    /**
     * Public Vesu position observation.
     *
     * For ERC-4626 Vesu lending this should be the connected owner's vToken
     * share balance for the exact reviewed pool/asset.
     */
    readPositionShares(
      signal?:
        AbortSignal,
    ):
      Promise<bigint>;

    execute():
      Promise<
        LendWalletTransactionResult
      >;
  }>;


export type PrepareShieldLendInput =
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


export type PreparedShieldLend =
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

    execute():
      Promise<
        LendWalletTransactionResult
      >;
  }>;


export type ReadLendPublicBalanceInput =
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


export type WaitLendTransactionInput =
  Readonly<{
    chainId:
      string;

    transactionId:
      string;

    signal?:
      AbortSignal;
  }>;


export type StarknetLendRuntimeDependencies =
  Readonly<{
    preparePublicLend(
      input:
        PreparePublicLendInput,
    ):
      Promise<
        PreparedPublicLend
      >;

    prepareShieldLend(
      input:
        PrepareShieldLendInput,
    ):
      Promise<
        PreparedShieldLend
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
        LendWalletTransactionResult
      >;

    readPublicBalance(
      input:
        ReadLendPublicBalanceInput,
    ):
      Promise<bigint>;

    waitForTransaction(
      input:
        WaitLendTransactionInput,
    ):
      Promise<void>;
  }>;


type PublicLendSnapshot =
  Readonly<{
    kind:
      "public-lend";

    executionKey:
      string;

    transactionId:
      string;

    sharesBefore:
      bigint;

    readPositionShares(
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


type LendSnapshot =
  | PublicLendSnapshot
  | UnshieldSnapshot;


export type StarknetLendRuntime =
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
      "Lend executor returned an invalid transaction hash.",
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


function requireLendInput(
  input:
    AgentStageExecutionInput,
) {
  if (
    input.stage.action !==
      "lend"
  ) {
    throw new Error(
      "Vesu Lend executor only accepts Lend stages.",
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
      "Lend stage is missing reviewed execution data.",
    );
  }


  const asset =
    getVesuLendAssetBySymbol(
      symbol,
    );


  if (
    !asset ||
    (
      asset.chain.id !==
        input.context
          .chainId &&
      asset.chain.chainId !==
        input.context
          .chainId
    )
  ) {
    throw new Error(
      `Vesu does not support ${symbol} for this CAREL network.`,
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
      "Lend amount must be greater than zero.",
    );
  }


  return {
    asset,
    amountText,
    amountUnits,
  };
}


export function createStarknetLendRuntime(
  dependencies:
    StarknetLendRuntimeDependencies,
): StarknetLendRuntime {
  const snapshots =
    new Map<
      string,
      LendSnapshot
    >();


  const lendExecutor:
    AgentStageExecutor = {
    id:
      "starknet:vesu:agent-lend",

    actions:
      ["lend"],


    supports(
      input,
    ) {
      return (
        input.stage.action ===
          "lend" &&
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
        requireLendInput(
          input,
        );


      /*
       * Public Vesu Lend.
       *
       * Preparation happens immediately before execution. The runtime does
       * not reuse a stale React preview.
       */
      if (
        input.stage
          .privacyAfter ===
          "public"
      ) {
        const prepared =
          await dependencies
            .preparePublicLend({
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
            .toLowerCase() !==
            asset.symbol
              .trim()
              .toLowerCase() ||
          prepared.decimals !==
            asset.decimals ||
          prepared.amountUnits !==
            amountUnits
        ) {
          throw new Error(
            "Fresh Vesu Lend preparation does not match the Agent stage.",
          );
        }


        const sharesBefore =
          await prepared
            .readPositionShares(
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
              "public-lend",

            executionKey:
              input.executionKey,

            transactionId,

            sharesBefore,

            readPositionShares:
              prepared
                .readPositionShares,
          },
        );


        /*
         * Always keep Agent state submitted until the public vToken position
         * increase is independently observed.
         */
        return {
          transactionId,

          status:
            "submitted",
        };
      }


      /*
       * Shield Lend:
       *
       * public underlying → STRK20 → Vesu anonymizer → private vToken.
       *
       * The provider/privacy runtime owns the private receipt mechanics.
       */
      const prepared =
        await dependencies
          .prepareShieldLend({
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
          .toLowerCase() !==
          asset.symbol
            .trim()
            .toLowerCase() ||
        prepared.decimals !==
          asset.decimals ||
        prepared.amountUnits !==
          amountUnits
      ) {
        throw new Error(
          "Fresh Shield Lend preparation does not match the Agent stage.",
        );
      }


      const transaction =
        await prepared
          .execute();


      return {
        transactionId:
          requireHash(
            transaction.hash,
          ),

        status:
          "submitted",
      };
    },
  };


  const unshieldExecutor:
    AgentStageExecutor = {
    id:
      "starknet:strk20:agent-lend-unshield",

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
          "Unshield Lend requires an exact private input amount.",
        );
      }


      const asset =
        getVesuLendAssetBySymbol(
          symbol,
        );


      if (!asset) {
        throw new Error(
          `Vesu Lend does not support ${symbol}.`,
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
          "Unshield Lend amount must be greater than zero.",
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

            `Unshield ${amountText} ${asset.symbol} before Vesu Lend`,
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
    createAgentStageExecutorRegistry([
      lendExecutor,
      unshieldExecutor,
    ]);


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


  async function verifyPublicLend(
    snapshot:
      PublicLendSnapshot,

    signal?:
      AbortSignal,
  ) {
    const sharesAfter =
      await snapshot
        .readPositionShares(
          signal,
        );


    if (
      sharesAfter <=
        snapshot.sharesBefore
    ) {
      throw new Error(
        "Confirmed Vesu Lend transaction is not visible in the public vToken position yet.",
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
        `Agent stage ${stageId} is not awaiting Vesu Lend confirmation.`,
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
        `Unknown Lend Agent stage: ${stageId}.`,
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
     * Shield Lend finishes in a private vToken receipt. Do not fabricate a
     * public output observation for it.
     */
    if (
      stage.action ===
        "lend" &&
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
        "CAREL cannot verify this Lend stage because its execution snapshot is unavailable.",
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


    await verifyPublicLend(
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
