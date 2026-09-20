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

export const STARKNET_MAINNET_ETH_ADDRESS =
  "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";

export const STARKNET_MAINNET_USDT_ADDRESS =
  "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8";

export const STARKNET_MAINNET_WBTC_ADDRESS =
  "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac";

export const STARKNET_MAINNET_STRKBTC_ADDRESS =
  "0x0787150e306e6eae6e3f79dea881770e8bbff2c1b8eb490f969669ee945b3135";

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

export const STARKNET_MAINNET_ETH:
  AssetRef = {
    id: "starknet:mainnet:ETH",
    chain: STARKNET_MAINNET,
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    identifier: {
      kind: "contract",
      address:
        STARKNET_MAINNET_ETH_ADDRESS,
    },
  };

export const STARKNET_MAINNET_USDT:
  AssetRef = {
    id: "starknet:mainnet:USDT",
    chain: STARKNET_MAINNET,
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    identifier: {
      kind: "contract",
      address:
        STARKNET_MAINNET_USDT_ADDRESS,
    },
  };

export const STARKNET_MAINNET_WBTC:
  AssetRef = {
    id: "starknet:mainnet:WBTC",
    chain: STARKNET_MAINNET,
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    decimals: 8,
    identifier: {
      kind: "contract",
      address:
        STARKNET_MAINNET_WBTC_ADDRESS,
    },
  };

export const STARKNET_MAINNET_STRKBTC:
  AssetRef = {
    id: "starknet:mainnet:strkBTC",
    chain: STARKNET_MAINNET,
    symbol: "strkBTC",
    name: "Starknet Bitcoin",
    decimals: 8,
    identifier: {
      kind: "contract",
      address:
        STARKNET_MAINNET_STRKBTC_ADDRESS,
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
    STARKNET_MAINNET_ETH,
    STARKNET_MAINNET_USDT,
    STARKNET_MAINNET_WBTC,
    STARKNET_MAINNET_STRKBTC,
    STARKNET_MAINNET_XSTRK,
  ]);

/**
 * Resolves a Starknet asset using CAREL's canonical registry.
 */
export function getStarknetAsset(
  assetId: string,
): AssetRef | null {
  return getAsset(
    STARKNET_ASSET_REGISTRY,
    assetId,
  );
}
