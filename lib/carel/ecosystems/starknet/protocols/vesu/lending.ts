import type {
  Call,
} from "starknet";

import {
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  normalizeStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";

import {
  encodePositiveVesuAssetAmount,
  encodeVesuNativeAmount,
  requireVesuAssetAddress,
  toUint256Calldata,
  validateVesuBorrowMarket,
  type VesuBorrowMarket,
} from "./borrow";

import {
  validateVesuCallSequence,
} from "./validation";

export type VesuLendIntent =
  Readonly<{
    assetId: string;
    amount: bigint;
    privacy: "public";
  }>;

export type VesuLendExecutionPayload =
  Readonly<{
    chainId: string;

    poolId: string;
    poolAddress: string;

    owner: string;

    assetId: string;
    counterpartAssetId: string;

    amount: string;

    preparedAt: number;
    expiresAt: number;

    calls:
      readonly Call[];
  }>;

export function createVesuLendIntent({
  market,
  amount,
}: {
  market: VesuBorrowMarket;
  amount: string;
}): VesuLendIntent {
  validateVesuBorrowMarket(
    market,
  );

  const parsed =
    parseUnits(
      amount,
      market.collateralAsset
        .decimals,
    );

  if (parsed <= 0n) {
    throw new Error(
      "Lend amount must be greater than zero.",
    );
  }

  return {
    assetId:
      market.collateralAsset.id,

    amount:
      parsed,

    privacy:
      "public",
  };
}

/**
 * Vesu supply is a positive collateral delta with zero debt.
 * CAREL supplies only into a pair independently verified on-chain.
 */
export function buildVesuLendCalls({
  market,
  owner,
  intent,
}: {
  market: VesuBorrowMarket;
  owner: string;
  intent: VesuLendIntent;
}): Call[] {
  validateVesuBorrowMarket(
    market,
  );

  if (
    intent.privacy !==
      "public"
  ) {
    throw new Error(
      "Direct private Vesu lending is not enabled.",
    );
  }

  if (
    intent.assetId !==
      market.collateralAsset.id ||
    intent.amount <= 0n
  ) {
    throw new Error(
      "Lend intent does not match the reviewed Vesu market.",
    );
  }

  const pool =
    normalizeStarknetAddress(
      market.poolAddress,
    );

  const account =
    normalizeStarknetAddress(
      owner,
    );

  const asset =
    requireVesuAssetAddress(
      market.collateralAsset,
    );

  const counterpart =
    requireVesuAssetAddress(
      market.debtAsset,
    );

  const approval =
    toUint256Calldata(
      intent.amount,
    );

  const supply =
    encodePositiveVesuAssetAmount(
      intent.amount,
    );

  // Cairo Amount::default() uses zero Native amount.
  const zeroDebt =
    encodeVesuNativeAmount(
      0n,
    );

  return [
    {
      contractAddress:
        asset,

      entrypoint:
        "approve",

      calldata: [
        pool,
        ...approval,
      ],
    },

    {
      contractAddress:
        pool,

      entrypoint:
        "modify_position",

      calldata: [
        asset,
        counterpart,
        account,
        ...supply,
        ...zeroDebt,
      ],
    },
  ];
}

export function validateVesuLendCalls({
  calls,
  market,
  owner,
  intent,
}: {
  calls: readonly Call[];
  market: VesuBorrowMarket;
  owner: string;
  intent: VesuLendIntent;
}): Call[] {
  const expected =
    buildVesuLendCalls({
      market,
      owner,
      intent,
    });

  return validateVesuCallSequence({
    calls,
    expected,
    label:
      "Lend",

    specs: [
      {
        addressIndexes:
          [0],
      },
      {
        addressIndexes:
          [0, 1, 2],
      },
    ],
  });
}
