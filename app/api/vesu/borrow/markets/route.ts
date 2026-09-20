import {
  NextResponse,
} from "next/server";

import {
  CAREL_NETWORKS,
} from "@/lib/carel/networks";

import {
  discoverVesuBorrowMarkets,
  evaluateVesuBorrow,
  vesuFractionToBps,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/markets";

import {
  getVesuBorrowPair,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/pairs";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

function serializeMarket(
  item: Awaited<
    ReturnType<
      typeof discoverVesuBorrowMarkets
    >
  >[number],
  collateralAmount:
    string | null,
  borrowAmount:
    string | null,
) {
  const evaluation =
    collateralAmount &&
    borrowAmount
      ? evaluateVesuBorrow({
          risk:
            item.risk,
          collateralAmount,
          borrowAmount,
        })
      : null;

  return {
    id:
      item.market.id,

    provider:
      "Vesu",

    pool: {
      id:
        item.pool.id,
      name:
        item.pool.name,
      address:
        item.pool.address,
    },

    collateral: {
      id:
        item.market
          .collateralAsset.id,
      symbol:
        item.market
          .collateralAsset.symbol,
      decimals:
        item.market
          .collateralAsset.decimals,
    },

    debt: {
      id:
        item.market
          .debtAsset.id,
      symbol:
        item.market
          .debtAsset.symbol,
      decimals:
        item.market
          .debtAsset.decimals,
    },

    risk: {
      maxLtvBps:
        vesuFractionToBps(
          item.risk
            .pairConfig
            .maxLtv,
        ),

      liquidationFactorBps:
        vesuFractionToBps(
          item.risk
            .pairConfig
            .liquidationFactor,
        ),

      utilizationBps:
        vesuFractionToBps(
          item.risk
            .utilization,
        ),

      maxUtilizationBps:
        vesuFractionToBps(
          item.risk
            .maxUtilization,
        ),

      availableLiquidity:
        item.risk
          .reserve
          .toString(),

      pairDebt:
        item.risk
          .pairDebt
          .toString(),

      debtCap:
        item.risk
          .pairConfig
          .debtCap
          .toString(),

      observedAt:
        item.risk
          .observedAt,
    },

    evaluation:
      evaluation
        ? {
            eligible:
              evaluation
                .eligible,

            requestedLtvBps:
              vesuFractionToBps(
                evaluation
                  .requestedLtv,
              ),

            ltvHeadroomBps:
              vesuFractionToBps(
                evaluation
                  .ltvHeadroom,
              ),

            projectedUtilizationBps:
              vesuFractionToBps(
                evaluation
                  .projectedUtilization,
              ),

            blockers:
              evaluation
                .blockers,
          }
        : null,
  };
}

/**
 * Returns Vesu mainnet markets that CAREL verified on-chain for
 * its registered STRK collateral and native USDC debt assets.
 *
 * Optional amounts add a requested-position risk evaluation.
 */
export async function GET(
  request: Request,
) {
  try {
    const url =
      new URL(
        request.url,
      );

    const collateralAmount =
      url.searchParams.get(
        "collateralAmount",
      );

    const borrowAmount =
      url.searchParams.get(
        "borrowAmount",
      );

    if (
      (
        collateralAmount &&
        !borrowAmount
      ) ||
      (
        borrowAmount &&
        !collateralAmount
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Provide both collateralAmount and borrowAmount.",
        },
        {
          status: 400,
        },
      );
    }

    const network =
      CAREL_NETWORKS.mainnet;

    const debtAssetId =
      url.searchParams.get(
        "debtAssetId",
      ) ??
      network.assets.usdc.id;

    const pair =
      getVesuBorrowPair(
        network.assets.strk.id,
        debtAssetId,
      );

    if (!pair) {
      return NextResponse.json(
        {
          error:
            "CAREL does not enable this Vesu Borrow pair.",
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

    const markets =
      await discoverVesuBorrowMarkets({
        provider:
          network.provider,
        chainId:
          network.chainId,
        collateralAsset:
          pair.collateralAsset,
        debtAsset:
          pair.debtAsset,
      });

    return NextResponse.json(
      {
        network:
          network.label,

        pair:
          `${pair.collateralAsset.symbol}/${pair.debtAsset.symbol}`,

        markets:
          markets.map(
            (item) =>
              serializeMarket(
                item,
                collateralAmount,
                borrowAmount,
              ),
          ),
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
            : "Could not load Vesu markets.",
      },
      {
        status: 502,
        headers: {
          "Cache-Control":
            "no-store",
          "X-Content-Type-Options":
            "nosniff",
        },
      },
    );
  }
}
