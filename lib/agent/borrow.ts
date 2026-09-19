export type ParsedBorrowRequest =
  Readonly<{
    borrowAmountText: string;
    borrowSymbol: string;
    collateralAmountText: string;
    collateralSymbol: string;
  }>;

/**
 * Parses explicit Borrow goals without selecting a lending provider.
 *
 * Supported examples:
 * - Borrow 100 USDC against 1000 STRK
 * - Borrow 50 USDC with 500 STRK collateral
 * - Use 500 STRK to borrow 50 USDC
 */
export function parseBorrowGoal(
  goal: string,
): ParsedBorrowRequest {
  const text =
    goal.trim();

  const direct =
    text.match(
      /\bborrow\s+(\d+(?:\.\d+)?)\s+([a-z0-9]+)\s+(?:against|with)\s+(\d+(?:\.\d+)?)\s+([a-z0-9]+)(?:\s+collateral)?\b/i,
    );

  if (direct) {
    return {
      borrowAmountText:
        direct[1],
      borrowSymbol:
        direct[2].toUpperCase(),
      collateralAmountText:
        direct[3],
      collateralSymbol:
        direct[4].toUpperCase(),
    };
  }

  const reverse =
    text.match(
      /\b(?:use|with)\s+(\d+(?:\.\d+)?)\s+([a-z0-9]+)(?:\s+collateral)?\s+to\s+borrow\s+(\d+(?:\.\d+)?)\s+([a-z0-9]+)\b/i,
    );

  if (reverse) {
    return {
      collateralAmountText:
        reverse[1],
      collateralSymbol:
        reverse[2].toUpperCase(),
      borrowAmountText:
        reverse[3],
      borrowSymbol:
        reverse[4].toUpperCase(),
    };
  }

  throw new Error(
    "Use an explicit Borrow goal, for example: Borrow 100 USDC against 1000 STRK.",
  );
}
