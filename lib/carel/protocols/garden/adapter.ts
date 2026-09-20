import type {
  BridgeIntent,
  ExecutionAdapter,
  ExecutionCapability,
  ExecutionContext,
  ExecutionIntent,
  ExecutionReceipt,
} from "@/lib/carel/core/execution";

import {
  BITCOIN_TESTNET4_BTC,
} from "@/lib/carel/ecosystems/bitcoin/assets";

import {
  STARKNET_SEPOLIA,
} from "@/lib/carel/ecosystems/starknet/chains";

import {
  GARDEN_STARKNET_SEPOLIA_STRKBTC,
  GARDEN_STARKNET_SEPOLIA_WBTC,
  gardenProviderAssetId,
  getGardenBridgeAsset,
} from "./assets";

export const GARDEN_BRIDGE_ADAPTER_ID =
  "crosschain:garden:bridge";

const MAX_BITCOIN_ATOMIC =
  21_000_000n *
  100_000_000n;

export type GardenBridgeRoute =
  Readonly<{
    direction:
      | "to-starknet"
      | "to-bitcoin";

    sourceAssetId: string;
    destinationAssetId: string;
  }>;

export type GardenBridgeExecutorResult =
  Readonly<
    Pick<
      ExecutionReceipt,
      | "transactionId"
      | "status"
    >
  >;

export type GardenBridgeExecutor =
  (
    intent: BridgeIntent,
    context: ExecutionContext,
    route: GardenBridgeRoute,
  ) =>
    Promise<GardenBridgeExecutorResult>;

function isGardenStarknetBitcoinAsset(
  assetId: string,
): boolean {
  return (
    assetId ===
      GARDEN_STARKNET_SEPOLIA_WBTC.id ||
    assetId ===
      GARDEN_STARKNET_SEPOLIA_STRKBTC.id
  );
}

/**
 * Matches CAREL's current Garden Testnet4 <-> Starknet Sepolia routes.
 *
 * The connected wallet remains Starknet because it supplies the Sepolia
 * recipient/funding account. Bitcoin address collection remains part of the
 * existing Garden workflow.
 */
export function supportsGardenBridgeIntent(
  intent: ExecutionIntent,
  context: ExecutionContext,
): intent is BridgeIntent {
  if (
    intent.action !==
    "bridge"
  ) {
    return false;
  }

  if (
    context.chainId !==
      STARKNET_SEPOLIA.chainId ||
    !context.account?.trim()
  ) {
    return false;
  }

  if (
    intent.privacy !==
      undefined &&
    intent.privacy !==
      "public"
  ) {
    return false;
  }

  if (
    intent.amount <= 0n ||
    intent.amount >
      MAX_BITCOIN_ATOMIC ||
    intent.fromAssetId ===
      intent.toAssetId
  ) {
    return false;
  }

  const toStarknet =
    intent.fromAssetId ===
      BITCOIN_TESTNET4_BTC.id &&
    isGardenStarknetBitcoinAsset(
      intent.toAssetId,
    );

  const toBitcoin =
    isGardenStarknetBitcoinAsset(
      intent.fromAssetId,
    ) &&
    intent.toAssetId ===
      BITCOIN_TESTNET4_BTC.id;

  return (
    toStarknet ||
    toBitcoin
  );
}

/**
 * Converts CAREL asset ids into Garden's live-catalog route ids.
 *
 * This does not resolve token contracts. The existing Garden catalogue parser
 * still verifies those addresses, schemas, limits and HTLCs at execution time.
 */
export function resolveGardenBridgeRoute(
  intent: BridgeIntent,
): GardenBridgeRoute {
  const source =
    getGardenBridgeAsset(
      intent.fromAssetId,
    );

  const destination =
    getGardenBridgeAsset(
      intent.toAssetId,
    );

  if (
    !source ||
    !destination
  ) {
    throw new Error(
      "Garden does not recognize this CAREL bridge asset pair.",
    );
  }

  const sourceAssetId =
    gardenProviderAssetId(
      source,
    );

  const destinationAssetId =
    gardenProviderAssetId(
      destination,
    );

  if (
    !sourceAssetId ||
    !destinationAssetId
  ) {
    throw new Error(
      "Garden could not resolve the reviewed bridge assets.",
    );
  }

  return {
    direction:
      source.id ===
        BITCOIN_TESTNET4_BTC.id
        ? "to-starknet"
        : "to-bitcoin",

    sourceAssetId,
    destinationAssetId,
  };
}

/**
 * Registers Garden as CAREL's first genuinely multi-ecosystem adapter.
 *
 * The injected executor continues to own quote retrieval, Bitcoin address
 * validation, order creation/recovery, funding-call validation and refunds.
 */
export const GARDEN_BRIDGE_CAPABILITY:
  ExecutionCapability = {
    id:
      GARDEN_BRIDGE_ADAPTER_ID,

    ecosystems: [
      "bitcoin",
      "starknet",
    ],

    actions:
      ["bridge"],

    supports(
      intent,
      context,
    ) {
      return supportsGardenBridgeIntent(
        intent,
        context,
      );
    },
  };

export function createGardenBridgeExecutionAdapter(
  executeBridge:
    GardenBridgeExecutor,
): ExecutionAdapter {
  return {
    id:
      GARDEN_BRIDGE_ADAPTER_ID,

    ecosystems: [
      "bitcoin",
      "starknet",
    ],

    actions:
      ["bridge"],

    supports(
      intent,
      context,
    ) {
      return supportsGardenBridgeIntent(
        intent,
        context,
      );
    },

    async execute(
      intent,
      context,
    ) {
      if (
        !supportsGardenBridgeIntent(
          intent,
          context,
        )
      ) {
        throw new Error(
          "This Garden adapter does not support the requested CAREL execution.",
        );
      }

      const route =
        resolveGardenBridgeRoute(
          intent,
        );

      const result =
        await executeBridge(
          intent,
          context,
          route,
        );

      return {
        adapterId:
          GARDEN_BRIDGE_ADAPTER_ID,

        provider:
          "Garden",

        transactionId:
          result.transactionId,

        status:
          result.status,
      };
    },
  };
}
