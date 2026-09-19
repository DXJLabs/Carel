/**
 * Normalizes a generic hexadecimal identifier for stable comparisons.
 * Ecosystem-specific validity rules remain inside ecosystem adapters.
 */
export function normalizeHexAddress(
  value: string,
): string {
  const normalized =
    value.trim();

  if (
    !/^0x[0-9a-f]+$/i.test(
      normalized,
    )
  ) {
    throw new Error(
      "Expected a hexadecimal address.",
    );
  }

  return (
    `0x${BigInt(normalized)
      .toString(16)}`
  );
}

/**
 * Compares two hexadecimal identifiers without being affected by casing
 * or leading zeroes.
 */
export function sameHexAddress(
  left: string,
  right: string,
): boolean {
  try {
    return (
      normalizeHexAddress(left) ===
      normalizeHexAddress(right)
    );
  } catch {
    return false;
  }
}
