import type {
  ChainRef,
} from "@/lib/carel/core/chains";

export const SOLANA_MAINNET:
  ChainRef = {
    id:
      "solana:mainnet",

    ecosystem:
      "solana",

    chainId:
      "mainnet-beta",

    network:
      "mainnet",

    name:
      "Solana Mainnet",
  };

export const SOLANA_DEVNET:
  ChainRef = {
    id:
      "solana:devnet",

    ecosystem:
      "solana",

    chainId:
      "devnet",

    network:
      "testnet",

    name:
      "Solana Devnet",
  };

export const SOLANA_CHAINS =
  [
    SOLANA_MAINNET,
    SOLANA_DEVNET,
  ] as const;

/**
 * Resolves either CAREL's canonical Solana id or the cluster identifier.
 */
export function getSolanaChain(
  chainId: string,
): ChainRef | null {
  const normalized =
    chainId
      .trim()
      .toLowerCase();

  return (
    SOLANA_CHAINS.find(
      (chain) =>
        chain.id
          .toLowerCase() ===
          normalized ||
        chain.chainId
          .toLowerCase() ===
          normalized,
    ) ??
    null
  );
}
