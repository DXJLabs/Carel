import {
  NextResponse,
} from "next/server";

import {
  parseUnits,
} from "@/lib/carel/core/amounts";

import type {
  RepayIntent,
} from "@/lib/carel/core/execution";

import {
  CAREL_NETWORKS,
} from "@/lib/carel/networks";

import {
  normalizeStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";

import {
  buildVesuRepayCalls,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/borrow";

import {
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

const PREPARED_WINDOW_MS =
  45_000;

/**
 * Accepts only an ordinary positive decimal user amount.
 */
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
      "Invalid Repay amount.",
    );
  }

  return value;
}

/**
 * Integer ceil division used for conservative Vesu debt-value checks.
 */
function divCeil(
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (denominator <= 0n) {
    throw new Error(
      "Invalid Vesu debt scale.",
    );
  }

  return (
    numerator +
    denominator -
    1n
  ) /
    denominator;
}

/**
 * Prepares a partial Vesu Repay after refreshing both the account position
 * and pool configuration on-chain.
 *
 * Full repayment is rejected here and will use a separate Native-denomination
 * close-position flow so per-block interest cannot leave dusty debt.
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
          "Invalid Repay request.",
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

    const repayText =
      amountText(
        body.repayAmount,
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
      position,
      risk,
    ] =
      await Promise.all([
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
      ]);

    if (
      !position ||
      position.debtAmount <= 0n
    ) {
      throw new Error(
        `No active Vesu ${pair.debtAsset.symbol} debt was found in this pool.`,
      );
    }

    const repayAmount =
      parseUnits(
        repayText,
        pair.debtAsset
          .decimals,
      );

    if (repayAmount <= 0n) {
      throw new Error(
        "Repay amount must be greater than zero.",
      );
    }

    if (
      repayAmount >=
      position.debtAmount
    ) {
      return NextResponse.json(
        {
          error:
            "Partial Repay must be below the current debt. Use Close Position for full repayment.",

          currentDebtAmount:
            position.debtAmount
              .toString(),
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

    const remainingDebt =
      position.debtAmount -
      repayAmount;

    const remainingDebtValue =
      divCeil(
        remainingDebt *
          risk.debtPrice.value,

        risk.debtConfig.scale,
      );

    if (
      remainingDebtValue <=
      risk.debtConfig.floor
    ) {
      return NextResponse.json(
        {
          error:
            "That partial Repay would leave debt below Vesu's minimum position floor. Use Close Position instead.",

          currentDebtAmount:
            position.debtAmount
              .toString(),

          remainingDebtAmount:
            remainingDebt
              .toString(),
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
      RepayIntent = {
        action:
          "repay",

        assetId:
          pair.debtAsset.id,

        amount:
          repayAmount,

        positionId:
          risk.market.id,

        privacy:
          "public",
      };

    const calls =
      buildVesuRepayCalls({
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

        position: {
          currentDebtAmount:
            position.debtAmount
              .toString(),

          repayAmount:
            repayAmount
              .toString(),

          remainingDebtAmount:
            remainingDebt
              .toString(),
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

          repayAmount:
            repayAmount
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
            : "Could not prepare Vesu Repay.",
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
