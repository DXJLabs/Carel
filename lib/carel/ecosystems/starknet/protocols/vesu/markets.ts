import type {
  RpcProvider,
} from "starknet";

import type {
  AssetRef,
} from "@/lib/carel/core/assets";

import {
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  normalizeStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";

import {
  requireVesuAssetAddress,
  type VesuBorrowMarket,
} from "./borrow";

import {
  VESU_V2_MAINNET_POOLS,
  type VesuPoolRef,
} from "./pools";

const SCALE =
  1_000_000_000_000_000_000n;

const UINT128_SHIFT =
  128n;

export type VesuAssetConfigSnapshot =
  Readonly<{
    totalCollateralShares: bigint;
    totalNominalDebt: bigint;
    reserve: bigint;
    maxUtilization: bigint;
    floor: bigint;
    scale: bigint;
    isLegacy: boolean;
    lastUpdated: bigint;
    lastRateAccumulator: bigint;
    lastFullUtilizationRate: bigint;
    feeRate: bigint;
    feeShares: bigint;
  }>;

export type VesuPairConfigSnapshot =
  Readonly<{
    maxLtv: bigint;
    liquidationFactor: bigint;
    debtCap: bigint;
  }>;

export type VesuPriceSnapshot =
  Readonly<{
    value: bigint;
    valid: boolean;
  }>;

export type VesuBorrowRiskSnapshot =
  Readonly<{
    pool: VesuPoolRef;
    market: VesuBorrowMarket;

    paused: boolean;

    collateralConfig:
      VesuAssetConfigSnapshot;

    debtConfig:
      VesuAssetConfigSnapshot;

    pairConfig:
      VesuPairConfigSnapshot;

    collateralPrice:
      VesuPriceSnapshot;

    debtPrice:
      VesuPriceSnapshot;

    pairNominalDebt: bigint;
    pairDebt: bigint;

    totalDebt: bigint;
    reserve: bigint;

    utilization: bigint;
    maxUtilization: bigint;

    observedAt: number;
  }>;

export type VesuBorrowEvaluation =
  Readonly<{
    eligible: boolean;

    collateralAmount: bigint;
    borrowAmount: bigint;

    collateralValue: bigint;
    debtValue: bigint;

    requestedLtv: bigint;
    maxLtv: bigint;
    ltvHeadroom: bigint;

    projectedPairDebt: bigint;
    debtCap: bigint;

    availableLiquidity: bigint;

    projectedUtilization: bigint;
    maxUtilization: bigint;

    blockers:
      readonly string[];
  }>;

export type DiscoveredVesuBorrowMarket =
  Readonly<{
    pool: VesuPoolRef;
    market: VesuBorrowMarket;
    risk: VesuBorrowRiskSnapshot;
  }>;

/**
 * Converts Starknet uint256 low/high words into one bigint.
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
      "Vesu returned truncated uint256 data.",
    );
  }

  const low =
    BigInt(
      values[offset],
    );

  const high =
    BigInt(
      values[offset + 1],
    );

  return (
    low +
    (
      high <<
      UINT128_SHIFT
    )
  );
}

/**
 * Reads one felt-like scalar from a Starknet call result.
 */
function readScalar(
  values: readonly string[],
  offset: number,
): bigint {
  if (
    offset < 0 ||
    offset >= values.length
  ) {
    throw new Error(
      "Vesu returned truncated scalar data.",
    );
  }

  return BigInt(
    values[offset],
  );
}

/**
 * Parses Vesu V2 AssetConfig using the canonical Cairo field order.
 */
export function parseVesuAssetConfig(
  values: readonly string[],
): VesuAssetConfigSnapshot {
  if (values.length < 22) {
    throw new Error(
      "Vesu returned an invalid AssetConfig.",
    );
  }

  return {
    totalCollateralShares:
      readUint256(
        values,
        0,
      ),

    totalNominalDebt:
      readUint256(
        values,
        2,
      ),

    reserve:
      readUint256(
        values,
        4,
      ),

    maxUtilization:
      readUint256(
        values,
        6,
      ),

    floor:
      readUint256(
        values,
        8,
      ),

    scale:
      readUint256(
        values,
        10,
      ),

    isLegacy:
      readScalar(
        values,
        12,
      ) !== 0n,

    lastUpdated:
      readScalar(
        values,
        13,
      ),

    lastRateAccumulator:
      readUint256(
        values,
        14,
      ),

    lastFullUtilizationRate:
      readUint256(
        values,
        16,
      ),

    feeRate:
      readUint256(
        values,
        18,
      ),

    feeShares:
      readUint256(
        values,
        20,
      ),
  };
}

/**
 * Parses pair-level collateralization and debt-cap parameters.
 */
export function parseVesuPairConfig(
  values: readonly string[],
): VesuPairConfigSnapshot {
  if (values.length < 3) {
    throw new Error(
      "Vesu returned an invalid PairConfig.",
    );
  }

  return {
    maxLtv:
      readScalar(
        values,
        0,
      ),

    liquidationFactor:
      readScalar(
        values,
        1,
      ),

    debtCap:
      readScalar(
        values,
        2,
      ),
  };
}

/**
 * Parses Vesu's oracle AssetPrice { value: u256, is_valid: bool }.
 */
export function parseVesuPrice(
  values: readonly string[],
): VesuPriceSnapshot {
  if (values.length < 3) {
    throw new Error(
      "Vesu returned an invalid oracle price.",
    );
  }

  return {
    value:
      readUint256(
        values,
        0,
      ),

    valid:
      readScalar(
        values,
        2,
      ) !== 0n,
  };
}

/**
 * Computes actual debt from nominal debt using Vesu's current
 * rate accumulator and asset scale.
 */
export function calculateVesuDebt(
  nominalDebt: bigint,
  rateAccumulator: bigint,
  assetScale: bigint,
): bigint {
  if (
    nominalDebt <= 0n ||
    rateAccumulator <= 0n
  ) {
    return 0n;
  }

  if (assetScale <= 0n) {
    throw new Error(
      "Invalid Vesu asset scale.",
    );
  }

  return (
    nominalDebt *
    rateAccumulator *
    assetScale
  ) /
    (
      SCALE *
      SCALE
    );
}

/**
 * Calculates Vesu utilization as debt / (reserve + debt).
 */
export function calculateVesuUtilization(
  reserve: bigint,
  debt: bigint,
): bigint {
  const total =
    reserve +
    debt;

  if (total <= 0n) {
    return 0n;
  }

  return (
    debt *
    SCALE
  ) /
    total;
}

/**
 * Executes a read-only Pool call and normalizes its result.
 */
async function readPool(
  provider: RpcProvider,
  poolAddress: string,
  entrypoint: string,
  calldata:
    readonly string[] = [],
): Promise<string[]> {
  const result =
    await provider.callContract({
      contractAddress:
        normalizeStarknetAddress(
          poolAddress,
        ),
      entrypoint,
      calldata: [...calldata],
    });

  if (!Array.isArray(result)) {
    throw new Error(
      `Vesu ${entrypoint} returned an invalid result.`,
    );
  }

  return result;
}

/**
 * Verifies one Vesu pool against CAREL's registered collateral/debt assets
 * and returns the live risk state required before Borrow execution.
 */
export async function readVesuBorrowRisk({
  provider,
  pool,
  chainId,
  collateralAsset,
  debtAsset,
}: {
  provider: RpcProvider;
  pool: VesuPoolRef;
  chainId: string;
  collateralAsset: AssetRef;
  debtAsset: AssetRef;
}): Promise<VesuBorrowRiskSnapshot> {
  const market:
    VesuBorrowMarket = {
      id:
        `vesu:${pool.id}:${collateralAsset.symbol}:${debtAsset.symbol}`,
      chainId,
      poolAddress:
        pool.address,
      collateralAsset,
      debtAsset,
    };

  const collateralToken =
    requireVesuAssetAddress(
      collateralAsset,
    );

  const debtToken =
    requireVesuAssetAddress(
      debtAsset,
    );

  const [
    pausedRaw,
    collateralConfigRaw,
    debtConfigRaw,
    pairConfigRaw,
    collateralPriceRaw,
    debtPriceRaw,
    pairRaw,
  ] =
    await Promise.all([
      readPool(
        provider,
        pool.address,
        "is_paused",
      ),

      readPool(
        provider,
        pool.address,
        "asset_config",
        [collateralToken],
      ),

      readPool(
        provider,
        pool.address,
        "asset_config",
        [debtToken],
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

      readPool(
        provider,
        pool.address,
        "price",
        [collateralToken],
      ),

      readPool(
        provider,
        pool.address,
        "price",
        [debtToken],
      ),

      readPool(
        provider,
        pool.address,
        "pairs",
        [
          collateralToken,
          debtToken,
        ],
      ),
    ]);

  const paused =
    readScalar(
      pausedRaw,
      0,
    ) !== 0n;

  if (paused) {
    throw new Error(
      `${pool.name} is paused.`,
    );
  }

  const collateralConfig =
    parseVesuAssetConfig(
      collateralConfigRaw,
    );

  const debtConfig =
    parseVesuAssetConfig(
      debtConfigRaw,
    );

  const expectedCollateralScale =
    10n **
    BigInt(
      collateralAsset.decimals,
    );

  const expectedDebtScale =
    10n **
    BigInt(
      debtAsset.decimals,
    );

  if (
    collateralConfig.scale !==
      expectedCollateralScale ||
    debtConfig.scale !==
      expectedDebtScale
  ) {
    throw new Error(
      `${pool.name} token precision does not match CAREL's asset registry.`,
    );
  }

  const pairConfig =
    parseVesuPairConfig(
      pairConfigRaw,
    );

  if (
    pairConfig.maxLtv <= 0n ||
    pairConfig.debtCap <= 0n
  ) {
    throw new Error(
      `${pool.name} does not expose an active ${collateralAsset.symbol} → ${debtAsset.symbol} borrow pair.`,
    );
  }

  const collateralPrice =
    parseVesuPrice(
      collateralPriceRaw,
    );

  const debtPrice =
    parseVesuPrice(
      debtPriceRaw,
    );

  if (
    !collateralPrice.valid ||
    !debtPrice.valid ||
    collateralPrice.value <= 0n ||
    debtPrice.value <= 0n
  ) {
    throw new Error(
      `${pool.name} has an invalid Vesu oracle price.`,
    );
  }

  if (pairRaw.length < 4) {
    throw new Error(
      `${pool.name} returned invalid pair balances.`,
    );
  }

  const pairNominalDebt =
    readUint256(
      pairRaw,
      2,
    );

  const pairDebt =
    calculateVesuDebt(
      pairNominalDebt,
      debtConfig
        .lastRateAccumulator,
      debtConfig.scale,
    );

  const totalDebt =
    calculateVesuDebt(
      debtConfig
        .totalNominalDebt,
      debtConfig
        .lastRateAccumulator,
      debtConfig.scale,
    );

  const utilization =
    calculateVesuUtilization(
      debtConfig.reserve,
      totalDebt,
    );

  return {
    pool,
    market,
    paused,

    collateralConfig,
    debtConfig,
    pairConfig,

    collateralPrice,
    debtPrice,

    pairNominalDebt,
    pairDebt,

    totalDebt,
    reserve:
      debtConfig.reserve,

    utilization,
    maxUtilization:
      debtConfig.maxUtilization,

    observedAt:
      Date.now(),
  };
}

/**
 * Evaluates one requested Borrow against the live Vesu risk snapshot.
 *
 * This is a deterministic protocol-safety check, not a recommendation.
 * The user still chooses the amount and accepts the resulting risk.
 */
export function evaluateVesuBorrow({
  risk,
  collateralAmount,
  borrowAmount,
}: {
  risk: VesuBorrowRiskSnapshot;
  collateralAmount: string;
  borrowAmount: string;
}): VesuBorrowEvaluation {
  const collateral =
    parseUnits(
      collateralAmount,
      risk.market
        .collateralAsset
        .decimals,
    );

  const debt =
    parseUnits(
      borrowAmount,
      risk.market
        .debtAsset
        .decimals,
    );

  if (
    collateral <= 0n ||
    debt <= 0n
  ) {
    throw new Error(
      "Borrow amounts must be greater than zero.",
    );
  }

  const collateralValue =
    (
      collateral *
      risk.collateralPrice.value
    ) /
      risk.collateralConfig.scale;

  const debtValue =
    (
      debt *
      risk.debtPrice.value
    ) /
      risk.debtConfig.scale;

  if (collateralValue <= 0n) {
    throw new Error(
      "Collateral value is zero.",
    );
  }

  const requestedLtv =
    (
      debtValue *
      SCALE
    ) /
      collateralValue;

  const projectedPairDebt =
    risk.pairDebt +
    debt;

  const projectedTotalDebt =
    risk.totalDebt +
    debt;

  const totalAssets =
    risk.reserve +
    risk.totalDebt;

  const projectedUtilization =
    totalAssets > 0n
      ? (
          projectedTotalDebt *
          SCALE
        ) /
          totalAssets
      : SCALE;

  const blockers:
    string[] = [];

  if (
    requestedLtv >=
    risk.pairConfig.maxLtv
  ) {
    blockers.push(
      "Requested LTV reaches or exceeds the pool maximum.",
    );
  }

  if (
    debt >
    risk.reserve
  ) {
    blockers.push(
      "Requested debt exceeds currently available pool liquidity.",
    );
  }

  if (
    projectedPairDebt >
    risk.pairConfig.debtCap
  ) {
    blockers.push(
      "Requested debt would exceed the pair debt cap.",
    );
  }

  if (
    projectedUtilization >
    risk.maxUtilization
  ) {
    blockers.push(
      "Requested debt would exceed the asset maximum utilization.",
    );
  }

  return {
    eligible:
      blockers.length === 0,

    collateralAmount:
      collateral,

    borrowAmount:
      debt,

    collateralValue,
    debtValue,

    requestedLtv,
    maxLtv:
      risk.pairConfig.maxLtv,

    ltvHeadroom:
      risk.pairConfig.maxLtv >
        requestedLtv
        ? risk.pairConfig.maxLtv -
          requestedLtv
        : 0n,

    projectedPairDebt,
    debtCap:
      risk.pairConfig.debtCap,

    availableLiquidity:
      risk.reserve,

    projectedUtilization,
    maxUtilization:
      risk.maxUtilization,

    blockers,
  };
}

/**
 * Probes CAREL's official Vesu pool allowlist and returns only pools that
 * currently expose the requested registered borrow pair on-chain.
 */
export async function discoverVesuBorrowMarkets({
  provider,
  chainId,
  collateralAsset,
  debtAsset,
}: {
  provider: RpcProvider;
  chainId: string;
  collateralAsset: AssetRef;
  debtAsset: AssetRef;
}): Promise<
  DiscoveredVesuBorrowMarket[]
> {
  const results =
    await Promise.allSettled(
      VESU_V2_MAINNET_POOLS.map(
        async (pool) => {
          const risk =
            await readVesuBorrowRisk({
              provider,
              pool,
              chainId,
              collateralAsset,
              debtAsset,
            });

          return {
            pool,
            market:
              risk.market,
            risk,
          };
        },
      ),
    );

  return results.flatMap(
    (result) =>
      result.status ===
      "fulfilled"
        ? [result.value]
        : [],
  );
}

/**
 * Converts Vesu's 1e18 fixed-point fraction to basis points for UI display.
 */
export function vesuFractionToBps(
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
