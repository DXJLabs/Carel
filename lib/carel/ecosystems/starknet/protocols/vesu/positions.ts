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
} from "./borrow";

import {
  VESU_V2_MAINNET_POOLS,
  type VesuPoolRef,
} from "./pools";

const SCALE =
  1_000_000_000_000_000_000n;

const UINT128_SHIFT =
  128n;

export type VesuBorrowPositionSnapshot =
  Readonly<{
    pool: VesuPoolRef;

    collateralAsset:
      AssetRef;

    debtAsset:
      AssetRef;

    collateralShares:
      bigint;

    nominalDebt:
      bigint;

    collateralAmount:
      bigint;

    debtAmount:
      bigint;

    collateralValue:
      bigint;

    debtValue:
      bigint;

    currentLtv:
      bigint;

    maxLtv:
      bigint;

    collateralized:
      boolean;

    observedAt:
      number;
  }>;

/**
 * Reads a Starknet uint256 from two consecutive result words.
 */
function readUint256(
  values: readonly string[],
  offset: number,
): bigint {
  if (
    offset < 0 ||
    offset + 1 >=
      values.length
  ) {
    throw new Error(
      "Vesu returned truncated uint256 position data.",
    );
  }

  return (
    BigInt(
      values[offset],
    ) +
    (
      BigInt(
        values[
          offset + 1
        ],
      ) <<
      UINT128_SHIFT
    )
  );
}

/**
 * Executes one read-only Vesu pool call.
 */
async function readPool(
  provider: RpcProvider,
  poolAddress: string,
  entrypoint: string,
  calldata:
    readonly string[],
): Promise<string[]> {
  const result =
    await provider.callContract({
      contractAddress:
        normalizeStarknetAddress(
          poolAddress,
        ),

      entrypoint,

      calldata:
        [...calldata],
    });

  if (!Array.isArray(result)) {
    throw new Error(
      `Vesu ${entrypoint} returned invalid data.`,
    );
  }

  return result;
}

/**
 * Loads one account's Vesu Borrow position from an approved pool.
 *
 * position() returns:
 * - Position.collateral_shares
 * - Position.nominal_debt
 * - collateral asset amount
 * - debt asset amount
 */
export async function readVesuBorrowPosition({
  provider,
  pool,
  owner,
  collateralAsset,
  debtAsset,
}: {
  provider: RpcProvider;
  pool: VesuPoolRef;
  owner: string;
  collateralAsset: AssetRef;
  debtAsset: AssetRef;
}): Promise<
  VesuBorrowPositionSnapshot | null
> {
  const collateralToken =
    requireVesuAssetAddress(
      collateralAsset,
    );

  const debtToken =
    requireVesuAssetAddress(
      debtAsset,
    );

  const account =
    normalizeStarknetAddress(
      owner,
    );

  const calldata = [
    collateralToken,
    debtToken,
    account,
  ];

  const positionRaw =
    await readPool(
      provider,
      pool.address,
      "position",
      calldata,
    );

  if (
    positionRaw.length < 8
  ) {
    throw new Error(
      `${pool.name} returned malformed Borrow position data.`,
    );
  }

  const collateralShares =
    readUint256(
      positionRaw,
      0,
    );

  const nominalDebt =
    readUint256(
      positionRaw,
      2,
    );

  const collateralAmount =
    readUint256(
      positionRaw,
      4,
    );

  const debtAmount =
    readUint256(
      positionRaw,
      6,
    );

  if (
    collateralAmount <= 0n &&
    debtAmount <= 0n
  ) {
    return null;
  }

  const [
    collateralizationRaw,
    pairConfigRaw,
  ] =
    await Promise.all([
      readPool(
        provider,
        pool.address,
        "check_collateralization",
        calldata,
      ),

      readPool(
        provider,
        pool.address,
        "pair_config",
        [
          collateralToken,
          debtToken,
        ],
      ),
    ]);

  if (
    collateralizationRaw.length <
      5 ||
    pairConfigRaw.length < 3
  ) {
    throw new Error(
      `${pool.name} returned malformed Borrow risk data.`,
    );
  }

  const collateralized =
    BigInt(
      collateralizationRaw[
        0
      ],
    ) !== 0n;

  const collateralValue =
    readUint256(
      collateralizationRaw,
      1,
    );

  const debtValue =
    readUint256(
      collateralizationRaw,
      3,
    );

  const currentLtv =
    collateralValue > 0n
      ? (
          debtValue *
          SCALE
        ) /
          collateralValue
      : debtValue > 0n
        ? SCALE
        : 0n;

  const maxLtv =
    BigInt(
      pairConfigRaw[0],
    );

  return {
    pool,

    collateralAsset,
    debtAsset,

    collateralShares,
    nominalDebt,

    collateralAmount,
    debtAmount,

    collateralValue,
    debtValue,

    currentLtv,
    maxLtv,

    collateralized,

    observedAt:
      Date.now(),
  };
}

/**
 * Probes CAREL's approved Vesu pool set and returns only actual positions.
 *
 * Unsupported asset pairs and pools with no account position are ignored.
 */
export async function discoverVesuBorrowPositions({
  provider,
  owner,
  collateralAsset,
  debtAsset,
}: {
  provider: RpcProvider;
  owner: string;
  collateralAsset: AssetRef;
  debtAsset: AssetRef;
}): Promise<
  VesuBorrowPositionSnapshot[]
> {
  const results =
    await Promise.allSettled(
      VESU_V2_MAINNET_POOLS.map(
        (pool) =>
          readVesuBorrowPosition({
            provider,
            pool,
            owner,
            collateralAsset,
            debtAsset,
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

/**
 * Converts Vesu's 1e18 fixed-point fraction into UI basis points.
 */
export function vesuPositionFractionToBps(
  value: bigint,
): number {
  return Number(
    (
      value *
      10_000n
    ) /
      SCALE,
  );
}
