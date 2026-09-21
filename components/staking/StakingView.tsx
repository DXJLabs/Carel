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
  StakingController,
  StakingMode,
} from "./useStakingController";

import styles from "../CarelWorkspace.module.css";


function providerLabel(
  id:
    string,
) {
  if (
    id.includes(
      "endur",
    )
  ) {
    return "Endur";
  }

  if (
    id.includes(
      "avnu",
    )
  ) {
    return "AVNU";
  }

  return id;
}


function formatApr(
  value:
    number,
) {
  return Number.isFinite(
    value,
  ) &&
    value >= 0
    ? `${value.toFixed(2)}%`
    : "—";
}


function shortAddress(
  address:
    string,
) {
  return address.length >
    16
    ? `${address.slice(0, 8)}…${address.slice(-6)}`
    : address;
}


export function StakingView({
  mode,
  onPublicMode,
  controller,
}: Readonly<{
  mode:
    StakingMode;

  onPublicMode:
    () => void;

  controller:
    StakingController;
}>) {
  const {
    wallet,
    network,

    options,
    selectedOption,
    selectedAsset,

    amount,
    unstakeAmount,

    pool,
    position,
    shieldFee,

    loading,
    executing,
    confirming,
    positionExecuting,
    busy,
    flowLocked,

    error,
    success,

    stakingAgentSession,
    submittedStage,
    reviewStage,

    stageAction,

    selectAsset,
    changeAmount,
    setUnstakeAmount,

    startFlow,
    executeNextStage,
    confirmSubmitted,
    runPositionAction,
    refreshPosition,
    resetFlow,
  } =
    controller;


  if (
    !wallet.connected
  ) {
    return (
      <section
        className={
          styles.panel
        }
      >
        <h3>Staking</h3>

        <p
          className={
            styles.helper
          }
        >
          Connect Ready to discover
          executable staking assets
          for the selected Starknet
          network.
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


  if (
    !network
  ) {
    return (
      <section
        className={
          styles.panel
        }
      >
        <h3>Staking</h3>

        <p
          className={
            styles.notice
          }
        >
          This network is not
          registered in the CAREL
          Starknet runtime.
        </p>
      </section>
    );
  }


  if (
    options.length === 0 ||
    !selectedOption ||
    !selectedAsset
  ) {
    return (
      <section
        className={
          styles.panel
        }
      >
        <h3>Staking</h3>

        <p
          className={
            styles.notice
          }
        >
          No attached staking
          provider currently declares
          an executable asset for{" "}
          {network.label} in this
          mode.
        </p>

        {mode !==
          "normal" && (
          <button
            type="button"
            className={
              styles.secondary
            }
            onClick={
              onPublicMode
            }
          >
            Use public mode
          </button>
        )}
      </section>
    );
  }


  const outputAsset =
    selectedOption
      .outputAsset;


  const modeLabel =
    mode === "normal"
      ? "Staking"
      : mode === "shield"
        ? "Shield Staking"
        : "Unshield Staking";


  return (
    <section
      className={
        styles.panel
      }
    >
      <h3>
        {modeLabel}
      </h3>


      <div
        className={
          styles.route
        }
      >
        <span>
          {mode ===
          "unshield"
            ? "Private"
            : "Public"}{" "}
          {selectedAsset.symbol}
        </span>

        <ArrowRight
          size={16}
        />

        <span>
          {mode ===
          "shield"
            ? `Private ${outputAsset?.symbol ?? "receipt"}`
            : `Public ${selectedAsset.symbol} staking position`}
        </span>
      </div>


      <p
        className={
          styles.helper
        }
      >
        Asset availability is
        discovered from live CAREL
        provider capabilities. The UI
        does not hardcode STRK.
      </p>


      <div
        className={
          styles.rule
        }
      >
        <span>
          Provider
        </span>

        <strong>
          {providerLabel(
            selectedOption
              .providerId,
          )}
        </strong>
      </div>


      <div
        className={
          styles.rule
        }
      >
        <span>
          Network
        </span>

        <strong>
          {network.label}
        </strong>
      </div>


      <label
        className={
          styles.fieldLabel
        }
        htmlFor="carel-staking-asset"
      >
        Staking asset
      </label>

      <select
        id="carel-staking-asset"
        className={
          styles.amountInput
        }
        value={
          selectedAsset.id
        }
        disabled={
          busy ||
          flowLocked
        }
        onChange={(event) =>
          selectAsset(
            event.target.value,
          )
        }
      >
        {options.map(
          (option) => (
            <option
              key={
                `${option.asset.id}:${option.providerId}:${option.outputAsset?.id ?? "public"}`
              }
              value={
                option.asset.id
              }
            >
              {option.asset.symbol}
              {" · "}
              {providerLabel(
                option.providerId,
              )}
              {option.outputAsset
                ? ` → ${option.outputAsset.symbol}`
                : ""}
            </option>
          ),
        )}
      </select>


      {pool && (
        <>
          <div
            className={
              styles.rule
            }
          >
            <span>
              APR
            </span>

            <strong>
              {formatApr(
                pool.apr,
              )}
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

            <strong>
              {shortAddress(
                pool.poolAddress,
              )}
            </strong>
          </div>
        </>
      )}


      {mode ===
        "shield" &&
        outputAsset && (
        <>
          <div
            className={
              styles.rule
            }
          >
            <span>
              Private output
            </span>

            <strong>
              {outputAsset.symbol}
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Privacy fee
            </span>

            <strong>
              {shieldFee !==
              null
                ? `${formatUnits(
                    shieldFee,
                    selectedAsset
                      .decimals,
                    6,
                  )} ${selectedAsset.symbol}`
                : "Checking…"}
            </strong>
          </div>
        </>
      )}


      <label
        className={
          styles.fieldLabel
        }
        htmlFor="carel-staking-amount"
      >
        {mode ===
        "unshield"
          ? `Private ${selectedAsset.symbol} to stake`
          : `${selectedAsset.symbol} amount`}
      </label>

      <input
        id="carel-staking-amount"
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


      {mode ===
        "unshield" && (
        <p
          className={
            styles.privacyNote
          }
        >
          CAREL first withdraws the
          selected private asset to
          your public wallet. Public
          staking remains locked until
          that exact Unshield output
          is confirmed and verified.
        </p>
      )}


      {mode ===
        "shield" && (
        <p
          className={
            styles.privacyNote
          }
        >
          The staking provider owns
          the private receipt route.
          Agent Core tracks execution
          lifecycle without treating
          the private receipt as a
          public balance.
        </p>
      )}


      {stakingAgentSession &&
        stakingAgentSession
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
                  {stageAction(
                    stage.stageId,
                  ) ??
                    "stage"}
                </span>

                <strong>
                  {stage.status}
                  {stage.txHash
                    ? ` · ${shortAddress(
                        stage.txHash,
                      )}`
                    : ""}
                </strong>
              </div>
            ),
          )}


      {!flowLocked &&
        stakingAgentSession
          ?.run.status !==
          "completed" && (
        <button
          type="button"
          className={
            styles.primary
          }
          disabled={
            busy ||
            (
              mode !==
                "normal" &&
              !wallet
                .strk20Capable
            ) ||
            (
              mode ===
                "shield" &&
              shieldFee ===
                null
            )
          }
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
            ? "Waiting for Ready…"
            : mode ===
                "normal"
              ? "Review & Stake"
              : mode ===
                  "shield"
                ? "Review & Shield Stake"
                : "Start Unshield Stake"}
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
            : "Check confirmation"}
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
            : "Execute Staking"}
        </button>
      )}


      {stakingAgentSession &&
        (
          stakingAgentSession
            .run.status ===
            "completed" ||
          stakingAgentSession
            .run.status ===
            "failed"
        ) && (
        <button
          type="button"
          className={
            styles.secondary
          }
          disabled={busy}
          onClick={
            resetFlow
          }
        >
          <RefreshCw
            size={16}
          />

          New Stake
        </button>
      )}


      {loading && (
        <p
          className={
            styles.helper
          }
        >
          Refreshing staking
          position…
        </p>
      )}


      {position &&
        selectedAsset && (
        <>
          <div
            className={
              styles.rule
            }
          >
            <span>
              Staked
            </span>

            <strong>
              {formatUnits(
                position.amount,
                selectedAsset
                  .decimals,
                6,
              )}{" "}
              {selectedAsset.symbol}
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Rewards
            </span>

            <strong>
              {formatUnits(
                position
                  .unclaimedRewards,
                selectedAsset
                  .decimals,
                6,
              )}{" "}
              {selectedAsset.symbol}
            </strong>
          </div>

          {position.amount >
            0n && (
            <>
              <label
                className={
                  styles.fieldLabel
                }
                htmlFor="carel-unstake-amount"
              >
                Unstake amount
              </label>

              <input
                id="carel-unstake-amount"
                className={
                  styles.amountInput
                }
                inputMode="decimal"
                value={
                  unstakeAmount
                }
                disabled={
                  positionExecuting
                }
                onChange={(event) =>
                  setUnstakeAmount(
                    event.target
                      .value,
                  )
                }
              />

              <button
                type="button"
                className={
                  styles.secondary
                }
                disabled={
                  positionExecuting
                }
                onClick={() =>
                  void runPositionAction(
                    "initiateUnstake",
                  )
                }
              >
                Initiate unstake
              </button>
            </>
          )}


          {position.unpoolAmount >
            0n &&
            position.unpoolTime !==
              null &&
            Date.now() >=
              position.unpoolTime && (
            <button
              type="button"
              className={
                styles.secondary
              }
              disabled={
                positionExecuting
              }
              onClick={() =>
                void runPositionAction(
                  "completeUnstake",
                )
              }
            >
              Complete unstake
            </button>
          )}


          {position
            .unclaimedRewards >
            0n && (
            <button
              type="button"
              className={
                styles.secondary
              }
              disabled={
                positionExecuting
              }
              onClick={() =>
                void runPositionAction(
                  "claimRewards",
                )
              }
            >
              Claim rewards
            </button>
          )}
        </>
      )}


      <button
        type="button"
        className={
          styles.secondary
        }
        disabled={busy}
        onClick={() =>
          void refreshPosition()
        }
      >
        <RefreshCw
          size={16}
        />

        Refresh position
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


      {success && (
        <p
          className={
            styles.inlineStatus
          }
          role="status"
        >
          {success}
        </p>
      )}
    </section>
  );
}
