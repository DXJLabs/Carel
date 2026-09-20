import type {
  Call,
} from "starknet";

import type {
  AssetRef,
} from "@/lib/carel/core/assets";

import {
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  STARKNET_MAINNET_ETH,
  STARKNET_MAINNET_STRK,
  STARKNET_MAINNET_STRKBTC,
  STARKNET_MAINNET_USDC,
  STARKNET_MAINNET_USDT,
  STARKNET_MAINNET_WBTC,
} from "@/lib/carel/ecosystems/starknet/assets";

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


export const VESU_LEND_ASSETS:
  readonly AssetRef[] = [
    STARKNET_MAINNET_STRK,
    STARKNET_MAINNET_USDC,
    STARKNET_MAINNET_ETH,
    STARKNET_MAINNET_USDT,
    STARKNET_MAINNET_WBTC,
    STARKNET_MAINNET_STRKBTC,
  ];


export type VesuLendPair =
  Readonly<{
    asset: AssetRef;
    counterpart: AssetRef;
  }>;


export function getVesuLendAsset(
  assetId: string,
): AssetRef | null {
  return (
    VESU_LEND_ASSETS.find(
      (asset) =>
        asset.id === assetId,
    ) ?? null
  );
}


export function getVesuLendAssetBySymbol(
  symbol: string,
): AssetRef | null {
  const normalized =
    symbol
      .trim()
      .toLowerCase();

  return (
    VESU_LEND_ASSETS.find(
      (asset) =>
        asset.symbol
          .toLowerCase() ===
        normalized,
    ) ?? null
  );
}


export function getVesuLendPair(
  assetId: string,
  counterpartAssetId: string,
): VesuLendPair | null {
  if (
    assetId ===
    counterpartAssetId
  ) {
    return null;
  }

  const asset =
    getVesuLendAsset(
      assetId,
    );

  const counterpart =
    getVesuLendAsset(
      counterpartAssetId,
    );

  if (
    !asset ||
    !counterpart
  ) {
    return null;
  }

  return {
    asset,
    counterpart,
  };
}


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

  if (
    parsed <= 0n
  ) {
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
 * Vesu supply:
 * exact ERC20 approval + positive collateral delta + zero debt.
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
