import {
  createAssetRegistry,
  getAsset,
  providerAssetId,
  type AssetRef,
} from "@/lib/carel/core/assets";

import {
  BITCOIN_TESTNET4_BTC,
} from "@/lib/carel/ecosystems/bitcoin/assets";

import {
  STARKNET_SEPOLIA,
} from "@/lib/carel/ecosystems/starknet/chains";

export const GARDEN_PROVIDER =
  "garden";

export const GARDEN_BITCOIN_ASSET_ID =
  "bitcoin_testnet:btc";

export const GARDEN_STARKNET_SEPOLIA_WBTC:
  AssetRef = {
    id:
      "starknet:sepolia:garden:WBTC",

    chain:
      STARKNET_SEPOLIA,

    symbol:
      "WBTC",

    name:
      "Garden WBTC",

    decimals:
      8,

    identifier: {
      kind:
        "provider",

      provider:
        GARDEN_PROVIDER,

      assetId:
        "starknet_sepolia:wbtc",
    },
  };

export const GARDEN_STARKNET_SEPOLIA_STRKBTC:
  AssetRef = {
    id:
      "starknet:sepolia:garden:strkBTC",

    chain:
      STARKNET_SEPOLIA,

    symbol:
      "strkBTC",

    name:
      "Garden strkBTC",

    decimals:
      8,

    identifier: {
      kind:
        "provider",

      provider:
        GARDEN_PROVIDER,

      assetId:
        "starknet_sepolia:strkbtc",
    },
  };

export const GARDEN_BRIDGE_ASSET_REGISTRY =
  createAssetRegistry([
    BITCOIN_TESTNET4_BTC,
    GARDEN_STARKNET_SEPOLIA_WBTC,
    GARDEN_STARKNET_SEPOLIA_STRKBTC,
  ]);

/**
 * Resolves only assets recognized by CAREL's Garden bridge boundary.
 */
export function getGardenBridgeAsset(
  assetId: string,
): AssetRef | null {
  return getAsset(
    GARDEN_BRIDGE_ASSET_REGISTRY,
    assetId,
  );
}

/**
 * Maps a CAREL asset identity to Garden's runtime catalog identity.
 *
 * Starknet token contract/HTLC addresses are deliberately not stored here;
 * Garden's live catalogue remains the authoritative execution source.
 */
export function gardenProviderAssetId(
  asset: AssetRef,
): string | null {
  if (
    asset.id ===
    BITCOIN_TESTNET4_BTC.id
  ) {
    return GARDEN_BITCOIN_ASSET_ID;
  }

  return providerAssetId(
    asset,
    GARDEN_PROVIDER,
  );
}
