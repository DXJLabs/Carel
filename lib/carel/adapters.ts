import {
  createExecutionAdapterRegistry,
  createExecutionCapabilityRegistry,
  type ExecutionAdapterRegistry,
  type ExecutionCapabilityRegistry,
} from "@/lib/carel/core/adapters";

import type {
  ExecutionAdapter,
} from "@/lib/carel/core/execution";

import {
  createStarknetExecutionAdapters,
  type StarknetExecutionDependencies,
} from "@/lib/carel/ecosystems/starknet/adapters";

import {
  AVNU_SWAP_CAPABILITY,
} from "@/lib/carel/ecosystems/starknet/protocols/avnu/adapter";

import {
  AVNU_STAKING_CAPABILITY,
} from "@/lib/carel/ecosystems/starknet/protocols/avnu/staking-adapter";

import {
  ENDUR_SHIELD_STAKING_CAPABILITY,
} from "@/lib/carel/ecosystems/starknet/protocols/endur/adapter";

import {
  VESU_BORROW_CAPABILITY,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/adapter";

import {
  GARDEN_BRIDGE_CAPABILITY,
  createGardenBridgeExecutionAdapter,
  type GardenBridgeExecutor,
} from "@/lib/carel/protocols/garden/adapter";


/**
 * Provider capabilities available to CAREL planning.
 *
 * This registry does not imply that an executor is connected. It exists only
 * for intent support discovery and preview-time adapter selection.
 */
export const CAREL_EXECUTION_CAPABILITY_REGISTRY:
  ExecutionCapabilityRegistry =
    createExecutionCapabilityRegistry([
      AVNU_SWAP_CAPABILITY,
      AVNU_STAKING_CAPABILITY,
      ENDUR_SHIELD_STAKING_CAPABILITY,
      VESU_BORROW_CAPABILITY,
      GARDEN_BRIDGE_CAPABILITY,
    ]);

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
