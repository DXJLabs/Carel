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
  findAssetBalance,
} from "@/lib/carel/core/balances";

import {
  parseLendGoal,
} from "@/lib/agent/lending";

import {
  VESU_LEND_ASSETS,
  getVesuLendAssetBySymbol,
  type VesuLendExecutionPayload,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/lending";

import type {
  VesuShieldLendExecutionPayload,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/private-lending";

import styles from "../CarelWorkspace.module.css";


type LendMode =
  | "normal"
  | "shield"
  | "unshield";


type UnshieldLendProgress =
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


type LendMarket =
  Readonly<{
    id: string;

    provider: string;

    pool:
      Readonly<{
        id: string;
        name: string;
        address: string;
      }>;

    asset:
      Readonly<{
        id: string;
        symbol: string;
        decimals: number;
      }>;

    counterpart:
      Readonly<{
        id: string;
        symbol: string;
        decimals: number;
      }>;

    market:
      Readonly<{
        utilizationBps: number;
        maxUtilizationBps: number;
        observedAt: number;
      }>;
  }>;


function responseObject(
  value: unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "CAREL Lend API returned an invalid response.",
    );
  }

  return value as Record<
    string,
    unknown
  >;
}


function shortAddress(
  address: string,
): string {
  if (
    address.length <= 16
  ) {
    return address;
  }

  return `${address.slice(
    0,
    8,
  )}…${address.slice(-6)}`;
}


function percentFromBps(
  value: number,
): string {
  return `${(
    value / 100
  ).toFixed(2)}%`;
}


