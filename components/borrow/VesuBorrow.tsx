"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ArrowRight,
  Check,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  WalletCards,
} from "lucide-react";

import {
  useCarelTestnet,
} from "@/components/testnet/Strk20Testnet";

import {
  getCarelNetwork,
} from "@/lib/carel/networks";

import {
  formatUnits,
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  findAssetBalance,
} from "@/lib/carel/core/balances";

import {
  readStarknetPublicBalances,
} from "@/lib/carel/ecosystems/starknet/balances";

import {
  parseBorrowGoal,
} from "@/lib/agent/borrow";

import type {
  AgentPlan,
} from "@/lib/agent/plan";

import {
  buildStarknetAgentPlan,
} from "@/lib/agent/starknet-planner";

import {
  createAgentExecutionSession,
  executeAgentStage,
  type AgentExecutionSession,
} from "@/lib/agent/executor";

import {
  createStarknetBorrowRuntime,
  type StarknetBorrowRuntime,
} from "@/lib/agent/starknet-borrow-runtime";

import type {
  VesuBorrowExecutionPayload,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/borrow";

import {
  getVesuBorrowDebtAssetBySymbol,
  VESU_BORROW_DEBT_ASSETS,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/pairs";

import styles from "../CarelWorkspace.module.css";

type BorrowMode =
  | "normal"
  | "shield"
  | "unshield";

type UnshieldBorrowProgress =
  | Readonly<{
      kind: "idle";
    }>
  | Readonly<{
      kind: "waiting";
      hash: string;
      amount: string;
    }>
  | Readonly<{
      kind: "ready";
      hash: string;
      amount: string;
    }>;

type ShieldBorrowProgress =
  | Readonly<{
      kind: "idle";
    }>
  | Readonly<{
      kind: "waiting";
      borrowHash: string;
      amount: string;
      amountUnits: string;
      debtAssetId: string;
      debtSymbol: string;
      publicBefore: string;
    }>
  | Readonly<{
      kind: "ready";
      borrowHash: string;
      amount: string;
      amountUnits: string;
      debtAssetId: string;
      debtSymbol: string;
      publicBefore: string;
    }>
  | Readonly<{
      kind: "shielded";
      borrowHash: string;
      shieldHash: string;
      amount: string;
      debtAssetId: string;
      debtSymbol: string;
      status:
        | "confirmed"
        | "submitted";
    }>;


type BorrowEvaluation =
  Readonly<{
    eligible: boolean;
    requestedLtvBps: number;
    ltvHeadroomBps: number;
    projectedUtilizationBps: number;
    blockers:
      readonly string[];
  }>;

type BorrowMarket =
  Readonly<{
    id: string;

    provider: string;

    pool:
      Readonly<{
        id: string;
        name: string;
        address: string;
      }>;

    collateral:
      Readonly<{
        id: string;
        symbol: string;
        decimals: number;
      }>;

    debt:
      Readonly<{
        id: string;
        symbol: string;
        decimals: number;
      }>;

    risk:
      Readonly<{
        maxLtvBps: number;
        liquidationFactorBps: number;
        utilizationBps: number;
        maxUtilizationBps: number;

        availableLiquidity: string;
        pairDebt: string;
        debtCap: string;

        observedAt: number;
      }>;

    evaluation:
      BorrowEvaluation | null;
  }>;

type MarketsResponse =
  Readonly<{
    network: string;
    pair: string;
    markets:
      readonly BorrowMarket[];
  }>;

type PrepareResponse =
  Readonly<{
    provider: string;

    pool:
      Readonly<{
        id: string;
        name: string;
        address: string;
      }>;

    evaluation:
      Readonly<{
        requestedLtvBps: number;
        maxLtvBps: number;
        projectedUtilizationBps: number;
        maxUtilizationBps: number;
      }>;

    execution:
      VesuBorrowExecutionPayload;
  }>;

/**
 * Formats protocol basis points for factual risk display.
 */
function formatBps(
  value: number,
): string {
  if (
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return `${(
    value / 100
  ).toFixed(2)}%`;
}

/**
 * Parses JSON responses without trusting non-object payloads.
 */
function responseObject(
  value: unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "CAREL Borrow API returned an invalid response.",
    );
  }

  return value as Record<
    string,
    unknown
  >;
}

/**
 * Produces a short display form while keeping the complete address
 * available to CAREL's execution validator.
 */
function shortAddress(
  address: string,
): string {
  if (address.length <= 16) {
    return address;
  }

  return `${address.slice(
    0,
    8,
  )}…${address.slice(-6)}`;
}

/**
 * Public Vesu Borrow interface.
 *
 * The UI never constructs executable calls itself. It first loads an
 * on-chain risk snapshot, then asks the server to prepare a fresh position,
 * and finally hands that reviewed payload to the wallet-side validator.
 */
export function VesuBorrow({
  mode,
  goal,
  onPublicMode,
}: {
  mode: BorrowMode;
  goal: string;
  onPublicMode: () => void;
}) {
  const wallet =
    useCarelTestnet();

  const network =
    getCarelNetwork(
      wallet.chainId,
    );

  const [
    collateralAmount,
    setCollateralAmount,
  ] = useState("1000");

  const [
    borrowAmount,
    setBorrowAmount,
  ] = useState("10");

  const [
    debtAssetId,
    setDebtAssetId,
  ] = useState(
    VESU_BORROW_DEBT_ASSETS[0].id,
  );

  const selectedDebtAsset =
    useMemo(
      () =>
        VESU_BORROW_DEBT_ASSETS.find(
          (asset) =>
            asset.id ===
            debtAssetId,
        ) ??
        VESU_BORROW_DEBT_ASSETS[0],
      [debtAssetId],
    );

  const [
    markets,
    setMarkets,
  ] = useState<
    readonly BorrowMarket[]
  >([]);

  const [
    selectedPoolId,
    setSelectedPoolId,
  ] = useState("");

  const [
    reviewed,
    setReviewed,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    executing,
    setExecuting,
  ] = useState(false);

  const [
    unshielding,
    setUnshielding,
  ] = useState(false);

  const [
    checkingUnshield,
    setCheckingUnshield,
  ] = useState(false);

  const [
    unshieldProgress,
    setUnshieldProgress,
  ] = useState<UnshieldBorrowProgress>({
    kind: "idle",
  });

  const [
    shieldingBorrow,
    setShieldingBorrow,
  ] = useState(false);

  const [
    checkingShieldBorrow,
    setCheckingShieldBorrow,
  ] = useState(false);

  const [
    shieldBorrowProgress,
    setShieldBorrowProgress,
  ] = useState<ShieldBorrowProgress>({
    kind: "idle",
  });

  /*
   * During migration, shieldBorrowProgress remains UI-only state.
   *
   * These refs are the execution source of truth for Shield Borrow.
   * The runtime must survive React re-renders because it owns the
   * verified Borrow execution snapshot used by the Shield stage.
   */
  const shieldAgentPlanRef =
    useRef<AgentPlan | null>(
      null,
    );

  const shieldAgentSessionRef =
    useRef<AgentExecutionSession | null>(
      null,
    );

  const shieldAgentRuntimeRef =
    useRef<StarknetBorrowRuntime | null>(
      null,
    );

  const shieldAgentAccountRef =
    useRef("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");

  const selectedMarket =
    useMemo(
      () =>
        markets.find(
          (market) =>
            market.pool.id ===
            selectedPoolId,
        ) ??
        markets[0] ??
        null,
      [
        markets,
        selectedPoolId,
      ],
    );

  const busy =
    loading ||
    executing ||
    unshielding ||
    checkingUnshield ||
    shieldingBorrow ||
    checkingShieldBorrow ||
    wallet.busy;

  /**
   * Invalidates an old review whenever the user changes an amount.
   */
  function changeCollateral(
    value: string,
  ) {
    setCollateralAmount(
      value,
    );
    setReviewed(false);
    setSuccess("");
    setError("");

    if (
      mode === "unshield"
    ) {
      setUnshieldProgress({
        kind: "idle",
      });
    }

    if (
      mode === "shield"
    ) {
      setShieldBorrowProgress({
        kind: "idle",
      });
    }
  }

  /**
   * Invalidates an old review whenever the requested debt changes.
   */
  function changeBorrow(
    value: string,
  ) {
    setBorrowAmount(
      value,
    );
    setReviewed(false);
    setSuccess("");
    setError("");

    if (
      mode === "shield"
    ) {
      setShieldBorrowProgress({
        kind: "idle",
      });
    }
  }

  useEffect(() => {
    try {
      const parsed =
        parseBorrowGoal(
          goal,
        );

      if (
        parsed.collateralSymbol ===
          "STRK"
      ) {
        const debtAsset =
          getVesuBorrowDebtAssetBySymbol(
            parsed.borrowSymbol,
          );

        if (!debtAsset) {
          return;
        }

        setCollateralAmount(
          parsed.collateralAmountText,
        );

        setUnshieldProgress({
          kind: "idle",
        });

        setShieldBorrowProgress({
          kind: "idle",
        });

        setBorrowAmount(
          parsed.borrowAmountText,
        );

        setDebtAssetId(
          debtAsset.id,
        );

        setReviewed(false);
      }
    } catch {
      // Manual Borrow fields remain usable when the goal is incomplete.
    }
  }, [goal]);

  useEffect(() => {
    setUnshieldProgress({
      kind: "idle",
    });

    setShieldBorrowProgress({
      kind: "idle",
    });

    shieldAgentPlanRef.current =
      null;

    shieldAgentSessionRef.current =
      null;

    shieldAgentRuntimeRef.current =
      null;

    shieldAgentAccountRef.current =
      "";
  }, [
    wallet.address,
    wallet.chainId,
    mode,
  ]);

  /**
   * Loads either market discovery only or a fresh amount-specific
   * risk evaluation from CAREL's server.
   */
  async function loadMarkets(
    withEvaluation = false,
  ) {
    if (
      !network ||
      network.id !==
        "mainnet"
    ) {
      setMarkets([]);
      setReviewed(false);

      throw new Error(
        "CAREL Borrow is currently enabled on Starknet Mainnet only.",
      );
    }

    if (withEvaluation) {
      const collateral =
        parseUnits(
          collateralAmount,
          network.assets.strk
            .decimals,
        );

      const debt =
        parseUnits(
          borrowAmount,
          selectedDebtAsset
            .decimals,
        );

      if (
        collateral <= 0n ||
        debt <= 0n
      ) {
        throw new Error(
          "Borrow and collateral amounts must be greater than zero.",
        );
      }
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const query =
        new URLSearchParams();

      query.set(
        "debtAssetId",
        selectedDebtAsset.id,
      );

      if (withEvaluation) {
        query.set(
          "collateralAmount",
          collateralAmount,
        );

        query.set(
          "borrowAmount",
          borrowAmount,
        );
      }

      const response =
        await fetch(
          `/api/vesu/borrow/markets${
            query.size
              ? `?${query.toString()}`
              : ""
          }`,
          {
            cache:
              "no-store",
          },
        );

      const raw: unknown =
        await response.json();

      const payload =
        responseObject(
          raw,
        );

      if (!response.ok) {
        throw new Error(
          typeof payload.error ===
            "string"
            ? payload.error
            : "Could not load Vesu markets.",
        );
      }

      if (
        !Array.isArray(
          payload.markets,
        )
      ) {
        throw new Error(
          "CAREL received malformed Vesu market data.",
        );
      }

      const nextMarkets =
        payload.markets as BorrowMarket[];

      if (
        !nextMarkets.length
      ) {
        throw new Error(
          `No verified STRK → ${selectedDebtAsset.symbol} Vesu market is available right now.`,
        );
      }

      setMarkets(
        nextMarkets,
      );

      const stillAvailable =
        nextMarkets.some(
          (market) =>
            market.pool.id ===
            selectedPoolId,
        );

      if (!stillAvailable) {
        setSelectedPoolId(
          nextMarkets[0]
            .pool.id,
        );
      }

      setReviewed(
        withEvaluation,
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setReviewed(false);
    setMarkets([]);
    setSelectedPoolId("");
    setError("");
    setSuccess("");

    if (
      wallet.connected &&
      network?.id ===
        "mainnet"
    ) {
      void loadMarkets(
        false,
      ).catch(
        (cause) => {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load Vesu markets.",
          );
        },
      );
    }

    // Network/account change intentionally resets the review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    wallet.address,
    wallet.chainId,
    debtAssetId,
  ]);

  /**
   * Stage 1 of Unshield Borrow:
   * private STRK -> public STRK.
   *
   * This does not execute Vesu. Borrow remains a separate transaction.
   */
  async function startUnshieldBorrow() {
    if (
      mode !== "unshield" ||
      !network ||
      network.id !== "mainnet" ||
      unshielding ||
      checkingUnshield
    ) {
      return;
    }

    setError("");
    setSuccess("");

    let collateral:
      bigint;

    try {
      collateral =
        parseUnits(
          collateralAmount,
          network.assets.strk
            .decimals,
        );
    } catch {
      setError(
        "Enter a valid STRK collateral amount.",
      );
      return;
    }

    if (
      collateral <= 0n
    ) {
      setError(
        "Collateral amount must be greater than zero.",
      );
      return;
    }

    if (
      !wallet.privateRevealed ||
      wallet.privateStrk === null
    ) {
      setError(
        "Reveal private STRK before starting Unshield Borrow.",
      );
      return;
    }

    if (
      wallet.privateStrk <
      collateral
    ) {
      setError(
        "Private STRK balance is below this collateral amount.",
      );
      return;
    }

    setUnshielding(true);

    try {
      const result =
        await wallet
          .executeUnshieldCollateral(
            collateralAmount,
            `Unshield ${collateralAmount} STRK for Borrow`,
          );

      setUnshieldProgress({
        kind:
          result.status ===
            "confirmed"
            ? "ready"
            : "waiting",

        hash:
          result.hash,

        amount:
          collateralAmount,
      });

      if (
        result.status ===
          "confirmed"
      ) {
        await wallet
          .refreshPublicBalance();
      }
    } catch (cause) {
      setUnshieldProgress({
        kind: "idle",
      });

      setError(
        cause instanceof Error
          ? cause.message
          : "Unshield Borrow collateral failed.",
      );
    } finally {
      setUnshielding(false);
    }
  }

  /**
   * If the initial wallet wait timed out, explicitly check the submitted
   * Unshield transaction before unlocking Vesu.
   */
  async function refreshUnshieldConfirmation() {
    if (
      mode !== "unshield" ||
      unshieldProgress.kind !==
        "waiting" ||
      !network ||
      network.id !==
        "mainnet"
    ) {
      return;
    }

    setCheckingUnshield(true);
    setError("");

    try {
      const receipt:
        unknown =
        await network.provider
          .waitForTransaction(
            unshieldProgress.hash,
            {
              retries: 2,
              retryInterval:
                1500,
            },
          );

      if (
        receipt &&
        typeof receipt ===
          "object"
      ) {
        const executionStatus =
          (
            receipt as Record<
              string,
              unknown
            >
          ).execution_status;

        if (
          executionStatus ===
            "REVERTED"
        ) {
          throw new Error(
            "The Unshield transaction reverted. Vesu Borrow remains locked.",
          );
        }
      }

      await wallet
        .refreshPublicBalance();

      setUnshieldProgress({
        ...unshieldProgress,
        kind: "ready",
      });
    } catch (cause) {
      setError(
        cause instanceof Error &&
        /revert/i.test(
          cause.message,
        )
          ? cause.message
          : "Unshield is not confirmed yet. Vesu Borrow remains locked.",
      );
    } finally {
      setCheckingUnshield(false);
    }
  }

  /**
   * Creates the client-side dependency bridge between the deterministic
   * Agent Core and CAREL's already-guarded live Vesu/STRK20 execution.
   *
   * The Agent never creates calldata here:
   * - Vesu preparation remains server-side.
   * - wallet.executeBorrow still rebuilds and validates Vesu calls.
   * - executeShieldAsset still owns the STRK20 Wallet API boundary.
   */
  function createLiveShieldBorrowRuntime():
    StarknetBorrowRuntime {
    if (
      !selectedMarket ||
      !wallet.address
    ) {
      throw new Error(
        "Review a verified Vesu market and connect Ready before execution.",
      );
    }

    const reviewedMarket =
      selectedMarket;

    return createStarknetBorrowRuntime({
      async prepareBorrow(
        input,
      ) {
        const response =
          await fetch(
            "/api/vesu/borrow/prepare",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              signal:
                input.signal,

              body:
                JSON.stringify({
                  poolId:
                    reviewedMarket
                      .pool.id,

                  owner:
                    input.owner,

                  collateralAmount:
                    input
                      .collateralAmountText,

                  borrowAmount:
                    input
                      .borrowAmountText,

                  collateralAssetId:
                    input
                      .collateralAssetId,

                  debtAssetId:
                    input
                      .debtAssetId,
                }),
            },
          );

        const raw: unknown =
          await response.json();

        const payload =
          responseObject(
            raw,
          );

        if (!response.ok) {
          const blockers =
            Array.isArray(
              payload.blockers,
            )
              ? payload.blockers
                  .filter(
                    (
                      value,
                    ): value is string =>
                      typeof value ===
                      "string",
                  )
              : [];

          throw new Error(
            blockers.length
              ? blockers.join(
                  " ",
                )
              : typeof payload.error ===
                  "string"
                ? payload.error
                : "Vesu Borrow preparation failed.",
          );
        }

        const prepared =
          payload as unknown as
            PrepareResponse;

        if (
          !prepared.execution ||
          prepared.provider !==
            "Vesu" ||
          prepared.pool.id !==
            reviewedMarket
              .pool.id
        ) {
          throw new Error(
            "CAREL received a mismatched Borrow preparation.",
          );
        }

        return {
          execution:
            prepared.execution,

          label:
            "Borrow " +
            input.borrowAmountText +
            " " +
            selectedDebtAsset.symbol +
            " against " +
            input.collateralAmountText +
            " STRK · Vesu " +
            prepared.pool.name,
        };
      },

      async executeBorrow(
        execution,
        label,
      ) {
        /*
         * wallet.executeBorrow already performs the real guarded wallet
         * submission. For this migration we intentionally report the stage
         * as submitted so the generic Agent confirmation path performs the
         * authoritative output verification before Shield can unlock.
         */
        const hash =
          await wallet
            .executeBorrow(
              execution,
              label,
            );

        return {
          hash,

          status:
            "submitted",
        };
      },

      async executeShieldAsset(
        assetId,
        amountText,
        label,
      ) {
        return wallet
          .executeShieldAsset(
            assetId,
            amountText,
            label,
          );
      },

      async executeUnshieldAsset(
        assetId,
        amountText,
        label,
      ) {
        return wallet
          .executeUnshieldAsset(
            assetId,
            amountText,
            label,
          );
      },

      async readPublicBalance(
        input,
      ) {
        const targetNetwork =
          getCarelNetwork(
            input.chainId,
          );

        if (!targetNetwork) {
          throw new Error(
            "Agent output verification received an unsupported Starknet network.",
          );
        }

        const asset =
          targetNetwork
            .assetList
            .find(
              (candidate) =>
                candidate.id ===
                  input.assetId,
            );

        if (!asset) {
          throw new Error(
            "Agent output verification received an unknown CAREL asset.",
          );
        }

        const observed =
          await readStarknetPublicBalances(
            input.account,
            targetNetwork.provider,
            [
              asset,
            ],
          );

        return (
          findAssetBalance(
            observed,
            asset.id,
            "public",
          )?.amount ??
          0n
        );
      },

      async waitForTransaction(
        input,
      ) {
        const targetNetwork =
          getCarelNetwork(
            input.chainId,
          );

        if (!targetNetwork) {
          throw new Error(
            "Agent confirmation received an unsupported Starknet network.",
          );
        }

        const receipt: unknown =
          await targetNetwork
            .provider
            .waitForTransaction(
              input.transactionId,
              {
                retries: 2,
                retryInterval:
                  1500,
              },
            );

        if (
          receipt &&
          typeof receipt ===
            "object" &&
          (
            receipt as Record<
              string,
              unknown
            >
          ).execution_status ===
            "REVERTED"
        ) {
          throw new Error(
            "The Starknet transaction reverted.",
          );
        }
      },
    });
  }


  /**
   * Confirms Borrow through the generic Agent runtime.
   *
   * Shield remains locked until the runtime:
   * 1. observes Starknet confirmation,
   * 2. verifies the actual public Borrow output,
   * 3. records that output in AgentExecutionSession.
   */
  async function refreshShieldBorrowConfirmation() {
    if (
      mode !== "shield" ||
      shieldBorrowProgress.kind !==
        "waiting" ||
      !network ||
      network.id !==
        "mainnet"
    ) {
      return;
    }

    const plan =
      shieldAgentPlanRef.current;

    const session =
      shieldAgentSessionRef.current;

    const runtime =
      shieldAgentRuntimeRef.current;

    if (
      !plan ||
      !session ||
      !runtime
    ) {
      setError(
        "The Shield Borrow Agent session is unavailable. Review the Borrow again.",
      );

      return;
    }

    if (
      shieldAgentAccountRef.current !==
        wallet.address ||
      plan.objective.chainId !==
        wallet.chainId
    ) {
      setError(
        "Wallet account or network changed. Restart Shield Borrow.",
      );

      return;
    }

    setCheckingShieldBorrow(
      true,
    );

    setError("");

    try {
      const next =
        await runtime
          .confirmSubmittedStage(
            plan,
            session,
            "borrow-1",
            {
              runId:
                session.runId,

              chainId:
                wallet.chainId,

              account:
                wallet.address,
            },
          );

      shieldAgentSessionRef.current =
        next;

      const output =
        next.outputs[
          "borrow-1"
        ];

      if (!output) {
        throw new Error(
          "Borrow confirmed without a verified Agent output.",
        );
      }

      try {
        await wallet
          .refreshAssetBalances();
      } catch {
        // Agent verification already read the balance directly on-chain.
      }

      setShieldBorrowProgress({
        ...shieldBorrowProgress,

        kind:
          "ready",

        amount:
          output.amountText,

        amountUnits:
          output.amountUnits ??
          shieldBorrowProgress
            .amountUnits,

        debtSymbol:
          output.assetSymbol,
      });

      setSuccess(
        "Borrow confirmed and " +
        output.amountText +
        " " +
        output.assetSymbol +
        " verified. Shield is unlocked.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Borrow is not confirmed and verified yet. Shield remains locked.",
      );
    } finally {
      setCheckingShieldBorrow(
        false,
      );
    }
  }


  /**
   * Executes Shield only from the verified Agent Borrow output.
   *
   * shieldBorrowProgress is now display state only; the exact Shield amount
   * is resolved by executeAgentStage from session.outputs["borrow-1"].
   */
  async function shieldBorrowProceeds() {
    if (
      mode !== "shield" ||
      shieldBorrowProgress.kind !==
        "ready" ||
      shieldingBorrow
    ) {
      return;
    }

    let expected:
      bigint;

    let publicBefore:
      bigint;

    try {
      expected =
        BigInt(
          shieldBorrowProgress
            .amountUnits,
        );

      publicBefore =
        BigInt(
          shieldBorrowProgress
            .publicBefore,
        );
    } catch {
      setError(
        "Shield Borrow contains invalid reviewed balance metadata.",
      );

      return;
    }

    const current =
      findAssetBalance(
        wallet.balances,
        shieldBorrowProgress
          .debtAssetId,
        "public",
      )?.amount;

    if (
      current === null ||
      current === undefined ||
      current <
        publicBefore +
          expected
    ) {
      setError(
        "The verified borrowed asset is not visible in the public wallet yet.",
      );

      return;
    }

    if (
      !wallet.strk20Capable
    ) {
      setError(
        "Ready does not report the STRK20 Wallet API required for Shield Borrow.",
      );

      return;
    }

    const plan =
      shieldAgentPlanRef.current;

    const session =
      shieldAgentSessionRef.current;

    const runtime =
      shieldAgentRuntimeRef.current;

    if (
      !plan ||
      !session ||
      !runtime
    ) {
      setError(
        "The Shield Borrow Agent session is unavailable.",
      );

      return;
    }

    if (
      shieldAgentAccountRef.current !==
        wallet.address ||
      plan.objective.chainId !==
        wallet.chainId
    ) {
      setError(
        "Wallet account or network changed. Restart Shield Borrow.",
      );

      return;
    }

    setShieldingBorrow(
      true,
    );

    setError("");
    setSuccess("");

    try {
      const result =
        await executeAgentStage(
          plan,
          session,
          "shield-2",
          {
            runId:
              session.runId,

            chainId:
              wallet.chainId,

            account:
              wallet.address,
          },
          runtime.registry,
        );

      shieldAgentSessionRef.current =
        result.session;

      const status =
        result.receipt.status ===
          "confirmed"
          ? "confirmed"
          : "submitted";

      setShieldBorrowProgress({
        kind:
          "shielded",

        borrowHash:
          shieldBorrowProgress
            .borrowHash,

        shieldHash:
          result.receipt
            .transactionId,

        amount:
          shieldBorrowProgress
            .amount,

        debtAssetId:
          shieldBorrowProgress
            .debtAssetId,

        debtSymbol:
          shieldBorrowProgress
            .debtSymbol,

        status,
      });

      setSuccess(
        "Borrowed " +
        shieldBorrowProgress
          .amount +
        " " +
        shieldBorrowProgress
          .debtSymbol +
        "; Shield " +
        status +
        ".",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not execute the Agent Shield stage.",
      );
    } finally {
      setShieldingBorrow(
        false,
      );
    }
  }


  /**
   * Completes a Shield stage that was submitted but did not finish within
   * the wallet-side confirmation window.
   */
  async function refreshShieldStageConfirmation() {
    if (
      mode !== "shield" ||
      shieldBorrowProgress.kind !==
        "shielded" ||
      shieldBorrowProgress.status !==
        "submitted"
    ) {
      return;
    }

    const plan =
      shieldAgentPlanRef.current;

    const session =
      shieldAgentSessionRef.current;

    const runtime =
      shieldAgentRuntimeRef.current;

    if (
      !plan ||
      !session ||
      !runtime
    ) {
      setError(
        "The Shield Agent session is unavailable.",
      );

      return;
    }

    if (
      shieldAgentAccountRef.current !==
        wallet.address ||
      plan.objective.chainId !==
        wallet.chainId
    ) {
      setError(
        "Wallet account or network changed. Restart Shield Borrow.",
      );

      return;
    }

    setCheckingShieldBorrow(
      true,
    );

    setError("");

    try {
      const next =
        await runtime
          .confirmSubmittedStage(
            plan,
            session,
            "shield-2",
            {
              runId:
                session.runId,

              chainId:
                wallet.chainId,

              account:
                wallet.address,
            },
          );

      shieldAgentSessionRef.current =
        next;

      setShieldBorrowProgress({
        ...shieldBorrowProgress,

        status:
          "confirmed",
      });

      setSuccess(
        "Borrow and Shield Agent plan completed.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Shield is not confirmed yet.",
      );
    } finally {
      setCheckingShieldBorrow(
        false,
      );
    }
  }


  /**
   * Requests a fresh risk evaluation for the exact user-entered amounts.
   */
  async function reviewBorrow() {
    if (
      mode === "shield" &&
      shieldBorrowProgress.kind !==
        "idle"
    ) {
      setReviewed(false);

      setError(
        "Finish the current Shield Borrow flow before reviewing another Borrow.",
      );

      return;
    }

    if (
      mode === "unshield" &&
      unshieldProgress.kind !==
        "ready"
    ) {
      setReviewed(false);

      setError(
        "Complete and confirm the Unshield collateral step first.",
      );

      return;
    }

    try {
      await loadMarkets(
        true,
      );
    } catch (cause) {
      setReviewed(false);

      setError(
        cause instanceof Error
          ? cause.message
          : "Could not review this Borrow.",
      );
    }
  }

  /**
   * Re-prepares the reviewed market, lets the server refresh all risk
   * checks, and finally sends only the strict execution payload to Ready.
   */
  async function executeBorrow() {
    if (
      mode === "shield" &&
      shieldBorrowProgress.kind !==
        "idle"
    ) {
      setError(
        "Finish the current Shield Borrow flow first.",
      );

      return;
    }

    if (
      mode === "unshield" &&
      unshieldProgress.kind !==
        "ready"
    ) {
      setError(
        "Unshield collateral must be confirmed before Vesu Borrow.",
      );

      return;
    }

    if (
      executing ||
      wallet.busy ||
      !wallet.address ||
      !selectedMarket ||
      !selectedMarket
        .evaluation
        ?.eligible
    ) {
      return;
    }

    setExecuting(true);
    setError("");
    setSuccess("");

    try {
      if (
        mode === "shield"
      ) {
        if (
          !network ||
          network.id !==
            "mainnet"
        ) {
          throw new Error(
            "Shield Borrow requires Starknet Mainnet.",
          );
        }

        const agentGoal =
          "Borrow " +
          borrowAmount +
          " " +
          selectedDebtAsset.symbol +
          " against " +
          collateralAmount +
          " STRK but keep the result private.";

        const plan =
          buildStarknetAgentPlan({
            goal:
              agentGoal,

            chainId:
              wallet.chainId,

            mode:
              "shield",
          });

        if (
          plan.status !==
            "ready"
        ) {
          throw new Error(
            plan.message ??
            "CAREL could not build the Shield Borrow Agent plan.",
          );
        }

        const runId =
          "borrow-" +
          Date.now()
            .toString(36) +
          "-" +
          Math.random()
            .toString(36)
            .slice(2);

        const session =
          createAgentExecutionSession(
            plan,
            runId,
          );

        const runtime =
          createLiveShieldBorrowRuntime();

        shieldAgentPlanRef.current =
          plan;

        shieldAgentSessionRef.current =
          session;

        shieldAgentRuntimeRef.current =
          runtime;

        shieldAgentAccountRef.current =
          wallet.address;

        /*
         * Kept only for the current UI readiness indicator.
         * The Agent runtime independently records its authoritative on-chain
         * baseline before Vesu submission.
         */
        const publicDebtBefore =
          findAssetBalance(
            wallet.balances,
            selectedDebtAsset.id,
            "public",
          )?.amount ??
          0n;

        const expectedShieldAmount =
          parseUnits(
            borrowAmount,
            selectedDebtAsset
              .decimals,
          );

        const result =
          await executeAgentStage(
            plan,
            session,
            "borrow-1",
            {
              runId:
                session.runId,

              chainId:
                wallet.chainId,

              account:
                wallet.address,
            },
            runtime.registry,
          );

        shieldAgentSessionRef.current =
          result.session;

        const verified =
          result.session
            .outputs[
              "borrow-1"
            ];

        setShieldBorrowProgress({
          kind:
            verified
              ? "ready"
              : "waiting",

          borrowHash:
            result.receipt
              .transactionId,

          amount:
            verified
              ?.amountText ??
            borrowAmount,

          amountUnits:
            verified
              ?.amountUnits ??
            expectedShieldAmount
              .toString(),

          debtAssetId:
            selectedDebtAsset.id,

          debtSymbol:
            verified
              ?.assetSymbol ??
            selectedDebtAsset
              .symbol,

          publicBefore:
            publicDebtBefore
              .toString(),
        });

        setSuccess(
          verified
            ? "Borrow confirmed and verified. Shield is unlocked."
            : "Borrow submitted through Agent Core. Confirm it before Shield.",
        );

        setReviewed(
          false,
        );

        return;
      }

      const response =
        await fetch(
          "/api/vesu/borrow/prepare",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                poolId:
                  selectedMarket
                    .pool.id,

                owner:
                  wallet.address,

                collateralAmount,

                borrowAmount,

                collateralAssetId:
                  network?.assets
                    .strk.id,

                debtAssetId:
                  selectedDebtAsset.id,
              }),
          },
        );

      const raw: unknown =
        await response.json();

      const payload =
        responseObject(
          raw,
        );

      if (!response.ok) {
        const blockers =
          Array.isArray(
            payload.blockers,
          )
            ? payload.blockers
                .filter(
                  (
                    value,
                  ): value is string =>
                    typeof value ===
                    "string",
                )
            : [];

        throw new Error(
          blockers.length
            ? blockers.join(
                " ",
              )
            : typeof payload.error ===
                "string"
              ? payload.error
              : "Vesu Borrow preparation failed.",
        );
      }

      const prepared =
        payload as unknown as
          PrepareResponse;

      if (
        !prepared.execution ||
        prepared.provider !==
          "Vesu" ||
        prepared.pool.id !==
          selectedMarket
            .pool.id
      ) {
        throw new Error(
          "CAREL received a mismatched Borrow preparation.",
        );
      }

      const publicDebtBefore =
        findAssetBalance(
          wallet.balances,
          selectedDebtAsset.id,
          "public",
        )?.amount ?? 0n;

      const expectedShieldAmount =
        parseUnits(
          borrowAmount,
          selectedDebtAsset
            .decimals,
        );

      const hash =
        await wallet.executeBorrow(
          prepared.execution,
          `Borrow ${borrowAmount} ${selectedDebtAsset.symbol} against ${collateralAmount} STRK · Vesu ${prepared.pool.name}`,
        );

      setSuccess(
        `Borrow submitted: ${hash.slice(
          0,
          10,
        )}…${hash.slice(-6)}`,
      );

      setReviewed(false);

      try {
        await loadMarkets(
          false,
        );
      } catch {
        // Execution result remains visible even if market refresh fails.
      }
    } catch (cause) {
      if (
        mode === "shield"
      ) {
        shieldAgentPlanRef.current =
          null;

        shieldAgentSessionRef.current =
          null;

        shieldAgentRuntimeRef.current =
          null;

        shieldAgentAccountRef.current =
          "";

        setShieldBorrowProgress({
          kind:
            "idle",
        });
      }

      setError(
        cause instanceof Error
          ? cause.message
          : "Vesu Borrow failed.",
      );
    } finally {
      setExecuting(false);
    }
  }

  if (!wallet.connected) {
    return (
      <section
        className={
          styles.borrowPanel
        }
      >
        <p
          className={
            styles.helper
          }
        >
          Connect Ready to review
          a Vesu Borrow position.
        </p>

        <button
          type="button"
          className={
            styles.secondary
          }
          disabled={
            wallet.connecting
          }
          onClick={() =>
            void wallet.connect()
          }
        >
          <WalletCards
            size={16}
          />
          {wallet.connecting
            ? "Connecting…"
            : "Connect wallet"}
        </button>
      </section>
    );
  }

  if (
    !network ||
    network.id !==
      "mainnet"
  ) {
    return (
      <section
        className={
          styles.borrowPanel
        }
      >
        <div
          className={
            styles.notice
          }
        >
          <p>
            Vesu Borrow is enabled
            on Starknet Mainnet.
            Switch Ready to Mainnet
            and reconnect.
          </p>
        </div>
      </section>
    );
  }

  const shieldDebtAssetId =
    shieldBorrowProgress.kind ===
      "idle"
      ? null
      : shieldBorrowProgress
          .debtAssetId;

  const shieldDebtBalance =
    shieldDebtAssetId
      ? findAssetBalance(
          wallet.balances,
          shieldDebtAssetId,
          "public",
        )?.amount ?? null
      : null;

  let shieldExpected:
    bigint | null =
      null;

  let shieldPublicBefore:
    bigint | null =
      null;

  if (
    shieldBorrowProgress.kind ===
      "waiting" ||
    shieldBorrowProgress.kind ===
      "ready"
  ) {
    try {
      shieldExpected =
        BigInt(
          shieldBorrowProgress
            .amountUnits,
        );

      shieldPublicBefore =
        BigInt(
          shieldBorrowProgress
            .publicBefore,
        );
    } catch {
      shieldExpected =
        null;

      shieldPublicBefore =
        null;
    }
  }

  const shieldFundsReady =
    shieldExpected !== null &&
    shieldPublicBefore !== null &&
    shieldDebtBalance !== null &&
    shieldDebtBalance >=
      shieldPublicBefore +
        shieldExpected;

  const shieldFlowLocked =
    mode === "shield" &&
    shieldBorrowProgress.kind !==
      "idle";


  let parsedCollateral:
    bigint | null =
      null;

  try {
    const value =
      parseUnits(
        collateralAmount,
        network.assets.strk
          .decimals,
      );

    if (
      value > 0n
    ) {
      parsedCollateral =
        value;
    }
  } catch {
    parsedCollateral =
      null;
  }

  const privateEnough =
    parsedCollateral !==
      null &&
    wallet.privateStrk !==
      null &&
    wallet.privateStrk >=
      parsedCollateral;

  const publicEnough =
    parsedCollateral !==
      null &&
    wallet.publicStrk !==
      null &&
    wallet.publicStrk >=
      parsedCollateral;

  const unshieldBorrowReady =
    mode !== "unshield" ||
    (
      unshieldProgress.kind ===
        "ready" &&
      publicEnough
    );

  const evaluation =
    reviewed
      ? selectedMarket
          ?.evaluation ??
        null
      : null;

  const debtDecimals =
    selectedMarket?.debt
      .decimals ??
    selectedDebtAsset
      .decimals;

  const available =
    selectedMarket
      ? formatUnits(
          BigInt(
            selectedMarket
              .risk
              .availableLiquidity,
          ),
          debtDecimals,
          2,
        )
      : "—";

  const riskPosition =
    evaluation
      ? Math.min(
          100,
          evaluation
            .requestedLtvBps /
            Math.max(
              1,
              selectedMarket
                ?.risk
                .maxLtvBps ??
                1,
            ) *
            100,
        )
      : 0;

  return (
    <section
      className={
        styles.borrowPanel
      }
    >
      {mode === "shield" && (
        <div
          className={
            styles.borrowRisk
          }
        >
          <div
            className={
              styles.rule
            }
          >
            <span>
              Route
            </span>

            <strong>
              Public STRK → Vesu → Private {
                shieldBorrowProgress.kind ===
                  "idle"
                  ? selectedDebtAsset
                      .symbol
                  : shieldBorrowProgress
                      .debtSymbol
              }
            </strong>
          </div>

          {shieldBorrowProgress.kind ===
            "idle" ? (
            <div
              className={
                styles.notice
              }
              role="status"
            >
              <p>
                Step 1 creates the
                public Vesu Borrow
                position. After it is
                confirmed, CAREL
                unlocks a separate
                Shield transaction
                for the exact borrowed
                asset amount.
              </p>
            </div>
          ) : shieldBorrowProgress.kind ===
              "waiting" ? (
            <>
              <div
                className={
                  styles.notice
                }
                role="status"
              >
                <p>
                  Borrow submitted.
                  Shield remains locked
                  until the Vesu
                  transaction is
                  confirmed.
                </p>
              </div>

              <div
                className={
                  styles.rule
                }
              >
                <span>
                  Borrow tx
                </span>

                <strong
                  className={
                    styles.borrowAddress
                  }
                >
                  {shortAddress(
                    shieldBorrowProgress
                      .borrowHash,
                  )}
                </strong>
              </div>

              <button
                type="button"
                className={
                  styles.secondary
                }
                disabled={busy}
                onClick={() =>
                  void refreshShieldBorrowConfirmation()
                }
              >
                <RefreshCw
                  size={16}
                />

                {checkingShieldBorrow
                  ? "Checking confirmation…"
                  : "Check Borrow confirmation"}
              </button>
            </>
          ) : shieldBorrowProgress.kind ===
              "ready" &&
            !shieldFundsReady ? (
            <>
              <p
                className={
                  styles.inlineStatus
                }
              >
                <Check
                  size={16}
                />
                Vesu Borrow confirmed.
              </p>

              <div
                className={
                  styles.notice
                }
                role="status"
              >
                <p>
                  Waiting for {
                    shieldBorrowProgress
                      .amount
                  } {
                    shieldBorrowProgress
                      .debtSymbol
                  } to appear in the
                  public wallet before
                  Shield.
                </p>
              </div>

              <button
                type="button"
                className={
                  styles.secondary
                }
                disabled={busy}
                onClick={() =>
                  void wallet
                    .refreshAssetBalances()
                }
              >
                <RefreshCw
                  size={16}
                />
                Refresh public balance
              </button>
            </>
          ) : shieldBorrowProgress.kind ===
              "ready" ? (
            <>
              <p
                className={
                  styles.inlineStatus
                }
              >
                <Check
                  size={16}
                />
                Borrowed {
                  shieldBorrowProgress
                    .amount
                } {
                  shieldBorrowProgress
                    .debtSymbol
                } ready to Shield.
              </p>

              <button
                type="button"
                className={
                  styles.primary
                }
                disabled={
                  busy ||
                  !wallet.strk20Capable ||
                  !shieldFundsReady
                }
                onClick={() =>
                  void shieldBorrowProceeds()
                }
              >
                {shieldingBorrow ? (
                  <LoaderCircle
                    size={16}
                  />
                ) : (
                  <ShieldAlert
                    size={16}
                  />
                )}

                {shieldingBorrow
                  ? "Shielding proceeds…"
                  : `Review & Shield ${shieldBorrowProgress.amount} ${shieldBorrowProgress.debtSymbol}`}
              </button>
            </>
          ) : (
            <>
              <p
                className={
                  styles.inlineStatus
                }
              >
                <Check
                  size={16}
                />
                Borrow complete.
                Shield {
                  shieldBorrowProgress
                    .status
                }.
              </p>

              <div
                className={
                  styles.rule
                }
              >
                <span>
                  Shield tx
                </span>

                <strong
                  className={
                    styles.borrowAddress
                  }
                >
                  {shortAddress(
                    shieldBorrowProgress
                      .shieldHash,
                  )}
                </strong>
              </div>

              {shieldBorrowProgress
                .status ===
                  "submitted" && (
                <button
                  type="button"
                  className={
                    styles.secondary
                  }
                  disabled={busy}
                  onClick={() =>
                    void refreshShieldStageConfirmation()
                  }
                >
                  <RefreshCw
                    size={16}
                  />

                  {checkingShieldBorrow
                    ? "Checking Shield confirmation…"
                    : "Check Shield confirmation"}
                </button>
              )}
            </>
          )}

          <p
            className={
              styles.privacyNote
            }
          >
            Vesu collateral and debt
            remain public. Shield mode
            moves only the reviewed
            borrowed proceeds into
            STRK20 privacy.
          </p>
        </div>
      )}

      {mode === "unshield" && (
        <div
          className={
            styles.borrowRisk
          }
        >
          <div
            className={
              styles.rule
            }
          >
            <span>
              Route
            </span>

            <strong>
              Private STRK → Public STRK → Vesu
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Collateral
            </span>

            <strong>
              {collateralAmount ||
                "—"}{" "}
              STRK
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Private STRK
            </span>

            <strong>
              {!wallet.privateRevealed
                ? "Hidden"
                : wallet.privateStrk ===
                    null
                  ? "—"
                  : `${formatUnits(
                      wallet.privateStrk,
                      network.assets
                        .strk
                        .decimals,
                      6,
                    )} STRK`}
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Public STRK
            </span>

            <strong>
              {wallet.publicStrk ===
                null
                ? "—"
                : `${formatUnits(
                    wallet.publicStrk,
                    network.assets
                      .strk
                      .decimals,
                    6,
                  )} STRK`}
            </strong>
          </div>

          {!wallet.strk20Capable ? (
            <div
              className={
                styles.notice
              }
              role="alert"
            >
              <p>
                The connected wallet
                does not report the
                STRK20 Wallet API
                required for
                Unshield Borrow.
              </p>
            </div>
          ) : !wallet.privateRevealed ? (
            <button
              type="button"
              className={
                styles.secondary
              }
              disabled={busy}
              onClick={() =>
                void wallet
                  .revealPrivateBalance()
              }
            >
              <RefreshCw
                size={16}
              />
              Reveal private STRK
            </button>
          ) : unshieldProgress.kind ===
              "idle" ? (
            <>
              {!privateEnough &&
                parsedCollateral !==
                  null && (
                  <div
                    className={
                      styles.notice
                    }
                    role="alert"
                  >
                    <p>
                      Private STRK
                      balance is below
                      this collateral
                      amount.
                    </p>
                  </div>
                )}

              <button
                type="button"
                className={
                  styles.primary
                }
                disabled={
                  busy ||
                  parsedCollateral ===
                    null ||
                  !privateEnough
                }
                onClick={() =>
                  void startUnshieldBorrow()
                }
              >
                {unshielding ? (
                  <LoaderCircle
                    size={16}
                  />
                ) : (
                  <ShieldAlert
                    size={16}
                  />
                )}

                {unshielding
                  ? "Unshielding collateral…"
                  : "Review & Unshield collateral"}
              </button>
            </>
          ) : unshieldProgress.kind ===
              "waiting" ? (
            <>
              <div
                className={
                  styles.notice
                }
                role="status"
              >
                <p>
                  Unshield submitted.
                  Vesu remains locked
                  until Starknet
                  confirms it.
                </p>
              </div>

              <div
                className={
                  styles.rule
                }
              >
                <span>
                  Unshield tx
                </span>

                <strong
                  className={
                    styles.borrowAddress
                  }
                >
                  {shortAddress(
                    unshieldProgress
                      .hash,
                  )}
                </strong>
              </div>

              <button
                type="button"
                className={
                  styles.secondary
                }
                disabled={busy}
                onClick={() =>
                  void refreshUnshieldConfirmation()
                }
              >
                <RefreshCw
                  size={16}
                />

                {checkingUnshield
                  ? "Checking confirmation…"
                  : "Check confirmation"}
              </button>
            </>
          ) : !publicEnough ? (
            <>
              <p
                className={
                  styles.inlineStatus
                }
              >
                <Check
                  size={16}
                />
                Unshield confirmed.
              </p>

              <div
                className={
                  styles.notice
                }
                role="status"
              >
                <p>
                  Waiting for the
                  public STRK balance
                  to reflect enough
                  collateral before
                  Vesu is unlocked.
                </p>
              </div>

              <button
                type="button"
                className={
                  styles.secondary
                }
                disabled={busy}
                onClick={() =>
                  void wallet
                    .refreshPublicBalance()
                }
              >
                <RefreshCw
                  size={16}
                />
                Refresh public balance
              </button>
            </>
          ) : (
            <>
              <p
                className={
                  styles.inlineStatus
                }
              >
                <Check
                  size={16}
                />
                Public collateral
                ready. Vesu Borrow
                is unlocked.
              </p>

              <div
                className={
                  styles.rule
                }
              >
                <span>
                  Unshielded
                </span>

                <strong>
                  {
                    unshieldProgress
                      .amount
                  }{" "}
                  STRK
                </strong>
              </div>
            </>
          )}

          <p
            className={
              styles.privacyNote
            }
          >
            Unshield and Vesu Borrow
            are separate transactions.
            The collateral amount and
            destination become public
            before Vesu execution.
          </p>
        </div>
      )}

      <div
        className={
          styles.borrowPair
        }
      >
        <label
          className={
            styles.borrowField
          }
        >
          <span>
            Collateral
          </span>

          <div
            className={
              styles.borrowInput
            }
          >
            <input
              inputMode="decimal"
              value={
                collateralAmount
              }
              disabled={
                busy ||
                shieldFlowLocked ||
                (
                  mode ===
                    "unshield" &&
                  unshieldProgress
                    .kind !==
                    "idle"
                )
              }
              onChange={(
                event,
              ) =>
                changeCollateral(
                  event.target
                    .value,
                )
              }
              aria-label="STRK collateral amount"
            />

            <strong>
              STRK
            </strong>
          </div>
        </label>

        <span
          className={
            styles.borrowArrow
          }
          aria-hidden="true"
        >
          <ArrowRight
            size={17}
          />
        </span>

        <label
          className={
            styles.borrowField
          }
        >
          <span>
            Borrow
          </span>

          <div
            className={
              styles.borrowInput
            }
          >
            <input
              inputMode="decimal"
              value={
                borrowAmount
              }
              disabled={
                busy ||
                shieldFlowLocked
              }
              onChange={(
                event,
              ) =>
                changeBorrow(
                  event.target
                    .value,
                )
              }
              aria-label={`${selectedDebtAsset.symbol} borrow amount`}
            />

            <strong>
              {selectedDebtAsset.symbol}
            </strong>
          </div>
        </label>
      </div>

      <div
        className={
          styles.rule
        }
      >
        <span>
          Borrow asset
        </span>

        <select
          className={
            styles.borrowSelect
          }
          value={
            debtAssetId
          }
          disabled={
            busy ||
            shieldFlowLocked
          }
          onChange={(
            event,
          ) => {
            setDebtAssetId(
              event.target
                .value,
            );

            setMarkets([]);
            setSelectedPoolId("");
            setReviewed(false);
            setError("");
            setSuccess("");

            if (
              mode === "shield"
            ) {
              setShieldBorrowProgress({
                kind: "idle",
              });
            }
          }}
        >
          {VESU_BORROW_DEBT_ASSETS.map(
            (asset) => (
              <option
                key={asset.id}
                value={asset.id}
              >
                {asset.symbol}
              </option>
            ),
          )}
        </select>
      </div>

      <div
        className={
          styles.rule
        }
      >
        <span>
          Provider
        </span>

        <strong>
          Vesu
        </strong>
      </div>

      <div
        className={
          styles.rule
        }
      >
        <span>
          Pool
        </span>

        {markets.length >
        1 ? (
          <select
            className={
              styles.borrowSelect
            }
            value={
              selectedMarket
                ?.pool.id ??
              ""
            }
            disabled={
              busy ||
              shieldFlowLocked
            }
            onChange={(
              event,
            ) => {
              setSelectedPoolId(
                event.target
                  .value,
              );

              setReviewed(
                false,
              );

              setSuccess("");
            }}
          >
            {markets.map(
              (market) => (
                <option
                  key={
                    market
                      .pool.id
                  }
                  value={
                    market
                      .pool.id
                  }
                >
                  {
                    market
                      .pool.name
                  }
                </option>
              ),
            )}
          </select>
        ) : (
          <strong>
            {selectedMarket
              ?.pool.name ??
              "Loading…"}
          </strong>
        )}
      </div>

      {selectedMarket && (
        <>
          <div
            className={
              styles.rule
            }
          >
            <span>
              Pool contract
            </span>

            <strong
              className={
                styles.borrowAddress
              }
            >
              {shortAddress(
                selectedMarket
                  .pool
                  .address,
              )}
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Current utilization
            </span>

            <strong>
              {formatBps(
                selectedMarket
                  .risk
                  .utilizationBps,
              )}
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Available {selectedDebtAsset.symbol}
            </span>

            <strong>
              {available}
            </strong>
          </div>
        </>
      )}

      <button
        type="button"
        className={
          styles.secondary
        }
        disabled={
          busy ||
          !unshieldBorrowReady ||
          shieldFlowLocked
        }
        onClick={() =>
          void reviewBorrow()
        }
      >
        {loading ? (
          <LoaderCircle
            size={16}
          />
        ) : (
          <RefreshCw
            size={16}
          />
        )}

        {loading
          ? "Checking market…"
          : mode ===
              "unshield" &&
            !unshieldBorrowReady
            ? "Complete Unshield first"
            : "Check Borrow risk"}
      </button>

      {evaluation &&
        selectedMarket && (
          <div
            className={
              styles.borrowRisk
            }
          >
            <div
              className={
                styles.rule
              }
            >
              <span>
                Requested LTV
              </span>

              <strong>
                {formatBps(
                  evaluation
                    .requestedLtvBps,
                )}
              </strong>
            </div>

            <div
              className={
                styles.rule
              }
            >
              <span>
                Pool max LTV
              </span>

              <strong>
                {formatBps(
                  selectedMarket
                    .risk
                    .maxLtvBps,
                )}
              </strong>
            </div>

            <div
              className={
                styles.borrowRiskTrack
              }
              role="img"
              aria-label={`Requested LTV ${formatBps(
                evaluation
                  .requestedLtvBps,
              )}; pool maximum ${formatBps(
                selectedMarket
                  .risk
                  .maxLtvBps,
              )}`}
            >
              <span
                style={{
                  width:
                    `${riskPosition}%`,
                }}
              />
            </div>

            <div
              className={
                styles.rule
              }
            >
              <span>
                Projected utilization
              </span>

              <strong>
                {formatBps(
                  evaluation
                    .projectedUtilizationBps,
                )}
              </strong>
            </div>

            <div
              className={
                styles.rule
              }
            >
              <span>
                Liquidation factor
              </span>

              <strong>
                {formatBps(
                  selectedMarket
                    .risk
                    .liquidationFactorBps,
                )}
              </strong>
            </div>

            {evaluation
              .eligible ? (
              <>
                <p
                  className={
                    styles.inlineStatus
                  }
                >
                  <Check
                    size={16}
                  />
                  Current on-chain
                  checks pass for
                  this requested
                  position.
                </p>

                <p
                  className={
                    styles.privacyNote
                  }
                >
                  Borrow creates a
                  public Vesu debt
                  position. LTV can
                  change as asset
                  prices and accrued
                  debt change.
                </p>

                <button
                  type="button"
                  className={
                    styles.primary
                  }
                  disabled={busy}
                  onClick={() =>
                    void executeBorrow()
                  }
                >
                  {executing ? (
                    <LoaderCircle
                      size={16}
                    />
                  ) : (
                    <ShieldAlert
                      size={16}
                    />
                  )}

                  {executing
                    ? "Waiting for wallet…"
                    : "Review & Borrow"}
                </button>
              </>
            ) : (
              <div
                className={
                  styles.notice
                }
                role="alert"
              >
                <p>
                  This requested
                  position does not
                  pass the current
                  Vesu market
                  constraints.
                </p>

                {evaluation
                  .blockers.map(
                    (
                      blocker,
                    ) => (
                      <p
                        key={
                          blocker
                        }
                      >
                        •{" "}
                        {
                          blocker
                        }
                      </p>
                    ),
                  )}
              </div>
            )}
          </div>
        )}

      {error && (
        <div
          className={
            styles.error
          }
          role="alert"
        >
          <strong>
            Borrow unavailable
          </strong>

          <p>
            {error}
          </p>
        </div>
      )}

      {success && (
        <p
          className={
            styles.inlineStatus
          }
        >
          <Check
            size={16}
          />
          {success}
        </p>
      )}
    </section>
  );
}
