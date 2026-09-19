"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  ArrowRight,
  LoaderCircle,
} from "lucide-react";

import type {
  Quote,
} from "@avnu/avnu-sdk";

import {
  useCarelTestnet,
} from "@/components/testnet/Strk20Testnet";

import {
  formatUnits,
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  getCarelNetwork,
} from "@/lib/carel/networks";

import {
  completeUnshieldSwapRoute,
  executeSwapRoute,
  getAvnuSwapQuote,
  type AvnuPendingUnshield,
  type AvnuSwapMode,
} from "@/lib/carel/ecosystems/starknet/protocols/avnu/swap";

import styles from "../CarelWorkspace.module.css";

type PendingUiStage =
  AvnuPendingUnshield &
  Readonly<{
    sellAmount: string;
    fromSymbol: string;
    toSymbol: string;
    toDecimals: number;
  }>;

export function AvnuSwap({
  mode,
  goal,
}: {
  mode: AvnuSwapMode;
  goal: string;
}) {
  const wallet =
    useCarelTestnet();

  const network =
    getCarelNetwork(
      wallet.chainId,
    );

  const swapAssets =
    network
      ? [
          network.assets.strk,
          network.assets.usdc,
        ]
      : [];

  const [
    sellSymbol,
    setSellSymbol,
  ] = useState("STRK");

  const [
    buySymbol,
    setBuySymbol,
  ] = useState("USDC");

  const [
    amount,
    setAmount,
  ] = useState("1");

  const [
    quote,
    setQuote,
  ] = useState<Quote | null>(
    null,
  );

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

  const [
    unshieldStage,
    setUnshieldStage,
  ] =
    useState<PendingUiStage | null>(
      null,
    );

  const sellAsset =
    swapAssets.find(
      (asset) =>
        asset.symbol ===
        sellSymbol,
    ) ??
    swapAssets[0] ??
    null;

  const buyAsset =
    swapAssets.find(
      (asset) =>
        asset.symbol ===
        buySymbol,
    ) ??
    swapAssets.find(
      (asset) =>
        asset.id !==
        sellAsset?.id,
    ) ??
    null;

  const ready =
    wallet.connected &&
    network !== null &&
    sellAsset !== null &&
    buyAsset !== null &&
    sellAsset.id !==
      buyAsset.id;

  /**
   * Clears a reviewed quote whenever the user changes route inputs.
   */
  function resetQuote() {
    setQuote(null);
    setError("");
    setSuccess("");
  }

  /**
   * Changes the sell asset and automatically keeps the pair distinct.
   */
  function selectSellAsset(
    symbol: string,
  ) {
    setSellSymbol(symbol);

    if (
      symbol === buySymbol
    ) {
      const alternate =
        swapAssets.find(
          (asset) =>
            asset.symbol !==
            symbol,
        );

      if (alternate) {
        setBuySymbol(
          alternate.symbol,
        );
      }
    }

    resetQuote();
  }

  /**
   * Changes the receive asset and automatically keeps the pair distinct.
   */
  function selectBuyAsset(
    symbol: string,
  ) {
    setBuySymbol(symbol);

    if (
      symbol === sellSymbol
    ) {
      const alternate =
        swapAssets.find(
          (asset) =>
            asset.symbol !==
            symbol,
        );

      if (alternate) {
        setSellSymbol(
          alternate.symbol,
        );
      }
    }

    resetQuote();
  }

  useEffect(() => {
    if (!network) {
      return;
    }

    const match =
      goal.match(
        /\bswap\s+(\d+(?:\.\d+)?)\s+([a-z0-9]+)(?:\s+(?:for|to)\s+([a-z0-9]+))?/i,
      );

    if (!match) {
      return;
    }

    if (match[1]) {
      setAmount(
        match[1],
      );
    }

    const from =
      network.assets.strk
        .symbol
        .toLowerCase() ===
      match[2]?.toLowerCase()
        ? network.assets.strk
        : network.assets.usdc
            .symbol
            .toLowerCase() ===
          match[2]?.toLowerCase()
          ? network.assets.usdc
          : null;

    const to =
      network.assets.strk
        .symbol
        .toLowerCase() ===
      match[3]?.toLowerCase()
        ? network.assets.strk
        : network.assets.usdc
            .symbol
            .toLowerCase() ===
          match[3]?.toLowerCase()
          ? network.assets.usdc
          : null;

    if (from) {
      setSellSymbol(
        from.symbol,
      );
    }

    if (
      to &&
      to.id !== from?.id
    ) {
      setBuySymbol(
        to.symbol,
      );
    }

    setQuote(null);
    setError("");
    setSuccess("");
  }, [
    goal,
    network?.id,
  ]);

  useEffect(() => {
    setQuote(null);
    setError("");
    setSuccess("");
    setUnshieldStage(null);
  }, [
    mode,
    wallet.address,
    network?.id,
  ]);

  /**
   * Requests a verified quote through the AVNU Starknet adapter.
   */
  async function loadQuote() {
    if (
      loading ||
      executing
    ) {
      return;
    }

    setLoading(true);
    setError("");
    setQuote(null);

    try {
      if (
        !ready ||
        !wallet.address ||
        !network ||
        !sellAsset ||
        !buyAsset
      ) {
        throw new Error(
          "Connect Ready on Starknet Sepolia or Mainnet first.",
        );
      }

      if (
        mode !== "normal" &&
        (
          !wallet.strk20Capable ||
          !network.privacyEnabled
        )
      ) {
        throw new Error(
          "STRK20 privacy is not available for this wallet or network.",
        );
      }

      const sellAmount =
        parseUnits(
          amount,
          sellAsset.decimals,
        );

      const next =
        await getAvnuSwapQuote({
          network,
          fromAsset:
            sellAsset,
          toAsset:
            buyAsset,
          sellAmount,
          takerAddress:
            wallet.address,
          privateRoute:
            mode !==
            "normal",
        });

      setQuote(next);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the AVNU quote.",
      );
    } finally {
      setLoading(false);
    }
  }

  /**
   * Executes the currently reviewed route without embedding protocol
   * orchestration inside the React component.
   */
  async function execute() {
    if (
      !quote ||
      executing ||
      !sellAsset ||
      !buyAsset
    ) {
      return;
    }

    setExecuting(true);
    setError("");

    try {
      const result =
        await executeSwapRoute({
          mode,
          quote,
          fromAsset:
            sellAsset,
          toAsset:
            buyAsset,
          amountLabel:
            amount,
          executor:
            wallet,
        });

      if (
        result.kind ===
        "unshield-pending"
      ) {
        setUnshieldStage({
          ...result.stage,
          sellAmount:
            amount,
          fromSymbol:
            sellAsset.symbol,
          toSymbol:
            buyAsset.symbol,
          toDecimals:
            buyAsset.decimals,
        });
      }

      setQuote(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Swap failed.",
      );
    } finally {
      setExecuting(false);
    }
  }

  /**
   * Completes the second Unshield step after the private output matures.
   */
  async function completeUnshield() {
    if (
      !unshieldStage ||
      !buyAsset ||
      executing
    ) {
      return;
    }

    setExecuting(true);
    setError("");
    setSuccess("");

    try {
      const result =
        await completeUnshieldSwapRoute({
          executor:
            wallet,
          toAsset:
            buyAsset,
          stage:
            unshieldStage,
          amountLabel:
            unshieldStage
              .sellAmount,
          fromSymbol:
            unshieldStage
              .fromSymbol,
        });

      setSuccess(
        `Unshield complete: ${formatUnits(
          result.amount,
          unshieldStage
            .toDecimals,
          6,
        )} ${unshieldStage.toSymbol} moved to your public wallet.`,
      );

      setUnshieldStage(
        null,
      );

      setQuote(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not complete Unshield Swap.",
      );
    } finally {
      setExecuting(false);
    }
  }

  if (
    mode === "unshield" &&
    unshieldStage
  ) {
    const matured =
      wallet.currentBlock !==
        null &&
      wallet.currentBlock >=
        unshieldStage
          .maturityTarget;

    return (
      <section
        className={
          styles.panel
        }
      >
        <h3>
          Unshield Swap
        </h3>

        <div
          className={
            styles.route
          }
        >
          <span>
            Private{" "}
            {
              unshieldStage
                .fromSymbol
            }
          </span>

          <ArrowRight
            size={16}
          />

          <span>
            Public{" "}
            {
              unshieldStage
                .toSymbol
            }
          </span>
        </div>

        <div
          className={
            styles.rule
          }
        >
          <span>Step</span>
          <strong>
            2 of 2
          </strong>
        </div>

        <div
          className={
            styles.rule
          }
        >
          <span>
            Private swap
          </span>

          <strong>
            Confirmed
          </strong>
        </div>

        <div
          className={
            styles.rule
          }
        >
          <span>
            {
              unshieldStage
                .toSymbol
            }{" "}
            maturity block
          </span>

          <strong>
            {unshieldStage
              .maturityTarget
              .toLocaleString()}
          </strong>
        </div>

        <div
          className={
            styles.rule
          }
        >
          <span>
            Current block
          </span>

          <strong>
            {wallet
              .currentBlock
              ?.toLocaleString() ??
              "Checking…"}
          </strong>
        </div>

        <p
          className={
            styles.helper
          }
        >
          AVNU has completed
          the private swap.
          STRK20 requires the
          new private output to
          mature before CAREL can
          withdraw the reviewed
          amount publicly.
        </p>

        <button
          type="button"
          className={
            styles.primary
          }
          disabled={
            !matured ||
            executing ||
            wallet.busy
          }
          onClick={() =>
            void completeUnshield()
          }
        >
          {executing
            ? (
              <LoaderCircle
                size={16}
              />
            )
            : (
              <ArrowRight
                size={16}
              />
            )}

          {executing
            ? "Waiting for Ready…"
            : matured
              ? "Complete Unshield"
              : "Waiting for maturity"}
        </button>

        {error && (
          <p
            className={
              styles.notice
            }
            role="alert"
          >
            {error}
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      className={
        styles.panel
      }
    >
      <h3>
        {mode === "normal"
          ? "Swap"
          : mode === "shield"
            ? "Shield Swap"
            : "Unshield Swap"}
      </h3>

      <div
        className={
          styles.route
        }
      >
        <span>
          {mode ===
          "unshield"
            ? "Private "
            : "Public "}
          {sellAsset
            ?.symbol ??
            "Asset"}
        </span>

        <ArrowRight
          size={16}
        />

        <span>
          {mode ===
          "shield"
            ? "Private "
            : "Public "}
          {buyAsset
            ?.symbol ??
            "Asset"}
        </span>
      </div>

      <p
        className={
          styles.helper
        }
      >
        {mode === "normal"
          ? `Public → public · AVNU · ${network?.label ?? "Starknet"}`
          : mode === "shield"
            ? "Public → private · AVNU + STRK20"
            : "Private → public · STRK20 + AVNU"}
      </p>

      <label
        className={
          styles.fieldLabel
        }
        htmlFor="carel-swap-sell"
      >
        Sell asset
      </label>

      <select
        id="carel-swap-sell"
        className={
          styles.amountInput
        }
        value={
          sellAsset?.symbol ??
          sellSymbol
        }
        disabled={
          loading ||
          executing
        }
        onChange={(event) =>
          selectSellAsset(
            event.target.value,
          )
        }
      >
        {swapAssets.map(
          (asset) => (
            <option
              key={
                asset.id
              }
              value={
                asset.symbol
              }
            >
              {asset.symbol}
            </option>
          ),
        )}
      </select>

      <label
        className={
          styles.fieldLabel
        }
        htmlFor="carel-swap-buy"
      >
        Receive asset
      </label>

      <select
        id="carel-swap-buy"
        className={
          styles.amountInput
        }
        value={
          buyAsset?.symbol ??
          buySymbol
        }
        disabled={
          loading ||
          executing
        }
        onChange={(event) =>
          selectBuyAsset(
            event.target.value,
          )
        }
      >
        {swapAssets.map(
          (asset) => (
            <option
              key={
                asset.id
              }
              value={
                asset.symbol
              }
            >
              {asset.symbol}
            </option>
          ),
        )}
      </select>

      <label
        className={
          styles.fieldLabel
        }
        htmlFor="carel-swap-amount"
      >
        You pay
      </label>

      <input
        id="carel-swap-amount"
        className={
          styles.amountInput
        }
        inputMode="decimal"
        value={amount}
        disabled={
          loading ||
          executing
        }
        onChange={(
          event,
        ) => {
          setAmount(
            event.target.value,
          );
          resetQuote();
        }}
      />

      {!quote && (
        <button
          type="button"
          className={
            styles.primary
          }
          disabled={
            !ready ||
            loading ||
            executing
          }
          onClick={() =>
            void loadQuote()
          }
        >
          {loading
            ? (
              <LoaderCircle
                size={16}
              />
            )
            : (
              <ArrowRight
                size={16}
              />
            )}

          {loading
            ? "Getting AVNU quote…"
            : mode === "normal"
              ? "Get live quote"
              : "Get private route quote"}
        </button>
      )}

      {quote &&
        sellAsset &&
        buyAsset && (
        <>
          <div
            className={
              styles.rule
            }
          >
            <span>
              You pay
            </span>

            <strong>
              {formatUnits(
                quote.sellAmount,
                sellAsset.decimals,
                6,
              )}{" "}
              {
                sellAsset
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
              You receive
            </span>

            <strong>
              {formatUnits(
                quote.buyAmount,
                buyAsset.decimals,
                6,
              )}{" "}
              {
                buyAsset
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
              Price impact
            </span>

            <strong>
              {Number.isFinite(
                quote.priceImpact,
              )
                ? `${(
                    quote.priceImpact /
                    100
                  ).toFixed(
                    4,
                  )}%`
                : "—"}
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              AVNU fee
            </span>

            <strong>
              {Number.isFinite(
                quote.fee
                  .avnuFeesInUsd,
              )
                ? `$${quote.fee.avnuFeesInUsd.toFixed(4)}`
                : "—"}
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Estimated gas
            </span>

            <strong>
              {typeof quote
                .gasFeesInUsd ===
              "number"
                ? `$${quote.gasFeesInUsd.toFixed(4)}`
                : "Review in wallet"}
            </strong>
          </div>

          <p
            className={
              styles.helper
            }
          >
            {mode === "normal"
              ? "Slippage limit: 0.5%. Final approval happens in Ready."
              : mode === "shield"
                ? "Slippage limit: 0.5%. Ready will generate a STRK20 privacy proof."
                : `Step 1 swaps private ${sellAsset.symbol} into private ${buyAsset.symbol}. After maturity CAREL can withdraw the reviewed ${buyAsset.symbol} amount publicly.`}
          </p>

          <button
            type="button"
            className={
              styles.primary
            }
            disabled={
              executing ||
              wallet.busy
            }
            onClick={() =>
              void execute()
            }
          >
            {executing
              ? (
                <LoaderCircle
                  size={16}
                />
              )
              : (
                <ArrowRight
                  size={16}
                />
              )}

            {executing
              ? "Waiting for Ready…"
              : mode === "normal"
                ? "Review & Swap"
                : mode === "shield"
                  ? "Review Shield Swap"
                  : "Review Unshield Swap"}
          </button>
        </>
      )}

      {error && (
        <p
          className={
            styles.notice
          }
          role="alert"
        >
          {error}
        </p>
      )}

      {success && (
        <p
          className={
            styles.notice
          }
          role="status"
        >
          {success}
        </p>
      )}
    </section>
  );
}
