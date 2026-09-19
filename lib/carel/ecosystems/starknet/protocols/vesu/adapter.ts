import type {
  BorrowIntent,
  ExecutionAdapter,
  ExecutionContext,
  ExecutionIntent,
  ExecutionReceipt,
} from "@/lib/carel/core/execution";

import {
  STARKNET_MAINNET_STRK,
  STARKNET_MAINNET_USDC,
} from "@/lib/carel/ecosystems/starknet/assets";

import {
  STARKNET_MAINNET,
} from "@/lib/carel/ecosystems/starknet/chains";

export const VESU_BORROW_ADAPTER_ID =
  "starknet:vesu:borrow";

export type VesuBorrowExecutorResult =
  Readonly<
    Pick<
      ExecutionReceipt,
      | "transactionId"
      | "status"
    >
  >;

export type VesuBorrowExecutor =
  (
    intent: BorrowIntent,
    context: ExecutionContext,
  ) =>
    Promise<VesuBorrowExecutorResult>;

/**
 * Checks only static/current execution compatibility.
 *
 * Live Vesu pool/risk eligibility remains in CAREL's existing server-side
 * market review and prepare flow.
 */
export function supportsVesuBorrowIntent(
  intent: ExecutionIntent,
  context: ExecutionContext,
): intent is BorrowIntent {
  if (
    intent.action !==
    "borrow"
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
    intent.collateralAssetId !==
      STARKNET_MAINNET_STRK.id ||
    intent.borrowAssetId !==
      STARKNET_MAINNET_USDC.id
  ) {
    return false;
  }

  return (
    intent.collateralAmount >
      0n &&
    intent.borrowAmount >
      0n
  );
}

/**
 * Adapts CAREL's existing guarded Vesu Borrow flow to the generic execution
 * registry without moving wallet/server security checks into the Agent.
 *
 * The injected executor remains responsible for:
 * - fresh Vesu market/risk review,
 * - server preparation,
 * - wallet-side calldata reconstruction,
 * - signing/submission.
 */
export function createVesuBorrowExecutionAdapter(
  executeBorrow:
    VesuBorrowExecutor,
): ExecutionAdapter {
  return {
    id:
      VESU_BORROW_ADAPTER_ID,

    ecosystems:
      ["starknet"],

    actions:
      ["borrow"],

    supports(
      intent,
      context,
    ) {
      return supportsVesuBorrowIntent(
        intent,
        context,
      );
    },

    async execute(
      intent,
      context,
    ) {
      if (
        !supportsVesuBorrowIntent(
          intent,
          context,
        )
      ) {
        throw new Error(
          "This Vesu adapter does not support the requested CAREL execution.",
        );
      }

      const result =
        await executeBorrow(
          intent,
          context,
        );

      return {
        adapterId:
          VESU_BORROW_ADAPTER_ID,

        provider:
          "Vesu",

        transactionId:
          result.transactionId,

        status:
          result.status,
      };
    },
  };
}
