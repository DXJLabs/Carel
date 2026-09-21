import {
  getQuotes,
  type Quote,
} from "@avnu/avnu-sdk";

import type {
  AssetRef,
} from "@/lib/carel/core/assets";

import {
  formatUnits,
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  assetAddress,
} from "@/lib/carel/core/assets";

import {
  sameStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";

export type StakingPool =
  Readonly<{
    poolAddress: string;
    tokenAddress: string;
    stakedAmount: bigint;
    apr: number;
  }>;

export type StakingPosition =
  Readonly<{
    amount: bigint;
    unclaimedRewards: bigint;
    unpoolAmount: bigint;
    unpoolTime: number | null;
  }>;

export type EndurShieldConfig =
  Readonly<{
    inputToken: string;
    outputToken: string;
    anonymizer: string;
    feeAmount: bigint;
  }>;

function objectValue(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      `Provider returned invalid ${label} data.`,
    );
  }

  return value as Record<
    string,
    unknown
  >;
}

function stringValue(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== "string" ||
    !value.length
  ) {
    throw new Error(
      `Provider returned an invalid ${label}.`,
    );
  }

  return value;
}

function bigintValue(
  value: unknown,
  label: string,
): bigint {
  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    throw new Error(
      `Provider returned an invalid ${label}.`,
    );
  }

  const raw =
    String(value);

  if (
    !/^(?:0x[0-9a-f]+|\d+)$/i.test(
      raw,
    )
  ) {
    throw new Error(
      `Provider returned malformed ${label}.`,
    );
  }

  return BigInt(raw);
}

function numberValue(
  value: unknown,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new Error(
      `Provider returned an invalid ${label}.`,
    );
  }

  return value;
}

function timestampValue(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  try {
    return (
      Number(
        bigintValue(
          value,
          "unstake time",
        ),
      ) * 1000
    );
  } catch {
    return null;
  }
}

/**
 * Resolves the Starknet contract address required by the staking adapter.
 */
export function requireStakingAssetAddress(
  asset: AssetRef,
): string {
  if (
    asset.chain.ecosystem !==
    "starknet"
  ) {
    throw new Error(
      `${asset.id} is not a Starknet staking asset.`,
    );
  }

  const address =
    assetAddress(asset);

  if (!address) {
    throw new Error(
      `${asset.id} does not expose a Starknet contract address.`,
    );
  }

  return address;
}

/**
 * Loads the official AVNU delegation pool matching a registered CAREL asset.
 */
export async function loadStakingPool(
  baseUrl: string,
  stakeAsset: AssetRef,
): Promise<StakingPool> {
  const expectedToken =
    requireStakingAssetAddress(
      stakeAsset,
    );

  const response =
    await fetch(
      `${baseUrl}/staking/v3`,
      {
        headers: {
          Accept:
            "application/json",
        },
        cache: "no-store",
      },
    );

  if (!response.ok) {
    throw new Error(
      `AVNU staking API returned ${response.status}.`,
    );
  }

  const raw =
    objectValue(
      await response.json(),
      "staking",
    );

  if (
    !Array.isArray(
      raw.delegationPools,
    )
  ) {
    throw new Error(
      "AVNU returned no staking pools.",
    );
  }

  for (
    const candidate
    of raw.delegationPools
  ) {
    const row =
      objectValue(
        candidate,
        "staking pool",
      );

    const poolAddress =
      stringValue(
        row.poolAddress,
        "pool address",
      );

    const tokenAddress =
      stringValue(
        row.tokenAddress,
        "staking token",
      );

    if (
      !sameStarknetAddress(
        tokenAddress,
        expectedToken,
      )
    ) {
      continue;
    }

    return {
      poolAddress,
      tokenAddress,
      stakedAmount:
        bigintValue(
          row.stakedAmount,
          "pool stake",
        ),
      apr:
        numberValue(
          row.apr,
          "staking APR",
        ),
    };
  }

  throw new Error(
    `AVNU returned no ${stakeAsset.symbol} staking pool.`,
  );
}

