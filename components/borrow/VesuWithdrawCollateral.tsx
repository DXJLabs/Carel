"use client";

import {
  useState,
} from "react";

import {
  ArrowUpFromLine,
  Check,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";

import {
  useCarelTestnet,
} from "@/components/testnet/Strk20Testnet";

import {
  formatUnits,
  parseUnits,
} from "@/lib/carel/core/amounts";

import type {
  AssetRef,
} from "@/lib/carel/core/assets";

import type {
  VesuWithdrawCollateralExecutionPayload,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/collateral";

import styles from "../CarelWorkspace.module.css";

const SCALE =
  1_000_000_000_000_000_000n;

type WithdrawReview =
  Readonly<{
    provider: string;

    pool:
      Readonly<{
        id: string;
        name: string;
        address: string;
      }>;

    evaluation:
      Readonly<{
        eligible: boolean;
        withdrawAmount: string;
        projectedCollateralAmount: string;
        projectedLtv: string;
        maxLtv: string;
        projectedUtilization: string;
        maxUtilization: string;
        blockers:
          readonly string[];
      }>;

    execution:
      VesuWithdrawCollateralExecutionPayload;
  }>;

function responseObject(
  value: unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "CAREL Withdraw Collateral API returned an invalid response.",
    );
  }

  return value as Record<
    string,
    unknown
  >;
}

function percent(
  value: string,
): string {
  const bps =
    (
      BigInt(value) *
      10_000n
    ) /
      SCALE;

  return (
    Number(bps) /
    100
  ).toFixed(2);
}

/**
 * Two-step collateral withdrawal UI.
 *
 * A fresh server review is required before wallet signing because removing
 * collateral raises LTV and can affect pool utilization.
 */
