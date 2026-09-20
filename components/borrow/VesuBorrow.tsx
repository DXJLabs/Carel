"use client";

import {
  useEffect,
  useMemo,
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
  parseBorrowGoal,
} from "@/lib/agent/borrow";

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
   * Requests a fresh risk evaluation for the exact user-entered amounts.
   */
  async function reviewBorrow() {
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
      setError(
        cause instanceof Error
          ? cause.message
          : "Vesu Borrow failed.",
      );
    } finally {
      setExecuting(false);
    }
  }

  if (mode === "shield") {
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
            Shield Borrow is not
            enabled. Vesu debt is a
            public position. Use
            Normal for public
            collateral or Unshield
            to move private STRK
            public before Borrow.
          </p>

          <button
            type="button"
            className={
              styles.textButton
            }
            onClick={
              onPublicMode
            }
          >
            Use Normal mode
            <ArrowRight
              size={14}
            />
          </button>
        </div>
      </section>
    );
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
              disabled={busy}
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
          disabled={busy}
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
            disabled={busy}
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
          !unshieldBorrowReady
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
