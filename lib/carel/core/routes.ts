import type {
  ExecutionAdapter,
  ExecutionContext,
  ExecutionIntent,
} from "./execution";

/**
 * Selects the first adapter that explicitly declares support for an intent.
 * The agent therefore never needs to know whether AVNU, Garden, Endur,
 * or another provider performs the transaction.
 */
export function selectExecutionAdapter(
  intent: ExecutionIntent,
  context: ExecutionContext,
  adapters:
    readonly ExecutionAdapter[],
): ExecutionAdapter | null {
  return (
    adapters.find(
      (adapter) =>
        adapter.supports(
          intent,
          context,
        ),
    ) ?? null
  );
}
