export type ValidationIssue =
  Readonly<{
    code: string;
    message: string;
    field?: string;
  }>;

export type ValidationResult =
  | Readonly<{
      ok: true;
      issues: readonly [];
    }>
  | Readonly<{
      ok: false;
      issues: readonly ValidationIssue[];
    }>;

/**
 * Creates a successful validation result.
 */
export function valid():
  ValidationResult {
  return {
    ok: true,
    issues: [],
  };
}

/**
 * Creates a failed validation result without coupling validation to UI state.
 */
export function invalid(
  code: string,
  message: string,
  field?: string,
): ValidationResult {
  return {
    ok: false,
    issues: [
      {
        code,
        message,
        ...(field
          ? { field }
          : {}),
      },
    ],
  };
}

/**
 * Combines independent validators so protocol/UI code can evaluate one result.
 */
export function combineValidation(
  ...results: readonly ValidationResult[]
): ValidationResult {
  const issues =
    results.flatMap(
      (result) =>
        result.ok
          ? []
          : result.issues,
    );

  return issues.length
    ? {
        ok: false,
        issues,
      }
    : valid();
}

/**
 * Validates that a transaction amount can actually produce an execution.
 */
export function validatePositiveAmount(
  amount: bigint,
  field = "amount",
): ValidationResult {
  return amount > 0n
    ? valid()
    : invalid(
        "AMOUNT_NOT_POSITIVE",
        "Amount must be greater than zero.",
        field,
      );
}

/**
 * Prevents meaningless same-asset swap intents before reaching a protocol.
 */
export function validateDistinctAssets(
  fromAssetId: string,
  toAssetId: string,
): ValidationResult {
  return fromAssetId !==
    toAssetId
    ? valid()
    : invalid(
        "SAME_ASSET",
        "Source and destination assets must be different.",
      );
}
