import {
  assertUniqueChains,
  type ChainRef,
} from "@/lib/carel/core/chains";

import {
  BITCOIN_TESTNET4,
} from "@/lib/carel/ecosystems/bitcoin/chains";

import {
  EVM_CHAINS,
} from "@/lib/carel/ecosystems/evm/chains";

import {
  SOLANA_CHAINS,
} from "@/lib/carel/ecosystems/solana/chains";

import {
  STARKNET_CHAINS,
} from "@/lib/carel/ecosystems/starknet/chains";

export const CAREL_CHAINS:
  readonly ChainRef[] = [
    ...STARKNET_CHAINS,
    BITCOIN_TESTNET4,
    ...EVM_CHAINS,
    ...SOLANA_CHAINS,
  ];

assertUniqueChains(
  CAREL_CHAINS,
);

/**
 * Resolves CAREL's canonical id or an ecosystem-native chain identifier.
 *
 * Ambiguous native identifiers fail closed instead of guessing an ecosystem.
 */
export function getCarelChain(
  chainId: string,
): ChainRef | null {
  const normalized =
    chainId
      .trim()
      .toLowerCase();

  const matches =
    CAREL_CHAINS.filter(
      (chain) =>
        chain.id
          .toLowerCase() ===
          normalized ||
        chain.chainId
          .toLowerCase() ===
          normalized,
    );

  if (
    matches.length > 1
  ) {
    throw new Error(
      `CAREL chain identifier ${chainId} is ambiguous.`,
    );
  }

  return (
    matches[0] ??
    null
  );
}
