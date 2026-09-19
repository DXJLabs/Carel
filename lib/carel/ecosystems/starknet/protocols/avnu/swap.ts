import {
  getQuotes,
  type Quote,
} from "@avnu/avnu-sdk";

import {
  assetAddress,
  type AssetRef,
} from "@/lib/carel/core/assets";

import {
  validateDistinctAssets,
  validatePositiveAmount,
} from "@/lib/carel/core/validation";

import {
  sameStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";

export type AvnuSwapMode =
  | "normal"
  | "shield"
  | "unshield";

export type AvnuSwapNetwork = Readonly<{
  chainId: string;
  label: string;
  avnuBaseUrl: string;
}>;

export type AvnuSwapExecutor = Readonly<{
  executeSwap: (
    quote: Quote,
    sellToken: string,
    buyToken: string,
    label: string,
  ) => Promise<string>;

  executeShieldSwap: (
    quote: Quote,
    sellToken: string,
    buyToken: string,
    label: string,
  ) => Promise<string>;

  executeUnshieldSwapStart: (
    quote: Quote,
    sellToken: string,
    buyToken: string,
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

export type AvnuPendingUnshield =
  Readonly<{
    hash: string;
    privateBuyBefore: bigint;
    minExpected: bigint;
    maturityTarget: number;
  }>;

export type AvnuSwapExecutionResult =
  | Readonly<{
      kind: "completed";
      hash: string;
    }>
  | Readonly<{
      kind: "unshield-pending";
      stage: AvnuPendingUnshield;
    }>;

const DEFAULT_MAX_PRICE_IMPACT_BPS =
  500;

const DEFAULT_SLIPPAGE_BPS =
  50;

/**
 * Resolves the Starknet contract address required by AVNU.
 * Native/mint identifiers are rejected because the Starknet AVNU
 * adapter currently operates on contract-address assets.
 */
export function requireAvnuTokenAddress(
  asset: AssetRef,
): string {
  if (
    asset.chain.ecosystem !==
    "starknet"
  ) {
    throw new Error(
      `AVNU Starknet adapter cannot use ${asset.id}.`,
    );
  }

  const address =
    assetAddress(asset);

  if (!address) {
    throw new Error(
      `${asset.symbol} does not expose a Starknet token contract.`,
    );
  }

  return address;
}

/**
 * Validates a CAREL swap pair before any request reaches AVNU.
 * Asset identity, chain identity, and positive amount are checked here
 * instead of inside the React component.
 */
export function validateAvnuSwapRoute(
  network: AvnuSwapNetwork,
  fromAsset: AssetRef,
  toAsset: AssetRef,
  sellAmount: bigint,
): void {
  const amount =
    validatePositiveAmount(
      sellAmount,
    );

  if (!amount.ok) {
    throw new Error(
      amount.issues[0]?.message ??
        "Swap amount is invalid.",
    );
  }

  const pair =
    validateDistinctAssets(
      fromAsset.id,
      toAsset.id,
    );

  if (!pair.ok) {
    throw new Error(
      pair.issues[0]?.message ??
        "Swap assets are invalid.",
    );
  }

  if (
    fromAsset.chain.id !==
      toAsset.chain.id ||
    fromAsset.chain.chainId !==
      network.chainId
  ) {
    throw new Error(
      "Both swap assets must belong to the connected Starknet network.",
    );
  }
}

/**
 * Requests and verifies an AVNU quote for arbitrary registered
 * Starknet assets. The UI only supplies CAREL AssetRef objects.
 */
export async function getAvnuSwapQuote({
  network,
  fromAsset,
  toAsset,
  sellAmount,
  takerAddress,
  privateRoute = false,
  maxPriceImpactBps =
    DEFAULT_MAX_PRICE_IMPACT_BPS,
}: {
  network: AvnuSwapNetwork;
  fromAsset: AssetRef;
  toAsset: AssetRef;
  sellAmount: bigint;
  takerAddress: string;
  privateRoute?: boolean;
  maxPriceImpactBps?: number;
}): Promise<Quote> {
  validateAvnuSwapRoute(
    network,
    fromAsset,
    toAsset,
    sellAmount,
  );

  const sellToken =
    requireAvnuTokenAddress(
      fromAsset,
    );

  const buyToken =
    requireAvnuTokenAddress(
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
        ...(privateRoute
          ? {}
          : {
              takerAddress,
            }),
        size: 1,
      },
      {
        baseUrl:
          network.avnuBaseUrl,
      },
    );

  const quote =
    quotes[0];

  if (!quote) {
    throw new Error(
      `No AVNU ${fromAsset.symbol} → ${toAsset.symbol} route is available on ${network.label} right now.`,
    );
  }

  if (
    quote.chainId !==
    network.chainId
  ) {
    throw new Error(
      "AVNU returned a quote for the wrong network.",
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
      "AVNU returned a quote for a different asset pair.",
    );
  }

  if (
    quote.sellAmount !==
      sellAmount ||
    quote.buyAmount <= 0n
  ) {
    throw new Error(
      "AVNU returned a quote with an unexpected amount.",
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

/**
 * Executes a reviewed AVNU quote through the wallet executor.
 * Public, Shield, and first-step Unshield execution share one route API.
 */
export async function executeSwapRoute({
  mode,
  quote,
  fromAsset,
  toAsset,
  amountLabel,
  executor,
}: {
  mode: AvnuSwapMode;
  quote: Quote;
  fromAsset: AssetRef;
  toAsset: AssetRef;
  amountLabel: string;
  executor: AvnuSwapExecutor;
}): Promise<AvnuSwapExecutionResult> {
  const sellToken =
    requireAvnuTokenAddress(
      fromAsset,
    );

  const buyToken =
    requireAvnuTokenAddress(
      toAsset,
    );

  if (mode === "shield") {
    const hash =
      await executor
        .executeShieldSwap(
          quote,
          sellToken,
          buyToken,
          `Shield Swap ${amountLabel} ${fromAsset.symbol} → private ${toAsset.symbol}`,
        );

    return {
      kind: "completed",
      hash,
    };
  }

  if (mode === "unshield") {
    const minExpected =
      quote.buyAmount -
      (
        quote.buyAmount *
        BigInt(
          DEFAULT_SLIPPAGE_BPS,
        )
      ) /
        10_000n;

    const stage =
      await executor
        .executeUnshieldSwapStart(
          quote,
          sellToken,
          buyToken,
          `Unshield Swap · private ${fromAsset.symbol} → private ${toAsset.symbol}`,
        );

    return {
      kind:
        "unshield-pending",
      stage: {
        ...stage,
        minExpected,
      },
    };
  }

  const hash =
    await executor.executeSwap(
      quote,
      sellToken,
      buyToken,
      `Swap ${amountLabel} ${fromAsset.symbol} → ${toAsset.symbol}`,
    );

  return {
    kind: "completed",
    hash,
  };
}

/**
 * Completes the public withdrawal phase of an Unshield Swap.
 * Only the reviewed minimum output is delegated to the wallet executor.
 */
export async function completeUnshieldSwapRoute({
  executor,
  toAsset,
  stage,
  amountLabel,
  fromSymbol,
}: {
  executor: AvnuSwapExecutor;
  toAsset: AssetRef;
  stage: AvnuPendingUnshield;
  amountLabel: string;
  fromSymbol: string;
}): Promise<{
  hash: string;
  amount: bigint;
}> {
  const buyToken =
    requireAvnuTokenAddress(
      toAsset,
    );

  return executor
    .completeUnshieldSwap(
      buyToken,
      stage.privateBuyBefore,
      stage.minExpected,
      stage.maturityTarget,
      `Unshield Swap ${amountLabel} ${fromSymbol} → public ${toAsset.symbol}`,
    );
}
