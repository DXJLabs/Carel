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
  getVesuBorrowPair,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/pairs";

import {
  getVesuPool,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/pools";

import {
  buildVesuLendCalls,
  createVesuLendIntent,
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

    const owner =
      normalizeStarknetAddress(
        body.owner,
      );

    const amount =
      amountText(
        body.amount,
      );

    const network =
      CAREL_NETWORKS.mainnet;

    const pair =
      getVesuBorrowPair(
        network.assets.strk.id,
        typeof body.counterpartAssetId ===
          "string"
          ? body.counterpartAssetId
          : network.assets.usdc.id,
      );

    if (!pair) {
      throw new Error(
        "CAREL does not enable this Vesu Lend market.",
      );
    }

    // Fresh on-chain verification immediately before preparation.
    const risk =
      await readVesuBorrowRisk({
        provider:
          network.provider,

        pool,

        chainId:
          network.chainId,

        collateralAsset:
          pair.collateralAsset,

        debtAsset:
          pair.debtAsset,
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

        execution: {
          chainId:
            network.chainId,

          poolId:
            pool.id,

          poolAddress:
            pool.address,

          owner,

          assetId:
            pair.collateralAsset.id,

          counterpartAssetId:
            pair.debtAsset.id,

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
