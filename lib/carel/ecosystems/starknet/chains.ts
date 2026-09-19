import {
  constants,
} from "starknet";

import type {
  ChainRef,
} from "@/lib/carel/core/chains";

export const STARKNET_SEPOLIA:
  ChainRef = {
    id: "starknet:sepolia",
    ecosystem: "starknet",
    chainId:
      constants.StarknetChainId
        .SN_SEPOLIA,
    network: "testnet",
    name: "Starknet Sepolia",
  };

export const STARKNET_MAINNET:
  ChainRef = {
    id: "starknet:mainnet",
    ecosystem: "starknet",
    chainId:
      constants.StarknetChainId
        .SN_MAIN,
    network: "mainnet",
    name: "Starknet Mainnet",
  };

export const STARKNET_CHAINS =
  [
    STARKNET_SEPOLIA,
    STARKNET_MAINNET,
  ] as const;

/**
 * Maps wallet/provider Starknet chain ids into CAREL's generic ChainRef.
 */
export function getStarknetChain(
  chainId: string,
): ChainRef | null {
  return (
    STARKNET_CHAINS.find(
      (chain) =>
        chain.chainId ===
        chainId,
    ) ?? null
  );
}
