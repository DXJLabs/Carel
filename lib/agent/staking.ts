export type ParsedStakeRequest =
  Readonly<{
    amountText: string;
    assetSymbol: string;
    targetSymbol?: string;
  }>;

/**
 * Parses a staking goal without choosing AVNU, Endur, or another provider.
 */
export function parseStakeGoal(
  goal: string,
): ParsedStakeRequest {
  const match =
    goal
      .trim()
      .match(
        /\b(?:stake|staking|earn|earning)\s+(\d+(?:\.\d+)?)\s+([a-z0-9]+)(?:\s+(?:to|for)\s+([a-z0-9]+))?\b/i,
      );

  if (!match) {
    throw new Error(
      "Use an explicit Staking goal, for example: Stake 1 STRK.",
    );
  }

  return {
    amountText:
      match[1],

    assetSymbol:
      match[2],

    ...(match[3]
      ? {
          targetSymbol:
            match[3],
        }
      : {}),
  };
}
