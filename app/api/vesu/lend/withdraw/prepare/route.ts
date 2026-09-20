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
  toUint256Calldata,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/borrow";

import {
  getVesuLendAsset,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/lending";

import {
  readVesuLendingPosition,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/lending-positions";

import {
  buildVesuLendWithdrawCalls,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/lending-withdraw";

import {
  getVesuPool,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/pools";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const PREPARED_WINDOW_MS =
  45_000;


function sharesValue(
  value: unknown,
): bigint {
  if (
    typeof value !==
      "string" ||
    value.length > 80 ||
    !/^[1-9]\d*$/.test(
      value,
    )
  ) {
    throw new Error(
      "Invalid Vesu Withdraw share amount.",
    );
  }

  const shares =
    BigInt(
      value,
    );

  if (
    shares <= 0n
  ) {
    throw new Error(
      "Vesu Withdraw shares must be greater than zero.",
    );
  }

  return shares;
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
        "Invalid Vesu Withdraw request.",
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
        "Choose a Vesu lending position first.",
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
        "string"
    ) {
      throw new Error(
        "Vesu Withdraw asset is missing.",
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

    const asset =
      getVesuLendAsset(
        body.assetId,
      );

    if (!asset) {
      throw new Error(
        "CAREL does not enable this Vesu lending asset.",
      );
    }

    const owner =
      normalizeStarknetAddress(
        body.owner,
      );

    const shares =
      sharesValue(
        body.shares,
      );

    const network =
      CAREL_NETWORKS.mainnet;

    /*
     * Reconstruct the position directly from current Vesu state.
     * Client-side Portfolio data is never trusted for execution.
     */
    const position =
      await readVesuLendingPosition({
        provider:
          network.provider,

        pool,

        owner,

        asset,
      });

    if (!position) {
      throw new Error(
        "No public Vesu lending position exists for this pool and asset.",
      );
    }

    if (
      shares >
      position.shares
    ) {
      throw new Error(
        "Requested Vesu Withdraw exceeds the current vToken balance.",
      );
    }

    if (
      shares >
      position.maxRedeemShares
    ) {
      throw new Error(
        "Requested Vesu Withdraw exceeds the vault's current redeemable liquidity.",
      );
    }

    const shareWords =
      toUint256Calldata(
        shares,
      );

    /*
     * preview_redeem reports the current amount of underlying
     * that these exact shares should return.
     */
    const previewRaw =
      await network.provider
        .callContract({
          contractAddress:
            position.vTokenAddress,

          entrypoint:
            "preview_redeem",

          calldata: [
            ...shareWords,
          ],
        });

    const assets =
      readUint256(
        previewRaw,
        "preview_redeem",
      );

    if (
      assets <= 0n
    ) {
      throw new Error(
        "Vesu returned zero underlying for this redemption.",
      );
    }

    const calls =
      buildVesuLendWithdrawCalls({
        owner,

        vTokenAddress:
          position.vTokenAddress,

        shares,
      });

    const preparedAt =
      Date.now();

    return NextResponse.json(
      {
        provider:
          "Vesu",

        action:
          "withdraw-lend",

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
            asset.id,

          symbol:
            asset.symbol,

          decimals:
            asset.decimals,
        },

        evaluation: {
          shares:
            shares.toString(),

          assets:
            assets.toString(),

          currentShares:
            position.shares
              .toString(),

          maxRedeemShares:
            position.maxRedeemShares
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

          assetId:
            asset.id,

          vTokenAddress:
            position.vTokenAddress,

          shares:
            shares.toString(),

          assets:
            assets.toString(),

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
            : "Could not prepare Vesu Lend withdrawal.",
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
