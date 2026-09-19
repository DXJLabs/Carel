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

  const [
    low,
    high,
  ] =
    toUint256Calldata(
      value,
    );

  return [
    "1",
    low,
    high,
    "0",
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
