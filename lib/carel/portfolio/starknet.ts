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
  baseUrl,
  stakeAsset,
  liquidStakingAsset,
  balances,
  privateRevealed,
}: {
  owner: string;
  baseUrl: string;
  stakeAsset: AssetRef;
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

  return {
    positions,
    warnings,
  };
}
