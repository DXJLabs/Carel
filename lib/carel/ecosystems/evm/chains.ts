import type {
  ChainRef,
} from "@/lib/carel/core/chains";

export const ETHEREUM_MAINNET:
  ChainRef = {
    id:
      "evm:ethereum:mainnet",

    ecosystem:
      "evm",

    chainId:
      "1",

    network:
      "mainnet",

    name:
      "Ethereum Mainnet",
  };

export const ETHEREUM_SEPOLIA:
  ChainRef = {
    id:
      "evm:ethereum:sepolia",

    ecosystem:
      "evm",

    chainId:
      "11155111",

    network:
      "testnet",

    name:
      "Ethereum Sepolia",
  };

export const EVM_CHAINS =
  [
    ETHEREUM_MAINNET,
    ETHEREUM_SEPOLIA,
  ] as const;

function normalizeEvmChainId(
  chainId: string,
): string {
  const value =
    chainId
      .trim()
      .toLowerCase();

  if (
    /^0x[0-9a-f]+$/i.test(
      value,
    )
  ) {
    return BigInt(
      value,
    ).toString();
  }

  return value;
}

/**
 * Resolves both decimal and EIP-1193 hexadecimal EVM chain ids.
 */
export function getEvmChain(
  chainId: string,
): ChainRef | null {
  const canonical =
    chainId
      .trim()
      .toLowerCase();

  const normalized =
    normalizeEvmChainId(
      chainId,
    );

  return (
    EVM_CHAINS.find(
      (chain) =>
        chain.id
          .toLowerCase() ===
          canonical ||
        chain.chainId ===
          normalized,
    ) ??
    null
  );
}
