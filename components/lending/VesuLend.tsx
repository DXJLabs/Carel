"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowRight,
  LoaderCircle,
  RefreshCw,
  WalletCards,
} from "lucide-react";

import {
  useCarelTestnet,
} from "@/components/testnet/Strk20Testnet";

import {
  getCarelNetwork,
} from "@/lib/carel/networks";

import {
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  parseLendGoal,
} from "@/lib/agent/lending";

import {
  VESU_BORROW_DEBT_ASSETS,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/pairs";

import type {
  VesuLendExecutionPayload,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/lending";

import styles from "../CarelWorkspace.module.css";

type LendMode =
  | "normal"
  | "shield"
  | "unshield";

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
  ] = useState("10");

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
    wallet.busy;

  useEffect(() => {
    try {
      const parsed =
        parseLendGoal(
          goal,
        );

      if (
        parsed.symbol ===
          "STRK"
      ) {
        setAmount(
          parsed.amountText,
        );
      }
    } catch {
      // Manual amount remains available.
    }
  }, [goal]);

  async function loadMarkets() {
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
      const batches =
        await Promise.all(
          VESU_BORROW_DEBT_ASSETS.map(
            async (
              counterpart,
            ) => {
              try {
                const query =
                  new URLSearchParams({
                    debtAssetId:
                      counterpart.id,
                  });

                const response =
                  await fetch(
                    `/api/vesu/borrow/markets?${query.toString()}`,
                    {
                      cache:
                        "no-store",
                    },
                  );

                if (
                  !response.ok
                ) {
                  return [];
                }

                const raw:
                  unknown =
                  await response.json();

                const payload =
                  responseObject(
                    raw,
                  );

                return Array.isArray(
                  payload.markets,
                )
                  ? payload.markets as LendMarket[]
                  : [];
              } catch {
                return [];
              }
            },
          ),
        );

      const seen =
        new Set<string>();

      const discovered =
        batches
          .flat()
          .filter(
            (market) => {
              if (
                market.collateral
                  .symbol !==
                  "STRK" ||
                seen.has(
                  market.pool.id,
                )
              ) {
                return false;
              }

              seen.add(
                market.pool.id,
              );

              return true;
            },
          );

      if (
        !discovered.length
      ) {
        throw new Error(
          "No verified Vesu STRK lending market is available right now.",
        );
      }

      setMarkets(
        discovered,
      );

      if (
        !discovered.some(
          (market) =>
            market.pool.id ===
            selectedPoolId,
        )
      ) {
        setSelectedPoolId(
          discovered[0]
            .pool.id,
        );
      }
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
      mode === "normal" &&
      wallet.connected &&
      network?.id ===
        "mainnet"
    ) {
      void loadMarkets()
        .catch(
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
  ]);

  async function executeLend() {
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
          18,
        ) <= 0n
      ) {
        throw new Error(
          "Lend amount must be greater than zero.",
        );
      }
    } catch {
      setError(
        "Enter a valid STRK amount.",
      );

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

                amount,

                counterpartAssetId:
                  selectedMarket
                    .debt.id,
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
          `Lend ${amount} STRK · Vesu ${selectedMarket.pool.name}`,
        );

      setSuccess(
        `Lend submitted: ${hash.slice(
          0,
          10,
        )}…${hash.slice(-6)}`,
      );

      try {
        await loadMarkets();
      } catch {
        // Keep execution result visible.
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
    mode !== "normal"
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
            Vesu lending positions
            are public. Shield and
            Unshield Lend are not
            enabled in this first
            lending release.
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

  return (
    <section
      className={
        styles.borrowPanel
      }
    >
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
              aria-label="STRK lend amount"
            />

            <strong>
              STRK
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
              Verified pair
            </span>

            <strong>
              STRK / {
                selectedMarket
                  .debt.symbol
              }
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
        Lending is public.
        CAREL re-checks the Vesu
        market immediately before
        preparing the transaction.
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
          !selectedMarket
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
          : "Review & Lend"}
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
