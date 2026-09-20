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

    vTokenAddress: string;

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
 * Public Vesu lending through its ERC-4626 vToken.
 *
 * underlying ERC20
 *   -> exact approval to vToken
 *   -> vToken.deposit(assets, owner)
 *   -> public vToken shares
 *
 * This intentionally matches the vault model used by Shield Lend.
 */
export function buildVesuLendCalls({
  market,
  owner,
  intent,
  vTokenAddress,
}: {
  market: VesuBorrowMarket;
  owner: string;
  intent: VesuLendIntent;
  vTokenAddress: string;
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

  const account =
    normalizeStarknetAddress(
      owner,
    );

  const asset =
    requireVesuAssetAddress(
      market.collateralAsset,
    );

  const vToken =
    normalizeStarknetAddress(
      vTokenAddress,
    );

  if (
    BigInt(vToken) === 0n ||
    vToken === asset
  ) {
    throw new Error(
      "Invalid Vesu vToken for this Lend.",
    );
  }

  const amount =
    toUint256Calldata(
      intent.amount,
    );

  return [
    {
      contractAddress:
        asset,

      entrypoint:
        "approve",

      calldata: [
        vToken,
        ...amount,
      ],
    },

    {
      contractAddress:
        vToken,

      entrypoint:
        "deposit",

      calldata: [
        ...amount,
        account,
      ],
    },
  ];
}


export function validateVesuLendCalls({
  calls,
  market,
  owner,
  intent,
  vTokenAddress,
}: {
  calls: readonly Call[];
  market: VesuBorrowMarket;
  owner: string;
  intent: VesuLendIntent;
  vTokenAddress: string;
}): Call[] {
  const expected =
    buildVesuLendCalls({
      market,
      owner,
      intent,
      vTokenAddress,
    });

  return validateVesuCallSequence({
    calls,
    expected,

    label:
      "Lend",

    specs: [
      {
        // approve(vToken, amount)
        addressIndexes:
          [0],
      },
      {
        // deposit(amount, receiver)
        addressIndexes:
          [2],
      },
    ],
  });
}
