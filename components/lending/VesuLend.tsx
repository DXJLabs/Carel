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
  VESU_LEND_ASSETS,
  getVesuLendAssetBySymbol,
  type VesuLendExecutionPayload,
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
      mode === "normal" &&
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
            Unshield Lend remain
            disabled.
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
        Lending is public.
        Candidate assets are not
        treated as executable until
        CAREL verifies an active
        Vesu pool context on-chain.
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