/**
 * Loads and verifies one public staking position against its reviewed pool,
 * owner, and registered staking asset.
 */
export async function loadStakingPosition(
  baseUrl: string,
  pool: StakingPool,
  owner: string,
  stakeAsset: AssetRef,
): Promise<StakingPosition | null> {
  const expectedToken =
    requireStakingAssetAddress(
      stakeAsset,
    );

  const response =
    await fetch(
      `${baseUrl}/staking/v3/pools/${encodeURIComponent(
        pool.poolAddress,
      )}/members/${encodeURIComponent(
        owner,
      )}`,
      {
        headers: {
          Accept:
            "application/json",
        },
        cache: "no-store",
      },
    );

  if (
    response.status === 404
  ) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `AVNU staking position returned ${response.status}.`,
    );
  }

  const row =
    objectValue(
      await response.json(),
      "staking position",
    );

  if (
    !sameStarknetAddress(
      stringValue(
        row.poolAddress,
        "position pool",
      ),
      pool.poolAddress,
    ) ||
    !sameStarknetAddress(
      stringValue(
        row.userAddress,
        "position owner",
      ),
      owner,
    ) ||
    !sameStarknetAddress(
      stringValue(
        row.tokenAddress,
        "position token",
      ),
      expectedToken,
    )
  ) {
    throw new Error(
      "AVNU returned staking data for a different account, pool, or asset.",
    );
  }

  return {
    amount:
      bigintValue(
        row.amount,
        "staked amount",
      ),
    unclaimedRewards:
      bigintValue(
        row.unclaimedRewards,
        "staking rewards",
      ),
    unpoolAmount:
      bigintValue(
        row.unpoolAmount ??
          "0",
        "pending unstake amount",
      ),
    unpoolTime:
      timestampValue(
        row.unpoolTime,
      ),
  };
}

/**
 * Loads CAREL's server-verified Endur Shield Staking configuration.
 * The response is checked against the registered input/output assets.
 */
export async function loadEndurShieldConfig({
  inputAsset,
  outputAsset,
  expectedAnonymizer,
}: {
  inputAsset: AssetRef;
  outputAsset: AssetRef;
  expectedAnonymizer: string;
}): Promise<EndurShieldConfig> {
  const response =
    await fetch(
      "/api/staking",
      {
        cache: "no-store",
      },
    );

  const raw: unknown =
    await response.json();

  const payload =
    objectValue(
      raw,
      "Shield Staking config",
    );

  if (!response.ok) {
    throw new Error(
      typeof payload.error ===
        "string"
        ? payload.error
        : "Could not load Shield Staking configuration.",
    );
  }

  const shield =
    objectValue(
      payload.shield,
      "Shield Staking",
    );

  const inputToken =
    stringValue(
      shield.inputToken,
      "Shield input token",
    );

  const outputToken =
    stringValue(
      shield.outputToken,
      "Shield output token",
    );

  const anonymizer =
    stringValue(
      shield.anonymizer,
      "Endur anonymizer",
    );

  const expectedInput =
    requireStakingAssetAddress(
      inputAsset,
    );

  const expectedOutput =
    requireStakingAssetAddress(
      outputAsset,
    );

  if (
    !sameStarknetAddress(
      inputToken,
      expectedInput,
    ) ||
    !sameStarknetAddress(
      outputToken,
      expectedOutput,
    ) ||
    !sameStarknetAddress(
      anonymizer,
      expectedAnonymizer,
    )
  ) {
    throw new Error(
      "CAREL rejected mismatched Endur Shield Staking configuration.",
    );
  }

  const feeAmount =
    bigintValue(
      shield.feeAmount,
      "Shield Staking fee",
    );

  if (feeAmount <= 0n) {
    throw new Error(
      "Endur returned an invalid Shield Staking fee.",
    );
  }

  return {
    inputToken,
    outputToken,
    anonymizer,
    feeAmount,
  };
}

