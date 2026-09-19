export type Ecosystem =
  | "starknet"
  | "evm"
  | "bitcoin"
  | "solana";

export type NetworkKind =
  | "mainnet"
  | "testnet";

export type ChainRef = Readonly<{
  id: string;
  ecosystem: Ecosystem;
  chainId: string;
  network: NetworkKind;
  name: string;
}>;

/**
 * Returns CAREL's canonical identifier for a chain.
 * Core code should depend on this id instead of RPC/provider objects.
 */
export function chainKey(
  chain: ChainRef,
): string {
  return chain.id;
}

/**
 * Compares two chains using CAREL's canonical id.
 */
export function sameChain(
  left: ChainRef,
  right: ChainRef,
): boolean {
  return left.id === right.id;
}

/**
 * Validates a chain registry before it is exposed to routing code.
 * Duplicate ids would make cross-chain routing ambiguous.
 */
export function assertUniqueChains(
  chains: readonly ChainRef[],
): void {
  const ids = new Set<string>();

  for (const chain of chains) {
    if (!chain.id.trim()) {
      throw new Error(
        "CAREL chain id cannot be empty.",
      );
    }

    if (ids.has(chain.id)) {
      throw new Error(
        `Duplicate CAREL chain id: ${chain.id}`,
      );
    }

    ids.add(chain.id);
  }
}
