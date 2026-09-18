"use client";

import { useEffect, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import {
  getQuotes,
  type Quote,
} from "@avnu/avnu-sdk";
import { useCarelTestnet } from "@/components/testnet/Strk20Testnet";
import {
  getCarelNetwork,
  STRK_TOKEN,
} from "@/lib/carel/networks";
import styles from "../CarelWorkspace.module.css";

type SwapMode = "normal" | "shield" | "unshield";

const STRK_DECIMALS = 18;
const USDC_DECIMALS = 6;

// AVNU priceImpact is expressed in basis-point style:
// 500 => 5.00%.
const MAX_PRICE_IMPACT_BPS = 500;

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
  const [success, setSuccess] = useState("");
  const [unshieldStage, setUnshieldStage] = useState<{
    hash: string;
    privateBuyBefore: bigint;
    minExpected: bigint;
    maturityTarget: number;
    sellAmount: string;
  } | null>(null);

  const network = getCarelNetwork(wallet.chainId);
  const ready =
    wallet.connected &&
    network !== null;

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
    setSuccess("");
  }, [mode, wallet.address]);

  async function loadQuote() {
    if (loading || executing) return;

    setLoading(true);
    setError("");
    setQuote(null);

    try {
      if (!ready || !wallet.address || !network) {
        throw new Error(
          "Connect Ready on Starknet Sepolia or Mainnet first.",
        );
      }

      if (
        mode !== "normal" &&
        (!wallet.strk20Capable || !network.privacyEnabled)
      ) {
        throw new Error(
          "STRK20 privacy is not available for this wallet or network.",
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
          sellTokenAddress: STRK_TOKEN,
          buyTokenAddress: network.usdcToken,
          sellAmount,
          ...(mode === "normal"
            ? { takerAddress: wallet.address }
            : {}),
          size: 1,
        },
        {
          baseUrl: network.avnuBaseUrl,
        },
      );

      const next = quotes[0];

      if (!next) {
        throw new Error(
          `No AVNU STRK → USDC route is available on ${network.label} right now.`,
        );
      }

      if (next.chainId !== network.chainId) {
        throw new Error(
          "AVNU returned a quote for the wrong network.",
        );
      }

      if (
        !sameAddress(next.sellTokenAddress, STRK_TOKEN) ||
        !sameAddress(next.buyTokenAddress, network.usdcToken)
      ) {
        throw new Error(
          "AVNU returned a quote for a different token pair.",
        );
      }

      if (
        next.sellAmount !== sellAmount ||
        next.buyAmount <= 0n
      ) {
        throw new Error(
          "AVNU returned a quote with an unexpected amount.",
        );
      }

      if (
        !Number.isFinite(next.priceImpact) ||
        Math.abs(next.priceImpact) > MAX_PRICE_IMPACT_BPS
      ) {
        throw new Error(
          "CAREL blocked this route because its price impact exceeds 5%.",
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

    if (!network) {
      setError(
        "Connect Ready on Starknet Sepolia or Mainnet first.",
      );
      return;
    }

    setExecuting(true);
    setError("");

    try {
      if (mode === "shield") {
        await wallet.executeShieldSwap(
          quote,
          STRK_TOKEN,
          network.usdcToken,
          `Shield Swap ${amount} STRK → private USDC`,
        );
      } else if (mode === "unshield") {
        const minExpected =
          quote.buyAmount -
          (quote.buyAmount * 50n) / 10_000n;

        const stage =
          await wallet.executeUnshieldSwapStart(
            quote,
            STRK_TOKEN,
            network.usdcToken,
            `Unshield Swap · private STRK → private USDC`,
          );

        setUnshieldStage({
          ...stage,
          minExpected,
          sellAmount: amount,
        });
      } else {
        await wallet.executeSwap(
          quote,
          STRK_TOKEN,
          network.usdcToken,
          `Swap ${amount} STRK → USDC`,
        );
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

  async function completeUnshield() {
    if (
      !unshieldStage ||
      !network ||
      executing
    ) {
      return;
    }

    setExecuting(true);
    setError("");
    setSuccess("");

    try {
      const result =
        await wallet.completeUnshieldSwap(
          network.usdcToken,
          unshieldStage.privateBuyBefore,
          unshieldStage.minExpected,
          unshieldStage.maturityTarget,
          `Unshield Swap ${unshieldStage.sellAmount} STRK → public USDC`,
        );

      setSuccess(
        `Unshield complete: ${formatAmount(
          result.amount,
          USDC_DECIMALS,
        )} USDC moved to your public wallet.`,
      );

      setUnshieldStage(null);
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
      wallet.currentBlock !== null &&
      wallet.currentBlock >=
        unshieldStage.maturityTarget;

    return (
      <section className={styles.panel}>
        <h3>Unshield Swap</h3>

        <div className={styles.route}>
          <span>Private STRK</span>
          <ArrowRight size={16}/>
          <span>Public USDC</span>
        </div>

        <div className={styles.rule}>
          <span>Step</span>
          <strong>2 of 2</strong>
        </div>

        <div className={styles.rule}>
          <span>Private swap</span>
          <strong>Confirmed</strong>
        </div>

        <div className={styles.rule}>
          <span>USDC maturity block</span>
          <strong>
            {unshieldStage.maturityTarget.toLocaleString()}
          </strong>
        </div>

        <div className={styles.rule}>
          <span>Current block</span>
          <strong>
            {wallet.currentBlock?.toLocaleString() ?? "Checking…"}
          </strong>
        </div>

        <p className={styles.helper}>
          AVNU has swapped the private STRK into private USDC.
          STRK20 requires the new note to mature before it can
          be withdrawn to your public wallet. CAREL withdraws
          only the reviewed minimum; positive slippage stays private.
        </p>

        <button
          type="button"
          className={styles.primary}
          disabled={!matured || executing || wallet.busy}
          onClick={() => void completeUnshield()}
        >
          {executing
            ? <LoaderCircle size={16}/>
            : <ArrowRight size={16}/>}
          {executing
            ? "Waiting for Ready…"
            : matured
              ? "Complete Unshield"
              : "Waiting for maturity"}
        </button>

        {error && (
          <p className={styles.notice} role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <h3>
        {mode === "normal"
          ? "Swap STRK → USDC"
          : mode === "shield"
            ? "Shield Swap"
            : "Unshield Swap"}
      </h3>

      <div className={styles.route}>
        <span>
          {mode === "unshield"
            ? "Private STRK"
            : "Public STRK"}
        </span>
        <ArrowRight size={16}/>
        <span>
          {mode === "shield"
            ? "Private USDC"
            : "Public USDC"}
        </span>
      </div>

      <p className={styles.helper}>
        {mode === "normal"
          ? `Public → public · AVNU · ${network?.label ?? "Starknet"}`
          : mode === "shield"
            ? "Public → private · AVNU + STRK20"
            : "Private → public · STRK20 + AVNU"}
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
          {loading
            ? "Getting AVNU quote…"
            : mode === "normal"
              ? "Get live quote"
              : "Get private route quote"}
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
                ? `${(quote.priceImpact / 100).toFixed(4)}%`
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
            {mode === "normal"
              ? "Slippage limit: 0.5%. Final approval happens in Ready."
              : mode === "shield"
                ? "Slippage limit: 0.5%. Ready will generate a STRK20 privacy proof; this can take longer than a normal swap."
                : "Step 1 swaps private STRK into private USDC. After the new note matures, CAREL will ask Ready for a second approval to withdraw that USDC publicly."}
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
              : mode === "normal"
                ? "Review & Swap"
                : mode === "shield"
                  ? "Review Shield Swap"
                  : "Review Unshield Swap"}
          </button>
        </>
      )}

      {error && (
        <p className={styles.notice} role="alert">
          {error}
        </p>
      )}

      {success && (
        <p className={styles.notice} role="status">
          {success}
        </p>
      )}
    </section>
  );
}
