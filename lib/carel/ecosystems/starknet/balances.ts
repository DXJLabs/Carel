import type {
  RpcProvider,
} from "starknet";

import {
  assetAddress,
  type AssetRef,
} from "@/lib/carel/core/assets";

import type {
  AssetBalance,
} from "@/lib/carel/core/balances";

import {
  sameStarknetFelt,
} from "./addresses";

/**
 * Resolves a Starknet contract address for balance reads.
 * Balance infrastructure stays asset-based instead of receiving
 * raw protocol token addresses from UI components.
 */
export function requireStarknetBalanceAddress(
  asset: AssetRef,
): string {
  if (
    asset.chain.ecosystem !==
    "starknet"
  ) {
    throw new Error(
      `${asset.id} is not a Starknet asset.`,
    );
  }

  const address =
    assetAddress(asset);

  if (!address) {
    throw new Error(
      `${asset.id} does not expose a Starknet contract address.`,
    );
  }

  return address;
}

/**
 * Reads one public Starknet ERC20-style balance and returns
 * CAREL's generic AssetBalance representation.
 */
export async function readStarknetPublicBalance(
  owner: string,
  provider: RpcProvider,
  asset: AssetRef,
): Promise<AssetBalance> {
  const contractAddress =
    requireStarknetBalanceAddress(
      asset,
    );

  const result =
    await provider.callContract({
      contractAddress,
      entrypoint:
        "balance_of",
      calldata: [owner],
    });

  const low =
    BigInt(
      result[0] ?? "0",
    );

  const high =
    BigInt(
      result[1] ?? "0",
    );

  return {
    assetId: asset.id,
    chainId:
      asset.chain.id,
    visibility: "public",
    amount:
      low +
      (high << 128n),
    source:
      "starknet-rpc",
    updatedAt:
      Date.now(),
  };
}

/**
 * Reads public balances for every asset supported by a CAREL network.
 * A single failed token read fails the snapshot rather than producing
 * a misleading partial portfolio.
 */
export async function readStarknetPublicBalances(
  owner: string,
  provider: RpcProvider,
  assets: readonly AssetRef[],
): Promise<AssetBalance[]> {
  return Promise.all(
    assets.map(
      (asset) =>
        readStarknetPublicBalance(
          owner,
          provider,
          asset,
        ),
    ),
  );
}

/**
 * Converts registered assets into the token-address list expected by
 * the STRK20 Wallet API.
 */
export function privateBalanceTokenAddresses(
  assets: readonly AssetRef[],
): string[] {
  return assets.map(
    requireStarknetBalanceAddress,
  );
}

/**
 * Extracts one token amount from an STRK20 balance response.
 * Wallet response parsing therefore lives in the Starknet privacy adapter,
 * not in Swap, Staking, Portfolio, or React UI code.
 */
export function readStrk20TokenAmount(
  raw: unknown,
  expectedToken: string,
): bigint {
  const payload =
    raw &&
    typeof raw ===
      "object" &&
    "value" in raw
      ? (
          raw as {
            value: unknown;
          }
        ).value
      : raw;

  if (
    !Array.isArray(
      payload,
    )
  ) {
    return 0n;
  }

  for (
    const entry
    of payload
  ) {
    if (
      !entry ||
      typeof entry !==
        "object"
    ) {
      continue;
    }

    const row =
      entry as Record<
        string,
        unknown
      >;

    const token =
      row.token ??
      row.token_address ??
      row[0];

    const amount =
      row.amount ??
      row.balance ??
      row[1];

    if (
      !sameStarknetFelt(
        token,
        expectedToken,
      )
    ) {
      continue;
    }

    try {
      return BigInt(
        String(
          amount ?? "0",
        ),
      );
    } catch {
      return 0n;
    }
  }

  return 0n;
}

/**
 * Converts an explicit STRK20 disclosure into generic CAREL balance rows.
 * Missing entries become known zeroes because the wallet was explicitly
 * asked for each registered token in this snapshot.
 */
export function readStrk20PrivateBalances(
  raw: unknown,
  assets: readonly AssetRef[],
): AssetBalance[] {
  const observedAt =
    Date.now();

  return assets.map(
    (asset) => ({
      assetId: asset.id,
      chainId:
        asset.chain.id,
      visibility:
        "private" as const,
      amount:
        readStrk20TokenAmount(
          raw,
          requireStarknetBalanceAddress(
            asset,
          ),
        ),
      source:
        "strk20-wallet-api",
      updatedAt:
        observedAt,
    }),
  );
}
