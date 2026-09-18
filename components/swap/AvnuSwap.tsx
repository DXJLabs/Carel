"use client";

import { useEffect, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { constants } from "starknet";
import {
  getQuotes,
  SEPOLIA_BASE_URL,
  type Quote,
} from "@avnu/avnu-sdk";
import { useCarelTestnet } from "@/components/testnet/Strk20Testnet";
import styles from "../CarelWorkspace.module.css";

type SwapMode = "normal" | "shield" | "unshield";

const STRK =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const USDC =
  "0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343";

const STRK_DECIMALS = 18;
const USDC_DECIMALS = 6;

function sameAddress(a: string, b: string) {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
}

function parseAmount(value: string, decimals: number): bigint {
  const clean = value.trim();

  if (!/^\d+(?:\.\d+)?$/.test(clean)) {
    throw new Error("Enter a valid amount.");
  }

  const [whole, fraction = ""] = clean.split(".");

  if (fraction.length > decimals) {
    throw new Error(`Use at most ${decimals} decimal places.`);
  }

  const padded = fraction.padEnd(decimals, "0");

  return (
    BigInt(whole || "0") * 10n ** BigInt(decimals) +
    BigInt(padded || "0")
  );
}

function formatAmount(
  value: bigint,
  decimals: number,
  maxFraction = 6,
): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base)
    .toString()
    .padStart(decimals, "0")
    .slice(0, maxFraction)
    .replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function AvnuSwap({
  mode,
  goal,
}: {
  mode: SwapMode;
  goal: string;
}) {
  const wallet = useCarelTestnet();

  const [amount, setAmount] = useState("1");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState("");

  const ready =
    wallet.connected &&
    wallet.chainId === constants.StarknetChainId.SN_SEPOLIA;

  useEffect(() => {
    const match = goal.match(
      /\bswap\s+(\d+(?:\.\d+)?)\s+STRK\b/i,
    );

    if (match?.[1]) {
      setAmount(match[1]);
    }
  }, [goal]);

  useEffect(() => {
    setQuote(null);
    setError("");
  }, [mode, wallet.address]);

  if (mode !== "normal") {
    return (
      <section className={styles.panel}>
        <h3>
          {mode === "shield" ? "Shield Swap" : "Unshield Swap"}
        </h3>

        <div className={styles.route}>
          <span>
            {mode === "shield" ? "Public balance" : "Privacy pool"}
          </span>
          <ArrowRight size={16} />
          <span>
            {mode === "shield" ? "Privacy pool" : "Public balance"}
          </span>
        </div>

        <p className={styles.helper}>
          {mode === "shield"
            ? "Shield means public → private. CAREL will not mislabel a private-to-private AVNU swap as Shield."
            : "Unshield means private → public. CAREL will not treat a normal public swap as Unshield."}
        </p>

        <p className={styles.helper}>
          Normal public → public Swap is live below when Normal mode is selected.
        </p>
      </section>
    );
  }

  async function loadQuote() {
    if (loading || executing) return;

    setLoading(true);
    setError("");
    setQuote(null);

    try {
      if (!ready || !wallet.address) {
        throw new Error(
          "Connect Ready on Starknet Sepolia first.",
        );
      }

      const sellAmount = parseAmount(
        amount,
        STRK_DECIMALS,
      );

      if (sellAmount <= 0n) {
        throw new Error("Swap amount must be greater than zero.");
      }

      const quotes = await getQuotes(
        {
          sellTokenAddress: STRK,
          buyTokenAddress: USDC,
          sellAmount,
          takerAddress: wallet.address,
          size: 1,
        },
        {
          baseUrl: SEPOLIA_BASE_URL,
        },
      );

      const next = quotes[0];

      if (!next) {
        throw new Error(
          "No AVNU STRK → USDC route is available on Starknet Sepolia right now.",
        );
      }

      if (
        next.chainId !== constants.StarknetChainId.SN_SEPOLIA
      ) {
        throw new Error(
          "AVNU returned a quote for the wrong network.",
        );
      }

      if (
        !sameAddress(next.sellTokenAddress, STRK) ||
        !sameAddress(next.buyTokenAddress, USDC)
      ) {
        throw new Error(
          "AVNU returned a quote for a different token pair.",
        );
      }

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

  async function execute() {
    if (!quote || executing) return;

    setExecuting(true);
    setError("");

    try {
      await wallet.executeSwap(
        quote,
        STRK,
        USDC,
        `Swap ${amount} STRK → USDC`,
      );

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

  return (
    <section className={styles.panel}>
      <h3>Swap STRK → USDC</h3>

      <p className={styles.helper}>
        Public → public · routed by AVNU
      </p>

      <label
        className={styles.fieldLabel}
        htmlFor="carel-swap-amount"
      >
        You pay
      </label>

      <input
        id="carel-swap-amount"
        className={styles.amountInput}
        inputMode="decimal"
        value={amount}
        disabled={loading || executing}
        onChange={(event) => {
          setAmount(event.target.value);
          setQuote(null);
          setError("");
        }}
      />

      <div className={styles.rule}>
        <span>Sell token</span>
        <strong>STRK</strong>
      </div>

      <div className={styles.rule}>
        <span>Receive token</span>
        <strong>USDC</strong>
      </div>

      {!quote && (
        <button
          type="button"
          className={styles.primary}
          disabled={!ready || loading || executing}
          onClick={() => void loadQuote()}
        >
          {loading ? (
            <LoaderCircle size={16} />
          ) : (
            <ArrowRight size={16} />
          )}
          {loading ? "Getting AVNU quote…" : "Get live quote"}
        </button>
      )}

      {quote && (
        <>
          <div className={styles.rule}>
            <span>You pay</span>
            <strong>
              {formatAmount(
                quote.sellAmount,
                STRK_DECIMALS,
              )}{" "}
              STRK
            </strong>
          </div>

          <div className={styles.rule}>
            <span>You receive</span>
            <strong>
              {formatAmount(
                quote.buyAmount,
                USDC_DECIMALS,
              )}{" "}
              USDC
            </strong>
          </div>

          <div className={styles.rule}>
            <span>Price impact</span>
            <strong>
              {Number.isFinite(quote.priceImpact)
                ? `${quote.priceImpact.toFixed(4)}%`
                : "—"}
            </strong>
          </div>

          <div className={styles.rule}>
            <span>AVNU fee</span>
            <strong>
              {Number.isFinite(quote.fee.avnuFeesInUsd)
                ? `$${quote.fee.avnuFeesInUsd.toFixed(4)}`
                : "—"}
            </strong>
          </div>

          <div className={styles.rule}>
            <span>Estimated gas</span>
            <strong>
              {typeof quote.gasFeesInUsd === "number"
                ? `$${quote.gasFeesInUsd.toFixed(4)}`
                : "Review in wallet"}
            </strong>
          </div>

          <p className={styles.helper}>
            Slippage limit: 0.5%. Final approval happens in Ready.
          </p>

          <button
            type="button"
            className={styles.primary}
            disabled={executing || wallet.busy}
            onClick={() => void execute()}
          >
            {executing ? (
              <LoaderCircle size={16} />
            ) : (
              <ArrowRight size={16} />
            )}
            {executing
              ? "Waiting for Ready…"
              : "Review & Swap"}
          </button>
        </>
      )}

      {error && (
        <p className={styles.notice} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
