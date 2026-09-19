const TEN = 10n;

/**
 * Validates asset precision before arithmetic is performed.
 */
export function assertDecimals(
  decimals: number,
): void {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 255
  ) {
    throw new Error(
      "Asset decimals must be an integer between 0 and 255.",
    );
  }
}

/**
 * Converts a human-readable amount into its bigint base-unit value.
 * This helper is ecosystem agnostic and works for STRK, USDC, BTC, SOL, etc.
 */
export function parseUnits(
  value: string,
  decimals: number,
): bigint {
  assertDecimals(decimals);

  const normalized =
    value.trim();

  if (
    !/^\d+(?:\.\d*)?$/.test(
      normalized,
    )
  ) {
    throw new Error(
      `Enter a valid amount with up to ${decimals} decimals.`,
    );
  }

  const [
    whole = "0",
    fraction = "",
  ] = normalized.split(".");

  if (
    fraction.length > decimals
  ) {
    throw new Error(
      `Enter a valid amount with up to ${decimals} decimals.`,
    );
  }

  const scale =
    TEN ** BigInt(decimals);

  const padded =
    fraction.padEnd(
      decimals,
      "0",
    );

  return (
    BigInt(whole || "0") *
      scale +
    BigInt(padded || "0")
  );
}

/**
 * Converts bigint base units into a display string without floating-point math.
 */
export function formatUnits(
  value: bigint,
  decimals: number,
  maxDecimals = decimals,
): string {
  assertDecimals(decimals);

  if (
    !Number.isInteger(maxDecimals) ||
    maxDecimals < 0
  ) {
    throw new Error(
      "maxDecimals must be a non-negative integer.",
    );
  }

  const negative =
    value < 0n;

  const absolute =
    negative
      ? -value
      : value;

  const scale =
    TEN ** BigInt(decimals);

  const whole =
    absolute / scale;

  if (
    decimals === 0 ||
    maxDecimals === 0
  ) {
    return `${negative ? "-" : ""}${whole}`;
  }

  const rawFraction =
    (absolute % scale)
      .toString()
      .padStart(
        decimals,
        "0",
      );

  const fraction =
    rawFraction
      .slice(
        0,
        Math.min(
          decimals,
          maxDecimals,
        ),
      )
      .replace(
        /0+$/,
        "",
      );

  return (
    `${negative ? "-" : ""}` +
    `${whole}` +
    `${fraction ? `.${fraction}` : ""}`
  );
}

/**
 * Converts an amount between decimal precisions without using Number.
 * Downscaling intentionally truncates excess base units.
 */
export function rescaleUnits(
  value: bigint,
  fromDecimals: number,
  toDecimals: number,
): bigint {
  assertDecimals(fromDecimals);
  assertDecimals(toDecimals);

  if (
    fromDecimals ===
    toDecimals
  ) {
    return value;
  }

  const difference =
    Math.abs(
      toDecimals -
        fromDecimals,
    );

  const factor =
    TEN ** BigInt(difference);

  return toDecimals >
    fromDecimals
    ? value * factor
    : value / factor;
}
