import {
  num,
  type Call,
} from "starknet";

import {
  assetAddress,
  type AssetRef,
} from "@/lib/carel/core/assets";

import {
  parseUnits,
} from "@/lib/carel/core/amounts";

import type {
  BorrowIntent,
  ExecutionPrivacy,
  RepayIntent,
} from "@/lib/carel/core/execution";

import {
  normalizeStarknetAddress,
  sameStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";

export type VesuBorrowMarket =
  Readonly<{
    id: string;
    chainId: string;
    poolAddress: string;
    collateralAsset: AssetRef;
    debtAsset: AssetRef;
  }>;

const UINT128_MASK =
  (1n << 128n) - 1n;

const UINT256_LIMIT =
  1n << 256n;

/**
 * Resolves the Starknet ERC20 contract used by a Vesu market.
 */
export function requireVesuAssetAddress(
  asset: AssetRef,
): string {
  if (
    asset.chain.ecosystem !==
    "starknet"
  ) {
    throw new Error(
      `${asset.id} is not a Starknet asset.`,
    );
  }

  const address =
    assetAddress(asset);

  if (!address) {
    throw new Error(
      `${asset.id} does not expose a Starknet token contract.`,
    );
  }

  return normalizeStarknetAddress(
    address,
  );
}

/**
 * Splits a positive bigint into Starknet uint256 calldata.
 */
export function toUint256Calldata(
  value: bigint,
): readonly [string, string] {
  if (
    value < 0n ||
    value >= UINT256_LIMIT
  ) {
    throw new Error(
      "Amount is outside Starknet uint256 range.",
    );
  }

  return [
    num.toHex(
      value &
        UINT128_MASK,
    ),
    num.toHex(
      value >> 128n,
    ),
  ];
}

/**
 * Serializes Vesu AmountDenomination::Assets with Alexandria i257.
 *
 * Cairo serde order is:
 * denomination, abs.low, abs.high, is_negative.
 *
 * Zero is always encoded as non-negative.
 */
export function encodeVesuAssetAmount(
  value: bigint,
): readonly [
  string,
  string,
  string,
  string,
] {
  const negative =
    value < 0n;

  const absolute =
    negative
      ? -value
      : value;

  const [
    low,
    high,
  ] =
    toUint256Calldata(
      absolute,
    );

  return [
    "1",
    low,
    high,
    negative &&
    absolute !== 0n
      ? "1"
      : "0",
  ];
}

/**
 * Serializes Vesu's Amount { denomination: Assets, value: positive i257 }.
 *
 * Assets is enum discriminant 1. The positive i257 is encoded as
 * absolute uint256 low/high followed by is_negative = 0.
 */
export function encodePositiveVesuAssetAmount(
  value: bigint,
): readonly [
  string,
  string,
  string,
  string,
] {
  if (value <= 0n) {
    throw new Error(
      "Vesu amount must be greater than zero.",
    );
  }

  return encodeVesuAssetAmount(
    value,
  );
}



/**
 * Serializes Vesu AmountDenomination::Native with Alexandria i257.
 *
 * Native denomination lets Vesu resolve block-current collateral and debt
 * from collateral shares and nominal debt, which is required for exact close.
 */
export function encodeVesuNativeAmount(
  value: bigint,
): readonly [
  string,
  string,
  string,
  string,
] {
  const negative =
    value < 0n;

  const absolute =
    negative
      ? -value
      : value;

  const [
    low,
    high,
  ] =
    toUint256Calldata(
      absolute,
    );

  return [
    "0",
    low,
    high,
    negative &&
    absolute !== 0n
      ? "1"
      : "0",
  ];
}

/**
 * Validates that a market belongs to one Starknet chain and references
 * two distinct registered assets.
 *
 * A market object is configuration only. CAREL must still verify its
 * live Vesu risk state before this market is allowed to execute.
 */
export function validateVesuBorrowMarket(
  market: VesuBorrowMarket,
): void {
  if (
    market.collateralAsset.chain.id !==
      market.debtAsset.chain.id ||
    market.collateralAsset.chain.chainId !==
      market.chainId
  ) {
    throw new Error(
      "Vesu market assets must belong to the same connected Starknet chain.",
    );
  }

  if (
    market.collateralAsset.id ===
    market.debtAsset.id
  ) {
    throw new Error(
      "Borrow collateral and debt assets must be different.",
    );
  }

  const collateralToken =
    requireVesuAssetAddress(
      market.collateralAsset,
    );

  const debtToken =
    requireVesuAssetAddress(
      market.debtAsset,
    );

  const pool =
    normalizeStarknetAddress(
      market.poolAddress,
    );

  if (
    sameStarknetAddress(
      collateralToken,
      debtToken,
    ) ||
    sameStarknetAddress(
      pool,
      collateralToken,
    ) ||
    sameStarknetAddress(
      pool,
      debtToken,
    )
  ) {
    throw new Error(
      "Invalid Vesu market addresses.",
    );
  }
}

/**
 * Creates CAREL's provider-independent BorrowIntent from a verified
 * market and human-readable amounts.
 */
export function createVesuBorrowIntent({
  market,
  collateralAmount,
  borrowAmount,
  privacy = "public",
}: {
  market: VesuBorrowMarket;
  collateralAmount: string;
  borrowAmount: string;
  privacy?: ExecutionPrivacy;
}): BorrowIntent {
  validateVesuBorrowMarket(
    market,
  );

  const parsedCollateral =
    parseUnits(
      collateralAmount,
      market.collateralAsset
        .decimals,
    );

  const parsedBorrow =
    parseUnits(
      borrowAmount,
      market.debtAsset
        .decimals,
    );

  if (
    parsedCollateral <= 0n
  ) {
    throw new Error(
      "Collateral amount must be greater than zero.",
    );
  }

  if (parsedBorrow <= 0n) {
    throw new Error(
      "Borrow amount must be greater than zero.",
    );
  }

  return {
    action: "borrow",
    collateralAssetId:
      market.collateralAsset.id,
    borrowAssetId:
      market.debtAsset.id,
    collateralAmount:
      parsedCollateral,
    borrowAmount:
      parsedBorrow,
    privacy,
  };
}

/**
 * Builds the two reviewed calls required for a public Vesu borrow:
 * exact collateral approval followed by modify_position.
 *
 * This function deliberately accepts a VesuBorrowMarket object rather than
 * discovering or trusting a pool address supplied by UI input.
 */
export function buildVesuBorrowCalls({
  market,
  owner,
  intent,
}: {
  market: VesuBorrowMarket;
  owner: string;
  intent: BorrowIntent;
}): Call[] {
  validateVesuBorrowMarket(
    market,
  );

  if (
    intent.privacy !==
      undefined &&
    intent.privacy !==
      "public"
  ) {
    throw new Error(
      "Direct private Vesu borrowing is not enabled in this adapter.",
    );
  }

  if (
    intent.collateralAssetId !==
      market.collateralAsset.id ||
    intent.borrowAssetId !==
      market.debtAsset.id
  ) {
    throw new Error(
      "Borrow intent does not match the reviewed Vesu market.",
    );
  }

  if (
    intent.collateralAmount <=
      0n ||
    intent.borrowAmount <=
      0n
  ) {
    throw new Error(
      "Borrow amounts must be greater than zero.",
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

  const collateralApproval =
    toUint256Calldata(
      intent.collateralAmount,
    );

  const collateral =
    encodePositiveVesuAssetAmount(
      intent.collateralAmount,
    );

  const debt =
    encodePositiveVesuAssetAmount(
      intent.borrowAmount,
    );

  return [
    {
      contractAddress:
        collateralToken,
      entrypoint:
        "approve",
      calldata: [
        pool,
        ...collateralApproval,
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


export type VesuBorrowExecutionPayload =
  Readonly<{
    chainId: string;
    poolId: string;
    poolAddress: string;

    owner: string;

    collateralAssetId: string;
    debtAssetId: string;

    collateralAmount: string;
    borrowAmount: string;

    preparedAt: number;
    expiresAt: number;

    calls: readonly Call[];
  }>;

/**
 * Normalizes one Starknet call's calldata and rejects missing calldata.
 */
function vesuCallData(
  call: Call,
): string[] {
  if (
    !Array.isArray(
      call.calldata,
    )
  ) {
    throw new Error(
      "CAREL received malformed Vesu calldata.",
    );
  }

  return call.calldata.map(
    (value) =>
      String(value),
  );
}

/**
 * Compares numeric Starknet calldata words without depending on hex padding.
 */
function sameVesuWord(
  actual: string,
  expected: string,
): boolean {
  try {
    return (
      BigInt(actual) ===
      BigInt(expected)
    );
  } catch {
    return false;
  }
}

/**
 * Verifies server-prepared Vesu calls against CAREL's locally reconstructed
 * Borrow transaction.
 *
 * The returned calls are the locally reconstructed calls, never the raw
 * server response, so an API response cannot inject another contract call.
 */
export function validateVesuBorrowCalls({
  calls,
  market,
  owner,
  intent,
}: {
  calls: readonly Call[];
  market: VesuBorrowMarket;
  owner: string;
  intent: BorrowIntent;
}): Call[] {
  if (calls.length !== 2) {
    throw new Error(
      "CAREL requires exactly two Vesu Borrow calls.",
    );
  }

  const expected =
    buildVesuBorrowCalls({
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
        "CAREL blocked a mismatched Vesu Borrow call.",
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
        "CAREL blocked malformed Vesu Borrow calldata.",
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
          "CAREL blocked altered Vesu Borrow calldata.",
        );
      }
    }
  }

  return expected;
}


export type VesuRepayExecutionPayload =
  Readonly<{
    chainId: string;
    poolId: string;
    poolAddress: string;

    owner: string;

    collateralAssetId: string;
    debtAssetId: string;

    repayAmount: string;

    preparedAt: number;
    expiresAt: number;

    calls: readonly Call[];
  }>;

/**
 * Builds exact-approval + modify_position calls for a partial Vesu Repay.
 *
 * Collateral delta is zero and debt delta is negative Assets denomination.
 * Full position close is intentionally handled separately because Vesu
 * requires Native denomination for block-accurate nominal debt repayment.
 */
export function buildVesuRepayCalls({
  market,
  owner,
  intent,
}: {
  market: VesuBorrowMarket;
  owner: string;
  intent: RepayIntent;
}): Call[] {
  validateVesuBorrowMarket(
    market,
  );

  if (
    intent.privacy !==
      undefined &&
    intent.privacy !==
      "public"
  ) {
    throw new Error(
      "Direct private Vesu repayment is not enabled in this adapter.",
    );
  }

  if (
    intent.assetId !==
    market.debtAsset.id
  ) {
    throw new Error(
      "Repay intent does not match the reviewed Vesu debt asset.",
    );
  }

  if (
    intent.positionId &&
    intent.positionId !==
      market.id
  ) {
    throw new Error(
      "Repay intent does not match the reviewed Vesu position.",
    );
  }

  if (intent.amount <= 0n) {
    throw new Error(
      "Repay amount must be greater than zero.",
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
      0n,
    );

  const debt =
    encodeVesuAssetAmount(
      -intent.amount,
    );

  return [
    {
      contractAddress:
        debtToken,

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
 * Validates server-prepared partial Repay calls by rebuilding them locally.
 *
 * Only exact USDC approval + exact Vesu modify_position calldata survive.
 */
export function validateVesuRepayCalls({
  calls,
  market,
  owner,
  intent,
}: {
  calls: readonly Call[];
  market: VesuBorrowMarket;
  owner: string;
  intent: RepayIntent;
}): Call[] {
  if (calls.length !== 2) {
    throw new Error(
      "CAREL requires exactly two Vesu Repay calls.",
    );
  }

  const expected =
    buildVesuRepayCalls({
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
        "CAREL blocked a mismatched Vesu Repay call.",
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
        "CAREL blocked malformed Vesu Repay calldata.",
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
          "CAREL blocked altered Vesu Repay calldata.",
        );
      }
    }
  }

  return expected;
}


export type VesuCloseExecutionPayload =
  Readonly<{
    chainId: string;
    poolId: string;
    poolAddress: string;

    owner: string;

    collateralAssetId: string;
    debtAssetId: string;

    collateralShares: string;
    nominalDebt: string;

    debtSnapshot: string;
    approvalCap: string;

    preparedAt: number;
    expiresAt: number;

    calls: readonly Call[];
  }>;

/**
 * Builds the atomic Vesu Close Position multicall:
 *
 * 1. approve a bounded USDC allowance,
 * 2. repay all nominal debt and withdraw all collateral shares using Native
 *    denomination,
 * 3. reset the pool allowance to zero.
 *
 * The approval cap is not the amount necessarily spent. Vesu settles only
 * the block-current debt computed from nominal debt.
 */
export function buildVesuClosePositionCalls({
  market,
  owner,
  collateralShares,
  nominalDebt,
  approvalCap,
}: {
  market: VesuBorrowMarket;
  owner: string;
  collateralShares: bigint;
  nominalDebt: bigint;
  approvalCap: bigint;
}): Call[] {
  validateVesuBorrowMarket(
    market,
  );

  if (
    collateralShares <= 0n ||
    nominalDebt <= 0n ||
    approvalCap <= 0n
  ) {
    throw new Error(
      "Vesu Close Position requires positive collateral shares, nominal debt, and approval cap.",
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

  const approveCap =
    toUint256Calldata(
      approvalCap,
    );

  const approveZero =
    toUint256Calldata(
      0n,
    );

  const collateral =
    encodeVesuNativeAmount(
      -collateralShares,
    );

  const debt =
    encodeVesuNativeAmount(
      -nominalDebt,
    );

  return [
    {
      contractAddress:
        debtToken,

      entrypoint:
        "approve",

      calldata: [
        pool,
        ...approveCap,
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

    {
      contractAddress:
        debtToken,

      entrypoint:
        "approve",

      calldata: [
        pool,
        ...approveZero,
      ],
    },
  ];
}

/**
 * Rebuilds and verifies the complete Close Position multicall locally.
 *
 * Raw server calls are never executed directly.
 */
export function validateVesuClosePositionCalls({
  calls,
  market,
  owner,
  collateralShares,
  nominalDebt,
  approvalCap,
}: {
  calls: readonly Call[];
  market: VesuBorrowMarket;
  owner: string;
  collateralShares: bigint;
  nominalDebt: bigint;
  approvalCap: bigint;
}): Call[] {
  if (calls.length !== 3) {
    throw new Error(
      "CAREL requires exactly three Vesu Close Position calls.",
    );
  }

  const expected =
    buildVesuClosePositionCalls({
      market,
      owner,
      collateralShares,
      nominalDebt,
      approvalCap,
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
        "CAREL blocked a mismatched Vesu Close Position call.",
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
        "CAREL blocked malformed Vesu Close Position calldata.",
      );
    }

    const addressIndexes =
      callIndex === 1
        ? new Set([
            0,
            1,
            2,
          ])
        : new Set([0]);

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
          "CAREL blocked altered Vesu Close Position calldata.",
        );
      }
    }
  }

  return expected;
}
