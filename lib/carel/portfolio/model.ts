import type {
  AssetRef,
} from "@/lib/carel/core/assets";

import {
  findAssetBalance,
  type AssetBalance,
} from "@/lib/carel/core/balances";

import {
  formatUnits,
} from "@/lib/carel/core/amounts";

export type PortfolioHolding =
  Readonly<{
    asset: AssetRef;
    publicAmount: bigint | null;
    privateAmount: bigint | null;
    observedAmount: bigint | null;
    publicKnown: boolean;
    privateKnown: boolean;
  }>;

export type PortfolioPositionKind =
  | "staking"
  | "liquid-staking"
  | "borrow"
  | "lending"
  | "liquidity";

export type PortfolioVisibility =
  | "public"
  | "private"
  | "mixed";

export type PortfolioBorrowMetrics =
  Readonly<{
    poolId:
      string;

    poolName:
      string;

    poolAddress:
      string;

    collateralAsset:
      AssetRef;

    collateralAmount:
      bigint;

    currentLtvBps:
      number;

    maxLtvBps:
      number;

    collateralized:
      boolean;
  }>;

export type PortfolioLendingMetrics =
  Readonly<{
    poolId:
      string;

    poolName:
      string;

    poolAddress:
      string;

    underlyingAsset:
      AssetRef;

    vTokenAddress:
      string;

    shares:
      bigint;

    maxRedeemShares:
      bigint;
  }>;


export type PortfolioPosition =
  Readonly<{
    id: string;
    protocol: string;
    kind: PortfolioPositionKind;
    asset: AssetRef;
    amount: bigint;
    visibility: PortfolioVisibility;
    label: string;
    detail: string;
    borrow?:
      PortfolioBorrowMetrics;

    lending?:
      PortfolioLendingMetrics;
  }>;

/**
 * Builds portfolio holdings from registered assets and generic balance rows.
 * Private values are included only after the user explicitly reveals them.
 */
export function buildPortfolioHoldings(
  assets: readonly AssetRef[],
  balances: readonly AssetBalance[],
  privateRevealed: boolean,
): PortfolioHolding[] {
  return assets.map(
    (asset) => {
      const publicBalance =
        findAssetBalance(
          balances,
          asset.id,
          "public",
        );

      const privateBalance =
        privateRevealed
          ? findAssetBalance(
              balances,
              asset.id,
              "private",
            )
          : null;

      const publicKnown =
        publicBalance?.amount !==
          null &&
        publicBalance?.amount !==
          undefined;

      const privateKnown =
        privateRevealed &&
        privateBalance?.amount !==
          null &&
        privateBalance?.amount !==
          undefined;

      const publicAmount =
        publicKnown
          ? publicBalance!.amount
          : null;

      const privateAmount =
        privateKnown
          ? privateBalance!.amount
          : null;

      const observedAmount =
        publicKnown ||
        privateKnown
          ? (
              publicAmount ??
              0n
            ) +
            (
              privateAmount ??
              0n
            )
          : null;

      return {
        asset,
        publicAmount,
        privateAmount,
        observedAmount,
        publicKnown,
        privateKnown,
      };
    },
  );
}

/**
 * Finds one asset holding without exposing balance storage details
 * to UI components.
 */
export function findPortfolioHolding(
  holdings: readonly PortfolioHolding[],
  assetId: string,
): PortfolioHolding | null {
  return (
    holdings.find(
      (holding) =>
        holding.asset.id ===
        assetId,
    ) ?? null
  );
}

/**
 * Formats an asset amount using its registered decimals.
 * Portfolio UI must never assume every asset has 18 decimals.
 */
export function formatPortfolioAmount(
  value: bigint | null,
  asset: AssetRef,
  hidden = false,
  maxDecimals = 6,
): string {
  if (hidden) {
    return "••••••";
  }

  if (value === null) {
    return "—";
  }

  return formatUnits(
    value,
    asset.decimals,
    Math.min(
      asset.decimals,
      maxDecimals,
    ),
  );
}

/**
 * Describes which balance layers contributed to the currently observed
 * holding without implying unrevealed private funds are zero.
 */
export function portfolioHoldingDetail(
  holding: PortfolioHolding,
  privateRevealed: boolean,
): string {
  if (
    holding.publicKnown &&
    holding.privateKnown
  ) {
    return "Public + revealed private balance";
  }

  if (holding.privateKnown) {
    return "Revealed private balance";
  }

  if (holding.publicKnown) {
    return privateRevealed
      ? "Public balance"
      : "Public balance · private not revealed";
  }

  return "Balance not loaded";
}
