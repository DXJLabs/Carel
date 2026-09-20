import {
  NextResponse,
} from "next/server";

import {
  CAREL_NETWORKS,
} from "@/lib/carel/networks";

import {
  discoverVesuBorrowMarkets,
  vesuFractionToBps,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/markets";

import {
  VESU_LEND_ASSETS,
  getVesuLendAsset,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/lending";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";


export async function GET(
  request: Request,
) {
  try {
    const url =
      new URL(
        request.url,
      );

    const network =
      CAREL_NETWORKS.mainnet;

    const assetId =
      url.searchParams.get(
        "assetId",
      ) ??
      network.assets.strk.id;

    const asset =
      getVesuLendAsset(
        assetId,
      );

    if (!asset) {
      return NextResponse.json(
        {
          error:
            "CAREL does not enable this Vesu Lend asset.",
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

    const counterparts =
      VESU_LEND_ASSETS.filter(
        (candidate) =>
          candidate.id !==
          asset.id,
      );

    const batches =
      await Promise.all(
        counterparts.map(
          async (
            counterpart,
          ) => {
            try {
              return await discoverVesuBorrowMarkets({
                provider:
                  network.provider,

                chainId:
                  network.chainId,

                collateralAsset:
                  asset,

                debtAsset:
                  counterpart,
              });
            } catch {
              return [];
            }
          },
        ),
      );

    /*
     * One pool can expose several valid counterpart pairs.
     * For lending CAREL needs only one verified pair context
     * for each pool, so deduplicate by pool.
     */
    const seen =
      new Set<string>();

    const markets =
      batches
        .flat()
        .filter(
          (item) => {
            if (
              seen.has(
                item.pool.id,
              )
            ) {
              return false;
            }

            seen.add(
              item.pool.id,
            );

            return true;
          },
        )
        .map(
          (item) => ({
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

            asset: {
              id:
                item.market
                  .collateralAsset.id,

              symbol:
                item.market
                  .collateralAsset
                  .symbol,

              decimals:
                item.market
                  .collateralAsset
                  .decimals,
            },

            counterpart: {
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

            market: {
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

              observedAt:
                item.risk
                  .observedAt,
            },
          }),
        );

    return NextResponse.json(
      {
        network:
          network.label,

        asset: {
          id:
            asset.id,

          symbol:
            asset.symbol,

          decimals:
            asset.decimals,
        },

        markets,
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
            : "Could not load Vesu lending markets.",
      },
      {
        status: 502,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }
}
