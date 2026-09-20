import type {
  Ecosystem,
} from "./chains";

import type {
  CarelAction,
  ExecutionAdapter,
  ExecutionCapability,
} from "./execution";

export type ExecutionCapabilityRegistry =
  ReadonlyMap<
    string,
    ExecutionCapability
  >;

export type ExecutionAdapterRegistry =
  ReadonlyMap<
    string,
    ExecutionAdapter
  >;

export type AdapterFilter =
  Readonly<{
    action?: CarelAction;
    ecosystem?: Ecosystem;
  }>;

function createRegistry<
  T extends ExecutionCapability,
>(
  capabilities:
    readonly T[],
): ReadonlyMap<string, T> {
  const registry =
    new Map<string, T>();

  for (
    const capability of capabilities
  ) {
    const id =
      capability.id.trim();

    if (!id) {
      throw new Error(
        "CAREL execution capability id cannot be empty.",
      );
    }

    if (
      registry.has(id)
    ) {
      throw new Error(
        `Duplicate CAREL execution capability id: ${id}`,
      );
    }

    if (
      capability.actions.length ===
      0
    ) {
      throw new Error(
        `${id} must declare at least one CAREL action.`,
      );
    }

    if (
      new Set(
        capability.actions,
      ).size !==
      capability.actions.length
    ) {
      throw new Error(
        `${id} declares duplicate CAREL actions.`,
      );
    }

    if (
      capability.ecosystems.length ===
      0
    ) {
      throw new Error(
        `${id} must declare at least one ecosystem.`,
      );
    }

    if (
      new Set(
        capability.ecosystems,
      ).size !==
      capability.ecosystems.length
    ) {
      throw new Error(
        `${id} declares duplicate ecosystems.`,
      );
    }

    registry.set(
      id,
      capability,
    );
  }

  return registry;
}

/**
 * Creates CAREL's planning/discovery registry.
 *
 * Capabilities contain no execution dependency, so Agent preview can choose a
 * compatible adapter id without pretending a wallet executor is attached.
 */
export function createExecutionCapabilityRegistry(
  capabilities:
    readonly ExecutionCapability[],
): ExecutionCapabilityRegistry {
  return createRegistry(
    capabilities,
  );
}

/**
 * Creates CAREL's executable registry.
 *
 * Every entry here has an attached runtime executor.
 */
export function createExecutionAdapterRegistry(
  adapters:
    readonly ExecutionAdapter[],
): ExecutionAdapterRegistry {
  return createRegistry(
    adapters,
  );
}

function listCapabilities<
  T extends ExecutionCapability,
>(
  registry:
    ReadonlyMap<string, T>,
  filter:
    AdapterFilter = {},
): T[] {
  return [
    ...registry.values(),
  ].filter(
    (capability) =>
      (
        !filter.action ||
        capability.actions.includes(
          filter.action,
        )
      ) &&
      (
        !filter.ecosystem ||
        capability.ecosystems.includes(
          filter.ecosystem,
        )
      ),
  );
}

export function listExecutionCapabilities(
  registry:
    ExecutionCapabilityRegistry,
  filter:
    AdapterFilter = {},
): ExecutionCapability[] {
  return listCapabilities(
    registry,
    filter,
  );
}

export function listExecutionAdapters(
  registry:
    ExecutionAdapterRegistry,
  filter:
    AdapterFilter = {},
): ExecutionAdapter[] {
  return listCapabilities(
    registry,
    filter,
  );
}

export function getExecutionCapability(
  registry:
    ExecutionCapabilityRegistry,
  capabilityId: string,
): ExecutionCapability | null {
  return (
    registry.get(
      capabilityId,
    ) ??
    null
  );
}

export function getExecutionAdapter(
  registry:
    ExecutionAdapterRegistry,
  adapterId: string,
): ExecutionAdapter | null {
  return (
    registry.get(
      adapterId,
    ) ??
    null
  );
}
