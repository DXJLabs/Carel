"use client";

import {
  useMemo,
  useState,
} from "react";

import {
  Check,
  LoaderCircle,
  Plus,
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
  VesuAddCollateralExecutionPayload,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/collateral";

import styles from "../CarelWorkspace.module.css";

type PrepareResponse =
  Readonly<{
    provider: string;

    pool:
      Readonly<{
        id: string;
        name: string;
        address: string;
      }>;

    execution:
      VesuAddCollateralExecutionPayload;
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
      "CAREL Add Collateral API returned an invalid response.",
    );
  }

  return value as Record<
    string,
    unknown
  >;
}

/**
 * Adds public collateral to an existing Vesu Borrow position.
 */
export function VesuAddCollateral({
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

  const publicBalance =
    useMemo(
      () =>
        findAssetBalance(
          wallet.balances,
          collateralAsset.id,
          "public",
        )?.amount ??
        null,
      [
        wallet.balances,
        collateralAsset.id,
      ],
    );

  let parsed:
    bigint | null = null;

  try {
    const value =
      parseUnits(
        amount,
        collateralAsset.decimals,
      );

    if (value > 0n) {
      parsed = value;
    }
  } catch {
    parsed = null;
  }

  const enough =
    parsed !== null &&
    (
      publicBalance === null ||
      publicBalance >=
        parsed
    );

  async function submit() {
    if (
      executing ||
      wallet.busy ||
      !wallet.address ||
      parsed === null ||
      !enough
    ) {
      return;
    }

    setExecuting(true);
    setError("");
    setSuccess("");

    try {
      const response =
        await fetch(
          "/api/vesu/collateral/add",
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
            : "Could not prepare Add Collateral.",
        );
      }

      const prepared =
        payload as unknown as
          PrepareResponse;

      if (
        prepared.provider !==
          "Vesu" ||
        prepared.pool.id !==
          poolId ||
        !prepared.execution
      ) {
        throw new Error(
          "CAREL received a mismatched Add Collateral preparation.",
        );
      }

      const hash =
        await wallet
          .executeAddVesuCollateral(
            prepared.execution,

            `Add ${amount} ${collateralAsset.symbol} collateral · Vesu ${poolName}`,
          );

      setSuccess(
        `Collateral submitted: ${hash.slice(
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
          : "Add Collateral failed.",
      );
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div
      className={
        styles.addCollateralPanel
      }
    >
      <div
        className={
          styles.positionSectionTitle
        }
      >
        <Plus size={15}/>

        <strong>
          Add Collateral
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

      <div
        className={
          styles.rule
        }
      >
        <span>
          Public balance
        </span>

        <strong>
          {hidden
            ? "••••••"
            : publicBalance ===
                null
              ? "—"
              : formatUnits(
                  publicBalance,
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
        htmlFor={`add-collateral-${poolId}`}
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
          id={`add-collateral-${poolId}`}
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          disabled={
            executing ||
            wallet.busy
          }
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
          {collateralAsset.symbol}
        </strong>
      </div>

      {parsed !== null &&
        !enough && (
          <div
            className={
              styles.notice
            }
            role="alert"
          >
            <p>
              Public{" "}
              {collateralAsset.symbol}{" "}
              balance is below this
              collateral amount.
            </p>
          </div>
        )}

      <p
        className={
          styles.privacyNote
        }
      >
        Adding collateral increases
        the public Vesu position
        collateral. CAREL uses an
        exact token approval.
      </p>

      <button
        type="button"
        className={
          styles.secondary
        }
        disabled={
          executing ||
          wallet.busy ||
          parsed === null ||
          !enough
        }
        onClick={() =>
          void submit()
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
          : "Review & Add Collateral"}
      </button>

      {error && (
        <div
          className={
            styles.error
          }
          role="alert"
        >
          <strong>
            Add Collateral unavailable
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
