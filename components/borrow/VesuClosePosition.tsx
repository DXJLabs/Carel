"use client";

import {
  useMemo,
  useState,
} from "react";

import {
  AlertTriangle,
  Check,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";

import {
  useCarelTestnet,
} from "@/components/testnet/Strk20Testnet";

import {
  findAssetBalance,
} from "@/lib/carel/core/balances";

import {
  formatUnits,
} from "@/lib/carel/core/amounts";

import type {
  AssetRef,
} from "@/lib/carel/core/assets";

import type {
  VesuCloseExecutionPayload,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/borrow";

import styles from "../CarelWorkspace.module.css";

type ClosePrepareResponse =
  Readonly<{
    provider: string;

    pool:
      Readonly<{
        id: string;
        name: string;
        address: string;
      }>;

    position:
      Readonly<{
        debtSnapshot: string;
        collateralSnapshot: string;
        collateralShares: string;
        nominalDebt: string;
        approvalCap: string;
      }>;

    execution:
      VesuCloseExecutionPayload;
  }>;

/**
 * Ensures CAREL only consumes JSON object responses.
 */
function responseObject(
  value: unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "CAREL Close Position API returned an invalid response.",
    );
  }

  return value as Record<
    string,
    unknown
  >;
}

/**
 * Full Vesu close flow.
 *
 * Review and execution are intentionally separate: the server first refreshes
 * native position units, then the wallet independently validates that exact
 * short-lived payload before signing.
 */
export function VesuClosePosition({
  poolId,
  poolName,
  collateralAsset,
  debtAsset,
  hidden,
  onComplete,
}: {
  poolId: string;
  poolName: string;
  collateralAsset: AssetRef;
  debtAsset: AssetRef;
  hidden: boolean;
  onComplete: () => void;
}) {
  const wallet =
    useCarelTestnet();

  const [
    review,
    setReview,
  ] = useState<
    ClosePrepareResponse | null
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

  const publicDebtBalance =
    useMemo(
      () =>
        findAssetBalance(
          wallet.balances,
          debtAsset.id,
          "public",
        )?.amount ??
        null,
      [
        wallet.balances,
        debtAsset.id,
      ],
    );

  const debtSnapshot =
    review
      ? BigInt(
          review.position
            .debtSnapshot,
        )
      : null;

  const collateralSnapshot =
    review
      ? BigInt(
          review.position
            .collateralSnapshot,
        )
      : null;

  const approvalCap =
    review
      ? BigInt(
          review.position
            .approvalCap,
        )
      : null;

  const enoughDebtBalance =
    debtSnapshot === null ||
    publicDebtBalance === null ||
    publicDebtBalance >=
      debtSnapshot;

  const lowHeadroom =
    debtSnapshot !== null &&
    approvalCap !== null &&
    publicDebtBalance !== null &&
    publicDebtBalance >=
      debtSnapshot &&
    publicDebtBalance <
      approvalCap;

  /**
   * Gets fresh native collateral shares, nominal debt, and current debt
   * directly from Vesu before presenting a destructive close confirmation.
   */
  async function reviewClose() {
    if (
      reviewing ||
      executing ||
      wallet.busy ||
      !wallet.address
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
          "/api/vesu/close/prepare",
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
            : "Could not review Vesu Close Position.",
        );
      }

      const prepared =
        payload as unknown as
          ClosePrepareResponse;

      if (
        prepared.provider !==
          "Vesu" ||
        prepared.pool.id !==
          poolId ||
        !prepared.execution
      ) {
        throw new Error(
          "CAREL received a mismatched Close Position review.",
        );
      }

      setReview(
        prepared,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not review Close Position.",
      );
    } finally {
      setReviewing(false);
    }
  }

  /**
   * Submits only the previously reviewed short-lived execution payload.
   * The wallet layer rebuilds all three calls before account.execute().
   */
  async function closePosition() {
    if (
      executing ||
      wallet.busy ||
      !review ||
      !enoughDebtBalance
    ) {
      return;
    }

    setExecuting(true);
    setError("");
    setSuccess("");

    try {
      const hash =
        await wallet
          .executeCloseVesuPosition(
            review.execution,

            `Close Vesu position · ${poolName}`,
          );

      setSuccess(
        `Close Position submitted: ${hash.slice(
          0,
          10,
        )}…${hash.slice(-6)}`,
      );

      setReview(null);

      onComplete();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Vesu Close Position failed.",
      );
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div
      className={
        styles.closePositionPanel
      }
    >
      <div
        className={
          styles.closePositionTitle
        }
      >
        <AlertTriangle
          size={17}
        />

        <div>
          <strong>
            Close Position
          </strong>

          <small>
            Repay all debt and
            withdraw all collateral
          </small>
        </div>
      </div>

      {!review ? (
        <>
          <p
            className={
              styles.privacyNote
            }
          >
            CAREL will reload the
            current Vesu debt,
            collateral shares, and
            nominal debt before
            preparing the close.
          </p>

          <button
            type="button"
            className={
              styles.secondary
            }
            disabled={
              reviewing ||
              executing ||
              wallet.busy
            }
            onClick={() =>
              void reviewClose()
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
              ? "Refreshing position…"
              : "Review Close Position"}
          </button>
        </>
      ) : (
        <>
          <div
            className={
              styles.rule
            }
          >
            <span>
              Debt snapshot
            </span>

            <strong>
              {hidden
                ? "••••••"
                : formatUnits(
                    debtSnapshot!,
                    debtAsset
                      .decimals,
                    6,
                  )}{" "}
              {debtAsset.symbol}
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Collateral returned
            </span>

            <strong>
              {hidden
                ? "••••••"
                : formatUnits(
                    collateralSnapshot!,
                    collateralAsset
                      .decimals,
                    6,
                  )}{" "}
              {
                collateralAsset
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
              Max temporary approval
            </span>

            <strong>
              {hidden
                ? "••••••"
                : formatUnits(
                    approvalCap!,
                    debtAsset
                      .decimals,
                    6,
                  )}{" "}
              {debtAsset.symbol}
            </strong>
          </div>

          <p
            className={
              styles.privacyNote
            }
          >
            Vesu calculates the
            actual debt at the
            execution block. CAREL
            uses Native denomination
            and resets the temporary
            token allowance to zero
            in the same transaction.
          </p>

          {!enoughDebtBalance && (
            <div
              className={
                styles.notice
              }
              role="alert"
            >
              <p>
                Your public{" "}
                {debtAsset.symbol}{" "}
                balance is below the
                current debt
                snapshot.
              </p>
            </div>
          )}

          {lowHeadroom && (
            <div
              className={
                styles.notice
              }
              role="status"
            >
              <p>
                Your balance covers
                the current debt but
                has little room for
                additional interest
                before inclusion.
              </p>
            </div>
          )}

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
                void reviewClose()
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
                styles.dangerButton
              }
              disabled={
                executing ||
                wallet.busy ||
                !enoughDebtBalance
              }
              onClick={() =>
                void closePosition()
              }
            >
              {executing ? (
                <LoaderCircle
                  size={16}
                />
              ) : (
                <AlertTriangle
                  size={16}
                />
              )}

              {executing
                ? "Waiting for wallet…"
                : "Confirm Close Position"}
            </button>
          </div>
        </>
      )}

      {error && (
        <div
          className={
            styles.error
          }
          role="alert"
        >
          <strong>
            Close unavailable
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
    </div>
  );
}
