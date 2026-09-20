export type ParsedSwapRequest =
  Readonly<{
    amountText: string;
    fromSymbol: string;
    toSymbol: string;
  }>;

/**
 * Parses an explicit Swap goal without selecting a chain provider.
 */
export function parseSwapGoal(
  goal: string,
): ParsedSwapRequest {
  const match =
    goal
      .trim()
      .match(
        /\b(?:swap|exchange)\s+(\d+(?:\.\d+)?)\s+([a-z0-9]+)\s+(?:for|to)\s+([a-z0-9]+)\b/i,
      );

  if (!match) {
    throw new Error(
      "Use an explicit Swap goal, for example: Swap 1 STRK for USDC.",
    );
  }

  return {
    amountText:
      match[1],

    fromSymbol:
      match[2].toUpperCase(),

    toSymbol:
      match[3].toUpperCase(),
  };
}
