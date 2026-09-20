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
  toUint256Calldata,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/borrow";

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

import {
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
      "Invalid Lend amount.",
    );
  }

  return value;
}


function readUint256(
  values: readonly string[],
  label: string,
): bigint {
  if (
    values.length < 2
  ) {
    throw new Error(
      `Vesu ${label} returned malformed uint256 data.`,
    );
  }

  return (
    BigInt(
      values[0],
    ) +
    (
      BigInt(
        values[1],
      ) << 128n
    )
  );
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

    const assetAddress =
      requireVesuAssetAddress(
        pair.asset,
      );

    /*
     * Resolve the canonical Vesu vault instead of maintaining
     * a hand-written vToken registry.
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

    if (!resolved[0]) {
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
        "Selected Vesu pool has no active vToken for this asset.",
      );
    }

    const amountWords =
      toUint256Calldata(
        intent.amount,
      );

    /*
     * Verify the vault against its own live state and make sure
     * this exact deposit amount is currently executable.
     */
    const [
      underlying,
      vaultPool,
      maxDepositRaw,
      previewRaw,
    ] =
      await Promise.all([
        network.provider
          .callContract({
            contractAddress:
              vTokenAddress,

            entrypoint:
              "asset",

            calldata: [],
          }),

        network.provider
          .callContract({
            contractAddress:
              vTokenAddress,

            entrypoint:
              "pool_contract",

            calldata: [],
          }),

        network.provider
          .callContract({
            contractAddress:
              vTokenAddress,

            entrypoint:
              "max_deposit",

            calldata: [
              owner,
            ],
          }),

        network.provider
          .callContract({
            contractAddress:
              vTokenAddress,

            entrypoint:
              "preview_deposit",

            calldata: [
              ...amountWords,
            ],
          }),
      ]);

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
        "Resolved Vesu vToken underlying does not match the reviewed asset.",
      );
    }

    if (
      !vaultPool[0] ||
      BigInt(
        normalizeStarknetAddress(
          vaultPool[0],
        ),
      ) !==
        BigInt(
          pool.address,
        )
    ) {
      throw new Error(
        "Resolved Vesu vToken belongs to another pool.",
      );
    }

    const maxDeposit =
      readUint256(
        maxDepositRaw,
        "max_deposit",
      );

    if (
      intent.amount >
      maxDeposit
    ) {
      throw new Error(
        "This Vesu vault cannot currently accept the requested deposit amount.",
      );
    }

    const previewShares =
      readUint256(
        previewRaw,
        "preview_deposit",
      );

    if (
      previewShares <= 0n
    ) {
      throw new Error(
        "Vesu returned zero shares for this deposit.",
      );
    }

    const calls =
      buildVesuLendCalls({
        market:
          risk.market,

        owner,

        intent,

        vTokenAddress,
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

          vTokenAddress,

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
