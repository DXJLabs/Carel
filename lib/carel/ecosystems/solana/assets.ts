import {
  createAssetRegistry,
  getAsset,
  type AssetRef,
} from "@/lib/carel/core/assets";

import {
  SOLANA_DEVNET,
  SOLANA_MAINNET,
} from "./chains";

export const SOLANA_MAINNET_SOL:
  AssetRef = {
    id:
      "solana:mainnet:SOL",

    chain:
      SOLANA_MAINNET,

    symbol:
      "SOL",

    name:
      "Solana",

    decimals:
      9,

    identifier: {
      kind:
        "native",
    },
  };

export const SOLANA_DEVNET_SOL:
  AssetRef = {
    id:
      "solana:devnet:SOL",

    chain:
      SOLANA_DEVNET,

    symbol:
      "SOL",

    name:
      "Devnet SOL",

    decimals:
      9,

    identifier: {
      kind:
        "native",
    },
  };

export const SOLANA_ASSET_REGISTRY =
  createAssetRegistry([
    SOLANA_MAINNET_SOL,
    SOLANA_DEVNET_SOL,
  ]);

export function getSolanaAsset(
  assetId: string,
): AssetRef | null {
  return getAsset(
    SOLANA_ASSET_REGISTRY,
    assetId,
  );
}
