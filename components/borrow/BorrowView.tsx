"use client";

import {
  ArrowRight, Check, ChevronRight, EyeOff, Layers3, LoaderCircle,
  RefreshCw, ShieldAlert, ShieldCheck, Sparkles, WalletCards,
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
import ui from "./BorrowView.module.css";


function BorrowAssetIcon({ symbol }: { symbol: string }) {
  const icons: Record<string, string> = {
    STRK: "strk", USDC: "usdc", ETH: "eth",
    USDT: "usdt", WBTC: "wbtc", STRKBTC: "strkbtc",
  };
  const icon = icons[symbol.toUpperCase()];
  return icon
    ? <img className={ui.tokenIcon} src={`/token-icons/${icon}.svg`} width={32} height={32} alt=""/>
    : <span className={ui.fallbackIcon} aria-hidden="true">{symbol.slice(0, 1)}</span>;
}

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
    <section className={`${styles.borrowPanel} ${ui.shell}`} aria-label="CAREL Vesu Borrow">
      <div className={ui.heading}>
        <div className={ui.headingTitle}>
          <span className={ui.agentBadge}><Sparkles size={18} aria-hidden="true"/></span>
          <div><h3>{mode === "normal" ? "CAREL Borrow" : mode === "shield" ? "Shield Borrow" : "Unshield Borrow"}</h3>
          <p>Collateral-backed borrowing · Wallet approved</p></div>
        </div>
        <span className={ui.provider}>Vesu</span>
      </div>

      <div className={ui.borrowComposer}>
        <label className={ui.fieldLabel} htmlFor="carel-borrow-collateral">
          <span>Provide collateral</span>
          <small>{mode === "unshield" ? "Private STRK" : "Public STRK"}</small>
        </label>
        <div className={ui.amountRow}>
          <input id="carel-borrow-collateral" className={ui.amountInput}
            inputMode="decimal" value={collateralAmount} disabled={busy || borrowFlowLocked}
            onChange={event => changeCollateral(event.target.value)}
            aria-label="STRK collateral amount"/>
          <span className={ui.tokenPill}><BorrowAssetIcon symbol="STRK"/><strong>STRK</strong></span>
        </div>
        <div className={ui.balanceHint}>
          <span>Observed {mode === "unshield" ? "private" : "public"} balance</span>
          <strong>{mode === "unshield"
            ? !wallet.privateRevealed ? "Hidden · reveal first" : wallet.privateStrk === null
              ? "Unavailable" : `${formatUnits(wallet.privateStrk, network.assets.strk.decimals, 6)} STRK`
            : wallet.publicStrk === null ? "Unavailable"
              : `${formatUnits(wallet.publicStrk, network.assets.strk.decimals, 6)} STRK`}</strong>
        </div>
        <div className={ui.flowArrow}><ArrowRight size={16} aria-hidden="true"/><span>Borrow against collateral</span></div>
        <label className={ui.fieldLabel} htmlFor="carel-borrow-debt">
          <span>Borrow amount</span>
          <small>Requested debt</small>
        </label>
        <div className={ui.amountRow}>
          <input id="carel-borrow-debt" className={ui.amountInput}
            inputMode="decimal" value={borrowAmount} disabled={busy || borrowFlowLocked}
            onChange={event => changeBorrow(event.target.value)}
            aria-label={`${selectedDebtAsset.symbol} borrow amount`}/>
          <span className={ui.tokenPill}><BorrowAssetIcon symbol={selectedDebtAsset.symbol}/>
            <strong>{selectedDebtAsset.symbol}</strong></span>
        </div>
      </div>

      <div className={ui.debtSection}>
        <div className={ui.sectionTop}><strong>Borrow asset</strong><span>Registered candidates · live Vesu checks required</span></div>
        <div className={ui.debtOptions} role="group" aria-label="Choose debt asset">
          {VESU_BORROW_DEBT_ASSETS.map(asset =>
            <button type="button" className={ui.debtOption} key={asset.id}
              aria-pressed={asset.id === debtAssetId} disabled={busy || borrowFlowLocked}
              onClick={() => {
                if (asset.id === debtAssetId) return;
                setDebtAssetId(asset.id);
                resetMarkets();
                setError("");
                setSuccess("");
              }}>
              <BorrowAssetIcon symbol={asset.symbol}/><span>{asset.symbol}</span>
            </button>)}
        </div>
      </div>

      <section className={ui.marketPanel} aria-label="Vesu borrowing market">
        <div className={ui.marketHead}>
          <div><strong>Market & risk review</strong>
            <span>{loading ? "Checking Vesu markets…" :
              selectedMarket ? "Market discovered · risk review required" : "No verified market yet"}</span></div>
          <span className={ui.marketStatus}>{reviewed ? "Reviewed" : "Not reviewed"}</span>
        </div>
        {markets.length > 1 && <div className={ui.poolOptions} role="group" aria-label="Choose borrowing pool">
          {markets.map(market =>
            <button type="button" key={market.pool.id} className={ui.poolOption}
              aria-pressed={selectedMarket?.pool.id === market.pool.id}
              disabled={busy || borrowFlowLocked}
              onClick={() => { selectPool(market.pool.id); setSuccess(""); }}>
              {market.pool.name}
            </button>)}
        </div>}
        {selectedMarket ? <>
          <div className={ui.poolTitle}>{selectedMarket.pool.name}</div>
          <div className={ui.riskStats}>
            <div><span>Pool max LTV</span><strong>{formatBps(selectedMarket.risk.maxLtvBps)}</strong></div>
            <div><span>Available {selectedDebtAsset.symbol}</span><strong>{available}</strong></div>
            <div><span>Utilization</span><strong>{formatBps(selectedMarket.risk.utilizationBps)}</strong></div>
          </div>
          <p className={ui.riskNote}>Collateral stays exposed to price changes and liquidation. Market utilization is not borrowing APR. Pool {shortAddress(selectedMarket.pool.address)}.</p>
        </> : <p className={ui.marketEmpty}>CAREL must discover an active Vesu pool and verify the borrowing constraints before wallet review.</p>}
      </section>
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
