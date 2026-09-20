import {
  NextResponse,
} from "next/server";

import {
  CAREL_NETWORKS,
} from "@/lib/carel/networks";

import {
  normalizeStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";

import {
  readVesuBorrowRisk,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/markets";

import {
  getVesuPool,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/pools";

import {
  buildVesuLendCalls,
  createVesuLendIntent,
  getVesuLendPair,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/lending";


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
    typeof value !==
      "string" ||
    value.length > 80 ||
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(
      value,
    )
  ) {
    throw new Error(
      "Invalid Lend amount.",
    );
  }

  return value;
}


export async function POST(
  request: Request,
) {
  try {
    const raw: unknown =
      await request.json();

    if (
      !raw ||
      typeof raw !==
        "object" ||
      Array.isArray(raw)
    ) {
      throw new Error(
        "Invalid Lend request.",
      );
    }

    const body =
      raw as Record<
        string,
        unknown
      >;

    if (
      typeof body.poolId !==
        "string"
    ) {
      throw new Error(
        "Choose a verified Vesu pool.",
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

    if (
      typeof body.assetId !==
        "string" ||
      typeof body.counterpartAssetId !==
        "string"
    ) {
      throw new Error(
        "Choose a verified Vesu lending market.",
      );
    }

    const owner =
      normalizeStarknetAddress(
        body.owner,
      );

    const amount =
      amountText(
        body.amount,
      );

    const pair =
      getVesuLendPair(
        body.assetId,
        body.counterpartAssetId,
      );

    if (!pair) {
      throw new Error(
        "CAREL does not enable this Vesu Lend pair.",
      );
    }

    const network =
      CAREL_NETWORKS.mainnet;

    /*
     * Re-read the exact pool + pair immediately before
     * transaction preparation.
     */
    const risk =
      await readVesuBorrowRisk({
        provider:
          network.provider,

        pool,

        chainId:
          network.chainId,

        collateralAsset:
          pair.asset,

        debtAsset:
          pair.counterpart,
      });

    const intent =
      createVesuLendIntent({
        market:
          risk.market,

        amount,
      });

    const calls =
      buildVesuLendCalls({
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

        asset: {
          id:
            pair.asset.id,

          symbol:
            pair.asset.symbol,

          decimals:
            pair.asset.decimals,
        },

        execution: {
          chainId:
            network.chainId,

          poolId:
            pool.id,

          poolAddress:
            pool.address,

          owner,

          assetId:
            pair.asset.id,

          counterpartAssetId:
            pair.counterpart.id,

          amount:
            intent.amount
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
            : "Could not prepare Vesu Lend.",
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
