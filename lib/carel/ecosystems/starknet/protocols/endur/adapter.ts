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
  STARKNET_MAINNET_XSTRK,
} from "@/lib/carel/ecosystems/starknet/assets";

import {
  STARKNET_MAINNET,
} from "@/lib/carel/ecosystems/starknet/chains";

export const ENDUR_SHIELD_STAKING_ADAPTER_ID =
  "starknet:endur:shield-staking";

export type EndurShieldStakeExecutorResult =
  Readonly<
    Pick<
      ExecutionReceipt,
      | "transactionId"
      | "status"
    >
  >;

export type EndurShieldStakeExecutor =
  (
    intent: StakeIntent,
    context: ExecutionContext,
  ) =>
    Promise<EndurShieldStakeExecutorResult>;

/**
 * Matches the explicit STRK -> private xSTRK Endur route.
 *
 * The existing Endur flow still owns fee discovery, anonymizer validation,
 * STRK20 execution, and wallet session checks.
 */
export function supportsEndurShieldStakeIntent(
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
      "private"
  ) {
    return false;
  }

  return (
    intent.assetId ===
      STARKNET_MAINNET_STRK.id &&
    intent.targetAssetId ===
      STARKNET_MAINNET_XSTRK.id &&
    intent.amount > 0n
  );
}

/**
 * Registers the existing guarded Endur Shield Staking flow without moving
 * protocol-specific privacy logic into the Agent or generic core.
 */
export const ENDUR_SHIELD_STAKING_CAPABILITY:
  ExecutionCapability = {
    id:
      ENDUR_SHIELD_STAKING_ADAPTER_ID,

    ecosystems:
      ["starknet"],

    actions:
      ["stake"],

    supports(
      intent,
      context,
    ) {
      return supportsEndurShieldStakeIntent(
        intent,
        context,
      );
    },
  };

export function createEndurShieldStakingExecutionAdapter(
  executeStake:
    EndurShieldStakeExecutor,
): ExecutionAdapter {
  return {
    id:
      ENDUR_SHIELD_STAKING_ADAPTER_ID,

    ecosystems:
      ["starknet"],

    actions:
      ["stake"],

    supports(
      intent,
      context,
    ) {
      return supportsEndurShieldStakeIntent(
        intent,
        context,
      );
    },

    async execute(
      intent,
      context,
    ) {
      if (
        !supportsEndurShieldStakeIntent(
          intent,
          context,
        )
      ) {
        throw new Error(
          "This Endur Shield Staking adapter does not support the requested CAREL execution.",
        );
      }

      const result =
        await executeStake(
          intent,
          context,
        );

      return {
        adapterId:
          ENDUR_SHIELD_STAKING_ADAPTER_ID,

        provider:
          "Endur",

        transactionId:
          result.transactionId,

        status:
          result.status,
      };
    },
  };
}
