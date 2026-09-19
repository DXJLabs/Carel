import type {
  Call,
} from "starknet";

import type {
  CollateralIntent,
} from "@/lib/carel/core/execution";

import {
  normalizeStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";

import {
  encodeVesuAssetAmount,
  requireVesuAssetAddress,
  toUint256Calldata,
  validateVesuBorrowMarket,
  type VesuBorrowMarket,
} from "./borrow";

import {
  validateVesuCallSequence,
} from "./validation";

export type VesuAddCollateralExecutionPayload =
  Readonly<{
    chainId: string;
    poolId: string;
    poolAddress: string;

    owner: string;

    collateralAssetId: string;
    debtAssetId: string;

    collateralAmount: string;

    preparedAt: number;
    expiresAt: number;

    calls: readonly Call[];
  }>;

/**
 * Builds exact collateral approval + Vesu modify_position.
 *
 * Debt delta remains zero, while collateral is a positive Assets amount.
 */
export function buildVesuAddCollateralCalls({
  market,
  owner,
  intent,
}: {
  market: VesuBorrowMarket;
  owner: string;
  intent: CollateralIntent;
}): Call[] {
  validateVesuBorrowMarket(
    market,
  );

  if (
    intent.action !==
      "add-collateral"
  ) {
    throw new Error(
      "Expected an Add Collateral intent.",
    );
  }

  if (
    intent.privacy !==
      undefined &&
    intent.privacy !==
      "public"
  ) {
    throw new Error(
      "Direct private Vesu collateral management is not enabled.",
    );
  }

  if (
    intent.collateralAssetId !==
    market.collateralAsset.id
  ) {
    throw new Error(
      "Collateral intent does not match the reviewed Vesu market.",
    );
  }

  if (
    intent.positionId &&
    intent.positionId !==
      market.id
  ) {
    throw new Error(
      "Collateral intent does not match the reviewed Vesu position.",
    );
  }

  if (intent.amount <= 0n) {
    throw new Error(
      "Collateral amount must be greater than zero.",
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

  const collateralToken =
    requireVesuAssetAddress(
      market.collateralAsset,
    );

  const debtToken =
    requireVesuAssetAddress(
      market.debtAsset,
    );

  const approval =
    toUint256Calldata(
      intent.amount,
    );

  const collateral =
    encodeVesuAssetAmount(
      intent.amount,
    );

  const debt =
    encodeVesuAssetAmount(
      0n,
    );

  return [
    {
      contractAddress:
        collateralToken,

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
        collateralToken,
        debtToken,
        account,
        ...collateral,
        ...debt,
      ],
    },
  ];
}

/**
 * Reconstructs Add Collateral locally and rejects altered calls.
 */
export function validateVesuAddCollateralCalls({
  calls,
  market,
  owner,
  intent,
}: {
  calls: readonly Call[];
  market: VesuBorrowMarket;
  owner: string;
  intent: CollateralIntent;
}): Call[] {
  const expected =
    buildVesuAddCollateralCalls({
      market,
      owner,
      intent,
    });

  return validateVesuCallSequence({
    calls,
    expected,
    label: "Add Collateral",
    specs: [
      {
        addressIndexes: [0],
      },
      {
        addressIndexes:
          [0, 1, 2],
      },
    ],
  });
}

export type VesuWithdrawCollateralExecutionPayload =
  Readonly<{
    chainId: string;
    poolId: string;
    poolAddress: string;

    owner: string;

    collateralAssetId: string;
    debtAssetId: string;

    collateralAmount: string;

    preparedAt: number;
    expiresAt: number;

    calls: readonly Call[];
  }>;

/**
 * Builds one Vesu modify_position call that removes collateral while
 * leaving debt unchanged.
 */
export function buildVesuWithdrawCollateralCalls({
  market,
  owner,
  intent,
}: {
  market: VesuBorrowMarket;
  owner: string;
  intent: CollateralIntent;
}): Call[] {
  validateVesuBorrowMarket(
    market,
  );

  if (
    intent.action !==
      "withdraw-collateral"
  ) {
    throw new Error(
      "Expected a Withdraw Collateral intent.",
    );
  }

  if (
    intent.privacy !==
      undefined &&
    intent.privacy !==
      "public"
  ) {
    throw new Error(
      "Direct private Vesu collateral management is not enabled.",
    );
  }

  if (
    intent.collateralAssetId !==
    market.collateralAsset.id
  ) {
    throw new Error(
      "Collateral intent does not match the reviewed Vesu market.",
    );
  }

  if (
    intent.positionId &&
    intent.positionId !==
      market.id
  ) {
    throw new Error(
      "Collateral intent does not match the reviewed Vesu position.",
    );
  }

  if (intent.amount <= 0n) {
    throw new Error(
      "Withdrawal amount must be greater than zero.",
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

  const collateralToken =
    requireVesuAssetAddress(
      market.collateralAsset,
    );

  const debtToken =
    requireVesuAssetAddress(
      market.debtAsset,
    );

  const collateral =
    encodeVesuAssetAmount(
      -intent.amount,
    );

  const debt =
    encodeVesuAssetAmount(
      0n,
    );

  return [
    {
      contractAddress:
        pool,

      entrypoint:
        "modify_position",

      calldata: [
        collateralToken,
        debtToken,
        account,
        ...collateral,
        ...debt,
      ],
    },
  ];
}

/**
 * Rebuilds Withdraw Collateral locally and rejects altered calls.
 */
export function validateVesuWithdrawCollateralCalls({
  calls,
  market,
  owner,
  intent,
}: {
  calls: readonly Call[];
  market: VesuBorrowMarket;
  owner: string;
  intent: CollateralIntent;
}): Call[] {
  const expected =
    buildVesuWithdrawCollateralCalls({
      market,
      owner,
      intent,
    });

  return validateVesuCallSequence({
    calls,
    expected,
    label: "Withdraw Collateral",
    specs: [
      {
        addressIndexes:
          [0, 1, 2],
      },
    ],
  });
}
