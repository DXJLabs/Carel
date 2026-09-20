import type {
  RpcProvider,
} from "starknet";

import type {
  AssetRef,
} from "@/lib/carel/core/assets";

import {
  normalizeStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";

import {
  requireVesuAssetAddress,
  toUint256Calldata,
} from "./borrow";

import {
  VESU_LEND_ASSETS,
} from "./lending";

import {
  VESU_MAINNET_POOL_FACTORY,
} from "./private-lending";

import {
  VESU_V2_MAINNET_POOLS,
  type VesuPoolRef,
} from "./pools";


export type VesuLendingPositionSnapshot =
  Readonly<{
    pool: VesuPoolRef;

    asset: AssetRef;

    vTokenAddress:
      string;

    shares:
      bigint;

    assets:
      bigint;

    maxRedeemShares:
      bigint;

    observedAt:
      number;
  }>;


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


/**
 * Resolves one vToken directly from Vesu PoolFactory.
 *
 * A zero address means the selected pool does not expose
 * a vault for this CAREL asset.
 */
export async function resolveVesuLendingVToken({
  provider,
  pool,
  asset,
}: {
  provider: RpcProvider;
  pool: VesuPoolRef;
  asset: AssetRef;
}): Promise<string | null> {
  const assetAddress =
    requireVesuAssetAddress(
      asset,
    );

  const result =
    await provider.callContract({
      contractAddress:
        VESU_MAINNET_POOL_FACTORY,

      entrypoint:
        "v_token_for_asset",

      calldata: [
        pool.address,
        assetAddress,
      ],
    });

  if (!result[0]) {
    return null;
  }

  const vToken =
    normalizeStarknetAddress(
      result[0],
    );

  return BigInt(vToken) > 0n
    ? vToken
    : null;
}


/**
 * Reads one public ERC-4626 Vesu lending position.
 *
 * Position ownership is represented by the wallet's vToken shares,
 * not by a CAREL-maintained local position record.
 */
export async function readVesuLendingPosition({
  provider,
  pool,
  owner,
  asset,
}: {
  provider: RpcProvider;
  pool: VesuPoolRef;
  owner: string;
  asset: AssetRef;
}): Promise<
  VesuLendingPositionSnapshot | null
> {
  const account =
    normalizeStarknetAddress(
      owner,
    );

  const assetAddress =
    requireVesuAssetAddress(
      asset,
    );

  const vTokenAddress =
    await resolveVesuLendingVToken({
      provider,
      pool,
      asset,
    });

  if (!vTokenAddress) {
    return null;
  }

  /*
   * Never trust PoolFactory lookup alone.
   * Independently verify both vault bindings.
   */
  const [
    underlyingRaw,
    poolRaw,
    balanceRaw,
  ] =
    await Promise.all([
      provider.callContract({
        contractAddress:
          vTokenAddress,

        entrypoint:
          "asset",

        calldata: [],
      }),

      provider.callContract({
        contractAddress:
          vTokenAddress,

        entrypoint:
          "pool_contract",

        calldata: [],
      }),

      provider.callContract({
        contractAddress:
          vTokenAddress,

        entrypoint:
          "balance_of",

        calldata: [
          account,
        ],
      }),
    ]);

  if (
    !underlyingRaw[0] ||
    BigInt(
      normalizeStarknetAddress(
        underlyingRaw[0],
      ),
    ) !==
      BigInt(
        assetAddress,
      )
  ) {
    throw new Error(
      `${pool.name} vToken underlying does not match ${asset.symbol}.`,
    );
  }

  if (
    !poolRaw[0] ||
    BigInt(
      normalizeStarknetAddress(
        poolRaw[0],
      ),
    ) !==
      BigInt(
        pool.address,
      )
  ) {
    throw new Error(
      `${pool.name} vToken reports another Vesu pool.`,
    );
  }

  const shares =
    readUint256(
      balanceRaw,
      "vToken balance",
    );

  if (
    shares <= 0n
  ) {
    return null;
  }

  const shareWords =
    toUint256Calldata(
      shares,
    );

  const [
    assetsRaw,
    maxRedeemRaw,
  ] =
    await Promise.all([
      provider.callContract({
        contractAddress:
          vTokenAddress,

        entrypoint:
          "convert_to_assets",

        calldata: [
          ...shareWords,
        ],
      }),

      provider.callContract({
        contractAddress:
          vTokenAddress,

        entrypoint:
          "max_redeem",

        calldata: [
          account,
        ],
      }),
    ]);

  const assets =
    readUint256(
      assetsRaw,
      "convert_to_assets",
    );

  const maxRedeemShares =
    readUint256(
      maxRedeemRaw,
      "max_redeem",
    );

  return {
    pool,
    asset,
    vTokenAddress,
    shares,
    assets,
    maxRedeemShares,
    observedAt:
      Date.now(),
  };
}


/**
 * Discovers public Vesu lending positions only from CAREL's
 * reviewed pools and lending asset registry.
 *
 * Unsupported pool/asset combinations are ignored.
 */
export async function discoverVesuLendingPositions({
  provider,
  owner,
}: {
  provider: RpcProvider;
  owner: string;
}): Promise<
  VesuLendingPositionSnapshot[]
> {
  const probes =
    VESU_V2_MAINNET_POOLS.flatMap(
      (pool) =>
        VESU_LEND_ASSETS.map(
          (asset) => ({
            pool,
            asset,
          }),
        ),
    );

  const results =
    await Promise.allSettled(
      probes.map(
        ({
          pool,
          asset,
        }) =>
          readVesuLendingPosition({
            provider,
            pool,
            owner,
            asset,
          }),
      ),
    );

  return results.flatMap(
    (result) =>
      result.status ===
        "fulfilled" &&
      result.value
        ? [result.value]
        : [],
  );
}