export function VesuWithdrawCollateral({
  poolId,
  poolName,
  collateralAsset,
  collateralAmount,
  debtAsset,
  hidden,
  onComplete,
}: {
  poolId: string;
  poolName: string;
  collateralAsset: AssetRef;
  collateralAmount: bigint;
  debtAsset: AssetRef;
  hidden: boolean;
  onComplete: () => void;
}) {
  const wallet =
    useCarelTestnet();

  const [
    amount,
    setAmount,
  ] = useState("");

  const [
    review,
    setReview,
  ] = useState<
    WithdrawReview | null
  >(null);

  const [
    reviewing,
    setReviewing,
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

  let parsed:
    bigint | null = null;

  try {
    const value =
      parseUnits(
        amount,
        collateralAsset.decimals,
      );

    if (
      value > 0n &&
      value <
        collateralAmount
    ) {
      parsed = value;
    }
  } catch {
    parsed = null;
  }

  async function reviewWithdrawal() {
    if (
      reviewing ||
      executing ||
      wallet.busy ||
      !wallet.address ||
      parsed === null
    ) {
      return;
    }

    setReviewing(true);
    setReview(null);
    setError("");
    setSuccess("");

    try {
      const response =
        await fetch(
          "/api/vesu/collateral/withdraw",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                poolId,

                owner:
                  wallet.address,

                collateralAmount:
                  amount,

                collateralAssetId:
                  collateralAsset.id,

                debtAssetId:
                  debtAsset.id,
              }),
          },
        );

      const raw: unknown =
        await response.json();

      const payload =
        responseObject(
          raw,
        );

      if (!response.ok) {
        throw new Error(
          typeof payload.error ===
            "string"
            ? payload.error
            : "Withdrawal does not pass Vesu risk checks.",
        );
      }

      const prepared =
        payload as unknown as
          WithdrawReview;

      if (
        prepared.provider !==
          "Vesu" ||
        prepared.pool.id !==
          poolId ||
        !prepared.evaluation
          .eligible ||
        !prepared.execution
      ) {
        throw new Error(
          "CAREL received a mismatched Withdraw Collateral review.",
        );
      }

      setReview(
        prepared,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not review collateral withdrawal.",
      );
    } finally {
      setReviewing(false);
    }
  }

  async function confirmWithdrawal() {
    if (
      executing ||
      wallet.busy ||
      !review
    ) {
      return;
    }

    setExecuting(true);
    setError("");
    setSuccess("");

    try {
      const hash =
        await wallet
          .executeWithdrawVesuCollateral(
            review.execution,

            `Withdraw ${amount} ${collateralAsset.symbol} collateral · Vesu ${poolName}`,
          );

      setSuccess(
        `Withdrawal submitted: ${hash.slice(
          0,
          10,
        )}…${hash.slice(-6)}`,
      );

      setAmount("");
      setReview(null);

      onComplete();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Withdraw Collateral failed.",
      );
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div
      className={
        styles.withdrawCollateralPanel
      }
    >
      <div
        className={
          styles.positionSectionTitle
        }
      >
        <ArrowUpFromLine
          size={15}
        />

        <strong>
          Withdraw Collateral
        </strong>
      </div>

      <div
        className={
          styles.rule
        }
      >
        <span>
          Current collateral
        </span>

        <strong>
          {hidden
            ? "••••••"
            : formatUnits(
                collateralAmount,
                collateralAsset
                  .decimals,
                6,
              )}{" "}
          {collateralAsset.symbol}
        </strong>
      </div>

      <label
        className={
          styles.fieldLabel
        }
        htmlFor={`withdraw-collateral-${poolId}`}
      >
        Amount in{" "}
        {collateralAsset.symbol}
      </label>

      <div
        className={
          styles.repayInput
        }
      >
        <input
          id={`withdraw-collateral-${poolId}`}
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          disabled={
            reviewing ||
            executing ||
            wallet.busy
          }
          onChange={(
            event,
          ) => {
            setAmount(
              event.target.value,
            );

            setReview(null);
            setError("");
            setSuccess("");
          }}
        />

        <strong>
          {collateralAsset.symbol}
        </strong>
      </div>

      {amount &&
        parsed === null && (
          <p
            className={
              styles.helper
            }
          >
            Withdrawal must be
            greater than zero and
            below the current
            collateral. Use Close
            Position to exit fully.
          </p>
        )}

      {!review ? (
        <button
          type="button"
          className={
            styles.secondary
          }
          disabled={
            reviewing ||
            executing ||
            wallet.busy ||
            parsed === null
          }
          onClick={() =>
            void reviewWithdrawal()
          }
        >
          {reviewing ? (
            <LoaderCircle
              size={16}
            />
          ) : (
            <RefreshCw
              size={16}
            />
          )}

          {reviewing
            ? "Checking risk…"
            : "Review Withdrawal"}
        </button>
      ) : (
        <div
          className={
            styles.withdrawReview
          }
        >
          <div
            className={
              styles.rule
            }
          >
            <span>
              Collateral after
            </span>

            <strong>
              {hidden
                ? "••••••"
                : formatUnits(
                    BigInt(
                      review.evaluation
                        .projectedCollateralAmount,
                    ),
                    collateralAsset
                      .decimals,
                    6,
                  )}{" "}
              {collateralAsset.symbol}
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Projected LTV
            </span>

            <strong>
              {percent(
                review.evaluation
                  .projectedLtv,
              )}
              %
              {" / max "}
              {percent(
                review.evaluation
                  .maxLtv,
              )}
              %
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              {collateralAsset.symbol} utilization
            </span>

            <strong>
              {percent(
                review.evaluation
                  .projectedUtilization,
              )}
              %
              {" / max "}
              {percent(
                review.evaluation
                  .maxUtilization,
              )}
              %
            </strong>
          </div>

          <p
            className={
              styles.privacyNote
            }
          >
            This review is
            short-lived. Vesu will
            independently enforce
            collateralization,
            reserve, floor, and
            utilization rules again
            during execution.
          </p>

          <div
            className={
              styles.closeActions
            }
          >
            <button
              type="button"
              className={
                styles.secondary
              }
              disabled={
                executing ||
                wallet.busy
              }
              onClick={() =>
                void reviewWithdrawal()
              }
            >
              <RefreshCw
                size={15}
              />
              Refresh
            </button>

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
                void confirmWithdrawal()
              }
            >
              {executing ? (
                <LoaderCircle
                  size={16}
                />
              ) : (
                <Check
                  size={16}
                />
              )}

              {executing
                ? "Waiting for wallet…"
                : "Confirm Withdrawal"}
            </button>
          </div>
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
            Withdrawal blocked
          </strong>

          <p>{error}</p>
        </div>
      )}

      {success && (
        <p
          className={
            styles.inlineStatus
          }
        >
          <Check size={16}/>
          {success}
        </p>
      )}
    </div>
  );
}
