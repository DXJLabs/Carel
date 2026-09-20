import type {
  Ecosystem,
} from "./chains";

import type {
  ExecutionAdapter,
  ExecutionCapability,
  ExecutionContext,
  ExecutionIntent,
} from "./execution";

/**
 * Returns whether a capability statically declares the requested action and
 * ecosystem before its dynamic supports() check is called.
 */
export function capabilityDeclaresIntent({
  capability,
  intent,
  ecosystem,
}: {
  capability: ExecutionCapability;
  intent: ExecutionIntent;
  ecosystem?: Ecosystem;
}): boolean {
  if (
    !capability.actions.includes(
      intent.action,
    )
  ) {
    return false;
  }

  if (
    ecosystem &&
    !capability.ecosystems.includes(
      ecosystem,
    )
  ) {
    return false;
  }

  return true;
}

/**
 * Compatibility alias retained for executable adapter callers.
 */
export function adapterDeclaresIntent({
  adapter,
  intent,
  ecosystem,
}: {
  adapter: ExecutionAdapter;
  intent: ExecutionIntent;
  ecosystem?: Ecosystem;
}): boolean {
  return capabilityDeclaresIntent({
    capability:
      adapter,
    intent,
    ecosystem,
  });
}

/**
 * Selects a provider capability without requiring an execution dependency.
 */
export function selectExecutionCapability<
  T extends ExecutionCapability,
>(
  intent: ExecutionIntent,
  context: ExecutionContext,
  capabilities:
    readonly T[],
  ecosystem?: Ecosystem,
): T | null {
  for (
    const capability
    of capabilities
  ) {
    if (
      !capabilityDeclaresIntent({
        capability,
        intent,
        ecosystem,
      })
    ) {
      continue;
    }

    if (
      capability.supports(
        intent,
        context,
      )
    ) {
      return capability;
    }
  }

  return null;
}

/**
 * Selects an executable adapter using the same capability selection rules.
 */
export function selectExecutionAdapter(
  intent: ExecutionIntent,
  context: ExecutionContext,
  adapters:
    readonly ExecutionAdapter[],
  ecosystem?: Ecosystem,
): ExecutionAdapter | null {
  return selectExecutionCapability(
    intent,
    context,
    adapters,
    ecosystem,
  );
}
