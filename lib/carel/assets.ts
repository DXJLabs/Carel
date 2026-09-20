import {
  createAssetRegistry,
  getAsset,
  type AssetRef,
} from "@/lib/carel/core/assets";

import {
  STARKNET_ASSET_REGISTRY,
} from "@/lib/carel/ecosystems/starknet/assets";

import {
  BITCOIN_TESTNET4_BTC,
} from "@/lib/carel/ecosystems/bitcoin/assets";

import {
  EVM_ASSET_REGISTRY,
} from "@/lib/carel/ecosystems/evm/assets";

import {
  SOLANA_ASSET_REGISTRY,
} from "@/lib/carel/ecosystems/solana/assets";

import {
  GARDEN_STARKNET_SEPOLIA_STRKBTC,
  GARDEN_STARKNET_SEPOLIA_WBTC,
} from "@/lib/carel/protocols/garden/assets";

export const CAREL_ASSET_REGISTRY =
  createAssetRegistry([
    ...STARKNET_ASSET_REGISTRY.values(),
    BITCOIN_TESTNET4_BTC,
    ...EVM_ASSET_REGISTRY.values(),
    ...SOLANA_ASSET_REGISTRY.values(),
    GARDEN_STARKNET_SEPOLIA_WBTC,
    GARDEN_STARKNET_SEPOLIA_STRKBTC,
  ]);

/**
 * Resolves one stable CAREL asset id across all currently registered
 * ecosystems and cross-chain protocol assets.
 */
export function getCarelAsset(
  assetId: string,
): AssetRef | null {
  return getAsset(
    CAREL_ASSET_REGISTRY,
    assetId,
  );
}

/**
 * Resolves an asset symbol within one concrete chain.
 *
 * Both CAREL's canonical chain id and the wallet/provider chain id are
 * accepted so Agent compilation remains independent from UI network objects.
 */
export function findCarelAssetBySymbol(
  chainId: string,
  symbol: string,
): AssetRef | null {
  const normalized =
    symbol
      .trim()
      .toLowerCase();

  const matches = [
    ...CAREL_ASSET_REGISTRY.values(),
  ].filter(
    (asset) =>
      (
        asset.chain.id ===
          chainId ||
        asset.chain.chainId ===
          chainId
      ) &&
      asset.symbol
        .toLowerCase() ===
        normalized,
  );

  if (
    matches.length > 1
  ) {
    throw new Error(
      `CAREL asset symbol ${symbol} is ambiguous on this chain.`,
    );
  }

  return (
    matches[0] ??
    null
  );
}
