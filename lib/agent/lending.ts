export type ParsedLendRequest =
  Readonly<{
    amountText: string;
    symbol: string;
  }>;

export function parseLendGoal(
  goal: string,
): ParsedLendRequest {
  const match =
    goal.trim().match(
      /\b(?:lend|lending|supply)\s+((?:0|[1-9]\d*)(?:\.\d+)?)\s+([a-zA-Z][a-zA-Z0-9]*)\b/i,
    );

  if (!match) {
    throw new Error(
      "Use a Lend goal such as: Lend 10 STRK.",
    );
  }

  if (
    !match[1] ||
    Number(match[1]) <= 0
  ) {
    throw new Error(
      "Lend amount must be greater than zero.",
    );
  }

  return {
    amountText:
      match[1],
    symbol:
      match[2].toUpperCase(),
  };
}
