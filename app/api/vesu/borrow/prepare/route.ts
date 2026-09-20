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
  buildVesuBorrowCalls,
  createVesuBorrowIntent,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/borrow";

import {
  evaluateVesuBorrow,
  readVesuBorrowRisk,
  vesuFractionToBps,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/markets";

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
 * Parses a strict positive decimal amount supplied by CAREL's Borrow UI.
 */
function amountText(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== "string" ||
    value.length > 80 ||
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(
      value,
    )
  ) {
    throw new Error(
      `Invalid ${label}.`,
    );
  }

  return value;
}

/**
 * Prepares a Vesu Borrow transaction only after refreshing its live
 * pool risk state on-chain.
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
      throw new Error(
        "Invalid Borrow request.",
      );
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
          "Invalid Borrow request.",
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

    const collateralAmount =
      amountText(
        body.collateralAmount,
        "collateral amount",
      );

    const borrowAmount =
      amountText(
        body.borrowAmount,
        "borrow amount",
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

    const evaluation =
      evaluateVesuBorrow({
        risk,
        collateralAmount,
        borrowAmount,
      });

    if (!evaluation.eligible) {
      return NextResponse.json(
        {
          error:
            "The requested Borrow no longer passes Vesu risk checks.",

          blockers:
            evaluation.blockers,

          evaluation: {
            requestedLtvBps:
              vesuFractionToBps(
                evaluation
                  .requestedLtv,
              ),

            maxLtvBps:
              vesuFractionToBps(
                evaluation
                  .maxLtv,
              ),

            projectedUtilizationBps:
              vesuFractionToBps(
                evaluation
                  .projectedUtilization,
              ),

            maxUtilizationBps:
              vesuFractionToBps(
                evaluation
                  .maxUtilization,
              ),
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

    const intent =
      createVesuBorrowIntent({
        market:
          risk.market,
        collateralAmount,
        borrowAmount,
        privacy:
          "public",
      });

    const calls =
      buildVesuBorrowCalls({
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
          requestedLtvBps:
            vesuFractionToBps(
              evaluation
                .requestedLtv,
            ),

          maxLtvBps:
            vesuFractionToBps(
              evaluation
                .maxLtv,
            ),

          projectedUtilizationBps:
            vesuFractionToBps(
              evaluation
                .projectedUtilization,
            ),

          maxUtilizationBps:
            vesuFractionToBps(
              evaluation
                .maxUtilization,
            ),
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
            intent
              .collateralAmount
              .toString(),

          borrowAmount:
            intent
              .borrowAmount
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
            : "Could not prepare Vesu Borrow.",
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
