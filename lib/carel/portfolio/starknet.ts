import type {
  RpcProvider,
} from "starknet";

import type {
  AssetRef,
} from "@/lib/carel/core/assets";

import {
  findAssetBalance,
  type AssetBalance,
} from "@/lib/carel/core/balances";

import type {
  PortfolioPosition,
} from "./model";

import {
  loadStakingPool,
  loadStakingPosition,
} from "@/lib/carel/ecosystems/starknet/protocols/endur/staking";

import {
  discoverVesuBorrowPositions,
  vesuPositionFractionToBps,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/positions";

export type StarknetPortfolioPositions =
  Readonly<{
    positions: readonly PortfolioPosition[];
    warnings: readonly string[];
  }>;

/**
 * Loads Starknet protocol positions and converts them into the ecosystem-
 * independent PortfolioPosition model consumed by CAREL Portfolio.
 */
export async function loadStarknetPortfolioPositions({
  owner,
  provider,
  baseUrl,
  stakeAsset,
  borrowAsset,
  liquidStakingAsset,
  balances,
  privateRevealed,
}: {
  owner: string;
  provider: RpcProvider;
  baseUrl: string;
  stakeAsset: AssetRef;
  borrowAsset: AssetRef;
  liquidStakingAsset: AssetRef | null;
  balances: readonly AssetBalance[];
  privateRevealed: boolean;
}): Promise<StarknetPortfolioPositions> {
  const positions:
    PortfolioPosition[] = [];

  const warnings:
    string[] = [];

  try {
    const pool =
      await loadStakingPool(
        baseUrl,
        stakeAsset,
      );

    const position =
      await loadStakingPosition(
        baseUrl,
        pool,
        owner,
        stakeAsset,
      );

    if (
      position &&
      position.amount > 0n
    ) {
      positions.push({
        id:
          `starknet:avnu-staking:${pool.poolAddress}:${owner}`,
        protocol: "AVNU",
        kind: "staking",
        asset: stakeAsset,
        amount:
          position.amount,
        visibility:
          "public",
        label:
          `${stakeAsset.symbol} Staking`,
        detail:
          position.unpoolAmount >
          0n
            ? "Public staking · unstake pending"
            : "Public staking position",
      });
    }
  } catch (cause) {
    warnings.push(
      cause instanceof Error
        ? cause.message
        : "Could not load the public Starknet staking position.",
    );
  }

  if (
    liquidStakingAsset
  ) {
    const publicRow =
      findAssetBalance(
        balances,
        liquidStakingAsset.id,
        "public",
      );

    const privateRow =
      privateRevealed
        ? findAssetBalance(
            balances,
            liquidStakingAsset.id,
            "private",
          )
        : null;

    const publicAmount =
      publicRow?.amount ??
      0n;

    const privateAmount =
      privateRow?.amount ??
      0n;

    const amount =
      publicAmount +
      privateAmount;

    if (amount > 0n) {
      const visibility =
        publicAmount > 0n &&
        privateAmount > 0n
          ? "mixed"
          : privateAmount > 0n
            ? "private"
            : "public";

      positions.push({
        id:
          `starknet:endur:${liquidStakingAsset.id}:${owner}`,
        protocol:
          "Endur",
        kind:
          "liquid-staking",
        asset:
          liquidStakingAsset,
        amount,
        visibility,
        label:
          "Endur Liquid Staking",
        detail:
          visibility ===
            "mixed"
            ? "Public + revealed private xSTRK"
            : visibility ===
                "private"
              ? "Private liquid staking position"
              : "Public liquid staking token",
      });
    }
  }

  try {
    const borrowPositions =
      await discoverVesuBorrowPositions({
        provider,
        owner,
        collateralAsset:
          stakeAsset,
        debtAsset:
          borrowAsset,
      });

    for (
      const position
      of borrowPositions
    ) {
      positions.push({
        id:
          `starknet:vesu-borrow:${position.pool.id}:${owner}`,

        protocol:
          "Vesu",

        kind:
          "borrow",

        asset:
          position.debtAsset,

        amount:
          position.debtAmount,

        visibility:
          "public",

        label:
          `Vesu Borrow · ${position.pool.name}`,

        detail:
          position.collateralized
            ? "Public lending position"
            : "Public lending position · collateral check failed",

        borrow: {
          collateralAsset:
            position.collateralAsset,

          collateralAmount:
            position.collateralAmount,

          currentLtvBps:
            vesuPositionFractionToBps(
              position.currentLtv,
            ),

          maxLtvBps:
            vesuPositionFractionToBps(
              position.maxLtv,
            ),

          collateralized:
            position.collateralized,
        },
      });
    }
  } catch (cause) {
    warnings.push(
      cause instanceof Error
        ? cause.message
        : "Could not load Vesu Borrow positions.",
    );
  }

  return {
    positions,
    warnings,
  };
}
