import type {
  ChainRef,
} from "./chains";

export type AssetIdentifier =
  | Readonly<{
      kind: "native";
    }>
  | Readonly<{
      kind: "contract";
      address: string;
    }>
  | Readonly<{
      kind: "mint";
      address: string;
    }>;

export type AssetRef = Readonly<{
  id: string;
  chain: ChainRef;
  symbol: string;
  name: string;
  decimals: number;
  identifier: AssetIdentifier;
}>;

export type AssetRegistry =
  ReadonlyMap<string, AssetRef>;

/**
 * Builds an immutable-style asset registry and rejects ambiguous asset ids.
 * Every protocol adapter should resolve assets through this registry.
 */
export function createAssetRegistry(
  assets: readonly AssetRef[],
): AssetRegistry {
  const registry =
    new Map<string, AssetRef>();

  for (const asset of assets) {
    if (!asset.id.trim()) {
      throw new Error(
        "CAREL asset id cannot be empty.",
      );
    }

    if (
      !Number.isInteger(asset.decimals) ||
      asset.decimals < 0 ||
      asset.decimals > 255
    ) {
      throw new Error(
        `Invalid decimals for ${asset.id}.`,
      );
    }

    if (registry.has(asset.id)) {
      throw new Error(
        `Duplicate CAREL asset id: ${asset.id}`,
      );
    }

    registry.set(
      asset.id,
      asset,
    );
  }

  return registry;
}

/**
 * Looks up an asset without forcing callers to catch an exception.
 */
export function getAsset(
  registry: AssetRegistry,
  assetId: string,
): AssetRef | null {
  return registry.get(assetId) ?? null;
}

/**
 * Resolves a required asset or fails early before a protocol is called.
 */
export function requireAsset(
  registry: AssetRegistry,
  assetId: string,
): AssetRef {
  const asset =
    getAsset(
      registry,
      assetId,
    );

  if (!asset) {
    throw new Error(
      `Unknown CAREL asset: ${assetId}`,
    );
  }

  return asset;
}

/**
 * Returns every registered asset belonging to a specific chain.
 */
export function assetsForChain(
  registry: AssetRegistry,
  chainId: string,
): AssetRef[] {
  return [...registry.values()]
    .filter(
      (asset) =>
        asset.chain.id === chainId,
    );
}

/**
 * Returns the underlying contract/mint address when the asset has one.
 */
export function assetAddress(
  asset: AssetRef,
): string | null {
  return asset.identifier.kind === "native"
    ? null
    : asset.identifier.address;
}
