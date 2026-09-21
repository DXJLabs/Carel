"use client";

import {
  ArrowRight,
  Check,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  WalletCards,
} from "lucide-react";

import {
  formatUnits,
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  VESU_BORROW_DEBT_ASSETS,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/pairs";

import {
  type BorrowMode,
  formatBps,
  shortAddress,
} from "./model";

import type {
  BorrowController,
} from "./useBorrowController";

import styles from "../CarelWorkspace.module.css";


export function BorrowView({
  mode,
  onPublicMode,
  controller,
}: Readonly<{
  mode: BorrowMode;

  onPublicMode:
    () => void;

  controller:
    BorrowController;
}>) {
  const {
    wallet,
    network,
    collateralAmount,
    setCollateralAmount,
    borrowAmount,
    setBorrowAmount,
    debtAssetId,
    setDebtAssetId,
    selectedDebtAsset,
    markets,
    selectedMarket,
    reviewed,
    loading,
    discoverMarkets,
    reviewMarkets,
    resetMarkets,
    invalidateReview,
    selectPool,
    executing,
    setExecuting,
    unshielding,
    setUnshielding,
    checkingUnshield,
    setCheckingUnshield,
    shieldingBorrow,
    setShieldingBorrow,
    checkingBorrowAgent,
    setCheckingBorrowAgent,
    borrowAgentPlanRef,
    borrowAgentSession,
    setBorrowAgentSession,
    borrowAgentRuntimeRef,
    borrowAgentAccountRef,
    error,
    setError,
    success,
    setSuccess,
    createBorrowRuntime,
    clearBorrowAgentRefs,
    normalAgentSession,
    normalAgentBorrowStage,
    normalAgentBorrowOutput,
    shieldAgentSession,
    shieldBorrowStage,
    shieldStage,
    shieldBorrowOutput,
    shieldView,
    shieldAgentFlowLocked,
    unshieldAgentSession,
    unshieldAgentStage,
    unshieldAgentOutput,
    unshieldBorrowStage,
    unshieldBorrowOutput,
    unshieldProgress,
    normalAgentFlowLocked,
    busy,
    changeCollateral,
    changeBorrow,
    startUnshieldBorrow,
    refreshUnshieldConfirmation,
    refreshNormalBorrowConfirmation,
    refreshUnshieldBorrowConfirmation,
    refreshShieldBorrowConfirmation,
    shieldBorrowProceeds,
    refreshShieldStageConfirmation,
    reviewBorrow,
    executeBorrow,
  } = controller;

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

  const borrowFlowLocked =
    (
      mode === "shield" &&
      shieldAgentFlowLocked
    ) ||
    (
      mode === "normal" &&
      normalAgentFlowLocked
    ) ||
    (
      mode === "unshield" &&
      unshieldAgentSession !==
        null &&
      unshieldAgentSession
        .run.status !==
        "completed"
    );


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
      unshieldAgentStage
        ?.status ===
        "confirmed" &&
      unshieldAgentOutput !==
        null &&
      unshieldBorrowStage
        ?.status ===
        "review"
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
                shieldView.kind ===
                  "idle"
                  ? selectedDebtAsset
                      .symbol
                  : shieldView
                      .debtSymbol
              }
            </strong>
          </div>

          {shieldView.kind ===
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
          ) : shieldView.kind ===
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
                    shieldView
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

                {checkingBorrowAgent
                  ? "Checking confirmation…"
                  : "Check Borrow confirmation"}
              </button>
            </>
          ) : shieldView.kind ===
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
                  shieldView
                    .amount
                } {
                  shieldView
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
                  !wallet.strk20Capable
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
                  : `Review & Shield ${shieldView.amount} ${shieldView.debtSymbol}`}
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
                  shieldView
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
                    shieldView
                      .shieldHash,
                  )}
                </strong>
              </div>

              {shieldView
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

                  {checkingBorrowAgent
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

      {mode === "unshield" &&
        unshieldBorrowStage
          ?.status ===
          "submitted" && (
          <div
            className={
              styles.borrowRisk
            }
          >
            <div
              className={
                styles.notice
              }
              role="status"
            >
              <p>
                Vesu Borrow submitted
                as borrow-2. Agent Core
                completes the plan only
                after confirmation and
                output verification.
              </p>
            </div>

            {unshieldBorrowStage
              .txHash && (
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
                    unshieldBorrowStage
                      .txHash,
                  )}
                </strong>
              </div>
            )}

            <button
              type="button"
              className={
                styles.secondary
              }
              disabled={busy}
              onClick={() =>
                void refreshUnshieldBorrowConfirmation()
              }
            >
              <RefreshCw size={16} />

              {checkingBorrowAgent
                ? "Checking Borrow confirmation…"
                : "Check Borrow confirmation"}
            </button>
          </div>
        )}

      {mode === "unshield" &&
        unshieldBorrowStage
          ?.status ===
          "confirmed" &&
        unshieldBorrowOutput && (
          <p
            className={
              styles.inlineStatus
            }
          >
            <Check size={16} />
            Borrow verified: {
              unshieldBorrowOutput
                .amountText
            } {
              unshieldBorrowOutput
                .assetSymbol
            }.
          </p>
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
                borrowFlowLocked
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
                borrowFlowLocked
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
            borrowFlowLocked
          }
          onChange={(
            event,
          ) => {
            setDebtAssetId(
              event.target
                .value,
            );

            resetMarkets();
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
            disabled={
              busy ||
              borrowFlowLocked
            }
            onChange={(
              event,
            ) => {
              selectPool(
                event.target
                  .value,
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

      {mode === "normal" &&
        normalAgentBorrowStage
          ?.status ===
          "submitted" && (
          <div
            className={
              styles.borrowRisk
            }
          >
            <div
              className={
                styles.notice
              }
              role="status"
            >
              <p>
                Borrow submitted through
                Agent Core. CAREL will
                unlock completion only
                after Starknet
                confirmation and public
                output verification.
              </p>
            </div>

            {normalAgentBorrowStage
              .txHash && (
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
                    normalAgentBorrowStage
                      .txHash,
                  )}
                </strong>
              </div>
            )}

            <button
              type="button"
              className={
                styles.secondary
              }
              disabled={busy}
              onClick={() =>
                void refreshNormalBorrowConfirmation()
              }
            >
              <RefreshCw
                size={16}
              />

              {checkingBorrowAgent
                ? "Checking Borrow confirmation…"
                : "Check Borrow confirmation"}
            </button>
          </div>
        )}

      {mode === "normal" &&
        normalAgentBorrowStage
          ?.status ===
          "confirmed" &&
        normalAgentBorrowOutput && (
          <p
            className={
              styles.inlineStatus
            }
          >
            <Check
              size={16}
            />
            Borrow verified: {
              normalAgentBorrowOutput
                .amountText
            } {
              normalAgentBorrowOutput
                .assetSymbol
            }.
          </p>
        )}

      <button
        type="button"
        className={
          styles.secondary
        }
        disabled={
          busy ||
          !unshieldBorrowReady ||
          (
            mode !== "unshield" &&
            borrowFlowLocked
          )
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
