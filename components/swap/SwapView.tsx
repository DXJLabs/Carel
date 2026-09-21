"use client";

import {
  ArrowRight,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";

import {
  formatUnits,
} from "@/lib/carel/core/amounts";

import type {
  AvnuSwapMode,
} from "@/lib/carel/ecosystems/starknet/protocols/avnu/swap";

import type {
  SwapController,
} from "./useSwapController";

import styles from "../CarelWorkspace.module.css";


function shortHash(
  hash: string,
) {
  return hash.length > 18
    ? `${hash.slice(0, 10)}…${hash.slice(-6)}`
    : hash;
}


function actionLabel(
  action: string,
) {
  switch (action) {
    case "swap":
      return "AVNU Swap";

    case "shield":
      return "Shield";

    case "unshield":
      return "Unshield";

    default:
      return action;
  }
}


export function SwapView({
  mode,
  controller,
}: Readonly<{
  mode:
    AvnuSwapMode;

  controller:
    SwapController;
}>) {
  const {
    wallet,
    network,
    swapAssets,

    sellSymbol,
    buySymbol,
    amount,
    quote,

    sellAsset,
    buyAsset,

    ready,
    busy,
    loading,
    executing,
    confirming,
    flowLocked,

    error,
    success,

    swapAgentSession,
    submittedStage,
    reviewStage,
    verifiedSwapOutput,
    stageAction,

    selectSellAsset,
    selectBuyAsset,
    changeAmount,

    loadQuote,
    startFlow,
    executeNextStage,
    confirmSubmitted,
    resetFlow,
  } =
    controller;


  if (!wallet.connected) {
    return (
      <section
        className={
          styles.panel
        }
      >
        <h3>Swap</h3>

        <p
          className={
            styles.helper
          }
        >
          Connect Ready before
          reviewing an AVNU Swap.
        </p>

        <button
          type="button"
          className={
            styles.primary
          }
          disabled={
            wallet.connecting
          }
          onClick={() =>
            void wallet.connect()
          }
        >
          <ArrowRight
            size={16}
          />

          {wallet.connecting
            ? "Connecting…"
            : "Connect Ready"}
        </button>
      </section>
    );
  }


  if (!network) {
    return (
      <section
        className={
          styles.panel
        }
      >
        <p
          className={
            styles.notice
          }
        >
          CAREL Swap currently
          supports Starknet
          Sepolia and Mainnet.
        </p>
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
          {mode === "shield"
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
          ? `Public → AVNU → Public · ${network.label}`
          : mode === "shield"
            ? `Public ${sellAsset?.symbol ?? "asset"} → AVNU → Public ${buyAsset?.symbol ?? "asset"} → STRK20 Shield`
            : `Private ${sellAsset?.symbol ?? "asset"} → STRK20 Unshield → Public ${sellAsset?.symbol ?? "asset"} → AVNU → Public ${buyAsset?.symbol ?? "asset"}`}
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
          busy ||
          flowLocked
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
          busy ||
          flowLocked
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
          busy ||
          flowLocked
        }
        onChange={(event) =>
          changeAmount(
            event.target.value,
          )
        }
      />

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
              Preview pay
            </span>

            <strong>
              {formatUnits(
                quote.sellAmount,
                sellAsset.decimals,
                6,
              )}{" "}
              {sellAsset.symbol}
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Preview receive
            </span>

            <strong>
              {formatUnits(
                quote.buyAmount,
                buyAsset.decimals,
                6,
              )}{" "}
              {buyAsset.symbol}
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
                  ).toFixed(4)}%`
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

          <p
            className={
              styles.helper
            }
          >
            Preview only. CAREL
            refreshes the AVNU quote
            immediately before every
            public Swap stage is
            signed. Slippage limit:
            0.5%.
          </p>
        </>
      )}

      {swapAgentSession && (
        <>
          <div
            className={
              styles.rule
            }
          >
            <span>
              Agent run
            </span>

            <strong>
              {
                swapAgentSession
                  .run.status
              }
            </strong>
          </div>

          {swapAgentSession
            .run.stages.map(
              (stage) => (
                <div
                  key={
                    stage.stageId
                  }
                  className={
                    styles.rule
                  }
                >
                  <span>
                    {actionLabel(
                      stageAction(
                        stage.stageId,
                      ) ??
                        "stage",
                    )}
                  </span>

                  <strong>
                    {stage.status}
                    {stage.txHash
                      ? ` · ${shortHash(
                          stage.txHash,
                        )}`
                      : ""}
                  </strong>
                </div>
              ),
            )}

          {verifiedSwapOutput && (
            <div
              className={
                styles.rule
              }
            >
              <span>
                Verified output
              </span>

              <strong>
                {
                  verifiedSwapOutput
                    .amountText
                }{" "}
                {
                  verifiedSwapOutput
                    .assetSymbol
                }
              </strong>
            </div>
          )}
        </>
      )}

      {!flowLocked &&
        !quote && (
        <button
          type="button"
          className={
            styles.primary
          }
          disabled={
            !ready ||
            busy
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
            : "Get live quote"}
        </button>
      )}

      {!flowLocked &&
        quote &&
        !swapAgentSession && (
        <button
          type="button"
          className={
            styles.primary
          }
          disabled={busy}
          onClick={() =>
            void startFlow()
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
            ? "Starting Agent…"
            : mode === "normal"
              ? "Review & Swap"
              : mode === "shield"
                ? "Start Shield Swap"
                : "Start Unshield Swap"}
        </button>
      )}

      {flowLocked &&
        submittedStage && (
        <button
          type="button"
          className={
            styles.primary
          }
          disabled={busy}
          onClick={() =>
            void confirmSubmitted()
          }
        >
          {confirming
            ? (
              <LoaderCircle
                size={16}
              />
            )
            : (
              <RefreshCw
                size={16}
              />
            )}

          {confirming
            ? "Checking…"
            : `Check ${actionLabel(
                stageAction(
                submittedStage
                  .stageId,
              ) ??
                "stage",
              )} confirmation`}
        </button>
      )}

      {flowLocked &&
        !submittedStage &&
        reviewStage && (
        <button
          type="button"
          className={
            styles.primary
          }
          disabled={busy}
          onClick={() =>
            void executeNextStage()
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
            : stageAction(
                reviewStage
                  .stageId,
              ) ===
                "shield"
              ? "Shield verified output"
              : "Execute fresh AVNU Swap"}
        </button>
      )}

      {swapAgentSession
        ?.run.status ===
        "completed" && (
        <button
          type="button"
          className={
            styles.primary
          }
          disabled={busy}
          onClick={
            resetFlow
          }
        >
          <RefreshCw
            size={16}
          />
          New Swap
        </button>
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
