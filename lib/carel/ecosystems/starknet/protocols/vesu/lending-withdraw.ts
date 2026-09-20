import type {
  Call,
} from "starknet";

import {
  normalizeStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";

import {
  toUint256Calldata,
} from "./borrow";

import {
  validateVesuCallSequence,
} from "./validation";


export type VesuLendWithdrawExecutionPayload =
  Readonly<{
    chainId: string;

    poolId: string;
    poolAddress: string;

    owner: string;

    assetId: string;
    vTokenAddress: string;

    shares: string;
    assets: string;

    preparedAt: number;
    expiresAt: number;

    calls:
      readonly Call[];
  }>;


/**
 * Public Vesu ERC-4626 exit.
 *
 * vToken shares
 *   -> redeem(shares, owner, owner)
 *   -> public underlying asset
 *
 * No token approval is required because the wallet owns and burns
 * its own vToken shares.
 */
export function buildVesuLendWithdrawCalls({
  owner,
  vTokenAddress,
  shares,
}: {
  owner: string;
  vTokenAddress: string;
  shares: bigint;
}): Call[] {
  if (
    shares <= 0n
  ) {
    throw new Error(
      "Vesu Withdraw shares must be greater than zero.",
    );
  }

  const account =
    normalizeStarknetAddress(
      owner,
    );

  const vToken =
    normalizeStarknetAddress(
      vTokenAddress,
    );

  if (
    BigInt(account) === 0n ||
    BigInt(vToken) === 0n
  ) {
    throw new Error(
      "Vesu Withdraw contains a zero Starknet address.",
    );
  }

  const amount =
    toUint256Calldata(
      shares,
    );

  return [
    {
      contractAddress:
        vToken,

      entrypoint:
        "redeem",

      calldata: [
        ...amount,

        // receiver
        account,

        // owner of the shares
        account,
      ],
    },
  ];
}


export function validateVesuLendWithdrawCalls({
  calls,
  owner,
  vTokenAddress,
  shares,
}: {
  calls: readonly Call[];
  owner: string;
  vTokenAddress: string;
  shares: bigint;
}): Call[] {
  const expected =
    buildVesuLendWithdrawCalls({
      owner,
      vTokenAddress,
      shares,
    });

  return validateVesuCallSequence({
    calls,
    expected,

    label:
      "Lend Withdraw",

    specs: [
      {
        /*
         * redeem(
         *   shares.low,
         *   shares.high,
         *   receiver,
         *   owner
         * )
         */
        addressIndexes:
          [2, 3],
      },
    ],
  });
}