/**
 * Requests and verifies the xSTRK-to-STRK AVNU route used by
 * Unshield Staking before the reviewed output is withdrawn publicly.
 */
export async function getEndurUnshieldQuote({
  baseUrl,
  chainId,
  owner,
  fromAsset,
  toAsset,
  sellAmount,
  feeRecipient,
  maxPriceImpactBps = 500,
}: {
  baseUrl: string;
  chainId: string;
  owner: string;
  fromAsset: AssetRef;
  toAsset: AssetRef;
  sellAmount: bigint;
  feeRecipient: string;
  maxPriceImpactBps?: number;
}): Promise<Quote> {
  if (sellAmount <= 0n) {
    throw new Error(
      `Enter a positive ${fromAsset.symbol} amount.`,
    );
  }

  if (
    fromAsset.chain.id !==
      toAsset.chain.id ||
    fromAsset.chain.chainId !==
      chainId
  ) {
    throw new Error(
      "Unshield Staking assets must belong to the connected Starknet network.",
    );
  }

  const sellToken =
    requireStakingAssetAddress(
      fromAsset,
    );

  const buyToken =
    requireStakingAssetAddress(
      toAsset,
    );

  const quotes =
    await getQuotes(
      {
        sellTokenAddress:
          sellToken,
        buyTokenAddress:
          buyToken,
        sellAmount,
        takerAddress:
          owner,
        size: 1,
        integratorFees: 3n,
        integratorFeeRecipient:
          feeRecipient,
        integratorName:
          "Endur",
      },
      {
        baseUrl,
      },
    );

  const quote =
    quotes[0];

  if (!quote) {
    throw new Error(
      `No live AVNU ${fromAsset.symbol} → ${toAsset.symbol} route is available for this amount. Try a larger amount.`,
    );
  }

  if (
    quote.chainId !==
    chainId
  ) {
    throw new Error(
      "AVNU returned an Unshield route for the wrong network.",
    );
  }

  if (
    !sameStarknetAddress(
      quote.sellTokenAddress,
      sellToken,
    ) ||
    !sameStarknetAddress(
      quote.buyTokenAddress,
      buyToken,
    )
  ) {
    throw new Error(
      "AVNU returned a different Unshield Staking asset pair.",
    );
  }

  if (
    quote.sellAmount !==
      sellAmount ||
    quote.buyAmount <= 0n
  ) {
    throw new Error(
      "AVNU returned an unexpected Unshield amount.",
    );
  }

  if (
    !Number.isFinite(
      quote.priceImpact,
    ) ||
    Math.abs(
      quote.priceImpact,
    ) >
      maxPriceImpactBps
  ) {
    throw new Error(
      "CAREL blocked this route because its price impact exceeds 5%.",
    );
  }

  return quote;
}


export type StakingAction =
  | "stake"
  | "initiateUnstake"
  | "completeUnstake"
  | "claimRewards";

export type EndurUnshieldStage =
  Readonly<{
    privateBuyBefore: bigint;
    minExpected: bigint;
    maturityTarget: number;
    sellAmount: string;
  }>;

export type StakingExecutionResult =
  Readonly<{
    hash: string;
  }>;

export type EndurUnshieldCompleteResult =
  Readonly<{
    hash: string;
    amount: bigint;
  }>;

export type EndurStakingExecutor =
  Readonly<{
    executeStaking: (
      amount: string,
      poolAddress: string,
      tokenAddress: string,
      label: string,
    ) => Promise<string>;

    executeStakingAction: (
      action: StakingAction,
      amount: string | null,
      poolAddress: string,
      tokenAddress: string,
      label: string,
    ) => Promise<string>;

    executeShieldStaking: (
      amount: string,
      feeAmount: string,
      label: string,
    ) => Promise<string>;

    executeUnshieldSwapStart: (
      quote: Quote,
      expectedSellToken: string,
      expectedBuyToken: string,
      label: string,
    ) => Promise<{
      hash: string;
      privateBuyBefore: bigint;
      maturityTarget: number;
    }>;

    completeUnshieldSwap: (
      token: string,
      privateBuyBefore: bigint,
      minExpected: bigint,
      maturityTarget: number,
      label: string,
    ) => Promise<{
      hash: string;
      amount: bigint;
    }>;
  }>;

