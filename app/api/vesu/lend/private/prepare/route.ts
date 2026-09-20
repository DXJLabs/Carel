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
  requireVesuAssetAddress,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/borrow";

import {
  readVesuBorrowRisk,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/markets";

import {
  getVesuPool,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/pools";

import {
  createVesuLendIntent,
  getVesuLendPair,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/lending";

import {
  configuredVesuLendingAnonymizer,
  VESU_LENDING_ANONYMIZER_CLASS_HASH,
  VESU_MAINNET_POOL_FACTORY,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/private-lending";


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
      "Invalid Shield Lend amount.",
    );
  }

  return value;
}


export async function POST(
  request: Request,
) {
  try {
    const anonymizer =
      configuredVesuLendingAnonymizer();

    if (!anonymizer) {
      return NextResponse.json(
        {
          code:
            "VESU_ANONYMIZER_NOT_CONFIGURED",

          error:
            "Shield Lend is wired but CAREL has not pinned a verified Vesu Lending Anonymizer address for Mainnet yet.",
        },
        {
          status: 503,

          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    const raw: unknown =
      await request.json();

    if (
      !raw ||
      typeof raw !==
        "object" ||
      Array.isArray(raw)
    ) {
      throw new Error(
        "Invalid Shield Lend request.",
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

    const pool =
      getVesuPool(
        body.poolId,
      );

    if (!pool) {
      throw new Error(
        "That Vesu pool is not enabled in CAREL.",
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
        "CAREL does not enable this Shield Lend pair.",
      );
    }

    const network =
      CAREL_NETWORKS.mainnet;

    /*
     * The configured address is not trusted by itself.
     * Its live SN_MAIN class must match CAREL's admitted anonymizer class.
     */
    const anonymizerClassHash =
      await network.provider
        .getClassHashAt(
          anonymizer,
        );

    if (
      BigInt(
        anonymizerClassHash,
      ) !==
      BigInt(
        VESU_LENDING_ANONYMIZER_CLASS_HASH,
      )
    ) {
      throw new Error(
        "Configured Vesu Lending Anonymizer failed CAREL class-hash verification.",
      );
    }

    /*
     * Recheck exact Vesu market before resolving its vault.
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

    const assetAddress =
      requireVesuAssetAddress(
        pair.asset,
      );

    /*
     * Do not maintain a hand-written vToken list.
     * Resolve the vault from the Vesu PoolFactory.
     */
    const resolved =
      await network.provider
        .callContract({
          contractAddress:
            VESU_MAINNET_POOL_FACTORY,

          entrypoint:
            "v_token_for_asset",

          calldata: [
            pool.address,
            assetAddress,
          ],
        });

    if (
      !resolved[0]
    ) {
      throw new Error(
        "Vesu did not return a vToken for this pool and asset.",
      );
    }

    const vTokenAddress =
      normalizeStarknetAddress(
        resolved[0],
      );

    if (
      BigInt(
        vTokenAddress,
      ) === 0n
    ) {
      throw new Error(
        "This Vesu pool does not expose a vToken for the selected asset.",
      );
    }

    /*
     * Independently ask the vault which underlying asset it represents.
     */
    const underlying =
      await network.provider
        .callContract({
          contractAddress:
            vTokenAddress,

          entrypoint:
            "asset",

          calldata: [],
        });

    if (
      !underlying[0] ||
      BigInt(
        normalizeStarknetAddress(
          underlying[0],
        ),
      ) !==
        BigInt(
          assetAddress,
        )
    ) {
      throw new Error(
        "Resolved Vesu vToken does not match the reviewed underlying asset.",
      );
    }

    const preparedAt =
      Date.now();

    return NextResponse.json(
      {
        provider:
          "Vesu",

        privacy:
          "shield",

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
            pair.asset.id,

          assetAddress,

          assetSymbol:
            pair.asset.symbol,

          amount:
            intent.amount
              .toString(),

          vTokenAddress,

          anonymizerAddress:
            anonymizer,

          preparedAt,

          expiresAt:
            preparedAt +
            PREPARED_WINDOW_MS,
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
            : "Could not prepare Shield Lend.",
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
