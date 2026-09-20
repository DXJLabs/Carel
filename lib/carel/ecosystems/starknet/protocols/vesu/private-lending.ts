import type {
  WALLET_API,
} from "@starknet-io/types-js";

import {
  normalizeStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";


/**
 * Vesu V2 Mainnet PoolFactory.
 * Published by the upstream Vesu V2 deployment.
 */
export const VESU_MAINNET_POOL_FACTORY =
  "0x3760f903a37948f97302736f89ce30290e45f441559325026842b7a6fb388c0";


/**
 * CAREL-pinned Mainnet VesuLendingAnonymizer.
 *
 * Verified read-only against SN_MAIN before admission:
 * - live contract class hash matches the pinned anonymizer class
 * - Vesu Prime vUSDC resolves through PoolFactory
 * - vUSDC underlying resolves to CAREL Mainnet USDC
 *
 * This is a CAREL-verified deployment, not an assertion that the
 * address is an official StarkWare-operated deployment.
 */
export const VESU_MAINNET_LENDING_ANONYMIZER =
  "0x4ee621484a3dfda3976b5fd37749e50727a7697296a46fbd0fd81c4d42dfe38";


export const VESU_LENDING_ANONYMIZER_CLASS_HASH =
  "0x05932298db5e32106f6f5814db6f3c378472d9c0d8f0d8370c87f6f1fd311e2f";


export type VesuShieldLendExecutionPayload =
  Readonly<{
    chainId: string;

    poolId: string;
    poolAddress: string;

    owner: string;

    assetId: string;
    assetAddress: string;
    assetSymbol: string;

    amount: string;

    vTokenAddress: string;
    anonymizerAddress: string;

    preparedAt: number;
    expiresAt: number;
  }>;


export function configuredVesuLendingAnonymizer():
  string | null {
  const raw =
    process.env
      .NEXT_PUBLIC_VESU_LENDING_ANONYMIZER_ADDRESS
      ?.trim() ||
    VESU_MAINNET_LENDING_ANONYMIZER;

  try {
    const address =
      normalizeStarknetAddress(
        raw,
      );

    return BigInt(address) > 0n
      ? address
      : null;
  } catch {
    return null;
  }
}


function hex(
  value: bigint,
): string {
  if (value < 0n) {
    throw new Error(
      "Shield Lend amount cannot be negative.",
    );
  }

  return `0x${value.toString(16)}`;
}


/**
 * Builds the exact STRK20 Wallet API action sequence for Shield Lend.
 *
 * Public underlying
 *   -> deposit into privacy
 *   -> withdraw privately to Vesu anonymizer
 *   -> create OPEN vToken note
 *   -> anonymizer deposits underlying into Vesu vault
 *
 * The resulting Vesu vToken is returned to the privacy pool.
 */
export function buildVesuShieldLendActions({
  assetAddress,
  vTokenAddress,
  anonymizerAddress,
  owner,
  amount,
}: {
  assetAddress: string;
  vTokenAddress: string;
  anonymizerAddress: string;
  owner: string;
  amount: bigint;
}): WALLET_API.STRK20_ACTION[] {
  if (amount <= 0n) {
    throw new Error(
      "Shield Lend amount must be greater than zero.",
    );
  }

  const asset =
    normalizeStarknetAddress(
      assetAddress,
    );

  const vToken =
    normalizeStarknetAddress(
      vTokenAddress,
    );

  const anonymizer =
    normalizeStarknetAddress(
      anonymizerAddress,
    );

  const recipient =
    normalizeStarknetAddress(
      owner,
    );

  if (
    BigInt(asset) === 0n ||
    BigInt(vToken) === 0n ||
    BigInt(anonymizer) === 0n ||
    BigInt(recipient) === 0n
  ) {
    throw new Error(
      "Shield Lend contains a zero Starknet address.",
    );
  }

  if (
    asset === vToken
  ) {
    throw new Error(
      "Vesu underlying and vToken must be different.",
    );
  }

  const uint128Mask =
    (1n << 128n) - 1n;

  const amountLow =
    amount &
    uint128Mask;

  const amountHigh =
    amount >>
    128n;

  return [
    {
      type:
        "deposit",

      token:
        asset,

      amount:
        hex(amount),
    },

    {
      type:
        "withdraw",

      token:
        asset,

      amount:
        hex(amount),

      recipient:
        anonymizer,
    },

    {
      type:
        "transfer",

      token:
        vToken,

      amount:
        "OPEN",

      recipient,
    },

    {
      type:
        "invoke",

      contract:
        anonymizer,

      calldata: [
        // LendingOperation::Deposit
        "0x0",

        // underlying
        asset,

        // Vesu vToken
        vToken,

        // assets: u256
        hex(amountLow),
        hex(amountHigh),

        // OPEN vToken note created above
        "${openNoteIds[0]}",
      ],
    },
  ];
}
