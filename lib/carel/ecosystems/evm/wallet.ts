import type {
  ChainRef,
} from "@/lib/carel/core/chains";

import {
  getEvmChain,
  toEvmChainHex,
} from "./chains";

import {
  normalizeEvmAddress,
  type Eip1193Provider,
} from "./provider";

export type EvmWalletSession =
  Readonly<{
    account: string;
    chain: ChainRef;
    provider: Eip1193Provider;
  }>;

function firstAccount(
  value: unknown,
): string {
  if (
    !Array.isArray(value) ||
    typeof value[0] !==
      "string"
  ) {
    throw new Error(
      "EVM wallet did not return an account.",
    );
  }

  return normalizeEvmAddress(
    value[0],
  );
}

async function resolveWalletChain(
  provider: Eip1193Provider,
): Promise<ChainRef> {
  const value =
    await provider.request({
      method:
        "eth_chainId",
    });

  if (
    typeof value !==
    "string"
  ) {
    throw new Error(
      "EVM wallet returned an invalid chain id.",
    );
  }

  const chain =
    getEvmChain(
      value,
    );

  if (!chain) {
    throw new Error(
      `Unsupported CAREL EVM chain: ${value}`,
    );
  }

  return chain;
}

/**
 * Requests wallet authorization and returns a validated CAREL EVM session.
 */
export async function connectEvmWallet(
  provider: Eip1193Provider,
): Promise<EvmWalletSession> {
  const accounts =
    await provider.request({
      method:
        "eth_requestAccounts",
    });

  const account =
    firstAccount(
      accounts,
    );

  const chain =
    await resolveWalletChain(
      provider,
    );

  return {
    account,
    chain,
    provider,
  };
}

/**
 * Reads an already-authorized EVM wallet without triggering a connection
 * prompt.
 */
export async function readEvmWallet(
  provider: Eip1193Provider,
): Promise<EvmWalletSession | null> {
  const accounts =
    await provider.request({
      method:
        "eth_accounts",
    });

  if (
    Array.isArray(accounts) &&
    accounts.length === 0
  ) {
    return null;
  }

  const account =
    firstAccount(
      accounts,
    );

  const chain =
    await resolveWalletChain(
      provider,
    );

  return {
    account,
    chain,
    provider,
  };
}

/**
 * Requests an EIP-1193 wallet to switch to a registered CAREL EVM chain.
 */
export async function switchEvmWalletChain(
  provider: Eip1193Provider,
  chain: ChainRef,
): Promise<void> {
  if (
    chain.ecosystem !==
    "evm"
  ) {
    throw new Error(
      "Cannot switch an EVM wallet to a non-EVM CAREL chain.",
    );
  }

  await provider.request({
    method:
      "wallet_switchEthereumChain",

    params: [
      {
        chainId:
          toEvmChainHex(
            chain.chainId,
          ),
      },
    ],
  });
}
