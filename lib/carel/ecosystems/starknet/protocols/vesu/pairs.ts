import type {
  AssetRef,
} from "@/lib/carel/core/assets";

import {
  STARKNET_MAINNET_ETH,
  STARKNET_MAINNET_STRK,
  STARKNET_MAINNET_STRKBTC,
  STARKNET_MAINNET_USDC,
  STARKNET_MAINNET_USDT,
  STARKNET_MAINNET_WBTC,
} from "@/lib/carel/ecosystems/starknet/assets";

export type VesuBorrowPair =
  Readonly<{
    collateralAsset: AssetRef;
    debtAsset: AssetRef;
  }>;

/**
 * CAREL currently keeps Vesu collateral on STRK while allowing several
 * registered Mainnet debt candidates.
 *
 * Presence here is not proof that Vesu currently exposes the pair.
 * CAREL still probes pair_config, oracle state, liquidity, debt cap and
 * utilization on-chain before any execution can be prepared.
 */
export const VESU_BORROW_DEBT_ASSETS:
  readonly AssetRef[] = [
    STARKNET_MAINNET_USDC,
    STARKNET_MAINNET_ETH,
    STARKNET_MAINNET_USDT,
    STARKNET_MAINNET_WBTC,
    STARKNET_MAINNET_STRKBTC,
  ];

export function getVesuBorrowPair(
  collateralAssetId: string,
  debtAssetId: string,
): VesuBorrowPair | null {
  if (
    collateralAssetId !==
    STARKNET_MAINNET_STRK.id
  ) {
    return null;
  }

  const debtAsset =
    VESU_BORROW_DEBT_ASSETS.find(
      (asset) =>
        asset.id ===
        debtAssetId,
    );

  if (!debtAsset) {
    return null;
  }

  return {
    collateralAsset:
      STARKNET_MAINNET_STRK,
    debtAsset,
  };
}

export function getVesuBorrowDebtAssetBySymbol(
  symbol: string,
): AssetRef | null {
  const normalized =
    symbol.trim().toLowerCase();

  return (
    VESU_BORROW_DEBT_ASSETS.find(
      (asset) =>
        asset.symbol
          .toLowerCase() ===
        normalized,
    ) ??
    null
  );
}
