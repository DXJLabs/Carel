export type ParsedBridgeRequest =
  Readonly<{
    amountText: string;
    symbol: string;
    destination: string;
  }>;

/**
 * Parses the user's bridge goal without selecting a bridge provider.
 *
 * Provider adapters decide later whether they support the parsed asset,
 * destination, network, limits, and execution path.
 */
export function parseBridgeGoal(
  goal: string,
): ParsedBridgeRequest {
  const match =
    goal
      .trim()
      .match(
        /^bridge\s+([0-9]+(?:\.[0-9]+)?)\s+([a-z0-9]+)\s+to\s+(.+?)\.?$/i,
      );

  if (!match) {
    throw new Error(
      "Use an explicit Bridge goal, for example: Bridge 0.0005 BTC to Starknet Sepolia.",
    );
  }

  const amountText =
    match[1];

  const [
    whole,
    fraction = "",
  ] =
    amountText.split(".");

  if (
    BigInt(whole) === 0n &&
    !/[1-9]/.test(
      fraction,
    )
  ) {
    throw new Error(
      "Bridge amount must be greater than zero.",
    );
  }

  return {
    amountText,

    symbol:
      match[2],

    destination:
      match[3].trim(),
  };
}
