import {
  assetAddress,
} from "@/lib/carel/core/assets";

import type {
  ExecutionAdapter,
  ExecutionCapability,
  ExecutionContext,
  ExecutionIntent,
  ExecutionReceipt,
  SwapIntent,
} from "@/lib/carel/core/execution";

import {
  getStarknetAsset,
} from "@/lib/carel/ecosystems/starknet/assets";

import {
  getStarknetChain,
} from "@/lib/carel/ecosystems/starknet/chains";

export const AVNU_SWAP_ADAPTER_ID =
  "starknet:avnu:swap";

export type AvnuSwapExecutorResult =
  Readonly<
    Pick<
      ExecutionReceipt,
      | "transactionId"
      | "status"
    >
  >;

export type AvnuSwapExecutor =
  (
    intent: SwapIntent,
    context: ExecutionContext,
  ) =>
    Promise<AvnuSwapExecutorResult>;

/**
 * Checks whether the generic CAREL Swap intent can use AVNU's current
 * public Starknet execution path.
 *
 * Quote availability, price impact, AVNU build output, and wallet calldata
 * remain verified later by the existing AVNU flow.
 */
export function supportsAvnuSwapIntent(
  intent: ExecutionIntent,
  context: ExecutionContext,
): intent is SwapIntent {
  if (
    intent.action !==
    "swap"
  ) {
    return false;
  }

  if (
    !context.chainId ||
    !context.account?.trim()
  ) {
    return false;
  }

  const chain =
    getStarknetChain(
      context.chainId,
    );

  if (!chain) {
    return false;
  }

  // Shield/Unshield Swap has additional direction/state semantics and stays
  // on CAREL's existing explicit privacy flow until the generic intent model
  // represents that direction without ambiguity.
  if (
    intent.privacy !==
      undefined &&
    intent.privacy !==
      "public"
  ) {
    return false;
  }

  if (
    intent.amount <=
    0n ||
    intent.fromAssetId ===
      intent.toAssetId
  ) {
    return false;
  }

  const fromAsset =
    getStarknetAsset(
      intent.fromAssetId,
    );

  const toAsset =
    getStarknetAsset(
      intent.toAssetId,
    );

  if (
    !fromAsset ||
    !toAsset ||
    fromAsset.chain.id !==
      chain.id ||
    toAsset.chain.id !==
      chain.id
  ) {
    return false;
  }

  // The current AVNU Starknet adapter requires ERC20 contract-address assets.
  return (
    assetAddress(
      fromAsset,
    ) !== null &&
    assetAddress(
      toAsset,
    ) !== null
  );
}

/**
 * Registers CAREL's existing guarded AVNU public Swap path behind the generic
 * execution interface.
 *
 * The injected executor keeps ownership of:
 * - fresh AVNU quote retrieval,
 * - price-impact checks,
 * - AVNU transaction building,
 * - wallet-side built-call validation,
 * - session/network re-checks,
 * - signing/submission.
 */
export const AVNU_SWAP_CAPABILITY:
  ExecutionCapability = {
    id:
      AVNU_SWAP_ADAPTER_ID,

    ecosystems:
      ["starknet"],

    actions:
      ["swap"],

    supports(
      intent,
      context,
    ) {
      return supportsAvnuSwapIntent(
        intent,
        context,
      );
    },
  };

export function createAvnuSwapExecutionAdapter(
  executeSwap:
    AvnuSwapExecutor,
): ExecutionAdapter {
  return {
    id:
      AVNU_SWAP_ADAPTER_ID,

    ecosystems:
      ["starknet"],

    actions:
      ["swap"],

    supports(
      intent,
      context,
    ) {
      return supportsAvnuSwapIntent(
        intent,
        context,
      );
    },

    async execute(
      intent,
      context,
    ) {
      if (
        !supportsAvnuSwapIntent(
          intent,
          context,
        )
      ) {
        throw new Error(
          "This AVNU adapter does not support the requested CAREL execution.",
        );
      }

      const result =
        await executeSwap(
          intent,
          context,
        );

      return {
        adapterId:
          AVNU_SWAP_ADAPTER_ID,

        provider:
          "AVNU",

        transactionId:
          result.transactionId,

        status:
          result.status,
      };
    },
  };
}
