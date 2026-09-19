import type {
  Ecosystem,
} from "./chains";

import type {
  CarelAction,
  ExecutionAdapter,
} from "./execution";

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

/**
 * Creates CAREL's protocol adapter registry.
 *
 * Adapter ids must be globally unique because execution receipts and
 * persisted activity can use the id to identify the selected executor.
 */
export function createExecutionAdapterRegistry(
  adapters:
    readonly ExecutionAdapter[],
): ExecutionAdapterRegistry {
  const registry =
    new Map<
      string,
      ExecutionAdapter
    >();

  for (
    const adapter of adapters
  ) {
    const id =
      adapter.id.trim();

    if (!id) {
      throw new Error(
        "CAREL execution adapter id cannot be empty.",
      );
    }

    if (
      registry.has(id)
    ) {
      throw new Error(
        `Duplicate CAREL execution adapter id: ${id}`,
      );
    }

    if (
      adapter.actions.length ===
      0
    ) {
      throw new Error(
        `${id} must declare at least one CAREL action.`,
      );
    }

    if (
      new Set(
        adapter.actions,
      ).size !==
      adapter.actions.length
    ) {
      throw new Error(
        `${id} declares duplicate CAREL actions.`,
      );
    }

    if (
      adapter.ecosystems.length ===
      0
    ) {
      throw new Error(
        `${id} must declare at least one ecosystem.`,
      );
    }

    if (
      new Set(
        adapter.ecosystems,
      ).size !==
      adapter.ecosystems.length
    ) {
      throw new Error(
        `${id} declares duplicate ecosystems.`,
      );
    }

    registry.set(
      id,
      adapter,
    );
  }

  return registry;
}

/**
 * Returns registered adapters matching static action/ecosystem capabilities.
 *
 * This does not call supports(); dynamic chain/account/provider checks remain
 * the adapter's responsibility.
 */
export function listExecutionAdapters(
  registry:
    ExecutionAdapterRegistry,
  filter:
    AdapterFilter = {},
): ExecutionAdapter[] {
  return [
    ...registry.values(),
  ].filter(
    (adapter) =>
      (
        !filter.action ||
        adapter.actions.includes(
          filter.action,
        )
      ) &&
      (
        !filter.ecosystem ||
        adapter.ecosystems.includes(
          filter.ecosystem,
        )
      ),
  );
}

/**
 * Resolves one adapter by its stable CAREL id.
 */
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
