import type {
  Ecosystem,
} from "./chains";

import type {
  ExecutionAdapter,
  ExecutionContext,
  ExecutionIntent,
} from "./execution";

/**
 * Returns whether an adapter statically declares the requested capability.
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
  if (
    !adapter.actions.includes(
      intent.action,
    )
  ) {
    return false;
  }

  if (
    ecosystem &&
    !adapter.ecosystems.includes(
      ecosystem,
    )
  ) {
    return false;
  }

  return true;
}

/**
 * Selects the first adapter that both declares the requested capability and
 * dynamically supports the intent in the current chain/account context.
 *
 * Provider names therefore stay outside the Agent intent and parsing layer.
 */
export function selectExecutionAdapter(
  intent: ExecutionIntent,
  context: ExecutionContext,
  adapters:
    readonly ExecutionAdapter[],
  ecosystem?: Ecosystem,
): ExecutionAdapter | null {
  for (
    const adapter of adapters
  ) {
    if (
      !adapterDeclaresIntent({
        adapter,
        intent,
        ecosystem,
      })
    ) {
      continue;
    }

    if (
      adapter.supports(
        intent,
        context,
      )
    ) {
      return adapter;
    }
  }

  return null;
}
