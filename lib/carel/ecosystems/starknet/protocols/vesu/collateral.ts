import type {
  Call,
} from "starknet";

import type {
  CollateralIntent,
} from "@/lib/carel/core/execution";

import {
  normalizeStarknetAddress,
  sameStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";

import {
  encodeVesuAssetAmount,
  requireVesuAssetAddress,
  sameVesuWord,
  toUint256Calldata,
  validateVesuBorrowMarket,
  vesuCallData,
  type VesuBorrowMarket,
} from "./borrow";

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
 * Reconstructs Add Collateral locally and rejects any altered server call.
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
  if (calls.length !== 2) {
    throw new Error(
      "CAREL requires exactly two Vesu Add Collateral calls.",
    );
  }

  const expected =
    buildVesuAddCollateralCalls({
      market,
      owner,
      intent,
    });

  for (
    let callIndex = 0;
    callIndex <
    expected.length;
    callIndex += 1
  ) {
    const actualCall =
      calls[callIndex];

    const expectedCall =
      expected[callIndex];

    if (
      !sameStarknetAddress(
        actualCall.contractAddress,
        expectedCall.contractAddress,
      ) ||
      actualCall.entrypoint !==
        expectedCall.entrypoint
    ) {
      throw new Error(
        "CAREL blocked a mismatched Vesu Add Collateral call.",
      );
    }

    const actualData =
      vesuCallData(
        actualCall,
      );

    const expectedData =
      vesuCallData(
        expectedCall,
      );

    if (
      actualData.length !==
      expectedData.length
    ) {
      throw new Error(
        "CAREL blocked malformed Vesu Add Collateral calldata.",
      );
    }

    const addressIndexes =
      callIndex === 0
        ? new Set([0])
        : new Set([
            0,
            1,
            2,
          ]);

    for (
      let index = 0;
      index <
      expectedData.length;
      index += 1
    ) {
      const matches =
        addressIndexes.has(
          index,
        )
          ? sameStarknetAddress(
              actualData[index],
              expectedData[index],
            )
          : sameVesuWord(
              actualData[index],
              expectedData[index],
            );

      if (!matches) {
        throw new Error(
          "CAREL blocked altered Vesu Add Collateral calldata.",
        );
      }
    }
  }

  return expected;
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
 * Rebuilds the reviewed withdrawal locally before wallet execution.
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
  if (calls.length !== 1) {
    throw new Error(
      "CAREL requires exactly one Vesu Withdraw Collateral call.",
    );
  }

  const expected =
    buildVesuWithdrawCollateralCalls({
      market,
      owner,
      intent,
    });

  const actualCall =
    calls[0];

  const expectedCall =
    expected[0];

  if (
    !sameStarknetAddress(
      actualCall.contractAddress,
      expectedCall.contractAddress,
    ) ||
    actualCall.entrypoint !==
      expectedCall.entrypoint
  ) {
    throw new Error(
      "CAREL blocked a mismatched Vesu Withdraw Collateral call.",
    );
  }

  const actualData =
    vesuCallData(
      actualCall,
    );

  const expectedData =
    vesuCallData(
      expectedCall,
    );

  if (
    actualData.length !==
    expectedData.length
  ) {
    throw new Error(
      "CAREL blocked malformed Withdraw Collateral calldata.",
    );
  }

  const addressIndexes =
    new Set([
      0,
      1,
      2,
    ]);

  for (
    let index = 0;
    index <
    expectedData.length;
    index += 1
  ) {
    const matches =
      addressIndexes.has(
        index,
      )
        ? sameStarknetAddress(
            actualData[index],
            expectedData[index],
          )
        : sameVesuWord(
            actualData[index],
            expectedData[index],
          );

    if (!matches) {
      throw new Error(
        "CAREL blocked altered Withdraw Collateral calldata.",
      );
    }
  }

  return expected;
}
