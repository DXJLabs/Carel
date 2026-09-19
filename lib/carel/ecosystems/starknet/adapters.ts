import type {
  ExecutionAdapter,
} from "@/lib/carel/core/execution";

import {
  createVesuBorrowExecutionAdapter,
  type VesuBorrowExecutor,
} from "./protocols/vesu/adapter";

export type StarknetExecutionDependencies =
  Readonly<{
    vesuBorrow:
      VesuBorrowExecutor;
  }>;

/**
 * Creates the Starknet execution adapters currently connected to CAREL.
 *
 * Future AVNU, Endur, STRK20, and other Starknet protocol adapters register
 * here without changing Agent intent parsing.
 */
export function createStarknetExecutionAdapters(
  dependencies:
    StarknetExecutionDependencies,
): ExecutionAdapter[] {
  return [
    createVesuBorrowExecutionAdapter(
      dependencies.vesuBorrow,
    ),
  ];
}
