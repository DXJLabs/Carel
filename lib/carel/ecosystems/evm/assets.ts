import {
  createAssetRegistry,
  getAsset,
  type AssetRef,
} from "@/lib/carel/core/assets";

import {
  ETHEREUM_MAINNET,
  ETHEREUM_SEPOLIA,
} from "./chains";

export const ETHEREUM_MAINNET_ETH:
  AssetRef = {
    id:
      "evm:ethereum:mainnet:ETH",

    chain:
      ETHEREUM_MAINNET,

    symbol:
      "ETH",

    name:
      "Ether",

    decimals:
      18,

    identifier: {
      kind:
        "native",
    },
  };

export const ETHEREUM_SEPOLIA_ETH:
  AssetRef = {
    id:
      "evm:ethereum:sepolia:ETH",

    chain:
      ETHEREUM_SEPOLIA,

    symbol:
      "ETH",

    name:
      "Sepolia Ether",

    decimals:
      18,

    identifier: {
      kind:
        "native",
    },
  };

export const EVM_ASSET_REGISTRY =
  createAssetRegistry([
    ETHEREUM_MAINNET_ETH,
    ETHEREUM_SEPOLIA_ETH,
  ]);

export function getEvmAsset(
  assetId: string,
): AssetRef | null {
  return getAsset(
    EVM_ASSET_REGISTRY,
    assetId,
  );
}
