"use client";

import {
  useMemo,
  useState,
} from "react";

import {
  Check,
  LoaderCircle,
  X,
} from "lucide-react";

import {
  useCarelTestnet,
} from "@/components/testnet/Strk20Testnet";

import {
  findAssetBalance,
} from "@/lib/carel/core/balances";

import {
  formatUnits,
  parseUnits,
} from "@/lib/carel/core/amounts";

import type {
  AssetRef,
} from "@/lib/carel/core/assets";

import type {
  VesuRepayExecutionPayload,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/borrow";

import styles from "../CarelWorkspace.module.css";

type RepayPrepareResponse =
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
        currentDebtAmount:
          string;

        repayAmount:
          string;

        remainingDebtAmount:
          string;
      }>;

    execution:
      VesuRepayExecutionPayload;
  }>;

/**
 * Parses an API JSON object without trusting arbitrary response data.
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
      "CAREL Repay API returned an invalid response.",
    );
  }

  return value as Record<
    string,
    unknown
  >;
}

/**
 * Portfolio-scoped partial Repay form.
 *
 * Full debt repayment is intentionally excluded because Vesu requires
 * Native denomination for an exact block-aware Close Position flow.
 */
export function VesuRepay({
  poolId,
  poolName,
  debtAsset,
  debtAmount,
  hidden,
  onClose,
  onComplete,
}: {
  poolId: string;
  poolName: string;
  debtAsset: AssetRef;
  debtAmount: bigint;
  hidden: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const wallet =
    useCarelTestnet();

  const [
    amount,
    setAmount,
  ] = useState("");

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

  const formattedDebt =
    hidden
      ? "••••••"
      : formatUnits(
          debtAmount,
          debtAsset.decimals,
          6,
        );

  const formattedBalance =
    hidden
      ? "••••••"
      : publicDebtBalance ===
          null
        ? "—"
        : formatUnits(
            publicDebtBalance,
            debtAsset.decimals,
            6,
          );

  /**
   * Performs local input checks before CAREL asks the server for a
   * freshly validated Repay transaction.
   */
  function parsedAmount():
    bigint | null {
    try {
      const parsed =
        parseUnits(
          amount,
          debtAsset.decimals,
        );

      if (
        parsed <= 0n ||
        parsed >=
          debtAmount
      ) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  const parsed =
    parsedAmount();

  const enoughBalance =
    parsed !== null &&
    (
      publicDebtBalance ===
        null ||
      publicDebtBalance >=
        parsed
    );

  /**
   * Requests a fresh partial-Repay payload and hands only that payload to
   * the wallet-side strict Vesu validator.
   */
  async function repay() {
    if (
      executing ||
      wallet.busy ||
      !wallet.address ||
      parsed === null ||
      !enoughBalance
    ) {
      return;
    }

    setExecuting(true);
    setError("");
    setSuccess("");

    try {
      const response =
        await fetch(
          "/api/vesu/repay/prepare",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                poolId,

                owner:
                  wallet.address,

                repayAmount:
                  amount,
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
            : "Could not prepare Vesu Repay.",
        );
      }

      const prepared =
        payload as unknown as
          RepayPrepareResponse;

      if (
        prepared.provider !==
          "Vesu" ||
        prepared.pool.id !==
          poolId ||
        !prepared.execution
      ) {
        throw new Error(
          "CAREL received a mismatched Vesu Repay preparation.",
        );
      }

      const hash =
        await wallet.executeRepay(
          prepared.execution,

          `Repay ${amount} ${debtAsset.symbol} · Vesu ${poolName}`,
        );

      setSuccess(
        `Repay submitted: ${hash.slice(
          0,
          10,
        )}…${hash.slice(-6)}`,
      );

      setAmount("");

      onComplete();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Vesu Repay failed.",
      );
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div
      className={
        styles.repayPanel
      }
    >
      <div
        className={
          styles.repayHeader
        }
      >
        <div>
          <strong>
            Partial Repay
          </strong>

          <small>
            Vesu · {poolName}
          </small>
        </div>

        <button
          type="button"
          className={
            styles.iconButton
          }
          aria-label="Close Repay form"
          disabled={
            executing
          }
          onClick={onClose}
        >
          <X size={16}/>
        </button>
      </div>

      <div
        className={
          styles.rule
        }
      >
        <span>
          Current debt
        </span>

        <strong>
          {formattedDebt}{" "}
          {debtAsset.symbol}
        </strong>
      </div>

      <div
        className={
          styles.rule
        }
      >
        <span>
          Public balance
        </span>

        <strong>
          {formattedBalance}{" "}
          {debtAsset.symbol}
        </strong>
      </div>

      <label
        className={
          styles.fieldLabel
        }
        htmlFor={`repay-${poolId}`}
      >
        Repay amount in{" "}
        {debtAsset.symbol}
      </label>

      <div
        className={
          styles.repayInput
        }
      >
        <input
          id={`repay-${poolId}`}
          inputMode="decimal"
          value={amount}
          disabled={
            executing ||
            wallet.busy
          }
          placeholder="0.00"
          onChange={(
            event,
          ) => {
            setAmount(
              event.target.value,
            );

            setError("");
            setSuccess("");
          }}
        />

        <strong>
          {debtAsset.symbol}
        </strong>
      </div>

      {amount &&
        parsed === null && (
          <p
            className={
              styles.helper
            }
          >
            Partial Repay must be
            greater than zero and
            below the current debt.
            Full repayment uses
            Close Position.
          </p>
        )}

      {parsed !== null &&
        !enoughBalance && (
          <div
            className={
              styles.notice
            }
            role="alert"
          >
            <p>
              Public{" "}
              {debtAsset.symbol}{" "}
              balance is below the
              requested Repay
              amount.
            </p>
          </div>
        )}

      <p
        className={
          styles.privacyNote
        }
      >
        CAREL refreshes the
        on-chain position before
        signing and blocks a partial
        Repay that would leave debt
        below Vesu&apos;s minimum
        position floor.
      </p>

      <button
        type="button"
        className={
          styles.primary
        }
        disabled={
          executing ||
          wallet.busy ||
          parsed === null ||
          !enoughBalance
        }
        onClick={() =>
          void repay()
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
          : "Review & Repay"}
      </button>

      {error && (
        <div
          className={
            styles.error
          }
          role="alert"
        >
          <strong>
            Repay unavailable
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
