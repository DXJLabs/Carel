import type {
  ExecutionAdapter,
} from "@/lib/carel/core/execution";

import {
  createAvnuSwapExecutionAdapter,
  type AvnuSwapExecutor,
} from "./protocols/avnu/adapter";

import {
  createAvnuStakingExecutionAdapter,
  type AvnuStakeExecutor,
} from "./protocols/avnu/staking-adapter";

import {
  createEndurShieldStakingExecutionAdapter,
  type EndurShieldStakeExecutor,
} from "./protocols/endur/adapter";

import {
  createVesuBorrowExecutionAdapter,
  type VesuBorrowExecutor,
} from "./protocols/vesu/adapter";

export type StarknetExecutionDependencies =
  Readonly<{
    avnuSwap?:
      AvnuSwapExecutor;

    avnuStake?:
      AvnuStakeExecutor;

    endurShieldStake?:
      EndurShieldStakeExecutor;

    vesuBorrow?:
      VesuBorrowExecutor;
  }>;

/**
 * Creates only Starknet adapters that have a real runtime executor attached.
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
    dependencies.avnuStake
  ) {
    adapters.push(
      createAvnuStakingExecutionAdapter(
        dependencies.avnuStake,
      ),
    );
  }

  if (
    dependencies.endurShieldStake
  ) {
    adapters.push(
      createEndurShieldStakingExecutionAdapter(
        dependencies.endurShieldStake,
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
