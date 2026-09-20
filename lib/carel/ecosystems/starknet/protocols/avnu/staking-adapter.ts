import type {
  ExecutionAdapter,
  ExecutionCapability,
  ExecutionContext,
  ExecutionIntent,
  ExecutionReceipt,
  StakeIntent,
} from "@/lib/carel/core/execution";

import {
  STARKNET_MAINNET_STRK,
} from "@/lib/carel/ecosystems/starknet/assets";

import {
  STARKNET_MAINNET,
} from "@/lib/carel/ecosystems/starknet/chains";

export const AVNU_STAKING_ADAPTER_ID =
  "starknet:avnu:staking";

export type AvnuStakeExecutorResult =
  Readonly<
    Pick<
      ExecutionReceipt,
      | "transactionId"
      | "status"
    >
  >;

export type AvnuStakeExecutor =
  (
    intent: StakeIntent,
    context: ExecutionContext,
  ) =>
    Promise<AvnuStakeExecutorResult>;

/**
 * Matches CAREL's current public Starknet Mainnet delegation staking route.
 *
 * Pool discovery, token verification, and wallet execution remain inside the
 * existing staking flow.
 */
export function supportsAvnuStakeIntent(
  intent: ExecutionIntent,
  context: ExecutionContext,
): intent is StakeIntent {
  if (
    intent.action !==
    "stake"
  ) {
    return false;
  }

  if (
    context.chainId !==
      STARKNET_MAINNET.chainId ||
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
    intent.assetId !==
      STARKNET_MAINNET_STRK.id ||
    intent.amount <= 0n
  ) {
    return false;
  }

  // Public delegation staking creates a protocol position rather than a
  // distinct receipt token, so a target asset must not be supplied.
  return (
    intent.targetAssetId ===
    undefined
  );
}

/**
 * Registers AVNU public staking behind CAREL's generic execution interface.
 */
export const AVNU_STAKING_CAPABILITY:
  ExecutionCapability = {
    id:
      AVNU_STAKING_ADAPTER_ID,

    ecosystems:
      ["starknet"],

    actions:
      ["stake"],

    supports(
      intent,
      context,
    ) {
      return supportsAvnuStakeIntent(
        intent,
        context,
      );
    },
  };

export function createAvnuStakingExecutionAdapter(
  executeStake:
    AvnuStakeExecutor,
): ExecutionAdapter {
  return {
    id:
      AVNU_STAKING_ADAPTER_ID,

    ecosystems:
      ["starknet"],

    actions:
      ["stake"],

    supports(
      intent,
      context,
    ) {
      return supportsAvnuStakeIntent(
        intent,
        context,
      );
    },

    async execute(
      intent,
      context,
    ) {
      if (
        !supportsAvnuStakeIntent(
          intent,
          context,
        )
      ) {
        throw new Error(
          "This AVNU staking adapter does not support the requested CAREL execution.",
        );
      }

      const result =
        await executeStake(
          intent,
          context,
        );

      return {
        adapterId:
          AVNU_STAKING_ADAPTER_ID,

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