export function VesuLend({
  mode,
  goal,
  onPublicMode,
}: {
  mode: LendMode;
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
    amount,
    setAmount,
  ] = useState("1");

  const [
    selectedAssetId,
    setSelectedAssetId,
  ] = useState(
    VESU_LEND_ASSETS[0].id,
  );

  const [
    markets,
    setMarkets,
  ] = useState<
    readonly LendMarket[]
  >([]);

  const [
    selectedPoolId,
    setSelectedPoolId,
  ] = useState("");

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
  ] = useState<UnshieldLendProgress>({
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


  const selectedAsset =
    useMemo(
      () =>
        VESU_LEND_ASSETS.find(
          (asset) =>
            asset.id ===
            selectedAssetId,
        ) ??
        VESU_LEND_ASSETS[0],

      [selectedAssetId],
    );


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


  useEffect(() => {
    try {
      const parsed =
        parseLendGoal(
          goal,
        );

      const asset =
        getVesuLendAssetBySymbol(
          parsed.symbol,
        );

      if (asset) {
        setSelectedAssetId(
          asset.id,
        );

        setAmount(
          parsed.amountText,
        );

        setUnshieldProgress({
          kind: "idle",
        });
      }
    } catch {
      // Manual form remains available.
    }
  }, [goal]);


  async function loadMarkets(
    assetId:
      string =
      selectedAssetId,
  ) {
    if (
      !network ||
      network.id !==
        "mainnet"
    ) {
      setMarkets([]);

      throw new Error(
        "CAREL Lend is currently enabled on Starknet Mainnet only.",
      );
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const query =
        new URLSearchParams({
          assetId,
        });

      const response =
        await fetch(
          `/api/vesu/lend/markets?${query.toString()}`,
          {
            cache:
              "no-store",
          },
        );

      const raw:
        unknown =
        await response.json();

      const payload =
        responseObject(
          raw,
        );

      if (
        !response.ok
      ) {
        throw new Error(
          typeof payload.error ===
            "string"
            ? payload.error
            : "Could not load Vesu lending markets.",
        );
      }

      const discovered =
        Array.isArray(
          payload.markets,
        )
          ? payload.markets as LendMarket[]
          : [];

      if (
        !discovered.length
      ) {
        throw new Error(
          `No verified Vesu ${selectedAsset.symbol} lending market is available right now.`,
        );
      }

      setMarkets(
        discovered,
      );

      setSelectedPoolId(
        discovered[0]
          .pool.id,
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
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
        selectedAssetId,
      ).catch(
        (cause) => {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load Vesu lending markets.",
          );
        },
      );
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    wallet.address,
    wallet.chainId,
    mode,
    selectedAssetId,
  ]);


  useEffect(() => {
    setUnshieldProgress({
      kind: "idle",
    });
  }, [
    wallet.address,
    wallet.chainId,
    mode,
    selectedAssetId,
  ]);


  async function startUnshieldLend() {
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

    let units: bigint;

    try {
      units =
        parseUnits(
          amount,
          selectedAsset.decimals,
        );
    } catch {
      setError(
        `Enter a valid ${selectedAsset.symbol} amount.`,
      );
      return;
    }

    if (units <= 0n) {
      setError(
        "Lend amount must be greater than zero.",
      );
      return;
    }

    if (!wallet.privateRevealed) {
      setError(
        `Reveal private ${selectedAsset.symbol} before Unshield Lend.`,
      );
      return;
    }

    const privateBalance =
      findAssetBalance(
        wallet.balances,
        selectedAsset.id,
        "private",
      )?.amount ?? 0n;

    if (
      privateBalance <
      units
    ) {
      setError(
        `Private ${selectedAsset.symbol} balance is below this Lend amount.`,
      );
      return;
    }

    setUnshielding(true);

    try {
      const result =
        await wallet.executeUnshieldAsset(
          selectedAsset.id,
          amount,
          `Unshield ${amount} ${selectedAsset.symbol} for Lend`,
        );

      setUnshieldProgress({
        kind:
          result.status === "confirmed"
            ? "ready"
            : "waiting",

        hash:
          result.hash,

        amount,
      });

      if (
        result.status ===
        "confirmed"
      ) {
        await wallet
          .refreshAssetBalances();
      }
    } catch (cause) {
      setUnshieldProgress({
        kind: "idle",
      });

      setError(
        cause instanceof Error
          ? cause.message
          : "Unshield Lend failed.",
      );
    } finally {
      setUnshielding(false);
    }
  }


  async function refreshUnshieldLendConfirmation() {
    if (
      mode !== "unshield" ||
      unshieldProgress.kind !==
        "waiting" ||
      !network ||
      network.id !== "mainnet"
    ) {
      return;
    }

    setCheckingUnshield(true);
    setError("");

    try {
      const receipt: unknown =
        await network.provider
          .waitForTransaction(
            unshieldProgress.hash,
            {
              retries: 2,
              retryInterval: 1500,
            },
          );

      if (
        receipt &&
        typeof receipt === "object"
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
            "The Unshield transaction reverted. Vesu Lend remains locked.",
          );
        }
      }

      await wallet
        .refreshAssetBalances();

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
          : "Unshield is not confirmed yet. Vesu Lend remains locked.",
      );
    } finally {
      setCheckingUnshield(false);
    }
  }


  async function executeLend() {
    if (
      mode === "unshield"
    ) {
      let units: bigint;

      try {
        units =
          parseUnits(
            amount,
            selectedAsset.decimals,
          );
      } catch {
        setError(
          `Enter a valid ${selectedAsset.symbol} amount.`,
        );
        return;
      }

      const publicBalance =
        findAssetBalance(
          wallet.balances,
          selectedAsset.id,
          "public",
        )?.amount;

      if (
        unshieldProgress.kind !==
          "ready" ||
        publicBalance === null ||
        publicBalance === undefined ||
        publicBalance < units
      ) {
        setError(
          "Complete and confirm Unshield before Vesu Lend.",
        );
        return;
      }
    }

    if (
      !selectedMarket ||
      !wallet.address ||
      executing
    ) {
      return;
    }

    try {
      if (
        parseUnits(
          amount,
          selectedAsset
            .decimals,
        ) <= 0n
      ) {
        throw new Error(
          "Lend amount must be greater than zero.",
        );
      }
    } catch {
      setError(
        `Enter a valid ${selectedAsset.symbol} amount.`,
      );

      return;
    }

    if (
      mode === "shield"
    ) {
      if (
        !wallet.strk20Capable
      ) {
        setError(
          "Ready does not report the STRK20 Wallet API required for Shield Lend.",
        );

        return;
      }

      let shieldAmount: bigint;

      try {
        shieldAmount =
          parseUnits(
            amount,
            selectedAsset.decimals,
          );
      } catch {
        setError(
          `Enter a valid ${selectedAsset.symbol} amount.`,
        );

        return;
      }

      const publicBalance =
        findAssetBalance(
          wallet.balances,
          selectedAsset.id,
          "public",
        )?.amount;

      if (
        publicBalance !== null &&
        publicBalance !== undefined &&
        publicBalance <
          shieldAmount
      ) {
        setError(
          `Public ${selectedAsset.symbol} balance is below this Shield Lend amount.`,
        );

        return;
      }

      setExecuting(true);
      setError("");
      setSuccess("");

      try {
        const response =
          await fetch(
            "/api/vesu/lend/private/prepare",
            {
              method:
                "POST",

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

                  assetId:
                    selectedAsset.id,

                  counterpartAssetId:
                    selectedMarket
                      .counterpart.id,

                  amount,
                }),
            },
          );

        const raw: unknown =
          await response.json();

        const prepared =
          responseObject(
            raw,
          );

        if (
          !response.ok
        ) {
          throw new Error(
            typeof prepared.error ===
              "string"
              ? prepared.error
              : "Shield Lend preparation failed.",
          );
        }

        const execution =
          prepared.execution as
            VesuShieldLendExecutionPayload;

        if (!execution) {
          throw new Error(
            "CAREL received an invalid Shield Lend preparation.",
          );
        }

        const result =
          await wallet
            .executeShieldLend(
              execution,

              `Shield Lend ${amount} ${selectedAsset.symbol} · Vesu ${selectedMarket.pool.name}`,
            );

        setSuccess(
          `Shield Lend ${result.status}: ${result.hash.slice(
            0,
            10,
          )}…${result.hash.slice(-6)}`,
        );
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Shield Lend failed.",
        );
      } finally {
        setExecuting(false);
      }

      return;
    }


    setExecuting(true);
    setError("");
    setSuccess("");

    try {
      const response =
        await fetch(
          "/api/vesu/lend/prepare",
          {
            method:
              "POST",

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

                assetId:
                  selectedAsset.id,

                counterpartAssetId:
                  selectedMarket
                    .counterpart.id,

                amount,
              }),
          },
        );

      const raw:
        unknown =
        await response.json();

      const payload =
        responseObject(
          raw,
        );

      if (
        !response.ok
      ) {
        throw new Error(
          typeof payload.error ===
            "string"
            ? payload.error
            : "Vesu Lend preparation failed.",
        );
      }

      const execution =
        payload.execution as
          VesuLendExecutionPayload;

      if (!execution) {
        throw new Error(
          "CAREL received an invalid Vesu Lend preparation.",
        );
      }

      const hash =
        await wallet.executeLend(
          execution,

          `Lend ${amount} ${selectedAsset.symbol} · Vesu ${selectedMarket.pool.name}`,
        );

      setSuccess(
        `Lend submitted: ${hash.slice(
          0,
          10,
        )}…${hash.slice(-6)}`,
      );

      try {
        await loadMarkets(
          selectedAsset.id,
        );
      } catch {
        // Keep transaction result visible.
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Vesu Lend failed.",
      );
    } finally {
      setExecuting(false);
    }
  }


  if (
    !wallet.connected
  ) {
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
          Connect Ready to use
          Vesu Lending.
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
            Vesu Lend is enabled
            on Starknet Mainnet.
          </p>
        </div>
      </section>
    );
  }


  let parsedAmount:
    bigint | null =
      null;

  try {
    const value =
      parseUnits(
        amount,
        selectedAsset.decimals,
      );

    if (value > 0n) {
      parsedAmount =
        value;
    }
  } catch {
    parsedAmount =
      null;
  }

  const privateBalance =
    wallet.privateRevealed
      ? findAssetBalance(
          wallet.balances,
          selectedAsset.id,
          "private",
        )?.amount ?? 0n
      : null;

  const publicBalance =
    findAssetBalance(
      wallet.balances,
      selectedAsset.id,
      "public",
    )?.amount ?? null;

  const privateEnough =
    parsedAmount !== null &&
    privateBalance !== null &&
    privateBalance >=
      parsedAmount;

  const publicEnough =
    parsedAmount !== null &&
    publicBalance !== null &&
    publicBalance >=
      parsedAmount;

  const unshieldLendReady =
    mode !== "unshield" ||
    (
      unshieldProgress.kind ===
        "ready" &&
      publicEnough
    );


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
              Public {
                selectedAsset.symbol
              }
              {" → "}
              STRK20
              {" → "}
              Vesu
              {" → "}
              Private vToken
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Public {
                selectedAsset.symbol
              }
            </span>

            <strong>
              {publicBalance === null
                ? "—"
                : `${formatUnits(
                    publicBalance,
                    selectedAsset.decimals,
                    6,
                  )} ${selectedAsset.symbol}`}
            </strong>
          </div>

          <p
            className={
              styles.privacyNote
            }
          >
            The Vesu lending
            anonymizer supplies the
            underlying asset to the
            Vesu vault and returns
            the minted vToken as a
            private STRK20 note.
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
              Private {selectedAsset.symbol}
              {" → "}
              Public {selectedAsset.symbol}
              {" → "}
              Vesu
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Private {selectedAsset.symbol}
            </span>

            <strong>
              {!wallet.privateRevealed
                ? "Hidden"
                : privateBalance === null
                  ? "—"
                  : `${formatUnits(
                      privateBalance,
                      selectedAsset.decimals,
                      6,
                    )} ${selectedAsset.symbol}`}
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Public {selectedAsset.symbol}
            </span>

            <strong>
              {publicBalance === null
                ? "—"
                : `${formatUnits(
                    publicBalance,
                    selectedAsset.decimals,
                    6,
                  )} ${selectedAsset.symbol}`}
            </strong>
          </div>

          {unshieldProgress.kind ===
            "idle" ? (
            !wallet.strk20Capable ? (
              <div
                className={
                  styles.notice
                }
                role="alert"
              >
                <p>
                  Ready does not report
                  the STRK20 Wallet API
                  required for Unshield
                  Lend.
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
                Reveal private balance
              </button>
            ) : (
              <>
                {!privateEnough &&
                  parsedAmount !==
                    null && (
                    <div
                      className={
                        styles.notice
                      }
                      role="alert"
                    >
                      <p>
                        Private {
                          selectedAsset
                            .symbol
                        } balance is
                        below this Lend
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
                    parsedAmount ===
                      null ||
                    !privateEnough
                  }
                  onClick={() =>
                    void startUnshieldLend()
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
                    ? "Unshielding…"
                    : `Review & Unshield ${selectedAsset.symbol}`}
                </button>
              </>
            )
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
                  Vesu Lend remains
                  locked until
                  confirmation.
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
                    unshieldProgress.hash,
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
                  void refreshUnshieldLendConfirmation()
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
          ) : (
            <p
              className={
                styles.inlineStatus
              }
            >
              <Check
                size={16}
              />
              Public {
                selectedAsset.symbol
              } ready. Vesu Lend
              unlocked.
            </p>
          )}

          <p
            className={
              styles.privacyNote
            }
          >
            Unshield and Vesu Lend
            are separate transactions.
            The Vesu lending position
            is public.
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
            Asset
          </span>

          <select
            className={
              styles.borrowSelect
            }
            value={
              selectedAssetId
            }
            disabled={busy}
            onChange={(
              event,
            ) => {
              setSelectedAssetId(
                event.target.value,
              );

              setMarkets([]);
              setSelectedPoolId("");
              setError("");
              setSuccess("");
            }}
          >
            {VESU_LEND_ASSETS.map(
              (asset) => (
                <option
                  key={
                    asset.id
                  }
                  value={
                    asset.id
                  }
                >
                  {
                    asset.symbol
                  }
                </option>
              ),
            )}
          </select>
        </label>

        <label
          className={
            styles.borrowField
          }
        >
          <span>
            Lend
          </span>

          <div
            className={
              styles.borrowInput
            }
          >
            <input
              inputMode="decimal"
              value={amount}
              disabled={busy}
              onChange={(
                event,
              ) => {
                setAmount(
                  event.target
                    .value,
                );

                setError("");
                setSuccess("");
              }}
              aria-label={`${selectedAsset.symbol} lend amount`}
            />

            <strong>
              {
                selectedAsset
                  .symbol
              }
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

        {markets.length > 1 ? (
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
            ) =>
              setSelectedPoolId(
                event.target
                  .value,
              )
            }
          >
            {markets.map(
              (market) => (
                <option
                  key={
                    market.pool.id
                  }
                  value={
                    market.pool.id
                  }
                >
                  {
                    market.pool
                      .name
                  }
                </option>
              ),
            )}
          </select>
        ) : (
          <strong>
            {selectedMarket
              ?.pool.name ??
              (loading
                ? "Checking…"
                : "—")}
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
              Verified context
            </span>

            <strong>
              {
                selectedMarket
                  .asset.symbol
              }{" "}
              /{" "}
              {
                selectedMarket
                  .counterpart
                  .symbol
              }
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Utilization
            </span>

            <strong>
              {percentFromBps(
                selectedMarket
                  .market
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
              Pool contract
            </span>

            <strong
              className={
                styles.borrowAddress
              }
            >
              {shortAddress(
                selectedMarket
                  .pool.address,
              )}
            </strong>
          </div>
        </>
      )}

      <p
        className={
          styles.privacyNote
        }
      >
        {mode === "shield"
          ? "Shield Lend verifies the active Vesu pool and its vToken before the anonymizer transaction is sent to Ready."
          : "The Vesu lending position is public. CAREL verifies an active pool context before execution."}
      </p>

      <button
        type="button"
        className={
          styles.secondary
        }
        disabled={busy}
        onClick={() =>
          void loadMarkets()
            .catch(
              (cause) =>
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not refresh Vesu markets.",
                ),
            )
        }
      >
        <RefreshCw
          size={16}
        />

        {loading
          ? "Checking markets…"
          : "Refresh markets"}
      </button>

      <button
        type="button"
        className={
          styles.primary
        }
        disabled={
          busy ||
          !selectedMarket ||
          !unshieldLendReady ||
          (
            mode === "shield" &&
            !wallet.strk20Capable
          )
        }
        onClick={() =>
          void executeLend()
        }
      >
        {executing ? (
          <LoaderCircle
            size={16}
          />
        ) : (
          <ArrowRight
            size={16}
          />
        )}

        {executing
          ? "Waiting for wallet…"
          : mode === "shield"
            ? `Review & Shield Lend ${selectedAsset.symbol}`
            : `Review & Lend ${selectedAsset.symbol}`}
      </button>

      {error && (
        <div
          className={
            styles.notice
          }
          role="alert"
        >
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
          {success}
        </p>
      )}
    </section>
  );
}