const STAKING_UINT128_LIMIT =
  1n << 128n;

const UNSHIELD_SLIPPAGE_BPS =
  50n;

/**
 * Parses and validates an amount before it reaches the legacy wallet
 * staking executor. Provider-specific 128-bit staking limits live here
 * instead of being duplicated in React components.
 */
export function parseStakingAmount(
  amount: string,
  asset: AssetRef,
): bigint {
  const parsed =
    parseUnits(
      amount,
      asset.decimals,
    );

  if (parsed <= 0n) {
    throw new Error(
      `${asset.symbol} amount must be greater than zero.`,
    );
  }

  if (
    parsed >=
    STAKING_UINT128_LIMIT
  ) {
    throw new Error(
      `${asset.symbol} amount exceeds the supported staking range.`,
    );
  }

  return parsed;
}

/**
 * Executes a normal public staking route after verifying the pool token
 * matches the registered CAREL asset.
 */
export async function executePublicStakingRoute({
  amount,
  pool,
  stakeAsset,
  executor,
}: {
  amount: string;
  pool: StakingPool;
  stakeAsset: AssetRef;
  executor:
    Pick<
      EndurStakingExecutor,
      "executeStaking"
    >;
}): Promise<StakingExecutionResult> {
  parseStakingAmount(
    amount,
    stakeAsset,
  );

  const expectedToken =
    requireStakingAssetAddress(
      stakeAsset,
    );

  if (
    !sameStarknetAddress(
      pool.tokenAddress,
      expectedToken,
    )
  ) {
    throw new Error(
      "CAREL rejected a staking pool for a different asset.",
    );
  }

  const hash =
    await executor.executeStaking(
      amount,
      pool.poolAddress,
      expectedToken,
      `Stake ${amount} ${stakeAsset.symbol}`,
    );

  return {
    hash,
  };
}

/**
 * Executes public staking position actions through one route API.
 * Initiate-unstake additionally validates the requested amount against
 * the currently reviewed position.
 */
export async function executeStakingPositionRoute({
  action,
  amount,
  pool,
  position,
  stakeAsset,
  executor,
}: {
  action:
    | "initiateUnstake"
    | "completeUnstake"
    | "claimRewards";
  amount: string | null;
  pool: StakingPool;
  position: StakingPosition | null;
  stakeAsset: AssetRef;
  executor: EndurStakingExecutor;
}): Promise<StakingExecutionResult> {
  const expectedToken =
    requireStakingAssetAddress(
      stakeAsset,
    );

  if (
    !sameStarknetAddress(
      pool.tokenAddress,
      expectedToken,
    )
  ) {
    throw new Error(
      "CAREL rejected a staking position for a different asset.",
    );
  }

  let actionAmount:
    string | null = null;

  if (
    action ===
    "initiateUnstake"
  ) {
    if (
      amount === null ||
      !position
    ) {
      throw new Error(
        "A current staking position is required before unstaking.",
      );
    }

    const parsed =
      parseStakingAmount(
        amount,
        stakeAsset,
      );

    if (
      parsed >
      position.amount
    ) {
      throw new Error(
        "Unstake amount cannot exceed the current staking position.",
      );
    }

    actionAmount =
      amount;
  }

  const label =
    action ===
      "initiateUnstake"
      ? `Unstake ${actionAmount} ${stakeAsset.symbol}`
      : action ===
          "completeUnstake"
        ? `Complete ${stakeAsset.symbol} unstake`
        : `Claim ${stakeAsset.symbol} staking rewards`;

  const hash =
    await executor
      .executeStakingAction(
        action,
        actionAmount,
        pool.poolAddress,
        expectedToken,
        label,
      );

  return {
    hash,
  };
}

