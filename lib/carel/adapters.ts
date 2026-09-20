import {
  createExecutionAdapterRegistry,
  type ExecutionAdapterRegistry,
} from "@/lib/carel/core/adapters";

import type {
  ExecutionAdapter,
} from "@/lib/carel/core/execution";

import {
  createStarknetExecutionAdapters,
  type StarknetExecutionDependencies,
} from "@/lib/carel/ecosystems/starknet/adapters";

import {
  createGardenBridgeExecutionAdapter,
  type GardenBridgeExecutor,
} from "@/lib/carel/protocols/garden/adapter";

export type CarelExecutionDependencies =
  Readonly<{
    starknet?:
      StarknetExecutionDependencies;

    gardenBridge?:
      GardenBridgeExecutor;
  }>;

/**
 * Creates every CAREL execution adapter whose runtime dependency is attached.
 *
 * Ecosystem-specific and cross-chain providers meet here, while Agent parsing
 * and generic execution code remain provider-neutral.
 */
export function createCarelExecutionAdapters(
  dependencies:
    CarelExecutionDependencies,
): ExecutionAdapter[] {
  const adapters:
    ExecutionAdapter[] = [];

  if (
    dependencies.starknet
  ) {
    adapters.push(
      ...createStarknetExecutionAdapters(
        dependencies.starknet,
      ),
    );
  }

  if (
    dependencies.gardenBridge
  ) {
    adapters.push(
      createGardenBridgeExecutionAdapter(
        dependencies.gardenBridge,
      ),
    );
  }

  return adapters;
}

/**
 * Builds CAREL's global adapter registry and applies core uniqueness checks.
 */
export function createCarelExecutionRegistry(
  dependencies:
    CarelExecutionDependencies,
): ExecutionAdapterRegistry {
  return createExecutionAdapterRegistry(
    createCarelExecutionAdapters(
      dependencies,
    ),
  );
}
