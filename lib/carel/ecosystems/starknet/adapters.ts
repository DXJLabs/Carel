import type {
  ExecutionAdapter,
} from "@/lib/carel/core/execution";

import {
  createAvnuSwapExecutionAdapter,
  type AvnuSwapExecutor,
} from "./protocols/avnu/adapter";

import {
  createVesuBorrowExecutionAdapter,
  type VesuBorrowExecutor,
} from "./protocols/vesu/adapter";

export type StarknetExecutionDependencies =
  Readonly<{
    avnuSwap?:
      AvnuSwapExecutor;

    vesuBorrow?:
      VesuBorrowExecutor;
  }>;

/**
 * Creates the Starknet protocol adapters whose runtime dependencies are
 * currently available.
 *
 * Optional dependencies let CAREL expose only capabilities that have a real
 * executor connected instead of registering placeholder providers.
 */
export function createStarknetExecutionAdapters(
  dependencies:
    StarknetExecutionDependencies,
): ExecutionAdapter[] {
  const adapters:
    ExecutionAdapter[] = [];

  if (
    dependencies.avnuSwap
  ) {
    adapters.push(
      createAvnuSwapExecutionAdapter(
        dependencies.avnuSwap,
      ),
    );
  }

  if (
    dependencies.vesuBorrow
  ) {
    adapters.push(
      createVesuBorrowExecutionAdapter(
        dependencies.vesuBorrow,
      ),
    );
  }

  return adapters;
}
