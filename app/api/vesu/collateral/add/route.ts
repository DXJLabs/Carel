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
  buildVesuAddCollateralCalls,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/collateral";

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
      "Invalid collateral amount.",
    );
  }

  return value;
}

/**
 * Prepares an Add Collateral transaction only for an existing,
 * freshly verified Vesu Borrow position.
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
          "Invalid Add Collateral request.",
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

    const collateralText =
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
        "No active Vesu Borrow position was found in this pool.",
      );
    }

    const collateralAmount =
      parseUnits(
        collateralText,
        pair.collateralAsset
          .decimals,
      );

    if (
      collateralAmount <= 0n
    ) {
      throw new Error(
        "Collateral amount must be greater than zero.",
      );
    }

    const intent:
      CollateralIntent = {
        action:
          "add-collateral",

        collateralAssetId:
          pair.collateralAsset.id,

        amount:
          collateralAmount,

        positionId:
          risk.market.id,

        privacy:
          "public",
      };

    const calls =
      buildVesuAddCollateralCalls({
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
          debtAmount:
            position.debtAmount
              .toString(),

          currentCollateralAmount:
            position.collateralAmount
              .toString(),

          addCollateralAmount:
            collateralAmount
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

          collateralAmount:
            collateralAmount
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
            : "Could not prepare Vesu Add Collateral.",
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
