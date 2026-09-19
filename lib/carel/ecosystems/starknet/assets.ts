import {
  createAssetRegistry,
  getAsset,
  type AssetRef,
} from "@/lib/carel/core/assets";

import {
  STARKNET_MAINNET,
  STARKNET_SEPOLIA,
} from "./chains";

export const STRK_TOKEN_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

export const STARKNET_SEPOLIA_USDC_ADDRESS =
  "0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343";

export const STARKNET_MAINNET_USDC_ADDRESS =
  "0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb";

export const ENDUR_XSTRK_ADDRESS =
  "0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a";

export const STARKNET_SEPOLIA_STRK:
  AssetRef = {
    id: "starknet:sepolia:STRK",
    chain: STARKNET_SEPOLIA,
    symbol: "STRK",
    name: "Starknet Token",
    decimals: 18,
    identifier: {
      kind: "contract",
      address:
        STRK_TOKEN_ADDRESS,
    },
  };

export const STARKNET_MAINNET_STRK:
  AssetRef = {
    id: "starknet:mainnet:STRK",
    chain: STARKNET_MAINNET,
    symbol: "STRK",
    name: "Starknet Token",
    decimals: 18,
    identifier: {
      kind: "contract",
      address:
        STRK_TOKEN_ADDRESS,
    },
  };

export const STARKNET_SEPOLIA_USDC:
  AssetRef = {
    id: "starknet:sepolia:USDC",
    chain: STARKNET_SEPOLIA,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    identifier: {
      kind: "contract",
      address:
        STARKNET_SEPOLIA_USDC_ADDRESS,
    },
  };

export const STARKNET_MAINNET_USDC:
  AssetRef = {
    id: "starknet:mainnet:USDC",
    chain: STARKNET_MAINNET,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    identifier: {
      kind: "contract",
      address:
        STARKNET_MAINNET_USDC_ADDRESS,
    },
  };

export const STARKNET_MAINNET_XSTRK:
  AssetRef = {
    id: "starknet:mainnet:xSTRK",
    chain: STARKNET_MAINNET,
    symbol: "xSTRK",
    name: "Endur xSTRK",
    decimals: 18,
    identifier: {
      kind: "contract",
      address:
        ENDUR_XSTRK_ADDRESS,
    },
  };

export const STARKNET_ASSET_REGISTRY =
  createAssetRegistry([
    STARKNET_SEPOLIA_STRK,
    STARKNET_MAINNET_STRK,
    STARKNET_SEPOLIA_USDC,
    STARKNET_MAINNET_USDC,
    STARKNET_MAINNET_XSTRK,
  ]);

/**
 * Resolves a Starknet asset using the same registry API future ecosystems use.
 */
export function getStarknetAsset(
  assetId: string,
): AssetRef | null {
  return getAsset(
    STARKNET_ASSET_REGISTRY,
    assetId,
  );
}
