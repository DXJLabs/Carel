import {
  NextResponse,
} from "next/server";

import {
  parseUnits,
} from "@/lib/carel/core/amounts";

import type {
  CollateralIntent,
} from "@/lib/carel/core/execution";

import {
  CAREL_NETWORKS,
} from "@/lib/carel/networks";

import {
  normalizeStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";

import {
  buildVesuWithdrawCollateralCalls,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/collateral";

import {
  calculateVesuDebt,
  calculateVesuUtilization,
  readVesuBorrowRisk,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/markets";

import {
  readVesuBorrowPosition,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/positions";

import {
  getVesuPool,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/pools";

import {
  getVesuBorrowPair,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/pairs";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const SCALE =
  1_000_000_000_000_000_000n;

const PREPARED_WINDOW_MS =
  45_000;

function divCeil(
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (denominator <= 0n) {
    throw new Error(
      "Invalid Vesu denominator.",
    );
  }

  return (
    numerator +
    denominator -
    1n
  ) /
    denominator;
}

function amountText(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    value.length > 80 ||
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(
      value,
    )
  ) {
    throw new Error(
      "Invalid withdrawal amount.",
    );
  }

  return value;
}

/**
 * Reviews a collateral withdrawal using the same share-rounding direction
 * used by Vesu for negative Assets-denominated collateral deltas.
 */
export async function POST(
  request: Request,
) {
  let body:
    Record<string, unknown>;

  try {
    const raw: unknown =
      await request.json();

    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw)
    ) {
      throw new Error();
    }

    body =
      raw as Record<
        string,
        unknown
      >;
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid Withdraw Collateral request.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    if (
      typeof body.poolId !==
      "string"
    ) {
      throw new Error(
        "Choose an existing Vesu position.",
      );
    }

    const pool =
      getVesuPool(
        body.poolId,
      );

    if (!pool) {
      throw new Error(
        "That Vesu pool is not enabled in CAREL.",
      );
    }

    if (
      typeof body.owner !==
      "string"
    ) {
      throw new Error(
        "Connect a Starknet account first.",
      );
    }

    const owner =
      normalizeStarknetAddress(
        body.owner,
      );

    const amount =
      amountText(
        body.collateralAmount,
      );

    const network =
      CAREL_NETWORKS.mainnet;

    const pair =
      getVesuBorrowPair(
        typeof body.collateralAssetId ===
          "string"
          ? body.collateralAssetId
          : network.assets.strk.id,
        typeof body.debtAssetId ===
          "string"
          ? body.debtAssetId
          : network.assets.usdc.id,
      );

    if (!pair) {
      throw new Error(
        "CAREL does not enable this Vesu Borrow pair.",
      );
    }


    const [
      risk,
      position,
    ] =
      await Promise.all([
        readVesuBorrowRisk({
          provider:
            network.provider,

          pool,

          chainId:
            network.chainId,

          collateralAsset:
            pair.collateralAsset,

          debtAsset:
            pair.debtAsset,
        }),

        readVesuBorrowPosition({
          provider:
            network.provider,

          pool,

          owner,

          collateralAsset:
            pair.collateralAsset,

          debtAsset:
            pair.debtAsset,
        }),
      ]);

    if (
      !position ||
      position.debtAmount <= 0n ||
      position.collateralShares <=
        0n
    ) {
      throw new Error(
        "No active Vesu Borrow position was found in this pool.",
      );
    }

    const withdrawAmount =
      parseUnits(
        amount,
        pair.collateralAsset
          .decimals,
      );

    if (
      withdrawAmount <= 0n
    ) {
      throw new Error(
        "Withdrawal amount must be greater than zero.",
      );
    }

    if (
      withdrawAmount >=
      position.collateralAmount
    ) {
      throw new Error(
        "Withdraw Collateral must leave collateral in an active debt position. Use Close Position to exit completely.",
      );
    }

    const config =
      risk.collateralConfig;

    if (
      config.totalCollateralShares <=
        0n
    ) {
      throw new Error(
        "Vesu collateral share state is unavailable.",
      );
    }

    if (
      withdrawAmount >
      config.reserve
    ) {
      throw new Error(
        "Requested collateral exceeds currently withdrawable pool reserve.",
      );
    }

    const collateralAssetDebt =
      calculateVesuDebt(
        config.totalNominalDebt,
        config.lastRateAccumulator,
        config.scale,
      );

    const totalAssets =
      config.reserve +
      collateralAssetDebt;

    if (totalAssets <= 0n) {
      throw new Error(
        "Vesu collateral asset state is invalid.",
      );
    }

    // Negative Assets collateral uses round-up share conversion.
    const sharesToBurn =
      divCeil(
        withdrawAmount *
          config.totalCollateralShares,

        totalAssets,
      );

    if (
      sharesToBurn <= 0n ||
      sharesToBurn >=
        position.collateralShares ||
      sharesToBurn >=
        config.totalCollateralShares
    ) {
      throw new Error(
        "This withdrawal would consume the position's remaining collateral shares. Use Close Position instead.",
      );
    }

    const remainingShares =
      position.collateralShares -
      sharesToBurn;

    const projectedReserve =
      config.reserve -
      withdrawAmount;

    const projectedTotalShares =
      config.totalCollateralShares -
      sharesToBurn;

    const projectedTotalAssets =
      projectedReserve +
      collateralAssetDebt;

    if (
      projectedTotalShares <= 0n ||
      projectedTotalAssets <= 0n
    ) {
      throw new Error(
        "Invalid projected Vesu collateral state.",
      );
    }

    // Mirrors Vesu calculate_collateral(..., round_up = false).
    const projectedCollateralAmount =
      (
        remainingShares *
        projectedTotalAssets
      ) /
        projectedTotalShares;

    // Vesu values collateral with floor rounding.
    const projectedCollateralValue =
      (
        projectedCollateralAmount *
        risk.collateralPrice.value
      ) /
        config.scale;

    // Vesu values debt with ceil rounding.
    const currentDebtAmount =
      divCeil(
        position.nominalDebt *
          risk.debtConfig
            .lastRateAccumulator *
          risk.debtConfig.scale,

        SCALE *
          SCALE,
      );

    const currentDebtValue =
      divCeil(
        currentDebtAmount *
          risk.debtPrice.value,

        risk.debtConfig.scale,
      );

    if (
      projectedCollateralValue <= 0n
    ) {
      throw new Error(
        "Projected collateral value is zero.",
      );
    }

    const projectedLtv =
      divCeil(
        currentDebtValue *
          SCALE,

        projectedCollateralValue,
      );

    const projectedUtilization =
      calculateVesuUtilization(
        projectedReserve,
        collateralAssetDebt,
      );

    const blockers:
      string[] = [];

    // CAREL intentionally keeps a strict headroom instead of allowing
    // equality at the protocol maximum.
    if (
      projectedLtv >=
      risk.pairConfig.maxLtv
    ) {
      blockers.push(
        "Projected LTV reaches or exceeds the Vesu maximum.",
      );
    }

    if (
      projectedCollateralValue <=
      config.floor
    ) {
      blockers.push(
        "Projected collateral would fall at or below Vesu's minimum position floor.",
      );
    }

    if (
      projectedUtilization >
      config.maxUtilization
    ) {
      blockers.push(
        `Withdrawal would exceed the ${pair.collateralAsset.symbol} asset maximum utilization.`,
      );
    }

    if (blockers.length) {
      return NextResponse.json(
        {
          error:
            blockers.join(" "),

          evaluation: {
            eligible:
              false,

            projectedCollateralAmount:
              projectedCollateralAmount
                .toString(),

            projectedLtv:
              projectedLtv
                .toString(),

            maxLtv:
              risk.pairConfig
                .maxLtv
                .toString(),

            projectedUtilization:
              projectedUtilization
                .toString(),

            maxUtilization:
              config.maxUtilization
                .toString(),

            blockers,
          },
        },
        {
          status: 422,

          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    const intent:
      CollateralIntent = {
        action:
          "withdraw-collateral",

        collateralAssetId:
          pair.collateralAsset.id,

        amount:
          withdrawAmount,

        positionId:
          risk.market.id,

        privacy:
          "public",
      };

    const calls =
      buildVesuWithdrawCollateralCalls({
        market:
          risk.market,

        owner,

        intent,
      });

    const preparedAt =
      Date.now();

    return NextResponse.json(
      {
        provider:
          "Vesu",

        pool: {
          id:
            pool.id,

          name:
            pool.name,

          address:
            pool.address,
        },

        evaluation: {
          eligible:
            true,

          withdrawAmount:
            withdrawAmount
              .toString(),

          projectedCollateralAmount:
            projectedCollateralAmount
              .toString(),

          projectedLtv:
            projectedLtv
              .toString(),

          maxLtv:
            risk.pairConfig
              .maxLtv
              .toString(),

          projectedUtilization:
            projectedUtilization
              .toString(),

          maxUtilization:
            config.maxUtilization
              .toString(),

          blockers: [],
        },

        execution: {
          chainId:
            network.chainId,

          poolId:
            pool.id,

          poolAddress:
            pool.address,

          owner,

          collateralAssetId:
            pair.collateralAsset.id,

          debtAssetId:
            pair.debtAsset.id,

          collateralAmount:
            withdrawAmount
              .toString(),

          preparedAt,

          expiresAt:
            preparedAt +
            PREPARED_WINDOW_MS,

          calls,
        },
      },
      {
        headers: {
          "Cache-Control":
            "no-store",

          "X-Content-Type-Options":
            "nosniff",
        },
      },
    );
  } catch (cause) {
    return NextResponse.json(
      {
        error:
          cause instanceof Error
            ? cause.message
            : "Could not prepare Vesu Withdraw Collateral.",
      },
      {
        status: 400,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }
}