/**
 * Executes Endur Shield Staking while keeping amount parsing, fee addition,
 * and execution labels out of the UI component.
 */
export async function executeEndurShieldStake({
  amount,
  feeAmount,
  stakeAsset,
  outputAsset,
  executor,
}: {
  amount: string;
  feeAmount: bigint;
  stakeAsset: AssetRef;
  outputAsset: AssetRef;
  executor:
    Pick<
      EndurStakingExecutor,
      "executeShieldStaking"
    >;
}): Promise<StakingExecutionResult> {
  const stakeAmount =
    parseStakingAmount(
      amount,
      stakeAsset,
    );

  if (feeAmount <= 0n) {
    throw new Error(
      "Endur privacy fee must be greater than zero.",
    );
  }

  requireStakingAssetAddress(
    outputAsset,
  );

  const totalRequired =
    stakeAmount +
    feeAmount;

  if (
    totalRequired >=
    STAKING_UINT128_LIMIT
  ) {
    throw new Error(
      "Shield Staking total exceeds the supported staking range.",
    );
  }

  const totalAmount =
    formatUnits(
      totalRequired,
      stakeAsset.decimals,
      stakeAsset.decimals,
    );

  const hash =
    await executor
      .executeShieldStaking(
        totalAmount,
        feeAmount.toString(),
        `Shield Stake ${amount} ${stakeAsset.symbol} → private ${outputAsset.symbol}`,
      );

  return {
    hash,
  };
}

/**
 * Executes the first private leg of Endur Unshield Staking and returns
 * the maturity data needed for the second public-withdrawal step.
 */
export async function executeEndurUnshieldStart({
  quote,
  amount,
  fromAsset,
  toAsset,
  executor,
}: {
  quote: Quote;
  amount: string;
  fromAsset: AssetRef;
  toAsset: AssetRef;
  executor: EndurStakingExecutor;
}): Promise<EndurUnshieldStage> {
  const sellToken =
    requireStakingAssetAddress(
      fromAsset,
    );

  const buyToken =
    requireStakingAssetAddress(
      toAsset,
    );

  if (
    !sameStarknetAddress(
      quote.sellTokenAddress,
      sellToken,
    ) ||
    !sameStarknetAddress(
      quote.buyTokenAddress,
      buyToken,
    )
  ) {
    throw new Error(
      "Reviewed Unshield Staking quote no longer matches the asset pair.",
    );
  }

  const minExpected =
    quote.buyAmount -
    (
      quote.buyAmount *
      UNSHIELD_SLIPPAGE_BPS
    ) /
      10_000n;

  const stage =
    await executor
      .executeUnshieldSwapStart(
        quote,
        sellToken,
        buyToken,
        `Unshield Staking · private ${amount} ${fromAsset.symbol} → private ${toAsset.symbol}`,
      );

  return {
    privateBuyBefore:
      stage.privateBuyBefore,
    minExpected,
    maturityTarget:
      stage.maturityTarget,
    sellAmount:
      amount,
  };
}

/**
 * Completes Endur Unshield Staking after maturity by withdrawing only
 * the reviewed minimum output to the public wallet.
 */
export async function completeEndurUnshieldStaking({
  stage,
  fromAsset,
  toAsset,
  executor,
}: {
  stage: EndurUnshieldStage;
  fromAsset: AssetRef;
  toAsset: AssetRef;
  executor: EndurStakingExecutor;
}): Promise<EndurUnshieldCompleteResult> {
  requireStakingAssetAddress(
    fromAsset,
  );

  const buyToken =
    requireStakingAssetAddress(
      toAsset,
    );

  return executor
    .completeUnshieldSwap(
      buyToken,
      stage.privateBuyBefore,
      stage.minExpected,
      stage.maturityTarget,
      `Unshield Staking ${stage.sellAmount} ${fromAsset.symbol} → public ${toAsset.symbol}`,
    );
}

export type {
  Quote,
};
